# Ask MMT eval harness

`scripts/ask-mmt-eval.js` asks the assistant the questions in
`scripts/ask-mmt-eval-set.json` in-process (`answerQuestion` from
`netlify/functions/lib/premium-assistant.js`), grades every answer with code,
and writes a markdown report. It never calls the production endpoint.

## Run

```
cd <repo or worktree>
netlify link --id df450efb-dc54-4016-9905-6e884f0b31bd   # once; creates an untracked .netlify/
netlify dev:exec -- node scripts/ask-mmt-eval.js [--trials N] [--only <id>] [--smoke] [--label <name>] [--concurrency N]
```

- `--smoke`: one trial, sequential, stops at the first failing row and prints the failing grader. Use it while fixing a lib.
- `--trials 3`: the pre-email gate. A question passes only if every trial passes (pass^N); overall passes only if every question does.
- `--only <id>`: one row (a chained follow-up pulls its turn-1 row along).
- `--label`: names the report, `<scratchpad>/build/eval/report-<label>.md`. The path is printed at the end.
- `--concurrency` (default 2): questions in flight at once. Higher is faster and more timeout-prone (Congress.gov and USASpending sit under 8s budgets).

A single trial over the full set runs in about two minutes at concurrency 2.

## What the script guarantees

- `ANTHROPIC_API_KEY` is read from `/Users/marywomack/Projects/mmt-site/.env` (never the harness JWT, never printed).
- `SAM_GOV_API_KEY` is deleted before the assistant loads, so no SAM.gov quota is spent. `sam_opportunities` then appears on the not-reached list and the set allows it.
- `ASK_MMT_METRICS_ENABLED` is off: no `ops_events` rows.
- `lib/fetch-cache.js` gets an in-memory store, so neither the Blobs cache nor the `sam-quota/` ledger is touched. The report counts ledger writes (must be 0).
- Every request to `missionmeetstech.com` is refused and counted (must be 0). The report lists every host contacted and how often.

The exit code is 0 on overall pass, 1 on a grader failure, 2 on a harness error, 3 if a guard tripped (a production request or a ledger write).

## Graders

Retrieval (separable from synthesis in the report): `no_error`, `elapsed_under_cap` (45000 ms default), `has_data`, `unavailable_allowed` (not-reached must be a subset of the row's `allowed_unavailable`), `carried_as_expected`, `required_cited` (substring in the answer or a source url/title).

Synthesis: `required_present`, `required_any_present`, `forbidden_absent`, `foc_not_expanded`, `no_em_dash`, `no_exclamation`, `no_banned_words`, `no_trailing_sources_section`, `links_grounded` (every http(s) link in the answer is in the sources list, the enrichment context, or the prompt's own MarketPulse link), `acronyms_known` (every "ACR (Expansion)" or "Expansion (ACR)" matches `lib/acronyms.js` `expandAcronym`, or, for an acronym the table lacks, sits verbatim in the retrieved context).

Each trial records the retrieval fields (`searchPhrase`, `agency`, `shapes`, `routed`, source ids, `unavailable`, `carried`) next to the answer so a retrieval miss and a writing miss are told apart.

## The set

Every user-reported failure becomes a row before it is fixed. Rows copy the advertised questions verbatim (`ask.html`, the widget's `SAMPLE_QUESTIONS`, the soft-launch email); `tests/unit/ask-mmt-eval.test.js` fails if the copy drifts. Identical question-plus-history rows share one run per trial, so the three duplicated marketing questions cost nothing extra.

Row fields: `id`, `source`, `question`, `history` (an entry may carry `answer_from: <row id>` to chain the answer produced earlier in the same trial), `required`, `required_any`, `required_cited`, `forbidden`, `allowed_unavailable` (default `sam_opportunities`, `onc_chpl`), `max_elapsed_ms` (default 45000), `expect_carried`.

## Reading a failure

- `no_trailing_sources_section` on every row means the system prompt still asks for a Sources list; that is a prompt change, not a data one.
- `unavailable_allowed: usaspending timeout-8s` on a few rows is fan-out contention; rerun with `--concurrency 1` before blaming the client.
- `no_error: ... is not a function` is a thrown client bug; the row's question is the reproduction.
- `acronyms_known` names the token and both expansions. Add the acronym to the glossary (preferred) or `lib/acronyms.js`; never to the prompt.
