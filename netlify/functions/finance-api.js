// finance-api.js — Unified finance API: cost intelligence + service inventory + finance alerts
// Extends cost-api.js with service and finance_alerts views

const { createClient } = require("@supabase/supabase-js");

const HEADERS = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type, Authorization", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
function ok(d) { return { statusCode: 200, headers: HEADERS, body: JSON.stringify(d) }; }
function err(s, m) { return { statusCode: s, headers: HEADERS, body: JSON.stringify({ error: m }) }; }

function checkAuth(event) {
  const params = event.queryStringParameters || {};
  if (params.key === process.env.COMMAND_CENTER_KEY) return true;
  const auth = event.headers.authorization || event.headers.Authorization || "";
  return auth.replace(/^Bearer\s+/i, "") === process.env.AGENT_BRIDGE_KEY;
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: HEADERS, body: "" };
  if (!checkAuth(event)) return err(401, "Unauthorized");

  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  const params = event.queryStringParameters || {};

  if (event.httpMethod === "GET") {
    const view = params.view || "cost-summary";

    // === COST VIEWS (mirrors cost-api.js) ===
    if (view === "cost-summary") {
      const todayStart = new Date().toISOString().split("T")[0] + "T00:00:00Z";
      const [eventsRes, alertsRes, rollupRes] = await Promise.all([
        sb.from("cost_events").select("provider, product, cost_cents, status").gte("created_at", todayStart),
        sb.from("finance_alerts").select("id, alert_type, severity, title, created_at").is("resolved_at", null).order("created_at", { ascending: false }).limit(10),
        sb.from("cost_daily_rollup").select("date, total_cost_cents, call_count").order("date", { ascending: false }).limit(50),
      ]);
      const events = eventsRes.data || [];
      const totalCents = events.reduce((s, e) => s + (e.cost_cents || 0), 0);
      const byProvider = {};
      for (const e of events) byProvider[e.provider] = (byProvider[e.provider] || 0) + (e.cost_cents || 0);
      return ok({
        today: { totalCents, calls: events.length, avgCentsPerCall: events.length > 0 ? Math.round(totalCents / events.length * 100) / 100 : 0 },
        byProvider,
        alerts: alertsRes.data || [],
        trend: (rollupRes.data || []).reduce((acc, r) => { if (!acc[r.date]) acc[r.date] = 0; acc[r.date] += Number(r.total_cost_cents); return acc; }, {}),
      });
    }

    if (view === "cost-breakdown") {
      const days = parseInt(params.days) || 7;
      const since = new Date(Date.now() - days * 86400000).toISOString().split("T")[0];
      let query = sb.from("cost_daily_rollup").select("*").gte("date", since).order("date", { ascending: false });
      if (params.product) query = query.eq("product", params.product);
      const { data } = await query;
      return ok({ breakdown: data || [] });
    }

    // === SERVICE VIEWS ===
    if (view === "services") {
      const { data } = await sb.from("service_inventory").select("*").order("category").order("service_name");
      return ok({ services: data || [] });
    }

    if (view === "services-summary") {
      const { data: services } = await sb.from("service_inventory").select("*").eq("status", "active");
      const all = services || [];
      const totalMonthly = all.reduce((s, svc) => s + (svc.monthly_cost_cents || 0), 0);
      const businessMonthly = all.filter(s => s.is_business).reduce((s, svc) => s + (svc.monthly_cost_cents || 0), 0);
      const personalMonthly = all.filter(s => !s.is_business).reduce((s, svc) => s + (svc.monthly_cost_cents || 0), 0);
      const taxDeductible = all.filter(s => s.is_tax_deductible).reduce((s, svc) => s + (svc.monthly_cost_cents || 0), 0);
      const pendingDecisions = all.filter(s => ["decide", "evaluate", "verify", "verify-urgent", "cancel"].includes(s.priority)).length;
      const now = new Date();
      const sevenDays = new Date(now.getTime() + 7 * 86400000);
      const deadlines = all.filter(s => s.action_deadline && new Date(s.action_deadline) <= sevenDays).map(s => ({
        service: s.service_name, deadline: s.action_deadline, action: s.action_required, priority: s.priority,
      }));
      return ok({
        totalMonthlyCents: totalMonthly,
        businessMonthlyCents: businessMonthly,
        personalMonthlyCents: personalMonthly,
        taxDeductibleMonthlyCents: taxDeductible,
        annualProjectedCents: totalMonthly * 12,
        serviceCount: all.length,
        pendingDecisions,
        upcomingDeadlines: deadlines,
      });
    }

    // === ALERTS ===
    if (view === "alerts") {
      const { data } = await sb.from("finance_alerts").select("*").is("resolved_at", null).order("created_at", { ascending: false }).limit(50);
      return ok({ alerts: data || [] });
    }

    // === RATE CARD ===
    if (view === "rate-card") {
      const { data } = await sb.from("cost_rate_card").select("*").order("provider");
      return ok({ rateCard: data || [] });
    }

    return err(400, "Unknown view: " + view);
  }

  if (event.httpMethod === "POST") {
    let body;
    try { body = JSON.parse(event.body); } catch { return err(400, "Invalid JSON"); }

    if (body.action === "resolve_alert" && body.alertId) {
      await sb.from("finance_alerts").update({ resolved_at: new Date().toISOString(), human_decision: body.decision || "acknowledged" }).eq("id", body.alertId);
      return ok({ resolved: true });
    }

    if (body.action === "update_service") {
      const { id, ...updates } = body;
      if (!id) return err(400, "id required");
      delete updates.action;
      updates.updated_at = new Date().toISOString();
      await sb.from("service_inventory").update(updates).eq("id", id);
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
