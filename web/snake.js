export const SNAKE_SCHEMA_VERSION = 1;

export const SNAKE_DIFFICULTIES = Object.freeze({
  relaxed: Object.freeze({ key: 'relaxed', label: '悠闲', tickMs: 240 }),
  normal: Object.freeze({ key: 'normal', label: '标准', tickMs: 170 }),
  turbo: Object.freeze({ key: 'turbo', label: '极速', tickMs: 115 }),
});

export const SNAKE_DIRECTIONS = Object.freeze({
  up: Object.freeze({ row: -1, column: 0, opposite: 'down' }),
  down: Object.freeze({ row: 1, column: 0, opposite: 'up' }),
  left: Object.freeze({ row: 0, column: -1, opposite: 'right' }),
  right: Object.freeze({ row: 0, column: 1, opposite: 'left' }),
});

const DEFAULT_ROWS = 16;
const DEFAULT_COLUMNS = 16;
const VALID_STATUSES = new Set(['ready', 'playing', 'paused', 'over', 'won']);

function assertDimensions(rows, columns) {
  if (!Number.isInteger(rows) || !Number.isInteger(columns) || rows < 8 || columns < 8 || rows > 30 || columns > 30) {
    throw new Error('SNAKE_DIMENSIONS_INVALID');
  }
}

function assertIndex(index, rows, columns) {
  if (!Number.isInteger(index) || index < 0 || index >= rows * columns) throw new Error('SNAKE_INDEX_INVALID');
}

function normalizeRandom(random) {
  const value = Number(random());
  if (!Number.isFinite(value)) return 0;
  return Math.min(0.999999999, Math.max(0, value));
}

export function snakePosition(row, column, rows = DEFAULT_ROWS, columns = DEFAULT_COLUMNS) {
  assertDimensions(rows, columns);
  if (!Number.isInteger(row) || row < 0 || row >= rows || !Number.isInteger(column) || column < 0 || column >= columns) {
    throw new Error('SNAKE_COORDINATES_INVALID');
  }
  return row * columns + column;
}

export function snakeCoordinates(index, rows = DEFAULT_ROWS, columns = DEFAULT_COLUMNS) {
  assertDimensions(rows, columns);
  assertIndex(index, rows, columns);
  return { row: Math.floor(index / columns), column: index % columns };
}

export function spawnSnakeFood(snake, rows = DEFAULT_ROWS, columns = DEFAULT_COLUMNS, random = Math.random) {
  assertDimensions(rows, columns);
  if (!Array.isArray(snake)) throw new Error('SNAKE_BODY_REQUIRED');
  const occupied = new Set(snake);
  const available = [];
  for (let index = 0; index < rows * columns; index += 1) {
    if (!occupied.has(index)) available.push(index);
  }
  if (!available.length) return null;
  return available[Math.floor(normalizeRandom(random) * available.length)];
}

export function newSnakeGame({ difficulty = 'normal', rows = DEFAULT_ROWS, columns = DEFAULT_COLUMNS, random = Math.random } = {}) {
  assertDimensions(rows, columns);
  const normalizedDifficulty = Object.hasOwn(SNAKE_DIFFICULTIES, difficulty) ? difficulty : 'normal';
  const middleRow = Math.floor(rows / 2);
  const middleColumn = Math.floor(columns / 2);
  const snake = [
    snakePosition(middleRow, middleColumn, rows, columns),
    snakePosition(middleRow, middleColumn - 1, rows, columns),
    snakePosition(middleRow, middleColumn - 2, rows, columns),
  ];
  return {
    schemaVersion: SNAKE_SCHEMA_VERSION,
    kind: 'snake',
    difficulty: normalizedDifficulty,
    rows,
    columns,
    snake,
    food: spawnSnakeFood(snake, rows, columns, random),
    direction: 'right',
    queuedDirection: 'right',
    status: 'ready',
    score: 0,
    ticks: 0,
    foodsEaten: 0,
  };
}

function validateSnakeGame(value) {
  if (!value || typeof value !== 'object' || value.schemaVersion !== SNAKE_SCHEMA_VERSION || value.kind !== 'snake') return null;
  const rows = Number(value.rows);
  const columns = Number(value.columns);
  try { assertDimensions(rows, columns); } catch { return null; }
  if (!Object.hasOwn(SNAKE_DIFFICULTIES, value.difficulty) || !VALID_STATUSES.has(value.status)) return null;
  if (!Object.hasOwn(SNAKE_DIRECTIONS, value.direction) || !Object.hasOwn(SNAKE_DIRECTIONS, value.queuedDirection)) return null;
  if (!Array.isArray(value.snake) || value.snake.length < 3 || value.snake.length > rows * columns) return null;
  if (value.snake.some((index) => !Number.isInteger(index) || index < 0 || index >= rows * columns)) return null;
  if (new Set(value.snake).size !== value.snake.length) return null;
  for (let offset = 1; offset < value.snake.length; offset += 1) {
    const previous = snakeCoordinates(value.snake[offset - 1], rows, columns);
    const current = snakeCoordinates(value.snake[offset], rows, columns);
    if (Math.abs(previous.row - current.row) + Math.abs(previous.column - current.column) !== 1) return null;
  }
  if (value.food !== null && (!Number.isInteger(value.food) || value.food < 0 || value.food >= rows * columns || value.snake.includes(value.food))) return null;
  if (!Number.isSafeInteger(value.score) || value.score < 0 || !Number.isSafeInteger(value.ticks) || value.ticks < 0 || !Number.isSafeInteger(value.foodsEaten) || value.foodsEaten < 0) return null;
  if (value.score !== value.foodsEaten * 10 || value.snake.length !== value.foodsEaten + 3) return null;
  if (value.status === 'won' && value.snake.length !== rows * columns) return null;
  if (value.status !== 'won' && value.food === null) return null;
  return {
    schemaVersion: SNAKE_SCHEMA_VERSION,
    kind: 'snake',
    difficulty: value.difficulty,
    rows,
    columns,
    snake: [...value.snake],
    food: value.food,
    direction: value.direction,
    queuedDirection: value.queuedDirection,
    status: value.status,
    score: value.score,
    ticks: value.ticks,
    foodsEaten: value.foodsEaten,
  };
}

export function restoreSnakeGame(value) {
  return validateSnakeGame(value);
}

export function setSnakeDirection(game, direction) {
  const restored = validateSnakeGame(game);
  if (!restored) throw new Error('SNAKE_GAME_INVALID');
  if (!Object.hasOwn(SNAKE_DIRECTIONS, direction)) throw new Error('SNAKE_DIRECTION_INVALID');
  if (['over', 'won'].includes(restored.status)) return restored;
  if (restored.queuedDirection !== restored.direction) return restored;
  const current = restored.queuedDirection || restored.direction;
  if (SNAKE_DIRECTIONS[current].opposite === direction) return restored;
  return {
    ...restored,
    queuedDirection: direction,
    status: restored.status === 'ready' || restored.status === 'paused' ? 'playing' : restored.status,
  };
}

export function toggleSnakePause(game) {
  const restored = validateSnakeGame(game);
  if (!restored) throw new Error('SNAKE_GAME_INVALID');
  if (restored.status === 'playing') return { ...restored, status: 'paused' };
  if (restored.status === 'paused') return { ...restored, status: 'playing' };
  return restored;
}

export function advanceSnake(game, random = Math.random) {
  const restored = validateSnakeGame(game);
  if (!restored) throw new Error('SNAKE_GAME_INVALID');
  if (restored.status !== 'playing') return restored;
  const direction = SNAKE_DIRECTIONS[restored.queuedDirection] ? restored.queuedDirection : restored.direction;
  const { row, column } = snakeCoordinates(restored.snake[0], restored.rows, restored.columns);
  const nextRow = row + SNAKE_DIRECTIONS[direction].row;
  const nextColumn = column + SNAKE_DIRECTIONS[direction].column;
  if (nextRow < 0 || nextRow >= restored.rows || nextColumn < 0 || nextColumn >= restored.columns) {
    return { ...restored, direction, queuedDirection: direction, status: 'over', ticks: restored.ticks + 1 };
  }
  const nextHead = snakePosition(nextRow, nextColumn, restored.rows, restored.columns);
  const eating = nextHead === restored.food;
  const collisionBody = eating ? restored.snake : restored.snake.slice(0, -1);
  if (collisionBody.includes(nextHead)) {
    return { ...restored, direction, queuedDirection: direction, status: 'over', ticks: restored.ticks + 1 };
  }
  const snake = [nextHead, ...restored.snake];
  if (!eating) snake.pop();
  const foodsEaten = restored.foodsEaten + Number(eating);
  const food = eating ? spawnSnakeFood(snake, restored.rows, restored.columns, random) : restored.food;
  const won = food === null;
  return {
    ...restored,
    snake,
    food,
    direction,
    queuedDirection: direction,
    status: won ? 'won' : 'playing',
    score: foodsEaten * 10,
    ticks: restored.ticks + 1,
    foodsEaten,
  };
}
