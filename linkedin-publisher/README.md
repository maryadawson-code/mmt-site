# MMT LinkedIn Publisher

A small, production-safe tool to publish the **MMT Premium FY-End Campaign**
(32 posts, Jun 30 – Sep 30 2026) to a **personal LinkedIn profile**, via the
[PostPeer](https://www.postpeer.dev) wrapper API.

Dry-run by default. Human-in-the-loop. TOS-protective guards baked into code.
Read [`SAFETY.md`](./SAFETY.md) before touching anything.

---

## What this is (and isn't)

- **It is:** a publisher. It formats a post from the local calendar and posts it
  when you explicitly approve + confirm.
- **It is not:** an engagement bot. It never connects, likes, comments, follows,
  DMs, or scrapes. There is no code path for any of that, on purpose.

---

## Requirements

- Node **≥ 22.6** (uses native TypeScript execution via `tsx`; your machine has
  Node 25). No build step.
- A PostPeer account with your **LinkedIn personal profile connected**.

```bash
cd linkedin-publisher
npm install
```

---

## Setup

1. **Get a PostPeer API key.** Create an account at https://www.postpeer.dev,
   connect your **personal** LinkedIn profile (not the company page), and copy
   your API key + the connected-account id from the dashboard.

   > ⚠️ PostPeer's exact endpoint/field names were not confirmed at build time.
   > Every PostPeer-specific detail is isolated in `src/postpeer.ts` and marked
   > `// VERIFY`. Confirm those against PostPeer's docs (or drop in their SDK)
   > before your first real publish. Nothing else in the app needs to change.

2. **Configure env.**
   ```bash
   cp .env.example .env
   # fill in POSTPEER_API_KEY and POSTPEER_LINKEDIN_ACCOUNT_ID
   ```
   `.env` and `state/` are gitignored — never commit them.

3. **The campaign is already loaded.** All 32 posts are in
   [`data/posts.json`](./data/posts.json), dated per the schedule handoff, with
   each post's body verbatim (the UTM link + hashtags are inside the body, as
   the content handoff specified). Every post ships `"approved": false` — you
   flip a post to `true` when you're ready for it to go out.

---

## Daily workflow

```bash
# 1. See what's due today (DRY RUN — no API calls). Run this every morning.
npm run publish

# 2. When the dry-run looks right and the post is approved, publish it:
npm run publish -- --confirm
#    (or: npm run publish:confirm)

# 3. After it's live, reply to comments for the first 90 minutes (manual).
```

To approve a post, set `"approved": true` on its row in `data/posts.json`.
A post will not publish unless it is **both** approved **and** run with
`--confirm` — and only if it's due (date ≤ today), not already published, and
within the rate limits.

### Other commands

```bash
npm run calendar:validate          # check data/posts.json schema
npm run publish -- --date=2026-07-08   # preview a specific day
npm run tokens:status              # PostPeer key + LinkedIn connection health
npm test                           # unit tests (utm + guards)
npm run typecheck                  # tsc --noEmit
```

### Check the integration is still alive before Sept 30

LinkedIn member tokens expire ~60 days; the campaign runs ~92 days. With
PostPeer, PostPeer refreshes those tokens on its side — you just need its key
to stay valid and your profile to stay connected. Check any time:

```bash
npm run tokens:status
```

It prints connection health and a days-until-expiry countdown, and warns if you
need to re-authorize. If it ever says **needs re-auth**, re-link your LinkedIn
profile in the PostPeer dashboard — the publisher refuses to post on a dead
connection.

---

## The post calendar

`data/posts.json` is the single source of truth. One object per post:

| field | meaning |
|---|---|
| `id` | unique stable id (`mmt-001`…) — used for idempotency |
| `publish_date` | `YYYY-MM-DD` the post should go out |
| `publish_time` | `HH:MM` America/New_York (late-morning ET) |
| `format` | `text` · `carousel` · `document` · `poll` · `image` · `video` |
| `body` | the post copy, verbatim (link + hashtags included) |
| `link_target` | destination path (`/pricing`) — recorded for tracking |
| `utm_content` | per-post UTM slug |
| `link_in_body` | `true` = link already in body (campaign default), tool appends nothing |
| `approved` | publishing gate — `false` until you say go |
| `needs_asset` | `true` for non-text posts that need a built asset |
| `asset_notes` | slide copy / poll options / script / document spec (not posted as text) |

> **Why JSON, not CSV?** The build prompt suggested CSV. Every campaign body has
> embedded quotes, commas, URLs and many line breaks, which silently corrupt
> hand-edited CSV. JSON stores each body losslessly and is still editable in any
> text editor.

### Only text posts auto-publish

`carousel`, `document`, `poll`, `image`, and `video` posts need a human-built
asset (slides, a redacted PDF, a poll object, an image card, a video) and richer
publishing than a text API call. The tool **hard-skips** them with a
"needs-asset" notice — build the asset (see `asset_notes` and the handoff's
"Assets to build"), then post those manually from LinkedIn. Of the 32 posts, **24
are text** (auto-publishable) and **8 are non-text** that you post manually
(handoff items 4, 7, 11, 13, 14, 16, 27, 28 →
`mmt-004 / 007 / 011 / 013 / 014 / 016 / 027 / 028`). Seven of those need a built
asset (carousels, document, image card, video); the poll (`mmt-014`) just needs
the native poll set up by hand.

---

## Architecture

```
src/
  types.ts       # shared types + PostProvider interface
  calendar.ts    # load + validate data/posts.json
  utm.ts         # build UTM-tagged URLs (tested)
  payload.ts     # assemble post text + link placement
  postpeer.ts    # PostPeer client behind the PostProvider adapter (VERIFY marks)
  tokens.ts      # connection/token health + (model B) refresh
  guards.ts      # approval, idempotency, rate-limit, format guards (tested)
  state.ts       # state/published.json ledger (idempotency)
  publisher.ts   # orchestration: due -> guard -> dry-run/publish -> record
  cli.ts         # entrypoint
data/posts.json  # the calendar (source of truth)
state/           # published.json + tokens.json (gitignored, runtime)
```

The orchestrator depends only on the `PostProvider` interface, so swapping
PostPeer for bundle.social / Mallary is one new file implementing that
interface — nothing else changes.

---

## Notes on the two source documents

This was built from two handoffs that disagreed in small ways; the reconciliation:

- **Post count:** the build prompt said 17, the content handoff has **32**. All
  32 are loaded.
- **Link placement:** the build prompt suggested putting promo links in the
  first comment. The content handoff says "link and hashtags are in the body,
  paste exactly as written." The **content handoff wins** — bodies are verbatim,
  links stay in the body (`link_in_body: true`). The UTM builder + first-comment
  path are still built and unit-tested for any future post you author without an
  inline link (set `link_in_body: false`).
- **UTM campaign value:** the prompt suggested `mmt-premium-fy-end-2026`; the
  published links use `fy-end-2026`. The tool defaults to `fy-end-2026` to match
  the live content (override with `UTM_CAMPAIGN`).
- **Calendar format:** JSON instead of CSV (see above).
