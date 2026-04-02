-- Skull King - Supabase persistence v1
-- Schema only (tables, indexes, constraints, triggers)

create extension if not exists pgcrypto;

-- updated_at helper
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- 1) Player library (user-scoped)
create table if not exists public.player_library (
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

create index if not exists idx_player_library_user_id on public.player_library(user_id);
create index if not exists idx_player_library_user_archived on public.player_library(user_id, is_archived);

-- 2) Games (single owner in v1)
create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'active',
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint games_status_valid check (status in ('active', 'archived'))
);

create index if not exists idx_games_user_id on public.games(user_id);
create index if not exists idx_games_user_updated_at on public.games(user_id, updated_at desc);

-- 3) Players in game snapshot
create table if not exists public.game_players (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  player_order int not null,
  display_name text not null,
  source_library_player_id uuid references public.player_library(id) on delete set null,
  is_active boolean not null default true,
  left_at_round int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint game_players_order_non_negative check (player_order >= 0),
  constraint game_players_name_not_blank check (char_length(trim(display_name)) > 0),
  constraint game_players_left_at_round_valid check (left_at_round is null or left_at_round >= 1),
  constraint game_players_game_order_unique unique (game_id, player_order)
);

create index if not exists idx_game_players_game_id on public.game_players(game_id);

-- 4) Rounds
create table if not exists public.rounds (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  round_number int not null,
  cards int not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rounds_round_number_valid check (round_number >= 1),
  constraint rounds_cards_valid check (cards >= 1),
  constraint rounds_game_round_unique unique (game_id, round_number)
);

create index if not exists idx_rounds_game_id on public.rounds(game_id);

-- 5) Round entries
create table if not exists public.round_entries (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.rounds(id) on delete cascade,
  game_player_id uuid not null references public.game_players(id) on delete cascade,
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

create index if not exists idx_round_entries_round_id on public.round_entries(round_id);
create index if not exists idx_round_entries_game_player_id on public.round_entries(game_player_id);

-- updated_at triggers
create or replace trigger trg_player_library_updated_at
before update on public.player_library
for each row execute function set_updated_at();

create or replace trigger trg_games_updated_at
before update on public.games
for each row execute function set_updated_at();

create or replace trigger trg_game_players_updated_at
before update on public.game_players
for each row execute function set_updated_at();

create or replace trigger trg_rounds_updated_at
before update on public.rounds
for each row execute function set_updated_at();

create or replace trigger trg_round_entries_updated_at
before update on public.round_entries
for each row execute function set_updated_at();
