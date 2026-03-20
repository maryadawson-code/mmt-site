-- 011-learning-competitive.sql
-- Self-learning engine + competitive intelligence tables

-- ═══════════════════════════════════════
-- SELF-LEARNING ENGINE
-- ═══════════════════════════════════════

CREATE TABLE IF NOT EXISTS agent_learnings (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now(),
  agent text NOT NULL,
  category text NOT NULL,
  domain text,
  rule text NOT NULL,
  context text,
  source text NOT NULL DEFAULT 'self',
  source_approval_id uuid,
  source_issue_id uuid,
  times_applied integer DEFAULT 0,
  last_applied_at timestamptz,
  prevented_errors integer DEFAULT 0,
  is_active boolean DEFAULT true,
  superseded_by uuid,
  expires_at timestamptz,
  confidence numeric(3,2) DEFAULT 0.80,
  metadata jsonb DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_learnings_agent ON agent_learnings(agent, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_learnings_domain ON agent_learnings(domain, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_learnings_confidence ON agent_learnings(confidence DESC) WHERE is_active = true;

CREATE TABLE IF NOT EXISTS learning_feedback (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now(),
  learning_id uuid NOT NULL REFERENCES agent_learnings(id),
  agent text NOT NULL,
  event_type text NOT NULL,
  context text,
  outcome text,
  metadata jsonb DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_learning_feedback ON learning_feedback(learning_id, created_at DESC);

-- ═══════════════════════════════════════
-- COMPETITIVE INTELLIGENCE
-- ═══════════════════════════════════════

CREATE TABLE IF NOT EXISTS competitors (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  name text NOT NULL UNIQUE,
  website text,
  description text,
  products jsonb DEFAULT '[]',
  target_market text,
  company_size text,
  funding text,
  overlap_score integer DEFAULT 0,
  strengths text,
  weaknesses text,
  differentiation text,
  last_researched_at timestamptz,
  research_notes text,
  pricing_history jsonb DEFAULT '[]',
  news jsonb DEFAULT '[]',
  metadata jsonb DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS competitive_alerts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now(),
  competitor_id uuid REFERENCES competitors(id),
  competitor_name text NOT NULL,
  alert_type text NOT NULL,
  title text NOT NULL,
  description text,
  source_url text,
  impact text,
  recommended_action text,
  reviewed boolean DEFAULT false,
  metadata jsonb DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_competitive_alerts_unreviewed ON competitive_alerts(created_at DESC) WHERE reviewed = false;

-- Seed competitors
INSERT INTO competitors (name, website, description, target_market, overlap_score, products) VALUES
  ('Lohfeld Consulting', 'https://lohfeldconsulting.com', 'GovCon capture/proposal consulting', 'govcon', 60, '[{"name":"Proposal Review","pricing":"$5,000-25,000"}]'),
  ('Shipley Associates', 'https://shipleywins.com', 'Proposal methodology + training', 'govcon', 50, '[{"name":"Training","pricing":"$2,000-5,000/person"}]'),
  ('GovWin (Deltek)', 'https://iq.govwin.com', 'Federal market intelligence', 'govcon', 40, '[{"name":"GovWin IQ","pricing":"$10,000-50,000/yr"}]'),
  ('Bloomberg Government', 'https://about.bgov.com', 'Government intelligence platform', 'govcon', 35, '[{"name":"BGOV","pricing":"$6,000-15,000/yr"}]'),
  ('GovTribe', 'https://govtribe.com', 'Federal contracting data', 'govcon', 45, '[{"name":"Pro","pricing":"$600-2,400/yr"}]'),
  ('Ask Sage', 'https://asksage.ai', 'GovCon AI assistant, FedRAMP', 'govcon', 55, '[{"name":"Ask Sage","pricing":"$180/mo"}]'),
  ('Govly', 'https://govly.com', 'AI opportunity discovery', 'govcon', 50, '[{"name":"Govly","pricing":"Free+paid"}]')
ON CONFLICT (name) DO NOTHING;

-- RLS + grants
ALTER TABLE agent_learnings ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE competitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE competitive_alerts ENABLE ROW LEVEL SECURITY;
GRANT ALL ON agent_learnings TO service_role;
GRANT ALL ON learning_feedback TO service_role;
GRANT ALL ON competitors TO service_role;
GRANT ALL ON competitive_alerts TO service_role;
