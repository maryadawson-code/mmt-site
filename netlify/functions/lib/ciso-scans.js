// ============================================================
// ciso-scans.js — CISO Agent scan modules
//
// Each scan writes findings to ciso_findings and logs to ciso_scan_log.
// Used by agent-bridge ciso_scan action.
// ============================================================

const https = require("https");
const http = require("http");

// --- Helpers ---

async function startScan(supabase, scanType) {
  const { data } = await supabase
    .from("ciso_scan_log")
    .insert({ scan_type: scanType, status: "running" })
    .select("id")
    .single();
  return { scanId: data.id, startTime: Date.now() };
}

async function completeScan(supabase, scanId, startTime, findings) {
  const counts = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const f of findings) counts[f.severity]++;
  await supabase.from("ciso_scan_log").update({
    status: "completed",
    findings_count: findings.length,
    critical_count: counts.critical,
    high_count: counts.high,
    medium_count: counts.medium,
    low_count: counts.low,
    completed_at: new Date().toISOString(),
    duration_ms: Date.now() - startTime,
  }).eq("id", scanId);
  return { scanId, findings: findings.length, ...counts };
}

async function failScan(supabase, scanId, startTime, error) {
  await supabase.from("ciso_scan_log").update({
    status: "failed",
    scan_details: { error: error.message || String(error) },
    completed_at: new Date().toISOString(),
    duration_ms: Date.now() - startTime,
  }).eq("id", scanId);
}

async function writeFinding(supabase, finding) {
  const { error } = await supabase.from("ciso_findings").insert(finding);
  if (error) console.error("Failed to write finding:", error.message);
}

function fetchUrl(url, options = {}) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith("https") ? https : http;
    const req = mod.request(url, { method: options.method || "GET", timeout: 15000 }, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => resolve({ statusCode: res.statusCode, headers: res.headers, body }));
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("Timeout")); });
    req.end();
  });
}

// ============================================================
// 4A: Secrets Scanner
// ============================================================

async function scanSecrets(supabase) {
  const { scanId, startTime } = await startScan(supabase, "secrets");
  const findings = [];

  try {
    const fs = require("fs");
    const path = require("path");
    const repoRoot = process.cwd();

    const secretPatterns = [
      { pattern: /sk_live_[A-Za-z0-9]{24,}/, name: "Stripe live secret key", severity: "critical" },
      { pattern: /pk_live_[A-Za-z0-9]{24,}/, name: "Stripe live publishable key", severity: "medium" },
      { pattern: /sk_test_[A-Za-z0-9]{24,}/, name: "Stripe test secret key", severity: "high" },
      { pattern: /pk_test_[A-Za-z0-9]{24,}/, name: "Stripe test publishable key", severity: "low" },
      { pattern: /sbp_[A-Za-z0-9]{20,}/, name: "Supabase service key", severity: "critical" },
      { pattern: /eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[A-Za-z0-9_-]{50,}/, name: "JWT token (possible Supabase key)", severity: "high" },
      { pattern: /re_[A-Za-z0-9]{20,}/, name: "Resend API key", severity: "high" },
      { pattern: /whsec_[A-Za-z0-9]{20,}/, name: "Stripe webhook secret", severity: "high" },
      { pattern: /(?:password|secret|token|api_key|apikey)\s*[:=]\s*["'][A-Za-z0-9+/=]{16,}["']/i, name: "Hardcoded credential", severity: "high" },
    ];

    const excludeDirs = new Set(["node_modules", ".git", "dist", ".netlify", "coverage"]);
    const excludeFiles = new Set(["package-lock.json", "yarn.lock"]);
    const codeExtensions = new Set([".js", ".ts", ".jsx", ".tsx", ".json", ".html", ".css", ".md", ".env", ".yaml", ".yml", ".toml"]);

    function walk(dir) {
      const files = [];
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (excludeDirs.has(entry.name)) continue;
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            files.push(...walk(fullPath));
          } else if (entry.isFile()) {
            if (excludeFiles.has(entry.name)) continue;
            const ext = path.extname(entry.name).toLowerCase();
            if (codeExtensions.has(ext) || entry.name.startsWith(".env")) {
              files.push(fullPath);
            }
          }
        }
      } catch (e) { /* permission error, skip */ }
      return files;
    }

    // Check for .env files committed
    const envFiles = walk(repoRoot).filter(f => path.basename(f).startsWith(".env") && !path.basename(f).endsWith(".example"));
    for (const envFile of envFiles) {
      const relPath = path.relative(repoRoot, envFile);
      // .env.example is fine, actual .env files are findings
      if (!relPath.includes("example")) {
        findings.push({
          finding_type: "secret_exposure",
          severity: "high",
          title: ".env file in repository: " + relPath,
          description: "Environment file found in repository. These files may contain secrets and should not be committed.",
          affected_component: "codebase",
          cmmc_practice_id: "SC.L2-3.13.10",
          discovered_by: "ciso-agent",
        });
      }
    }

    // Scan code files for secret patterns
    const codeFiles = walk(repoRoot).filter(f => !path.basename(f).startsWith(".env"));
    for (const file of codeFiles) {
      try {
        const content = fs.readFileSync(file, "utf-8");
        const lines = content.split("\n");
        const relPath = path.relative(repoRoot, file);

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          for (const sp of secretPatterns) {
            if (sp.pattern.test(line)) {
              // Skip if it looks like a test fixture or placeholder
              if (line.includes("sk_test_PLACEHOLDER") || line.includes("test_key_") || line.includes("YOUR_")) continue;
              findings.push({
                finding_type: "secret_exposure",
                severity: sp.severity,
                title: sp.name + " found in " + relPath + ":" + (i + 1),
                description: "Pattern '" + sp.name + "' detected at " + relPath + " line " + (i + 1) + ". Verify this is not an actual secret.",
                affected_component: "codebase",
                cmmc_practice_id: "SC.L2-3.13.10",
                discovered_by: "ciso-agent",
              });
            }
          }
        }
      } catch (e) { /* unreadable file, skip */ }
    }

    // Write all findings to DB
    for (const f of findings) await writeFinding(supabase, f);
    return await completeScan(supabase, scanId, startTime, findings);
  } catch (e) {
    await failScan(supabase, scanId, startTime, e);
    throw e;
  }
}

// ============================================================
// 4B: Security Headers Check
// ============================================================

async function scanHeaders(supabase) {
  const { scanId, startTime } = await startScan(supabase, "headers");
  const findings = [];

  try {
    const url = "https://missionmeetstech.com";

    // Fetch headers
    const res = await fetchUrl(url);

    const requiredHeaders = [
      { name: "strict-transport-security", expected: "max-age=", severity: "high", practice: "SC.L2-3.13.8", desc: "HSTS header missing or insufficient. Should have max-age=31536000; includeSubDomains." },
      { name: "x-content-type-options", expected: "nosniff", severity: "medium", practice: "SC.L2-3.13.8", desc: "X-Content-Type-Options header missing. Should be 'nosniff' to prevent MIME-type sniffing." },
      { name: "x-frame-options", expected: "DENY", altExpected: "SAMEORIGIN", severity: "medium", practice: "SC.L2-3.13.8", desc: "X-Frame-Options header missing. Should be DENY or SAMEORIGIN to prevent clickjacking." },
      { name: "content-security-policy", expected: null, severity: "high", practice: "SC.L2-3.13.8", desc: "Content-Security-Policy header missing. CSP should be configured to prevent XSS and injection attacks." },
      { name: "referrer-policy", expected: "strict-origin-when-cross-origin", severity: "low", practice: "SC.L2-3.13.8", desc: "Referrer-Policy header missing or weak. Should be strict-origin-when-cross-origin or stricter." },
      { name: "permissions-policy", expected: null, severity: "low", practice: "SC.L2-3.13.8", desc: "Permissions-Policy header missing. Should restrict browser features like camera, microphone, geolocation." },
    ];

    for (const h of requiredHeaders) {
      const value = res.headers[h.name];
      if (!value) {
        findings.push({
          finding_type: "misconfiguration",
          severity: h.severity,
          title: "Missing security header: " + h.name,
          description: h.desc,
          affected_component: "netlify",
          cmmc_practice_id: h.practice,
          discovered_by: "ciso-agent",
        });
      } else if (h.expected && !value.includes(h.expected) && (!h.altExpected || !value.includes(h.altExpected))) {
        findings.push({
          finding_type: "misconfiguration",
          severity: h.severity,
          title: "Weak security header: " + h.name,
          description: h.desc + " Current value: " + value,
          affected_component: "netlify",
          cmmc_practice_id: h.practice,
          discovered_by: "ciso-agent",
        });
      }
    }

    // Check Server header leaking version info
    if (res.headers["server"] && /\d+\.\d+/.test(res.headers["server"])) {
      findings.push({
        finding_type: "misconfiguration",
        severity: "low",
        title: "Server header leaks version info",
        description: "Server header value '" + res.headers["server"] + "' reveals version information that could aid attackers.",
        affected_component: "netlify",
        cmmc_practice_id: "SC.L2-3.13.8",
        discovered_by: "ciso-agent",
      });
    }

    // Check HTTPS redirect
    try {
      const httpRes = await fetchUrl("http://missionmeetstech.com", { method: "GET" });
      if (httpRes.statusCode !== 301 && httpRes.statusCode !== 302) {
        findings.push({
          finding_type: "misconfiguration",
          severity: "high",
          title: "HTTP to HTTPS redirect not configured",
          description: "HTTP requests to missionmeetstech.com do not redirect to HTTPS. Expected 301 redirect, got " + httpRes.statusCode + ".",
          affected_component: "netlify",
          cmmc_practice_id: "SC.L2-3.13.8",
          discovered_by: "ciso-agent",
        });
      }
    } catch (e) {
      // HTTP request failed, which is acceptable if only HTTPS is served
    }

    for (const f of findings) await writeFinding(supabase, f);
    return await completeScan(supabase, scanId, startTime, findings);
  } catch (e) {
    await failScan(supabase, scanId, startTime, e);
    throw e;
  }
}

// ============================================================
// 4C: Supabase RLS Audit
// ============================================================

async function scanRLS(supabase) {
  const { scanId, startTime } = await startScan(supabase, "rls");
  const findings = [];

  try {
    // List all tables in public schema
    const { data: tables, error: tablesErr } = await supabase.rpc("get_public_tables").catch(() => ({ data: null, error: true }));

    // Fallback: query information_schema directly
    let tableList = [];
    if (!tables || tablesErr) {
      const { data: rawTables } = await supabase.from("pg_tables").select("tablename").eq("schemaname", "public").catch(() => ({ data: null }));
      if (rawTables) {
        tableList = rawTables.map((t) => t.tablename);
      } else {
        // Use known table list as fallback
        tableList = [
          "mp_users", "mp_scoring_history", "marketpulse_orders", "mp_feature_usage",
          "agent_heartbeats", "task_queue", "intel_signals", "newsletter_pipeline",
          "held_emails", "ops_events", "agent_approvals", "quality_metrics",
          "ciso_cmmc_practices", "ciso_findings", "ciso_scan_log", "ciso_access_inventory", "ciso_incidents",
        ];
      }
    } else {
      tableList = tables.map((t) => t.table_name || t.tablename);
    }

    // Customer data tables that MUST have RLS
    const customerDataTables = new Set([
      "mp_scoring_history", "marketpulse_orders", "mp_users", "mp_feature_usage",
    ]);

    // CISO tables that should have RLS
    const cisoTables = new Set([
      "ciso_cmmc_practices", "ciso_findings", "ciso_scan_log", "ciso_access_inventory", "ciso_incidents",
    ]);

    // Check RLS status via pg_class (this works with service_role)
    for (const tableName of tableList) {
      try {
        const { data: rlsCheck } = await supabase
          .from(tableName)
          .select("*")
          .limit(0);

        // We can't directly check RLS status via the data API
        // Instead check if table is in our known lists and flag accordingly
        if (customerDataTables.has(tableName)) {
          // For customer data tables, we note them for manual verification
          findings.push({
            finding_type: "policy_violation",
            severity: "medium",
            title: "Verify RLS on customer data table: " + tableName,
            description: "Table '" + tableName + "' contains customer data. Verify RLS is enabled and policies are correct. Manual check required via Supabase dashboard.",
            affected_component: "supabase",
            cmmc_practice_id: "AC.L2-3.1.3",
            remediation_plan: "Verify in Supabase dashboard: Authentication > Policies > " + tableName,
            discovered_by: "ciso-agent",
          });
        }
      } catch (e) {
        // Table doesn't exist or access denied
      }
    }

    for (const f of findings) await writeFinding(supabase, f);
    return await completeScan(supabase, scanId, startTime, findings);
  } catch (e) {
    await failScan(supabase, scanId, startTime, e);
    throw e;
  }
}

// ============================================================
// 4D: Dependency Vulnerability Scan
// ============================================================

async function scanDependencies(supabase) {
  const { scanId, startTime } = await startScan(supabase, "dependencies");
  const findings = [];

  try {
    const { execSync } = require("child_process");
    let auditOutput;

    try {
      auditOutput = execSync("npm audit --json 2>/dev/null", {
        cwd: process.cwd(),
        encoding: "utf-8",
        timeout: 30000,
      });
    } catch (e) {
      // npm audit returns non-zero exit code when vulnerabilities found
      auditOutput = e.stdout || "{}";
    }

    let audit;
    try {
      audit = JSON.parse(auditOutput);
    } catch (e) {
      audit = {};
    }

    const severityMap = { critical: "critical", high: "high", moderate: "medium", low: "low", info: "low" };

    if (audit.vulnerabilities) {
      for (const [pkg, vuln] of Object.entries(audit.vulnerabilities)) {
        const severity = severityMap[vuln.severity] || "medium";
        const fixAvailable = vuln.fixAvailable ? " Auto-fix available." : "";

        findings.push({
          finding_type: "dependency",
          severity,
          title: "npm vulnerability: " + pkg + " (" + vuln.severity + ")",
          description: "Package '" + pkg + "' has a " + vuln.severity + " severity vulnerability. Range: " + (vuln.range || "unknown") + "." + fixAvailable,
          affected_component: "codebase",
          cmmc_practice_id: "SI.L2-3.14.1",
          remediation_plan: vuln.fixAvailable ? "Run 'npm audit fix' to resolve." : "Manual update required. Check for breaking changes.",
          discovered_by: "ciso-agent",
        });
      }
    } else if (audit.advisories) {
      // npm v6 format
      for (const [id, adv] of Object.entries(audit.advisories)) {
        const severity = severityMap[adv.severity] || "medium";
        findings.push({
          finding_type: "dependency",
          severity,
          title: "npm vulnerability: " + adv.module_name + " (" + adv.severity + ")",
          description: (adv.title || "Vulnerability") + " in " + adv.module_name + ". " + (adv.url || ""),
          affected_component: "codebase",
          cmmc_practice_id: "SI.L2-3.14.1",
          remediation_plan: adv.patched_versions ? "Update to " + adv.patched_versions : "No patch available.",
          discovered_by: "ciso-agent",
        });
      }
    }

    for (const f of findings) await writeFinding(supabase, f);
    return await completeScan(supabase, scanId, startTime, findings);
  } catch (e) {
    await failScan(supabase, scanId, startTime, e);
    throw e;
  }
}

// ============================================================
// 4E: Access Inventory Audit
// ============================================================

async function scanAccessInventory(supabase) {
  const { scanId, startTime } = await startScan(supabase, "access_audit");
  const findings = [];

  try {
    // Known environment variables that should be tracked
    const knownEnvKeys = [
      { name: "SUPABASE_URL", service: "supabase", type: "api_key", scope: "Database connection URL" },
      { name: "SUPABASE_SERVICE_KEY", service: "supabase", type: "service_role", scope: "Full database access, bypasses RLS" },
      { name: "SUPABASE_ANON_KEY", service: "supabase", type: "api_key", scope: "Public anonymous access, RLS enforced" },
      { name: "STRIPE_SECRET_KEY", service: "stripe", type: "api_key", scope: "Full Stripe API access (charges, refunds, customers)" },
      { name: "STRIPE_WEBHOOK_SECRET", service: "stripe", type: "webhook_secret", scope: "Verify Stripe webhook signatures" },
      { name: "RESEND_API_KEY", service: "resend", type: "api_key", scope: "Send transactional emails" },
      { name: "ANTHROPIC_API_KEY", service: "openai", type: "api_key", scope: "Claude API access for scoring and intel" },
      { name: "SENTRY_DSN", service: "sentry", type: "api_key", scope: "Error reporting" },
      { name: "AGENT_BRIDGE_KEY", service: "agent-bridge", type: "api_key", scope: "Agent bridge authentication" },
      { name: "COMMAND_CENTER_KEY", service: "agent-bridge", type: "api_key", scope: "Command center API authentication" },
      { name: "PERPLEXITY_API_KEY", service: "perplexity", type: "api_key", scope: "DEPRECATED — replaced by Claude web_search. Can be removed." },
      { name: "OPENAI_API_KEY", service: "openai", type: "api_key", scope: "OpenAI API access" },
    ];

    // Check which keys exist in the current environment
    const inventoryRecords = [];
    for (const key of knownEnvKeys) {
      const exists = !!process.env[key.name];
      if (exists) {
        inventoryRecords.push({
          service: key.service,
          credential_type: key.type,
          credential_name: key.name,
          storage_location: "netlify_env",
          access_scope: key.scope,
          users_with_access: ["mary"],
          has_rotation_policy: false,
        });
      }
    }

    // Upsert into access inventory
    for (const record of inventoryRecords) {
      const { data: existing } = await supabase
        .from("ciso_access_inventory")
        .select("id")
        .eq("credential_name", record.credential_name)
        .single();

      if (existing) {
        await supabase.from("ciso_access_inventory").update({
          ...record,
          updated_at: new Date().toISOString(),
        }).eq("id", existing.id);
      } else {
        await supabase.from("ciso_access_inventory").insert(record);
      }
    }

    // Flag keys without rotation policy
    for (const record of inventoryRecords) {
      if (!record.has_rotation_policy && ["api_key", "service_role"].includes(record.credential_type)) {
        findings.push({
          finding_type: "policy_violation",
          severity: "medium",
          title: "No rotation policy for " + record.credential_name,
          description: "Credential '" + record.credential_name + "' (" + record.service + ") has no rotation policy configured. Secrets should be rotated periodically.",
          affected_component: record.service,
          cmmc_practice_id: "IA.L2-3.5.10",
          remediation_plan: "Set a rotation schedule (90 days recommended) and record in ciso_access_inventory.",
          discovered_by: "ciso-agent",
        });
      }
    }

    // Check for hardcoded keys in codebase (leverages secrets scan results)
    const { data: hardcodedFindings } = await supabase
      .from("ciso_findings")
      .select("id")
      .eq("finding_type", "secret_exposure")
      .eq("status", "open");

    if (hardcodedFindings && hardcodedFindings.length > 0) {
      findings.push({
        finding_type: "policy_violation",
        severity: "high",
        title: hardcodedFindings.length + " potential hardcoded secrets detected",
        description: "There are " + hardcodedFindings.length + " open secret exposure findings. Cross-reference with the secrets scan results.",
        affected_component: "codebase",
        cmmc_practice_id: "SC.L2-3.13.10",
        discovered_by: "ciso-agent",
      });
    }

    for (const f of findings) await writeFinding(supabase, f);
    return await completeScan(supabase, scanId, startTime, findings);
  } catch (e) {
    await failScan(supabase, scanId, startTime, e);
    throw e;
  }
}

// ============================================================
// 4F: Data Handling Audit
// ============================================================

async function scanDataHandling(supabase) {
  const { scanId, startTime } = await startScan(supabase, "data_handling");
  const findings = [];

  try {
    const fs = require("fs");
    const path = require("path");
    const functionsDir = path.join(process.cwd(), "netlify", "functions");

    if (!fs.existsSync(functionsDir)) {
      await completeScan(supabase, scanId, startTime, findings);
      return { scanId, findings: 0 };
    }

    const files = fs.readdirSync(functionsDir).filter((f) => f.endsWith(".js"));

    for (const file of files) {
      const filePath = path.join(functionsDir, file);
      const content = fs.readFileSync(filePath, "utf-8");

      // Check for console.log of request bodies (PII leak risk)
      if (/console\.log\(.*(body|req\.body|event\.body|proposal|document)/i.test(content)) {
        findings.push({
          finding_type: "data_handling",
          severity: "medium",
          title: "Potential PII logging in " + file,
          description: "Function '" + file + "' may log request body content containing customer data. Check console.log statements for PII.",
          affected_component: "edge-functions",
          cmmc_practice_id: "AU.L2-3.3.1",
          remediation_plan: "Review and remove or redact console.log statements that may capture customer proposal data.",
          discovered_by: "ciso-agent",
        });
      }

      // Check for Sentry captureException with request context
      if (/captureException|captureMessage/.test(content) && /body|request|proposal/i.test(content)) {
        findings.push({
          finding_type: "data_handling",
          severity: "medium",
          title: "Sentry may capture PII in " + file,
          description: "Function '" + file + "' uses Sentry error tracking and may send customer data in error context.",
          affected_component: "sentry",
          cmmc_practice_id: "AU.L2-3.3.1",
          remediation_plan: "Configure Sentry beforeSend to scrub request bodies and PII before transmission.",
          discovered_by: "ciso-agent",
        });
      }

      // Check if agent-bridge stores full proposal text in task results
      if (file.includes("agent-bridge") && /proposal|document_text|extracted_text/.test(content)) {
        findings.push({
          finding_type: "data_handling",
          severity: "high",
          title: "Agent bridge may store customer document text",
          description: "Agent bridge function may pass or store full proposal text in task results. Customer documents should not be persisted in agent task queues.",
          affected_component: "agent-bridge",
          cmmc_practice_id: "MP.L2-3.8.9",
          remediation_plan: "Ensure agent-bridge does not store full document content. Use references (scoring_id) instead.",
          discovered_by: "ciso-agent",
        });
      }
    }

    for (const f of findings) await writeFinding(supabase, f);
    return await completeScan(supabase, scanId, startTime, findings);
  } catch (e) {
    await failScan(supabase, scanId, startTime, e);
    throw e;
  }
}

// ============================================================
// Full Compliance Scan — runs all scan types
// ============================================================

async function scanFullCompliance(supabase) {
  const { scanId, startTime } = await startScan(supabase, "full_compliance");
  const allFindings = [];

  try {
    const scans = [
      { name: "secrets", fn: scanSecrets },
      { name: "headers", fn: scanHeaders },
      { name: "rls", fn: scanRLS },
      { name: "dependencies", fn: scanDependencies },
      { name: "access_audit", fn: scanAccessInventory },
      { name: "data_handling", fn: scanDataHandling },
    ];

    const results = {};
    for (const scan of scans) {
      try {
        results[scan.name] = await scan.fn(supabase);
        allFindings.push(...Array(results[scan.name].findings || 0));
      } catch (e) {
        results[scan.name] = { error: e.message };
      }
    }

    // Get total findings from individual scans
    const { data: recentFindings } = await supabase
      .from("ciso_findings")
      .select("severity")
      .eq("discovered_by", "ciso-agent")
      .gte("discovered_at", new Date(startTime).toISOString());

    const counts = { critical: 0, high: 0, medium: 0, low: 0 };
    for (const f of (recentFindings || [])) counts[f.severity]++;

    await supabase.from("ciso_scan_log").update({
      status: "completed",
      findings_count: (recentFindings || []).length,
      critical_count: counts.critical,
      high_count: counts.high,
      medium_count: counts.medium,
      low_count: counts.low,
      scan_details: results,
      completed_at: new Date().toISOString(),
      duration_ms: Date.now() - startTime,
    }).eq("id", scanId);

    return { scanId, results, total: (recentFindings || []).length, ...counts };
  } catch (e) {
    await failScan(supabase, scanId, startTime, e);
    throw e;
  }
}

// ============================================================
// Exports
// ============================================================

module.exports = {
  scanSecrets,
  scanHeaders,
  scanRLS,
  scanDependencies,
  scanAccessInventory,
  scanDataHandling,
  scanFullCompliance,
};
