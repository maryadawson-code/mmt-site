# Sprint 2026-09-22 — why every State Medicaid row said "not yet covered", and the fill

Mary, from the State Medicaid coverage page: "figure out why these all say
not yet covered and fix it." Every one of the 56 rows carried the same line:
`Not yet covered: procurement_portal_url; mes_modernization;
work_requirements_status`.

**Why.** The 2026-09-20 research pass ran behind a session proxy that
blocked every external page fetch, so it filled only what search snippets
supported: agency, program, official site, expansion status, GovRAMP.
The three fields that need a page read stayed `null` on all 56 rows, and
the schema note said so. The page rendered the gap honestly and rendered
nothing else, because it had no code to show those fields even when
filled, and Ask MMT's context rendered only one of the three.

**The fill.** Six research agents (about ten jurisdictions each) worked
from the desktop, where page fetches and live URL checks succeed, under
the truth contract written into the prompt: every fact from a page opened
or a snippet read in the session, https source with a retrieved date,
confidence high only for official state, federal or NASPO pages, voice
rules enforced, null with a gap reason when nothing supports a field.
Their JSON went through a new merge script rather than hand edits:

- `scripts/merge-state-medicaid-research.js`: a field is filled only with
  an https source; text ends `As of YYYY-MM-DD.` naming the source
  statement's date; the field leaves `pending`; `verified` moves forward
  and never back; a record's confidence drops to medium when any fact in
  it is medium; a portal already verified in `state-procurement.json`
  wins over research and a disagreement is reported; text that breaks a
  voice rule is skipped and reported, never rewritten. Eleven unit tests.
- Order of application: the six batches, then module facts already on
  file in `state-procurement.json` (filled Massachusetts), then a KFF
  tracker fallback for work requirements (page dated 2026-09-09), so a
  state's own notice always wins and the tracker only fills what no state
  page covered (Alabama, Mississippi).
- Every recorded portal URL was re-checked from this session with a
  browser user agent: 52 of 56 answer 200. Arkansas blocks bare clients
  but opened in the fetch tool and is recorded that way.

**Result: 56 rows, 53 portals, 53 modernization statuses, 56
work-requirement statuses, all sourced.** What stays pending, with the
reason on the row: portals for New Hampshire (the DAS bids page returns
403 to every automated client), South Dakota (no government-domain bid
board reachable; sdbuys does not resolve) and the Northern Mariana Islands
(the RFP site times out); modernization status for Delaware, Oregon and
South Dakota (no state page found). The five territories' work-requirement
rows cite the CMS bulletin of 2025-12-08, which says the provision does
not apply to territories.

**Corrections to what was on file.** Washington's only solicitation row,
RFP 2025HCA15, was recorded as an MES notice with its subject unread; the
agent read it and it is a mail order incontinence supplies RFP, so the row
is gone and Washington's solicitation coverage reads not covered with that
reason. Nebraska's work-requirement text, previously "secondary reporting;
confirm against the state's own notice", now cites DHHS's 2026-04-02
release and the Governor's 2025-12-17 release.

**Rendering.** `premium/state-medicaid.html` gains a Procurement portal
column and two labelled lines under the agency (MES modernization, Work
requirements); the expansion tile reads its KFF date from the expansion
source instead of the dataset date. `lib/reference-context.js` puts the
portal and modernization text on Ask MMT's state line. The pinned test
date in `tests/unit/reference-data.test.js` moved to 2026-09-22, and the
validator-teeth test names the pending field it fills instead of relying
on all-null data.

**Worth Mary's eye.** Michigan's CHAMPS contract (071B6200168C) expires
2026-09-30 with no re-procurement notice found. Florida's AHCA page says
the FX project in its current form is closing. Vermont is drafting an
MMIS Core Claims and Fiscal Agent RFP (10-year term, Gainwell extended
through DDI). Tennessee's non-expansion status does not exempt it: CMS
found a small group of parents subject, met automatically from income
data. Montana, Nebraska, Iowa and Arkansas implement work requirements
before 2027-01-01.
