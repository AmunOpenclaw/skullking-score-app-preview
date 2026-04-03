"use client";

import { useSyncExternalStore } from "react";

import { type GameState } from "@/lib/domain";
import { loadStoredGameState, saveStoredGameState } from "@/lib/game-state-storage";

type Listener = () => void;

const listeners = new Set<Listener>();
let snapshot: GameState | null | undefined;

function emitChange() {
  listeners.forEach((listener) => listener());
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

export function setGameState(nextState: GameState | null): void {
  snapshot = nextState;
  saveStoredGameState(nextState);
  emitChange();
}

export function useGameStateStore(): [GameState | null, (nextState: GameState | null) => void] {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return [state, setGameState];
}
