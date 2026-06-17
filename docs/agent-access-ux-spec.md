<!--
REPO-ADAPTATION NOTE (added 2026-06-16, feat/agent-api):
This spec is the canonical UX source of truth for the Agent Access feature.
It is authored against a React + Tailwind + shadcn/ui stack (see §11). This
repo (mmt-site) is STATIC HTML built by `node build.js` with inline-CSS-var /
build-time Tailwind and `mmt_premium` localStorage auth gates — there is no
React runtime. Per the HHS-sprint precedent ("a Mary-delivered spec's path
conventions are spec hypothesis, not repo reality"), the build TRANSLATES this
spec to the repo's flat-HTML + vanilla-JS pattern: the wizard/list/dialog
become server-rendered pages + progressive-enhancement JS, not shadcn
components. UX requirements (the fork, plain-language scopes, one-time key,
activity view, a11y AA, error microcopy) are honored verbatim; only the
implementation substrate changes. Companion data-model + hardening specs:
docs/agent-access-spec.md + docs/agent-access-hardening-spec.md (added when
provided). Build branch: feat/agent-api.
-->

# SPEC: Agent Access — UX / Setup Experience
Owner: Mary Womack · Companion to `mmt_agent_access_spec.md` + `_hardening.md` · Status: DRAFT FOR REVIEW
Goal: A setup experience anyone can complete — capture/BD/small-biz owners who are NOT engineers — while power users like Eric move fast. Lead with INTEL (71% poll winner), agent-connection secondary.

## 1. Design principles
- Non-technical-first floor, expert fast-path ceiling. Never make a non-engineer read the word "token" before they understand the value.
- Plain language over jargon. "Connect your AI assistant" not "Generate a PAT." Explain scopes as what the AI can SEE, not as permission strings.
- Trust before action. A nervous federal user must see read-only, revoke-anytime, audit-visible BEFORE they click generate.
- One clear next step per screen. Progressive disclosure — advanced controls hidden until asked for.
- WCAG AA throughout (4.5:1 body, 3:1 large text, keyboard nav, visible focus, no color-only signals).

## 2. Design system (Nexus, GovCon-sober)
- Palette: Nexus neutrals + Hydra Teal `#01696F` primary (CTAs/links only). Semantic: success `#437A22`, warning `#964219`, error `#A12C7B`. Dark mode first-class.
- Type: one distinctive sans (e.g. Satoshi/General Sans via CDN) — display via weight, not size. `text-xl` max heading in-app. 16px body floor.
- Tone: precise, calm, trustworthy. No marketing fluff inside the setup flow.

## 3. The fork (two paths, one product)
Default = Guided. A persistent "Advanced / Developer view" toggle (top-right of the API Access page) switches to the dense expert panel. Choice is remembered in user profile (server-side, never localStorage).

### 3a. Guided path (default — non-technical)
A wizard, not a form. Stepper with 3 steps + a success state.

### 3b. Advanced path (Eric & devs)
Single dense page: token table + create form + raw scopes + curl/MCP snippets + rate-limit/budget readout. No wizard chrome. Skips all explanatory copy.

## 4. Information architecture
Entry point: a top-level "AI & Integrations" nav item (NOT buried in Settings). Lead card = INTEL.
1. **Hero card — "Pull intel on your market"** (the 71% winner): plain pitch + "Connect your AI" primary CTA. This is the front door.
2. Secondary cards: "Let your AI pick your bids" (Eric's case), "Score bids before you chase them."
3. Below: "Your connected assistants" (token list, empty by default).

## 5. Guided wizard — screen by screen

### Screen 0 — Value + trust (before any setup)
- Headline: "Connect your AI assistant to Mission Meets Tech."
- Subhead: "Let the AI you already use read your live opportunities and market intel — so it tells you what to chase before you open your laptop."
- Trust row (3 chips, icon + label): 🔒 Read-only (it can't change anything) · ↩ Revoke anytime · 👁 Every access logged.
- Primary CTA: "Get started." Secondary: "How does this work?" (opens explainer drawer).

### Screen 1 — Pick what your AI can see (scopes in plain language)
- Three toggle cards, NOT checkboxes-with-jargon. Each: plain title + one-line "what this lets your AI do" + a "for example" line.
  - "My market intel" → opportunities + trend data. (maps `intel:read`) — pre-selected, labeled "Most popular."
  - "My live opportunities" → the open bids in your tracker. (maps `opportunities:read`)
  - "My pipeline" → what you're already tracking. (maps `tracker:read`)
- Reassurance under cards: "You can change this anytime. Your AI can only read — never edit, delete, or spend."

### Screen 2 — Name it + expiry (with smart defaults)
- "Give this connection a name" (placeholder: "My ChatGPT", "Eric's Ops Assistant"). Required.
- Expiry: friendly dropdown — "90 days (recommended)" default; 30 / 365 / "Never (not recommended)". Each option has a one-line consequence.
- Primary CTA: "Create connection."

### Screen 3 — Success + one-time key (the critical moment)
- Big success check. "Your connection is ready."
- The key shown ONCE in a copy-box with a giant Copy button. Plain warning: "Copy this now — for your security we can't show it again. Lost it? Just make a new one."
- Then: "Now paste it into your AI" — a tool picker (Claude Desktop · ChatGPT · Other) that reveals copy-paste setup steps for THAT tool, including the base URL and a ready curl/MCP snippet.
- "I've connected it" → returns to the list showing the new live connection with a green "Active" badge.

## 6. The connection list (both paths)
Each row: name · what it can see (plain chips) · created · last used ("2h ago" / "Never yet") · status badge (Active/Expired/Revoked) · Revoke button. Revoke = one click + a plain confirm ("Your AI will lose access immediately. You can reconnect anytime.").

## 7. States & microcopy (the polish that makes it feel "perfect")
- Empty state: friendly, not a void. "No AI assistants connected yet. Connect one to let it work your pipeline for you."
- Loading: skeletons, never spinners-on-blank.
- Errors in human language, never codes. Examples:
  - 401 from a bad key → "That key didn't work. It may have been revoked or expired — try making a new one."
  - 429 budget → "You've reached this month's usage. It resets on [date], or upgrade for more."
  - 503 COMPLIANCE_HOLD (CUI path) → "This data isn't available for AI access yet while we finish security review."
- Success confirmations on every action (toast: "Connection revoked.").

## 8. Trust & safety surfacing (federal buyers need this)
- Persistent "How your data is protected" link → drawer: read-only, scoped, per-connection, audit-logged, revoke-anytime, where data is/isn't sent.
- On the CUI/sensitive note: plainly state that protected data stays inside the secure boundary and isn't sent to outside AI.
- A visible "Activity" view per connection: last 20 reads (time, what was read) — turns the audit log into a user-facing trust feature.

## 9. Accessibility (non-negotiable)
- Full keyboard path through the wizard; visible focus rings; logical tab order.
- Every status uses icon + text + color (never color alone).
- Copy-box and toggles have ARIA labels; success/error announced via live region.
- Test at 375px (mobile) and 1280px+; 200% zoom must not break layout.

## 10. Acceptance criteria
- A non-technical user can connect an AI assistant end-to-end without seeing the words "token", "scope", or "bearer" until the advanced view.
- Intel is the visible front door; agent-connect is reachable but secondary.
- Advanced toggle gives Eric the dense panel in one click; choice persists.
- One-time key screen: copy works, warning is clear, tool-specific paste steps shown for Claude + ChatGPT.
- Every error renders human copy, never a raw status code.
- WCAG AA passes (contrast, keyboard, focus, live-region announcements) at mobile + desktop.
- Activity view shows real audit rows per connection.

## 11. Reference
- Design system: Nexus palette + Satoshi/General Sans (design-foundations).
- Build target: React + Tailwind + shadcn/ui (webapp template); wizard via shadcn Stepper/Tabs; toggles via Switch; key reveal via Dialog; list via Table.
- ⚖️ The §8 "where data is sent" copy must match the §11 compliance posture — keep wording aligned with legal before launch.
