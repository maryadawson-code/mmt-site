# Learning Delta Log

Captures debugging sessions and operational lessons learned. Each entry records what broke, the root cause, the fix, and standing rules to prevent recurrence.

---

## Standing Rules Already Active

- **Test AI provider model names directly before deploying** — background functions return 202 regardless of internal failure, masking API errors like invalid model names. Always validate the model name against the provider API before committing.
- **Deleting a file from the repo does not delete it from Netlify's CDN cache** — when removing a page, always replace it with a tombstone redirect stub rather than just deleting. Netlify's edge cache can serve stale files indefinitely after deletion. The `force = true` redirect flag does not reliably override cached files when an edge function runs before redirects.

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

### 2026-03-11 - Full audit: contracting redirect, CDN cache, ad-ready patch
- **What broke:** `/contracting` page served old broken JS-based accordion. Contract vehicles accordion, subscriber count cleanup, Sara title fix, and XSS fix from previous session were stuck behind a failed git push (local ahead of remote). After push resolved, `/contracting` still served stale content because Netlify CDN cached the deleted file.
- **Root cause pattern:** Two-layer failure: (1) Git sync gap — local changes never pushed to remote, so Netlify never saw them. (2) CDN cache persistence — deleting a file from the repo does not purge it from Netlify's edge CDN. Even `force = true` on redirects did not override the cached file because the edge function (`security-headers.js`) runs before redirect processing and `context.next()` serves the cached file.
- **Fix strategy used:** (1) Resolved git rebase conflicts across 5 files, pushed to origin/main. (2) Deleted contracting.html and removed from build.js. (3) When CDN continued serving stale file, created a tombstone contracting.html with meta-refresh redirect to `/resources.html#contract-vehicles`. Tombstone is 10 lines, not in sitemap, canonical points to resources.html.
- **Why this was the fastest clean path:** Tombstone guarantees immediate redirect regardless of CDN cache state. No dependency on Netlify cache purge timing or edge function execution order.
- **What canonical file should be updated:** architecture-decisions.md — add note about tombstone redirect pattern for deprecated pages.
- **Standing rule to add or reinforce:** When deprecating a page, never just delete the file. Replace it with a meta-refresh tombstone redirect. Keep tombstones out of the sitemap; set canonical to the destination.
- **What to do faster next time:** Before any repair session, run `git log --oneline HEAD...origin/main` first to confirm sync state. A git sync gap is the most common reason fixes don't land. For page deprecation, go straight to tombstone pattern — skip the delete-and-redirect approach.
