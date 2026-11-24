-- Creator's Space Phase 2a: automatic audio samples (docs/CREATORS_SPACE_BRIEF.md §6H).
-- The story now lives in the private R2 bucket (creators/<request id>/), not in email;
-- these columns point to it and track the sample. No creative text in the table.

alter table public.creator_requests
  add column story_key       text,          -- R2 private key of story.txt (null once deleted)
  add column sample_state    text check (sample_state in ('making', 'review', 'sent', 'failed')),
  add column sample_key      text,          -- R2 private key of the watermarked sample
  add column sample_credits  jsonb not null default '[]'::jsonb,  -- music/effects used: source, id, licence
  add column sample_cost     jsonb not null default '{}'::jsonb,  -- characters, tokens, seconds
  add column sample_error    text,
  add column sample_made_at  timestamptz,
  add column sample_sent_at  timestamptz,
  add column files_delete_at timestamptz;   -- when the daily job deletes this request's files

create index creator_requests_files_delete on public.creator_requests (files_delete_at)
  where story_key is not null or sample_key is not null;

-- Sample settings: voice and model for narration, the daily cap, and an on/off switch.
insert into public.settings (key, value, updated_at)
values (
  'creators.sample',
  jsonb_build_object(
    'enabled', true,
    'daily_cap', 5,
    'voice_id', '',
    'model_id', 'eleven_v3',
    'max_chars', 900
  ),
  now()
)
on conflict (key) do nothing;
