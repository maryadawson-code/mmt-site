# Closeout — Production /data/*.json Deploy

Generated: 2026-05-15
Scope: Phase 2 verification of `671c047` (build: copy data/*.json to dist) +
Phase 3 investigation of dashboard "Latest Friday Brief" tile staleness.

## TL;DR

Production fixed. The four premium pages that fetch `/data/<file>.json`
client-side (single-bidder, key-people, cr-exposure, forecast-delta) had
been 404-ing in prod since Sprint 5 (2026-05-07) because `build.js`
never copied top-level `data/*.json` into `dist/`. Fix shipped in
commit `671c047`. All four URLs verified `HTTP 200, application/json,
valid JSON` against `https://missionmeetstech.com`. Dashboard tile
issue was a deploy-timing artifact and self-corrected with today's
rebuild; no code change required there.

## Verification

### Live deploy

```
$ curl -s https://missionmeetstech.com/deploy-id.txt | head -2
commit: 671c047a91d3bdd92b680f5f33068a4ce42d5879
branch: HEAD
```

### Mary's gate (HTTP 200 not 404)

```
/data/cr-deadlines.json      → 200  application/json  {_schema, deadlines, appropriations_status}
/data/forecast-portals.json  → 200  application/json  {_schema, agencies}
/data/single-bidder.json     → 200  application/json  array[613]
/data/key-people.json        → 200  application/json  {_schema, agencies}
```

### IntegrityPulse final audit

```
=== SUCCESS/SYNCED ===
40 routes, 0 drift, 0 HTTP failures
```

### Dashboard "Latest Friday Brief" tile (Phase 3)

After today's rebuild, the tile correctly reads:

> SCMDSO Intelligence Brief — Solicitation 36C10B26Q0376  
> May 15, 2026  
> [Read this brief →](/premium/briefs/capture-corner-2026-05-15.html)

Root cause of the earlier May 12 leak: the previous prod build ran
2026-05-14 18:58 UTC, at which point the May 15 capture corner was
future-dated and got filtered by the `_ts > _archiveNowMs` guard
at `build.js:4314`. No code change needed — the tile self-corrected
on the first rebuild after 00:00 UTC May 15.

## Cross-agent guard

Two untracked items in the main repo were left untouched per the
cross-agent contract:

- `eval/reports/` — directory created by another agent
- `MORNING_REPORT.md` — file created by another agent

Local main was fast-forwarded once during this session to pick up
`a81113f` (Signal Chain SC-OPS fix from PR #86, another agent).

## Follow-up tickets (filed separately)

- `reports/ticket-20260515-opportunity-radar-refactor.md`
- `reports/ticket-20260515-key-rotation.md`

## Deploy history (this session)

| Commit | State | Notes |
|---|---|---|
| `671c047a` | ready | data/*.json copy fix — live |
| `492f9cc7` | ready | premium prefs seed + welcome backfill + May 15 article fix |
| `f2ce44b7` | ready | validator + click-path repair + May 15 release (via ff) |
| `0947d428` | error | click-path repair (failed on capture-corner-inventory) |
| `e61a6cf0` | error | May 15 release staging (failed on capture-corner-inventory) |

Both error deploys were superseded by `f2ce44b` via fast-forward, so
their changes ARE live; only the deploy attempts themselves errored.
