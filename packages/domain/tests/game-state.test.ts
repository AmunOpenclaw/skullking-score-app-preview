import { describe, expect, it } from "vitest";

import {
  addPlayer,
  addRound,
  buildEmptyEntry,
  createNewState,
  deleteRound,
  editRound,
  getActivePlayerIndices,
  getCurrentRoundNumber,
  leavePlayer,
  normalizeState,
  recomputePlayerTotals,
  returnPlayer,
  undoLastRound,
  type RoundEntry,
} from "../src/index";

function sampleEntry(values: Partial<RoundEntry>): RoundEntry {
  return {
    bid: 0,
    won: 0,
    bonus: 0,
    rascalWager: 0,
    rascalScore: 0,
    base: 0,
    roundScore: 0,
    ...values,
  };
}

describe("game state normalization", () => {
  it("returns null for invalid states", () => {
    expect(normalizeState(null)).toBeNull();
    expect(normalizeState({ players: [] })).toBeNull();
  });

  it("normalizes players, rounds and recomputes totals", () => {
    const state = normalizeState({
      createdAt: 123,
      players: [{ name: "  Mathéo  " }, { name: "", active: false, leftAtRound: -5 }],
      rounds: [
        {
          round: 1,
          cards: 1,
          entries: [{ bid: 0, won: 0 }, { bid: 1, won: 0, bonus: 10, rascalWager: 10 }],
        },
      ],
    });

    expect(state).not.toBeNull();
    expect(state?.players[0]).toMatchObject({ name: "Mathéo", active: true, leftAtRound: null });
    expect(state?.players[1]).toMatchObject({ name: "Player 2", active: false, leftAtRound: 1 });

    // player 1: successful zero bid in round 1 => +10
    expect(state?.players[0]?.total).toBe(10);
    // player 2: bid 1 won 0 => -10 base, +10 bonus, -10 rascal => -10 total
    expect(state?.players[1]?.total).toBe(-10);
    expect(state?.nextCards).toBe(2);
  });
});

describe("round operations parity", () => {
  it("adds a round and updates totals + nextCards", () => {
    const base = createNewState(["A", "B"], 111);

    const state = addRound(base, 3, [
      sampleEntry({ bid: 2, won: 2, base: 40, roundScore: 40 }),
      sampleEntry({ bid: 1, won: 2, base: -10, roundScore: -10 }),
    ]);

    expect(state.rounds).toHaveLength(1);
    expect(state.players.map((p) => p.total)).toEqual([40, -10]);
    expect(state.nextCards).toBe(4);
    expect(getCurrentRoundNumber(state)).toBe(2);
  });

  it("edits a round while preserving round number", () => {
    const base = addRound(createNewState(["A", "B"], 111), 2, [
      sampleEntry({ bid: 1, won: 1, base: 20, roundScore: 20 }),
      sampleEntry({ bid: 1, won: 0, base: -10, roundScore: -10 }),
    ]);

    const edited = editRound(base, 0, 5, [
      sampleEntry({ bid: 0, won: 1, base: -10, roundScore: -10 }),
      sampleEntry({ bid: 0, won: 0, base: 10, roundScore: 10 }),
    ]);

    expect(edited.rounds[0]?.round).toBe(1);
    expect(edited.rounds[0]?.cards).toBe(5);
    expect(edited.players.map((p) => p.total)).toEqual([-10, 10]);
    expect(edited.nextCards).toBe(6);
  });

  it("deletes a round and reindexes round numbers", () => {
    const withRounds = addRound(
      addRound(createNewState(["A", "B"], 111), 1, [sampleEntry({ roundScore: 5 }), sampleEntry({ roundScore: 1 })]),
      2,
      [sampleEntry({ roundScore: 7 }), sampleEntry({ roundScore: 3 })]
    );

    const afterDelete = deleteRound(withRounds, 0);

    expect(afterDelete.rounds).toHaveLength(1);
    expect(afterDelete.rounds[0]?.round).toBe(1);
    expect(afterDelete.players.map((p) => p.total)).toEqual([7, 3]);
    expect(afterDelete.nextCards).toBe(3);
  });

  it("undoes last round", () => {
    const withRounds = addRound(
      addRound(createNewState(["A", "B"], 111), 1, [sampleEntry({ roundScore: 5 }), sampleEntry({ roundScore: 1 })]),
      2,
      [sampleEntry({ roundScore: 7 }), sampleEntry({ roundScore: 3 })]
    );

    const afterUndo = undoLastRound(withRounds);

    expect(afterUndo.rounds).toHaveLength(1);
    expect(afterUndo.players.map((p) => p.total)).toEqual([5, 1]);
    expect(afterUndo.nextCards).toBe(2);
  });
});

describe("player transitions parity", () => {
  it("adds a player with empty entries in existing rounds", () => {
    const withOneRound = addRound(createNewState(["A"], 111), 1, [sampleEntry({ roundScore: 5 })]);
    const withNewPlayer = addPlayer(withOneRound, "B");

    expect(withNewPlayer.players).toHaveLength(2);
    expect(withNewPlayer.rounds[0]?.entries).toHaveLength(2);
    expect(withNewPlayer.rounds[0]?.entries[1]).toEqual(buildEmptyEntry());
  });

  it("marks player as left with current round number", () => {
    const state = createNewState(["A", "B", "C"], 111);
    const updated = leavePlayer(state, 1);

    expect(getActivePlayerIndices(updated)).toEqual([0, 2]);
    expect(updated.players[1]).toMatchObject({ active: false, leftAtRound: 1 });
  });

  it("prevents leaving when only one active player remains", () => {
    const state = leavePlayer(createNewState(["A", "B"], 111), 1);
    const unchanged = leavePlayer(state, 0);

    expect(unchanged).toBe(state);
    expect(getActivePlayerIndices(unchanged)).toEqual([0]);
  });

  it("returns player to active state", () => {
    const left = leavePlayer(createNewState(["A", "B"], 111), 1);
    const returned = returnPlayer(left, 1);

    expect(returned.players[1]).toMatchObject({ active: true, leftAtRound: null });
    expect(getActivePlayerIndices(returned)).toEqual([0, 1]);
  });
});

describe("recomputePlayerTotals", () => {
  it("rebuilds totals from round entries", () => {
    const normalized = normalizeState({
      players: [{ name: "A", total: 999 }, { name: "B", total: -999 }],
      rounds: [
        { round: 1, cards: 1, entries: [{ roundScore: 3 }, { roundScore: -2 }] },
        { round: 2, cards: 2, entries: [{ roundScore: 5 }, { roundScore: 8 }] },
      ],
    });

    const recomputed = recomputePlayerTotals(normalized!);
    expect(recomputed.players.map((p) => p.total)).toEqual([8, 6]);
  });
});
