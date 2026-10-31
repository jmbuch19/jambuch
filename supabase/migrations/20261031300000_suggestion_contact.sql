-- A suggestion may include the creator's email or WhatsApp number, so Jaydeep
-- can reach out personally. Optional, admin-only, never used automatically,
-- and cleared when the suggestion is declined.

alter table public.courtyard_submissions
  add column creator_contact text check (char_length(creator_contact) <= 320),
  add column creator_aware   boolean not null default false;  -- "They know I'm suggesting them"
