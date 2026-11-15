# 2026-11-15: three leaks closed, and the decision assurance brief published

## Three things found and left alone until today

1. **Org-chart meta descriptions named leaders in public HTML.** Nine of the eleven
   `premium/org-charts/*.html` pages carried a `<meta name="description">` that named the
   agency head (and in one case the Acting Commissioner) even though the chart body is
   gated. Descriptions now name offices and structure only ("the Director's office, the four
   mission offices"), and end with "Names are inside the member chart." DHA and VA had no
   description and were left alone. The inline node data in each chart script is still in the
   page source behind the CSS gate, as every premium page is; that is the site's gate pattern,
   not this fix's scope.
2. **The "public" corpus carried gated fields.** `mmt-content-corpus-public.json` excluded
   `premium: true` items but a `premium: false` contract or vehicle item still carried vendor,
   value, NAICS, the source link, the pursuit score, ceiling, primes, burn status, IVS, forecast
   and MMT notes: the same fields `contract-fields.js` and `idiq-fields.js` withhold until
   `loadEntitlement()` passes. Nothing read the file yet. Each builder now attaches a
   `public_view` (the 30-word teaser, agency and status for a contract; name, agency, status
   and primary NAICS for a vehicle); `publicView()` applies it to the public file and
   `fullView()` strips the hint from the full file, so the two schemas stay identical.
   `GATED_LINE_RE` names the gated labels; `validate-dist.js` fails the build if the public
   file carries one, and `tests/unit/content-index.test.js` checks both the builder and the
   committed file.
3. **Ask MMT hashed visitor IPs with a public salt.** `premium-chat.js` passed
   `SUPABASE_SERVICE_KEY.slice(0, 16)` as the salt. A Supabase service key is a JWT whose first
   16 characters are the header `eyJhbGciOiJIUzI1`, identical for every Supabase project, so
   anyone with a list of addresses could reproduce every stored `ip_hash`. `ipSalt(env)` now
   returns `ASK_MMT_IP_SALT` when set, else an HMAC-SHA256 over the whole service key (whose
   signature segment is secret). `hashIp()` returns null for a missing salt instead of hashing
   with an empty one, and the handler already treats a null hash as "enter your email."
   Changing the salt changed every hash, so the free tier's per-visitor counts reset once on
   deploy. No env var was added (the 4KB Lambda cap); set `ASK_MMT_IP_SALT` only if the key
   is ever rotated and continuity matters more than a second reset.

## Content from the 2026-11-13 Founding Member brief

"Who Proves the Decision Was Right" (Ask MMT Founding Member brief, 63 sources) is now on
the site with the member's name removed:

- `premium/briefs/decision-assurance-2026-11-13.html`: the full brief, gated, same shell as
  Capture Corner, linked from `premium/ask-mmt.html`. The corpus picks it up as a
  `premium_brief`.
- Ten glossary terms with per-term pages and official sources: CERT, Decision assurance,
  Do Not Pay, High-impact AI, PIVOT, QIC, RAC, SMRC, UPIC, WISeR. Q and W are new letters.
  New glossary pages are light-theme in source; the build still swaps the nav.
- `lib/acronyms.js`: CERT, UPIC, QIC, RAC, RVC, SMRC, PIVOT, DNP, OMHA.
- Three Contract Tracker listings, all `upcoming`, each with a 32-hex SAM permalink or the
  CMS forecast file as its source and `last_verified` 2026-11-13 from the brief:
  CMS Fraud Defense Contracts (UPIC successor), CMS Supplemental Medical Review Contract,
  VA PIVOT. `EXPECTED_SLUGS` is 70. The daily re-verify cron owns their status from here.
- Not added: the brief's member name, HigherGov/trade figures as "official" glossary sources,
  and any tracker field the sources do not state (NAICS left empty, set-aside noted as not
  stated).

## Found on the way: glossary Official Sources never shipped

`build.js` injects an "Official Sources" card into each glossary page that has an entry in
`glossary-sources.json`, anchored on the back-link divider written as
`border-top:1px solid var(--mmt-soft)`. Every source page writes that divider as
`rgba(0,229,250,0.1)` (the theme strip to `var(--mmt-border)` runs later), so the anchor
matched nothing, zero pages carried their sources, and the build log still said "67 with
Official Sources" because the counter counted intent, not matches. The anchor now accepts
all three spellings, the counter counts real injections, and a miss warns by file name.
Verified in dist: 67 of 73 pages carry the card.
