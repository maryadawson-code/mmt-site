-- Creative Studio — Article Illustration Workspace
-- Migrated from missionpulse.ai → missionmeetstech.com
-- Tables: creative_projects, creative_prompts, creative_images, creative_research
-- Storage: creative-studio bucket

-- ─── Tables ──────────────────────────────────────────────────────

create table if not exists creative_projects (
  id uuid primary key default gen_random_uuid(),
  article_title text not null,
  article_url text,
  article_excerpt text,
  pipeline_id uuid references newsletter_pipeline(id) on delete set null,
  status text not null default 'drafting'
    check (status in ('drafting', 'generating', 'selecting', 'complete')),
  created_by text not null default 'command_center',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists creative_prompts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references creative_projects(id) on delete cascade,
  prompt_text text not null,
  refinement_notes text,
  style_tags text[] default '{}',
  version int not null default 1,
  parent_prompt_id uuid references creative_prompts(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists creative_images (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references creative_projects(id) on delete cascade,
  prompt_id uuid not null references creative_prompts(id) on delete cascade,
  image_url text not null,
  thumbnail_url text,
  model_used text not null default 'dall-e-3',
  generation_params jsonb default '{}',
  rating int check (rating >= 1 and rating <= 5),
  selected boolean not null default false,
  notes text,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists creative_research (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references creative_projects(id) on delete cascade,
  type text not null
    check (type in ('reference_image', 'style_guide', 'color_palette', 'mood', 'competitor_example')),
  content text not null,
  source text,
  created_at timestamptz not null default now()
);

-- ─── Indexes ─────────────────────────────────────────────────────

create index idx_creative_prompts_project on creative_prompts(project_id);
create index idx_creative_images_project on creative_images(project_id);
create index idx_creative_images_prompt on creative_images(prompt_id);
create index idx_creative_research_project on creative_research(project_id);
create index idx_creative_projects_created_by on creative_projects(created_by);
create index idx_creative_projects_status on creative_projects(status);

-- ─── Updated_at trigger ──────────────────────────────────────────

create or replace function update_creative_projects_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_creative_projects_updated_at
  before update on creative_projects
  for each row execute function update_creative_projects_updated_at();

-- ─── RLS ─────────────────────────────────────────────────────────
-- Access is via Netlify Functions using the service role key.
-- Enable RLS but grant full access to the service role (default for service_role).

alter table creative_projects enable row level security;
alter table creative_prompts enable row level security;
alter table creative_images enable row level security;
alter table creative_research enable row level security;

-- ─── Storage Bucket ──────────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'creative-studio',
  'creative-studio',
  true,
  10485760,
  array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
)
on conflict (id) do nothing;
