# Agent Access Paid Add-On — Go-Live Runbook (PR #104)

Six steps, ~25 min, mostly in Stripe. The code is done; these are the parts that need your accounts. Do them **in this order**.

> The read API (#103) is already live. This adds the **paid upgrade** ($39/mo first agent, +$29/mo each additional) and the Claude-powered scoring.

---

## Step 1 — Add the database column (3 min)
1. Supabase → **missionpulse-prod** → **SQL Editor** → **New query**.
2. Open `migrations/20260616210000_agent_access_seats.sql`, copy all, paste, **Run**.
3. Confirm:
   ```sql
   select column_name from information_schema.columns
   where table_name='mp_users' and column_name='agent_seats';   -- expect 1 row
   ```

## Step 2 — Create the Stripe add-on product (10 min — the fiddly part)
This is graduated (tiered) pricing so the 1st seat is $39 and extras are $29.

1. Stripe Dashboard → **Products** → **Add product**.
   - Name: `MMT Agent Access` · Description: "Connect your AI assistant."
2. Under **Pricing**, set **Recurring** → **Monthly**, then click **More pricing options** → **Pricing model = Graduated tiers**. Set:
   - **First `1` unit:** `$39.00`
   - **Then (2 and up):** `$29.00` each
   - Leave "per unit." Save. → this price is your **monthly price ID** (`price_…`).
3. On the same product, **Add another price** → **Recurring → Yearly** → **Graduated tiers**:
   - **First `1` unit:** `$390.00`
   - **Then (2+):** `$290.00` each
   - Save. → your **annual price ID**.
4. Create **Payment Links** (Stripe → Payment Links → New):
   - One for the monthly price, one for the annual price.
   - In each link's options, **turn ON "Let customers adjust quantity"** (so they choose how many agents).
   - Copy both **Payment Link URLs**.
5. You now have 4 values: monthly price ID, annual price ID, monthly link URL, annual link URL.

> No new webhook needed — your existing `stripe-webhook` endpoint already receives subscription events; the code now recognizes these price IDs.

## Step 3 — Set Netlify env vars (3 min)
Netlify → site **curious-pony-0dec76** → Site configuration → Environment variables → add:

| Key | Value |
|---|---|
| `AGENT_ACCESS_ADDON_PRICE_IDS` | `price_MONTHLY,price_ANNUAL` (both IDs, comma-separated) |
| `AGENT_ACCESS_CHECKOUT_URL_MONTHLY` | the monthly Payment Link URL |
| `AGENT_ACCESS_CHECKOUT_URL_ANNUAL` | the annual Payment Link URL |

## Step 4 — Merge the PR (1 min)
GitHub → [PR #104](https://github.com/maryadawson-code/mmt-site/pull/104) → **Squash and merge**. The deploy picks up the env vars from Step 3.

## Step 5 — Verify (3 min, after deploy)
1. Gates still hold:
   ```bash
   node scripts/verify-agent-api.js https://missionmeetstech.com   # 6/6
   ```
2. As a premium member **without** the add-on, open **/ai-integrations** → you should see **"Add AI access — $39/mo per agent"** with your checkout links.
3. Buy through the Payment Link (use Stripe **test mode** first if you like) → the webhook sets your seats → reload `/ai-integrations` → the **wizard** appears with "Using 0 of N seats" → create a test connection.

## Step 6 — Turn on AI scoring (optional, 1 min)
Only when you want `/recommended` to return fit-scores:
- Netlify env: `AGENT_SCORING_ENABLED` = `true` (your Anthropic key is already set).
- Optional cost knobs: `AGENT_SCORING_DAILY_BUDGET_USD` (default 2.0), `AGENT_SCORING_MAX_CALLS` (default 150).
- The nightly job (7:00 UTC) populates scores; nothing else to do.

---

### Done = live
After Step 5, the paid upgrade is fully live: premium members are gated to the add-on, seats cap their connections, institutional is unlimited, and a lapsed add-on cuts access automatically.

### Optional polish (no rush)
- Add an "AI Access" card to `/pricing.html` pointing at the same checkout links.
- Decide whether to promote "AI & Integrations" to the top-level nav.
