# 2026-11-27: Friday intel quality, the silent refresh and the starved CSO pass

The 2026-11-27 report arrived with contract-intel-refresh "last ran 2026-11-17
(239h ago)", one orphaned `contract_intel` row, 56 of 70 tracker listings past
45 days with 23 "need the Friday session", every CSO "not confirmed: SAM.gov
budget for scheduled work spent today", and four hand-maintained datasets past
cadence. This session cannot reach .gov, sam.gov, gao.gov or api.perplexity.ai
(every probe returned no connection), so it fixed what code and in-repo sources
support and left the rest visible.

## Found

1. **The daily refresh died silently for ten days.** `contract-intel-refresh-background`
   checked a 13-minute budget between contracts, but one contract is two
   Perplexity calls of up to 120 s each with three attempts apiece: a slow
   upstream lets one contract run twelve minutes, the check never fires, Netlify
   kills the worker at 15 minutes with no exception, and the only trace the
   worker wrote was its completion log. The ledger therefore showed nothing, the
   trigger's `_RUN_OK` looked healthy, and the report could only print the
   symptom. The cause on the platform side (a slow Perplexity, a stuck fetch) is
   not knowable from here; the fix removes the mechanism that made it silent.
2. **The CSO pass never got a SAM call.** The reverify worker spends the day's
   twelve scheduled SAM.gov calls on listings first; the CSO registry runs after
   and found the budget gone every day, so "0 CSO notice(s) read" was structural,
   not a quota incident, and AoI 1b sat at 102 days.
3. **One orphan was a rename.** `DHA Data Governance (WOSB Set-Aside)` is the
   pre-2026-10-19 name of `DHA Data Governance / Data Methods and Strategy
   (HT001126CE015)`; the parenthetical stripper cannot bridge the added
   " / Data Methods and Strategy", so it needed an alias.
4. **23 listings were "session-only" for want of a search term.** Fifteen of them
   have a program name distinctive enough for the `sam:title` path (Health Care
   Delivery Solutions, DHMSM, Data Integration Building Blocks, Cloud Broker
   Service, CIO-CS, Disability Case Processing System, and so on).

## Done

- `lib/run-budget.js` (`planSlot`, `withDeadline`): each contract runs in its own
  time-box that ends 30 s inside the platform wall (4 min cap, 90 s minimum), the
  box aborts both Perplexity calls and stops their retries, a contract that
  overruns counts as an error (`time_boxed` in the completion event) and the loop
  moves on. Unit-tested, including the exact 12m59s case the old check let
  through.
- The worker writes `contract_data_refresh_started` on entry and
  `contract_data_refresh_refused` (kill switch, missing env, including the
  Perplexity key it actually uses) on an early exit. `intel-quality-report`
  reads start, refused and the trigger's `CONTRACT_INTEL_REFRESH_RUN_OK` beside
  the completion log and prints which failure the ledger supports
  (`_diagnoseRefresh`, unit-tested).
- `contract-tracker-reverify-background` holds back one SAM call per CSO
  solicitation number (never more than half the budget) from the listing pass;
  `cso_sam_reserve` is in the run summary. Test: four SAM-needing listings on a
  budget of four still leave the CSO its two calls.
- `orphan-intel.js` alias for the Data Governance rename, tested against the
  live roster.
- `contracts.json`: `signal_terms` on fifteen listings so the daily worker owns
  them. Eight stay session-only on purpose: EHRM and FEHRM (one is a substring of
  the other and both are programs with many support notices), T-5 (a T-6 notice
  would flip the row), Zero Trust 2.0 / GSP (a strategy, not a notice), VA ERP,
  TSS 3.0 and CSOC (titles every agency uses), DHA Enterprise GenAI (no notice
  title known).
- CCN Next Gen Medical: a Nov 27 note on the tracker row and a rewritten
  `known-vehicles` note (verified 2026-11-13 against the Nov 13 brief). The brief's
  third-party index lists four IDCs signed Aug 31, 2026; a web-search check on
  Nov 27 found no VA News, SAM.gov or USASpending confirmation, so the status
  stays active and the award stays pending official confirmation. No
  `last_verified` bump.

## Left visible, and why

- **Capture Intelligence sheet (53d), GAO Sustain read (49d), forecast pipeline
  (78d), state procurement (68d).** Each needs a live read of gao.gov, agency
  forecast portals, state portals or SAM.gov. None is reachable from this
  session. A web search for a November 2026 health-related sustain found GAO's FY2026
  annual report and two November denials, and a denial never goes in the
  tracker. These stay on the Friday list until a session with that reach, or
  Mary's own read, supplies a dated source.
- **AoI 1b (HT003825SC001, 102d).** Closed, award expected December 2026. No
  official award found; aggregator pages say "estimated award 12/2026". The CSO
  base notice archived July 16, 2026, so the daily worker will read it as
  inactive and not bump it; the entry moves only when an award or cancellation
  is published.
- **Stale `contract_intel` rows.** The time-box lands with this PR's deploy;
  the first run after it should write a completion event with `time_boxed`
  counted. If the next report still reads "never wrote its completion log",
  narrow `perItemMaxMs` in `lib/run-budget.js`.
