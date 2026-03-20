# Penny Pincher Build — Learnings
Date: 2026-03-20

## Build Cost
- Token usage during this build: ~150K input + ~40K output tokens on Opus 4.6
- Estimated build cost: ~$5.25 (ironic for a cost optimization agent)
- Recommendation: future agent builds should use Sonnet for the implementation phase, Opus only for architecture decisions

## Biggest Spenders (Projected)
1. **ops-editorial** (~50% of spend): Uses Opus for content, which is correct. But heartbeats on Opus are pure waste.
2. **ops-code** (~35% of spend): Sonnet for code is appropriate. Heartbeats should be Haiku.
3. **Idle agents (ops-social, ops-newsletter)**: ~$51/month combined for zero output. Consolidate or shut down.
4. **Heartbeat overhead**: 288 cycles/day × ~$0.04 avg = ~$11.50/day just for "nothing to report"

## Is Haiku Sufficient for Penny Pincher?
Yes. All Penny Pincher operations are:
- Arithmetic (cost calculations, routing compliance checks)
- Pattern matching (comparing model used vs required)
- Aggregation (daily summaries, waste ratios)
- Template generation (findings descriptions)

None of these require creative reasoning or editorial voice. Haiku handles all of it at <$0.02/cycle.

## Recommended Cost Targets by Agent Tier
| Tier | Model | Target/Cycle | Target/Day | Agents |
|------|-------|-------------|-----------|--------|
| Voice | Opus 4 | $0.50 | $5.00 | editorial (content only) |
| Worker | Sonnet 4 | $0.10 | $2.00 | code, research |
| Monitor | Haiku 3.5 | $0.01 | $0.50 | monitor, ciso, penny |
| Idle | Haiku 3.5 | $0.005 | $0.25 | social, newsletter (if kept) |

## Instrumentation Gaps
1. **No per-call token tracking yet**: Agents need to call `penny_record` after every interaction. This requires updating each agent's workspace to include the logging hook.
2. **No response payload size tracking**: We need to instrument the agent-bridge to measure response sizes in bytes/tokens.
3. **No Perplexity call deduplication**: Research cache doesn't exist yet — only flagged as a finding.
4. **No heartbeat result classification**: We can't yet distinguish "productive" from "idle" heartbeats automatically. Need to parse task results for HEARTBEAT_OK patterns.
5. **No real-time cost feed**: Token counts come from agent self-reporting, not from API response headers. If an agent doesn't call penny_record, we're blind.

## Current vs Projected Monthly Cost
| Scenario | Monthly Cost |
|----------|-------------|
| Current (all Opus, 30-min heartbeats, idle agents) | ~$340/month |
| After routing rules enforced | ~$120/month |
| After idle agent consolidation | ~$85/month |
| After adaptive heartbeats | ~$65/month |
| **Target** | **<$75/month** |

## Architecture Notes
- agent_registry table does NOT have a `role` column — don't assume it from the dashboard query
- Supabase migrations must use timestamp prefix format, not sequential numbering
- The command-center-api is the gateway for dashboard data; agent-bridge is for agent-to-agent communication
- Both APIs now have penny_ actions, but the dashboard uses command-center-api
