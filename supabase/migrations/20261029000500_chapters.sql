-- Chapters of a translated work, read at /library/<slug>/<number>.
-- Visitors can read a chapter only when the chapter is published, its work is
-- published, and the work's rights are granted or public domain (works.readable).

create type public.chapter_status as enum ('ready', 'drafting', 'later');

create table public.chapters (
  id              uuid primary key default gen_random_uuid(),
  work_id         uuid not null references public.works (id) on delete cascade,
  number          int not null check (number > 0),
  title           text not null,              -- usually Gujarati
  title_original  text,                       -- the source chapter's title
  body            text,                       -- paragraphs separated by a blank line; "> " starts a pulled quote
  translator_note text,
  audio_url       text,                       -- read-aloud recording
  status          public.chapter_status not null default 'later',
  expected        text,                       -- shown while drafting, e.g. "Expected June"
  published       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (work_id, number)
);

create trigger set_updated_at before update on public.chapters
  for each row execute function public.set_updated_at();

alter table public.chapters enable row level security;

create policy "admin manages chapters" on public.chapters
  for all to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

-- Unfinished chapters are listed by title only: a drafting or later chapter
-- is visible to visitors only while its body is still empty.
create policy "public reads readable chapters" on public.chapters
  for select to anon, authenticated
  using (
    published
    and (status = 'ready' or coalesce(body, '') = '')
    and exists (
      select 1 from public.works w
      where w.id = work_id and w.published and w.readable
    )
  );

-- Desk items open their book.
update public.desk_now set link = '/library/chasing-the-monsoon'    where text like '%Chasing the Monsoon%';
update public.desk_now set link = '/library/ramayana'               where text like '%Ramayana%';
update public.desk_now set link = '/library/ratanbabu-and-that-man' where text like '%Ratanbabu%';
