# Biosurveillance Replay — 2026-04-24

**Outcome: 4/4 sent.** All four subscribers who were throttled by Resend on the original 13:02 UTC send have now received the Capture Corner Premium biosurveillance playbook. `scheduled_emails.status` remains `sent` (unchanged). `replayed_recipients` JSONB column populated with per-recipient Resend message IDs.

Generated: 2026-04-24T14:22Z / 10:22 EDT

## Per-recipient result

| # | Recipient | Founding | Original status | Replay status | Resend message ID |
|---|---|---|---|---|---|
| 1 | `jmichaelmathias@gmail.com` | ✅ | 429 rate_limit | **OK** | `37f4ac12-9b77-4f70-a19b-e18a8863d016` |
| 2 | `9162000@msn.com` | ✅ | 429 rate_limit | **OK** | `7ea205ca-b872-4074-be66-50ce78e20671` |
| 3 | `smccluskey@salesforce.com` | ✅ | 429 rate_limit | **OK** | `84e23104-89de-40f2-909a-133f9a82e1aa` |
| 4 | `dcapplegate@outlook.com` | ✅ | 429 rate_limit | **OK** | `a3df44b7-a4f8-4c1c-bfc2-3f60bd00a38b` |

All 4 received the founding-member HTML variant (3,859 chars) — matching their `founding_member=true` flag in `mp_users`. No non-founding recipients in the throttled set.

## Wiring (identical to original send per spec)

| Field | Value |
|---|---|
| From | `MMT Premium <premium@missionmeetstech.com>` |
| Reply-To | `mary@missionmeetstech.com` |
| Subject | `Capture Corner: The Biosurveillance Reframing Playbook` |
| BCC | `["maryadawson@gmail.com", "mary@missionmeetstech.com"]` (dedup case-insensitive from row.bcc ∪ `ADMIN_BCC_EMAILS` ∪ `mary@`) |
| HTML variant | founding (3,859 chars) for all 4 |
| Text body | 801 chars |
| Throttle | 220 ms between calls (4.5 rps, well under Resend's 5 rps cap) |

Mary should see 4 BCC copies in her `mary@missionmeetstech.com` + `maryadawson@gmail.com` inboxes.

## Idempotency — verified post-send

`node scripts/replay-stranded-recipients.js --scheduled-email-id 4f2cb79d --dry-run` now reports:

```
Eligible to replay:  0
Skipped:             4
  jmichaelmathias@gmail.com  — already in replayed_recipients
  9162000@msn.com  — already in replayed_recipients
  smccluskey@salesforce.com  — already in replayed_recipients
  dcapplegate@outlook.com  — already in replayed_recipients
```

Three independent skip gates:
1. `scheduled_emails.resend_ids[]` — skip if original send already reached them
2. `scheduled_emails.replayed_recipients[]` — skip if a prior replay already reached them
3. `ops_events WHERE source_function='replay-stranded-recipients' AND event_type='CAPTURE_CORNER_RELEASE_REPLAYED' AND details.release_id=<id>` — belt-and-suspenders across script runs

Plus eligibility filter: `mp_users.subscription_tier='premium' AND subscription_status='active'`. Re-running produces no sends.

## Audit trail

- **`scheduled_emails.replayed_recipients`** (JSONB, added via migration `20260424000000_scheduled_emails_replay_throttle.sql`) — 4 entries, each `{email, resend_id, replayed_at: 2026-04-24T14:17:27Z}`.
- **`ops_events`** — 4 rows, `event_type=CAPTURE_CORNER_RELEASE_REPLAYED`, `source_function=replay-stranded-recipients`, `severity=info`, one per recipient with `details.resend_id` and `details.scheduled_email_id`.
- **`scheduled_emails.status`** — unchanged at `sent` (per spec: do NOT modify status).

## Noted during execution

Two bugs in the script that didn't block the sends:

1. **Initial `email` vs `user_email` column name** — the `logOpsEvent()` helper initially used `email` (matching `mp_users`) instead of `user_email` (the column name on `ops_events`). All 4 Resend sends succeeded and `replayed_recipients` was populated correctly, but the 4 `ops_events` rows were NOT written on the live run. Fixed the helper + the prior-replay idempotency query (same bug), then backfilled the 4 rows via a direct `POST /rest/v1/ops_events` with the correct column name. Backfilled rows are tagged `details.backfilled_after_script_bug=true` for provenance.
2. **Same typo in the prevReplay query** (`.select("email")` on `ops_events`) — fixed in the same edit. Dry-run idempotency re-verified green after the fix.

Both fixes shipped in the script now — next Monday's release (`recapture-bet-200m`, 2026-04-27 11:00 UTC) should not exhibit the same problem after the Phase 2 throttle patch lands, but the replay script is ready as a fallback if partial failure still surfaces.

## Files

| Path | Purpose |
|---|---|
| `scripts/replay-stranded-recipients.js` | Replay tool with `--dry-run`, `--scheduled-email-id`, `--release` flags |
| `migrations/20260424000000_scheduled_emails_replay_throttle.sql` | Adds `replayed_recipients` + `successful_recipients` columns (applied) |

## Next

Phase 2 (structural throttle + 429 retry in `scheduled-email-worker.js`) is next. Goal: prevent this class of partial failure on the remaining 4 Capture Corner releases (recapture 4/27, DHA 4/28, CDMRP 4/29, fuse 4/30) without needing the replay script.
