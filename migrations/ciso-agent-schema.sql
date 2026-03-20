-- ============================================================
-- CISO Agent Schema — Mission Meets Tech
-- Created: 2026-03-20
--
-- Tables: ciso_cmmc_practices, ciso_findings, ciso_scan_log,
--         ciso_access_inventory, ciso_incidents
-- All tables have RLS enabled with service_role bypass
-- ============================================================

-- CMMC L2 Practice Tracker: all 110 practices from NIST 800-171 Rev 2
CREATE TABLE IF NOT EXISTS ciso_cmmc_practices (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  practice_id TEXT NOT NULL UNIQUE,
  family TEXT NOT NULL,
  family_name TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  implementation_status TEXT CHECK (implementation_status IN ('met', 'partially_met', 'not_met', 'not_applicable')) DEFAULT 'not_met',
  implementation_notes TEXT,
  evidence_location TEXT,
  mmt_component TEXT,
  last_assessed TIMESTAMPTZ,
  last_assessed_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cmmc_family ON ciso_cmmc_practices(family);
CREATE INDEX IF NOT EXISTS idx_cmmc_status ON ciso_cmmc_practices(implementation_status);

-- Security Findings
CREATE TABLE IF NOT EXISTS ciso_findings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  finding_type TEXT NOT NULL,
  severity TEXT CHECK (severity IN ('critical', 'high', 'medium', 'low')) NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  affected_component TEXT NOT NULL,
  cmmc_practice_id TEXT REFERENCES ciso_cmmc_practices(practice_id),
  status TEXT CHECK (status IN ('open', 'in_progress', 'remediated', 'accepted_risk', 'false_positive')) DEFAULT 'open',
  remediation_plan TEXT,
  remediated_at TIMESTAMPTZ,
  remediated_by TEXT,
  evidence TEXT,
  discovered_at TIMESTAMPTZ DEFAULT NOW(),
  discovered_by TEXT DEFAULT 'ciso-agent',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_findings_status ON ciso_findings(status);
CREATE INDEX IF NOT EXISTS idx_findings_severity ON ciso_findings(severity);
CREATE INDEX IF NOT EXISTS idx_findings_component ON ciso_findings(affected_component);

-- Security Scan Log
CREATE TABLE IF NOT EXISTS ciso_scan_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  scan_type TEXT NOT NULL,
  status TEXT CHECK (status IN ('running', 'completed', 'failed')) DEFAULT 'running',
  findings_count INTEGER DEFAULT 0,
  critical_count INTEGER DEFAULT 0,
  high_count INTEGER DEFAULT 0,
  medium_count INTEGER DEFAULT 0,
  low_count INTEGER DEFAULT 0,
  scan_details JSONB,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER
);

CREATE INDEX IF NOT EXISTS idx_scan_type ON ciso_scan_log(scan_type);

-- Access Inventory
CREATE TABLE IF NOT EXISTS ciso_access_inventory (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  service TEXT NOT NULL,
  credential_type TEXT NOT NULL,
  credential_name TEXT NOT NULL,
  storage_location TEXT NOT NULL,
  has_rotation_policy BOOLEAN DEFAULT FALSE,
  rotation_interval_days INTEGER,
  last_rotated TIMESTAMPTZ,
  next_rotation_due TIMESTAMPTZ,
  access_scope TEXT,
  users_with_access TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Incident Log
CREATE TABLE IF NOT EXISTS ciso_incidents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  incident_type TEXT NOT NULL,
  severity TEXT CHECK (severity IN ('critical', 'high', 'medium', 'low')) NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  affected_systems TEXT[],
  status TEXT CHECK (status IN ('detected', 'investigating', 'contained', 'eradicated', 'recovered', 'closed')) DEFAULT 'detected',
  timeline JSONB,
  root_cause TEXT,
  corrective_actions TEXT,
  notification_required BOOLEAN DEFAULT FALSE,
  customers_notified BOOLEAN DEFAULT FALSE,
  detected_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- Row Level Security
-- ============================================================

ALTER TABLE ciso_cmmc_practices ENABLE ROW LEVEL SECURITY;
ALTER TABLE ciso_findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE ciso_scan_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE ciso_access_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE ciso_incidents ENABLE ROW LEVEL SECURITY;

-- Service role bypass (for edge functions / agent-bridge)
CREATE POLICY "Service role full access" ON ciso_cmmc_practices FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON ciso_findings FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON ciso_scan_log FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON ciso_access_inventory FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON ciso_incidents FOR ALL USING (auth.role() = 'service_role');

-- Admin user access (Mary + Jack)
CREATE POLICY "Admin read access" ON ciso_cmmc_practices FOR SELECT USING (
  auth.uid() IN ('07563a79-f6e2-4b93-b483-f6c4186118fe'::uuid)
  OR auth.jwt()->>'email' = 'jackyang2326@gmail.com'
);
CREATE POLICY "Admin read access" ON ciso_findings FOR SELECT USING (
  auth.uid() IN ('07563a79-f6e2-4b93-b483-f6c4186118fe'::uuid)
  OR auth.jwt()->>'email' = 'jackyang2326@gmail.com'
);
CREATE POLICY "Admin read access" ON ciso_scan_log FOR SELECT USING (
  auth.uid() IN ('07563a79-f6e2-4b93-b483-f6c4186118fe'::uuid)
  OR auth.jwt()->>'email' = 'jackyang2326@gmail.com'
);
CREATE POLICY "Admin read access" ON ciso_access_inventory FOR SELECT USING (
  auth.uid() IN ('07563a79-f6e2-4b93-b483-f6c4186118fe'::uuid)
  OR auth.jwt()->>'email' = 'jackyang2326@gmail.com'
);
CREATE POLICY "Admin read access" ON ciso_incidents FOR SELECT USING (
  auth.uid() IN ('07563a79-f6e2-4b93-b483-f6c4186118fe'::uuid)
  OR auth.jwt()->>'email' = 'jackyang2326@gmail.com'
);
