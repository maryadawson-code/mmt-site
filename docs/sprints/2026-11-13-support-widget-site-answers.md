# 2026-11-13: the help widget answers from the site

Spec: `docs/support-widget-spec.md`. Rule line: `CLAUDE.md`, Platform rules.

## What was wrong

A reader asked the floating help widget about the DHA org chart and got nothing
useful back. Reproduced against production before any change:

| Question (no email attached) | What production said |
|---|---|
| Where can I find the DHA org chart? | "isn't specifically mentioned in our knowledge base" |
| Who leads the DHA J-6 and where is the org chart? | "I'd recommend checking the official DHA website" |
| What have you written about T4NG2? | "I don't have information about specific articles" |

All three came back `escalated: true` with no email sent.

Causes:

1. `support-agent.js` answered from a 60-line FAQ pasted into the file. It read
   no page, article, tracker entry or org chart.
2. On a low-confidence answer it called `sendEmail()` and then promised "Mary's
   team will follow up within 1 business day". `sendEmail()` resolves with
   `{ success: false }` and does not throw, so the promise went out whether or
   not the email did. The reader's address came unverified from `localStorage`
   and went into the email HTML unescaped.
3. The pasted FAQ had drifted from the pages it paraphrased (it said $29 a
   month where `/help` says $29.99).
4. The agency index and the agency profile pages, the public front door to the
   org charts, never loaded the widget.

## What changed (2026-11-13, first commit)

- **Page index.** `scripts/build-site-index.js` runs at the end of `build.js`
  and writes `netlify/site-index/mmt-site-index.json` from `dist/`, with the
  text a signed-out visitor is shown kept apart from the text behind a gate.
  Generated, not committed, bundled with `support-agent` only.
- **Retrieval.** `lib/support-retrieval.js` ranks through one scorer
  (`content-index.searchItems`, split out of `searchCorpus` with identical
  results on a 78-case before-and-after snapshot), then re-ranks for
  navigation and routes the stock help questions.
- **Function.** `support-agent.js` rewritten: one model call words the answer
  from the retrieved passages, links come from the retrieved records, a model
  failure returns the links, nothing retrieved returns an honest "not found".
  Member means verified token and a live paid tier. Escalation is a separate
  action that says "sent" only on `success: true`, sets Reply-To to the reader,
  and escapes everything.
- **Widget.** `js/support-widget.js` rewritten: links with a Premium tag, the
  conversation kept across page changes, an explicit "Email a person" step,
  dialog and log roles, Escape to close, 44px targets, usable on a phone (it
  used to hide under 400px). Added to the agency index and profile templates.
- **Gate.** `scripts/validate-site-index.js` in the `netlify.toml` build command.
- **Shared code.** `lib/model-cost.js` (price table moved out of
  `premium-chat.js`, which re-exports it), `sanitize.escapeHtml`,
  `sendEmail({ replyTo })`, `MODELS.support_answer`.

## What the review found (2026-11-14, second commit)

Before merge the PR went through an eight-dimension review: paywall, security,
function correctness, retrieval quality, widget and accessibility, build and
deploy, tests and docs, simplification. Each finding was then checked by an
independent agent told to reproduce it, try to refute it, and judge whether it
belonged in this PR. 50 findings, 31 confirmed, 19 rejected. (A first attempt
at the review died on a usage limit with 27 of 28 agents unfinished; its one
completed review, security, was reused.)

The deploy preview carried the first commit while the review ran. Production
never did.

**The paywall finding that reshaped the design.** The first commit treated a
corpus row marked `premium: false` as public. The corpus marks tracker
entries, glossary entries and every article that way, and those rows carry
what the pages withhold: a contract's vendor, value and NAICS, an IDIQ's
ceiling, primes and MMT's vulnerability score, a glossary term's full
contractor note, and the whole body of an article inside the 90-day gate. A
signed-out visitor could have been answered from all of it. Four more gates
were missed on the page side: `data-gate="premium"` (the deadline block on
`/events`), the Capture Intelligence sheet (gated by script, no marker in the
HTML), `/dashboard` (the member view hidden by a stylesheet rule), and
premium pages' meta descriptions (the org chart ones name leaders).

The fix is a stronger rule, not a longer list: **`dist/` is the definition of
public.** A signed-out reader is answered only from the page index's
`public_text`. The corpus is read for members only. The index now covers every
published page (421, up from 98), the extractor knows all three gate markers,
script-gated pages are listed, and the build gate probes for leaks three ways
that do not reuse the extractor's own verdict.

Everything else that was confirmed and fixed:

| Area | Finding | Fix |
|---|---|---|
| Retrieval | A question about nothing but the VA found nothing | A two-letter agency is spelled out for the scorer |
| Retrieval | For members, forecast rows filled the candidates and one page repeated | Corpus searched with a per-type cap; one page appears once |
| Retrieval | "Who is the DHA CIO?" did not reach the DHA org chart | The named agency's page goes first for an org chart or people question |
| Retrieval | "Is there a podcast?" after a DHA question answered with the DHA chart | Only a connective, a pronoun or a bare agency name makes a follow-up |
| Retrieval | "How much does DHA spend on IT?" led with MMT's price page | Pricing and contact intents do not fire on agency questions |
| Retrieval | "How much does ProposalPulse cost?" showed the model no price | A dollar figure outweighs keywords when choosing a price passage |
| Function | Billing questions sometimes came back without the offer of a person | Decided from the question by code, not left to the model |
| Function | A pointer to a locked page opened with "the site does not cover" | That sentence is the function's own |
| Function | The pricing link could push out the Premium page the answer was about | Room is taken from a public link |
| Function | No check on dollar figures | `dollarGuard` against the passages; an unsupported figure returns links |
| Function | A removed URL took the sentence's period with it; `_` and `#` stripped | Punctuation kept; markdown removed only where it is markdown |
| Security | 200 of 200 parallel requests passed a limit of 3 | `reserveRateLimit` inserts, then counts |
| Security | Nothing capped total spend or total email | Hourly ceilings across all callers; past the model ceiling, links only |
| Security | Another site's page could post to the endpoint | Same-site check on `Origin` |
| Security | Reply-To accepted a display-name address | One plain address only |
| Security | The IP hash was salted with a public constant | HMAC under the whole service key |
| Widget | The question box was clipped off a short viewport | The log gives way; a short viewport gets the full height |
| Widget | On a dash page on a phone the header sat above the screen | Max-height accounts for the offset |
| Widget | Focus fell to the page body after escalating or using a starter | Focus moves to the question box |
| Widget | "Email this to a person" sent the latest exchange, not the one chosen | The button sends the exchange it sits under |
| Widget | A member was told replies go to the typed address | The widget shows the address the server used |
| Widget | Input outlines at 1.33:1 | Outlined in the text-secondary color |
| Code | Dead heading collection put `extractPage` at complexity 24 | Removed; the walk is its own function |
| Docs | A dozen statements in the spec did not match the code | The spec was rewritten against the code |

Two of the four security findings the checker rejected as "by design" were
fixed anyway, because the design was mine and the reviewer was right about it:
the hourly ceilings and the same-site check. The checker's reasoning was that
the spec said per-caller limits were the control. A per-caller limit does not
bound an unauthenticated endpoint that calls a paid model.

## Verified

- `netlify.toml` build chain, every step, on Node 22.23.4: pass.
- `npx vitest run` as CI runs it: 134 files, 1,725 tests pass.
- Mutation checks: 13 guards in the first commit and 32 in the second, each
  broken on purpose. Every one was caught, 5 of them by the build gate itself.
- Build gate on the real index: 421 pages, 204 gate markers and 16 recent
  articles probed for leaks, 31 golden questions for both caller classes.
- Playwright against the build: 77 tests (52 existing, 25 for the widget). 70
  passed in the full run. Of the 7 that did not, 4 timed out while the Mac was
  asleep, 2 were assertions written too tightly (one read the public page's own
  "Vendor: Premium" placeholder as a leak) and 1 hit the same stall. All 7 pass
  rerun on their own.
- Live model on the local build, signed-out: the DHA org chart question names
  the Premium page and links pricing; a tracker question says the vendor and
  value are Premium; a billing question offers a person; a product price
  question states the price.
- The deploy preview is re-checked after each push; the PR carries that result.

## Not done, on purpose

- No model change. The function keeps the model it had.
- The Ask MMT eval was not run. `searchCorpus` output is identical on the
  snapshot and its 43 unit tests pass; nothing else Ask MMT reads changed.
- Not deployed. The production function is unchanged until this merges.
- Not verified: whether `support@missionmeetstech.com` is read. Escalations
  still go there.

## Found along the way, left alone

- `netlify/functions/data/mmt-content-corpus-public.json` is named public and
  carries the same withheld fields. Nothing reads it.
- Premium pages' meta descriptions are in public HTML; the org chart ones name
  leaders.
- `premium-chat.js` salts its anonymous IP hash with the same public constant.
  Changing it resets the free tier's per-IP counts.
- `tests/navigation.spec.js` loads `/glossary.html`, which the local `serve`
  redirects to the term-page hub, a different file. The title check passes on
  the wrong page.
- Newsletter archive pages 2 and up do not load the site scripts, so they have
  no help button (and no site-wide paywall script).
- Eight private copies of `escapeHtml` in `netlify/functions/lib/`.
