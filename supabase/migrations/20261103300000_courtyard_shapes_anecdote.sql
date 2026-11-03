-- What a contributor shares: one piece, a series (parts) or a book
-- (chapters). The contributor chooses in the form; Jaydeep can change it in
-- admin. A book's chapters are copy-protected and say "chapter"; a printed
-- book's credit and buy link (book_title etc.) stay admin-only.
alter table public.courtyard_series
  add column shape text not null default 'series' check (shape in ('series', 'book'));
update public.courtyard_series set shape = 'book' where book_title is not null;

-- "Anecdote / short story" becomes its own form, with its own filter.
alter table public.courtyard_submissions
  drop constraint courtyard_submissions_form_check,
  add constraint courtyard_submissions_form_check check (form in
    ('prose', 'anecdote', 'poetry', 'photography', 'music', 'video', 'art', 'tech', 'other'));
