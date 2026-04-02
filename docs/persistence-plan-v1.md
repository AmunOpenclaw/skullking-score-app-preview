# Persistence Plan v1 (Supabase)

Status: Draft (implementation-ready after open questions below are answered)
Branch: `feat/db-persistence-v1`

## 1) Objective
Move from browser-only persistence (`localStorage`) to Supabase-backed persistence so data survives browser resets and can sync across devices.

## 2) Scope (confirmed)
- Persist player library server-side.
- Persist game state server-side (players, rounds, entries, active/inactive status, edits, deletes).
- Keep current UX behavior (add/leave/return player, edit round, delete round, turn mode, etc.).

## 3) Open questions (needs your decision before coding)
1. **Auth method**: magic link email, GitHub OAuth, or both?
2. **Game visibility**: private per user only, or future sharing/collab?
3. **Delete behavior**: hard delete games/rounds immediately, or soft-delete/recoverable?
4. **Offline mode**: online-only v1, or keep local draft queue + sync when back online?

I can continue implementation in parallel, but these 4 decisions affect table fields and endpoint behavior.

---

## 4) Exact schema (proposed SQL)

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

-- 2) Games
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

### RLS (required)
All 5 tables must enforce: `auth.uid() = user_id` ownership (directly for games/player_library; via join for child tables).

---

## 5) Endpoint contracts (proposed)

> Proposed API style: Edge-function facade (`/api/v1/...`) in front of DB operations.
> If you prefer direct Supabase client calls only (no custom HTTP contracts), say so and I’ll swap this section.

## 5.1 Player library

### GET `/api/v1/player-library`
Response 200:
```json
{
  "players": [
    {"id":"uuid","name":"Alice","nameKey":"alice","isArchived":false,"createdAt":"...","updatedAt":"..."}
  ]
}
```

### POST `/api/v1/player-library`
Body:
```json
{"name":"Alice"}
```
Response 201:
```json
{"player":{"id":"uuid","name":"Alice","nameKey":"alice","isArchived":false}}
```
Errors: `409 name_exists`, `400 invalid_name`

### DELETE `/api/v1/player-library`
Body:
```json
{"playerIds":["uuid1","uuid2"]}
```
Response 200:
```json
{"deleted":2}
```

---

## 5.2 Games

### GET `/api/v1/games`
Query params: `limit`, `cursor`, `status`
Response 200:
```json
{"games":[{"id":"uuid","status":"active","updatedAt":"..."}],"nextCursor":null}
```

### POST `/api/v1/games`
Body:
```json
{
  "title": null,
  "players": [
    {"displayName":"Alice","sourceLibraryPlayerId":"uuid-or-null"},
    {"displayName":"Bob","sourceLibraryPlayerId":null}
  ]
}
```
Response 201:
```json
{"gameId":"uuid"}
```

### GET `/api/v1/games/:gameId`
Response 200:
```json
{
  "game":{"id":"uuid","status":"active","createdAt":"...","updatedAt":"..."},
  "players":[...],
  "rounds":[
    {"id":"uuid","roundNumber":1,"cards":1,"entries":[...]}
  ]
}
```

### DELETE `/api/v1/games/:gameId`
Response 200:
```json
{"deleted":true}
```

---

## 5.3 Rounds

### PUT `/api/v1/games/:gameId/rounds/:roundNumber`
Create or replace round payload (same shape for create/edit):
```json
{
  "cards": 5,
  "entries": [
    {
      "gamePlayerId":"uuid",
      "bid":2,
      "won":1,
      "bonus":20,
      "rascalWager":0,
      "rascalScore":0,
      "base":-10,
      "roundScore":10
    }
  ]
}
```
Response 200:
```json
{"saved":true}
```

### DELETE `/api/v1/games/:gameId/rounds/:roundNumber`
Response 200:
```json
{"deleted":true}
```

---

## 5.4 Game player state updates

### PATCH `/api/v1/games/:gameId/players/:gamePlayerId`
Body examples:
```json
{"isActive":false,"leftAtRound":7}
```
or
```json
{"isActive":true,"leftAtRound":null}
```
Response 200:
```json
{"updated":true}
```

---

## 6) Migration from localStorage (one-time)
1. On first authenticated load, if local game exists and no remote active game, prompt:
   - “Import local saved game + player library?”
2. If accepted:
   - import player library
   - create game, players, rounds, entries
3. Mark migration done locally (`skullking-migrated-v1 = true`).

---

## 7) Implementation phases
1. Supabase project setup + env wiring.
2. SQL migrations + RLS.
3. Repository abstraction (`local` + `supabase`).
4. API layer (or direct Supabase, based on your answer).
5. UI integration + loading/error states.
6. One-time import path.
7. QA + rollback path.

---

## 8) Acceptance criteria
- Player library persists across browser/device for same account.
- New game creation uses selectable saved players.
- Round create/edit/delete persists server-side.
- Mid-game add/leave/return persists server-side.
- Local import runs once and is safe/idempotent.
