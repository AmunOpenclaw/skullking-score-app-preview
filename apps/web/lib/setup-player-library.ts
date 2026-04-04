const PLAYER_LIBRARY_KEY = "skullking-score-players-v1";

function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

export function loadPlayerLibraryLocal(): string[] {
  if (typeof window === "undefined") return [];

  const raw = window.localStorage.getItem(PLAYER_LIBRARY_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const names = parsed
      .map((value) => (typeof value === "string" ? normalizeName(value) : ""))
      .filter((value): value is string => Boolean(value));

    return [...new Set(names)];
  } catch {
    return [];
  }
}

export function savePlayerLibraryLocal(names: string[]): void {
  if (typeof window === "undefined") return;

  const normalized = [...new Set(names.map((name) => normalizeName(name)).filter(Boolean))];
  window.localStorage.setItem(PLAYER_LIBRARY_KEY, JSON.stringify(normalized));
}

export function normalizePlayerNameInput(name: string): string {
  return normalizeName(name);
}
