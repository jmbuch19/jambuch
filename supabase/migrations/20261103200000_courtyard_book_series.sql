-- Book series: a Courtyard series that serialises a printed book, chapter by
-- chapter. The book's credit line and the link to buy it are set by Jaydeep
-- in admin only; contributors never see or send these fields. A series with
-- a book title shows the credit on its page, a "buy the printed book" link,
-- and its chapters live only on the series page (with copy protection).
alter table public.courtyard_series
  add column book_title  text check (char_length(book_title) <= 200),
  add column book_credit text check (char_length(book_credit) <= 300),  -- e.g. "Published by …, 2024"
  add column book_url    text check (book_url ~ '^https://' and char_length(book_url) <= 500);

-- Book chapters are long, and Gujarati counts every vowel sign as a
-- character. Series parts may now hold up to 100,000; the form keeps single
-- pieces at 20,000.
alter table public.courtyard_submissions
  drop constraint courtyard_submissions_body_check,
  add constraint courtyard_submissions_body_check check (char_length(body) <= 100000);
