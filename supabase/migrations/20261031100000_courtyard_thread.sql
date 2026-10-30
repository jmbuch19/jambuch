-- Courtyard, round 2 (design/Courtyard.dc.html):
--   * a new category, Heirlooms (family letters, recipes, songs, photographs)
--   * "The thread": a piece can pick up the thread from an earlier piece
--   * "Show it only to my family circle for now": stored, never shown publicly
--   * the WhatsApp number for "Just send it on WhatsApp", editable in Site text

alter table public.courtyard_submissions
  drop constraint courtyard_submissions_category_check;
alter table public.courtyard_submissions
  add constraint courtyard_submissions_category_check check (category in
    ('writing', 'photography', 'music', 'art', 'tech', 'education', 'heirlooms', 'other'));

alter table public.courtyard_submissions
  add column thread_from uuid references public.courtyard_submissions (id) on delete set null,
  add column family_only boolean not null default false;

create index courtyard_submissions_thread_from_idx on public.courtyard_submissions (thread_from);

insert into public.site_text (key, en, gu) values ('courtyard.whatsapp', '', '')
on conflict (key) do nothing;
