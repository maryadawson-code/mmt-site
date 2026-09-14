# Sprint 2026-09-14 — Three senders wrote their marker after the work; two of them double-sent

Follow-on to the SAM.gov key rollout the same morning. While confirming that
the Ask MMT LinkedIn campaign runs on the same autopilot as the FY-End one, the
`ops_events` rows for `linkedin-autopost` showed every post since 08-20
recorded as sent TWICE, seconds apart, with two different PostPeer ids. That
opened the same audit for every member-facing cron.

## What was actually happening

**`linkedin-autopost` (daily 13:30 UTC).** Netlify fired the tick twice, about
38 seconds apart, every day from 2026-08-20 to 2026-09-10. PostPeer takes about
40 seconds to answer a publish, and the marker was written after that answer,
so both invocations passed the "already sent?" check and both published.
LinkedIn rejected the second copy every time (`422 DUPLICATE_POST`, verified on
PostPeer for all six dates), which is the only reason Mary's feed has no
duplicates. Worse, the handler logged the rejected copy as `linkedin_autopost_sent`
with `url: null`, because a PostPeer 2xx is acceptance, not publication: a real
LinkedIn failure would have emailed Mary "went live".

**`ask-mmt-campaign-emails` (daily 13:15 UTC).** On 2026-09-14, soft-launch day,
Netlify fired the tick three times. The first and third invocations each
mailed all 70 Premium members the soft-launch note (markers at 13:16:00 and
13:16:22); the second saw the first marker and did nothing. The marker was
written after a loop that takes about 60 seconds for 70 members. Every Premium
member received the soft-launch note twice, 22 seconds apart. This is the
2026-07-07 Capture Corner storm shape, in a function written on 2026-09-10 with
the rule already in CLAUDE.md.

**`newsletter-send` (Tue/Fri 23:30 UTC).** Its duplicate check asked Buttondown
for `status=sent` only; an issue created seconds earlier sits in
`about_to_send` / `in_flight` for minutes and is invisible to that check. No
duplicate has gone out (36 sent issues on Buttondown, zero repeated subjects),
because the create call returns fast enough that the second fire usually sees
it. The window was real and unguarded.

## Shipped

- **`lib/cron-claim.js`**: `claimOnce(supabase, { eventType, sourceFunction,
  key, keyField, details, loserEventType })` inserts the marker row with
  `status: "claimed"`, lists every marker for the key ordered by
  `created_at, id`, and proceeds only if ours is first. A loser relabels its
  own row (`<eventType>_lost_claim_race` by default) so the day keeps exactly
  one real marker and the double-fire stays visible. A failed insert or an
  unreadable list fails CLOSED (no work). `finalizeClaim` patches the claimed
  row with what happened, including a new `event_type` for a failure record.
- **`linkedin-autopost.js`**: claims `linkedin_autopost_sent` before calling
  PostPeer; after acceptance reads LinkedIn's verdict from `GET /posts/{id}`
  (bounded poll) and records `published` with the post URL, `accepted` when
  LinkedIn has not confirmed inside the window (the email says so), or converts
  the claim into `linkedin_autopost_failed` with LinkedIn's message and emails
  the reason. `makeHandler(deps)` for tests.
- **`ask-mmt-campaign-emails.js`**: the RUN is claimed before any send (one
  `ASK_MMT_CAMPAIGN_RUN` row per ET day; extra fires become
  `ASK_MMT_CAMPAIGN_RUN_LOST_CLAIM_RACE`), and the soft-launch marker is written
  before its loop and finalized after. `makeHandler(deps)` for tests.
- **`newsletter-send.js`**: claims `newsletter_send` keyed on the article before
  the Buttondown create, and the duplicate check now reads every status an
  issue passes through (`sent`, `in_flight`, `about_to_send`, `scheduled`).
- **Tests (+27)**: `tests/unit/helpers/fake-supabase.js` (a scripted Supabase
  whose ids and `created_at` derive from the shared store, so two handlers that
  each build their own client race the way production does),
  `cron-claim.test.js`, `linkedin-autopost-handler.test.js` (two overlapping
  invocations publish once; the marker exists before the PostPeer call; a
  LinkedIn rejection is a failure record, not "sent"; pending is "accepted",
  never "live"), `ask-mmt-campaign-handler.test.js` (two overlapping runs send
  the soft launch once; the marker exists before the first member email; a
  same-day rerun is skipped; the next day does not re-send).

## Not done here

- The 70 duplicate soft-launch emails cannot be recalled. Whether to send a
  short note is Mary's call.
- PostPeer holds one `failed` post per day since 08-20; harmless, not cleaned.

## Hard rules (do not regress)

- **Every scheduled sender claims through `lib/cron-claim.js` before the
  work.** A marker written after a loop, or after a slow upstream call, is not
  idempotency: the second fire passes the check while the first is still
  working. Third incident of this shape (05-29 digest, 07-07 Capture Corner,
  09-14 soft launch); the helper exists so the pattern is one implementation.
- **A 2xx from a publishing service is acceptance, not delivery.** PostPeer
  answers 2xx and LinkedIn rejects later; Buttondown accepts and sends for
  minutes. Read the platform's own status before recording "sent", and never
  email Mary "went live" on an accepted post.
- **A duplicate check must see every state the record passes through.** A
  `status=sent` filter cannot see an issue that is still sending.

Verified 2026-09-14: `node -c` clean on the three functions and the lib; unit
suite **1068/1068** (80 files, +27); build exit 0 (694 pages); validate-dist
and validate-routes (36) pass. Live: PostPeer status read for all 12 recorded
copies (6 published, 6 failed with `DUPLICATE_POST`); Buttondown shows 36 sent
issues and no repeated subject.
