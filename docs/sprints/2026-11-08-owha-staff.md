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

- **Arena and Scheideman.** The map lists Brett Scheideman as Deputy CAE
  and reports RDML Ivonne Arena moving to TRICARE Health Plan with no new
  title posted. The DHITS decks (AUG 2026) do show Scheideman as Acting
  Principal Deputy and Arena as Acting AD-RDA/CAE, but the DHA Director's
  21 SEP 2026 leadership message, which Mary provided, names Arena
  Principal Deputy AD-RDA/Deputy CAE after Clark took the CAE seat. The
  September message is later and more authoritative than an August deck or
  an unrefreshed dha.mil bio, so the chart keeps Arena as Principal Deputy.
  If Arena has since moved to TRICARE, the source is a new Director message
  or a dha.mil bio change, and that is Mary's call to confirm.
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

## Open seats and questions

- Who heads HIDI as a division. The chart shows the seat open.
- Who leads Digital Health Integration (Digital First) now.
- Names of the I&ET Division Chief and the Pathfinder and Forge Branch Chiefs.
- Whether BID moved under OWHA or stayed in J-8.
- Timothy Link's title.
- Which office owns the ARMOR RFI.
- Arena's current seat, if the reported TRICARE move is real.

Each closes only from a dha.mil or health.mil page, per the standing rule.
The Monday `leadership-roster-snapshot` run will not catch these: the
dha.mil Organizational Structure page lists six principals and no OWHA
staff, so the first official source is likely a DHA news article or the
CDAO page gaining names.
