# Digital Mary Eval Harness

LLM-as-judge eval scaffold for measuring Digital Mary against the
100-prompt golden set on every change.

## Files

| File | Purpose |
|---|---|
| `golden-set.jsonl` | 100 prompts (30 entity / 30 capture / 20 platform / 20 trap), each with `ideal_answer` and `scoring_rubric`. Authored by Mary; sourced from HANDOFF-PACKAGE.md §2. |
| `llm-judge.js` | Claude Opus 4.7 LLM-as-judge — 4 scorers per prompt. |
| `scoring.js` | Scoring helpers — load, run, aggregate. |
| `run-eval.js` | Runs all 100 prompts (or a `--suite=<name>` subset) against the live Ask MMT endpoint, scores via judge, posts to Langfuse. |
| `baseline.md` | Locked scores from the V1 baseline run. Every later sprint must beat (or at minimum not regress against) these numbers. |

## Suites

`run-eval.js` accepts `--suite=` to run a subset:

| Suite | What | Used by |
|---|---|---|
| `all` | All 100 prompts | Nightly cron |
| `phase1-mid` | 30 prompts mid-Phase-1 sanity check | DM-303 gate |
| `phase1-final` | All 100 + transcript suite | DM-404 gate |
| `transcript-suite` | 17 turns from the original failure-mode transcript | Phase 1 end gate |
| `personalized` | 20 turns that exercise memory + personalization | DM-604 |
| `actions` | 20 platform-action turns | DM-704 |
| `brief-quality` | Capture-brief evaluation set | DM-803 |
| `phase2` | Memory + actions + brief | Phase 2 end gate |
| `phase3` | + coaching + narrative + multi-channel | Phase 3 end gate |

## Scorers (4 axes, 1–10 each)

1. **Faithfulness** — answer matches `ideal_answer` semantically; no hallucinated facts.
2. **Voice match** — Mary's voice per `services/digital-mary/prompts/voice-rules.md`. Penalizes corporate hedging, generic AI tone, missing "what to do" close, and any banned scaffolding terms.
3. **Action correctness** — for platform turns, the right `[ACTION: <name>]` is invoked with sensible params. Trap turns score 10 only if the agent *correctly refuses or disambiguates*.
4. **Latency** — wall-clock seconds from request to first token, normalized 1–10 (≤ 2s = 10, ≥ 30s = 1).

Trap rows score 10 ONLY if the helper correctly refuses or disambiguates.
A confident wrong answer on a trap row scores 1.

## Running locally

```bash
# Dry run — load and validate the golden set, no API calls
node eval/run-eval.js --dry-run

# Full eval against local Ask MMT
node eval/run-eval.js --target=http://localhost:3000/api/ask-mmt

# Subset
node eval/run-eval.js --suite=transcript-suite

# Compare against the baseline
node eval/run-eval.js --against-baseline
```

## Nightly schedule

`.github/workflows/nightly-eval.yml` runs at 03:00 UTC, posts a one-line
summary to `EVAL_SLACK_WEBHOOK`. If any scorer drops more than 0.5
below baseline, the action exits non-zero and Slack gets a regression
alert.

## Baseline rules

`baseline.md` is the locked floor. Update only with explicit Mary sign-off
(e.g., when a major prompt or model change deliberately reshapes the
voice scorer's expectations).
