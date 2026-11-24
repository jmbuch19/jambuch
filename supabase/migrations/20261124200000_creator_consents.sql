-- Creator's Space consent record (docs/CREATORS_SPACE_BRIEF.md §7). One row per tick a
-- writer gives: which consent, the terms version and language shown, and when. Rows are
-- never updated or deleted by the app (a withdrawal would be a new row), so they stay
-- proof of what was agreed. No story text here.

create table public.creator_consents (
  id            bigint generated always as identity primary key,
  user_id       uuid not null references auth.users (id) on delete cascade,
  request_id    uuid references public.creator_requests (id) on delete cascade,
  order_id      uuid,
  kind          text not null check (kind in (
                  'terms_refund', 'rights_origin', 'data_processing', 'age_18',
                  'own_voice', 'publication_choice', 'plan_baseline', 'deletion_ack')),
  choice        text,                     -- e.g. 'download_only' / 'allow_publish' for publication_choice
  terms_version text not null,
  language      text not null check (language in ('en', 'gu', 'hi')),
  accepted_at   timestamptz not null default now()
);

create index creator_consents_request on public.creator_consents (request_id);
create index creator_consents_user on public.creator_consents (user_id, accepted_at desc);

alter table public.creator_consents enable row level security;

-- Writers see their own consents; the admin sees all. Writes only from the server.
create policy "creator consents: own or admin" on public.creator_consents
  for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin()));
