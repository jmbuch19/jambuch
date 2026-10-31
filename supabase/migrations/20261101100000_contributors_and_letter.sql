-- Returning contributors and the Sunday letter.
--   courtyard_contributors  people with an approved piece; each has a personal
--                           signed link for sharing more (no form to repeat)
--   courtyard_readers       people who asked for the Sunday letter (name + email,
--                           confirmed by email; deleted when they unsubscribe)
--   courtyard_letters       one row per gathering's letter, so it goes out once

create table public.courtyard_contributors (
  id           uuid primary key default gen_random_uuid(),
  email        text not null,
  name         text not null,
  city         text,
  link_version int not null default 1,       -- raising it kills older personal links
  link_sent_at timestamptz,                  -- throttles "get your link again"
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  deleted_by   uuid references auth.users (id) on delete set null
);
create unique index courtyard_contributors_email on public.courtyard_contributors (lower(email))
  where deleted_at is null;

create table public.courtyard_readers (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (char_length(name) <= 200),
  email        text not null,
  source       text,                          -- where they joined, e.g. "series page"
  confirmed_at timestamptz,                   -- letters go only to confirmed readers
  created_at   timestamptz not null default now()
);
create unique index courtyard_readers_email on public.courtyard_readers (lower(email));

create table public.courtyard_letters (
  id           uuid primary key default gen_random_uuid(),
  gathering_at timestamptz not null unique,   -- the scheduled gathering it belongs to
  status       text not null check (status in ('sending', 'sent', 'skipped')),
  recipients   int not null default 0,
  piece_ids    uuid[] not null default '{}',
  created_at   timestamptz not null default now(),
  sent_at      timestamptz
);

-- Which pieces have been in a letter. Pieces already on the thread are
-- counted as sent, so the first letter only carries what's new.
alter table public.courtyard_submissions add column letter_sent_at timestamptz;
update public.courtyard_submissions set letter_sent_at = now() where status = 'published';

insert into public.settings (key, value) values ('courtyard.letter', '{"auto": true}')
on conflict (key) do nothing;

do $$
declare
  t text;
begin
  foreach t in array array['courtyard_contributors', 'courtyard_readers', 'courtyard_letters']
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

create trigger set_updated_at before update on public.courtyard_contributors
  for each row execute function public.set_updated_at();
