#!/usr/bin/env node

/**
 * Seed MissionPulse.ai features into product_roadmap table.
 * Run with: SUPABASE_URL=xxx SUPABASE_SERVICE_KEY=xxx node scripts/seed-mp-roadmap.js
 * Uses the same Supabase instance as both mmt-site and MissionPulse.
 */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing required env vars: SUPABASE_URL, SUPABASE_SERVICE_KEY');
  process.exit(1);
}

const features = [
  // Core Platform (12)
  { feature_name: 'Main Dashboard', description: '10 configurable widget tiles: KPI cards, quick start, command bar, agent fleet status, task stream', category: 'core', status: 'deployed', health: 'healthy', priority: 'p0_critical', notes: 'app/(dashboard)/dashboard/page.tsx' },
  { feature_name: 'Pipeline Management', description: 'Opportunity list with table/Kanban view toggle, status filtering, sorting, federal search', category: 'core', status: 'deployed', health: 'healthy', priority: 'p0_critical', notes: 'app/(dashboard)/pipeline/page.tsx' },
  { feature_name: 'Opportunity War Room', description: 'Detail view with inline-editable fields, team assignments, comments, heatmap, strategy, risks, volumes', category: 'core', status: 'deployed', health: 'healthy', priority: 'p0_critical', notes: 'app/(dashboard)/pipeline/[id]/page.tsx + 16 sub-pages' },
  { feature_name: 'Proposal Writing Engine', description: 'Proposal outlines, section editing, split-view editor, review queue, volume management', category: 'core', status: 'deployed', health: 'healthy', priority: 'p0_critical', notes: 'app/(dashboard)/proposals/ — 6 pages' },
  { feature_name: 'Document Management', description: 'Global document library with template library, version history, opportunity-level docs', category: 'core', status: 'deployed', health: 'healthy', priority: 'p1_high', notes: 'app/(dashboard)/documents/page.tsx' },
  { feature_name: 'Reports Dashboard', description: 'Generated reports with download links, status tracking (completed/processing/failed)', category: 'core', status: 'deployed', health: 'healthy', priority: 'p1_high', notes: 'app/(dashboard)/reports/page.tsx' },
  { feature_name: 'Capacity Planning', description: 'Resource allocation tracking with per-user capacity bars and overallocation detection', category: 'core', status: 'deployed', health: 'healthy', priority: 'p1_high', notes: 'app/(dashboard)/capacity/page.tsx' },
  { feature_name: 'Personnel Management', description: 'Key personnel table with clearance levels, CUI/SP-PRVCY banner, MFA enforcement', category: 'core', status: 'deployed', health: 'healthy', priority: 'p1_high', notes: 'CUI protected' },
  { feature_name: 'Past Performance Library', description: 'CPARS ratings and contract history display for past performance references', category: 'core', status: 'deployed', health: 'healthy', priority: 'p1_high', notes: 'app/(dashboard)/past-performance/page.tsx' },
  { feature_name: 'Partners & Teaming', description: 'Teaming partners with NDA/TA status tracking and agreement management', category: 'core', status: 'deployed', health: 'healthy', priority: 'p2_medium', notes: 'app/(dashboard)/partners/page.tsx' },
  { feature_name: 'Win/Loss Debriefs', description: 'Debrief tracker with strengths, weaknesses, lessons learned, outcome styling', category: 'core', status: 'deployed', health: 'healthy', priority: 'p2_medium', notes: 'app/(dashboard)/debriefs/page.tsx' },
  { feature_name: 'Federal Opportunity Search', description: 'Federal opportunity search with filters for SAM.gov and other sources', category: 'core', status: 'deployed', health: 'degraded', priority: 'p1_high', notes: 'Skeleton UI, missing live data integration' },

  // AI Features (7)
  { feature_name: 'AI Chat (AskSage)', description: 'Smart chat interface with session management, opportunity context, agent routing, token budget display', category: 'ai', status: 'deployed', health: 'healthy', priority: 'p0_critical', notes: 'CUI routes to AskSage (FedRAMP)' },
  { feature_name: 'AI Assistant History', description: 'AI usage history table with agent breakdown, session metadata, cost tracking', category: 'ai', status: 'deployed', health: 'healthy', priority: 'p1_high', notes: 'app/(dashboard)/ai/page.tsx' },
  { feature_name: 'AI Pipeline Engine', description: 'Single-entry-point aiRequest() with model selection, CUI routing, research pre-agent', category: 'ai', status: 'deployed', health: 'healthy', priority: 'p0_critical', notes: 'lib/ai/pipeline.ts + research-router.ts' },
  { feature_name: 'Voice Fingerprint', description: 'Company voice profile extraction and matching for proposal consistency', category: 'ai', status: 'deployed', health: 'healthy', priority: 'p2_medium', notes: 'lib/ai/voice-fingerprint.ts' },
  { feature_name: 'Proactive AI Insights', description: 'Deadline risk assessment and section detection for proactive alerts', category: 'ai', status: 'deployed', health: 'healthy', priority: 'p2_medium', notes: 'lib/ai/proactive/' },
  { feature_name: 'AI Fine-Tuning', description: 'Fine-tune job management with data export and model training (executive only)', category: 'ai', status: 'deployed', health: 'healthy', priority: 'p2_medium', notes: 'admin/fine-tune' },
  { feature_name: 'AI Orchestration Engine', description: 'Agent catalog (8 agents) with workflow templates and coordination', category: 'ai', status: 'deployed', health: 'healthy', priority: 'p1_high', notes: 'admin/orchestration' },

  // Proposal Tools (7)
  { feature_name: 'RFP Shredder', description: 'RFP document upload with text extraction, requirements parsing, compliance mapping', category: 'core', status: 'deployed', health: 'healthy', priority: 'p0_critical', notes: 'Core differentiator feature' },
  { feature_name: 'Compliance Matrix', description: 'Compliance tracking with progress (addressed/verified/remaining) and gap detection', category: 'core', status: 'deployed', health: 'healthy', priority: 'p0_critical', notes: 'Iron Dome compliance cards' },
  { feature_name: 'Pricing Engine', description: 'Cost volume manager with labor categories, ODC table, CUI watermark, MFA enforcement', category: 'core', status: 'deployed', health: 'healthy', priority: 'p0_critical', notes: 'CUI protected' },
  { feature_name: 'Gate Reviews', description: 'Gate review timeline with pWin tracking, review comments, approval workflow', category: 'core', status: 'deployed', health: 'healthy', priority: 'p1_high', notes: 'pipeline/[id]/gate-reviews' },
  { feature_name: 'Competitive Intelligence', description: 'Competitor intel with threat levels, strategy analysis, CUI/OPSEC protection', category: 'core', status: 'deployed', health: 'healthy', priority: 'p1_high', notes: 'MFA required' },
  { feature_name: 'Orals Preparation', description: 'Interview prep with question bank, scoring, and saved practice sessions', category: 'core', status: 'deployed', health: 'healthy', priority: 'p1_high', notes: 'pipeline/[id]/orals + interview-prep' },
  { feature_name: 'Post-Award Management', description: 'Contract tracking, amendment management, and launch readiness gates', category: 'core', status: 'deployed', health: 'healthy', priority: 'p1_high', notes: 'post-award + amendments + contracts + launch' },

  // Collaboration (5)
  { feature_name: 'Real-time Collaboration', description: 'Presence tracking, section locking, sync engine with conflict resolution', category: 'collaboration', status: 'deployed', health: 'healthy', priority: 'p1_high', notes: 'lib/realtime/ + lib/sync/' },
  { feature_name: 'Swimlane Board', description: 'Dynamic swimlane visualization with lazy loading and phase tracking per opportunity', category: 'ux', status: 'deployed', health: 'healthy', priority: 'p1_high', notes: 'pipeline/[id]/swimlane' },
  { feature_name: 'Gantt Timeline', description: 'Timeline visualization with KPI cards for proposal milestones', category: 'ux', status: 'deployed', health: 'healthy', priority: 'p1_high', notes: 'proposals/[id]/timeline' },
  { feature_name: 'Approval Workflows', description: 'Sequential approval steps with conditional routing and role-based gates', category: 'collaboration', status: 'deployed', health: 'healthy', priority: 'p1_high', notes: 'admin/approval-workflows' },
  { feature_name: 'Human-in-the-Loop Queue', description: 'Review queue for compliance, contract, and document approvals with status transitions', category: 'collaboration', status: 'deployed', health: 'healthy', priority: 'p1_high', notes: 'hitl page' },

  // Security (5)
  { feature_name: 'RBAC System', description: 'Role-based access with invisible pattern, custom role builder, granular permissions', category: 'security', status: 'deployed', health: 'healthy', priority: 'p0_critical', notes: 'roles_permissions_config.json v9.5' },
  { feature_name: 'Audit Trail', description: 'Immutable NIST AU-9 compliant audit log with configurable retention (90d-7y)', category: 'security', status: 'deployed', health: 'healthy', priority: 'p0_critical', notes: 'audit + admin/audit-retention' },
  { feature_name: 'FedRAMP Compliance', description: 'FedRAMP 20x compliance dashboard with NIST 800-53 control families tracking', category: 'security', status: 'deployed', health: 'healthy', priority: 'p0_critical', notes: 'admin/fedramp' },
  { feature_name: 'SSO/SAML Authentication', description: 'SAML 2.0 SSO configuration with IdP settings (enterprise tier)', category: 'security', status: 'deployed', health: 'healthy', priority: 'p1_high', notes: 'admin/sso' },
  { feature_name: 'Rate Limiting', description: 'Per-IP and per-endpoint rate limiting for API protection', category: 'security', status: 'deployed', health: 'healthy', priority: 'p1_high', notes: 'lib/security/rate-limiter.ts' },

  // Admin (8)
  { feature_name: 'Admin Console', description: 'Admin landing with navigation grid to 28 admin sub-pages', category: 'admin', status: 'deployed', health: 'healthy', priority: 'p1_high', notes: 'admin/page.tsx' },
  { feature_name: 'User Management', description: 'User listing with invitations, role assignment, and access control', category: 'admin', status: 'deployed', health: 'healthy', priority: 'p0_critical', notes: 'admin/users' },
  { feature_name: 'Workspace Management', description: 'Multi-workspace support for divisions/subsidiaries (enterprise tier)', category: 'admin', status: 'deployed', health: 'healthy', priority: 'p2_medium', notes: 'admin/workspaces' },
  { feature_name: 'System Health Monitoring', description: 'System health dashboard with DB, auth, AI service status and latency tracking', category: 'admin', status: 'deployed', health: 'healthy', priority: 'p1_high', notes: 'admin/system-health + monitoring + performance' },
  { feature_name: 'AI Model Management', description: 'AI provider config with FedRAMP enforcement, model selection, budget guard (75%)', category: 'admin', status: 'deployed', health: 'healthy', priority: 'p1_high', notes: 'admin/ai-providers + models' },
  { feature_name: 'Template Management', description: 'Branded template editor for DOCX/XLSX/PPTX generation with company branding', category: 'admin', status: 'deployed', health: 'healthy', priority: 'p2_medium', notes: 'admin/templates' },
  { feature_name: 'Question Bank', description: 'Orals Q&A repository with 200+ questions grouped by category', category: 'admin', status: 'deployed', health: 'healthy', priority: 'p2_medium', notes: 'admin/question-bank' },
  { feature_name: 'Cache Management', description: 'AI semantic cache metrics with per-agent statistics and TTL configuration', category: 'admin', status: 'deployed', health: 'healthy', priority: 'p3_low', notes: 'admin/cache' },

  // Integrations (12)
  { feature_name: 'Integration Hub', description: 'Central integration management with OAuth provider connections and token management', category: 'integration', status: 'deployed', health: 'healthy', priority: 'p1_high', notes: '12 integration tiles' },
  { feature_name: 'SAM.gov Integration', description: 'Federal opportunity import and search from SAM.gov', category: 'integration', status: 'deployed', health: 'healthy', priority: 'p1_high', notes: 'integrations/sam-gov' },
  { feature_name: 'GovWin IQ Integration', description: 'Opportunity alerts with filters, enrichment, and auto-sync', category: 'integration', status: 'deployed', health: 'healthy', priority: 'p1_high', notes: 'integrations/govwin' },
  { feature_name: 'HubSpot CRM Sync', description: 'Bi-directional CRM sync with field mappings and sync logs', category: 'integration', status: 'deployed', health: 'healthy', priority: 'p1_high', notes: 'integrations/hubspot' },
  { feature_name: 'Salesforce CRM Sync', description: 'Opportunity sync with field mappings and contact sync', category: 'integration', status: 'deployed', health: 'healthy', priority: 'p1_high', notes: 'integrations/salesforce' },
  { feature_name: 'Microsoft 365 Integration', description: 'Teams, SharePoint, Outlook, OneDrive, Calendar integration', category: 'integration', status: 'deployed', health: 'healthy', priority: 'p1_high', notes: 'integrations/m365' },
  { feature_name: 'Google Workspace Integration', description: 'Drive, Calendar, Gmail integration with OAuth', category: 'integration', status: 'deployed', health: 'healthy', priority: 'p2_medium', notes: 'integrations/google' },
  { feature_name: 'DocuSign Integration', description: 'E-signature configuration with status tracking', category: 'integration', status: 'deployed', health: 'healthy', priority: 'p2_medium', notes: 'integrations/docusign' },
  { feature_name: 'Slack Integration', description: 'Notifications, gate approvals, and webhook handling', category: 'integration', status: 'deployed', health: 'healthy', priority: 'p2_medium', notes: 'integrations/slack' },
  { feature_name: 'Bloomberg Government', description: 'Bloomberg Government data integration (enterprise feature)', category: 'integration', status: 'deployed', health: 'healthy', priority: 'p2_medium', notes: 'integrations/bloomberg-gov' },
  { feature_name: 'USASpending Integration', description: 'Federal award data enrichment from USASpending.gov', category: 'integration', status: 'deployed', health: 'healthy', priority: 'p2_medium', notes: 'integrations/usaspending' },
  { feature_name: 'Aggregated Search', description: 'Cross-integration search aggregator for unified opportunity discovery', category: 'integration', status: 'deployed', health: 'healthy', priority: 'p2_medium', notes: 'lib/integrations/aggregator/search.ts' },

  // Billing (4)
  { feature_name: 'Billing & Subscription', description: 'Stripe integration with plan selection, token balance, subscription management', category: 'billing', status: 'deployed', health: 'healthy', priority: 'p0_critical', notes: 'settings/billing + lib/billing/' },
  { feature_name: 'Pilot Program', description: 'Time-limited trial with ROI tracking, conversion pricing, expiration handling', category: 'billing', status: 'deployed', health: 'healthy', priority: 'p1_high', notes: 'admin/pilots + pilot pages' },
  { feature_name: 'Onboarding Wizard', description: 'Step-by-step onboarding with progress tracking and completion gates', category: 'ux', status: 'deployed', health: 'healthy', priority: 'p1_high', notes: 'onboarding page + lib/onboarding/' },
  { feature_name: 'Customer Success Dashboard', description: 'Enterprise health indicators and customer engagement metrics', category: 'admin', status: 'deployed', health: 'healthy', priority: 'p2_medium', notes: 'admin/csm' },

  // Analytics (4)
  { feature_name: 'Analytics Dashboard', description: 'KPIs, phase breakdown, win rate trends, team workload visualization', category: 'analytics', status: 'deployed', health: 'healthy', priority: 'p1_high', notes: 'analytics/page.tsx' },
  { feature_name: 'AI Usage Analytics', description: 'Token usage, cost tracking, cache metrics, agent satisfaction scores', category: 'analytics', status: 'deployed', health: 'healthy', priority: 'p1_high', notes: 'admin/ai-usage + admin/analytics' },
  { feature_name: 'Performance Benchmarks', description: 'Endpoint latency tracking with p50/p95/p99 bands vs product spec targets', category: 'analytics', status: 'deployed', health: 'healthy', priority: 'p2_medium', notes: 'admin/benchmarks + admin/performance' },
  { feature_name: 'Feedback & Feature Voting', description: 'Feature suggestions with upvoting system and admin moderation queue', category: 'ux', status: 'deployed', health: 'healthy', priority: 'p2_medium', notes: 'feedback/page.tsx' },

  // Document Generation (3)
  { feature_name: 'DOCX Generation', description: 'Word document generation with branded templates', category: 'core', status: 'deployed', health: 'healthy', priority: 'p1_high', notes: 'app/api/docgen/docx' },
  { feature_name: 'PPTX Generation', description: 'PowerPoint generation for briefings and presentations', category: 'core', status: 'deployed', health: 'healthy', priority: 'p1_high', notes: 'app/api/docgen/pptx' },
  { feature_name: 'Binder Assembly', description: 'Multi-document binder assembly with cloud storage support', category: 'core', status: 'deployed', health: 'healthy', priority: 'p1_high', notes: 'app/api/docgen/binder' },

  // Infrastructure (5)
  { feature_name: 'Auth System (Magic Link)', description: 'Supabase auth with magic link, middleware protection, session management', category: 'security', status: 'deployed', health: 'healthy', priority: 'p0_critical', notes: 'app/api/auth/callback + middleware.ts' },
  { feature_name: 'Health Check API', description: 'Basic and detailed health endpoints for monitoring', category: 'infrastructure', status: 'deployed', health: 'healthy', priority: 'p1_high', notes: 'app/api/health/' },
  { feature_name: 'Notification System', description: 'In-app notifications with email/push channel preferences', category: 'ux', status: 'deployed', health: 'healthy', priority: 'p1_high', notes: 'notifications + settings/notifications' },
  { feature_name: 'Playbook & Golden Content', description: 'Playbook browser with golden content library and voice profile integration', category: 'core', status: 'deployed', health: 'healthy', priority: 'p1_high', notes: 'playbook/ pages' },
  { feature_name: 'Help Center', description: 'Help documentation with 6 collapsible sections for user guidance', category: 'ux', status: 'deployed', health: 'healthy', priority: 'p3_low', notes: 'help/page.tsx' },
];

async function supabaseRequest(path, options = {}) {
  const url = `${SUPABASE_URL}/rest/v1/${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': options.prefer || 'return=representation',
      ...options.headers,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase ${res.status}: ${text}`);
  }
  return res.json();
}

async function main() {
  console.log(`Seeding ${features.length} MissionPulse features...`);

  // Check which features already exist
  let existing;
  try {
    existing = await supabaseRequest('product_roadmap?product=eq.missionpulse&select=feature_name');
  } catch (e) {
    console.error('Failed to query existing features:', e.message);
    console.log('Note: You may need to run the migration first to add missionpulse to the product CHECK constraint.');
    process.exit(1);
  }

  const existingNames = new Set(existing.map(r => r.feature_name));
  const toInsert = features.filter(f => !existingNames.has(f.feature_name));

  if (toInsert.length === 0) {
    console.log('All features already exist. Nothing to insert.');
    return;
  }

  console.log(`Found ${existingNames.size} existing features, inserting ${toInsert.length} new ones...`);

  // Insert in batches of 20
  const batchSize = 20;
  let inserted = 0;
  for (let i = 0; i < toInsert.length; i += batchSize) {
    const batch = toInsert.slice(i, i + batchSize).map(f => ({
      product: 'missionpulse',
      owner: 'jack',
      ...f,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));

    try {
      const result = await supabaseRequest('product_roadmap', {
        method: 'POST',
        body: JSON.stringify(batch),
        prefer: 'return=representation,resolution=ignore-duplicates',
      });
      inserted += result.length;
      console.log(`  Batch ${Math.floor(i / batchSize) + 1}: inserted ${result.length} features`);
    } catch (e) {
      console.error(`  Batch ${Math.floor(i / batchSize) + 1} failed:`, e.message);
    }
  }

  console.log(`\nDone. Inserted ${inserted} of ${toInsert.length} new features.`);
  console.log(`Total MissionPulse features: ${existingNames.size + inserted}`);
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
