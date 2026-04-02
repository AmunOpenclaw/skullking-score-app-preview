# Persistence Plan v1 (Supabase)

Status: Draft (decisions locked for v1, ready for implementation after your final review)
Branch: `feat/db-persistence-v1`

## 1) Objective
Move from browser-only persistence (`localStorage`) to Supabase-backed persistence so data survives browser resets and syncs across devices for the same account.

## 2) Decisions locked (from review)
- Auth: **Magic link**
- Data access style: **Direct Supabase client calls** (no custom API facade for v1)
- Delete policy: **Hard delete** for v1
- Offline mode: **Online-only** for v1
- Product direction: keep v1 user-private, but design so we can add **group collaboration** and **group/player statistics** later.

## 3) Security model for direct client calls
Direct client calls are secure **if RLS is strict**.

- Frontend uses:
  - `SUPABASE_URL`
  - **public publishable key** (safe to expose)
- Frontend never uses:
  - `service_role` key (server-only, never client, never git)

Security is enforced by:
- authenticated user session (magic-link JWT)
- RLS policies per table
- ownership checks through parent entities

---

## 4) Exact schema (v1)

```sql
-- Required extensions
create extension if not exists pgcrypto;

-- 1) Player library (global list per user)
create table if not exists player_library (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  name_key text not null,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint player_library_name_not_blank check (char_length(trim(name)) > 0),
  constraint player_library_name_key_not_blank check (char_length(trim(name_key)) > 0),
  constraint player_library_user_name_key_unique unique (user_id, name_key)
);

create index if not exists idx_player_library_user_id on player_library(user_id);
create index if not exists idx_player_library_user_archived on player_library(user_id, is_archived);

-- 2) Games (owned by one user in v1)
create table if not exists games (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'active',
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint games_status_valid check (status in ('active', 'archived'))
);

create index if not exists idx_games_user_id on games(user_id);
create index if not exists idx_games_user_updated_at on games(user_id, updated_at desc);

-- 3) Players inside a game
create table if not exists game_players (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id) on delete cascade,
  player_order int not null,
  display_name text not null,
  source_library_player_id uuid references player_library(id) on delete set null,
  is_active boolean not null default true,
  left_at_round int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint game_players_order_non_negative check (player_order >= 0),
  constraint game_players_name_not_blank check (char_length(trim(display_name)) > 0),
  constraint game_players_left_at_round_valid check (left_at_round is null or left_at_round >= 1),
  constraint game_players_game_order_unique unique (game_id, player_order)
);

create index if not exists idx_game_players_game_id on game_players(game_id);

-- 4) Rounds
create table if not exists rounds (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id) on delete cascade,
  round_number int not null,
  cards int not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rounds_round_number_valid check (round_number >= 1),
  constraint rounds_cards_valid check (cards >= 1),
  constraint rounds_game_round_unique unique (game_id, round_number)
);

create index if not exists idx_rounds_game_id on rounds(game_id);

-- 5) Round entries per game player
create table if not exists round_entries (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references rounds(id) on delete cascade,
  game_player_id uuid not null references game_players(id) on delete cascade,
  bid int not null default 0,
  won int not null default 0,
  bonus int not null default 0,
  rascal_wager int not null default 0,
  rascal_score int not null default 0,
  base int not null default 0,
  round_score int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint round_entries_bid_non_negative check (bid >= 0),
  constraint round_entries_won_non_negative check (won >= 0),
  constraint round_entries_rascal_wager_valid check (rascal_wager in (0, 10, 20)),
  constraint round_entries_round_player_unique unique (round_id, game_player_id)
);

create index if not exists idx_round_entries_round_id on round_entries(round_id);
create index if not exists idx_round_entries_game_player_id on round_entries(game_player_id);
```

### RLS requirements (mandatory)
- `player_library`: `auth.uid() = user_id`
- `games`: `auth.uid() = user_id`
- `game_players`, `rounds`, `round_entries`: user access only through owned parent game.

---

## 5) Direct-client contract (replaces HTTP endpoint contracts)

## 5.1 Repository surface
```ts
type PersistenceRepo = {
  // auth/session
  getSession(): Promise<Session | null>
  signInMagicLink(email: string): Promise<void>
  signOut(): Promise<void>

  // player library
  listPlayerLibrary(): Promise<PlayerLibraryItem[]>
  addPlayerLibrary(name: string): Promise<PlayerLibraryItem>
  deletePlayerLibrary(ids: string[]): Promise<void>

  // games
  createGame(input: CreateGameInput): Promise<{ gameId: string }>
  listGames(input: { limit?: number; cursor?: string; status?: 'active' | 'archived' }): Promise<ListGamesResult>
  loadGame(gameId: string): Promise<GameAggregate>
  deleteGame(gameId: string): Promise<void>

  // rounds
  upsertRound(input: UpsertRoundInput): Promise<void>
  deleteRound(input: { gameId: string; roundNumber: number }): Promise<void>

  // game player status
  updateGamePlayerStatus(input: {
    gameId: string
    gamePlayerId: string
    isActive: boolean
    leftAtRound: number | null
  }): Promise<void>
}
```

## 5.2 Data behavior contracts
- `upsertRound` is **replace-by-round-number** (idempotent for same payload).
- deleting a round hard-deletes it and subsequent UI re-numbers local display.
- deleting a game hard-deletes game + children.
- player library delete is hard delete (if referenced historically, `source_library_player_id` on game players can remain null due to `on delete set null`).

---

## 6) Implementation phases
1. Supabase project/config + env wiring.
2. SQL migrations + RLS policies.
3. Supabase repository implementation (direct client).
4. UI wiring from localStorage adapter to repository.
5. QA + error handling + rollback switches.

---

## 7) Acceptance criteria
- Player library persists across browser/device for same account.
- New game creation selects from persistent saved players (+ add/remove).
- Round create/edit/delete persists server-side.
- Mid-game add/leave/return persists server-side.
- App remains usable only when online (expected v1 behavior).

---

## 8) Future-ready notes (not in v1 scope)
- Collaboration/group model will be introduced later (shared game/group membership).
- Statistics later: per-player and per-group aggregate views.
- Soft delete migration is intentionally deferred (tracked in TODO list).
