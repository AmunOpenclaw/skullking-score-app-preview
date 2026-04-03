import { normalizeState, type GameState } from "@/lib/domain";

const STORAGE_KEY = "skullking-v2-draft-state";

export function loadStoredGameState(): GameState | null {
  if (typeof window === "undefined") return null;

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;

  try {
    return normalizeState(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function saveStoredGameState(state: GameState | null): void {
  if (typeof window === "undefined") return;

  if (!state) {
    window.localStorage.removeItem(STORAGE_KEY);
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
