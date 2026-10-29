-- Logo and brand colour for each project card. Logos live in /public/logos
-- (copied from each site's own icon) or can be any image URL set in /admin.

alter table public.projects
  add column logo_url text,
  add column color text check (color is null or color ~ '^#[0-9A-Fa-f]{6}$');

-- Colours are each site's own theme-color.
update public.projects set logo_url = '/logos/edusaathiai.jpg',     color = '#0B1F3A' where name = 'EdUsaathiAI';
update public.projects set logo_url = '/logos/fixmysite.png',       color = '#0F6E56' where name = 'fixmysite';
update public.projects set logo_url = '/logos/neardear.svg',        color = '#0A5C3E' where name = 'NearDear';
update public.projects set logo_url = '/logos/jayhatkesh.png',      color = '#0E6B6B' where name = 'Jay Hatkesh';
update public.projects set logo_url = '/logos/edumeetup.svg',       color = '#1B5E7E' where name = 'EdUmeetup';
update public.projects set logo_url = '/logos/naadvidya.png',       color = '#8B1A1A' where name = 'Naadvidya';
update public.projects set logo_url = '/logos/dronagiriherbal.png', color = '#1F5C3A' where name = 'Dronagiri Herbal';
update public.projects set logo_url = '/logos/shivammedicare.png'                     where name = 'Shivam Medicare';

-- The seed had the name and domain misspelt.
update public.projects
set name = 'PaisaJag', domain = 'paisajag.in', url = 'https://paisajag.in',
    logo_url = '/logos/paisajag.png', color = '#C97B2A'
where name = 'PaisaJaag';

-- KanoonSathi is now part of EdUsaathiAI; EdUmeetup takes its place.
delete from public.projects where name = 'KanoonSathi';
update public.projects set project_group = 'mine', sort_order = 6, status = 'Live' where name = 'EdUmeetup';
