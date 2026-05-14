// qa-api.js — QA test results, baselines, and SLA metrics API

const { createClient } = require("@supabase/supabase-js");
const { validateAuth } = require("./lib/auth");

const HEADERS = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "https://missionmeetstech.com", "Access-Control-Allow-Headers": "Content-Type, Authorization", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
function ok(d) { return { statusCode: 200, headers: HEADERS, body: JSON.stringify(d) }; }
function err(s, m) { return { statusCode: s, headers: HEADERS, body: JSON.stringify({ error: m }) }; }

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: HEADERS, body: "" };

  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  const auth = await validateAuth(event, sb);
  if (!auth.authenticated) return err(401, "Unauthorized");
  const params = event.queryStringParameters || {};

  if (event.httpMethod === "GET") {
    const view = params.view || "summary";

    if (view === "summary") {
      const products = ["proposalpulse", "marketpulse", "site", "newsletter"];
      const summaries = [];
      for (const product of products) {
        const { data: latest } = await sb.from("qa_test_runs").select("*").eq("product", product).order("created_at", { ascending: false }).limit(1);
        const { data: regressions } = await sb.from("qa_test_runs").select("id").eq("product", product).eq("is_regression", true).gte("created_at", new Date(Date.now() - 7 * 86400000).toISOString());
        const { data: sla } = await sb.from("sla_metrics").select("*").eq("product", product).order("date", { ascending: false }).limit(1);
        summaries.push({
          product,
          lastRun: latest?.[0] || null,
          regressionsLast7d: regressions?.length || 0,
          sla: sla?.[0] || null,
        });
      }
      const totalRegressions = summaries.reduce((s, p) => s + p.regressionsLast7d, 0);
      return ok({ products: summaries, totalRegressions });
    }

    if (view === "history") {
      const product = params.product;
      let query = sb.from("qa_test_runs").select("*").order("created_at", { ascending: false }).limit(50);
      if (product) query = query.eq("product", product);
      const { data } = await query;
      return ok({ runs: data || [] });
    }

    if (view === "regressions") {
      const { data } = await sb.from("qa_test_runs").select("*").eq("is_regression", true).order("created_at", { ascending: false }).limit(50);
      return ok({ regressions: data || [] });
    }

    return err(400, "Unknown view: " + view);
  }

  if (event.httpMethod === "POST") {
    let body;
    try { body = JSON.parse(event.body); } catch { return err(400, "Invalid JSON"); }

    if (body.action === "log_result") {
      const { product, testType, resultGrade, resultSummary, checksTotal, checksPassed, checksFailed, failedChecks, durationSeconds, costCents, testInput, metadata } = body;
      if (!product || !testType) return err(400, "product and testType required");

      // Check baseline for regression
      const { data: baseline } = await sb.from("qa_baselines").select("avg_grade").eq("product", product).eq("test_type", testType).single();
      const gradeOrder = { "A++": 10, "A+": 9, "A": 8, "B+": 7, "B": 6, "B-": 5, "C+": 4, "C": 3, "D": 2, "F": 1 };
      const isRegression = baseline?.avg_grade && resultGrade && (gradeOrder[resultGrade] || 0) < (gradeOrder[baseline.avg_grade] || 0);

      const { data, error: insertErr } = await sb.from("qa_test_runs").insert({
        product, test_type: testType, status: "completed", result_grade: resultGrade, result_summary: resultSummary,
        checks_total: checksTotal || 0, checks_passed: checksPassed || 0, checks_failed: checksFailed || 0,
        failed_checks: failedChecks || [], duration_seconds: durationSeconds, cost_cents: costCents || 0,
        baseline_grade: baseline?.avg_grade, is_regression: isRegression,
        regression_details: isRegression ? `Grade dropped from ${baseline.avg_grade} to ${resultGrade}` : null,
        test_input: testInput || {}, metadata: metadata || {},
      }).select("id").single();
      if (insertErr) return err(500, insertErr.message);
      return ok({ runId: data.id, isRegression });
    }

    if (body.action === "update_baseline") {
      const { product, testType } = body;
      if (!product || !testType) return err(400, "product and testType required");
      const { data: recent } = await sb.from("qa_test_runs").select("result_grade, duration_seconds, checks_passed, checks_total").eq("product", product).eq("test_type", testType).eq("status", "completed").order("created_at", { ascending: false }).limit(10);
      if (!recent || recent.length === 0) return err(404, "No completed runs");

      const grades = recent.map(r => r.result_grade).filter(Boolean);
      const avgDuration = Math.round(recent.reduce((s, r) => s + (r.duration_seconds || 0), 0) / recent.length);
      const avgPassPct = recent.reduce((s, r) => s + (r.checks_total > 0 ? (r.checks_passed / r.checks_total) * 100 : 100), 0) / recent.length;

      await sb.from("qa_baselines").upsert({
        product, test_type: testType, avg_grade: grades[0], avg_duration_seconds: avgDuration,
        avg_checks_passed_pct: Math.round(avgPassPct * 100) / 100, sample_count: recent.length, updated_at: new Date().toISOString(),
      }, { onConflict: "product,test_type" });
      return ok({ updated: true });
    }

    // === REGRESSION MANAGEMENT ===

    if (body.action === "resolve_regression") {
      const { regression_id } = body;
      if (!regression_id) return err(400, "regression_id required");
      const { error: upErr } = await sb.from("qa_test_runs").update({
        is_regression: false,
        regression_resolved_at: new Date().toISOString(),
        result_summary: sb.raw ? undefined : body.resolution_note || null,
      }).eq("id", regression_id);
      if (upErr) return err(500, upErr.message);
      return ok({ resolved: true });
    }

    if (body.action === "link_fix_pr") {
      const { regression_id, pr_url } = body;
      if (!regression_id || !pr_url) return err(400, "regression_id and pr_url required");
      const { error: upErr } = await sb.from("qa_test_runs").update({
        metadata: sb.raw ? undefined : { fix_pr: pr_url },
      }).eq("id", regression_id);
      // Fallback: use RPC or direct jsonb update
      if (upErr) {
        await sb.rpc("jsonb_set_key", { table_name: "qa_test_runs", row_id: regression_id, key: "fix_pr", value: pr_url }).catch(() => {});
      }
      return ok({ linked: true });
    }

    if (body.action === "trigger_qa_run") {
      const ghToken = process.env.GITHUB_TOKEN;
      if (!ghToken) return ok({ triggered: false, error: "GITHUB_TOKEN not configured — set it in Netlify dashboard" });
      const { repo, workflow_id } = body;
      const owner = "maryadawson-code";
      const repoName = repo || "missionpulse-frontend";
      const wfId = workflow_id || "qa.yml";
      try {
        const res = await fetch(`https://api.github.com/repos/${owner}/${repoName}/actions/workflows/${wfId}/dispatches`, {
          method: "POST",
          headers: { Authorization: `token ${ghToken}`, Accept: "application/vnd.github.v3+json", "Content-Type": "application/json" },
          body: JSON.stringify({ ref: "v2-development" }),
        });
        if (res.status === 204 || res.status === 200) return ok({ triggered: true });
        const errBody = await res.text();
        return ok({ triggered: false, error: `GitHub ${res.status}: ${errBody}` });
      } catch (e) {
        return ok({ triggered: false, error: e.message });
      }
    }

    if (body.action === "create_regression_issue") {
      const ghToken = process.env.GITHUB_TOKEN;
      if (!ghToken) return ok({ created: false, error: "GITHUB_TOKEN not configured" });
      const { title, product, regression_details, regression_id } = body;
      const owner = "maryadawson-code";
      const repo = product === "site" || product === "mmt-site" ? "mmt-site" : "missionpulse-frontend";
      try {
        const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues`, {
          method: "POST",
          headers: { Authorization: `token ${ghToken}`, Accept: "application/vnd.github.v3+json", "Content-Type": "application/json" },
          body: JSON.stringify({
            title: `[Regression] ${title || product}`,
            body: `## QA Regression\n\n**Product:** ${product}\n**Details:** ${regression_details || "N/A"}\n**Regression ID:** ${regression_id || "N/A"}\n\nDetected by MMT Command Center QA dashboard.`,
            labels: ["regression", "qa"],
          }),
        });
        if (res.ok) {
          const issue = await res.json();
          return ok({ created: true, issue_url: issue.html_url, issue_number: issue.number });
        }
        const errBody = await res.text();
        return ok({ created: false, error: `GitHub ${res.status}: ${errBody}` });
      } catch (e) {
        return ok({ created: false, error: e.message });
      }
    }

    return err(400, "Unknown action");
  }

  return err(405, "Method not allowed");
};
