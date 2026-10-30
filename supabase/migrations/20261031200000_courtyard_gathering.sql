-- The Courtyard's weekly gathering. Approving a piece stamps it with the next
-- gathering time; the thread only shows pieces whose time has come, so they
-- appear together without any job having to flip them. A job every 15 minutes
-- (pg_cron, set up separately) sends each contributor their "your turn" note.

alter table public.courtyard_submissions
  add column gathering_at          timestamptz,   -- when it joins the thread
  add column gathering_notified_at timestamptz;   -- when its contributor was told

-- Pieces already published joined the thread when they were published.
update public.courtyard_submissions
set gathering_at = published_at, gathering_notified_at = published_at
where status = 'published' and gathering_at is null;

create index courtyard_submissions_gathering_idx on public.courtyard_submissions (gathering_at)
  where status = 'published' and deleted_at is null;

-- Default: Sundays at 7 pm IST. Changed from the admin.
insert into public.settings (key, value)
values ('courtyard.gathering', '{"weekday": 0, "time": "19:00"}')
on conflict (key) do nothing;
