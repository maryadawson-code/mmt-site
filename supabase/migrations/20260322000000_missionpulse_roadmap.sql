-- Populate product_roadmap with MissionPulse.ai features
-- Generated from comprehensive code audit on 2026-03-21
-- Audited: 102 dashboard pages, 44 API routes, 33 feature component dirs, 17 DB tables

-- Step 1: Add 'missionpulse' to product CHECK constraint
ALTER TABLE product_roadmap DROP CONSTRAINT IF EXISTS product_roadmap_product_check;
ALTER TABLE product_roadmap ADD CONSTRAINT product_roadmap_product_check
  CHECK (product IN ('proposalpulse', 'marketpulse', 'mmt_site', 'command_center', 'agent_network', 'missionpulse'));

-- Step 2: Add missing categories for MissionPulse features
ALTER TABLE product_roadmap DROP CONSTRAINT IF EXISTS product_roadmap_category_check;
ALTER TABLE product_roadmap ADD CONSTRAINT product_roadmap_category_check
  CHECK (category IN ('core', 'security', 'ux', 'integration', 'infrastructure', 'content', 'ai', 'billing', 'admin', 'collaboration', 'analytics'));

-- Step 3: Insert MissionPulse features
-- ============================================================
-- Core Platform (12 features)
-- ============================================================
INSERT INTO product_roadmap (product, feature_name, description, category, status, health, priority, owner, notes) VALUES
  ('missionpulse', 'Main Dashboard', '10 configurable widget tiles: KPI cards, quick start, command bar, agent fleet status, task stream', 'core', 'deployed', 'healthy', 'p0_critical', 'jack', 'app/(dashboard)/dashboard/page.tsx — fully functional with widget customization'),
  ('missionpulse', 'Pipeline Management', 'Opportunity list with table/Kanban view toggle, status filtering, sorting, federal search', 'core', 'deployed', 'healthy', 'p0_critical', 'jack', 'app/(dashboard)/pipeline/page.tsx — core BD workflow'),
  ('missionpulse', 'Opportunity War Room', 'Detail view with inline-editable fields, team assignments, comments, heatmap, strategy, risks, volumes', 'core', 'deployed', 'healthy', 'p0_critical', 'jack', 'app/(dashboard)/pipeline/[id]/page.tsx + 16 sub-pages'),
  ('missionpulse', 'Proposal Writing Engine', 'Proposal outlines, section editing, split-view editor, review queue, volume management', 'core', 'deployed', 'healthy', 'p0_critical', 'jack', 'app/(dashboard)/proposals/ — 6 pages including breakdown, collaboration, timeline'),
  ('missionpulse', 'Document Management', 'Global document library with template library, version history, opportunity-level docs', 'core', 'deployed', 'healthy', 'p1_high', 'jack', 'app/(dashboard)/documents/page.tsx + pipeline/[id]/documents'),
  ('missionpulse', 'Reports Dashboard', 'Generated reports with download links, status tracking (completed/processing/failed)', 'core', 'deployed', 'healthy', 'p1_high', 'jack', 'app/(dashboard)/reports/page.tsx'),
  ('missionpulse', 'Capacity Planning', 'Resource allocation tracking with per-user capacity bars and overallocation detection', 'core', 'deployed', 'healthy', 'p1_high', 'jack', 'app/(dashboard)/capacity/page.tsx'),
  ('missionpulse', 'Personnel Management', 'Key personnel table with clearance levels, CUI/SP-PRVCY banner, MFA enforcement', 'core', 'deployed', 'healthy', 'p1_high', 'jack', 'app/(dashboard)/personnel/page.tsx — CUI protected'),
  ('missionpulse', 'Past Performance Library', 'CPARS ratings and contract history display for past performance references', 'core', 'deployed', 'healthy', 'p1_high', 'jack', 'app/(dashboard)/past-performance/page.tsx'),
  ('missionpulse', 'Partners & Teaming', 'Teaming partners with NDA/TA status tracking and agreement management', 'core', 'deployed', 'healthy', 'p2_medium', 'jack', 'app/(dashboard)/partners/page.tsx'),
  ('missionpulse', 'Win/Loss Debriefs', 'Debrief tracker with strengths, weaknesses, lessons learned, outcome styling', 'core', 'deployed', 'healthy', 'p2_medium', 'jack', 'app/(dashboard)/debriefs/page.tsx'),
  ('missionpulse', 'Federal Opportunity Search', 'Federal opportunity search with filters for SAM.gov and other sources', 'core', 'deployed', 'degraded', 'p1_high', 'jack', 'app/(dashboard)/pipeline/federal-search — skeleton UI, missing live data integration')
ON CONFLICT (product, feature_name) DO NOTHING;

-- ============================================================
-- AI Features (7 features)
-- ============================================================
INSERT INTO product_roadmap (product, feature_name, description, category, status, health, priority, owner, notes) VALUES
  ('missionpulse', 'AI Chat (AskSage)', 'Smart chat interface with session management, opportunity context, agent routing, token budget display', 'ai', 'deployed', 'healthy', 'p0_critical', 'jack', 'app/(dashboard)/ai-chat/page.tsx — CUI routes to AskSage (FedRAMP)'),
  ('missionpulse', 'AI Assistant History', 'AI usage history table with agent breakdown, session metadata, cost tracking', 'ai', 'deployed', 'healthy', 'p1_high', 'jack', 'app/(dashboard)/ai/page.tsx'),
  ('missionpulse', 'AI Pipeline Engine', 'Single-entry-point aiRequest() with model selection, CUI routing, research pre-agent', 'ai', 'deployed', 'healthy', 'p0_critical', 'jack', 'lib/ai/pipeline.ts + research-router.ts + router.ts'),
  ('missionpulse', 'Voice Fingerprint', 'Company voice profile extraction and matching for proposal consistency', 'ai', 'deployed', 'healthy', 'p2_medium', 'jack', 'lib/ai/voice-fingerprint.ts + playbook/voice-profile page'),
  ('missionpulse', 'Proactive AI Insights', 'Deadline risk assessment and section detection for proactive alerts', 'ai', 'deployed', 'healthy', 'p2_medium', 'jack', 'lib/ai/proactive/deadline-risk.ts + section-detector.ts'),
  ('missionpulse', 'AI Fine-Tuning', 'Fine-tune job management with data export and model training (executive only)', 'ai', 'deployed', 'healthy', 'p2_medium', 'jack', 'admin/fine-tune + lib/ai/fine-tune/'),
  ('missionpulse', 'AI Orchestration Engine', 'Agent catalog (8 agents) with workflow templates and coordination', 'ai', 'deployed', 'healthy', 'p1_high', 'jack', 'admin/orchestration + lib/ai/orchestrator/')
ON CONFLICT (product, feature_name) DO NOTHING;

-- ============================================================
-- Proposal Tools (7 features)
-- ============================================================
INSERT INTO product_roadmap (product, feature_name, description, category, status, health, priority, owner, notes) VALUES
  ('missionpulse', 'RFP Shredder', 'RFP document upload with text extraction, requirements parsing, compliance mapping', 'core', 'deployed', 'healthy', 'p0_critical', 'jack', 'pipeline/[id]/shredder/ + shredder/requirements — core differentiator'),
  ('missionpulse', 'Compliance Matrix', 'Compliance tracking with progress (addressed/verified/remaining) and gap detection', 'core', 'deployed', 'healthy', 'p0_critical', 'jack', 'pipeline/[id]/compliance + compliance page — Iron Dome cards'),
  ('missionpulse', 'Pricing Engine', 'Cost volume manager with labor categories, ODC table, CUI watermark, MFA enforcement', 'core', 'deployed', 'healthy', 'p0_critical', 'jack', 'pipeline/[id]/pricing + pricing page — CUI protected'),
  ('missionpulse', 'Gate Reviews', 'Gate review timeline with pWin tracking, review comments, approval workflow', 'core', 'deployed', 'healthy', 'p1_high', 'jack', 'pipeline/[id]/gate-reviews/page.tsx'),
  ('missionpulse', 'Competitive Intelligence', 'Competitor intel with threat levels, strategy analysis, CUI/OPSEC protection', 'core', 'deployed', 'healthy', 'p1_high', 'jack', 'blackhat + pipeline/[id]/intel + intel/matrix — MFA required'),
  ('missionpulse', 'Orals Preparation', 'Interview prep with question bank, scoring, and saved practice sessions', 'core', 'deployed', 'healthy', 'p1_high', 'jack', 'pipeline/[id]/orals + pipeline/[id]/interview-prep'),
  ('missionpulse', 'Post-Award Management', 'Contract tracking, amendment management, and launch readiness gates', 'core', 'deployed', 'healthy', 'p1_high', 'jack', 'pipeline/[id]/post-award + amendments + contracts + launch')
ON CONFLICT (product, feature_name) DO NOTHING;

-- ============================================================
-- Collaboration & Workflow (5 features)
-- ============================================================
INSERT INTO product_roadmap (product, feature_name, description, category, status, health, priority, owner, notes) VALUES
  ('missionpulse', 'Real-time Collaboration', 'Presence tracking, section locking, sync engine with conflict resolution', 'collaboration', 'deployed', 'healthy', 'p1_high', 'jack', 'lib/realtime/ + lib/sync/ + proposals/[id]/collaboration'),
  ('missionpulse', 'Swimlane Board', 'Dynamic swimlane visualization with lazy loading and phase tracking per opportunity', 'ux', 'deployed', 'healthy', 'p1_high', 'jack', 'pipeline/[id]/swimlane/page.tsx'),
  ('missionpulse', 'Gantt Timeline', 'Timeline visualization with KPI cards for proposal milestones', 'ux', 'deployed', 'healthy', 'p1_high', 'jack', 'proposals/[id]/timeline/page.tsx'),
  ('missionpulse', 'Approval Workflows', 'Sequential approval steps with conditional routing and role-based gates', 'collaboration', 'deployed', 'healthy', 'p1_high', 'jack', 'admin/approval-workflows/page.tsx'),
  ('missionpulse', 'Human-in-the-Loop Queue', 'Review queue for compliance, contract, and document approvals with status transitions', 'collaboration', 'deployed', 'healthy', 'p1_high', 'jack', 'app/(dashboard)/hitl/page.tsx')
ON CONFLICT (product, feature_name) DO NOTHING;

-- ============================================================
-- Security & Compliance (5 features)
-- ============================================================
INSERT INTO product_roadmap (product, feature_name, description, category, status, health, priority, owner, notes) VALUES
  ('missionpulse', 'RBAC System', 'Role-based access with invisible pattern, custom role builder, granular permissions', 'security', 'deployed', 'healthy', 'p0_critical', 'jack', 'admin/roles + lib/rbac/ + roles_permissions_config.json v9.5'),
  ('missionpulse', 'Audit Trail', 'Immutable NIST AU-9 compliant audit log with configurable retention (90d-7y)', 'security', 'deployed', 'healthy', 'p0_critical', 'jack', 'audit page + admin/audit-retention + lib/audit/'),
  ('missionpulse', 'FedRAMP Compliance', 'FedRAMP 20x compliance dashboard with NIST 800-53 control families tracking', 'security', 'deployed', 'healthy', 'p0_critical', 'jack', 'admin/fedramp + lib/compliance/fedramp/'),
  ('missionpulse', 'SSO/SAML Authentication', 'SAML 2.0 SSO configuration with IdP settings (enterprise tier)', 'security', 'deployed', 'healthy', 'p1_high', 'jack', 'admin/sso + lib/auth/saml.ts'),
  ('missionpulse', 'Rate Limiting', 'Per-IP and per-endpoint rate limiting for API protection', 'security', 'deployed', 'healthy', 'p1_high', 'jack', 'lib/security/rate-limiter.ts')
ON CONFLICT (product, feature_name) DO NOTHING;

-- ============================================================
-- Admin & Settings (8 features)
-- ============================================================
INSERT INTO product_roadmap (product, feature_name, description, category, status, health, priority, owner, notes) VALUES
  ('missionpulse', 'Admin Console', 'Admin landing with navigation grid to 28 admin sub-pages', 'admin', 'deployed', 'healthy', 'p1_high', 'jack', 'admin/page.tsx — hub for all admin functions'),
  ('missionpulse', 'User Management', 'User listing with invitations, role assignment, and access control', 'admin', 'deployed', 'healthy', 'p0_critical', 'jack', 'admin/users/page.tsx'),
  ('missionpulse', 'Workspace Management', 'Multi-workspace support for divisions/subsidiaries (enterprise tier)', 'admin', 'deployed', 'healthy', 'p2_medium', 'jack', 'admin/workspaces + lib/workspaces/manager.ts'),
  ('missionpulse', 'System Health Monitoring', 'System health dashboard with DB, auth, AI service status and latency tracking', 'admin', 'deployed', 'healthy', 'p1_high', 'jack', 'admin/system-health + admin/monitoring + admin/performance'),
  ('missionpulse', 'AI Model Management', 'AI provider config with FedRAMP enforcement, model selection, budget guard (75%)', 'admin', 'deployed', 'healthy', 'p1_high', 'jack', 'admin/ai-providers + admin/models'),
  ('missionpulse', 'Template Management', 'Branded template editor for DOCX/XLSX/PPTX generation with company branding', 'admin', 'deployed', 'healthy', 'p2_medium', 'jack', 'admin/templates/page.tsx'),
  ('missionpulse', 'Question Bank', 'Orals Q&A repository with 200+ questions grouped by category', 'admin', 'deployed', 'healthy', 'p2_medium', 'jack', 'admin/question-bank/page.tsx'),
  ('missionpulse', 'Cache Management', 'AI semantic cache metrics with per-agent statistics and TTL configuration', 'admin', 'deployed', 'healthy', 'p3_low', 'jack', 'admin/cache/page.tsx')
ON CONFLICT (product, feature_name) DO NOTHING;

-- ============================================================
-- Integrations (12 features)
-- ============================================================
INSERT INTO product_roadmap (product, feature_name, description, category, status, health, priority, owner, notes) VALUES
  ('missionpulse', 'Integration Hub', 'Central integration management with OAuth provider connections and token management', 'integration', 'deployed', 'healthy', 'p1_high', 'jack', 'integrations/page.tsx — 12 integration tiles'),
  ('missionpulse', 'SAM.gov Integration', 'Federal opportunity import and search from SAM.gov', 'integration', 'deployed', 'healthy', 'p1_high', 'jack', 'integrations/sam-gov + lib/integrations/sam-gov.ts'),
  ('missionpulse', 'GovWin IQ Integration', 'Opportunity alerts with filters, enrichment, and auto-sync', 'integration', 'deployed', 'healthy', 'p1_high', 'jack', 'integrations/govwin + lib/integrations/govwin/'),
  ('missionpulse', 'HubSpot CRM Sync', 'Bi-directional CRM sync with field mappings and sync logs', 'integration', 'deployed', 'healthy', 'p1_high', 'jack', 'integrations/hubspot + lib/integrations/hubspot/'),
  ('missionpulse', 'Salesforce CRM Sync', 'Opportunity sync with field mappings and contact sync', 'integration', 'deployed', 'healthy', 'p1_high', 'jack', 'integrations/salesforce + lib/integrations/salesforce/'),
  ('missionpulse', 'Microsoft 365 Integration', 'Teams, SharePoint, Outlook, OneDrive, Calendar integration', 'integration', 'deployed', 'healthy', 'p1_high', 'jack', 'integrations/m365 + lib/integrations/m365/'),
  ('missionpulse', 'Google Workspace Integration', 'Drive, Calendar, Gmail integration with OAuth', 'integration', 'deployed', 'healthy', 'p2_medium', 'jack', 'integrations/google + lib/integrations/google/'),
  ('missionpulse', 'DocuSign Integration', 'E-signature configuration with status tracking', 'integration', 'deployed', 'healthy', 'p2_medium', 'jack', 'integrations/docusign + lib/integrations/docusign/'),
  ('missionpulse', 'Slack Integration', 'Notifications, gate approvals, and webhook handling', 'integration', 'deployed', 'healthy', 'p2_medium', 'jack', 'integrations/slack + lib/integrations/slack/'),
  ('missionpulse', 'Bloomberg Government', 'Bloomberg Government data integration (enterprise feature)', 'integration', 'deployed', 'healthy', 'p2_medium', 'jack', 'integrations/bloomberg-gov + lib/integrations/bloomberg/'),
  ('missionpulse', 'USASpending Integration', 'Federal award data enrichment from USASpending.gov', 'integration', 'deployed', 'healthy', 'p2_medium', 'jack', 'integrations/usaspending + lib/integrations/usaspending/'),
  ('missionpulse', 'Aggregated Search', 'Cross-integration search aggregator for unified opportunity discovery', 'integration', 'deployed', 'healthy', 'p2_medium', 'jack', 'lib/integrations/aggregator/search.ts')
ON CONFLICT (product, feature_name) DO NOTHING;

-- ============================================================
-- Billing & Onboarding (4 features)
-- ============================================================
INSERT INTO product_roadmap (product, feature_name, description, category, status, health, priority, owner, notes) VALUES
  ('missionpulse', 'Billing & Subscription', 'Stripe integration with plan selection, token balance, subscription management', 'billing', 'deployed', 'healthy', 'p0_critical', 'jack', 'settings/billing + lib/billing/ + billing API routes'),
  ('missionpulse', 'Pilot Program', 'Time-limited trial with ROI tracking, conversion pricing, expiration handling', 'billing', 'deployed', 'healthy', 'p1_high', 'jack', 'admin/pilots + pilot-expired + pilot-review pages'),
  ('missionpulse', 'Onboarding Wizard', 'Step-by-step onboarding with progress tracking and completion gates', 'ux', 'deployed', 'healthy', 'p1_high', 'jack', 'app/(dashboard)/onboarding/page.tsx + lib/onboarding/'),
  ('missionpulse', 'Customer Success Dashboard', 'Enterprise health indicators and customer engagement metrics', 'admin', 'deployed', 'healthy', 'p2_medium', 'jack', 'admin/csm/page.tsx + lib/csm/health.ts')
ON CONFLICT (product, feature_name) DO NOTHING;

-- ============================================================
-- Analytics & Monitoring (4 features)
-- ============================================================
INSERT INTO product_roadmap (product, feature_name, description, category, status, health, priority, owner, notes) VALUES
  ('missionpulse', 'Analytics Dashboard', 'KPIs, phase breakdown, win rate trends, team workload visualization', 'analytics', 'deployed', 'healthy', 'p1_high', 'jack', 'analytics/page.tsx + analytics/ai-usage'),
  ('missionpulse', 'AI Usage Analytics', 'Token usage, cost tracking, cache metrics, agent satisfaction scores', 'analytics', 'deployed', 'healthy', 'p1_high', 'jack', 'admin/ai-usage + admin/analytics + analytics/ai-usage'),
  ('missionpulse', 'Performance Benchmarks', 'Endpoint latency tracking with p50/p95/p99 bands vs product spec targets', 'analytics', 'deployed', 'healthy', 'p2_medium', 'jack', 'admin/benchmarks + admin/performance + lib/monitoring/'),
  ('missionpulse', 'Feedback & Feature Voting', 'Feature suggestions with upvoting system and admin moderation queue', 'ux', 'deployed', 'healthy', 'p2_medium', 'jack', 'app/(dashboard)/feedback/page.tsx')
ON CONFLICT (product, feature_name) DO NOTHING;

-- ============================================================
-- Document Generation (3 features)
-- ============================================================
INSERT INTO product_roadmap (product, feature_name, description, category, status, health, priority, owner, notes) VALUES
  ('missionpulse', 'DOCX Generation', 'Word document generation with branded templates', 'core', 'deployed', 'healthy', 'p1_high', 'jack', 'app/api/docgen/docx + lib/docgen/'),
  ('missionpulse', 'PPTX Generation', 'PowerPoint generation for briefings and presentations', 'core', 'deployed', 'healthy', 'p1_high', 'jack', 'app/api/docgen/pptx'),
  ('missionpulse', 'Binder Assembly', 'Multi-document binder assembly with cloud storage support', 'core', 'deployed', 'healthy', 'p1_high', 'jack', 'app/api/docgen/binder + lib/docgen/binder.ts + lib/utils/cloud-binder-assembly.ts')
ON CONFLICT (product, feature_name) DO NOTHING;

-- ============================================================
-- Infrastructure (5 features)
-- ============================================================
INSERT INTO product_roadmap (product, feature_name, description, category, status, health, priority, owner, notes) VALUES
  ('missionpulse', 'Auth System (Magic Link)', 'Supabase auth with magic link, middleware protection, session management', 'security', 'deployed', 'healthy', 'p0_critical', 'jack', 'app/api/auth/callback + middleware.ts'),
  ('missionpulse', 'Health Check API', 'Basic and detailed health endpoints for monitoring', 'infrastructure', 'deployed', 'healthy', 'p1_high', 'jack', 'app/api/health/ + app/api/health/detailed/'),
  ('missionpulse', 'Notification System', 'In-app notifications with email/push channel preferences', 'ux', 'deployed', 'healthy', 'p1_high', 'jack', 'notifications page + settings/notifications + lib/utils/notifications.ts'),
  ('missionpulse', 'Playbook & Golden Content', 'Playbook browser with golden content library and voice profile integration', 'core', 'deployed', 'healthy', 'p1_high', 'jack', 'playbook/page.tsx + playbook/voice-profile'),
  ('missionpulse', 'Help Center', 'Help documentation with 6 collapsible sections for user guidance', 'ux', 'deployed', 'healthy', 'p3_low', 'jack', 'app/(dashboard)/help/page.tsx')
ON CONFLICT (product, feature_name) DO NOTHING;
