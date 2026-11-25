-- Creator's Space: the paid ₹499 sample (Jaydeep, 25 Nov 2026; replaces the free sample).
-- Flow: plan approved → 'sample_due' (waiting for the ₹499) → paid → 'submitted' (the sample
-- is made, checked and sent automatically) → advance → 'ordered'.

alter table public.creator_requests drop constraint if exists creator_requests_state_check;
alter table public.creator_requests add constraint creator_requests_state_check
  check (state in ('draft', 'screening', 'questions', 'plan', 'sample_due', 'submitted', 'ordered',
                   'needs_human', 'refused', 'withdrawn', 'closed'));

alter table public.creator_payments drop constraint if exists creator_payments_kind_check;
alter table public.creator_payments add constraint creator_payments_kind_check
  check (kind in ('sample', 'advance', 'final'));

-- Automatic sample quality check: what was measured, and how many fix-it re-checks a
-- story has had (max 3).
alter table public.creator_requests
  add column sample_qc  jsonb,
  add column rechecks   integer not null default 0;
