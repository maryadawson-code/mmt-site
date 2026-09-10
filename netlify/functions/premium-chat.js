// ============================================================
// premium-chat.js — Ask MMT, the AI research assistant
//
// POST body (ask):    { question, token?, email?, history? }
// POST body (unlock): { action: "unlock", turn_id, email }
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
// details.ip_hash). Both inserts check the returned { error }.
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
const ERROR_EVENT = "premium_chat_error";
const SOURCE_FN = "premium-chat";
const BUTTONDOWN_TAG = "source=askmmt";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "https://missionmeetstech.com",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function reply(statusCode, body) {
  return { statusCode, headers: CORS_HEADERS, body: JSON.stringify(body) };
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
async function handleUnlock({ supabase, body, ipHash, now }) {
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
        const sent = await sendEmail({ to: email, from: campaign.FROM, subject: mail.subject, html: mail.html, tags: [{ name: "campaign", value: "ask-mmt-welcome-1" }] });
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
// Ask
// --------------------------------------------------------------
// Dependencies are injectable so the handler's access decisions can be
// tested end to end with a scripted Supabase double and no network.
const DEFAULT_DEPS = {
  createClient,
  answerQuestion,
  loadEntitlement,
  verifyToken: verifySubscriberToken,
  now: () => new Date(),
};

function makeHandler(overrides = {}) {
  const deps = { ...DEFAULT_DEPS, ...overrides };
  return async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: CORS_HEADERS, body: "" };
  if (event.httpMethod !== "POST") return reply(405, { error: "Method not allowed" });

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

  if (body.action === "unlock") return handleUnlock({ supabase, body, ipHash, now });

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
      details: { email, mode, question, error: result.error || "empty_answer", submitted_at: now.toISOString() },
    });
    return reply(502, { error: "Could not generate an answer right now. Try again in a moment or email mary@missionmeetstech.com." });
  }

  const sources = Array.isArray(result.sources) ? result.sources : [];
  const unavailable = Array.isArray(result.unavailable) ? result.unavailable : [];
  const remaining = Math.max(cap - used - 1, 0);

  if (mode === "member") {
    await insertEvent(supabase, {
      event_type: MEMBER_TURN_EVENT,
      user_email: email,
      details: {
        email, tier, question, answer: result.answer, agency: result.agency, has_data: result.hasData,
        model: result.model, source_ids: sources.map((s) => s.id), unavailable: unavailable.map((u) => u.id),
        search_phrase: result.searchPhrase, history_turns: history.length,
        submitted_at: now.toISOString(), month,
      },
    });
    return reply(200, { answer: result.answer, agency: result.agency, agencyName: result.agencyName || null, hasData: result.hasData, model: result.model, sources, unavailable, remaining, cap, mode, tier });
  }

  const turnId = access.newTurnId();
  const turnRowId = await insertEvent(supabase, {
    event_type: FREE_TURN_EVENT,
    user_email: email,
    details: {
      turn_id: turnId, email, ip_hash: ipHash, question, answer: result.answer, agency: result.agency,
      has_data: result.hasData, model: result.model, sources, unavailable: unavailable.map((u) => u.id),
      search_phrase: result.searchPhrase, history_turns: history.length,
      submitted_at: now.toISOString(), month, hint,
    },
  });

  if (mode === "free") {
    return reply(200, { answer: result.answer, agency: result.agency, agencyName: result.agencyName || null, hasData: result.hasData, model: result.model, sources, unavailable, remaining, cap, mode, hint });
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
    remaining,
    cap,
    mode,
    hint,
  });
};
}

exports.handler = makeHandler();
exports.makeHandler = makeHandler;
exports.FREE_TURN_EVENT = FREE_TURN_EVENT;
exports.MEMBER_TURN_EVENT = MEMBER_TURN_EVENT;
