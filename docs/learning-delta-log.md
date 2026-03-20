# Learning Delta Log

Captures debugging sessions and operational lessons learned. Each entry records what broke, the root cause, the fix, and standing rules to prevent recurrence.

---

## Standing Rules Already Active

- **Test AI provider model names directly before deploying** — background functions return 202 regardless of internal failure, masking API errors like invalid model names. Always validate the model name against the provider API before committing.

---

## Log Entries

### 2026-03-05 - Perplexity model name retirement (contract intel)
- **What broke:** Background function silently accepted invocations (202) but never wrote to Supabase. No visible error.
- **Root cause pattern:** Perplexity retired the llama-3.1-sonar-large-128k-online model name. API returned 400 Invalid model. Background functions swallow errors — caller gets 202 regardless of internal failure.
- **Fix strategy used:** Tested valid models directly against Perplexity API. Confirmed sonar-pro as the correct replacement. Updated model-router.js.
- **Why this was the fastest clean path:** One-line change in model-router.js. No logic changes needed.
- **What canonical file should be updated:** architecture-decisions.md — Perplexity provider section added.
- **Standing rule to add or reinforce:** When a background function silently fails, test the underlying API call directly before debugging logic. 202 from a background function is not a success confirmation.
- **What to do faster next time:** On any new AI provider integration, test the model name against the provider API directly before deploying. Provider model names change without notice.

### 2026-03-12 - Missing CTA hierarchy across pages (UX repair)
- **What broke:** No page had a clear single dominant CTA. Hero used an inline email form competing with nav subscribe. About page had no newsletter CTA near Mary's bio. Podcast page had no episode content above the fold. Newsletter page had no social proof or issue previews before the form. Resources page had no MissionPulse CTA for Journey A contractors.
- **Root cause pattern:** CTA proliferation without hierarchy. Each page accumulated actions (forms, buttons, links) organically without designating a primary action. Apple's "one dominant action per screen" principle was never applied. The hero alone had a form, a nav subscribe button, and a mobile subscribe section — all competing for the same click.
- **Fix strategy used:** Mapped three user journeys (Federal Contractor, Decision-Maker, Podcast Listener) and ensured each page on each journey path had exactly one primary CTA (Subscribe Free) and at most one secondary CTA (Listen to the Podcast or platform links). Replaced the hero email form with a direct LinkedIn subscribe link. Added closing CTAs at bio-proximity points. Added social proof before forms, not after.
- **Why this was the fastest clean path:** Editing 5 source HTML files and rebuilding. No JS changes, no build.js changes, no new templates. All fixes are static HTML that the build pipeline copies through.
- **Standing rule to add or reinforce:** Every page must have exactly one primary CTA visible above the fold. Secondary CTAs use `btn-secondary` styling. No page should have more than two CTAs competing in the same viewport. Social proof always appears before (not after) a subscribe form.
- **What to do faster next time:** Before adding any new CTA to any page, audit the existing CTA stack on that page first. Check: is there already a primary action? If so, the new element must be secondary or removed.

### 2026-03-12 - _headers malformed syntax (Netlify cache rejection)
- **What broke:** Netlify rejected cache-control directives for images, fonts, and HTML files. Assets served without proper caching headers.
- **Root cause pattern:** `_headers` file used bare glob patterns (`*.jpg`, `*.png`, `*.svg`, `*.html`, `*.woff2`) without a leading `/`. Netlify's `_headers` parser requires path patterns to start with `/`. Without it, the entire directive block is silently ignored.
- **Fix strategy used:** Added leading `/` to all 5 affected path patterns. Security headers (on `/*` wildcard) were already correct and untouched.
- **Why this was the fastest clean path:** One-character fix per line. No restructuring needed — syntax was otherwise correct.
- **Standing rule to add or reinforce:** Every path pattern in `_headers` must start with `/`. After editing `_headers`, verify the corrected file lands in `dist/_headers` and spot-check that path lines start with `/` before committing. Also: build.js uses a dynamic glob for asset copying (not a hardcoded list), so new image files added to repo root are automatically copied to dist — no build.js change needed for new assets.

### 2026-03-20 - Ops Console build: stale deploy from wrong publish directory

- **What broke:** First deploy served a 2KB command-center.html instead of the 233KB version in `dist/`. All 6 ops console features (command bar, approval queue, task feed, agent panel, signal inbox, pipeline quick-edit) were missing.
- **Root cause pattern:** `netlify deploy --prod` without `--dir=dist` deployed from the repo root instead of the build output directory. The root `command-center.html` is the source file (small); the built version with inlined Tailwind CSS and all JS lives in `dist/command-center.html`. Netlify CLI defaults to the current directory if `--dir` is not specified, overriding `netlify.toml`'s `publish = "dist/"` setting.
- **Fix strategy used:** Re-deployed with explicit `--dir=dist` flag. Verified with curl that the live file matched the expected 233KB size.
- **Why this was the fastest clean path:** Single re-deploy command. No code changes needed.
- **What canonical file should be updated:** CLAUDE.md already documents `dist/` as the publish directory. No update needed.
- **Standing rule to add or reinforce:** Always use `netlify deploy --prod --dir=dist` when deploying via CLI. Never omit `--dir=dist` — the CLI does not reliably inherit from `netlify.toml`. After every deploy, curl-check the largest changed file to confirm the correct version is served (compare byte count to local `dist/` file).
- **What to do faster next time:** Add a deploy script or alias that hardcodes `--dir=dist` so it cannot be forgotten. Alternatively, rely solely on git-push-triggered deploys which use `netlify.toml` correctly.
