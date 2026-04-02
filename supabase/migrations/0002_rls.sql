-- Skull King - Supabase persistence v1
-- Row Level Security policies

alter table public.player_library enable row level security;
alter table public.games enable row level security;
alter table public.game_players enable row level security;
alter table public.rounds enable row level security;
alter table public.round_entries enable row level security;

-- Drop policies (idempotency)
drop policy if exists player_library_select_own on public.player_library;
drop policy if exists player_library_insert_own on public.player_library;
drop policy if exists player_library_update_own on public.player_library;
drop policy if exists player_library_delete_own on public.player_library;

drop policy if exists games_select_own on public.games;
drop policy if exists games_insert_own on public.games;
drop policy if exists games_update_own on public.games;
drop policy if exists games_delete_own on public.games;

drop policy if exists game_players_select_own_game on public.game_players;
drop policy if exists game_players_insert_own_game on public.game_players;
drop policy if exists game_players_update_own_game on public.game_players;
drop policy if exists game_players_delete_own_game on public.game_players;

drop policy if exists rounds_select_own_game on public.rounds;
drop policy if exists rounds_insert_own_game on public.rounds;
drop policy if exists rounds_update_own_game on public.rounds;
drop policy if exists rounds_delete_own_game on public.rounds;

drop policy if exists round_entries_select_own_game on public.round_entries;
drop policy if exists round_entries_insert_own_game on public.round_entries;
drop policy if exists round_entries_update_own_game on public.round_entries;
drop policy if exists round_entries_delete_own_game on public.round_entries;

-- PLAYER_LIBRARY
create policy player_library_select_own
on public.player_library for select
using (auth.uid() = user_id);

create policy player_library_insert_own
on public.player_library for insert
with check (auth.uid() = user_id);

create policy player_library_update_own
on public.player_library for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy player_library_delete_own
on public.player_library for delete
using (auth.uid() = user_id);

-- GAMES
create policy games_select_own
on public.games for select
using (auth.uid() = user_id);

create policy games_insert_own
on public.games for insert
with check (auth.uid() = user_id);

create policy games_update_own
on public.games for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy games_delete_own
on public.games for delete
using (auth.uid() = user_id);

-- GAME_PLAYERS (through owned game)
create policy game_players_select_own_game
on public.game_players for select
using (
  exists (
    select 1
    from public.games g
    where g.id = game_players.game_id
      and g.user_id = auth.uid()
  )
);

create policy game_players_insert_own_game
on public.game_players for insert
with check (
  exists (
    select 1
    from public.games g
    where g.id = game_players.game_id
      and g.user_id = auth.uid()
  )
);

create policy game_players_update_own_game
on public.game_players for update
using (
  exists (
    select 1
    from public.games g
    where g.id = game_players.game_id
      and g.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.games g
    where g.id = game_players.game_id
      and g.user_id = auth.uid()
  )
);

create policy game_players_delete_own_game
on public.game_players for delete
using (
  exists (
    select 1
    from public.games g
    where g.id = game_players.game_id
      and g.user_id = auth.uid()
  )
);

-- ROUNDS (through owned game)
create policy rounds_select_own_game
on public.rounds for select
using (
  exists (
    select 1
    from public.games g
    where g.id = rounds.game_id
      and g.user_id = auth.uid()
  )
);

create policy rounds_insert_own_game
on public.rounds for insert
with check (
  exists (
    select 1
    from public.games g
    where g.id = rounds.game_id
      and g.user_id = auth.uid()
  )
);

create policy rounds_update_own_game
on public.rounds for update
using (
  exists (
    select 1
    from public.games g
    where g.id = rounds.game_id
      and g.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.games g
    where g.id = rounds.game_id
      and g.user_id = auth.uid()
  )
);

create policy rounds_delete_own_game
on public.rounds for delete
using (
  exists (
    select 1
    from public.games g
    where g.id = rounds.game_id
      and g.user_id = auth.uid()
  )
);

-- ROUND_ENTRIES (through round -> game ownership)
create policy round_entries_select_own_game
on public.round_entries for select
using (
  exists (
    select 1
    from public.rounds r
    join public.games g on g.id = r.game_id
    where r.id = round_entries.round_id
      and g.user_id = auth.uid()
  )
);

create policy round_entries_insert_own_game
on public.round_entries for insert
with check (
  exists (
    select 1
    from public.rounds r
    join public.games g on g.id = r.game_id
    where r.id = round_entries.round_id
      and g.user_id = auth.uid()
  )
);

create policy round_entries_update_own_game
on public.round_entries for update
using (
  exists (
    select 1
    from public.rounds r
    join public.games g on g.id = r.game_id
    where r.id = round_entries.round_id
      and g.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.rounds r
    join public.games g on g.id = r.game_id
    where r.id = round_entries.round_id
      and g.user_id = auth.uid()
  )
);

create policy round_entries_delete_own_game
on public.round_entries for delete
using (
  exists (
    select 1
    from public.rounds r
    join public.games g on g.id = r.game_id
    where r.id = round_entries.round_id
      and g.user_id = auth.uid()
  )
);
