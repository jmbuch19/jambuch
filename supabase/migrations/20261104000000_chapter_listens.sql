-- Anonymous listening activity: one row per browser per chapter, like
-- chapter_reads (and with the same reader_id, so "read and listened" can be
-- matched without knowing who anyone is). No names, emails or addresses.
-- Written only by the server (which skips the admin); read only by the admin.
create table public.chapter_listens (
  chapter_id        uuid not null references public.chapters (id) on delete cascade,
  reader_id         uuid not null,
  work_id           uuid not null references public.works (id) on delete cascade,
  track             text,                        -- what was heard last: play / spoken / an Azure voice
  first_seen        timestamptz not null default now(),
  last_seen         timestamptz not null default now(),
  sessions          int not null default 1,      -- a new session after 30 quiet minutes
  listened_seconds  int not null default 0,      -- time actually heard (skipping ahead doesn't count)
  max_position      int not null default 0,      -- furthest point reached, in seconds
  duration          int,                         -- the episode's length, in seconds
  heard_minutes     int[] not null default '{}', -- which minutes of the episode were heard (drop-off curve)
  rewinds           int[] not null default '{}', -- where listeners jumped back more than 5 s (seconds)
  skips             int not null default 0,      -- jumps forward of more than 5 s
  speed_seconds     jsonb not null default '{}', -- seconds heard at each speed, e.g. {"1": 300, "1.25": 60}
  finished_at       timestamptz,                 -- reached 90% after hearing at least half
  device            text,
  primary key (chapter_id, reader_id)
);

create index chapter_listens_work_idx on public.chapter_listens (work_id);
create index chapter_listens_last_seen_idx on public.chapter_listens (last_seen);

alter table public.chapter_listens enable row level security;

create policy "admin reads listening stats" on public.chapter_listens
  for select to authenticated
  using ((select private.is_admin()));

-- One heartbeat from the player (every 15 s while playing, and on pause/close).
create or replace function public.record_listen(
  p_chapter uuid, p_reader uuid, p_track text, p_open boolean, p_listened int, p_position int,
  p_duration int, p_minutes int[], p_rewinds int[], p_skips int, p_speed jsonb, p_device text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  heard int := least(greatest(coalesce(p_listened, 0), 0), 120);
begin
  insert into public.chapter_listens
    (chapter_id, reader_id, work_id, track, listened_seconds, max_position, duration, heard_minutes,
     rewinds, skips, speed_seconds, device)
  select c.id, p_reader, c.work_id, p_track, heard, greatest(coalesce(p_position, 0), 0), p_duration,
         coalesce(p_minutes, '{}'), coalesce(p_rewinds[1:50], '{}'), greatest(coalesce(p_skips, 0), 0),
         coalesce(p_speed, '{}'), p_device
  from public.chapters c
  where c.id = p_chapter
  on conflict (chapter_id, reader_id) do update set
    sessions          = public.chapter_listens.sessions
                        + case when p_open and public.chapter_listens.last_seen < now() - interval '30 minutes' then 1 else 0 end,
    last_seen         = now(),
    track             = coalesce(excluded.track, public.chapter_listens.track),
    listened_seconds  = least(public.chapter_listens.listened_seconds + heard, 86400),
    max_position      = greatest(public.chapter_listens.max_position, excluded.max_position),
    duration          = coalesce(excluded.duration, public.chapter_listens.duration),
    heard_minutes     = (select coalesce(array_agg(distinct m order by m), '{}')
                         from unnest(public.chapter_listens.heard_minutes || excluded.heard_minutes) m
                         where m between 0 and 600),
    rewinds           = (public.chapter_listens.rewinds || excluded.rewinds)[1:300],
    skips             = least(public.chapter_listens.skips + excluded.skips, 10000),
    speed_seconds     = (select coalesce(jsonb_object_agg(k, coalesce((public.chapter_listens.speed_seconds ->> k)::int, 0)
                                                           + coalesce((excluded.speed_seconds ->> k)::int, 0)), '{}')
                         from jsonb_object_keys(public.chapter_listens.speed_seconds || excluded.speed_seconds) k),
    device            = coalesce(excluded.device, public.chapter_listens.device);

  -- Finished: reached 90% of the episode and actually heard at least half of it.
  update public.chapter_listens l
     set finished_at = now()
   where l.chapter_id = p_chapter and l.reader_id = p_reader and l.finished_at is null
     and l.duration > 0 and l.max_position >= 0.9 * l.duration and l.listened_seconds >= 0.5 * l.duration;
end;
$$;

-- Only the server (service role) may record listening.
revoke all on function public.record_listen(uuid, uuid, text, boolean, int, int, int, int[], int[], int, jsonb, text) from public, anon, authenticated;
grant execute on function public.record_listen(uuid, uuid, text, boolean, int, int, int, int[], int[], int, jsonb, text) to service_role;
