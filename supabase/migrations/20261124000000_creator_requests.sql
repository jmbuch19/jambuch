-- Creator's Space sample requests (docs/CREATORS_SPACE_BRIEF.md §6A "Safeguards").
-- One row per request from a signed-in writer. No creative text is kept here: the story
-- and the writer's answers travel only in the request itself and the email to the
-- studio. The row holds a fingerprint of the story, the screening result and the
-- vocabulary tags made from the writer's style answers.

create table public.creator_requests (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references auth.users (id) on delete cascade,
  email                text not null,
  name                 text not null,
  whatsapp             text,
  language             text not null,
  make                 text not null,
  length               text not null,
  story_sha256         text not null,
  story_chars          integer not null,
  -- screening: being screened · questions: follow-up questions shown · submitted: answers in,
  -- waiting for the studio · needs_human: borderline, Jaydeep decides · refused · withdrawn
  -- (by the writer) · closed (by the studio)
  state                text not null default 'screening'
                       check (state in ('screening', 'questions', 'submitted', 'needs_human', 'refused', 'withdrawn', 'closed')),
  screening_result     text check (screening_result in ('clear', 'needs_human', 'refused')),
  screening_categories text[] not null default '{}',
  screening_reason     text,
  style_tags           text[] not null default '{}',
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index creator_requests_user_created on public.creator_requests (user_id, created_at desc);
create index creator_requests_state on public.creator_requests (state, created_at desc);

alter table public.creator_requests enable row level security;

-- Writers see their own requests; the admin sees all. All writes go through the server
-- (service role), which checks the limits first, so there is no insert/update policy.
create policy "creator requests: own or admin" on public.creator_requests
  for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin()));
