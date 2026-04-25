# FY2027 Lead Magnet — Part F handoff

Generated: 2026-04-25T16:30Z
PRETASK_SHA: `139038c`
Final commits: `58b1f86`, `d07cf93`, `a78e94e` (3 commits per spec)

## What shipped

| SHA | Change |
|---|---|
| `58b1f86` | feat(lead-magnet): generate FY2027 Forecast PDF |
| `d07cf93` | feat(lead-magnet): hybrid Resend+Buttondown FY2027 funnel, drop Turnstile |
| `a78e94e` | chore(lead-magnet): backfill script + email architecture doc |

The `/fy2027-forecast` form previously POSTed directly to `buttondown.com/api/emails/embed-subscribe` — that worked for adding to the newsletter list but **never delivered the promised PDF**. 20 people submitted between 2026-03-01 and 2026-04-24 and got nothing. After this push:

1. The form posts to MMT's own Netlify function `/.netlify/functions/lead-magnet-fy2027`.
2. The function emails the PDF via Resend AND adds the subscriber to Buttondown with the `fy2027-forecast` tag.
3. A backfill script (`scripts/backfill-fy2027-pdf.js`) is ready for Mary to run from her laptop to deliver to the 20 past submitters.
4. The email architecture is documented at `docs/email-architecture.md` so this class of bug doesn't recur.

## Final gates

| Gate | Result |
|---|---|
| `test -f static/lead-magnets/fy2027-forecast.pdf` | **EXISTS** (27,112 bytes, 11 pages, PDF v1.3) |
| `grep withOpsLogging netlify/functions/lead-magnet-fy2027.js` | **3** (≥1 expected) |
| `grep buttondown.email\|RESEND_API_KEY netlify/functions/lead-magnet-fy2027.js` | **3** (≥2 expected) |
| `grep turnstile fy2027-forecast.html` | **0** (0 expected — none was actually present in the original either; the spec was conservative) |
| `test -f docs/email-architecture.md` | **EXISTS** |
| `test -f scripts/backfill-fy2027-pdf.js` | **EXISTS** |
| `npm test` | **17 files / 166 tests passing** (no Part F tests added per spec; existing suite preserved) |
| `npm run build` | **green** (Content Freshness Audit passes) |
| Backfill `--dry-run` | **20 recipients enumerated correctly** |

## Mary's manual steps

| Step | Where | What |
|---|---|---|
| 1 | Netlify env vars | Confirm `RESEND_API_KEY` is set (production). Already in use by other functions — should already be set. `netlify env:get RESEND_API_KEY --plain` |
| 2 | Netlify env vars | Confirm `BUTTONDOWN_API_KEY` is set. Used by `signal-chain-subscribe` and `newsletter-sync` already, so it should already be in prod. If not set, the backfill PDF still ships via Resend; only the Buttondown subscribe step fails per row (logged as `buttondown_error` in `ops_events`). |
| 3 | After Netlify deploy goes green | Test the new form: visit https://missionmeetstech.com/fy2027-forecast, submit your own address, confirm 302 → `/fy2027-forecast/thanks` and the PDF arrives in your inbox within ~30 seconds. |
| 4 | Run backfill from local laptop | First dry-run to confirm the recipient list, then live: <pre>RESEND_API_KEY=... BUTTONDOWN_API_KEY=... \\<br>  node scripts/backfill-fy2027-pdf.js --dry-run<br><br>RESEND_API_KEY=... BUTTONDOWN_API_KEY=... \\<br>  node scripts/backfill-fy2027-pdf.js</pre>The script throttles 1000ms between sends so the full backfill takes ~20 seconds. Re-running is NOT idempotent — if you re-run live within the same hour, all 20 get a second copy. |
| 5 | Optional | If you want to swap in a different cover image / branded PDF later, regenerate via `npm run build:fy2027-pdf` and re-commit `static/lead-magnets/fy2027-forecast.pdf`. |

## What I did NOT touch (per envelope)

- No edits to `newsletter-send.js`, `newsletter-sync.js`, `signal-chain-subscribe.js`, or `marketpulse-gateway.js` (envelope explicitly excludes these).
- No new npm packages — pdfkit was already in dependencies.
- The Supabase ops_events / ops_ledger schema is unchanged; the new function writes through the existing logOpsEvent helper.
- No changes to existing tests — all 166 still passing.

## Architecture lock-in (the meta-deliverable)

`docs/email-architecture.md` is the single page Mary (or any future agent) reads before adding email-sending code:

- Resend = transactional, Buttondown = newsletter list — never interchangeable.
- Forms NEVER post to a third-party endpoint. They post to MMT Netlify functions. The function handles validation, transactional send, list subscribe, and ops_events logging.
- Future lead magnets clone `lead-magnet-fy2027.js` + form HTML pattern. The shared `lib/lead-magnet.js` does the heavy lifting (form parse, honeypot, PDF read, Buttondown).
- Throttle defaults: 220ms in production loops (Capture Corner / Friday brief), 1000ms in manual backfill scripts. Both well under Resend's 5 rps cap.

## Status marker

```
echo "LEAD_MAGNET_FY2027_DONE_$(date -u +%Y%m%dT%H%M%SZ)" >> .audit-status
```

Appended at end of this run.
