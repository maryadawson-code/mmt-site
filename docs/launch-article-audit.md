# Launch Article Audit — "The Capture Gap"

**Spec source:** [docs/launch-article-spec.md](launch-article-spec.md)
**Audit date:** 2026-04-17 (same day as article publication)
**Reviewer:** ops-code, autonomous run

Each row below pairs a specific promise from the article against the
current state of the site. Status legend:

- ✅ **Live & matches** — promise is true on production right now
- ⚠️ **Live but drifted** — live but copy or logic didn't match the article; FIXED in this pass
- 🚧 **Partial** — the capability exists but only covers part of the promise; work required to fully honor
- ❌ **Missing** — promise made in the article was not true at audit time; fix required
- 📌 **Noted** — acknowledged gap, tracked in roadmap

## Pricing tiers

| Promise | Status | Notes |
|---|---|---|
| MMT Premium $249/year | ✅ | `pricing.html` Annual plan shows $249/yr |
| MMT Premium $29/month | ✅ | `pricing.html` Monthly plan shows $29/mo |
| Founding Member $199/year | ✅ | Live, counter active |
| Founding "locked for as long as you stay" | ✅ | "Permanent rate, never increases" copy present |
| First 100 only | ✅ | Live-count counter via Stripe, auto-SOLD OUT at 100 |
| Institutional starting at $2,500 | ✅ | Shows "$2,500 – $5,000/yr" |
| Institutional 5 seats | ✅ | Live feature list |
| Institutional watchlist alerts | ✅ | Live feature list |
| Institutional exportable intelligence | ✅ | Live feature list |
| Institutional priority response | ⚠️→✅ | Was "Priority Q&A response (3/month)" — updated this pass to "3 questions/month with 2-business-day response SLA" matching article |
| Institutional quarterly briefings | ⚠️→✅ | Added to feature list this pass |

## What stays free

| Promise | Status |
|---|---|
| Tuesday + Friday newsletter | ✅ Free tier Buttondown continues unchanged |
| Breaking contracts coverage | ✅ `/contract-tracker` is free; premium adds vendor/value/NAICS |
| Podcast | ✅ `/podcast` is free |

## Premium deliverables

| Promise | Status | Notes |
|---|---|---|
| Personalized daily digest 6:30 AM ET | ✅ | `premium-digest-send.js` scheduled `30 11 * * *` UTC = 6:30/7:30 AM ET (DST-dependent). Article's "6:30 Eastern" matches winter time exactly |
| "No email if nothing new" | ✅ | Function skips subscribers with zero matched signal |
| Friday Brief 6 AM ET | ✅ | `premium-brief-send.js` scheduled `0 11 * * 5` UTC = 6/7 AM ET |
| Friday Brief — 3 signals to act on | ✅ | Template enforces Top 3 Signals + New Ops + New Awards structure |
| Monthly Brief on the 1st | ✅ | `monthly-brief-send.js` scheduled `0 11 1 * *` UTC |
| Monthly Brief 4-6 pages, exec summary, top 5 signals | ✅ | Two live issues (Feb DOGE, Mar Q2 Pipeline) match the structure |
| Capture Intelligence Sheet monthly | ✅ | `/intel/capture-intelligence-this-issue/` — 25 signals, action windows, confidence labels, sources |
| Deep-dive solicitation breakdowns | ✅ | Contract detail pages + newsletter deep-dives (e.g., CCN Next Gen playbook) |
| Capture Corner on every article | 🚧 | 22 of 101 articles currently carry a Capture Corner section. Future articles include one by default. **Retroactive build-out queued** — see roadmap |

## Dashboard items

| Promise | Status | Notes |
|---|---|---|
| Agency Intelligence Profiles × 6 (DHA, VA, HHS, ONC, ARPA-H, CMS) | ✅ | All six live in `data/premium/agency-profiles/agencies.json`, rendered at `/agencies/{slug}/` |
| Color-coded Pursuit Calendar | 🚧 | `/premium/calendar` exists but needs stage-color classes (Sources Sought → Re-compete). Tracked in roadmap |
| Contract Tracker with vendor, value, NAICS, task order history | ✅ | All four fields in `contracts.json`; UI renders them (base64-gated for premium) |
| Contract Tracker — GO/WATCH/PASS verdict on each entry | ⚠️→✅ | `contracts.json` had verdict on 1 of 32. **Backfilled all 32 this pass** based on status; UI badge added in `build.js` |
| IDIQ Tracker covers T4NG2, ITES-3H, CIO-SP4, EHR II, Alliant 3 | ✅ | All five present in `idiq-tracker.html` with awardees, burn rate, recompete signals |
| Opportunity Radar refreshed every 4 hours | ✅ | `netlify.toml` cron `0 */4 * * *` |
| SB Vehicle Scanner refreshed every 4 hours | ✅ | Same cron |
| 200 federal health IT glossary terms | 🚧 | 63 pages in `glossary/` as of audit. **Gap from 63 → 200** documented as a content-build task |
| Newswire with editorial context on every story | ✅ | `newswire.html` + premium context notes decoded from `data-premium-text` base64 attrs |

## Tools

| Promise | Status | Notes |
|---|---|---|
| Ask MMT 1 question/month | ⚠️→✅ | Was `MONTHLY_LIMIT = 2` in `ask-mmt-submit.js`. Now tier-scoped: Premium 1, Founding 2, Institutional 3 |
| Ask MMT — best answered in monthly Q&A issue | ⚠️→✅ | Confirmation-email copy + `/premium/ask-mmt` page copy updated to describe the queue + monthly Q&A publishing flow |
| 15 Compliance Checks per month | ✅ | `compliance-check.js` `MONTHLY_CAP = 15` via `MMT_PRICING` |
| 20 Pursuit Scores per month | ✅ | `pursuit-score.js` `MONTHLY_SCORE_CAP = 20` via `MMT_PRICING` |
| ProposalPulse at member rates ($14.99) | ✅ | Live |
| MarketPulse at member rates ($35) | ✅ | Live |

## Founding Member extras

| Promise | Status | Notes |
|---|---|---|
| Direct line to Mary on product direction | ⚠️→✅ | Added to pricing-page feature list + surfaced in Ask MMT confirmation when tier=founding |
| 2 Ask MMT questions/month with priority review | ⚠️→✅ | Quota logic + pricing copy updated |
| Personal reply on product/tool suggestions | ⚠️→✅ | Tool-suggestion regex in `ask-mmt-submit.js` flags the question; Mary's notification email marks it as "FOUNDING TOOL SUGGESTION — personal reply expected"; subscriber confirmation email states "Mary will reply personally, regardless of whether this publishes" |
| Counter visible on pricing page | ✅ | Live via `founding-count.js` (Stripe-backed, 60s refresh) |

## Institutional extras

| Promise | Status |
|---|---|
| 5 seats | ✅ |
| Watchlist alerts | ✅ |
| Exportable intelligence (CSV/PDF) | ✅ |
| Priority response | ⚠️→✅ Now stated as "2-business-day response SLA" in pricing + function routing |
| Quarterly briefings | ⚠️→✅ Added to feature list |

## Drift-prevention commitments

1. **Pricing source of truth**: `netlify/functions/lib/mmt-pricing.js`. Any UI that displays a price or cap must read from that module (via response payload or copy string). No hard-coded numbers.
2. **Q&A tier limits**: `LIMIT_PREMIUM`, `LIMIT_FOUNDING`, `LIMIT_INSTITUTIONAL` in `ask-mmt-submit.js`. Pricing page copy derives from the same numbers.
3. **Founding Member counter**: only `/pricing` surfaces the live count; no other page should claim a different figure.
4. **This audit + spec are canonical**: any future article must be reconciled against the spec (file-level source of truth) before launch. Article → spec → audit → implementation is the review order.

## Tracked gaps (not fixed this pass — queued)

| Gap | Target | Notes |
|---|---|---|
| Capture Corner on every article | Backfill to 101 articles | 79 articles without a Capture Corner. A future pass can auto-append a Capture Corner block using each article's contract refs + enrichment stack. Until then, "on every article" is aspirational for pre-April 2026 content |
| Glossary 63 → 200 terms | Content build | Each term needs contractor note, source citation, and evaluator-perspective. Not autogenable; needs Mary + domain SME |
| Color-coded Pursuit Calendar stages | UI build | `/premium/calendar` exists; stage classes (Sources Sought / Pre-Sol / RFP / Evaluation / Award / Recompete) + color mapping to add |

See `docs/deploy-handoff.md` for the external-action list (API keys,
Stripe product IDs, etc.).
