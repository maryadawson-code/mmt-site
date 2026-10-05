# Sprint 2026-10-05: the leadership watch updates the site

Mary: "I for this email today and realized you aren't updating. Look at all
updates that have been identified and ensure the site is updated. Do not
wait for me to review in the future." The email was the weekly
`[MMT Watch] 7 agency leadership pages changed this week`.

## What was wrong

- `org-chart-monitor` hashed each page and emailed "changed". It stored no
  text, so nobody could say what changed, and it said so in its own header
  comment: "Auto-update the org chart HTML files: Mary owns those edits."
- Two of its twelve URLs were dead: the health.mil DHA page and
  `va.gov/oig/leadership` both 404. A non-200 counted as "fetch failed",
  which is silent, so DHA and VA had not been watched for weeks.
- The FDA target (`fda.gov/about-fda/fda-organization`) names nobody.
- hhs.gov and nih.gov answer 403 to every non-browser client.
- A Claude session cannot reach any .gov host (egress policy), so even with
  the email in hand it could not read the page the chart is built from.

## What shipped

**The feed.** `scripts/snapshot-leadership-pages.js` runs in
`.github/workflows/leadership-roster-snapshot.yml` (Mondays 10:30 UTC, half
an hour before the Netlify monitor; also on push to a `leadership-watch-*`
branch) and commits each page's visible text to
`data/leadership-snapshots/<slug>.txt`, with `index.json` (retrieved_at,
status, sha256, which URL answered) and `CHANGES.md` (lines added and
removed). On main it opens a `[MMT Watch]` PR carrying the diff. Primary URL,
then fallbacks; a bot-block status gets one headless Chromium attempt.

**One target list.** `netlify/functions/lib/org-chart-targets.js` holds the
12 pages, their fallbacks and the text reducer, shared by the Action and the
monitor so both see the same lines. DHA now reads dha.mil, VA the Official
Biographies index the chart already cites, FDA the leadership profiles,
NIH the leadership page.

**The monitor.** `org-chart-monitor` keeps last week's text in Netlify Blobs,
writes an `org_chart_change` ops_event with the added and removed lines,
emails those lines per agency plus every page it could not reach, and
claims the day through `cron-claim`. The first run after this deploy seeds
text and sends nothing (a baseline, not twelve cosmetic "changes").

**The charts.** From the Oct 5 snapshots of the 8 reachable pages:

| Agency | Change |
| --- | --- |
| ARPA-H | Gene Civillico is Director of Health Science Futures (Tyler Best, Acting Director in Aug, is Deputy). Scalable Solutions lists no leadership (Natalie Kates gone). Catherine Stevens listed as Business Innovation Division Director, the billet in recruitment since April; HCA designation pending the HHS roster, Benjamin Bryant stays Acting HCA per that roster. Sara Reistad-Long (Chief Strategy Officer), Amy Lin, Rehana Mohammed added. 28 program managers (Proactive Health 7 to 8). |
| ONC | Sam Kaardal is Chief of Staff (was Deputy NC, Interoperability). Matt Swain is Chief of Strategy and Engagement (was Chief of Staff). Mark Atalla, Deputy NC for Policy, is no longer listed. The page's own "Last Updated" label still reads April 1, 2026. |
| IHS | Rear Adm. Kelly Battese and Capt. Joe Bryant (Acting) fill the two Field Operations deputy seats listed Vacant in Aug. Kim Hartwig, Director of Strategic Initiatives, is new. Office of Public Health Support is Acting (Robert Pittman; Frazier gone). The DAP staff page lists Jeffrey Johnston as Deputy Director and Magdalenda Hudson as Senior Technical Advisor, resolving the Aug conflict. |
| DHA | dha.mil Our Senior Leaders lists Mr. William Walker as Assistant Director, Healthcare Administration and Operations, with no Acting label. The chart and key people had Brig. Gen. Bill A. Soliz Acting since April. Walker's start date is not on the page and is marked pending official confirmation. Nothing else on the DHA chart was touched (dha.mil names only the six senior leaders, and the rest is Mary-vetted). |
| FDA | The leadership profiles page (content current Sep 9, 2026) lists Michael Davis (CDER), Karim Mikhail (CBER) and Bret Koplow (CTP) as Director, no longer Acting. Jared Seehafer is new as Deputy Commissioner for Technology and Artificial Intelligence. |
| CDC, CMS, GSA, NIH, VA | Nodes re-verified, no change. GSA directory (dated Oct 2) also lists Paul Ingrassia as Acting General Counsel. The VA Official Biographies index shows only its first page of 115 bios; the ten charted names on it match. |
| HHS | Not reached: hhs.gov answers 403 to curl and to headless Chromium. The HCA roster stays at its Aug 25 pull, which is why Benjamin Bryant remains ARPA-H's Acting HCA on the chart while Catherine Stevens is listed as BID Director. |

`data/key-people.json` (ARPA-H and DHA blocks) and the ONC profile contact
follow the charts; corpus and graph regenerated.

**Snapshot run facts.** Run 1 (plain fetch): 8 of 12 reached; DHA and VA
404 (dead URLs), HHS and NIH 403, FDA reached but its page names nobody.
Run 2 (fallback URLs plus Chromium for bot blocks): 11 of 12 reached, NIH
via the browser, HHS still 403. Four pages "changed" by hash with an empty
line diff (nav order), so "changed" now means a visible line was added or
removed, in both the Action and the monitor.

## Rules (one line is in CLAUDE.md)

- A page that was not reached is "not reached", never "unchanged". The old
  monitor's silent `continue` hid two dead URLs for weeks.
- The Action's snapshot is the only official-page read a session has. Edit
  the chart from the text, cite the snapshot date, and annotate anything
  the page does not state (an HCA designation, a departure reason) as
  pending official confirmation.
- `workflow_dispatch` only exists once the file is on main; a push trigger on
  a `leadership-watch-*` branch is how a working session gets a fresh pull.
