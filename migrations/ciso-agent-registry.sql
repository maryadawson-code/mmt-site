-- Register ops-ciso agent in the agent_registry table
INSERT INTO agent_registry (id, name, domain, platform, description, color, icon, sort_order)
VALUES (
  'ops-ciso',
  'CISO',
  'operations',
  'claude_code',
  'CMMC L2 compliance tracking, automated security scans, vulnerability management, incident response',
  '#ef4444',
  '🛡️',
  53
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  domain = EXCLUDED.domain,
  icon = EXCLUDED.icon,
  color = EXCLUDED.color;
