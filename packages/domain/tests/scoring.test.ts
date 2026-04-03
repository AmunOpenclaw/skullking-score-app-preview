import { describe, expect, it } from "vitest";

import { scoreBase, scoreRascalWager } from "../src/scoring";

describe("scoreBase", () => {
  it("uses round number for successful zero bid", () => {
    expect(scoreBase(1, 0, 0)).toBe(10);
    expect(scoreBase(5, 0, 0)).toBe(50);
  });

  it("uses round number penalty for failed zero bid", () => {
    expect(scoreBase(3, 0, 1)).toBe(-30);
  });

  it("rewards exact non-zero bids", () => {
    expect(scoreBase(7, 3, 3)).toBe(60);
  });

  it("penalizes misses by tricks difference", () => {
    expect(scoreBase(7, 4, 2)).toBe(-20);
    expect(scoreBase(7, 2, 4)).toBe(-20);
  });
});

describe("scoreRascalWager", () => {
  it("returns 0 when no wager", () => {
    expect(scoreRascalWager(2, 2, 0)).toBe(0);
  });

  it("adds wager on exact bid", () => {
    expect(scoreRascalWager(2, 2, 10)).toBe(10);
    expect(scoreRascalWager(4, 4, 20)).toBe(20);
  });

  it("subtracts wager on missed bid", () => {
    expect(scoreRascalWager(2, 1, 10)).toBe(-10);
    expect(scoreRascalWager(4, 5, 20)).toBe(-20);
  });
});
