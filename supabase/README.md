# Supabase setup (v1)

This folder contains SQL migrations for the Skull King app persistence layer.

## Files
- `migrations/0001_schema.sql` — tables, constraints, indexes, triggers
- `migrations/0002_rls.sql` — row-level security policies

## Apply (manual, SQL editor)
1. Open Supabase project SQL editor.
2. Run `0001_schema.sql`.
3. Run `0002_rls.sql`.

## Notes
- v1 is single-owner per game.
- Auth method is magic-link.
- Frontend uses Supabase anon key + URL.
- `service_role` key must never be used in frontend.
