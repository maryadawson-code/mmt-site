# Rollback Controls

All feature flags are controlled via Netlify environment variables. Changes take effect on the next function invocation (no deploy needed for env var changes).

## Feature Flags

### FEATURE_PDF_RENDERER
**Default:** `html` (report-html-renderer.js)
**Rollback to:** `pdfkit` (proposalpulse-pdf.js)
```bash
netlify env:set FEATURE_PDF_RENDERER pdfkit
```
**When to rollback:** HTML reports rendering incorrectly, email clients not displaying properly.

### FEATURE_PWIN_MODEL
**Default:** `weighted` (pwin-calculator.js server-side weighted model)
**Rollback to:** `additive` (Claude's raw pWin estimate)
```bash
netlify env:set FEATURE_PWIN_MODEL additive
```
**When to rollback:** Weighted model producing unrealistic pWin estimates, calculator bug.

### FEATURE_ENTITY_GUARD
**Default:** `on` (extractCompanyContext runs in MarketPulse)
**Rollback to:** `off` (skip entity disambiguation guards)
```bash
netlify env:set FEATURE_ENTITY_GUARD off
```
**When to rollback:** Entity guard incorrectly filtering company context, blocking valid research topics.

### FEATURE_COMPLIANCE_MAPPING
**Default:** `on`
**Rollback to:** `off`
```bash
netlify env:set FEATURE_COMPLIANCE_MAPPING off
```
**When to rollback:** Compliance mapping generating incorrect mappings or causing scoring delays.

### FEATURE_CIRCUIT_BREAKERS
**Default:** `on`
**Rollback to:** `off` (bypass all circuit breakers, call services directly)
```bash
netlify env:set FEATURE_CIRCUIT_BREAKERS off
```
**When to rollback:** Circuit breakers incorrectly tripping, blocking valid API calls. Note: this disables protection against cascading failures.

## Operations Mode (Kill Switch)

### AI_OPERATIONS_MODE
**Default:** `normal`
**Options:** `normal` | `degraded` | `readonly` | `emergency`

```bash
# Hold all emails for review (AI still runs)
netlify env:set AI_OPERATIONS_MODE degraded

# Block new AI jobs (in-flight complete)
netlify env:set AI_OPERATIONS_MODE readonly

# Block everything
netlify env:set AI_OPERATIONS_MODE emergency

# Resume normal operations
netlify env:set AI_OPERATIONS_MODE normal
```

## Code Rollback

```bash
# Revert last commit
git revert HEAD && git push origin main

# Revert to specific commit
git revert <commit-hash> && git push origin main
```

## Data Rollback

Supabase point-in-time recovery is available with a 24-hour window.
Contact Supabase support for recovery beyond env-var rollbacks.

## Rollback Checklist

1. Identify the failing component
2. Set the appropriate env var (takes effect immediately)
3. Verify the fix via command center or health endpoint
4. Log the rollback in ops_ledger (it will auto-log via feature flag state change)
5. Create a GitHub issue for the root cause
6. Plan the fix before re-enabling the feature
