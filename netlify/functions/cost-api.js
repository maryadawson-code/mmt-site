// cost-api.js — Cost intelligence API for dashboard and agents
// Auth: same key as command-center-api

const { createClient } = require("@supabase/supabase-js");

const HEADERS = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type, Authorization", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
function ok(d) { return { statusCode: 200, headers: HEADERS, body: JSON.stringify(d) }; }
function err(s, m) { return { statusCode: s, headers: HEADERS, body: JSON.stringify({ error: m }) }; }

function checkAuth(event) {
  const key = process.env.COMMAND_CENTER_KEY;
  if (!key) return false;
  const params = event.queryStringParameters || {};
  if (params.key === key) return true;
  const auth = event.headers.authorization || event.headers.Authorization || "";
  return auth.replace(/^Bearer\s+/i, "") === process.env.AGENT_BRIDGE_KEY;
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: HEADERS, body: "" };
  if (!checkAuth(event)) return err(401, "Unauthorized");

  const SB_URL = process.env.SUPABASE_URL;
  const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!SB_URL || !SB_KEY) return err(500, "Not configured");
  const sb = createClient(SB_URL, SB_KEY);

  const params = event.queryStringParameters || {};

  if (event.httpMethod === "GET") {
    const view = params.view || "summary";

    if (view === "summary") {
      const todayStart = new Date().toISOString().split("T")[0] + "T00:00:00Z";
      const [eventsRes, alertsRes, rollupRes] = await Promise.all([
        sb.from("cost_events").select("provider, product, cost_cents, status, function_name").gte("created_at", todayStart),
        sb.from("cost_alerts").select("id, alert_type, severity, title, created_at").is("resolved_at", null).order("created_at", { ascending: false }).limit(10),
        sb.from("cost_daily_rollup").select("date, product, provider, total_cost_cents, call_count").order("date", { ascending: false }).limit(50),
      ]);
      const events = eventsRes.data || [];
      const totalCents = events.reduce((s, e) => s + (e.cost_cents || 0), 0);
      const byProvider = {};
      const byProduct = {};
      for (const e of events) {
        byProvider[e.provider] = (byProvider[e.provider] || 0) + (e.cost_cents || 0);
        byProduct[e.product] = (byProduct[e.product] || 0) + (e.cost_cents || 0);
      }
      const successCount = events.filter(e => e.status === "success").length;
      return ok({
        today: { totalCents, calls: events.length, avgCentsPerCall: events.length > 0 ? Math.round(totalCents / events.length * 100) / 100 : 0, successRate: events.length > 0 ? Math.round(successCount / events.length * 100) : 100 },
        byProvider, byProduct,
        alerts: alertsRes.data || [],
        trend: (rollupRes.data || []).reduce((acc, r) => { const d = r.date; if (!acc[d]) acc[d] = 0; acc[d] += Number(r.total_cost_cents); return acc; }, {}),
      });
    }

    if (view === "breakdown") {
      const product = params.product;
      const days = parseInt(params.days) || 7;
      const since = new Date(Date.now() - days * 86400000).toISOString().split("T")[0];
      let query = sb.from("cost_daily_rollup").select("*").gte("date", since).order("date", { ascending: false });
      if (product) query = query.eq("product", product);
      const { data } = await query;
      return ok({ breakdown: data || [] });
    }

    if (view === "alerts") {
      const { data } = await sb.from("cost_alerts").select("*").is("resolved_at", null).order("created_at", { ascending: false }).limit(50);
      return ok({ alerts: data || [] });
    }

    if (view === "baselines") {
      const { data } = await sb.from("cost_baselines").select("*").order("avg_daily_cost_cents", { ascending: false });
      return ok({ baselines: data || [] });
    }

    if (view === "rate-card") {
      const { data } = await sb.from("cost_rate_card").select("*").order("provider");
      return ok({ rateCard: data || [] });
    }

    if (view === "order" && params.id) {
      const { data } = await sb.from("cost_events").select("*").eq("order_id", params.id).order("created_at");
      const total = (data || []).reduce((s, e) => s + (e.cost_cents || 0), 0);
      return ok({ orderId: params.id, events: data || [], totalCents: total });
    }

    return err(400, "Unknown view: " + view);
  }

  if (event.httpMethod === "POST") {
    let body;
    try { body = JSON.parse(event.body); } catch { return err(400, "Invalid JSON"); }

    if (body.action === "resolve_alert" && body.alertId) {
      await sb.from("cost_alerts").update({ resolved_at: new Date().toISOString(), human_decision: body.decision || "acknowledged", human_notes: body.notes || null }).eq("id", body.alertId);
      return ok({ resolved: true });
    }

    if (body.action === "update_threshold") {
      const { product, provider, functionName, multiplier } = body;
      if (!product || !provider || !functionName) return err(400, "product, provider, functionName required");
      await sb.from("cost_baselines").update({ alert_threshold_multiplier: multiplier, human_override: true, updated_at: new Date().toISOString() }).eq("product", product).eq("provider", provider).eq("function_name", functionName);
      return ok({ updated: true });
    }

    if (body.action === "update_rate") {
      const { provider, model, inputCost, outputCost, perCallCost } = body;
      if (!provider || !model) return err(400, "provider and model required");
      const updates = { updated_at: new Date().toISOString() };
      if (inputCost !== undefined) updates.input_cost_per_1k_cents = inputCost;
      if (outputCost !== undefined) updates.output_cost_per_1k_cents = outputCost;
      if (perCallCost !== undefined) updates.per_call_cost_cents = perCallCost;
      await sb.from("cost_rate_card").update(updates).eq("provider", provider).eq("model", model);
      return ok({ updated: true });
    }

    return err(400, "Unknown action");
  }

  return err(405, "Method not allowed");
};
