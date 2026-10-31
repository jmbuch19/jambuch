-- Courtyard: forms + themes instead of one category, and series.
--   form    what a piece is (prose, poetry, photography, …), one
--   themes  what it's about (humour, nostalgia, …), up to two
--   series  one contributor, one subject, many parts, each part a single
--           piece that joins the thread at a weekly gathering
--   followers  people who asked to hear when a new part arrives

-- ---------------------------------------------------------------- forms and themes

alter table public.courtyard_submissions
  add column form   text,
  add column themes text[] not null default '{}';

-- Existing submissions: their category becomes a form and, where it was really
-- a subject, a theme.
update public.courtyard_submissions set
  form = case category
           when 'writing' then 'prose'
           when 'photography' then 'photography'
           when 'music' then 'music'
           when 'art' then 'art'
           when 'tech' then 'tech'
           else 'other'
         end,
  themes = case category
             when 'education' then '{learning}'::text[]
             when 'heirlooms' then '{family}'::text[]
             else '{}'::text[]
           end;

alter table public.courtyard_submissions
  alter column form set not null,
  add constraint courtyard_submissions_form_check check (form in
    ('prose', 'poetry', 'photography', 'music', 'video', 'art', 'tech', 'other')),
  add constraint courtyard_submissions_themes_check check (
    cardinality(themes) <= 2 and themes <@ array[
      'humour', 'nostalgia', 'spirituality', 'family', 'childhood',
      'nature', 'food', 'learning', 'society', 'love'
    ]::text[]),
  -- category is kept for older rows only; new ones leave it empty.
  alter column category drop not null;

-- ---------------------------------------------------------------- series

create type public.series_status as enum ('pending', 'active', 'paused', 'ended');

create table public.courtyard_series (
  id               uuid primary key default gen_random_uuid(),
  slug             text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title            text not null check (char_length(title) <= 120),
  description      text check (char_length(description) <= 1000),
  name             text not null,             -- the contributor, as credited
  email            text not null,
  city             text,
  form             text,
  themes           text[] not null default '{}',
  status           public.series_status not null default 'pending',
  -- The personal "add the next part" link is signed with a server secret and
  -- this version; raising it kills every older link.
  add_link_version int not null default 1,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz,
  deleted_by       uuid references auth.users (id) on delete set null
);

-- One open series per contributor at a time.
create unique index courtyard_series_one_open_per_email
  on public.courtyard_series (lower(email))
  where status in ('pending', 'active', 'paused') and deleted_at is null;

alter table public.courtyard_submissions
  add column series_id             uuid references public.courtyard_series (id) on delete set null,
  add column series_part           int check (series_part > 0),   -- given when the part is approved
  add column followers_notified_at timestamptz;

create index courtyard_submissions_series_idx on public.courtyard_submissions (series_id, series_part);

create table public.courtyard_series_followers (
  id           uuid primary key default gen_random_uuid(),
  series_id    uuid not null references public.courtyard_series (id) on delete cascade,
  email        text not null,
  confirmed_at timestamptz,                   -- emails go only to confirmed followers
  created_at   timestamptz not null default now()
);
create unique index courtyard_series_followers_unique
  on public.courtyard_series_followers (series_id, lower(email));

-- ---------------------------------------------------------------- access

do $$
declare
  t text;
begin
  foreach t in array array['courtyard_series', 'courtyard_series_followers']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "admin manages %1$s" on public.%1$I
         for all to authenticated
         using ((select private.is_admin()))
         with check ((select private.is_admin()))', t);
  end loop;
end;
$$;

create trigger set_updated_at before update on public.courtyard_series
  for each row execute function public.set_updated_at();
