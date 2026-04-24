-- Comp (tester) access grants — manual premium access without a Stripe sub.
--
-- Two pieces:
--
-- 1. `comp_access_grants` audit table — one row per grant + revoke lifecycle.
--    Immutable append-only; revocations are recorded by setting revoked_at
--    (never by deleting rows).
--
-- 2. mp_users gets grant-metadata columns so the gate checks
--    (e.g. "is this access currently valid?") can read from a single row.
--    mp_users.expires_at is the authoritative check point for scheduled
--    revocation (Mary's GCal reminder + future automation).
--
-- quota overrides (mp_quota_override, pp_quota_override) let the comp
-- grant optionally unblock product limits; NULL = "use default policy".

CREATE TABLE IF NOT EXISTS public.comp_access_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  name text,
  granted_by text,
  grant_reason text,
  granted_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS comp_access_grants_email_idx
  ON public.comp_access_grants (email);

CREATE INDEX IF NOT EXISTS comp_access_grants_expires_idx
  ON public.comp_access_grants (expires_at)
  WHERE revoked_at IS NULL;

ALTER TABLE public.mp_users
  ADD COLUMN IF NOT EXISTS granted_by text,
  ADD COLUMN IF NOT EXISTS grant_reason text,
  ADD COLUMN IF NOT EXISTS granted_at timestamptz,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS mp_quota_override int,
  ADD COLUMN IF NOT EXISTS pp_quota_override int;

COMMENT ON COLUMN public.mp_users.granted_by IS
  'Admin email that granted premium access without a Stripe sub. NULL for normal Stripe paths.';

COMMENT ON COLUMN public.mp_users.grant_reason IS
  'Reason code for comp grants: tester_comp | partner_comp | refund_comp | gift.';

COMMENT ON COLUMN public.mp_users.expires_at IS
  'Scheduled revocation. Daily audit job should flip subscription_tier to free after this timestamp.';

COMMENT ON COLUMN public.mp_users.mp_quota_override IS
  'MarketPulse quota override. NULL = default policy; 0 = blocked; positive int = explicit cap; any value the app code treats as "unlimited" per product policy.';

COMMENT ON COLUMN public.mp_users.pp_quota_override IS
  'ProposalPulse quota override. Semantics mirror mp_quota_override.';

COMMENT ON TABLE public.comp_access_grants IS
  'Append-only audit trail for manual premium-access grants. One row per grant; revocations set revoked_at on the existing row rather than inserting a new one.';
