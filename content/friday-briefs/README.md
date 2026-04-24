# Friday Brief — Content Authoring

Drop one markdown file per week in this directory. The filename determines the date: `YYYY-MM-DD.md` where the date is the Friday the brief covers (America/New_York).

**Deadline: Thursday 8 PM ET** — the brief needs to be committed and deployed before Friday 8 AM ET so the scheduler can pick it up on its next tick.

## Required frontmatter

```yaml
---
title: "The one-line headline that becomes the email subject and page H1"
summary: "One sentence — used as the preheader in the email and the meta description on the archive page."
tags:
  - dha
  - idiq
  - fy27
founding_variant: |
  Optional. Alternate body markdown rendered to founding-member subscribers
  (mp_users.founding_member=true). If omitted, founding members get the
  default body.
---
```

- `title` and `summary` are **required**. Missing either → publish script exits with `BRIEF_NO_CONTENT` and the row is never inserted.
- `tags` is informational; surfaced in internal dashboards only.
- `founding_variant` is optional. Use it sparingly — the default body should be strong on its own.

## Body

Standard markdown. H2 (`##`) and H3 (`###`) headers, bullet lists, links, `**bold**`, `*italic*`, `` `inline code` ``. Images: put them under `images/friday-briefs/` and reference as `/images/friday-briefs/your-image.png`.

Two consumers render this file:
1. The email send — HTML body, inline styles, light theme.
2. The static page — `/premium/friday-briefs/YYYY-MM-DD.html`, paywalled via `data-access="premium"`.

Both use the same markdown. Don't hand-author HTML inside the markdown unless you check it renders in both the email and the static page.

## Example

`content/friday-briefs/2026-05-01.md`:

```md
---
title: "Three IDIQs to watch before FY27"
summary: "The T4NG2 window closes in August. Here's who's positioned and what the protest risk looks like."
tags:
  - idiq
  - va
  - t4ng2
---

## The near-term window

T4NG2's on-ramp closes August 8. Three incumbents have declared, and …

## The protest read

…
```

## Publishing

After the markdown is committed and deployed:

```bash
# Most recent Friday in America/New_York (default)
node scripts/publish-friday-brief.js

# Explicit Friday
node scripts/publish-friday-brief.js --date 2026-05-01

# Dry-run — shows recipient count + rendered sizes, no DB writes
node scripts/publish-friday-brief.js --date 2026-05-01 --dry-run

# Non-Friday override (out-of-band test only)
node scripts/publish-friday-brief.js --date 2026-04-26 --force-date --dry-run
```

The publish script inserts two rows:

1. `scheduled_emails` with `stream='friday_brief'`, `target_date=YYYY-MM-DD`, `scheduled_at=Fri 08:00 ET`.
2. `premium_deliverables` with `publish_at=Fri 07:55 ET` so the portal page flips `published=true` 5 minutes before the email fires.

Both rows are idempotent — a partial unique index on `scheduled_emails(target_date) WHERE stream='friday_brief'` blocks double inserts. Re-running the script is a safe no-op.

## What happens next (automatic)

- **Fri 07:55 ET** — `scheduled-portal-publisher` cron flips `premium_deliverables.published=true`. `/premium/friday-briefs/YYYY-MM-DD.html` becomes live to premium subscribers.
- **Fri 08:00 ET** — `scheduled-email-worker` cron picks up the `scheduled_emails` row, fetches the audience (active premium ∪ admin/paid), renders founding-variant HTML for founding members, sends via Resend with 220 ms pacing and a 6-hour abort window.
- Dashboard tile on `/premium/dashboard/` updates to show "Latest Friday Brief" on the next deploy.

## If something goes wrong

- Missing file → `BRIEF_NO_CONTENT` in ops_ledger; nothing sends.
- 429 rate-limit on Resend → worker requeues with 15-min delay, only the stranded recipients retry.
- 6-hour abort → row status goes `aborted`, Sentry alert fires, remaining recipients stay in `successful_recipients` gap. Use `scripts/replay-stranded-recipients.js` pattern to resend.

See `reports/biosurveillance-replay-20260424.md` for the playbook on partial-failure recovery.
