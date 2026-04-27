# RFP Shredder Spec

**Status:** private beta on MissionPulse. Public access on missionmeetstech.com is a marketing landing page only.

## Product purpose

Paste a federal solicitation. Get a Shipley-grade dissection. Specifically:

- **Section L/M traceability** — every Section L instruction mapped to the Section M evaluation factor it serves; flag missing mappings.
- **Requirements matrix** — every "shall," "will," "must" extracted, deduped, tagged by category (technical / management / past performance / pricing).
- **Evaluator stress test** — section-by-section read from the SSEB perspective; flags ambiguous language and missing discriminators.
- **Compliance gap report** — cross-references CHPL, FedRAMP, CMMC, SCA wage floors, Section 508. Same engine as Compliance Check.

## Public route

- `/rfp-shredder` — marketing landing page on mmt-site. Honest "private beta" status. Pilot signup CTA to `mailto:mary@`. **No live tool runs on this domain.**
- `/rfp-shreadder` (typo) — 301 → `/rfp-shredder`.
- `/solicitation-shredder` (alternate name) — 301 → `/rfp-shredder`.

## Premium / member route

Not yet wired. Planned: `/premium/rfp-shredder.html` gated through the canonical entitlement helper (premium / founding / institutional / admin), with a freemium quota for non-paid users. The actual analysis runs on the MissionPulse backend; mmt-site is a thin client.

## MissionPulse route / API (planned)

- Cross-repo: `~/Projects/missionpulse`. Branch with active pilot work: `det-sprint/1-103-determinism-rule`.
- Planned endpoint: `POST https://api.missionpulse.ai/v1/rfp-shredder/analyze`
- Auth: bearer JWT signed by mmt-site with subscriber email + tier claims.
- Request: `{ document_text, document_type, jurisdiction, agency }`.
- Response: `{ run_id, sections, requirements_matrix, lm_traceability, evaluator_stress, compliance_gaps, summary }`.

## Entitlement model

- **Private beta (today):** named pilot list maintained by Mary. Email `mary@missionmeetstech.com` to opt in. Not gated through mmt-site.
- **Future free / freemium:** 1 free dissection per email; subsequent runs pay-as-you-go.
- **Future Premium:** included in $199–$249/yr Premium tier with a per-month cap (TBD; provisionally 5/mo).
- **Future Institutional:** 25/mo.
- **Future Admin:** unlimited.

The mmt-site canonical entitlement helper at `netlify/functions/lib/entitlement.js` is the authority. When the public path wires up, the new function (e.g. `netlify/functions/rfp-shredder.js`) will call `loadEntitlement(supabase, email)` and forward the tier claim to MissionPulse.

## Freemium limits

- Free: 1 dissection / email / lifetime, capped at 50 KB document size.
- Premium: 5 / month, 200 KB.
- Institutional: 25 / month, 500 KB.

These numbers are placeholders pending pilot data. Real caps land in `netlify/functions/lib/mmt-pricing.js` once the public endpoint ships.

## Stripe dependencies

None today. When the freemium overage path lands, it will reuse the same `STRIPE_*` env vars Compliance Check uses, with a new price ID for per-dissection overage. **No live Stripe products / prices may be created without Mary's explicit approval.**

## Cross-repo handoff contract

See [`docs/rfp-shredder-cross-repo-handoff.md`](rfp-shredder-cross-repo-handoff.md).

## Smoke tests

- `/rfp-shredder` returns 200.
- `/rfp-shreadder` 301-redirects to `/rfp-shredder`.
- Title signature `RFP Shredder` enforced by `validate-routes.js`.
- Page shows "private beta" status and a pilot-signup mailto.
- The page does NOT claim live functionality.

## Blockers (today)

- MissionPulse `POST /v1/rfp-shredder/analyze` endpoint is not yet a stable public API.
- Cross-repo auth/JWT signing path is not implemented.
- mmt-site `netlify/functions/rfp-shredder.js` does not exist.
- No Stripe price IDs for RFP Shredder overage.
- No tier/quota numbers ratified by Mary.

## Done definition for the public launch

1. MissionPulse exposes `POST /v1/rfp-shredder/analyze` with versioned response shape.
2. `netlify/functions/rfp-shredder.js` exists, gates entitlement, forwards JWT to MissionPulse.
3. `/premium/rfp-shredder.html` member tool page exists with full UX.
4. Tools hub adds RFP Shredder to the Premium section (replacing the marketing card).
5. Entitlement matrix tests cover RFP Shredder.
6. Pricing + freemium caps in `lib/mmt-pricing.js`.
7. Smoke checklist updated.
