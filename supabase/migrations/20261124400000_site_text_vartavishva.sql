-- Editable rows for the વાર્તા વિશ્વ – Story Tube page (/vartavishva, later vartavishva.in).
-- Admin → Site text edits only rows that exist, so they are created here, empty. An empty
-- row means "use the page's default" (welcome texts, Spotify from the podcast) or "hide
-- the link" (Instagram, Facebook, WhatsApp). Links must start with https://.
-- featured_video: a YouTube link to show first; empty = the newest upload.
-- Adds rows only; existing rows are left untouched.

insert into public.site_text (key, en, gu) values
  ('vartavishva.featured_video', '', ''),
  ('vartavishva.welcome_gu', '', ''),
  ('vartavishva.welcome_en', '', ''),
  ('vartavishva.instagram', '', ''),
  ('vartavishva.facebook', '', ''),
  ('vartavishva.whatsapp', '', ''),
  ('vartavishva.spotify', '', '')
on conflict (key) do nothing;
