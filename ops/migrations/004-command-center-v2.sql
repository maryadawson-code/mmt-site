-- Task queue for agent dispatch
CREATE TABLE IF NOT EXISTS task_queue (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  task text NOT NULL,
  agent text NOT NULL CHECK (agent IN ('editorial', 'code', 'research')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'failed', 'cancelled')),
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('urgent', 'high', 'normal', 'low')),
  result text,
  completed_at timestamptz,
  created_by text DEFAULT 'command_center'
);

CREATE INDEX IF NOT EXISTS idx_task_queue_status ON task_queue(status) WHERE status IN ('pending', 'in_progress');
CREATE INDEX IF NOT EXISTS idx_task_queue_agent ON task_queue(agent, status);

-- Newsletter pipeline tracking
CREATE TABLE IF NOT EXISTS newsletter_pipeline (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  publish_date date NOT NULL,
  day_slot text NOT NULL CHECK (day_slot IN ('tuesday', 'friday', 'breaking')),
  status text NOT NULL DEFAULT 'planning' CHECK (status IN ('planning', 'researching', 'drafting', 'editing', 'ready', 'published', 'killed')),
  lead_topic text,
  lead_score integer,
  secondary_topics jsonb DEFAULT '[]',
  notes text,
  linkedin_drafted boolean DEFAULT false,
  podcast_points_drafted boolean DEFAULT false,
  published_url text
);

CREATE INDEX IF NOT EXISTS idx_newsletter_pipeline_date ON newsletter_pipeline(publish_date DESC);

-- Agent heartbeat tracking
CREATE TABLE IF NOT EXISTS agent_heartbeats (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  agent text NOT NULL,
  last_seen timestamptz DEFAULT now(),
  status text DEFAULT 'idle',
  current_task text,
  details jsonb DEFAULT '{}'
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_heartbeat_agent ON agent_heartbeats(agent);

-- Signals table (research → editorial handoff)
CREATE TABLE IF NOT EXISTS intel_signals (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now(),
  source text NOT NULL,
  signal_type text CHECK (signal_type IN ('contract_award', 'solicitation', 'policy_change', 'personnel_move', 'competitor_intel', 'industry_news', 'breaking')),
  title text NOT NULL,
  summary text,
  relevance_score integer,
  data jsonb DEFAULT '{}',
  urls jsonb DEFAULT '[]',
  status text DEFAULT 'new' CHECK (status IN ('new', 'scored', 'assigned', 'drafted', 'published', 'killed')),
  assigned_to text,
  notes text
);

CREATE INDEX IF NOT EXISTS idx_signals_status ON intel_signals(status, created_at DESC);
