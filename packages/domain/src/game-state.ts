import { scoreBase, scoreRascalWager } from "./scoring";

export const CURRENT_STATE_VERSION = 4;

export type RascalWager = 0 | 10 | 20;

export type RoundEntry = {
  bid: number;
  won: number;
  bonus: number;
  rascalWager: RascalWager;
  rascalScore: number;
  base: number;
  roundScore: number;
};

export type PlayerState = {
  name: string;
  total: number;
  active: boolean;
  leftAtRound: number | null;
};

export type RoundState = {
  round: number;
  cards: number;
  entries: RoundEntry[];
};

export type GameState = {
  version: number;
  createdAt: number;
  players: PlayerState[];
  rounds: RoundState[];
  nextCards: number;
};

function toInt(value: unknown): number {
  const n = Number.parseInt(String(value ?? "0"), 10);
  return Number.isNaN(n) ? 0 : n;
}

function toPositiveInt(value: unknown, fallback: number): number {
  return Math.max(1, toInt(value) || fallback);
}

function normalizeRascalWager(value: unknown): RascalWager {
  const intValue = toInt(value);
  return intValue === 10 || intValue === 20 ? intValue : 0;
}

function normalizeEntry(rawEntry: unknown, roundNumber: number): RoundEntry {
  const entry = rawEntry as Partial<RoundEntry> | undefined;

  const bid = Math.max(0, toInt(entry?.bid));
  const won = Math.max(0, toInt(entry?.won));
  const bonus = toInt(entry?.bonus);
  const rascalWager = normalizeRascalWager(entry?.rascalWager);
  const rascalScore =
    entry?.rascalScore !== undefined ? toInt(entry.rascalScore) : scoreRascalWager(bid, won, rascalWager);
  const base = entry?.base !== undefined ? toInt(entry.base) : scoreBase(roundNumber, bid, won);
  const roundScore = entry?.roundScore !== undefined ? toInt(entry.roundScore) : base + bonus + rascalScore;

  return {
    bid,
    won,
    bonus,
    rascalWager,
    rascalScore,
    base,
    roundScore,
  };
}

export function buildEmptyEntry(): RoundEntry {
  return {
    bid: 0,
    won: 0,
    bonus: 0,
    rascalWager: 0,
    rascalScore: 0,
    base: 0,
    roundScore: 0,
  };
}

export function createNewState(playerNames: string[], createdAt = Date.now()): GameState {
  return {
    version: CURRENT_STATE_VERSION,
    createdAt,
    players: playerNames.map((name) => ({ name, total: 0, active: true, leftAtRound: null })),
    rounds: [],
    nextCards: 1,
  };
}

export function getCurrentRoundNumber(state: GameState): number {
  return (state.rounds?.length ?? 0) + 1;
}

export function getActivePlayerIndices(state: GameState): number[] {
  return state.players.map((player, index) => (player.active ? index : -1)).filter((index) => index >= 0);
}

export function recomputePlayerTotals(state: GameState): GameState {
  const players = state.players.map((player) => ({ ...player, total: 0 }));

  state.rounds.forEach((round) => {
    round.entries.forEach((entry, index) => {
      const player = players[index];
      if (!player) return;
      player.total += toInt(entry.roundScore);
    });
  });

  return {
    ...state,
    players,
  };
}

export function normalizeState(raw: unknown, now = Date.now()): GameState | null {
  const source = raw as Partial<GameState> | undefined;
  if (!source?.players || !Array.isArray(source.players) || source.players.length === 0) {
    return null;
  }

  const players: PlayerState[] = source.players.map((player, index) => {
    const fallbackName = `Player ${index + 1}`;
    const name = String(player?.name || fallbackName).trim() || fallbackName;

    return {
      name,
      total: 0,
      active: player?.active !== false,
      leftAtRound: player?.leftAtRound ? toPositiveInt(player.leftAtRound, 1) : null,
    };
  });

  const sourceRounds = Array.isArray(source.rounds) ? source.rounds : [];
  const rounds: RoundState[] = sourceRounds.map((round, roundIndex) => {
    const roundNumber = toPositiveInt(round?.round, roundIndex + 1);
    const cards = toPositiveInt(round?.cards, roundNumber);

    return {
      round: roundNumber,
      cards,
      entries: players.map((_player, playerIndex) => normalizeEntry(round?.entries?.[playerIndex], roundNumber)),
    };
  });

  rounds.forEach((round) => {
    round.entries.forEach((entry, index) => {
      const player = players[index];
      if (!player) return;
      player.total += entry.roundScore;
    });
  });

  const fallbackCards = rounds.length > 0 ? rounds[rounds.length - 1]!.cards + 1 : 1;
  const nextCards = toPositiveInt(source.nextCards, fallbackCards);

  return {
    version: CURRENT_STATE_VERSION,
    createdAt: source.createdAt || now,
    players,
    rounds,
    nextCards,
  };
}

function withRecomputedNextCards(state: GameState): GameState {
  const lastCards = state.rounds.length > 0 ? state.rounds[state.rounds.length - 1]!.cards : 0;
  return {
    ...state,
    nextCards: Math.max(1, lastCards + 1),
  };
}

export function addRound(state: GameState, cards: number, entries: RoundEntry[]): GameState {
  const roundNumber = state.rounds.length + 1;
  const normalizedCards = Math.max(1, toInt(cards));

  const roundEntries = state.players.map((_player, index) => normalizeEntry(entries[index], roundNumber));

  const nextState: GameState = {
    ...state,
    rounds: [...state.rounds, { round: roundNumber, cards: normalizedCards, entries: roundEntries }],
  };

  return withRecomputedNextCards(recomputePlayerTotals(nextState));
}

export function editRound(state: GameState, roundIndex: number, cards: number, entries: RoundEntry[]): GameState {
  if (!state.rounds[roundIndex]) {
    return state;
  }

  const existingRound = state.rounds[roundIndex]!;
  const normalizedCards = Math.max(1, toInt(cards));
  const roundEntries = state.players.map((_player, index) => normalizeEntry(entries[index], existingRound.round));

  const rounds = state.rounds.map((round, index) =>
    index === roundIndex ? { round: round.round, cards: normalizedCards, entries: roundEntries } : round
  );

  const nextState: GameState = {
    ...state,
    rounds,
  };

  return withRecomputedNextCards(recomputePlayerTotals(nextState));
}

export function deleteRound(state: GameState, roundIndex: number): GameState {
  if (!state.rounds[roundIndex]) {
    return state;
  }

  const rounds = state.rounds
    .filter((_round, index) => index !== roundIndex)
    .map((round, index) => ({ ...round, round: index + 1 }));

  const nextState: GameState = {
    ...state,
    rounds,
  };

  return withRecomputedNextCards(recomputePlayerTotals(nextState));
}

export function undoLastRound(state: GameState): GameState {
  if (state.rounds.length === 0) {
    return state;
  }

  const nextState: GameState = {
    ...state,
    rounds: state.rounds.slice(0, -1),
  };

  return withRecomputedNextCards(recomputePlayerTotals(nextState));
}

export function addPlayer(state: GameState, name: string): GameState {
  const players = [...state.players, { name, total: 0, active: true, leftAtRound: null }];
  const rounds = state.rounds.map((round) => ({
    ...round,
    entries: [...round.entries, buildEmptyEntry()],
  }));

  return recomputePlayerTotals({
    ...state,
    players,
    rounds,
  });
}

export function leavePlayer(state: GameState, playerIndex: number): GameState {
  const activeCount = getActivePlayerIndices(state).length;
  const player = state.players[playerIndex];

  if (!player || !player.active || activeCount <= 1) {
    return state;
  }

  const nextRound = getCurrentRoundNumber(state);
  const players = state.players.map((p, index) =>
    index === playerIndex ? { ...p, active: false, leftAtRound: nextRound } : p
  );

  return {
    ...state,
    players,
  };
}

export function returnPlayer(state: GameState, playerIndex: number): GameState {
  const player = state.players[playerIndex];

  if (!player || player.active) {
    return state;
  }

  const players = state.players.map((p, index) => (index === playerIndex ? { ...p, active: true, leftAtRound: null } : p));

  return {
    ...state,
    players,
  };
}
