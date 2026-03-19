-- Full agent registry — replaces agent_heartbeats
CREATE TABLE IF NOT EXISTS agent_registry (
  id text PRIMARY KEY,
  name text NOT NULL,
  domain text NOT NULL,
  platform text NOT NULL DEFAULT 'claude_project',
  description text,
  color text,
  icon text,
  status text DEFAULT 'idle',
  last_active timestamptz,
  current_task text,
  prompt_template text,
  sort_order integer DEFAULT 0,
  archived boolean DEFAULT false
);

-- Seed all 19 agents
INSERT INTO agent_registry (id, name, domain, platform, description, color, icon, sort_order) VALUES
  -- MMT Platform (cyan)
  ('mmt-newsletter', 'Newsletter', 'mmt_platform', 'claude_project', 'Editorial voice, editions, copy editing, production, fact checking', '#00e5fa', '📰', 10),
  ('mmt-website', 'Website', 'mmt_platform', 'claude_project', 'Site development, design, UX', '#00e5fa', '🌐', 11),
  ('mmt-missionpulse', 'MissionPulse Builder', 'mmt_platform', 'claude_project', 'GovCon proposal platform development (missionpulse.ai)', '#00e5fa', '🚀', 12),
  ('mmt-business', 'Business', 'mmt_platform', 'claude_project', 'Business strategy, operations, growth', '#00e5fa', '💼', 13),
  ('mmt-dafe', 'DAFE', 'mmt_platform', 'claude_project', 'Defense Appropriations Funding Extractor — open-records appropriations decoder', '#00e5fa', '💰', 14),

  -- rockITdata (purple)
  ('rid-capture', 'Capture & Proposal', 'rockitdata', 'claude_project', 'Complete compliant winning proposals for rockITdata', '#a855f7', '🎯', 20),
  ('rid-marketing', 'Marketing & Content', 'rockitdata', 'claude_project', 'LinkedIn, website, podcast content for rockITdata', '#a855f7', '📣', 21),
  ('rid-contracts', 'Contracts Manager', 'rockitdata', 'claude_project', 'Federal contracting agent — DHA/DoD, VA, CMS/HHS, FDA/HHS, GSA', '#a855f7', '📋', 22),

  -- Active Captures (red)
  ('cap-oasis', 'OASIS+', 'active_captures', 'claude_project', 'OASIS+ winning proposal', '#ef4444', '⚡', 30),
  ('cap-ccn', 'CCN Next Gen', 'active_captures', 'claude_project', 'CCN Next Gen winning proposal', '#ef4444', '⚡', 31),
  ('cap-iht2', 'IHT 2.0', 'active_captures', 'claude_project', 'IHT 2.0 RFI response', '#ef4444', '⚡', 32),
  ('cap-gtm', 'Go To Market', 'active_captures', 'claude_project', 'GTM strategy and partner alignment for federal health tech', '#ef4444', '⚡', 33),

  -- Content & Personal (green)
  ('personal-bio', 'Biography', 'content_personal', 'claude_project', 'Mary''s biography and professional narrative', '#22c55e', '📝', 40),
  ('personal-babydev', 'Baby Dev', 'content_personal', 'claude_project', 'Dev content twin — force multiply content output', '#22c55e', '👶', 41),
  ('personal-resume', 'Resume Alignment', 'content_personal', 'claude_project', 'Skill deck population and resume alignment', '#22c55e', '📄', 42),
  ('personal-podcast', 'Podcast', 'content_personal', 'claude_project', 'Mission Meets Reality podcast production', '#22c55e', '🎙️', 43),

  -- Operations (yellow) — live automated agents
  ('ops-editorial', 'Editorial', 'operations', 'openclaw', 'OpenClaw editorial agent — newsletter voice, content decisions, learnings KB', '#eab308', '✍️', 50),
  ('ops-code', 'Code', 'operations', 'claude_code', 'Claude Code — all code changes, git, builds, migrations, deploys', '#eab308', '🔧', 51),
  ('ops-research', 'Research', 'operations', 'perplexity', 'Perplexity Computer — research, monitoring, 19 connected services', '#eab308', '🔍', 52)
ON CONFLICT (id) DO NOTHING;
