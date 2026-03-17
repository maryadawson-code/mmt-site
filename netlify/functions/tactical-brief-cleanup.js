// ============================================================
// tactical-brief-cleanup.js — Netlify Scheduled Function
//
// Runs every 15 minutes. Finds stuck marketpulse_orders and
// retriggers or auto-refunds. Equivalent of score-cleanup.js
// for the Tactical Brief product.
//
// Schedule configured in netlify.toml:
//   [functions."tactical-brief-cleanup"]
//     schedule = "*/15 * * * *"
// ============================================================

const { createClient } = require("@supabase/supabase-js");
const Stripe = require("stripe");
const { logOpsEvent } = require("./lib/ops-ledger");
const { checkCircuit } = require("./lib/circuit-breaker");
const { fetchWithTimeout } = require("./lib/fetch-with-timeout");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const BG_URL = "https://missionmeetstech.com/.netlify/functions/generate-tactical-brief-background";
const MAX_RETRIGGER = 2;
const MAX_DAILY_REFUNDS = 5;

exports.handler = async () => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return { statusCode: 500, body: "Not configured" };
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const cutoff = new Date(Date.now() - 15 * 60000).toISOString();

  try {
    const { data: stuckOrders, error: fetchErr } = await supabase
      .from("marketpulse_orders")
      .select("*")
      .eq("status", "pending")
      .lt("created_at", cutoff)
      .limit(10);

    if (fetchErr) {
      console.error("tactical-brief-cleanup: query failed:", fetchErr.message);
      return { statusCode: 500, body: fetchErr.message };
    }

    if (!stuckOrders || stuckOrders.length === 0) {
      return { statusCode: 200, body: "No stuck orders" };
    }

    let retriggered = 0;
    let failed = 0;

    for (const order of stuckOrders) {
      const retriggerCount = order.retrigger_count || 0;

      // Max retries exceeded — mark failed + auto-refund
      if (retriggerCount >= MAX_RETRIGGER) {
        await supabase
          .from("marketpulse_orders")
          .update({ status: "failed", completed_at: new Date().toISOString() })
          .eq("id", order.id);

        await logOpsEvent(supabase, {
          event_type: "order_failed",
          source_function: "tactical-brief-cleanup",
          order_id: order.id,
          user_email: order.email,
          severity: "error",
          details: { retrigger_count: retriggerCount, reason: "max_retries_exceeded" },
        });

        // Auto-refund with daily cap
        if (STRIPE_SECRET_KEY && order.session_id) {
          const todayStart = new Date();
          todayStart.setUTCHours(0, 0, 0, 0);
          const { count: refundsToday } = await supabase
            .from("ops_events")
            .select("*", { count: "exact", head: true })
            .eq("event_type", "auto_refund")
            .gte("created_at", todayStart.toISOString());

          if (refundsToday >= MAX_DAILY_REFUNDS) {
            await logOpsEvent(supabase, {
              event_type: "refund_cap_reached",
              source_function: "tactical-brief-cleanup",
              order_id: order.id,
              severity: "critical",
              details: { refunds_today: refundsToday, cap: MAX_DAILY_REFUNDS },
            });
          } else {
            try {
              const stripe = new Stripe(STRIPE_SECRET_KEY);
              const session = await stripe.checkout.sessions.retrieve(order.session_id);
              if (session.payment_intent) {
                await stripe.refunds.create({ payment_intent: session.payment_intent, reason: "product_not_delivered" });
                await logOpsEvent(supabase, {
                  event_type: "auto_refund",
                  source_function: "tactical-brief-cleanup",
                  order_id: order.id,
                  user_email: order.email,
                  severity: "warning",
                  auto_resolved: true,
                  resolution: "stripe_refund_issued",
                });
                console.log(`Auto-refund issued for order ${order.id}`);
              }
            } catch (refundErr) {
              console.error("Auto-refund failed for order", order.id, refundErr.message);
            }
          }
        }

        failed++;
        continue;
      }

      // Circuit breaker check
      const circuit = await checkCircuit(supabase, "anthropic");
      if (!circuit.allowed) {
        await logOpsEvent(supabase, {
          event_type: "retry_skipped",
          source_function: "tactical-brief-cleanup",
          order_id: order.id,
          severity: "warning",
          details: { reason: "circuit_open" },
        });
        continue;
      }

      // Increment retrigger count
      await supabase
        .from("marketpulse_orders")
        .update({ retrigger_count: retriggerCount + 1 })
        .eq("id", order.id);

      // Retrigger background function
      try {
        const payload = {
          session_id: order.session_id,
          name: order.name,
          email: order.email,
          company: order.company,
          topic: order.topic,
          audience: order.audience,
          amount_paid: order.amount_paid,
        };

        const res = await fetchWithTimeout(BG_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }, 10000);

        if (res.status === 202 || res.ok) {
          retriggered++;
          await logOpsEvent(supabase, {
            event_type: "retry_triggered",
            source_function: "tactical-brief-cleanup",
            order_id: order.id,
            severity: "info",
            auto_resolved: true,
            resolution: `retrigger_attempt_${retriggerCount + 1}`,
          });
        }
      } catch (err) {
        console.error("Retrigger failed for order", order.id, err.message);
      }
    }

    console.log(`tactical-brief-cleanup: retriggered=${retriggered}, failed=${failed}`);
    return { statusCode: 200, body: JSON.stringify({ retriggered, failed }) };
  } catch (err) {
    console.error("tactical-brief-cleanup error:", err);
    return { statusCode: 500, body: err.message };
  }
};
