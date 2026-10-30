-- 1. A chapter's picture is its own field and always shows at the top of the
--    chapter, so it can't land in the middle or at the end of the text.
--    Pictures already placed at the very start of a chapter move into it.

alter table public.chapters
  add column opening_image_url text,
  add column opening_caption   text;

update public.chapters
set opening_image_url = (regexp_match(body, '^\s*!\[([^\]]*)\]\((\S+)\)'))[2],
    opening_caption   = nullif(trim((regexp_match(body, '^\s*!\[([^\]]*)\]\((\S+)\)'))[1]), 'Caption'),
    body              = regexp_replace(body, '^\s*!\[[^\]]*\]\(\S+\)\s*', '')
where body ~ '^\s*!\[[^\]]*\]\(\S+\)';

-- 2. Anonymous reading activity: one row per browser per chapter.
--    reader_id is a random code kept in the reader's browser; no names,
--    emails or addresses are stored. Written only by the server (which skips
--    the admin); read only by the admin.

create table public.chapter_reads (
  chapter_id  uuid not null references public.chapters (id) on delete cascade,
  reader_id   uuid not null,
  work_id     uuid not null references public.works (id) on delete cascade,
  first_seen  timestamptz not null default now(),
  last_seen   timestamptz not null default now(),
  visits      int not null default 1,         -- a new visit after 30 quiet minutes
  seconds     int not null default 0,         -- active reading time
  finished_at timestamptz,                    -- reached the end after real reading
  device      text,                           -- phone / tablet / desktop
  theme       text,
  text_size   int,
  spacing     text,
  primary key (chapter_id, reader_id)
);

create index chapter_reads_work_idx on public.chapter_reads (work_id);
create index chapter_reads_first_seen_idx on public.chapter_reads (first_seen);

alter table public.chapter_reads enable row level security;

create policy "admin reads reading stats" on public.chapter_reads
  for select to authenticated
  using ((select private.is_admin()));

create or replace function public.record_read(
  p_chapter uuid, p_reader uuid, p_open boolean, p_seconds int, p_finished boolean,
  p_device text, p_theme text, p_size int, p_spacing text
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.chapter_reads
    (chapter_id, reader_id, work_id, seconds, finished_at, device, theme, text_size, spacing)
  select c.id, p_reader, c.work_id, least(greatest(p_seconds, 0), 120),
         case when p_finished then now() end, p_device, p_theme, p_size, p_spacing
  from public.chapters c
  where c.id = p_chapter
  on conflict (chapter_id, reader_id) do update set
    visits      = public.chapter_reads.visits
                  + case when p_open and public.chapter_reads.last_seen < now() - interval '30 minutes' then 1 else 0 end,
    last_seen   = now(),
    seconds     = least(public.chapter_reads.seconds + least(greatest(p_seconds, 0), 120), 86400),
    finished_at = coalesce(public.chapter_reads.finished_at, excluded.finished_at),
    device      = coalesce(excluded.device, public.chapter_reads.device),
    theme       = coalesce(excluded.theme, public.chapter_reads.theme),
    text_size   = coalesce(excluded.text_size, public.chapter_reads.text_size),
    spacing     = coalesce(excluded.spacing, public.chapter_reads.spacing);
$$;

-- Only the server (service role) may record reads.
revoke all on function public.record_read(uuid, uuid, boolean, int, boolean, text, text, int, text) from public, anon, authenticated;
grant execute on function public.record_read(uuid, uuid, boolean, int, boolean, text, text, int, text) to service_role;
