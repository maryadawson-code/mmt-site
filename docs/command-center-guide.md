# Command Center User Guide

## Overview

The Command Center (`command-center.html`) is the operational dashboard for Mission Meets Tech. It provides real-time monitoring, agent management, task dispatch, and business intelligence across all MMT products.

**URL:** `https://missionmeetstech.com/command-center.html`
**Auth:** Magic link login via email (sessions cached 60s, bcrypt-hashed tokens)

## Three Workspaces

The dashboard is organized into three workspaces, switchable via the workspace bar at the top.

### 1. Development Workspace
For engineering and product management.

**Tiles:** Task Queue, Agent Fleet, Roadmap, Products Health, Engineering, Tech Debt
**Key Views:**
- **Engineering Detail**: Deploys, PRs, tech debt tracker, quick actions (set mode, trigger health check)
- **Roadmap Detail**: Feature list by product, dependency graph, metrics, activity feed, "New Feature" form
- **Products Detail**: ProposalPulse + MarketPulse order status, delivery pipeline, error tracking

### 2. Operations Workspace
For business operations and finance.

**Tiles:** COO Console, Finance, Billing, Services, Customers, Projects, QA, Issues
**Key Views:**
- **COO Console**: Pending approval decisions, monthly burn, customer count, open/blocked tasks
- **Finance**: Revenue dashboard (Stripe), burn rate, cost breakdown by product
- **Billing Tracker**: MRR, subscriber status, invoice timeline
- **Issues Console**: Sentry errors, deployment regressions, production warnings

### 3. Editorial Workspace
For content management.

**Tiles:** Newsletter Pipeline, Signal Inbox, Content Studio, Research
**Key Views:**
- **Newsletter Pipeline**: Issue scheduling (kanban), publish dates, lead topics, status tracking
- **Signal Inbox**: Intel signals with triage actions (route to newsletter, dismiss, investigate)
- **Content Studio**: AI image generation, research tools, creative output management

## How To...

### Dispatch a Task
1. Use the command bar at the top (or press `Cmd+K` for the palette)
2. Select an agent from the dropdown
3. Type the task description
4. Select priority (low/medium/high/urgent)
5. Click Send (or press Enter)

The task appears in the Task Queue and the assigned agent picks it up.

### Steer an Agent Mid-Task
1. Navigate to the Agent Fleet tile
2. Click the agent chip to see current task
3. Use the "Command" button to send a follow-up instruction
4. The agent receives the command and adjusts its work

### Manage the Roadmap
1. Go to Development workspace → Roadmap tile
2. Use product filter to view by product (ProposalPulse, MarketPulse, mmt_site, etc.)
3. Click a feature to expand details, add comments, update status
4. Use "New Feature" button to add features
5. Switch to Dependencies tab for the graph view
6. Switch to Metrics tab for health/status rollups

### Manage Newsletter Pipeline
1. Go to Editorial workspace → Newsletter Pipeline
2. Click "Seed Next 4 Dates" to populate upcoming issue dates
3. Edit issue details: lead topic, status, publish date
4. Status flow: `planned` → `drafting` → `review` → `ready` → `published`
5. Click an issue to expand and edit

### Approve/Reject Actions
1. The approval bar appears at the top when items are pending
2. Click "Review" to see the approval queue
3. Each item shows: category, description, requester, urgency
4. Actions: Approve, Reject (with reason), Modify (suggest alternative)
5. COO decisions appear in the COO Console detail view

## Role System

Select your role from the dropdown in the status bar. This filters visible tiles and features.

| Role | Access |
|------|--------|
| CTO | All technical tiles, engineering, roadmap, security |
| COO | Business tiles, finance, billing, services, customers, approval queue |
| Editor | Editorial tiles, newsletter pipeline, signals, content studio |
| (All) | Shows everything — default view |

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd+K` / `Ctrl+K` | Open command palette |
| `Escape` | Close modal/palette, return to tiles |
| Click tile | Open detail view |
| Click "← Back" | Return to tile grid |

## Auto-Refresh

- Dashboard data refreshes every **120 seconds** automatically
- A "Last updated" indicator in the status bar shows data age
- If data is older than **5 minutes**, a yellow warning appears
- Individual detail views do not auto-refresh; go back and re-enter to refresh

## Status Modes

The mode badge shows the current operational status:
- **NORMAL** (green): All systems operational
- **DEGRADED** (yellow): Known issues, monitoring active
- **INCIDENT** (red): Active incident in progress
- **MAINTENANCE** (blue): Planned maintenance window

Set mode via Engineering detail → Quick Actions.
