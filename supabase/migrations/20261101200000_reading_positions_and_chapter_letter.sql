-- One-tap reading (installable app + resume).
--
-- 1. A signed-in member's place in each book, so "Continue reading" follows
--    them to any device. Anonymous readers keep theirs in the browser only.
create table if not exists public.reading_positions (
  user_id  uuid not null references auth.users (id) on delete cascade,
  work     text not null,              -- works.slug
  path     text not null,              -- /library/<work>/<chapter>
  title    text not null,
  book     text,
  para     int not null default 0 check (para >= 0),
  saved_at timestamptz not null default now(),
  primary key (user_id, work)
);

alter table public.reading_positions enable row level security;

create policy "members read their own positions" on public.reading_positions
  for select to authenticated using (user_id = (select auth.uid()));
create policy "members add their own positions" on public.reading_positions
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "members update their own positions" on public.reading_positions
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- 2. New chapters join the weekly letter ("Tell me when it's ready").
--    Chapters already readable today are marked as announced, so the first
--    letter doesn't list the whole library.
alter table public.chapters add column if not exists letter_sent_at timestamptz;
update public.chapters set letter_sent_at = now() where letter_sent_at is null and status = 'ready';
