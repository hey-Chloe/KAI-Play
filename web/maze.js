export const MAZE_SCHEMA_VERSION = 1;

export const MAZE_DIFFICULTIES = Object.freeze({
  easy: Object.freeze({ key: 'easy', label: '入门', rows: 7, columns: 7 }),
  standard: Object.freeze({ key: 'standard', label: '标准', rows: 11, columns: 11 }),
  challenge: Object.freeze({ key: 'challenge', label: '挑战', rows: 15, columns: 15 }),
});

export const MAZE_DIRECTIONS = Object.freeze(['up', 'right', 'down', 'left']);

const UINT32_MAX = 0xffff_ffff;
const MAX_MAZE_CELLS = 2_500;
const MAX_RESTORED_STEPS = 100_000;
const MAZE_STATUSES = Object.freeze(['ready', 'playing', 'won']);
const GAME_KEYS = Object.freeze([
  'schemaVersion',
  'kind',
  'difficulty',
  'rows',
  'columns',
  'seed',
  'passages',
  'startIndex',
  'goalIndex',
  'playerIndex',
  'status',
  'stepCount',
  'bestPathLength',
  'history',
  'lastMove',
  'hintVisible',
]);
const LAST_MOVE_KEYS = Object.freeze(['direction', 'from', 'to']);

const DIRECTION_DEFINITIONS = Object.freeze({
  up: Object.freeze({ row: -1, column: 0, bit: 1, opposite: 4 }),
  right: Object.freeze({ row: 0, column: 1, bit: 2, opposite: 8 }),
  down: Object.freeze({ row: 1, column: 0, bit: 4, opposite: 1 }),
  left: Object.freeze({ row: 0, column: -1, bit: 8, opposite: 2 }),
});

function hasExactKeys(value, expected) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return keys.length === wanted.length && keys.every((key, index) => key === wanted[index]);
}

function assertDimensions(rows, columns) {
  if (!Number.isInteger(rows)
    || !Number.isInteger(columns)
    || rows < 2
    || columns < 2
    || rows * columns > MAX_MAZE_CELLS) {
    throw new Error('MAZE_DIMENSIONS_INVALID');
  }
}

function assertIndex(index, rows, columns) {
  assertDimensions(rows, columns);
  if (!Number.isInteger(index) || index < 0 || index >= rows * columns) {
    throw new Error('MAZE_POSITION_INVALID');
  }
}

export function mazePosition(row, column, rows, columns) {
  assertDimensions(rows, columns);
  if (!Number.isInteger(row)
    || !Number.isInteger(column)
    || row < 0
    || row >= rows
    || column < 0
    || column >= columns) {
    throw new Error('MAZE_POSITION_INVALID');
  }
  return row * columns + column;
}

export function mazeCoordinates(index, rows, columns) {
  assertIndex(index, rows, columns);
  return Object.freeze({ row: Math.floor(index / columns), column: index % columns });
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
  throw new Error('MAZE_SEED_INVALID');
}

export function mazeSeededRandom(seed) {
  let state = normalizedSeedValue(seed);
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function randomUnit(random) {
  if (typeof random !== 'function') throw new Error('MAZE_RANDOM_INVALID');
  const value = Number(random());
  if (!Number.isFinite(value) || value < 0 || value >= 1) throw new Error('MAZE_RANDOM_INVALID');
  return value;
}

function normalizedSeed(options, excludedSeed = null) {
  if (Object.hasOwn(options, 'seed')) return normalizedSeedValue(options.seed);
  const random = options.random === undefined ? Math.random : options.random;
  let seed = Math.floor(randomUnit(random) * 0x1_0000_0000) >>> 0;
  if (seed === excludedSeed) seed = (seed + 1) >>> 0;
  return seed;
}

function normalizedDifficulty(value) {
  return Object.hasOwn(MAZE_DIFFICULTIES, value) ? value : 'easy';
}

function neighborEntries(index, rows, columns) {
  const row = Math.floor(index / columns);
  const column = index % columns;
  const entries = [];
  for (const direction of MAZE_DIRECTIONS) {
    const definition = DIRECTION_DEFINITIONS[direction];
    const nextRow = row + definition.row;
    const nextColumn = column + definition.column;
    if (nextRow < 0 || nextRow >= rows || nextColumn < 0 || nextColumn >= columns) continue;
    entries.push({ direction, index: nextRow * columns + nextColumn });
  }
  return entries;
}

function generatePassages(difficulty, seed) {
  const { rows, columns } = MAZE_DIFFICULTIES[difficulty];
  const cellCount = rows * columns;
  const passages = Array(cellCount).fill(0);
  const visited = Array(cellCount).fill(false);
  const stack = [0];
  const random = mazeSeededRandom(`kai-play:maze:v1:${difficulty}:${seed}`);
  visited[0] = true;

  while (stack.length) {
    const current = stack[stack.length - 1];
    const available = neighborEntries(current, rows, columns).filter((entry) => !visited[entry.index]);
    if (!available.length) {
      stack.pop();
      continue;
    }
    const next = available[Math.floor(randomUnit(random) * available.length)];
    const definition = DIRECTION_DEFINITIONS[next.direction];
    passages[current] |= definition.bit;
    passages[next.index] |= definition.opposite;
    visited[next.index] = true;
    stack.push(next.index);
  }
  return passages;
}

function bitCount(value) {
  let count = 0;
  for (let mask = value; mask; mask >>>= 1) count += mask & 1;
  return count;
}

export function isPerfectMaze(passages, rows, columns) {
  try {
    assertDimensions(rows, columns);
  } catch {
    return false;
  }
  const cellCount = rows * columns;
  if (!Array.isArray(passages)
    || passages.length !== cellCount
    || !passages.every((value) => Number.isInteger(value) && value >= 0 && value <= 15)) return false;

  let degreeSum = 0;
  for (let index = 0; index < cellCount; index += 1) {
    const row = Math.floor(index / columns);
    const column = index % columns;
    const value = passages[index];
    degreeSum += bitCount(value);
    for (const direction of MAZE_DIRECTIONS) {
      const definition = DIRECTION_DEFINITIONS[direction];
      if ((value & definition.bit) === 0) continue;
      const nextRow = row + definition.row;
      const nextColumn = column + definition.column;
      if (nextRow < 0 || nextRow >= rows || nextColumn < 0 || nextColumn >= columns) return false;
      const nextIndex = nextRow * columns + nextColumn;
      if ((passages[nextIndex] & definition.opposite) === 0) return false;
    }
  }
  if (degreeSum !== (cellCount - 1) * 2) return false;

  const reached = new Set([0]);
  const queue = [0];
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const index = queue[cursor];
    for (const { direction, index: nextIndex } of neighborEntries(index, rows, columns)) {
      if ((passages[index] & DIRECTION_DEFINITIONS[direction].bit) === 0 || reached.has(nextIndex)) continue;
      reached.add(nextIndex);
      queue.push(nextIndex);
    }
  }
  return reached.size === cellCount;
}

function shortestPath(passages, rows, columns, startIndex, goalIndex) {
  assertIndex(startIndex, rows, columns);
  assertIndex(goalIndex, rows, columns);
  const cellCount = rows * columns;
  const previous = Array(cellCount).fill(-1);
  const queue = [startIndex];
  previous[startIndex] = startIndex;
  for (let cursor = 0; cursor < queue.length && previous[goalIndex] === -1; cursor += 1) {
    const index = queue[cursor];
    for (const { direction, index: nextIndex } of neighborEntries(index, rows, columns)) {
      if ((passages[index] & DIRECTION_DEFINITIONS[direction].bit) === 0 || previous[nextIndex] !== -1) continue;
      previous[nextIndex] = index;
      queue.push(nextIndex);
    }
  }
  if (previous[goalIndex] === -1) return [];
  const path = [];
  for (let index = goalIndex; index !== startIndex; index = previous[index]) path.push(index);
  path.push(startIndex);
  path.reverse();
  return path;
}

function initialGame(difficulty, seed) {
  const { rows, columns } = MAZE_DIFFICULTIES[difficulty];
  const passages = generatePassages(difficulty, seed);
  const startIndex = 0;
  const goalIndex = rows * columns - 1;
  const bestPathLength = shortestPath(passages, rows, columns, startIndex, goalIndex).length - 1;
  return {
    schemaVersion: MAZE_SCHEMA_VERSION,
    kind: 'maze',
    difficulty,
    rows,
    columns,
    seed,
    passages,
    startIndex,
    goalIndex,
    playerIndex: startIndex,
    status: 'ready',
    stepCount: 0,
    bestPathLength,
    history: [],
    lastMove: null,
    hintVisible: false,
  };
}

export function newMazeGame(rawOptions = {}) {
  const options = rawOptions && typeof rawOptions === 'object' && !Array.isArray(rawOptions) ? rawOptions : {};
  const difficulty = normalizedDifficulty(options.difficulty);
  return initialGame(difficulty, normalizedSeed(options));
}

export function mazeDirectionFromKey(key) {
  const directions = {
    ArrowUp: 'up',
    ArrowRight: 'right',
    ArrowDown: 'down',
    ArrowLeft: 'left',
    w: 'up',
    W: 'up',
    d: 'right',
    D: 'right',
    s: 'down',
    S: 'down',
    a: 'left',
    A: 'left',
  };
  return directions[key] ?? (MAZE_DIRECTIONS.includes(key) ? key : null);
}

function moveUnchecked(game, direction) {
  const definition = DIRECTION_DEFINITIONS[direction];
  if (game.status === 'won' || (game.passages[game.playerIndex] & definition.bit) === 0) return game;
  const from = game.playerIndex;
  const { row, column } = mazeCoordinates(from, game.rows, game.columns);
  const to = (row + definition.row) * game.columns + column + definition.column;
  const won = to === game.goalIndex;
  return {
    ...game,
    playerIndex: to,
    status: won ? 'won' : 'playing',
    stepCount: game.stepCount + 1,
    history: [...game.history, direction],
    lastMove: { direction, from, to },
    hintVisible: won ? false : game.hintVisible,
  };
}

export function moveMaze(game, keyOrDirection) {
  assertMazeGame(game);
  const direction = mazeDirectionFromKey(keyOrDirection);
  if (!direction) throw new Error('MAZE_DIRECTION_INVALID');
  if (game.stepCount >= MAX_RESTORED_STEPS) throw new Error('MAZE_STEP_LIMIT');
  return moveUnchecked(game, direction);
}

export function getMazeAvailableDirections(game, index = game?.playerIndex) {
  assertMazeGame(game);
  assertIndex(index, game.rows, game.columns);
  return Object.freeze(MAZE_DIRECTIONS.filter((direction) => (
    (game.passages[index] & DIRECTION_DEFINITIONS[direction].bit) !== 0
  )));
}

function mazeCellUnchecked(game, index) {
  const row = Math.floor(index / game.columns);
  const column = index % game.columns;
  const openings = Object.freeze(Object.fromEntries(MAZE_DIRECTIONS.map((direction) => [
    direction,
    (game.passages[index] & DIRECTION_DEFINITIONS[direction].bit) !== 0,
  ])));
  return Object.freeze({
    index,
    row,
    column,
    openings,
    start: index === game.startIndex,
    goal: index === game.goalIndex,
    player: index === game.playerIndex,
  });
}

export function getMazeCell(game, index) {
  assertMazeGame(game);
  assertIndex(index, game.rows, game.columns);
  return mazeCellUnchecked(game, index);
}

export function getMazeCells(game) {
  assertMazeGame(game);
  return Object.freeze(Array.from(
    { length: game.rows * game.columns },
    (_, index) => mazeCellUnchecked(game, index),
  ));
}

export function toggleMazeHint(game) {
  assertMazeGame(game);
  if (game.status === 'won') return game;
  return { ...game, hintVisible: !game.hintVisible };
}

export function getMazeHintPath(game) {
  assertMazeGame(game);
  if (!game.hintVisible || game.status === 'won') return Object.freeze([]);
  return Object.freeze(shortestPath(
    game.passages,
    game.rows,
    game.columns,
    game.playerIndex,
    game.goalIndex,
  ));
}

export function restartMazeGame(game) {
  assertMazeGame(game);
  return initialGame(game.difficulty, game.seed);
}

export function newMazeForGame(game, rawOptions = {}) {
  assertMazeGame(game);
  const options = rawOptions && typeof rawOptions === 'object' && !Array.isArray(rawOptions) ? rawOptions : {};
  const difficulty = Object.hasOwn(options, 'difficulty')
    ? normalizedDifficulty(options.difficulty)
    : game.difficulty;
  return initialGame(difficulty, normalizedSeed(options, game.seed));
}

function arraysEqual(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function lastMovesEqual(left, right) {
  if (left === null || right === null) return left === right;
  return hasExactKeys(left, LAST_MOVE_KEYS)
    && hasExactKeys(right, LAST_MOVE_KEYS)
    && LAST_MOVE_KEYS.every((key) => left[key] === right[key]);
}

function parsedValue(raw) {
  if (typeof raw !== 'string') return raw;
  if (!raw || raw.length > 10_000_000) return null;
  return JSON.parse(raw);
}

function restoredMazeGame(raw) {
  const value = parsedValue(raw);
  if (!hasExactKeys(value, GAME_KEYS)) return null;
  if (value.schemaVersion !== MAZE_SCHEMA_VERSION || value.kind !== 'maze') return null;
  if (!Object.hasOwn(MAZE_DIFFICULTIES, value.difficulty)) return null;
  const definition = MAZE_DIFFICULTIES[value.difficulty];
  if (value.rows !== definition.rows || value.columns !== definition.columns) return null;
  if (!Number.isSafeInteger(value.seed) || value.seed < 0 || value.seed > UINT32_MAX) return null;
  if (!isPerfectMaze(value.passages, value.rows, value.columns)) return null;
  if (value.startIndex !== 0 || value.goalIndex !== value.rows * value.columns - 1) return null;
  if (!Number.isInteger(value.playerIndex)
    || value.playerIndex < 0
    || value.playerIndex >= value.rows * value.columns
    || !MAZE_STATUSES.includes(value.status)
    || !Number.isSafeInteger(value.stepCount)
    || value.stepCount < 0
    || !Number.isSafeInteger(value.bestPathLength)
    || value.bestPathLength < 1
    || !Array.isArray(value.history)
    || value.history.length !== value.stepCount
    || value.history.length > MAX_RESTORED_STEPS
    || !value.history.every((direction) => MAZE_DIRECTIONS.includes(direction))
    || typeof value.hintVisible !== 'boolean') return null;
  if (value.lastMove !== null && !hasExactKeys(value.lastMove, LAST_MOVE_KEYS)) return null;

  let replayed = initialGame(value.difficulty, value.seed);
  if (!arraysEqual(value.passages, replayed.passages)
    || value.bestPathLength !== replayed.bestPathLength) return null;
  for (const direction of value.history) {
    const next = moveUnchecked(replayed, direction);
    if (next === replayed) return null;
    replayed = next;
  }
  if (value.playerIndex !== replayed.playerIndex
    || value.status !== replayed.status
    || value.stepCount !== replayed.stepCount
    || !lastMovesEqual(value.lastMove, replayed.lastMove)
    || (value.status === 'won' && value.hintVisible)) return null;

  return {
    ...replayed,
    passages: [...replayed.passages],
    history: [...replayed.history],
    lastMove: replayed.lastMove ? { ...replayed.lastMove } : null,
    hintVisible: value.hintVisible,
  };
}

export function restoreMazeGame(raw) {
  try {
    return restoredMazeGame(raw);
  } catch {
    return null;
  }
}

function assertMazeGame(game) {
  if (!game || typeof game !== 'object' || Array.isArray(game) || !restoredMazeGame(game)) {
    throw new Error('MAZE_GAME_INVALID');
  }
}

export function serializeMazeGame(game) {
  const restored = restoreMazeGame(game);
  if (!restored) throw new Error('MAZE_GAME_INVALID');
  return JSON.stringify(restored);
}
