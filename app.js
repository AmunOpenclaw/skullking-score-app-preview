const STORAGE_KEY = "skullking-score-app-v1";

const setupEl = document.getElementById("setup");
const gameEl = document.getElementById("game");
const playerNamesEl = document.getElementById("playerNames");
const startBtn = document.getElementById("startGame");
const loadBtn = document.getElementById("loadSaved");
const newGameBtn = document.getElementById("newGame");
const undoBtn = document.getElementById("undoRound");
const exportCsvBtn = document.getElementById("exportCsv");
const exportJsonBtn = document.getElementById("exportJson");
const shareSummaryBtn = document.getElementById("shareSummary");
const roundTitle = document.getElementById("roundTitle");
const scoreboardEl = document.getElementById("scoreboard");
const entryGridEl = document.getElementById("entryGrid");
const roundForm = document.getElementById("roundForm");
const warningEl = document.getElementById("wonWarning");
const historyHead = document.querySelector("#historyTable thead");
const historyBody = document.querySelector("#historyTable tbody");

let state = null;

function createNewState(playerNames) {
  return {
    version: 1,
    createdAt: Date.now(),
    players: playerNames.map((name) => ({ name, total: 0 })),
    rounds: [],
  };
}

function getCurrentRoundNumber() {
  return (state?.rounds?.length ?? 0) + 1;
}

function scoreBase(round, bid, won) {
  if (bid === 0) {
    return won === 0 ? 10 * round : -10 * round;
  }
  if (won === bid) {
    return 20 * bid;
  }
  return -10 * Math.abs(won - bid);
}

function saveState() {
  if (!state) return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    if (!parsed?.players || !Array.isArray(parsed.players)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function resetToSetup() {
  setupEl.classList.remove("hidden");
  gameEl.classList.add("hidden");
  warningEl.classList.add("hidden");
}

function startGameWithState(nextState) {
  state = nextState;
  setupEl.classList.add("hidden");
  gameEl.classList.remove("hidden");
  renderAll();
  saveState();
}

function buildEntryRow(player, index, roundNum) {
  const row = document.createElement("div");
  row.className = "entry-row";
  row.dataset.index = String(index);

  row.innerHTML = `
    <div class="field player-col">
      <div class="mini-label">Player</div>
      <div class="player-name">${player.name}</div>
    </div>

    <div class="field field-bid">
      <label class="mini-label" for="bid-${index}">Bid</label>
      <input id="bid-${index}" name="bid-${index}" type="number" min="0" max="${roundNum}" value="0" required />
      <div class="stepper">
        <button type="button" class="step-btn" data-target="bid-${index}" data-delta="-1">−</button>
        <button type="button" class="step-btn" data-target="bid-${index}" data-delta="1">+</button>
      </div>
    </div>

    <div class="field field-won">
      <label class="mini-label" for="won-${index}">Won</label>
      <input id="won-${index}" name="won-${index}" type="number" min="0" max="${roundNum}" value="0" required />
      <div class="stepper">
        <button type="button" class="step-btn" data-target="won-${index}" data-delta="-1">−</button>
        <button type="button" class="step-btn" data-target="won-${index}" data-delta="1">+</button>
      </div>
    </div>

    <div class="field field-bonus">
      <label class="mini-label" for="bonus-${index}">Bonus</label>
      <input id="bonus-${index}" name="bonus-${index}" type="number" step="10" value="0" />
      <div class="bonus-chips">
        <button type="button" class="chip-btn" data-target="bonus-${index}" data-add="10">+10 (14)</button>
        <button type="button" class="chip-btn" data-target="bonus-${index}" data-add="20">+20 (black 14 / pirate)</button>
        <button type="button" class="chip-btn" data-target="bonus-${index}" data-add="30">+30 (Skull King)</button>
        <button type="button" class="chip-btn" data-target="bonus-${index}" data-add="40">+40 (Mermaid)</button>
        <button type="button" class="chip-btn" data-target="bonus-${index}" data-set="0">Reset</button>
      </div>
    </div>

    <div class="field field-preview">
      <div class="mini-label">Round score</div>
      <div id="preview-${index}" class="preview">0</div>
    </div>
  `;

  return row;
}

function renderEntryGrid() {
  const roundNum = getCurrentRoundNumber();
  entryGridEl.innerHTML = "";
  state.players.forEach((player, index) => {
    entryGridEl.appendChild(buildEntryRow(player, index, roundNum));
  });
  bindLivePreview();
}

function toInt(value) {
  const n = Number.parseInt(value, 10);
  return Number.isNaN(n) ? 0 : n;
}

function clampForRound(value, roundNum) {
  const n = toInt(value);
  if (n < 0) return 0;
  if (n > roundNum) return roundNum;
  return n;
}

function normalizedFieldValue(fieldId, roundNum) {
  const el = document.getElementById(fieldId);
  if (!el) return 0;
  const clamped = clampForRound(el.value, roundNum);
  el.value = String(clamped);
  return clamped;
}

function recalcWarning() {
  const roundNum = getCurrentRoundNumber();
  const wonTotal = state.players.reduce((sum, _player, index) => {
    const input = document.getElementById(`won-${index}`);
    return sum + toInt(input?.value);
  }, 0);

  if (wonTotal !== roundNum) {
    warningEl.textContent = `Heads-up: total tricks won is ${wonTotal}, expected ${roundNum} for round ${roundNum}.`;
    warningEl.classList.remove("hidden");
  } else {
    warningEl.classList.add("hidden");
  }
}

function updateRowPreview(index) {
  const roundNum = getCurrentRoundNumber();
  const bid = normalizedFieldValue(`bid-${index}`, roundNum);
  const won = normalizedFieldValue(`won-${index}`, roundNum);
  const bonus = toInt(document.getElementById(`bonus-${index}`)?.value);
  const score = scoreBase(roundNum, bid, won) + bonus;
  const preview = document.getElementById(`preview-${index}`);
  if (preview) preview.textContent = String(score);
}

function updateAllPreviews() {
  state.players.forEach((_player, index) => updateRowPreview(index));
  recalcWarning();
}

function bindLivePreview() {
  state.players.forEach((_player, index) => {
    ["bid", "won", "bonus"].forEach((key) => {
      const el = document.getElementById(`${key}-${index}`);
      if (!el) return;
      el.addEventListener("input", () => {
        updateRowPreview(index);
        recalcWarning();
      });
    });
    updateRowPreview(index);
  });

  recalcWarning();
}

function renderScoreboard() {
  const sorted = [...state.players].sort((a, b) => b.total - a.total);
  scoreboardEl.innerHTML = "";
  sorted.forEach((player) => {
    const card = document.createElement("article");
    card.className = "score-card";
    card.innerHTML = `<div class="name">${player.name}</div><div class="total">${player.total}</div>`;
    scoreboardEl.appendChild(card);
  });
}

function renderHistory() {
  historyHead.innerHTML = "";
  historyBody.innerHTML = "";

  const header = document.createElement("tr");
  header.innerHTML = `<th>Round</th>${state.players.map((p) => `<th>${p.name}</th>`).join("")}`;
  historyHead.appendChild(header);

  state.rounds.forEach((round) => {
    const row = document.createElement("tr");
    row.innerHTML = `<td>${round.round}</td>${round.entries
      .map((entry) => `<td>${entry.roundScore}</td>`)
      .join("")}`;
    historyBody.appendChild(row);
  });

  const totals = document.createElement("tr");
  totals.innerHTML = `<td><strong>Total</strong></td>${state.players
    .map((p) => `<td><strong>${p.total}</strong></td>`)
    .join("")}`;
  historyBody.appendChild(totals);
}

function renderRoundTitle() {
  const current = getCurrentRoundNumber();
  if (current > 10) {
    roundTitle.textContent = "Game complete";
    roundForm.classList.add("hidden");
    warningEl.classList.add("hidden");
    return;
  }
  roundTitle.textContent = `Round ${current} / 10`;
  roundForm.classList.remove("hidden");
}

function renderAll() {
  renderRoundTitle();
  renderScoreboard();
  renderHistory();

  if (getCurrentRoundNumber() <= 10) {
    renderEntryGrid();
  }

  const hasRounds = state.rounds.length > 0;
  undoBtn.disabled = !hasRounds;
  exportCsvBtn.disabled = !hasRounds;
  exportJsonBtn.disabled = !hasRounds;
  shareSummaryBtn.disabled = state.players.length === 0;
}

function escapeCsvCell(value) {
  const text = String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function downloadBlob(filename, content, contentType) {
  const blob = new Blob([content], { type: contentType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function exportCsv() {
  const rows = [];
  rows.push(["Round", ...state.players.map((p) => p.name)]);
  state.rounds.forEach((round) => {
    rows.push([round.round, ...round.entries.map((entry) => entry.roundScore)]);
  });
  rows.push(["Total", ...state.players.map((p) => p.total)]);

  const csv = rows.map((row) => row.map(escapeCsvCell).join(",")).join("\n");
  downloadBlob(`skullking-score-${new Date().toISOString().slice(0, 10)}.csv`, csv, "text/csv;charset=utf-8");
}

function exportJson() {
  const payload = {
    exportedAt: new Date().toISOString(),
    app: "Skull King Scoring Companion",
    ...state,
  };
  downloadBlob(
    `skullking-score-${new Date().toISOString().slice(0, 10)}.json`,
    JSON.stringify(payload, null, 2),
    "application/json;charset=utf-8"
  );
}

function buildSummaryText() {
  const lines = ["Skull King score summary", ""];
  const ranking = [...state.players].sort((a, b) => b.total - a.total);
  ranking.forEach((player, index) => {
    lines.push(`${index + 1}. ${player.name}: ${player.total}`);
  });
  lines.push("", `Rounds played: ${state.rounds.length}`);
  return lines.join("\n");
}

async function shareSummary() {
  const text = buildSummaryText();

  if (navigator.share) {
    try {
      await navigator.share({
        title: "Skull King score summary",
        text,
      });
      return;
    } catch {
      // user cancel/no-op
    }
  }

  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    alert("Summary copied to clipboard.");
  } else {
    alert(text);
  }
}

roundForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const roundNum = getCurrentRoundNumber();
  if (roundNum > 10) return;

  const entries = state.players.map((_player, index) => {
    const bid = clampForRound(document.getElementById(`bid-${index}`)?.value, roundNum);
    const won = clampForRound(document.getElementById(`won-${index}`)?.value, roundNum);
    const bonus = toInt(document.getElementById(`bonus-${index}`)?.value);
    const base = scoreBase(roundNum, bid, won);
    const roundScore = base + bonus;

    return { bid, won, bonus, base, roundScore };
  });

  state.rounds.push({ round: roundNum, entries });
  state.players.forEach((player, index) => {
    player.total += entries[index].roundScore;
  });

  saveState();
  renderAll();
});

entryGridEl.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;

  const targetId = button.dataset.target;
  if (!targetId) return;

  const input = document.getElementById(targetId);
  if (!input) return;

  const roundNum = getCurrentRoundNumber();
  const isRoundBounded = targetId.startsWith("bid-") || targetId.startsWith("won-");

  if (button.dataset.delta) {
    const delta = toInt(button.dataset.delta);
    const nextRaw = toInt(input.value) + delta;
    input.value = String(isRoundBounded ? clampForRound(nextRaw, roundNum) : Math.max(0, nextRaw));
  }

  if (button.dataset.add) {
    const add = toInt(button.dataset.add);
    input.value = String(toInt(input.value) + add);
  }

  if (button.dataset.set !== undefined) {
    input.value = String(toInt(button.dataset.set));
  }

  const index = Number.parseInt(targetId.split("-")[1], 10);
  if (!Number.isNaN(index)) {
    updateRowPreview(index);
    recalcWarning();
  }
});

undoBtn.addEventListener("click", () => {
  if (!state.rounds.length) return;
  const removed = state.rounds.pop();
  state.players.forEach((player, index) => {
    player.total -= removed.entries[index].roundScore;
  });
  saveState();
  renderAll();
});

newGameBtn.addEventListener("click", () => {
  if (!confirm("Start a new game? Current score will be replaced.")) return;
  localStorage.removeItem(STORAGE_KEY);
  state = null;
  resetToSetup();
});

startBtn.addEventListener("click", () => {
  const names = playerNamesEl.value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 8);

  if (names.length < 2) {
    alert("Please enter at least 2 player names.");
    return;
  }

  startGameWithState(createNewState(names));
});

loadBtn.addEventListener("click", () => {
  const saved = loadState();
  if (!saved) {
    alert("No saved game found yet.");
    return;
  }
  startGameWithState(saved);
});

exportCsvBtn.addEventListener("click", () => {
  if (!state?.rounds?.length) return;
  exportCsv();
});

exportJsonBtn.addEventListener("click", () => {
  if (!state?.rounds?.length) return;
  exportJson();
});

shareSummaryBtn.addEventListener("click", async () => {
  if (!state?.players?.length) return;
  await shareSummary();
});

resetToSetup();
