# Command Center Ground Truth Audit — March 21, 2026

## File Stats
- **File:** `command-center.html`
- **Lines:** 3,810
- **Current HEAD:** `a6eeaa8` (Add P1 sprint results summary)
- **Last modified:** 2026-03-20 (Phase 2+3 commit `530ea86`)
- **API backend:** `command-center-api.js` (605 lines) — main dashboard API
- **Agent bridge:** `agent-bridge.js` (~550 lines) — agent-to-dashboard bridge

---

## Complete UI Element Map

### Auth Gate (Lines 227–266)

| # | Element | What it does | Handler | Target | Works? | Bug |
|---|---------|-------------|---------|--------|--------|-----|
| 1 | Login screen | Email-based magic link login | `requestLogin()` | `#login-screen` | YES | — |
| 2 | Login email input | Email field, Enter key supported | `requestLogin()` on Enter | — | YES | — |
| 3 | "Send Login Link" button | Sends magic link via `dashboard-auth` API | `requestLogin()` | — | YES | — |
| 4 | Login sent view | Shows "check your email" | — | `#login-sent` | YES | — |
| 5 | Login error view | Shows expired/invalid link error | — | `#login-error` | YES | — |
| 6 | "Try different email" button | Returns to login form | `showLoginForm()` | — | YES | — |
| 7 | Legacy `?key=` param | Bypasses login, uses param as API key | `initAuth()` | — | YES | — |
| 8 | `?auth=&email=` params | Magic link verification flow | `initAuth()` | — | YES | — |

### User Bar (Lines 294–309)

| # | Element | What it does | Handler | Target | Works? | Bug |
|---|---------|-------------|---------|--------|--------|-----|
| 9 | User bar | Shows logged-in user name + role badge | auto-render | `#user-bar` | YES | — |
| 10 | "Manage Users" button | Opens user management modal | `showUserManagement()` | `#user-mgmt-modal` | YES | — |
| 11 | "Log Out" button | Clears session, returns to login | `logout()` | — | YES | — |

### User Management Modal (Lines 268–290)

| # | Element | What it does | Handler | Target | Works? | Bug |
|---|---------|-------------|---------|--------|--------|-----|
| 12 | User list | Lists all dashboard users with roles | `showUserManagement()` | `#user-list` | YES | — |
| 13 | Add user form | Email + Name + Role dropdown + Add button | `addUser()` | — | YES | — |
| 14 | Close modal button | Hides modal | `closeUserMgmt()` | — | YES | — |

### Header (Lines 311–317)

| # | Element | What it does | Handler | Target | Works? | Bug |
|---|---------|-------------|---------|--------|--------|-----|
| 15 | Mode badge | Shows NORMAL/DEGRADED/READONLY/EMERGENCY | `renderMode()` | `#mode-badge` | YES | — |
| 16 | Last refresh timestamp | Shows last data refresh time | `loadDashboard()` | `#last-refresh` | YES | — |

### Org Filter (Lines 322–326)

| # | Element | What it does | Handler | Target | Works? | Bug |
|---|---------|-------------|---------|--------|--------|-----|
| 17 | "All" button | Shows all tiles | click handler on `#org-filter` | `#tile-home` | YES | — |
| 18 | "missionmeetstech.com" button | Shows MMT tiles (same as All currently) | click handler | `#tile-home` | YES | No actual filtering |
| 19 | "missionpulse.ai" button | Shows MP placeholder | click handler | `#mp-placeholder` | YES | — |

### Approval Notification Bar (Line 329)

| # | Element | What it does | Handler | Target | Works? | Bug |
|---|---------|-------------|---------|--------|--------|-----|
| 20 | Approval bar | Shows pending approval count | `renderApprovalBar()` | `#approval-notification-bar` | **BUG** | **CSS conflict: has both `display:none` and `display:flex` inline — initial state always shows as flex** |
| 21 | "Review Now" button | Scrolls to relevant console | `scrollToConsole()` | navigates to `#coo` or `#editorial` | YES | — |

### Role Selector (Lines 335–343)

| # | Element | What it does | Handler | Target | Works? | Bug |
|---|---------|-------------|---------|--------|--------|-----|
| 22 | "View as" dropdown | Filters tiles by role (CTO/COO/Editor) | `applyRoleFilter()` | — | **PARTIAL** | **Only COO Console and Editorial tiles have `roles` property; all other tiles lack role filtering** |

### Command Bar (Lines 351–363)

| # | Element | What it does | Handler | Target | Works? | Bug |
|---|---------|-------------|---------|--------|--------|-----|
| 23 | Command text input | Free-text command input | Enter → `cmdSend()` | `#cmd-input` | YES | — |
| 24 | Agent selector dropdown | Select target agent | populated by `initCmdBar()` | `#cmd-agent` | YES | — |
| 25 | Priority selector | Urgent/High/Normal/Low | — | `#cmd-priority` | YES | — |
| 26 | Send button | Dispatches task to agent-bridge via `add_task` | `cmdSend()` | `#cmd-send-btn` | YES | — |
| 27 | History button (↑) | Toggles command history dropdown | `cmdToggleHistory()` | `#cmd-history-dd` | YES | — |
| 28 | Arrow Up on input | Fills from last command | `cmdFillFromHistory()` | — | YES | — |

### Agent Status Panel (Line 366)

| # | Element | What it does | Handler | Target | Works? | Bug |
|---|---------|-------------|---------|--------|--------|-----|
| 29 | Agent chips | Horizontal scrollable agent status chips | `renderAgentPanel()` | `#agent-panel` | YES | — |
| 30 | Agent chip click | Filters task feed by agent | `toggleAgentFilter()` | — | YES | — |

### Approval Queue Section (Lines 369–379)

| # | Element | What it does | Handler | Target | Works? | Bug |
|---|---------|-------------|---------|--------|--------|-----|
| 31 | Approval section | Shows pending agent approvals | `renderApprovals()` | `#approval-section` | YES | — |
| 32 | APPROVE button | Approves approval via `decide_approval` | `decideApproval(id, 'approved')` | — | YES | — |
| 33 | DENY button | Denies approval | `decideApproval(id, 'denied')` | — | YES | — |
| 34 | Recent Decisions toggle | Shows recent decision history | `toggleRecentDecisions()` | `#recent-decisions-list` | YES | — |

### Live Task Feed (Lines 382–397)

| # | Element | What it does | Handler | Target | Works? | Bug |
|---|---------|-------------|---------|--------|--------|-----|
| 35 | Task feed section | Shows live tasks with pipeline viz | `renderTaskFeed()` | `#task-feed` | YES | — |
| 36 | All/Active/Completed/Failed filters | Filter task list | `setTaskFilter()` | — | YES | — |
| 37 | Refresh button | Manual refresh of ops console | `refreshOpsConsole()` | — | YES | — |
| 38 | Cancel task button | Cancels active task | `cancelOpsTask()` | — | YES | — |

### Signal Inbox (Lines 402–414)

| # | Element | What it does | Handler | Target | Works? | Bug |
|---|---------|-------------|---------|--------|--------|-----|
| 39 | Signal section | Shows intel signals with triage | `renderSignalFeed()` | `#signal-feed` | YES | — |
| 40 | All/Critical/High/New filters | Filter signals | `setSignalFilter()` | — | YES | — |
| 41 | Newsletter button | Sends signal to editorial queue | `triageSignal(id, 'newsletter')` | — | YES | — |
| 42 | Dismiss button | Dismisses signal | `triageSignal(id, 'dismissed')` | — | YES | — |
| 43 | Pin/Unpin button | Pins signal to top | `triageSignal(id, 'pinned/new')` | — | YES | — |

### Pipeline Quick-Edit (Lines 417–423)

| # | Element | What it does | Handler | Target | Works? | Bug |
|---|---------|-------------|---------|--------|--------|-----|
| 44 | Pipeline section | Inline-editable newsletter pipeline | `renderPipelineFeed()` | `#pipeline-feed` | YES | — |
| 45 | "+ Add Issue" button | Adds pipeline slot via prompt() | `addPipelineSlot()` | — | YES | — |
| 46 | Status dropdown per issue | Changes pipeline status | `pipeUpdateStatus()` | — | YES | — |
| 47 | Topic inline edit | Edits lead topic on blur | `pipeUpdateTopic()` | — | YES | — |
| 48 | Notes textarea | Edits notes on blur | `pipeUpdateNotes()` | — | YES | — |

### Tile Grid (Lines 427–430)

| # | Element | What it does | Handler | Target | Works? | Bug |
|---|---------|-------------|---------|--------|--------|-----|
| 49 | "Full Dashboard Tiles" details | Collapsible tile grid | `<details>` native | `#tile-grid` | YES | — |
| 50 | Tiles (22 total) | Click navigates to detail view via hash | `navigate(id)` → `applyRoute()` | `#detail-{id}` | YES | — |

### Dashboard Tiles (22 tiles, rendered by `getTileData()`)

| # | Tile ID | Title | Routes to | Detail renderer | Works? | Bug |
|---|---------|-------|-----------|-----------------|--------|-----|
| 51 | `coo` | COO Console | `#coo` | `renderDetailCOO()` | YES | — |
| 52 | `editorial` | Editorial | `#editorial` | `renderDetailEditorial()` | YES | — |
| 53 | `roadmap` | Roadmap | `#roadmap` | `renderDetailRoadmap()` | YES | — |
| 54 | `costs` | Cost Intelligence | `#costs` | `renderDetailCosts()` | YES | — |
| 55 | `finance` | Cost Intelligence | `#finance` | `renderDetailFinance()` | **BUG** | **Duplicate title "Cost Intelligence" — should be "Finance" or similar to distinguish from Costs tile** |
| 56 | `billing` | Billing Tracker | `#billing` | `renderDetailBilling()` | YES | — |
| 57 | `services` | Services | `#services` | `renderDetailServices()` | YES | — |
| 58 | `customers` | Customers | `#customers` | `renderDetailCustomers()` | YES | — |
| 59 | `projects` | Projects | `#projects` | `renderDetailProjects()` | YES | — |
| 60 | `qa` | QA | `#qa` | `renderDetailQA()` | YES | — |
| 61 | `issues` | Issues | `#issues` | `renderDetailIssues()` | YES | — |
| 62 | `newsletter` | Newsletter | `#newsletter` | `renderDetailNewsletter()` | YES | — |
| 63 | `products` | Products | `#products` | `renderDetailProducts()` | YES | — |
| 64 | `engineering` | Engineering | `#engineering` | `renderDetailEngineering()` | YES | — |
| 65 | `business` | Business | `#business` | `renderDetailBusiness()` | YES | — |
| 66 | `health` | Site Health | `#health` | `renderDetailHealth()` | YES | — |
| 67 | `agents` | Agent Fleet | `#agents` | `renderDetailAgents()` | YES | — |
| 68 | `content` | Content Studio | `#content` | `renderDetailContent()` | YES | — |
| 69 | `competitive` | Competitive Intel | `#competitive` | `renderDetailCompetitive()` | YES | Placeholder — fetches approval-api summary but renders generic text |
| 70 | `learnings` | Agent Memory | `#learnings` | `renderDetailLearnings()` | YES | Uses Bearer auth header while all other views use `?key=` param |
| 71 | `security` | Security Posture | `#security` | `renderDetailSecurity()` | YES | — |
| 72 | `penny` | Cost Control | `#penny` | `renderDetailPenny()` | YES | — |

### Detail View: Products (Lines 778–854)

| # | Element | What it does | Handler | Target | Works? | Bug |
|---|---------|-------------|---------|--------|--------|-----|
| 73 | ProposalPulse tab | Shows PP orders | `productsTab='pp'; renderDetailView('products')` | — | YES | — |
| 74 | MarketPulse tab | Shows MP orders | `productsTab='mp'; renderDetailView('products')` | — | YES | — |

### Cmd+K Palette

| # | Element | What it does | Handler | Target | Works? | Bug |
|---|---------|-------------|---------|--------|--------|-----|
| — | — | — | — | — | **MISSING** | **No Cmd+K palette exists. Zero keyboard shortcut support.** |

### Mobile Nav

| # | Element | What it does | Handler | Target | Works? | Bug |
|---|---------|-------------|---------|--------|--------|-----|
| — | — | — | — | — | **PARTIAL** | **CSS has responsive breakpoints for tile grid, kanban, cmd-bar, and ops-two-col. No hamburger menu. No nav bar at all. Mobile-usable via responsive CSS but no dedicated mobile nav.** |

---

## API Action Map

### command-center-api.js — GET (Dashboard Data)

Returns all data in one call. Called by `loadDashboard()`.

| Data Key | Supabase Table | What it returns | UI Consumer |
|----------|---------------|-----------------|-------------|
| `health.mode` | env var `AI_OPERATIONS_MODE` | System mode (normal/degraded/etc) | Mode badge, alerts |
| `flags` | `lib/feature-flags` | Feature flag states | Health detail flags section |
| `circuits` | `lib/circuit-registry` | Circuit breaker states | Health detail circuits |
| `orders_24h.proposalpulse` | `mp_scoring_history` | Last 24h PP orders | Products, alerts, tile metrics |
| `orders_24h.marketpulse` | `marketpulse_orders` | Last 24h MP orders | Products, alerts, tile metrics |
| `quality` | `quality_metrics` | 7d/30d quality scores by product | Tile metrics |
| `ops_events_24h` | `ops_ledger` | 24h ops events | Health detail events table |
| `held_emails` | `held_emails` | Emails awaiting release | Health detail held emails |
| `report_history.marketpulse` | `marketpulse_orders` | Last 15 MP reports | (Not visibly consumed) |
| `report_history.proposalpulse` | `mp_scoring_history` | Last 15 PP reports | (Not visibly consumed) |
| `pipeline` | `newsletter_pipeline` | Upcoming newsletter issues | Newsletter detail, pipeline feed |
| `tasks` | `task_queue` | Active + recent tasks | Engineering, task feed, tile metrics |
| `agents` | `agent_registry` | All non-archived agents | Agent panel, fleet detail, tiles |
| `signals` | `intel_signals` | Active intel signals | Signal feed, newsletter signals |
| `revenue` | Stripe API | Monthly revenue data | Business detail |
| `recent_images` | `generated_images` | Last 12 generated images | Content studio |

### command-center-api.js — POST Actions

| Action | What it does | Required params | UI Caller |
|--------|-------------|-----------------|-----------|
| `release_email` | Sends held email via Resend | `id` | Health → Release button |
| `set_mode` | Logs mode change request (manual env var change) | `value` | Engineering → Quick Actions |
| `trigger_health_check` | Logs manual health check trigger | — | Engineering → Quick Actions |
| `add_task` | Inserts task to `task_queue` | `task`, `agent` | Cmd bar, agent dispatch |
| `kill_task` | Sets task status to cancelled | `id` | Engineering → Cancel |
| `update_pipeline` | Updates pipeline item fields | `id` | Pipeline inline edits |
| `add_pipeline` | Inserts new pipeline slot | `publish_date`, `day_slot` | "+ Add Issue" button |
| `add_signal` | Inserts intel signal | `title` | Research hub push, add signal |
| `score_signal` | Updates signal relevance score | `id` | Newsletter detail score button |
| `kill_signal` | Sets signal status to killed | `id` | Newsletter detail kill button |
| `update_agent` | Updates agent status/task | `agent_id` | Agent detail |
| `list_approvals` | Lists pending/recent approvals | `status` | Ops approval queue |
| `decide_approval` | Approves/denies agent approval | `approval_id`, `decision` | Ops approval buttons |
| `cancel_task` | Cancels task (sets to failed) | `task_id` | Task feed cancel button |
| `triage_signal` | Sets signal triage status | `signal_id`, `triage_status` | Signal feed triage buttons |
| `seed_pipeline` | Seeds next 4 publish dates | — | Newsletter detail seed button |
| `ciso_posture` | Returns CMMC score + findings + scans | — | Security tile, security detail |
| `ciso_findings` | Lists open findings | `status`, `severity` | Security detail |
| `ciso_update_finding` | Updates finding status/evidence | `finding_id` | Security accept risk button |
| `ciso_cmmc_tracker` | Returns all CMMC practices | optional `family` | Security full tracker |
| `ciso_scan` | Runs security scan | `scan_type` | Security run scan button |
| `penny_dashboard` | Returns Penny Pincher cost data | — | Penny tile, penny detail |
| `penny_update_finding` | Updates penny finding status | `finding_id`, `status` | Penny approve/defer |
| `penny_findings` | Lists penny findings | `status` | Penny detail |

### agent-bridge.js Actions (Agent-facing API)

| Action | What it does | Auth | UI Consumer |
|--------|-------------|------|-------------|
| `dispatch_task` | Dispatches task to agent | Bearer token | Agents |
| `complete_task` | Marks task complete | Bearer token | Agents |
| `fail_task` | Marks task failed | Bearer token | Agents |
| `update_task_status` | Updates task pipeline status | Bearer token | Agents |
| `add_signal` | Adds intel signal | Bearer token | Agents |
| `update_pipeline` | Updates newsletter pipeline | Bearer token | Agents |
| `add_pipeline` | Adds pipeline item | Bearer token | Agents |
| `update_agent` | Heartbeat/status update | Bearer token | Agents |
| `request_approval` | Requests human approval | Bearer token | Agents |
| `decide_approval` | Decides approval | Bearer token | Dashboard (duplicate of cmd-center) |
| `list_approvals` | Lists approvals | Bearer token | Dashboard (duplicate) |
| `triage_signal` | Triages signal | Bearer token | Dashboard (duplicate) |
| `cost_summary` | Returns cost summary | Bearer token | Agents |
| `cost_resolve_alert` | Resolves cost alert | Bearer token | Agents |
| `cost_update_threshold` | Updates cost threshold | Bearer token | Agents |
| `finance_summary` | Returns finance summary | Bearer token | Agents |
| `finance_alerts` | Lists finance alerts | Bearer token | Agents |
| `finance_services` | Lists services | Bearer token | Agents |
| `finance_update_service` | Updates service | Bearer token | Agents |
| `customer_summary` | Returns customer summary | Bearer token | Agents |
| `customer_at_risk` | Lists at-risk customers | Bearer token | Agents |
| `customer_update` | Updates customer profile | Bearer token | Agents |
| `project_dashboard` | Returns project summary | Bearer token | Agents |
| `project_backlog` | Returns project tasks | Bearer token | Agents |
| `project_create_task` | Creates project task | Bearer token | Agents |
| `project_move_task` | Moves task status | Bearer token | Agents |
| `qa_summary` | Returns QA summary | Bearer token | Agents |
| `qa_regressions` | Returns regressions | Bearer token | Agents |
| `issue_list` | Lists open issues | Bearer token | Agents |
| `issue_detail` | Returns issue + comments | Bearer token | Agents |
| `issue_create` | Creates issue | Bearer token | Agents |
| `issue_comment` | Adds issue comment | Bearer token | Agents |
| `issue_diagnose` | Diagnoses issue | Bearer token | Agents |
| `issue_propose_fix` | Proposes fix with diff | Bearer token | Agents |
| `deployment_log` | Logs deployment | Bearer token | Agents |

---

## Deploy Impact Chain

The commit SHAs referenced in the request (`9c5c653`, `1ae15c8`, `2c10c5d`, `c5c73be`, `98ec569`, `0af11da`, `466af56`) do not exist in this repository. The actual recent commits that touched command-center.html are:

| SHA | Message | Impact on CC |
|-----|---------|-------------|
| `530ea86` | Phase 2+3: Observability and UX polish | Likely touched command-center.html for Sentry/UX fixes |
| `b318083` | Phase 1: Security hardening | Input sanitization may have touched CC |
| `a39c4e9` | Penny Pincher agent, ops console enhancements | Added Penny Pincher tile + detail view, ops console updates |
| `321db56` | Jack unlimited access, PWA manifest, E2E | Possible auth changes |
| `8e1c82a` | CISO agent — CMMC L2 tracker, security scans | Added Security tile + detail view |
| `e390f37` | Billing API, dashboard tile | Added Billing tile + detail view |
| `c59b47f` | Login screen, magic link flow, user management | Added entire auth gate UI |

---

## Bugs Found

### Bug 1: Approval notification bar CSS conflict
**File:** `command-center.html`, line 329
**What's wrong:** The `#approval-notification-bar` has both `style="display:none"` AND `display:flex` in the same inline style attribute. The second `display:flex` overrides the `display:none`, making the bar visible on load even when empty.
**Fix:** Remove the duplicate `display:flex` from the inline style. The `renderApprovalBar()` function already manages visibility.

### Bug 2: Duplicate tile title "Cost Intelligence"
**File:** `command-center.html`, lines 607-608 (in `getTileData()`)
**What's wrong:** Both the `costs` tile (id: `costs`) and the `finance` tile (id: `finance`) have the title "Cost Intelligence" and identical metric displays (`_costData.today.totalCents`, `_costData.today.calls`). They show the same data and have the same name. The `finance` detail view title also says "Cost Intelligence."
**Fix:** Rename the `finance` tile to "Finance" and give it distinct metrics (e.g., from `_servicesData`), or remove one tile if they're truly duplicates.

### Bug 3: Agent Memory tile uses wrong auth pattern
**File:** `command-center.html`, line 2717
**What's wrong:** `renderDetailLearnings()` calls `learning-api` with `Authorization: Bearer` header while every other API call uses `?key=` query parameter. If `learning-api` uses the same `validateAuth()` that checks for query param `key`, this Bearer header won't authenticate.
**Fix:** Use the same `?key=` pattern: `fetch('/.netlify/functions/learning-api?view=active&agent=all&key=' + apiKey)`

### Bug 4: `report_history` data fetched but never displayed
**File:** `command-center-api.js`, lines 117-131; `command-center.html` — no consumer
**What's wrong:** The API fetches `report_history.marketpulse` and `report_history.proposalpulse` (lines 117-131) but no UI element in command-center.html ever reads or displays this data.
**Fix:** Either add a "Report History" section to the Products detail view, or remove the queries to save API overhead.

### Bug 5: `_financeData` variable declared but never assigned
**File:** `command-center.html`, line 481
**What's wrong:** `_financeData` is declared as `null` but never assigned anywhere. `renderDetailFinance()` uses `_costData` instead. Dead variable.
**Fix:** Remove the `_financeData` declaration.

### Bug 6: Role filter has no effect on most tiles
**File:** `command-center.html`, lines 604-605 vs 606-626
**What's wrong:** Only `coo` and `editorial` tiles have a `roles` property. The `applyRoleFilter()` function calls `renderTiles()` but `renderTiles()` does not filter by role — it renders all tiles unconditionally.
**Fix:** Add role-based filtering in `renderTiles()` or add `roles` property to all tiles.

### Bug 7: `agent_heartbeats` table mismatch in agent-bridge.js
**File:** `agent-bridge.js`, line 52 and 155-168
**What's wrong:** `agent-bridge.js` GET reads from `agent_heartbeats` table and upserts to `agent_heartbeats`. But `command-center-api.js` reads from `agent_registry` table (line 153-160). These are different tables. Agent heartbeats via bridge won't appear in the command center dashboard unless `agent_registry` is also updated.
**Fix:** Update `agent-bridge.js` `update_agent` action to write to `agent_registry` instead of `agent_heartbeats`, matching what the command center API reads.

### Bug 8: No Cmd+K keyboard shortcut
**File:** `command-center.html` — entire file
**What's wrong:** There is no keyboard shortcut handler for Cmd+K or Ctrl+K. The main site (other pages) has a search overlay with Cmd+K, but the command center has no keyboard shortcuts at all.
**Fix:** Add a Cmd+K handler that focuses the command bar input, since that's the equivalent feature.

### Bug 9: Competitive Intel detail is placeholder
**File:** `command-center.html`, lines 2697-2710
**What's wrong:** `renderDetailCompetitive()` fetches `approval-api?view=summary` (which isn't competitive data) and renders only a generic paragraph. Tile shows `--` for both metrics.
**Fix:** Either wire it to the `competitive-scan.js` function output or mark the tile as "Coming Soon."

### Bug 10: Org filter "missionmeetstech.com" does nothing different from "All"
**File:** `command-center.html`, lines 711-719
**What's wrong:** Clicking "missionmeetstech.com" in the org filter runs the same code path as "All" — it shows `tile-home` and hides `mp-placeholder`. No filtering of tiles by organization happens.
**Fix:** Add tile filtering by org, or remove the MMT button if filtering isn't needed.

---

## Missing Functionality

| # | Feature | Evidence | Status |
|---|---------|----------|--------|
| 1 | Cmd+K command palette | Referenced in audit instructions; standard ops dashboard feature | **Missing entirely** |
| 2 | Mobile hamburger nav | Page has no nav bar at all, only responsive CSS | **Missing** |
| 3 | Competitive Intel data | Tile exists, detail view is placeholder | **Stub only** |
| 4 | Report History display | API fetches data, no UI consumer | **Data orphaned** |
| 5 | Role-based tile filtering | Role selector exists but `renderTiles()` ignores it | **Not wired** |
| 6 | Content Performance analytics | Editorial console has "Coming soon" placeholder | **Stub only** |
| 7 | Org filter for MMT vs MP tiles | Org buttons exist but only MP does anything | **Not wired** |

---

## Fix Plan

| # | What to fix | File | Change | Est. Lines |
|---|-------------|------|--------|-----------|
| 1 | Approval bar CSS conflict | `command-center.html:329` | Remove duplicate `display:flex` from inline style | 1 |
| 2 | Duplicate "Cost Intelligence" tile title | `command-center.html:608` | Rename finance tile to "Finance Overview", update metrics to use `_servicesData` or combine | 3 |
| 3 | Agent Memory auth pattern | `command-center.html:2717,2735` | Change Bearer auth to `?key=` query param pattern | 2 |
| 4 | Dead `_financeData` variable | `command-center.html:481` | Remove declaration | 1 |
| 5 | Role filter not wired | `command-center.html:629-639` | Add role filtering in `renderTiles()` — check `t.roles` against `_roleFilter` | 5 |
| 6 | agent-bridge table mismatch | `agent-bridge.js:52,155-168` | Update to read/write `agent_registry` instead of `agent_heartbeats` | 8 |
| 7 | Cmd+K shortcut | `command-center.html` (before `</script>`) | Add `keydown` listener for Cmd+K/Ctrl+K → focus `#cmd-input` | 6 |
| 8 | Competitive Intel tile shows `--` | `command-center.html:622` | Set metrics to "Coming Soon" string instead of `--` | 2 |
| 9 | Org filter MMT button | `command-center.html:711-719` | Either add tile org metadata + filtering, or remove MMT-specific button | 5 |
