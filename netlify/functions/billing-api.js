// billing-api.js — Billing intelligence API for dashboard
// GET views: summary, records, unmatched, needs-review, sync-status, monthly-trend, by-service, tax-summary
// POST actions: review_record, add_manual, trigger_sync, toggle_source, import_apple

const { createClient } = require("@supabase/supabase-js");
const { validateAuth } = require("./lib/auth");

const HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "https://missionmeetstech.com",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
function ok(d) {
  return { statusCode: 200, headers: HEADERS, body: JSON.stringify(d) };
}
function err(s, m) {
  return { statusCode: s, headers: HEADERS, body: JSON.stringify({ error: m }) };
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: HEADERS, body: "" };

  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  const auth = await validateAuth(event, sb);
  if (!auth.authenticated) return err(401, "Unauthorized");

  const params = event.queryStringParameters || {};

  // ═══════════════════════════════════════
  // GET VIEWS
  // ═══════════════════════════════════════

  if (event.httpMethod === "GET") {
    const view = params.view || "summary";

    if (view === "summary") {
      const thisMonth = new Date().toISOString().slice(0, 7) + "-01";
      const [summaryRes, reviewRes, syncRes, gmailRes] = await Promise.all([
        sb.from("monthly_cost_summary").select("*").eq("month", thisMonth).single(),
        sb.from("billing_records").select("id, service_name, amount_cents, charge_date, source, confidence").eq("needs_review", true).eq("reviewed", false).order("charge_date", { ascending: false }).limit(10),
        sb.from("billing_sync_status").select("source, is_enabled, last_sync_at, last_success_at, last_error, records_synced"),
        sb.from("oauth_tokens").select("account_email, is_active, last_used_at").eq("provider", "google").single(),
      ]);

      return ok({
        month: thisMonth,
        summary: summaryRes.data || {},
        needsReview: reviewRes.data || [],
        syncStatus: syncRes.data || [],
        gmail: {
          connected: gmailRes.data?.is_active || false,
          email: gmailRes.data?.account_email || null,
        },
      });
    }

    if (view === "records") {
      const month = params.month || new Date().toISOString().slice(0, 7);
      const monthStart = month + "-01";
      const nextMonth = new Date(new Date(monthStart).getTime() + 32 * 86400000).toISOString().slice(0, 7) + "-01";

      const { data } = await sb
        .from("billing_records")
        .select("*")
        .gte("charge_date", monthStart)
        .lt("charge_date", nextMonth)
        .order("charge_date", { ascending: false });

      return ok({ month, records: data || [] });
    }

    if (view === "unmatched") {
      const { data } = await sb
        .from("billing_records")
        .select("id, service_name, amount_cents, charge_date, source, description, confidence")
        .eq("matched_to_inventory", false)
        .order("charge_date", { ascending: false })
        .limit(50);

      return ok({ unmatched: data || [] });
    }

    if (view === "needs-review") {
      const { data } = await sb
        .from("billing_records")
        .select("*")
        .eq("needs_review", true)
        .eq("reviewed", false)
        .order("charge_date", { ascending: false })
        .limit(50);

      return ok({ needsReview: data || [] });
    }

    if (view === "sync-status") {
      const { data } = await sb.from("billing_sync_status").select("*");
      return ok({ sources: data || [] });
    }

    if (view === "monthly-trend") {
      const { data } = await sb
        .from("monthly_cost_summary")
        .select("month, total_cents, business_cents, personal_cents, records_count, sources_synced")
        .order("month", { ascending: false })
        .limit(12);

      return ok({ trend: data || [] });
    }

    if (view === "by-service") {
      const name = params.name;
      if (!name) return err(400, "name parameter required");

      const { data } = await sb
        .from("billing_records")
        .select("*")
        .eq("service_name", name)
        .order("charge_date", { ascending: false })
        .limit(100);

      return ok({ service: name, records: data || [] });
    }

    if (view === "tax-summary") {
      const year = params.year || new Date().getFullYear().toString();
      const yearStart = `${year}-01-01`;
      const yearEnd = `${year}-12-31`;

      const { data } = await sb
        .from("billing_records")
        .select("service_name, amount_cents, charge_date, category, description")
        .eq("is_tax_deductible", true)
        .gte("charge_date", yearStart)
        .lte("charge_date", yearEnd)
        .order("charge_date", { ascending: false });

      const records = data || [];
      const totalCents = records.reduce((s, r) => s + r.amount_cents, 0);
      const byService = {};
      for (const r of records) {
        byService[r.service_name] = (byService[r.service_name] || 0) + r.amount_cents;
      }
      const byCategory = {};
      for (const r of records) {
        byCategory[r.category] = (byCategory[r.category] || 0) + r.amount_cents;
      }

      return ok({ year, totalCents, byService, byCategory, records });
    }

    return err(400, `Unknown view: ${view}`);
  }

  // ═══════════════════════════════════════
  // POST ACTIONS
  // ═══════════════════════════════════════

  if (event.httpMethod === "POST") {
    let body;
    try {
      body = JSON.parse(event.body || "{}");
    } catch {
      return err(400, "Invalid JSON body");
    }

    const action = body.action;

    if (action === "review_record") {
      const { record_id, approved, corrected_service, corrected_amount, corrected_category } = body;
      if (!record_id) return err(400, "record_id required");

      const update = {
        reviewed: true,
        reviewed_by: auth.email || "dashboard",
        reviewed_at: new Date().toISOString(),
        needs_review: false,
      };
      if (corrected_service) update.service_name = corrected_service;
      if (corrected_amount) update.amount_cents = corrected_amount;
      if (corrected_category) update.category = corrected_category;

      const { error } = await sb.from("billing_records").update(update).eq("id", record_id);
      if (error) return err(500, error.message);
      return ok({ reviewed: record_id });
    }

    if (action === "add_manual") {
      const { service_name, charge_date, amount_cents, category, is_business, description } = body;
      if (!service_name || !charge_date || !amount_cents) {
        return err(400, "service_name, charge_date, amount_cents required");
      }

      const dedupKey = `manual_${charge_date}_${amount_cents}_${service_name.substring(0, 20)}`;

      const { error } = await sb.from("billing_records").upsert(
        {
          service_name,
          charge_date,
          amount_cents,
          description: description || `Manual entry: ${service_name}`,
          source: "manual",
          source_ref: `manual_${Date.now()}`,
          category: category || "unknown",
          is_business: is_business !== false,
          is_tax_deductible: is_business !== false,
          confidence: "high",
          dedup_key: dedupKey,
        },
        { onConflict: "dedup_key" }
      );

      if (error) return err(500, error.message);
      return ok({ added: dedupKey });
    }

    if (action === "trigger_sync") {
      // Invoke billing-sync function
      try {
        const resp = await fetch("https://missionmeetstech.com/.netlify/functions/billing-sync", {
          method: "POST",
          headers: { Authorization: `Bearer ${process.env.COMMAND_CENTER_KEY}` },
        });
        const result = await resp.json();
        return ok({ triggered: true, result });
      } catch (e) {
        return err(500, "Failed to trigger sync: " + e.message);
      }
    }

    if (action === "toggle_source") {
      const { source, enabled } = body;
      if (!source) return err(400, "source required");

      const { error } = await sb
        .from("billing_sync_status")
        .update({ is_enabled: enabled !== false })
        .eq("source", source);

      if (error) return err(500, error.message);
      return ok({ source, enabled: enabled !== false });
    }

    if (action === "import_apple") {
      const lines = (body.csv || "").split("\n").filter((l) => l.trim());
      let imported = 0;

      for (const line of lines) {
        const [date, desc, amount] = line.split(",").map((s) => s.trim().replace(/"/g, ""));
        if (!date || !amount) continue;

        const amountCents = Math.round(parseFloat(amount.replace("$", "")) * 100);
        if (isNaN(amountCents) || amountCents <= 0) continue;

        const serviceMatch = matchAppleService(desc);
        const dedupKey = `apple_${date}_${amountCents}_${(desc || "").substring(0, 20)}`;

        const { error } = await sb.from("billing_records").upsert(
          {
            service_name: serviceMatch.name,
            charge_date: date,
            amount_cents: amountCents,
            description: desc,
            source: "apple_export",
            source_ref: dedupKey,
            category: serviceMatch.category,
            is_business: serviceMatch.isBusiness,
            is_tax_deductible: serviceMatch.isBusiness,
            matched_to_inventory: serviceMatch.matched,
            confidence: serviceMatch.matched ? "high" : "medium",
            needs_review: !serviceMatch.matched,
            dedup_key: dedupKey,
          },
          { onConflict: "dedup_key" }
        );

        if (!error) imported++;
      }

      return ok({ imported, total: lines.length });
    }

    if (action === "export_csv") {
      const month = body.month || new Date().toISOString().slice(0, 7);
      const taxOnly = body.tax_only || false;
      const monthStart = month + "-01";
      const nextMonth = new Date(new Date(monthStart).getTime() + 32 * 86400000).toISOString().slice(0, 7) + "-01";

      let query = sb
        .from("billing_records")
        .select("service_name, charge_date, amount_cents, category, description, source, is_business, is_tax_deductible")
        .gte("charge_date", monthStart)
        .lt("charge_date", nextMonth)
        .order("charge_date", { ascending: true });

      if (taxOnly) query = query.eq("is_tax_deductible", true);

      const { data } = await query;
      const records = data || [];

      const csvHeader = "Date,Service,Amount,Category,Description,Source,Business,Tax Deductible";
      const csvRows = records.map(
        (r) =>
          `${r.charge_date},"${r.service_name}",${(r.amount_cents / 100).toFixed(2)},${r.category || ""},"${(r.description || "").replace(/"/g, '""')}",${r.source},${r.is_business},${r.is_tax_deductible}`
      );

      return {
        statusCode: 200,
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="billing-${month}${taxOnly ? "-tax" : ""}.csv"`,
        },
        body: [csvHeader, ...csvRows].join("\n"),
      };
    }

    return err(400, `Unknown action: ${action}`);
  }

  return err(405, "Method not allowed");
};

function matchAppleService(desc) {
  const map = [
    { pattern: /linkedin/i, name: "LinkedIn Premium", category: "productivity", isBusiness: true },
    { pattern: /grok|supergrok|x premium/i, name: "Grok SuperGrok", category: "ai-tools", isBusiness: false },
    { pattern: /youtube/i, name: "YouTube Premium", category: "personal", isBusiness: false },
    { pattern: /classdojo/i, name: "ClassDojo Plus", category: "family", isBusiness: false },
    { pattern: /roblox/i, name: "Roblox Premium 450", category: "family", isBusiness: false },
    { pattern: /perplexity/i, name: "Perplexity MAX", category: "ai-tools", isBusiness: true },
    { pattern: /genspark/i, name: "Genspark Plus", category: "ai-tools", isBusiness: true },
    { pattern: /otter/i, name: "Otter.ai", category: "productivity", isBusiness: true },
    { pattern: /heart.*beat/i, name: "Heart Beat App", category: "personal", isBusiness: false },
    { pattern: /cue/i, name: "Cue AI", category: "productivity", isBusiness: false },
    { pattern: /tucker.*carlson/i, name: "Tucker Carlson Network", category: "personal", isBusiness: false },
    { pattern: /war.*rocks/i, name: "War on the Rocks", category: "personal", isBusiness: true },
    { pattern: /hulu/i, name: "Hulu Live TV Bundle", category: "personal", isBusiness: false },
    { pattern: /better.*homes/i, name: "Better Homes & Gardens", category: "personal", isBusiness: false },
  ];

  for (const m of map) {
    if (m.pattern.test(desc)) return { ...m, matched: true };
  }
  return { name: desc || "Unknown Apple Purchase", category: "unknown", isBusiness: false, matched: false };
}
