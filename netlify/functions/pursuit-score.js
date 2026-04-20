// ============================================================
// pursuit-score.js — Pursuit Score Engine endpoint
//
// POST { email, keyword, agency?, naics? } → 0-100 bid/no-bid
// score card. Premium-gated (same tiers as premium-chat).
//
// Implements Section 5.2 of docs/MMT-Technical-Spec.md.
// ============================================================

const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");
const { scorePursuit } = require("./lib/pursuit-score-engine");
const { MMT_PRICING } = require("./lib/mmt-pricing");
const { getFlag } = require("./lib/feature-flags");
const { loadToolContext, buildToolEnvelope, buildEvidencePanel, renderBlockedResponse } = require("./lib/premium-tools-core");

// Cap + overage values come from lib/mmt-pricing.js (single source of truth)
const MONTHLY_SCORE_CAP = MMT_PRICING.pursuit_score.premium_monthly_allowance;    // 20
const INSTITUTIONAL_SCORE_CAP = MMT_PRICING.pursuit_score.team_pack_allowance + 25; // 100
const CACHE_TTL_HOURS = 72;

function cacheKeyFor({ keyword, agency, naics }) {
  const fy = new Date().getUTCFullYear();
  const quarter = Math.floor(new Date().getUTCMonth() / 3) + 1;
  const normalized = `${(keyword || "").toLowerCase().trim()}|${agency || ""}|${(naics || []).join(",")}|FY${fy}Q${quarter}`;
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

async function readCache(supabase, key) {
  try {
    const cutoff = new Date(Date.now() - CACHE_TTL_HOURS * 3600 * 1000).toISOString();
    const { data } = await supabase
      .from("ops_events")
      .select("details, created_at")
      .eq("event_type", "pursuit_score_cache")
      .eq("details->>cache_key", key)
      .gte("created_at", cutoff)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data && data.details && data.details.card) {
      return { card: data.details.card, cachedAt: data.created_at };
    }
  } catch (err) {
    console.warn("pursuit-score: cache read failed:", err.message);
  }
  return null;
}

async function writeCache(supabase, key, card) {
  try {
    await supabase.from("ops_events").insert({
      event_type: "pursuit_score_cache",
      details: { cache_key: key, card, stored_at: new Date().toISOString() },
    });
  } catch (err) {
    console.warn("pursuit-score: cache write failed:", err.message);
  }
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "https://missionmeetstech.com",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: CORS_HEADERS, body: "" };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: CORS_HEADERS, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: "Service not configured" }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: "Invalid JSON" }) };
  }

  const email = (body.email || "").toLowerCase().trim();
  const keyword = (body.keyword || "").trim();
  const agency = body.agency || null;
  const naics = Array.isArray(body.naics) ? body.naics : (body.naics ? [body.naics] : null);

  if (!email || !keyword) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: "email and keyword required" }) };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: "invalid email" }) };
  }
  if (keyword.length > 300) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: "keyword too long" }) };
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // Premium verification — matches premium-chat/ask-mmt gating
  const { data: user } = await supabase
    .from("mp_users")
    .select("tier, subscription_tier, subscription_status")
    .eq("email", email)
    .single();

  const isInstitutional = user && user.subscription_tier === "institutional" && user.subscription_status === "active";
  const isPremium = user && (
    (user.subscription_tier === "premium" && user.subscription_status === "active") ||
    isInstitutional ||
    user.tier === "admin" ||
    user.tier === "paid"
  );

  if (!isPremium) {
    return {
      statusCode: 403,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: "Pursuit Score Engine is a Premium feature. Subscribe at missionmeetstech.com/pricing" }),
    };
  }

  // Monthly quota
  const now = new Date();
  const monthStart = new Date(now.getUTCFullYear(), now.getUTCMonth(), 1).toISOString();
  const { count } = await supabase
    .from("ops_events")
    .select("*", { count: "exact", head: true })
    .eq("event_type", "pursuit_score")
    .eq("details->>email", email)
    .gte("created_at", monthStart);

  const cap = isInstitutional ? INSTITUTIONAL_SCORE_CAP : MONTHLY_SCORE_CAP;
  const used = count || 0;

  // Cache lookup BEFORE decrementing quota — cache hits are free per spec §4
  const cacheKey = cacheKeyFor({ keyword, agency, naics });
  const cached = await readCache(supabase, cacheKey);
  if (cached) {
    const ageHours = Math.floor((Date.now() - new Date(cached.cachedAt).getTime()) / (3600 * 1000));
    return {
      statusCode: 200,
      headers: { ...CORS_HEADERS, "X-Cache": "HIT" },
      body: JSON.stringify({
        ...cached.card,
        remaining: Math.max(cap - used, 0),
        cached: true,
        cachedAgoHours: ageHours,
      }),
    };
  }

  if (used >= cap) {
    return {
      statusCode: 429,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        error: "QUOTA_EXHAUSTED",
        message: `Monthly Pursuit Score limit reached (${cap} scores). Resets on the 1st.`,
        remaining: 0,
      }),
    };
  }

  let card;
  try {
    card = await scorePursuit({ keyword, agency, naics });
    if (card.error === "QUERY_TOO_SHORT") {
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify(card) };
    }
  } catch (err) {
    console.error("pursuit-score: engine threw:", err.message);
    return {
      statusCode: 502,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: "Scoring engine failed. Try again in a moment." }),
    };
  }

  // === PREMIUM_TOOLS_V2 envelope wrapping ===
  // Wrap the legacy card in the uniform ToolEnvelope (mode dispatch,
  // evidence panel, Monday Move, methodology & gaps). Legacy fields
  // remain available at envelope.legacy for backward compatibility.
  const V2_ON = getFlag("PREMIUM_TOOLS_V2") === "on";
  let envelope = null;
  if (V2_ON) {
    const toolCtx = await loadToolContext(supabase, email, { company: body.company });
    if (toolCtx.state === "BLOCKED") {
      return {
        statusCode: 409,
        headers: CORS_HEADERS,
        body: JSON.stringify(renderBlockedResponse(email, toolCtx.reason)),
      };
    }
    const evidence = buildEvidencePanel(card.sources || card.resolved?.sources || []);
    const verdictToState = (v) => {
      const s = String(v || "").toLowerCase();
      if (s.includes("pursue") || s.includes("prime")) return "Prime";
      if (s.includes("team") || s.includes("sub")) return "Sub";
      if (s.includes("watch") || s.includes("monitor")) return "Watch";
      if (s.includes("no-bid") || s.includes("skip")) return "No-bid now";
      return "Watch";
    };
    const dimensions = {};
    if (card.dimensions) {
      for (const [k, v] of Object.entries(card.dimensions)) {
        dimensions[k] = { score: v.score || 0, max: v.max || 100, detail: v.detail || v.explanation || "" };
      }
    }
    envelope = buildToolEnvelope({
      tool: "pursuit",
      email,
      inputs: { keyword, agency, naics },
      toolContext: toolCtx,
      resolved: card.resolved || {},
      rawFinding: {
        topic: keyword,
        state: verdictToState(card.verdict),
        why: card.why || card.reasons || [],
        blockers: card.blockers || [],
        what_would_flip: card.what_would_flip || [],
        next_catalyst: card.next_catalyst,
      },
      dimensions,
      totalScore: card.totalScore || card.total,
      evidence,
      subQuestions: [],
      legacy: card,
    });
  }

  // Write to cache (non-blocking — subsequent requests can use it)
  writeCache(supabase, cacheKey, card).catch(() => { /* swallow */ });

  try {
    await supabase.from("ops_events").insert({
      event_type: "pursuit_score",
      details: {
        email,
        keyword,
        agency: card.resolved?.agency,
        total: card.totalScore || card.total,
        verdict: card.verdict,
        vehicles: card.resolved?.vehicles,
        partial: card.partial || false,
        submitted_at: now.toISOString(),
        month: now.toISOString().slice(0, 7),
      },
    });
  } catch (logErr) {
    console.warn("pursuit-score: ops_events log failed:", logErr.message);
  }

  const responseBody = {
    ...card,
    remaining: Math.max(cap - used - 1, 0),
    cached: false,
    pricing: {
      cap,
      overage_per_score: MMT_PRICING.pursuit_score.premium_overage_per_score,
      standalone_per_score: MMT_PRICING.pursuit_score.standalone_per_score,
    },
  };
  if (envelope) responseBody.envelope = envelope;

  return {
    statusCode: 200,
    headers: { ...CORS_HEADERS, "X-Cache": "MISS" },
    body: JSON.stringify(responseBody),
  };
};
