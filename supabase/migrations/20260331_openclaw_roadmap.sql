-- Add OpenClaw as a tracked product in the roadmap
ALTER TABLE product_roadmap DROP CONSTRAINT IF EXISTS product_roadmap_product_check;
ALTER TABLE product_roadmap ADD CONSTRAINT product_roadmap_product_check
  CHECK (product IN ('proposalpulse', 'marketpulse', 'mmt_site', 'command_center', 'agent_network', 'openclaw'));

-- Seed OpenClaw features
INSERT INTO product_roadmap (product, feature_name, description, category, status, health, priority, owner, deploy_date, health_endpoint) VALUES
  ('openclaw', 'FinOps MCP Server', 'Verified cloud cost forecasting for AWS, GCP, Azure via MCP tool', 'core', 'deployed', 'healthy', 'p0_critical', 'mary', '2026-03-28', 'https://openclaw-finops.marywomack.workers.dev/health'),
  ('openclaw', 'API-Bridge MCP Server', 'Live OpenAPI/Swagger spec parsing — stops API hallucination', 'core', 'deployed', 'healthy', 'p0_critical', 'mary', '2026-03-28', 'https://openclaw-api-bridge.marywomack.workers.dev/'),
  ('openclaw', 'Guardrail MCP Server', 'Terraform/CloudFormation security scanner + ghost cost detection', 'core', 'deployed', 'healthy', 'p0_critical', 'mary', '2026-03-28', 'https://openclaw-guardrail.marywomack.workers.dev/'),
  ('openclaw', 'Fortress MCP Server', 'Zero-trust live state verification, accessibility, visual contract, rollback', 'core', 'deployed', 'healthy', 'p0_critical', 'mary', '2026-03-28', 'https://openclaw-fortress.marywomack.workers.dev/'),
  ('openclaw', 'Revenue Gate Pattern', 'isError:true paywall — upgrade CTA inside agent conversation', 'core', 'deployed', 'healthy', 'p0_critical', 'mary', '2026-03-28', NULL),
  ('openclaw', 'Three-Tier Stripe Billing', 'PRO $29, TEAM $99, ENTERPRISE $499 with live Stripe price IDs', 'infrastructure', 'deployed', 'healthy', 'p1_high', 'mary', '2026-03-29', NULL),
  ('openclaw', 'Landing Page + /try Demo', 'Public landing page with A/B tested headlines and zero-friction demo', 'ux', 'deployed', 'healthy', 'p1_high', 'mary', '2026-03-31', 'https://openclaw-finops.marywomack.workers.dev/'),
  ('openclaw', 'Self-Learning Growth Engine', 'A/B testing, event tracking, hourly auto-optimization via Cloudflare Cron', 'infrastructure', 'deployed', 'healthy', 'p1_high', 'mary', '2026-03-31', 'https://openclaw-finops.marywomack.workers.dev/g/config'),
  ('openclaw', 'Registry Submissions', 'Published to Smithery, Official MCP Registry, MCP.so, PulseMCP (auto), Glama (auto)', 'integration', 'deployed', 'healthy', 'p1_high', 'mary', '2026-03-31', NULL),
  ('openclaw', 'Anthropic Skills PR', 'PR #823 to anthropics/skills repo for Claude Code discovery', 'integration', 'in_progress', 'untested', 'p2_medium', 'mary', NULL, NULL),
  ('openclaw', 'SEO Infrastructure', 'robots.txt, sitemap.xml, JSON-LD, OG tags, IndexNow, Cloudflare Workers', 'infrastructure', 'deployed', 'healthy', 'p2_medium', 'mary', '2026-03-31', 'https://openclaw-finops.marywomack.workers.dev/sitemap.xml')
ON CONFLICT (product, feature_name) DO NOTHING;
