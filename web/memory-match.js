export const MEMORY_MATCH_SCHEMA_VERSION = 1;

export const MEMORY_MATCH_STORAGE_KEYS = Object.freeze({
  game: 'kai.play.memory-match.game.v1',
  bestScores: 'kai.play.memory-match.best.v1',
});

export const MEMORY_MATCH_SYMBOLS = Object.freeze([
  Object.freeze({ key: 'moon', label: '月亮', glyph: '🌙' }),
  Object.freeze({ key: 'star', label: '星星', glyph: '⭐' }),
  Object.freeze({ key: 'sun', label: '太阳', glyph: '☀️' }),
  Object.freeze({ key: 'cloud', label: '云朵', glyph: '☁️' }),
  Object.freeze({ key: 'rainbow', label: '彩虹', glyph: '🌈' }),
  Object.freeze({ key: 'leaf', label: '树叶', glyph: '🍃' }),
  Object.freeze({ key: 'flower', label: '花朵', glyph: '🌼' }),
  Object.freeze({ key: 'acorn', label: '橡果', glyph: '🌰' }),
  Object.freeze({ key: 'apple', label: '苹果', glyph: '🍎' }),
  Object.freeze({ key: 'grape', label: '葡萄', glyph: '🍇' }),
  Object.freeze({ key: 'fish', label: '小鱼', glyph: '🐟' }),
  Object.freeze({ key: 'bird', label: '小鸟', glyph: '🐦' }),
]);

export const MEMORY_MATCH_DIFFICULTIES = Object.freeze({
  easy: Object.freeze({ key: 'easy', label: '入门', rows: 3, columns: 4, pairs: 6 }),
  standard: Object.freeze({ key: 'standard', label: '标准', rows: 4, columns: 4, pairs: 8 }),
  challenge: Object.freeze({ key: 'challenge', label: '挑战', rows: 4, columns: 6, pairs: 12 }),
});

const MEMORY_MATCH_STATUSES = Object.freeze(['ready', 'playing', 'won']);
const MEMORY_MATCH_LAST_ACTIONS = Object.freeze(['new', 'flip', 'match', 'mismatch', 'resolve', 'won']);
const UINT32_MAX = 0xffff_ffff;

function normalizedDifficulty(value) {
  return Object.hasOwn(MEMORY_MATCH_DIFFICULTIES, value) ? value : 'easy';
}

function seedFromText(text) {
  let hash = 2_166_136_261;
  for (const character of String(text)) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

export function memoryMatchSeededRandom(seed) {
  let state = seedFromText(seed);
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function randomUnit(random) {
  if (typeof random !== 'function') throw new Error('MEMORY_MATCH_RANDOM_INVALID');
  const value = Number(random());
  if (!Number.isFinite(value) || value < 0 || value >= 1) throw new Error('MEMORY_MATCH_RANDOM_INVALID');
  return value;
}

function normalizedSeed(options) {
  if (Object.hasOwn(options, 'seed')) {
    if (typeof options.seed === 'string' && options.seed.length > 0 && options.seed.length <= 512) {
      return seedFromText(options.seed);
    }
    if (Number.isSafeInteger(options.seed) && options.seed >= 0 && options.seed <= UINT32_MAX) {
      return options.seed >>> 0;
    }
    throw new Error('MEMORY_MATCH_SEED_INVALID');
  }
  const random = options.random === undefined ? Math.random : options.random;
  return Math.floor(randomUnit(random) * 0x1_0000_0000) >>> 0;
}

function shuffled(items, random) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(randomUnit(random) * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

function memoryMatchDeck(difficulty, seed) {
  const definition = MEMORY_MATCH_DIFFICULTIES[difficulty];
  const pairs = MEMORY_MATCH_SYMBOLS.slice(0, definition.pairs)
    .flatMap(({ key }) => [key, key]);
  return shuffled(pairs, memoryMatchSeededRandom(`kai-play:memory-match:v1:${seed}:${difficulty}`));
}

export function newMemoryMatchGame(rawOptions = {}) {
  const options = rawOptions && typeof rawOptions === 'object' ? rawOptions : {};
  const difficulty = normalizedDifficulty(options.difficulty);
  const definition = MEMORY_MATCH_DIFFICULTIES[difficulty];
  const seed = normalizedSeed(options);
  const deck = memoryMatchDeck(difficulty, seed);
  return {
    schemaVersion: MEMORY_MATCH_SCHEMA_VERSION,
    kind: 'memory-match',
    difficulty,
    rows: definition.rows,
    columns: definition.columns,
    pairCount: definition.pairs,
    seed,
    deck,
    status: 'ready',
    matched: Array(deck.length).fill(false),
    faceUp: [],
    pendingMismatch: false,
    matchedPairs: 0,
    moveCount: 0,
    elapsedSeconds: 0,
    lastAction: 'new',
  };
}

function arraysEqual(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function isCounter(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function isBooleanArray(value, length) {
  return Array.isArray(value) && value.length === length && value.every((entry) => typeof entry === 'boolean');
}

function matchedPairsAreComplete(deck, matched) {
  const indexesByPair = new Map();
  deck.forEach((pair, index) => {
    const indexes = indexesByPair.get(pair) ?? [];
    indexes.push(index);
    indexesByPair.set(pair, indexes);
  });
  return indexesByPair.size * 2 === deck.length
    && [...indexesByPair.values()].every((indexes) => (
      indexes.length === 2 && matched[indexes[0]] === matched[indexes[1]]
    ));
}

function restoredMemoryMatchGame(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (value.schemaVersion !== MEMORY_MATCH_SCHEMA_VERSION || value.kind !== 'memory-match') return null;
  if (!Object.hasOwn(MEMORY_MATCH_DIFFICULTIES, value.difficulty)) return null;
  const definition = MEMORY_MATCH_DIFFICULTIES[value.difficulty];
  if (value.rows !== definition.rows
    || value.columns !== definition.columns
    || value.pairCount !== definition.pairs) return null;
  if (!Number.isSafeInteger(value.seed) || value.seed < 0 || value.seed > UINT32_MAX) return null;
  if (!Array.isArray(value.deck)
    || value.deck.length !== definition.pairs * 2
    || !value.deck.every((entry) => typeof entry === 'string')) return null;
  if (!arraysEqual(value.deck, memoryMatchDeck(value.difficulty, value.seed))) return null;
  if (!isBooleanArray(value.matched, value.deck.length)) return null;
  if (!Array.isArray(value.faceUp)
    || value.faceUp.length > 2
    || !value.faceUp.every((index) => Number.isInteger(index) && index >= 0 && index < value.deck.length)
    || new Set(value.faceUp).size !== value.faceUp.length) return null;
  if (typeof value.pendingMismatch !== 'boolean') return null;
  if (!MEMORY_MATCH_STATUSES.includes(value.status)
    || !MEMORY_MATCH_LAST_ACTIONS.includes(value.lastAction)
    || !isCounter(value.matchedPairs)
    || !isCounter(value.moveCount)
    || !isCounter(value.elapsedSeconds)) return null;
  if (!matchedPairsAreComplete(value.deck, value.matched)) return null;
  if (value.faceUp.some((index) => value.matched[index])) return null;

  const actualMatchedPairs = value.matched.filter(Boolean).length / 2;
  if (!Number.isInteger(actualMatchedPairs)
    || value.matchedPairs !== actualMatchedPairs
    || value.matchedPairs > value.pairCount
    || value.moveCount < value.matchedPairs) return null;

  if (value.pendingMismatch) {
    if (value.status !== 'playing'
      || value.faceUp.length !== 2
      || value.deck[value.faceUp[0]] === value.deck[value.faceUp[1]]
      || value.lastAction !== 'mismatch') return null;
  } else if (value.faceUp.length > 1) return null;

  if (value.status === 'ready') {
    if (value.matchedPairs !== 0
      || value.moveCount !== 0
      || value.elapsedSeconds !== 0
      || value.faceUp.length !== 0
      || value.pendingMismatch
      || value.lastAction !== 'new') return null;
  } else if (value.status === 'playing') {
    if (value.matchedPairs >= value.pairCount) return null;
    if (value.matchedPairs === 0
      && value.moveCount === 0
      && value.elapsedSeconds === 0
      && value.faceUp.length === 0) return null;
    if (value.faceUp.length === 1 && value.lastAction !== 'flip') return null;
    if (value.faceUp.length === 0 && !['match', 'resolve'].includes(value.lastAction)) return null;
  } else if (value.status === 'won') {
    if (value.matchedPairs !== value.pairCount
      || !value.matched.every(Boolean)
      || value.faceUp.length !== 0
      || value.pendingMismatch
      || value.moveCount < value.pairCount
      || value.lastAction !== 'won') return null;
  }

  return {
    schemaVersion: MEMORY_MATCH_SCHEMA_VERSION,
    kind: 'memory-match',
    difficulty: value.difficulty,
    rows: value.rows,
    columns: value.columns,
    pairCount: value.pairCount,
    seed: value.seed,
    deck: [...value.deck],
    status: value.status,
    matched: [...value.matched],
    faceUp: [...value.faceUp],
    pendingMismatch: value.pendingMismatch,
    matchedPairs: value.matchedPairs,
    moveCount: value.moveCount,
    elapsedSeconds: value.elapsedSeconds,
    lastAction: value.lastAction,
  };
}

export function restoreMemoryMatchGame(value) {
  try {
    return restoredMemoryMatchGame(value);
  } catch {
    return null;
  }
}

function assertMemoryMatchGame(game) {
  if (!restoredMemoryMatchGame(game)) throw new Error('MEMORY_MATCH_GAME_INVALID');
}

function assertCardIndex(game, index) {
  if (!Number.isInteger(index) || index < 0 || index >= game.deck.length) {
    throw new Error('MEMORY_MATCH_CARD_INVALID');
  }
}

function memoryMatchSymbol(pair) {
  return MEMORY_MATCH_SYMBOLS.find((symbol) => symbol.key === pair);
}

export function getMemoryMatchCard(game, index) {
  assertMemoryMatchGame(game);
  assertCardIndex(game, index);
  const matched = game.matched[index];
  const faceUp = game.faceUp.includes(index);
  const symbol = memoryMatchSymbol(game.deck[index]);
  return Object.freeze({
    id: `memory:${game.seed}:${index}`,
    index,
    state: matched ? 'matched' : faceUp ? 'face-up' : 'hidden',
    matched,
    faceUp,
    pair: matched || faceUp ? game.deck[index] : null,
    label: matched || faceUp ? symbol.label : null,
    glyph: matched || faceUp ? symbol.glyph : null,
  });
}

export function flipMemoryMatchCard(game, index) {
  assertMemoryMatchGame(game);
  assertCardIndex(game, index);
  if (game.status === 'won'
    || game.pendingMismatch
    || game.matched[index]
    || game.faceUp.includes(index)) return game;

  if (game.faceUp.length === 0) {
    return {
      ...game,
      status: 'playing',
      faceUp: [index],
      lastAction: 'flip',
    };
  }

  const first = game.faceUp[0];
  const moveCount = game.moveCount + 1;
  if (game.deck[first] !== game.deck[index]) {
    return {
      ...game,
      status: 'playing',
      faceUp: [first, index],
      pendingMismatch: true,
      moveCount,
      lastAction: 'mismatch',
    };
  }

  const matched = [...game.matched];
  matched[first] = true;
  matched[index] = true;
  const matchedPairs = game.matchedPairs + 1;
  const won = matchedPairs === game.pairCount;
  return {
    ...game,
    status: won ? 'won' : 'playing',
    matched,
    faceUp: [],
    pendingMismatch: false,
    matchedPairs,
    moveCount,
    lastAction: won ? 'won' : 'match',
  };
}

export function resolveMemoryMatchMismatch(game) {
  assertMemoryMatchGame(game);
  if (!game.pendingMismatch) return game;
  return {
    ...game,
    faceUp: [],
    pendingMismatch: false,
    lastAction: 'resolve',
  };
}

export function advanceMemoryMatchTime(game, seconds = 1) {
  assertMemoryMatchGame(game);
  if (!Number.isSafeInteger(seconds) || seconds < 0) throw new Error('MEMORY_MATCH_TIME_INVALID');
  if (seconds === 0 || game.status !== 'playing') return game;
  const elapsedSeconds = game.elapsedSeconds + seconds;
  if (!Number.isSafeInteger(elapsedSeconds)) throw new Error('MEMORY_MATCH_TIME_INVALID');
  return { ...game, elapsedSeconds };
}

export function restartMemoryMatchGame(game, rawOptions = {}) {
  assertMemoryMatchGame(game);
  const options = rawOptions && typeof rawOptions === 'object' ? rawOptions : {};
  return newMemoryMatchGame({
    ...options,
    difficulty: Object.hasOwn(options, 'difficulty') ? options.difficulty : game.difficulty,
  });
}

export function newMemoryMatchBestScores() {
  return {
    schemaVersion: MEMORY_MATCH_SCHEMA_VERSION,
    kind: 'memory-match-best',
    scores: Object.fromEntries(Object.keys(MEMORY_MATCH_DIFFICULTIES).map((difficulty) => [difficulty, null])),
  };
}

function isMemoryMatchScore(value) {
  return value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
    && isCounter(value.moveCount)
    && value.moveCount > 0
    && isCounter(value.elapsedSeconds);
}

export function restoreMemoryMatchBestScores(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (value.schemaVersion !== MEMORY_MATCH_SCHEMA_VERSION
    || value.kind !== 'memory-match-best'
    || !value.scores
    || typeof value.scores !== 'object'
    || Array.isArray(value.scores)) return null;
  const difficulties = Object.keys(MEMORY_MATCH_DIFFICULTIES);
  if (Object.keys(value.scores).length !== difficulties.length) return null;
  const scores = {};
  for (const difficulty of difficulties) {
    const score = value.scores[difficulty];
    if (score !== null
      && (!isMemoryMatchScore(score) || score.moveCount < MEMORY_MATCH_DIFFICULTIES[difficulty].pairs)) return null;
    scores[difficulty] = score === null ? null : {
      moveCount: score.moveCount,
      elapsedSeconds: score.elapsedSeconds,
    };
  }
  return {
    schemaVersion: MEMORY_MATCH_SCHEMA_VERSION,
    kind: 'memory-match-best',
    scores,
  };
}

export function compareMemoryMatchScores(left, right) {
  if (!isMemoryMatchScore(left) || !isMemoryMatchScore(right)) {
    throw new Error('MEMORY_MATCH_SCORE_INVALID');
  }
  return Math.sign(left.moveCount - right.moveCount
    || left.elapsedSeconds - right.elapsedSeconds);
}

export function memoryMatchScore(game) {
  assertMemoryMatchGame(game);
  if (game.status !== 'won') return null;
  return Object.freeze({ moveCount: game.moveCount, elapsedSeconds: game.elapsedSeconds });
}

export function updateMemoryMatchBestScores(value, game) {
  assertMemoryMatchGame(game);
  const bestScores = restoreMemoryMatchBestScores(value) ?? newMemoryMatchBestScores();
  const result = memoryMatchScore(game);
  if (!result) return bestScores;
  const current = bestScores.scores[game.difficulty];
  if (current && compareMemoryMatchScores(result, current) >= 0) return bestScores;
  return {
    ...bestScores,
    scores: {
      ...bestScores.scores,
      [game.difficulty]: { ...result },
    },
  };
}

function defaultStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function safeStorageGet(storage, key) {
  try {
    return storage && typeof storage.getItem === 'function' ? storage.getItem(key) : null;
  } catch {
    return null;
  }
}

function safeStorageSet(storage, key, value) {
  try {
    if (!storage || typeof storage.setItem !== 'function') return false;
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function parsedJson(value) {
  if (typeof value !== 'string') return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function loadMemoryMatchSession(storage = defaultStorage(), rawOptions = {}) {
  const options = rawOptions && typeof rawOptions === 'object' ? rawOptions : {};
  const restoredGame = restoreMemoryMatchGame(parsedJson(safeStorageGet(storage, MEMORY_MATCH_STORAGE_KEYS.game)));
  const restoredBest = restoreMemoryMatchBestScores(
    parsedJson(safeStorageGet(storage, MEMORY_MATCH_STORAGE_KEYS.bestScores)),
  ) ?? newMemoryMatchBestScores();
  const game = restoredGame ?? newMemoryMatchGame(options);
  const bestScores = game.status === 'won' ? updateMemoryMatchBestScores(restoredBest, game) : restoredBest;
  return {
    game,
    bestScores,
    restored: restoredGame !== null,
    saveAvailable: storage !== null
      && typeof storage?.getItem === 'function'
      && typeof storage?.setItem === 'function',
  };
}

export function saveMemoryMatchSession(storage = defaultStorage(), game, value = newMemoryMatchBestScores()) {
  assertMemoryMatchGame(game);
  const bestScores = updateMemoryMatchBestScores(value, game);
  const gameSaved = safeStorageSet(storage, MEMORY_MATCH_STORAGE_KEYS.game, JSON.stringify(game));
  const bestSaved = safeStorageSet(storage, MEMORY_MATCH_STORAGE_KEYS.bestScores, JSON.stringify(bestScores));
  return { saved: gameSaved && bestSaved, bestScores };
}
