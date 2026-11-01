-- Chapters read aloud (Azure neural voices), one recording per chapter per
-- voice. The MP3 lives on media.jambuch.in; listeners play that file and never
-- call Azure. Readers get these rows through the server only.
create table if not exists public.chapter_audio (
  chapter_id   uuid not null references public.chapters (id) on delete cascade,
  voice        text not null check (voice in ('niranjan', 'dhwani')),
  url          text not null,
  paragraph_ms int[] not null,          -- where each paragraph starts, for follow-along
  duration_ms  int not null,
  text_hash    text not null,           -- what was read; a different hash means "out of date"
  characters   int not null,            -- what Azure counted, for the cost estimate
  created_at   timestamptz not null default now(),
  primary key (chapter_id, voice)
);

alter table public.chapter_audio enable row level security;

create policy "admin manages chapter audio" on public.chapter_audio
  for all to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));
