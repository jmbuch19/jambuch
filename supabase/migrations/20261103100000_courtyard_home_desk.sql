-- "From the Courtyard": the guests' desk on the home page, next to "On my desk
-- now". It shows up to three approved, public pieces: the ones Jaydeep pins
-- first, then pieces from the latest gathering taking turns.
alter table public.courtyard_submissions
  add column home_pinned boolean not null default false;
