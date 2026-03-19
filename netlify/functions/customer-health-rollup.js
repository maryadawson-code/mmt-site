// customer-health-rollup.js — Daily customer health recalculation
// Schedule: 0 12 * * * (12 PM UTC = 8 AM ET)

const { createClient } = require("@supabase/supabase-js");

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

function lifecycleStage(customer) {
  if ((customer.total_revenue_cents || 0) > 0) return "active";
  if ((customer.proposalpulse_count || 0) > 0 || (customer.marketpulse_count || 0) > 0) return "trialing";
  return "lead";
}

exports.handler = async () => {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  const { data: customers } = await supabase.from("customer_profiles").select("*");
  if (!customers || customers.length === 0) {
    console.log("[customer-health] No customers");
    return { statusCode: 200, body: "No customers" };
  }

  let updated = 0;
  let atRisk = 0;
  for (const c of customers) {
    const score = calculateHealthScore(c);
    const risk = churnRisk(score);
    const stage = lifecycleStage(c);
    const signals = [];

    if (score !== c.health_score || risk !== c.churn_risk || stage !== c.lifecycle_stage) {
      if (score < c.health_score) signals.push({ type: "decline", from: c.health_score, to: score, at: new Date().toISOString() });
      await supabase.from("customer_profiles").update({
        health_score: score,
        churn_risk: risk,
        lifecycle_stage: stage,
        health_signals: [...(c.health_signals || []), ...signals].slice(-20),
        updated_at: new Date().toISOString(),
      }).eq("id", c.id);
      updated++;
    }
    if (risk === "high") atRisk++;
  }

  console.log(`[customer-health] ${updated}/${customers.length} updated, ${atRisk} at-risk`);
  return { statusCode: 200, body: JSON.stringify({ total: customers.length, updated, atRisk }) };
};
