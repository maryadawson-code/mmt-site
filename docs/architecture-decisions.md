# Architecture Decisions

Record of significant architectural choices for the mmt-site. Each entry captures what was decided, when, and why.

---

## Static Site with Build-Time Rendering
**Added:** 2025-02
**Reason:** All content rendered at build time via `node build.js`. No client-side content fetching except lazy-loaded search index. Keeps pages fast, cacheable, and SEO-friendly.

## Tailwind CSS (Build-Time, Inlined)
**Added:** 2025-02
**Reason:** Tailwind CSS v3 built via CLI at compile time, then inlined into each HTML page's `<style>` block. Eliminates render-blocking CSS request. Tree-shaken output ~12KB.

## Self-Hosted Fonts
**Added:** 2025-02
**Reason:** Space Grotesk + Inter served as WOFF2 from `/fonts/` with `font-display: swap`. No Google Fonts CDN dependency at runtime.

## Netlify Background Functions for Heavy AI Work
**Added:** 2025-03
**Reason:** ProposalPulse scoring and contract intel refresh exceed Netlify's 10-26s function timeout. Background functions return 202 immediately and run up to 15 minutes async.

## Supabase for State
**Added:** 2025-03
**Reason:** Stores scoring history, user usage tracking, contract intel cache. Accessed via `@supabase/supabase-js` from Netlify Functions.

## Resend for Transactional Email
**Added:** 2025-03
**Reason:** Simple `fetch()` POST to Resend API. No SDK dependency. Sends score receipts, Gold Team Reviews, weekly reports from `noreply@missionmeetstech.com`.

## Stripe for Payments
**Added:** 2025-03
**Reason:** Single $19.99 payments via Stripe Checkout (no subscriptions). 3 free assessments per email, then pay-per-use.

## CSP Standard
**Added:** 2025-02
**Reason:** Content Security Policy configured in `netlify.toml` headers. Restricts script-src to self + Plausible, frame-src to Stripe Checkout, connect-src to self + Plausible + Stripe.

## Contract Intel AI Provider (Perplexity)
**Added:** 2026-03-05
**Reason:** Swapped contract intel refresh from Anthropic Claude + web_search tool to Perplexity sonar API for built-in real-time search.

### Active Configuration
- Provider: Perplexity AI
- Model: sonar-pro (llama-3.1-sonar-large-128k-online was retired by Perplexity and is invalid)
- Endpoint: https://api.perplexity.ai/chat/completions
- Auth: Authorization: Bearer header
- Env var: PERPLEXITY_API_KEY (must be set in Netlify for functions scope)
- ANTHROPIC_API_KEY remains required for ProposalPulse functions — do not remove it

### What changed
- callClaude() replaced with callPerplexity() in contract-intel-refresh-background.js
- Request format: OpenAI-compatible chat completions (not Anthropic messages format)
- Citations extracted from finalData.citations array (not web_search_tool_result blocks)
- pause_turn resumption logic removed — not applicable to Perplexity
- cache_control and anthropic-version headers removed
- Token logging uses prompt_tokens/completion_tokens (not input_tokens/output_tokens)
- model-router.js: contract_research and contract_verify now carry provider: "perplexity"

### Verification
After any change to contract intel functions, confirm PERPLEXITY_API_KEY is set in Netlify environment for functions scope (not builds-only scope).
