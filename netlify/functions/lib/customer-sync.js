// customer-sync.js — Drop-in customer profile sync
// Import into Stripe webhook, delivery functions, etc.

async function upsertCustomer(supabase, { email, name, company, stripeCustomerId, product, amountCents }) {
  try {
    const { data: existing } = await supabase
      .from("customer_profiles")
      .select("id, total_revenue_cents, proposalpulse_count, marketpulse_count")
      .eq("email", email)
      .single();

    if (existing) {
      const updates = {
        updated_at: new Date().toISOString(),
        total_revenue_cents: (existing.total_revenue_cents || 0) + (amountCents || 0),
        last_payment_at: new Date().toISOString(),
      };
      if (product === "proposalpulse") {
        updates.proposalpulse_count = (existing.proposalpulse_count || 0) + 1;
        updates.proposalpulse_last_at = new Date().toISOString();
      }
      if (product === "marketpulse") {
        updates.marketpulse_count = (existing.marketpulse_count || 0) + 1;
        updates.marketpulse_last_at = new Date().toISOString();
      }
      if (stripeCustomerId) updates.stripe_customer_id = stripeCustomerId;
      if (amountCents > 0) updates.lifecycle_stage = "active";
      await supabase.from("customer_profiles").update(updates).eq("id", existing.id);
    } else {
      await supabase.from("customer_profiles").insert({
        email,
        name,
        company,
        stripe_customer_id: stripeCustomerId,
        signup_source: product,
        total_revenue_cents: amountCents || 0,
        lifecycle_stage: amountCents > 0 ? "active" : "lead",
      });
    }
  } catch (err) {
    console.error("[customer-sync]", err.message);
  }
}

async function logCustomerEvent(supabase, { email, eventType, product, amountCents, metadata }) {
  try {
    const { data: customer } = await supabase
      .from("customer_profiles")
      .select("id")
      .eq("email", email)
      .single();
    await supabase.from("customer_events").insert({
      customer_id: customer?.id,
      email,
      event_type: eventType,
      product,
      amount_cents: amountCents || 0,
      metadata: metadata || {},
    });
  } catch (err) {
    console.error("[customer-sync]", err.message);
  }
}

module.exports = { upsertCustomer, logCustomerEvent };
