# Command Center Ground Truth Audit — March 21, 2026

## File Stats
- **File:** `command-center.html`
- **Lines:** 3,818 (post-fix; was 3,810 at HEAD `a6eeaa8`)
- **Current HEAD:** `a6eeaa8` (Add P1 sprint results summary)
- **Last CC touch:** `a39c4e9` (Penny Pincher, +180 lines)
- **API backend:** `command-center-api.js` (605 lines) — main dashboard API
- **Agent bridge:** `agent-bridge.js` (~550 lines) — agent-to-dashboard bridge
- **Total commits since Mar 19:** 48 (46 before our audit fix)
- **Commits touching CC files:** 15

---

## Complete Deploy History (48 commits, Mar 19-21)

### Commits That Touched command-center.html (chronological)

| # | SHA | Date | Message | Lines changed | Key additions |
|---|-----|------|---------|---------------|---------------|
| 1 | `6ede886` | Mar 19 | Tile-based dashboard restructure | +660/-382 | Rewrote layout: 7-tile home, hash routing, org filter scaffold |
| 2 | `954201f` | Mar 19 | Failed terminal states fix | +2/-0 | Added `failed` to MP/PP terminal state lists in alert banner |
| 3 | `bc14f3d` | Mar 19 | Roadmap tile | +236 | Roadmap tile, platform overview cards, feature inventory, tech debt table |
| 4 | `92076e7` | Mar 19 | 6 dashboard tiles | +501 | Cost/Services/Customers/Projects/QA/Issues tiles + detail views |
| 5 | `e34fe18` | Mar 19 | Issue Resolution Console | +263/-58 | Full resolution console, agent chat, diff viewer, Sentry linking, timeline |
| 6 | `143c8b4` | Mar 19 | COO + Editorial Consoles | +287/-2 | COO Console, Editorial Console, approval bar, role selector, badge counts |
| 7 | `fcc5297` | Mar 19 | Platform v1 verification | +65/-2 | Competitive Intel + Agent Memory tiles/detail views |
| 8 | `c59b47f` | Mar 19 | Login screen + auth | +285/-8 | Full auth gate: login screen, magic link, user management, session storage |
| 9 | `e390f37` | Mar 19 | Billing tile | +181 | Billing Tracker tile + full detail view |
| 10 | `8e1c82a` | Mar 20 | CISO agent + ops console | +853/-3 | **Largest commit.** Security Posture tile, full ops console (cmd bar, agent panel, approval queue, task feed, signal feed, pipeline edit) |
| 11 | `a39c4e9` | Mar 20 | Penny Pincher | +178/-2 | Cost Control tile, Penny Pincher detail view |
| 12 | `5a63e24` | — | Agent dispatch UX | small | Improved dispatch: always queue + copy prompt |

### Commits That Touched command-center-api.js

| # | SHA | Message | Change |
|---|-----|---------|--------|
| 1 | `b32c5ff` | Auth lib update | +4/-11 — replaced inline auth with `validateAuth()` from `lib/auth.js` |
| 2 | `8e1c82a` | CISO agent | +139/-11 — CISO endpoints (posture, findings, scans, tracker) |
| 3 | `a39c4e9` | Penny Pincher | +97 — Penny dashboard, findings, routing rules |
| 4 | `9be0989` | Explicit columns | +4/-4 — replaced `select('*')` with explicit column lists |

### Commits That Touched agent-bridge.js

| # | SHA | Message | Lines | Actions added |
|---|-----|---------|-------|---------------|
| 1 | `275544b` | 14 bridge actions | +120 | finance_summary, finance_alerts, finance_services, customer_summary, customer_list, project_summary, project_tasks, qa_summary, qa_regressions, issue_list, issue_create, deployment_list, sentry_errors, service_deadline_check |
| 2 | `db3baab` | Diagnose/propose-fix | +67 | issue_diagnose, issue_propose_fix, deployment_verify |
| 3 | `5cd3d75` | Approval actions | +63 | approval_submit, approval_decide, approval_badge_counts |
| 4 | `216bc5c` | Learning + competitive | +47 | learning_read, learning_write, learning_feedback, competitive_update, competitive_alert |
| 5 | `8e1c82a` | CISO + task queue | +257 | update_task_status, request_approval, approve_action, reject_action, ciso_scan, ciso_posture, ciso_record_finding, ciso_update_finding, ciso_update_practice |
| 6 | `a39c4e9` | Penny Pincher | +226 | penny_record, penny_dashboard, penny_finding, penny_ack_finding, penny_override, penny_remove_override, penny_model_recommend |
| 7 | `fcc5297` | Platform v1 gaps | +29 | finance_update_service, customer_update, project_move_task, qa_regressions |
| 8 | `b318083` | Security hardening | +4 | Structured logging (createLogger) |

### All Other Commits (not touching CC files)

| SHA | Date | Message | What it does |
|-----|------|---------|-------------|
| `d6f3ccd` | Mar 19 | Contract name encoding fix | Fix double-encoding of contract names in build.js |
| `9be0989` | Mar 19 | Explicit column selects | Remove `select('*')` from bridge + CC API |
| `a265c1f` | Mar 19 | Health check noise fix | Fix 33 false-positive critical events by adding terminal states |
| `9619187` | Mar 19 | Cost optimization round 2 | Skip shadow scoring for admin, cap Perplexity at 12 calls, reduce scheduled frequency |
| `34d719c` | Mar 19 | ROADMAP.md | CTO onboarding feature tracker |
| `89319ac` | Mar 19 | Cost intelligence system | 5 tables, cost-tracker lib, cost-api, cost-rollup scheduled function |
| `63ed870` | Mar 19 | COO ops suite schema | 9 tables, customer-sync lib, issue-hooks lib |
| `876ac43` | Mar 19 | 5 API endpoints | finance-api, customer-api, projects-api, qa-api, issues-api |
| `bcac664` | Mar 19 | Cost tracking instrumentation | Instrument 8 API functions with cost tracking |
| `aa952ad` | Mar 19 | HITL framework tables | approval_queue, approval_categories, customer_sessions tables |
| `e0f977a` | Mar 19 | Universal approval API | approval-api.js (211 lines) |
| `4dab3b5` | Mar 19 | Approval hooks + notifications | lib/approval-hooks.js, lib/notification-engine.js |
| `38f721f` | Mar 19 | Customer portal | my-reports.html (487 lines), customer-auth.js |
| `5cd3d75` | Mar 19 | Approval bridge actions | 3 actions added to agent-bridge |
| `940176d` | Mar 19 | Approval hooks wired in | PP + MP now submit to approval queue before delivery |
| `9d4e0ab` | Mar 19 | My Reports nav link | Added across 83 HTML pages |
| `9bda349` | Mar 19 | Migration 011 | agent_learnings, learning_feedback, competitors, competitive_alerts tables |
| `2296495` | Mar 19 | Env detection + learning | lib/env.js, lib/learning-engine.js |
| `2c4e31b` | Mar 19 | 4 new functions | learning-api, backup-db, finance-rollup, competitive-scan |
| `d8d0515` | Mar 19 | Learning engine in approval API | Auto-create learning rules from rejections/modifications |
| `6b5ead5` | Mar 19 | Scheduled functions config | netlify.toml entries for billing-sync, competitive-scan, backup-db, etc. |
| `5f18df9` | Mar 19 | Vitest test framework | 3 test suites, GitHub Actions CI |
| `fa5c2ba` | Mar 19 | CTO onboarding docs | CTO-ONBOARDING.md, DISASTER-RECOVERY.md, restore script |
| `279f068` | Mar 19 | Dashboard auth tables | Migration: dashboard_users, sessions, magic_links, audit_log |
| `6b90979` | Mar 19 | Session cleanup | Expire old sessions, delete stale magic links in finance-rollup |
| `943258b` | Mar 19 | Billing tables | Migration: billing_records, billing_sync_status, monthly_cost_summary, oauth_tokens |
| `8798d6d` | Mar 19 | Billing sync function | billing-sync.js (1009 lines), 6 collectors |
| `27eb0b6` | Mar 19 | Google OAuth | google-oauth.js for Gmail receipt scanning |
| `321db56` | Mar 20 | Jack unlimited + PWA | Jack admin access, manifest.json, build.js PWA tags |
| `b318083` | Mar 20 | Security hardening | lib/logger.js, lib/sanitize.js, rate limiting, RLS audit |
| `530ea86` | Mar 20 | Observability + UX | Error boundaries, Sentry audit, form validation |
| `a6eeaa8` | Mar 20 | P1 sprint results | Documentation only |

---

## Complete Supabase Table Map

Tables queried/written by the command center stack (command-center-api.js, agent-bridge.js, and satellite APIs):

### Core Product Tables
| Table | Queried by | Purpose |
|-------|-----------|---------|
| `mp_scoring_history` | CC API, bridge | ProposalPulse scoring records |
| `marketpulse_orders` | CC API, bridge | MarketPulse order records |
| `quality_metrics` | CC API | Quality scores by product |
| `held_emails` | CC API | Emails held for review |
| `mp_feature_usage` | (PP frontend) | Free tier usage tracking |
| `mp_users` | (PP frontend) | User tier management |

### Agent Fleet Tables
| Table | Queried by | Purpose |
|-------|-----------|---------|
| `agent_registry` | CC API (GET) | Agent roster, status, heartbeats |
| `agent_heartbeats` | bridge (GET/upsert) | **STALE** — bridge still reads this; CC API reads agent_registry |
| `task_queue` | CC API, bridge | Task dispatch and lifecycle |
| `agent_approvals` | CC API, bridge | Agent-to-human approval queue |
| `agent_learnings` | bridge, learning-api | Self-learning rules |
| `learning_feedback` | bridge | Learning effectiveness tracking |

### Ops Intelligence Tables
| Table | Queried by | Purpose |
|-------|-----------|---------|
| `intel_signals` | CC API, bridge | Intelligence signal inbox |
| `newsletter_pipeline` | CC API, bridge | Newsletter editorial calendar |
| `ops_ledger` | CC API (via lib) | Ops events (24h feed) |
| `competitors` | bridge | Competitor profiles |
| `competitive_alerts` | bridge | Competitive intelligence alerts |

### Cost & Finance Tables
| Table | Queried by | Purpose |
|-------|-----------|---------|
| `cost_events` | cost-api, bridge | Per-call cost tracking |
| `cost_daily_rollup` | cost-api | Daily cost aggregation |
| `cost_baselines` | bridge | Cost anomaly baselines |
| `cost_alerts` | cost-api, bridge | Cost anomaly alerts |
| `cost_rate_card` | finance-api | Provider pricing |
| `service_inventory` | finance-api, bridge | Service/subscription inventory |
| `finance_alerts` | finance-api, bridge | Finance alerts |
| `billing_records` | billing-api | Transaction records |
| `billing_sync_status` | billing-api | Sync source status |
| `monthly_cost_summary` | billing-api | Monthly rollups |
| `oauth_tokens` | google-oauth | Gmail OAuth tokens |

### Penny Pincher Tables
| Table | Queried by | Purpose |
|-------|-----------|---------|
| `penny_token_usage` | CC API, bridge | Per-call token + cost tracking |
| `penny_model_pricing` | bridge | Model pricing table |
| `penny_daily_summary` | CC API | Daily cost summaries |
| `penny_findings` | CC API, bridge | Cost optimization findings |
| `penny_routing_rules` | CC API | Model routing enforcement rules |

### Security (CISO) Tables
| Table | Queried by | Purpose |
|-------|-----------|---------|
| `ciso_cmmc_practices` | CC API, bridge | 110 NIST 800-171 practices |
| `ciso_findings` | CC API, bridge | Security findings |
| `ciso_scan_log` | CC API | Scan history |
| `ciso_access_inventory` | CC API | Key rotation schedule |
| `ciso_incidents` | CC API | Security incidents |

### Customer & Project Tables
| Table | Queried by | Purpose |
|-------|-----------|---------|
| `customer_profiles` | customer-api, bridge | Customer health, revenue |
| `customer_interactions` | customer-api | Customer touchpoints |
| `projects` | projects-api, bridge | Active projects |
| `project_tasks` | projects-api, bridge | Task board |
| `qa_test_runs` | qa-api, bridge | QA test runs and regressions |

### Issue Resolution Tables
| Table | Queried by | Purpose |
|-------|-----------|---------|
| `issues` | issues-api, bridge | Issue tracking |
| `issue_comments` | issues-api, bridge | Agent chat / human comments |
| `deployments` | issues-api, bridge | Deployment log |
| `sentry_errors` | issues-api | Sentry error sync |

### Approval & Auth Tables
| Table | Queried by | Purpose |
|-------|-----------|---------|
| `approval_queue` | approval-api | Universal approval queue |
| `approval_categories` | approval-api | Approval type definitions |
| `dashboard_users` | dashboard-auth | Dashboard user accounts |
| `dashboard_sessions` | dashboard-auth | Active sessions |
| `dashboard_magic_links` | dashboard-auth | Magic link tokens |
| `dashboard_audit_log` | dashboard-auth | Auth audit trail |

### Content Tables
| Table | Queried by | Purpose |
|-------|-----------|---------|
| `generated_images` | CC API | AI-generated image history |
| `contract_intel` | contract-intel.js | AI-powered contract intelligence |

**Total tables in CC stack: 47**

---

## Complete UI Element Map

### Auth Gate (Lines 227–266)

| # | Element | What it does | Handler | Works? | Bug |
|---|---------|-------------|---------|--------|-----|
| 1 | Login screen | Email magic link login | `requestLogin()` | YES | — |
| 2 | Login email input | Email field + Enter key | `requestLogin()` | YES | — |
| 3 | "Send Login Link" button | Sends magic link | `requestLogin()` | YES | — |
| 4 | Login sent view | "Check your email" | — | YES | — |
| 5 | Login error view | Expired/invalid error | — | YES | — |
| 6 | "Try different email" | Returns to form | `showLoginForm()` | YES | — |
| 7 | Legacy `?key=` param | Bypasses login | `initAuth()` | YES | — |
| 8 | `?auth=&email=` params | Magic link verify | `initAuth()` | YES | — |

### User Bar + Management (Lines 268–309)

| # | Element | Handler | Works? | Bug |
|---|---------|---------|--------|-----|
| 9 | User name + role badge | `showDashboard()` | YES | — |
| 10 | "Manage Users" button | `showUserManagement()` | YES | — |
| 11 | "Log Out" button | `logout()` | YES | — |
| 12 | User list in modal | `showUserManagement()` | YES | — |
| 13 | Add user form | `addUser()` | YES | — |
| 14 | Close modal button | `closeUserMgmt()` | YES | — |

### Header (Lines 311–317)

| # | Element | Handler | Works? | Bug |
|---|---------|---------|--------|-----|
| 15 | Mode badge (NORMAL/DEGRADED/etc) | `renderMode()` | YES | — |
| 16 | Last refresh timestamp | `loadDashboard()` | YES | — |

### Org Filter (Lines 322–326)

| # | Element | Handler | Works? | Bug |
|---|---------|---------|--------|-----|
| 17 | "All" button | click on `#org-filter` | YES | — |
| 18 | ~~"missionmeetstech.com" button~~ | — | **REMOVED** | Fixed in audit — did nothing different from "All" |
| 19 | "missionpulse.ai" button | click on `#org-filter` | YES | Shows MP placeholder |

### Approval Notification Bar (Line 329)

| # | Element | Handler | Works? | Bug |
|---|---------|---------|--------|-----|
| 20 | Approval count bar | `renderApprovalBar()` | **FIXED** | Was showing on load due to CSS conflict (duplicate `display`) |
| 21 | "Review Now" button | `scrollToConsole()` | YES | — |

### Role Selector (Lines 335–343)

| # | Element | Handler | Works? | Bug |
|---|---------|---------|--------|-----|
| 22 | "View as" dropdown | `applyRoleFilter()` | **FIXED** | Now filters tiles by `roles` property |

### Ops Console: Command Bar (Lines 351–363)

| # | Element | Handler | Works? | Bug |
|---|---------|---------|--------|-----|
| 23 | Command text input | Enter → `cmdSend()` | YES | — |
| 24 | Agent selector dropdown | `initCmdBar()` | YES | — |
| 25 | Priority selector | — | YES | — |
| 26 | Send button | `cmdSend()` | YES | — |
| 27 | History button (↑) | `cmdToggleHistory()` | YES | — |
| 28 | ArrowUp on input | `cmdFillFromHistory()` | YES | — |
| 29 | **Cmd+K / Ctrl+K** | focus cmd input | **ADDED** | New in audit fix |

### Ops Console: Agent Panel (Line 366)

| # | Element | Handler | Works? | Bug |
|---|---------|---------|--------|-----|
| 30 | Agent status chips | `renderAgentPanel()` | YES | — |
| 31 | Agent chip click (filter) | `toggleAgentFilter()` | YES | — |

### Ops Console: Approval Queue (Lines 369–379)

| # | Element | Handler | Works? | Bug |
|---|---------|---------|--------|-----|
| 32 | Pending approvals list | `renderApprovals()` | YES | — |
| 33 | APPROVE button | `decideApproval(id, 'approved')` | YES | — |
| 34 | DENY button | `decideApproval(id, 'denied')` | YES | — |
| 35 | Recent Decisions toggle | `toggleRecentDecisions()` | YES | — |

### Ops Console: Live Task Feed (Lines 382–397)

| # | Element | Handler | Works? | Bug |
|---|---------|---------|--------|-----|
| 36 | Task feed with pipeline viz | `renderTaskFeed()` | YES | — |
| 37 | All/Active/Completed/Failed filters | `setTaskFilter()` | YES | — |
| 38 | Refresh button | `refreshOpsConsole()` | YES | — |
| 39 | Cancel task button | `cancelOpsTask()` | YES | — |

### Ops Console: Signal Inbox (Lines 402–414)

| # | Element | Handler | Works? | Bug |
|---|---------|---------|--------|-----|
| 40 | Signal feed | `renderSignalFeed()` | YES | — |
| 41 | All/Critical/High/New filters | `setSignalFilter()` | YES | — |
| 42 | Newsletter triage button | `triageSignal(id, 'newsletter')` | YES | — |
| 43 | Dismiss button | `triageSignal(id, 'dismissed')` | YES | — |
| 44 | Pin/Unpin button | `triageSignal(id, 'pinned/new')` | YES | — |

### Ops Console: Pipeline Quick-Edit (Lines 417–423)

| # | Element | Handler | Works? | Bug |
|---|---------|---------|--------|-----|
| 45 | Pipeline feed | `renderPipelineFeed()` | YES | — |
| 46 | "+ Add Issue" button | `addPipelineSlot()` | YES | — |
| 47 | Status dropdown per issue | `pipeUpdateStatus()` | YES | — |
| 48 | Topic inline edit | `pipeUpdateTopic()` | YES | — |
| 49 | Notes textarea | `pipeUpdateNotes()` | YES | — |

### Tile Grid (Lines 427–430)

| # | Element | Handler | Works? | Bug |
|---|---------|---------|--------|-----|
| 50 | "Full Dashboard Tiles" details | `<details>` | YES | — |

### Dashboard Tiles (22 tiles, line 603–626)

| # | Tile ID | Title | Introduced in | Detail view | Works? | Bug |
|---|---------|-------|---------------|-------------|--------|-----|
| 51 | `coo` | COO Console | `143c8b4` | `renderDetailCOO()` | YES | — |
| 52 | `editorial` | Editorial | `143c8b4` | `renderDetailEditorial()` | YES | — |
| 53 | `roadmap` | Roadmap | `bc14f3d` | `renderDetailRoadmap()` | YES | — |
| 54 | `costs` | Cost Intelligence | `89319ac` | `renderDetailCosts()` | YES | — |
| 55 | `finance` | ~~Cost Intelligence~~ **Finance Overview** | `92076e7` | `renderDetailFinance()` | **FIXED** | Was duplicate title/metrics of `costs` |
| 56 | `billing` | Billing Tracker | `e390f37` | `renderDetailBilling()` | YES | — |
| 57 | `services` | Services | `92076e7` | `renderDetailServices()` | YES | — |
| 58 | `customers` | Customers | `92076e7` | `renderDetailCustomers()` | YES | — |
| 59 | `projects` | Projects | `92076e7` | `renderDetailProjects()` | YES | — |
| 60 | `qa` | QA | `92076e7` | `renderDetailQA()` | YES | — |
| 61 | `issues` | Issues | `92076e7` + `e34fe18` | `renderDetailIssues()` | YES | — |
| 62 | `newsletter` | Newsletter | `6ede886` | `renderDetailNewsletter()` | YES | — |
| 63 | `products` | Products | `6ede886` | `renderDetailProducts()` | YES | — |
| 64 | `engineering` | Engineering | `6ede886` | `renderDetailEngineering()` | YES | — |
| 65 | `business` | Business | `6ede886` | `renderDetailBusiness()` | YES | — |
| 66 | `health` | Site Health | `6ede886` | `renderDetailHealth()` | YES | — |
| 67 | `agents` | Agent Fleet | `6ede886` | `renderDetailAgents()` | YES | — |
| 68 | `content` | Content Studio | `6ede886` | `renderDetailContent()` | YES | — |
| 69 | `competitive` | Competitive Intel | `fcc5297` | `renderDetailCompetitive()` | **STUB** | Placeholder content only |
| 70 | `learnings` | Agent Memory | `fcc5297` | `renderDetailLearnings()` | **FIXED** | Was using Bearer auth; now uses ?key= |
| 71 | `security` | Security Posture | `8e1c82a` | `renderDetailSecurity()` | YES | — |
| 72 | `penny` | Cost Control | `a39c4e9` | `renderDetailPenny()` | YES | — |

### MissionPulse Placeholder (Lines 434–437)

| # | Element | Handler | Works? | Bug |
|---|---------|---------|--------|-----|
| 73 | MP placeholder | `showHome()` back button | YES | — |

### Detail Views — Products (Lines 778–854)

| # | Element | Handler | Works? |
|---|---------|---------|--------|
| 74 | ProposalPulse tab | `productsTab='pp'` | YES |
| 75 | MarketPulse tab | `productsTab='mp'` | YES |

---

## Complete API Action Map

### command-center-api.js — GET (all dashboard data in one call)

| Data Key | Source | Tables | UI Consumer |
|----------|--------|--------|-------------|
| `health.mode` | `lib/kill-switch` | env var | Mode badge |
| `flags` | `lib/feature-flags` | env var | Health detail |
| `circuits` | `lib/circuit-registry` | in-memory | Health detail |
| `orders_24h.proposalpulse` | Supabase | `mp_scoring_history` | Products, alerts, tiles |
| `orders_24h.marketpulse` | Supabase | `marketpulse_orders` | Products, alerts, tiles |
| `quality.proposalpulse` | Supabase | `quality_metrics` | Tile metrics |
| `quality.marketpulse` | Supabase | `quality_metrics` | Tile metrics |
| `ops_events_24h` | `lib/ops-ledger` | `ops_ledger` | Health events table |
| `held_emails` | Supabase | `held_emails` | Health held emails |
| `report_history.marketpulse` | Supabase | `marketpulse_orders` | **ORPHANED** — no UI consumer |
| `report_history.proposalpulse` | Supabase | `mp_scoring_history` | **ORPHANED** — no UI consumer |
| `pipeline` | Supabase | `newsletter_pipeline` | Newsletter, pipeline feed |
| `tasks` | Supabase | `task_queue` | Engineering, task feed |
| `agents` | Supabase | `agent_registry` | Agent panel, fleet detail |
| `signals` | Supabase | `intel_signals` | Signal feed |
| `revenue` | Stripe API | — | Business detail |
| `recent_images` | Supabase | `generated_images` | Content studio |

### command-center-api.js — POST Actions (28 actions)

| Action | Introduced in | Params | UI Caller | Tables |
|--------|--------------|--------|-----------|--------|
| `release_email` | `6ede886` | `id` | Health → Release | `held_emails` |
| `set_mode` | `6ede886` | `value` | Engineering → Quick Actions | `ops_ledger` |
| `trigger_health_check` | `6ede886` | — | Engineering → Quick Actions | `ops_ledger` |
| `add_task` | `8e1c82a` | `task`, `agent` | Cmd bar | `task_queue`, `ops_ledger` |
| `kill_task` | `6ede886` | `id` | Engineering → Cancel | `task_queue` |
| `update_pipeline` | `6ede886` | `id` + fields | Pipeline inline edits | `newsletter_pipeline` |
| `add_pipeline` | `6ede886` | `publish_date`, `day_slot` | + Add Issue | `newsletter_pipeline` |
| `add_signal` | `6ede886` | `title` | Research push, add signal | `intel_signals` |
| `score_signal` | `6ede886` | `id`, `relevance_score` | Newsletter score button | `intel_signals` |
| `kill_signal` | `6ede886` | `id` | Newsletter kill button | `intel_signals` |
| `update_agent` | `8e1c82a` | `agent_id` | Agent detail | `agent_registry` |
| `list_approvals` | `8e1c82a` | `status` | Ops approval queue | `agent_approvals` |
| `decide_approval` | `8e1c82a` | `approval_id`, `decision` | Ops approve/deny | `agent_approvals` |
| `cancel_task` | `8e1c82a` | `task_id` | Task feed cancel | `task_queue` |
| `triage_signal` | `8e1c82a` | `signal_id`, `triage_status` | Signal triage buttons | `intel_signals`, `task_queue` |
| `seed_pipeline` | `6ede886` | — | Newsletter seed button | `newsletter_pipeline` |
| `ciso_posture` | `8e1c82a` | — | Security tile/detail | `ciso_cmmc_practices`, `ciso_findings`, `ciso_scan_log`, `ciso_access_inventory`, `ciso_incidents` |
| `ciso_findings` | `8e1c82a` | `status`, `severity` | Security detail | `ciso_findings` |
| `ciso_update_finding` | `8e1c82a` | `finding_id` | Security accept risk | `ciso_findings` |
| `ciso_cmmc_tracker` | `8e1c82a` | optional `family` | Security full tracker | `ciso_cmmc_practices` |
| `ciso_scan` | `8e1c82a` | `scan_type` | Security run scan | `ciso_scan_log` + via lib/ciso-scans |
| `penny_dashboard` | `a39c4e9` | — | Penny tile/detail | `penny_token_usage`, `penny_findings`, `penny_daily_summary`, `penny_routing_rules` |
| `penny_update_finding` | `a39c4e9` | `finding_id`, `status` | Penny approve/defer | `penny_findings` |
| `penny_findings` | `a39c4e9` | `status` | Penny detail | `penny_findings` |

### agent-bridge.js Actions (40+ actions, all Bearer token auth)

**Core Task Management (introduced `8e1c82a`):**
- `dispatch_task` — dispatch to any agent
- `complete_task` — mark task done
- `fail_task` — mark task failed
- `update_task_status` — lifecycle updates (pending→acknowledged→in_progress→awaiting_approval→completed→failed)
- `update_agent` — heartbeat/status update (**FIXED** — now writes to `agent_registry` instead of `agent_heartbeats`)

**Signal & Pipeline (introduced `6ede886`):**
- `add_signal` — create intel signal
- `update_pipeline` — update newsletter pipeline
- `add_pipeline` — add pipeline slot

**Approval System (introduced `5cd3d75`, `8e1c82a`):**
- `request_approval` — agent requests human approval
- `decide_approval` — human approves/denies
- `list_approvals` — poll pending approvals
- `triage_signal` — triage signal to newsletter/dismiss/pin

**Cost & Finance (introduced `275544b`, `a39c4e9`):**
- `cost_summary` — today's cost summary
- `cost_resolve_alert` — resolve cost alert
- `cost_update_threshold` — update anomaly threshold
- `finance_summary` — finance overview
- `finance_alerts` — list finance alerts
- `finance_services` — list service inventory
- `finance_update_service` — update service priority/status

**Customer & Projects (introduced `275544b`, `fcc5297`):**
- `customer_summary` — customer health overview
- `customer_at_risk` — list at-risk customers
- `customer_update` — update customer profile
- `project_dashboard` — project summary
- `project_backlog` — task backlog
- `project_create_task` — create task
- `project_move_task` — move task status

**QA & Issues (introduced `275544b`, `db3baab`):**
- `qa_summary` — QA product health
- `qa_regressions` — list regressions
- `issue_list` — open issues
- `issue_detail` — issue + comments
- `issue_create` — create issue
- `issue_comment` — add comment
- `issue_diagnose` — agent diagnosis
- `issue_propose_fix` — agent proposes fix with diff
- `deployment_log` — log deployment

**Learning & Competitive (introduced `216bc5c`):**
- `learning_read` — query learning rules
- `learning_write` — store learning rule
- `learning_feedback` — record learning effectiveness
- `competitive_update` — upsert competitor data
- `competitive_alert` — create competitive alert

**CISO Security (introduced `8e1c82a`):**
- `ciso_posture` — CMMC score, findings, scans
- `ciso_scan` — run security scan
- `ciso_record_finding` — record finding
- `ciso_update_finding` — update finding
- `ciso_update_practice` — update CMMC practice status

**Penny Pincher (introduced `a39c4e9`):**
- `penny_record` — record token usage with cost
- `penny_dashboard` — cost dashboard data
- `penny_finding` — create cost finding
- `penny_ack_finding` — acknowledge finding
- `penny_override` — set model routing override
- `penny_remove_override` — remove override
- `penny_model_recommend` — cheapest model suggestion

### Satellite APIs (separate Netlify functions)

| API | Introduced in | GET Views | POST Actions |
|-----|--------------|-----------|-------------|
| `cost-api.js` | `89319ac` | summary, trend, by-provider, by-product, alerts | resolve_alert |
| `finance-api.js` | `876ac43` | services-summary, services, rate-card | resolve_alert |
| `billing-api.js` | `e390f37` | summary, records, needs-review, sync-status, monthly-trend | review_record, add_manual, trigger_sync, toggle_source, import_apple, export_csv |
| `customer-api.js` | `876ac43` | summary, list | — |
| `projects-api.js` | `876ac43` | dashboard, backlog | create_task |
| `qa-api.js` | `876ac43` | summary, regressions | — |
| `issues-api.js` | `876ac43` | open, needs-approval, sentry, deployments, stats, detail | comment, approve_fix, reject_fix, create, update_status |
| `approval-api.js` | `e0f977a` | pending, badge-counts, history, summary | approve, reject, modify, comment |
| `learning-api.js` | `2c4e31b` | active, effective | — |
| `dashboard-auth.js` | `b32c5ff` | validate, users | request_link, verify, logout, add_user |
| `google-oauth.js` | `27eb0b6` | — | connect, callback, status, disconnect |

---

## About the Non-Existent SHAs

The following SHAs referenced in the original request do **not exist** in any branch of this repository:

- `74daef7` (rate-limiter tests for Supabase)
- `724601b` (failed orders, agent registry, product health tiles)
- `e12bd33` (Phase 10 — Product Roadmap Dashboard + Developer Portal)
- `6242922` (Product Roadmap summary tile)
- `2c10c5d` (Sentry integration — source maps, alerts, DSN)
- `c5c73be` (P1-P3 hardening — logging, RLS, sanitization, cache, state machine)
- `466af56` (command center fixes — CURRENT PROD)

These may be from:
1. Netlify deploy IDs (not git SHAs)
2. A force-pushed or rebased branch where the commits were squashed
3. A different repository fork

The features described in these messages **do exist** in the repo under different SHAs:
- "Sentry integration" → audited in `530ea86` (Sentry status documented but not fully wired)
- "P1-P3 hardening" → `b318083` (Phase 1 security) + `530ea86` (Phase 2+3 observability)
- "CISO + security scans" → `8e1c82a`
- "Agent registry, product health tiles" → `92076e7` + `8e1c82a`
- "Product Roadmap" → `bc14f3d`
- "Rate limiter" → integrated in `b318083` via existing `lib/rate-limiter.js`

---

## Bugs Found (Updated — 12 total)

### Bug 1: Approval notification bar CSS conflict (**FIXED**)
**File:** `command-center.html:329` | **Introduced in:** `143c8b4`
**What:** Duplicate `display` in inline style — `display:none` then `display:flex` — second wins, bar always visible.
**Fix applied:** Removed duplicate `display:flex`.

### Bug 2: Duplicate tile title "Cost Intelligence" (**FIXED**)
**File:** `command-center.html:608` | **Introduced in:** `92076e7`
**What:** Both `costs` and `finance` tiles had title "Cost Intelligence" with identical metrics from `_costData`.
**Fix applied:** Renamed finance tile to "Finance Overview" with `_servicesData` metrics.

### Bug 3: Agent Memory auth pattern mismatch (**FIXED**)
**File:** `command-center.html:2717,2735` | **Introduced in:** `fcc5297`
**What:** `renderDetailLearnings()` uses `Authorization: Bearer` header while all other API calls use `?key=` query param. The `learning-api.js` may not support both auth patterns.
**Fix applied:** Changed to `?key=` pattern.

### Bug 4: Dead `_financeData` variable (**FIXED**)
**File:** `command-center.html:481` | **Introduced in:** `92076e7`
**What:** `_financeData` declared but never assigned anywhere. `renderDetailFinance()` uses `_costData`.
**Fix applied:** Removed declaration.

### Bug 5: Role filter not wired to tile rendering (**FIXED**)
**File:** `command-center.html:629-639` | **Introduced in:** `143c8b4`
**What:** Role selector exists but `renderTiles()` renders all tiles regardless of `_roleFilter`. Only `coo` and `editorial` tiles have `roles` property.
**Fix applied:** Added filter in `renderTiles()` that respects `_roleFilter`.

### Bug 6: agent-bridge reads/writes wrong table (**FIXED**)
**File:** `agent-bridge.js:52,155-168` | **Introduced in:** original file; diverged when `8e1c82a` added `agent_registry`
**What:** GET reads from `agent_heartbeats`, upsert writes to `agent_heartbeats`. But `command-center-api.js` reads from `agent_registry` (added in `8e1c82a`). Agent heartbeats via bridge are invisible to dashboard.
**Root cause:** `8e1c82a` (CISO commit) introduced `agent_registry` table and updated CC API to read it, but did NOT update the bridge's GET/upsert — it still uses the old `agent_heartbeats` table.
**Fix applied:** Updated bridge to read/write `agent_registry`.

### Bug 7: No Cmd+K keyboard shortcut (**FIXED**)
**File:** `command-center.html` | **Since:** `8e1c82a` added cmd bar but no keyboard shortcut
**Fix applied:** Added Cmd+K/Ctrl+K listener to focus command input.

### Bug 8: Competitive Intel tile is stub (**DOCUMENTED**)
**File:** `command-center.html:2697-2710` | **Introduced in:** `fcc5297`
**What:** Detail view fetches `approval-api?view=summary` (not competitive data) and renders generic paragraph. Tile shows "--" for both metrics.
**Fix applied:** Changed tile to show "Coming Soon" instead of "--".

### Bug 9: Non-functional MMT org filter button (**FIXED**)
**File:** `command-center.html:322-326` | **Introduced in:** `6ede886`
**What:** "missionmeetstech.com" button runs same code path as "All" — no actual filtering.
**Fix applied:** Removed non-functional button.

### Bug 10: `report_history` data fetched but orphaned
**File:** `command-center-api.js:117-131` | **Introduced in:** unclear (may predate Mar 19)
**What:** API queries `marketpulse_orders` and `mp_scoring_history` for report_history, but no UI element ever reads `dashData.report_history`.
**Status:** Not yet fixed. Recommend either adding report history section to Products detail or removing queries.

### Bug 11: Duplicate approval system (command-center-api vs agent-bridge)
**File:** `command-center-api.js:366-387` AND `agent-bridge.js:219-255`
**What:** Both `command-center-api.js` and `agent-bridge.js` implement `list_approvals`, `decide_approval`, and `triage_signal` actions with near-identical code. The CC API uses `agent_approvals` table while the bridge also uses `agent_approvals`. The dashboard calls the CC API version; agents call the bridge version. They do the same thing but have slight differences (bridge checks Bearer auth, CC API checks session token).
**Risk:** If one is updated and the other isn't, they'll diverge.
**Status:** Not critical but should be consolidated. Keep bridge version (agent-facing) and CC API version (dashboard-facing) but extract shared logic.

### Bug 12: Ops console polling calls `loadDashboard()` recursively
**File:** `command-center.html:3584-3589` | **Introduced in:** `8e1c82a`
**What:** `refreshOpsConsole()` calls `loadDashboard()`, which at line 539 calls `renderOpsConsole()` and `loadApprovals()`. Then `refreshOpsConsole()` also calls `renderOpsConsole()` and `loadApprovals()` — double-rendering on every 15s poll.
**Status:** Low severity — wastes render cycles but doesn't break anything. Fix by having `refreshOpsConsole()` only call `loadDashboard()` and let its post-render hook handle the ops console.

---

## Missing Functionality

| # | Feature | Evidence | Status |
|---|---------|----------|--------|
| 1 | Cmd+K command palette | Standard ops feature | **FIXED** — basic focus shortcut added |
| 2 | Mobile hamburger nav | No nav bar at all, only responsive CSS | **Missing** |
| 3 | Competitive Intel data | Tile + detail view are stubs | **Stub only** |
| 4 | Report History display | API fetches, no UI consumer | **Data orphaned** |
| 5 | Content Performance analytics | Editorial console placeholder | **Stub only** |
| 6 | Sentry source maps | Sentry module exists but never imported; no source map upload | **Not wired** (documented in `530ea86` audit) |
| 7 | Full Cmd+K palette (search/navigate) | Current fix only focuses input; no search/command list | **Basic only** |

---

## Fix Plan (Updated)

### Already Fixed (in PR #14)

| # | Bug | File | Change |
|---|-----|------|--------|
| 1 | Approval bar CSS | `command-center.html:329` | Remove duplicate `display:flex` |
| 2 | Duplicate tile title | `command-center.html:608` | Rename to "Finance Overview" |
| 3 | Agent Memory auth | `command-center.html:2717,2735` | Bearer → `?key=` |
| 4 | Dead variable | `command-center.html:481` | Remove `_financeData` |
| 5 | Role filter | `command-center.html:629` | Add filter in `renderTiles()` |
| 6 | Bridge table mismatch | `agent-bridge.js:52,155` | `agent_heartbeats` → `agent_registry` |
| 7 | Cmd+K shortcut | `command-center.html` | Add keydown listener |
| 8 | Competitive "--" | `command-center.html:622` | Show "Coming Soon" |
| 9 | MMT org button | `command-center.html:322` | Remove non-functional button |

### Remaining Fixes (for next PR)

| # | Bug | File | Change | Est. Lines |
|---|-----|------|--------|-----------|
| 10 | Orphaned report_history | `command-center-api.js:117-131` | Add report history section to Products detail view, or remove the queries | 20 |
| 11 | Double ops console render | `command-center.html:3584-3589` | Remove `renderOpsConsole()` and `loadApprovals()` from `refreshOpsConsole()` — let `loadDashboard()` handle it | 3 |
| 12 | Add roles to remaining tiles | `command-center.html:606-626` | Add `roles: ['cto', 'coo', 'all']` (or similar) to all tiles that currently lack it | 20 |
