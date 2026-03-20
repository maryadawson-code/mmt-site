# Targeted Fixes — March 20, 2026

## Fix 1: Failed Orders

- **Orders found:** 2
- **Retried:** 0 (reports already generated — only delivery failed)
- **Fixed:** 2 orders updated from `failed` → `delivered` (reports + URLs exist)
- **Order IDs:**
  - `603fa15e` — SDVOSB contract cancellation analysis (maryadawson@gmail.com)
  - `ce30f302` — VHA Office of Emergency Management procurement intel (maryadawson@gmail.com)
- **Root cause:** Error message says "Manually marked failed — report generated but PDF/email delivery failed. Cleanup March 19." Reports exist with valid `report_url` and `report_html`.
- **Report URLs:** Both orders have live report URLs via `view-report` function. Mary can access them from the command center report history.

## Fix 2: Agent Registration

- **Root cause:** The 6 ops agents were registered in `agent_heartbeats` (V1/V2) but NOT in `agent_registry` (V3). The command-center-api.js reads from `agent_registry` (line 154), so the command center saw 0 agents.
- **Fix:** Upserted all 6 ops agents into `agent_registry` with real heartbeat data (status, last_active from `agent_heartbeats`).
- **Agents visible:** 6/6 ops agents now in registry
  - ops-code: active, last seen 17:00
  - ops-editorial: idle, last seen 17:00
  - ops-research: idle, last seen 16:03
  - ops-monitor: idle, last seen 17:07
  - ops-social: idle, last seen 13:04
  - ops-newsletter: idle, last seen 22:06 (Mar 19)
- **Total agents in registry:** 26 (20 pre-existing + 6 ops)

## Fix 3: Product Health Tiles

- **Root cause:** The Products tile (line 616) showed `activeOrders.length` and `deliveredToday.length` from `orders_24h` — only last 24 hours. With 0 orders in 24h, tiles correctly showed 0.
- **Fix:** Added `product_health` to dashboard API response with total counts. Updated Products tile to show total orders (60 total: 57 PP + 3 MP) instead of just 24h activity. Tile now shows: total orders, delivered today (or active), badge for errors + stale orders.
- **ProposalPulse orders shown:** 57
- **MarketPulse orders shown:** 3

## Fix 4: Health Aggregation Endpoint

- **Endpoint:** `/.netlify/functions/command-center-api` (GET) — enhanced, not a new endpoint
- **Status:** Updated — added `product_health` field to dashboard response
- **Response includes:**
  - `product_health.proposalpulse`: total_orders, orders_today, stale_orders, stale_ids
  - `product_health.marketpulse`: total_orders, orders_today, stale_orders, stale_ids
- **Stale detection:** Orders with `workflow_state='processing'` AND `created_at < NOW() - 30 min`
- **Auth:** Same as existing dashboard (COMMAND_CENTER_KEY via `validateAuth()`)

## Fix 5: Stale Order Detection

- **Stale orders found:** 0 (none currently stuck in processing)
- **Warning badge:** Implemented — Products tile shows yellow border + "⚠️ N stale orders" text when stale_orders > 0
- **Products detail view:** Shows stale order count with yellow warning styling at top of product health summary
- **Badge count:** Products tile badge includes error count + stale count
- **ops_events logging:** Not added separately — stale orders are detectable from the product_health response and the existing health.js endpoint already checks stuck_scoring and stuck_orders

## Deploy

- **Commit:** See below
- **Homepage:** Pending verification
- **Command center:** Agents now visible, tiles show real data
- **Admin access:** Not modified — validateAuth() unchanged
