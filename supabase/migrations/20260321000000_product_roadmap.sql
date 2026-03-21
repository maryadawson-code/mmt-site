-- Phase 10: Product Roadmap tables
-- Tables: product_roadmap, product_roadmap_log, activity_feed
-- Pattern: matches penny_pincher.sql (UUID PKs, CHECK constraints, RLS)

-- ============================================================
-- 1. product_roadmap — core feature tracking
-- ============================================================
CREATE TABLE IF NOT EXISTS product_roadmap (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  product TEXT NOT NULL CHECK (product IN ('proposalpulse', 'marketpulse', 'mmt_site', 'command_center', 'agent_network')),
  feature_name TEXT NOT NULL,
  description TEXT,
  category TEXT CHECK (category IN ('core', 'security', 'ux', 'integration', 'infrastructure', 'content')),
  status TEXT CHECK (status IN ('planned', 'in_progress', 'deployed', 'needs_fix', 'deprecated')) DEFAULT 'planned',
  health TEXT CHECK (health IN ('healthy', 'degraded', 'broken', 'untested')) DEFAULT 'untested',
  priority TEXT CHECK (priority IN ('p0_critical', 'p1_high', 'p2_medium', 'p3_low')) DEFAULT 'p2_medium',
  owner TEXT CHECK (owner IN ('jack', 'mary', 'agent', 'unassigned')) DEFAULT 'unassigned',
  deploy_date DATE,
  last_verified TIMESTAMPTZ,
  notes TEXT,
  depends_on UUID[],
  file_map JSONB DEFAULT '[]',
  health_endpoint TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(product, feature_name)
);

CREATE INDEX IF NOT EXISTS idx_roadmap_product ON product_roadmap(product);
CREATE INDEX IF NOT EXISTS idx_roadmap_status ON product_roadmap(status);
CREATE INDEX IF NOT EXISTS idx_roadmap_health ON product_roadmap(health);
CREATE INDEX IF NOT EXISTS idx_roadmap_priority ON product_roadmap(priority);
CREATE INDEX IF NOT EXISTS idx_roadmap_owner ON product_roadmap(owner);

-- ============================================================
-- 2. product_roadmap_log — change history
-- ============================================================
CREATE TABLE IF NOT EXISTS product_roadmap_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  roadmap_item_id UUID REFERENCES product_roadmap(id) ON DELETE CASCADE,
  changed_by TEXT,
  change_type TEXT,
  field_changed TEXT,
  old_value TEXT,
  new_value TEXT,
  message TEXT,
  changed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_roadmap_log_item ON product_roadmap_log(roadmap_item_id);
CREATE INDEX IF NOT EXISTS idx_roadmap_log_time ON product_roadmap_log(changed_at);
CREATE INDEX IF NOT EXISTS idx_roadmap_log_type ON product_roadmap_log(change_type);

-- ============================================================
-- 3. activity_feed — add roadmap columns to existing table
-- ============================================================
ALTER TABLE activity_feed ADD COLUMN IF NOT EXISTS feature_id UUID REFERENCES product_roadmap(id) ON DELETE SET NULL;
ALTER TABLE activity_feed ADD COLUMN IF NOT EXISTS agent_id TEXT;
ALTER TABLE activity_feed ADD COLUMN IF NOT EXISTS detail_json JSONB DEFAULT '{}';
ALTER TABLE activity_feed ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE activity_feed ADD COLUMN IF NOT EXISTS event_type TEXT;
ALTER TABLE activity_feed ADD COLUMN IF NOT EXISTS summary TEXT;
ALTER TABLE activity_feed ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_activity_feature ON activity_feed(feature_id);
CREATE INDEX IF NOT EXISTS idx_activity_event ON activity_feed(event_type);
CREATE INDEX IF NOT EXISTS idx_activity_time ON activity_feed(created_at);
CREATE INDEX IF NOT EXISTS idx_activity_source ON activity_feed(source);

-- ============================================================
-- 4. RLS — service_role full access (same pattern as penny_pincher)
-- ============================================================
ALTER TABLE product_roadmap ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Service role full access" ON product_roadmap FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE product_roadmap_log ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Service role full access" ON product_roadmap_log FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE activity_feed ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Service role full access" ON activity_feed FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
