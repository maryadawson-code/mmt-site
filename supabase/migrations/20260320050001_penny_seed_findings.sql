-- Penny Pincher Initial Audit — Seed Findings
-- Run after migration 016 to populate initial efficiency findings
-- Based on known cost problems from agent fleet analysis

-- Finding 1: Agent-bridge payload bloat (HIGH)
INSERT INTO penny_findings (finding_type, severity, title, description, affected_agent, estimated_daily_waste_usd, estimated_monthly_waste_usd, recommendation, auto_fixable) VALUES
('payload_bloat', 'high',
 'Agent-bridge list responses return full report HTML',
 'GET /agent-bridge returns report_html, redteam_report_html, scores._document_text in list views. A single list call can be 200K+ tokens. This inflates every heartbeat cycle that reads dashboard state.',
 NULL, 3.20, 96.00,
 'Strip HTML fields (report_html, redteam_report_html, _document_text) from list responses. Only include them in detail (single-record) views.',
 TRUE);

-- Finding 2: All agents routing to Opus for heartbeats (HIGH)
INSERT INTO penny_findings (finding_type, severity, title, description, affected_agent, estimated_daily_waste_usd, estimated_monthly_waste_usd, recommendation, auto_fixable) VALUES
('model_overuse', 'high',
 'Heartbeat cycles running on Opus instead of Haiku',
 '6 agents × 48 heartbeat cycles/day. If all use Opus (~$0.04/cycle) instead of Haiku (~$0.001/cycle), the daily waste is ~$11.23. Heartbeats are checklists: check tasks, check signals, report status. They do not need creative reasoning.',
 NULL, 11.23, 336.90,
 'Enforce penny_routing_rules: all heartbeat tasks must use claude-haiku-3.5. Only content generation and complex analysis should use higher-tier models.',
 FALSE);

-- Finding 3: ops-social idle 100% (MEDIUM)
INSERT INTO penny_findings (finding_type, severity, title, description, affected_agent, estimated_daily_waste_usd, estimated_monthly_waste_usd, recommendation, auto_fixable) VALUES
('idle_agent', 'medium',
 'ops-social has zero productive output — 100% idle heartbeats',
 'ops-social has been heartbeating every 30 minutes but has produced zero social posts. Every heartbeat cycle is wasted compute. At 48 cycles/day, this is pure waste.',
 'ops-social', 0.85, 25.50,
 'Consolidate ops-social into ops-editorial (editorial already handles content). Alternatively, set heartbeat interval to 120 min until social content pipeline is active.',
 FALSE);

-- Finding 4: ops-newsletter idle 100% (MEDIUM)
INSERT INTO penny_findings (finding_type, severity, title, description, affected_agent, estimated_daily_waste_usd, estimated_monthly_waste_usd, recommendation, auto_fixable) VALUES
('idle_agent', 'medium',
 'ops-newsletter has zero productive output — 100% idle heartbeats',
 'ops-newsletter is heartbeating every 30 minutes but has not produced any newsletter content. The editorial agent already handles newsletter pipeline. This agent is redundant.',
 'ops-newsletter', 0.85, 25.50,
 'Consolidate ops-newsletter into ops-editorial or shut down entirely. Newsletter pipeline is managed by editorial.',
 FALSE);

-- Finding 5: Duplicate research across agents (MEDIUM)
INSERT INTO penny_findings (finding_type, severity, title, description, affected_agent, estimated_daily_waste_usd, estimated_monthly_waste_usd, recommendation, auto_fixable) VALUES
('duplicate_work', 'medium',
 'Multiple agents performing overlapping research queries',
 'ops-editorial and ops-research sometimes search for the same news topics within the same 24-hour window. Each Perplexity sonar-pro call costs ~$0.05-0.15. Without a shared research cache, the same query runs multiple times.',
 NULL, 0.45, 13.50,
 'Implement a research cache in Supabase. Before making a Perplexity call, check if the same query (fuzzy match) was run in the last 24 hours. Serve from cache if so.',
 TRUE);

-- Finding 6: Excessive heartbeat frequency (LOW)
INSERT INTO penny_findings (finding_type, severity, title, description, affected_agent, estimated_daily_waste_usd, estimated_monthly_waste_usd, recommendation, auto_fixable) VALUES
('heartbeat_waste', 'low',
 '6 agents at 30-min heartbeats = 288 cycles/day, most returning nothing',
 'Most heartbeat cycles return "HEARTBEAT_OK" with no work performed. The productive ratio is likely <20%. Longer intervals for low-activity agents would save significant compute without missing any real work.',
 NULL, 1.50, 45.00,
 'Adaptive heartbeats: start at 30 min, double interval after 4 consecutive idle cycles (max 120 min). Reset to 30 min when work is found.',
 TRUE);
