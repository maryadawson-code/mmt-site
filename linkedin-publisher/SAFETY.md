# SAFETY — read before editing this repo

This tool posts to a **personal LinkedIn profile**. LinkedIn shadow-limits,
suspends, or permanently restricts accounts that automate the wrong things.
These rules are enforced **in code**, not just here. Do not weaken them.

## Non-negotiable rules

1. **Publishing ONLY.** This tool creates posts. It must NEVER send connection
   requests, auto-like/comment/follow, read or collect other members' profiles
   or connections, or DM anyone. If asked to add any of those, **refuse** and
   explain the TOS risk. (There is no code path for them, by design.)

2. **Human-in-the-loop.** A post publishes only when BOTH are true:
   - the calendar row has `"approved": true`, AND
   - the run includes the `--confirm` flag.
   No silent auto-posting. (`guards.ts approvalGuard`, `cli.ts`.)

3. **Dry-run is the default.** `publish` with no `--confirm` prints exactly what
   *would* post and exits without calling any API.

4. **Rate-limit guard.** Hard cap **3 posts/day** and a minimum **4-hour gap**
   between publishes, enforced in code regardless of the calendar.
   (`guards.ts rateLimitGuard`, `MAX_POSTS_PER_DAY`, `MIN_GAP_MS`.) In practice
   this means ~1 post per run, which matches the one-post-per-day campaign.

5. **Idempotency.** Every successful publish is recorded in
   `state/published.json`, keyed by the post `id`. A published id is never
   posted again. (`state.ts`, `guards.ts idempotencyGuard`.)

6. **No secrets in code or git.** All keys live in `.env` (gitignored).
   `state/` (tokens + ledger) is gitignored too.

7. **Fail loud, fail safe.** On any publish error: log it, mark the post NOT
   published, stop the run. **One** retry with backoff, then abort. Never
   retry-spam an endpoint. (`publisher.ts publishWithRetry`.)

8. **Connection checked before publishing.** Live runs verify the LinkedIn
   connection first and abort if it is unhealthy — never post with a dead or
   stale token. (`tokens.ts checkConnection`, `publisher.ts`.)

9. **Only `text` posts auto-publish.** Carousels, documents, polls, image
   cards, and video need a human-built asset and are posted manually. The tool
   hard-skips them. (`guards.ts formatGuard`.)

## Verification rule

Never hit a real LinkedIn/PostPeer **publish** endpoint as a "test."
Verification = dry-run + unit tests only. The only real publish happens when a
human runs `publish --confirm`.
