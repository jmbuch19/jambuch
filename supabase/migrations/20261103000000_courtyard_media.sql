-- Courtyard: audio stories and videos, chosen by the editor.
-- A contributor can say they'd welcome it (media_interest). Jaydeep shortlists
-- an approved piece, asks the creator by email, and makes it only after their
-- yes. When it's made, its link (audio or YouTube) shows on the piece.
--   media_stage: shortlisted → asked → agreed | declined → made
alter table public.courtyard_submissions
  add column media_interest    boolean not null default false,
  add column media_stage       text check (media_stage in ('shortlisted', 'asked', 'agreed', 'declined', 'made')),
  add column media_kind        text check (media_kind in ('audio', 'video', 'both')),
  add column media_note        text check (char_length(media_note) <= 2000),
  add column media_url         text check (char_length(media_url) <= 500),
  add column media_asked_at    timestamptz,
  add column media_answered_at timestamptz;

create index courtyard_submissions_media_idx on public.courtyard_submissions (media_stage)
  where media_stage is not null and deleted_at is null;
