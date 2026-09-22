# Sprint 2026-09-22: the link the eval named was the grounded one

Observed 2026-09-21 while running the eval for PR #225: row
`fail-2026-09-13-dha-data-governance` failed `links_grounded` in 1 of 3
trials, and the report named
`https://missionmeetstech.com/newsletter/the-scorecard-dha-already-publishes/`
as the link not in the sources or the context. That URL is real, so it read
as the model writing a link to an article retrieval had not surfaced.

What actually happened:

1. **The served answer carried no ungrounded link.** `enforceLinks` had
   already de-linked the model's fourth URL before the answer returned. The
   residue is visible in the report's own answer text: "(Mission Meets Tech,
   missionmeetstech.com)" is what the guard leaves when it de-links a bare
   URL to its hostname. The scorecard URL the report named was one of the
   five `mmt_archive` sources of that trial. It was grounded.
2. **The eval named the wrong URL.** When the server reports
   `unlisted_link_count`, `runOne` took the first N links of the *cleaned*
   answer instead of the server's `unlisted_links`. The cleaned answer's
   links are by construction the grounded ones. The URL the model really
   wrote was never written anywhere and is unrecoverable from that run.
3. **The guard had a hole the incident did not hit.** `BARE_URL_RE` carried a
   second lookbehind, `(?<!\()`, so a bare URL directly after an opening
   parenthesis was never checked. "(https://missionmeetstech.com/anything/)"
   was served as a clickable link whether or not it was retrieved. That is
   how the prompt's MarketPulse line survived the guard in six served answers
   in the 2026-09-21 reports, each with five `mmt_archive` sources present,
   which the prompt's own "only in the empty-block shape" rule forbids (the
   pitch placement is not fixed here).
4. **The miss is rarer than it looked.** Thirty further trials of the row
   (10, then 20, `--concurrency 1`, nothing else running) all passed. With
   the 12 of 13 from the 2026-09-21 runs, the row's rate is nearer 1 in 40
   than 1 in 15. The enrichment context for the question carries every
   relevant MMT URL, both April briefs included, so the model wrote a URL
   variant for a source it already had by date. Which variant is unknown,
   because of item 2.

Shipped:

- `netlify/functions/lib/answer-guards.js`: the `(?<!\()` lookbehind is gone,
  so a parenthesised bare URL is checked like any other. A bare URL that
  closes a citation after a comma or semicolon is dropped together with its
  separator ("(Mission Meets Tech)" rather than "(Mission Meets Tech,
  missionmeetstech.com)"). `enforceLinks` takes `{ allow }` for URLs the
  prompt itself hands the model.
- `netlify/functions/lib/premium-assistant.js`: `MARKETPULSE_URL` and
  `PROMPT_LINKS` are one constant, read by the prompt and passed to the
  guard, so the CTA link in the empty-block shape survives and the two
  cannot drift. The system prompt asks for date citations and says not to
  write URLs; it used to say "Link to the URL", which contradicted the
  house rule the guard enforces. The user turn and the corpus header in
  `content-index.js` say the same.
- `scripts/ask-mmt-eval.js`: `unlistedLinksFor` names the server's
  `unlisted_links`, never the cleaned answer's links; every trial in the
  report carries a "de-linked by the server" line; `PROMPT_LINKS` is
  exported and pinned equal to the assistant's.
- Tests: the parenthesised bare URL, the citation tail, a real page this
  answer did not retrieve, the allow list, `answerQuestion` end to end with
  the prompt wording, and the eval helper's four branches.

Not changed on purpose: `links_grounded` still fails a trial on any
model-written URL the server did not retrieve (server count above zero),
even though the served answer is clean. The gate is on the model's
behaviour, not the reader's page, and it stays that way.

Verification (2026-09-22, this worktree, nothing else running beside the eval):

- Full eval `--trials 3 --concurrency 1`: PASS, 24/24 rows, every trial;
  "de-linked by the server: none" on all 72 answers; 0 production requests,
  0 ledger writes. Answers that still carry any URL in this run: 5/72
  (a copied, retrieved URL is grounded and allowed; the date citation is
  now the default shape).
- The row itself, before the change: 30/30 further trials passed.
- `npm test`: 111 files, 1402 tests, all green. `node build.js` exit 0;
  `validate-dist` OK (711 pages); `validate-routes` OK (39 features).
