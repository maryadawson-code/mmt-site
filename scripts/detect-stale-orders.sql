-- detect-stale-orders.sql
-- Finds orders stuck in non-terminal states for >30 minutes
-- Run periodically or ad-hoc to identify stuck processing

-- ProposalPulse stuck orders
SELECT
  id,
  email,
  workflow_state,
  state_updated_at,
  retry_count,
  NOW() - state_updated_at AS stuck_duration
FROM mp_scoring_history
WHERE workflow_state NOT IN ('delivered', 'failed_terminal')
  AND state_updated_at < NOW() - INTERVAL '30 minutes'
ORDER BY state_updated_at ASC;

-- MarketPulse stuck orders
SELECT
  id,
  email,
  workflow_state,
  state_updated_at,
  retry_count,
  NOW() - state_updated_at AS stuck_duration
FROM marketpulse_orders
WHERE workflow_state NOT IN ('delivered', 'failed_terminal')
  AND state_updated_at < NOW() - INTERVAL '30 minutes'
ORDER BY state_updated_at ASC;
