// ============================================================
// email-migration.js — move a member account from one email to another.
//
// ONE source of truth for "what actually has to move when a subscriber
// changes their email address." Used by BOTH:
//   - scripts/change-member-email.js   (operator CLI, dry-run by default)
//   - netlify/functions/member-email-change.js (self-serve, confirmed)
//
// Why this exists: on 2026-07-17 an account was moved by an ad-hoc
// "manual-support-fix" script that lived nowhere in the repo. It updated
// mp_users and Stripe but left mmt_preferences and customer_profiles
// pointing at the old address, and left nothing reusable behind. The next
// request (2026-08-18) started from zero again.
//
// THE DURABILITY RULE (do not regress):
// **Stripe's customer email is the upstream source of truth.**
// `stripe-subscriber-sync` (hourly) and `stripe-webhook` both derive the
// account email from `customer.email` and upsert mp_users on it. Updating
// mp_users WITHOUT updating the Stripe customer means the hourly sync
// re-creates a row under the OLD address within the hour. Any code path
// that changes a member's email MUST update Stripe in the same operation,
// or the change silently reverts.
//
// Ordering is deliberate: Stripe FIRST, then mp_users, then satellites.
// If Stripe fails we abort having changed nothing. If a later step fails
// the account is still reachable (Stripe and mp_users agree) and the
// report names the surface that needs a retry.
// ============================================================

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Satellite tables keyed by the member's email address.
// Verified against prod schema 2026-08-20. Tables NOT listed here key on
// mp_users.id (mp_scoring_history, mp_feature_usage, api_tokens) and so
// follow the account automatically — the row id never changes.
const SATELLITE_TABLES = [
  { table: "mmt_preferences", column: "email" },
  { table: "subscriber_context", column: "email" },
  { table: "customer_profiles", column: "email" },
  { table: "customer_preferences", column: "email" },
  { table: "mmt_watchlist", column: "email" },
  { table: "vote_watchlists", column: "user_email" },
  { table: "marketpulse_orders", column: "email" },
  { table: "customer_events", column: "email" },
];

function normalizeEmail(e) {
  return String(e || "").toLowerCase().trim();
}

function isValidEmail(e) {
  return EMAIL_RE.test(normalizeEmail(e));
}

/**
 * Look up a Buttondown subscriber by email.
 *
 * NOTE: the documented `?email=` LIST filter is BROKEN — it ignores the
 * filter and returns the whole list, so `results[0]` is an unrelated
 * subscriber. Always use the detail route GET /v1/subscribers/{email},
 * which 404s cleanly when the address is not on the list.
 */
async function buttondownGet(apiKey, email) {
  const res = await fetch(
    `https://api.buttondown.email/v1/subscribers/${encodeURIComponent(email)}`,
    { headers: { Authorization: `Token ${apiKey}` } }
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`buttondown lookup ${res.status}`);
  return res.json();
}

/**
 * Migrate a member account from `from` to `to`.
 *
 * @param {object}  opts
 * @param {object}  opts.supabase       Supabase service-role client (required)
 * @param {object}  [opts.stripe]       Stripe client. Omit to skip Stripe (NOT recommended — see durability rule)
 * @param {string}  [opts.buttondownKey]
 * @param {string}  opts.from
 * @param {string}  opts.to
 * @param {boolean} [opts.dryRun=false] Report what would change, write nothing
 * @param {string}  [opts.actor]        Who initiated (for the audit event)
 *
 * @returns {Promise<{ok, from, to, dryRun, steps, error}>}
 */
async function migrateMemberEmail({
  supabase,
  stripe,
  buttondownKey,
  from,
  to,
  dryRun = false,
  actor = "unknown",
}) {
  const src = normalizeEmail(from);
  const dst = normalizeEmail(to);
  const steps = [];
  const step = (surface, action, ok, detail) => {
    steps.push({ surface, action, ok, detail });
    return ok;
  };

  const fail = (error) => ({ ok: false, from: src, to: dst, dryRun, steps, error });

  if (!isValidEmail(src)) return fail("invalid_source_email");
  if (!isValidEmail(dst)) return fail("invalid_destination_email");
  if (src === dst) return fail("same_email");

  // --- Preflight -------------------------------------------------------
  const { data: srcUser, error: srcErr } = await supabase
    .from("mp_users")
    .select("id, email, subscription_tier, subscription_status, founding_member, stripe_customer_id")
    .ilike("email", src)
    .maybeSingle();
  if (srcErr) return fail(`source_lookup_failed: ${srcErr.message}`);
  if (!srcUser) return fail("source_not_found");

  const { data: dstUser, error: dstErr } = await supabase
    .from("mp_users")
    .select("id, email, subscription_tier, subscription_status")
    .ilike("email", dst)
    .maybeSingle();
  if (dstErr) return fail(`destination_lookup_failed: ${dstErr.message}`);
  if (dstUser && dstUser.id !== srcUser.id) return fail("destination_already_has_account");

  step("preflight", "verified", true,
    `${src} -> ${dst} (tier=${srcUser.subscription_tier}, status=${srcUser.subscription_status}, founding=${srcUser.founding_member})`);

  // --- 1. Stripe FIRST (the durability step) ---------------------------
  if (stripe && srcUser.stripe_customer_id) {
    if (dryRun) {
      step("stripe", "would_update", true, `customer ${srcUser.stripe_customer_id}.email -> ${dst}`);
    } else {
      try {
        await stripe.customers.update(srcUser.stripe_customer_id, { email: dst });
        step("stripe", "updated", true, `customer ${srcUser.stripe_customer_id}.email = ${dst}`);
      } catch (e) {
        // Abort: without this the hourly sync reverts everything we do next.
        step("stripe", "failed", false, e.message);
        return fail(`stripe_update_failed: ${e.message}`);
      }
    }
  } else if (stripe && !srcUser.stripe_customer_id) {
    step("stripe", "skipped", true, "no stripe_customer_id on mp_users row");
  } else {
    step("stripe", "skipped", true, "no stripe client supplied");
  }

  // --- 2. mp_users (the entitlement key) -------------------------------
  if (dryRun) {
    step("mp_users", "would_update", true, `id=${srcUser.id} email -> ${dst}`);
  } else {
    const { error } = await supabase
      .from("mp_users")
      .update({ email: dst, updated_at: new Date().toISOString() })
      .eq("id", srcUser.id);
    if (error) {
      step("mp_users", "failed", false, error.message);
      return fail(`mp_users_update_failed: ${error.message}`);
    }
    step("mp_users", "updated", true, `id=${srcUser.id}`);
  }

  // --- 3. Satellite tables ---------------------------------------------
  for (const { table, column } of SATELLITE_TABLES) {
    try {
      const { data: rows, error: readErr } = await supabase
        .from(table).select(column).ilike(column, src);
      if (readErr) { step(table, "read_failed", false, readErr.message); continue; }
      if (!rows || rows.length === 0) { step(table, "no_rows", true, "nothing to move"); continue; }

      // Never clobber a row that already lives at the destination.
      const { data: existing, error: exErr } = await supabase
        .from(table).select(column).ilike(column, dst);
      if (exErr) { step(table, "read_failed", false, exErr.message); continue; }
      if (existing && existing.length > 0) {
        step(table, "conflict_skipped", true,
          `${rows.length} row(s) left at ${src}; destination already has ${existing.length} row(s)`);
        continue;
      }

      if (dryRun) {
        step(table, "would_update", true, `${rows.length} row(s)`);
      } else {
        const { error: updErr } = await supabase
          .from(table).update({ [column]: dst }).ilike(column, src);
        if (updErr) step(table, "update_failed", false, updErr.message);
        else step(table, "updated", true, `${rows.length} row(s)`);
      }
    } catch (e) {
      step(table, "error", false, e.message);
    }
  }

  // --- 4. Invalidate old sessions --------------------------------------
  // Sessions are bound to the old address. Moving them would carry a live
  // session across an identity change; invalidating forces a fresh sign-in.
  try {
    const { data: sessions } = await supabase
      .from("customer_sessions").select("id").ilike("email", src).eq("is_valid", true);
    const n = (sessions || []).length;
    if (n === 0) {
      step("customer_sessions", "no_rows", true, "no active sessions");
    } else if (dryRun) {
      step("customer_sessions", "would_invalidate", true, `${n} session(s)`);
    } else {
      const { error } = await supabase
        .from("customer_sessions").update({ is_valid: false }).ilike("email", src).eq("is_valid", true);
      if (error) step("customer_sessions", "invalidate_failed", false, error.message);
      else step("customer_sessions", "invalidated", true, `${n} session(s)`);
    }
  } catch (e) {
    step("customer_sessions", "error", false, e.message);
  }

  // --- 5. Buttondown (newsletter list) ---------------------------------
  if (buttondownKey) {
    try {
      const srcSub = await buttondownGet(buttondownKey, src);
      const dstSub = await buttondownGet(buttondownKey, dst);
      if (!srcSub && dstSub) {
        step("buttondown", "already_there", true, `${dst} already on the list`);
      } else if (!srcSub) {
        step("buttondown", "no_subscriber", true, `${src} not on the list`);
      } else if (dstSub) {
        step("buttondown", "conflict_skipped", true, `both ${src} and ${dst} exist — merge by hand`);
      } else if (dryRun) {
        step("buttondown", "would_update", true, `subscriber ${srcSub.id} -> ${dst}`);
      } else {
        const res = await fetch(`https://api.buttondown.email/v1/subscribers/${srcSub.id}`, {
          method: "PATCH",
          headers: { Authorization: `Token ${buttondownKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ email_address: dst }),
        });
        if (!res.ok) step("buttondown", "update_failed", false, `http ${res.status} ${(await res.text()).slice(0, 160)}`);
        else step("buttondown", "updated", true, `subscriber ${srcSub.id} -> ${dst}`);
      }
    } catch (e) {
      step("buttondown", "error", false, e.message);
    }
  } else {
    step("buttondown", "skipped", true, "no BUTTONDOWN_API_KEY supplied");
  }

  // --- 6. Audit --------------------------------------------------------
  if (!dryRun) {
    const { error: logErr } = await supabase.from("ops_events").insert({
      event_type: "member_email_migrated",
      source_function: "email-migration",
      user_email: dst,
      severity: "info",
      details: { from: src, to: dst, actor, mp_user_id: srcUser.id, steps },
    });
    if (logErr) step("ops_events", "log_failed", false, logErr.message);
    else step("ops_events", "logged", true, "member_email_migrated");
  }

  const failed = steps.filter((s) => !s.ok);
  return {
    ok: failed.length === 0,
    from: src,
    to: dst,
    dryRun,
    steps,
    error: failed.length ? `${failed.length} surface(s) failed` : null,
  };
}

module.exports = {
  migrateMemberEmail,
  normalizeEmail,
  isValidEmail,
  buttondownGet,
  SATELLITE_TABLES,
};
