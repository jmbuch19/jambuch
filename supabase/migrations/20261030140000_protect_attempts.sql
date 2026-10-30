-- Blocked copy / save / print attempts on chapter pages, counted anonymously
-- like chapter_reads: one row per browser, chapter and kind of attempt.

create table public.protect_attempts (
  chapter_id uuid not null references public.chapters (id) on delete cascade,
  reader_id  uuid not null,
  work_id    uuid not null references public.works (id) on delete cascade,
  kind       text not null check (kind in ('copy', 'select_all', 'save', 'print', 'right_click', 'drag', 'screenshot_key')),
  count      int not null default 0,
  first_at   timestamptz not null default now(),
  last_at    timestamptz not null default now(),
  primary key (chapter_id, reader_id, kind)
);

create index protect_attempts_work_idx on public.protect_attempts (work_id);

alter table public.protect_attempts enable row level security;

create policy "admin reads protect attempts" on public.protect_attempts
  for select to authenticated
  using ((select private.is_admin()));

-- p_counts: {"copy": 2, "print": 1, ...}; unknown kinds are ignored and each
-- count is capped, so one note can't inflate the numbers.
create or replace function public.record_attempts(p_chapter uuid, p_reader uuid, p_counts jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.protect_attempts (chapter_id, reader_id, work_id, kind, count)
  select c.id, p_reader, c.work_id, k.key, least(k.value::numeric, 50)::int
  from public.chapters c
  cross join lateral jsonb_each_text(p_counts) as k(key, value)
  where c.id = p_chapter
    and k.key in ('copy', 'select_all', 'save', 'print', 'right_click', 'drag', 'screenshot_key')
    and k.value ~ '^[0-9]{1,9}$'
  on conflict (chapter_id, reader_id, kind) do update set
    count   = least(public.protect_attempts.count + excluded.count, 100000),
    last_at = now();
$$;

revoke all on function public.record_attempts(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.record_attempts(uuid, uuid, jsonb) to service_role;
