# ADR 0001 — Adopt Supabase for Persistence v1

- Status: Accepted for v1 planning
- Date: 2026-04-02
- Branch: `feat/db-persistence-v1`

## Context
Current persistence is local browser storage only. This causes:
- no cross-device sync,
- data loss risk if site storage is cleared,
- no server-side ownership/security model.

We need production persistence with low operational overhead.

## Decision
Use **Supabase** as the persistence platform for v1:
- Postgres as source of truth,
- Supabase Auth via **magic link**,
- strict RLS for per-user isolation,
- direct Supabase client calls from frontend,
- hard delete policy in v1,
- online-only behavior in v1.

## Clarification about keys and security
The frontend will use Supabase URL + public anon key.
This key is intentionally public; security comes from Auth + RLS.

The `service_role` key stays server-only and must never be shipped to client code.

## Why this decision
- Fastest path to ship with relational data + auth + policy model.
- Lower implementation complexity vs assembling Workers + D1 + separate auth for v1.
- SQL model fits game/round/entry structure and edit/delete flows.

## Data model (v1 entities)
- `player_library`
- `games`
- `game_players`
- `rounds`
- `round_entries`

(Exact schema and contracts are in `docs/persistence-plan-v1.md`.)

## Security model
- Every persisted row belongs to an authenticated user in v1.
- RLS enforces ownership on root tables and ownership via parent joins on child tables.

## Consequences
### Positive
- Durable data across browser/device.
- Cleaner long-term model for future features.
- No custom backend endpoint layer required for v1.

### Trade-offs
- Requires auth flow integration in frontend.
- Requires robust RLS policies before rollout.
- App is online-only in v1.

## Deferred decisions / later phases
- Collaboration model (groups/joins/shared visibility) is out of v1 scope but expected later.
- Stats layer (per-player and per-group) is out of v1 scope.
- Soft delete migration is deferred and tracked in TODO.

## Implementation notes
- Keep repository abstraction to allow adapter evolution.
- Keep round writes “replace round atomically” to match current edit behavior.
