-- Claude token prices for the Creator's Space pricing engine (docs/CREATORS_SPACE_BRIEF.md
-- §5 and §6G). Prices live here, never in the brief or the code. Checked against
-- https://platform.claude.com/docs/en/about-claude/pricing.md on 24 Nov 2026.
-- US dollars per million tokens. "batch_*" = Batch API (50% of standard). Batch and
-- prompt-caching discounts combine. Haiku 5.5 has a higher tier when a request's prompt
-- (all input tokens, cache reads and writes included) is over 100,000 tokens.
-- Re-check the page and update this row whenever prices change; the pricing engine
-- reads checked_at and admin shows it.

insert into public.settings (key, value, updated_at)
values (
  'creators.claude_prices',
  jsonb_build_object(
    'currency', 'USD',
    'unit', 'per_million_tokens',
    'source', 'https://platform.claude.com/docs/en/about-claude/pricing.md',
    'checked_at', '2026-11-24',
    'batch_multiplier', 0.5,
    'models', jsonb_build_object(
      'claude-opus-5-5', jsonb_build_object(
        'input', 4, 'output', 20, 'cache_write_5m', 5, 'cache_write_1h', 8, 'cache_read', 0.20,
        'batch_input', 2, 'batch_output', 10),
      'claude-sonnet-5-5', jsonb_build_object(
        'input', 2, 'output', 10, 'cache_write_5m', 2.50, 'cache_write_1h', 4, 'cache_read', 0.10,
        'batch_input', 1, 'batch_output', 5),
      'claude-haiku-5-5', jsonb_build_object(
        'input', 0.10, 'output', 0.50, 'cache_write_5m', 0.125, 'cache_write_1h', 0.20, 'cache_read', 0.01,
        'batch_input', 0.05, 'batch_output', 0.25,
        'long_prompt_over_tokens', 100000,
        'long_prompt', jsonb_build_object(
          'input', 0.50, 'output', 2.50, 'cache_write_5m', 0.625, 'cache_write_1h', 1, 'cache_read', 0.05,
          'batch_input', 0.25, 'batch_output', 1.25))
    )
  ),
  now()
)
on conflict (key) do update set value = excluded.value, updated_at = excluded.updated_at;
