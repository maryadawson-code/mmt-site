/**
 * predictive-signals-background.js — Weekly predictive intelligence.
 *
 * Analyzes patterns across contract intel, intelligence signals, and
 * opportunity radar to predict upcoming opportunities before they're
 * announced. Sends weekly digest to Mary.
 *
 * Schedule: Wednesdays 6 AM ET (10:00 UTC) — configured in netlify.toml.
 *
 * Prediction types:
 *   - option_exercise: Contracts approaching option year decisions
 *   - recompete: Contracts approaching end of all options
 *   - budget_driven: New funding that could generate solicitations
 *   - pattern_interest: Trending topics with no matching opportunity
 */

const { createClient } = require("@supabase/supabase-js");
const { sendEmail } = require("./lib/send-email");
const { logOpsEvent } = require("./lib/ops-ledger");
const { checkKillSwitch } = require("./lib/kill-switch");
const { KNOWN_FACTS } = require("./lib/contract-facts");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

exports.handler = async () => {
  const killCheck = checkKillSwitch("predictive-signals-background");
  if (killCheck.blocked) return killCheck.response;

  console.log("Predictive signals analysis started:", new Date().toISOString());

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return { statusCode: 500, body: "Missing env vars" };
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const predictions = [];

  // --- Type 1: Option exercise predictions from KNOWN_FACTS ---
  try {
    for (const [key, fact] of Object.entries(KNOWN_FACTS)) {
      if (fact.status === "active") {
        predictions.push({
          prediction_type: "option_exercise",
          contract_key: key,
          prediction: `${fact.name} (${fact.agency}) is actively performing. Historical federal health IT option exercise rate: ~85%. Monitor for option year decisions.`,
          confidence: "MEDIUM",
          evidence: { name: fact.name, value: fact.value, agency: fact.agency },
        });
      }
    }
  } catch (err) {
    console.error("Option exercise prediction failed:", err.message);
  }

  // --- Type 4: Pattern-based from intelligence signals ---
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: signals } = await supabase
      .from("intelligence_signals")
      .select("signal_key, signal_type, source_product")
      .gte("created_at", thirtyDaysAgo)
      .order("created_at", { ascending: false })
      .limit(200);

    if (signals && signals.length > 0) {
      // Count unique signal keys across different source products
      const keyMap = {};
      signals.forEach((s) => {
        if (!keyMap[s.signal_key]) keyMap[s.signal_key] = new Set();
        keyMap[s.signal_key].add(s.source_product);
      });

      // Signals with 3+ occurrences
      const trending = Object.entries(keyMap)
        .filter(([, sources]) => sources.size >= 2 || signals.filter((s) => s.signal_key === Object.keys(keyMap).find((k) => keyMap[k] === sources)).length >= 3)
        .map(([key, sources]) => ({ key, sourceCount: sources.size }));

      // Check which trending topics have no matching opportunity
      for (const { key, sourceCount } of trending.slice(0, 10)) {
        const { count } = await supabase
          .from("opportunity_radar")
          .select("*", { count: "exact", head: true })
          .ilike("title", `%${key}%`)
          .gte("scan_date", thirtyDaysAgo);

        if (count === 0) {
          predictions.push({
            prediction_type: "pattern_interest",
            contract_key: key,
            prediction: `Market interest signal: "${key}" is trending across ${sourceCount} MMT products with no matching active solicitation. Monitor for pre-RFI activity.`,
            confidence: "LOW",
            evidence: { signal_key: key, source_count: sourceCount, period: "30d" },
          });
        }
      }
    }
  } catch (err) {
    console.error("Pattern prediction failed:", err.message);
  }

  // --- Self-learning: Check previous predictions for outcomes ---
  try {
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const { data: oldPredictions } = await supabase
      .from("predictive_signals")
      .select("id, prediction_type, contract_key")
      .is("actual_outcome", null)
      .lte("created_at", ninetyDaysAgo)
      .limit(20);

    if (oldPredictions && oldPredictions.length > 0) {
      let resolved = 0;
      for (const pred of oldPredictions) {
        if (pred.prediction_type === "pattern_interest" && pred.contract_key) {
          const { count } = await supabase
            .from("opportunity_radar")
            .select("*", { count: "exact", head: true })
            .ilike("title", `%${pred.contract_key}%`);

          if (count > 0) {
            await supabase
              .from("predictive_signals")
              .update({ actual_outcome: "confirmed", outcome_date: new Date().toISOString().split("T")[0] })
              .eq("id", pred.id);
            resolved++;
          }
        }
      }
      if (resolved > 0) {
        console.log(`Self-learning: resolved ${resolved} old predictions`);
      }
    }
  } catch (err) {
    console.error("Self-learning check failed:", err.message);
  }

  // --- Insert predictions ---
  let insertCount = 0;
  if (predictions.length > 0) {
    try {
      const { error } = await supabase.from("predictive_signals").insert(
        predictions.map((p) => ({
          prediction_type: p.prediction_type,
          contract_key: p.contract_key || null,
          prediction: p.prediction,
          confidence: p.confidence,
          evidence: p.evidence,
          predicted_date: p.predicted_date || null,
        }))
      );
      if (error) {
        console.error("Prediction insert error:", error.message);
      } else {
        insertCount = predictions.length;
      }
    } catch (err) {
      console.error("Prediction insert failed:", err.message);
    }
  }

  // --- Send weekly digest email ---
  if (predictions.length > 0) {
    const grouped = {};
    predictions.forEach((p) => {
      if (!grouped[p.prediction_type]) grouped[p.prediction_type] = [];
      grouped[p.prediction_type].push(p);
    });

    const typeLabels = {
      option_exercise: "Option Year Exercises",
      recompete: "Recompete Forecasts",
      budget_driven: "Budget-Driven Signals",
      pattern_interest: "Market Interest Patterns",
    };

    let rows = "";
    for (const [type, preds] of Object.entries(grouped)) {
      rows += `<tr><td colspan="3" style="padding:12px 8px;font-weight:700;background:#f0f0f0;font-size:14px;">${escapeHtml(typeLabels[type] || type)} (${preds.length})</td></tr>`;
      for (const p of preds.slice(0, 10)) {
        const confColor = p.confidence === "HIGH" ? "#059669" : p.confidence === "MEDIUM" ? "#d97706" : "#9ca3af";
        rows += `<tr>
          <td style="padding:6px 8px;font-size:13px;border-bottom:1px solid #eee;">${escapeHtml(p.prediction)}</td>
          <td style="padding:6px 8px;font-size:13px;border-bottom:1px solid #eee;color:${confColor};font-weight:600;">${p.confidence}</td>
          <td style="padding:6px 8px;font-size:13px;border-bottom:1px solid #eee;color:#666;">${escapeHtml(p.contract_key || "N/A")}</td>
        </tr>`;
      }
    }

    const weekOf = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;padding:20px;background:#f4f4f4;">
  <div style="max-width:700px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;">
    <h2 style="margin:0 0 8px;color:#00050F;">MMT Predictive Intelligence</h2>
    <p style="margin:0 0 24px;color:#6b7280;font-size:14px;">Week of ${weekOf} — ${predictions.length} signals detected</p>
    <table style="width:100%;border-collapse:collapse;">
      <tr style="background:#f9fafb;">
        <th style="padding:8px;text-align:left;font-size:12px;color:#666;">Prediction</th>
        <th style="padding:8px;text-align:left;font-size:12px;color:#666;">Confidence</th>
        <th style="padding:8px;text-align:left;font-size:12px;color:#666;">Key</th>
      </tr>
      ${rows}
    </table>
  </div>
</body></html>`;

    try {
      await sendEmail({
        to: "mary@missionmeetstech.com",
        subject: `MMT Predictive Intelligence — Week of ${weekOf}`,
        html,
        from: "Mission Meets Tech <noreply@missionmeetstech.com>",
      });
    } catch (emailErr) {
      console.error("Predictive digest email failed:", emailErr.message);
    }
  }

  await logOpsEvent(supabase, {
    event_type: "predictive_signals_generated",
    source_function: "predictive-signals-background",
    severity: "info",
    details: {
      predictions_generated: insertCount,
      types: [...new Set(predictions.map((p) => p.prediction_type))],
    },
  });

  console.log(`Predictive signals complete: ${insertCount} predictions`);
  return { statusCode: 200, body: JSON.stringify({ predictions: insertCount }) };
};

function escapeHtml(str) {
  if (!str) return "";
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
