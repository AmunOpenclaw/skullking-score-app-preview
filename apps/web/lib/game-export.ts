import { type GameState } from "@/lib/domain";

function escapeCsvCell(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replaceAll('"', '""')}"`;
  }
  return value;
}

function downloadFile(filename: string, content: string, contentType: string): void {
  const blob = new Blob([content], { type: contentType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function exportCsv(state: GameState): void {
  const rows: string[][] = [];
  rows.push(["Round", "Cards", ...state.players.map((player) => player.name)]);

  state.rounds.forEach((round) => {
    rows.push([String(round.round), String(round.cards), ...round.entries.map((entry) => String(entry.roundScore))]);
  });

  rows.push(["Total", "-", ...state.players.map((player) => String(player.total))]);

  const csv = rows.map((row) => row.map(escapeCsvCell).join(",")).join("\n");
  downloadFile("skullking-score.csv", csv, "text/csv;charset=utf-8");
}

export function exportJson(state: GameState): void {
  const json = JSON.stringify(state, null, 2);
  downloadFile("skullking-score.json", json, "application/json;charset=utf-8");
}

export function buildSummary(state: GameState): string {
  const sorted = [...state.players].sort((a, b) => b.total - a.total);
  const leaderboard = sorted.map((player, index) => `${index + 1}. ${player.name}: ${player.total}`).join("\n");
  return `Skull King scoreboard\nRounds: ${state.rounds.length}\n\n${leaderboard}`;
}

export async function shareSummary(state: GameState): Promise<{ ok: true } | { ok: false; error: string }> {
  const summary = buildSummary(state);

  try {
    if (navigator.share) {
      await navigator.share({ text: summary });
      return { ok: true };
    }

    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(summary);
      return { ok: true };
    }

    return { ok: false, error: "Sharing not available on this device." };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Share failed";
    return { ok: false, error: message };
  }
}
