// sentry-sync.js — Pull unresolved Sentry errors and auto-create issues
// Schedule: */30 * * * * (every 30 min)

const { createClient } = require("@supabase/supabase-js");

exports.handler = async () => {
  const SENTRY_AUTH_TOKEN = process.env.SENTRY_AUTH_TOKEN;
  const SENTRY_ORG = process.env.SENTRY_ORG || "mission-meets-tech";
  const SENTRY_PROJECT = process.env.SENTRY_PROJECT || "mmt-site";

  if (!SENTRY_AUTH_TOKEN) {
    console.log("[sentry-sync] No SENTRY_AUTH_TOKEN — skipping");
    return { statusCode: 200, body: "No token" };
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  // Fetch unresolved issues from Sentry
  let sentryIssues = [];
  try {
    const res = await fetch(`https://sentry.io/api/0/projects/${SENTRY_ORG}/${SENTRY_PROJECT}/issues/?query=is:unresolved&statsPeriod=24h`, {
      headers: { Authorization: `Bearer ${SENTRY_AUTH_TOKEN}` },
    });
    if (!res.ok) {
      console.error("[sentry-sync] Sentry API error:", res.status);
      return { statusCode: 200, body: "API error" };
    }
    sentryIssues = await res.json();
  } catch (err) {
    console.error("[sentry-sync] Fetch error:", err.message);
    return { statusCode: 200, body: "Fetch error" };
  }

  let upserted = 0;
  let issuesCreated = 0;

  for (const si of sentryIssues) {
    // Upsert into sentry_errors
    const { data: existing } = await supabase.from("sentry_errors").select("id, linked_issue_id").eq("sentry_id", si.id).single();

    const errorData = {
      sentry_id: si.id,
      title: si.title,
      culprit: si.culprit,
      level: si.level,
      first_seen: si.firstSeen,
      last_seen: si.lastSeen,
      event_count: si.count || 1,
      metadata: si.metadata || {},
    };

    if (existing) {
      await supabase.from("sentry_errors").update({ ...errorData, last_seen: si.lastSeen, event_count: si.count || 1 }).eq("id", existing.id);
    } else {
      await supabase.from("sentry_errors").insert(errorData);
    }
    upserted++;

    // Auto-create issue if not linked
    if (!existing?.linked_issue_id) {
      const { data: existingIssue } = await supabase.from("issues").select("id").eq("title", `Sentry: ${si.title}`).not("status", "in", '("closed","wont-fix")').single();
      if (!existingIssue) {
        const { data: newIssue } = await supabase.from("issues").insert({
          title: `Sentry: ${si.title}`,
          category: "bug",
          source: "sentry",
          source_ref: si.id,
          product: "site",
          severity: si.level === "error" ? "high" : "medium",
          error_logs: si.culprit,
          assigned_agent: "ops-code",
          sentry_url: `https://sentry.io/organizations/${SENTRY_ORG}/issues/${si.id}/`,
        }).select("id").single();
        if (newIssue) {
          await supabase.from("sentry_errors").update({ linked_issue_id: newIssue.id }).eq("sentry_id", si.id);
          issuesCreated++;
        }
      }
    }
  }

  console.log(`[sentry-sync] ${upserted} errors synced, ${issuesCreated} issues created`);
  return { statusCode: 200, body: JSON.stringify({ upserted, issuesCreated }) };
};
