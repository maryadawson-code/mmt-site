# Sprint 2026-09-15 — ProposalPulse rejected every PPTX upload

Dependabot opened a bump for `officeparser` (6.0.7 to 7.8.0). Verifying it
against the deck path found a defect the bump neither caused nor fixed:
**`score-deck.js` had never been able to read a PowerPoint file.**

`extractText()` did this:

```js
const officeparser = require("officeparser");
return await officeparser.parseOffice(buffer);
```

`parseOffice()` resolves with an **object**, not a string, on 6.0.7 and on
7.8.0 alike. The caller then ran `.trim()` on it, which throws, and the handler
answered with the generic "could not read this file" message. Every `.pptx`
a subscriber uploaded came back unreadable. The `.docx` (mammoth) and `.pdf`
paths were unaffected, which is why the failure read as a file-specific
problem rather than a code one.

Shipped:
- **`officeparserText(parsed)`** in `netlify/functions/score-deck.js` — returns
  `parsed` when it is already a string, else `parsed.toText()`, else
  `parsed.content`, else `null` so the caller reports an honest extraction
  failure instead of throwing. Exported for the test.
- `tests/unit/score-deck-pptx-extraction.test.js` (7 cases): the object shape
  both versions actually return, a bare string, a `content`-only object, a
  `toText()` that returns a non-string, null, and the end-to-end assertion that
  the extracted value is a string `.trim()` accepts.
- `officeparser` 6.0.7 to 7.8.0 (#201) and `mammoth` 1.11.0 to 1.12.2 (#202)
  merged after the unwrapper, verified on the new major: the pptx path returns
  a real string.
- `netlify/functions/data/mmt-content-corpus.json` rebuilt for the 2026-09-15
  issue (#212); the committed artifact had drifted from the committed content.

Hard rules (do not regress):
- **A parser's return type is part of its contract, and a `.trim()` on it is
  the assertion.** Three document paths sat side by side; two returned strings
  and one returned an object, and nothing in the handler or the suite checked.
  Any new extraction path asserts `typeof === "string"` in a test before it
  ships.
- **Verify a dependency bump against the code path that uses it, not just the
  suite.** The suite was green through the entire life of this bug. The bump
  was the occasion for the find, not its cause.

Verified 2026-09-15 on `main` after merge: `npm ci` clean; officeparser 7.8.0
and mammoth 1.12.2 installed; the pptx path returns `typeof "string"`; unit
suite **1173/1173**; build exit 0.

Related, same day: `main`'s test job was briefly reported red. It was not. A
stale local `node_modules` from the 2026-09-11 lockfile was missing
`@netlify/blobs`, which `main` declares at `^11.0.3`. `npm ci` resolved it.
Run `npm ci` before calling a suite broken.
