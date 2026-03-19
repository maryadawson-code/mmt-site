-- Create 4 missing tables for mmt-site features
-- Applied 2026-03-19

-- 1. marketpulse_review_queue (quality gate failure review)
CREATE TABLE IF NOT EXISTS public.marketpulse_review_queue (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id TEXT NOT NULL,
  email TEXT NOT NULL,
  name TEXT,
  company TEXT,
  topic TEXT NOT NULL,
  audience TEXT,
  quality_grade TEXT NOT NULL,
  quality_failures JSONB,
  quality_metrics JSONB,
  synthesis_preview TEXT,
  status TEXT DEFAULT 'pending_review',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mrq_status ON public.marketpulse_review_queue(status);

-- 2. protest_monitor (GAO protest tracking)
CREATE TABLE IF NOT EXISTS public.protest_monitor (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  case_number TEXT NOT NULL UNIQUE,
  protester TEXT NOT NULL,
  agency TEXT NOT NULL,
  solicitation_number TEXT,
  filed_date TEXT,
  due_date TEXT,
  status TEXT,
  last_status TEXT,
  last_checked TIMESTAMPTZ,
  status_history JSONB DEFAULT '[]'::jsonb,
  details JSONB,
  alert_sent BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pm_status ON public.protest_monitor(status);

-- 3. newsletter_research (weekly research packages)
CREATE TABLE IF NOT EXISTS public.newsletter_research (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  publish_date TEXT NOT NULL UNIQUE,
  compiled_date TEXT,
  research_json JSONB NOT NULL,
  status TEXT DEFAULT 'ready',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_nr_publish_date ON public.newsletter_research(publish_date);

-- 4. fact_checks (fact-check results + rate limiting)
CREATE TABLE IF NOT EXISTS public.fact_checks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  source_content TEXT NOT NULL,
  claims JSONB,
  overall_accuracy_score INTEGER,
  context TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fc_created_at ON public.fact_checks(created_at DESC);

-- Enable RLS
ALTER TABLE public.marketpulse_review_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.protest_monitor ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.newsletter_research ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fact_checks ENABLE ROW LEVEL SECURITY;

-- Grant service_role access
GRANT ALL ON public.marketpulse_review_queue TO service_role;
GRANT ALL ON public.protest_monitor TO service_role;
GRANT ALL ON public.newsletter_research TO service_role;
GRANT ALL ON public.fact_checks TO service_role;
