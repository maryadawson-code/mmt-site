-- Migration 012: known_facts table for auto-verified ground truth
-- Supplements the static KNOWN_FACTS in contract-facts.js with
-- live verification timestamps and counts from daily refresh.

CREATE TABLE IF NOT EXISTS known_facts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  contract_key TEXT NOT NULL,
  field_name TEXT NOT NULL,
  value TEXT NOT NULL,
  source_url TEXT,
  last_verified TIMESTAMPTZ DEFAULT now(),
  verified_count INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(contract_key, field_name)
);

-- Seed from KNOWN_FACTS (idempotent)
INSERT INTO known_facts (contract_key, field_name, value, source_url) VALUES
  ('mhs-genesis-electronic-health-record', 'value', '~$5.5B (expanded 2018) + $1.4B sole-source extension through 2028', 'https://www.health.mil/Military-Health-Topics/Technology/MHS-GENESIS'),
  ('community-care-network-ccn-next-gen', 'value', 'Est. $65B+ (multi-region IDIQ)', 'https://sam.gov/opp/7b2734002e4048bfa2ac4cc5b0479930/view'),
  ('t4ng-t4ng2-va-it-services', 'value', '$60.7B ceiling (T4NG2)', 'https://sam.gov'),
  ('federal-electronic-health-record-modernization-fehrm', 'value', '$37B–$50B lifecycle estimate (combined DoD/VA)', 'https://www.fehrm.gov'),
  ('va-ehr-modernization-ehrm', 'value', '~$37B lifecycle estimate', 'https://digital.va.gov/ehr-modernization/ehr-deployment-schedule/'),
  ('tricare-managed-care-support-t-5-mcs', 'value', 'Humana East $7.34B (CY2026 option), Evernorth $719.4M (pharmacy CY2026)', 'https://newsroom.tricare.mil/News/TRICARE-News/Article/3776346/'),
  ('enterprise-intelligence-data-solutions-eids', 'value', '$650M ceiling', 'https://orangeslices.ai/koniag-subsidiary-scores-94m-dha-eids-pmo-aws-idiq/'),
  ('defense-health-agency-telehealth-programs', 'value', '$180M (primary)', 'https://business.amwell.com/about-us/news/press-releases/2023/u.s.-defense-health-agency-selects-amwell-and-leidos'),
  ('va-health-connect-iht-20', 'value', '$14B / 10-year (IHT 2.0 IDIQ)', 'https://orangeslices.ai/va-vha-releases-draft-rfp-for-14b-iht-2-0-idiq/'),
  ('military-health-system-enterprise-imaging', 'value', 'Various', 'https://govtribe.com/opportunity/federal-contract-opportunity/noi-to-sole-source-to-imaging-service-solutions')
ON CONFLICT (contract_key, field_name) DO NOTHING;
