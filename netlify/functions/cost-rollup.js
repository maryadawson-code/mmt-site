// cost-rollup.js — Daily cost aggregation + baseline learning + anomaly detection
// Schedule: 0 7 * * * (7 AM UTC = 3 AM ET)

const { createClient } = require("@supabase/supabase-js");

exports.handler = async () => {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return { statusCode: 500, body: "Not configured" };

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const yesterday = new Date(Date.now() - 86400000);
  const dateStr = yesterday.toISOString().split("T")[0];
  const dayStart = dateStr + "T00:00:00Z";
  const dayEnd = dateStr + "T23:59:59Z";

  console.log(`[cost-rollup] Processing ${dateStr}`);

  // 1. Fetch yesterday's cost events
  const { data: events } = await supabase
    .from("cost_events")
    .select("function_name, product, provider, model, input_tokens, output_tokens, cost_cents, latency_ms, status, cache_hit")
    .gte("created_at", dayStart)
    .lte("created_at", dayEnd);

  if (!events || events.length === 0) {
    console.log("[cost-rollup] No events yesterday");
    return { statusCode: 200, body: "No events" };
  }

  console.log(`[cost-rollup] ${events.length} events to aggregate`);

  // 2. Aggregate into rollup rows
  const groups = {};
  for (const e of events) {
    const key = `${e.product}|${e.provider}|${e.function_name}`;
    if (!groups[key]) groups[key] = { product: e.product, provider: e.provider, function_name: e.function_name, model: e.model, calls: 0, inputTok: 0, outputTok: 0, costCents: 0, latencySum: 0, errors: 0, cacheHits: 0 };
    const g = groups[key];
    g.calls++;
    g.inputTok += e.input_tokens || 0;
    g.outputTok += e.output_tokens || 0;
    g.costCents += e.cost_cents || 0;
    g.latencySum += e.latency_ms || 0;
    if (e.status === "error") g.errors++;
    if (e.cache_hit) g.cacheHits++;
    if (e.model) g.model = e.model;
  }

  // 3. Upsert rollup rows
  for (const g of Object.values(groups)) {
    await supabase.from("cost_daily_rollup").upsert({
      date: dateStr,
      product: g.product,
      provider: g.provider,
      function_name: g.function_name,
      model: g.model,
      call_count: g.calls,
      total_input_tokens: g.inputTok,
      total_output_tokens: g.outputTok,
      total_cost_cents: g.costCents,
      avg_latency_ms: g.calls > 0 ? Math.round(g.latencySum / g.calls) : 0,
      error_count: g.errors,
      cache_hit_count: g.cacheHits,
    }, { onConflict: "date,product,provider,function_name" });
  }

  // 4. Update baselines (rolling 7-day averages)
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];
  const { data: recentRollups } = await supabase
    .from("cost_daily_rollup")
    .select("*")
    .gte("date", sevenDaysAgo);

  if (recentRollups) {
    const baseGroups = {};
    for (const r of recentRollups) {
      const key = `${r.product}|${r.provider}|${r.function_name}`;
      if (!baseGroups[key]) baseGroups[key] = { product: r.product, provider: r.provider, function_name: r.function_name, model: r.model, days: new Set(), totalCost: 0, totalCalls: 0, totalTokens: 0, totalLatency: 0 };
      const bg = baseGroups[key];
      bg.days.add(r.date);
      bg.totalCost += Number(r.total_cost_cents);
      bg.totalCalls += r.call_count;
      bg.totalTokens += Number(r.total_input_tokens) + Number(r.total_output_tokens);
      bg.totalLatency += r.avg_latency_ms * r.call_count;
      if (r.model) bg.model = r.model;
    }

    for (const bg of Object.values(baseGroups)) {
      const numDays = bg.days.size;
      await supabase.from("cost_baselines").upsert({
        product: bg.product,
        provider: bg.provider,
        function_name: bg.function_name,
        model: bg.model,
        avg_cost_cents_per_call: bg.totalCalls > 0 ? bg.totalCost / bg.totalCalls : 0,
        avg_tokens_per_call: bg.totalCalls > 0 ? bg.totalTokens / bg.totalCalls : 0,
        avg_latency_ms: bg.totalCalls > 0 ? bg.totalLatency / bg.totalCalls : 0,
        avg_calls_per_day: numDays > 0 ? bg.totalCalls / numDays : 0,
        avg_daily_cost_cents: numDays > 0 ? bg.totalCost / numDays : 0,
        sample_days: numDays,
        updated_at: new Date().toISOString(),
      }, { onConflict: "product,provider,function_name" });
    }
  }

  // 5. Anomaly detection
  const totalDayCents = Object.values(groups).reduce((s, g) => s + g.costCents, 0);
  const totalDayDollars = totalDayCents / 100;

  if (totalDayDollars > 25) {
    await supabase.from("cost_alerts").insert({
      alert_type: "budget_breach", severity: "critical", title: `Daily spend $${totalDayDollars.toFixed(2)} exceeds $25 budget`,
      description: `${dateStr}: Total spend was $${totalDayDollars.toFixed(2)} across ${events.length} API calls.`,
      recommended_action: "Review high-cost functions and consider rate limits."
    });
  } else if (totalDayDollars > 10) {
    await supabase.from("cost_alerts").insert({
      alert_type: "budget_warn", severity: "warn", title: `Daily spend $${totalDayDollars.toFixed(2)} exceeds $10 warning`,
      description: `${dateStr}: Total spend was $${totalDayDollars.toFixed(2)}. Budget warning threshold hit.`,
      recommended_action: "Monitor. No action needed unless trend continues."
    });
  }

  // Check for spikes vs baselines
  const { data: baselines } = await supabase.from("cost_baselines").select("*");
  if (baselines) {
    for (const g of Object.values(groups)) {
      const baseline = baselines.find(b => b.product === g.product && b.provider === g.provider && b.function_name === g.function_name);
      if (!baseline || baseline.sample_days < 3) continue;
      const avgDaily = parseFloat(baseline.avg_daily_cost_cents) || 0;
      if (avgDaily === 0) continue;
      const ratio = g.costCents / avgDaily;
      const threshold = parseFloat(baseline.alert_threshold_multiplier) || 2.0;

      if (ratio > threshold * 1.5) {
        await supabase.from("cost_alerts").insert({
          alert_type: "runaway", severity: "critical", product: g.product, provider: g.provider, function_name: g.function_name,
          title: `${g.function_name}: ${ratio.toFixed(1)}x baseline spend`,
          description: `${dateStr}: ${g.function_name} spent ${g.costCents}c vs ${avgDaily.toFixed(0)}c baseline (${ratio.toFixed(1)}x). ${g.calls} calls.`,
          recommended_action: "Investigate. Possible retry storm or prompt inflation."
        });
      } else if (ratio > threshold) {
        await supabase.from("cost_alerts").insert({
          alert_type: "spike", severity: "warn", product: g.product, provider: g.provider, function_name: g.function_name,
          title: `${g.function_name}: ${ratio.toFixed(1)}x baseline spend`,
          description: `${dateStr}: ${g.function_name} spent ${g.costCents}c vs ${avgDaily.toFixed(0)}c baseline. ${g.calls} calls.`,
          recommended_action: "Monitor. May be normal variance."
        });
      }
    }
  }

  console.log(`[cost-rollup] Done. ${Object.keys(groups).length} groups, $${totalDayDollars.toFixed(2)} total, ${events.length} events`);
  return { statusCode: 200, body: JSON.stringify({ date: dateStr, events: events.length, groups: Object.keys(groups).length, totalCents: totalDayCents }) };
};
