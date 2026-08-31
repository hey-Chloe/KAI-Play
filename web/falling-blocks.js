export const FALLING_BLOCKS_ROWS = 20;
export const FALLING_BLOCKS_COLUMNS = 10;
export const FALLING_BLOCKS_CELL_COUNT = FALLING_BLOCKS_ROWS * FALLING_BLOCKS_COLUMNS;
export const FALLING_BLOCKS_SCHEMA_VERSION = 1;
export const FALLING_BLOCKS_STORAGE_KEY = 'kai-play:falling-blocks:v1';
export const FALLING_BLOCK_TYPES = Object.freeze(['I', 'J', 'L', 'O', 'S', 'T', 'Z']);
export const FALLING_BLOCK_LINE_SCORES = Object.freeze([0, 100, 300, 500, 800]);

const UINT32_MAX = 0xffff_ffff;
const MAX_HISTORY_ENTRIES = 100_000;
const MAX_RESTORED_TICKS = 200_000;
const MAX_STEP_BATCH = 10_000;
const GAME_KEYS = Object.freeze([
  'schemaVersion', 'kind', 'rows', 'columns', 'seed', 'rngState', 'board', 'queue',
  'active', 'status', 'score', 'level', 'lines', 'pieces', 'ticks', 'lastAction',
  'lastClear', 'lastDropDistance', 'history',
]);
const ACTIVE_KEYS = Object.freeze(['type', 'rotation', 'row', 'column']);
const ACTION_KEYS = Object.freeze({
  move: Object.freeze(['kind', 'direction']),
  rotate: Object.freeze(['kind', 'direction']),
  'soft-drop': Object.freeze(['kind']),
  tick: Object.freeze(['kind', 'steps']),
  'hard-drop': Object.freeze(['kind']),
  pause: Object.freeze(['kind']),
});
const VALID_STATUSES = Object.freeze(['playing', 'paused', 'over']);
const VALID_LAST_ACTIONS = Object.freeze([
  'spawn', 'move', 'rotate', 'soft-drop', 'tick', 'hard-drop', 'pause', 'resume', 'game-over',
]);

function frozenRotations(rotations) {
  return Object.freeze(rotations.map((rotation) => Object.freeze(
    rotation.map((cell) => Object.freeze(cell)),
  )));
}

export const FALLING_BLOCK_SHAPES = Object.freeze({
  I: frozenRotations([
    [[0, 0], [0, 1], [0, 2], [0, 3]],
    [[0, 2], [1, 2], [2, 2], [3, 2]],
    [[2, 0], [2, 1], [2, 2], [2, 3]],
    [[0, 1], [1, 1], [2, 1], [3, 1]],
  ]),
  J: frozenRotations([
    [[0, 0], [1, 0], [1, 1], [1, 2]],
    [[0, 1], [0, 2], [1, 1], [2, 1]],
    [[1, 0], [1, 1], [1, 2], [2, 2]],
    [[0, 1], [1, 1], [2, 0], [2, 1]],
  ]),
  L: frozenRotations([
    [[0, 2], [1, 0], [1, 1], [1, 2]],
    [[0, 1], [1, 1], [2, 1], [2, 2]],
    [[1, 0], [1, 1], [1, 2], [2, 0]],
    [[0, 0], [0, 1], [1, 1], [2, 1]],
  ]),
  O: frozenRotations([
    [[0, 1], [0, 2], [1, 1], [1, 2]],
    [[0, 1], [0, 2], [1, 1], [1, 2]],
    [[0, 1], [0, 2], [1, 1], [1, 2]],
    [[0, 1], [0, 2], [1, 1], [1, 2]],
  ]),
  S: frozenRotations([
    [[0, 1], [0, 2], [1, 0], [1, 1]],
    [[0, 1], [1, 1], [1, 2], [2, 2]],
    [[1, 1], [1, 2], [2, 0], [2, 1]],
    [[0, 0], [1, 0], [1, 1], [2, 1]],
  ]),
  T: frozenRotations([
    [[0, 1], [1, 0], [1, 1], [1, 2]],
    [[0, 1], [1, 1], [1, 2], [2, 1]],
    [[1, 0], [1, 1], [1, 2], [2, 1]],
    [[0, 1], [1, 0], [1, 1], [2, 1]],
  ]),
  Z: frozenRotations([
    [[0, 0], [0, 1], [1, 1], [1, 2]],
    [[0, 2], [1, 1], [1, 2], [2, 1]],
    [[1, 0], [1, 1], [2, 1], [2, 2]],
    [[0, 1], [1, 0], [1, 1], [2, 0]],
  ]),
});

// These offsets cover ordinary side-wall adjustment and the common floor kick.
// The original position is always attempted first, keeping rotation deterministic.
const WALL_KICKS = Object.freeze([
  Object.freeze([0, 0]),
  Object.freeze([0, -1]),
  Object.freeze([0, 1]),
  Object.freeze([0, -2]),
  Object.freeze([0, 2]),
  Object.freeze([-1, 0]),
  Object.freeze([-1, -1]),
  Object.freeze([-1, 1]),
  Object.freeze([-2, 0]),
  Object.freeze([1, 0]),
]);

function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function exactKeys(value, keys) {
  if (!isObject(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function arraysEqual(left, right) {
  return Array.isArray(left)
    && Array.isArray(right)
    && left.length === right.length
    && left.every((value, index) => value === right[index]);
}

function isBlockType(value) {
  return FALLING_BLOCK_TYPES.includes(value);
}

function validBoard(board) {
  return Array.isArray(board)
    && board.length === FALLING_BLOCKS_CELL_COUNT
    && board.every((cell) => cell === null || isBlockType(cell));
}

function assertBoard(board) {
  if (!validBoard(board)) throw new Error('FALLING_BLOCKS_BOARD_INVALID');
}

export function fallingBlocksPosition(row, column) {
  if (!Number.isInteger(row) || row < 0 || row >= FALLING_BLOCKS_ROWS
    || !Number.isInteger(column) || column < 0 || column >= FALLING_BLOCKS_COLUMNS) {
    throw new Error('FALLING_BLOCKS_POSITION_INVALID');
  }
  return row * FALLING_BLOCKS_COLUMNS + column;
}

export function fallingBlocksCoordinates(index) {
  if (!Number.isInteger(index) || index < 0 || index >= FALLING_BLOCKS_CELL_COUNT) {
    throw new Error('FALLING_BLOCKS_POSITION_INVALID');
  }
  return { row: Math.floor(index / FALLING_BLOCKS_COLUMNS), column: index % FALLING_BLOCKS_COLUMNS };
}

export function createFallingBlocksBoard() {
  return Array(FALLING_BLOCKS_CELL_COUNT).fill(null);
}

function seedFromText(text) {
  let hash = 2_166_136_261;
  for (const character of String(text)) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

function normalizedSeedValue(seed) {
  if (typeof seed === 'string' && seed.length > 0 && seed.length <= 512) return seedFromText(seed);
  if (Number.isSafeInteger(seed) && seed >= 0 && seed <= UINT32_MAX) return seed >>> 0;
  throw new Error('FALLING_BLOCKS_SEED_INVALID');
}

function randomUnit(random) {
  if (typeof random !== 'function') throw new Error('FALLING_BLOCKS_RANDOM_INVALID');
  const value = Number(random());
  if (!Number.isFinite(value) || value < 0 || value >= 1) throw new Error('FALLING_BLOCKS_RANDOM_INVALID');
  return value;
}

function normalizedSeed(options) {
  if (Object.hasOwn(options, 'seed')) return normalizedSeedValue(options.seed);
  const random = options.random === undefined ? Math.random : options.random;
  return Math.floor(randomUnit(random) * 0x1_0000_0000) >>> 0;
}

function nextRandomState(state) {
  return (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
}

export function fallingBlocksSeededRandom(seed) {
  let state = normalizedSeedValue(seed);
  return () => {
    state = nextRandomState(state);
    return state / 0x1_0000_0000;
  };
}

function shuffledBag(rngState) {
  const bag = [...FALLING_BLOCK_TYPES];
  let state = rngState;
  for (let index = bag.length - 1; index > 0; index -= 1) {
    state = nextRandomState(state);
    const target = Math.floor((state / 0x1_0000_0000) * (index + 1));
    [bag[index], bag[target]] = [bag[target], bag[index]];
  }
  return { bag, rngState: state };
}

function ensureQueue(queue, rngState, minimum = FALLING_BLOCK_TYPES.length) {
  const nextQueue = [...queue];
  let nextState = rngState;
  while (nextQueue.length < minimum) {
    const shuffled = shuffledBag(nextState);
    nextQueue.push(...shuffled.bag);
    nextState = shuffled.rngState;
  }
  return { queue: nextQueue, rngState: nextState };
}

function validPiece(piece) {
  return exactKeys(piece, ACTIVE_KEYS)
    && isBlockType(piece.type)
    && Number.isInteger(piece.rotation)
    && piece.rotation >= 0
    && piece.rotation < 4
    && Number.isInteger(piece.row)
    && Number.isInteger(piece.column);
}

export function getFallingBlocksPieceCells(piece) {
  if (!validPiece(piece)) throw new Error('FALLING_BLOCKS_PIECE_INVALID');
  return FALLING_BLOCK_SHAPES[piece.type][piece.rotation].map(([row, column]) => ({
    row: piece.row + row,
    column: piece.column + column,
  }));
}

function canPlace(board, piece) {
  return getFallingBlocksPieceCells(piece).every(({ row, column }) => (
    row >= 0
    && row < FALLING_BLOCKS_ROWS
    && column >= 0
    && column < FALLING_BLOCKS_COLUMNS
    && board[row * FALLING_BLOCKS_COLUMNS + column] === null
  ));
}

function spawnNextPiece(game) {
  let queueState = ensureQueue(game.queue, game.rngState, 1);
  const [type, ...remaining] = queueState.queue;
  queueState = ensureQueue(remaining, queueState.rngState);
  const active = { type, rotation: 0, row: 0, column: 3 };
  if (!canPlace(game.board, active)) {
    return {
      ...game,
      queue: queueState.queue,
      rngState: queueState.rngState,
      active: null,
      status: 'over',
      lastAction: 'game-over',
    };
  }
  return {
    ...game,
    queue: queueState.queue,
    rngState: queueState.rngState,
    active,
    status: 'playing',
  };
}

function baseGame(seed) {
  const empty = {
    schemaVersion: FALLING_BLOCKS_SCHEMA_VERSION,
    kind: 'falling-blocks',
    rows: FALLING_BLOCKS_ROWS,
    columns: FALLING_BLOCKS_COLUMNS,
    seed,
    rngState: seed,
    board: createFallingBlocksBoard(),
    queue: [],
    active: null,
    status: 'playing',
    score: 0,
    level: 1,
    lines: 0,
    pieces: 0,
    ticks: 0,
    lastAction: 'spawn',
    lastClear: 0,
    lastDropDistance: 0,
    history: [],
  };
  return spawnNextPiece(empty);
}

export function newFallingBlocksGame(rawOptions = {}) {
  const options = isObject(rawOptions) ? rawOptions : {};
  return baseGame(normalizedSeed(options));
}

export function getFallingBlocksActiveIndexes(game) {
  const restored = assertGame(game);
  if (!restored.active) return Object.freeze([]);
  return Object.freeze(getFallingBlocksPieceCells(restored.active).map(({ row, column }) => (
    fallingBlocksPosition(row, column)
  )));
}

export function getFallingBlocksNextPieces(game, count = 5) {
  const restored = assertGame(game);
  if (!Number.isSafeInteger(count) || count < 0 || count > 14) throw new Error('FALLING_BLOCKS_NEXT_COUNT_INVALID');
  return Object.freeze(restored.queue.slice(0, count));
}

function dropDistance(board, active) {
  let distance = 0;
  while (canPlace(board, { ...active, row: active.row + distance + 1 })) distance += 1;
  return distance;
}

export function getFallingBlocksGhost(game) {
  const restored = assertGame(game);
  if (!restored.active) return null;
  const distance = dropDistance(restored.board, restored.active);
  const piece = { ...restored.active, row: restored.active.row + distance };
  return Object.freeze({
    row: piece.row,
    distance,
    indexes: Object.freeze(getFallingBlocksPieceCells(piece).map(({ row, column }) => (
      fallingBlocksPosition(row, column)
    ))),
  });
}

export function getFallingBlocksDropInterval(gameOrLevel) {
  const level = typeof gameOrLevel === 'number' ? gameOrLevel : gameOrLevel?.level;
  if (!Number.isSafeInteger(level) || level < 1) throw new Error('FALLING_BLOCKS_LEVEL_INVALID');
  return Math.max(80, 1_000 - (level - 1) * 75);
}

export function clearFallingBlocksLines(board) {
  assertBoard(board);
  const keptRows = [];
  const clearedRows = [];
  for (let row = 0; row < FALLING_BLOCKS_ROWS; row += 1) {
    const cells = board.slice(row * FALLING_BLOCKS_COLUMNS, (row + 1) * FALLING_BLOCKS_COLUMNS);
    if (cells.every(Boolean)) clearedRows.push(row);
    else keptRows.push(cells);
  }
  const emptyRows = Array.from({ length: clearedRows.length }, () => Array(FALLING_BLOCKS_COLUMNS).fill(null));
  return {
    board: [...emptyRows, ...keptRows].flat(),
    cleared: clearedRows.length,
    rows: clearedRows,
  };
}

function lockActive(game, dropRows, pointsPerDropRow, action) {
  const board = [...game.board];
  for (const { row, column } of getFallingBlocksPieceCells(game.active)) {
    board[row * FALLING_BLOCKS_COLUMNS + column] = game.active.type;
  }
  const cleared = clearFallingBlocksLines(board);
  const lines = game.lines + cleared.cleared;
  const lineScore = FALLING_BLOCK_LINE_SCORES[cleared.cleared] * game.level;
  const score = game.score + dropRows * pointsPerDropRow + lineScore;
  const level = Math.floor(lines / 10) + 1;
  return spawnNextPiece({
    ...game,
    board: cleared.board,
    active: null,
    score,
    level,
    lines,
    pieces: game.pieces + 1,
    lastAction: action,
    lastClear: cleared.cleared,
    lastDropDistance: dropRows,
  });
}

function moveUnchecked(game, direction) {
  if (game.status !== 'playing' || !game.active) return game;
  const columnOffset = direction === 'left' ? -1 : 1;
  const active = { ...game.active, column: game.active.column + columnOffset };
  if (!canPlace(game.board, active)) return game;
  return { ...game, active, lastAction: 'move', lastClear: 0, lastDropDistance: 0 };
}

function rotateUnchecked(game, direction) {
  if (game.status !== 'playing' || !game.active || game.active.type === 'O') return game;
  const rotationOffset = direction === 'clockwise' ? 1 : -1;
  const rotation = (game.active.rotation + rotationOffset + 4) % 4;
  for (const [rowOffset, columnOffset] of WALL_KICKS) {
    const active = {
      ...game.active,
      rotation,
      row: game.active.row + rowOffset,
      column: game.active.column + columnOffset,
    };
    if (canPlace(game.board, active)) {
      return { ...game, active, lastAction: 'rotate', lastClear: 0, lastDropDistance: 0 };
    }
  }
  return game;
}

function softDropUnchecked(game) {
  if (game.status !== 'playing' || !game.active) return game;
  const active = { ...game.active, row: game.active.row + 1 };
  if (canPlace(game.board, active)) {
    return {
      ...game,
      active,
      score: game.score + 1,
      lastAction: 'soft-drop',
      lastClear: 0,
      lastDropDistance: 1,
    };
  }
  return lockActive(game, 0, 0, 'soft-drop');
}

function tickUnchecked(game, steps) {
  if (game.status !== 'playing' || !game.active || steps === 0) return game;
  let next = game;
  for (let step = 0; step < steps && next.status === 'playing'; step += 1) {
    const active = { ...next.active, row: next.active.row + 1 };
    if (canPlace(next.board, active)) {
      next = {
        ...next,
        active,
        ticks: next.ticks + 1,
        lastAction: 'tick',
        lastClear: 0,
        lastDropDistance: 1,
      };
    } else {
      next = lockActive({ ...next, ticks: next.ticks + 1 }, 0, 0, 'tick');
    }
  }
  return next;
}

function hardDropUnchecked(game) {
  if (game.status !== 'playing' || !game.active) return game;
  const distance = dropDistance(game.board, game.active);
  const dropped = distance ? { ...game, active: { ...game.active, row: game.active.row + distance } } : game;
  return lockActive(dropped, distance, 2, 'hard-drop');
}

function pauseUnchecked(game) {
  if (game.status === 'over') return game;
  return {
    ...game,
    status: game.status === 'paused' ? 'playing' : 'paused',
    lastAction: game.status === 'paused' ? 'resume' : 'pause',
    lastClear: 0,
    lastDropDistance: 0,
  };
}

function cloneAction(action) {
  return { ...action };
}

function actionIsValid(action) {
  if (!isObject(action) || !Object.hasOwn(ACTION_KEYS, action.kind) || !exactKeys(action, ACTION_KEYS[action.kind])) return false;
  if (action.kind === 'move') return action.direction === 'left' || action.direction === 'right';
  if (action.kind === 'rotate') return action.direction === 'clockwise' || action.direction === 'counterclockwise';
  if (action.kind === 'tick') return Number.isSafeInteger(action.steps) && action.steps > 0 && action.steps <= MAX_STEP_BATCH;
  return true;
}

function applyActionUnchecked(game, action) {
  if (action.kind === 'move') return moveUnchecked(game, action.direction);
  if (action.kind === 'rotate') return rotateUnchecked(game, action.direction);
  if (action.kind === 'soft-drop') return softDropUnchecked(game);
  if (action.kind === 'tick') return tickUnchecked(game, action.steps);
  if (action.kind === 'hard-drop') return hardDropUnchecked(game);
  return pauseUnchecked(game);
}

function activeEqual(left, right) {
  if (left === null || right === null) return left === right;
  return validPiece(left)
    && validPiece(right)
    && ACTIVE_KEYS.every((key) => left[key] === right[key]);
}

function parsedValue(raw) {
  if (typeof raw !== 'string') return raw;
  if (!raw || raw.length > 10_000_000) return null;
  return JSON.parse(raw);
}

function restoredGame(raw) {
  const value = parsedValue(raw);
  if (!exactKeys(value, GAME_KEYS)
    || value.schemaVersion !== FALLING_BLOCKS_SCHEMA_VERSION
    || value.kind !== 'falling-blocks'
    || value.rows !== FALLING_BLOCKS_ROWS
    || value.columns !== FALLING_BLOCKS_COLUMNS
    || !Number.isSafeInteger(value.seed)
    || value.seed < 0
    || value.seed > UINT32_MAX
    || !Number.isSafeInteger(value.rngState)
    || value.rngState < 0
    || value.rngState > UINT32_MAX
    || !validBoard(value.board)
    || !Array.isArray(value.queue)
    || value.queue.length < FALLING_BLOCK_TYPES.length
    || value.queue.length > FALLING_BLOCK_TYPES.length * 2
    || !value.queue.every(isBlockType)
    || (value.active !== null && !validPiece(value.active))
    || !VALID_STATUSES.includes(value.status)
    || !Number.isSafeInteger(value.score)
    || value.score < 0
    || !Number.isSafeInteger(value.level)
    || value.level < 1
    || !Number.isSafeInteger(value.lines)
    || value.lines < 0
    || !Number.isSafeInteger(value.pieces)
    || value.pieces < 0
    || !Number.isSafeInteger(value.ticks)
    || value.ticks < 0
    || !VALID_LAST_ACTIONS.includes(value.lastAction)
    || !Number.isSafeInteger(value.lastClear)
    || value.lastClear < 0
    || value.lastClear > 4
    || !Number.isSafeInteger(value.lastDropDistance)
    || value.lastDropDistance < 0
    || value.lastDropDistance > FALLING_BLOCKS_ROWS
    || !Array.isArray(value.history)
    || value.history.length > MAX_HISTORY_ENTRIES) return null;

  let replayed = baseGame(value.seed);
  for (const action of value.history) {
    if (!actionIsValid(action)) return null;
    const next = applyActionUnchecked(replayed, action);
    if (next === replayed) return null;
    replayed = next;
    if (replayed.ticks > MAX_RESTORED_TICKS) return null;
  }

  if (value.rngState !== replayed.rngState
    || !arraysEqual(value.board, replayed.board)
    || !arraysEqual(value.queue, replayed.queue)
    || !activeEqual(value.active, replayed.active)
    || value.status !== replayed.status
    || value.score !== replayed.score
    || value.level !== replayed.level
    || value.lines !== replayed.lines
    || value.pieces !== replayed.pieces
    || value.ticks !== replayed.ticks
    || value.lastAction !== replayed.lastAction
    || value.lastClear !== replayed.lastClear
    || value.lastDropDistance !== replayed.lastDropDistance) return null;
  return { ...replayed, history: value.history.map(cloneAction) };
}

export function restoreFallingBlocksGame(raw) {
  try {
    return restoredGame(raw);
  } catch {
    return null;
  }
}

function assertGame(game) {
  const restored = restoreFallingBlocksGame(game);
  if (!restored) throw new Error('FALLING_BLOCKS_GAME_INVALID');
  return restored;
}

function performAction(game, action) {
  const restored = assertGame(game);
  const next = applyActionUnchecked(restored, action);
  if (next === restored) return game;
  if (restored.history.length >= MAX_HISTORY_ENTRIES || next.ticks > MAX_RESTORED_TICKS) {
    throw new Error('FALLING_BLOCKS_HISTORY_LIMIT');
  }
  return { ...next, history: [...restored.history, cloneAction(action)] };
}

export function moveFallingBlocks(game, direction) {
  if (direction !== 'left' && direction !== 'right') throw new Error('FALLING_BLOCKS_DIRECTION_INVALID');
  return performAction(game, { kind: 'move', direction });
}

export function rotateFallingBlocks(game, direction = 'clockwise') {
  if (direction !== 'clockwise' && direction !== 'counterclockwise') {
    throw new Error('FALLING_BLOCKS_ROTATION_INVALID');
  }
  return performAction(game, { kind: 'rotate', direction });
}

export function softDropFallingBlocks(game) {
  return performAction(game, { kind: 'soft-drop' });
}

export function advanceFallingBlocks(game, steps = 1) {
  if (!Number.isSafeInteger(steps) || steps < 0 || steps > MAX_STEP_BATCH) {
    throw new Error('FALLING_BLOCKS_STEPS_INVALID');
  }
  if (steps === 0) {
    assertGame(game);
    return game;
  }
  return performAction(game, { kind: 'tick', steps });
}

export function hardDropFallingBlocks(game) {
  return performAction(game, { kind: 'hard-drop' });
}

export function toggleFallingBlocksPause(game) {
  return performAction(game, { kind: 'pause' });
}

export function restartFallingBlocksGame(game, rawOptions = {}) {
  const restored = assertGame(game);
  const options = isObject(rawOptions) ? rawOptions : {};
  if (Object.hasOwn(options, 'seed') || Object.hasOwn(options, 'random')) return newFallingBlocksGame(options);
  return newFallingBlocksGame({ seed: (restored.seed + 1) >>> 0 });
}

export function serializeFallingBlocksGame(game) {
  const restored = restoreFallingBlocksGame(game);
  if (!restored) throw new Error('FALLING_BLOCKS_GAME_INVALID');
  return JSON.stringify(restored);
}

export function saveFallingBlocksGame(game, storage, key = FALLING_BLOCKS_STORAGE_KEY) {
  try {
    const target = storage === undefined ? globalThis.localStorage : storage;
    if (!target || typeof target.setItem !== 'function' || typeof key !== 'string' || !key) return false;
    target.setItem(key, serializeFallingBlocksGame(game));
    return true;
  } catch {
    return false;
  }
}

export function loadFallingBlocksGame(storage, key = FALLING_BLOCKS_STORAGE_KEY) {
  try {
    const target = storage === undefined ? globalThis.localStorage : storage;
    if (!target || typeof target.getItem !== 'function' || typeof key !== 'string' || !key) return null;
    const raw = target.getItem(key);
    return raw === null ? null : restoreFallingBlocksGame(raw);
  } catch {
    return null;
  }
}
