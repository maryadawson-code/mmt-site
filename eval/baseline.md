# Digital Mary Eval Baseline

**Captured:** 2026-05-07 (Sprint P0-1 / DM-004)
**Target:** Ask MMT V1 (`/.netlify/functions/premium-assistant`)
**Golden set version:** HANDOFF-PACKAGE.md §2 (100 prompts authored by Mary)

## Locked floor

Every later sprint must beat (or at minimum not regress more than 0.5
points below) these scores on the `all` suite. `run-eval.js
--against-baseline` parses the JSON block below and exits non-zero on
regression.

```json
{
  "suite": "all",
  "captured_at": "2026-05-07",
  "n": 100,
  "means": {
    "faithfulness": 3.99,
    "voice_match": 3.84,
    "action_correctness": 7.33,
    "latency": 6.02
  },
  "target": "netlify/functions/lib/premium-assistant.js (V1 Ask MMT)",
  "notes": "Locked baseline. Every later sprint must beat or not regress more than 0.5 below these means on the same suite. See eval/baseline.md update protocol."
}
```

## Update protocol

`baseline.md` is the locked floor. Update only with explicit Mary
sign-off:

1. Run `node eval/run-eval.js --target=<endpoint>` against the V1 system.
2. Open the resulting `eval/reports/eval-all-<timestamp>.json`.
3. Copy the `current.means` block into the `means` object above.
4. Set `captured_at` to the run date and bump the commit message:
   `chore(eval): lock V1 baseline at <date>`.
5. Push as a single PR. Mary approves before merge.

After the baseline is locked, every sprint runs `--against-baseline` in
its gate check. A regression > 0.5 on any axis fails the gate.
