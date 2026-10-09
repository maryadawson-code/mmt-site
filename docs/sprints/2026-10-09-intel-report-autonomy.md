# Sprint 2026-10-09: the Friday report stops assigning work to Mary

Mary, on the 2026-10-09 intel quality report: "Review and fix all, make sure
this doesn't happen again and nothing is held for me; these updates should be
happening autonomously."

## What was wrong

- **The weekly re-verify checked nothing.** `.github/workflows/
  contract-tracker-reverify.yml` ran every Saturday since 2026-08-24 with a
  `SAM_GOV_API_KEY` repository secret that SAM.gov rejects (`401
  API_KEY_INVALID` on every lookup, run 37102104098 on 2026-10-03). The script
  correctly refused to stamp an unearned date, wrote nothing, and the run
  exited green. 51 of 66 listings were past 45 days and the report told Mary
  to re-verify them against SAM.gov by hand. The Netlify copy of the key
  works (Ask MMT answers with it). A session cannot set a GitHub secret and
  cannot see the key, so the Action is retired rather than repaired.
- **Every section of the report ended in an instruction to Mary.** "Re-verify
  and bump last_verified", "write the next YYYY-MM.md", "reconcile: rename
  the row", "remediate with scripts/cleanup-opportunity-radar.js". Three of
  the four remediation scripts ran only by hand with prod credentials.
- **Three of seven stale AoIs could not change.** AoI 2 and 3 are awarded,
  AoI 4 is cancelled; nothing on SAM.gov can move them, yet their
  `last_verified` aged like an open window.
- **The report's radar scan read a seventh of the table.** `.limit(2000)` on
  PostgREST returns 1000 rows; the live table holds about 7,000.
- **Seven agency profiles were five months old**, two vehicle notes three
  months, the GAO sustain read five months.

## What shipped

**Contract Tracker and CSO re-verification, daily, on Netlify.**
`contract-tracker-reverify` (02:15 UTC) triggers
`contract-tracker-reverify-background` through `lib/trigger-background.js`.
The worker claims the day (`lib/cron-claim.js`), reads `contracts.json` and
`data/cso-aois.json` from main through `lib/github-contents.js` (extracted
from the pursuit-calendar seed refresh, which has committed to main this way
since MMT-PC-01), and checks each listing stalest first with
`lib/tracker-reverify.js`:

| Check | Source | What it proves |
| --- | --- | --- |
| `sam:solnum` | SAM.gov `solnum` filter (exact) | the notice's acquisition state proposes a status |
| `usaspending:recipient` | USASpending recipient search for an awarded entry's vendor | an award row carrying the entry's identifier (or a PIID in the same series, 36C10G26R0004 to 36C10G26D0004) or a signal term |
| `sam:title` | SAM.gov `title` filter on the first signal term | for an entry with no solicitation number |

`last_verified` moves only for an entry a live source answered for. A quota
refusal, a 401, a timeout or "no notice in the 364-day window" is not a
check. Every SAM.gov call is priority `scheduled` through `lib/sam-quota.js`,
so the subscriber reserve is never spent; the first refusal closes the SAM
path for the run and an awarded entry still gets its USASpending check.
`lib/cso-reverify.js` reads each CSO notice by its number(s): active and the
deadline agrees, bump the CSO and its non-terminal AoIs; deadline changed,
correct `active_through` with a dated note; archived, no bump and the reason
goes to the run record. What moved is committed to main (one commit per
file) and the build hook fires. The run writes a `TRACKER_REVERIFY_RUN`
ops_event with counts, status changes, SAM calls, and the reason for every
listing not reached. `scripts/reverify-contract-tracker.js` is a CLI over
the same lib. Kill switch `TRACKER_REVERIFY_DISABLED=true`. Caps
`TRACKER_REVERIFY_MAX_SAM` (12) and `TRACKER_REVERIFY_MAX_USA` (30).

**Orphans reconcile themselves.** `lib/orphan-intel.js` plans a rename (only
copy) or delete (stale duplicate) by alias, normalized name, a shared
solicitation number, or the name without its parenthetical, each validated
against the live roster; `contract-intel-refresh-background` runs it before
its roster loop and reports counts on `contract_data_refresh`. The CCN
Dental row the report listed resolves by identifier to the 2026-10-05 name.
`scripts/reconcile-orphan-intel.js` is a CLI over the lib.

**Radar hygiene runs daily.** `planRadarArchive` and `findDuplicateLosers`
live in `lib/radar-hygiene.js`; `lib/radar-rows.js` reads the live table in
`.range()` pages and archives a plan with one ops_event per row.
`opportunity-radar-url-recheck` runs the sweep after its URL pass (cap 300 a
run); `scripts/cleanup-opportunity-radar.js` is a CLI over the same code.
The report's fabrication scan reads the whole table.

**Terminal AoIs do not age.** `scripts/validate-cso-aois.js` and the report
skip awarded and cancelled AoIs. 7 stale became 4, and the 4 are the daily
worker's.

**The report names owners.** A "What ran this week" block lists the three
daily owners with their last run; each section says which function or
session owns it, what the last run did, and what it left for the Friday
session. No sentence tells Mary to do anything.

**The Friday Routine.** "MMT intel quality: clear the Friday report" fires
Fridays 07:23 ET in a fresh session: runs the validators, re-verifies stale
profiles and vehicle notes from in-repo dated sources and the runner
snapshots, writes the monthly GAO sustain and forecast delta reads from
cited sources, sources the listings the daily worker cannot look up, adds an
alias for an orphan that matched nothing, and merges its own PR when the
build is green. It reports what it could not reach rather than filling it.

## The backlog, cleared in this session

- **Seven agency profiles** (hhs, onc, arpa-h, gsa, ihs, cdc, fda)
  re-verified against the October 5 leadership snapshots, key-people, the
  tracker, the October Capture Intelligence sheet, the September forecast
  pull, the CR dataset and the reference layer; `lastUpdated` 2026-10-09.
  Strongest corrections: HHS FY2027 request was $131B (+3.1%) and is $112.2B
  (down 12.8%) per `data/budget-signals.json`; ONC's Jason Funderburk is
  Deputy National Coordinator, not a contractor; ARPA-H is requested at
  $945M, not zeroed; GSA's ITC no longer exists; CDC's CSELS is not on the
  August 21 leadership page; FDA's $7.2B was the request, not enacted; IHS
  FY2027 request is $9.094B. Every WebSearch-sourced claim (budget lines)
  carries a `sources[]` entry with a caveat. Each profile's change log is in
  the session scratchpad; the "unverified, left as written" residue is
  honest and mostly rests on May page reads nobody can re-fetch.
- **Known vehicles**: SEWP VI (SEWP V through January 31, 2027, go-live
  November 1, 2026, per the August 25 status board and the October sheet),
  DHITUC (re-checked, unchanged), Alliant 3 (43 Phase 1 awardees of 76, also
  corrected in `data/research-agent/idiq-vehicles.csv` and the regenerated
  `data/idiq-vehicles.json`).
- **GAO sustain, October read**: B-424487, LJR Solutions v. NIH, August 14,
  2026, a Rule of Two sustain on RFP 75N98026R00042, which is the tracker's
  `nih-scientific-technical-support-services-idiq-3b`. The tracker entry
  carries the dated note and the GAO and Bloomberg Government sources.
- The contracts.json and cso-aois.json listings themselves wait on the
  worker's first runs: a session has no .gov egress.

## Held, and why

- **Nothing for Mary.** The invalid GitHub secret needs no fix; the Action
  that used it is gone. If she wants it, `netlify env:list` shows whether
  `SAM_DAILY_QUOTA` is 1000 (the with-role tier the 2026-09-14 note records)
  or the 10-a-day default; at 10 the worker gets at most 4 scheduled calls a
  day across every cron and the report's "quota blocked the rest" line says
  so.
- The April 7, 2026 issue says "ARPA-H is zeroed"; the agency's FY2027 CJ
  requests $945M. Mary's published prose is not edited by a session.
- The forecast pipeline re-pull needs a runner-side fetch of eleven .gov
  portals (the leadership snapshot pattern). The Friday Routine writes the
  monthly read from what it can reach and says what it could not.

## Rules (in CLAUDE.md)

- The Friday report assigns nothing to Mary; every section names its owner
  and its last run.
- A GitHub Action that needs a secret proves the secret works in its log.
- Hand-maintained status and `last_verified` on the tracker and the CSO
  registry are the daily worker's; a session bumps them only with a source.
- An awarded or cancelled AoI does not age.
- A Supabase scan reads `.range()` pages, never one `.limit()` above 1000.
