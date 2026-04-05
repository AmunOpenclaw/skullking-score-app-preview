"use client";

import Link from "next/link";
import { useState } from "react";

import { deleteRound, editRound, scoreBase, scoreRascalWager, undoLastRound, type RascalWager, type RoundEntry } from "@/lib/domain";
import { exportCsv, exportJson, shareSummary } from "@/lib/game-export";
import { useGameStateStore } from "@/lib/game-state-store";
import styles from "../shell.module.css";

type EntryDraft = {
  bid: string;
  won: string;
  bonus: string;
  rascalWager: RascalWager;
};

function createDraftFromEntry(entry: RoundEntry): EntryDraft {
  return {
    bid: String(entry.bid),
    won: String(entry.won),
    bonus: String(entry.bonus),
    rascalWager: entry.rascalWager,
  };
}

function toNonNegativeInt(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) return 0;
  return Math.max(0, parsed);
}

function createEmptyDraft(): EntryDraft {
  return { bid: "0", won: "0", bonus: "0", rascalWager: 0 };
}

function createEntryFromDraft(draft: EntryDraft, roundNumber: number): RoundEntry {
  const bid = toNonNegativeInt(draft.bid);
  const won = toNonNegativeInt(draft.won);
  const bonus = Number.parseInt(draft.bonus, 10) || 0;
  const rascalWager = draft.rascalWager;
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
}

export default function HistoryPage() {
  const [state, setGameState] = useGameStateStore();
  const [editingRoundIndex, setEditingRoundIndex] = useState<number | null>(null);
  const [editCards, setEditCards] = useState("1");
  const [editEntries, setEditEntries] = useState<EntryDraft[]>([]);
  const [shareMessage, setShareMessage] = useState<string | null>(null);

  const removeRound = (index: number) => {
    if (!state) return;
    setGameState(deleteRound(state, index));
    if (editingRoundIndex === index) {
      setEditingRoundIndex(null);
      setEditEntries([]);
      setEditCards("1");
    }
  };

  const undoRound = () => {
    if (!state) return;
    setGameState(undoLastRound(state));
    setEditingRoundIndex(null);
  };

  const beginEdit = (index: number) => {
    if (!state) return;
    const round = state.rounds[index];
    if (!round) return;

    setEditingRoundIndex(index);
    setEditCards(String(round.cards));
    setEditEntries(round.entries.map((entry) => createDraftFromEntry(entry)));
  };

  const cancelEdit = () => {
    setEditingRoundIndex(null);
    setEditEntries([]);
    setEditCards("1");
  };

  const updateEditEntry = (index: number, patch: Partial<EntryDraft>) => {
    setEditEntries((prev) => prev.map((entry, idx) => (idx === index ? { ...entry, ...patch } : entry)));
  };

  const saveEdit = () => {
    if (!state || editingRoundIndex === null) return;

    const round = state.rounds[editingRoundIndex];
    if (!round) return;

    const cardsThisRound = Math.max(1, toNonNegativeInt(editCards) || round.cards);
    const wonTotal = state.players.reduce((sum, _player, index) => sum + toNonNegativeInt(editEntries[index]?.won ?? "0"), 0);
    if (wonTotal !== cardsThisRound) {
      const proceed = window.confirm(
        `Heads-up: tricks won total is ${wonTotal}, but cards this round is ${cardsThisRound}.\n\nSave anyway?`
      );
      if (!proceed) return;
    }

    const roundEntries = state.players.map((_player, index) =>
      createEntryFromDraft(editEntries[index] ?? createEmptyDraft(), round.round)
    );

    setGameState(editRound(state, editingRoundIndex, cardsThisRound, roundEntries));
    cancelEdit();
  };

  const onExportCsv = () => {
    if (!state) return;
    exportCsv(state);
  };

  const onExportJson = () => {
    if (!state) return;
    exportJson(state);
  };

  const onShareSummary = async () => {
    if (!state) return;
    const result = await shareSummary(state);
    if (!result.ok) {
      setShareMessage(`Share failed: ${result.error}`);
      return;
    }

    setShareMessage("Summary shared (or copied) successfully.");
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
              {state.rounds.map((round, index) => {
                const isEditing = editingRoundIndex === index;

                return (
                  <tr data-testid={`history-round-${index}`} key={round.round}>
                    <td>{round.round}</td>
                    <td>
                      {isEditing ? (
                        <input
                          data-testid="history-edit-cards"
                          value={editCards}
                          onChange={(event) => setEditCards(event.target.value)}
                          inputMode="numeric"
                        />
                      ) : (
                        round.cards
                      )}
                    </td>
                    {state.players.map((player, playerIndex) => {
                      if (!isEditing) {
                        return <td key={`${round.round}-${player.name}`}>{round.entries[playerIndex]?.roundScore ?? 0}</td>;
                      }

                      const draft = editEntries[playerIndex] ?? createEmptyDraft();

                      return (
                        <td key={`${round.round}-${player.name}`}>
                          <div className={styles.historyEditCell}>
                            <input
                              data-testid={`history-edit-bid-${playerIndex}`}
                              value={draft.bid}
                              onChange={(event) => updateEditEntry(playerIndex, { bid: event.target.value })}
                              inputMode="numeric"
                              placeholder="B"
                              title="Bid"
                            />
                            <input
                              data-testid={`history-edit-won-${playerIndex}`}
                              value={draft.won}
                              onChange={(event) => updateEditEntry(playerIndex, { won: event.target.value })}
                              inputMode="numeric"
                              placeholder="W"
                              title="Won"
                            />
                            <input
                              data-testid={`history-edit-bonus-${playerIndex}`}
                              value={draft.bonus}
                              onChange={(event) => updateEditEntry(playerIndex, { bonus: event.target.value })}
                              inputMode="numeric"
                              placeholder="Bo"
                              title="Bonus"
                            />
                            <select
                              data-testid={`history-edit-rascal-${playerIndex}`}
                              value={String(draft.rascalWager)}
                              onChange={(event) =>
                                updateEditEntry(playerIndex, {
                                  rascalWager: (Number.parseInt(event.target.value, 10) as RascalWager) || 0,
                                })
                              }
                              title="Rascal"
                            >
                              <option value="0">R0</option>
                              <option value="10">R10</option>
                              <option value="20">R20</option>
                            </select>
                          </div>
                        </td>
                      );
                    })}
                    <td>
                      <div className={styles.actions}>
                        {isEditing ? (
                          <>
                            <button data-testid={`history-save-round-${index}`} type="button" className={styles.link} onClick={saveEdit}>
                              Save
                            </button>
                            <button data-testid={`history-cancel-round-${index}`} type="button" className={styles.link} onClick={cancelEdit}>
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              data-testid={`history-edit-round-${index}`}
                              type="button"
                              className={styles.link}
                              onClick={() => beginEdit(index)}
                            >
                              Edit
                            </button>
                            <button
                              data-testid={`history-delete-round-${index}`}
                              type="button"
                              className={styles.link}
                              onClick={() => removeRound(index)}
                            >
                              Delete
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className={styles.actions}>
          <button type="button" className={styles.link} onClick={undoRound} disabled={state.rounds.length === 0}>
            Undo last round
          </button>
          <button data-testid="history-export-csv" type="button" className={styles.link} onClick={onExportCsv}>
            Export CSV
          </button>
          <button data-testid="history-export-json" type="button" className={styles.link} onClick={onExportJson}>
            Export JSON
          </button>
          <button data-testid="history-share-summary" type="button" className={styles.link} onClick={() => void onShareSummary()}>
            Share summary
          </button>
          <Link className={styles.link} href="/game">
            Game
          </Link>
          <Link className={styles.link} href="/setup">
            Setup
          </Link>
        </div>

        {shareMessage ? <p className={styles.subtitle}>{shareMessage}</p> : null}
      </section>
    </main>
  );
}
