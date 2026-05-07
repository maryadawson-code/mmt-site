-- Knowledge graph schema for Digital Mary multi-hop reasoning.
-- Tables: gx_node (entities) + gx_edge (relationships).
-- Uses pgvector for hybrid search (graph + embedding similarity).
--
-- DM-201 (Sprint A2, 2026-05-07).

create extension if not exists vector;

create table if not exists gx_node (
  id              text         primary key,         -- e.g., 'dha-omnibus-iv'
  type            text         not null,            -- Vehicle | Agency | Contractor | Person | Article | Topic | Solicitation | Program
  canonical_name  text         not null,            -- 'DHA OMNIBUS IV'
  properties      jsonb        not null default '{}'::jsonb,
  embedding       vector(1536),                     -- text-embedding-3-small
  created_at      timestamptz  not null default now(),
  updated_at      timestamptz  not null default now()
);

create index if not exists gx_node_type_idx          on gx_node (type);
create index if not exists gx_node_canonical_idx     on gx_node (canonical_name);
create index if not exists gx_node_embedding_ivfflat on gx_node using ivfflat (embedding vector_cosine_ops);

create table if not exists gx_edge (
  from_id     text         not null references gx_node(id) on delete cascade,
  to_id       text         not null references gx_node(id) on delete cascade,
  relation    text         not null,                -- incumbent_of | awarded_to | covers_naics | mentions | succeeds | competes_with | leads | manages | parent_company | subcontracts
  properties  jsonb        not null default '{}'::jsonb,
  weight      real         not null default 1.0,
  created_at  timestamptz  not null default now(),
  primary key (from_id, to_id, relation)
);

create index if not exists gx_edge_from_relation_idx on gx_edge (from_id, relation);
create index if not exists gx_edge_to_relation_idx   on gx_edge (to_id, relation);

-- Canonical answer cache. The agentic loop checks this BEFORE graph
-- traversal or vector search.
-- DM-203 (Sprint A2, 2026-05-07).
create table if not exists entity_canonical_answers (
  entity_id          text         primary key references gx_node(id) on delete cascade,
  summary            text         not null,                -- one-liner
  body               text         not null,                -- multi-paragraph
  last_updated       timestamptz  not null default now(),
  sources            jsonb        not null default '[]'::jsonb,   -- [{title, url}, ...]
  related_entities   jsonb        not null default '[]'::jsonb,   -- [entity_id, ...]
  next_action        text         not null,                -- "what to do" close
  watch_signals      jsonb        not null default '[]'::jsonb    -- ["RFP draft expected Q3", ...]
);

-- Article topic tagging (used in DM-301)
-- DM-301 (Sprint A3, 2026-05-07) — pre-staged here so all migrations land together.
create table if not exists article_topics (
  article_slug  text         not null,
  topic         text         not null,
  weight        real         not null default 1.0,
  primary key (article_slug, topic)
);
create index if not exists article_topics_topic_idx on article_topics (topic);
