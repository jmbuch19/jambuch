-- Courtyard rooms: the room is the invite row. The owner writes a few lines
-- about themselves on /courtyard/my-room; the room page shows them above
-- their work.
alter table public.courtyard_invites
  add column room_about text check (char_length(room_about) <= 2000);
