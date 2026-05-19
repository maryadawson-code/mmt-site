// stripe-deepdive.js — pure helpers for the Custom Deep Dive webhook.

function extractCustomFields(session) {
  const fields = (session.custom_fields || []).reduce((acc, f) => {
    if (!f || !f.key) return acc;
    acc[f.key] = (f.text && f.text.value) || (f.dropdown && f.dropdown.value) || (f.numeric && f.numeric.value) || null;
    return acc;
  }, {});
  return {
    deep_dive_topic: fields.deep_dive_topic || null,
    target_agency: fields.target_agency || null,
    delivery_email: fields.delivery_email || null,
  };
}

function formatOrder(session) {
  const custom = extractCustomFields(session);
  const cd = session.customer_details || {};
  return {
    session_id: session.id,
    customer_name: cd.name || "",
    customer_email: cd.email || "",
    amount_dollars: ((session.amount_total || 0) / 100).toFixed(2),
    deep_dive_topic: custom.deep_dive_topic,
    target_agency: custom.target_agency,
    delivery_email: custom.delivery_email,
  };
}

function firstName(fullName) {
  if (!fullName) return "there";
  const first = String(fullName).trim().split(/\s+/)[0];
  return first || "there";
}

module.exports = { extractCustomFields, formatOrder, firstName };
