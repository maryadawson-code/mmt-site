-- Migration: Perplexity Intelligence Layer Tables
-- Run against Supabase project for mmt-site

CREATE TABLE newsletter_research (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now(),
  publish_date DATE NOT NULL,
  research_json JSONB NOT NULL,
  status TEXT DEFAULT 'ready',
  used_in_edition TEXT
);

CREATE TABLE protest_monitor (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  case_number TEXT NOT NULL,
  solicitation_number TEXT,
  protester TEXT,
  agency TEXT,
  filed_date DATE,
  due_date DATE,
  status TEXT NOT NULL,
  last_checked TIMESTAMPTZ DEFAULT now(),
  last_status TEXT,
  status_history JSONB DEFAULT '[]',
  alert_sent BOOLEAN DEFAULT false,
  details JSONB DEFAULT '{}'
);

CREATE TABLE fact_checks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now(),
  source_content TEXT NOT NULL,
  claims JSONB NOT NULL,
  overall_accuracy_score INTEGER,
  context TEXT
);

CREATE INDEX idx_newsletter_research_publish ON newsletter_research(publish_date DESC);
CREATE INDEX idx_protest_monitor_case ON protest_monitor(case_number);
CREATE INDEX idx_fact_checks_created ON fact_checks(created_at DESC);

-- Seed active protest case
INSERT INTO protest_monitor (case_number, solicitation_number, protester, agency, filed_date, due_date, status, last_status)
VALUES ('B-424295.1', 'HT001126RE011', 'BDR Solutions, LLC', 'Defense Health Agency', '2026-03-03', '2026-06-11', 'Case Currently Open', 'Case Currently Open');
