import { type SupabaseClient, type User } from "@supabase/supabase-js";

import { buildEmptyEntry, normalizeState, type GameState } from "@/lib/domain";
import { getSupabaseBrowserClient } from "@/lib/supabase-client";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };
type ClientAndUser = { client: SupabaseClient; user: User };
type ClientAndGame = { client: SupabaseClient; gameId: string };

async function requireClientAndUser(): Promise<ClientAndUser | { error: string }> {
  const client = getSupabaseBrowserClient();
  if (!client) {
    return { error: "Supabase is not configured in this environment." };
  }

  const {
    data: { user },
    error,
  } = await client.auth.getUser();

  if (error) {
    return { error: error.message };
  }

  if (!user) {
    return { error: "Please sign in first." };
  }

  return { client, user };
}

async function getOrCreateActiveGameId(): Promise<ClientAndGame | { error: string }> {
  const base = await requireClientAndUser();
  if ("error" in base) {
    return base;
  }

  const { client, user } = base;

  await client.from("games").update({ status: "archived" }).eq("user_id", user.id).eq("status", "active");

  const { data: existing, error: existingError } = await client
    .from("games")
    .select("id")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingError) {
    return { error: existingError.message };
  }

  if (existing?.id) {
    const { error: activateError } = await client.from("games").update({ status: "active" }).eq("id", existing.id);
    if (activateError) {
      return { error: activateError.message };
    }
    return { client, gameId: existing.id };
  }

  const { data: inserted, error: insertError } = await client
    .from("games")
    .insert({ user_id: user.id, status: "active" })
    .select("id")
    .single();

  if (insertError || !inserted?.id) {
    return { error: insertError?.message ?? "Could not create active game." };
  }

  return { client, gameId: String(inserted.id) };
}

export async function saveGameStateToCloud(state: GameState): Promise<Result<null>> {
  const active = await getOrCreateActiveGameId();
  if ("error" in active) {
    return { ok: false, error: active.error };
  }

  const { client, gameId } = active;

  const { error: clearRoundsError } = await client.from("rounds").delete().eq("game_id", gameId);
  if (clearRoundsError) {
    return { ok: false, error: `Could not clear rounds: ${clearRoundsError.message}` };
  }

  const { error: clearPlayersError } = await client.from("game_players").delete().eq("game_id", gameId);
  if (clearPlayersError) {
    return { ok: false, error: `Could not clear players: ${clearPlayersError.message}` };
  }

  const playerRows = state.players.map((player, index) => ({
    game_id: gameId,
    player_order: index,
    display_name: player.name,
    source_library_player_id: null,
    is_active: player.active !== false,
    left_at_round: player.leftAtRound ?? null,
  }));

  const { data: insertedPlayers, error: playersError } = await client
    .from("game_players")
    .insert(playerRows)
    .select("id,player_order")
    .order("player_order", { ascending: true });

  if (playersError) {
    return { ok: false, error: `Could not save players: ${playersError.message}` };
  }

  const playersByOrder = [...(insertedPlayers ?? [])].sort((a, b) => a.player_order - b.player_order);

  const roundRows = state.rounds.map((round, index) => ({
    game_id: gameId,
    round_number: round.round ?? index + 1,
    cards: round.cards,
  }));

  let roundsByNumber = new Map<number, string>();
  if (roundRows.length > 0) {
    const { data: insertedRounds, error: roundsError } = await client
      .from("rounds")
      .insert(roundRows)
      .select("id,round_number")
      .order("round_number", { ascending: true });

    if (roundsError) {
      return { ok: false, error: `Could not save rounds: ${roundsError.message}` };
    }

    roundsByNumber = new Map((insertedRounds ?? []).map((round) => [round.round_number as number, round.id as string]));
  }

  const entryRows: Array<Record<string, number | string>> = [];
  state.rounds.forEach((round, roundIndex) => {
    const roundNumber = round.round ?? roundIndex + 1;
    const roundId = roundsByNumber.get(roundNumber);
    if (!roundId) return;

    state.players.forEach((_player, playerIndex) => {
      const player = playersByOrder[playerIndex];
      if (!player) return;
      const entry = round.entries[playerIndex] ?? buildEmptyEntry();

      entryRows.push({
        round_id: roundId,
        game_player_id: player.id,
        bid: entry.bid,
        won: entry.won,
        bonus: entry.bonus,
        rascal_wager: entry.rascalWager,
        rascal_score: entry.rascalScore,
        base: entry.base,
        round_score: entry.roundScore,
      });
    });
  });

  if (entryRows.length > 0) {
    const { error: entriesError } = await client.from("round_entries").insert(entryRows);
    if (entriesError) {
      return { ok: false, error: `Could not save round entries: ${entriesError.message}` };
    }
  }

  return { ok: true, data: null };
}

export async function loadGameStateFromCloud(): Promise<Result<GameState | null>> {
  const base = await requireClientAndUser();
  if ("error" in base) {
    return { ok: false, error: base.error };
  }

  const { client, user } = base;

  const { data: activeGame, error: gameError } = await client
    .from("games")
    .select("id")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (gameError) {
    return { ok: false, error: `Could not load game: ${gameError.message}` };
  }

  if (!activeGame?.id) {
    return { ok: true, data: null };
  }

  const gameId = String(activeGame.id);

  const { data: gamePlayers, error: playersError } = await client
    .from("game_players")
    .select("id,player_order,display_name,is_active,left_at_round")
    .eq("game_id", gameId)
    .order("player_order", { ascending: true });

  if (playersError) {
    return { ok: false, error: `Could not load players: ${playersError.message}` };
  }

  const players = (gamePlayers ?? []).map((row) => ({
    name: String(row.display_name ?? "Player"),
    total: 0,
    active: row.is_active !== false,
    leftAtRound: row.left_at_round ?? null,
  }));

  const playerIndexById = new Map((gamePlayers ?? []).map((row, index) => [String(row.id), index]));

  const { data: roundsData, error: roundsError } = await client
    .from("rounds")
    .select("id,round_number,cards")
    .eq("game_id", gameId)
    .order("round_number", { ascending: true });

  if (roundsError) {
    return { ok: false, error: `Could not load rounds: ${roundsError.message}` };
  }

  const rounds = (roundsData ?? []).map((row) => ({
    id: String(row.id),
    round: Number(row.round_number),
    cards: Number(row.cards),
    entries: players.map(() => buildEmptyEntry()),
  }));

  const roundIndexById = new Map(rounds.map((round, index) => [round.id, index]));

  if (rounds.length > 0) {
    const roundIds = rounds.map((round) => round.id);

    const { data: entriesData, error: entriesError } = await client
      .from("round_entries")
      .select("round_id,game_player_id,bid,won,bonus,rascal_wager,rascal_score,base,round_score")
      .in("round_id", roundIds);

    if (entriesError) {
      return { ok: false, error: `Could not load round entries: ${entriesError.message}` };
    }

    (entriesData ?? []).forEach((entry) => {
      const roundIndex = roundIndexById.get(String(entry.round_id));
      const playerIndex = playerIndexById.get(String(entry.game_player_id));
      if (roundIndex === undefined || playerIndex === undefined) return;

      rounds[roundIndex]!.entries[playerIndex] = {
        bid: Number(entry.bid ?? 0),
        won: Number(entry.won ?? 0),
        bonus: Number(entry.bonus ?? 0),
        rascalWager: Number(entry.rascal_wager ?? 0) as 0 | 10 | 20,
        rascalScore: Number(entry.rascal_score ?? 0),
        base: Number(entry.base ?? 0),
        roundScore: Number(entry.round_score ?? 0),
      };
    });
  }

  const normalized = normalizeState({
    version: 4,
    createdAt: Date.now(),
    players,
    rounds,
    nextCards: rounds.length > 0 ? rounds[rounds.length - 1]!.cards + 1 : 1,
  });

  return { ok: true, data: normalized };
}
