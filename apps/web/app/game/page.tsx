"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import {
  addRound,
  scoreBase,
  scoreRascalWager,
  undoLastRound,
  type GameState,
  type RascalWager,
  type RoundEntry,
} from "@/lib/domain";
import { useGameStateStore } from "@/lib/game-state-store";
import styles from "../shell.module.css";

type EntryDraft = {
  bid: string;
  won: string;
  bonus: string;
  rascalWager: RascalWager;
};

function toNonNegativeInt(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) return 0;
  return Math.max(0, parsed);
}

function createEmptyDraft(): EntryDraft {
  return { bid: "0", won: "0", bonus: "0", rascalWager: 0 };
}

function createRoundEntries(state: GameState, cards: string, drafts: EntryDraft[]): { cardsThisRound: number; entries: RoundEntry[] } {
  const cardsThisRound = Math.max(1, toNonNegativeInt(cards) || state.nextCards);
  const roundNumber = state.rounds.length + 1;

  const entries: RoundEntry[] = state.players.map((_player, index) => {
    const source = drafts[index] ?? createEmptyDraft();
    const bid = toNonNegativeInt(source.bid);
    const won = toNonNegativeInt(source.won);
    const bonus = Number.parseInt(source.bonus, 10) || 0;
    const rascalWager = source.rascalWager;
    const rascalScore = scoreRascalWager(bid, won, rascalWager);
    const base = scoreBase(roundNumber, bid, won);
    const roundScore = base + bonus + rascalScore;

    return {
      bid,
      won,
      bonus,
      rascalWager,
      rascalScore,
      base,
      roundScore,
    };
  });

  return { cardsThisRound, entries };
}

function RoundEntryForm({ state, onSave }: { state: GameState; onSave: (state: GameState) => void }) {
  const [cards, setCards] = useState(String(state.nextCards));
  const [entries, setEntries] = useState<EntryDraft[]>(() => state.players.map(() => createEmptyDraft()));

  const updateEntry = (index: number, patch: Partial<EntryDraft>) => {
    setEntries((prev) => prev.map((entry, idx) => (idx === index ? { ...entry, ...patch } : entry)));
  };

  const submitRound = () => {
    const round = createRoundEntries(state, cards, entries);
    onSave(addRound(state, round.cardsThisRound, round.entries));
  };

  return (
    <>
      <div className={styles.panel}>
        <p className={styles.label}>Cards this round</p>
        <input value={cards} onChange={(event) => setCards(event.target.value)} inputMode="numeric" style={{ width: "120px" }} />
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Player</th>
              <th>Bid</th>
              <th>Won</th>
              <th>Bonus</th>
              <th>Rascal</th>
            </tr>
          </thead>
          <tbody>
            {state.players.map((player, index) => {
              const draft = entries[index] ?? createEmptyDraft();
              return (
                <tr key={player.name}>
                  <td>{player.name}</td>
                  <td>
                    <input
                      value={draft.bid}
                      onChange={(event) => updateEntry(index, { bid: event.target.value })}
                      inputMode="numeric"
                    />
                  </td>
                  <td>
                    <input
                      value={draft.won}
                      onChange={(event) => updateEntry(index, { won: event.target.value })}
                      inputMode="numeric"
                    />
                  </td>
                  <td>
                    <input
                      value={draft.bonus}
                      onChange={(event) => updateEntry(index, { bonus: event.target.value })}
                      inputMode="numeric"
                    />
                  </td>
                  <td>
                    <select
                      value={String(draft.rascalWager)}
                      onChange={(event) =>
                        updateEntry(index, {
                          rascalWager: (Number.parseInt(event.target.value, 10) as RascalWager) || 0,
                        })
                      }
                    >
                      <option value="0">0</option>
                      <option value="10">10</option>
                      <option value="20">20</option>
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className={styles.actions}>
        <button type="button" className={styles.link} onClick={submitRound}>
          Save round
        </button>
      </div>
    </>
  );
}

export default function GamePage() {
  const [state, setGameState] = useGameStateStore();

  const sortedPlayers = useMemo(() => {
    if (!state) return [];
    return [...state.players].sort((a, b) => b.total - a.total);
  }, [state]);

  const undoRound = () => {
    if (!state) return;
    setGameState(undoLastRound(state));
  };

  if (!state) {
    return (
      <main className={styles.page}>
        <section className={styles.card}>
          <header className={styles.header}>
            <p className={styles.eyebrow}>Phase 2 · Game parity slice</p>
            <h1 className={styles.title}>No active game yet</h1>
            <p className={styles.subtitle}>Start a game from setup to begin round tracking.</p>
          </header>
          <div className={styles.actions}>
            <Link className={styles.link} href="/setup">
              Go to setup
            </Link>
            <Link className={styles.link} href="/">
              Home
            </Link>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <header className={styles.header}>
          <p className={styles.eyebrow}>Phase 2 · Game parity slice</p>
          <h1 className={styles.title}>Round entry</h1>
          <p className={styles.subtitle}>
            Round {state.rounds.length + 1} · {state.players.length} players · {state.rounds.length} rounds saved
          </p>
        </header>

        <RoundEntryForm
          key={`${state.rounds.length}:${state.players.length}:${state.nextCards}`}
          state={state}
          onSave={setGameState}
        />

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.link}
            onClick={undoRound}
            disabled={state.rounds.length === 0}
          >
            Undo last round
          </button>
          <Link className={styles.link} href="/history">
            History
          </Link>
          <Link className={styles.link} href="/setup">
            Setup
          </Link>
        </div>

        <div className={styles.grid}>
          {sortedPlayers.map((player, index) => (
            <article key={player.name} className={styles.panel}>
              <p className={styles.label}>#{index + 1}</p>
              <p className={styles.value}>{player.name}</p>
              <p className={styles.subtitle}>Total: {player.total}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
