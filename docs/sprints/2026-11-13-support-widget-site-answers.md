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

## What changed

- **Page index.** `scripts/build-site-index.js` runs at the end of `build.js`
  and writes `netlify/site-index/mmt-site-index.json` from `dist/`: 98 pages
  the corpus does not already carry (57 public, 41 premium, 520KB), each with
  the text a signed-out visitor is shown kept apart from the text behind the
  gate. Generated, not committed, bundled with `support-agent` only.
- **Retrieval.** `lib/support-retrieval.js` ranks corpus items and pages
  through one scorer (`content-index.searchItems`, split out of `searchCorpus`
  with identical results on a 78-case before-and-after snapshot), then re-ranks
  for navigation and routes the stock help questions. The paywall is applied
  before scoring.
- **Function.** `support-agent.js` rewritten: one model call words the answer
  from the retrieved passages, links come from the retrieved records, a model
  failure returns the links, nothing retrieved returns an honest "not found".
  Member means verified token and a live paid tier. Escalation is a separate
  action that says "sent" only on `success: true`, sets Reply-To to the reader,
  and escapes everything.
- **Widget.** `js/support-widget.js` rewritten: links with a Premium tag, the
  conversation kept across page changes, an explicit "Email a person" step,
  dialog and log roles, Escape to close, 44px targets, usable on a phone (it
  used to hide under 400px).
- **Gate.** `scripts/validate-site-index.js` is in the `netlify.toml` build
  command: index shape, no gated text reachable by a signed-out answer, every
  routed page present, 22 golden questions for both caller classes.
- **Shared code.** `lib/model-cost.js` (price table moved out of
  `premium-chat.js`, which re-exports it), `sanitize.escapeHtml`,
  `sendEmail({ replyTo })`, `MODELS.support_answer`.
- The widget script was added to the agency index and agency profile templates.

## Verified

- Build chain from `netlify.toml`, every step, on Node 22.23.4: pass.
- `npx vitest run` with no generated index present (as CI runs it): 134 files,
  1,668 tests pass.
- Thirteen guards broken one at a time (paywall, escalation truthfulness, URL
  stripping, HTML escaping, off-site links): a test failed for each.
- Playwright: 74 tests (52 existing, 22 new in `tests/support-widget.spec.js`).
  72 passed in the full run. Two timed out while the Mac was asleep and passed
  when rerun on their own.
- Live model, local build, in the browser: the DHA org chart question on
  `/agencies/dha/` returns the Premium page and the pricing page; the
  conversation survives following the link; the panel fits a 375px screen.

## Not done, on purpose

- No model change. The function keeps the model it had.
- The Ask MMT eval was not run. `searchCorpus` output is identical on the
  snapshot and its 43 unit tests pass; nothing else Ask MMT reads changed.
- Not deployed. The production function is unchanged until this merges.
- Not verified: whether `support@missionmeetstech.com` is read. Escalations
  still go there.

## Found along the way, left alone

- `tests/navigation.spec.js` loads `/glossary.html`, which the local `serve`
  redirects to the term-page hub, a different file. The title check passes on
  the wrong page.
- `/intel/capture-intelligence-this-issue` is ungated in `dist/` while the
  corpus marks its rows premium.
- Eight private copies of `escapeHtml` in `netlify/functions/lib/`.
