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
- Tests: `tests/unit/leadership-snapshot-archive.test.js` and three new
  cases in `tests/unit/org-chart-monitor.test.js`.
