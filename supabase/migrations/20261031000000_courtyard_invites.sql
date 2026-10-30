-- Courtyard (Phase 3): two-way contributions.
--   courtyard_invites      rooms Jaydeep offers (single-use, 14-day, email-bound links)
--   courtyard_submissions  what visitors send through /courtyard#contribute:
--                          a single piece, a room request, or a suggestion
-- Admin-only tables. Visitors only ever see approved single pieces, and only
-- through the server, which selects the safe columns (never email or IP).

create type public.invite_stage as enum (
  'invited', 'agreement_accepted', 'room_draft', 'needs_review', 'live',
  'paused', 'expired', 'revoked', 'left'
);

create type public.submission_kind as enum ('single_piece', 'room_request', 'suggestion');

-- unconfirmed: the sender hasn't clicked the email link yet (never shown in the admin)
create type public.submission_status as enum (
  'unconfirmed', 'new', 'published', 'invited', 'reached_out', 'declined'
);

create table public.courtyard_invites (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  email            text not null,             -- the guest must sign in with this address
  whatsapp         text,                      -- only for sending the link
  relation         text,                      -- cousin, colleague, friend…
  craft            text,
  room_slug        text unique check (room_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  note             text,                      -- personal note in the invite
  stage            public.invite_stage not null default 'invited',
  -- Only a hash of the current link's token is kept. Resend replaces it,
  -- revoke and acceptance clear it, so an old link can never work again.
  token_hash       text unique,
  sent_at          timestamptz,
  expires_at       timestamptz,
  accepted_at      timestamptz,
  accepted_user_id uuid references auth.users (id) on delete set null,
  terms_version    text,                      -- which wording of the 4 room terms was accepted
  submission_id    uuid,                      -- the room request or suggestion it came from
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz,
  deleted_by       uuid references auth.users (id) on delete set null
);

create index courtyard_invites_stage_idx on public.courtyard_invites (stage) where deleted_at is null;

create table public.courtyard_submissions (
  id                 uuid primary key default gen_random_uuid(),
  kind               public.submission_kind not null,
  status             public.submission_status not null default 'unconfirmed',
  name               text not null,           -- the sender (the suggester, for a suggestion)
  email              text not null,
  city               text,                    -- for the credit "by Name, City"
  category           text not null check (category in
                       ('writing', 'photography', 'music', 'art', 'tech', 'education', 'other')),
  -- single piece
  title              text,
  body               text check (char_length(body) <= 20000),
  file_url           text,                    -- r2-private:<key> until published, then the public link
  file_type          text,
  file_name          text,
  -- links: samples for a room request, a link for a piece or suggestion
  links              text[] not null default '{}' check (cardinality(links) <= 5),
  -- room request
  about              text check (char_length(about) <= 3000),
  -- suggestion
  creator_name       text,
  relation           text,                    -- how the creator knows Jaydeep
  why                text check (char_length(why) <= 3000),
  -- the two required ticks for pieces and room requests
  own_work           boolean not null default false,
  permission         boolean not null default false,
  confirm_token_hash text unique,
  confirmed_at       timestamptz,
  ip_hash            text,                    -- salted hash, for rate limits only
  published_at       timestamptz,
  invite_id          uuid references public.courtyard_invites (id) on delete set null,
  reply_text         text,                    -- the reply sent when declining
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz,
  deleted_by         uuid references auth.users (id) on delete set null,

  constraint single_piece_complete check (
    kind <> 'single_piece' or (
      title is not null and own_work and permission
      and (body is not null or file_url is not null or cardinality(links) > 0)
    )
  ),
  constraint room_request_complete check (
    kind <> 'room_request' or (about is not null and own_work and permission)
  ),
  constraint suggestion_complete check (
    kind <> 'suggestion' or (creator_name is not null and why is not null)
  )
);

create index courtyard_submissions_email_idx on public.courtyard_submissions (email, created_at);
create index courtyard_submissions_ip_idx on public.courtyard_submissions (ip_hash, created_at);
create index courtyard_submissions_status_idx on public.courtyard_submissions (status) where deleted_at is null;

alter table public.courtyard_invites
  add constraint courtyard_invites_submission_fk
  foreign key (submission_id) references public.courtyard_submissions (id) on delete set null;

-- Small admin settings, e.g. the yearly room limit.
create table public.settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);
insert into public.settings (key, value) values ('courtyard.room_limit_per_year', '5');

do $$
declare
  t text;
begin
  foreach t in array array['courtyard_invites', 'courtyard_submissions', 'settings']
  loop
    execute format(
      'create trigger set_updated_at before update on public.%I
         for each row execute function public.set_updated_at()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "admin manages %1$s" on public.%1$I
         for all to authenticated
         using ((select private.is_admin()))
         with check ((select private.is_admin()))', t);
  end loop;
end;
$$;
