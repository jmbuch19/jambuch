-- Starting content copied from design/Main.dc.html. Everything here is
-- editable later from /admin. Placeholders from the mockup ([...]) are left out.

insert into public.site_text (key, en, gu) values
  ('hero.name',            'Jaydeep Buch', 'જયદીપ બૂચ'),
  ('hero.intro',           'I carry world literature into Gujarati, guide students toward study abroad, and build software for the causes I care about. From Ahmedabad.', ''),
  ('desk.title',           'On my desk now', ''),
  ('projects.title',       'Web projects', 'સર્જન'),
  ('projects.intro',       'Platforms I conceived and built, and a few I built for people I believe in.', ''),
  ('reading.title',        'Reading', 'વાચન'),
  ('translations.title',   'Translations', 'અનુવાદ'),
  ('translations.intro',   'Translating is how I live for a while inside another writer’s era and mind. These are the books I’ve lived in.', ''),
  ('workshop.title',       'The workshop', 'ચાલુ કામ'),
  ('workshop.intro',       'Unfinished on purpose. What’s on the bench, and how far along it is.', ''),
  ('advising.title',       'Study-abroad advising', 'માર્ગદર્શન'),
  ('advising.intro',       'Honest guidance for students and parents weighing an education abroad — from choosing where to apply to walking into the visa interview prepared.', ''),
  ('advising.credentials', E'Founder-Trustee, Indo American Education Society, Ahmedabad\nEducationUSA Adviser\nPresenter, “5 Steps to U.S. Study”', ''),
  ('advising.us.title',    'U.S. higher education', ''),
  ('advising.us.body',     'Undergraduate and graduate pathways: building a university list, tests, essays, funding and timelines.', ''),
  ('advising.visa.title',  'Student visa guidance', ''),
  ('advising.visa.body',   'Understanding the process, documents and what to expect at the interview — so you go in calm and truthful.', ''),
  ('advising.other.title', 'Other countries', ''),
  ('advising.other.body',  'Comparing destinations beyond the U.S., with costs and outcomes side by side.', ''),
  ('advising.cta_email',   '', ''),
  ('advising.fee_note',    '', ''),
  ('music.title',          'Music recordings', 'સંગીત'),
  ('ideas.title',          'Give me an idea', 'વિચાર'),
  ('ideas.intro',          'A book to translate, a problem worth an app, a civic itch nobody scratches. Several of my projects began as someone else’s passing remark.', ''),
  ('library.title',        'My library', 'ગ્રંથાલય'),
  ('library.intro',        'Around 1,000 books — classics, philosophy, history, and the Gujarati shelf. Starred books carry a note on why they stay.', ''),
  ('notebook.title',       'Notebook', 'નોંધપોથી'),
  ('notebook.intro',       'Poems, photographs, essays and whatever the next creative turn brings.', ''),
  ('footer.youtube',       'https://www.youtube.com/', 'Digital दिग्दर्शक'),
  ('footer.linkedin',      '', ''),
  ('footer.email',         '', '');

insert into public.desk_now (text, sort_order) values
  ('Translating Alexander Frater’s *Chasing the Monsoon*, instalment by instalment', 1),
  ('Readying my late uncle Nalinkant Chhaya’s Gujarati Ramayana for print', 2),
  ('Turning Satyajit Ray’s *Ratanbabu and That Man* into a film', 3);

insert into public.projects (name, domain, url, status, description, project_group, sort_order) values
  ('EdUsaathiAI', 'edusaathiai.in', 'https://edusaathiai.in', 'Live', 'An AI study companion for Indian students — subject Saathis that learn how each student thinks, at a price students can afford.', 'mine', 1),
  ('fixmysite', 'fixmysite.in', 'https://fixmysite.in', 'Live', 'A website health scanner for Indian small businesses. A free first scan, then a deep report on demand.', 'mine', 2),
  ('PaisaJaag', 'paisajaag.in', 'https://paisajaag.in', 'Live', 'Personal-finance awareness for Indian families, because wealth is lost in silence. Information, never advice.', 'mine', 3),
  ('NearDear', 'neardear.in', 'https://neardear.in', 'Phase 1', 'Verified human companions for elders living alone, starting in Ahmedabad and Gandhinagar.', 'mine', 4),
  ('Jay Hatkesh', 'jayhatkesh.in', 'https://jayhatkesh.in', 'Live', 'A heritage and community platform for the Nagar Brahmin community — a connector, never a cashier.', 'mine', 5),
  ('KanoonSathi', 'kanoonsathi.co.in', 'https://kanoonsathi.co.in', 'Module', 'A study companion for law students, co-created with an LLB student; now part of EdUsaathiAI.', 'mine', 6),
  ('EdUmeetup', 'edumeetup.com', 'https://edumeetup.com', null, 'Connects Indian students, international universities and Indian institutions. Built for IAES.', 'built_for_others', 1),
  ('IAES Fairs', 'fair.iaesgujarat.org', 'https://fair.iaesgujarat.org', null, 'Education-fair management for the Indo American Education Society.', 'built_for_others', 2),
  ('Naadvidya', 'naadvidya.com', 'https://naadvidya.com', null, 'Indian classical music lessons, run by my wife, Amee.', 'built_for_others', 3),
  ('Dronagiri Herbal', 'dronagiriherbal.in', 'https://dronagiriherbal.in', null, 'A direct-to-customer home for an Ayurvedic hair and skin care brand.', 'built_for_others', 4),
  ('SLK Tours', 'slktours.in', 'https://slktours.in', null, 'A travel agency site with bookings and a trilingual AI travel assistant.', 'built_for_others', 5),
  ('Shivam Medicare', 'shivammedicare.in', 'https://shivammedicare.in', null, 'Clinic management software, built as a gift for a doctor friend.', 'built_for_others', 6);

insert into public.workshop (kind, title, stage, sort_order) values
  ('Book', 'Gujarati Ramayana — print edition', 'Scholar review, second proofread', 1),
  ('Translation', 'Chasing the Monsoon', 'Drafting, published in instalments', 2),
  ('Film', 'Ratanbabu and That Man', 'Narration done · testing opening credits', 3),
  ('Video', 'Matheran in Mist — A Pluviophile’s Journey', 'In production for Digital दिग्दर्शक', 4),
  ('Platform', 'Shram Setu — village civic works', 'Prototype', 5),
  ('Archive', 'Cataloguing my library', 'Under way', 6);

-- Rights default to "permission pending": no read link shows until you set
-- granted / public domain in /admin.
insert into public.works (slug, title, title_gu, author, description, status_label, link, link_label, upcoming, sort_order) values
  ('ramayana', 'Ramayana', 'રામાયણ', 'C. Rajagopalachari', 'C. Rajagopalachari’s *Ramayana*, translated by Nalinkant Ishwarlal Chhaya; completed and edited by me after his passing. 75 chapters.', 'Print edition in preparation', null, null, false, 1),
  ('chasing-the-monsoon', 'Chasing the Monsoon', 'ચેસિંગ ધ મોન્સૂન', 'Alexander Frater', 'Alexander Frater’s *Chasing the Monsoon* — a pluviophile translating a pluviophile. Serialised since April 2024.', null, '/library/chasing-the-monsoon', 'Read chapter by chapter', false, 2),
  ('ratanbabu-and-that-man', 'Ratanbabu and That Man', null, 'Satyajit Ray', 'Satyajit Ray’s short story, translated and narrated — and now becoming an AI film.', null, null, 'Listen to the narration', false, 3),
  ('sultanas-dream', 'Sultana’s Dream', null, 'Rokeya Sakhawat Hossain', 'Rokeya Sakhawat Hossain’s 1905 feminist utopia. No Gujarati translation exists yet.', 'Next on the shelf', null, null, true, 4);
