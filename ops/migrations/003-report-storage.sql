-- 003-report-storage.sql
-- Store generated report HTML in Supabase for hosted viewing via view-report.js

-- MarketPulse: store generated report HTML
ALTER TABLE marketpulse_orders ADD COLUMN IF NOT EXISTS report_html text;
ALTER TABLE marketpulse_orders ADD COLUMN IF NOT EXISTS report_url text;

-- ProposalPulse + Red Team: store report HTML (same table)
ALTER TABLE mp_scoring_history ADD COLUMN IF NOT EXISTS report_html text;
ALTER TABLE mp_scoring_history ADD COLUMN IF NOT EXISTS report_url text;
ALTER TABLE mp_scoring_history ADD COLUMN IF NOT EXISTS redteam_report_html text;
ALTER TABLE mp_scoring_history ADD COLUMN IF NOT EXISTS redteam_report_url text;
