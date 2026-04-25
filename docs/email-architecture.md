# Email Architecture — locked in 2026-04-25

One page. Read this before adding any email-sending code.

## Two services, two responsibilities

| Service | Use | When |
|---|---|---|
| **Resend** | Transactional. The thing the user just asked for. | Lead-magnet PDFs, scoring receipts, Friday Brief sends, Capture Corner releases, Stripe receipts, comp-grant welcomes. |
| **Buttondown** | Newsletter list. The ongoing relationship. | Adding a subscriber to the list with a tag. Sending the actual weekly newsletter. |

These are not interchangeable. Don't put a "Welcome to the list" auto-responder on Buttondown's side; Mary writes those personally. Don't try to send the weekly newsletter via Resend; the list, segmentation, double-opt-in, and unsub plumbing live in Buttondown.

## Forms

**Forms NEVER post to a third-party endpoint.** Every form on `missionmeetstech.com` posts to a function under `netlify/functions/`. The function:

1. Validates input (email format, honeypot, optionally CAPTCHA).
2. Performs the transactional action via Resend (e.g., attaches the PDF the user asked for).
3. Performs the list-management action via Buttondown (subscribes them with the right tag).
4. Logs the outcome to `ops_events` so Mary has a queryable trail.
5. Returns a 302 redirect to a thanks page.

The reasons:
- We control validation and rate-limiting.
- We can attach files (Buttondown's embed form can't).
- We can write `ops_events` rows so failures aren't silent.
- We can rewrite the architecture later without touching the HTML form.

## Pattern: cloning a lead magnet

The reference implementation is **`netlify/functions/lead-magnet-fy2027.js`** + **`netlify/functions/lib/lead-magnet.js`**. To add a new lead magnet:

1. Drop the PDF (or other artifact) at `static/lead-magnets/<slug>.pdf`. If it needs generating, write a `scripts/build-<slug>-pdf.js` modeled on `scripts/build-fy2027-pdf.js` and add `npm run build:<slug>-pdf`.
2. Copy `netlify/functions/lead-magnet-fy2027.js` to `netlify/functions/lead-magnet-<slug>.js`. Change:
   - `PDF_PATH`, `SUBJECT`, `THANKS_PATH`, `FORM_PATH`
   - The body copy in `buildBodyHtml` / `buildBodyText`
   - The Resend tag `stream` value
   - The Buttondown tag in the `addToButtondown` call
   - The `withOpsLogging` function name suffix
3. Add the form HTML (clone `fy2027-forecast.html`):
   - `<form action="/.netlify/functions/lead-magnet-<slug>" method="post">`
   - Email field + honeypot pair (`website` hidden, `hp_ts` hidden timestamp)
   - Stamp `hp_ts` in JS at render time
4. Build the thanks page at `<form-path>/thanks.html`.
5. Test locally with `--dry-run` style probes against the lib.
6. Deploy. The shared `withOpsLogging` wrapper writes `<FN>_RUN_START / _RUN_OK / _RUN_FAILED` rows automatically.

## Rate-limit defaults (do not exceed)

| Constraint | Value | Why |
|---|---|---|
| Resend per-domain | 5 requests/sec | Resend's documented free-tier cap |
| Send-loop throttle | 220 ms between calls | 4.5 rps, safely under the cap |
| Backfill throttle | 1000 ms between calls | Defensive — manual one-shot scripts shouldn't burn the cap |
| Buttondown | No documented hard cap | The hybrid handler treats it as best-effort; failure doesn't block Resend send |

The 220 ms convention came from the 2026-04-24 Capture Corner biosurveillance incident — see `reports/biosurveillance-replay-20260424.md`. The wrapper convention came from the 2026-04-25 audit — see `reports/pursuit-calendar-build-20260425.md`.

## What NOT to do

- **Don't** post forms directly to Buttondown's `/embed-subscribe` endpoint. We did this for the FY2027 lead magnet for ~7 weeks; 20 people submitted, none received the PDF, and I had no Supabase trace to find them. (See `scripts/backfill-fy2027-pdf.js` for the cleanup.)
- **Don't** add a new email-sending lib. Use `lib/send-email.js` for Resend, `lib/lead-magnet.js#addToButtondown` for Buttondown. Both already handle env-var checks, attachments, tags, and Resend's circuit breaker.
- **Don't** put `RESEND_API_KEY` or `BUTTONDOWN_API_KEY` directly in any function file. Both are read from `process.env` inside the libs.
- **Don't** skip the honeypot. Every public form gets one — `website` hidden field + `hp_ts` timestamp older than 2s. The cost is negligible; the spam savings are huge.
- **Don't** bypass `withOpsLogging`. Every scheduled or webhook-triggered function gets wrapped so the dead-man's switch on `*_RUN_FAILED` Sentry alert (see audit report) catches silent breakage within 5 minutes.

## Where the pieces live

```
netlify/functions/
├── lead-magnet-fy2027.js           ← the reference implementation
├── lib/
│   ├── lead-magnet.js              ← shared: form parse, honeypot, PDF read, Buttondown
│   ├── send-email.js               ← Resend wrapper (attachments, tags, circuit breaker)
│   ├── ops-ledger.js               ← logOpsEvent → ops_events + ops_ledger tables
│   └── scheduled-fn-wrapper.js     ← withOpsLogging boundary instrumentation
└── ...

scripts/
├── build-fy2027-pdf.js             ← generate the artifact
└── backfill-fy2027-pdf.js          ← one-shot deliver to past submitters

static/lead-magnets/
└── fy2027-forecast.pdf             ← committed artifact

content/newsletter/                 ← source markdown for FY2027 PDF
```
