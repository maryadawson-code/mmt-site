# Friday Brief — auto-send folder

Drop a markdown file here named `YYYY-MM-DD.md` and it will be emailed to all
active premium subscribers automatically on the next **Friday at 6 AM ET**.

## How it works

- The `premium-brief-send` scheduled function runs every Friday at 10:00 UTC
  (6 AM ET during EDT) — see `netlify.toml`.
- It picks the **newest unsent** `YYYY-MM-DD.md` in this folder dated within the
  last 14 days, renders the markdown to a branded email, and sends it to every
  active paid subscriber (premium / founding / institutional / admin / paid).
- Idempotent: each date is recorded in `ops_ledger` (`premium_brief_sent`), so a
  brief is never sent twice even if the cron double-fires.

## To publish a brief

1. Write the brief as markdown. The first `# Heading` line becomes the email
   title; everything after it is the body (tables, links, and lists all render).
2. Save it as `content/friday-brief/<that Friday's date>.md`
   (e.g. `2026-06-12.md`).
3. Commit + push. On the next Friday 6 AM ET it goes out — no code, no HTML page,
   no manual trigger.

## Notes

- Authoring any day that week is fine; the Friday run grabs the newest unsent
  brief within the trailing 14 days.
- Kill switch: the shared email kill switch (`kill-switch.js`) halts sends.
- One-off / dated sends (e.g. a special issue on a non-Friday) still use the
  `junN-...-send.js` pattern; this folder is only the recurring Friday Brief.
