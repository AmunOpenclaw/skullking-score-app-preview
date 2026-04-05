"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import {
  addPlayer,
  addRound,
  getActivePlayerIndices,
  leavePlayer,
  returnPlayer,
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

type EntryMode = "grid" | "turn";

function toNonNegativeInt(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) return 0;
  return Math.max(0, parsed);
}

function createEmptyDraft(): EntryDraft {
  return { bid: "0", won: "0", bonus: "0", rascalWager: 0 };
}

function normalizePlayerName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
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

function RoundEntryForm({ state, onSave }: { state: GameState; onSave: (state: GameState) => void }) {
  const [cards, setCards] = useState(String(state.nextCards));
  const [entries, setEntries] = useState<EntryDraft[]>(() => state.players.map(() => createEmptyDraft()));
  const [entryMode, setEntryMode] = useState<EntryMode>("grid");
  const [turnPlayerIndex, setTurnPlayerIndex] = useState(0);
  const [showInactive, setShowInactive] = useState(false);

  const cardsThisRound = Math.max(1, toNonNegativeInt(cards) || state.nextCards);
  const wonTotal = state.players.reduce((sum, _player, index) => sum + toNonNegativeInt(entries[index]?.won ?? "0"), 0);
  const hasWonMismatch = wonTotal !== cardsThisRound;

  const visibleIndices = useMemo(
    () =>
      state.players
        .map((player, index) => (showInactive || player.active ? index : -1))
        .filter((index) => index >= 0),
    [showInactive, state.players]
  );

  const fallbackVisible = visibleIndices[0] ?? 0;
  const effectiveTurnPlayer = visibleIndices.includes(turnPlayerIndex) ? turnPlayerIndex : fallbackVisible;
  const currentTurnPosition = Math.max(0, visibleIndices.indexOf(effectiveTurnPlayer));

  const rowsToRender = entryMode === "grid" ? visibleIndices : [effectiveTurnPlayer];

  const updateEntry = (index: number, patch: Partial<EntryDraft>) => {
    setEntries((prev) => prev.map((entry, idx) => (idx === index ? { ...entry, ...patch } : entry)));
  };

  const submitRound = () => {
    if (hasWonMismatch) {
      const proceed = window.confirm(
        `Heads-up: tricks won total is ${wonTotal}, but cards this round is ${cardsThisRound}.\n\nSave anyway?`
      );
      if (!proceed) return;
    }

    const roundNumber = state.rounds.length + 1;
    const roundEntries: RoundEntry[] = state.players.map((_player, index) =>
      createEntryFromDraft(entries[index] ?? createEmptyDraft(), roundNumber)
    );

    onSave(addRound(state, cardsThisRound, roundEntries));
  };

  const prevPlayer = () => {
    if (!visibleIndices.length) return;
    const next = (currentTurnPosition - 1 + visibleIndices.length) % visibleIndices.length;
    setTurnPlayerIndex(visibleIndices[next]!);
  };

  const nextPlayer = () => {
    if (!visibleIndices.length) return;
    const next = (currentTurnPosition + 1) % visibleIndices.length;
    setTurnPlayerIndex(visibleIndices[next]!);
  };

  return (
    <>
      <div className={styles.controlGrid}>
        <div className={styles.panel}>
          <p className={styles.label}>Cards this round</p>
          <input
            data-testid="game-cards-input"
            value={cards}
            onChange={(event) => setCards(event.target.value)}
            inputMode="numeric"
            style={{ width: "120px" }}
          />
          <p className={styles.subtitle}>Won total: {wonTotal}</p>
          {hasWonMismatch ? <p className={styles.statusWarn}>Warning: won total does not match cards.</p> : null}
        </div>

        <div className={styles.panel}>
          <p className={styles.label}>Entry mode</p>
          <div className={styles.actions}>
            <button
              data-testid="game-mode-grid"
              type="button"
              className={styles.link}
              onClick={() => setEntryMode("grid")}
              disabled={entryMode === "grid"}
            >
              Grid
            </button>
            <button
              data-testid="game-mode-turn"
              type="button"
              className={styles.link}
              onClick={() => setEntryMode("turn")}
              disabled={entryMode === "turn"}
            >
              Turn
            </button>
            <button data-testid="game-toggle-inactive" type="button" className={styles.link} onClick={() => setShowInactive((prev) => !prev)}>
              {showInactive ? "Hide inactive" : "Show inactive"}
            </button>
          </div>

          {entryMode === "turn" ? (
            <div className={styles.turnNav}>
              <button data-testid="game-turn-prev" type="button" className={styles.link} onClick={prevPlayer}>
                Previous
              </button>
              <p className={styles.subtitle}>
                {visibleIndices.length > 0 ? `${currentTurnPosition + 1}/${visibleIndices.length}` : "0/0"}
              </p>
              <button data-testid="game-turn-next" type="button" className={styles.link} onClick={nextPlayer}>
                Next
              </button>
            </div>
          ) : null}

          {entryMode === "turn" ? (
            <div className={styles.actions}>
              {visibleIndices.map((index) => (
                <button
                  data-testid={`game-turn-jump-${index}`}
                  key={`jump-${state.players[index]?.name ?? index}`}
                  type="button"
                  className={styles.link}
                  onClick={() => setTurnPlayerIndex(index)}
                  disabled={effectiveTurnPlayer === index}
                >
                  {state.players[index]?.name ?? `P${index + 1}`}
                </button>
              ))}
            </div>
          ) : null}
        </div>
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
            {rowsToRender.map((index) => {
              const player = state.players[index];
              if (!player) return null;

              const draft = entries[index] ?? createEmptyDraft();

              return (
                <tr data-testid={`game-entry-row-${index}`} key={player.name}>
                  <td>
                    {player.name}
                    {!player.active ? " (left)" : ""}
                  </td>
                  <td>
                    <input
                      data-testid={`game-entry-bid-${index}`}
                      value={draft.bid}
                      onChange={(event) => updateEntry(index, { bid: event.target.value })}
                      inputMode="numeric"
                    />
                  </td>
                  <td>
                    <input
                      data-testid={`game-entry-won-${index}`}
                      value={draft.won}
                      onChange={(event) => updateEntry(index, { won: event.target.value })}
                      inputMode="numeric"
                    />
                  </td>
                  <td>
                    <input
                      data-testid={`game-entry-bonus-${index}`}
                      value={draft.bonus}
                      onChange={(event) => updateEntry(index, { bonus: event.target.value })}
                      inputMode="numeric"
                    />
                  </td>
                  <td>
                    <select
                      data-testid={`game-entry-rascal-${index}`}
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
        <button data-testid="game-save-round" type="button" className={styles.link} onClick={submitRound}>
          Save round
        </button>
      </div>
    </>
  );
}

export default function GamePage() {
  const [state, setGameState] = useGameStateStore();
  const [newPlayerName, setNewPlayerName] = useState("");
  const [leaveSelection, setLeaveSelection] = useState<string>("");
  const [returnSelection, setReturnSelection] = useState<string>("");

  const sortedPlayers = useMemo(() => {
    if (!state) return [];
    return [...state.players].sort((a, b) => b.total - a.total);
  }, [state]);

  const activePlayerIndices = useMemo(() => {
    if (!state) return [];
    return getActivePlayerIndices(state);
  }, [state]);

  const inactivePlayerIndices = useMemo(() => {
    if (!state) return [];
    return state.players.map((player, index) => (!player.active ? index : -1)).filter((index) => index >= 0);
  }, [state]);

  const leaderName = sortedPlayers.find((player) => player.active)?.name ?? null;

  const undoRound = () => {
    if (!state) return;
    setGameState(undoLastRound(state));
  };

  const addPlayerToGame = () => {
    if (!state) return;
    const normalized = normalizePlayerName(newPlayerName);
    if (!normalized) return;

    const alreadyExists = state.players.some((player) => player.name.toLowerCase() === normalized.toLowerCase());
    if (alreadyExists) return;

    setGameState(addPlayer(state, normalized));
    setNewPlayerName("");
  };

  const leaveSelectedPlayer = () => {
    if (!state) return;
    if (activePlayerIndices.length <= 1) return;

    const fallback = activePlayerIndices[0];
    const selected = Number.parseInt(leaveSelection, 10);
    const index = Number.isNaN(selected) ? fallback : selected;
    if (index === undefined) return;

    const next = leavePlayer(state, index);
    setGameState(next);
  };

  const returnSelectedPlayer = () => {
    if (!state) return;

    const fallback = inactivePlayerIndices[0];
    const selected = Number.parseInt(returnSelection, 10);
    const index = Number.isNaN(selected) ? fallback : selected;
    if (index === undefined) return;

    const next = returnPlayer(state, index);
    setGameState(next);
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

        <div className={styles.controlGrid}>
          <div className={styles.panel}>
            <p className={styles.label}>Add player mid-game</p>
            <div className={styles.actions}>
              <input
                data-testid="game-add-player-input"
                value={newPlayerName}
                onChange={(event) => setNewPlayerName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addPlayerToGame();
                  }
                }}
                placeholder="Player name"
              />
              <button data-testid="game-add-player-button" type="button" className={styles.link} onClick={addPlayerToGame}>
                Add player
              </button>
            </div>
          </div>

          <div className={styles.panel}>
            <p className={styles.label}>Player activity</p>
            <div className={styles.actions}>
              <select data-testid="game-leave-select" value={leaveSelection} onChange={(event) => setLeaveSelection(event.target.value)}>
                {activePlayerIndices.map((index) => (
                  <option key={`leave-${state.players[index]?.name ?? index}`} value={index}>
                    {state.players[index]?.name}
                  </option>
                ))}
              </select>
              <button
                data-testid="game-leave-button"
                type="button"
                className={styles.link}
                onClick={leaveSelectedPlayer}
                disabled={activePlayerIndices.length <= 1}
              >
                Mark as left
              </button>
            </div>
            <div className={styles.actions}>
              <select data-testid="game-return-select" value={returnSelection} onChange={(event) => setReturnSelection(event.target.value)}>
                {inactivePlayerIndices.length === 0 ? <option value="">No inactive players</option> : null}
                {inactivePlayerIndices.map((index) => (
                  <option key={`return-${state.players[index]?.name ?? index}`} value={index}>
                    {state.players[index]?.name}
                  </option>
                ))}
              </select>
              <button
                data-testid="game-return-button"
                type="button"
                className={styles.link}
                onClick={returnSelectedPlayer}
                disabled={inactivePlayerIndices.length === 0}
              >
                Mark as returned
              </button>
            </div>
          </div>
        </div>

        <RoundEntryForm
          key={`${state.rounds.length}:${state.players.length}:${state.nextCards}`}
          state={state}
          onSave={setGameState}
        />

        <div className={styles.actions}>
          <button type="button" className={styles.link} onClick={undoRound} disabled={state.rounds.length === 0}>
            Undo last round
          </button>
          <Link data-testid="game-link-history" className={styles.link} href="/history">
            History
          </Link>
          <Link data-testid="game-link-setup" className={styles.link} href="/setup">
            Setup
          </Link>
        </div>

        <div className={styles.grid}>
          {sortedPlayers.map((player, index) => (
            <article
              key={player.name}
              className={`${styles.panel} ${styles.scoreCard} ${player.active ? "" : styles.inactiveCard} ${
                leaderName === player.name ? styles.leaderCard : ""
              }`}
            >
              <p className={styles.label}>#{index + 1}</p>
              <p className={styles.value}>{player.name}</p>
              <p className={styles.subtitle}>Total: {player.total}</p>
              {!player.active ? <p className={styles.subtitle}>Left at round {player.leftAtRound ?? "?"}</p> : null}
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
