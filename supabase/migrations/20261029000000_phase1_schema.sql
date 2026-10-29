-- Phase 1 schema for jambuch.in
-- Rules:
--   * Visitors (anon) can only READ rows where published = true.
--   * Only the admin can add, change or delete content.
--   * Ideas are never readable by visitors. They are inserted by the server
--     after the Turnstile spam check, so there is no public insert policy.

-- ---------------------------------------------------------------- helpers

create type public.member_role as enum ('member', 'family', 'guest', 'admin');
create type public.project_group as enum ('mine', 'built_for_others');
create type public.reading_type as enum ('book', 'article');
create type public.notebook_type as enum ('poem', 'photo', 'note');
create type public.rights_status as enum ('permission_pending', 'granted', 'public_domain');
create type public.idea_category as enum ('book_to_translate', 'app', 'civic', 'other');

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------- members

create table public.members (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  email      text not null unique,
  name       text,
  role       public.member_role not null default 'member',
  created_at timestamptz not null default now()
);

-- Every new sign-in becomes a plain member. The admin role is granted by hand
-- (never from the app), so no email address is hard-coded here.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.members (user_id, email)
  values (new.id, lower(new.email))
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.members
    where user_id = (select auth.uid()) and role = 'admin'
  );
$$;

alter table public.members enable row level security;

create policy "members read own row" on public.members
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

create policy "admin manages members" on public.members
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- ---------------------------------------------------------------- site_text
-- Small fixed texts: section headings (English + Gujarati word), intros,
-- advising copy, footer links.

create table public.site_text (
  key        text primary key,
  en         text not null default '',
  gu         text not null default '',
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- content tables

create table public.desk_now (
  id         uuid primary key default gen_random_uuid(),
  text       text not null,
  link       text,
  published  boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.projects (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  name_gu       text,
  domain        text,
  url           text,
  status        text,
  description   text,
  project_group public.project_group not null default 'mine',
  published     boolean not null default true,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table public.books (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  author     text,
  shelf      text,
  language   text,
  year       int,
  isbn       text,
  starred    boolean not null default false,
  note       text,
  published  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Lets a CSV re-import update a book instead of duplicating it.
create unique index books_isbn_key on public.books (isbn) where isbn is not null and isbn <> '';
create index books_shelf_idx on public.books (shelf);

create table public.reading (
  id          uuid primary key default gen_random_uuid(),
  type        public.reading_type not null default 'book',
  title       text not null,
  author      text,            -- author, or publication for an article
  why         text,
  cover_url   text,
  link        text,
  is_current  boolean not null default false,
  book_id     uuid references public.books (id) on delete set null,
  published   boolean not null default true,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.workshop (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null,     -- Book / Film / Video / Platform / ...
  title      text not null,
  stage      text,
  published  boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.recordings (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  details    text,              -- raag / genre / where recorded
  duration   text,              -- shown as typed, e.g. 4:32
  link       text,              -- YouTube / SoundCloud etc. (no uploads in Phase 1)
  published  boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.notebook (
  id         uuid primary key default gen_random_uuid(),
  type       public.notebook_type not null default 'note',
  title      text,
  body       text,
  image_url  text,
  link       text,
  published  boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.works (
  id            uuid primary key default gen_random_uuid(),
  slug          text unique,     -- used by /library/[work] in Phase 2
  title         text not null,
  title_gu      text,
  author        text,
  description   text,
  status_label  text,            -- e.g. "Print edition in preparation"
  link          text,
  link_label    text,            -- e.g. "Read chapter by chapter"
  rights_status public.rights_status not null default 'permission_pending',
  upcoming      boolean not null default false,  -- "Next on the shelf" card
  -- The read link may only be shown when this is true.
  readable      boolean generated always as (rights_status in ('granted', 'public_domain')) stored,
  published     boolean not null default true,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table public.ideas (
  id         uuid primary key default gen_random_uuid(),
  name       text,
  email      text,
  category   public.idea_category not null default 'other',
  message    text not null check (char_length(message) between 1 and 5000),
  is_read    boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- triggers + RLS

do $$
declare
  t text;
begin
  foreach t in array array['site_text','desk_now','projects','books','reading','workshop','recordings','notebook','works']
  loop
    execute format(
      'create trigger set_updated_at before update on public.%I
         for each row execute function public.set_updated_at()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "admin manages %1$s" on public.%1$I
         for all to authenticated
         using ((select public.is_admin()))
         with check ((select public.is_admin()))', t);
  end loop;

  -- Published content is public.
  foreach t in array array['desk_now','projects','books','reading','workshop','recordings','notebook','works']
  loop
    execute format(
      'create policy "public reads published %1$s" on public.%1$I
         for select to anon, authenticated
         using (published)', t);
  end loop;
end;
$$;

create policy "public reads site_text" on public.site_text
  for select to anon, authenticated
  using (true);

-- Ideas: admin only. Visitors add ideas through the server, never directly.
alter table public.ideas enable row level security;

create policy "admin manages ideas" on public.ideas
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
