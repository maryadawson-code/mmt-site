// ============================================================
// premium-chat.js — Ask MMT, the AI research assistant
//
// POST body (ask):      { question, token?, email?, history? }
// POST body (unlock):   { action: "unlock", turn_id, email }
// POST body (feedback): { action: "feedback", turn_id, verdict, note?, token? }
//
// Three callers (see lib/ask-mmt-access.js):
//   member    — valid `mmt_subscriber_token`; email DERIVED from the token.
//               Caps: CHAT_CAPS by tier (100 Premium/Founding, 500
//               Institutional). An email in the body never buys a paid
//               allowance; before 2026-09-10 it did, and anyone who knew a
//               member's address could spend the Claude budget.
//   free      — email, no token. FREE_CAP a month per email, sources shown.
//   anonymous — nothing. Answer returned with the sources held back and an
//               `unlock_id`; posting the email to `unlock` returns them,
//               subscribes the address to Buttondown (tag source=askmmt),
//               logs ask_mmt_free_signup, and sends welcome step 1.
//
// Every answer carries `sources`: the systems that actually returned data
// for the question plus the MMT articles in the context, from the same
// catalog /ask/sources renders.
//
// Quota events: premium_chat_turn (members, counted by details.email) and
// ask_mmt_free_turn (free + anonymous, counted by details.email or
// details.ip_hash). Both inserts check the returned { error }. Both carry
// duration_ms (whole handler), tokens_used, cost_estimate (in-code price
// table) and the answer guards' counts, so cost and quality are readable
// from the table without a log dive. Every answer returns `turn_id` (the
// event row id) so the widget's thumbs can point at the exact turn.
//
// Kill switch: ASK_MMT_DISABLED=true answers 503 PAUSED before any work,
// for every action, and charges nobody.
// ============================================================

const { createClient } = require("@supabase/supabase-js");
const { answerQuestion } = require("./lib/premium-assistant");
const { loadEntitlement, logEntitlementMismatch } = require("./lib/entitlement");
const { verifySubscriberToken } = require("./lib/subscriber-token");
const access = require("./lib/ask-mmt-access");
const { addToButtondown } = require("./lib/lead-magnet");
const { sendEmail } = require("./lib/send-email");
const campaign = require("./lib/ask-mmt-campaign");

const MEMBER_TURN_EVENT = "premium_chat_turn";
const FREE_TURN_EVENT = "ask_mmt_free_turn";
const FEEDBACK_EVENT = "ask_mmt_feedback";
const ERROR_EVENT = "premium_chat_error";
const SOURCE_FN = "premium-chat";
const BUTTONDOWN_TAG = "source=askmmt";
const FEEDBACK_TO = "mary@missionmeetstech.com";
const FEEDBACK_VERDICTS = new Set(["up", "down", "wrong"]);
const FEEDBACK_NOTE_MAX = 500;

// Dollars per million tokens, matched on the model id. An unknown model
// records null rather than a guess; the table is extended, never inferred.
const PRICE_PER_MTOK = [
  { match: "haiku-4-5", input: 1, output: 5 },
  { match: "sonnet-5", input: 2, output: 10 },
  { match: "opus-5", input: 15, output: 75 },
];

/** Pure: USD for a turn from the price table, or null for an unknown model. */
function costEstimate(model, usage) {
  const id = String(model || "").toLowerCase();
  const row = PRICE_PER_MTOK.find((r) => id.includes(r.match));
  if (!row) return null;
  const inTok = Number(usage && usage.input_tokens) || 0;
  const outTok = Number(usage && usage.output_tokens) || 0;
  return Number(((inTok * row.input + outTok * row.output) / 1e6).toFixed(6));
}

/** Pure: input + output tokens, or null when the model reported no usage. */
function tokensUsed(usage) {
  if (!usage || typeof usage !== "object") return null;
  const inTok = Number(usage.input_tokens) || 0;
  const outTok = Number(usage.output_tokens) || 0;
  return inTok + outTok;
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "https://missionmeetstech.com",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function reply(statusCode, body) {
  return { statusCode, headers: CORS_HEADERS, body: JSON.stringify(body) };
}

function isPaused(env = process.env) {
  return String(env.ASK_MMT_DISABLED || "").toLowerCase() === "true";
}

async function countEvents(supabase, eventType, column, value, monthStart) {
  const { count, error } = await supabase
    .from("ops_events")
    .select("*", { count: "exact", head: true })
    .eq("event_type", eventType)
    .eq(column, value)
    .gte("created_at", monthStart);
  if (error) {
    console.warn(`premium-chat: quota count failed (${eventType}/${column}):`, error.message);
    return null;
  }
  return count || 0;
}

async function insertEvent(supabase, row) {
  const { data, error } = await supabase
    .from("ops_events")
    .insert({ source_function: SOURCE_FN, ...row })
    .select("id")
    .maybeSingle();
  if (error) {
    console.warn(`premium-chat: ops_events insert failed (${row.event_type}):`, error.message);
    return null;
  }
  return data ? data.id : null;
}

// --------------------------------------------------------------
// Unlock: attribute an anonymous turn to an email, return its sources.
// --------------------------------------------------------------
async function handleUnlock({ supabase, body, ipHash, now, deps }) {
  const email = access.normalizeEmail(body.email);
  const turnId = String(body.turn_id || "").trim();
  if (!access.isValidEmail(email)) return reply(400, { error: "A valid email is required." });
  if (!/^[a-f0-9]{24}$/.test(turnId)) return reply(400, { error: "Invalid unlock id." });

  const { data: row, error } = await supabase
    .from("ops_events")
    .select("id, details, created_at")
    .eq("event_type", FREE_TURN_EVENT)
    .eq("details->>turn_id", turnId)
    .limit(1)
    .maybeSingle();
  if (error) return reply(500, { error: "Could not look up that answer. Try again." });
  if (!row) return reply(404, { error: "That answer has expired. Ask again and the sources will show." });

  const details = row.details || {};
  if (details.email && details.email !== email) {
    return reply(409, { error: "That answer was already unlocked with a different email." });
  }

  const monthStart = access.monthStartUtc(now);
  if (!details.email) {
    const { error: upErr } = await supabase
      .from("ops_events")
      .update({ user_email: email, details: { ...details, email, unlocked_at: now.toISOString() } })
      .eq("id", row.id);
    if (upErr) {
      console.warn("premium-chat: unlock update failed:", upErr.message);
      return reply(500, { error: "Could not unlock that answer. Try again." });
    }
  }

  // First time we have seen this email: list + welcome, once.
  let newSignup = false;
  const priorSignups = await countEvents(supabase, campaign.EVENTS.SIGNUP, "details->>email", email, "1970-01-01T00:00:00.000Z");
  if (priorSignups === 0) {
    newSignup = true;
    const bd = await addToButtondown({ email, tags: [BUTTONDOWN_TAG], notes: "Ask MMT free tier signup" });
    if (!bd.ok) console.warn("premium-chat: buttondown add failed:", bd.error, bd.body);
    await insertEvent(supabase, {
      event_type: campaign.EVENTS.SIGNUP,
      user_email: email,
      details: { email, ip_hash: ipHash, turn_id: turnId, buttondown_ok: bd.ok, buttondown_status: bd.status, signed_up_at: now.toISOString() },
    });
    // Welcome step 1, immediately. The daily cron backfills it if this fails.
    try {
      const mail = campaign.renderEmail("welcome-1");
      if (mail.enabled) {
        const sent = await deps.sendEmail({ to: email, from: campaign.FROM, subject: mail.subject, html: mail.html, tags: [{ name: "campaign", value: "ask-mmt-welcome-1" }] });
        if (sent && sent.success) {
          await insertEvent(supabase, { event_type: campaign.EVENTS.WELCOME_SENT, user_email: email, details: { email, step: 1, key: "welcome-1", sent_at: now.toISOString() } });
        } else {
          console.warn("premium-chat: welcome-1 send failed:", sent && sent.error);
        }
      }
    } catch (e) {
      console.warn("premium-chat: welcome-1 render/send threw:", e.message);
    }
  }

  const used = await countEvents(supabase, FREE_TURN_EVENT, "details->>email", email, monthStart);
  const remaining = used === null ? null : Math.max(access.FREE_CAP - used, 0);
  return reply(200, {
    sources: Array.isArray(details.sources) ? details.sources : [],
    remaining,
    cap: access.FREE_CAP,
    new_signup: newSignup,
    mode: "free",
  });
}

// --------------------------------------------------------------
// Feedback: thumbs on a turn. "wrong" also emails Mary the turn, once.
// --------------------------------------------------------------
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function feedbackEmailHtml({ turnId, verdict, note, email, turn }) {
  const d = (turn && turn.details) || {};
  const sourceLines = Array.isArray(d.sources) && d.sources.length
    ? d.sources.map((s) => `<li>${esc(s.name || s.id)}${s.title ? `: ${esc(s.title)}` : ""}${s.url ? ` <a href="${esc(s.url)}">${esc(s.url)}</a>` : ""}</li>`).join("")
    : (Array.isArray(d.source_ids) ? d.source_ids : []).map((id) => `<li>${esc(id)}</li>`).join("");
  const unavailable = Array.isArray(d.unavailable) ? d.unavailable : [];
  const answerHtml = esc(d.answer || "(answer not on the turn row)").replace(/\n/g, "<br>");
  return `<div style="font-family:Inter,Arial,sans-serif;color:#0A192F;line-height:1.5;max-width:720px">
<h2 style="margin:0 0 8px">Ask MMT: a subscriber marked an answer wrong</h2>
<p style="margin:0 0 16px;color:#457B9D">Turn ${esc(turnId)} · verdict ${esc(verdict)} · ${esc(email || "anonymous")}${turn && turn.event_type ? ` · ${esc(turn.event_type)}` : ""}${d.model ? ` · ${esc(d.model)}` : ""}</p>
${note ? `<p><strong>Their note:</strong> ${esc(note)}</p>` : ""}
<p><strong>Question</strong><br>${esc(d.question || "(question not on the turn row)")}</p>
<p><strong>Answer</strong><br>${answerHtml}</p>
<p><strong>Sources shown</strong></p><ul>${sourceLines || "<li>(none recorded)</li>"}</ul>
<p><strong>Not reached this turn</strong></p><ul>${unavailable.length ? unavailable.map((u) => `<li>${esc(typeof u === "string" ? u : u.id || JSON.stringify(u))}</li>`).join("") : "<li>(none)</li>"}</ul>
<p style="color:#457B9D;font-size:13px">Sent once per turn. The full row is in ops_events (event_type ${esc(turn && turn.event_type || "premium_chat_turn / ask_mmt_free_turn")}).</p>
</div>`;
}

// A turn id is the ops_events row id the ask path returned: a UUID. Anything
// else is refused before Supabase is asked (a non-UUID filter on the uuid
// column is a PostgREST 22P02, not a miss).
const TURN_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function handleFeedback({ supabase, body, ipHash, now, deps }) {
  const turnId = String(body.turn_id || "").trim();
  const verdict = String(body.verdict || "").trim().toLowerCase();
  if (!TURN_ID_RE.test(turnId)) return reply(400, { error: "Invalid turn id." });
  if (!FEEDBACK_VERDICTS.has(verdict)) return reply(400, { error: "verdict must be up, down or wrong." });
  const note = body.note == null ? "" : String(body.note).trim().slice(0, FEEDBACK_NOTE_MAX);

  // The email, when a real token rides along; never from the body.
  const caller = access.resolveCaller({ token: body.token, email: undefined, verifyToken: deps.verifyToken });
  const email = caller.mode === "member" ? caller.email : null;

  // The turn must exist. Feedback is unauthenticated, so the turn row is the
  // only proof the caller was ever answered: ids are issued after the ask
  // caps ran and cannot be guessed. Nothing is written and nothing is
  // emailed for an id that names no turn.
  const { data: turn, error: turnErr } = await supabase
    .from("ops_events")
    .select("id, event_type, details, created_at")
    .eq("id", turnId)
    .in("event_type", [MEMBER_TURN_EVENT, FREE_TURN_EVENT])
    .limit(1)
    .maybeSingle();
  if (turnErr) {
    console.warn("premium-chat: feedback turn lookup failed:", turnErr.message);
    return reply(500, { error: "Could not record that. Try again in a moment." });
  }
  if (!turn) return reply(404, { error: "Unknown turn." });

  // One email per turn: look for an earlier "wrong" BEFORE writing ours.
  let priorWrong = 0;
  if (verdict === "wrong") {
    const { count, error } = await supabase
      .from("ops_events")
      .select("*", { count: "exact", head: true })
      .eq("event_type", FEEDBACK_EVENT)
      .eq("details->>turn_id", turnId)
      .eq("details->>verdict", "wrong");
    if (error) {
      console.warn("premium-chat: feedback prior lookup failed:", error.message);
      priorWrong = 1; // unknown state: do not risk a duplicate email
    } else {
      priorWrong = count || 0;
    }
  }

  const feedbackId = await insertEvent(supabase, {
    event_type: FEEDBACK_EVENT,
    user_email: email,
    severity: verdict === "wrong" ? "warning" : "info",
    details: { turn_id: turnId, verdict, note, user_email: email, ip_hash: ipHash, submitted_at: now.toISOString() },
  });
  if (!feedbackId) return reply(500, { error: "Could not record that. Try again in a moment." });

  let emailed = false;
  if (verdict === "wrong" && priorWrong === 0) {
    const sent = await deps.sendEmail({
      to: FEEDBACK_TO,
      from: campaign.FROM,
      subject: `Ask MMT marked wrong: ${String((turn && turn.details && turn.details.question) || turnId).slice(0, 80)}`,
      html: feedbackEmailHtml({ turnId, verdict, note, email, turn: turn || null }),
      tags: [{ name: "campaign", value: "ask-mmt-feedback" }],
    });
    emailed = !!(sent && sent.success);
    if (!emailed) console.warn("premium-chat: feedback email failed:", sent && sent.error);
  }
  return reply(200, { ok: true, emailed });
}

// --------------------------------------------------------------
// Ask
// --------------------------------------------------------------
// Dependencies are injectable so the handler's access decisions can be
// tested end to end with a scripted Supabase double and no network.
const DEFAULT_DEPS = {
  createClient,
  answerQuestion,
  loadEntitlement,
  verifyToken: verifySubscriberToken,
  sendEmail,
  now: () => new Date(),
};

const { connectEvent: connectBlobs } = require("./lib/fetch-cache");

/** The telemetry columns and details shared by both turn events. */
function turnTelemetry(result, startedAt) {
  const timings = result.timings || {};
  return {
    columns: {
      duration_ms: Math.max(Date.now() - startedAt, 1),
      tokens_used: tokensUsed(result.usage),
      cost_estimate: costEstimate(result.model, result.usage),
    },
    details: {
      model: result.model,
      enrichment_ms: timings.enrichment_ms == null ? null : timings.enrichment_ms,
      model_ms: timings.model_ms == null ? null : timings.model_ms,
      carried: !!result.carried,
      unlisted_link_count: Number(result.unlisted_link_count) || 0,
      unsupported_dollar_count: Number(result.unsupported_dollar_count) || 0,
      voice_fixes: Number(result.voice_fixes) || 0,
      voice_skipped_titles: Number(result.voice_skipped_titles) || 0,
    },
  };
}

function makeHandler(overrides = {}) {
  const deps = { ...DEFAULT_DEPS, ...overrides };
  return async (event) => {
    const startedAt = Date.now();
    connectBlobs(event); // Netlify Blobs context rides on the event in Lambda-compatible functions
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: CORS_HEADERS, body: "" };
  if (event.httpMethod !== "POST") return reply(405, { error: "Method not allowed" });
  if (isPaused()) return reply(503, { error: "Ask MMT is paused for maintenance. Your allowance is not charged.", reason_code: "PAUSED" });

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return reply(500, { error: "Service not configured" });

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return reply(400, { error: "Invalid JSON" });
  }
  if (!body || typeof body !== "object") return reply(400, { error: "Invalid JSON" });

  const supabase = deps.createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const now = deps.now();
  const ip = (event.headers && (event.headers["x-nf-client-connection-ip"] || event.headers["client-ip"] || "")) || "";
  const ipHash = access.hashIp(ip, SUPABASE_SERVICE_KEY.slice(0, 16));

  if (body.action === "unlock") return handleUnlock({ supabase, body, ipHash, now, deps });
  if (body.action === "feedback") return handleFeedback({ supabase, body, ipHash, now, deps });

  const question = String(body.question || "").trim();
  if (!question) return reply(400, { error: "question is required" });
  if (question.length > 1000) return reply(400, { error: "question exceeds 1000 characters" });
  if (question.length < 3) return reply(400, { error: "question too short" });

  const caller = access.resolveCaller({ token: body.token, email: body.email, verifyToken: deps.verifyToken });
  const monthStart = access.monthStartUtc(now);
  const month = now.toISOString().slice(0, 7);

  let mode = caller.mode;
  let email = caller.email;
  let hint = caller.hint;
  let tier = null;
  let cap = 0;
  let used = 0;

  if (mode === "member") {
    const entitlement = await deps.loadEntitlement(supabase, email);
    if (entitlement.ok) {
      tier = entitlement.tier;
      cap = access.capFor(tier);
      const n = await countEvents(supabase, MEMBER_TURN_EVENT, "details->>email", email, monthStart);
      if (n === null) return reply(500, { error: "Could not check your monthly allowance. Try again in a moment." });
      used = n;
      if (used >= cap) {
        return reply(429, {
          error: `You've used your ${cap} Ask MMT questions this month. They reset on the 1st.`,
          reason_code: "MEMBER_LIMIT",
          remaining: 0,
          cap,
          mode,
          tier,
        });
      }
    } else {
      // Token was real but the subscription is not active any more. Fall
      // through to the free rules on the token's email and say why.
      try { await logEntitlementMismatch(supabase, { email, tool: "premium_chat", entitlement, expected: "premium|founding|institutional|admin" }); } catch { /* logged best-effort */ }
      mode = "free";
      hint = `member_${entitlement.reason || "inactive"}`;
    }
  }

  if (mode !== "member") {
    if (!access.freeTierEnabled({ today: access.todayET(now) })) {
      return reply(403, {
        error: `Ask MMT opens to everyone on ${access.FREE_LAUNCH_DATE}. Premium members can sign in and use it now.`,
        reason_code: "FREE_TIER_CLOSED",
        opens: access.FREE_LAUNCH_DATE,
        hint,
        mode,
      });
    }
    cap = access.FREE_CAP;
    if (mode === "free") {
      const n = await countEvents(supabase, FREE_TURN_EVENT, "details->>email", email, monthStart);
      if (n === null) return reply(500, { error: "Could not check your free questions. Try again in a moment." });
      used = n;
      if (used >= cap) {
        return reply(429, {
          error: `You've used your ${cap} free questions this month. They reset on the 1st.`,
          reason_code: "FREE_LIMIT",
          remaining: 0,
          cap,
          mode,
          hint,
        });
      }
    } else {
      if (!ipHash) return reply(403, { error: "Enter your email to ask.", reason_code: "EMAIL_REQUIRED", mode, cap });
      const { count, error } = await supabase
        .from("ops_events")
        .select("*", { count: "exact", head: true })
        .eq("event_type", FREE_TURN_EVENT)
        .eq("details->>ip_hash", ipHash)
        .is("details->>email", null)
        .gte("created_at", monthStart);
      if (error) return reply(500, { error: "Could not check your free questions. Try again in a moment." });
      used = count || 0;
      if (used >= cap) {
        return reply(403, {
          error: "Enter your email to keep asking. Three questions a month, free.",
          reason_code: "EMAIL_REQUIRED",
          remaining: 0,
          cap,
          mode,
          hint,
        });
      }
    }
  }

  const history = access.sanitizeHistory(body.history);
  const result = await deps.answerQuestion({ question, history, maxTokens: 1500 });

  if (result.error || !result.answer) {
    await insertEvent(supabase, {
      event_type: ERROR_EVENT,
      user_email: email,
      severity: "error",
      duration_ms: Math.max(Date.now() - startedAt, 1),
      details: { email, mode, question, error: result.error || "empty_answer", submitted_at: now.toISOString() },
    });
    return reply(502, { error: "Could not generate an answer right now. Try again in a moment or email mary@missionmeetstech.com." });
  }

  const sources = Array.isArray(result.sources) ? result.sources : [];
  const unavailable = Array.isArray(result.unavailable) ? result.unavailable : [];
  const remaining = Math.max(cap - used - 1, 0);
  const telemetry = turnTelemetry(result, startedAt);

  if (mode === "member") {
    const turnRowId = await insertEvent(supabase, {
      event_type: MEMBER_TURN_EVENT,
      user_email: email,
      ...telemetry.columns,
      details: {
        email, tier, question, answer: result.answer, agency: result.agency, has_data: result.hasData,
        ...telemetry.details,
        source_ids: sources.map((s) => s.id), unavailable: unavailable.map((u) => u.id), shapes: result.shapes || [], routed: result.routed || [],
        search_phrase: result.searchPhrase, history_turns: history.length,
        submitted_at: now.toISOString(), month,
      },
    });
    return reply(200, { answer: result.answer, agency: result.agency, agencyName: result.agencyName || null, hasData: result.hasData, model: result.model, sources, unavailable, remaining, cap, mode, tier, turn_id: turnRowId });
  }

  const turnId = access.newTurnId();
  const turnRowId = await insertEvent(supabase, {
    event_type: FREE_TURN_EVENT,
    user_email: email,
    ...telemetry.columns,
    details: {
      turn_id: turnId, email, ip_hash: ipHash, question, answer: result.answer, agency: result.agency,
      has_data: result.hasData, ...telemetry.details, sources, unavailable: unavailable.map((u) => u.id), shapes: result.shapes || [], routed: result.routed || [],
      search_phrase: result.searchPhrase, history_turns: history.length,
      submitted_at: now.toISOString(), month, hint,
    },
  });

  if (mode === "free") {
    return reply(200, { answer: result.answer, agency: result.agency, agencyName: result.agencyName || null, hasData: result.hasData, model: result.model, sources, unavailable, remaining, cap, mode, hint, turn_id: turnRowId });
  }
  // Anonymous: the gate. Sources are held until an email unlocks them.
  return reply(200, {
    answer: result.answer,
    agency: result.agency,
    agencyName: result.agencyName || null,
    hasData: result.hasData,
    model: result.model,
    sources: [],
    sources_count: sources.length,
    unavailable,
    gated: true,
    unlock_id: turnRowId ? turnId : null,
    turn_id: turnRowId,
    remaining,
    cap,
    mode,
    hint,
  });
};
}

exports.handler = makeHandler();
exports.makeHandler = makeHandler;
exports.costEstimate = costEstimate;
exports.tokensUsed = tokensUsed;
exports.FREE_TURN_EVENT = FREE_TURN_EVENT;
exports.MEMBER_TURN_EVENT = MEMBER_TURN_EVENT;
exports.FEEDBACK_EVENT = FEEDBACK_EVENT;
exports.PRICE_PER_MTOK = PRICE_PER_MTOK;
