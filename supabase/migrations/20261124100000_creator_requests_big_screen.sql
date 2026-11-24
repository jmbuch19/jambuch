-- Creator's Space licence scope (docs/CREATORS_SPACE_BRIEF.md §3 "Where the work may be used",
-- §3B question 1b). Delivered work covers online and offline publishing only; film festival,
-- TV, cinema or game use needs the music replacement add-on before release.
alter table public.creator_requests
  add column big_screen text not null default 'no' check (big_screen in ('yes', 'no', 'unsure')),
  add column music_replacement boolean not null default false;
