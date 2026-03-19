-- Add ChatGPT and Gemini to agent registry
INSERT INTO agent_registry (id, name, domain, platform, description, color, icon, sort_order) VALUES
  ('ext-chatgpt', 'ChatGPT', 'operations', 'openai_api', 'GPT-4o research, fact-checking, analysis. DALL-E 3 / GPT-Image image generation.', '#74aa9c', '🟢', 53),
  ('ext-gemini', 'Gemini', 'operations', 'google_api', 'Gemini 2.5 Pro research, long-context analysis. Imagen 3 image generation.', '#4285f4', '🔵', 54)
ON CONFLICT (id) DO NOTHING;

-- Image generation history
CREATE TABLE IF NOT EXISTS generated_images (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now(),
  prompt text NOT NULL,
  provider text NOT NULL CHECK (provider IN ('dalle3', 'gpt_image', 'imagen3')),
  model text,
  image_url text,
  storage_path text,
  size text DEFAULT '1024x1024',
  style text,
  metadata jsonb DEFAULT '{}',
  created_by text DEFAULT 'command_center'
);

CREATE INDEX IF NOT EXISTS idx_generated_images_date ON generated_images(created_at DESC);

-- Research queries (multi-provider)
CREATE TABLE IF NOT EXISTS research_queries (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now(),
  query text NOT NULL,
  providers jsonb DEFAULT '[]',
  results jsonb DEFAULT '{}',
  selected_result text,
  pushed_to_signal boolean DEFAULT false,
  signal_id uuid
);
