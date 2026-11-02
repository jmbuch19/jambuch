-- Audio plays: a chapter performed with a cast, music and sound effects
-- (made with ElevenLabs on Jaydeep's PC, uploaded in admin → Listening), plus
-- the same performance without music and effects ("voice only"). They sit
-- beside the Azure recordings in chapter_audio; where one exists, readers hear
-- it instead of Azure, unless it is paused ("Use Azure instead").
alter table public.chapter_audio drop constraint if exists chapter_audio_voice_check;
alter table public.chapter_audio
  add constraint chapter_audio_voice_check check (voice in ('niranjan', 'dhwani', 'play', 'spoken'));

alter table public.chapter_audio add column if not exists paused boolean not null default false;
