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
