-- Problem points Jaydeep marks while listening to an audio play, and the fix
-- chosen for each. The fixes are settings: the audio engine on Jaydeep's PC
-- reads them when it rebuilds the episode, and the original voice lines are
-- never changed, so turning a fix off (active = false) undoes it.
create table public.audio_marks (
  id           uuid primary key default gen_random_uuid(),
  chapter_id   uuid not null references public.chapters (id) on delete cascade,
  at_seconds   numeric(8, 2) not null check (at_seconds >= 0),  -- where it was heard, in the live file
  note         text not null default '',
  fix          text check (fix in ('fade_in', 'fade_out', 'pause', 'crossfade')),
  length       numeric(5, 2) check (length > 0 and length <= 20),  -- seconds
  active       boolean not null default true,
  anchor       text,           -- written by the engine: which sound the fix belongs to
  built_at     numeric(8, 2),  -- written by the engine: where the point is in the rebuilt file
  created_at   timestamptz not null default now()
);
create index audio_marks_chapter_idx on public.audio_marks (chapter_id);

-- "Rebuild episode": asked for in admin, done on Jaydeep's PC.
create table public.audio_rebuilds (
  chapter_id    uuid primary key references public.chapters (id) on delete cascade,
  requested_at  timestamptz not null default now(),
  built_at      timestamptz  -- set by the engine when the new files are ready to upload
);

alter table public.audio_marks enable row level security;
alter table public.audio_rebuilds enable row level security;
create policy "admin manages audio marks" on public.audio_marks
  for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "admin manages audio rebuilds" on public.audio_rebuilds
  for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
