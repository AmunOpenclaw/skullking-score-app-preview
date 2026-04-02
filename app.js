const STORAGE_KEY = "skullking-score-app-v1";
const PLAYER_LIBRARY_KEY = "skullking-score-players-v1";

const SUPABASE_URL = window.SKULLKING_CONFIG?.SUPABASE_URL || "";
const SUPABASE_ANON_KEY = window.SKULLKING_CONFIG?.SUPABASE_ANON_KEY || "";
const HAS_SUPABASE_CONFIG = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

const supabaseClient =
  HAS_SUPABASE_CONFIG && window.supabase?.createClient
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

const setupEl = document.getElementById("setup");
const gameEl = document.getElementById("game");
const playerPickerEl = document.getElementById("playerPicker");
const newPlayerNameEl = document.getElementById("newPlayerName");
const addPlayerToLibraryBtn = document.getElementById("addPlayerToLibrary");
const removeSelectedLibraryBtn = document.getElementById("removeSelectedLibrary");
const startBtn = document.getElementById("startGame");
const loadBtn = document.getElementById("loadSaved");
const newGameBtn = document.getElementById("newGame");
const addPlayerBtn = document.getElementById("addPlayer");
const leavePlayerBtn = document.getElementById("leavePlayer");
const leavePlayerSelect = document.getElementById("leavePlayerSelect");
const returnPlayerBtn = document.getElementById("returnPlayer");
const returnPlayerSelect = document.getElementById("returnPlayerSelect");
const undoBtn = document.getElementById("undoRound");
const exportCsvBtn = document.getElementById("exportCsv");
const exportJsonBtn = document.getElementById("exportJson");
const shareSummaryBtn = document.getElementById("shareSummary");
const cardsInput = document.getElementById("cardsPerRound");
const roundTitle = document.getElementById("roundTitle");
const scoreboardEl = document.getElementById("scoreboard");
const entryGridEl = document.getElementById("entryGrid");
const entryNavEl = document.getElementById("entryNav");
const gridModeBtn = document.getElementById("gridModeBtn");
const turnModeBtn = document.getElementById("turnModeBtn");
const turnNavEl = document.getElementById("turnNav");
const prevPlayerBtn = document.getElementById("prevPlayerBtn");
const nextPlayerBtn = document.getElementById("nextPlayerBtn");
const turnStatusEl = document.getElementById("turnStatus");
const quickJumpEl = document.getElementById("quickJump");
const roundForm = document.getElementById("roundForm");
const saveRoundBtn = document.getElementById("saveRoundBtn");
const editModeBanner = document.getElementById("editModeBanner");
const editModeText = document.getElementById("editModeText");
const cancelEditRoundBtn = document.getElementById("cancelEditRound");
const warningEl = document.getElementById("wonWarning");
const historyHead = document.querySelector("#historyTable thead");
const historyBody = document.querySelector("#historyTable tbody");

let state = null;
let editingRoundIndex = null;
let entryMode = "grid";
let turnPlayerIndex = null;
let setupPlayerLibrary = [];
let setupSelectedPlayers = new Set();

function toInt(value) {
  const n = Number.parseInt(value, 10);
  return Number.isNaN(n) ? 0 : n;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizePlayerName(name) {
  return String(name || "").trim().replace(/\s+/g, " ");
}

function loadPlayerLibrary() {
  const raw = localStorage.getItem(PLAYER_LIBRARY_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const seen = new Set();
    return parsed
      .map((name) => normalizePlayerName(name))
      .filter((name) => {
        if (!name || seen.has(name)) return false;
        seen.add(name);
        return true;
      });
  } catch {
    return [];
  }
}

function savePlayerLibrary() {
  localStorage.setItem(PLAYER_LIBRARY_KEY, JSON.stringify(setupPlayerLibrary));
}

function ensurePlayersInLibrary(names) {
  let changed = false;
  names.map((name) => normalizePlayerName(name)).forEach((name) => {
    if (!name) return;
    if (!setupPlayerLibrary.includes(name)) {
      setupPlayerLibrary.push(name);
      changed = true;
    }
  });
  if (changed) savePlayerLibrary();
}

function renderSetupPlayerPicker() {
  if (!playerPickerEl) return;

  if (!setupPlayerLibrary.length) {
    playerPickerEl.innerHTML = '<p class="setup-hint">No saved players yet. Add one below.</p>';
  } else {
    playerPickerEl.innerHTML = setupPlayerLibrary
      .map((name) => {
        const checked = setupSelectedPlayers.has(name) ? " checked" : "";
        const selectedClass = setupSelectedPlayers.has(name) ? " is-selected" : "";
        const safeName = escapeHtml(name);
        return `<label class="player-pill${selectedClass}"><input type="checkbox" value="${safeName}"${checked} /> ${safeName}</label>`;
      })
      .join("");
  }

  if (removeSelectedLibraryBtn) {
    removeSelectedLibraryBtn.disabled = setupSelectedPlayers.size === 0;
  }
}

function initializeSetupPlayers() {
  setupPlayerLibrary = loadPlayerLibrary();
  setupSelectedPlayers = new Set();
  renderSetupPlayerPicker();
}

function scoreBase(roundNumber, bid, won) {
  if (bid === 0) {
    return won === 0 ? 10 * roundNumber : -10 * roundNumber;
  }
  if (won === bid) {
    return 20 * bid;
  }
  return -10 * Math.abs(won - bid);
}

function createNewState(playerNames) {
  return {
    version: 4,
    createdAt: Date.now(),
    players: playerNames.map((name) => ({ name, total: 0, active: true, leftAtRound: null })),
    rounds: [],
    nextCards: 1,
  };
}

function normalizeState(raw) {
  if (!raw?.players || !Array.isArray(raw.players) || raw.players.length === 0) return null;

  const players = raw.players.map((player, index) => ({
    name: String(player?.name || `Player ${index + 1}`).trim() || `Player ${index + 1}`,
    total: 0,
    active: player?.active !== false,
    leftAtRound: player?.leftAtRound ? Math.max(1, toInt(player.leftAtRound)) : null,
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
          const rascalWager = [10, 20].includes(toInt(src.rascalWager)) ? toInt(src.rascalWager) : 0;
          const rascalScore = src.rascalScore !== undefined ? toInt(src.rascalScore) : (rascalWager ? (won === bid ? rascalWager : -rascalWager) : 0);
          const base = src.base !== undefined ? toInt(src.base) : scoreBase(roundNumber, bid, won);
          const roundScore = src.roundScore !== undefined ? toInt(src.roundScore) : base + bonus + rascalScore;
          return { bid, won, bonus, rascalWager, rascalScore, base, roundScore };
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
    version: 4,
    createdAt: raw.createdAt || Date.now(),
    players,
    rounds,
    nextCards,
  };
}

function getCurrentRoundNumber() {
  return (state?.rounds?.length ?? 0) + 1;
}

function getScoringRoundNumber() {
  if (editingRoundIndex !== null && state?.rounds?.[editingRoundIndex]) {
    return state.rounds[editingRoundIndex].round;
  }
  return getCurrentRoundNumber();
}

function getActivePlayerIndices() {
  return state.players
    .map((player, index) => (player.active ? index : -1))
    .filter((index) => index >= 0);
}

function buildEmptyEntry() {
  return { bid: 0, won: 0, bonus: 0, rascalWager: 0, rascalScore: 0, base: 0, roundScore: 0 };
}

function recomputePlayerTotals() {
  state.players.forEach((player) => {
    player.total = 0;
  });
  state.rounds.forEach((round) => {
    round.entries.forEach((entry, index) => {
      state.players[index].total += toInt(entry.roundScore);
    });
  });
}

function fillEditorFromRound(round) {
  setCardsInputValue(round.cards);
  state.players.forEach((_player, index) => {
    const entry = round.entries[index] || buildEmptyEntry();
    const bidEl = document.getElementById(`bid-${index}`);
    const wonEl = document.getElementById(`won-${index}`);
    const bonusEl = document.getElementById(`bonus-${index}`);

    if (bidEl) bidEl.value = String(entry.bid ?? 0);
    if (wonEl) wonEl.value = String(entry.won ?? 0);
    if (bonusEl) bonusEl.value = String(entry.bonus ?? 0);

    const wager = [10, 20].includes(toInt(entry.rascalWager)) ? toInt(entry.rascalWager) : 0;
    const radio = document.querySelector(`input[name="rascal-${index}"][value="${wager}"]`);
    if (radio) radio.checked = true;
  });
  updateAllPreviews(true);
}


function startEditingRound(roundIndex) {
  if (!state.rounds[roundIndex]) return;
  editingRoundIndex = roundIndex;
  renderAll();
  fillEditorFromRound(state.rounds[roundIndex]);
  roundForm?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function stopEditingRound() {
  editingRoundIndex = null;
  renderAll();
}

function refreshPlayerManagementControls() {
  if (!state) return;

  const active = getActivePlayerIndices();
  if (leavePlayerSelect) {
    leavePlayerSelect.innerHTML = active
      .map((idx) => `<option value="${idx}">${state.players[idx].name}</option>`)
      .join("");
    leavePlayerSelect.disabled = active.length <= 1;
  }
  if (leavePlayerBtn) leavePlayerBtn.disabled = active.length <= 1;

  const inactive = state.players
    .map((player, index) => (!player.active ? index : -1))
    .filter((index) => index >= 0);
  if (returnPlayerSelect) {
    returnPlayerSelect.innerHTML = inactive
      .map((idx) => `<option value="${idx}">${state.players[idx].name}</option>`)
      .join("");
    returnPlayerSelect.disabled = inactive.length === 0;
  }
  if (returnPlayerBtn) returnPlayerBtn.disabled = inactive.length === 0;
}

function getVisiblePlayerIndices(showAllPlayers = false) {
  return state.players
    .map((player, index) => {
      if (showAllPlayers) return index;
      return player.active ? index : -1;
    })
    .filter((index) => index >= 0);
}

function applyEntryMode(showAllPlayers = false) {
  if (!state || !entryGridEl) return;

  const isEditing = editingRoundIndex !== null;
  entryNavEl?.classList.toggle("hidden", isEditing);

  const visible = getVisiblePlayerIndices(showAllPlayers);
  if (!visible.length) return;

  if (!visible.includes(turnPlayerIndex)) {
    turnPlayerIndex = visible[0];
  }

  const effectiveMode = isEditing ? "grid" : entryMode;
  const turnEnabled = effectiveMode === "turn";

  gridModeBtn?.classList.toggle("is-active", effectiveMode === "grid");
  turnModeBtn?.classList.toggle("is-active", effectiveMode === "turn");
  turnNavEl?.classList.toggle("hidden", !turnEnabled);
  quickJumpEl?.classList.toggle("hidden", !turnEnabled);

  entryGridEl.querySelectorAll(".entry-row").forEach((row) => {
    const rowIndex = toInt(row.dataset.index);
    const shouldHide = turnEnabled && rowIndex !== turnPlayerIndex;
    row.classList.toggle("is-hidden-turn", shouldHide);
  });

  if (!turnEnabled) {
    if (turnStatusEl) turnStatusEl.textContent = "";
    if (quickJumpEl) quickJumpEl.innerHTML = "";
    return;
  }

  const position = Math.max(0, visible.indexOf(turnPlayerIndex));
  const playerName = state.players[turnPlayerIndex]?.name || "Player";
  if (turnStatusEl) {
    turnStatusEl.textContent = `${position + 1}/${visible.length} · ${playerName}`;
  }

  if (quickJumpEl) {
    quickJumpEl.innerHTML = visible
      .map((idx) => {
        const activeClass = idx === turnPlayerIndex ? " is-active" : "";
        const fullName = state.players[idx].name || `Player ${idx + 1}`;
        const shortName = fullName.length > 12 ? `${fullName.slice(0, 11)}…` : fullName;
        const safeFull = escapeHtml(fullName);
        const safeShort = escapeHtml(shortName);
        return `<button type="button" class="chip-btn${activeClass}" data-jump-player="${idx}" title="${safeFull}" aria-label="Jump to ${safeFull}">${safeShort}</button>`;
      })
      .join("");
  }
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

function getRascalWager(index) {
  const selected = document.querySelector(`input[name="rascal-${index}"]:checked`);
  const wager = toInt(selected?.value);
  return [10, 20].includes(wager) ? wager : 0;
}

function scoreRascalWager(bid, won, wager) {
  if (!wager) return 0;
  return won === bid ? wager : -wager;
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
  renderSetupPlayerPicker();
}

function startGameWithState(nextState) {
  state = nextState;
  ensurePlayersInLibrary(nextState.players.map((p) => p.name));
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

    <div class="field field-won">
      <label class="mini-label" for="won-${index}">Won</label>
      <input id="won-${index}" name="won-${index}" type="number" min="0" max="${cardsThisRound}" value="0" required inputmode="numeric" />
      <div class="stepper">
        <button type="button" class="step-btn" data-target="won-${index}" data-delta="-1">−</button>
        <button type="button" class="step-btn" data-target="won-${index}" data-delta="1">+</button>
      </div>
    </div>

    <div class="field field-bid">
      <label class="mini-label" for="bid-${index}">Bid</label>
      <input id="bid-${index}" name="bid-${index}" type="number" min="0" max="${cardsThisRound}" value="0" required inputmode="numeric" />
      <div class="stepper">
        <button type="button" class="step-btn" data-target="bid-${index}" data-delta="-1">−</button>
        <button type="button" class="step-btn" data-target="bid-${index}" data-delta="1">+</button>
      </div>
    </div>

    <div class="field field-bonus">
      <label class="mini-label" for="bonus-${index}">Bonus</label>
      <input id="bonus-${index}" name="bonus-${index}" type="number" step="10" value="0" inputmode="numeric" />
      <div class="bonus-chips">
        <button type="button" class="chip-btn" data-target="bonus-${index}" data-add="10">+10 (14)</button>
        <button type="button" class="chip-btn" data-target="bonus-${index}" data-add="20">+20 (black14 / loot / P>Mermaid)</button>
        <button type="button" class="chip-btn" data-target="bonus-${index}" data-add="30">+30 (SK>Pirate)</button>
        <button type="button" class="chip-btn" data-target="bonus-${index}" data-add="40">+40 (Mermaid>SK)</button>
        <button type="button" class="chip-btn" data-target="bonus-${index}" data-set="0">Reset</button>
      </div>
      <div class="rascal-row">
        <span class="mini-label rascal-label">Rascal wager</span>
        <div class="rascal-wager" role="radiogroup" aria-label="Rascal wager">
          <label class="rascal-seg"><input type="radio" name="rascal-${index}" value="0" checked /><span>—</span></label>
          <label class="rascal-seg"><input type="radio" name="rascal-${index}" value="10" /><span>10</span></label>
          <label class="rascal-seg"><input type="radio" name="rascal-${index}" value="20" /><span>20</span></label>
        </div>
      </div>
    </div>

    <div class="field field-preview">
      <div class="mini-label">Score</div>
      <div id="preview-${index}" class="preview">0</div>
    </div>
  `;

  return row;
}

function renderEntryGrid(showAllPlayers = false) {
  const cardsThisRound = getCurrentCardsPerRound();
  entryGridEl.innerHTML = "";
  state.players.forEach((player, index) => {
    if (!showAllPlayers && !player.active) return;
    entryGridEl.appendChild(buildEntryRow(player, index, cardsThisRound));
  });
  bindLivePreview(showAllPlayers);
}

function getWonTotalFromInputs() {
  return state.players.reduce((sum, _player, index) => {
    const input = document.getElementById(`won-${index}`);
    return sum + toInt(input?.value);
  }, 0);
}

function recalcWarning() {
  const cardsThisRound = getCurrentCardsPerRound();
  const wonTotal = getWonTotalFromInputs();

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
  const scoringRoundNumber = getScoringRoundNumber();
  const bid = normalizedFieldValue(`bid-${index}`, cardsThisRound);
  const won = normalizedFieldValue(`won-${index}`, cardsThisRound);
  const bonus = toInt(document.getElementById(`bonus-${index}`)?.value);
  const rascalWager = getRascalWager(index);
  const rascalScore = scoreRascalWager(bid, won, rascalWager);
  const score = scoreBase(scoringRoundNumber, bid, won) + bonus + rascalScore;
  const preview = document.getElementById(`preview-${index}`);
  if (preview) {
    preview.textContent = String(score);
    preview.classList.remove("is-positive", "is-negative", "is-zero");
    if (score > 0) preview.classList.add("is-positive");
    else if (score < 0) preview.classList.add("is-negative");
    else preview.classList.add("is-zero");
  }
}

function updateAllPreviews(showAllPlayers = false) {
  state.players.forEach((player, index) => {
    if (!showAllPlayers && !player.active) return;
    updateRowPreview(index);
  });
  recalcWarning();
}

function bindLivePreview(showAllPlayers = false) {
  state.players.forEach((player, index) => {
    if (!showAllPlayers && !player.active) return;
    ["bid", "won", "bonus"].forEach((key) => {
      const el = document.getElementById(`${key}-${index}`);
      if (!el) return;
      el.addEventListener("input", () => {
        updateRowPreview(index);
        recalcWarning();
      });
    });

    document.querySelectorAll(`input[name="rascal-${index}"]`).forEach((input) => {
      input.addEventListener("change", () => {
        updateRowPreview(index);
      });
    });

    updateRowPreview(index);
  });

  recalcWarning();
}

function renderScoreboard() {
  const sorted = [...state.players].sort((a, b) => b.total - a.total);
  const topActiveName = sorted.find((p) => p.active)?.name;
  scoreboardEl.innerHTML = "";
  sorted.forEach((player, index) => {
    const card = document.createElement("article");
    const isLeader = player.active && player.name === topActiveName;
    card.className = `score-card${isLeader ? " is-leader" : ""}${player.active ? "" : " is-inactive"}`;
    const leftTag = player.active ? "" : ' <span class="player-left-tag">left</span>';
    card.innerHTML = `<div class="score-rank">#${index + 1}</div><div class="name">${player.name}${leftTag}</div><div class="total">${player.total}</div>`;
    scoreboardEl.appendChild(card);
  });
}

function renderHistory() {
  historyHead.innerHTML = "";
  historyBody.innerHTML = "";

  const header = document.createElement("tr");
  header.innerHTML = `<th>Round</th><th>Cards</th>${state.players.map((p) => `<th>${p.name}${p.active ? "" : " (left)"}</th>`).join("")}<th>Actions</th>`;
  historyHead.appendChild(header);

  state.rounds.forEach((round, roundIndex) => {
    const row = document.createElement("tr");
    row.innerHTML = `<td>${round.round}</td><td>${round.cards}</td>${round.entries
      .map((entry) => `<td>${entry.roundScore}</td>`)
      .join("")}<td class="history-actions"><button type="button" class="btn btn-ghost btn-small" data-edit-round="${roundIndex}">Edit</button><button type="button" class="btn btn-danger btn-small" data-delete-round="${roundIndex}">Delete</button></td>`;
    historyBody.appendChild(row);
  });

  const totals = document.createElement("tr");
  totals.innerHTML = `<td><strong>Total</strong></td><td>—</td>${state.players
    .map((p) => `<td><strong>${p.total}</strong></td>`)
    .join("")}<td>—</td>`;
  historyBody.appendChild(totals);
}

function renderRoundTitle() {
  const current = getCurrentRoundNumber();
  if (editingRoundIndex !== null) {
    const editedRound = state.rounds[editingRoundIndex];
    roundTitle.textContent = `Editing round ${editedRound?.round ?? current}`;
    if (editModeText) editModeText.textContent = `Editing previous round #${editedRound?.round ?? current}`;
    editModeBanner?.classList.remove("hidden");
    if (saveRoundBtn) saveRoundBtn.textContent = "Save changes";
  } else {
    roundTitle.textContent = `Round ${current}`;
    editModeBanner?.classList.add("hidden");
    if (saveRoundBtn) saveRoundBtn.textContent = "Save round";
  }
  roundForm.classList.remove("hidden");
}

function renderAll() {
  renderRoundTitle();
  renderScoreboard();
  renderHistory();

  const showAllPlayers = editingRoundIndex !== null;
  setCardsInputValue(state.nextCards || 1);
  renderEntryGrid(showAllPlayers);
  applyEntryMode(showAllPlayers);

  const hasRounds = state.rounds.length > 0;
  undoBtn.disabled = !hasRounds;
  exportCsvBtn.disabled = !hasRounds;
  exportJsonBtn.disabled = !hasRounds;
  shareSummaryBtn.disabled = state.players.length === 0;
  refreshPlayerManagementControls();
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
  const isEditing = editingRoundIndex !== null;
  const scoringRoundNumber = isEditing ? state.rounds[editingRoundIndex].round : roundNum;

  const wonTotal = getWonTotalFromInputs();
  if (wonTotal !== cardsThisRound) {
    const proceed = confirm(
      `Heads-up: tricks won total is ${wonTotal}, but cards this round is ${cardsThisRound}.

` +
        "This can be valid if Kraken cancels a trick. Save anyway?"
    );
    if (!proceed) return;
  }

  const entries = state.players.map((player, index) => {
    const bidEl = document.getElementById(`bid-${index}`);
    const wonEl = document.getElementById(`won-${index}`);
    const bonusEl = document.getElementById(`bonus-${index}`);

    if (!bidEl || !wonEl || !bonusEl) {
      if (isEditing) return state.rounds[editingRoundIndex]?.entries?.[index] || buildEmptyEntry();
      if (!player.active) return buildEmptyEntry();
      return buildEmptyEntry();
    }

    const bid = clampForRound(bidEl.value, cardsThisRound);
    const won = clampForRound(wonEl.value, cardsThisRound);
    const bonus = toInt(bonusEl.value);
    const rascalWager = getRascalWager(index);
    const rascalScore = scoreRascalWager(bid, won, rascalWager);
    const base = scoreBase(scoringRoundNumber, bid, won);
    const roundScore = base + bonus + rascalScore;

    return { bid, won, bonus, rascalWager, rascalScore, base, roundScore };
  });

  if (isEditing) {
    const originalRoundNumber = state.rounds[editingRoundIndex].round;
    state.rounds[editingRoundIndex] = { round: originalRoundNumber, cards: cardsThisRound, entries };
    recomputePlayerTotals();
    state.nextCards = state.rounds.length > 0 ? state.rounds[state.rounds.length - 1].cards + 1 : 1;
    editingRoundIndex = null;
  } else {
    state.rounds.push({ round: roundNum, cards: cardsThisRound, entries });
    state.players.forEach((player, index) => {
      player.total += entries[index].roundScore;
    });
    state.nextCards = cardsThisRound + 1;
  }

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

historyBody?.addEventListener("click", (event) => {
  const editBtn = event.target.closest("button[data-edit-round]");
  if (editBtn) {
    const roundIndex = toInt(editBtn.dataset.editRound);
    if (Number.isNaN(roundIndex)) return;
    startEditingRound(roundIndex);
    return;
  }

  const deleteBtn = event.target.closest("button[data-delete-round]");
  if (deleteBtn) {
    const roundIndex = toInt(deleteBtn.dataset.deleteRound);
    if (Number.isNaN(roundIndex) || !state.rounds[roundIndex]) return;

    const roundNumber = state.rounds[roundIndex].round;
    const proceed = confirm(`Delete round ${roundNumber}? This cannot be undone.`);
    if (!proceed) return;

    state.rounds.splice(roundIndex, 1);
    state.rounds.forEach((round, idx) => {
      round.round = idx + 1;
    });

    recomputePlayerTotals();
    state.nextCards = state.rounds.length > 0 ? state.rounds[state.rounds.length - 1].cards + 1 : 1;
    editingRoundIndex = null;

    saveState();
    renderAll();
  }
});

undoBtn?.addEventListener("click", () => {
  if (!state.rounds.length) return;
  const removed = state.rounds.pop();
  state.players.forEach((player, index) => {
    player.total -= toInt(removed.entries?.[index]?.roundScore);
  });
  state.nextCards = state.rounds.length > 0 ? state.rounds[state.rounds.length - 1].cards + 1 : 1;
  saveState();
  renderAll();
});

newGameBtn?.addEventListener("click", () => {
  if (!confirm("Start a new game? Current score will be replaced.")) return;
  setupSelectedPlayers = new Set(state?.players?.map((p) => p.name) || []);
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

playerPickerEl?.addEventListener("change", (event) => {
  const input = event.target.closest('input[type="checkbox"]');
  if (!input) return;
  const name = normalizePlayerName(input.value);
  if (!name) return;

  if (input.checked) setupSelectedPlayers.add(name);
  else setupSelectedPlayers.delete(name);

  renderSetupPlayerPicker();
});

addPlayerToLibraryBtn?.addEventListener("click", () => {
  const name = normalizePlayerName(newPlayerNameEl?.value);
  if (!name) {
    alert("Enter a player name.");
    return;
  }

  if (!setupPlayerLibrary.includes(name)) {
    setupPlayerLibrary.push(name);
    savePlayerLibrary();
  }

  setupSelectedPlayers.add(name);
  if (newPlayerNameEl) newPlayerNameEl.value = "";
  renderSetupPlayerPicker();
});

newPlayerNameEl?.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  addPlayerToLibraryBtn?.click();
});

removeSelectedLibraryBtn?.addEventListener("click", () => {
  if (setupSelectedPlayers.size === 0) return;

  const count = setupSelectedPlayers.size;
  const proceed = confirm(`Remove ${count} selected player${count > 1 ? "s" : ""} from saved list?`);
  if (!proceed) return;

  setupPlayerLibrary = setupPlayerLibrary.filter((name) => !setupSelectedPlayers.has(name));
  setupSelectedPlayers.clear();
  savePlayerLibrary();
  renderSetupPlayerPicker();
});

startBtn?.addEventListener("click", () => {
  const names = setupPlayerLibrary.filter((name) => setupSelectedPlayers.has(name));

  if (names.length < 1) {
    alert("Select at least 1 player.");
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

addPlayerBtn?.addEventListener("click", () => {
  if (!state) return;
  const name = prompt("New player name:")?.trim();
  if (!name) return;

  state.players.push({ name, total: 0, active: true, leftAtRound: null });
  state.rounds.forEach((round) => {
    round.entries.push(buildEmptyEntry());
  });
  ensurePlayersInLibrary([name]);

  saveState();
  renderAll();
});

leavePlayerBtn?.addEventListener("click", () => {
  if (!state) return;
  const active = getActivePlayerIndices();
  if (active.length <= 1) {
    alert("At least one active player is required.");
    return;
  }

  const idx = toInt(leavePlayerSelect?.value);
  if (!state.players[idx] || !state.players[idx].active) return;

  const playerName = state.players[idx].name;
  if (!confirm(`${playerName} leaves the game?`)) return;

  state.players[idx].active = false;
  state.players[idx].leftAtRound = getCurrentRoundNumber();

  saveState();
  renderAll();
});

returnPlayerBtn?.addEventListener("click", () => {
  if (!state) return;
  const idx = toInt(returnPlayerSelect?.value);
  if (!state.players[idx] || state.players[idx].active) return;

  const playerName = state.players[idx].name;
  if (!confirm(`${playerName} returns to the game?`)) return;

  state.players[idx].active = true;
  state.players[idx].leftAtRound = null;

  saveState();
  renderAll();
});

cancelEditRoundBtn?.addEventListener("click", () => {
  stopEditingRound();
});

gridModeBtn?.addEventListener("click", () => {
  entryMode = "grid";
  applyEntryMode(editingRoundIndex !== null);
});

turnModeBtn?.addEventListener("click", () => {
  entryMode = "turn";
  applyEntryMode(editingRoundIndex !== null);
});

prevPlayerBtn?.addEventListener("click", () => {
  const visible = getVisiblePlayerIndices(editingRoundIndex !== null);
  if (!visible.length) return;
  const currentPos = Math.max(0, visible.indexOf(turnPlayerIndex));
  const nextPos = (currentPos - 1 + visible.length) % visible.length;
  turnPlayerIndex = visible[nextPos];
  applyEntryMode(editingRoundIndex !== null);
});

nextPlayerBtn?.addEventListener("click", () => {
  const visible = getVisiblePlayerIndices(editingRoundIndex !== null);
  if (!visible.length) return;
  const currentPos = Math.max(0, visible.indexOf(turnPlayerIndex));
  const nextPos = (currentPos + 1) % visible.length;
  turnPlayerIndex = visible[nextPos];
  applyEntryMode(editingRoundIndex !== null);
});

quickJumpEl?.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-jump-player]");
  if (!button) return;
  turnPlayerIndex = toInt(button.dataset.jumpPlayer);
  applyEntryMode(editingRoundIndex !== null);
});

initializeSetupPlayers();
resetToSetup();
