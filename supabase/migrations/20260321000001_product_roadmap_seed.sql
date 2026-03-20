-- Phase 10: Product Roadmap seed data — 55 features across 5 products
-- Uses ON CONFLICT (product, feature_name) DO NOTHING

-- ============================================================
-- ProposalPulse (16 features)
-- ============================================================
INSERT INTO product_roadmap (product, feature_name, description, category, status, health, priority, owner, deploy_date, notes) VALUES
  ('proposalpulse', 'PDF upload', 'Document upload supporting PDF, DOCX, PPTX up to 4MB via pdf-parse + mammoth', 'core', 'deployed', 'healthy', 'p1_high', 'mary', '2026-03-15', 'pdf-parse + mammoth, 4MB max'),
  ('proposalpulse', 'Red Team Review', 'Adversarial critique of proposal scoring with independent review', 'core', 'deployed', 'healthy', 'p1_high', 'mary', '2026-03-18', 'Gold Team two-phase flow'),
  ('proposalpulse', 'pWin calculation', 'Win probability estimation using weighted scoring factors and ranges', 'core', 'deployed', 'healthy', 'p1_high', 'mary', '2026-03-17', 'Weighted factor, ranges'),
  ('proposalpulse', 'Compliance matrix', 'SOW hybrid scoring with auto-detect evaluation factors', 'core', 'deployed', 'healthy', 'p2_medium', 'mary', '2026-03-18', 'Auto-detect eval factors from SOW'),
  ('proposalpulse', 'Compliance disclaimer', 'Legal disclaimer appended to all scoring outputs', 'security', 'deployed', 'healthy', 'p1_high', 'mary', '2026-03-16', 'Legal disclaimer on all outputs'),
  ('proposalpulse', 'Tiered next steps', 'Grade-dependent action recommendations for proposal improvement', 'ux', 'deployed', 'healthy', 'p2_medium', 'mary', '2026-03-17', 'Grade-dependent actions'),
  ('proposalpulse', 'Entity preservation', 'Entity disambiguation to preserve org names and acronyms during scoring', 'core', 'deployed', 'healthy', 'p2_medium', 'mary', '2026-03-19', 'Added 3/19, needs validation'),
  ('proposalpulse', 'Email delivery', 'Score receipt and Gold Team Review delivery via Resend transactional email', 'integration', 'deployed', 'healthy', 'p1_high', 'mary', '2026-03-16', 'Resend API, branded templates'),
  ('proposalpulse', 'Starter tier', 'Free tier with 3 assessments per email address', 'ux', 'deployed', 'healthy', 'p1_high', 'mary', '2026-03-15', '3 free via mp_users'),
  ('proposalpulse', 'Professional tier', 'Paid tier at $19.99 per assessment via Stripe Checkout', 'ux', 'deployed', 'healthy', 'p1_high', 'mary', '2026-03-16', '$19.99/assessment via Stripe'),
  ('proposalpulse', 'Admin bypass', 'Admin emails bypass usage limits and payment gates', 'security', 'deployed', 'healthy', 'p2_medium', 'mary', '2026-03-15', 'Admin email list in score-deck.js'),
  ('proposalpulse', 'Usage tracking', 'Per-email usage counting via mp_feature_usage table', 'infrastructure', 'deployed', 'healthy', 'p2_medium', 'mary', '2026-03-15', 'mp_feature_usage table'),
  ('proposalpulse', 'Input sanitization', 'HTML/script injection prevention on all user inputs', 'security', 'deployed', 'healthy', 'p1_high', 'mary', '2026-03-17', 'sanitize.js lib'),
  ('proposalpulse', 'Rate limiting', 'Per-IP and per-email rate limiting on scoring endpoints', 'security', 'deployed', 'healthy', 'p1_high', 'mary', '2026-03-17', 'rate-limiter.js lib'),
  ('proposalpulse', 'Structured logging', 'Structured JSON logging with correlation IDs across functions', 'infrastructure', 'deployed', 'healthy', 'p2_medium', 'mary', '2026-03-16', 'logger.js with createLogger()'),
  ('proposalpulse', 'Error boundary UI', 'Graceful frontend error handling with user-friendly messages', 'ux', 'deployed', 'healthy', 'p2_medium', 'mary', '2026-03-18', 'Error boundary on scoring flow')
ON CONFLICT (product, feature_name) DO NOTHING;

-- ============================================================
-- MarketPulse (7 features)
-- ============================================================
INSERT INTO product_roadmap (product, feature_name, description, category, status, health, priority, owner, deploy_date, notes) VALUES
  ('marketpulse', 'Intake form', 'Topic intake with company context fields including certs, NAICS, vehicles', 'core', 'deployed', 'healthy', 'p1_high', 'mary', '2026-03-15', 'Company context fields'),
  ('marketpulse', 'Background research', 'Multi-source research via Perplexity API with 12-call cap per brief', 'core', 'deployed', 'healthy', 'p1_high', 'mary', '2026-03-16', 'Perplexity API, 12-call cap'),
  ('marketpulse', 'PDF report', 'Branded PDF generation with quality gate (score >= 8 required)', 'core', 'deployed', 'healthy', 'p1_high', 'mary', '2026-03-17', 'Quality gate blocks if score < 8'),
  ('marketpulse', 'Email delivery', 'Report delivery via Resend with error notification email', 'integration', 'deployed', 'healthy', 'p1_high', 'mary', '2026-03-17', 'Error email added 3/19'),
  ('marketpulse', 'Admin tier', 'Admin emails bypass payment and usage limits', 'security', 'deployed', 'healthy', 'p2_medium', 'mary', '2026-03-15', 'Admin bypass list'),
  ('marketpulse', 'Free tier', '1 free brief per email address', 'ux', 'deployed', 'healthy', 'p1_high', 'mary', '2026-03-15', '1 free brief'),
  ('marketpulse', 'Paid tier', '$50 per intelligence brief via Stripe Checkout', 'ux', 'deployed', 'healthy', 'p1_high', 'mary', '2026-03-16', '$50/brief via Stripe')
ON CONFLICT (product, feature_name) DO NOTHING;

-- ============================================================
-- MMT Site (10 features)
-- ============================================================
INSERT INTO product_roadmap (product, feature_name, description, category, status, health, priority, owner, deploy_date, notes) VALUES
  ('mmt_site', 'Newsletter archive', '76+ article archive with topic tags, series grouping, search', 'content', 'deployed', 'healthy', 'p1_high', 'mary', '2026-03-10', '76 articles, topic tags, build-time rendered'),
  ('mmt_site', 'Glossary', '58-term federal health IT glossary with A-Z navigation', 'content', 'deployed', 'healthy', 'p2_medium', 'mary', '2026-03-08', '58 terms, A-Z nav'),
  ('mmt_site', 'Contract tracker', 'Curated federal health IT procurement intelligence with daily AI refresh', 'content', 'deployed', 'healthy', 'p1_high', 'mary', '2026-03-15', '10 contracts, daily 6AM refresh'),
  ('mmt_site', 'Resources', 'Federal health IT resource guide with 79 curated links', 'content', 'deployed', 'healthy', 'p2_medium', 'mary', '2026-03-08', '79 curated links'),
  ('mmt_site', 'Contact', 'Contact form on about page via Netlify Forms', 'ux', 'deployed', 'healthy', 'p3_low', 'mary', '2026-03-19', 'Netlify Forms on about.html'),
  ('mmt_site', 'SEO', 'Sitemap, OG images, JSON-LD structured data, canonical URLs', 'infrastructure', 'deployed', 'healthy', 'p2_medium', 'mary', '2026-03-15', 'Sitemap, OG, JSON-LD, BreadcrumbList'),
  ('mmt_site', 'Favicon', '64x64 PNG favicon with proper meta tags', 'ux', 'deployed', 'healthy', 'p3_low', 'mary', '2026-03-01', 'favicon.png'),
  ('mmt_site', 'Mobile responsive', 'Mobile-first responsive design across all pages', 'ux', 'deployed', 'healthy', 'p2_medium', 'mary', '2026-03-10', 'Tailwind responsive utilities'),
  ('mmt_site', 'WebP images', 'Optimized image pipeline with sharp for OG images', 'infrastructure', 'deployed', 'healthy', 'p3_low', 'mary', '2026-03-10', 'sharp 1200x630 OG images'),
  ('mmt_site', 'Health endpoint', 'Site health monitoring endpoint with 30+ point audit', 'infrastructure', 'deployed', 'healthy', 'p1_high', 'mary', '2026-03-15', 'health-check.js, 6h interval')
ON CONFLICT (product, feature_name) DO NOTHING;

-- ============================================================
-- Command Center (8 features)
-- ============================================================
INSERT INTO product_roadmap (product, feature_name, description, category, status, health, priority, owner, deploy_date, notes) VALUES
  ('command_center', 'Agent registry', 'Agent fleet management with heartbeats, status, task assignment', 'core', 'deployed', 'healthy', 'p1_high', 'mary', '2026-03-16', 'agent_registry + agent_heartbeats tables'),
  ('command_center', 'Task queue', 'Task dispatch, tracking, completion with priority and status workflow', 'core', 'deployed', 'healthy', 'p1_high', 'mary', '2026-03-16', 'task_queue table, 6 statuses'),
  ('command_center', 'Signal inbox', 'Intel signals triage with newsletter routing and dismissal', 'core', 'deployed', 'healthy', 'p2_medium', 'mary', '2026-03-17', 'intel_signals table'),
  ('command_center', 'Newsletter pipeline', 'Editorial pipeline management with publish dates and lead scoring', 'core', 'deployed', 'healthy', 'p1_high', 'mary', '2026-03-17', 'newsletter_pipeline table'),
  ('command_center', 'Order dashboard', 'ProposalPulse and MarketPulse order monitoring and status tracking', 'core', 'deployed', 'healthy', 'p1_high', 'mary', '2026-03-18', 'Orders tile with stale detection'),
  ('command_center', 'Product health tiles', '20+ dashboard tiles with live metrics, badges, and drill-down views', 'ux', 'deployed', 'healthy', 'p1_high', 'mary', '2026-03-19', '20+ tiles, auto-refresh'),
  ('command_center', 'Penny Pincher', 'Cost sentinel agent with token tracking, model routing, waste detection', 'infrastructure', 'deployed', 'healthy', 'p1_high', 'mary', '2026-03-20', '5 tables, cost control tile'),
  ('command_center', 'Ops console', 'Operator console with approval queue, chat, deployment management', 'core', 'deployed', 'healthy', 'p1_high', 'mary', '2026-03-19', 'COO + Editor approval flows')
ON CONFLICT (product, feature_name) DO NOTHING;

-- ============================================================
-- Agent Network (14 features)
-- ============================================================
INSERT INTO product_roadmap (product, feature_name, description, category, status, health, priority, owner, deploy_date, notes) VALUES
  ('agent_network', 'ops-editorial', 'Editorial agent for newsletter research, drafting, and pipeline management', 'core', 'deployed', 'healthy', 'p1_high', 'mary', '2026-03-17', 'OpenClaw, signal-to-newsletter'),
  ('agent_network', 'ops-code', 'Code agent for issue diagnosis, fix proposals, and deployment verification', 'core', 'deployed', 'healthy', 'p1_high', 'jack', '2026-03-18', 'OpenClaw, issue lifecycle'),
  ('agent_network', 'ops-research', 'Research agent for competitive intelligence and market analysis', 'core', 'deployed', 'healthy', 'p2_medium', 'mary', '2026-03-17', 'OpenClaw, competitive scan'),
  ('agent_network', 'ops-monitor', 'Monitoring agent for health checks, ops events, and incident detection', 'core', 'deployed', 'healthy', 'p1_high', 'jack', '2026-03-16', 'ops-health-check.js, 30m interval'),
  ('agent_network', 'ops-social', 'Social media agent for LinkedIn post drafting and engagement tracking', 'core', 'deployed', 'healthy', 'p2_medium', 'mary', '2026-03-18', 'OpenClaw, LinkedIn focus'),
  ('agent_network', 'ops-newsletter', 'Newsletter production agent for issue compilation and scheduling', 'core', 'deployed', 'healthy', 'p1_high', 'mary', '2026-03-17', 'Pipeline management'),
  ('agent_network', 'ops-ciso', 'Security agent for CMMC compliance, vulnerability scanning, and posture management', 'security', 'deployed', 'healthy', 'p1_high', 'jack', '2026-03-19', 'CMMC L2 scoring, 5 scan types'),
  ('agent_network', 'ops-penny', 'Cost optimization agent for token tracking, model routing, and waste detection', 'infrastructure', 'deployed', 'healthy', 'p1_high', 'mary', '2026-03-20', 'Penny Pincher cost sentinel'),
  ('agent_network', 'Heartbeat system', 'Agent heartbeat monitoring with stale detection and auto-alerting', 'infrastructure', 'deployed', 'healthy', 'p1_high', 'jack', '2026-03-16', 'agent_heartbeats table, 30m stale threshold'),
  ('agent_network', 'Bridge tools', 'Agent-to-command-center bridge API with 20+ actions', 'integration', 'deployed', 'healthy', 'p1_high', 'jack', '2026-03-18', 'agent-bridge.js, Bearer auth'),
  ('agent_network', 'Telegram routing', 'Telegram bot integration for agent notifications and commands', 'integration', 'planned', 'untested', 'p2_medium', 'unassigned', NULL, 'Not yet implemented'),
  ('agent_network', 'Adaptive heartbeats', 'Dynamic heartbeat intervals based on agent activity and priority', 'infrastructure', 'deployed', 'healthy', 'p2_medium', 'jack', '2026-03-19', 'Busy agents heartbeat more frequently'),
  ('agent_network', 'Cross-agent learning', 'Shared learning system where agents build and apply collective rules', 'core', 'deployed', 'healthy', 'p2_medium', 'mary', '2026-03-20', 'agent_learnings + learning_feedback tables'),
  ('agent_network', 'NanoClaw migration', 'Migration from OpenClaw to NanoClaw for improved agent orchestration', 'infrastructure', 'planned', 'untested', 'p1_high', 'jack', NULL, 'Migration gate pending')
ON CONFLICT (product, feature_name) DO NOTHING;
