// ============================================================
// vote-form-create.js — Builds the feature-vote Google Form via the Forms
// API, using the existing Google connection (oauth_tokens refresh token,
// forms.body scope). One-shot, token-gated. "Code builds the form."
//
//   curl -X POST -H "Authorization: Bearer $COMMAND_CENTER_KEY" \
//     https://missionmeetstech.com/.netlify/functions/vote-form-create
//
// Returns { formId, responderUri, editUri }. After running, set
// VOTE_FORM_ID (and optionally VOTE_FORM_URL=responderUri) in Netlify so
// the tally reads this form and the campaign links to it.
//
// Option labels use the canonical "<Letter> - <Name>" shape that
// lib/vote-tally.js leadingOptionLetter() parses. Q1=+3, Q2=+2, Q3=+1.
// ============================================================

const { getAccessToken } = require("./lib/google-read");

const OPTIONS = [
  "A - Vendor watch (which agencies buy/integrate a platform, and resellers)",
  "B - Partner and teaming signals on a contract",
  "C - Saved searches and advanced filters",
  "D - CSV export of the tracker",
  "E - Contract data API (read-only)",
  "F - Custom watchlists with email alerts",
  "G - Recompete countdowns",
  "H - Teaming-partner finder",
  "I - Recompete timeline view",
  "J - Score a draft against a tracked opportunity (ProposalPulse)",
];

function radioItem(title, required, index) {
  return {
    createItem: {
      item: {
        title,
        questionItem: {
          question: {
            required: !!required,
            choiceQuestion: { type: "RADIO", options: OPTIONS.map((value) => ({ value })) },
          },
        },
      },
      location: { index },
    },
  };
}
function textItem(title, paragraph, index) {
  return {
    createItem: {
      item: {
        title,
        questionItem: { question: { required: false, textQuestion: { paragraph: !!paragraph } } },
      },
      location: { index },
    },
  };
}

async function gfetch(url, token, body) {
  const r = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${url.split("/v1/")[1] || url} -> ${r.status}: ${JSON.stringify(json).slice(0, 300)}`);
  return json;
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "method_not_allowed" }) };
  }
  const expected = process.env.COMMAND_CENTER_KEY;
  if (!expected) return { statusCode: 503, body: JSON.stringify({ error: "COMMAND_CENTER_KEY not configured" }) };
  const token = (event.headers.authorization || event.headers.Authorization || "").replace(/^Bearer\s+/i, "");
  if (!token || token !== expected) return { statusCode: 401, body: JSON.stringify({ error: "unauthorized" }) };

  let accessToken;
  try {
    accessToken = await getAccessToken();
  } catch (e) {
    return { statusCode: 502, body: JSON.stringify({ error: `google auth failed (re-consent with forms.body scope?): ${e.message}` }) };
  }

  try {
    // 1. Create the form (API only accepts info at creation).
    const form = await gfetch("https://forms.googleapis.com/v1/forms", accessToken, {
      info: {
        title: "Mission Meets Tech — What should we build next?",
        documentTitle: "MMT Feature Vote",
      },
    });
    const formId = form.formId;

    // 2. Add the questions via batchUpdate.
    await gfetch(`https://forms.googleapis.com/v1/forms/${formId}:batchUpdate`, accessToken, {
      requests: [
        radioItem("Your #1 pick — what should we build first?", true, 0),
        radioItem("Your #2 pick", true, 1),
        radioItem("Your #3 pick (optional)", false, 2),
        textItem("Which platform should we track for you? (e.g. Databricks, Salesforce, ServiceNow, Palantir, Snowflake)", false, 3),
        textItem("Anything we missed? Tell us what to build.", true, 4),
      ],
    });

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ok: true,
        formId,
        responderUri: form.responderUri,
        editUri: `https://docs.google.com/forms/d/${formId}/edit`,
        next: "Set VOTE_FORM_ID=formId (and optionally VOTE_FORM_URL=responderUri) in Netlify env.",
      }),
    };
  } catch (e) {
    return { statusCode: 502, body: JSON.stringify({ error: e.message }) };
  }
};
