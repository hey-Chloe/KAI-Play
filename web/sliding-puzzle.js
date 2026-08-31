export const SLIDING_PUZZLE_SCHEMA_VERSION = 1;

export const SLIDING_PUZZLE_DIFFICULTIES = Object.freeze({
  easy: Object.freeze({ key: 'easy', label: '入门', size: 3 }),
  standard: Object.freeze({ key: 'standard', label: '标准', size: 4 }),
  challenge: Object.freeze({ key: 'challenge', label: '挑战', size: 5 }),
});

export const SLIDING_PUZZLE_DIRECTIONS = Object.freeze(['up', 'down', 'left', 'right']);

const SLIDING_PUZZLE_STATUSES = Object.freeze(['ready', 'playing', 'won']);
const SLIDING_PUZZLE_LAST_ACTIONS = Object.freeze(['shuffle', 'move', 'won']);
const UINT32_MAX = 0xffff_ffff;
const MAX_RESTORED_MOVES = 100_000;
const GAME_KEYS = Object.freeze([
  'schemaVersion',
  'kind',
  'difficulty',
  'size',
  'seed',
  'tiles',
  'blankIndex',
  'status',
  'moveCount',
  'elapsedSeconds',
  'history',
  'lastMove',
  'lastAction',
]);
const LAST_MOVE_KEYS = Object.freeze(['tile', 'from', 'to', 'direction']);

function hasExactKeys(value, expected) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return keys.length === wanted.length && keys.every((key, index) => key === wanted[index]);
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
  throw new Error('SLIDING_PUZZLE_SEED_INVALID');
}

export function slidingPuzzleSeededRandom(seed) {
  let state = normalizedSeedValue(seed);
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function randomUnit(random) {
  if (typeof random !== 'function') throw new Error('SLIDING_PUZZLE_RANDOM_INVALID');
  const value = Number(random());
  if (!Number.isFinite(value) || value < 0 || value >= 1) {
    throw new Error('SLIDING_PUZZLE_RANDOM_INVALID');
  }
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
  return Object.hasOwn(SLIDING_PUZZLE_DIFFICULTIES, value) ? value : 'easy';
}

function shuffled(items, random) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(randomUnit(random) * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

function hasTilePermutation(tiles, size) {
  if (!Number.isInteger(size) || size < 2 || size > 20 || !Array.isArray(tiles) || tiles.length !== size ** 2) {
    return false;
  }
  const expected = size ** 2;
  const seen = new Set();
  for (const tile of tiles) {
    if (!Number.isInteger(tile) || tile < 0 || tile >= expected || seen.has(tile)) return false;
    seen.add(tile);
  }
  return seen.size === expected;
}

function inversionCount(tiles) {
  const numbered = tiles.filter((tile) => tile !== 0);
  let inversions = 0;
  for (let left = 0; left < numbered.length; left += 1) {
    for (let right = left + 1; right < numbered.length; right += 1) {
      if (numbered[left] > numbered[right]) inversions += 1;
    }
  }
  return inversions;
}

export function isSlidingPuzzleSolvable(tiles, size) {
  if (!hasTilePermutation(tiles, size)) return false;
  const inversions = inversionCount(tiles);
  if (size % 2 === 1) return inversions % 2 === 0;
  const blankRowFromBottom = size - Math.floor(tiles.indexOf(0) / size);
  return (inversions + blankRowFromBottom) % 2 === 1;
}

export function isSlidingPuzzleSolved(tiles) {
  return Array.isArray(tiles)
    && tiles.length > 1
    && tiles.every((tile, index) => tile === (index + 1) % tiles.length);
}

function generatedTiles(difficulty, seed) {
  const { size } = SLIDING_PUZZLE_DIFFICULTIES[difficulty];
  const count = size ** 2;
  const ordered = Array.from({ length: count }, (_, index) => (index + 1) % count);
  const random = slidingPuzzleSeededRandom(`kai-play:sliding-puzzle:v1:${difficulty}:${seed}`);
  const tiles = shuffled(ordered, random);

  if (!isSlidingPuzzleSolvable(tiles, size)) {
    const numbered = tiles.flatMap((tile, index) => tile === 0 ? [] : [index]);
    [tiles[numbered[0]], tiles[numbered[1]]] = [tiles[numbered[1]], tiles[numbered[0]]];
  }
  if (isSlidingPuzzleSolved(tiles)) {
    const blankIndex = tiles.indexOf(0);
    const neighbor = blankIndex % size > 0 ? blankIndex - 1 : blankIndex - size;
    [tiles[blankIndex], tiles[neighbor]] = [tiles[neighbor], tiles[blankIndex]];
  }
  return tiles;
}

function initialGame(difficulty, seed) {
  const size = SLIDING_PUZZLE_DIFFICULTIES[difficulty].size;
  const tiles = generatedTiles(difficulty, seed);
  return {
    schemaVersion: SLIDING_PUZZLE_SCHEMA_VERSION,
    kind: 'sliding-puzzle',
    difficulty,
    size,
    seed,
    tiles,
    blankIndex: tiles.indexOf(0),
    status: 'ready',
    moveCount: 0,
    elapsedSeconds: 0,
    history: [],
    lastMove: null,
    lastAction: 'shuffle',
  };
}

export function newSlidingPuzzleGame(rawOptions = {}) {
  const options = rawOptions && typeof rawOptions === 'object' && !Array.isArray(rawOptions) ? rawOptions : {};
  const difficulty = normalizedDifficulty(options.difficulty);
  return initialGame(difficulty, normalizedSeed(options));
}

function adjacentIndexes(index, size) {
  const row = Math.floor(index / size);
  const column = index % size;
  const indexes = [];
  if (row > 0) indexes.push(index - size);
  if (row < size - 1) indexes.push(index + size);
  if (column > 0) indexes.push(index - 1);
  if (column < size - 1) indexes.push(index + 1);
  return indexes;
}

export function getSlidingPuzzleMovableIndexes(game) {
  assertSlidingPuzzleGame(game);
  if (game.status === 'won') return Object.freeze([]);
  return Object.freeze(adjacentIndexes(game.blankIndex, game.size));
}

function tileDirection(from, to, size) {
  if (to === from - size) return 'up';
  if (to === from + size) return 'down';
  if (to === from - 1) return 'left';
  if (to === from + 1) return 'right';
  return null;
}

function moveTileUnchecked(game, index) {
  if (game.status === 'won' || !adjacentIndexes(game.blankIndex, game.size).includes(index)) return game;
  const tile = game.tiles[index];
  const to = game.blankIndex;
  const tiles = [...game.tiles];
  tiles[to] = tile;
  tiles[index] = 0;
  const lastMove = { tile, from: index, to, direction: tileDirection(index, to, game.size) };
  const won = isSlidingPuzzleSolved(tiles);
  return {
    ...game,
    tiles,
    blankIndex: index,
    status: won ? 'won' : 'playing',
    moveCount: game.moveCount + 1,
    history: [...game.history, index],
    lastMove,
    lastAction: won ? 'won' : 'move',
  };
}

export function moveSlidingPuzzleTile(game, index) {
  assertSlidingPuzzleGame(game);
  if (!Number.isInteger(index) || index < 0 || index >= game.tiles.length) {
    throw new Error('SLIDING_PUZZLE_POSITION_INVALID');
  }
  return moveTileUnchecked(game, index);
}

function normalizedDirection(direction) {
  const aliases = {
    ArrowUp: 'up',
    ArrowDown: 'down',
    ArrowLeft: 'left',
    ArrowRight: 'right',
  };
  return aliases[direction] ?? direction;
}

// Direction names describe the numbered tile's travel into the empty cell.
export function moveSlidingPuzzleDirection(game, rawDirection) {
  assertSlidingPuzzleGame(game);
  const direction = normalizedDirection(rawDirection);
  if (!SLIDING_PUZZLE_DIRECTIONS.includes(direction)) {
    throw new Error('SLIDING_PUZZLE_DIRECTION_INVALID');
  }
  const blank = game.blankIndex;
  const row = Math.floor(blank / game.size);
  const column = blank % game.size;
  let index = null;
  if (direction === 'up' && row < game.size - 1) index = blank + game.size;
  if (direction === 'down' && row > 0) index = blank - game.size;
  if (direction === 'left' && column < game.size - 1) index = blank + 1;
  if (direction === 'right' && column > 0) index = blank - 1;
  return index === null ? game : moveTileUnchecked(game, index);
}

export function advanceSlidingPuzzleTime(game, seconds = 1) {
  assertSlidingPuzzleGame(game);
  if (!Number.isSafeInteger(seconds) || seconds < 0) throw new Error('SLIDING_PUZZLE_TIME_INVALID');
  if (seconds === 0 || game.status !== 'playing') return game;
  const elapsedSeconds = game.elapsedSeconds + seconds;
  if (!Number.isSafeInteger(elapsedSeconds)) throw new Error('SLIDING_PUZZLE_TIME_INVALID');
  return { ...game, elapsedSeconds };
}

export function reshuffleSlidingPuzzleGame(game, rawOptions = {}) {
  assertSlidingPuzzleGame(game);
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

function restoredSlidingPuzzleGame(raw) {
  const value = parsedValue(raw);
  if (!hasExactKeys(value, GAME_KEYS)) return null;
  if (value.schemaVersion !== SLIDING_PUZZLE_SCHEMA_VERSION || value.kind !== 'sliding-puzzle') return null;
  if (!Object.hasOwn(SLIDING_PUZZLE_DIFFICULTIES, value.difficulty)) return null;
  const definition = SLIDING_PUZZLE_DIFFICULTIES[value.difficulty];
  if (value.size !== definition.size) return null;
  if (!Number.isSafeInteger(value.seed) || value.seed < 0 || value.seed > UINT32_MAX) return null;
  if (!hasTilePermutation(value.tiles, value.size)
    || !isSlidingPuzzleSolvable(value.tiles, value.size)
    || !Number.isInteger(value.blankIndex)
    || value.blankIndex !== value.tiles.indexOf(0)) return null;
  if (!SLIDING_PUZZLE_STATUSES.includes(value.status)
    || !SLIDING_PUZZLE_LAST_ACTIONS.includes(value.lastAction)
    || !Number.isSafeInteger(value.moveCount)
    || value.moveCount < 0
    || !Number.isSafeInteger(value.elapsedSeconds)
    || value.elapsedSeconds < 0
    || !Array.isArray(value.history)
    || value.history.length > MAX_RESTORED_MOVES
    || value.history.length !== value.moveCount
    || !value.history.every((index) => Number.isInteger(index) && index >= 0 && index < value.tiles.length)) return null;
  if (value.lastMove !== null && !hasExactKeys(value.lastMove, LAST_MOVE_KEYS)) return null;

  let replayed = initialGame(value.difficulty, value.seed);
  for (const index of value.history) {
    const next = moveTileUnchecked(replayed, index);
    if (next === replayed) return null;
    replayed = next;
  }
  if (!arraysEqual(value.tiles, replayed.tiles)
    || value.blankIndex !== replayed.blankIndex
    || value.status !== replayed.status
    || value.moveCount !== replayed.moveCount
    || value.lastAction !== replayed.lastAction
    || !lastMovesEqual(value.lastMove, replayed.lastMove)) return null;
  if (value.status === 'ready' && value.elapsedSeconds !== 0) return null;

  return {
    ...replayed,
    tiles: [...replayed.tiles],
    elapsedSeconds: value.elapsedSeconds,
    history: [...replayed.history],
    lastMove: replayed.lastMove ? { ...replayed.lastMove } : null,
  };
}

export function restoreSlidingPuzzleGame(raw) {
  try {
    return restoredSlidingPuzzleGame(raw);
  } catch {
    return null;
  }
}

function assertSlidingPuzzleGame(game) {
  if (!game || typeof game !== 'object' || Array.isArray(game) || !restoredSlidingPuzzleGame(game)) {
    throw new Error('SLIDING_PUZZLE_GAME_INVALID');
  }
}

export function serializeSlidingPuzzleGame(game) {
  const restored = restoreSlidingPuzzleGame(game);
  if (!restored) throw new Error('SLIDING_PUZZLE_GAME_INVALID');
  return JSON.stringify(restored);
}
