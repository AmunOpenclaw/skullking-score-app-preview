"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { createNewState } from "@/lib/domain";
import { useCloudSyncStatus, useGameStateStore } from "@/lib/game-state-store";
import { loadStoredGameState } from "@/lib/game-state-storage";
import { useSupabaseAuthStore } from "@/lib/supabase-auth-store";
import { loadGameStateFromCloud, saveGameStateToCloud } from "@/lib/supabase-game-sync";
import { loadPlayerLibraryFromCloud, syncPlayerLibraryToCloud } from "@/lib/supabase-player-library-sync";
import { loadPlayerLibraryLocal, normalizePlayerNameInput, savePlayerLibraryLocal } from "@/lib/setup-player-library";
import styles from "../shell.module.css";

function createInitialLibraryAndSelection() {
  const stored = loadStoredGameState();
  const storedPlayers = stored?.players.map((player) => player.name) ?? [];
  const localLibrary = loadPlayerLibraryLocal();

  const library = [...new Set([...localLibrary, ...storedPlayers])];
  const selected = [...new Set(storedPlayers.filter((name) => library.includes(name)))];

  return { library, selected };
}

export default function SetupPage() {
  const router = useRouter();
  const [storedState, setGameState] = useGameStateStore();
  const cloudSync = useCloudSyncStatus();
  const { state: authState, actions: authActions } = useSupabaseAuthStore();

  const [playerLibrary, setPlayerLibrary] = useState<string[]>(() => createInitialLibraryAndSelection().library);
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>(() => createInitialLibraryAndSelection().selected);
  const [newName, setNewName] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<"magic" | "save" | "load" | "signout" | "savePlayers" | "loadPlayers" | null>(
    null
  );

  const canStart = selectedPlayers.length >= 1;

  const preview = useMemo(() => {
    if (!canStart) return null;
    return createNewState(selectedPlayers, 0);
  }, [canStart, selectedPlayers]);

  const setLibrary = (nextLibrary: string[]) => {
    const unique = [...new Set(nextLibrary.map((name) => normalizePlayerNameInput(name)).filter(Boolean))];
    savePlayerLibraryLocal(unique);
    setPlayerLibrary(unique);
    setSelectedPlayers((prev) => prev.filter((name) => unique.includes(name)));
  };

  const addPlayerToLibrary = () => {
    const normalized = normalizePlayerNameInput(newName);
    if (!normalized) return;

    setLibrary(playerLibrary.includes(normalized) ? playerLibrary : [...playerLibrary, normalized]);
    setSelectedPlayers((prev) => (prev.includes(normalized) ? prev : [...prev, normalized]));
    setNewName("");
  };

  const toggleSelectedPlayer = (name: string) => {
    setSelectedPlayers((prev) =>
      prev.includes(name) ? prev.filter((candidate) => candidate !== name) : [...prev, name]
    );
  };

  const removeSelectedFromLibrary = () => {
    if (selectedPlayers.length === 0) return;
    setLibrary(playerLibrary.filter((name) => !selectedPlayers.includes(name)));
    setSelectedPlayers([]);
  };

  const startGame = () => {
    if (!canStart) return;
    setGameState(createNewState(selectedPlayers));
    router.push("/game");
  };

  const continueExisting = async () => {
    if (storedState) {
      router.push("/game");
      return;
    }

    if (!authState.userId) return;

    await loadCloud();
    const latest = loadStoredGameState();
    if (latest) {
      router.push("/game");
    }
  };

  const resetStored = () => {
    setGameState(null);
  };

  const sendMagicLink = async () => {
    setBusyAction("magic");
    const result = await authActions.sendMagicLink(authEmail);
    setBusyAction(null);
    if (!result.ok) {
      setStatusMessage(`Magic link failed: ${result.error}`);
      return;
    }
    setStatusMessage(`Magic link sent to ${authEmail.trim()}.`);
  };

  const signOut = async () => {
    setBusyAction("signout");
    const result = await authActions.signOut();
    setBusyAction(null);
    if (!result.ok) {
      setStatusMessage(`Sign out failed: ${result.error}`);
      return;
    }
    setStatusMessage("Signed out.");
  };

  const saveCloud = async () => {
    if (!storedState) {
      setStatusMessage("No local game to save.");
      return;
    }

    setBusyAction("save");
    const result = await saveGameStateToCloud(storedState);
    setBusyAction(null);

    if (!result.ok) {
      setStatusMessage(`Cloud save failed: ${result.error}`);
      return;
    }

    setStatusMessage("Saved to cloud.");
  };

  const loadCloud = async () => {
    setBusyAction("load");
    const result = await loadGameStateFromCloud();
    setBusyAction(null);

    if (!result.ok) {
      setStatusMessage(`Cloud load failed: ${result.error}`);
      return;
    }

    if (!result.data) {
      setStatusMessage("No active cloud game found.");
      return;
    }

    setGameState(result.data);
    const names = result.data.players.map((player) => player.name);
    setLibrary([...new Set([...playerLibrary, ...names])]);
    setSelectedPlayers(names);
    setStatusMessage(`Loaded cloud game (${result.data.players.length} players, ${result.data.rounds.length} rounds).`);
  };

  const syncPlayersCloud = async () => {
    setBusyAction("savePlayers");
    const result = await syncPlayerLibraryToCloud(playerLibrary);
    setBusyAction(null);

    if (!result.ok) {
      setStatusMessage(`Player sync failed: ${result.error}`);
      return;
    }

    setStatusMessage("Player library synced to cloud.");
  };

  const loadPlayersCloud = async () => {
    setBusyAction("loadPlayers");
    const result = await loadPlayerLibraryFromCloud();
    setBusyAction(null);

    if (!result.ok) {
      setStatusMessage(`Cloud player load failed: ${result.error}`);
      return;
    }

    const merged = [...new Set([...playerLibrary, ...result.data])];
    setLibrary(merged);
    setStatusMessage(`Loaded ${result.data.length} player(s) from cloud.`);
  };

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <header className={styles.header}>
          <p className={styles.eyebrow}>Phase 2 · Setup parity slice</p>
          <h1 className={styles.title}>Prepare game roster</h1>
          <p className={styles.subtitle}>
            Setup now supports saved player library, local/cloud continue flow, and Supabase sync.
          </p>
        </header>

        <div className={styles.panel}>
          <p className={styles.label}>Auth + cloud sync</p>
          {!authState.configured ? (
            <p className={styles.subtitle}>
              Supabase env vars missing. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
            </p>
          ) : (
            <>
              <p className={styles.subtitle}>Session: {authState.email ? `signed in as ${authState.email}` : "not signed in"}</p>
              <p className={styles.subtitle}>Auto sync: {cloudSync.phase}{cloudSync.message ? ` · ${cloudSync.message}` : ""}</p>
              <div className={styles.actions}>
                <input
                  value={authEmail}
                  onChange={(event) => setAuthEmail(event.target.value)}
                  placeholder="you@example.com"
                  style={{ flex: "1 1 220px" }}
                />
                <button type="button" className={styles.link} onClick={sendMagicLink} disabled={busyAction !== null}>
                  {busyAction === "magic" ? "Sending..." : "Send magic link"}
                </button>
                <button type="button" className={styles.link} onClick={signOut} disabled={busyAction !== null || !authState.userId}>
                  {busyAction === "signout" ? "Signing out..." : "Sign out"}
                </button>
                <button
                  type="button"
                  className={styles.link}
                  onClick={() => void authActions.refreshAuthState()}
                  disabled={busyAction !== null || authState.loading}
                >
                  Refresh session
                </button>
              </div>
              <div className={styles.actions}>
                <button type="button" className={styles.link} onClick={saveCloud} disabled={busyAction !== null || !authState.userId || !storedState}>
                  {busyAction === "save" ? "Syncing..." : "Sync game now"}
                </button>
                <button type="button" className={styles.link} onClick={loadCloud} disabled={busyAction !== null || !authState.userId}>
                  {busyAction === "load" ? "Loading..." : "Reload game from cloud"}
                </button>
                <button type="button" className={styles.link} onClick={syncPlayersCloud} disabled={busyAction !== null || !authState.userId}>
                  {busyAction === "savePlayers" ? "Syncing..." : "Sync players now"}
                </button>
                <button type="button" className={styles.link} onClick={loadPlayersCloud} disabled={busyAction !== null || !authState.userId}>
                  {busyAction === "loadPlayers" ? "Loading..." : "Load players from cloud"}
                </button>
              </div>
            </>
          )}
          {statusMessage ? <p className={styles.subtitle}>{statusMessage}</p> : null}
          {authState.lastError ? <p className={styles.subtitle}>Auth error: {authState.lastError}</p> : null}
        </div>

        <div className={styles.panel}>
          <p className={styles.label}>Player library</p>
          <div className={styles.actions}>
            <input
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addPlayerToLibrary();
                }
              }}
              placeholder="Player name"
              style={{ flex: "1 1 220px" }}
            />
            <button type="button" className={styles.link} onClick={addPlayerToLibrary}>
              Add player
            </button>
            <button type="button" className={styles.link} onClick={removeSelectedFromLibrary} disabled={selectedPlayers.length === 0}>
              Remove selected
            </button>
          </div>

          <div className={styles.chipWrap}>
            {playerLibrary.length === 0 ? (
              <p className={styles.subtitle}>No saved players yet.</p>
            ) : (
              playerLibrary.map((name) => {
                const selected = selectedPlayers.includes(name);
                return (
                  <button
                    key={name}
                    type="button"
                    className={`${styles.link} ${selected ? styles.chipSelected : ""}`}
                    onClick={() => toggleSelectedPlayer(name)}
                  >
                    {selected ? "✓ " : ""}
                    {name}
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div className={styles.grid}>
          <article className={styles.panel}>
            <p className={styles.label}>Library size</p>
            <p className={styles.value}>{playerLibrary.length}</p>
          </article>
          <article className={styles.panel}>
            <p className={styles.label}>Selected players</p>
            <p className={styles.value}>{selectedPlayers.length}</p>
          </article>
          <article className={styles.panel}>
            <p className={styles.label}>Next round cards</p>
            <p className={styles.value}>{preview?.nextCards ?? 1}</p>
          </article>
        </div>

        <div className={styles.actions}>
          <button type="button" className={styles.link} onClick={startGame} disabled={!canStart}>
            Start new game
          </button>
          <button
            type="button"
            className={styles.link}
            onClick={() => void continueExisting()}
            disabled={!storedState && !authState.userId}
          >
            Continue game (local/cloud)
          </button>
          <button type="button" className={styles.link} onClick={resetStored} disabled={!storedState}>
            Clear saved game
          </button>
          <Link className={styles.link} href="/history">
            History
          </Link>
          <Link className={styles.link} href="/">
            Home
          </Link>
        </div>

        {storedState ? (
          <p className={styles.subtitle}>
            Local game: {storedState.players.length} players · {storedState.rounds.length} rounds.
          </p>
        ) : null}
      </section>
    </main>
  );
}
