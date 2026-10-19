# Sprint 2026-10-19: HHS and NIH "not reached" in the org-chart watch

Mary forwarded the Monday `org-chart-monitor` email:

```
NOT REACHED
HHS: .../hca-and-key-managers/index.html -> HTTP 403
NIH: .../nih-leadership -> HTTP 403; .../nih-director -> HTTP 403
A page that is not reached is not "unchanged". A 404 on every URL means the
page moved; fix the target in lib/org-chart-targets.js.
```

## What was true

- Neither page moved. Both hosts answer 403 to any non-browser client. The
  email's only footer was written for a 404 and told Mary to fix a target
  that is correct.
- NIH is covered. The Monday `leadership-roster-snapshot` Action read
  nih.gov through headless Chromium on 2026-10-05 and 2026-10-12 (200,
  unchanged). The Netlify monitor runs in a Lambda with no browser, so it
  will say 403 every week; that is a fact about the Lambda, not a to-do.
- HHS is dark. hhs.gov refuses headless Chromium too (403 on both Mondays).
  Nobody has read the HCA roster since the 2026-08-25 pull, which is why the
  ARPA-H HCA node still waits on it.
- The 2026-10-12 Action run (6 pages changed, HHS not reached) is on the
  `roster-snapshot` branch, unmerged: CDC lists Mina Zadeh as Acting Chief
  of Staff; FDA no longer lists Sanjay Kumar Sahoo as Acting CIO; DHA, VA,
  ONC and CMS moved only banner, nav and label lines.
- This session's container resolves no .gov host and no archive.org host,
  so nothing below was verified against a live page from here; the Action
  run on this branch is the verification.
- The 2026-10-12 scheduled run on main failed at "Open snapshot PR":
  "GitHub Actions is not permitted to create or approve pull requests."
  The snapshot was committed to `roster-snapshot`, and no `[MMT Watch]` PR
  ever opened, which is why nobody picked it up. Repository setting,
  Mary's to flip: Settings, Actions, General, Workflow permissions, allow
  GitHub Actions to create and approve pull requests. Until then the
  workflow files the diff as an issue instead (below).

## Action runs on this branch

| Run | Result |
| --- | --- |
| 11:47 UTC, first push | 7 changed, 1 not reached. NIH 200 through Chromium. HHS: live 403, Chromium 403, archive availability answered, raw capture fetch answered HTTP 429 from web.archive.org on the first request. |
| 11:51 UTC, second push (retry on 429) | 0 changed, 0 not reached, HHS first snapshot: 260 lines from the Internet Archive capture of 2026-10-13 10:52 UTC, `via: "archive"`, live page still 403 to both clients. The HCA roster in that capture matches the chart's Aug 25 table line for line (Bryant still Acting at ARPA-H, Godfrey and Bergevin Acting, the rest permanent). No HHS chart edit needed; the ARPA-H HCA node stays as it is, now with an Oct 13 source behind it. |

## What shipped

- `lib/org-chart-targets.js`: `classifyAttempts()` names a failed trail
  `blocked` (every URL a bot-block status), `moved` (404/410 everywhere) or
  `unreachable` (timeouts, 5xx). HHS carries `archive_fallback: true` and an
  `expect` regex for the roster.
- `org-chart-monitor`: the email groups the pages it could not reach under
  those three headings. A blocked page says when the snapshot Action last
  read it (from the bundled `data/leadership-snapshots/index.json`, now in
  `included_files`) instead of "fix the target"; only a moved page says
  that, and a moved page mails on its own even in a week with no changes.
- `scripts/snapshot-leadership-pages.js`: when every live attempt on an
  `archive_fallback` target is a bot block, the Action reads the Internet
  Archive's latest capture of the same URL, raw (`id_`), accepts it only if
  the archive recorded a 200, the capture is newer than the one on file,
  and its text matches `expect`. The record says `via: "archive"`, `as_of`
  (the capture time), `archive_url` and `live_error`; CHANGES.md says to
  cite the capture date, never today. The live page stays "not reached".
- The archive reader retries a 408/429/5xx up to three times, honoring
  Retry-After (capped at 60s), else 15s, 30s, 60s; the failure text
  carries the attempt count.
- Tests: `tests/unit/leadership-snapshot-archive.test.js` and three new
  cases in `tests/unit/org-chart-monitor.test.js`.

## Roster lines in the 2026-10-19 snapshot that need a chart decision

From `data/leadership-snapshots/CHANGES.md` on this branch (not applied
here; this PR is the watch fix):

- CDC: "Chief of Staff – Acting: Mina Zadeh, PhD, MPH" added; the
  NCSTLTPHIW director line lost its "Acting". Page updated Oct 16, 2026.
- FDA: "Acting Chief Information Officer, Sanjay Kumar Sahoo" removed; no
  replacement line.
- GSA: the site nav dropped "Leadership Directory" (the target page still
  answered 200; watch for it moving).
- DHA, VA, ONC, CMS: banner, nav and label lines only.
