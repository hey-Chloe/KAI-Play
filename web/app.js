import {
  MERGE_1048_TARGET,
  advanceMahjongBotTurn,
  canMove1048,
  compareThreeCard,
  evaluateThreeCard,
  move1048,
  new1048Game,
  newMahjongGame,
  newThreeCardRound,
  playMahjongDiscard,
  restore1048Game,
  sortMahjong,
  spinSlots,
} from './casual-games.js';
import {
  SUDOKU6_DIFFICULTIES,
  SUDOKU6_MAX_HINTS,
  enterSudoku6Value,
  getSudoku6Conflicts,
  hintSudoku6,
  newSudoku6Game,
  restoreSudoku6Game,
  sudoku6NoteValues,
  sudoku6PeerIndexes,
  undoSudoku6,
} from './sudoku6.js';
import {
  XIANGQI_DIFFICULTIES,
  chooseXiangqiMove,
  getLegalXiangqiMoves,
  isXiangqiInCheck,
  newXiangqiGame,
  playXiangqiMove,
  restoreXiangqiGame,
  undoXiangqiToHumanTurn,
  xiangqiPieceLabel,
} from './xiangqi.js';
import {
  MINESWEEPER_DIFFICULTIES,
  chordMinesweeperCell,
  getMinesweeperCell,
  getMinesweeperRemainingMines,
  newMinesweeperGame,
  restoreMinesweeperGame,
  revealMinesweeperCell,
  toggleMinesweeperFlag,
} from './minesweeper.js';
import {
  SNAKE_DIFFICULTIES,
  advanceSnake,
  newSnakeGame,
  restoreSnakeGame,
  setSnakeDirection,
  toggleSnakePause,
} from './snake.js';
import {
  GOMOKU_CELL_COUNT,
  GOMOKU_SIZE,
  loadGomokuGame,
  newGomokuGame,
  playGomokuHumanMove,
  saveGomokuGame,
} from './gomoku.js';
import {
  MEMORY_MATCH_DIFFICULTIES,
  advanceMemoryMatchTime,
  flipMemoryMatchCard,
  getMemoryMatchCard,
  loadMemoryMatchSession,
  newMemoryMatchGame,
  resolveMemoryMatchMismatch,
  saveMemoryMatchSession,
} from './memory-match.js';

const API = '/api';
const app = document.querySelector('#app');
const toastNode = document.querySelector('#toast');
const LEGACY_TOKEN_KEY = 'doujoy.web.token';
const TOKEN_KEY = 'kai.play.token';
const HERO_GAME_KEY = 'kai.play.hero-game';
const MERGE_1048_SAVE_KEY = 'kai.play.1048.game';
const SUDOKU6_PRACTICE_SAVE_KEY = 'kai.play.sudoku6.practice.v1';
const SUDOKU6_DAILY_SAVE_PREFIX = 'kai.play.sudoku6.daily.v1.';
const SUDOKU6_LAST_MODE_KEY = 'kai.play.sudoku6.last-mode';
const SUDOKU6_STATS_KEY = 'kai.play.sudoku6.stats.v1';
const XIANGQI_SAVE_KEY = 'kai.play.xiangqi.game.v1';
const XIANGQI_DIFFICULTY_KEY = 'kai.play.xiangqi.difficulty.v1';
const XIANGQI_TUTORIAL_KEY = 'kai.play.xiangqi.tutorial.v1';
const MINESWEEPER_SAVE_KEY = 'kai.play.minesweeper.game.v1';
const MINESWEEPER_DIFFICULTY_KEY = 'kai.play.minesweeper.difficulty.v1';
const SNAKE_SAVE_KEY = 'kai.play.snake.game.v1';
const SNAKE_DIFFICULTY_KEY = 'kai.play.snake.difficulty.v1';
const SNAKE_BEST_KEY = 'kai.play.snake.best.v1';
const LAST_LOCAL_GAME_KEY = 'kai.play.last-local-game';
const LOCAL_GAME_IDS = new Set(['xiangqi', '1048', 'sudoku6', 'minesweeper', 'gomoku', 'memory', 'snake']);
const CATALOG_DISCOVERY = Object.freeze({
  ddz: { categories:['card','competitive'], search:'斗地主 ddz dou dizhu fighting the landlord 扑克 牌桌 三人 竞技 快速人机' },
  xiangqi: { categories:['board','save'], search:'KAI 象棋 中国象棋 xiangqi chinese chess 棋类 策略 人机 自动保存' },
  gomoku: { categories:['board','save'], search:'KAI 五子棋 gomoku five in a row 连五 棋类 策略 人机 自动保存' },
  mahjong: { categories:['card'], search:'KAI 麻将 麻雀 mahjong 牌桌 四人 人机' },
  '1048': { categories:['puzzle','quick','save'], search:'1048 2048 数字 合并 益智 短局 自动保存' },
  sudoku6: { categories:['puzzle','quick','save'], search:'KAI 数独 sudoku 逻辑 填数 益智 短局 自动保存' },
  minesweeper: { categories:['puzzle','quick','save'], search:'KAI 扫雷 minesweeper 雷区 推理 益智 短局 自动保存' },
  memory: { categories:['puzzle','quick','save'], search:'KAI 记忆翻牌 memory match 配对 记忆 益智 短局 自动保存' },
  snake: { categories:['arcade','quick','save'], search:'KAI 贪吃蛇 snake 反应 街机 即时 短局 自动保存' },
  three: { categories:['card','quick'], search:'炸金花 zha jin hua three card poker 三张牌 扑克 牌桌 比牌 短局' },
  reels: { categories:['arcade','quick'], search:'算力转轮 转轮 reels slots spin 轻娱乐 街机 短局' },
});
const TURN_TIMEOUT_MS = 45_000;
const DEAL_ANIMATION_MS = 3_750;
function safeStorageGet(key) {
  try { return globalThis.localStorage?.getItem(key) ?? null; } catch { return null; }
}
function safeStorageSet(key, value) {
  try {
    const storage = globalThis.localStorage;
    if (!storage) return false;
    const serialized = String(value);
    storage.setItem(key, serialized);
    return storage.getItem(key) === serialized;
  } catch { return false; }
}
function safeStorageRemove(key) {
  try { globalThis.localStorage?.removeItem(key); return true; } catch { return false; }
}
function rememberLastLocalGame(game) {
  return LOCAL_GAME_IDS.has(game) && safeStorageSet(LAST_LOCAL_GAME_KEY, game);
}
const storedHeroGame = safeStorageGet(HERO_GAME_KEY);
const state = { token: safeStorageGet(TOKEN_KEY) || safeStorageGet(LEGACY_TOKEN_KEY), profile: null, view: 'lobby', game: null, room: null, history: null, historyStatus: 'idle', historyError: '', selected: new Set(), busy: false, error: '', dealingGameId: null, dealTimer: null, waitController: null, roomWaitController: null, exitConfirm: false, roomExitConfirm: false, casual: null, heroGame: storedHeroGame === 'mahjong' ? 'mahjong' : 'ddz' };
let heroPointer = null;
let merge1048Pointer = null;
let heroTransitionTimer = null;
let mahjongBotTimer = null;
let xiangqiAiTimer = null;
let minesweeperLongPress = null;
let minesweeperSuppressedClick = null;
let snakeTimer = null;
let memoryMismatchTimer = null;
let snakePointer = null;
let toastTimer = null;
let threeRevealTimer = null;
let slotSpinTimer = null;
let worldCarouselStatusFramePending = false;
let worldCarouselPendingStrip = null;

const SYNC_TERMINAL_STATUSES = new Set([401, 403, 404]);

function syncRetryDelay(signal, failureCount) {
  const exponential = Math.min(8_000, 750 * (2 ** Math.min(failureCount, 4)));
  const delay = exponential + Math.floor(Math.random() * 251);
  return new Promise(resolve => {
    if (signal.aborted) { resolve(); return; }
    const onAbort = () => { clearTimeout(timer); resolve(); };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, delay);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

function isTerminalSyncError(error) {
  return SYNC_TERMINAL_STATUSES.has(Number(error?.status));
}

const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const money = value => new Intl.NumberFormat('zh-CN').format(value || 0);
const rank = n => ({3:'3',4:'4',5:'5',6:'6',7:'7',8:'8',9:'9',10:'10',11:'J',12:'Q',13:'K',14:'A',15:'2',16:'小王',17:'大王'}[n] || n);
const suit = s => ({spade:'♠',heart:'♥',club:'♣',diamond:'♦',joker:'★'}[s] || '');
const isRed = c => c.suit === 'heart' || c.suit === 'diamond';
const toast = msg => {
  if (toastTimer) clearTimeout(toastTimer);
  toastNode.textContent = msg;
  toastNode.classList.add('show');
  toastTimer = setTimeout(() => { toastNode.classList.remove('show'); toastTimer = null; }, 2200);
};
const requestId = () => globalThis.crypto?.randomUUID?.() || `web-${Date.now()}-${Math.random().toString(16).slice(2)}`;

function safeLocalCounter(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : 0;
}

function loadSaved1048Game() {
  try {
    const raw = safeStorageGet(MERGE_1048_SAVE_KEY);
    if (!raw) return null;
    const game = restore1048Game(JSON.parse(raw));
    if (!game) safeStorageRemove(MERGE_1048_SAVE_KEY);
    return game;
  } catch {
    safeStorageRemove(MERGE_1048_SAVE_KEY);
    return null;
  }
}

function save1048Game(game) {
  safeStorageSet(MERGE_1048_SAVE_KEY, JSON.stringify(game));
}

function loadSavedXiangqiSession() {
  try {
    const raw = safeStorageGet(XIANGQI_SAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const game = restoreXiangqiGame(parsed?.game || parsed);
    if (!game) {
      safeStorageRemove(XIANGQI_SAVE_KEY);
      return null;
    }
    return {
      game,
      elapsedSeconds: safeLocalCounter(parsed?.elapsedSeconds),
      undoCount: safeLocalCounter(parsed?.undoCount),
    };
  } catch {
    safeStorageRemove(XIANGQI_SAVE_KEY);
    return null;
  }
}

function saveXiangqiSession(casual = state.casual) {
  if (!casual?.game || casual.kind !== 'xiangqi') return false;
  const gameSaved = safeStorageSet(XIANGQI_SAVE_KEY, JSON.stringify({
    game: casual.game,
    elapsedSeconds: safeLocalCounter(casual.elapsedSeconds),
    undoCount: safeLocalCounter(casual.undoCount),
  }));
  const difficultySaved = safeStorageSet(XIANGQI_DIFFICULTY_KEY, casual.game.difficulty || 'beginner');
  casual.saveAvailable = gameSaved && difficultySaved;
  return casual.saveAvailable;
}

function loadSavedMinesweeperGame() {
  try {
    const raw = safeStorageGet(MINESWEEPER_SAVE_KEY);
    if (!raw) return null;
    const game = restoreMinesweeperGame(JSON.parse(raw));
    if (!game) safeStorageRemove(MINESWEEPER_SAVE_KEY);
    return game;
  } catch {
    safeStorageRemove(MINESWEEPER_SAVE_KEY);
    return null;
  }
}

function saveMinesweeperGame(game, casual = state.casual, { force = false } = {}) {
  if (!game || casual?.kind !== 'minesweeper') return false;
  const serialized = JSON.stringify(game);
  const stored = safeStorageGet(MINESWEEPER_SAVE_KEY);
  if (!force && typeof casual.minesweeperPersistedSnapshot === 'string' && stored !== casual.minesweeperPersistedSnapshot) {
    casual.saveAvailable = false;
    casual.saveConflict = true;
    return false;
  }
  const gameSaved = safeStorageSet(MINESWEEPER_SAVE_KEY, serialized);
  const difficultySaved = safeStorageSet(MINESWEEPER_DIFFICULTY_KEY, game.difficulty || 'beginner');
  casual.saveAvailable = gameSaved && difficultySaved;
  casual.saveConflict = false;
  if (gameSaved) casual.minesweeperPersistedSnapshot = serialized;
  return casual.saveAvailable;
}

function loadSavedSnakeGame() {
  try {
    const raw = safeStorageGet(SNAKE_SAVE_KEY);
    if (!raw) return null;
    const game = restoreSnakeGame(JSON.parse(raw));
    if (!game) safeStorageRemove(SNAKE_SAVE_KEY);
    return game;
  } catch {
    safeStorageRemove(SNAKE_SAVE_KEY);
    return null;
  }
}

function loadSnakeBest() {
  const value = Number(safeStorageGet(SNAKE_BEST_KEY));
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function saveSnakeGame(game, casual = state.casual) {
  if (!game || casual?.kind !== 'snake') return false;
  const gameSaved = safeStorageSet(SNAKE_SAVE_KEY, JSON.stringify(game));
  const difficultySaved = safeStorageSet(SNAKE_DIFFICULTY_KEY, game.difficulty || 'normal');
  const best = Math.max(loadSnakeBest(), safeLocalCounter(game.score));
  const bestSaved = safeStorageSet(SNAKE_BEST_KEY, String(best));
  casual.saveAvailable = gameSaved && difficultySaved && bestSaved;
  return casual.saveAvailable;
}

function localDateKey(date = new Date()) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function sudoku6SaveKey(mode, date = localDateKey()) {
  return mode === 'daily' ? `${SUDOKU6_DAILY_SAVE_PREFIX}${date}` : SUDOKU6_PRACTICE_SAVE_KEY;
}

function loadSavedSudoku6Game(mode = null) {
  try {
    const lastMode = safeStorageGet(SUDOKU6_LAST_MODE_KEY) === 'daily' ? 'daily' : 'practice';
    const modes = mode ? [mode] : [lastMode, lastMode === 'daily' ? 'practice' : 'daily'];
    for (const candidate of modes) {
      const key = sudoku6SaveKey(candidate);
      const raw = safeStorageGet(key);
      if (!raw) continue;
      let game = null;
      try { game = restoreSudoku6Game(JSON.parse(raw)); }
      catch { /* Damaged JSON is removed below. */ }
      if (game && game.mode === candidate && (candidate !== 'daily' || game.date === localDateKey())) return game;
      safeStorageRemove(key);
    }
  } catch {
    /* Storage can be unavailable or contain damaged JSON; a fresh puzzle remains playable. */
  }
  return null;
}

function saveSudoku6Game(game) {
  try {
    safeStorageSet(sudoku6SaveKey(game.mode, game.date || localDateKey()), JSON.stringify(game));
    safeStorageSet(SUDOKU6_LAST_MODE_KEY, game.mode);
  } catch { /* The game remains playable without persistence. */ }
}

function loadSudoku6Stats() {
  try {
    const value = JSON.parse(safeStorageGet(SUDOKU6_STATS_KEY) || '{}');
    if (!value || typeof value !== 'object') return {};
    return Object.fromEntries(Object.entries(value).filter(([, seconds]) => Number.isSafeInteger(seconds) && seconds > 0));
  } catch { return {}; }
}

function sudoku6StatKey(game) {
  return game.mode === 'daily' ? `daily:${game.puzzleId}` : game.difficulty;
}

function recordSudoku6Best(game) {
  if (game.status !== 'completed' || game.hintsUsed !== 0 || !Number.isSafeInteger(game.elapsedSeconds) || game.elapsedSeconds <= 0) return;
  try {
    const stats = loadSudoku6Stats();
    const key = sudoku6StatKey(game);
    const previous = stats[key];
    if (!Number.isSafeInteger(previous) || game.elapsedSeconds < previous) {
      stats[key] = game.elapsedSeconds;
      safeStorageSet(SUDOKU6_STATS_KEY, JSON.stringify(stats));
    }
  } catch { /* Best times are optional; completion remains valid. */ }
}

function formatSudoku6Time(totalSeconds) {
  const seconds = Math.max(0, Number(totalSeconds) || 0);
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function syncFailureNotice() {
  if (!state.error || !state.error.includes('同步已停止')) return '';
  return `<aside class="route-sync-error" role="alert"><div><b>连接已经停止</b><span>${esc(state.error)}</span></div><button class="btn" data-action="retry-sync">重新连接</button></aside>`;
}

async function api(path, options = {}) {
  const fetchOptions = { ...options };
  const externalSignal = fetchOptions.signal;
  const controller = new AbortController();
  const forwardAbort = () => controller.abort();
  if (externalSignal?.aborted) controller.abort();
  else externalSignal?.addEventListener('abort', forwardAbort, { once: true });
  fetchOptions.signal = controller.signal;
  const timeoutMs = path.includes('/wait?') ? 30_000 : 12_000;
  let timedOut = false;
  const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  let res;
  let body;
  try {
    res = await fetch(`${API}${path}`, { ...fetchOptions, headers: { 'content-type':'application/json', ...(state.token ? {'x-doujoy-token':state.token} : {}), ...options.headers } });
    body = await res.json().catch(error => {
      if (controller.signal.aborted) throw error;
      return {};
    });
  } catch (error) {
    if (timedOut) {
      const timeoutError = new Error('请求超时，请检查网络后重试。');
      timeoutError.code = 'REQUEST_TIMEOUT';
      timeoutError.status = 0;
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    externalSignal?.removeEventListener('abort', forwardAbort);
  }
  if (!res.ok || !body.ok) {
    const error = new Error(body?.error?.message || `请求失败（${res.status}）`);
    error.code = body?.error?.code || 'REQUEST_FAILED';
    error.status = res.status;
    throw error;
  }
  return body;
}

function acceptGame(nextGame, nextProfile = null) {
  const current = state.game;
  if (!nextGame || !current || current.id !== nextGame.id) return false;
  if (Number(nextGame.sequence) < Number(current.sequence)) return false;
  state.game = nextGame;
  if (nextProfile) state.profile = nextProfile;
  return true;
}

async function bootstrap() {
  try {
    if (state.token) {
      try { state.profile = (await api('/v1/me')).profile; }
      catch (error) {
        if (error.status !== 401) throw error;
        state.token = null;
        safeStorageRemove(TOKEN_KEY);
        safeStorageRemove(LEGACY_TOKEN_KEY);
      }
    }
    if (!state.token) {
      const session = await api('/v1/sessions/guest', {method:'POST', body:'{}'});
      state.token = session.token; state.profile = session.profile;
      safeStorageSet(TOKEN_KEY, state.token);
    }
    const resumed = await api('/v1/resume');
    if (resumed.game) enterGame(resumed.game);
    else if (resumed.room) { state.room = resumed.room; state.view = 'room'; startRoomSync(); }
  } catch (e) { state.error = `无法连接后端：${e.message}`; }
  render();
}

function header(mode = 'default') {
  const name = state.profile?.name || '正在登录';
  const lobbyMode = mode === 'lobby';
  const brandControl = mode === 'room' ? 'data-action="open-room-exit" aria-label="退出好友房"' : 'data-view="lobby" aria-label="返回 KAI PLAY 大厅"';
  return `<header class="topbar ${lobbyMode?'topbar-lobby':''}"><button class="brand brand-button brand-wordmark" data-wordmark ${brandControl}><div class="logo"><span></span>K</div><span class="wordmark"><b>KAI</b><em>PLAY</em>${lobbyMode?'':'<small>牌桌游乐场</small>'}</span></button><div class="top-actions">${lobbyMode?'':`<div class="player-chip"><span class="player-avatar">${esc(name.slice(0,1))}</span><span><b>${esc(name)}</b><small>${tierName(state.profile)}</small></span></div>`}<div class="score-pill"><small>竞技分</small><strong>${money(competitiveScore(state.profile))}</strong></div></div></header>`;
}

function competitiveScore(profile) { return Math.max(0, Number(profile?.balance) || 0); }
function winRatePercent(profile) {
  const value = Math.max(0, Number(profile?.winRate) || 0);
  return Math.min(100, Math.round(value));
}
function tierName(profile) {
  const score = competitiveScore(profile);
  if (score >= 12000) return '星域段位';
  if (score >= 8000) return '跃迁段位';
  if (score >= 4000) return '巡航段位';
  return '启航段位';
}

function lobby() {
  const p = state.profile || {games:0,wins:0,winRate:0,name:'游客'};
  const firstGame = (Number(p.games) || 0) === 0;
  const savedXiangqi = loadSavedXiangqiSession();
  const saved1048 = loadSaved1048Game();
  const savedSudoku6 = loadSavedSudoku6Game();
  const savedMinesweeper = loadSavedMinesweeperGame();
  const savedGomoku = loadGomokuGame();
  const memorySession = loadMemoryMatchSession() || { restored:false, game:null };
  const savedMemory = memorySession.restored ? memorySession.game : null;
  const savedSnake = loadSavedSnakeGame();
  const canContinueMinesweeper = savedMinesweeper?.status === 'playing' && Number(savedMinesweeper.revealedCount) > 0;
  const canContinueSudoku6 = savedSudoku6?.status === 'playing'
    && (savedSudoku6.values.some((value, index) => savedSudoku6.puzzle[index] === 0 && value !== 0)
      || (savedSudoku6.notes || []).some((mask) => mask !== 0));
  const canContinue1048 = saved1048?.status === 'playing' && Number(saved1048.moves) > 0;
  const canContinueXiangqi = savedXiangqi?.game?.status === 'playing'
    && (Number(savedXiangqi.game.moveCount) > 0 || savedXiangqi.game.history?.length > 0);
  const canContinueGomoku = savedGomoku?.status === 'playing' && Number(savedGomoku.moveCount) > 0;
  const canContinueMemory = savedMemory?.status === 'playing'
    && (Number(savedMemory.moveCount) > 0 || savedMemory.faceUp?.length > 0 || Number(savedMemory.matchedPairs) > 0);
  const canContinueSnake = ['playing','paused'].includes(savedSnake?.status) && Number(savedSnake.ticks) > 0;
  const xiangqiAction = !savedXiangqi || (savedXiangqi.game.status === 'playing' && !canContinueXiangqi) ? '执红开局' : canContinueXiangqi ? '继续对局' : '查看战果';
  const merge1048Action = !saved1048 || (saved1048.status === 'playing' && !canContinue1048) ? '开始合并' : canContinue1048 ? '继续上局' : '查看上局';
  const sudoku6Action = !savedSudoku6 || (savedSudoku6.status === 'playing' && !canContinueSudoku6) ? '开始数独' : canContinueSudoku6 ? '继续上局' : '查看成绩';
  const minesweeperAction = !savedMinesweeper || !canContinueMinesweeper && ['ready','playing'].includes(savedMinesweeper.status) ? '开始排雷' : canContinueMinesweeper ? '继续排雷' : '查看上局';
  const gomokuAction = !savedGomoku || (savedGomoku.status === 'playing' && !canContinueGomoku) ? '执黑开局' : canContinueGomoku ? '继续对局' : '查看战果';
  const memoryAction = !savedMemory || (savedMemory.status === 'ready' && !canContinueMemory) ? '开始配对' : canContinueMemory ? '继续配对' : '查看成绩';
  const snakeAction = !savedSnake || !canContinueSnake && ['ready','playing','paused'].includes(savedSnake.status) ? '开始穿行' : canContinueSnake ? '继续穿行' : '查看上轮';
  const minesweeperPreview = ['covered','covered','covered','covered','covered','covered','covered','one','one','one','covered','covered','covered','one','empty','two','flag','covered','covered','one','one','two','covered','covered','covered','covered','covered','covered','covered','covered','covered','covered','covered','covered','covered','covered']
    .map((cell) => `<i class="${cell}">${cell === 'one' ? '1' : cell === 'two' ? '2' : cell === 'flag' ? '⚑' : ''}</i>`).join('');
  const resumeCandidates = [];
  if (canContinueMinesweeper) {
    const safeCells = savedMinesweeper.rows * savedMinesweeper.columns - savedMinesweeper.mineCount;
    const completed = Math.min(safeCells, Number(savedMinesweeper.revealedCount) || 0);
    resumeCandidates.push({
      id:'minesweeper',
      accent:'minesweeper', eyebrow:'继续游玩', title:'KAI 扫雷',
      meta:`${MINESWEEPER_DIFFICULTIES[savedMinesweeper.difficulty].label}雷区 · 已揭开 ${completed}/${safeCells}`,
      progress:safeCells ? Math.round(completed / safeCells * 100) : 0,
      action:'open-minesweeper', label:minesweeperAction, glyph:'⚑',
    });
  }
  if (canContinueSudoku6) {
    const blanks = savedSudoku6.puzzle.filter((value) => value === 0).length;
    const completed = savedSudoku6.values.reduce((total, value, index) => total + Number(savedSudoku6.puzzle[index] === 0 && value !== 0), 0);
    resumeCandidates.push({
      id:'sudoku6',
      accent:'sudoku6', eyebrow:'继续游玩', title:'KAI 数独',
      meta:`${SUDOKU6_DIFFICULTIES[savedSudoku6.difficulty].label}题 · 已填 ${completed}/${blanks} 格`,
      progress:blanks ? Math.round(completed / blanks * 100) : 100,
      action:'open-sudoku6', label:sudoku6Action, glyph:'6',
    });
  }
  if (canContinue1048) {
    resumeCandidates.push({
      id:'1048',
      accent:'1048', eyebrow:'继续游玩', title:'1048',
      meta:`最高方块 ${saved1048.bestTile} · 已移动 ${saved1048.moves} 步`,
      progress:null, note:'本地局面已保存，可继续合并',
      action:'open-1048', label:merge1048Action, glyph:String(saved1048.bestTile || 2),
    });
  }
  if (canContinueXiangqi) {
    resumeCandidates.push({
      id:'xiangqi',
      accent:'xiangqi', eyebrow:'继续游玩', title:'KAI 象棋',
      meta:`${XIANGQI_DIFFICULTIES[savedXiangqi.game.difficulty].label} KAI · 已走 ${savedXiangqi.game.moveCount} 手`,
      progress:null, note:'局面已保存，可从当前回合继续',
      action:'open-xiangqi', label:xiangqiAction, glyph:'帅',
    });
  }
  if (canContinueGomoku) {
    resumeCandidates.push({
      id:'gomoku', accent:'gomoku', eyebrow:'继续游玩', title:'KAI 五子棋',
      meta:`已落 ${savedGomoku.moveCount} 手 · 轮到你执黑`,
      progress:null, note:'棋局已保存，可从当前落点继续',
      action:'open-gomoku', label:gomokuAction, glyph:'五',
    });
  }
  if (canContinueMemory) {
    resumeCandidates.push({
      id:'memory', accent:'memory', eyebrow:'继续游玩', title:'KAI 记忆翻牌',
      meta:`${MEMORY_MATCH_DIFFICULTIES[savedMemory.difficulty].label}牌阵 · 已配对 ${savedMemory.matchedPairs}/${savedMemory.pairCount}`,
      progress:savedMemory.pairCount ? Math.round(savedMemory.matchedPairs / savedMemory.pairCount * 100) : 0,
      action:'open-memory', label:memoryAction, glyph:'◫',
    });
  }
  if (canContinueSnake) {
    resumeCandidates.push({
      id:'snake', accent:'snake', eyebrow:'继续游玩', title:'KAI 贪吃蛇',
      meta:`${SNAKE_DIFFICULTIES[savedSnake.difficulty].label}速度 · 得分 ${savedSnake.score}`,
      progress:null, note:`长度 ${savedSnake.snake.length} · 已前进 ${savedSnake.ticks} 格`,
      action:'open-snake', label:snakeAction, glyph:'S',
    });
  }
  const recentLocalGame = safeStorageGet(LAST_LOCAL_GAME_KEY);
  const resumeGame = resumeCandidates.find((game) => game.id === recentLocalGame) || resumeCandidates[0] || {
    accent:'minesweeper', eyebrow:'新手推荐', title:'先来一局扫雷',
    meta:'首击必安全 · 从 10 颗雷的入门盘开始',
    progress:null, note:'无需规则准备，点开就能玩', action:'open-minesweeper', label:'开始排雷', glyph:'⚑',
  };
  const resumeButton = `<button class="btn primary" data-action="${esc(resumeGame.action)}">${resumeGame.label} <b>→</b></button>`;
  const heroGame = state.heroGame === 'mahjong' ? 'mahjong' : 'ddz';
  const ddzActive = heroGame === 'ddz';
  const previewWall = '<i></i>'.repeat(17);
  const previewTileData = [
    { rank:1, suit:'万', label:'一万' }, { rank:2, suit:'万', label:'二万' }, { rank:3, suit:'万', label:'三万' },
    { rank:3, suit:'筒', label:'三筒' }, { rank:4, suit:'筒', label:'四筒' }, { rank:5, suit:'筒', label:'五筒' },
    { rank:2, suit:'条', label:'二条' }, { rank:4, suit:'条', label:'四条' }, { rank:6, suit:'条', label:'六条' }, { rank:8, suit:'条', label:'八条' },
    { rank:0, suit:'字', label:'东' }, { rank:0, suit:'字', label:'南' }, { rank:0, suit:'字', label:'白' }, { rank:0, suit:'字', label:'中' },
  ];
  const previewTiles = previewTileData.map((tile)=>`<i class="${mahjongTone(tile)}">${mahjongMark(tile)}</i>`).join('');
  const previewRiverData = [
    [{rank:1,suit:'万',label:'一万'},{rank:9,suit:'筒',label:'九筒'},{rank:0,suit:'字',label:'东'}],
    [{rank:3,suit:'条',label:'三条'},{rank:0,suit:'字',label:'白'},{rank:5,suit:'万',label:'五万'}],
    [{rank:0,suit:'字',label:'南'},{rank:7,suit:'筒',label:'七筒'},{rank:2,suit:'万',label:'二万'}],
    [{rank:6,suit:'条',label:'六条'},{rank:4,suit:'筒',label:'四筒'},{rank:0,suit:'字',label:'北'}],
  ];
  const previewRivers = ['north','east','south','west'].map((position,index)=>`<div class="preview-river preview-river--${position}">${previewRiverData[index].map((tile)=>mahjongFace(tile,'preview-river-tile')).join('')}</div>`).join('');
  return `<div class="shell lobby-shell lobby-v4 lobby-game-center">${header('lobby')}${state.error ? `<div class="banner">${esc(state.error)}　游戏服务暂时离线，请稍后刷新。</div>`:''}
    <main class="live-lobby">
      <section class="game-center-intro" aria-labelledby="game-center-title">
        <div class="game-center-heading"><span class="section-kicker">KAI 游戏中心</span><h1 id="game-center-title">现在，想玩点什么？</h1><p>11 款即开即玩的牌桌、策略与益智游戏，无需下载，点开就能玩。</p></div>
        <div class="catalog-search-wrap">
          <label class="catalog-search" for="catalog-search-input">
            <i aria-hidden="true">⌕</i>
            <span class="sr-only">搜索全部玩法</span>
            <input id="catalog-search-input" type="search" data-catalog-search placeholder="搜索游戏或玩法，例如：象棋、短局" autocomplete="off" spellcheck="false">
            <kbd aria-hidden="true">/</kbd>
          </label>
          <button class="catalog-search-jump" type="button" data-action="catalog-show-results" hidden><span data-catalog-search-feedback aria-live="polite">查看搜索结果</span><b aria-hidden="true">↓</b></button>
        </div>
        <div class="game-center-trust" aria-label="游玩保障"><span>免注册试玩</span><span>无广告</span><span>7 款本地自动保存</span></div>
        <nav class="mood-rail" aria-label="按心情选择玩法">
          <button data-action="jump-world" data-world-target="minesweeper"><i>⚑</i>短局放松</button>
          <button data-action="jump-world" data-world-target="sudoku6"><i>6</i>动脑解谜</button>
          <button data-action="jump-world" data-world-target="xiangqi"><i>帅</i>棋桌对战</button>
          <button data-action="jump-world" data-world-target="ddz"><i>♠</i>牌桌对战</button>
          <button data-action="jump-world" data-world-target="friends"><i>＋</i>和朋友玩</button>
        </nav>
      </section>

      <section class="hub-discovery" aria-label="精选与快速开始">
        <section class="lobby-game-carousel" data-hero-carousel tabindex="0" aria-label="精选玩法，可左右滑动或使用方向键切换" aria-roledescription="carousel" aria-keyshortcuts="ArrowLeft ArrowRight">
          <section class="live-table live-table-preview lobby-hero-v4 lobby-game-stage game-stage--ddz ${ddzActive?'is-active':''}" data-hero-stage="ddz" aria-labelledby="live-table-title" aria-hidden="${ddzActive?'false':'true'}" ${ddzActive?'':'inert'}>
            ${tableFrame('preview')}
            <div class="live-table-seat live-seat-left"><span>A</span><b>智能牌友 A</b><small>左侧牌友</small></div>
            <div class="live-table-seat live-seat-right"><span>B</span><b>智能牌友 B</b><small>右侧牌友</small></div>
            <div class="live-table-center"><span class="hub-hero-tag">牌桌精选</span><small>三人斗地主 · 牌桌预览 · 计入竞技战绩</small><h1 id="live-table-title">三人斗地主，马上开局</h1><p>两位智能牌友即时补位，竞叫、出牌、结算一局完成。</p></div>
            <div class="lobby-card-scene" aria-hidden="true">${cardBack(true,'live-card-back')}${previewPoker(10,'spade')}${previewPoker(11,'spade')}${previewPoker(12,'heart')}${previewPoker(13,'club')}</div>
            <div class="live-table-seat live-seat-you"><span>${esc((p.name || '你').slice(0,1))}</span><b>${esc(p.name || '你')}</b><small>你的座位</small></div>
            <div class="live-join-bar"><button class="btn primary" data-action="quick" aria-label="${firstGame?'开始首局':'快速人机'}，创建斗地主牌局">${firstGame?'开始首局':'快速人机'} <b>→</b></button><small>游客免注册 · 智能牌友补位 · 可断线恢复</small><span class="sr-only">点击后创建真实牌局，服务端统一判定。</span></div>
          </section>
          <section class="live-table live-table-preview lobby-hero-v4 lobby-game-stage game-stage--mahjong ${ddzActive?'':'is-active'}" data-hero-stage="mahjong" aria-labelledby="mahjong-hero-title" aria-hidden="${ddzActive?'true':'false'}" ${ddzActive?'inert':''}>
            <div class="mahjong-preview-table" aria-hidden="true">
              <i class="mahjong-table-shadow"></i><i class="mahjong-table-base"></i><i class="mahjong-table-felt"></i>
              <div class="mahjong-preview-wall preview-wall-top">${previewWall}</div><div class="mahjong-preview-wall preview-wall-left">${previewWall}</div><div class="mahjong-preview-wall preview-wall-right">${previewWall}</div><div class="mahjong-preview-wall preview-wall-bottom">${previewWall}</div>
              <div class="mahjong-preview-rivers">${previewRivers}</div>
              <div class="mahjong-preview-center"><small>东一局</small><b>83</b><span>余牌</span></div>
              <div class="mahjong-preview-hand">${previewTiles}</div>
            </div>
            <div class="mahjong-preview-seat seat-north"><span>B</span><b>智能牌友 B</b><small>西家</small></div>
            <div class="mahjong-preview-seat seat-west"><span>C</span><b>智能牌友 C</b><small>北家</small></div>
            <div class="mahjong-preview-seat seat-east"><span>A</span><b>智能牌友 A</b><small>南家</small></div>
            <div class="mahjong-preview-seat seat-south"><span>${esc((p.name || '你').slice(0,1))}</span><b>${esc(p.name || '你')}</b><small>东家 · 你</small></div>
            <div class="mahjong-hero-copy"><span class="hub-hero-tag">轻松牌桌</span><small>KAI 麻将 · 四人基础速战</small><h1 id="mahjong-hero-title">摸一手好牌，听风入局</h1><p>和三位智能牌友摸打至自摸、荣和或流局。</p></div>
            <div class="mahjong-hero-action"><button class="btn primary" data-action="open-mahjong">开始麻将 <b>→</b></button><small>免费人机局 · 不影响竞技分</small></div>
          </section>
          <nav class="hero-switcher" aria-label="切换精选玩法"><button class="${ddzActive?'active':''}" data-action="hero-select" data-hero-game="ddz" aria-pressed="${ddzActive}">斗地主</button><button class="${ddzActive?'':'active'}" data-action="hero-select" data-hero-game="mahjong" aria-pressed="${!ddzActive}">麻将</button><span aria-hidden="true">↔ 滑动</span></nav>
          <p class="sr-only" data-hero-status aria-live="polite">当前展示${ddzActive?'斗地主':'麻将'}</p>
        </section>

        <aside class="hub-side">
          <div class="hub-side-head"><div><span>${resumeGame.eyebrow}</span><h2>${resumeGame.title}</h2></div><span class="hub-side-count">11 款可玩</span></div>
          <article class="resume-card resume-${resumeGame.accent}">
            <span class="resume-glyph" aria-hidden="true">${resumeGame.glyph}</span>
            <div><p>${resumeGame.meta}</p>${resumeGame.progress === null ? `<small>${resumeGame.note}</small>` : `<div class="resume-progress" role="progressbar" aria-label="${resumeGame.title}进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${resumeGame.progress}"><i style="--resume-progress:${resumeGame.progress}%"></i></div>`}</div>
            ${resumeButton}
          </article>
          <div class="quick-entry-head"><span>快速入口</span><small>换个口味</small></div>
          <nav class="lobby-mode-rail" aria-label="大厅玩法入口">
            <button class="mode-entry ${ddzActive?'is-primary':''}" data-action="hero-select" data-hero-game="ddz"><i aria-hidden="true">♠</i><b>斗地主</b><small>三人牌桌</small></button>
            <button class="mode-entry ${ddzActive?'':'is-primary'}" data-action="hero-select" data-hero-game="mahjong"><i aria-hidden="true">東</i><b>麻将</b><small>四人速战</small></button>
            <button class="mode-entry" data-action="open-1048"><i aria-hidden="true">16</i><b>1048</b><small>数字合并</small></button>
            <button class="mode-entry" data-action="open-minesweeper"><i aria-hidden="true">⚑</i><b>扫雷</b><small>首击安全</small></button>
          </nav>
        </aside>
      </section>

      <section class="section-block game-catalog" id="game-selection">
        <div class="section-head"><div><span class="section-kicker">全部玩法</span><h2>11 款玩法，即刻开局</h2></div><div class="world-carousel-meta"><span class="catalog-summary">1 款竞技 · 10 款免费畅玩</span><span class="world-position" data-world-status aria-live="polite">1 / 11</span><div class="world-carousel-controls" aria-label="切换全部玩法"><button type="button" data-action="world-prev" aria-label="上一张玩法卡片">←</button><button type="button" data-action="world-next" aria-label="下一张玩法卡片">→</button></div></div></div>
        <div class="catalog-command" aria-label="筛选全部玩法">
          <div class="catalog-filters" role="group" aria-label="按玩法类型筛选">
            <button class="is-active" data-action="catalog-filter" data-catalog-filter="all" aria-pressed="true">全部</button>
            <button data-action="catalog-filter" data-catalog-filter="continue" aria-pressed="false">可继续</button>
            <button data-action="catalog-filter" data-catalog-filter="quick" aria-pressed="false">5 分钟</button>
            <button data-action="catalog-filter" data-catalog-filter="card" aria-pressed="false">牌桌</button>
            <button data-action="catalog-filter" data-catalog-filter="board" aria-pressed="false">棋类</button>
            <button data-action="catalog-filter" data-catalog-filter="puzzle" aria-pressed="false">益智</button>
            <button data-action="catalog-filter" data-catalog-filter="arcade" aria-pressed="false">街机</button>
            <button data-action="catalog-filter" data-catalog-filter="save" aria-pressed="false">自动保存</button>
          </div>
          <span class="catalog-result" data-catalog-result aria-live="polite">显示全部 11 款</span>
        </div>
        <p class="world-swipe-hint" id="world-carousel-hint">左右滑动或使用箭头，下一款游戏已经露出来了</p>
        <div class="world-strip" data-world-strip tabindex="0" role="region" aria-label="全部玩法卡片轮播" aria-describedby="world-carousel-hint">
          <article class="game-world world-ddz" data-world-card data-world-id="ddz"><span class="world-badge">竞技牌桌</span><div class="world-cover"><div class="world-ddz-hand" aria-hidden="true">${previewPoker(10,'spade')}${previewPoker(11,'heart')}${previewPoker(12,'club')}${previewPoker(13,'diamond')}${previewPoker(14,'spade')}</div><i class="world-cover-mark" aria-hidden="true">♠</i></div><div class="world-copy"><span>竞叫开局 · 一局计入战绩</span><h3>斗地主</h3><p>叫分抢地主，和两位智能牌友完整打完一局。</p><button class="btn primary" data-action="quick">快速开局 <b>→</b></button></div></article>
          <article class="game-world world-xiangqi" data-world-card data-world-id="xiangqi"${canContinueXiangqi?' data-world-resumable="true"':''}><span class="world-badge">${canContinueXiangqi?'可继续':savedXiangqi?.game?.status==='playing'?'执红先行':savedXiangqi?'战果已保存':'新上线'}</span><div class="world-cover"><div class="world-xiangqi-board" aria-hidden="true"><i class="black">車</i><i></i><i class="black">將</i><i></i><i class="black">砲</i><i></i><i class="red">兵</i><i></i><i class="red">帥</i></div><i class="world-cover-mark" aria-hidden="true">楚河</i></div><div class="world-copy"><span>执红先行 · 三档 KAI 对手</span><h3>KAI 象棋</h3><p>落子、悔棋、自动保存，随时回来接着下。</p><button class="btn" data-action="open-xiangqi">${xiangqiAction} <b>→</b></button></div></article>
          <article class="game-world world-gomoku" data-world-card data-world-id="gomoku"${canContinueGomoku?' data-world-resumable="true"':''}><span class="world-badge">${canContinueGomoku?'可继续':savedGomoku?.status==='finished'?'战果已保存':'全新策略'}</span><div class="world-cover"><div class="world-gomoku-board" aria-hidden="true">${Array.from({length:49},(_,index)=>`<i class="${[10,17,24,31].includes(index)?'black':[11,18,25].includes(index)?'white':''}"></i>`).join('')}</div><i class="world-cover-mark" aria-hidden="true">五</i></div><div class="world-copy"><span>15×15 棋盘 · 人机对弈</span><h3>KAI 五子棋</h3><p>你执黑先行，布局、封堵，在四个方向率先连成五子。</p><button class="btn" data-action="open-gomoku">${gomokuAction} <b>→</b></button></div></article>
          <article class="game-world world-mahjong" data-world-card data-world-id="mahjong"><span class="world-badge">牌桌经典</span><div class="world-cover"><div class="world-mahjong-tiles" aria-hidden="true"><i>一<small>万</small></i><i>三<small>条</small></i><i>●<small>筒</small></i><i>發</i></div><i class="world-cover-mark" aria-hidden="true">東</i></div><div class="world-copy"><span>四人东一局 · 人机速战</span><h3>KAI 麻将</h3><p>摸牌、理牌、听牌，和三位 KAI 牌友打到结算。</p><button class="btn" data-action="open-mahjong">开始麻将 <b>→</b></button></div></article>
          <article class="game-world world-1048" data-world-card data-world-id="1048"${canContinue1048?' data-world-resumable="true"':''}><span class="world-badge">${canContinue1048?'可继续':saved1048?.status==='playing'?'等待开局':saved1048?'上局已保存':'稀有目标'}</span><div class="world-cover"><div class="world-1048-board" aria-hidden="true"><i>2</i><i></i><i>4</i><i></i><i></i><i>8</i><i></i><i>16</i><i>32</i><i></i><i>128</i><i></i><i></i><i>512</i><i></i><i>1048</i></div><i class="world-cover-mark" aria-hidden="true">＋</i></div><div class="world-copy"><span>数字合并 · 单机益智 · 冲击 1048</span><h3>1048</h3><p>逐级合并数字，让最后两枚 512 特别融合为 1048。</p><button class="btn" data-action="open-1048">${merge1048Action} <b>→</b></button></div></article>
          <article class="game-world world-sudoku6" data-world-card data-world-id="sudoku6"${canContinueSudoku6?' data-world-resumable="true"':''}><span class="world-badge">${canContinueSudoku6?'可继续':savedSudoku6?.status==='playing'?'待你开题':savedSudoku6?'成绩已保存':'每日一局'}</span><div class="world-cover"><div class="world-sudoku6-board" aria-hidden="true">${[1,0,3,0,5,0,0,5,0,1,0,3,2,0,4,0,6,0,0,6,0,2,0,4,3,0,5,0,1,0,0,1,0,3,0,5].map((value)=>`<i>${value||''}</i>`).join('')}</div><i class="world-cover-mark" aria-hidden="true">6×6</i></div><div class="world-copy"><span>6×6 逻辑填数 · 单机益智</span><h3>KAI 数独</h3><p>填满盘面，用一局让思路重新清晰，支持随手记笔记。</p><button class="btn" data-action="open-sudoku6">${sudoku6Action} <b>→</b></button></div></article>
          <article class="game-world world-minesweeper" data-world-card data-world-id="minesweeper"${canContinueMinesweeper?' data-world-resumable="true"':''}><span class="world-badge">${canContinueMinesweeper?'可继续':savedMinesweeper?.status==='ready'?'首击安全':savedMinesweeper?'上局已保存':'首击安全'}</span><div class="world-cover"><div class="world-minesweeper-board" aria-hidden="true">${minesweeperPreview}</div><i class="world-cover-mark" aria-hidden="true">⚑</i></div><div class="world-copy"><span>从数字推理 · 入门盘 10 颗雷</span><h3>KAI 扫雷</h3><p>首击必安全，揭开空地、标出地雷、清空整张盘。</p><button class="btn" data-action="open-minesweeper">${minesweeperAction} <b>→</b></button></div></article>
          <article class="game-world world-memory" data-world-card data-world-id="memory"${canContinueMemory?' data-world-resumable="true"':''}><span class="world-badge">${canContinueMemory?'可继续':savedMemory?.status==='won'?'成绩已保存':'轻松短局'}</span><div class="world-cover"><div class="world-memory-cards" aria-hidden="true"><i><b>🌙</b></i><i><b>K</b></i><i><b>⭐</b></i><i><b>🌙</b></i><i><b>K</b></i><i><b>⭐</b></i></div><i class="world-cover-mark" aria-hidden="true">PAIR</i></div><div class="world-copy"><span>翻开配对 · 三档牌阵</span><h3>KAI 记忆翻牌</h3><p>记住每张卡的位置，用更少步数找齐所有相同图案。</p><button class="btn" data-action="open-memory">${memoryAction} <b>→</b></button></div></article>
          <article class="game-world world-snake" data-world-card data-world-id="snake"${canContinueSnake?' data-world-resumable="true"':''}><span class="world-badge">${canContinueSnake?'可继续':['over','won'].includes(savedSnake?.status)?'上轮已保存':'即时操作'}</span><div class="world-cover"><div class="world-snake-grid" aria-hidden="true">${Array.from({length:64},(_,index)=>`<i class="${index===13?'food':index===35?'head':[33,34,43,51].includes(index)?'body':''}"></i>`).join('')}</div><i class="world-cover-mark" aria-hidden="true">S</i></div><div class="world-copy"><span>方向操控 · 三档速度</span><h3>KAI 贪吃蛇</h3><p>穿过霓虹光栅收集能量，保持节奏，挑战更长身体。</p><button class="btn" data-action="open-snake">${snakeAction} <b>→</b></button></div></article>
          <article class="game-world world-three" data-world-card data-world-id="three"><span class="world-badge">免费比牌</span><div class="world-cover"><div class="world-three-cards" aria-hidden="true">${cardBack(true)}${cardBack(true)}${cardBack(true)}</div><i class="world-cover-mark" aria-hidden="true">3</i></div><div class="world-copy"><span>三张定胜负 · 单机训练</span><h3>炸金花训练</h3><p>一眼判断牌型强弱，翻开这一手就见分晓。</p><button class="btn" data-action="open-three">翻开这一手 <b>→</b></button></div></article>
          <article class="game-world world-reels" data-world-card data-world-id="reels"><span class="world-badge">大厅彩蛋</span><div class="world-cover"><div class="world-reel-preview" aria-hidden="true"><i>7</i><i>KAI</i><i>⚡</i></div><i class="world-cover-mark" aria-hidden="true">★</i></div><div class="world-copy"><span>免费娱乐 · 无现金下注 · 无提现</span><h3>算力转轮</h3><p>轻点一次，看三枚符号能否同频连线。</p><button class="btn" data-action="open-slots" aria-label="打开算力转轮">试转一次 <b>→</b></button></div></article>
        </div>
        <div class="catalog-empty" data-catalog-empty hidden role="status"><i aria-hidden="true">⌕</i><div><b>没有找到相关玩法</b><span>换个关键词，或者重新查看全部游戏。</span></div><button class="btn" data-action="catalog-reset">显示全部</button></div>
      </section>

      <section class="lobby-tools" id="lobby-tools" aria-labelledby="lobby-tools-title">
        <div class="section-head compact"><div><span class="section-kicker">一起玩与我的记录</span><h2 id="lobby-tools-title">需要时，再打开这些工具</h2></div></div>
        <div class="lobby-shortcuts">
          <article class="room-panel"><div><span>好友房</span><h2>叫上朋友，同桌斗地主</h2><p>创建一个新房间，或输入朋友发来的六位房号。</p></div><div class="room-actions"><button class="btn primary" data-action="create-room">创建房间</button><div class="friend-row"><label for="room-code">六位房号</label><input class="input" id="room-code" maxlength="6" inputmode="numeric" aria-label="六位房号" placeholder="输入房号"><button class="btn" data-action="join-room">加入</button></div></div></article>
          <article class="history-summary"><div><span>我的记录</span><h2>${tierName(p)}</h2><p>${firstGame?'完成首局，解锁你的胜率与牌局记录':`${Number(p.games) || 0} 局已保存 · 胜率 ${winRatePercent(p)}%`}</p></div><div><strong>${money(competitiveScore(p))}</strong><small>竞技分</small><button class="text-link" data-view="history">查看战绩 →</button></div></article>
        </div>
      </section>
    </main>${nav('lobby')}</div>`;
}

function nav(active) { return `<nav class="nav"><button class="btn ${active==='lobby'?'active':''}" data-view="lobby">游戏</button><button class="btn ${active==='history'?'active':''}" data-view="history">战绩</button><button class="btn ${active==='rules'?'active':''}" data-view="rules">规则</button></nav>`; }

function room() {
  const r = state.room;
  if (!r) return lobby();
  const syncStopped = state.error.startsWith('房间同步已停止');
  const seats = [0,1,2].map(i => { const m=r.members[i]; return m ? `<div class="seat"><div class="avatar">${esc(m.name.slice(0,1))}</div><b>${esc(m.name)}${m.isYou?'（我）':''}</b><p class="muted">${m.id===r.hostId?'房主':'已加入'}</p></div>` : `<div class="seat empty"><div class="avatar">＋</div><b>等待加入</b><p>分享房号邀请好友</p></div>`; }).join('');
  const exitDialog = state.roomExitConfirm ? `<div class="exit-shade"><section class="exit-dialog" role="dialog" aria-modal="true" aria-labelledby="room-exit-title"><span>离开好友房</span><h2 id="room-exit-title">确定退出当前房间？</h2><p>退出后将不再占用座位；如果你是房主，房主会自动转交给下一位牌友。</p><div><button class="btn" data-action="cancel-room-exit">继续等待</button><button class="btn danger" data-action="leave-room">退出房间</button></div></section></div>` : '';
  return `<div class="shell">${header('room')}${syncFailureNotice()}<div class="page-head"><button class="btn ghost" data-action="open-room-exit">← 退出</button><h1>斗地主 · 好友同桌</h1><button class="btn" data-action="refresh-room">立即刷新</button></div><section class="card"><p class="room-sync-status ${syncStopped?'is-stopped':''}"><i></i>${syncStopped?'同步已停止，等待重新连接':'牌友与开局状态自动同步'}</p><p class="muted" style="text-align:center">邀请房号</p><div class="room-code">${esc(r.code)}</div><div class="actions" style="justify-content:center"><button class="btn gold" data-action="copy-room">复制房号</button></div><div class="seats" style="margin-top:24px">${seats}</div><div class="actions" style="justify-content:center;margin-top:24px">${r.isHost?`<button class="btn primary" data-action="start-room">${r.members.length===3?'三人开始':'智能牌友补位'}</button>`:'<span class="muted">等待房主开始游戏…</span>'}</div></section>${exitDialog}</div>`;
}

const PIP_PATTERNS = Object.freeze({
  1: ['mc'],
  2: ['tc','bc'],
  3: ['tc','mc','bc'],
  4: ['tl','tr','bl','br'],
  5: ['tl','tr','mc','bl','br'],
  6: ['tl','tr','ml','mr','bl','br'],
  7: ['tl','tr','cu','ml','mr','bl','br'],
  8: ['tl','tr','cu','ml','mr','cl','bl','br'],
  9: ['tl','tr','ul','ur','mc','ll','lr','bl','br'],
  10: ['tl','tr','ul','ur','cu','cl','ll','lr','bl','br'],
});

const CARD_RANK_DATA = Object.freeze({
  3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10',
  11: 'j', 12: 'q', 13: 'k', 14: 'a', 15: '2', 16: 'small-joker', 17: 'big-joker',
});
const CARD_RANK_STOCK_INDEX = Object.freeze({
  3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8, 9: 9, 10: 10,
  11: 11, 12: 12, 13: 13, 14: 14, 15: 15, 16: 16, 17: 17,
});
const CARD_SUIT_DATA = Object.freeze({
  spade: 'spade', heart: 'heart', club: 'club', diamond: 'diamond', joker: 'joker',
});
const CARD_SUIT_LABELS = Object.freeze({
  spade: '黑桃', heart: '红桃', club: '梅花', diamond: '方块', joker: '王',
});
const CARD_SUIT_STOCK_INDEX = Object.freeze({
  spade: 1, heart: 2, club: 3, diamond: 4, joker: 5,
});

function cardMappedValue(map, key, fallback) {
  return Object.prototype.hasOwnProperty.call(map, key) ? map[key] : fallback;
}

function cardStockPosition(rankValue, suitValue) {
  const rankIndex = cardMappedValue(CARD_RANK_STOCK_INDEX, rankValue, 0);
  const suitIndex = cardMappedValue(CARD_SUIT_STOCK_INDEX, suitValue, 0);
  const seed = (rankIndex * 5) + suitIndex;
  return {
    x: 9 + ((seed * 37) % 83),
    y: 9 + ((seed * 61) % 83),
  };
}

function cardPips(card, symbol) {
  const count = card.rank === 14 ? 1 : card.rank === 15 ? 2 : Number(card.rank);
  const pattern = PIP_PATTERNS[count];
  if (!pattern) return '';
  return `<i class="card-pips card-pips-${count}" aria-hidden="true">${pattern.map((position)=>`<b class="pip pip-${position} ${['cl','ll','lr','bl','bc','br'].includes(position)?'is-inverted':''}">${symbol}</b>`).join('')}</i>`;
}

function poker(c, selectable = true, decorative = false, fan = null) {
  const rawLabel = rank(c.rank);
  const symbol = suit(c.suit);
  const rankData = cardMappedValue(CARD_RANK_DATA, c.rank, 'unknown');
  const suitData = cardMappedValue(CARD_SUIT_DATA, c.suit, 'unknown');
  const suitLabel = cardMappedValue(CARD_SUIT_LABELS, c.suit, '未知花色');
  const stock = cardStockPosition(c.rank, c.suit);
  const joker = c.suit === 'joker';
  const bigJoker = joker && c.rank === 17;
  const classes = ['poker-face', isRed(c)?'red':'', joker?'joker-card':'', joker?(bigJoker?'joker-red':'joker-gray'):'', decorative?'is-decorative':'', fan?'hand-card':''].filter(Boolean).join(' ');
  const bottomIndex = joker ? '' : `<span class="card-index card-index-bottom" aria-hidden="true"><b>${rawLabel}</b><small>${symbol}</small></span>`;
  const content = joker
    ? `<span class="joker-index">${bigJoker?'大王':'小王'}</span><i class="joker-face"><em>${bigJoker?'RED':'GREY'}</em><b>JOKER</b><strong>K</strong></i><span class="card-signature">KAI</span>`
    : `<span class="card-index"><b>${rawLabel}</b><small>${symbol}</small></span>${bottomIndex}${[11,12,13].includes(c.rank)
      ? `<i class="card-court face-${String(rawLabel).toLowerCase()}"><em>${rawLabel}</em><b>${symbol}</b><strong>KAI</strong></i>`
      : cardPips(c, symbol)}<span class="card-signature">KAI</span>`;
  const aria = joker ? `${bigJoker?'大王':'小王'} ${bigJoker?'红色':'灰色'} JOKER` : `${suitLabel} ${rawLabel}`;
  const selected = state.selected.has(c.id);
  const style = [`--card-stock-x:${stock.x}%`, `--card-stock-y:${stock.y}%`];
  if (fan) {
    style.push(
      `--card-angle:${(((fan.index - (fan.total - 1) / 2) / Math.max(1, (fan.total - 1) / 2)) * 3).toFixed(2)}deg`,
      `--card-curve:${(Math.abs((fan.index - (fan.total - 1) / 2) / Math.max(1, (fan.total - 1) / 2)) * 4).toFixed(2)}px`,
      `--card-order:${fan.index}`,
    );
  }
  const faceAttributes = `data-rank="${rankData}" data-suit="${suitData}" style="${style.join(';')}"`;
  if (!selectable) return decorative
    ? `<span class="poker ${classes}" ${faceAttributes} aria-hidden="true">${content}</span>`
    : `<span class="poker ${classes}" ${faceAttributes} role="img" aria-label="${esc(aria)}">${content}</span>`;
  return `<button class="poker ${classes} ${selected?'selected':''}" ${faceAttributes} data-card="${esc(c.id)}" aria-label="${esc(aria)}" aria-pressed="${selected?'true':'false'}">${content}</button>`;
}

function previewPoker(rankValue, suitValue) {
  return poker({ id:`preview-${rankValue}-${suitValue}`, rank:rankValue, suit:suitValue }, false, true);
}

function tableFrame(variant = 'game') {
  return `<div class="table-frame table-frame-${variant}" aria-hidden="true"><i class="table-layer table-layer-shadow" data-table-layer="shadow"></i><i class="table-layer table-layer-base" data-table-layer="base"></i><i class="table-layer table-layer-rail" data-table-layer="rail"></i><i class="table-layer table-layer-inlay" data-table-layer="inlay"></i><i class="table-layer table-layer-felt" data-table-layer="felt"></i></div>`;
}

function turnRemaining(g) {
  const deadline = Date.parse(g?.turn?.deadline || '');
  const fallback = Date.parse(g?.updatedAt || '') + TURN_TIMEOUT_MS;
  const effectiveDeadline = Number.isFinite(deadline) ? deadline : fallback;
  if (!Number.isFinite(effectiveDeadline) || g?.phase === 'finished') return 0;
  return Math.max(0, Math.ceil((effectiveDeadline - Date.now()) / 1000));
}

function dealSequence(game) {
  const otherSeats = game.players.filter((player)=>player.seat !== game.viewerSeat).map((player)=>player.seat);
  const relativeSeat = new Map([[game.viewerSeat,2],[otherSeats[0],0],[otherSeats[1],1]]);
  const flights = Array.from({length: 51}, (_, index) => `<i class="deal-card kai-card-back deal-seat-${relativeSeat.get(index % 3) ?? 2}" style="--deal-index:${index}" aria-hidden="true"></i>`).join('');
  const target = (position, label) => `<div class="deal-target ${position}" aria-hidden="true"><span><i class="kai-card-back"></i><i class="kai-card-back"></i><i class="kai-card-back"></i></span><b>${label}</b><small>17 张</small></div>`;
  return `<div class="deal-sequence" role="status" aria-live="polite" aria-label="开局发牌中，每位玩家十七张，预留三张增补牌">
    <div class="deal-copy"><span>开局发牌</span><b>正在依次发给三位玩家</b><small>每人 17 张 · 预留 3 张增补牌</small><ol><li>准备牌组</li><li>安全发牌</li><li>牌局锁定</li></ol></div>
    ${target('target-left','左侧牌友')}${target('target-right','右侧牌友')}${target('target-bottom','你的手牌')}
    <div class="deal-deck" aria-hidden="true"><i class="kai-card-back"></i><i class="kai-card-back"></i><i class="kai-card-back"></i><b>3</b><small>增补牌</small></div>${flights}
  </div>`;
}

function turnFeedbackState(g, canAct) {
  const remaining = turnRemaining(g);
  const current = g.players.find(player => player.seat === g.currentSeat);
  const botTurn = g.turn?.kind === 'bot' || current?.isBot;
  const durationSeconds = Math.max(1, Math.ceil((g.turn?.durationMs || TURN_TIMEOUT_MS) / 1000));
  const urgent = !botTurn && remaining <= 10;
  const progress = Math.min(360, Math.round((remaining / durationSeconds) * 360));
  const title = canAct ? '你的思考时间' : `${current?.name || '牌友'}正在思考`;
  const detail = remaining > 0
    ? (canAct ? '请在倒计时结束前完成操作' : botTurn ? `预计 ${remaining} 秒内行动` : '对方操作后牌桌会自动同步')
    : '时间到，服务端正在自动托管';
  return { remaining, botTurn, urgent, progress, title, detail };
}

function turnFeedback(g, canAct) {
  const model = turnFeedbackState(g, canAct);
  return `<div class="turn-feedback ${canAct?'is-mine':'is-waiting'} ${model.botTurn?'is-bot':''} ${model.urgent?'is-urgent':''}" data-turn-feedback role="timer" aria-live="${model.urgent?'polite':'off'}" aria-label="${esc(model.title)}，${model.remaining > 0 ? `剩余 ${model.remaining} 秒` : model.detail}">
    <div class="turn-timer" data-turn-timer style="--turn-progress:${model.progress}deg"><strong data-turn-seconds>${model.remaining || '··'}</strong><small data-turn-unit>${model.remaining ? '秒' : '托管'}</small></div>
    <div class="turn-copy"><b>${esc(model.title)}${model.botTurn?'<span class="thinking-dots"><i></i><i></i><i></i></span>':''}</b><small data-turn-detail>${model.detail}</small></div>
  </div>`;
}

function updateTurnClock() {
  if (state.view !== 'game' || !state.game || state.game.phase === 'finished') return;
  const root = document.querySelector('[data-turn-feedback]');
  if (!root) return;
  const canAct = state.game.currentSeat === state.game.viewerSeat;
  const model = turnFeedbackState(state.game, canAct);
  root.classList.toggle('is-urgent', model.urgent);
  root.setAttribute('aria-live', model.urgent ? 'polite' : 'off');
  root.setAttribute('aria-label', `${model.title}，${model.remaining > 0 ? `剩余 ${model.remaining} 秒` : model.detail}`);
  root.querySelector('[data-turn-timer]')?.style.setProperty('--turn-progress', `${model.progress}deg`);
  const seconds = root.querySelector('[data-turn-seconds]');
  const unit = root.querySelector('[data-turn-unit]');
  const detail = root.querySelector('[data-turn-detail]');
  if (seconds) seconds.textContent = model.remaining || '··';
  if (unit) unit.textContent = model.remaining ? '秒' : '托管';
  if (detail) detail.textContent = model.detail;
}

function actionTrail(g) {
  const events = (g.recentEvents || []).slice(-3);
  if (!events.length) return '<p>牌局开始，祝你好运</p>';
  return `<div class="action-trail" aria-label="最近行动">${events.map(event => {
    const player = g.players.find(candidate => candidate.seat === event.seat);
    const cards = (event.cards || []).map(card => `${rank(card.rank)}${suit(card.suit)}`);
    const summary = event.kind === 'pass' ? '略过' : `${cards.slice(0,4).join(' ')}${cards.length>4?` +${cards.length-4}`:''}`;
    return `<span class="${event.seat===g.currentSeat?'current':''}"><b>${esc(player?.name || '玩家')}</b>${esc(summary || '已出牌')}</span>`;
  }).join('<i>→</i>')}</div>`;
}

function matchResult(g, viewer) {
  const settlement = g.settlement;
  const delta = Number(settlement?.deltas?.[viewer.id]) || 0;
  const viewerWon = delta > 0;
  const viewerRole = viewer.role === 'landlord' ? '领队' : '协作位';
  const lastEvent = (g.recentEvents || []).at(-1);
  const lastPlayer = lastEvent ? g.players.find(player => player.seat === lastEvent.seat) : null;
  const lastCards = (lastEvent?.cards || []).map(card => `${rank(card.rank)}${suit(card.suit)}`).join(' ');
  const lastAction = !lastEvent
    ? '当前视图没有可展示的出牌记录'
    : `${lastPlayer?.name || '玩家'}${lastEvent.kind === 'pass' ? '选择略过' : `打出 ${lastCards || `${lastEvent.cards?.length || 0} 张牌`}`}`;
  const fairnessCode = g.fairness?.commitment ? g.fairness.commitment.slice(0, 12) : '未提供';
  return `<main class="match-result ${viewerWon?'is-win':'is-loss'}">
    <header class="game-top"><div class="game-branding"><div class="brand compact"><div class="logo"><span></span>K</div><div>KAI PLAY<small>斗地主 · 本局结束</small></div></div></div><div class="score-pill compact-score"><small>当前竞技分</small><strong>${money(competitiveScore(state.profile))}</strong></div></header>
    <section class="result-score" aria-live="polite"><span>${settlement?.winner === 'landlord' ? '领队获胜' : '协作方获胜'}</span><h1>${viewerWon ? '这局拿下了' : '这局惜败'}</h1><strong class="${delta>=0?'positive':'negative'}">${delta>=0?'+':''}${money(delta)}</strong><small>竞技分 · 服务端已完成结算</small></section>
    <section class="review-panel" aria-labelledby="review-title"><div><span>牌局记录</span><h2 id="review-title">复盘预览</h2><p>这里只整理服务端已经记录的事实，当前不提供策略优劣、最优解或胜率推断。</p></div>
      <div class="decision-row"><span>身份与结果</span><b>${viewerRole} · ${viewerWon?'获胜':'落败'}</b><small>本局最高争分 ${Number(g.highestBid) || 0} 档</small></div>
      <div class="decision-row"><span>结算信息</span><b>${Number(settlement?.multiplier) || 1} 倍</b><small>炸弹记录 ${Number(g.bombs) || 0} 次 · 基础分 ${Number(g.baseStake) || 0}</small></div>
      <div class="decision-row"><span>最后行动</span><b>${esc(lastAction)}</b><small>当前视图保留最近 ${(g.recentEvents || []).length} 条行动</small></div>
      <div class="decision-row"><span>公平校验</span><b>${esc(fairnessCode)}</b><small>完整牌序在结束后由服务端公开校验</small></div>
    </section>
    <div class="result-actions"><button class="btn primary" data-action="rematch">快速人机再来一局 <b>→</b></button><button class="btn" data-action="finish">返回大厅</button></div>
  </main>`;
}

function game() {
  const g=state.game; if(!g) return lobby();
  const isDealing=state.dealingGameId===g.id;
  const viewer=g.players.find(p=>p.seat===g.viewerSeat) || g.players[0];
  if (g.phase==='finished' && g.settlement) return `<div class="shell table">${matchResult(g,viewer)}</div>`;
  const rivals=g.players.filter(p=>p.seat!==g.viewerSeat);
  const roleName=role=>role==='landlord'?'领队':role==='farmer'?'协作位':'定主位';
  const playerPod=(p,position)=>`<div class="player-pod ${position} ${p.seat===g.currentSeat?'turn':''}" data-seat="${p.seat}" data-role="${esc(p.role || 'unassigned')}">${p.seat===g.viewerSeat?'':cardBackStack()}<div class="pod-avatar">${esc(p.name.slice(0,1))}<span>${roleName(p.role)}</span></div><div class="pod-copy"><b>${esc(p.name)}</b><small>${p.isBot?'智能牌友':p.seat===g.viewerSeat?'我':'好友房牌友'}</small></div><div class="pod-count"><b>${p.cardCount}</b><small>张</small></div></div>`;
  const lead=g.leadCards?.length?g.leadCards.map(c=>poker(c,false)).join(''):'<span class="table-prompt">等待出牌</span>';
  const viewerTurn=g.currentSeat===g.viewerSeat;
  const canAct=!isDealing&&viewerTurn;
  const selectionCount=state.selected.size;
  const actions=g.phase==='bidding'
    ? [0,1,2,3].map(n=>`<button class="btn table-action ${n===3?'gold':''}" data-bid="${n}" ${canAct&&(n===0||n>Number(g.highestBid||0))?'':'disabled'}>${n===0?'让先':n+' 档'}</button>`).join('')
    : `<button class="btn table-action ghost" data-action="pass" ${canAct&&g.leadCombination?'':'disabled'}>不出</button>${canAct&&selectionCount?'<button class="btn table-action selection-reset" data-action="clear-selection">重选</button>':''}<button class="btn table-action primary" data-action="play" ${canAct&&selectionCount?'':'disabled'}>${selectionCount?`出牌 · ${selectionCount} 张`:'出牌'}</button>`;
  const currentPlayer=g.players.find(p=>p.seat===g.currentSeat);
  const currentMultiplier=Math.max(1,Number(g.highestBid)||1)*(2**Number(g.bombs||0));
  const handInteractive=canAct&&g.phase==='playing';
  const turnText = isDealing?'正在依次发牌':g.phase==='finished'?'本局已结束':viewerTurn?(g.phase==='bidding'?'轮到你选择争分':'轮到你出牌'):`${currentPlayer?.name||'牌友'}正在思考`;
  const handHint = handInteractive ? (selectionCount ? `已选 ${selectionCount} 张 · 可重选或确认出牌` : '点击手牌选择 · 再确认出牌') : '等待轮次 · 规则由服务端统一判定';
  const exitDialog=state.exitConfirm?`<div class="exit-shade"><section class="exit-dialog" role="dialog" aria-modal="true" aria-labelledby="exit-title"><span>结束本局</span><h2 id="exit-title">确定不打了吗？</h2><p>退出会按本局负场结算；好友局也会同时结束。你可以留下继续完成这一局。</p><div><button class="btn" data-action="cancel-exit">继续本局</button><button class="btn danger" data-action="confirm-exit">认输并退出</button></div></section></div>`:'';
  return `<div class="shell table route-game"><header class="game-top"><div class="game-branding"><div class="brand compact"><div class="logo"><span></span>K</div><div>KAI PLAY<small>斗地主</small></div></div></div><div class="round-state"><span>${turnText}</span><b>基础分 ${g.baseStake} · 明示倍数 ${currentMultiplier}</b></div><div class="score-pill compact-score"><small>竞技分</small><strong>${money(competitiveScore(state.profile))}</strong></div></header>${syncFailureNotice()}<section class="landscape-table ddz-table ${isDealing?'is-dealing':''}">${tableFrame('game')}<button class="table-exit table-exit-float" data-action="open-exit" aria-label="退出当前牌局">← 退出</button><div class="table-score"><b>基础分 ${g.baseStake}</b><span>明示倍数 ${currentMultiplier}</span></div>${playerPod(rivals[0]||viewer,'opponent-left')}${playerPod(rivals[1]||viewer,'opponent-right')}${playerPod(viewer,'viewer-pod')}${g.bottomCards?.length?`<div class="bottom-reveal"><small>增补牌</small>${g.bottomCards.map(c=>poker(c,false)).join('')}</div>`:''}<div class="play-zone"><div class="play-cards">${lead}</div>${actionTrail(g)}</div><div class="center-controls" ${isDealing?'aria-hidden="true"':''}>${turnFeedback(g,viewerTurn)}<div class="game-actions">${actions}</div></div><footer class="hand-dock" ${isDealing?'aria-hidden="true"':''}><div class="hand" style="--hand-count:${g.hand.length}">${g.hand.map((c,index,hand)=>poker(c,handInteractive,false,{index,total:hand.length})).join('')}</div><p>${handHint}</p></footer>${isDealing?dealSequence(g):''}</section>${exitDialog}</div>`;
}

function casualHeader(title, mode, status) {
  return `<header class="casual-top"><button class="table-exit" data-action="casual-home">← 游戏大厅</button><div><span>${esc(mode)}</span><h1>${esc(title)}</h1></div><b>${esc(status)}</b></header>`;
}

function cardBack(decorative = false, extraClass = '') {
  const accessibility = decorative ? 'aria-hidden="true"' : 'role="img" aria-label="未公开的 KAI PLAY 牌"';
  return `<span class="training-card-back kai-card-back ${esc(extraClass)}" ${accessibility}><i class="card-back-mark"><b>K</b><small>KAI PLAY</small></i></span>`;
}

function cardBackStack() {
  return `<div class="pod-card-stack" aria-hidden="true"><i class="kai-card-back"></i><i class="kai-card-back"></i><i class="kai-card-back"></i></div>`;
}

function threeCardGame() {
  const round = state.casual?.round;
  if (!round) return lobby();
  const revealed = state.casual.revealed;
  const ranked = round.players.map((player, index) => ({ player, index, score: evaluateThreeCard(player.hand) }))
    .sort((a, b) => compareThreeCard(b.player.hand, a.player.hand));
  const winner = ranked[0];
  const result = revealed ? `<div class="training-result ${winner.index===0?'win':'lose'}"><span>${winner.index===0?'本轮获胜':'本轮结果'}</span><b>${esc(winner.player.name)} · ${esc(winner.score.label)}</b><small>免费训练局，不影响竞技分</small></div>` : '';
  const seats = round.players.slice(1).map((player) => `<article class="three-opponent ${revealed?'is-revealed':''}"><div class="training-avatar">${esc(player.name.slice(0,1))}</div><b>${esc(player.name)}</b><div class="three-hand">${revealed ? player.hand.map((card) => poker(card,false)).join('') : player.hand.map(() => cardBack(false)).join('')}</div>${revealed?`<span>${esc(evaluateThreeCard(player.hand).label)}</span>`:'<span>等待比牌</span>'}</article>`).join('');
  return `<div class="shell casual-shell">${casualHeader('炸金花','THREE CARD','免费训练 · 不计竞技分')}<section class="casual-stage three-stage">${result}<div class="three-how"><span>1 看自己的三张牌</span><i>→</i><span>2 点击翻开并比牌</span><i>→</i><span>3 最大牌型获胜</span></div><div class="three-opponents">${seats}</div><div class="three-center"><span>本局免费</span><b>${state.casual.thinking?'两位牌友正在思考…':revealed?'三家牌面已揭晓':'三张牌，一次定胜负'}</b><small>无筹码 · 无下注</small></div><article class="three-player"><div class="training-avatar">你</div><div><b>你的手牌</b><span>${esc(evaluateThreeCard(round.players[0].hand).label)}</span></div><div class="three-hand">${round.players[0].hand.map((card) => poker(card,false)).join('')}</div></article><div class="casual-actions"><button class="btn primary" data-action="three-reveal" ${state.casual.thinking||revealed?'disabled':''}>${state.casual.thinking?'牌友思考中…':'翻开并比牌'}</button><button class="btn" data-action="three-new">换一手牌</button></div></section><p class="casual-disclaimer">牌型顺序：豹子 ＞ 顺金 ＞ 金花 ＞ 顺子 ＞ 对子 ＞ 高牌。当前为单机训练，不使用现金、Token 或卡时。</p></div>`;
}

function mahjongTone(tile) {
  if (tile.suit !== '字') return tile.suit === '万' ? 'wan' : tile.suit === '筒' ? 'tong' : 'tiao';
  if (tile.label === '中') return 'honor honor-red';
  if (tile.label === '发') return 'honor honor-green';
  return 'honor';
}

const MAHJONG_NUMERALS = ['', '一','二','三','四','五','六','七','八','九'];
const MAHJONG_HONORS = Object.freeze({ 东:'東', 南:'南', 西:'西', 北:'北', 中:'中', 发:'發', 白:'' });
const MAHJONG_MARK_PATTERNS = Object.freeze({
  1: ['mc'],
  2: ['tc','bc'],
  3: ['tc','mc','bc'],
  4: ['tl','tr','bl','br'],
  5: ['tl','tr','mc','bl','br'],
  6: ['tl','tr','ml','mr','bl','br'],
  7: ['tc','ul','ur','ml','mr','ll','lr'],
  8: ['tl','tr','ul','ur','ll','lr','bl','br'],
  9: ['tl','tc','tr','ml','mc','mr','bl','bc','br'],
});

function mahjongPattern(rank, type) {
  if (type === 'tiao' && rank === 1) return '<b class="bamboo-bird">雀</b>';
  const pattern = MAHJONG_MARK_PATTERNS[Math.max(1, Math.min(9, Number(rank) || 1))] || MAHJONG_MARK_PATTERNS[1];
  return pattern.map((position)=>`<i class="mahjong-symbol symbol-${type} symbol-${position}"></i>`).join('');
}

function mahjongMark(tile) {
  if (tile.suit === '字') {
    const honor = MAHJONG_HONORS[tile.label] ?? tile.label;
    return `<span class="mahjong-mark mark-honor ${tile.label==='白'?'mark-blank':''}"><b>${esc(honor)}</b></span>`;
  }
  if (tile.suit === '万') return `<span class="mahjong-mark mark-wan"><b>${MAHJONG_NUMERALS[tile.rank] || esc(tile.rank)}</b><small>萬</small></span>`;
  const type = tile.suit === '筒' ? 'tong' : 'tiao';
  return `<span class="mahjong-mark mark-${type} mark-count-${tile.rank}">${mahjongPattern(tile.rank,type)}</span>`;
}

function mahjongFace(tile, extraClass = '') {
  return `<span class="mahjong-face ${mahjongTone(tile)} ${esc(extraClass)}" title="${esc(tile.label)}">${mahjongMark(tile)}</span>`;
}

function mahjongTile(tile) {
  const game = state.casual?.game;
  const selected = state.casual?.selectedTileId === tile.id;
  const interactive = game?.phase === 'playing' && game.currentSeat === 0 && game.hands[0].length === 14;
  return `<button class="mahjong-tile ${mahjongTone(tile)} ${selected?'selected':''} ${game?.drawnId===tile.id?'drawn':''}" data-mahjong-tile="${esc(tile.id)}" aria-label="${esc(tile.label)}${game?.drawnId===tile.id?'，刚摸到':''}" aria-pressed="${selected?'true':'false'}" ${interactive?'':'disabled'}>${mahjongMark(tile)}</button>`;
}

function mahjongBackRack(count, position) {
  const backs = Array.from({ length: Math.min(13, count) }, () => '<i></i>').join('');
  return `<div class="mahjong-hidden-hand hidden-hand--${position}" aria-label="暗牌 ${count} 张">${backs}<small>${count}</small></div>`;
}

function mahjongSeat(game, seat, position) {
  const player = game.players[seat];
  const name = seat === 0 ? (state.profile?.name || '你') : player.name;
  const avatar = seat === 0 ? name.slice(0,1) : (name.match(/([ABC])$/i)?.[1]?.toUpperCase() || String.fromCharCode(64 + seat));
  const active = game.phase === 'playing' && game.currentSeat === seat;
  const winner = game.result?.winnerSeat === seat;
  return `<article class="mahjong-match-seat match-seat--${position} ${active?'is-turn':''} ${winner?'is-winner':''}" data-wind="${esc(player.wind)}家" aria-label="${esc(name)}，${esc(player.wind)}家，${game.hands[seat].length}张"><span>${esc(avatar)}</span><div><b>${esc(name)}</b><small>${esc(player.wind)}家 · ${game.hands[seat].length}张</small></div></article>`;
}

function mahjongWall(game) {
  const remainingStacks = Math.ceil(game.wall.length / 2);
  return ['north','east','south','west'].map((position,side)=>`<div class="mahjong-wall-track wall-track--${position}">${Array.from({length:17},(_,index)=>`<i class="${side * 17 + index < remainingStacks ? '' : 'is-used'}"></i>`).join('')}</div>`).join('');
}

function mahjongRiver(game, seat, position, latestTileId) {
  const tiles = game.rivers[seat].slice(-24);
  return `<div class="mahjong-river match-river--${position}" aria-label="${esc(game.players[seat].name)}的牌河">${tiles.map((tile) => mahjongFace(tile, `river-face ${tile.id===latestTileId?'is-latest':''}`)).join('') || '<small>尚未出牌</small>'}</div>`;
}

function mahjongResult(game) {
  if (game.phase !== 'finished') return '';
  const result = game.result;
  if (result.kind === 'draw') return `<div class="mahjong-result-panel is-draw" role="status" aria-live="polite"><span>东一局结束</span><h2>流局</h2><p>牌墙已摸完，本局无人和牌。</p></div>`;
  const winner = game.players[result.winnerSeat];
  const winnerName = result.winnerSeat === 0 ? (state.profile?.name || '你') : winner.name;
  const action = result.kind === 'tsumo' ? '自摸' : '荣和';
  const detail = result.kind === 'ron' ? `荣和 ${esc(game.players[result.fromSeat].name)} 的弃牌` : '摸到和牌张';
  return `<div class="mahjong-result-panel ${result.winnerSeat===0?'is-win':'is-loss'}" role="status" aria-live="polite"><span>东一局结束</span><h2>${esc(winnerName)} · ${action}</h2><p>${detail}</p><b>${esc(result.pattern?.label || '完成和牌牌型')}</b></div>`;
}

function mahjongConfirmDialog() {
  const action = state.casual?.confirmAction;
  if (!action) return '';
  const leaving = action === 'home';
  return `<div class="exit-shade"><section class="exit-dialog" role="dialog" aria-modal="true" aria-labelledby="mahjong-confirm-title"><span>麻将对局进行中</span><h2 id="mahjong-confirm-title">${leaving?'确定离开这一局？':'确定重新开局？'}</h2><p>${leaving?'当前单机牌局不会保留，离开后将返回游戏大厅。':'当前进度会被清空，并立即重新洗牌开局。'}</p><div><button class="btn" data-action="mahjong-cancel-confirm">继续本局</button><button class="btn danger" data-action="mahjong-confirm">${leaving?'离开牌局':'确认重开'}</button></div></section></div>`;
}

function mahjongGame() {
  const game = state.casual?.game;
  if (!game) return lobby();
  const canDiscard = game.phase === 'playing' && game.currentSeat === 0 && game.hands[0].length === 14;
  const activeName = game.currentSeat === 0 ? (state.profile?.name || '你') : game.players[game.currentSeat].name;
  const turnHint = game.phase === 'finished' ? '本局已结束'
    : game.currentSeat === 0 ? '轮到你：选择一张手牌，再确认打出'
      : `${activeName} 正在摸打`;
  const latestDiscard = [...game.events].reverse().find((event) => event.kind === 'discard');
  const latestTile = latestDiscard ? game.rivers.flat().find((tile) => tile.id === latestDiscard.tileId) : null;
  const latestCopy = latestDiscard && latestTile ? `${game.players[latestDiscard.seat].name} 打出 ${latestTile.label}` : '你是东家，先打出一张牌';
  const sortedHand = sortMahjong(game.hands[0]);
  const drawnTile = sortedHand.find((tile) => tile.id === game.drawnId);
  const displayHand = drawnTile ? [...sortedHand.filter((tile) => tile.id !== drawnTile.id), drawnTile] : sortedHand;
  const selectedTile = displayHand.find((tile) => tile.id === state.casual?.selectedTileId);
  const discardLabel = game.phase === 'finished' ? '本局已结束' : selectedTile ? `打出 ${selectedTile.label}` : '请选择一张牌';
  return `<div class="shell casual-shell mahjong-route">${casualHeader('KAI 麻将','FOUR PLAYER MAHJONG',`东一局 · 余牌 ${game.wall.length}`)}<section class="casual-stage mahjong-match-stage">
    <div class="mahjong-table-volume" aria-hidden="true"></div><div class="mahjong-match-felt"></div>
    <div class="mahjong-wall-ring" aria-hidden="true">${mahjongWall(game)}</div>
    ${mahjongSeat(game,2,'north')}${mahjongSeat(game,3,'west')}${mahjongSeat(game,1,'east')}${mahjongSeat(game,0,'south')}
    ${mahjongBackRack(game.hands[2].length,'north')}${mahjongBackRack(game.hands[3].length,'west')}${mahjongBackRack(game.hands[1].length,'east')}
    <div class="mahjong-river-board">${mahjongRiver(game,2,'north',latestDiscard?.tileId)}${mahjongRiver(game,3,'west',latestDiscard?.tileId)}<div class="mahjong-center-score"><small>东一局</small><b>${game.wall.length}</b><span>余牌</span><i>${esc(game.players[game.currentSeat].wind)}家行动</i></div>${mahjongRiver(game,1,'east',latestDiscard?.tileId)}${mahjongRiver(game,0,'south',latestDiscard?.tileId)}</div>
    <div class="mahjong-turn-banner" role="status" aria-live="polite" aria-atomic="true"><span class="turn-pulse"></span><b>${esc(turnHint)}</b><small>${esc(latestCopy)}</small></div>
    ${mahjongResult(game)}
    <div class="mahjong-hand match-player-hand" style="--tile-count:${game.hands[0].length}">${displayHand.map(mahjongTile).join('')}</div>
    <div class="casual-actions mahjong-match-actions"><button class="btn primary" data-action="mahjong-discard" ${canDiscard&&selectedTile?'':'disabled'}>${esc(discardLabel)}</button><button class="btn" data-action="mahjong-new">${game.phase==='finished'?'再来一局':'重新开局'}</button></div>
  </section>${mahjongConfirmDialog()}<p class="casual-disclaimer">四人东一局基础速战：136 张牌、三位智能牌友、四家牌河，支持常规和牌、七对与国士无双的自摸/荣和。当前为基础规则，吃碰杠、立直、宝牌与完整点数结算将在后续版本加入。</p></div>`;
}

const XIANGQI_DIFFICULTY_DETAILS = Object.freeze({
  beginner: '适合熟悉走法',
  standard: '兼顾攻守',
  challenge: '搜索更深入',
});
const XIANGQI_PIECE_NAMES = Object.freeze({
  general: '将', advisor: '士', elephant: '象', horse: '马', rook: '车', cannon: '炮', soldier: '兵',
});

function formatXiangqiTime(totalSeconds) {
  const seconds = safeLocalCounter(totalSeconds);
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function xiangqiMoveFrom(move) {
  if (!move || typeof move !== 'object') return null;
  const value = move.fromIndex ?? move.from;
  return Number.isInteger(value) ? value : null;
}

function xiangqiMoveTo(move) {
  if (Number.isInteger(move)) return move;
  if (!move || typeof move !== 'object') return null;
  const value = move.toIndex ?? move.to;
  return Number.isInteger(value) ? value : null;
}

function safeLegalXiangqiMoves(game, fromIndex) {
  if (!game || !Number.isInteger(fromIndex)) return [];
  try {
    const moves = getLegalXiangqiMoves(game, fromIndex);
    return Array.isArray(moves) ? moves : [];
  } catch { return []; }
}

function safeXiangqiCheck(game, side = game?.turn) {
  try { return Boolean(game && isXiangqiInCheck(game, side)); }
  catch { return Boolean(game?.inCheck && (!side || side === game.turn)); }
}

function xiangqiPieceGlyph(piece) {
  if (!piece) return '';
  try { return xiangqiPieceLabel(piece) || ''; }
  catch { return piece.label || XIANGQI_PIECE_NAMES[piece.type] || '?'; }
}

function xiangqiPieceSpoken(piece) {
  if (!piece) return '空位';
  const side = piece.side === 'red' ? '红方' : '黑方';
  return `${side}${xiangqiPieceGlyph(piece) || XIANGQI_PIECE_NAMES[piece.type] || '棋子'}`;
}

function xiangqiCell(game, index, context) {
  const row = Math.floor(index / 9);
  const column = index % 9;
  const piece = game.board[index];
  const legalMove = context.legalByTarget.get(index);
  const selected = index === context.selected;
  const focused = index === context.focused;
  const lastFrom = index === context.lastFrom;
  const lastTo = index === context.lastTo;
  const checked = piece && context.checkedSide === piece.side && ['general', 'king'].includes(piece.type);
  const classes = ['xiangqi-cell'];
  if (piece) classes.push('has-piece', `piece-${piece.side}`);
  if (selected) classes.push('is-selected');
  if (legalMove) classes.push(piece ? 'is-capture' : 'is-legal');
  if (lastFrom) classes.push('is-last-from');
  if (lastTo) classes.push('is-last-to');
  if (checked) classes.push('is-check');
  const interaction = selected ? '，已选中' : legalMove ? piece ? '，可吃子' : '，可落子' : !context.locked && piece?.side === 'red' ? '，可选择' : '';
  const label = `第 ${row + 1} 行第 ${column + 1} 列，${xiangqiPieceSpoken(piece)}${interaction}`;
  const marker = legalMove ? `<i class="xiangqi-target-mark" aria-hidden="true">${piece ? '×' : ''}</i>` : '';
  const content = piece ? `<span class="xiangqi-piece" aria-hidden="true">${esc(xiangqiPieceGlyph(piece))}</span>` : '';
  return `<button type="button" class="${classes.join(' ')}" data-xiangqi-cell="${index}" role="gridcell" aria-label="${esc(label)}" aria-selected="${selected}" aria-disabled="${context.locked}" tabindex="${focused ? '0' : '-1'}">${marker}${content}</button>`;
}

function xiangqiRows(game, context) {
  return Array.from({ length: 10 }, (_, row) => {
    const first = row * 9;
    const cells = Array.from({ length: 9 }, (_, column) => xiangqiCell(game, first + column, context)).join('');
    return `<div class="xiangqi-row" role="row" aria-rowindex="${row + 1}">${cells}</div>`;
  }).join('');
}

function xiangqiTutorial(casual) {
  const step = Number(casual?.tutorialStep) || 0;
  if (!step) return '';
  const copy = step === 1
    ? ['你执红先行', '先点一枚红方棋子。']
    : step === 2
      ? ['选择落点', '圆点是可走位置，环形标记表示可以吃子。']
      : ['等待回合', '落子后 KAI 会思考，轮到你时状态栏会自动提示。'];
  return `<aside class="xiangqi-tutorial" aria-labelledby="xiangqi-tutorial-title"><span>${step} / 3 · 首局引导</span><h2 id="xiangqi-tutorial-title">${copy[0]}</h2><p>${copy[1]}</p><div><button class="text-link" data-action="xiangqi-tutorial-skip">跳过引导</button>${step === 3 ? '<button class="btn" data-action="xiangqi-tutorial-done">知道了</button>' : ''}</div></aside>`;
}

function xiangqiResult(game, casual) {
  if (game.status === 'playing') return '';
  const won = game.winner === 'red';
  const draw = !game.winner;
  const reason = ({ checkmate:'将死', stalemate:'困毙', repetition:'三次重复', long_game:'长局未吃子', draw:'双方议和' })[game.endReason || game.reason] || (draw ? '对局结束' : '将帅决胜');
  const title = draw ? `和棋 · ${reason}` : won ? `红方胜 · ${reason}` : `黑方胜 · ${reason}`;
  return `<section class="xiangqi-result ${won?'is-win':draw?'is-draw':'is-loss'}" data-xiangqi-result role="status" aria-live="polite" aria-labelledby="xiangqi-result-title" tabindex="-1"><span>本地人机训练完成</span><h2 id="xiangqi-result-title">${esc(title)}</h2><p>${XIANGQI_DIFFICULTIES[game.difficulty]?.label || '标准'}难度 · ${Math.ceil((Number(game.moveCount) || 0) / 2)} 回合 · 用时 ${formatXiangqiTime(casual.elapsedSeconds)} · 悔棋 ${safeLocalCounter(casual.undoCount)} 次</p><div><button class="btn primary" data-action="xiangqi-new">同难度再来一局</button><button class="btn" data-action="casual-home">返回大厅</button></div>${game.history?.length ? '<button class="text-link" data-action="xiangqi-undo">悔一回合继续训练</button>' : ''}</section>`;
}

function xiangqiConfirmDialog(casual) {
  if (!casual?.confirmAction) return '';
  const changingDifficulty = casual.confirmAction === 'difficulty';
  const nextLabel = changingDifficulty ? XIANGQI_DIFFICULTIES[casual.pendingDifficulty]?.label : '';
  const confirmLabel = changingDifficulty ? `切换到「${nextLabel || '新'}」并重开` : '确认重开';
  return `<div class="exit-shade"><section class="exit-dialog" data-xiangqi-confirm-dialog role="dialog" aria-modal="true" aria-labelledby="xiangqi-confirm-title" aria-describedby="xiangqi-confirm-description" tabindex="-1"><span>当前棋局进行中</span><h2 id="xiangqi-confirm-title">${changingDifficulty ? `切换到${esc(nextLabel || '新')}难度？` : '确定重新开局？'}</h2><p id="xiangqi-confirm-description">${changingDifficulty ? '切换难度会清除当前棋局，并立即以新难度执红开局。' : '重新开局会清除本局进度。确定重开吗？'}</p><div><button class="btn" data-action="xiangqi-cancel-confirm">继续对局</button><button class="btn danger" data-action="xiangqi-confirm">${esc(confirmLabel)}</button></div></section></div>`;
}

function xiangqiRulesDialog(casual) {
  if (!casual?.showRules) return '';
  return `<div class="exit-shade"><section class="xiangqi-rules-dialog" data-xiangqi-rules-dialog role="dialog" aria-modal="true" aria-labelledby="xiangqi-rules-title" aria-describedby="xiangqi-rules-summary" tabindex="-1"><span>基础训练规则</span><h2 id="xiangqi-rules-title">中国象棋怎么走</h2><div class="xiangqi-rule-grid"><p><b>车 / 炮</b>车走直线；炮吃子时隔一枚棋子。</p><p><b>马 / 象（相）</b>马走日且会蹩腿；象（相）走田且不过河。</p><p><b>士（仕）/ 将（帅）</b>士（仕）守九宫斜走；将（帅）在九宫内直走一步。</p><p><b>兵 / 卒</b>过河前向前一步，过河后可左右走。</p></div><p id="xiangqi-rules-summary">不能让自己的将帅受到攻击；将死或困毙对方即可获胜。同一局面连同走子方第三次出现时，本局判和。</p><button class="btn primary" data-action="xiangqi-close-rules">返回棋局</button></section></div>`;
}

function xiangqiGame() {
  const casual = state.casual;
  const game = casual?.game;
  if (!game || !Array.isArray(game.board) || game.board.length !== 90) return lobby();
  const selected = Number.isInteger(casual.selectedCell) ? casual.selectedCell : null;
  const focused = Number.isInteger(casual.focusedCell) ? casual.focusedCell : 85;
  const legalMoves = safeLegalXiangqiMoves(game, selected);
  const legalByTarget = new Map(legalMoves.map((move) => [xiangqiMoveTo(move), move]).filter(([index]) => Number.isInteger(index)));
  const lastMove = game.lastMove || game.history?.at?.(-1) || game.history?.[game.history.length - 1];
  const checkedSide = safeXiangqiCheck(game, game.turn) ? game.turn : null;
  const playerTurn = game.status === 'playing' && game.turn === 'red';
  const modalOpen = Boolean(casual.confirmAction || casual.showRules);
  const saveCopy = casual.saveAvailable === false ? '本次无法自动保存' : '自动保存';
  const status = game.status !== 'playing' ? '本局已经结束'
    : casual.aiThinking ? (checkedSide === 'black' ? '你已将军 · KAI 正在应对…' : 'KAI 正在思考…')
      : checkedSide === 'red' ? '将军！请先解除威胁'
        : casual.announcement || (playerTurn ? `轮到你 · ${casual.saveAvailable === false ? '本次不保存' : '进度已保存'}` : '等待 KAI 落子');
  const context = {
    selected, focused, legalByTarget, checkedSide,
    lastFrom: xiangqiMoveFrom(lastMove), lastTo: xiangqiMoveTo(lastMove),
    locked: !playerTurn || casual.aiThinking || modalOpen || game.status !== 'playing',
  };
  const difficulty = game.difficulty || 'beginner';
  const difficultyControls = ['beginner','standard','challenge'].map((key) => {
    const entry = XIANGQI_DIFFICULTIES[key] || { label: key };
    return `<button type="button" data-action="xiangqi-difficulty" data-xiangqi-difficulty="${key}" aria-pressed="${difficulty === key}" class="${difficulty === key ? 'active' : ''}"><b>${esc(entry.label)}</b><small>${XIANGQI_DIFFICULTY_DETAILS[key]}</small></button>`;
  }).join('');
  const turnLabel = game.status !== 'playing' ? '对局结束' : playerTurn ? '红方 · 你' : '黑方 · KAI';
  return `<div class="shell casual-shell xiangqi-route"><div class="xiangqi-background"${modalOpen ? ' inert aria-hidden="true"' : ''}>${casualHeader('KAI 象棋','CHINESE CHESS',`红方先行 · ${XIANGQI_DIFFICULTIES[difficulty]?.label || '初学'}难度`)}<main class="xiangqi-stage">
    <section class="xiangqi-copy"><div><span>本地人机训练 · ${saveCopy}</span><h1>隔河对弈<br><b>一步定势</b></h1><p>你执红先行。点选棋子，再落到高亮位置；将死或困毙对方即可获胜。</p></div><div class="xiangqi-difficulties" aria-label="选择象棋难度">${difficultyControls}</div>${xiangqiTutorial(casual)}</section>
    <section class="xiangqi-play" aria-busy="${casual.aiThinking}"><div class="xiangqi-metrics" aria-label="本局数据"><div><small>难度</small><strong>${esc(XIANGQI_DIFFICULTIES[difficulty]?.label || '初学')}</strong></div><div><small>回合</small><strong>${Math.ceil((Number(game.moveCount) || 0) / 2)}</strong></div><div><small>用时</small><strong data-xiangqi-time>${formatXiangqiTime(casual.elapsedSeconds)}</strong></div></div>
      <div class="xiangqi-status ${checkedSide?'is-check':''} ${casual.aiThinking?'is-thinking':''}" role="status" aria-live="polite" aria-atomic="true"><i aria-hidden="true"></i><span>${esc(status)}</span><b>${turnLabel}</b></div>
      <div class="xiangqi-board ${casual.aiThinking?'is-thinking':''}" data-xiangqi-board role="grid" aria-label="中国象棋棋盘，红方在下；使用方向键移动焦点，回车或空格选子落子" aria-rowcount="10" aria-colcount="9" aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight Enter Space Escape Control+Z" aria-busy="${casual.aiThinking}"><div class="xiangqi-board-lines" aria-hidden="true"><i class="palace palace-black"></i><i class="palace palace-red"></i><span class="xiangqi-river"><b>楚河</b><b>漢界</b></span></div>${xiangqiRows(game, context)}</div>
      <div class="xiangqi-tools" aria-label="象棋工具"><button type="button" data-action="xiangqi-undo" ${game.history?.length && !casual.aiThinking ? '' : 'disabled'}><i aria-hidden="true">↶</i><span>悔棋</span></button><button type="button" data-action="xiangqi-new"><i aria-hidden="true">↻</i><span>重新开局</span></button><button type="button" data-action="xiangqi-rules"><i aria-hidden="true">?</i><span>规则</span></button></div>
      <p class="xiangqi-key-hint">键盘：方向键移动 · Enter / 空格选择 · Esc 取消 · Ctrl/⌘ + Z 悔棋</p>${xiangqiResult(game, casual)}
    </section>
  </main><p class="casual-disclaimer">${casual.saveAvailable === false ? '本局仅在当前页面运行，本次无法自动保存；' : '本局在当前浏览器运行并自动保存，'}不请求服务端结算，不写入斗地主战绩，也不会改变竞技分、Token 或 KAI 卡时。</p></div>${xiangqiConfirmDialog(casual)}${xiangqiRulesDialog(casual)}</div>`;
}

function merge1048Tile(value, index) {
  const label = value ? `数字 ${value}` : '空格';
  return `<div class="merge-1048-tile value-${value || 0}" role="gridcell" aria-label="第 ${index + 1} 格，${label}">${value ? `<b>${value}</b>` : ''}</div>`;
}

function merge1048Result(game) {
  if (game.status === 'won') {
    return `<section class="merge-1048-result is-win" data-1048-result role="dialog" aria-labelledby="merge-1048-result-title" tabindex="-1"><span>目标达成</span><h2 id="merge-1048-result-title">合成 1048</h2><p>你用了 ${game.moves} 步，当前得分 ${money(game.score)}。</p><div><button class="btn primary" data-action="1048-continue">继续挑战</button><button class="btn" data-action="1048-new">再来一局</button></div></section>`;
  }
  if (game.status === 'over') {
    return `<section class="merge-1048-result is-over" data-1048-result role="dialog" aria-labelledby="merge-1048-result-title" tabindex="-1"><span>本局结束</span><h2 id="merge-1048-result-title">没有可移动的方块</h2><p>最高方块 ${game.bestTile} · 得分 ${money(game.score)}</p><button class="btn primary" data-action="1048-new">重新开局</button></section>`;
  }
  return '';
}

function merge1048Game() {
  const game = state.casual?.game;
  if (!game) return lobby();
  const status = game.status === 'won' ? '已达成 1048' : game.status === 'over' ? '本局结束' : game.lastGained ? `刚刚 +${game.lastGained}` : '合并相同数字';
  return `<div class="shell casual-shell merge-1048-route">${casualHeader('1048','NUMBER MERGE',`目标 ${MERGE_1048_TARGET}`)}<main class="merge-1048-stage">
    <section class="merge-1048-copy"><div><span>免费单机益智 · 自动保存</span><h1>把数字推向 <b>1048</b></h1><p>滑动棋盘或使用方向键。普通方块逐级翻倍；KAI 特殊终局规则会让最后两枚 512 融合成 1048。</p></div><button class="btn" data-action="1048-new">重新开局</button></section>
    <section class="merge-1048-play"><div class="merge-1048-metrics" aria-label="本局数据"><div><small>得分</small><strong>${money(game.score)}</strong></div><div><small>最高方块</small><strong>${game.bestTile}</strong></div><div><small>移动</small><strong>${game.moves}</strong></div></div>
      <div class="merge-1048-status" role="status" aria-live="polite"><i></i><b>${esc(status)}</b><span>512 + 512 = 1048</span></div>
      <div class="merge-1048-board" data-1048-board role="grid" aria-label="1048 数字棋盘，使用方向键或滑动移动" aria-rowcount="4" aria-colcount="4" aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight W A S D" aria-disabled="${game.status === 'playing' ? 'false' : 'true'}" tabindex="${game.status === 'playing' ? '0' : '-1'}">${game.board.map(merge1048Tile).join('')}</div>
      <div class="merge-1048-controls" aria-label="移动方向"><span></span><button data-action="1048-move" data-merge-direction="up" aria-label="向上移动" ${game.status === 'playing' ? '' : 'disabled'}>↑</button><span></span><button data-action="1048-move" data-merge-direction="left" aria-label="向左移动" ${game.status === 'playing' ? '' : 'disabled'}>←</button><button data-action="1048-move" data-merge-direction="down" aria-label="向下移动" ${game.status === 'playing' ? '' : 'disabled'}>↓</button><button data-action="1048-move" data-merge-direction="right" aria-label="向右移动" ${game.status === 'playing' ? '' : 'disabled'}>→</button></div>
      <p class="merge-1048-hint">键盘：方向键 / WASD　·　触屏：在棋盘上滑动</p>
      ${merge1048Result(game)}
    </section>
  </main><p class="casual-disclaimer">本局进度自动保存在当前浏览器。1048 是免费本地益智训练，不请求服务端结算，也不会改变竞技分、Token 或 KAI 卡时。</p></div>`;
}

function slotsGame() {
  const casual = state.casual;
  if (!casual) return lobby();
  const result = casual.last?.result;
  const resultCopy = result?.tier==='jackpot' ? '三个图标完全相同' : result?.tier==='pair' ? '其中两个图标相同' : result ? '三个图标各不相同' : '点击按钮，等待三个转轮依次停止';
  return `<div class="shell casual-shell">${casualHeader('算力转轮','COMPUTE REELS',`已旋转 ${casual.spins} 次`)}<section class="casual-stage slots-stage"><div class="slot-guide"><b>怎么玩？</b><span><i>1</i>点击免费旋转</span><span><i>2</i>三个转轮停止</span><span><i>3</i>查看图标组合</span></div><div class="slot-machine"><div class="slot-crown"><span>KAI PLAY</span><b>算力转轮</b><small>免费娱乐 · 零消耗</small></div><div class="slot-reels ${casual.spinning?'spinning':''}">${casual.reels.map((symbol,index)=>`<div class="slot-reel" style="--reel:${index}"><small>◆</small><span class="slot-symbol symbol-${symbol==='7'?'seven':'kai'}">${esc(symbol)}</span><small>★</small></div>`).join('')}</div><div class="slot-paytable"><span><b>三枚相同</b><small>三连共振</small></span><span><b>两枚相同</b><small>双核同频</small></span><span><b>各不相同</b><small>继续挑战</small></span></div><div class="slot-result ${result?.tier||''}"><b>${casual.spinning?'转轮依次停止中…':result?.label||'准备好了吗？'}</b><small>${resultCopy}</small></div><button class="slot-lever" data-action="slots-spin" ${casual.spinning?'disabled':''}><i></i><span>${casual.spinning?'正在旋转…':'免费旋转一次'}</span></button></div></section><p class="casual-disclaimer">纯视觉娱乐，不支付、不下注、不发放可兑换奖励，不会扣除竞技分、Token 或 KAI 卡时。</p></div>`;
}

function sudoku6Cell(game, index, context) {
  const row = Math.floor(index / 6);
  const column = index % 6;
  const value = game.values[index];
  const given = game.puzzle[index] !== 0;
  const notes = sudoku6NoteValues(game.notes[index]);
  const conflict = context.conflicts.has(index);
  const wrong = !given && value > 0 && value !== game.solution[index];
  const selected = index === context.selected;
  const related = context.related.has(index);
  const matched = context.selectedValue > 0 && value === context.selectedValue;
  const classes = ['sudoku6-cell', given ? 'is-given' : 'is-editable'];
  if (selected) classes.push('is-selected');
  else if (matched) classes.push('is-matched');
  else if (related) classes.push('is-related');
  if (conflict) classes.push('is-conflict');
  if (wrong) classes.push('is-wrong');
  if (game.hinted[index]) classes.push('is-hinted');
  const content = value
    ? `<b>${value}</b>`
    : notes.length
      ? `<span class="sudoku6-notes">${Array.from({ length: 6 }, (_, offset) => `<i>${notes.includes(offset + 1) ? offset + 1 : ''}</i>`).join('')}</span>`
      : '<span class="sudoku6-empty" aria-hidden="true"></span>';
  const label = `第 ${row + 1} 行第 ${column + 1} 列，${value ? `数字 ${value}` : notes.length ? `候选 ${notes.join('、')}` : '空白'}，${given ? '题目给定，只读' : '可填写'}${conflict || wrong ? '，当前有误' : ''}`;
  return `<button type="button" class="${classes.join(' ')}" data-sudoku6-cell="${index}" role="gridcell" aria-label="${label}" aria-selected="${selected}" aria-readonly="${given}" aria-invalid="${conflict || wrong}" tabindex="${selected ? '0' : '-1'}">${content}</button>`;
}

function sudoku6Result(game) {
  if (game.status !== 'completed') return '';
  const modeCopy = game.mode === 'daily' ? '今日挑战完成' : `${SUDOKU6_DIFFICULTIES[game.difficulty].label}练习完成`;
  return `<section class="sudoku6-result" data-sudoku6-result role="dialog" aria-labelledby="sudoku6-result-title" tabindex="-1"><span>${modeCopy}</span><h2 id="sudoku6-result-title">逻辑归位</h2><p>用时 ${formatSudoku6Time(game.elapsedSeconds)} · 误填 ${game.mistakes} 次 · 提示 ${game.hintsUsed} 次</p><div><button class="btn primary" data-action="sudoku6-new">${game.mode === 'daily' ? '重做今日题' : '再来一题'}</button><button class="btn" data-action="casual-home">返回大厅</button></div></section>`;
}

function sudoku6Game() {
  const casual = state.casual;
  const game = casual?.game;
  if (!game) return lobby();
  const selected = Number.isInteger(casual.selectedCell) ? casual.selectedCell : game.values.findIndex((value, index) => game.puzzle[index] === 0 && value === 0);
  const conflicts = getSudoku6Conflicts(game.values);
  const related = new Set(sudoku6PeerIndexes(selected));
  const selectedValue = game.values[selected] || 0;
  const best = loadSudoku6Stats()[sudoku6StatKey(game)];
  const difficulty = SUDOKU6_DIFFICULTIES[game.difficulty];
  const modeLabel = game.mode === 'daily' ? `每日一局 · ${game.date.slice(5).replace('-', '.')}` : `${difficulty.label}练习 · ${difficulty.clues} 个提示数`;
  const status = game.status === 'completed' ? '已完成' : casual.announcement || (conflicts.size ? '存在重复数字，请检查行、列或宫格' : '进度已自动保存');
  const difficultyControls = game.mode === 'practice'
    ? `<div class="sudoku6-difficulties" aria-label="选择数独难度">${Object.values(SUDOKU6_DIFFICULTIES).map((entry) => `<button type="button" data-action="sudoku6-difficulty" data-sudoku6-difficulty="${entry.key}" aria-pressed="${entry.key === game.difficulty}" class="${entry.key === game.difficulty ? 'active' : ''}">${entry.label}<small>${entry.clues} 提示</small></button>`).join('')}</div>`
    : '<p class="sudoku6-daily-note">每日题固定为标准难度，当天题目对所有本地挑战一致。</p>';
  const context = { selected, selectedValue, related, conflicts };
  return `<div class="shell casual-shell sudoku6-route">${casualHeader('KAI 数独','6×6 LOGIC',modeLabel)}<main class="sudoku6-stage">
    <section class="sudoku6-copy"><div><span>短时逻辑挑战 · 自动保存</span><h1>让每个数字<br><b>各得其所</b></h1><p>用 1–6 填满棋盘，每行、每列、每个 2×3 宫格中的数字都不能重复。</p></div><div class="sudoku6-mode-switch" aria-label="选择数独模式"><button type="button" data-action="sudoku6-practice" aria-pressed="${game.mode === 'practice'}" class="${game.mode === 'practice' ? 'active' : ''}">自由练习</button><button type="button" data-action="sudoku6-daily" aria-pressed="${game.mode === 'daily'}" class="${game.mode === 'daily' ? 'active' : ''}">每日一局</button></div>${difficultyControls}<button class="btn sudoku6-new" data-action="sudoku6-new">重新开题</button></section>
    <section class="sudoku6-play"><div class="sudoku6-metrics" aria-label="本局数据"><div><small>用时</small><strong data-sudoku6-time>${formatSudoku6Time(game.elapsedSeconds)}</strong></div><div><small>误填</small><strong>${game.mistakes}</strong></div><div><small>提示</small><strong>${game.hintsUsed}/${SUDOKU6_MAX_HINTS}</strong></div><div><small>无提示最佳</small><strong>${Number.isSafeInteger(best) ? formatSudoku6Time(best) : '--:--'}</strong></div></div>
      <div class="sudoku6-status ${conflicts.size ? 'is-warning' : ''}" role="status" aria-live="polite" aria-atomic="true"><i></i><span>${esc(status)}</span><b>${casual.noteMode ? '笔记模式' : '填数模式'}</b></div>
      <div class="sudoku6-board" data-sudoku6-board role="grid" aria-label="6 乘 6 数独棋盘，使用数字键填写，方向键移动" aria-rowcount="6" aria-colcount="6" aria-keyshortcuts="1 2 3 4 5 6 Backspace Delete N Control+Z">${game.values.map((_, index) => sudoku6Cell(game, index, context)).join('')}</div>
      <div class="sudoku6-number-pad" aria-label="数字键盘">${[1,2,3,4,5,6].map((value) => `<button type="button" data-action="sudoku6-value" data-sudoku6-value="${value}" ${game.status === 'playing' ? '' : 'disabled'}>${value}</button>`).join('')}</div>
      <div class="sudoku6-tools" aria-label="数独工具"><button type="button" data-action="sudoku6-notes" aria-pressed="${casual.noteMode}" class="${casual.noteMode ? 'active' : ''}" ${game.status === 'playing' ? '' : 'disabled'}><i aria-hidden="true">N</i><span>笔记</span></button><button type="button" data-action="sudoku6-undo" ${game.undoStack.length && game.status === 'playing' ? '' : 'disabled'}><i aria-hidden="true">↶</i><span>撤销</span></button><button type="button" data-action="sudoku6-clear" ${game.status === 'playing' ? '' : 'disabled'}><i aria-hidden="true">×</i><span>擦除</span></button><button type="button" data-action="sudoku6-hint" ${game.hintsUsed < SUDOKU6_MAX_HINTS && game.status === 'playing' ? '' : 'disabled'}><i aria-hidden="true">?</i><span>提示</span></button></div>
      <p class="sudoku6-key-hint">键盘：1–6 填写 · N 笔记 · Delete 擦除 · Ctrl/⌘ + Z 撤销</p>${sudoku6Result(game)}
    </section>
  </main><p class="casual-disclaimer">数独题目在本地生成并验证唯一解。进度仅保存在当前浏览器，不请求服务端结算，不改变竞技分、Token 或 KAI 卡时。</p></div>`;
}

function formatMinesweeperTime(totalSeconds) {
  const seconds = safeLocalCounter(totalSeconds);
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function minesweeperCell(game, index, context) {
  const row = Math.floor(index / game.columns);
  const column = index % game.columns;
  const cell = getMinesweeperCell(game, index);
  const focused = index === context.focused;
  const lost = game.status === 'lost';
  const won = game.status === 'won';
  const exposedMine = cell.exploded || (lost && cell.mine);
  const wrongFlag = lost && cell.flagged && !cell.mine;
  const winningFlag = won && cell.mine;
  const classes = ['minesweeper-cell'];
  if (cell.revealed) classes.push('is-revealed');
  else classes.push('is-covered');
  if (cell.flagged || winningFlag) classes.push('is-flagged');
  if (exposedMine) classes.push('is-mine');
  if (cell.exploded) classes.push('is-exploded');
  if (wrongFlag) classes.push('is-wrong-flag');
  if (cell.revealed && cell.adjacentMines > 0) classes.push(`number-${cell.adjacentMines}`);

  let content = '';
  let description = '未揭开';
  if (wrongFlag) {
    content = '<span class="minesweeper-wrong-flag" aria-hidden="true"><b>⚑</b><i>×</i></span>';
    description = '错误插旗，这里没有雷';
  } else if (cell.exploded) {
    content = '<span class="minesweeper-mine" aria-hidden="true">✹</span>';
    description = '已引爆的地雷';
  } else if (exposedMine) {
    content = cell.flagged ? '<span class="minesweeper-flag" aria-hidden="true">⚑</span>' : '<span class="minesweeper-mine" aria-hidden="true">✹</span>';
    description = cell.flagged ? '地雷，已正确插旗' : '地雷';
  } else if (cell.flagged || winningFlag) {
    content = '<span class="minesweeper-flag" aria-hidden="true">⚑</span>';
    description = won ? '地雷，已标记' : '已插旗';
  } else if (cell.revealed && cell.adjacentMines > 0) {
    content = `<b aria-hidden="true">${cell.adjacentMines}</b>`;
    description = `数字 ${cell.adjacentMines}，周围有 ${cell.adjacentMines} 颗雷`;
  } else if (cell.revealed) {
    content = '<span class="minesweeper-empty" aria-hidden="true"></span>';
    description = '已揭开的空白格';
  }

  let actionHint = '';
  if (game.status === 'ready' || game.status === 'playing') {
    if (cell.revealed) actionHint = cell.adjacentMines > 0 ? '，按回车可尝试和弦展开' : '，已展开';
    else if (cell.flagged) actionHint = context.inputMode === 'flag' ? '，按 F 或点击取消旗帜' : '，按 F 取消旗帜';
    else actionHint = `，${context.inputMode === 'flag' ? '当前点击会插旗' : '当前点击会揭开'}`;
  }
  const label = `第 ${row + 1} 行第 ${column + 1} 列，${description}${actionHint}`;
  return `<button type="button" class="${classes.join(' ')}" data-minesweeper-cell="${index}" role="gridcell" aria-rowindex="${row + 1}" aria-colindex="${column + 1}" aria-label="${esc(label)}" aria-selected="${focused}" aria-disabled="${context.locked}" tabindex="${focused ? '0' : '-1'}">${content}</button>`;
}

function minesweeperRows(game, context) {
  return Array.from({ length: game.rows }, (_, row) => {
    const cells = Array.from({ length: game.columns }, (_, column) => minesweeperCell(game, row * game.columns + column, context)).join('');
    return `<div class="minesweeper-row" role="row" aria-rowindex="${row + 1}">${cells}</div>`;
  }).join('');
}

function minesweeperResult(game) {
  if (!['won','lost'].includes(game.status)) return '';
  const won = game.status === 'won';
  return `<section class="minesweeper-result ${won ? 'is-win' : 'is-loss'}" data-minesweeper-result role="status" aria-live="polite" aria-labelledby="minesweeper-result-title" tabindex="-1"><span>${won ? '本地排雷完成' : '本局结束'}</span><h2 id="minesweeper-result-title">${won ? '雷区已清理' : '这一步踩到雷了'}</h2><p>${MINESWEEPER_DIFFICULTIES[game.difficulty]?.label || '初级'} · 用时 ${formatMinesweeperTime(game.elapsedSeconds)} · 揭开 ${safeLocalCounter(game.revealedCount)} 格 · 和弦 ${safeLocalCounter(game.chordCount)} 次</p><div><button class="btn primary" data-action="minesweeper-new">同难度再来一局</button><button class="btn" data-action="casual-home">返回大厅</button></div></section>`;
}

function minesweeperConfirmDialog(casual) {
  if (!casual?.confirmAction) return '';
  const changingDifficulty = casual.confirmAction === 'difficulty';
  const nextDifficulty = MINESWEEPER_DIFFICULTIES[casual.pendingDifficulty];
  return `<div class="exit-shade"><section class="exit-dialog minesweeper-confirm-dialog" data-minesweeper-confirm-dialog role="dialog" aria-modal="true" aria-labelledby="minesweeper-confirm-title" aria-describedby="minesweeper-confirm-description" tabindex="-1"><span>当前雷区尚未完成</span><h2 id="minesweeper-confirm-title">${changingDifficulty ? `切换到${esc(nextDifficulty?.label || '新')}难度？` : '确定重新布置雷区？'}</h2><p id="minesweeper-confirm-description">${changingDifficulty ? `切换后会清除本局进度，并生成 ${nextDifficulty?.rows || ''}×${nextDifficulty?.columns || ''} 的新棋盘。` : '重新开局会清除当前揭格、旗帜和计时。确定继续吗？'}</p><div><button class="btn" data-action="minesweeper-cancel-confirm">继续本局</button><button class="btn danger" data-action="minesweeper-confirm">${changingDifficulty ? '切换难度' : '重新开局'}</button></div></section></div>`;
}

function minesweeperGame() {
  const casual = state.casual;
  const game = casual?.game;
  if (!game) return lobby();
  const difficulty = MINESWEEPER_DIFFICULTIES[game.difficulty] || MINESWEEPER_DIFFICULTIES.beginner;
  const focused = Number.isInteger(casual.focusedCell) && casual.focusedCell >= 0 && casual.focusedCell < game.rows * game.columns ? casual.focusedCell : 0;
  const inputMode = casual.inputMode === 'flag' ? 'flag' : 'reveal';
  const modalOpen = Boolean(casual.confirmAction);
  const remaining = getMinesweeperRemainingMines(game);
  const safeCellCount = game.rows * game.columns - game.mineCount;
  const progress = Math.round((safeLocalCounter(game.revealedCount) / Math.max(1, safeCellCount)) * 100);
  const saveConflict = casual.saveConflict === true;
  const saveUnavailable = casual.saveAvailable === false && !saveConflict;
  const status = saveConflict ? '另一个标签页已有更新 · 本页不会覆盖最新存档'
    : saveUnavailable ? '本浏览器无法保存进度 · 本局仍可继续'
      : game.status === 'ready' ? casual.announcement || '第一步不会踩雷 · 请选择一格开始'
    : game.status === 'won' ? '全部安全格已经揭开'
      : game.status === 'lost' ? '雷区已展开 · 错误旗帜以红色标出'
        : casual.announcement || '进度已自动保存';
  const context = { focused, inputMode, locked: modalOpen || ['won','lost'].includes(game.status) };
  const difficultyControls = Object.values(MINESWEEPER_DIFFICULTIES).map((entry) => `<button type="button" data-action="minesweeper-difficulty" data-minesweeper-difficulty="${entry.key}" aria-pressed="${entry.key === game.difficulty}" class="${entry.key === game.difficulty ? 'active' : ''}"><b>${esc(entry.label)}</b><small>${entry.rows}×${entry.columns} · ${entry.mines} 雷</small></button>`).join('');
  const scrollHint = game.columns >= 12 ? '<p class="minesweeper-scroll-hint" id="minesweeper-scroll-hint">棋盘较宽，小屏可左右滑动查看完整雷区。</p>' : '';
  const boardDescription = `minesweeper-key-hint${game.columns >= 12 ? ' minesweeper-scroll-hint' : ''}`;
  return `<div class="shell casual-shell minesweeper-route difficulty-${game.difficulty}"><div class="minesweeper-background"${modalOpen ? ' inert aria-hidden="true"' : ''}>${casualHeader('KAI 扫雷','MINESWEEPER',`${difficulty.label} · ${game.rows}×${game.columns} · ${game.mineCount} 雷`)}<main class="minesweeper-stage">
    <section class="minesweeper-copy"><div><span>首击安全 · ${saveConflict ? '多标签冲突保护' : saveUnavailable ? '当前存档不可用' : '本地自动保存'}</span><h1>读懂数字<br><b>排除雷区</b></h1><p>数字表示周围八格的地雷数量。先从确定安全的位置展开，再把推断出的地雷插上旗帜。</p></div><div class="minesweeper-difficulties" aria-label="选择扫雷难度">${difficultyControls}</div><ol class="minesweeper-guide"><li><i>1</i><span><b>放心首击</b><small>第一格及附近区域不会布雷</small></span></li><li><i>2</i><span><b>数字推理</b><small>数字等于周围八格的雷数</small></span></li><li><i>3</i><span><b>快速展开</b><small>旗数吻合时点击数字格可和弦</small></span></li></ol><button class="btn minesweeper-new" data-action="minesweeper-new">重新布雷</button></section>
    <section class="minesweeper-play"><div class="minesweeper-metrics" aria-label="本局数据"><div><small>剩余雷数</small><strong>${remaining}</strong></div><div><small>已插旗</small><strong>${safeLocalCounter(game.flagCount)}/${game.mineCount}</strong></div><div><small>用时</small><strong data-minesweeper-time>${formatMinesweeperTime(game.elapsedSeconds)}</strong></div><div><small>已展开</small><strong>${Math.min(100, progress)}%</strong></div></div>
      <div class="minesweeper-status ${game.status === 'lost' ? 'is-danger' : game.status === 'won' ? 'is-success' : ''}" role="status" aria-live="polite" aria-atomic="true"><i aria-hidden="true"></i><span>${esc(status)}</span><b>${inputMode === 'flag' ? '插旗模式' : '揭开模式'}</b></div>
      <div class="minesweeper-input-modes" role="group" aria-label="触屏操作模式"><button type="button" data-action="minesweeper-mode" data-minesweeper-mode="reveal" class="${inputMode === 'reveal' ? 'active' : ''}" aria-pressed="${inputMode === 'reveal'}"><i aria-hidden="true">⌁</i><span>揭开格子</span></button><button type="button" data-action="minesweeper-mode" data-minesweeper-mode="flag" class="${inputMode === 'flag' ? 'active' : ''}" aria-pressed="${inputMode === 'flag'}"><i aria-hidden="true">⚑</i><span>插旗标记</span></button></div>
      ${scrollHint}<div class="minesweeper-board-scroll" data-minesweeper-scroll tabindex="-1"><div class="minesweeper-board" data-minesweeper-board role="grid" aria-label="${game.rows} 行 ${game.columns} 列扫雷棋盘，首击安全；使用方向键移动，回车或空格揭开，F 插旗" aria-describedby="${boardDescription}" aria-rowcount="${game.rows}" aria-colcount="${game.columns}" aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight Enter Space F Escape" aria-disabled="${context.locked}" style="--minesweeper-columns:${game.columns}">${minesweeperRows(game, context)}</div></div>
      <p class="minesweeper-key-hint" id="minesweeper-key-hint">键盘：方向键移动 · Enter / 空格揭开或和弦 · F 插旗 · Esc 返回揭开模式</p>${minesweeperResult(game)}
    </section>
  </main><p class="casual-disclaimer">${saveConflict ? '检测到其他标签页的更新，本页已停止写入以保护最新存档；返回大厅后重新进入即可载入。' : saveUnavailable ? '本浏览器当前无法写入本地存档；本局仍可继续，但刷新后可能无法恢复。' : '本局完全在当前浏览器运行并自动保存；'}不请求服务端结算，不写入斗地主战绩，也不会改变竞技分、Token 或 KAI 卡时。</p></div>${minesweeperConfirmDialog(casual)}</div>`;
}

function gomokuCell(game, index, casual) {
  const row = Math.floor(index / GOMOKU_SIZE);
  const column = index % GOMOKU_SIZE;
  const side = game.board[index];
  const winning = game.winningLine?.includes(index);
  const last = game.lastMove?.index === index;
  const focused = casual.focusedCell === index;
  const classes = ['gomoku-cell'];
  if (side) classes.push(`is-${side}`);
  if (winning) classes.push('is-winning');
  if (last) classes.push('is-last');
  const content = side ? '<i aria-hidden="true"></i>' : '';
  const label = `第 ${row + 1} 行第 ${column + 1} 列，${side === 'black' ? '黑棋' : side === 'white' ? '白棋' : '空位'}${last ? '，最后一步' : ''}${winning ? '，胜利连线' : ''}`;
  return `<button type="button" class="${classes.join(' ')}" data-gomoku-cell="${index}" role="gridcell" aria-label="${label}" aria-selected="${last}" aria-disabled="${Boolean(side || game.status !== 'playing')}" tabindex="${focused ? '0' : '-1'}">${content}</button>`;
}

function gomokuResult(game) {
  if (game.status !== 'finished') return '';
  const won = game.winner === 'black';
  const draw = !game.winner;
  return `<section class="gomoku-result ${won ? 'is-win' : draw ? 'is-draw' : 'is-loss'}" data-gomoku-result role="status" aria-live="polite" tabindex="-1"><span>本地人机对弈完成</span><h2>${draw ? '棋盘落满 · 和棋' : won ? '黑棋连成五子' : 'KAI 白棋连成五子'}</h2><p>共落 ${game.moveCount} 手 · ${draw ? '势均力敌' : won ? '你赢下了这局' : '再来一局扳回来'}</p><div><button class="btn primary" data-action="gomoku-new">再来一局</button><button class="btn" data-action="casual-home">返回大厅</button></div></section>`;
}

function gomokuGame() {
  const casual = state.casual;
  const game = casual?.game;
  if (!game || game.kind !== 'gomoku') return lobby();
  const persistenceAvailable = casual.saveAvailable !== false;
  const status = game.status === 'finished' ? (game.winner === 'black' ? '你已连成五子' : game.winner === 'white' ? 'KAI 已连成五子' : '本局和棋')
    : casual.announcement || (game.moveCount ? '轮到你落黑棋' : '你执黑先行 · 从中心附近开始');
  return `<div class="shell casual-shell gomoku-route">${casualHeader('KAI 五子棋','GOMOKU',`15×15 · 你执黑先行`)}<main class="gomoku-stage">
    <section class="gomoku-copy"><div><span>本地人机对弈 · ${persistenceAvailable ? '自动保存' : '仅本轮可玩'}</span><h1>落下一子<br><b>连成五子</b></h1><p>你执黑棋先行。横、竖或斜线率先连成五颗棋子即可获胜，KAI 会在每次落子后立即回应。</p></div><ol><li><i>1</i><span><b>抢占中心</b><small>越靠近中心，延展方向越多</small></span></li><li><i>2</i><span><b>制造活线</b><small>同时保留两端更难防守</small></span></li><li><i>3</i><span><b>及时封堵</b><small>看到对手四连要马上阻断</small></span></li></ol><button class="btn" data-action="gomoku-new">重新开局</button></section>
    <section class="gomoku-play"><div class="gomoku-metrics" aria-label="本局数据"><div><small>你的黑棋</small><strong>${game.board.filter((cell) => cell === 'black').length}</strong></div><div><small>KAI 白棋</small><strong>${game.board.filter((cell) => cell === 'white').length}</strong></div><div><small>总手数</small><strong>${game.moveCount}</strong></div></div>
      <div class="gomoku-status ${game.status === 'finished' ? 'is-finished' : ''}" role="status" aria-live="polite"><i aria-hidden="true"></i><span>${esc(status)}</span><b>${game.status === 'playing' ? '黑方 · 你' : '对局结束'}</b></div>
      <div class="gomoku-board-scroll"><div class="gomoku-board" data-gomoku-board role="grid" aria-label="15 乘 15 五子棋棋盘，方向键移动，回车或空格落子" aria-rowcount="15" aria-colcount="15" aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight Enter Space Home End">${Array.from({ length:GOMOKU_CELL_COUNT }, (_, index) => gomokuCell(game, index, casual)).join('')}</div></div>
      <p class="gomoku-key-hint">键盘：方向键移动 · Enter / 空格落子 · Home / End 跳到首尾</p>${gomokuResult(game)}
    </section>
  </main><p class="casual-disclaimer">${persistenceAvailable ? '本局在当前浏览器运行并自动保存' : '当前浏览器存储不可用，本局仍可继续但刷新后不会恢复'}，不请求服务端结算，不写入斗地主战绩，也不会改变竞技分、Token 或 KAI 卡时。</p></div>`;
}

function formatMemoryTime(totalSeconds) {
  const seconds = safeLocalCounter(totalSeconds);
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function memoryMatchCard(game, index, focused) {
  const card = getMemoryMatchCard(game, index);
  const hidden = card.state === 'hidden';
  const matched = card.state === 'matched';
  const label = hidden ? `第 ${index + 1} 张牌，未翻开` : `第 ${index + 1} 张牌，${card.label}${matched ? '，已匹配' : '，已翻开'}`;
  return `<button type="button" class="memory-card is-${card.state}" data-memory-card="${index}" role="gridcell" aria-label="${label}" aria-pressed="${!hidden}" aria-disabled="${matched || game.pendingMismatch}" tabindex="${focused ? '0' : '-1'}"><span class="memory-card-inner"><i class="memory-card-back" aria-hidden="true"><b>K</b><small>KAI</small></i><i class="memory-card-front" aria-hidden="true"><b>${card.glyph || ''}</b><small>${card.label || ''}</small></i></span></button>`;
}

function memoryMatchResult(casual) {
  const game = casual.game;
  if (game.status !== 'won') return '';
  const best = casual.bestScores?.scores?.[game.difficulty];
  const isBest = best?.moveCount === game.moveCount && best?.elapsedSeconds === game.elapsedSeconds;
  return `<section class="memory-result is-win" data-memory-result role="status" aria-live="polite" tabindex="-1"><span>${isBest ? '本难度最佳' : '全部配对完成'}</span><h2>记忆拼图归位</h2><p>${game.moveCount} 步 · ${formatMemoryTime(game.elapsedSeconds)} · ${game.pairCount} 对全部找到</p><div><button class="btn primary" data-action="memory-new">再来一局</button><button class="btn" data-action="casual-home">返回大厅</button></div></section>`;
}

function memoryMatchGame() {
  const casual = state.casual;
  const game = casual?.game;
  if (!game || game.kind !== 'memory-match') return lobby();
  const persistenceAvailable = casual.saveAvailable !== false;
  const definition = MEMORY_MATCH_DIFFICULTIES[game.difficulty];
  const best = casual.bestScores?.scores?.[game.difficulty];
  const status = game.status === 'won' ? '全部配对完成'
    : game.pendingMismatch ? '图案不同，稍后自动翻回'
      : casual.announcement || (game.faceUp.length ? '再翻一张，寻找相同图案' : '翻开两张牌，找出相同图案');
  const difficulties = Object.values(MEMORY_MATCH_DIFFICULTIES).map((entry) => `<button type="button" data-action="memory-difficulty" data-memory-difficulty="${entry.key}" class="${entry.key === game.difficulty ? 'active' : ''}" aria-pressed="${entry.key === game.difficulty}"><b>${entry.label}</b><small>${entry.rows}×${entry.columns}</small></button>`).join('');
  return `<div class="shell casual-shell memory-route">${casualHeader('KAI 记忆翻牌','MEMORY MATCH',`${definition.label} · ${game.pairCount} 对图案`)}<main class="memory-stage">
    <section class="memory-copy"><div><span>短局记忆训练 · ${persistenceAvailable ? '自动保存' : '仅本轮可玩'}</span><h1>翻开卡片<br><b>找出成对记忆</b></h1><p>每次翻开两张卡片；图案相同就会保留，不同则自动盖回。用更少步数完成整盘。</p></div><div class="memory-difficulties" aria-label="选择记忆翻牌难度">${difficulties}</div><button class="btn" data-action="memory-new">重新洗牌</button></section>
    <section class="memory-play"><div class="memory-metrics" aria-label="本局数据"><div><small>已配对</small><strong>${game.matchedPairs}/${game.pairCount}</strong></div><div><small>步数</small><strong>${game.moveCount}</strong></div><div><small>用时</small><strong data-memory-time>${formatMemoryTime(game.elapsedSeconds)}</strong></div><div><small>最佳</small><strong>${best ? `${best.moveCount}步` : '--'}</strong></div></div>
      <div class="memory-status ${game.pendingMismatch ? 'is-warning' : ''}" role="status" aria-live="polite"><i aria-hidden="true"></i><span>${esc(status)}</span><b>${definition.label}</b></div>
      <div class="memory-board" data-memory-board role="grid" aria-label="${definition.rows} 行 ${definition.columns} 列记忆翻牌棋盘，使用方向键移动，回车或空格翻牌" aria-rowcount="${definition.rows}" aria-colcount="${definition.columns}" aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight Enter Space" style="--memory-columns:${definition.columns}">${game.deck.map((_, index) => memoryMatchCard(game, index, casual.focusedCard === index)).join('')}</div>
      <p class="memory-key-hint">键盘：方向键移动 · Enter / 空格翻牌</p>${memoryMatchResult(casual)}
    </section>
  </main><p class="casual-disclaimer">${persistenceAvailable ? '本局完全在当前浏览器运行并自动保存' : '当前浏览器存储不可用，本局仍可继续但刷新后不会恢复'}，不请求服务端结算，不写入斗地主战绩，也不会改变竞技分、Token 或 KAI 卡时。</p></div>`;
}

function snakeCellVisual(game, index) {
  const bodyIndex = game.snake.indexOf(index);
  const food = game.food === index;
  const classes = ['snake-cell'];
  if (bodyIndex === 0) classes.push('is-head');
  else if (bodyIndex > 0) classes.push(bodyIndex === game.snake.length - 1 ? 'is-tail' : 'is-body');
  if (food) classes.push('is-food');
  return {
    className:classes.join(' '),
    content:food ? '<b>◆</b>' : bodyIndex === 0 ? '<b></b>' : '',
  };
}

function snakeCell(game, index) {
  const visual = snakeCellVisual(game, index);
  return `<i class="${visual.className}" data-snake-cell="${index}" aria-hidden="true">${visual.content}</i>`;
}

function snakeResult(game) {
  if (!['over', 'won'].includes(game.status)) return '';
  const won = game.status === 'won';
  return `<section class="snake-result ${won ? 'is-win' : 'is-over'}" role="status" aria-live="polite" tabindex="-1" data-snake-result><span>${won ? '全盘完成' : '本轮结束'}</span><h2>${won ? '整座能量场已点亮' : '碰到边界或自己了'}</h2><p>得分 ${game.score} · 收集 ${game.foodsEaten} 枚能量 · 前进 ${game.ticks} 格</p><div><button class="btn primary" data-action="snake-new">再来一局</button><button class="btn" data-action="casual-home">返回大厅</button></div></section>`;
}

function snakeGame() {
  const casual = state.casual;
  const game = casual?.game;
  if (!game || game.kind !== 'snake') return lobby();
  const persistenceAvailable = casual.saveAvailable !== false;
  const difficulty = SNAKE_DIFFICULTIES[game.difficulty] || SNAKE_DIFFICULTIES.normal;
  const best = Math.max(loadSnakeBest(), safeLocalCounter(game.score));
  const status = game.status === 'ready' ? '按方向键或点击方向开始'
    : game.status === 'paused' ? '已暂停 · 随时继续'
      : game.status === 'playing' ? casual.announcement || '保持节奏，继续收集能量'
        : game.status === 'won' ? '能量场全部点亮' : '本轮结束';
  const toggleLabel = game.status === 'ready' ? '开始' : game.status === 'paused' ? '继续' : game.status === 'playing' ? '暂停' : '重新开始';
  const difficulties = Object.values(SNAKE_DIFFICULTIES).map((entry) => `<button type="button" data-action="snake-difficulty" data-snake-difficulty="${entry.key}" class="${entry.key === game.difficulty ? 'active' : ''}" aria-pressed="${entry.key === game.difficulty}"><b>${entry.label}</b><small>${entry.tickMs} ms</small></button>`).join('');
  return `<div class="shell casual-shell snake-route">${casualHeader('KAI 贪吃蛇','NEON SNAKE',`${difficulty.label}速度 · ${persistenceAvailable ? '本地自动保存' : '仅本轮可玩'}`)}<main class="snake-stage">
    <section class="snake-copy"><div><span>即时操作 · 手机触控友好</span><h1>穿过光栅<br><b>收集能量</b></h1><p>控制蛇头吃到发光能量，身体会逐渐变长。撞到边界或自己的身体，本轮就结束。</p></div><div class="snake-difficulties" aria-label="选择贪吃蛇速度">${difficulties}</div><ol><li><i>1</i><span><b>选择方向</b><small>点击方向键即可开始</small></span></li><li><i>2</i><span><b>收集能量</b><small>每枚能量增加 10 分</small></span></li><li><i>3</i><span><b>避免碰撞</b><small>不能立即反向移动</small></span></li></ol></section>
    <section class="snake-play"><div class="snake-metrics" aria-label="本轮数据"><div><small>得分</small><strong data-snake-score>${game.score}</strong></div><div><small>最佳</small><strong data-snake-best>${best}</strong></div><div><small>长度</small><strong data-snake-length>${game.snake.length}</strong></div></div>
      <div class="snake-status ${game.status === 'playing' ? 'is-live' : ''}" data-snake-status role="status" aria-live="${game.status === 'playing' && casual.announcement === '保持节奏' ? 'off' : 'polite'}"><i aria-hidden="true"></i><span data-snake-status-text>${esc(status)}</span><b>${difficulty.label}</b></div>
      <div class="snake-board" data-snake-board role="application" aria-roledescription="贪吃蛇游戏棋盘" aria-label="${game.rows} 乘 ${game.columns} 贪吃蛇，使用方向键或 WASD 控制" aria-describedby="snake-key-hint" aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight W A S D Space" tabindex="0" style="--snake-columns:${game.columns}">${Array.from({ length:game.rows * game.columns }, (_, index) => snakeCell(game, index)).join('')}</div>
      <div class="snake-controls" aria-label="贪吃蛇方向控制"><span></span><button type="button" data-action="snake-direction" data-snake-direction="up" aria-label="向上">↑</button><span></span><button type="button" data-action="snake-direction" data-snake-direction="left" aria-label="向左">←</button><button type="button" data-action="snake-direction" data-snake-direction="down" aria-label="向下">↓</button><button type="button" data-action="snake-direction" data-snake-direction="right" aria-label="向右">→</button></div>
      <div class="snake-actions"><button class="btn primary" data-action="snake-toggle">${toggleLabel}</button><button class="btn" data-action="snake-new">重新开始</button></div>
      <p class="snake-key-hint" id="snake-key-hint">键盘：方向键 / WASD 控制 · 空格暂停或继续</p>${snakeResult(game)}
    </section>
  </main><p class="casual-disclaimer">${persistenceAvailable ? '本轮完全在当前浏览器运行并自动保存' : '当前浏览器存储不可用，本轮仍可继续但刷新后不会恢复'}，不请求服务端结算，不写入斗地主战绩，也不会改变竞技分、Token 或 KAI 卡时。</p></div>`;
}

function historyMatchWon(match) {
  if (match.role === 'landlord') return match.winner === 'landlord';
  if (match.role === 'farmer') return match.winner === 'farmers';
  return Number(match.delta) > 0;
}

function currentWinStreak(matches) {
  let streak = 0;
  for (const match of matches) {
    if (!historyMatchWon(match)) break;
    streak += 1;
  }
  return streak;
}

function bestWinStreak(matches) {
  let current = 0;
  let best = 0;
  for (const match of matches) {
    current = historyMatchWon(match) ? current + 1 : 0;
    best = Math.max(best, current);
  }
  return best;
}

function history() {
  if (state.historyStatus === 'loading' && !state.history) {
    return `<div class="shell page-shell season-page">${header()}<section class="history-state-card" aria-live="polite"><i class="history-state-spinner" aria-hidden="true"></i><span>正在整理战绩</span><h1>读取最近牌局…</h1><p>竞技分与已结算记录正在从服务端同步。</p></section>${nav('history')}</div>`;
  }
  if (state.historyStatus === 'error' && !state.history) {
    return `<div class="shell page-shell season-page">${header()}<section class="history-state-card is-error" role="alert"><span>暂时无法读取</span><h1>战绩没有被清空</h1><p>${esc(state.historyError || '网络连接暂时不可用，请稍后重试。')}</p><button class="btn primary" data-action="retry-history">重新读取</button></section>${nav('history')}</div>`;
  }
  const matches=Array.isArray(state.history?.games) ? state.history.games : [];
  const profile=state.profile || {};
  const totalGames=Math.max(0,Number(profile.games) || 0);
  const totalWins=Math.max(0,Number(profile.wins) || 0);
  const trend=[...matches.slice(0,10)].reverse();
  const recentDelta=trend.reduce((sum,match)=>sum+(Number(match.delta)||0),0);
  const trendScale=Math.max(1,...trend.map(match=>Math.abs(Number(match.delta)||0)));
  const trendBars=trend.length ? trend.map((match,index)=>{
    const delta=Number(match.delta)||0;
    const height=Math.max(12,Math.round(Math.abs(delta)/trendScale*100));
    return `<i class="${delta>=0?'positive':'negative'}" style="--trend-height:${height}%" title="第 ${index+1} 局：${delta>=0?'+':''}${delta} 分"><span>${delta>=0?'+':''}${delta}</span></i>`;
  }).join('') : '<p>完成首局后，这里会按时间显示最近的竞技分变化。</p>';
  const recentMatches=matches.length ? matches.map(match=>{
    const won=historyMatchWon(match);
    const delta=Number(match.delta)||0;
    const updated=new Date(match.updatedAt);
    const dateLabel=Number.isNaN(updated.getTime()) ? '时间未记录' : updated.toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});
    return `<article class="recent-match"><span class="${won?'positive':'negative'}">${won?'胜':'负'}</span><div><b>斗地主 · ${match.role==='landlord'?'领队':'协作位'}</b><small>${esc(dateLabel)} · ${Number(match.multiplier)||1} 倍结算</small></div><strong class="${delta>=0?'positive':'negative'}">${delta>=0?'+':''}${money(delta)}</strong></article>`;
  }).join('') : `<div class="empty-state"><b>还没有完成的牌局</b><p>你的段位、趋势和最近对局会在首局结算后出现在这里。</p><button class="btn primary" data-action="quick">开始第一局</button></div>`;
  const statusNotice=state.historyStatus==='error' ? `<div class="history-inline-error" role="alert"><span>显示上次成功读取的记录</span><b>${esc(state.historyError || '最新战绩同步失败')}</b><button class="btn" data-action="retry-history">重试</button></div>` : '';
  return `<div class="shell page-shell season-page">${header()}${statusNotice}
    <section class="season-hero"><div class="season-rank"><span>我的战绩</span><h1>${tierName(profile)}</h1><p>当前账户 · 全部已保存对局</p></div><div class="score-overview"><small>竞技分</small><strong>${money(competitiveScore(profile))}</strong></div></section>
    <section class="season-metrics" aria-label="战绩摘要"><div><strong>${totalGames}</strong><span>完成对局</span></div><div><strong>${totalGames?winRatePercent(profile):0}%</strong><span>总胜率</span></div><div><strong>${totalWins}</strong><span>累计胜局</span></div><div><strong>${currentWinStreak(matches)}</strong><span>近 ${matches.length || 0} 局当前连胜</span></div><div><strong>${bestWinStreak(matches)}</strong><span>近 ${matches.length || 0} 局最佳连胜</span></div></section>
    <section class="trend-strip"><div class="history-summary"><div><span>近期走势</span><h2>最近 ${trend.length} 局</h2></div><strong class="${recentDelta>=0?'positive':'negative'}">${recentDelta>=0?'+':''}${money(recentDelta)}<small> 分</small></strong></div><div class="trend-bars" aria-label="最近对局竞技分变化">${trendBars}</div></section>
    <section class="history-list"><div class="section-head"><div><span class="section-kicker">最近牌局</span><h2>${matches.length?'逐局记录':'等待第一场记录'}</h2></div><p>最多展示服务端返回的最近 20 局</p></div>${recentMatches}</section>
    ${nav('history')}</div>`;
}

function rules() { return `<div class="shell page-shell">${header()}<div class="section-head page-title"><div><span class="section-kicker">FAIR PLAY</span><h1>规则与公平</h1></div><p>免费竞技，结果透明</p></div><section class="card"><div class="rules"><div class="rule"><span>01</span><div><h3>竞技分不是支付资产</h3><p class="muted">竞技分只用于斗地主段位、匹配与战绩展示，不可购买、提现、转让或兑换。</p></div></div><div class="rule"><span>02</span><div><h3>45 秒思考与自动托管</h3><p class="muted">斗地主真人回合有 45 秒思考时间；智能牌友会分别思考后行动，倒计时结束由服务端托管。</p></div></div><div class="rule"><span>03</span><div><h3>系统发牌与本地棋局</h3><p class="muted">斗地主由服务端发牌；其余玩法由各自本地规则引擎生成牌面、棋局或关卡，并在浏览器内判定每一步。</p></div></div><div class="rule"><span>04</span><div><h3>竞技与试玩分区</h3><p class="muted">斗地主由服务端判定并记录战绩；象棋、五子棋、麻将、1048、数独、扫雷、记忆翻牌、贪吃蛇、炸金花和算力转轮均为免费训练，不计竞技分。</p></div></div><div class="rule"><span>05</span><div><h3>卡时与输赢隔离</h3><p class="muted">KAI 卡时只用于明确的 AI 与云端服务，不作为牌桌筹码；试玩场也不支付、不下注、不发放可兑换奖励。</p></div></div></div></section>${nav('rules')}</div>`; }

function render() {
  app.innerHTML = state.view==='game'?game():state.view==='room'?room():state.view==='three'?threeCardGame():state.view==='mahjong'?mahjongGame():state.view==='xiangqi'?xiangqiGame():state.view==='gomoku'?gomokuGame():state.view==='1048'?merge1048Game():state.view==='sudoku6'?sudoku6Game():state.view==='minesweeper'?minesweeperGame():state.view==='memory'?memoryMatchGame():state.view==='snake'?snakeGame():state.view==='slots'?slotsGame():state.view==='history'?history():state.view==='rules'?rules():lobby();
  app.setAttribute('aria-busy', String(state.busy));
  if (state.busy) {
    app.querySelectorAll('button,input').forEach((control) => { control.disabled = true; });
    app.insertAdjacentHTML('beforeend', '<div class="global-busy" role="status" aria-live="polite"><i aria-hidden="true"></i><span>正在处理，请稍候…</span></div>');
  }
}

function stopMahjongBotSequence() {
  if (mahjongBotTimer) clearTimeout(mahjongBotTimer);
  mahjongBotTimer = null;
}

function stopCasualTimers() {
  if (threeRevealTimer) clearTimeout(threeRevealTimer);
  if (slotSpinTimer) clearTimeout(slotSpinTimer);
  if (xiangqiAiTimer) clearTimeout(xiangqiAiTimer);
  if (snakeTimer) clearTimeout(snakeTimer);
  if (memoryMismatchTimer) clearTimeout(memoryMismatchTimer);
  threeRevealTimer = null;
  slotSpinTimer = null;
  xiangqiAiTimer = null;
  snakeTimer = null;
  memoryMismatchTimer = null;
  cancelMinesweeperLongPress();
  minesweeperSuppressedClick = null;
}

function queueMahjongBotTurn() {
  stopMahjongBotSequence();
  const game = state.casual?.game;
  if (state.view !== 'mahjong' || !game || game.phase !== 'playing' || !game.players[game.currentSeat]?.isBot || state.casual?.confirmAction) return;
  mahjongBotTimer = setTimeout(() => {
    mahjongBotTimer = null;
    const liveGame = state.casual?.game;
    if (state.view !== 'mahjong' || !liveGame || liveGame.phase !== 'playing' || !liveGame.players[liveGame.currentSeat]?.isBot) return;
    try {
      state.casual.game = advanceMahjongBotTurn(liveGame);
      state.casual.selectedTileId = null;
    } catch (error) {
      toast(error.message);
      return;
    }
    render();
    queueMahjongBotTurn();
  }, 650);
}

function updateHeroControls(nextGame) {
  document.querySelectorAll('[data-action="hero-select"]').forEach((control) => {
    const selected = control.dataset.heroGame === nextGame;
    control.setAttribute('aria-pressed', String(selected));
    control.classList.toggle('active', selected && control.closest('.hero-switcher'));
    control.classList.toggle('is-primary', selected && control.closest('.lobby-mode-rail'));
  });
  const status = document.querySelector('[data-hero-status]');
  if (status) status.textContent = `当前展示${nextGame === 'mahjong' ? '麻将' : '斗地主'}`;
}

function switchHero(nextGame, direction = 'next') {
  const normalized = nextGame === 'mahjong' ? 'mahjong' : 'ddz';
  if (state.view !== 'lobby') return;
  const previous = state.heroGame === 'mahjong' ? 'mahjong' : 'ddz';
  if (normalized === previous) return;
  const carousel = document.querySelector('[data-hero-carousel]');
  const stages = [...(carousel?.querySelectorAll('.lobby-game-stage') || [])];
  const current = carousel?.querySelector(`[data-hero-stage="${previous}"]`);
  const next = carousel?.querySelector(`[data-hero-stage="${normalized}"]`);
  state.heroGame = normalized;
  safeStorageSet(HERO_GAME_KEY, normalized);
  updateHeroControls(normalized);
  if (!current || !next) { render(); return; }
  if (heroTransitionTimer) {
    clearTimeout(heroTransitionTimer);
    heroTransitionTimer = null;
  }

  const transitionClasses = ['is-active','is-preparing','is-from-left','is-from-right','is-leaving-left','is-leaving-right'];
  stages.forEach((stage) => {
    stage.classList.remove(...transitionClasses);
    stage.setAttribute('aria-hidden', 'true');
    stage.setAttribute('inert', '');
  });

  const reducedMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  next.removeAttribute('inert');
  next.setAttribute('aria-hidden', 'false');
  if (reducedMotion) {
    next.classList.add('is-active');
    return;
  }

  const reverse = direction === 'previous';
  current.classList.add('is-active');
  current.setAttribute('aria-hidden', 'false');
  next.classList.add('is-preparing', reverse ? 'is-from-left' : 'is-from-right');
  void next.offsetWidth;
  current.classList.add(reverse ? 'is-leaving-right' : 'is-leaving-left');
  next.classList.add('is-active');
  next.classList.remove('is-preparing', 'is-from-left', 'is-from-right');
  heroTransitionTimer = setTimeout(() => {
    current.classList.remove('is-active', 'is-leaving-left', 'is-leaving-right');
    current.setAttribute('aria-hidden', 'true');
    current.setAttribute('inert', '');
    heroTransitionTimer = null;
  }, 460);
}

function openThreeCard() {
  stopGameSync();
  stopRoomSync();
  stopMahjongBotSequence();
  stopCasualTimers();
  state.casual = { kind: 'three', round: newThreeCardRound(), revealed: false, thinking: false };
  state.view = 'three';
}
function openMahjong() {
  stopGameSync();
  stopRoomSync();
  stopMahjongBotSequence();
  stopCasualTimers();
  const game = newMahjongGame();
  state.heroGame = 'mahjong';
  safeStorageSet(HERO_GAME_KEY, 'mahjong');
  state.casual = { kind: 'mahjong', game, selectedTileId: null, confirmAction: null };
  state.view = 'mahjong';
}
function preferredXiangqiFocus(game, preferred = 85) {
  if (Number.isInteger(preferred) && game?.board?.[preferred]?.side === 'red') return preferred;
  const redGeneral = game?.board?.findIndex((piece) => piece?.side === 'red' && piece.type === 'general');
  if (Number.isInteger(redGeneral) && redGeneral >= 0) return redGeneral;
  const redPiece = game?.board?.findIndex((piece) => piece?.side === 'red');
  return Number.isInteger(redPiece) && redPiece >= 0 ? redPiece : 85;
}
function startXiangqiSession(session, announcement = '你执红先行') {
  const game = session.game || session;
  const tutorialSeen = safeStorageGet(XIANGQI_TUTORIAL_KEY) === 'seen';
  state.casual = {
    kind: 'xiangqi',
    game,
    selectedCell: null,
    focusedCell: preferredXiangqiFocus(game, xiangqiMoveTo(game.lastMove)),
    announcement,
    aiThinking: false,
    confirmAction: null,
    pendingDifficulty: null,
    showRules: false,
    dialogReturnFocus: null,
    tutorialStep: tutorialSeen ? 0 : (Number(game.moveCount) > 0 ? 3 : 1),
    elapsedSeconds: safeLocalCounter(session.elapsedSeconds),
    undoCount: safeLocalCounter(session.undoCount),
    saveAvailable: true,
    xiangqiLastTick: Date.now(),
  };
  state.view = 'xiangqi';
  if (!saveXiangqiSession()) state.casual.announcement = '本浏览器无法保存进度 · 可继续本局';
}
function openXiangqi() {
  stopGameSync();
  stopRoomSync();
  stopMahjongBotSequence();
  stopCasualTimers();
  const saved = loadSavedXiangqiSession();
  const storedDifficulty = safeStorageGet(XIANGQI_DIFFICULTY_KEY);
  const difficulty = ['beginner','standard','challenge'].includes(storedDifficulty) ? storedDifficulty : 'beginner';
  const session = saved || { game: newXiangqiGame({ humanSide:'red', difficulty }), elapsedSeconds:0, undoCount:0 };
  const announcement = saved ? (session.game.status === 'playing' ? '已恢复本地进度' : '上局战果已保留') : '你执红先行';
  startXiangqiSession(session, announcement);
  rememberLastLocalGame('xiangqi');
}
function settleXiangqiClock(now = Date.now()) {
  const casual = state.casual;
  if (state.view !== 'xiangqi' || casual?.kind !== 'xiangqi' || casual.game?.status !== 'playing' || casual.confirmAction || casual.showRules) return 0;
  const lastTick = Number.isFinite(casual.xiangqiLastTick) ? casual.xiangqiLastTick : now;
  const elapsed = Math.floor(Math.max(0, now - lastTick) / 1000);
  if (elapsed <= 0) return 0;
  casual.elapsedSeconds = Math.min(Number.MAX_SAFE_INTEGER, safeLocalCounter(casual.elapsedSeconds) + elapsed);
  casual.xiangqiLastTick = lastTick + elapsed * 1000;
  const clock = document.querySelector('[data-xiangqi-time]');
  if (clock) clock.textContent = formatXiangqiTime(casual.elapsedSeconds);
  return elapsed;
}
function updateXiangqiClock() {
  const elapsed = settleXiangqiClock();
  if (elapsed && state.casual.elapsedSeconds % 5 < elapsed) saveXiangqiSession();
}
function focusXiangqiInteraction(index = state.casual?.focusedCell) {
  const result = document.querySelector('[data-xiangqi-result]');
  if (result) { result.focus({ preventScroll:true }); return; }
  document.querySelector(`[data-xiangqi-cell="${Number.isInteger(index) ? index : 85}"]`)?.focus({ preventScroll:true });
}
function focusXiangqiDialog() {
  const dialog = document.querySelector('[data-xiangqi-confirm-dialog], [data-xiangqi-rules-dialog]');
  const firstControl = dialog?.querySelector('button:not(:disabled), [href], [tabindex]:not([tabindex="-1"])');
  (firstControl || dialog)?.focus({ preventScroll:true });
}
function focusXiangqiReturnControl(reference) {
  let control = null;
  if (reference === 'rules') control = document.querySelector('[data-action="xiangqi-rules"]');
  if (reference === 'new') control = document.querySelector('[data-action="xiangqi-new"]');
  if (reference?.startsWith('difficulty:')) {
    const difficulty = reference.slice('difficulty:'.length);
    if (['beginner','standard','challenge'].includes(difficulty)) {
      control = document.querySelector(`[data-xiangqi-difficulty="${difficulty}"]`);
    }
  }
  if (control) control.focus({ preventScroll:true });
  else focusXiangqiInteraction();
}
function trapXiangqiDialogTab(event) {
  const dialog = document.querySelector('[data-xiangqi-confirm-dialog], [data-xiangqi-rules-dialog]');
  if (!dialog || event.key !== 'Tab') return false;
  const controls = [...dialog.querySelectorAll('button:not(:disabled), [href], [tabindex]:not([tabindex="-1"])')];
  if (!controls.length) { event.preventDefault(); dialog.focus({ preventScroll:true }); return true; }
  const first = controls[0];
  const last = controls.at(-1);
  if (!dialog.contains(document.activeElement)) {
    event.preventDefault();
    (event.shiftKey ? last : first).focus({ preventScroll:true });
  } else if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();last.focus({ preventScroll:true });
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();first.focus({ preventScroll:true });
  }
  return true;
}
function finishXiangqiTutorial() {
  if (!state.casual || state.view !== 'xiangqi') return;
  state.casual.tutorialStep = 0;
  safeStorageSet(XIANGQI_TUTORIAL_KEY, 'seen');
}
function queueXiangqiAiTurn() {
  if (xiangqiAiTimer) clearTimeout(xiangqiAiTimer);
  xiangqiAiTimer = null;
  const casual = state.casual;
  const game = casual?.game;
  if (state.view !== 'xiangqi' || casual?.kind !== 'xiangqi' || game?.status !== 'playing' || game.turn === 'red' || casual.confirmAction || casual.showRules) return;
  const playerFocus = preferredXiangqiFocus(game, casual.focusedCell);
  casual.focusedCell = playerFocus;
  casual.aiThinking = true;
  casual.announcement = safeXiangqiCheck(game, 'black') ? '你已将军 · KAI 正在应对…' : 'KAI 正在思考…';
  render();
  focusXiangqiInteraction(playerFocus);
  const delay = ({ beginner:320, standard:520, challenge:720 })[game.difficulty] || 520;
  xiangqiAiTimer = setTimeout(() => {
    xiangqiAiTimer = null;
    const live = state.casual;
    const current = live?.game;
    if (state.view !== 'xiangqi' || live !== casual || current?.status !== 'playing' || current.turn === 'red') return;
    try {
      const move = chooseXiangqiMove(current, current.difficulty);
      const from = xiangqiMoveFrom(move);
      const to = xiangqiMoveTo(move);
      if (!Number.isInteger(from) || !Number.isInteger(to)) throw new Error('KAI 暂时没有找到可行走法');
      settleXiangqiClock();
      const next = playXiangqiMove(current, from, to);
      live.game = next;
      live.focusedCell = preferredXiangqiFocus(next, playerFocus);
      live.selectedCell = null;
      live.aiThinking = false;
      live.announcement = next.status === 'playing'
        ? safeXiangqiCheck(next, 'red') ? '将军！请先解除威胁' : 'KAI 已落子 · 轮到你'
        : '本局已经结束';
      live.xiangqiLastTick = Date.now();
      saveXiangqiSession(live);
      render();
      focusXiangqiInteraction(live.focusedCell);
    } catch (error) {
      live.aiThinking = false;
      live.announcement = error?.message || 'KAI 思考失败，请悔棋或重新开局';
      render();
      focusXiangqiInteraction(live.focusedCell);
      toast(live.announcement);
    }
  }, delay);
}
function performXiangqiMove(from, to) {
  const casual = state.casual;
  const game = casual?.game;
  if (state.view !== 'xiangqi' || casual?.aiThinking || casual?.confirmAction || casual?.showRules || game?.status !== 'playing' || game.turn !== 'red') return;
  const movingPiece = game.board[from];
  const captured = game.board[to];
  try {
    settleXiangqiClock();
    const next = playXiangqiMove(game, from, to);
    casual.game = next;
    casual.selectedCell = null;
    casual.focusedCell = to;
    casual.announcement = next.status !== 'playing' ? '本局已经结束'
      : safeXiangqiCheck(next, 'black') ? '你已将军 · KAI 正在应对'
        : `${xiangqiPieceSpoken(movingPiece)}已落子${captured ? `并吃掉${xiangqiPieceSpoken(captured)}` : ''}`;
    if (casual.tutorialStep && casual.tutorialStep < 3) casual.tutorialStep = 3;
    casual.xiangqiLastTick = Date.now();
    saveXiangqiSession(casual);
    render();
    if (next.status === 'playing' && next.turn !== 'red') queueXiangqiAiTurn();
    else focusXiangqiInteraction(to);
  } catch (error) {
    casual.announcement = error?.message || '该位置不能落子';
    render();
    focusXiangqiInteraction(from);
  }
}
function selectXiangqiCell(index) {
  const casual = state.casual;
  const game = casual?.game;
  if (state.view !== 'xiangqi' || casual?.aiThinking || casual?.confirmAction || casual?.showRules || game?.status !== 'playing') return;
  casual.focusedCell = index;
  if (game.turn !== 'red') {
    casual.announcement = '请等待 KAI 落子';
    render();focusXiangqiInteraction(index);return;
  }
  const piece = game.board[index];
  const selected = casual.selectedCell;
  if (!Number.isInteger(selected)) {
    if (piece?.side !== 'red') {
      casual.announcement = piece ? '黑方棋子不可选择' : '请先选择一枚红方棋子';
    } else {
      casual.selectedCell = index;
      const moveCount = safeLegalXiangqiMoves(game, index).length;
      casual.announcement = `已选${xiangqiPieceSpoken(piece)} · 可走 ${moveCount} 处`;
      if (casual.tutorialStep === 1) casual.tutorialStep = 2;
    }
    render();focusXiangqiInteraction(index);return;
  }
  if (index === selected) {
    casual.selectedCell = null;
    casual.announcement = '已取消选择';
    render();focusXiangqiInteraction(index);return;
  }
  if (piece?.side === 'red') {
    casual.selectedCell = index;
    casual.announcement = `已改选${xiangqiPieceSpoken(piece)} · 可走 ${safeLegalXiangqiMoves(game, index).length} 处`;
    render();focusXiangqiInteraction(index);return;
  }
  const legal = safeLegalXiangqiMoves(game, selected).some((move) => xiangqiMoveTo(move) === index);
  if (!legal) {
    casual.announcement = safeXiangqiCheck(game, 'red') ? '将军！这一步不能解除威胁' : '该位置不能落子';
    render();focusXiangqiInteraction(selected);return;
  }
  performXiangqiMove(selected, index);
}
function newXiangqiSession(difficulty = state.casual?.game?.difficulty || 'beginner') {
  if (xiangqiAiTimer) clearTimeout(xiangqiAiTimer);
  xiangqiAiTimer = null;
  const game = newXiangqiGame({ humanSide:'red', difficulty });
  startXiangqiSession({ game, elapsedSeconds:0, undoCount:0 }, `已开始${XIANGQI_DIFFICULTIES[difficulty]?.label || '初学'}难度新局`);
}
function open1048() {
  stopGameSync();
  stopRoomSync();
  stopMahjongBotSequence();
  stopCasualTimers();
  const game = loadSaved1048Game() || new1048Game();
  state.casual = { kind: '1048', game };
  save1048Game(game);
  state.view = '1048';
  rememberLastLocalGame('1048');
}
function focus1048Interaction() {
  const target = document.querySelector('[data-1048-result]') || document.querySelector('[data-1048-board]');
  target?.focus({ preventScroll: true });
}
function perform1048Move(direction) {
  const game = state.casual?.game;
  if (state.view !== '1048' || !game || game.status !== 'playing') return;
  const next = move1048(game, direction);
  state.casual.game = next;
  save1048Game(next);
  render();
  focus1048Interaction();
}
function firstSudoku6Cell(game) {
  const unfinished = game.values.findIndex((value, index) => game.puzzle[index] === 0 && value !== game.solution[index]);
  if (unfinished >= 0) return unfinished;
  const editable = game.puzzle.findIndex((value) => value === 0);
  return editable >= 0 ? editable : 0;
}
function startSudoku6Session(game, announcement = '选择一个空格，填入 1 到 6') {
  state.casual = {
    kind: 'sudoku6',
    game,
    selectedCell: firstSudoku6Cell(game),
    noteMode: false,
    announcement,
    sudokuLastTick: Date.now(),
  };
  saveSudoku6Game(game);
  state.view = 'sudoku6';
}
function openSudoku6() {
  stopGameSync();
  stopRoomSync();
  stopMahjongBotSequence();
  stopCasualTimers();
  const game = loadSavedSudoku6Game() || newSudoku6Game({ difficulty: 'medium' });
  startSudoku6Session(game, game.status === 'completed' ? '上次数独已完成' : '已恢复本地进度');
  rememberLastLocalGame('sudoku6');
}
function focusSudoku6Interaction() {
  const result = document.querySelector('[data-sudoku6-result]');
  if (result) { result.focus({ preventScroll: true }); return; }
  const target = document.querySelector(`[data-sudoku6-cell="${state.casual?.selectedCell}"]`);
  target?.focus({ preventScroll: true });
}
function settleSudoku6Clock(now = Date.now()) {
  const casual = state.casual;
  const game = casual?.game;
  if (state.view !== 'sudoku6' || !game || game.status !== 'playing') return 0;
  const lastTick = Number.isFinite(casual.sudokuLastTick) ? casual.sudokuLastTick : now;
  const elapsed = Math.floor(Math.max(0, now - lastTick) / 1000);
  if (elapsed <= 0) { casual.sudokuLastTick = lastTick; return 0; }
  game.elapsedSeconds += elapsed;
  casual.sudokuLastTick = lastTick + elapsed * 1000;
  const clock = document.querySelector('[data-sudoku6-time]');
  if (clock) clock.textContent = formatSudoku6Time(game.elapsedSeconds);
  return elapsed;
}
function settleAndSaveSudoku6() {
  settleSudoku6Clock();
  const game = state.casual?.game;
  if (state.view === 'sudoku6' && game) saveSudoku6Game(game);
}
function sudoku6HasProgress(game) {
  return game?.status === 'playing' && (game.elapsedSeconds > 0 || game.undoStack.length > 0);
}
function confirmSudoku6Replacement(game, message) {
  if (!sudoku6HasProgress(game)) return true;
  return typeof globalThis.confirm === 'function' ? globalThis.confirm(message) : false;
}
function commitSudoku6Game(next, announcement) {
  const previous = state.casual?.game;
  if (!previous || state.view !== 'sudoku6') return;
  state.casual.game = next;
  state.casual.announcement = announcement;
  saveSudoku6Game(next);
  if (previous.status !== 'completed' && next.status === 'completed') recordSudoku6Best(next);
  render();
  focusSudoku6Interaction();
}
function performSudoku6Value(value) {
  const game = state.casual?.game;
  const index = state.casual?.selectedCell;
  if (state.view !== 'sudoku6' || !game || game.status !== 'playing' || !Number.isInteger(index)) return;
  settleSudoku6Clock();
  const next = enterSudoku6Value(game, index, value, { noteMode: value > 0 && state.casual.noteMode });
  if (next.undoStack.length === game.undoStack.length) {
    state.casual.announcement = game.puzzle[index] ? '题目给定数字不可修改' : '当前操作没有改变棋盘';
    render();
    focusSudoku6Interaction();
    return;
  }
  const announcement = next.status === 'completed' ? '数独完成，所有数字都已归位'
    : next.lastAction === 'mistake' ? '这个数字不符合本格答案，可以擦除或撤销'
      : next.lastAction === 'note' ? '候选笔记已更新'
        : next.lastAction === 'clear' ? '已擦除当前格' : '数字正确';
  commitSudoku6Game(next, announcement);
}
function updateSudoku6Clock() {
  const casual = state.casual;
  const game = casual?.game;
  if (state.view !== 'sudoku6' || !game || game.status !== 'playing') return;
  const now = Date.now();
  if (document.visibilityState === 'hidden') { casual.sudokuLastTick = now; return; }
  const elapsed = settleSudoku6Clock(now);
  if (elapsed <= 0) return;
  if (game.elapsedSeconds % 5 < elapsed) saveSudoku6Game(game);
}

function firstMinesweeperCell(game) {
  const covered = game.revealed?.findIndex((revealed, index) => !revealed && !game.flagged?.[index]);
  return Number.isInteger(covered) && covered >= 0 ? covered : 0;
}

function startMinesweeperSession(game, announcement = '第一步安全，选择一格开始排雷') {
  state.casual = {
    kind: 'minesweeper',
    game,
    focusedCell: firstMinesweeperCell(game),
    inputMode: 'reveal',
    announcement,
    confirmAction: null,
    pendingDifficulty: null,
    dialogReturnFocus: null,
    saveAvailable: true,
    saveConflict: false,
    minesweeperPersistedSnapshot: null,
    minesweeperLastTick: Date.now(),
    minesweeperPausedAt: null,
  };
  state.view = 'minesweeper';
  if (!saveMinesweeperGame(game, state.casual, { force:true })) state.casual.announcement = '本浏览器无法保存进度 · 可继续排雷';
}

function openMinesweeper() {
  stopGameSync();
  stopRoomSync();
  stopMahjongBotSequence();
  stopCasualTimers();
  const saved = loadSavedMinesweeperGame();
  const storedDifficulty = safeStorageGet(MINESWEEPER_DIFFICULTY_KEY);
  const difficulty = Object.hasOwn(MINESWEEPER_DIFFICULTIES, storedDifficulty) ? storedDifficulty : 'beginner';
  const game = saved || newMinesweeperGame({ difficulty });
  const announcement = !saved ? '第一步安全，选择一格开始排雷'
    : game.status === 'ready' ? '已恢复未开始的本地棋盘 · 首击安全'
      : game.status === 'playing' ? '已恢复本地排雷进度' : '上局结果已保留';
  startMinesweeperSession(game, announcement);
  rememberLastLocalGame('minesweeper');
}

function newMinesweeperSession(difficulty = state.casual?.game?.difficulty || 'beginner') {
  cancelMinesweeperLongPress();
  const normalized = Object.hasOwn(MINESWEEPER_DIFFICULTIES, difficulty) ? difficulty : 'beginner';
  startMinesweeperSession(newMinesweeperGame({ difficulty: normalized }), `已生成${MINESWEEPER_DIFFICULTIES[normalized].label}雷区 · 首击安全`);
}

function settleMinesweeperClock(now = Date.now()) {
  const casual = state.casual;
  const game = casual?.game;
  if (state.view !== 'minesweeper' || casual?.kind !== 'minesweeper' || game?.status !== 'playing' || casual.confirmAction || Number.isFinite(casual.minesweeperPausedAt)) return 0;
  const lastTick = Number.isFinite(casual.minesweeperLastTick) ? casual.minesweeperLastTick : now;
  const elapsed = Math.floor(Math.max(0, now - lastTick) / 1000);
  if (elapsed <= 0) return 0;
  const elapsedSeconds = Math.min(Number.MAX_SAFE_INTEGER, safeLocalCounter(game.elapsedSeconds) + elapsed);
  casual.game = { ...game, elapsedSeconds };
  casual.minesweeperLastTick = lastTick + elapsed * 1000;
  const clock = document.querySelector('[data-minesweeper-time]');
  if (clock) clock.textContent = formatMinesweeperTime(elapsedSeconds);
  return elapsed;
}

function pauseMinesweeperClock(now = Date.now()) {
  const casual = state.casual;
  if (state.view !== 'minesweeper' || casual?.kind !== 'minesweeper' || Number.isFinite(casual.minesweeperPausedAt)) return;
  settleMinesweeperClock(now);
  casual.minesweeperPausedAt = now;
}

function resumeMinesweeperClock(now = Date.now()) {
  const casual = state.casual;
  if (state.view !== 'minesweeper' || casual?.kind !== 'minesweeper') return;
  const pausedAt = casual.minesweeperPausedAt;
  if (!Number.isFinite(pausedAt)) { casual.minesweeperLastTick = now; return; }
  const lastTick = Number.isFinite(casual.minesweeperLastTick) ? casual.minesweeperLastTick : pausedAt;
  casual.minesweeperLastTick = lastTick + Math.max(0, now - pausedAt);
  casual.minesweeperPausedAt = null;
}

function updateMinesweeperClock() {
  const elapsed = settleMinesweeperClock();
  if (elapsed && state.casual.game.elapsedSeconds % 5 < elapsed) saveMinesweeperGame(state.casual.game);
}

function settleAndSaveMinesweeper() {
  settleMinesweeperClock();
  if (state.view === 'minesweeper' && state.casual?.game) saveMinesweeperGame(state.casual.game);
}

function focusMinesweeperInteraction(index = state.casual?.focusedCell) {
  const result = document.querySelector('[data-minesweeper-result]');
  if (result) { result.focus({ preventScroll:true }); return; }
  const target = document.querySelector(`[data-minesweeper-cell="${Number.isInteger(index) ? index : 0}"]`);
  target?.focus({ preventScroll:true });
  target?.scrollIntoView?.({ block:'nearest', inline:'nearest' });
}

function focusMinesweeperDialog() {
  const dialog = document.querySelector('[data-minesweeper-confirm-dialog]');
  const firstControl = dialog?.querySelector('button:not(:disabled), [href], [tabindex]:not([tabindex="-1"])');
  (firstControl || dialog)?.focus({ preventScroll:true });
}

function focusMinesweeperReturnControl(reference) {
  let control = null;
  if (reference === 'new') control = document.querySelector('[data-action="minesweeper-new"]');
  if (reference?.startsWith('difficulty:')) {
    const difficulty = reference.slice('difficulty:'.length);
    control = document.querySelector(`[data-minesweeper-difficulty="${difficulty}"]`);
  }
  if (control) control.focus({ preventScroll:true });
  else focusMinesweeperInteraction();
}

function trapMinesweeperDialogTab(event) {
  const dialog = document.querySelector('[data-minesweeper-confirm-dialog]');
  if (!dialog || event.key !== 'Tab') return false;
  const controls = [...dialog.querySelectorAll('button:not(:disabled), [href], [tabindex]:not([tabindex="-1"])')];
  if (!controls.length) { event.preventDefault();dialog.focus({ preventScroll:true });return true; }
  const first = controls[0];
  const last = controls.at(-1);
  if (!dialog.contains(document.activeElement)) {
    event.preventDefault();(event.shiftKey ? last : first).focus({ preventScroll:true });
  } else if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();last.focus({ preventScroll:true });
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();first.focus({ preventScroll:true });
  }
  return true;
}

function commitMinesweeperGame(next, announcement, focusIndex = state.casual?.focusedCell) {
  if (state.view !== 'minesweeper' || state.casual?.kind !== 'minesweeper' || !next) return;
  state.casual.game = next;
  state.casual.focusedCell = Number.isInteger(focusIndex) ? focusIndex : firstMinesweeperCell(next);
  state.casual.announcement = announcement;
  saveMinesweeperGame(next);
  render();
  focusMinesweeperInteraction(state.casual.focusedCell);
}

function performMinesweeperReveal(index) {
  if (state.view !== 'minesweeper' || state.casual?.confirmAction) return;
  settleMinesweeperClock();
  const game = state.casual?.game;
  if (!game || !['ready','playing'].includes(game.status) || !Number.isInteger(index)) return;
  state.casual.focusedCell = index;
  try {
    const cell = getMinesweeperCell(game, index);
    const wasReady = game.status === 'ready';
    const chord = cell.revealed && cell.adjacentMines > 0;
    const next = chord ? chordMinesweeperCell(game, index) : revealMinesweeperCell(game, index);
    if (wasReady && next !== game && next.status === 'playing') state.casual.minesweeperLastTick = Date.now();
    let announcement = '';
    if (next === game) {
      announcement = cell.flagged ? '已插旗的格子不能揭开，请先取消旗帜'
        : cell.revealed ? (cell.adjacentMines ? '周围旗帜数量还未与数字吻合' : '这片空白区域已经展开') : '当前操作没有改变棋盘';
    } else if (next.status === 'won') announcement = '排雷成功，全部安全格已经揭开';
    else if (next.status === 'lost') announcement = '踩到地雷，本局结束';
    else if (wasReady) announcement = '首击安全，已展开起始区域';
    else if (chord) announcement = `和弦展开了 ${Math.max(0, next.revealedCount - game.revealedCount)} 个安全格`;
    else announcement = next.revealedCount - game.revealedCount > 1 ? '空白区域已连续展开' : '已揭开这个格子';
    commitMinesweeperGame(next, announcement, index);
  } catch (error) {
    state.casual.announcement = error?.message || '这个格子暂时无法揭开';
    render();focusMinesweeperInteraction(index);
  }
}

function performMinesweeperFlag(index) {
  if (state.view !== 'minesweeper' || state.casual?.confirmAction) return;
  settleMinesweeperClock();
  const game = state.casual?.game;
  if (!game || !['ready','playing'].includes(game.status) || !Number.isInteger(index)) return;
  state.casual.focusedCell = index;
  try {
    const cell = getMinesweeperCell(game, index);
    const next = toggleMinesweeperFlag(game, index);
    const announcement = next === game ? (cell.revealed ? '已经揭开的格子不能插旗' : '当前操作没有改变旗帜')
      : next.flagCount > game.flagCount ? `已插旗 · 还可标记 ${getMinesweeperRemainingMines(next)} 处` : '已取消旗帜';
    commitMinesweeperGame(next, announcement, index);
  } catch (error) {
    state.casual.announcement = error?.message || '这个格子暂时无法标记';
    render();focusMinesweeperInteraction(index);
  }
}

function minesweeperHasProgress(game) {
  return ['ready','playing'].includes(game?.status) && (safeLocalCounter(game.moveCount) > 0 || safeLocalCounter(game.flagCount) > 0 || safeLocalCounter(game.elapsedSeconds) > 0);
}

function cancelMinesweeperLongPress() {
  if (minesweeperLongPress?.timer) clearTimeout(minesweeperLongPress.timer);
  minesweeperLongPress = null;
}

function firstOpenGomokuCell(game) {
  const center = Math.floor(GOMOKU_CELL_COUNT / 2);
  if (!game.board[center]) return center;
  const first = game.board.findIndex((cell) => cell === null);
  return first >= 0 ? first : center;
}

function focusGomokuInteraction(index = state.casual?.focusedCell) {
  const result = document.querySelector('[data-gomoku-result]');
  if (result) { result.focus({ preventScroll:true }); result.scrollIntoView?.({ block:'nearest' }); return; }
  const target = document.querySelector(`[data-gomoku-cell="${Number.isInteger(index) ? index : Math.floor(GOMOKU_CELL_COUNT / 2)}"]`);
  target?.focus({ preventScroll:true });
  target?.scrollIntoView?.({ block:'nearest', inline:'nearest' });
}

function startGomokuSession(game, announcement = '你执黑先行') {
  stopCasualTimers();
  state.casual = { kind:'gomoku', game, focusedCell:firstOpenGomokuCell(game), announcement, saveAvailable:true };
  state.view = 'gomoku';
  state.casual.saveAvailable = saveGomokuGame(game);
  if (!state.casual.saveAvailable) state.casual.announcement = '本浏览器无法保存进度 · 仍可继续对弈';
}

function openGomoku() {
  stopGameSync();stopRoomSync();stopMahjongBotSequence();stopCasualTimers();
  const saved = loadGomokuGame();
  const announcement = !saved ? '你执黑先行' : saved.status === 'finished' ? '上局战果已保留' : Number(saved.moveCount) > 0 ? '已恢复本地棋局' : '你执黑先行';
  startGomokuSession(saved || newGomokuGame(), announcement);
  rememberLastLocalGame('gomoku');
}

function newGomokuSession() {
  startGomokuSession(newGomokuGame(), '新棋局已开始 · 你执黑先行');
}

function confirmLocalGameReplacement(hasProgress, message) {
  if (!hasProgress) return true;
  return typeof globalThis.confirm === 'function' ? globalThis.confirm(message) : false;
}

function performGomokuMove(index) {
  const casual = state.casual;
  const game = casual?.game;
  if (state.view !== 'gomoku' || casual?.kind !== 'gomoku' || game?.status !== 'playing' || !Number.isInteger(index)) return;
  casual.focusedCell = index;
  try {
    const next = playGomokuHumanMove(game, index);
    casual.game = next;
    const aiMove = next.lastMove?.side === 'white' ? next.lastMove : null;
    casual.announcement = next.status === 'finished' ? (next.winner === 'black' ? '你连成了五子' : next.winner === 'white' ? 'KAI 连成了五子' : '棋盘已满，本局和棋')
      : aiMove ? `KAI 落在第 ${aiMove.row + 1} 行第 ${aiMove.column + 1} 列 · 轮到你` : '轮到你继续落黑棋';
    casual.saveAvailable = saveGomokuGame(next);
    if (!casual.saveAvailable) casual.announcement += ' · 当前进度无法保存';
    render();focusGomokuInteraction(index);
  } catch (error) {
    casual.announcement = error?.message === 'GOMOKU_CELL_OCCUPIED' ? '这里已经有棋子' : '这一步暂时不能落子';
    render();focusGomokuInteraction(index);
  }
}

function focusMemoryInteraction(index = state.casual?.focusedCard) {
  const result = document.querySelector('[data-memory-result]');
  if (result) { result.focus({ preventScroll:true }); result.scrollIntoView?.({ block:'nearest' }); return; }
  const target = document.querySelector(`[data-memory-card="${Number.isInteger(index) ? index : 0}"]`);
  target?.focus({ preventScroll:true });
  target?.scrollIntoView?.({ block:'nearest', inline:'nearest' });
}

function saveCurrentMemorySession(casual = state.casual) {
  if (casual?.kind !== 'memory' || !casual.game) return false;
  const result = saveMemoryMatchSession(undefined, casual.game, casual.bestScores);
  casual.bestScores = result.bestScores;
  casual.saveAvailable = result.saved;
  return result.saved;
}

function queueMemoryMismatchResolution() {
  if (memoryMismatchTimer) clearTimeout(memoryMismatchTimer);
  memoryMismatchTimer = null;
  const casual = state.casual;
  if (state.view !== 'memory' || casual?.kind !== 'memory' || !casual.game?.pendingMismatch) return;
  memoryMismatchTimer = setTimeout(() => {
    memoryMismatchTimer = null;
    if (state.view !== 'memory' || state.casual !== casual || !casual.game?.pendingMismatch) return;
    casual.game = resolveMemoryMatchMismatch(casual.game);
    casual.announcement = '卡片已盖回 · 继续寻找相同图案';
    if (!saveCurrentMemorySession(casual)) casual.announcement += ' · 当前进度无法保存';
    render();focusMemoryInteraction();
  }, 780);
}

function startMemorySession(session, announcement = '翻开两张牌，寻找相同图案') {
  stopCasualTimers();
  const firstAvailable = session.game.matched.findIndex((matched) => !matched);
  state.casual = {
    kind:'memory', game:session.game, bestScores:session.bestScores,
    focusedCard:firstAvailable >= 0 ? firstAvailable : 0,
    announcement, saveAvailable:session.saveAvailable,
  };
  state.view = 'memory';
  if (!saveCurrentMemorySession()) state.casual.announcement = `${announcement} · 当前进度无法保存`;
  queueMemoryMismatchResolution();
}

function openMemoryMatch() {
  stopGameSync();stopRoomSync();stopMahjongBotSequence();stopCasualTimers();
  const session = loadMemoryMatchSession();
  const announcement = !session.restored || session.game.status === 'ready' ? '翻开两张牌，寻找相同图案'
    : session.game.status === 'won' ? '上局成绩已保留' : '已恢复本地翻牌进度';
  startMemorySession(session, announcement);
  rememberLastLocalGame('memory');
}

function newMemorySession(difficulty = state.casual?.game?.difficulty || 'easy') {
  const normalized = Object.hasOwn(MEMORY_MATCH_DIFFICULTIES, difficulty) ? difficulty : 'easy';
  const game = newMemoryMatchGame({ difficulty:normalized });
  const bestScores = state.casual?.kind === 'memory' ? state.casual.bestScores : loadMemoryMatchSession().bestScores;
  startMemorySession({ game, bestScores, restored:false, saveAvailable:true }, `已生成${MEMORY_MATCH_DIFFICULTIES[normalized].label}牌阵`);
}

function performMemoryFlip(index) {
  const casual = state.casual;
  const game = casual?.game;
  if (state.view !== 'memory' || casual?.kind !== 'memory' || !game || !Number.isInteger(index)) return;
  casual.focusedCard = index;
  try {
    const next = flipMemoryMatchCard(game, index);
    if (next === game) return;
    casual.game = next;
    casual.announcement = next.status === 'won' ? '全部配对完成'
      : next.pendingMismatch ? '图案不同，稍后自动翻回'
        : next.matchedPairs > game.matchedPairs ? '配对成功' : '再翻一张寻找配对';
    if (!saveCurrentMemorySession(casual)) casual.announcement += ' · 当前进度无法保存';
    render();focusMemoryInteraction(index);queueMemoryMismatchResolution();
  } catch (error) {
    casual.announcement = error?.message || '这张牌暂时不能翻开';
    render();focusMemoryInteraction(index);
  }
}

function updateMemoryMatchClock() {
  const casual = state.casual;
  if (document.visibilityState === 'hidden' || state.view !== 'memory' || casual?.kind !== 'memory' || casual.game?.status !== 'playing') return;
  casual.game = advanceMemoryMatchTime(casual.game, 1);
  const clock = document.querySelector('[data-memory-time]');
  if (clock) clock.textContent = formatMemoryTime(casual.game.elapsedSeconds);
  if (casual.game.elapsedSeconds % 5 === 0) saveCurrentMemorySession(casual);
}

function focusSnakeInteraction() {
  const result = document.querySelector('[data-snake-result]');
  if (result) { result.focus({ preventScroll:true }); result.scrollIntoView?.({ block:'nearest' }); return; }
  const board = document.querySelector('[data-snake-board]');
  board?.focus({ preventScroll:true });
  board?.scrollIntoView?.({ block:'nearest', inline:'nearest' });
}

function startSnakeSession(game, announcement = '选择方向开始') {
  stopCasualTimers();
  state.casual = { kind:'snake', game, announcement, saveAvailable:true };
  state.view = 'snake';
  if (!saveSnakeGame(game)) state.casual.announcement = '本浏览器无法保存进度 · 仍可继续游玩';
  queueSnakeTick();
}

function openSnake() {
  stopGameSync();
  stopRoomSync();
  stopMahjongBotSequence();
  stopCasualTimers();
  const saved = loadSavedSnakeGame();
  const storedDifficulty = safeStorageGet(SNAKE_DIFFICULTY_KEY);
  const difficulty = Object.hasOwn(SNAKE_DIFFICULTIES, storedDifficulty) ? storedDifficulty : 'normal';
  const game = saved ? { ...saved, status:saved.status === 'playing' ? 'paused' : saved.status } : newSnakeGame({ difficulty });
  const announcement = !saved || Number(game.ticks) === 0 ? '选择方向开始' : ['over','won'].includes(game.status) ? '上轮结果已保留' : '已恢复本地进度';
  startSnakeSession(game, announcement);
  rememberLastLocalGame('snake');
}

function newSnakeSession(difficulty = state.casual?.game?.difficulty || 'normal') {
  const normalized = Object.hasOwn(SNAKE_DIFFICULTIES, difficulty) ? difficulty : 'normal';
  startSnakeSession(newSnakeGame({ difficulty:normalized }), `已切换到${SNAKE_DIFFICULTIES[normalized].label}速度 · 选择方向开始`);
}

function updateSnakeFrame(game, announcement, previous) {
  const board = document.querySelector('[data-snake-board]');
  if (!board) return false;
  const changedCells = new Set([...(previous?.snake || []), previous?.food, ...game.snake, game.food]);
  for (const index of changedCells) {
    if (!Number.isInteger(index)) continue;
    const cell = board.children.item(index);
    if (!cell) return false;
    const visual = snakeCellVisual(game, index);
    cell.className = visual.className;
    cell.innerHTML = visual.content;
  }
  const score = document.querySelector('[data-snake-score]');
  const best = document.querySelector('[data-snake-best]');
  const length = document.querySelector('[data-snake-length]');
  if (score) score.textContent = String(game.score);
  if (best) best.textContent = String(Math.max(loadSnakeBest(), safeLocalCounter(game.score)));
  if (length) length.textContent = String(game.snake.length);
  const status = document.querySelector('[data-snake-status]');
  const statusText = document.querySelector('[data-snake-status-text]');
  const quietTick = announcement === '保持节奏';
  if (status) status.setAttribute('aria-live', quietTick ? 'off' : 'polite');
  if (statusText) statusText.textContent = quietTick ? '保持节奏，继续收集能量' : announcement;
  return true;
}

function queueSnakeTick() {
  if (snakeTimer) clearTimeout(snakeTimer);
  snakeTimer = null;
  const casual = state.casual;
  const game = casual?.game;
  if (state.view !== 'snake' || casual?.kind !== 'snake' || game?.status !== 'playing') return;
  const delay = SNAKE_DIFFICULTIES[game.difficulty]?.tickMs || SNAKE_DIFFICULTIES.normal.tickMs;
  snakeTimer = setTimeout(() => {
    snakeTimer = null;
    if (state.view !== 'snake' || state.casual !== casual || casual.game?.status !== 'playing') return;
    const previous = casual.game;
    const next = advanceSnake(previous);
    casual.game = next;
    casual.announcement = next.status === 'won' ? '全部能量已经收集'
      : next.status === 'over' ? '发生碰撞，本轮结束'
        : next.foodsEaten > previous.foodsEaten ? `收集成功 · 得分 ${next.score}` : '保持节奏';
    const saveWasAvailable = casual.saveAvailable !== false;
    const shouldSave = next.status !== 'playing' || next.foodsEaten > previous.foodsEaten || next.ticks % 5 === 0;
    const persistenceFailed = shouldSave && !saveSnakeGame(next) && saveWasAvailable;
    if (persistenceFailed) casual.announcement = '当前进度无法保存 · 游戏仍可继续';
    if (['over','won'].includes(next.status) || persistenceFailed || !updateSnakeFrame(next, casual.announcement, previous)) {
      render();
      focusSnakeInteraction();
    }
    queueSnakeTick();
  }, delay);
}

function performSnakeDirection(direction) {
  if (state.view !== 'snake' || state.casual?.kind !== 'snake') return;
  try {
    const previous = state.casual.game;
    const next = setSnakeDirection(previous, direction);
    state.casual.game = next;
    if (next !== previous) state.casual.announcement = '方向已切换';
    if (!saveSnakeGame(next)) state.casual.announcement = '方向已切换 · 当前进度无法保存';
    render();focusSnakeInteraction();queueSnakeTick();
  } catch (error) {
    state.casual.announcement = error?.message || '暂时无法切换方向';
    render();focusSnakeInteraction();
  }
}

function toggleSnakeSession() {
  if (state.view !== 'snake' || state.casual?.kind !== 'snake') return;
  const game = state.casual.game;
  if (['over','won'].includes(game.status)) { newSnakeSession(game.difficulty); return; }
  const next = game.status === 'ready' ? setSnakeDirection(game, game.direction) : toggleSnakePause(game);
  state.casual.game = next;
  state.casual.announcement = next.status === 'paused' ? '已暂停' : '继续前进';
  saveSnakeGame(next);
  render();focusSnakeInteraction();queueSnakeTick();
}

function openSlots() {
  stopGameSync();
  stopRoomSync();
  stopMahjongBotSequence();
  stopCasualTimers();
  state.casual = { kind: 'slots', reels: ['7', 'KAI', '⚡'], last: null, spins: 0, spinning: false };
  state.view = 'slots';
}

async function refreshProfile(){ state.profile=(await api('/v1/me')).profile; }
async function loadHistoryData(){
  state.historyStatus='loading';
  state.historyError='';
  render();
  try {
    state.history=await api('/v1/history');
    state.historyStatus='ready';
  } catch (error) {
    state.historyStatus='error';
    state.historyError=error.message || '网络连接暂时不可用，请稍后重试。';
    throw error;
  }
}
function stopGameSync() {
  state.waitController?.abort();
  state.waitController=null;
}
function stopRoomSync() {
  state.roomWaitController?.abort();
  state.roomWaitController=null;
}
function startRoomSync() {
  stopRoomSync();
  if (state.view!=='room'||!state.room) return;
  const roomId=state.room.id;
  const controller=new AbortController();
  state.roomWaitController=controller;
  void (async()=>{
    let failureCount=0;
    while (!controller.signal.aborted&&state.view==='room'&&state.room?.id===roomId) {
      const version=Number(state.room.version)||0;
      try {
        const result=await api(`/v1/rooms/${roomId}/wait?version=${version}&timeoutMs=20000`,{signal:controller.signal});
        if (controller.signal.aborted||state.view!=='room'||state.room?.id!==roomId) return;
        state.room=result.room;
        if (result.room.gameId) {
          stopRoomSync();
          await loadGame(result.room.gameId,{animateDeal:true});
          return;
        }
        failureCount=0;
        if (result.changed) render();
      } catch (error) {
        if (controller.signal.aborted||error.name==='AbortError') return;
        if (isTerminalSyncError(error)) {
          state.error=`房间同步已停止：${error.message}`;
          toast(state.error);
          render();
          return;
        }
        failureCount+=1;
        await syncRetryDelay(controller.signal,failureCount);
      }
    }
  })();
}
function finishDeal(gameId) {
  if (state.dealingGameId!==gameId) return;
  state.dealingGameId=null;
  state.dealTimer=null;
  render();
}
function enterGame(nextGame, {animateDeal=false}={}) {
  stopMahjongBotSequence();
  stopRoomSync();
  if (state.dealTimer) clearTimeout(state.dealTimer);
  state.game=nextGame;
  state.view='game';
  state.selected.clear();
  state.exitConfirm=false;
  const reducedMotion=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  state.dealingGameId=animateDeal&&nextGame.phase==='bidding'&&!reducedMotion ? nextGame.id : null;
  state.dealTimer=state.dealingGameId ? setTimeout(()=>finishDeal(nextGame.id),DEAL_ANIMATION_MS) : null;
  startGameSync();
}
function startGameSync() {
  stopGameSync();
  if (state.view!=='game'||!state.game||state.game.phase==='finished') return;
  const gameId=state.game.id;
  const controller=new AbortController();
  state.waitController=controller;
  void (async()=>{
    let failureCount=0;
    while (!controller.signal.aborted&&state.view==='game'&&state.game?.id===gameId&&state.game.phase!=='finished') {
      const version=state.game.sequence;
      const timeoutMs=Math.max(1_000,Math.min(20_000,turnRemaining(state.game)*1_000+250));
      try {
        const result=await api(`/v1/games/${gameId}/wait?version=${version}&timeoutMs=${timeoutMs}`,{signal:controller.signal});
        if (controller.signal.aborted||state.game?.id!==gameId) return;
        if (result.game.sequence>=state.game.sequence) {
          if (result.game.sequence!==state.game.sequence) state.selected.clear();
          if (!acceptGame(result.game)) continue;
          if (result.game.phase==='finished') {
            try { await refreshProfile(); } catch { /* The verified settlement remains visible if profile refresh is temporarily unavailable. */ }
          }
          render();
        }
        failureCount=0;
      } catch (error) {
        if (controller.signal.aborted||error.name==='AbortError') return;
        if (isTerminalSyncError(error)) {
          state.error=`牌局同步已停止：${error.message}`;
          toast(state.error);
          render();
          return;
        }
        failureCount+=1;
        await syncRetryDelay(controller.signal,failureCount);
      }
    }
  })();
}
async function loadGame(id,{animateDeal=false}={}){ enterGame((await api(`/v1/games/${id}`)).game,{animateDeal}); render(); }
async function startQuickGame(){
  const activeGameId=state.game?.phase!=='finished' ? state.game?.id : null;
  let nextGame;
  try {
    nextGame=(await api('/v1/games/quick',{method:'POST',body:'{}'})).game;
  } catch (error) {
    if (error.code !== 'RELIEF_REQUIRED') throw error;
    const relief=await api('/v1/relief',{method:'POST',body:'{}'});
    state.profile=relief.profile;
    nextGame=(await api('/v1/games/quick',{method:'POST',body:'{}'})).game;
    toast('已领取免费竞技分补给');
  }
  enterGame(nextGame,{animateDeal:nextGame.id!==activeGameId});
}
async function act(fn){ if(state.busy)return; state.busy=true;render();try{await fn(); state.error='';}catch(e){toast(e.message);}finally{state.busy=false;render();} }

function normalizeCatalogText(value) {
  return String(value ?? '').normalize('NFKC').trim().toLocaleLowerCase('zh-CN');
}

function activeCatalogFilter() {
  return document.querySelector('[data-catalog-filter][aria-pressed="true"]')?.dataset.catalogFilter || 'all';
}

function applyCatalogDiscovery() {
  const strip=document.querySelector('[data-world-strip]');
  if(!strip)return;
  const query=normalizeCatalogText(document.querySelector('[data-catalog-search]')?.value);
  const terms=query.split(/\s+/).filter(Boolean);
  const filter=activeCatalogFilter();
  const cards=[...strip.querySelectorAll('[data-world-card]')];
  let visibleCount=0;
  for(const card of cards){
    const metadata=CATALOG_DISCOVERY[card.dataset.worldId] || {categories:[],search:''};
    const searchable=normalizeCatalogText(`${card.dataset.worldId} ${metadata.search} ${card.textContent}`);
    const matchesQuery=terms.every((term)=>searchable.includes(term));
    const matchesFilter=filter==='all'
      || filter==='continue' && card.dataset.worldResumable==='true'
      || metadata.categories.includes(filter);
    card.hidden=!(matchesQuery&&matchesFilter);
    if(!card.hidden)visibleCount+=1;
  }
  const result=document.querySelector('[data-catalog-result]');
  if(result)result.textContent=query||filter!=='all'?`找到 ${visibleCount} 款`:`显示全部 ${visibleCount} 款`;
  const searchJump=document.querySelector('[data-action="catalog-show-results"]');
  const searchFeedback=document.querySelector('[data-catalog-search-feedback]');
  if(searchJump)searchJump.hidden=!query;
  if(searchFeedback)searchFeedback.textContent=visibleCount?`查看 ${visibleCount} 款结果`:'查看无匹配结果';
  const empty=document.querySelector('[data-catalog-empty]');
  if(empty)empty.hidden=visibleCount!==0;
  const cannotPage=visibleCount<=1;
  const hint=document.getElementById('world-carousel-hint');
  if(hint)hint.hidden=cannotPage;
  for(const control of document.querySelectorAll('[data-action="world-prev"],[data-action="world-next"]'))control.disabled=cannotPage;
  strip.classList.toggle('is-filtered',Boolean(query)||filter!=='all');
  strip.scrollLeft=0;
  updateWorldCarouselStatus(strip);
}

function resetCatalogDiscovery({focusSearch=false}={}) {
  const input=document.querySelector('[data-catalog-search]');
  if(input)input.value='';
  for(const control of document.querySelectorAll('[data-catalog-filter]')){
    const selected=control.dataset.catalogFilter==='all';
    control.classList.toggle('is-active',selected);
    control.setAttribute('aria-pressed',String(selected));
  }
  applyCatalogDiscovery();
  if(focusSearch)input?.focus({preventScroll:true});
}

function clearCatalogSearch({focusSearch=false}={}) {
  const input=document.querySelector('[data-catalog-search]');
  if(input)input.value='';
  applyCatalogDiscovery();
  if(focusSearch)input?.focus({preventScroll:true});
}

function showCatalogResults() {
  document.getElementById('game-selection')?.scrollIntoView({
    block:'start',
    behavior:globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',
  });
}

function scrollWorldCarousel(direction) {
  const strip=document.querySelector('[data-world-strip]');
  const card=strip?.querySelector('.game-world:not([hidden])');
  if(!strip||!card)return;
  const gap=Number.parseFloat(globalThis.getComputedStyle?.(strip).columnGap||'0')||16;
  const step=card.getBoundingClientRect().width+gap;
  const reduceMotion=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  strip.scrollBy({left:direction*step,behavior:reduceMotion?'auto':'smooth'});
}

function updateWorldCarouselStatus(strip = document.querySelector('[data-world-strip]')) {
  if (!strip) return;
  const cards=[...strip.querySelectorAll('.game-world:not([hidden])')];
  const status=document.querySelector('[data-world-status]');
  if (!cards.length) {
    if(status)status.textContent='0 / 0';
    return;
  }
  const stripLeft=strip.getBoundingClientRect().left;
  const current=cards.reduce((closest,card,index)=>{
    const distance=Math.abs(card.getBoundingClientRect().left-stripLeft);
    return distance<closest.distance?{index,distance}:closest;
  },{index:0,distance:Number.POSITIVE_INFINITY});
  const nextText=`${current.index+1} / ${cards.length}`;
  if(status&&status.textContent!==nextText)status.textContent=nextText;
}

function scheduleWorldCarouselStatus(strip) {
  worldCarouselPendingStrip=strip;
  if(worldCarouselStatusFramePending)return;
  worldCarouselStatusFramePending=true;
  const update=()=>{
    worldCarouselStatusFramePending=false;
    const pendingStrip=worldCarouselPendingStrip;
    worldCarouselPendingStrip=null;
    updateWorldCarouselStatus(pendingStrip);
  };
  if(typeof globalThis.requestAnimationFrame==='function')globalThis.requestAnimationFrame(update);
  else globalThis.setTimeout?.(update,16);
}

function jumpToLobbyTarget(target) {
  const reduceMotion=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if(target==='friends'){
    const tools=document.querySelector('#lobby-tools');
    tools?.scrollIntoView({block:'start',behavior:reduceMotion?'auto':'smooth'});
    globalThis.setTimeout?.(()=>document.querySelector('#room-code')?.focus({preventScroll:true}),reduceMotion?0:420);
    return;
  }
  const allowed=new Set(['ddz','xiangqi','gomoku','mahjong','1048','sudoku6','minesweeper','memory','snake','three','reels']);
  if(!allowed.has(target))return;
  resetCatalogDiscovery();
  const strip=document.querySelector('[data-world-strip]');
  const card=strip?.querySelector(`[data-world-id="${target}"]`);
  if(!strip||!card)return;
  const left=card.offsetLeft-strip.offsetLeft;
  card.scrollIntoView({block:'center',inline:'nearest',behavior:reduceMotion?'auto':'smooth'});
  strip.scrollTo({left,behavior:reduceMotion?'auto':'smooth'});
  card.classList.add('is-highlighted');
  globalThis.setTimeout?.(()=>{
    card.classList.remove('is-highlighted');
    card.querySelector('button')?.focus({preventScroll:true});
    scheduleWorldCarouselStatus(strip);
  },reduceMotion?0:420);
}

app.addEventListener('click', e => {
  const el=e.target.closest('button');
  if(!el){
    const worldCard=e.target.closest?.('[data-world-card]');
    if(worldCard)worldCard.querySelector('button[data-action]')?.click();
    return;
  }
  if(state.view==='xiangqi'&&(state.casual?.showRules||state.casual?.confirmAction)&&!el.closest('[data-xiangqi-rules-dialog], [data-xiangqi-confirm-dialog]'))return;
  if(state.view==='minesweeper'&&state.casual?.confirmAction&&!el.closest('[data-minesweeper-confirm-dialog]'))return;
  if(el.dataset.xiangqiCell!==undefined){
    selectXiangqiCell(Number(el.dataset.xiangqiCell));
    return;
  }
  if(el.dataset.minesweeperCell!==undefined){
    const index=Number(el.dataset.minesweeperCell);
    if(minesweeperSuppressedClick?.index===index&&Date.now()<minesweeperSuppressedClick.until){minesweeperSuppressedClick=null;return;}
    minesweeperSuppressedClick=null;
    if(state.view!=='minesweeper'||!state.casual?.game)return;
    if(state.casual.inputMode==='flag')performMinesweeperFlag(index);else performMinesweeperReveal(index);
    return;
  }
  if(el.dataset.gomokuCell!==undefined){
    performGomokuMove(Number(el.dataset.gomokuCell));
    return;
  }
  if(el.dataset.memoryCard!==undefined){
    performMemoryFlip(Number(el.dataset.memoryCard));
    return;
  }
  if(el.dataset.sudoku6Cell!==undefined){
    if(state.view!=='sudoku6'||!state.casual?.game)return;
    state.casual.selectedCell=Number(el.dataset.sudoku6Cell);
    state.casual.announcement=state.casual.game.puzzle[state.casual.selectedCell]?'已选中题目给定数字':'已选中可填写格';
    render();focusSudoku6Interaction();return;
  }
  if(el.dataset.card){
    const id=el.dataset.card;
    const previousScroll=el.closest('.hand')?.scrollLeft || 0;
    state.selected.has(id)?state.selected.delete(id):state.selected.add(id);
    render();
    const nextHand=document.querySelector('.hand-dock .hand');
    if(nextHand) nextHand.scrollLeft=previousScroll;
    [...document.querySelectorAll('[data-card]')].find((control)=>control.dataset.card===id)?.focus({preventScroll:true});
    return;
  }
  if(el.dataset.mahjongTile){
    const game=state.casual?.game;
    if(state.view==='mahjong'&&game?.phase==='playing'&&game.currentSeat===0&&game.hands[0].length===14){
      const previousScroll=el.closest('.match-player-hand')?.scrollLeft || 0;
      const tileId=el.dataset.mahjongTile;
      state.casual.selectedTileId=state.casual.selectedTileId===el.dataset.mahjongTile?null:el.dataset.mahjongTile;
      render();
      const nextHand=document.querySelector('.match-player-hand');
      if(nextHand) nextHand.scrollLeft=previousScroll;
      [...document.querySelectorAll('[data-mahjong-tile]')].find((control)=>control.dataset.mahjongTile===tileId)?.focus({preventScroll:true});
    }
    return;
  }
  if(el.dataset.view){
    state.view=el.dataset.view;
    stopMahjongBotSequence();
    if(state.view!=='game') stopGameSync();
    if(state.view!=='room') stopRoomSync();
    if(state.view==='history') act(loadHistoryData); else render();
    return;
  }
  if(el.dataset.bid!==undefined) act(async()=>{const current=state.game;const body={score:Number(el.dataset.bid),expectedSequence:current.sequence};const r=await api(`/v1/games/${current.id}/bid`,{method:'POST',body:JSON.stringify(body),headers:{'x-request-id':requestId()}});acceptGame(r.game,r.profile);});
  const a=el.dataset.action;
  if(a==='hero-select'){switchHero(el.dataset.heroGame,el.dataset.heroGame==='ddz'?'previous':'next');return;}
  if(a==='world-prev'){scrollWorldCarousel(-1);return;}
  if(a==='world-next'){scrollWorldCarousel(1);return;}
  if(a==='jump-world'){jumpToLobbyTarget(el.dataset.worldTarget);return;}
  if(a==='catalog-filter'){
    for(const control of document.querySelectorAll('[data-catalog-filter]')){
      const selected=control===el;
      control.classList.toggle('is-active',selected);
      control.setAttribute('aria-pressed',String(selected));
    }
    applyCatalogDiscovery();
    return;
  }
  if(a==='catalog-show-results'){showCatalogResults();return;}
  if(a==='catalog-reset'){resetCatalogDiscovery({focusSearch:true});return;}
  if(a==='clear-selection'){state.selected.clear();render();return;}
  if(a==='quick') act(startQuickGame);
  if(a==='open-three'){openThreeCard();render();}
  if(a==='open-mahjong'){openMahjong();render();globalThis.scrollTo?.(0,0);}
  if(a==='open-xiangqi'){openXiangqi();render();globalThis.scrollTo?.(0,0);focusXiangqiInteraction();queueXiangqiAiTurn();}
  if(a==='open-1048'){open1048();render();globalThis.scrollTo?.(0,0);focus1048Interaction();}
  if(a==='open-sudoku6'){openSudoku6();render();globalThis.scrollTo?.(0,0);focusSudoku6Interaction();}
  if(a==='open-minesweeper'){openMinesweeper();render();globalThis.scrollTo?.(0,0);focusMinesweeperInteraction();}
  if(a==='open-gomoku'){openGomoku();render();globalThis.scrollTo?.(0,0);focusGomokuInteraction();}
  if(a==='open-memory'){openMemoryMatch();render();globalThis.scrollTo?.(0,0);focusMemoryInteraction();}
  if(a==='open-snake'){openSnake();render();globalThis.scrollTo?.(0,0);focusSnakeInteraction();}
  if(a==='open-slots'){openSlots();render();}
  if(a==='casual-home'){
    if(state.view==='mahjong'&&state.casual?.game?.phase==='playing'){
      stopMahjongBotSequence();state.casual.confirmAction='home';render();return;
    }
    if(state.view==='xiangqi'){settleXiangqiClock();saveXiangqiSession();}
    if(state.view==='sudoku6')settleAndSaveSudoku6();
    if(state.view==='minesweeper')settleAndSaveMinesweeper();
    if(state.view==='gomoku'&&state.casual?.game)saveGomokuGame(state.casual.game);
    if(state.view==='memory')saveCurrentMemorySession();
    if(state.view==='snake'&&state.casual?.game){
      if(state.casual.game.status==='playing')state.casual.game=toggleSnakePause(state.casual.game);
      saveSnakeGame(state.casual.game);
    }
    stopMahjongBotSequence();stopCasualTimers();state.casual=null;state.view='lobby';render();return;
  }
  if(a==='three-new'){stopCasualTimers();state.casual={kind:'three',round:newThreeCardRound(),revealed:false,thinking:false};render();}
  if(a==='three-reveal'&&state.view==='three'&&!state.casual?.thinking&&!state.casual?.revealed){
    const casual=state.casual;
    casual.thinking=true;
    render();
    threeRevealTimer=setTimeout(()=>{
      threeRevealTimer=null;
      if(state.view!=='three'||state.casual!==casual)return;
      casual.thinking=false;casual.revealed=true;render();
    },1_400);
  }
  if(a==='mahjong-new'){
    if(state.casual?.game?.phase==='playing'){stopMahjongBotSequence();state.casual.confirmAction='new';render();return;}
    const game=newMahjongGame();state.casual={kind:'mahjong',game,selectedTileId:null,confirmAction:null};render();return;
  }
  if(a==='mahjong-cancel-confirm'){state.casual.confirmAction=null;render();queueMahjongBotTurn();return;}
  if(a==='mahjong-confirm'){
    const nextAction=state.casual?.confirmAction;stopMahjongBotSequence();
    if(nextAction==='home'){state.casual=null;state.view='lobby';render();return;}
    if(nextAction==='new'){const game=newMahjongGame();state.casual={kind:'mahjong',game,selectedTileId:null,confirmAction:null};render();return;}
  }
  if(a==='mahjong-discard'&&state.view==='mahjong'){
    const game=state.casual?.game;const tileId=state.casual?.selectedTileId;
    if(!game||!tileId||game.phase!=='playing'||game.currentSeat!==0)return;
    try{state.casual.game=playMahjongDiscard(game,tileId,{advanceBots:false});state.casual.selectedTileId=null;}catch(error){toast(error.message);}render();queueMahjongBotTurn();return;
  }
  if(a==='xiangqi-tutorial-skip'){
    finishXiangqiTutorial();state.casual.announcement='首局引导已跳过';render();focusXiangqiInteraction();return;
  }
  if(a==='xiangqi-tutorial-done'){
    finishXiangqiTutorial();state.casual.announcement='首局引导完成';render();focusXiangqiInteraction();return;
  }
  if(a==='xiangqi-rules'&&state.view==='xiangqi'){
    if(xiangqiAiTimer)clearTimeout(xiangqiAiTimer);xiangqiAiTimer=null;
    state.casual.aiThinking=false;settleXiangqiClock();state.casual.xiangqiLastTick=Date.now();state.casual.dialogReturnFocus='rules';state.casual.showRules=true;render();focusXiangqiDialog();return;
  }
  if(a==='xiangqi-close-rules'&&state.view==='xiangqi'){
    const returnFocus=state.casual.dialogReturnFocus;state.casual.showRules=false;state.casual.dialogReturnFocus=null;state.casual.xiangqiLastTick=Date.now();state.casual.announcement='已返回棋局';render();focusXiangqiReturnControl(returnFocus);queueXiangqiAiTurn();return;
  }
  if(a==='xiangqi-undo'&&state.view==='xiangqi'){
    const casual=state.casual;const game=casual?.game;if(!game)return;
    if(xiangqiAiTimer)clearTimeout(xiangqiAiTimer);xiangqiAiTimer=null;casual.aiThinking=false;settleXiangqiClock();
    try{
      const next=undoXiangqiToHumanTurn(game);
      if((next.history?.length||0)===(game.history?.length||0)){toast('还没有可以撤销的回合');render();focusXiangqiInteraction();return;}
      casual.game=next;casual.selectedCell=null;casual.focusedCell=preferredXiangqiFocus(next, xiangqiMoveTo(next.lastMove));casual.undoCount=safeLocalCounter(casual.undoCount)+1;casual.announcement='已悔一回合 · 轮到你';casual.xiangqiLastTick=Date.now();saveXiangqiSession(casual);render();focusXiangqiInteraction();
    }catch(error){casual.announcement=error?.message||'当前不能悔棋';render();toast(casual.announcement);}
    return;
  }
  if(a==='xiangqi-new'&&state.view==='xiangqi'){
    const game=state.casual?.game;if(!game)return;
    if(game.status==='playing'&&(Number(game.moveCount)>0||game.history?.length)){
      if(xiangqiAiTimer)clearTimeout(xiangqiAiTimer);xiangqiAiTimer=null;state.casual.aiThinking=false;settleXiangqiClock();state.casual.xiangqiLastTick=Date.now();state.casual.dialogReturnFocus='new';state.casual.confirmAction='new';render();focusXiangqiDialog();return;
    }
    newXiangqiSession(game.difficulty);render();focusXiangqiInteraction();return;
  }
  if(a==='xiangqi-difficulty'&&state.view==='xiangqi'){
    const difficulty=el.dataset.xiangqiDifficulty;const game=state.casual?.game;
    if(!game||!['beginner','standard','challenge'].includes(difficulty))return;
    if(difficulty===game.difficulty){state.casual.announcement='当前已是这个难度';render();document.querySelector(`[data-xiangqi-difficulty="${difficulty}"]`)?.focus({preventScroll:true});return;}
    if(game.status==='playing'&&(Number(game.moveCount)>0||game.history?.length)){
      if(xiangqiAiTimer)clearTimeout(xiangqiAiTimer);xiangqiAiTimer=null;state.casual.aiThinking=false;settleXiangqiClock();state.casual.xiangqiLastTick=Date.now();state.casual.dialogReturnFocus=`difficulty:${difficulty}`;state.casual.confirmAction='difficulty';state.casual.pendingDifficulty=difficulty;render();focusXiangqiDialog();return;
    }
    newXiangqiSession(difficulty);render();focusXiangqiInteraction();return;
  }
  if(a==='xiangqi-cancel-confirm'&&state.view==='xiangqi'){
    const returnFocus=state.casual.dialogReturnFocus;state.casual.confirmAction=null;state.casual.pendingDifficulty=null;state.casual.dialogReturnFocus=null;state.casual.xiangqiLastTick=Date.now();state.casual.announcement='继续当前棋局';render();focusXiangqiReturnControl(returnFocus);queueXiangqiAiTurn();return;
  }
  if(a==='xiangqi-confirm'&&state.view==='xiangqi'){
    const difficulty=state.casual.confirmAction==='difficulty'?state.casual.pendingDifficulty:state.casual.game.difficulty;
    newXiangqiSession(difficulty||'beginner');render();focusXiangqiInteraction();return;
  }
  if(a==='1048-move'){perform1048Move(el.dataset.mergeDirection);return;}
  if(a==='1048-new'){const game=new1048Game();state.casual={kind:'1048',game};save1048Game(game);state.view='1048';render();focus1048Interaction();return;}
  if(a==='1048-continue'){
    const game=state.casual?.game;
    if(state.view==='1048'&&game?.status==='won'){
      state.casual.game={...game,status:canMove1048(game.board)?'playing':'over',continued:true};save1048Game(state.casual.game);render();focus1048Interaction();
    }
    return;
  }
  if(a==='sudoku6-value'){performSudoku6Value(Number(el.dataset.sudoku6Value));return;}
  if(a==='sudoku6-clear'){performSudoku6Value(0);return;}
  if(a==='sudoku6-notes'&&state.view==='sudoku6'){
    state.casual.noteMode=!state.casual.noteMode;
    state.casual.announcement=state.casual.noteMode?'已开启笔记模式':'已返回填数模式';
    render();focusSudoku6Interaction();return;
  }
  if(a==='sudoku6-undo'&&state.view==='sudoku6'){
    const game=state.casual?.game;if(!game)return;
    settleSudoku6Clock();
    const next=undoSudoku6(game);
    if(next.undoStack.length===game.undoStack.length)return;
    commitSudoku6Game(next,'已撤销上一步');return;
  }
  if(a==='sudoku6-hint'&&state.view==='sudoku6'){
    const game=state.casual?.game;if(!game)return;
    settleSudoku6Clock();
    const next=hintSudoku6(game,state.casual.selectedCell);
    if(next.hintsUsed===game.hintsUsed){toast('本局的 3 次提示已用完');return;}
    const hintedIndex=next.values.findIndex((value,index)=>value!==game.values[index]);
    if(hintedIndex>=0)state.casual.selectedCell=hintedIndex;
    commitSudoku6Game(next,next.status==='completed'?'数独完成':'已为当前格填入一个提示');return;
  }
  if(a==='sudoku6-new'&&state.view==='sudoku6'){
    const current=state.casual?.game;if(!current)return;
    settleAndSaveSudoku6();
    if(!confirmSudoku6Replacement(current,'当前进度尚未完成，确定重新开题吗？'))return;
    const game=newSudoku6Game({mode:current.mode,difficulty:current.mode==='daily'?'medium':current.difficulty,date:current.date||localDateKey()});
    startSudoku6Session(game,'新题已准备好');render();focusSudoku6Interaction();return;
  }
  if(a==='sudoku6-difficulty'&&state.view==='sudoku6'){
    const difficulty=el.dataset.sudoku6Difficulty;
    const current=state.casual?.game;if(!current)return;
    settleAndSaveSudoku6();
    if(current.mode==='practice'&&difficulty===current.difficulty){state.casual.announcement='当前已是这个难度';render();focusSudoku6Interaction();return;}
    if(!confirmSudoku6Replacement(current,'切换难度会开始新题，确定继续吗？'))return;
    const game=newSudoku6Game({mode:'practice',difficulty});
    startSudoku6Session(game,`已切换为${SUDOKU6_DIFFICULTIES[game.difficulty].label}难度`);render();focusSudoku6Interaction();return;
  }
  if(a==='sudoku6-daily'&&state.view==='sudoku6'){
    settleAndSaveSudoku6();
    const game=loadSavedSudoku6Game('daily')||newSudoku6Game({mode:'daily',difficulty:'medium',date:localDateKey()});
    startSudoku6Session(game,'已进入今日挑战');render();focusSudoku6Interaction();return;
  }
  if(a==='sudoku6-practice'&&state.view==='sudoku6'){
    settleAndSaveSudoku6();
    const fallbackDifficulty=state.casual?.game?.difficulty||'medium';
    const game=loadSavedSudoku6Game('practice')||newSudoku6Game({mode:'practice',difficulty:fallbackDifficulty});
    startSudoku6Session(game,'已进入自由练习');render();focusSudoku6Interaction();return;
  }
  if(a==='minesweeper-mode'&&state.view==='minesweeper'){
    const mode=el.dataset.minesweeperMode==='flag'?'flag':'reveal';
    state.casual.inputMode=mode;state.casual.announcement=mode==='flag'?'已切换到插旗模式 · 点击未揭格标记':'已切换到揭开模式';render();focusMinesweeperInteraction();return;
  }
  if(a==='minesweeper-new'&&state.view==='minesweeper'){
    const game=state.casual?.game;if(!game)return;
    settleMinesweeperClock();
    if(minesweeperHasProgress(state.casual.game)){
      pauseMinesweeperClock();state.casual.confirmAction='new';state.casual.dialogReturnFocus='new';render();focusMinesweeperDialog();return;
    }
    newMinesweeperSession(game.difficulty);render();focusMinesweeperInteraction();return;
  }
  if(a==='minesweeper-difficulty'&&state.view==='minesweeper'){
    const difficulty=el.dataset.minesweeperDifficulty;const game=state.casual?.game;
    if(!game||!Object.hasOwn(MINESWEEPER_DIFFICULTIES,difficulty))return;
    if(difficulty===game.difficulty){state.casual.announcement='当前已是这个难度';render();document.querySelector(`[data-minesweeper-difficulty="${difficulty}"]`)?.focus({preventScroll:true});return;}
    settleMinesweeperClock();
    if(minesweeperHasProgress(state.casual.game)){
      pauseMinesweeperClock();state.casual.confirmAction='difficulty';state.casual.pendingDifficulty=difficulty;state.casual.dialogReturnFocus=`difficulty:${difficulty}`;render();focusMinesweeperDialog();return;
    }
    newMinesweeperSession(difficulty);render();focusMinesweeperInteraction();return;
  }
  if(a==='minesweeper-cancel-confirm'&&state.view==='minesweeper'){
    const returnFocus=state.casual.dialogReturnFocus;state.casual.confirmAction=null;state.casual.pendingDifficulty=null;state.casual.dialogReturnFocus=null;resumeMinesweeperClock();state.casual.announcement='继续当前雷区';render();focusMinesweeperReturnControl(returnFocus);return;
  }
  if(a==='minesweeper-confirm'&&state.view==='minesweeper'){
    const difficulty=state.casual.confirmAction==='difficulty'?state.casual.pendingDifficulty:state.casual.game.difficulty;
    newMinesweeperSession(difficulty);render();focusMinesweeperInteraction();return;
  }
  if(a==='gomoku-new'&&state.view==='gomoku'){
    const game=state.casual?.game;
    if(!confirmLocalGameReplacement(game?.status==='playing'&&Number(game.moveCount)>0,'当前五子棋尚未结束，确定重新开局吗？'))return;
    newGomokuSession();render();focusGomokuInteraction();return;
  }
  if(a==='memory-new'&&state.view==='memory'){
    const game=state.casual?.game;
    const hasProgress=game?.status==='playing'&&(Number(game.moveCount)>0||game.faceUp?.length>0||Number(game.matchedPairs)>0);
    if(!confirmLocalGameReplacement(hasProgress,'当前翻牌进度尚未完成，确定重新洗牌吗？'))return;
    newMemorySession();render();focusMemoryInteraction();return;
  }
  if(a==='memory-difficulty'&&state.view==='memory'){
    const difficulty=el.dataset.memoryDifficulty;
    const game=state.casual?.game;
    if(!Object.hasOwn(MEMORY_MATCH_DIFFICULTIES,difficulty)||!game)return;
    if(difficulty===game.difficulty){state.casual.announcement='当前已是这个难度';render();focusMemoryInteraction();return;}
    const hasProgress=game.status==='playing'&&(Number(game.moveCount)>0||game.faceUp?.length>0||Number(game.matchedPairs)>0);
    if(!confirmLocalGameReplacement(hasProgress,'切换难度会开始新牌阵，确定继续吗？'))return;
    newMemorySession(difficulty);
    render();focusMemoryInteraction();return;
  }
  if(a==='snake-direction'&&state.view==='snake'){performSnakeDirection(el.dataset.snakeDirection);return;}
  if(a==='snake-toggle'&&state.view==='snake'){toggleSnakeSession();return;}
  if(a==='snake-new'&&state.view==='snake'){
    const game=state.casual?.game;
    if(!confirmLocalGameReplacement(['playing','paused'].includes(game?.status)&&Number(game.ticks)>0,'当前贪吃蛇进度尚未结束，确定重新开始吗？'))return;
    newSnakeSession();render();focusSnakeInteraction();return;
  }
  if(a==='snake-difficulty'&&state.view==='snake'){
    const difficulty=el.dataset.snakeDifficulty;
    const game=state.casual?.game;
    if(!Object.hasOwn(SNAKE_DIFFICULTIES,difficulty)||!game)return;
    if(difficulty===game.difficulty){state.casual.announcement='当前已是这个速度';render();focusSnakeInteraction();return;}
    if(!confirmLocalGameReplacement(['playing','paused'].includes(game.status)&&Number(game.ticks)>0,'切换速度会重新开始本轮，确定继续吗？'))return;
    newSnakeSession(difficulty);
    render();focusSnakeInteraction();return;
  }
  if(a==='slots-spin'&&state.view==='slots'&&!state.casual?.spinning){
    const casual=state.casual;
    casual.spinning=true;casual.last=null;render();
    slotSpinTimer=setTimeout(()=>{
      slotSpinTimer=null;
      if(state.view!=='slots'||state.casual!==casual)return;
      const next=spinSlots();casual.reels=next.reels;casual.last=next;casual.spins+=1;casual.spinning=false;render();
    },850);
  }
  if(a==='retry-history') act(loadHistoryData);
  if(a==='resume') act(async()=>{const r=await api('/v1/resume');if(r.game){enterGame(r.game);}else if(r.room){state.room=r.room;state.roomExitConfirm=false;state.view='room';startRoomSync();}else toast('没有待恢复的牌局');});
  if(a==='create-room') act(async()=>{state.room=(await api('/v1/rooms',{method:'POST',body:'{}'})).room;state.roomExitConfirm=false;state.view='room';startRoomSync();});
  if(a==='join-room') act(async()=>{const code=document.querySelector('#room-code')?.value.trim();if(!/^\d{6}$/.test(code))throw new Error('请输入 6 位房号');state.room=(await api('/v1/rooms/join',{method:'POST',body:JSON.stringify({code})})).room;state.roomExitConfirm=false;state.view='room';startRoomSync();});
  if(a==='copy-room') {
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(state.room.code).then(()=>toast('房号已复制')).catch(()=>toast(`房号：${state.room.code}`));
    else toast(`房号：${state.room.code}`);
  }
  if(a==='open-room-exit'){state.roomExitConfirm=true;render();return;}
  if(a==='cancel-room-exit'){state.roomExitConfirm=false;render();return;}
  if(a==='refresh-room') act(async()=>{state.room=(await api(`/v1/rooms/${state.room.id}`)).room;if(state.room.gameId)await loadGame(state.room.gameId,{animateDeal:true});else startRoomSync();});
  if(a==='retry-sync') act(async()=>{
    if(state.view==='room'&&state.room){state.room=(await api(`/v1/rooms/${state.room.id}`)).room;if(state.room.gameId)await loadGame(state.room.gameId,{animateDeal:true});else startRoomSync();return;}
    if(state.view==='game'&&state.game){const currentId=state.game.id;const next=(await api(`/v1/games/${currentId}`)).game;if(state.game?.id===currentId){state.game=next;startGameSync();}}
  });
  if(a==='start-room') act(async()=>{const r=await api(`/v1/rooms/${state.room.id}/start`,{method:'POST',body:'{}'});state.room=r.room;enterGame(r.game,{animateDeal:true});});
  if(a==='leave-room') act(async()=>{const roomId=state.room.id;stopRoomSync();try{await api(`/v1/rooms/${roomId}/leave`,{method:'POST',body:'{}'});}catch(error){startRoomSync();throw error;}state.room=null;state.roomExitConfirm=false;state.view='lobby';});
  if(a==='pass') act(async()=>{const current=state.game;const r=await api(`/v1/games/${current.id}/pass`,{method:'POST',body:JSON.stringify({expectedSequence:current.sequence}),headers:{'x-request-id':requestId()}});acceptGame(r.game,r.profile);state.selected.clear();});
  if(a==='play') act(async()=>{if(!state.selected.size)throw new Error('请先选择要出的牌');const current=state.game;const r=await api(`/v1/games/${current.id}/play`,{method:'POST',body:JSON.stringify({cardIds:[...state.selected],expectedSequence:current.sequence}),headers:{'x-request-id':requestId()}});acceptGame(r.game,r.profile);state.selected.clear();});
  if(a==='rematch') act(async()=>{stopGameSync();await refreshProfile();await startQuickGame();});
  if(a==='finish') act(async()=>{stopGameSync();await refreshProfile();state.game=null;state.view='lobby';});
  if(a==='open-exit'){state.exitConfirm=true;render();}
  if(a==='cancel-exit'){state.exitConfirm=false;render();}
  if(a==='confirm-exit') act(async()=>{const current=state.game;const r=await api(`/v1/games/${current.id}/abandon`,{method:'POST',body:'{}'});stopGameSync();acceptGame(r.game,r.profile);state.exitConfirm=false;state.view='game';});
  if(a?.startsWith('preview-')) {
    const messages = {
      'preview-three':'三张竞技尚未开放，不包含现金下注或可提现筹码。',
      'preview-ai':'AI 挑战场即将开放，当前不会产生任何费用。',
      'preview-cloudpay':'该服务即将接入 CloudPay，目前没有支付或扣除卡时。'
    };
    toast(messages[a] || '该能力即将开放');
  }
});

app.addEventListener('input', (event) => {
  if(event.target?.matches?.('[data-catalog-search]'))applyCatalogDiscovery();
});

app.addEventListener('scroll', (event) => {
  if (event.target?.matches?.('[data-world-strip]')) scheduleWorldCarouselStatus(event.target);
}, true);

app.addEventListener('contextmenu', (event) => {
  const cell = event.target.closest?.('[data-minesweeper-cell]');
  if (!cell || state.view !== 'minesweeper') return;
  event.preventDefault();
  const index = Number(cell.dataset.minesweeperCell);
  if (minesweeperSuppressedClick?.index === index && Date.now() < minesweeperSuppressedClick.until) return;
  performMinesweeperFlag(index);
});

app.addEventListener('pointerdown', (event) => {
  const minesweeperCellNode = event.target.closest?.('[data-minesweeper-cell]');
  if (minesweeperCellNode && state.view === 'minesweeper' && ['touch','pen'].includes(event.pointerType) && event.isPrimary) {
    cancelMinesweeperLongPress();
    const index = Number(minesweeperCellNode.dataset.minesweeperCell);
    const casual = state.casual;
    const timer = setTimeout(() => {
      if (state.view !== 'minesweeper' || state.casual !== casual || state.casual?.confirmAction) return;
      minesweeperSuppressedClick = { index, until:Date.now() + 900 };
      minesweeperLongPress = null;
      performMinesweeperFlag(index);
    }, 520);
    minesweeperLongPress = { pointerId:event.pointerId, index, x:event.clientX, y:event.clientY, timer };
  }
  const snakeBoard = event.target.closest?.('[data-snake-board]');
  if (snakeBoard && state.view === 'snake') {
    snakePointer = { id:event.pointerId, x:event.clientX, y:event.clientY };
    snakeBoard.setPointerCapture?.(event.pointerId);
    return;
  }
  const mergeBoard = event.target.closest?.('[data-1048-board]');
  if (mergeBoard && state.view === '1048') {
    merge1048Pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
    mergeBoard.setPointerCapture?.(event.pointerId);
    return;
  }
  const carousel = event.target.closest?.('[data-hero-carousel]');
  if (!carousel || event.target.closest?.('button, input, a')) return;
  heroPointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
  carousel.setPointerCapture?.(event.pointerId);
});

app.addEventListener('pointermove', (event) => {
  if (!minesweeperLongPress || minesweeperLongPress.pointerId !== event.pointerId) return;
  const deltaX = event.clientX - minesweeperLongPress.x;
  const deltaY = event.clientY - minesweeperLongPress.y;
  if (Math.hypot(deltaX, deltaY) > 10) cancelMinesweeperLongPress();
});

app.addEventListener('pointerup', (event) => {
  if (minesweeperLongPress?.pointerId === event.pointerId) cancelMinesweeperLongPress();
  if (snakePointer && snakePointer.id === event.pointerId) {
    const deltaX=event.clientX-snakePointer.x;const deltaY=event.clientY-snakePointer.y;
    snakePointer=null;
    const horizontal=Math.abs(deltaX)>=Math.abs(deltaY);const distance=horizontal?Math.abs(deltaX):Math.abs(deltaY);
    if(distance>=24)performSnakeDirection(horizontal?(deltaX<0?'left':'right'):(deltaY<0?'up':'down'));
    return;
  }
  if (merge1048Pointer && merge1048Pointer.id === event.pointerId) {
    const deltaX = event.clientX - merge1048Pointer.x;
    const deltaY = event.clientY - merge1048Pointer.y;
    merge1048Pointer = null;
    const horizontal = Math.abs(deltaX) >= Math.abs(deltaY) * 1.2;
    const distance = horizontal ? Math.abs(deltaX) : Math.abs(deltaY);
    if (distance >= 28) perform1048Move(horizontal ? (deltaX < 0 ? 'left' : 'right') : (deltaY < 0 ? 'up' : 'down'));
    return;
  }
  if (!heroPointer || heroPointer.id !== event.pointerId) return;
  const deltaX = event.clientX - heroPointer.x;
  const deltaY = event.clientY - heroPointer.y;
  heroPointer = null;
  if (Math.abs(deltaX) < 42 || Math.abs(deltaX) < Math.abs(deltaY) * 1.15) return;
  const nextGame = state.heroGame === 'ddz' ? 'mahjong' : 'ddz';
  switchHero(nextGame, deltaX < 0 ? 'next' : 'previous');
});

app.addEventListener('pointercancel', () => { heroPointer = null; merge1048Pointer = null; snakePointer = null; cancelMinesweeperLongPress(); });

app.addEventListener('keydown', (event) => {
  if(state.view==='lobby'){
    const search=document.querySelector('[data-catalog-search]');
    const editable=event.target?.matches?.('input, textarea, select, [contenteditable="true"]');
    if(event.key==='/'&&!editable){
      event.preventDefault();
      search?.focus();
      return;
    }
    if(event.key==='Escape'&&event.target===search&&search?.value){
      event.preventDefault();
      clearCatalogSearch({focusSearch:true});
      return;
    }
    if(event.key==='Enter'&&event.target===search){
      event.preventDefault();
      showCatalogResults();
      return;
    }
  }
  const minesweeperModalOpen = state.view === 'minesweeper' && state.casual?.confirmAction;
  if (minesweeperModalOpen && event.key === 'Tab') {
    trapMinesweeperDialogTab(event);
    return;
  }
  if (minesweeperModalOpen && event.key === 'Escape') {
    event.preventDefault();
    const returnFocus = state.casual.dialogReturnFocus;
    state.casual.confirmAction = null;
    state.casual.pendingDifficulty = null;
    state.casual.dialogReturnFocus = null;
    resumeMinesweeperClock();
    state.casual.announcement = '继续当前雷区';
    render();focusMinesweeperReturnControl(returnFocus);
    return;
  }
  if (minesweeperModalOpen && !event.target.closest?.('[data-minesweeper-confirm-dialog]')) {
    event.preventDefault();focusMinesweeperDialog();return;
  }
  const xiangqiModalOpen = state.view === 'xiangqi' && (state.casual?.showRules || state.casual?.confirmAction);
  if (xiangqiModalOpen && event.key === 'Tab') {
    trapXiangqiDialogTab(event);
    return;
  }
  if (xiangqiModalOpen && event.key === 'Escape') {
    event.preventDefault();
    const returnFocus = state.casual.dialogReturnFocus;
    if (state.casual.showRules) state.casual.showRules = false;
    state.casual.confirmAction = null;
    state.casual.pendingDifficulty = null;
    state.casual.dialogReturnFocus = null;
    state.casual.xiangqiLastTick = Date.now();
    state.casual.announcement = '继续当前棋局';
    render();focusXiangqiReturnControl(returnFocus);queueXiangqiAiTurn();
    return;
  }
  if (xiangqiModalOpen && !event.target.closest?.('[data-xiangqi-rules-dialog], [data-xiangqi-confirm-dialog]')) {
    event.preventDefault();
    focusXiangqiDialog();
    return;
  }
  const gomokuCellNode = event.target.closest?.('[data-gomoku-cell]');
  if (state.view === 'gomoku' && gomokuCellNode) {
    const index = Number(gomokuCellNode.dataset.gomokuCell);
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();performGomokuMove(index);return;
    }
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      const nextIndex = event.key === 'Home' ? 0 : GOMOKU_CELL_COUNT - 1;
      state.casual.focusedCell = nextIndex;render();focusGomokuInteraction(nextIndex);return;
    }
    if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)) {
      event.preventDefault();
      const row=Math.floor(index/GOMOKU_SIZE);const column=index%GOMOKU_SIZE;
      const nextRow=event.key==='ArrowUp'?Math.max(0,row-1):event.key==='ArrowDown'?Math.min(GOMOKU_SIZE-1,row+1):row;
      const nextColumn=event.key==='ArrowLeft'?Math.max(0,column-1):event.key==='ArrowRight'?Math.min(GOMOKU_SIZE-1,column+1):column;
      const nextIndex=nextRow*GOMOKU_SIZE+nextColumn;
      state.casual.focusedCell=nextIndex;state.casual.announcement=`已移到第 ${nextRow+1} 行第 ${nextColumn+1} 列`;render();focusGomokuInteraction(nextIndex);return;
    }
  }
  const memoryCardNode = event.target.closest?.('[data-memory-card]');
  if (state.view === 'memory' && memoryCardNode) {
    const index=Number(memoryCardNode.dataset.memoryCard);
    if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)) {
      event.preventDefault();
      const columns=state.casual.game.columns;const rows=state.casual.game.rows;
      const row=Math.floor(index/columns);const column=index%columns;
      const nextRow=event.key==='ArrowUp'?Math.max(0,row-1):event.key==='ArrowDown'?Math.min(rows-1,row+1):row;
      const nextColumn=event.key==='ArrowLeft'?Math.max(0,column-1):event.key==='ArrowRight'?Math.min(columns-1,column+1):column;
      const nextIndex=nextRow*columns+nextColumn;
      state.casual.focusedCard=nextIndex;render();focusMemoryInteraction(nextIndex);return;
    }
  }
  if (state.view === 'snake' && event.target.closest?.('[data-snake-board]')) {
    const direction=({ArrowLeft:'left',a:'left',A:'left',ArrowRight:'right',d:'right',D:'right',ArrowUp:'up',w:'up',W:'up',ArrowDown:'down',s:'down',S:'down'})[event.key];
    if(direction){event.preventDefault();performSnakeDirection(direction);return;}
    if(event.key===' '){event.preventDefault();toggleSnakeSession();return;}
  }
  const xiangqiCellNode = event.target.closest?.('[data-xiangqi-cell]');
  if (state.view === 'xiangqi' && xiangqiCellNode) {
    const index = Number(xiangqiCellNode.dataset.xiangqiCell);
    state.casual.focusedCell = index;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      document.querySelector('[data-action="xiangqi-undo"]')?.click();
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      selectXiangqiCell(index);
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      state.casual.selectedCell = null;
      state.casual.announcement = '已取消选择';
      render();focusXiangqiInteraction(index);
      return;
    }
    if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)) {
      event.preventDefault();
      const row = Math.floor(index / 9);
      const column = index % 9;
      const nextRow = event.key === 'ArrowUp' ? Math.max(0, row - 1) : event.key === 'ArrowDown' ? Math.min(9, row + 1) : row;
      const nextColumn = event.key === 'ArrowLeft' ? Math.max(0, column - 1) : event.key === 'ArrowRight' ? Math.min(8, column + 1) : column;
      const nextIndex = nextRow * 9 + nextColumn;
      state.casual.focusedCell = nextIndex;
      state.casual.announcement = `已移到第 ${nextRow + 1} 行第 ${nextColumn + 1} 列`;
      render();focusXiangqiInteraction(nextIndex);
      return;
    }
  }
  const minesweeperCellNode = event.target.closest?.('[data-minesweeper-cell]');
  if (state.view === 'minesweeper' && minesweeperCellNode) {
    const index = Number(minesweeperCellNode.dataset.minesweeperCell);
    state.casual.focusedCell = index;
    if (event.key === 'f' || event.key === 'F') {
      event.preventDefault();performMinesweeperFlag(index);return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();performMinesweeperReveal(index);return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();state.casual.inputMode='reveal';state.casual.announcement='已返回揭开模式';render();focusMinesweeperInteraction(index);return;
    }
    if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)) {
      event.preventDefault();
      const game=state.casual.game;const row=Math.floor(index/game.columns);const column=index%game.columns;
      const nextRow=event.key==='ArrowUp'?Math.max(0,row-1):event.key==='ArrowDown'?Math.min(game.rows-1,row+1):row;
      const nextColumn=event.key==='ArrowLeft'?Math.max(0,column-1):event.key==='ArrowRight'?Math.min(game.columns-1,column+1):column;
      const nextIndex=nextRow*game.columns+nextColumn;
      state.casual.focusedCell=nextIndex;state.casual.announcement=`已移到第 ${nextRow+1} 行第 ${nextColumn+1} 列`;render();focusMinesweeperInteraction(nextIndex);return;
    }
  }
  const sudokuCell = event.target.closest?.('[data-sudoku6-cell]');
  if (state.view === 'sudoku6' && sudokuCell) {
    const index = Number(sudokuCell.dataset.sudoku6Cell);
    state.casual.selectedCell = index;
    if (/^[1-6]$/.test(event.key)) {
      event.preventDefault();
      performSudoku6Value(Number(event.key));
      return;
    }
    if (['0', 'Backspace', 'Delete'].includes(event.key)) {
      event.preventDefault();
      performSudoku6Value(0);
      return;
    }
    if (event.key === 'n' || event.key === 'N') {
      event.preventDefault();
      state.casual.noteMode = !state.casual.noteMode;
      state.casual.announcement = state.casual.noteMode ? '已开启笔记模式' : '已返回填数模式';
      render();
      focusSudoku6Interaction();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      const game = state.casual.game;
      settleSudoku6Clock();
      const next = undoSudoku6(game);
      if (next.undoStack.length !== game.undoStack.length) commitSudoku6Game(next, '已撤销上一步');
      return;
    }
    if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)) {
      event.preventDefault();
      const row = Math.floor(index / 6);
      const column = index % 6;
      const nextRow = event.key === 'ArrowUp' ? Math.max(0, row - 1) : event.key === 'ArrowDown' ? Math.min(5, row + 1) : row;
      const nextColumn = event.key === 'ArrowLeft' ? Math.max(0, column - 1) : event.key === 'ArrowRight' ? Math.min(5, column + 1) : column;
      state.casual.selectedCell = nextRow * 6 + nextColumn;
      state.casual.announcement = `已移到第 ${nextRow + 1} 行第 ${nextColumn + 1} 列`;
      render();
      focusSudoku6Interaction();
      return;
    }
  }
  if (state.view === '1048' && event.target.closest?.('[data-1048-board]')) {
    const direction = ({ ArrowLeft:'left', a:'left', A:'left', ArrowRight:'right', d:'right', D:'right', ArrowUp:'up', w:'up', W:'up', ArrowDown:'down', s:'down', S:'down' })[event.key];
    if (direction) {
      event.preventDefault();
      perform1048Move(direction);
      return;
    }
  }
  const worldStrip = event.target.closest?.('[data-world-strip]');
  if (worldStrip && event.target === worldStrip && ['ArrowLeft','ArrowRight'].includes(event.key)) {
    event.preventDefault();
    scrollWorldCarousel(event.key === 'ArrowLeft' ? -1 : 1);
    return;
  }
  const carousel = event.target.closest?.('[data-hero-carousel]');
  if (!carousel || event.target !== carousel || !['ArrowLeft','ArrowRight'].includes(event.key)) return;
  event.preventDefault();
  const nextGame = state.heroGame === 'ddz' ? 'mahjong' : 'ddz';
  switchHero(nextGame, event.key === 'ArrowLeft' ? 'previous' : 'next');
});

bootstrap();
setInterval(() => {
  updateTurnClock();
  updateSudoku6Clock();
  updateXiangqiClock();
  updateMinesweeperClock();
  updateMemoryMatchClock();
}, 1000);

document.addEventListener('visibilitychange', () => {
  if (!state.casual?.game) return;
  if (state.view === 'xiangqi') {
    if (document.visibilityState === 'hidden') {
      settleXiangqiClock();
      saveXiangqiSession();
      return;
    }
    state.casual.xiangqiLastTick = Date.now();
  }
  if (state.view === 'sudoku6') {
    if (document.visibilityState === 'hidden') {
      settleAndSaveSudoku6();
      return;
    }
    state.casual.sudokuLastTick = Date.now();
  }
  if (state.view === 'minesweeper') {
    if (document.visibilityState === 'hidden') {
      pauseMinesweeperClock();
      if (state.casual?.game) saveMinesweeperGame(state.casual.game);
      return;
    }
    if (!state.casual.confirmAction) resumeMinesweeperClock();
  }
  if (state.view === 'gomoku' && document.visibilityState === 'hidden') saveGomokuGame(state.casual.game);
  if (state.view === 'memory') {
    if (document.visibilityState === 'hidden') {
      if (memoryMismatchTimer) clearTimeout(memoryMismatchTimer);
      memoryMismatchTimer = null;
      saveCurrentMemorySession();
    }
    else queueMemoryMismatchResolution();
  }
  if (state.view === 'snake' && document.visibilityState === 'hidden') {
    if (state.casual.game.status === 'playing') state.casual.game = toggleSnakePause(state.casual.game);
    state.casual.announcement = '页面已隐藏，游戏自动暂停';
    saveSnakeGame(state.casual.game);
    stopCasualTimers();
  }
});

globalThis.addEventListener?.('storage', (event) => {
  if ((event.key !== MINESWEEPER_SAVE_KEY && event.key !== null)
    || state.view !== 'minesweeper'
    || state.casual?.kind !== 'minesweeper'
    || typeof state.casual.minesweeperPersistedSnapshot !== 'string'
    || event.newValue === state.casual.minesweeperPersistedSnapshot) return;
  state.casual.saveAvailable = false;
  state.casual.saveConflict = true;
  state.casual.announcement = '另一个标签页已更新这局，本页已停止写入';
  render();
  if (state.casual.confirmAction) focusMinesweeperDialog();
  else focusMinesweeperInteraction();
});
