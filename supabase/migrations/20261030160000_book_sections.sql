-- Parts of a book outside the chapter numbering (preface, glossary...).
-- A row is either a numbered chapter (number set, section null) or a section
-- (section set, number null). Each section type appears once per book,
-- except the two "other" types. Order is fixed in src/lib/book-sections.ts.

alter table public.chapters
  alter column number drop not null,
  add column section text check (section in (
    'dedication', 'foreword', 'preface', 'acknowledgements', 'introduction', 'translators_note', 'prologue', 'other_before',
    'afterword', 'notes', 'glossary', 'appendix', 'bibliography', 'about_author', 'about_translator', 'other_after'
  )),
  -- The number this chapter had before renumbering, so old links still find it.
  add column legacy_number int;

alter table public.chapters
  add constraint chapters_number_or_section check ((number is null) <> (section is null));

create unique index chapters_one_section_per_book on public.chapters (work_id, section)
  where section is not null and section not in ('other_before', 'other_after');

-- Ramayana: the Preface leaves the numbering and chapters 2–19 become 1–18.
-- Done in two steps so no two rows ever share a number mid-update.
update public.chapters
set section = 'preface', number = null, legacy_number = 1
where work_id = (select id from public.works where slug = 'ramayana') and number = 1 and title = 'પ્રસ્તાવના';

update public.chapters
set legacy_number = number, number = number + 1000
where work_id = (select id from public.works where slug = 'ramayana') and number between 2 and 999;

update public.chapters
set number = number - 1001
where work_id = (select id from public.works where slug = 'ramayana') and number > 1000;
