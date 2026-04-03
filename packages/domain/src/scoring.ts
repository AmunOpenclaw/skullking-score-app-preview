export function scoreBase(roundNumber: number, bid: number, won: number): number {
  if (bid === 0) {
    return won === 0 ? 10 * roundNumber : -10 * roundNumber;
  }

  if (won === bid) {
    return 20 * bid;
  }

  return -10 * Math.abs(won - bid);
}

export function scoreRascalWager(bid: number, won: number, wager: number): number {
  if (!wager) return 0;
  return won === bid ? wager : -wager;
}
