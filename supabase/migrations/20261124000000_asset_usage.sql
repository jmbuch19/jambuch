-- The creative engine's asset usage log and scores (24 Nov 2026; engine repo docs/asset-library.md).
-- One row per asset used in an order (or seeded from an approved Ramayana chapter), with the writer's reaction.
-- No creative content: only ids. Server-only: RLS on, no policies (the service role reads and writes).
create table if not exists public.asset_usage (
  id bigint generated always as identity primary key,
  source text not null check (source in ('order', 'ramayana-seed')),
  order_id text not null,               -- a creator order id, or 'ramayana-chNN' for seed rows
  asset_id text not null,               -- the card id (assets/cards/<kind>/<id>.json)
  asset_kind text not null check (asset_kind in ('music', 'sfx', 'voice', 'style', 'colour', 'font')),
  role text,                            -- e.g. 'narrator', 'bed', 'cue', 'hero-still'
  reaction text not null default 'none' check (reaction in ('approved', 'flagged', 'none')),
  note text,                            -- short reason for a flag (no story text)
  used_at timestamptz not null default now()
);
create index if not exists asset_usage_asset_idx on public.asset_usage (asset_id, used_at desc);
create index if not exists asset_usage_order_idx on public.asset_usage (order_id);
alter table public.asset_usage enable row level security;

-- Scores with recency weighting: a use counts exp(-age/120 days); Ramayana seed rows count 0.2 of a real writer's
-- reaction, so real writers' reactions soon outweigh the seed (the user, 24 Nov 2026).
-- approved = +1, flagged = -2, none = 0; smoothed by one neutral use so a single reaction cannot dominate.
create or replace view public.asset_scores with (security_invoker = true) as
select
  asset_id,
  max(asset_kind) as asset_kind,
  count(*) as uses,
  count(*) filter (where source = 'order') as order_uses,
  count(*) filter (where reaction = 'approved') as approved,
  count(*) filter (where reaction = 'flagged') as flagged,
  max(used_at) as last_used,
  round((sum(w * case reaction when 'approved' then 1 when 'flagged' then -2 else 0 end) / (sum(w) + 1))::numeric, 3) as score
from (
  select *, exp(-extract(epoch from (now() - used_at)) / 86400.0 / 120.0) * case source when 'order' then 1.0 else 0.2 end as w
  from public.asset_usage
) u
group by asset_id;

comment on table public.asset_usage is 'Creative engine: which assets each order used and the writer''s reaction (ids only, no content).';
comment on view public.asset_scores is 'Recency-weighted asset score: approved +1, flagged -2, seed rows x0.2, half-life ~83 days.';
