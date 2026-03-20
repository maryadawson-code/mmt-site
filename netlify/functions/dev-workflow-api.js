// ============================================================
// dev-workflow-api.js — Multi-developer workflow coordination
//
// Session locking, deploy queue, file locks, conflict detection,
// protected file rules. Surfaces in command center dashboard.
//
// Auth: Bearer token or ?key= via COMMAND_CENTER_KEY
// ============================================================

const { createClient } = require("@supabase/supabase-js");

const HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Content-Type": "application/json",
};

function ok(data) { return { statusCode: 200, headers: HEADERS, body: JSON.stringify(data) }; }
function fail(status, msg) { return { statusCode: status, headers: HEADERS, body: JSON.stringify({ error: msg }) }; }

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function authenticate(event) {
  const authHeader = event.headers.authorization || event.headers.Authorization || "";
  const bearerToken = authHeader.replace(/^Bearer\s+/i, "");
  const queryKey = (event.queryStringParameters || {}).key;
  const token = bearerToken || queryKey;
  const expected = process.env.COMMAND_CENTER_KEY;
  if (!expected || !token || token !== expected) return false;
  return true;
}

// Check if a file matches any protected file pattern
async function getProtectedFileMatches(supabase, repo, files) {
  const { data: rules } = await supabase.from("protected_files").select("*").eq("repo", repo);
  if (!rules || !rules.length || !files || !files.length) return [];
  const matches = [];
  for (const file of files) {
    for (const rule of rules) {
      const pattern = rule.file_pattern;
      // Simple glob: exact match or wildcard suffix
      if (pattern === file || (pattern.includes("*") && matchGlob(pattern, file))) {
        matches.push({ file, rule });
      }
    }
  }
  return matches;
}

function matchGlob(pattern, str) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp("^" + escaped + "$").test(str);
}

// Auto-abandon stale sessions (no heartbeat in 30 min)
async function cleanupStaleSessions(supabase) {
  const thirtyMinAgo = new Date(Date.now() - 30 * 60000).toISOString();

  // Get stale sessions before updating
  const { data: stale } = await supabase.from("dev_sessions")
    .select("id")
    .eq("status", "active")
    .lt("last_heartbeat_at", thirtyMinAgo);

  if (stale && stale.length > 0) {
    const staleIds = stale.map(s => s.id);

    await supabase.from("dev_sessions")
      .update({ status: "abandoned", completed_at: new Date().toISOString() })
      .in("id", staleIds);

    // Release file locks from abandoned sessions
    for (const s of stale) {
      await supabase.from("file_locks")
        .update({ released_at: new Date().toISOString() })
        .eq("session_id", s.id)
        .is("released_at", null);
    }
  }

  return (stale || []).length;
}

// Detect file conflicts between sessions
async function detectConflicts(supabase, session) {
  const conflicts = [];

  const { data: others } = await supabase.from("dev_sessions")
    .select("*")
    .eq("repo", session.repo)
    .eq("status", "active")
    .neq("id", session.id);

  for (const other of (others || [])) {
    const myFiles = new Set(session.files_touched || []);
    const theirFiles = new Set(other.files_touched || []);
    const overlap = [...myFiles].filter(f => theirFiles.has(f));

    if (overlap.length > 0) {
      for (const file of overlap) {
        // Check if already logged
        const { data: existing } = await supabase.from("conflict_log")
          .select("id")
          .or(`and(session_a.eq.${session.id},session_b.eq.${other.id}),and(session_a.eq.${other.id},session_b.eq.${session.id})`)
          .eq("file_path", file)
          .eq("resolved", false)
          .limit(1);

        if (!existing || existing.length === 0) {
          const protectedMatches = await getProtectedFileMatches(supabase, session.repo, [file]);
          const severity = protectedMatches.length > 0 ? "critical" : "warning";

          await supabase.from("conflict_log").insert({
            repo: session.repo, file_path: file,
            session_a: session.id, user_a: session.user_name,
            session_b: other.id, user_b: other.user_name,
            conflict_type: "concurrent_edit",
            severity
          });

          conflicts.push({ file, otherUser: other.user_name, otherBranch: other.branch, severity });
        }
      }
    }

    // Directory overlap (broader check)
    const myDirs = new Set(session.directories_touched || []);
    const theirDirs = new Set(other.directories_touched || []);
    const dirOverlap = [...myDirs].filter(d => theirDirs.has(d));

    if (dirOverlap.length > 0 && overlap.length === 0) {
      conflicts.push({
        directories: dirOverlap, otherUser: other.user_name,
        otherBranch: other.branch, severity: "info",
        message: `${other.user_name} is also working in ${dirOverlap.join(", ")}`
      });
    }
  }

  return conflicts;
}

// Notify about conflicts via ops_events
async function notifyConflict(supabase, conflict) {
  try {
    await supabase.from("ops_events").insert({
      source: "dev-workflow",
      signal: "file_conflict",
      detail: conflict,
      severity: conflict.severity === "critical" ? "critical" : "warn"
    });
  } catch (e) { console.error("[dev-workflow] notify error:", e.message); }

  // Email for critical conflicts (via Resend API fetch, no SDK)
  if (conflict.severity === "critical" && process.env.RESEND_API_KEY) {
    try {
      const { data: users } = await supabase.from("dashboard_users")
        .select("email, name")
        .in("name", [conflict.user_a, conflict.user_b]);

      for (const user of (users || [])) {
        if (!user.email) continue;
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${process.env.RESEND_API_KEY}` },
          body: JSON.stringify({
            from: "MMT Ops <ops@missionmeetstech.com>",
            to: [user.email],
            subject: `File Conflict: ${conflict.file_path}`,
            html: `<p><strong>${conflict.user_a}</strong> and <strong>${conflict.user_b}</strong> are both editing <code>${conflict.file_path}</code>.</p><p>Coordinate before merging to avoid conflicts.</p><p><a href="https://missionmeetstech.com/command-center.html#dev-workflow">View in Command Center</a></p>`
          })
        });
      }
    } catch (e) { console.error("[dev-workflow] email error:", e.message); }
  }
}

async function notifyDeployStatus(supabase, deploy, status) {
  try {
    await supabase.from("ops_events").insert({
      source: "dev-workflow",
      signal: status === "success" ? "deploy_success" : "deploy_failed",
      detail: { deployId: deploy.id, branch: deploy.branch, by: deploy.requested_by, status },
      severity: status === "failed" ? "critical" : "info"
    });
  } catch (e) { console.error("[dev-workflow] deploy notify error:", e.message); }
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: HEADERS, body: "" };
  if (!authenticate(event)) return fail(401, "Unauthorized");

  const supabase = getSupabase();
  if (!supabase) return fail(500, "Not configured");

  // Cleanup stale sessions on every request
  await cleanupStaleSessions(supabase);

  // ═══════════════════════════════════════
  // GET views
  // ═══════════════════════════════════════
  if (event.httpMethod === "GET") {
    const params = event.queryStringParameters || {};
    const view = params.view || "status";

    // ── STATUS: Who's working right now ──
    if (view === "status") {
      const [sessRes, deployRes, locksRes, conflictsRes] = await Promise.all([
        supabase.from("dev_sessions").select("*").in("status", ["active", "paused", "deploying"]).order("started_at", { ascending: false }),
        supabase.from("deploy_queue").select("*").in("status", ["queued", "pre-check", "deploying", "post-check"]).order("created_at"),
        supabase.from("file_locks").select("*").is("released_at", null),
        supabase.from("conflict_log").select("*").eq("resolved", false).order("created_at", { ascending: false }).limit(20),
      ]);

      return ok({
        sessions: sessRes.data || [],
        deployQueue: deployRes.data || [],
        fileLocks: locksRes.data || [],
        conflicts: conflictsRes.data || [],
      });
    }

    // ── CAN-I-WORK: Pre-flight check ──
    if (view === "can-i-work") {
      const { repo, user, files, branch } = params;
      if (!repo || !user) return fail(400, "repo and user required");

      const fileList = files ? files.split(",").map(f => f.trim()).filter(Boolean) : [];
      const warnings = [];
      const blockers = [];

      // Check active sessions
      const { data: active } = await supabase.from("dev_sessions")
        .select("*").eq("repo", repo).in("status", ["active", "deploying"]);

      for (const s of (active || [])) {
        if (s.user_name === user) continue;
        if (s.lock_level === "lock") {
          blockers.push({ type: "session_lock", user: s.user_name, branch: s.branch, reason: s.lock_reason || "Exclusive lock", message: `${s.user_name} has an exclusive lock on ${repo}` });
        } else if (s.status === "deploying") {
          warnings.push({ type: "deploy_active", user: s.user_name, message: `${s.user_name} is deploying to ${repo}` });
        }
        // Check file overlap
        if (fileList.length > 0) {
          const theirFiles = new Set(s.files_touched || []);
          const overlap = fileList.filter(f => theirFiles.has(f));
          if (overlap.length > 0) {
            warnings.push({ type: "file_overlap", user: s.user_name, branch: s.branch, files: overlap, message: `${s.user_name} is also editing: ${overlap.join(", ")}` });
          }
        }
      }

      // Check file locks
      if (fileList.length > 0) {
        const { data: locks } = await supabase.from("file_locks")
          .select("*").eq("repo", repo).in("file_path", fileList).is("released_at", null);
        for (const lock of (locks || [])) {
          if (lock.locked_by === user) continue;
          if (lock.lock_type === "exclusive") {
            blockers.push({ type: "file_lock", file: lock.file_path, user: lock.locked_by, reason: lock.reason, message: `${lock.file_path} is exclusively locked by ${lock.locked_by}` });
          } else {
            warnings.push({ type: "file_lock_advisory", file: lock.file_path, user: lock.locked_by, reason: lock.reason, message: `${lock.file_path} has an advisory lock by ${lock.locked_by}` });
          }
        }
      }

      // Check protected files
      const protectedMatches = await getProtectedFileMatches(supabase, repo, fileList);

      // Check active deploy
      const { data: deploys } = await supabase.from("deploy_queue")
        .select("*").eq("repo", repo).in("status", ["deploying", "post-check"]).limit(1);
      if (deploys && deploys.length > 0) {
        warnings.push({ type: "deploy_active", user: deploys[0].requested_by, message: `Deploy in progress for ${repo} by ${deploys[0].requested_by}` });
      }

      return ok({
        allowed: blockers.length === 0,
        warnings,
        blockers,
        activeSessions: active || [],
        fileLocks: (await supabase.from("file_locks").select("*").eq("repo", repo).is("released_at", null)).data || [],
        protectedFiles: protectedMatches.map(m => ({ file: m.file, level: m.rule.protection_level, reason: m.rule.reason })),
      });
    }

    // ── DEPLOY-QUEUE ──
    if (view === "deploy-queue") {
      const { data: queue } = await supabase.from("deploy_queue")
        .select("*").order("created_at", { ascending: false }).limit(20);
      return ok({ queue: queue || [] });
    }

    // ── CONFLICTS ──
    if (view === "conflicts") {
      const { data } = await supabase.from("conflict_log")
        .select("*").eq("resolved", false).order("created_at", { ascending: false }).limit(50);
      return ok({ conflicts: data || [] });
    }

    // ── PROTECTED-FILES ──
    if (view === "protected-files") {
      const { data } = await supabase.from("protected_files").select("*").order("repo").order("file_pattern");
      return ok({ protectedFiles: data || [] });
    }

    // ── SUMMARY (for dashboard tile) ──
    if (view === "summary") {
      const [sessRes, deployRes, conflictRes] = await Promise.all([
        supabase.from("dev_sessions").select("id, user_name, user_type, status", { count: "exact" }).in("status", ["active", "paused", "deploying"]),
        supabase.from("deploy_queue").select("id, status", { count: "exact" }).in("status", ["queued", "pre-check", "deploying", "post-check"]),
        supabase.from("conflict_log").select("id", { count: "exact" }).eq("resolved", false),
      ]);
      return ok({
        activeSessions: sessRes.count || 0,
        activeSessionsList: sessRes.data || [],
        deployQueueSize: deployRes.count || 0,
        deployingNow: (deployRes.data || []).some(d => d.status === "deploying"),
        unresolvedConflicts: conflictRes.count || 0,
      });
    }

    return fail(400, "Unknown view: " + view);
  }

  // ═══════════════════════════════════════
  // POST actions
  // ═══════════════════════════════════════
  if (event.httpMethod === "POST") {
    let body;
    try { body = JSON.parse(event.body); } catch { return fail(400, "Invalid JSON"); }
    const { action } = body;

    // ── START SESSION ──
    if (action === "start_session") {
      const { user, userType, email, repo, branch, description, files, directories, lockLevel, lockReason } = body;
      if (!user || !repo) return fail(400, "user and repo required");

      const fileList = files || [];
      const dirList = directories || [];

      const { data: session, error: insertErr } = await supabase.from("dev_sessions")
        .insert({
          user_name: user,
          user_type: userType || "human",
          user_email: email || null,
          repo,
          branch: branch || null,
          description: description || null,
          files_touched: fileList,
          directories_touched: dirList,
          lock_level: lockLevel || "warn",
          lock_reason: lockReason || null,
        })
        .select("*")
        .single();

      if (insertErr) return fail(500, insertErr.message);

      // Detect conflicts
      const conflicts = await detectConflicts(supabase, session);
      for (const c of conflicts) {
        if (c.severity === "critical" || c.severity === "warning") {
          await notifyConflict(supabase, { ...c, user_a: user, user_b: c.otherUser, file_path: c.file, repo });
        }
      }

      // Check protected files
      const protectedMatches = await getProtectedFileMatches(supabase, repo, fileList);

      return ok({
        session,
        conflicts,
        protectedFiles: protectedMatches.map(m => ({ file: m.file, level: m.rule.protection_level, reason: m.rule.reason })),
        warnings: conflicts.filter(c => c.severity !== "info"),
      });
    }

    // ── HEARTBEAT SESSION ──
    if (action === "heartbeat_session") {
      const { sessionId, files, directories } = body;
      if (!sessionId) return fail(400, "sessionId required");

      const updates = { last_heartbeat_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      if (files) updates.files_touched = files;
      if (directories) updates.directories_touched = directories;

      const { error: updateErr } = await supabase.from("dev_sessions")
        .update(updates).eq("id", sessionId);
      if (updateErr) return fail(500, updateErr.message);

      // Re-fetch session for conflict detection
      const { data: session } = await supabase.from("dev_sessions")
        .select("*").eq("id", sessionId).single();
      if (!session) return fail(404, "Session not found");

      const conflicts = await detectConflicts(supabase, session);
      for (const c of conflicts) {
        if (c.severity === "critical" || c.severity === "warning") {
          await notifyConflict(supabase, { ...c, user_a: session.user_name, user_b: c.otherUser, file_path: c.file, repo: session.repo });
        }
      }

      return ok({ heartbeat: true, conflicts });
    }

    // ── END SESSION ──
    if (action === "end_session") {
      const { sessionId, status } = body;
      if (!sessionId) return fail(400, "sessionId required");

      await supabase.from("dev_sessions")
        .update({ status: status || "completed", completed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", sessionId);

      // Release file locks
      await supabase.from("file_locks")
        .update({ released_at: new Date().toISOString() })
        .eq("session_id", sessionId)
        .is("released_at", null);

      return ok({ ended: true });
    }

    // ── REQUEST DEPLOY ──
    if (action === "request_deploy") {
      const { user, repo, branch, commitSha, commitMessage, deployType, sessionId } = body;
      if (!user || !repo || !branch) return fail(400, "user, repo, and branch required");

      // Pre-checks
      const blockers = [];

      // Check for active deploy
      const { data: activeDeploys } = await supabase.from("deploy_queue")
        .select("*").eq("repo", repo).in("status", ["deploying", "post-check"]);
      if (activeDeploys && activeDeploys.length > 0) {
        blockers.push({ type: "deploy_active", message: `Deploy already in progress by ${activeDeploys[0].requested_by}` });
      }

      // Check for sessions in deploying state
      const { data: deployingSessions } = await supabase.from("dev_sessions")
        .select("*").eq("repo", repo).eq("status", "deploying");
      if (deployingSessions && deployingSessions.length > 0) {
        blockers.push({ type: "session_deploying", message: `${deployingSessions[0].user_name} is in deploying state` });
      }

      if (blockers.length > 0) {
        return ok({ queued: false, blockers });
      }

      // Get queue position
      const { count: queuedCount } = await supabase.from("deploy_queue")
        .select("*", { count: "exact", head: true })
        .in("status", ["queued", "pre-check"]);

      const { data: deploy, error: insertErr } = await supabase.from("deploy_queue")
        .insert({
          requested_by: user,
          requested_by_type: body.userType || "human",
          session_id: sessionId || null,
          repo,
          branch,
          commit_sha: commitSha || null,
          commit_message: commitMessage || null,
          deploy_type: deployType || "production",
          position: (queuedCount || 0) + 1,
          pre_checks: { conflictCheck: "pass" },
          pre_check_passed: true,
        })
        .select("*")
        .single();

      if (insertErr) return fail(500, insertErr.message);

      // Update session status if provided
      if (sessionId) {
        await supabase.from("dev_sessions")
          .update({ status: "deploying", deploy_id: deploy.id, deploy_status: "queued", updated_at: new Date().toISOString() })
          .eq("id", sessionId);
      }

      return ok({ queued: true, deploy, position: deploy.position });
    }

    // ── COMPLETE DEPLOY ──
    if (action === "complete_deploy") {
      const { deployId, homepageStatus, homepageSize, postChecks, netlifyDeployId } = body;
      if (!deployId) return fail(400, "deployId required");

      const postCheckPassed = homepageStatus === 200 && (homepageSize || 0) >= 10000;
      const status = postCheckPassed ? "success" : "failed";

      await supabase.from("deploy_queue")
        .update({
          status,
          completed_at: new Date().toISOString(),
          homepage_status: homepageStatus || null,
          homepage_size: homepageSize || null,
          post_checks: postChecks || {},
          post_check_passed: postCheckPassed,
          netlify_deploy_id: netlifyDeployId || null,
        })
        .eq("id", deployId);

      // Get deploy for notification
      const { data: deploy } = await supabase.from("deploy_queue")
        .select("*").eq("id", deployId).single();
      if (deploy) {
        await notifyDeployStatus(supabase, deploy, status);

        // Update session if linked
        if (deploy.session_id) {
          await supabase.from("dev_sessions")
            .update({ deploy_status: status, status: "active", updated_at: new Date().toISOString() })
            .eq("id", deploy.session_id);
        }
      }

      return ok({ completed: true, status, postCheckPassed, autoRollback: !postCheckPassed });
    }

    // ── ROLLBACK DEPLOY ──
    if (action === "rollback_deploy") {
      const { deployId, reason } = body;
      if (!deployId) return fail(400, "deployId required");

      await supabase.from("deploy_queue")
        .update({ rolled_back: true, rollback_reason: reason || null, rollback_at: new Date().toISOString(), status: "rolled-back" })
        .eq("id", deployId);

      const { data: deploy } = await supabase.from("deploy_queue")
        .select("*").eq("id", deployId).single();
      if (deploy) await notifyDeployStatus(supabase, deploy, "rolled-back");

      return ok({ rolledBack: true });
    }

    // ── LOCK FILE ──
    if (action === "lock_file") {
      const { repo, filePath, user, lockType, reason, sessionId } = body;
      if (!repo || !filePath || !user) return fail(400, "repo, filePath, and user required");

      const { data, error: insertErr } = await supabase.from("file_locks")
        .upsert({
          repo, file_path: filePath, locked_by: user,
          lock_type: lockType || "advisory", reason: reason || null,
          session_id: sessionId || null,
        }, { onConflict: "repo,file_path,locked_by" })
        .select("*")
        .single();

      if (insertErr) return fail(500, insertErr.message);
      return ok({ lock: data });
    }

    // ── UNLOCK FILE ──
    if (action === "unlock_file") {
      const { repo, filePath, user } = body;
      if (!repo || !filePath || !user) return fail(400, "repo, filePath, and user required");

      await supabase.from("file_locks")
        .update({ released_at: new Date().toISOString() })
        .eq("repo", repo).eq("file_path", filePath).eq("locked_by", user)
        .is("released_at", null);

      return ok({ unlocked: true });
    }

    // ── ADD PROTECTED FILE ──
    if (action === "add_protected_file") {
      const { repo, filePattern, protectionLevel, reason, createdBy } = body;
      if (!repo || !filePattern) return fail(400, "repo and filePattern required");

      const { data, error: insertErr } = await supabase.from("protected_files")
        .upsert({
          repo, file_pattern: filePattern,
          protection_level: protectionLevel || "review",
          reason: reason || null,
          created_by: createdBy || "manual",
        }, { onConflict: "repo,file_pattern" })
        .select("*")
        .single();

      if (insertErr) return fail(500, insertErr.message);
      return ok({ protectedFile: data });
    }

    // ── REMOVE PROTECTED FILE ──
    if (action === "remove_protected_file") {
      const { id } = body;
      if (!id) return fail(400, "id required");
      await supabase.from("protected_files").delete().eq("id", id);
      return ok({ removed: true });
    }

    // ── RESOLVE CONFLICT ──
    if (action === "resolve_conflict") {
      const { conflictId, resolvedBy, resolution } = body;
      if (!conflictId) return fail(400, "conflictId required");

      await supabase.from("conflict_log")
        .update({ resolved: true, resolved_by: resolvedBy || "unknown", resolved_at: new Date().toISOString(), resolution: resolution || null })
        .eq("id", conflictId);

      return ok({ resolved: true });
    }

    return fail(404, "Unknown action: " + action);
  }

  return fail(405, "Method not allowed");
};
