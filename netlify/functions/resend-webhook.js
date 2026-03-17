// Resend Webhook Event Ledger
// Receives webhook POSTs from Resend, writes to Supabase resend_events table.
// Docs: https://resend.com/docs/webhooks/introduction

const { createClient } = require('@supabase/supabase-js');
const { logOpsEvent } = require('./lib/ops-ledger');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const TRACKED_EVENTS = [
  'email.sent',
  'email.delivered',
  'email.delivery_delayed',
  'email.opened',
  'email.clicked',
  'email.bounced',
  'email.complained',
];

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  try {
    const payload = JSON.parse(event.body);
    const eventType = payload.type;

    if (!TRACKED_EVENTS.includes(eventType)) {
      return { statusCode: 200, body: 'Event type not tracked' };
    }

    const svixId = event.headers['svix-id'] || null;
    const data = payload.data || {};

    const record = {
      resend_email_id: data.email_id || data.id || null,
      event_type: eventType,
      svix_id: svixId,
      recipient: Array.isArray(data.to) ? data.to.join(', ') : (data.to || null),
      sender: data.from || null,
      subject: data.subject || null,
      bounce_type: data.bounce?.type || null,
      bounce_message: data.bounce?.message || null,
      complaint_type: data.complaint?.type || null,
      click_url: data.click?.url || null,
      raw_payload: payload,
      resend_created_at: payload.created_at || null,
    };

    const { error } = await supabase
      .from('resend_events')
      .upsert(record, { onConflict: 'svix_id' });

    if (error) {
      console.error('Supabase insert error:', error);
      return { statusCode: 200, body: JSON.stringify({ error: error.message }) };
    }

    // Bounce suppression: add to suppression list on bounce
    if (eventType === 'email.bounced' && record.recipient) {
      const emails = record.recipient.split(',').map(e => e.trim()).filter(Boolean);
      for (const email of emails) {
        await supabase.from('bounce_suppression').upsert({
          email,
          reason: record.bounce_message || 'bounced',
          bounced_at: record.resend_created_at || new Date().toISOString(),
        }, { onConflict: 'email' });
      }
      await logOpsEvent(supabase, {
        event_type: 'email_bounced',
        source_function: 'resend-webhook',
        user_email: record.recipient,
        severity: 'warning',
        details: { bounce_type: record.bounce_type, bounce_message: record.bounce_message },
      });
    }

    // Log complaints as ops events
    if (eventType === 'email.complained') {
      await logOpsEvent(supabase, {
        event_type: 'email_complained',
        source_function: 'resend-webhook',
        user_email: record.recipient,
        severity: 'warning',
        details: { complaint_type: record.complaint_type },
      });
    }

    return { statusCode: 200, body: 'OK' };

  } catch (err) {
    console.error('Webhook processing error:', err);
    return { statusCode: 200, body: JSON.stringify({ error: err.message }) };
  }
};
