-- Creator's Space: roles, not names (owner's decision, 26 Nov 2026).
-- The team: people with roles (admin, director, reviewer). Directed orders ("Varta Vishva
-- Directors") are assigned to a director; needs_human alerts go to the on-duty reviewer.
-- Until a row exists, the code falls back to ADMIN_EMAIL for every role.
-- Every opening of a writer's story by the team is logged.

create table public.creator_team (
  id                     uuid primary key default gen_random_uuid(),
  name                   text not null check (char_length(name) between 1 and 120),
  email                  text not null unique check (position('@' in email) > 1),
  roles                  text[] not null default '{}'
                         check (roles <@ array['admin', 'director', 'reviewer']::text[]),
  on_duty                boolean not null default false,  -- the reviewer who gets needs_human alerts
  hourly_inr             integer not null default 1000 check (hourly_inr between 0 and 100000),
  directing_since        date,                            -- weekly cap: 1 for the first month, then 2 (settings)
  confidentiality_signed date,                            -- no access and no assignment before this is set
  active                 boolean not null default true,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

alter table public.creator_team enable row level security;
create policy "creator team: admin" on public.creator_team
  for select to authenticated using ((select private.is_admin()));

-- The director of a directed order, and the hours they log for it.
alter table public.creator_requests
  add column director_id          uuid references public.creator_team (id) on delete set null,
  add column director_assigned_at timestamptz,
  add column director_hours       numeric(6,2) check (director_hours is null or director_hours between 0 and 500);
create index creator_requests_director on public.creator_requests (director_id) where director_id is not null;

-- Who opened a writer's story (or its plan, draft or files), when, and from where.
create table public.creator_story_access (
  id          bigint generated always as identity primary key,
  request_id  uuid not null references public.creator_requests (id) on delete cascade,
  who         text not null,               -- the team member's email
  role        text not null,               -- the role they acted in
  what        text not null,               -- 'request page', 'story download', 'order import', ...
  at          timestamptz not null default now()
);
create index creator_story_access_request on public.creator_story_access (request_id, at desc);
alter table public.creator_story_access enable row level security;
create policy "creator story access: admin" on public.creator_story_access
  for select to authenticated using ((select private.is_admin()));

-- "Assisted" is now "Varta Vishva Directors" (service id 'directed').
update public.creator_requests
   set answers = jsonb_set(answers, '{service}', '"directed"')
 where answers->>'service' = 'assisted';

-- Directed orders open in early January (after GST, lawyer-checked terms, the move to
-- vartavishva.in and Razorpay approval). Studio-made may open first.
update public.settings
   set value = value || jsonb_build_object(
         'directed', jsonb_build_object(
           'opens_on', '2027-01-04',
           'cap_first_month', 1,
           'cap_after', 2)),
       updated_at = now()
 where key = 'creators.flow';

-- The legal entity named on the terms, the privacy page and invoices. "We" in those texts
-- refers to it. GSTIN to be added; later the One Person Company.
insert into public.settings (key, value)
values ('creators.legal', jsonb_build_object(
  'entity', 'Varta Vishva, a business of Jaydeep Buch (proprietor)',
  'gstin', '',
  'address', '',
  'contact_email', ''))
on conflict (key) do nothing;
