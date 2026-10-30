-- Book page: an uploaded cover, a per-book translator credit for the cover,
-- and the number of chapters planned (so progress reads "4 of 75").

alter table public.works
  add column cover_url         text,
  add column translator_credit text,
  add column total_chapters    int check (total_chapters > 0);

-- The credit used to be the same line on every cover.
update public.works set translator_credit = 'અનુવાદ: જયદીપ બૂચ'
  where slug in ('chasing-the-monsoon', 'ratanbabu-and-that-man', 'sultanas-dream');
update public.works set total_chapters = 75 where slug = 'ramayana';
