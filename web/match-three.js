export const MATCH_THREE_SCHEMA_VERSION = 1;
export const MATCH_THREE_ROWS = 8;
export const MATCH_THREE_COLUMNS = 8;
export const MATCH_THREE_CELL_COUNT = MATCH_THREE_ROWS * MATCH_THREE_COLUMNS;
export const MATCH_THREE_BASE_SCORE = 10;
export const MATCH_THREE_DEFAULT_MOVE_LIMIT = 24;
export const MATCH_THREE_DEFAULT_TARGET_SCORE = 1_200;

export const MATCH_THREE_SYMBOLS = Object.freeze([
  'ruby',
  'sun',
  'leaf',
  'wave',
  'moon',
  'star',
]);

const UINT32_MAX = 0xffff_ffff;
const MAX_MOVE_LIMIT = 200;
const MAX_TARGET_SCORE = 1_000_000_000;
const MAX_HISTORY_LENGTH = 256;
const MAX_CASCADES = 64;
const VALID_STATUSES = Object.freeze(['playing', 'won', 'lost']);
const GAME_KEYS = Object.freeze([
  'schemaVersion',
  'kind',
  'rows',
  'columns',
  'symbolCount',
  'seed',
  'rngState',
  'board',
  'status',
  'moveLimit',
  'targetScore',
  'moveCount',
  'score',
  'totalCleared',
  'shuffleCount',
  'history',
  'lastSwap',
  'lastResolution',
]);
const SWAP_ACTION_KEYS = Object.freeze(['type', 'from', 'to']);
const SHUFFLE_ACTION_KEYS = Object.freeze(['type']);
const LAST_SWAP_KEYS = Object.freeze(['from', 'to']);
const LAST_RESOLUTION_KEYS = Object.freeze([
  'cascadeCount',
  'cascadeSizes',
  'clearedCount',
  'scoreGained',
  'autoShuffled',
]);

// A reviewed emergency layout keeps creation total even if a future random
// generator is pathological. It contains every symbol, no match, and many moves.
const FALLBACK_BOARD = Object.freeze([
  1, 2, 0, 1, 2, 3, 2, 1,
  0, 3, 3, 5, 4, 5, 0, 5,
  3, 1, 0, 4, 3, 4, 5, 0,
  2, 3, 4, 5, 0, 0, 4, 0,
  5, 5, 4, 0, 5, 1, 2, 3,
  1, 3, 2, 1, 2, 0, 5, 4,
  5, 0, 4, 5, 0, 3, 3, 0,
  0, 5, 3, 5, 4, 3, 0, 3,
]);

function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value, expectedKeys) {
  if (!isObject(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index]);
}

function arraysEqual(left, right) {
  return Array.isArray(left)
    && Array.isArray(right)
    && left.length === right.length
    && left.every((value, index) => value === right[index]);
}

function isCanonicalInteger(value) {
  return Number.isSafeInteger(value) && !Object.is(value, -0);
}

function isUint32(value) {
  return isCanonicalInteger(value) && value >= 0 && value <= UINT32_MAX;
}

function seedFromText(text) {
  let hash = 2_166_136_261;
  for (const character of String(text)) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

function normalizeSeedValue(seed) {
  if (typeof seed === 'string' && seed.length > 0 && seed.length <= 512) {
    return seedFromText(seed);
  }
  if (isUint32(seed)) return seed >>> 0;
  throw new Error('MATCH_THREE_SEED_INVALID');
}

function randomUnit(random) {
  if (typeof random !== 'function') throw new Error('MATCH_THREE_RANDOM_INVALID');
  const value = Number(random());
  if (!Number.isFinite(value) || value < 0 || value >= 1) {
    throw new Error('MATCH_THREE_RANDOM_INVALID');
  }
  return value;
}

function normalizeSeed(options) {
  if (Object.hasOwn(options, 'seed')) return normalizeSeedValue(options.seed);
  const random = options.random === undefined ? Math.random : options.random;
  return Math.floor(randomUnit(random) * 0x1_0000_0000) >>> 0;
}

function nextRandom(state) {
  const nextState = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
  return { state: nextState, value: nextState / 0x1_0000_0000 };
}

export function matchThreeSeededRandom(seed) {
  let state = normalizeSeedValue(seed);
  return () => {
    const next = nextRandom(state);
    state = next.state;
    return next.value;
  };
}

function normalizeMoveLimit(value) {
  if (value === undefined) return MATCH_THREE_DEFAULT_MOVE_LIMIT;
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_MOVE_LIMIT) {
    throw new Error('MATCH_THREE_MOVE_LIMIT_INVALID');
  }
  return value;
}

function normalizeTargetScore(value) {
  if (value === undefined) return MATCH_THREE_DEFAULT_TARGET_SCORE;
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_TARGET_SCORE) {
    throw new Error('MATCH_THREE_TARGET_SCORE_INVALID');
  }
  return value;
}

function isSymbol(value) {
  return isCanonicalInteger(value) && value >= 0 && value < MATCH_THREE_SYMBOLS.length;
}

function isCompleteBoard(board) {
  if (!Array.isArray(board) || board.length !== MATCH_THREE_CELL_COUNT) return false;
  for (let index = 0; index < MATCH_THREE_CELL_COUNT; index += 1) {
    if (!Object.hasOwn(board, index) || !isSymbol(board[index])) return false;
  }
  return true;
}

function assertBoard(board) {
  if (!isCompleteBoard(board)) throw new Error('MATCH_THREE_BOARD_INVALID');
}

function assertPosition(index) {
  if (!isCanonicalInteger(index) || index < 0 || index >= MATCH_THREE_CELL_COUNT) {
    throw new Error('MATCH_THREE_POSITION_INVALID');
  }
}

export function matchThreePosition(row, column) {
  if (!isCanonicalInteger(row) || row < 0 || row >= MATCH_THREE_ROWS
    || !isCanonicalInteger(column) || column < 0 || column >= MATCH_THREE_COLUMNS) {
    throw new Error('MATCH_THREE_COORDINATES_INVALID');
  }
  return row * MATCH_THREE_COLUMNS + column;
}

export function matchThreeCoordinates(index) {
  assertPosition(index);
  return {
    row: Math.floor(index / MATCH_THREE_COLUMNS),
    column: index % MATCH_THREE_COLUMNS,
  };
}

function matchedIndexes(board) {
  const matches = new Set();
  for (let row = 0; row < MATCH_THREE_ROWS; row += 1) {
    let start = 0;
    while (start < MATCH_THREE_COLUMNS) {
      const value = board[row * MATCH_THREE_COLUMNS + start];
      let end = start + 1;
      while (end < MATCH_THREE_COLUMNS
        && board[row * MATCH_THREE_COLUMNS + end] === value) end += 1;
      if (value !== null && end - start >= 3) {
        for (let column = start; column < end; column += 1) {
          matches.add(row * MATCH_THREE_COLUMNS + column);
        }
      }
      start = end;
    }
  }
  for (let column = 0; column < MATCH_THREE_COLUMNS; column += 1) {
    let start = 0;
    while (start < MATCH_THREE_ROWS) {
      const value = board[start * MATCH_THREE_COLUMNS + column];
      let end = start + 1;
      while (end < MATCH_THREE_ROWS
        && board[end * MATCH_THREE_COLUMNS + column] === value) end += 1;
      if (value !== null && end - start >= 3) {
        for (let row = start; row < end; row += 1) {
          matches.add(row * MATCH_THREE_COLUMNS + column);
        }
      }
      start = end;
    }
  }
  return [...matches].sort((left, right) => left - right);
}

export function findMatchThreeMatches(board) {
  assertBoard(board);
  return Object.freeze(matchedIndexes(board));
}

function areAdjacent(first, second) {
  const firstRow = Math.floor(first / MATCH_THREE_COLUMNS);
  const firstColumn = first % MATCH_THREE_COLUMNS;
  const secondRow = Math.floor(second / MATCH_THREE_COLUMNS);
  const secondColumn = second % MATCH_THREE_COLUMNS;
  return Math.abs(firstRow - secondRow) + Math.abs(firstColumn - secondColumn) === 1;
}

function validSwapUnchecked(board, from, to) {
  if (!areAdjacent(from, to) || board[from] === board[to]) return false;
  const swapped = [...board];
  [swapped[from], swapped[to]] = [swapped[to], swapped[from]];
  return matchedIndexes(swapped).length > 0;
}

function legalSwapsUnchecked(board) {
  const swaps = [];
  for (let index = 0; index < MATCH_THREE_CELL_COUNT; index += 1) {
    const row = Math.floor(index / MATCH_THREE_COLUMNS);
    const column = index % MATCH_THREE_COLUMNS;
    if (column < MATCH_THREE_COLUMNS - 1 && validSwapUnchecked(board, index, index + 1)) {
      swaps.push({ from: index, to: index + 1 });
    }
    if (row < MATCH_THREE_ROWS - 1 && validSwapUnchecked(board, index, index + MATCH_THREE_COLUMNS)) {
      swaps.push({ from: index, to: index + MATCH_THREE_COLUMNS });
    }
  }
  return swaps;
}

function drawIndex(state, length) {
  const next = nextRandom(state);
  return { state: next.state, index: Math.floor(next.value * length) };
}

function candidateBoard(startState) {
  let state = startState;
  const board = [];
  for (let index = 0; index < MATCH_THREE_CELL_COUNT; index += 1) {
    const row = Math.floor(index / MATCH_THREE_COLUMNS);
    const column = index % MATCH_THREE_COLUMNS;
    let candidates = MATCH_THREE_SYMBOLS.map((_, symbol) => symbol);
    if (column >= 2 && board[index - 1] === board[index - 2]) {
      candidates = candidates.filter((symbol) => symbol !== board[index - 1]);
    }
    if (row >= 2 && board[index - MATCH_THREE_COLUMNS] === board[index - MATCH_THREE_COLUMNS * 2]) {
      candidates = candidates.filter((symbol) => symbol !== board[index - MATCH_THREE_COLUMNS]);
    }
    const draw = drawIndex(state, candidates.length);
    state = draw.state;
    board.push(candidates[draw.index]);
  }
  return { board, state };
}

function createPlayableBoard(startState) {
  let state = startState;
  for (let attempt = 0; attempt < 256; attempt += 1) {
    const generated = candidateBoard(state);
    state = generated.state;
    if (new Set(generated.board).size === MATCH_THREE_SYMBOLS.length
      && legalSwapsUnchecked(generated.board).length > 0) {
      return { board: generated.board, state };
    }
  }
  return { board: [...FALLBACK_BOARD], state };
}

function collapseAndRefill(board, startState) {
  let state = startState;
  const filled = Array(MATCH_THREE_CELL_COUNT).fill(null);
  for (let column = 0; column < MATCH_THREE_COLUMNS; column += 1) {
    let writeRow = MATCH_THREE_ROWS - 1;
    for (let row = MATCH_THREE_ROWS - 1; row >= 0; row -= 1) {
      const value = board[row * MATCH_THREE_COLUMNS + column];
      if (value === null) continue;
      filled[writeRow * MATCH_THREE_COLUMNS + column] = value;
      writeRow -= 1;
    }
    while (writeRow >= 0) {
      const draw = drawIndex(state, MATCH_THREE_SYMBOLS.length);
      state = draw.state;
      filled[writeRow * MATCH_THREE_COLUMNS + column] = draw.index;
      writeRow -= 1;
    }
  }
  return { board: filled, state };
}

function resolveCascades(initialBoard, startState) {
  let board = [...initialBoard];
  let state = startState;
  const cascadeSizes = [];
  let forcedShuffle = false;
  while (cascadeSizes.length < MAX_CASCADES) {
    const matches = matchedIndexes(board);
    if (matches.length === 0) break;
    cascadeSizes.push(matches.length);
    for (const index of matches) board[index] = null;
    const refilled = collapseAndRefill(board, state);
    board = refilled.board;
    state = refilled.state;
  }
  if (matchedIndexes(board).length > 0) {
    const generated = createPlayableBoard(state);
    board = generated.board;
    state = generated.state;
    forcedShuffle = true;
  }
  const clearedCount = cascadeSizes.reduce((total, size) => total + size, 0);
  const scoreGained = cascadeSizes.reduce(
    (total, size, index) => total + size * MATCH_THREE_BASE_SCORE * (index + 1),
    0,
  );
  return {
    board,
    state,
    cascadeSizes,
    clearedCount,
    scoreGained,
    forcedShuffle,
  };
}

function initialGame(seed, moveLimit, targetScore) {
  const generated = createPlayableBoard(seed);
  return {
    schemaVersion: MATCH_THREE_SCHEMA_VERSION,
    kind: 'match-three',
    rows: MATCH_THREE_ROWS,
    columns: MATCH_THREE_COLUMNS,
    symbolCount: MATCH_THREE_SYMBOLS.length,
    seed,
    rngState: generated.state,
    board: generated.board,
    status: 'playing',
    moveLimit,
    targetScore,
    moveCount: 0,
    score: 0,
    totalCleared: 0,
    shuffleCount: 0,
    history: [],
    lastSwap: null,
    lastResolution: null,
  };
}

export function newMatchThreeGame(rawOptions = {}) {
  const options = isObject(rawOptions) ? rawOptions : {};
  return initialGame(
    normalizeSeed(options),
    normalizeMoveLimit(options.moveLimit),
    normalizeTargetScore(options.targetScore),
  );
}

function statusFor(score, moveCount, targetScore, moveLimit) {
  if (score >= targetScore) return 'won';
  if (moveCount >= moveLimit) return 'lost';
  return 'playing';
}

function swapUnchecked(game, from, to) {
  if (game.status !== 'playing' || !validSwapUnchecked(game.board, from, to)) return game;
  if (game.history.length >= MAX_HISTORY_LENGTH) throw new Error('MATCH_THREE_HISTORY_LIMIT');
  const swapped = [...game.board];
  [swapped[from], swapped[to]] = [swapped[to], swapped[from]];
  const resolved = resolveCascades(swapped, game.rngState);
  const moveCount = game.moveCount + 1;
  const score = game.score + resolved.scoreGained;
  const totalCleared = game.totalCleared + resolved.clearedCount;
  if (!Number.isSafeInteger(score) || !Number.isSafeInteger(totalCleared)) {
    throw new Error('MATCH_THREE_COUNTER_INVALID');
  }
  const status = statusFor(score, moveCount, game.targetScore, game.moveLimit);
  let board = resolved.board;
  let rngState = resolved.state;
  let autoShuffled = resolved.forcedShuffle;
  let shuffleCount = game.shuffleCount + Number(resolved.forcedShuffle);
  if (status === 'playing' && legalSwapsUnchecked(board).length === 0) {
    const generated = createPlayableBoard(rngState);
    board = generated.board;
    rngState = generated.state;
    autoShuffled = true;
    shuffleCount += 1;
  }
  const cascadeSizes = [...resolved.cascadeSizes];
  return {
    ...game,
    rngState,
    board,
    status,
    moveCount,
    score,
    totalCleared,
    shuffleCount,
    history: [...game.history.map(cloneAction), { type: 'swap', from, to }],
    lastSwap: { from, to },
    lastResolution: {
      cascadeCount: cascadeSizes.length,
      cascadeSizes,
      clearedCount: resolved.clearedCount,
      scoreGained: resolved.scoreGained,
      autoShuffled,
    },
  };
}

function shuffleUnchecked(game) {
  if (game.status !== 'playing') return game;
  const remainingMoves = game.moveLimit - game.moveCount;
  if (game.history.length + remainingMoves >= MAX_HISTORY_LENGTH) {
    throw new Error('MATCH_THREE_SHUFFLE_LIMIT');
  }
  let generated = createPlayableBoard(game.rngState);
  for (let attempt = 0; attempt < 4 && arraysEqual(generated.board, game.board); attempt += 1) {
    generated = createPlayableBoard(generated.state);
  }
  if (arraysEqual(generated.board, game.board)) {
    generated = {
      ...generated,
      board: game.board.map((symbol) => (symbol + 1) % MATCH_THREE_SYMBOLS.length),
    };
  }
  return {
    ...game,
    rngState: generated.state,
    board: generated.board,
    shuffleCount: game.shuffleCount + 1,
    history: [...game.history.map(cloneAction), { type: 'shuffle' }],
    lastSwap: null,
    lastResolution: null,
  };
}

function validAction(action) {
  if (!isObject(action)) return false;
  if (action.type === 'shuffle') return hasExactKeys(action, SHUFFLE_ACTION_KEYS);
  return action.type === 'swap'
    && hasExactKeys(action, SWAP_ACTION_KEYS)
    && isCanonicalInteger(action.from)
    && action.from >= 0
    && action.from < MATCH_THREE_CELL_COUNT
    && isCanonicalInteger(action.to)
    && action.to >= 0
    && action.to < MATCH_THREE_CELL_COUNT
    && areAdjacent(action.from, action.to);
}

function validLastResolution(resolution) {
  if (!hasExactKeys(resolution, LAST_RESOLUTION_KEYS)
    || !isCanonicalInteger(resolution.cascadeCount)
    || resolution.cascadeCount < 1
    || resolution.cascadeCount > MAX_CASCADES
    || !Array.isArray(resolution.cascadeSizes)
    || resolution.cascadeSizes.length !== resolution.cascadeCount
    || !resolution.cascadeSizes.every((size) => isCanonicalInteger(size)
      && size >= 3 && size <= MATCH_THREE_CELL_COUNT)
    || !isCanonicalInteger(resolution.clearedCount)
    || !isCanonicalInteger(resolution.scoreGained)
    || typeof resolution.autoShuffled !== 'boolean') return false;
  const clearedCount = resolution.cascadeSizes.reduce((total, size) => total + size, 0);
  const scoreGained = resolution.cascadeSizes.reduce(
    (total, size, index) => total + size * MATCH_THREE_BASE_SCORE * (index + 1),
    0,
  );
  return resolution.clearedCount === clearedCount
    && resolution.scoreGained === scoreGained;
}

function validSnapshotShape(game) {
  if (!hasExactKeys(game, GAME_KEYS)
    || game.schemaVersion !== MATCH_THREE_SCHEMA_VERSION
    || game.kind !== 'match-three'
    || game.rows !== MATCH_THREE_ROWS
    || game.columns !== MATCH_THREE_COLUMNS
    || game.symbolCount !== MATCH_THREE_SYMBOLS.length
    || !isUint32(game.seed)
    || !isUint32(game.rngState)
    || !isCompleteBoard(game.board)
    || matchedIndexes(game.board).length > 0
    || !VALID_STATUSES.includes(game.status)
    || !isCanonicalInteger(game.moveLimit)
    || game.moveLimit < 1
    || game.moveLimit > MAX_MOVE_LIMIT
    || !isCanonicalInteger(game.targetScore)
    || game.targetScore < 1
    || game.targetScore > MAX_TARGET_SCORE
    || !isCanonicalInteger(game.moveCount)
    || game.moveCount < 0
    || game.moveCount > game.moveLimit
    || !isCanonicalInteger(game.score)
    || game.score < 0
    || !isCanonicalInteger(game.totalCleared)
    || game.totalCleared < 0
    || !isCanonicalInteger(game.shuffleCount)
    || game.shuffleCount < 0
    || !Array.isArray(game.history)
    || game.history.length > MAX_HISTORY_LENGTH
    || !game.history.every(validAction)) return false;

  const swapCount = game.history.filter((action) => action.type === 'swap').length;
  const manualShuffleCount = game.history.length - swapCount;
  if (swapCount !== game.moveCount
    || game.history.length + (game.moveLimit - game.moveCount) > MAX_HISTORY_LENGTH
    || game.shuffleCount < manualShuffleCount
    || game.shuffleCount > manualShuffleCount + game.moveCount
    || game.status !== statusFor(game.score, game.moveCount, game.targetScore, game.moveLimit)
    || (game.status === 'playing' && legalSwapsUnchecked(game.board).length === 0)) return false;

  if (game.moveCount === 0 && (game.score !== 0 || game.totalCleared !== 0)) return false;
  if (game.moveCount > 0 && (game.totalCleared < game.moveCount * 3
    || game.score < game.totalCleared * MATCH_THREE_BASE_SCORE)) return false;

  const lastAction = game.history.at(-1);
  if (!lastAction || lastAction.type === 'shuffle') {
    return game.lastSwap === null && game.lastResolution === null;
  }
  return hasExactKeys(game.lastSwap, LAST_SWAP_KEYS)
    && game.lastSwap.from === lastAction.from
    && game.lastSwap.to === lastAction.to
    && validLastResolution(game.lastResolution)
    && game.lastResolution.clearedCount <= game.totalCleared
    && game.lastResolution.scoreGained <= game.score;
}

function cloneAction(action) {
  return action.type === 'shuffle'
    ? { type: 'shuffle' }
    : { type: 'swap', from: action.from, to: action.to };
}

function cloneGame(game) {
  return {
    schemaVersion: game.schemaVersion,
    kind: game.kind,
    rows: game.rows,
    columns: game.columns,
    symbolCount: game.symbolCount,
    seed: game.seed,
    rngState: game.rngState,
    board: [...game.board],
    status: game.status,
    moveLimit: game.moveLimit,
    targetScore: game.targetScore,
    moveCount: game.moveCount,
    score: game.score,
    totalCleared: game.totalCleared,
    shuffleCount: game.shuffleCount,
    history: game.history.map(cloneAction),
    lastSwap: game.lastSwap === null
      ? null
      : { from: game.lastSwap.from, to: game.lastSwap.to },
    lastResolution: game.lastResolution === null
      ? null
      : {
        cascadeCount: game.lastResolution.cascadeCount,
        cascadeSizes: [...game.lastResolution.cascadeSizes],
        clearedCount: game.lastResolution.clearedCount,
        scoreGained: game.lastResolution.scoreGained,
        autoShuffled: game.lastResolution.autoShuffled,
      },
  };
}

function snapshotsEqual(left, right) {
  return JSON.stringify(cloneGame(left)) === JSON.stringify(cloneGame(right));
}

function replaySnapshot(snapshot) {
  if (!validSnapshotShape(snapshot)) return null;
  let replayed = initialGame(snapshot.seed, snapshot.moveLimit, snapshot.targetScore);
  try {
    for (const action of snapshot.history) {
      const next = action.type === 'shuffle'
        ? shuffleUnchecked(replayed)
        : swapUnchecked(replayed, action.from, action.to);
      if (next === replayed) return null;
      replayed = next;
    }
  } catch {
    return null;
  }
  return snapshotsEqual(replayed, snapshot) ? replayed : null;
}

function assertMatchThreeGame(game) {
  if (!replaySnapshot(game)) throw new Error('MATCH_THREE_GAME_INVALID');
}

export function getMatchThreeLegalSwaps(game) {
  assertMatchThreeGame(game);
  if (game.status !== 'playing') return Object.freeze([]);
  return Object.freeze(legalSwapsUnchecked(game.board).map((swap) => Object.freeze(swap)));
}

export function isMatchThreeSwapValid(game, from, to) {
  assertMatchThreeGame(game);
  assertPosition(from);
  assertPosition(to);
  return game.status === 'playing' && validSwapUnchecked(game.board, from, to);
}

export function swapMatchThree(game, from, to) {
  assertMatchThreeGame(game);
  assertPosition(from);
  assertPosition(to);
  return swapUnchecked(game, from, to);
}

export function shuffleMatchThreeGame(game) {
  assertMatchThreeGame(game);
  return shuffleUnchecked(game);
}

export function restartMatchThreeGame(game) {
  assertMatchThreeGame(game);
  return initialGame(game.seed, game.moveLimit, game.targetScore);
}

export function serializeMatchThreeGame(game) {
  assertMatchThreeGame(game);
  return JSON.stringify(cloneGame(game));
}

export function restoreMatchThreeGame(value) {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    const replayed = replaySnapshot(parsed);
    return replayed ? cloneGame(replayed) : null;
  } catch {
    return null;
  }
}
