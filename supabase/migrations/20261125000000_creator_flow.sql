-- Creator's Space: the guided question flow (docs/CREATORS_QUESTION_FLOW.md).
-- A request now starts as a draft at sign-in and moves step by step:
--   draft (stages 0–6) → screening → questions (stage 7) → plan (stage 8)
--   → submitted (plan approved; the free sample is made) → ordered (advance received)
-- `answers` holds only choices (ids and numbers). The story, free-text answers,
-- characters, follow-up answers, voice notes, pictures and the plan live in private R2
-- under creators/<request id>/, never in a table.

alter table public.creator_requests
  alter column name         set default '',
  alter column make         set default 'unsure',
  alter column length       set default 'medium',
  alter column story_sha256 set default '',
  alter column story_chars  set default 0;

alter table public.creator_requests drop constraint if exists creator_requests_state_check;
alter table public.creator_requests add constraint creator_requests_state_check
  check (state in ('draft', 'screening', 'questions', 'plan', 'submitted', 'ordered',
                   'needs_human', 'refused', 'withdrawn', 'closed'));

alter table public.creator_requests
  add column current_step     text,
  add column answers          jsonb not null default '{}'::jsonb,   -- choices only, no creative text
  add column claude_cost      jsonb not null default '{}'::jsonb,   -- per step: tokens and US$
  add column needs_human_why  text,                                 -- e.g. 'big_screen', 'claude_cap'
  add column quote            jsonb,                                -- price, advance, final, breakdown
  add column plan_version     integer not null default 0,
  add column plan_rounds      integer not null default 0,
  add column plan_approved_at timestamptz,
  add column order_pack_key   text,
  add column reminded_at      timestamptz,
  add column files_purged_at  timestamptz;                          -- all of creators/<id>/ deleted

-- Requests whose files were already deleted under the old rule (keys cleared) count as purged.
update public.creator_requests
   set files_purged_at = now()
 where story_key is null and sample_key is null and state in ('withdrawn', 'refused', 'closed');

create index creator_requests_drafts on public.creator_requests (updated_at) where state = 'draft';

-- Pricing engine rates (brief §5). Every number is editable in admin; these defaults
-- are the measured Ramayana rates (docs/pricing-calibration.md) and, where marked
-- in the admin page, assumptions for Jaydeep to confirm.
insert into public.settings (key, value, updated_at)
values (
  'creators.pricing',
  '{
    "inr_per_usd": 85,
    "credit_inr_per_1000": 14,
    "chars_per_minute": {"gu": 700, "hi": 800, "en": 850},
    "credits_per_char": {"plain": 0.48, "dramatised": 0.48},
    "retake": {"plain": 1.2, "dramatised": 1.25},
    "voice_factor_per_extra": 0.1,
    "credits_per_painting": 920,
    "paintings_per_still": 1.1,
    "seconds_per_still": {"standard": 50, "premium": 28},
    "hero_shots_premium": 3,
    "credits_per_motion_clip": 3000,
    "credits_per_effect": 0,
    "effects_per_minute": 2,
    "music_credits_per_minute": 0,
    "claude_steps": {
      "script_prep":  {"model": "claude-opus-5-5",  "input_per_1k": 1500, "output_per_1k": 1200, "batch": false},
      "directions":   {"model": "claude-opus-5-5",  "input_per_1k": 1500, "output_per_1k": 1500, "batch": false},
      "shot_list":    {"model": "claude-opus-5-5",  "input_per_1k": 2000, "output_per_1k": 800,  "batch": false},
      "translation":  {"model": "claude-opus-5-5",  "input_per_1k": 1200, "output_per_1k": 1500, "batch": false},
      "vision_check": {"model": "claude-haiku-5-5", "input_per_still": 3000, "output_per_still": 300, "batch": false}
    },
    "batch_multiplier": 0.5,
    "render_inr_per_minute": 5,
    "other_flat_inr": 20,
    "retry_buffer": 1.4,
    "review_hours": {
      "basic":    {"self_serve": 0.5, "assisted": 1.5},
      "standard": {"self_serve": 1.5, "assisted": 3},
      "premium":  {"self_serve": 4,   "assisted": 4}
    },
    "review_minutes_base": 12,
    "hourly_inr": 1000,
    "gateway_fee_rate": 0.0236,
    "minimum_inr": 999,
    "round_to": 99,
    "addons_inr": {"exclusive_voice": 1500, "own_voice": 500},
    "assisted_weekly_cap": 3
  }'::jsonb,
  now()
)
on conflict (key) do nothing;

-- The flow's own switches.
insert into public.settings (key, value, updated_at)
values (
  'creators.flow',
  '{
    "claude_cap_usd": 2,
    "voice_notes": false,
    "max_plan_rounds": 3,
    "max_followup_rounds": 2,
    "examples": {}
  }'::jsonb,
  now()
)
on conflict (key) do nothing;
