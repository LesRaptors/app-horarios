INSERT INTO app_settings (key, value) VALUES (
  'scoring_weights',
  '{
    "sunday_penalty": 20,
    "saturday_penalty": 15,
    "night_penalty": 12,
    "holiday_penalty": 18,
    "block_continuation_bonus": 15,
    "fragmentation_penalty": 25,
    "clean_restart_bonus": 5,
    "position_primary_bonus": 100,
    "position_secondary_bonus": 30,
    "hour_deficit_multiplier": 10,
    "shift_deficit_multiplier": 5
  }'::jsonb
)
ON CONFLICT (key) DO NOTHING;
