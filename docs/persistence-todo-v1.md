# Persistence TODO (Supabase v1)

Branch: `feat/db-persistence-v1`

## Planning / alignment
- [x] Choose platform: Supabase
- [x] Choose auth: magic link
- [x] Choose client style: direct Supabase client calls
- [x] Choose delete policy for v1: hard delete
- [x] Choose offline mode for v1: online-only
- [x] Record future direction: collaboration/groups + stats later

## Implementation backlog
- [x] Create Supabase project and set real project keys in app config (`config.js`)
- [x] Add SQL migration for schema (`player_library`, `games`, `game_players`, `rounds`, `round_entries`)
- [x] Add RLS policies for all tables
- [x] Apply migrations to Supabase project
- [x] Add auth flow (magic-link sign-in/out + session restore)
- [x] Build persistence repository using direct Supabase client
- [x] Replace localStorage writes with repository calls
- [x] Replace localStorage reads with repository calls
- [ ] Add loading/error states for network operations
- [x] Add basic retry strategy for transient failures
- [ ] Add QA checklist for create/edit/delete rounds and player status updates
- [ ] Add manual cross-device verification checklist

## Deferred (explicitly out of v1)
- [ ] Offline support (draft queue + sync when back online)
- [ ] Soft delete migration (games/rounds/player library) with `deleted_at` strategy
- [ ] Collaboration groups (shared game visibility)
- [ ] Group membership and invitations
- [ ] Statistics layer per player
- [ ] Statistics layer per group

## Notes
- Security relies on Auth + RLS (not on hiding publishable key).
- `service_role` key must never be used in frontend.
