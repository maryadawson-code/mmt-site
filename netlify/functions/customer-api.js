// customer-api.js — Customer intelligence API

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

function calculateHealthScore(customer) {
  let score = 50;
  const now = Date.now();
  const day = 86400000;

  if (customer.last_payment_at && (now - new Date(customer.last_payment_at).getTime()) < 30 * day) score += 20;
  if (customer.last_payment_at && (now - new Date(customer.last_payment_at).getTime()) < 7 * day) score += 10;
  if ((customer.total_revenue_cents || 0) > 10000) score += 15;
  if ((customer.proposalpulse_count || 0) > 0 && (customer.marketpulse_count || 0) > 0) score += 10;
  if (customer.newsletter_subscriber) score += 5;

  const lastActivity = customer.last_payment_at || customer.updated_at || customer.created_at;
  if (lastActivity) {
    const daysSince = (now - new Date(lastActivity).getTime()) / day;
    if (daysSince > 60) score -= 30;
    else if (daysSince > 30) score -= 20;
  }

  return Math.max(0, Math.min(100, score));
}

function churnRisk(score) {
  if (score >= 70) return "low";
  if (score >= 40) return "medium";
  return "high";
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: HEADERS, body: "" };
  if (!checkAuth(event)) return err(401, "Unauthorized");

  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  const params = event.queryStringParameters || {};

  if (event.httpMethod === "GET") {
    const view = params.view || "summary";

    if (view === "summary") {
      const { data: customers } = await sb.from("customer_profiles").select("health_score, total_revenue_cents, churn_risk, lifecycle_stage");
      const all = customers || [];
      const totalRevenue = all.reduce((s, c) => s + (c.total_revenue_cents || 0), 0);
      const avgHealth = all.length > 0 ? Math.round(all.reduce((s, c) => s + (c.health_score || 0), 0) / all.length) : 0;
      const atRisk = all.filter(c => c.churn_risk === "high").length;
      const active = all.filter(c => c.lifecycle_stage === "active").length;
      return ok({ total: all.length, active, totalRevenueCents: totalRevenue, avgHealth, atRisk });
    }

    if (view === "list") {
      const { data } = await sb.from("customer_profiles").select("*").order("health_score", { ascending: true });
      return ok({ customers: data || [] });
    }

    if (view === "detail" && params.email) {
      const { data: customer } = await sb.from("customer_profiles").select("*").eq("email", params.email).single();
      if (!customer) return err(404, "Customer not found");
      const { data: events } = await sb.from("customer_events").select("*").eq("email", params.email).order("created_at", { ascending: false }).limit(50);
      return ok({ customer, events: events || [] });
    }

    if (view === "needs-action") {
      const today = new Date().toISOString().split("T")[0];
      const { data } = await sb.from("customer_profiles").select("*").or(`next_action_date.lte.${today},churn_risk.eq.high`).order("next_action_date");
      return ok({ customers: data || [] });
    }

    if (view === "at-risk") {
      const { data } = await sb.from("customer_profiles").select("*").eq("churn_risk", "high").order("health_score");
      return ok({ customers: data || [] });
    }

    return err(400, "Unknown view: " + view);
  }

  if (event.httpMethod === "POST") {
    let body;
    try { body = JSON.parse(event.body); } catch { return err(400, "Invalid JSON"); }

    if (body.action === "update") {
      const { email, ...updates } = body;
      if (!email) return err(400, "email required");
      delete updates.action;
      updates.updated_at = new Date().toISOString();
      await sb.from("customer_profiles").update(updates).eq("email", email);
      return ok({ updated: true });
    }

    if (body.action === "log_event") {
      const { email, eventType, product, amountCents, metadata } = body;
      if (!email || !eventType) return err(400, "email and eventType required");
      const { data: customer } = await sb.from("customer_profiles").select("id").eq("email", email).single();
      await sb.from("customer_events").insert({
        customer_id: customer?.id, email, event_type: eventType, product, amount_cents: amountCents || 0, metadata: metadata || {},
      });
      return ok({ logged: true });
    }

    if (body.action === "recalculate_health") {
      const { data: customers } = await sb.from("customer_profiles").select("*");
      let updated = 0;
      for (const c of (customers || [])) {
        const score = calculateHealthScore(c);
        const risk = churnRisk(score);
        if (score !== c.health_score || risk !== c.churn_risk) {
          await sb.from("customer_profiles").update({ health_score: score, churn_risk: risk, updated_at: new Date().toISOString() }).eq("id", c.id);
          updated++;
        }
      }
      return ok({ recalculated: true, updated });
    }

    return err(400, "Unknown action");
  }

  return err(405, "Method not allowed");
};
