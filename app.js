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
const cardsInput = document.getElementById("cardsPerRound");
const roundTitle = document.getElementById("roundTitle");
const scoreboardEl = document.getElementById("scoreboard");
const entryGridEl = document.getElementById("entryGrid");
const roundForm = document.getElementById("roundForm");
const warningEl = document.getElementById("wonWarning");
const historyHead = document.querySelector("#historyTable thead");
const historyBody = document.querySelector("#historyTable tbody");

let state = null;

function toInt(value) {
  const n = Number.parseInt(value, 10);
  return Number.isNaN(n) ? 0 : n;
}

function scoreBase(cardsThisRound, bid, won) {
  if (bid === 0) {
    return won === 0 ? 10 * cardsThisRound : -10 * cardsThisRound;
  }
  if (won === bid) {
    return 20 * bid;
  }
  return -10 * Math.abs(won - bid);
}

function createNewState(playerNames) {
  return {
    version: 2,
    createdAt: Date.now(),
    players: playerNames.map((name) => ({ name, total: 0 })),
    rounds: [],
    nextCards: 1,
  };
}

function normalizeState(raw) {
  if (!raw?.players || !Array.isArray(raw.players) || raw.players.length === 0) return null;

  const players = raw.players.map((player, index) => ({
    name: String(player?.name || `Player ${index + 1}`).trim() || `Player ${index + 1}`,
    total: 0,
  }));

  const rounds = Array.isArray(raw.rounds)
    ? raw.rounds.map((round, roundIndex) => {
        const roundNumber = Math.max(1, toInt(round?.round) || roundIndex + 1);
        const cards = Math.max(1, toInt(round?.cards) || roundNumber);
        const entries = players.map((_player, playerIndex) => {
          const src = round?.entries?.[playerIndex] || {};
          const bid = Math.max(0, toInt(src.bid));
          const won = Math.max(0, toInt(src.won));
          const bonus = toInt(src.bonus);
          const base = src.base !== undefined ? toInt(src.base) : scoreBase(cards, bid, won);
          const roundScore = src.roundScore !== undefined ? toInt(src.roundScore) : base + bonus;
          return { bid, won, bonus, base, roundScore };
        });

        return {
          round: roundNumber,
          cards,
          entries,
        };
      })
    : [];

  rounds.forEach((round) => {
    round.entries.forEach((entry, playerIndex) => {
      players[playerIndex].total += entry.roundScore;
    });
  });

  const fallbackCards = rounds.length > 0 ? rounds[rounds.length - 1].cards + 1 : 1;
  const nextCards = Math.max(1, toInt(raw.nextCards) || fallbackCards);

  return {
    version: 2,
    createdAt: raw.createdAt || Date.now(),
    players,
    rounds,
    nextCards,
  };
}

function getCurrentRoundNumber() {
  return (state?.rounds?.length ?? 0) + 1;
}

function getCurrentCardsPerRound() {
  return Math.max(1, toInt(cardsInput?.value) || state?.nextCards || 1);
}

function setCardsInputValue(value) {
  if (!cardsInput) return;
  cardsInput.value = String(Math.max(1, toInt(value) || 1));
}

function clampForRound(value, cardsThisRound) {
  const n = toInt(value);
  if (n < 0) return 0;
  if (n > cardsThisRound) return cardsThisRound;
  return n;
}

function normalizedFieldValue(fieldId, cardsThisRound) {
  const el = document.getElementById(fieldId);
  if (!el) return 0;
  const clamped = clampForRound(el.value, cardsThisRound);
  el.value = String(clamped);
  return clamped;
}

function saveState() {
  if (!state) return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;

  try {
    return normalizeState(JSON.parse(raw));
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

function buildEntryRow(player, index, cardsThisRound) {
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
      <input id="bid-${index}" name="bid-${index}" type="number" min="0" max="${cardsThisRound}" value="0" required inputmode="numeric" />
      <div class="stepper">
        <button type="button" class="step-btn" data-target="bid-${index}" data-delta="-1">−</button>
        <button type="button" class="step-btn" data-target="bid-${index}" data-delta="1">+</button>
      </div>
    </div>

    <div class="field field-won">
      <label class="mini-label" for="won-${index}">Won</label>
      <input id="won-${index}" name="won-${index}" type="number" min="0" max="${cardsThisRound}" value="0" required inputmode="numeric" />
      <div class="stepper">
        <button type="button" class="step-btn" data-target="won-${index}" data-delta="-1">−</button>
        <button type="button" class="step-btn" data-target="won-${index}" data-delta="1">+</button>
      </div>
    </div>

    <div class="field field-bonus">
      <label class="mini-label" for="bonus-${index}">Bonus</label>
      <input id="bonus-${index}" name="bonus-${index}" type="number" step="10" value="0" inputmode="numeric" />
      <div class="bonus-chips">
        <button type="button" class="chip-btn" data-target="bonus-${index}" data-add="10">+10 (14)</button>
        <button type="button" class="chip-btn" data-target="bonus-${index}" data-add="20">+20 (black 14 / Loot / Pirate eats Mermaid / Rascal)</button>
        <button type="button" class="chip-btn" data-target="bonus-${index}" data-add="30">+30 (Skull King eats Pirate)</button>
        <button type="button" class="chip-btn" data-target="bonus-${index}" data-add="40">+40 (Mermaid eats Skull King)</button>
        <button type="button" class="chip-btn" data-target="bonus-${index}" data-add="-10">-10 (Rascal)</button>
        <button type="button" class="chip-btn" data-target="bonus-${index}" data-add="-20">-20 (Rascal)</button>
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
  const cardsThisRound = getCurrentCardsPerRound();
  entryGridEl.innerHTML = "";
  state.players.forEach((player, index) => {
    entryGridEl.appendChild(buildEntryRow(player, index, cardsThisRound));
  });
  bindLivePreview();
}

function recalcWarning() {
  const cardsThisRound = getCurrentCardsPerRound();
  const wonTotal = state.players.reduce((sum, _player, index) => {
    const input = document.getElementById(`won-${index}`);
    return sum + toInt(input?.value);
  }, 0);

  if (wonTotal !== cardsThisRound) {
    warningEl.textContent = `Heads-up: total tricks won is ${wonTotal}, expected ${cardsThisRound}.`;
    warningEl.classList.remove("hidden", "ok");
  } else {
    warningEl.textContent = `Nice: tricks total matches (${cardsThisRound}).`;
    warningEl.classList.remove("hidden");
    warningEl.classList.add("ok");
  }
}

function updateRowPreview(index) {
  const cardsThisRound = getCurrentCardsPerRound();
  const bid = normalizedFieldValue(`bid-${index}`, cardsThisRound);
  const won = normalizedFieldValue(`won-${index}`, cardsThisRound);
  const bonus = toInt(document.getElementById(`bonus-${index}`)?.value);
  const score = scoreBase(cardsThisRound, bid, won) + bonus;
  const preview = document.getElementById(`preview-${index}`);
  if (preview) {
    preview.textContent = String(score);
    preview.classList.remove("is-positive", "is-negative", "is-zero");
    if (score > 0) preview.classList.add("is-positive");
    else if (score < 0) preview.classList.add("is-negative");
    else preview.classList.add("is-zero");
  }
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
  sorted.forEach((player, index) => {
    const card = document.createElement("article");
    card.className = `score-card${index === 0 ? " is-leader" : ""}`;
    card.innerHTML = `<div class="score-rank">#${index + 1}</div><div class="name">${player.name}</div><div class="total">${player.total}</div>`;
    scoreboardEl.appendChild(card);
  });
}

function renderHistory() {
  historyHead.innerHTML = "";
  historyBody.innerHTML = "";

  const header = document.createElement("tr");
  header.innerHTML = `<th>Round</th><th>Cards</th>${state.players.map((p) => `<th>${p.name}</th>`).join("")}`;
  historyHead.appendChild(header);

  state.rounds.forEach((round) => {
    const row = document.createElement("tr");
    row.innerHTML = `<td>${round.round}</td><td>${round.cards}</td>${round.entries
      .map((entry) => `<td>${entry.roundScore}</td>`)
      .join("")}`;
    historyBody.appendChild(row);
  });

  const totals = document.createElement("tr");
  totals.innerHTML = `<td><strong>Total</strong></td><td>—</td>${state.players
    .map((p) => `<td><strong>${p.total}</strong></td>`)
    .join("")}`;
  historyBody.appendChild(totals);
}

function renderRoundTitle() {
  const current = getCurrentRoundNumber();
  roundTitle.textContent = `Round ${current}`;
  roundForm.classList.remove("hidden");
}

function renderAll() {
  renderRoundTitle();
  renderScoreboard();
  renderHistory();

  setCardsInputValue(state.nextCards || 1);
  renderEntryGrid();

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
  rows.push(["Round", "Cards", ...state.players.map((p) => p.name)]);
  state.rounds.forEach((round) => {
    rows.push([round.round, round.cards, ...round.entries.map((entry) => entry.roundScore)]);
  });
  rows.push(["Total", "", ...state.players.map((p) => p.total)]);

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
  lines.push("", `Rounds played: ${state.rounds.length}`, `Next round cards: ${state.nextCards}`);
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

roundForm?.addEventListener("submit", (event) => {
  event.preventDefault();

  const roundNum = getCurrentRoundNumber();
  const cardsThisRound = getCurrentCardsPerRound();

  const entries = state.players.map((_player, index) => {
    const bid = clampForRound(document.getElementById(`bid-${index}`)?.value, cardsThisRound);
    const won = clampForRound(document.getElementById(`won-${index}`)?.value, cardsThisRound);
    const bonus = toInt(document.getElementById(`bonus-${index}`)?.value);
    const base = scoreBase(cardsThisRound, bid, won);
    const roundScore = base + bonus;

    return { bid, won, bonus, base, roundScore };
  });

  state.rounds.push({ round: roundNum, cards: cardsThisRound, entries });
  state.players.forEach((player, index) => {
    player.total += entries[index].roundScore;
  });
  state.nextCards = cardsThisRound + 1;

  saveState();
  renderAll();
});

entryGridEl?.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;

  const targetId = button.dataset.target;
  if (!targetId) return;

  const input = document.getElementById(targetId);
  if (!input) return;

  const cardsThisRound = getCurrentCardsPerRound();
  const isRoundBounded = targetId.startsWith("bid-") || targetId.startsWith("won-");

  if (button.dataset.delta) {
    const delta = toInt(button.dataset.delta);
    const nextRaw = toInt(input.value) + delta;
    input.value = String(isRoundBounded ? clampForRound(nextRaw, cardsThisRound) : Math.max(0, nextRaw));
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

undoBtn?.addEventListener("click", () => {
  if (!state.rounds.length) return;
  const removed = state.rounds.pop();
  state.players.forEach((player, index) => {
    player.total -= removed.entries[index].roundScore;
  });
  state.nextCards = state.rounds.length > 0 ? state.rounds[state.rounds.length - 1].cards + 1 : 1;
  saveState();
  renderAll();
});

newGameBtn?.addEventListener("click", () => {
  if (!confirm("Start a new game? Current score will be replaced.")) return;
  localStorage.removeItem(STORAGE_KEY);
  state = null;
  resetToSetup();
});

cardsInput?.addEventListener("input", () => {
  const raw = cardsInput.value.trim();
  if (raw === "") {
    warningEl.classList.add("hidden");
    return;
  }
  const cardsThisRound = getCurrentCardsPerRound();
  setCardsInputValue(cardsThisRound);
  updateAllPreviews();
});

cardsInput?.addEventListener("blur", () => {
  const cardsThisRound = getCurrentCardsPerRound();
  setCardsInputValue(cardsThisRound);
  updateAllPreviews();
});

startBtn?.addEventListener("click", () => {
  const names = playerNamesEl.value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (names.length < 1) {
    alert("Please enter at least 1 player name.");
    return;
  }

  startGameWithState(createNewState(names));
});

loadBtn?.addEventListener("click", () => {
  const saved = loadState();
  if (!saved) {
    alert("No saved game found yet.");
    return;
  }
  startGameWithState(saved);
});

exportCsvBtn?.addEventListener("click", () => {
  if (!state?.rounds?.length) return;
  exportCsv();
});

exportJsonBtn?.addEventListener("click", () => {
  if (!state?.rounds?.length) return;
  exportJson();
});

shareSummaryBtn?.addEventListener("click", async () => {
  if (!state?.players?.length) return;
  await shareSummary();
});

resetToSetup();
