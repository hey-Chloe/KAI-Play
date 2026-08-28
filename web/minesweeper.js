export const MINESWEEPER_SCHEMA_VERSION = 1;

export const MINESWEEPER_DIFFICULTIES = Object.freeze({
  beginner: Object.freeze({ key: 'beginner', label: '入门', rows: 9, columns: 9, mines: 10 }),
  standard: Object.freeze({ key: 'standard', label: '标准', rows: 12, columns: 12, mines: 22 }),
  challenge: Object.freeze({ key: 'challenge', label: '挑战', rows: 16, columns: 16, mines: 40 }),
});

const MINESWEEPER_STATUSES = Object.freeze(['ready', 'playing', 'won', 'lost']);
const MINESWEEPER_LAST_ACTIONS = Object.freeze([
  'new',
  'flag',
  'unflag',
  'reveal',
  'flood',
  'chord',
  'won',
  'mine',
  'chord-mine',
]);
const MAX_GRID_CELLS = 1_000_000;

function normalizedDifficulty(value) {
  return Object.hasOwn(MINESWEEPER_DIFFICULTIES, value) ? value : 'beginner';
}

function assertDimensions(rows, columns) {
  if (!Number.isInteger(rows)
    || !Number.isInteger(columns)
    || rows < 1
    || columns < 1
    || rows * columns > MAX_GRID_CELLS) {
    throw new Error('MINESWEEPER_DIMENSIONS_INVALID');
  }
}

function assertIndex(index, rows, columns) {
  assertDimensions(rows, columns);
  if (!Number.isInteger(index) || index < 0 || index >= rows * columns) {
    throw new Error('MINESWEEPER_POSITION_INVALID');
  }
}

export function minesweeperPosition(row, column, rows, columns) {
  assertDimensions(rows, columns);
  if (!Number.isInteger(row)
    || !Number.isInteger(column)
    || row < 0
    || row >= rows
    || column < 0
    || column >= columns) {
    throw new Error('MINESWEEPER_POSITION_INVALID');
  }
  return row * columns + column;
}

export function minesweeperCoordinates(index, rows, columns) {
  assertIndex(index, rows, columns);
  return { row: Math.floor(index / columns), column: index % columns };
}

export function getMinesweeperNeighborIndexes(index, rows, columns) {
  const { row, column } = minesweeperCoordinates(index, rows, columns);
  const neighbors = [];
  for (let nextRow = Math.max(0, row - 1); nextRow <= Math.min(rows - 1, row + 1); nextRow += 1) {
    for (let nextColumn = Math.max(0, column - 1); nextColumn <= Math.min(columns - 1, column + 1); nextColumn += 1) {
      if (nextRow === row && nextColumn === column) continue;
      neighbors.push(nextRow * columns + nextColumn);
    }
  }
  return neighbors;
}

function seedFromText(text) {
  let hash = 2_166_136_261;
  for (const character of String(text)) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

export function minesweeperSeededRandom(seed) {
  let state = seedFromText(seed);
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function randomUnit(random) {
  if (typeof random !== 'function') throw new Error('MINESWEEPER_RANDOM_INVALID');
  const value = Number(random());
  if (!Number.isFinite(value) || value < 0 || value >= 1) {
    throw new Error('MINESWEEPER_RANDOM_INVALID');
  }
  return value;
}

function normalizedSeed(options) {
  if (Object.hasOwn(options, 'seed')) {
    if (typeof options.seed === 'string' && options.seed.length > 0 && options.seed.length <= 512) {
      return seedFromText(options.seed);
    }
    if (Number.isSafeInteger(options.seed) && options.seed >= 0 && options.seed <= 0xffff_ffff) {
      return options.seed >>> 0;
    }
    throw new Error('MINESWEEPER_SEED_INVALID');
  }
  const random = options.random === undefined ? Math.random : options.random;
  return Math.floor(randomUnit(random) * 0x1_0000_0000) >>> 0;
}

function shuffled(items, random) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

function countTrue(values) {
  return values.reduce((total, value) => total + Number(value === true), 0);
}

function countRevealedSafe(revealed, mines) {
  return revealed.reduce((total, value, index) => total + Number(value && !mines?.[index]), 0);
}

function createAdjacentCounts(mines, rows, columns) {
  return mines.map((_, index) => getMinesweeperNeighborIndexes(index, rows, columns)
    .reduce((total, neighbor) => total + Number(mines[neighbor]), 0));
}

function createMineLayout(game, safeIndex) {
  const cellCount = game.rows * game.columns;
  const protectedIndexes = new Set([safeIndex, ...getMinesweeperNeighborIndexes(safeIndex, game.rows, game.columns)]);
  let candidates = Array.from({ length: cellCount }, (_, index) => index)
    .filter((index) => !protectedIndexes.has(index));
  if (candidates.length < game.mineCount) {
    candidates = Array.from({ length: cellCount }, (_, index) => index).filter((index) => index !== safeIndex);
  }
  const random = minesweeperSeededRandom(`kai-play:minesweeper:v1:${game.seed}:${safeIndex}`);
  const mineIndexes = shuffled(candidates, random).slice(0, game.mineCount);
  const mines = Array(cellCount).fill(false);
  for (const index of mineIndexes) mines[index] = true;
  return { mines, adjacent: createAdjacentCounts(mines, game.rows, game.columns) };
}

export function newMinesweeperGame(rawOptions = {}) {
  const options = rawOptions && typeof rawOptions === 'object' ? rawOptions : {};
  const difficulty = normalizedDifficulty(options.difficulty);
  const definition = MINESWEEPER_DIFFICULTIES[difficulty];
  const cellCount = definition.rows * definition.columns;
  return {
    schemaVersion: MINESWEEPER_SCHEMA_VERSION,
    kind: 'minesweeper',
    difficulty,
    rows: definition.rows,
    columns: definition.columns,
    mineCount: definition.mines,
    seed: normalizedSeed(options),
    status: 'ready',
    mines: null,
    adjacent: null,
    revealed: Array(cellCount).fill(false),
    flagged: Array(cellCount).fill(false),
    firstReveal: null,
    explodedIndex: null,
    elapsedSeconds: 0,
    moveCount: 0,
    revealedCount: 0,
    flagCount: 0,
    chordCount: 0,
    lastAction: 'new',
  };
}

function isBooleanArray(value, length) {
  return Array.isArray(value) && value.length === length && value.every((entry) => typeof entry === 'boolean');
}

function isAdjacentArray(value, length) {
  return Array.isArray(value)
    && value.length === length
    && value.every((entry) => Number.isInteger(entry) && entry >= 0 && entry <= 8);
}

function arraysEqual(first, second) {
  return first.length === second.length && first.every((value, index) => value === second[index]);
}

function isCounter(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function restoredMinesweeperGame(value) {
  if (!value || typeof value !== 'object') return null;
  if (value.schemaVersion !== MINESWEEPER_SCHEMA_VERSION || value.kind !== 'minesweeper') return null;
  if (!Object.hasOwn(MINESWEEPER_DIFFICULTIES, value.difficulty)) return null;
  const definition = MINESWEEPER_DIFFICULTIES[value.difficulty];
  if (value.rows !== definition.rows || value.columns !== definition.columns || value.mineCount !== definition.mines) return null;
  if (!Number.isInteger(value.seed) || value.seed < 0 || value.seed > 0xffff_ffff) return null;
  if (!MINESWEEPER_STATUSES.includes(value.status) || !MINESWEEPER_LAST_ACTIONS.includes(value.lastAction)) return null;

  const cellCount = value.rows * value.columns;
  if (!isBooleanArray(value.revealed, cellCount) || !isBooleanArray(value.flagged, cellCount)) return null;
  if (!isCounter(value.elapsedSeconds)
    || !isCounter(value.moveCount)
    || !isCounter(value.revealedCount)
    || !isCounter(value.flagCount)
    || !isCounter(value.chordCount)
    || value.chordCount > value.moveCount) return null;
  const actualFlagCount = countTrue(value.flagged);
  if (actualFlagCount !== value.flagCount || actualFlagCount > value.mineCount) return null;

  if (value.firstReveal === null) {
    if (value.status !== 'ready'
      || value.mines !== null
      || value.adjacent !== null
      || value.explodedIndex !== null
      || value.revealed.some(Boolean)
      || value.elapsedSeconds !== 0
      || value.revealedCount !== 0
      || value.chordCount !== 0
      || !['new', 'flag', 'unflag'].includes(value.lastAction)) return null;
    if (value.moveCount < value.flagCount
      || (value.lastAction === 'new' && (value.moveCount !== 0 || value.flagCount !== 0))
      || (value.lastAction === 'flag' && value.flagCount === 0)) return null;
  } else {
    if (!Number.isInteger(value.firstReveal) || value.firstReveal < 0 || value.firstReveal >= cellCount) return null;
    if (!isBooleanArray(value.mines, cellCount) || !isAdjacentArray(value.adjacent, cellCount)) return null;
    const expected = createMineLayout(value, value.firstReveal);
    if (!arraysEqual(value.mines, expected.mines) || !arraysEqual(value.adjacent, expected.adjacent)) return null;
    if (value.mines[value.firstReveal] || !value.revealed[value.firstReveal] || value.flagged[value.firstReveal]) return null;

    const safeRevealed = countRevealedSafe(value.revealed, value.mines);
    if (safeRevealed !== value.revealedCount || value.moveCount < 1) return null;
    if (value.status !== 'won' && value.moveCount < value.flagCount + 1) return null;
    const allSafeRevealed = safeRevealed === cellCount - value.mineCount;
    const revealedMines = value.mines.flatMap((mine, index) => mine && value.revealed[index] ? [index] : []);
    let derivedStatus = 'playing';
    if (value.explodedIndex !== null) derivedStatus = 'lost';
    else if (allSafeRevealed) derivedStatus = 'won';
    if (derivedStatus !== value.status) return null;

    if (value.status === 'lost') {
      if (!Number.isInteger(value.explodedIndex)
        || value.explodedIndex < 0
        || value.explodedIndex >= cellCount
        || !value.mines[value.explodedIndex]
        || !value.revealed[value.explodedIndex]
        || revealedMines.length !== value.mineCount
        || !['mine', 'chord-mine'].includes(value.lastAction)) return null;
    } else if (value.explodedIndex !== null || revealedMines.length > 0) return null;

    if (value.status === 'won') {
      if (!arraysEqual(value.flagged, value.mines) || value.lastAction !== 'won') return null;
    } else if (value.status === 'playing' && !['reveal', 'flood', 'chord', 'flag', 'unflag'].includes(value.lastAction)) return null;
  }

  for (let index = 0; index < cellCount; index += 1) {
    if (value.flagged[index] && value.revealed[index] && !(value.status === 'lost' && value.mines[index])) return null;
  }

  return {
    schemaVersion: MINESWEEPER_SCHEMA_VERSION,
    kind: 'minesweeper',
    difficulty: value.difficulty,
    rows: value.rows,
    columns: value.columns,
    mineCount: value.mineCount,
    seed: value.seed,
    status: value.status,
    mines: value.mines ? [...value.mines] : null,
    adjacent: value.adjacent ? [...value.adjacent] : null,
    revealed: [...value.revealed],
    flagged: [...value.flagged],
    firstReveal: value.firstReveal,
    explodedIndex: value.explodedIndex,
    elapsedSeconds: value.elapsedSeconds,
    moveCount: value.moveCount,
    revealedCount: value.revealedCount,
    flagCount: value.flagCount,
    chordCount: value.chordCount,
    lastAction: value.lastAction,
  };
}

export function restoreMinesweeperGame(value) {
  try {
    return restoredMinesweeperGame(value);
  } catch {
    return null;
  }
}

function assertMinesweeperGame(game) {
  if (!restoredMinesweeperGame(game)) throw new Error('MINESWEEPER_GAME_INVALID');
}

function assertMinesweeperSurface(game, index) {
  if (!game || typeof game !== 'object') throw new Error('MINESWEEPER_GAME_INVALID');
  assertIndex(index, game.rows, game.columns);
  const cellCount = game.rows * game.columns;
  if (!Array.isArray(game.revealed)
    || game.revealed.length !== cellCount
    || !Array.isArray(game.flagged)
    || game.flagged.length !== cellCount) throw new Error('MINESWEEPER_GAME_INVALID');
}

export function getMinesweeperCell(game, index) {
  assertMinesweeperSurface(game, index);
  return Object.freeze({
    revealed: game.revealed[index],
    flagged: game.flagged[index],
    mine: game.mines?.[index] === true,
    adjacentMines: game.adjacent?.[index] ?? null,
    exploded: game.explodedIndex === index,
  });
}

export function getMinesweeperRemainingMines(game) {
  assertMinesweeperGame(game);
  return game.mineCount - game.flagCount;
}

function revealSafeArea(game, revealed, startIndexes) {
  const queue = [];
  const queued = new Set();
  for (const index of startIndexes) {
    if (game.mines[index] || game.flagged[index] || revealed[index] || queued.has(index)) continue;
    queue.push(index);
    queued.add(index);
  }
  for (let offset = 0; offset < queue.length; offset += 1) {
    const index = queue[offset];
    if (game.mines[index] || game.flagged[index] || revealed[index]) continue;
    revealed[index] = true;
    if (game.adjacent[index] !== 0) continue;
    for (const neighbor of getMinesweeperNeighborIndexes(index, game.rows, game.columns)) {
      if (game.mines[neighbor] || game.flagged[neighbor] || revealed[neighbor] || queued.has(neighbor)) continue;
      queue.push(neighbor);
      queued.add(neighbor);
    }
  }
}

function finishSafeMove(game, revealed, flagged, updates) {
  const cellCount = game.rows * game.columns;
  const revealedCount = countRevealedSafe(revealed, game.mines);
  const won = revealedCount === cellCount - game.mineCount;
  const nextFlags = won ? [...game.mines] : flagged;
  return {
    ...game,
    ...updates,
    status: won ? 'won' : 'playing',
    revealed,
    flagged: nextFlags,
    explodedIndex: null,
    revealedCount,
    flagCount: countTrue(nextFlags),
    lastAction: won ? 'won' : updates.lastAction,
  };
}

function finishMineMove(game, revealed, flagged, explodedIndex, updates) {
  for (let index = 0; index < game.mines.length; index += 1) {
    if (game.mines[index]) revealed[index] = true;
  }
  return {
    ...game,
    ...updates,
    status: 'lost',
    revealed,
    flagged,
    explodedIndex,
    revealedCount: countRevealedSafe(revealed, game.mines),
    flagCount: countTrue(flagged),
  };
}

export function revealMinesweeperCell(game, index) {
  assertMinesweeperGame(game);
  assertIndex(index, game.rows, game.columns);
  if (game.status === 'won' || game.status === 'lost' || game.revealed[index] || game.flagged[index]) return game;

  let activeGame = game;
  if (game.status === 'ready') {
    const layout = createMineLayout(game, index);
    activeGame = {
      ...game,
      ...layout,
      firstReveal: index,
      status: 'playing',
    };
  }

  const revealed = [...activeGame.revealed];
  const flagged = [...activeGame.flagged];
  if (activeGame.mines[index]) {
    return finishMineMove(activeGame, revealed, flagged, index, {
      moveCount: activeGame.moveCount + 1,
      lastAction: 'mine',
    });
  }
  const before = countRevealedSafe(revealed, activeGame.mines);
  revealSafeArea(activeGame, revealed, [index]);
  const after = countRevealedSafe(revealed, activeGame.mines);
  return finishSafeMove(activeGame, revealed, flagged, {
    moveCount: activeGame.moveCount + 1,
    lastAction: after - before > 1 ? 'flood' : 'reveal',
  });
}

export function toggleMinesweeperFlag(game, index) {
  assertMinesweeperGame(game);
  assertIndex(index, game.rows, game.columns);
  if (game.status === 'won' || game.status === 'lost' || game.revealed[index]) return game;
  if (!game.flagged[index] && game.flagCount >= game.mineCount) return game;
  const flagged = [...game.flagged];
  flagged[index] = !flagged[index];
  return {
    ...game,
    flagged,
    flagCount: game.flagCount + (flagged[index] ? 1 : -1),
    moveCount: game.moveCount + 1,
    lastAction: flagged[index] ? 'flag' : 'unflag',
  };
}

export function chordMinesweeperCell(game, index) {
  assertMinesweeperGame(game);
  assertIndex(index, game.rows, game.columns);
  if (game.status !== 'playing' || !game.revealed[index] || game.mines[index] || game.adjacent[index] < 1) return game;
  const neighbors = getMinesweeperNeighborIndexes(index, game.rows, game.columns);
  const neighboringFlags = neighbors.reduce((total, neighbor) => total + Number(game.flagged[neighbor]), 0);
  if (neighboringFlags !== game.adjacent[index]) return game;
  const targets = neighbors.filter((neighbor) => !game.revealed[neighbor] && !game.flagged[neighbor]);
  if (!targets.length) return game;

  const revealed = [...game.revealed];
  const flagged = [...game.flagged];
  revealSafeArea(game, revealed, targets.filter((target) => !game.mines[target]));
  const explodedIndex = targets.find((target) => game.mines[target]);
  const updates = {
    moveCount: game.moveCount + 1,
    chordCount: game.chordCount + 1,
    lastAction: explodedIndex === undefined ? 'chord' : 'chord-mine',
  };
  if (explodedIndex !== undefined) {
    return finishMineMove(game, revealed, flagged, explodedIndex, updates);
  }
  return finishSafeMove(game, revealed, flagged, updates);
}
