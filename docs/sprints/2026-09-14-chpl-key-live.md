# Sprint 2026-09-14 (evening) — CHPL goes live: the key worked, the search did not

Mary registered MMT's free CHPL API key and set `CHPL_API_KEY` in Netlify
(all four contexts, env at 3,171 bytes). A direct probe answered 200 with 323
Epic listings. Then the client, exercised with a working key for the first
time, showed two things a 401 had been hiding:

1. **CHPL's `searchTerm` matches developer and product names, not
   sentences.** `enrichWithCHPL` sent the question's extracted terms
   ("epic certified edition cures") and got zero rows for every certification
   question tried; "Epic" alone returns 323 rows, 35 active.
2. **The key allows one call every two seconds** (`x-ratelimit-limit`), and
   back-to-back calls 429. Default ordering also surfaces retired 2011
   listings first.

Shipped:
- `lib/onc-chpl-api.js`: `searchTermFor(topic)` picks a known product name
  (Expanse, Millennium, PowerChart, EpicCare...), else a known vendor
  (Oracle/Cerner, Epic, Meditech, Veradigm, Altera, athenahealth,
  eClinicalWorks, NextGen, Netsmart, Greenway, MEDHOST), else the name-like
  words left after the certification vocabulary is removed; nothing left
  means skipped, never a sentence search. Searches ask for
  `certificationStatuses=Active` ordered by `certification_date` descending
  (the v3 API honors both; newer listings carry no edition label, which the
  context says). A 429 is retried once after 2.2s and then reported as not
  reached with the limit named. A successful search is cached for a day in
  `lib/fetch-cache.js`; an error is never cached. ProposalPulse's
  `verifyCertificationClaim` searches every status so "exists but no longer
  Active" can still be said.
- `lib/ask-mmt-sources.js`: the catalog row is `live` with a note naming the
  key date, so `/ask` and `/ask/sources` list CHPL as read.
- Eval row `chpl-epic-certified` (`required_cited: chpl.healthit.gov`,
  `onc_chpl` not in its allowed-unavailable list), so the gate proves CHPL
  is reached.
- Tests: name-not-sentence search with the Active ordering, the one retry
  after a 429, the day cache and the never-cached error, `activeOnly:false`
  for the claim check.

Hard rules (do not regress):
- **CHPL is searched by name, never by sentence.** `searchTermFor` is the
  only path from a topic to `searchTerm`.
- **One CHPL call every two seconds per key.** Any new CHPL consumer goes
  through `searchCertifiedProducts` (cache plus the single retry); never
  loop over CHPL calls.

Verified 2026-09-14: unit suite green; eval gate `--trials 3` (see the run
in the PR); build exit 0; validate-dist, validate-routes,
validate-ask-mmt-coverage pass; dist `/ask/sources` shows CHPL as live.
