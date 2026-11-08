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
| Reported (LinkedIn, OrangeSlices AI, or a DHA article MMT read without recording the title) | Matthew Motley (P2P Lead), Dr. John de Geus (Information and Innovation Lead), Erick Vines and Tari Rangel (BID), Lt Col Joshua Erlandsen (HIDI Core Applications Branch Chief), Jillian Kozub (XO), Zachary Sonnier (CHIO), Christine Sordillo (Deputy SPE), Lennen's AUG to SEP 2026 Deputy AD-SPFO stint and October start. | "Reported, pending confirmation" badge; key-people entries say "(reported)" in the title and name the page in `verification_note`. |
| Lead, not applied | Timothy Link (joined OWHA SEP 2026, no title stated), Amanda Edwards (Reporting Lead). | Named only inside the Lennen detail panel; no node, no key-people row. |

Left alone on purpose: the ARMOR workforce-readiness RFI, the Kreative
Technologies follow-on, and the Salesforce footprint at DHA. They are
capture leads, not org-chart facts, and the only ARMOR source is a LinkedIn
post. Sean Donohue is at Planned Systems International, not OWHA; nothing to
chart.

## What shipped

- `data/key-people.json`: six new DHA rows (Caban, de Geus, Motley, Vines,
  Sonnier, Sordillo), Lennen's row updated, block note explains the grading,
  `_schema.last_updated` 2026-11-08.
- `premium/org-charts/dha.html`: an "OWHA Sub-Units (reported)" fold under
  the Office of the Director row with six cards (CDAO, P2P, Information and
  Innovation, HIDI with the chief seat open, BID with placement unconfirmed,
  XO), five new detail panels, Lennen's panel carries the front-office
  names, hero meta and sources footer dated.
- `data/premium/agency-profiles/agencies.json`: DHA `key_offices` OWHA line
  and `current_read` carry the same grading; `lastUpdated` 2026-11-08.
- Corpus and graph snapshot regenerated.

## Open seats and questions

- Who leads HIDI. The chart shows the seat open.
- Who leads the former DIG functions, if not de Geus.
- Whether BID moved under OWHA or stayed in J-8.
- Timothy Link's title.
- Which office owns the ARMOR RFI.

Each closes only from a dha.mil or health.mil page, per the standing rule.
The Monday `leadership-roster-snapshot` run will not catch these: the
dha.mil Organizational Structure page lists six principals and no OWHA
staff, so the first official source is likely a DHA news article or the
CDAO page gaining names.
