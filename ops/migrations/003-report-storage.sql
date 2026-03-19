-- 003-report-storage.sql
-- Store generated report HTML in Supabase for hosted viewing via view-report.js

-- MarketPulse: store generated report HTML
ALTER TABLE marketpulse_orders ADD COLUMN IF NOT EXISTS report_html text;
ALTER TABLE marketpulse_orders ADD COLUMN IF NOT EXISTS report_url text;

-- ProposalPulse: store score report HTML
ALTER TABLE proposal_scorecards ADD COLUMN IF NOT EXISTS report_html text;
ALTER TABLE proposal_scorecards ADD COLUMN IF NOT EXISTS report_url text;

-- Red Team: store red team report HTML (same table as ProposalPulse)
ALTER TABLE proposal_scorecards ADD COLUMN IF NOT EXISTS redteam_report_html text;
ALTER TABLE proposal_scorecards ADD COLUMN IF NOT EXISTS redteam_report_url text;
