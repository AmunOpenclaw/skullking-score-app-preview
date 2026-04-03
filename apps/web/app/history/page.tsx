"use client";

import Link from "next/link";

import { deleteRound, undoLastRound } from "@/lib/domain";
import { useGameStateStore } from "@/lib/game-state-store";
import styles from "../shell.module.css";

export default function HistoryPage() {
  const [state, setGameState] = useGameStateStore();

  const removeRound = (index: number) => {
    if (!state) return;
    setGameState(deleteRound(state, index));
  };

  const undoRound = () => {
    if (!state) return;
    setGameState(undoLastRound(state));
  };

  if (!state) {
    return (
      <main className={styles.page}>
        <section className={styles.card}>
          <header className={styles.header}>
            <p className={styles.eyebrow}>Phase 2 · History parity slice</p>
            <h1 className={styles.title}>No saved history yet</h1>
            <p className={styles.subtitle}>Create rounds in the game view first.</p>
          </header>
          <div className={styles.actions}>
            <Link className={styles.link} href="/setup">
              Setup
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
          <p className={styles.eyebrow}>Phase 2 · History parity slice</p>
          <h1 className={styles.title}>Rounds history</h1>
          <p className={styles.subtitle}>
            {state.rounds.length} rounds tracked · {state.players.length} players
          </p>
        </header>

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Round</th>
                <th>Cards</th>
                {state.players.map((player) => (
                  <th key={player.name}>{player.name}</th>
                ))}
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {state.rounds.map((round, index) => (
                <tr key={round.round}>
                  <td>{round.round}</td>
                  <td>{round.cards}</td>
                  {round.entries.map((entry, entryIndex) => (
                    <td key={`${round.round}-${entryIndex}`}>{entry.roundScore}</td>
                  ))}
                  <td>
                    <button type="button" className={styles.link} onClick={() => removeRound(index)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className={styles.actions}>
          <button type="button" className={styles.link} onClick={undoRound} disabled={state.rounds.length === 0}>
            Undo last round
          </button>
          <Link className={styles.link} href="/game">
            Game
          </Link>
          <Link className={styles.link} href="/setup">
            Setup
          </Link>
        </div>
      </section>
    </main>
  );
}
