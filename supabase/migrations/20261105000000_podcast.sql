-- The Ramayana podcast (docs/00-Claude-Code-AV-Pipeline-System-Prompt.md §9.5).
-- One row per chapter that is, or may be, an episode. The GUID is written once
-- and never changed; first_published_at is set the first time the episode goes
-- out in a published feed and never changed after (it is the episode's pubDate).
-- The show's own details live in settings ("podcast.show").
create table public.podcast_episodes (
  chapter_id          uuid primary key references public.chapters (id) on delete cascade,
  guid                text not null unique,
  included            boolean not null default true,
  description         text not null default '',
  first_published_at  timestamptz
);

-- A GUID can never be edited once written.
create function private.podcast_guid_fixed() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.guid <> old.guid then raise exception 'a podcast GUID never changes'; end if;
  if old.first_published_at is not null and new.first_published_at is distinct from old.first_published_at then
    raise exception 'an episode''s first publish date never changes';
  end if;
  return new;
end $$;
create trigger podcast_guid_fixed before update on public.podcast_episodes
  for each row execute function private.podcast_guid_fixed();

alter table public.podcast_episodes enable row level security;
create policy "admin manages podcast episodes" on public.podcast_episodes
  for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
