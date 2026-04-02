# ADR 0001 — Adopt Supabase for Persistence v1

- Status: Proposed (awaiting open decisions)
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
- Supabase Auth for identity,
- RLS for per-user data isolation,
- app repository layer to isolate storage implementation.

## Why this decision
- Fastest path to ship with relational data + auth + policy model.
- Lower implementation complexity vs assembling Workers + D1 + external auth for v1.
- SQL model fits game/round/entry structure and edit/delete flows.

## Data model (exact entities)
- `player_library`
- `games`
- `game_players`
- `rounds`
- `round_entries`

(Full SQL contract is in `docs/persistence-plan-v1.md`.)

## API contract direction
Default direction: **HTTP facade** (`/api/v1/...`) wrapping DB operations.

### Pending confirmation
If you prefer direct Supabase client calls (no custom endpoint surface), we will replace endpoint contracts with repository-method contracts only.

## Security model
- Every persisted row belongs to an authenticated user.
- RLS enforces user ownership.
- Child-table access is restricted through parent game ownership.

## Migration strategy
One-time import from localStorage to Supabase after first login confirmation.

## Consequences
### Positive
- Durable data across browser/device.
- Cleaner long-term model for future features.
- Centralized auth + policy enforcement.

### Trade-offs
- Requires auth flow integration.
- Requires migration and sync states in UI.
- Introduces managed backend dependency.

## Open decisions (must confirm)
1. Auth provider(s): magic link, GitHub, or both.
2. Data deletion policy: hard delete vs soft delete.
3. API style: custom HTTP facade vs direct Supabase client.
4. Offline behavior for v1: online-only vs queued local sync.

## Implementation notes
- Keep repository abstraction so local fallback can remain for fail-safe and tests.
- Keep migration idempotent.
- Keep round writes “replace round atomically” to match current edit behavior.
