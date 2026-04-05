"use client";

import { useSyncExternalStore } from "react";

import { type GameState } from "@/lib/domain";
import { loadStoredGameState, saveStoredGameState } from "@/lib/game-state-storage";
import { getSupabaseBrowserClient } from "@/lib/supabase-client";
import { saveGameStateToCloud } from "@/lib/supabase-game-sync";

type Listener = () => void;

type CloudSyncPhase = "idle" | "pending" | "syncing" | "synced" | "error";

type CloudSyncSnapshot = {
  phase: CloudSyncPhase;
  message: string | null;
  lastSyncedAt: number | null;
};

const listeners = new Set<Listener>();
const cloudSyncListeners = new Set<Listener>();

let snapshot: GameState | null | undefined;
let cloudSyncSnapshot: CloudSyncSnapshot = {
  phase: "idle",
  message: null,
  lastSyncedAt: null,
};

let cloudSyncTimer: ReturnType<typeof setTimeout> | null = null;
let cloudSyncInFlight = false;
let pendingCloudState: GameState | null = null;
let lastSyncedHash: string | null = null;

const cloudSyncServerSnapshot: CloudSyncSnapshot = {
  phase: "idle",
  message: null,
  lastSyncedAt: null,
};

function emitChange() {
  listeners.forEach((listener) => listener());
}

function emitCloudSyncChange() {
  cloudSyncListeners.forEach((listener) => listener());
}

function setCloudSyncSnapshot(patch: Partial<CloudSyncSnapshot>) {
  cloudSyncSnapshot = {
    ...cloudSyncSnapshot,
    ...patch,
  };
  emitCloudSyncChange();
}

function hashState(state: GameState): string {
  return JSON.stringify(state);
}

async function flushCloudSync() {
  if (cloudSyncInFlight) return;

  const stateToSync = pendingCloudState;
  if (!stateToSync) return;

  const nextHash = hashState(stateToSync);
  if (nextHash === lastSyncedHash) {
    setCloudSyncSnapshot({ phase: "synced", message: "Already synced", lastSyncedAt: Date.now() });
    return;
  }

  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    setCloudSyncSnapshot({ phase: "idle", message: "Cloud sync unavailable (Supabase not configured)." });
    return;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    setCloudSyncSnapshot({ phase: "idle", message: "Cloud sync paused (not signed in)." });
    return;
  }

  cloudSyncInFlight = true;
  setCloudSyncSnapshot({ phase: "syncing", message: "Syncing to cloud..." });

  const result = await saveGameStateToCloud(stateToSync);

  cloudSyncInFlight = false;

  if (!result.ok) {
    setCloudSyncSnapshot({ phase: "error", message: result.error });
    return;
  }

  lastSyncedHash = nextHash;
  setCloudSyncSnapshot({ phase: "synced", message: "Synced to cloud.", lastSyncedAt: Date.now() });

  if (pendingCloudState) {
    const pendingHash = hashState(pendingCloudState);
    if (pendingHash !== lastSyncedHash) {
      if (cloudSyncTimer) clearTimeout(cloudSyncTimer);
      cloudSyncTimer = setTimeout(() => {
        void flushCloudSync();
      }, 350);
    }
  }
}

function scheduleCloudSync(nextState: GameState | null) {
  pendingCloudState = nextState;

  if (!nextState) {
    setCloudSyncSnapshot({ phase: "idle", message: null, lastSyncedAt: null });
    return;
  }

  setCloudSyncSnapshot({ phase: "pending", message: "Changes queued for cloud sync..." });

  if (cloudSyncTimer) clearTimeout(cloudSyncTimer);
  cloudSyncTimer = setTimeout(() => {
    void flushCloudSync();
  }, 1200);
}

function getSnapshot(): GameState | null {
  if (snapshot !== undefined) return snapshot;
  snapshot = loadStoredGameState();
  return snapshot;
}

function getServerSnapshot(): GameState | null {
  return null;
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function subscribeCloudSync(listener: Listener): () => void {
  cloudSyncListeners.add(listener);
  return () => cloudSyncListeners.delete(listener);
}

function getCloudSyncSnapshot(): CloudSyncSnapshot {
  return cloudSyncSnapshot;
}

function getCloudSyncServerSnapshot(): CloudSyncSnapshot {
  return cloudSyncServerSnapshot;
}

export function setGameState(nextState: GameState | null): void {
  snapshot = nextState;
  saveStoredGameState(nextState);
  emitChange();
  scheduleCloudSync(nextState);
}

export function useGameStateStore(): [GameState | null, (nextState: GameState | null) => void] {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return [state, setGameState];
}

export function useCloudSyncStatus(): CloudSyncSnapshot {
  return useSyncExternalStore(subscribeCloudSync, getCloudSyncSnapshot, getCloudSyncServerSnapshot);
}
