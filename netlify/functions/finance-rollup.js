// finance-rollup.js — Daily finance rollup: baselines, anomaly detection, deadline checks, learning decay
// Schedule: 0 7 * * * (7AM UTC / 3AM ET)
// NOTE: cost-rollup.js handles cost_events → cost_daily_rollup aggregation.
// This function handles the broader finance intelligence: baselines, alerts, service deadlines, learning decay.

const { createClient } = require("@supabase/supabase-js");

exports.handler = async () => {
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  const results = { baselines: 0, alerts: 0, deadlines: 0, learningDecay: 0, learningRetired: 0 };

  // 1. Recalculate cost baselines (7-day rolling averages)
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];
    const { data: rollups } = await sb.from("cost_daily_rollup")
      .select("product, provider, function_name, model, call_count, total_cost_cents, avg_latency_ms")
      .gte("date", sevenDaysAgo);

    const groups = {};
    for (const r of rollups || []) {
      const key = `${r.product}|${r.provider}|${r.function_name}`;
      if (!groups[key]) groups[key] = { costs: [], calls: [], latencies: [], model: r.model, product: r.product, provider: r.provider, function_name: r.function_name };
      groups[key].costs.push(Number(r.total_cost_cents) || 0);
      groups[key].calls.push(r.call_count || 0);
      groups[key].latencies.push(r.avg_latency_ms || 0);
    }

    for (const [, g] of Object.entries(groups)) {
      const days = g.costs.length || 1;
      const avgDailyCost = g.costs.reduce((s, c) => s + c, 0) / days;
      const avgCallsPerDay = g.calls.reduce((s, c) => s + c, 0) / days;
      const avgLatency = g.latencies.filter(l => l > 0).length > 0
        ? g.latencies.filter(l => l > 0).reduce((s, l) => s + l, 0) / g.latencies.filter(l => l > 0).length
        : 0;

      await sb.from("cost_baselines").upsert({
        product: g.product,
        provider: g.provider,
        function_name: g.function_name,
        model: g.model,
        avg_daily_cost_cents: Math.round(avgDailyCost * 100) / 100,
        avg_calls_per_day: Math.round(avgCallsPerDay * 100) / 100,
        avg_latency_ms: Math.round(avgLatency),
        sample_days: days,
        updated_at: new Date().toISOString(),
      }, { onConflict: "product,provider,function_name" });
      results.baselines++;
    }
  } catch (err) {
    console.error("[finance-rollup] baselines:", err.message);
  }

  // 2. Anomaly detection: compare yesterday's spend to baselines
  try {
    const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
    const { data: yesterdayRollups } = await sb.from("cost_daily_rollup").select("*").eq("date", yesterday);
    const { data: baselines } = await sb.from("cost_baselines").select("*");

    const baselineMap = {};
    for (const b of baselines || []) {
      baselineMap[`${b.product}|${b.provider}|${b.function_name}`] = b;
    }

    for (const r of yesterdayRollups || []) {
      const key = `${r.product}|${r.provider}|${r.function_name}`;
      const baseline = baselineMap[key];
      if (!baseline || !baseline.avg_daily_cost_cents || baseline.sample_days < 3) continue;

      const ratio = Number(r.total_cost_cents) / Number(baseline.avg_daily_cost_cents);
      const threshold = Number(baseline.alert_threshold_multiplier) || 2.0;

      if (ratio >= threshold) {
        const severity = ratio >= 3.0 ? "critical" : "warning";
        await sb.from("finance_alerts").insert({
          alert_type: "cost_anomaly",
          severity,
          source: "finance_rollup",
          title: `${r.function_name} cost ${ratio.toFixed(1)}x baseline`,
          description: `${r.product}/${r.provider}/${r.function_name}: $${(Number(r.total_cost_cents) / 100).toFixed(2)} vs baseline $${(Number(baseline.avg_daily_cost_cents) / 100).toFixed(2)}/day`,
          recommended_action: severity === "critical" ? "Investigate immediately — possible runaway or abuse" : "Review usage pattern",
          metadata: { date: yesterday, product: r.product, provider: r.provider, function_name: r.function_name, ratio: Math.round(ratio * 10) / 10 },
        });
        results.alerts++;
      }
    }
  } catch (err) {
    console.error("[finance-rollup] anomaly detection:", err.message);
  }

  // 3. Service deadline checks (within 7 days)
  try {
    const sevenDaysOut = new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0];
    const { data: upcoming } = await sb.from("service_inventory")
      .select("service_name, action_deadline, action_required, priority")
      .eq("status", "active")
      .lte("action_deadline", sevenDaysOut)
      .gte("action_deadline", new Date().toISOString().split("T")[0]);

    for (const svc of upcoming || []) {
      // Check if alert already exists
      const { data: existing } = await sb.from("finance_alerts")
        .select("id")
        .eq("alert_type", "service_deadline")
        .eq("title", `${svc.service_name}: ${svc.action_required}`)
        .is("resolved_at", null)
        .single();

      if (!existing) {
        await sb.from("finance_alerts").insert({
          alert_type: "service_deadline",
          severity: svc.priority === "verify-urgent" ? "critical" : "warning",
          source: "finance_rollup",
          title: `${svc.service_name}: ${svc.action_required}`,
          description: `Deadline: ${svc.action_deadline}. Priority: ${svc.priority}.`,
          recommended_action: svc.action_required,
        });
        results.deadlines++;
      }
    }
  } catch (err) {
    console.error("[finance-rollup] deadlines:", err.message);
  }

  // 4. Learning confidence decay (−0.01/day for unused learnings, human corrections exempt)
  try {
    const { data: learnings } = await sb.from("agent_learnings")
      .select("id, confidence, source, last_applied_at")
      .eq("is_active", true);

    for (const l of learnings || []) {
      // Skip human corrections — they don't decay
      if (l.source === "human") continue;

      const daysSinceApplied = l.last_applied_at
        ? (Date.now() - new Date(l.last_applied_at).getTime()) / 86400000
        : 30; // Assume 30 days if never applied

      if (daysSinceApplied > 7) {
        const newConfidence = Math.max(0.1, parseFloat(l.confidence) - 0.01);
        await sb.from("agent_learnings").update({ confidence: newConfidence }).eq("id", l.id);
        results.learningDecay++;

        // Auto-retire if confidence drops below 0.2
        if (newConfidence < 0.2) {
          await sb.from("agent_learnings").update({ is_active: false }).eq("id", l.id);
          results.learningRetired++;
        }
      }
    }
  } catch (err) {
    console.error("[finance-rollup] learning decay:", err.message);
  }

  // 5. Dashboard auth cleanup — expire sessions, delete old magic links and audit logs
  try {
    const now = new Date().toISOString();
    const { data: expired } = await sb.from("dashboard_sessions")
      .update({ is_valid: false, revoked_reason: "expired" })
      .lt("expires_at", now)
      .eq("is_valid", true)
      .select("id");

    const oneDayAgo = new Date(Date.now() - 24 * 3600000).toISOString();
    await sb.from("dashboard_magic_links").delete().lt("created_at", oneDayAgo);

    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 3600000).toISOString();
    await sb.from("dashboard_audit_log").delete().lt("created_at", ninetyDaysAgo);

    results.authCleanup = expired?.length || 0;
  } catch (err) {
    console.error("[finance-rollup] auth cleanup:", err.message);
  }

  console.log("[finance-rollup]", JSON.stringify(results));
  return { statusCode: 200, body: JSON.stringify(results) };
};
