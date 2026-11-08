# Sprint 2026-11-08: OWHA staff on the DHA org chart

Mary handed MMT a research pass on the Office of Warfighter Health Advantage
(OWHA) and asked for the org charts to be updated. The pass drew on the
dha.mil CDAO page, two DHA news articles, LinkedIn profiles and OrangeSlices
AI. This session's container reaches no .gov host and no orangeslices.ai
host (every fetch returned no connection), so nothing below was read from a
live page here. The research is the source and each entry says which kind
of source stands behind it.

## Source grading applied

| Grade | Who | How it shows |
| --- | --- | --- |
| Official page (dha.mil) | Dr. Jesus Caban, CDAO; Junayd Park, Application Prototyping and Integration Lead for AI. MMT already cited the same CDAO page on 2026-11-03. | Normal node, "dha.mil CDAO page" badge. |
| DHA-authored DHITS 2026 deck (August 2026, in `data/dhits-2026-slides.json` and `/premium/dhits-2026`) | Matthew Motley (P2P Lead), CDR John de Geus, MD (Information and Innovation Lead), Dr. Saad Khan (Chief, Medical Device Integration Branch, HIDI, OWHA), Cindy Sacra and Mike Ross (HIDI, OWHA), Lt Col Zachary Sonnier (Deputy CHIO at DHITS), Dawn Herman and Beatrice Collazo (Data and Analytics), Christine Sordillo (Strategic Acquisition Advisor at DHITS), COL Marcus Moss (Deputy PAE Medical Digital Solutions). | "DHITS 2026 deck" badge; key-people title without "(reported)"; `verification_note` quotes the presenter line and says "not yet on a dha.mil page". |
| Reported (LinkedIn, OrangeSlices AI, FEHRM Summit program) | Erick Vines and Tari Rangel (BID), Lt Col Joshua Erlandsen, Michele McCormick, CDR Lillian White (HIDI), Jillian Kozub (XO), Sonnier as CHIO, Sordillo as Deputy SPE, Dr. Kevin Kaps, Lt Col Colby Uptegraft, Chris Kittrell (CDAO team), Lennen's AUG to SEP 2026 Deputy AD-SPFO stint and October start, the I&ET Division with Pathfinder and Forge branches, the TWMT and IMPRT tool names. | "Reported, pending confirmation" badge or a "(reported)" title; detail-panel lines name the kind of source. |
| Lead, not applied | Timothy Link (joined OWHA SEP 2026, no title stated), Amanda Edwards (Reporting Lead), Dr. Rebecca Rough (Chief Innovation Officer, placement unconfirmed), Dr. Pauline Swiger and Col Kristen DeWilde (innovation directors, placement not stated). | Link and Edwards are named inside the Lennen detail panel; the rest have no node and no key-people row. |

## Second pass: the OWHA territory map

Later the same day Mary uploaded her "OWHA Territory and Stakeholder Map
for Salesforce" (as of 2026-11-08), built from all 57 DHITS 2026 session
decks plus LinkedIn, OrangeSlices AI and DHA pages. The decks are already in
the repo, so the presenter lines were checked against
`data/dhits-2026-slides.json` before anything moved up a grade. What the
second pass changed:

- OWHA reports to the DHA Deputy Director (the 20 APR 2026 chart, as MMT's
  own 14 JUL 2026 premium update says); the Lennen panel had said "reports
  directly to DHA Director".
- Motley and de Geus moved from "reported" to "DHITS 2026 deck". de Geus is
  carried as CDR John de Geus, MD, USN.
- HIDI gained Khan, Sacra and Ross from the decks; McCormick and White as
  reported. Sonnier is Deputy CHIO on the deck and CHIO only by report.
- A Digital Health Integration (Digital First) card with the lead seat open.
- COL Marcus Moss: the DHITS acquisition panel lists him as Deputy
  Portfolio Acquisition Executive, Medical Digital Solutions (AUG 2026);
  the chart had him only as Acting PEO Medical Systems at IOC.
- Dawn Herman added to key-people (DHITS deck); the TWMT and IMPRT tool
  names are the map's, not in the deck text MMT holds, and say so.
- Funding gate line in the Lennen panel from the DHITS recording: functional
  sponsor, then the WMSIB co-chaired with the Deputy CAE.

Not applied from the map, with the reason:

- **Arena and Scheideman, applied after Mary's call.** The map lists Brett
  Scheideman as Deputy CAE and reports RDML Ivonne Arena moving to TRICARE
  Health Plan with no new title posted. The DHITS decks (AUG 2026) show
  Scheideman as Acting Principal Deputy RDA / Deputy CAE and Arena as
  Acting AD-RDA/CAE; the DHA Director's 21 SEP 2026 leadership message had
  named Arena Principal Deputy. The first pass kept the September message.
  Mary then said to default to the August decks (2026-11-08), so the chart,
  key-people and agency profile now carry Scheideman as Acting Principal
  Deputy / Deputy CAE and Arena as former Acting CAE with her current seat
  not publicly posted; the TRICARE move stays a reported item pending
  official confirmation. Both verification notes say the September line
  was set aside and by whom.
- ARMOR milestones (governance cell OCT 2026, workload capture 30 JAN 2027,
  DMHRSi retirement 31 MAR 2027, credentialing MAR to SEP 2027). The map
  does not name the deck or page they came from and the DHITS data MMT
  holds carries only the 90-day prototype framing. They belong in the
  contract tracker or a CSO signal once sourced, not on an org chart.
- "All of SIG except DHA Governance": MMT's 14 JUL 2026 read of the same
  chart says "most SIG functions"; kept.
- Salesforce footprint, Kreative follow-on, Army, Air Force and VA
  comparables: capture context, not chart facts.
- Dr. David Krulak and Curt Prichard (TRICARE Health Plan), Chris Nichols
  (EIDS): outside OWHA and outside the change Mary asked for.

Left alone on purpose: the ARMOR workforce-readiness RFI, the Kreative
Technologies follow-on, and the Salesforce footprint at DHA. They are
capture leads, not org-chart facts, and the only ARMOR source is a LinkedIn
post. Sean Donohue is at Planned Systems International, not OWHA; nothing to
chart.

## What shipped

- `data/key-people.json`: seven new DHA rows (Caban, de Geus, Herman,
  Motley, Vines, Sonnier, Sordillo), Lennen's row updated, block note
  explains the grading, `_schema.last_updated` 2026-11-08.
- `premium/org-charts/dha.html`: an "OWHA Sub-Units (reported)" fold under
  the Office of the Director row with seven cards (CDAO, P2P, Information
  and Innovation, HIDI with the division head open, BID with placement
  unconfirmed, Digital Health Integration with the lead open, XO), six new
  detail panels, Lennen's panel carries the reporting line and front-office
  names, the Moss node carries his Deputy PAE MDS title, hero meta and
  sources footer dated.
- `data/premium/agency-profiles/agencies.json`: DHA `key_offices` OWHA line
  and `current_read` carry the same grading; `lastUpdated` 2026-11-08.
- Corpus and graph snapshot regenerated.

## Third pass: the revised territory map

Mary's revised map (same day, "Prepared by Mission Meets Tech") added public
sources and one new conflict. Applied:

- Dr. Matthew G. Clark: the map cites a DHA article of 04 NOV 2026 for his
  swearing-in on 21 SEP and the Senior Procurement Executive title. Carried
  as reported until the page is read.
- TRICARE Health Plan: Dan Gall, Director since JUL 2026, and Curt Prichard,
  Deputy (LinkedIn); Dr. David Krulak left in MAY 2026 (VA OIG biography).
  New card link and key-people row, all pending official confirmation.
- Sordillo's Deputy SPE seat dated October 2026 (LinkedIn).
- The DHA Governance Office moved to the HA/MHS Governance Liaison Office
  (20 APR 2026 chart), one line in the Lennen panel.

Not applied:

- **CUI-marked sources.** The revised map marks the 20 APR 2026 chart
  briefing, the June and 28 JUL 2026 AD-RDA All Hands (PAE MDS and PAE MS
  org charts) and a 2024 Salesforce Health Cloud portfolio brief as CUI.
  The names that come only from those (Bradley Prindle, Angie Hester, Laura
  Jo Tozzi, James West, Richard Morvatz, Perkins as Acting PAE MDS) and the
  license counts stay off a published page until a public source carries
  them. MMT's chart cites the 09 JUN 2026 All Hands as UNCLASSIFIED, and that
  stays the line.
- Perkins as Acting: the map cites a TEFCA release for the title. MMT
  carries him confirmed in the PAE MDS seat from the July 2026 confirmations
  Mary provided. Unresolved; not changed.
- Chris Nichols leaving EIDS for Leidos (OrangeSlices, 05 NOV 2026) and a
  successor named only as Kim: Nichols is not on the chart. Noted, not added.
- ARMOR milestones now trace to the FY27 Campaign Order and framework; they
  are tracker material, not chart material.
- **Arena and Scheideman, again.** The revised map reverts to Arena as
  Principal Deputy per the 21 SEP message, calls the TRICARE move
  "not confirmed by any public source or DHA message", and leaves
  Scheideman's seat open. That is the position the first pass held and the
  position Mary overrode an hour earlier. The chart stays on Mary's last
  explicit call (August decks) until she answers the question put to her.

## Open seats and questions

- Who heads HIDI as a division. The chart shows the seat open.
- Who leads Digital Health Integration (Digital First) now.
- Names of the I&ET Division Chief and the Pathfinder and Forge Branch Chiefs.
- Whether BID moved under OWHA or stayed in J-8.
- Timothy Link's title.
- Which office owns the ARMOR RFI.
- Arena's current seat: the reported TRICARE move needs a dha.mil bio change or a Director message.

Each closes only from a dha.mil or health.mil page, per the standing rule.
The Monday `leadership-roster-snapshot` run will not catch these: the
dha.mil Organizational Structure page lists six principals and no OWHA
staff, so the first official source is likely a DHA news article or the
CDAO page gaining names.
