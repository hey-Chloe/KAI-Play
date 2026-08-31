export const SOKOBAN_SCHEMA_VERSION = 1;

export const SOKOBAN_DIRECTIONS = Object.freeze({
  up: Object.freeze({ row: -1, column: 0 }),
  down: Object.freeze({ row: 1, column: 0 }),
  left: Object.freeze({ row: 0, column: -1 }),
  right: Object.freeze({ row: 0, column: 1 }),
});

export const SOKOBAN_KEY_DIRECTIONS = Object.freeze({
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  w: 'up',
  a: 'left',
  s: 'down',
  d: 'right',
});

const LEVEL_BLUEPRINTS = Object.freeze([
  Object.freeze({
    id: 'first-push',
    name: '初次推动',
    map: Object.freeze([
      '######',
      '#    #',
      '# @$.#',
      '#    #',
      '######',
    ]),
  }),
  Object.freeze({
    id: 'north-star',
    name: '北方星',
    map: Object.freeze([
      '#####',
      '# . #',
      '# $ #',
      '# @ #',
      '#   #',
      '#####',
    ]),
  }),
  Object.freeze({
    id: 'side-step',
    name: '侧身就位',
    map: Object.freeze([
      '#######',
      '#     #',
      '#  .  #',
      '#  $  #',
      '# @   #',
      '#     #',
      '#######',
    ]),
  }),
  Object.freeze({
    id: 'twin-lanterns',
    name: '双灯归位',
    map: Object.freeze([
      '########',
      '#      #',
      '# .  . #',
      '# $  $ #',
      '#  @   #',
      '#      #',
      '########',
    ]),
  }),
  Object.freeze({
    id: 'parallel-lines',
    name: '并行归仓',
    map: Object.freeze([
      '#########',
      '#       #',
      '# . $@  #',
      '# . $   #',
      '#       #',
      '#########',
    ]),
  }),
  Object.freeze({
    id: 'stone-gate',
    name: '绕过石门',
    map: Object.freeze([
      '########',
      '#      #',
      '#  ##. #',
      '#  $   #',
      '#  # @ #',
      '#      #',
      '########',
    ]),
  }),
]);

const GAME_KEYS = Object.freeze([
  'schemaVersion', 'kind', 'levelIndex', 'levelId', 'rows', 'columns',
  'walls', 'targets', 'boxes', 'player', 'status', 'steps', 'pushes', 'moves',
]);
const VALID_STATUSES = new Set(['playing', 'won']);
const MAX_RESTORED_MOVES = 10_000;

function assertDimensions(rows, columns) {
  if (!Number.isInteger(rows) || !Number.isInteger(columns)
    || rows < 3 || columns < 3 || rows > 64 || columns > 64) {
    throw new Error('SOKOBAN_DIMENSIONS_INVALID');
  }
}

export function sokobanPosition(row, column, rows, columns) {
  assertDimensions(rows, columns);
  if (!Number.isInteger(row) || row < 0 || row >= rows
    || !Number.isInteger(column) || column < 0 || column >= columns) {
    throw new Error('SOKOBAN_COORDINATES_INVALID');
  }
  return row * columns + column;
}

export function sokobanCoordinates(index, rows, columns) {
  assertDimensions(rows, columns);
  if (!Number.isInteger(index) || index < 0 || index >= rows * columns) {
    throw new Error('SOKOBAN_INDEX_INVALID');
  }
  return { row: Math.floor(index / columns), column: index % columns };
}

function parseLevel(blueprint, levelIndex) {
  const rows = blueprint.map.length;
  const columns = blueprint.map[0]?.length ?? 0;
  assertDimensions(rows, columns);
  if (blueprint.map.some((row) => typeof row !== 'string' || row.length !== columns)) {
    throw new Error('SOKOBAN_LEVEL_SHAPE_INVALID');
  }

  const walls = [];
  const targets = [];
  const boxes = [];
  let player = null;
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const tile = blueprint.map[row][column];
      const index = sokobanPosition(row, column, rows, columns);
      if (tile === '#') walls.push(index);
      else if (tile === '.') targets.push(index);
      else if (tile === '$') boxes.push(index);
      else if (tile === '*') { boxes.push(index); targets.push(index); }
      else if (tile === '@' || tile === '+') {
        if (player !== null) throw new Error('SOKOBAN_LEVEL_PLAYER_INVALID');
        player = index;
        if (tile === '+') targets.push(index);
      } else if (tile !== ' ') throw new Error('SOKOBAN_LEVEL_TILE_INVALID');
    }
  }
  if (player === null || boxes.length < 1 || boxes.length !== targets.length) {
    throw new Error('SOKOBAN_LEVEL_CONTENT_INVALID');
  }
  for (let column = 0; column < columns; column += 1) {
    if (!walls.includes(column) || !walls.includes((rows - 1) * columns + column)) {
      throw new Error('SOKOBAN_LEVEL_BORDER_INVALID');
    }
  }
  for (let row = 0; row < rows; row += 1) {
    if (!walls.includes(row * columns) || !walls.includes(row * columns + columns - 1)) {
      throw new Error('SOKOBAN_LEVEL_BORDER_INVALID');
    }
  }
  return Object.freeze({
    id: blueprint.id,
    name: blueprint.name,
    levelIndex,
    rows,
    columns,
    walls: Object.freeze(walls),
    targets: Object.freeze(targets),
    boxes: Object.freeze(boxes),
    player,
  });
}

export const SOKOBAN_LEVELS = Object.freeze(LEVEL_BLUEPRINTS.map(parseLevel));

function resolveLevelIndex(level) {
  if (level === undefined) return 0;
  if (Number.isInteger(level) && level >= 0 && level < SOKOBAN_LEVELS.length) return level;
  if (typeof level === 'string') {
    const index = SOKOBAN_LEVELS.findIndex((candidate) => candidate.id === level);
    if (index >= 0) return index;
  }
  throw new Error('SOKOBAN_LEVEL_INVALID');
}

function boxesComplete(boxes, targets) {
  const targetSet = new Set(targets);
  return boxes.every((box) => targetSet.has(box));
}

function baseGame(levelIndex) {
  const level = SOKOBAN_LEVELS[levelIndex];
  return {
    schemaVersion: SOKOBAN_SCHEMA_VERSION,
    kind: 'sokoban',
    levelIndex,
    levelId: level.id,
    rows: level.rows,
    columns: level.columns,
    walls: [...level.walls],
    targets: [...level.targets],
    boxes: [...level.boxes],
    player: level.player,
    status: boxesComplete(level.boxes, level.targets) ? 'won' : 'playing',
    steps: 0,
    pushes: 0,
    moves: [],
  };
}

export function newSokobanGame(rawOptions = {}) {
  const options = rawOptions && typeof rawOptions === 'object' && !Array.isArray(rawOptions) ? rawOptions : {};
  return baseGame(resolveLevelIndex(options.level));
}

function destination(index, direction, rows, columns) {
  const { row, column } = sokobanCoordinates(index, rows, columns);
  const vector = SOKOBAN_DIRECTIONS[direction];
  const nextRow = row + vector.row;
  const nextColumn = column + vector.column;
  if (nextRow < 0 || nextRow >= rows || nextColumn < 0 || nextColumn >= columns) return null;
  return sokobanPosition(nextRow, nextColumn, rows, columns);
}

function transition(game, direction) {
  if (game.status === 'won') return null;
  const nextPlayer = destination(game.player, direction, game.rows, game.columns);
  if (nextPlayer === null || game.walls.includes(nextPlayer)) return null;
  const boxIndex = game.boxes.indexOf(nextPlayer);
  let boxes = [...game.boxes];
  let pushed = false;
  if (boxIndex >= 0) {
    const nextBox = destination(nextPlayer, direction, game.rows, game.columns);
    if (nextBox === null || game.walls.includes(nextBox) || game.boxes.includes(nextBox)) return null;
    boxes[boxIndex] = nextBox;
    boxes.sort((first, second) => first - second);
    pushed = true;
  }
  const moves = [...game.moves, direction];
  return {
    ...game,
    boxes,
    player: nextPlayer,
    status: boxesComplete(boxes, game.targets) ? 'won' : 'playing',
    steps: game.steps + 1,
    pushes: game.pushes + Number(pushed),
    moves,
  };
}

function arraysEqual(first, second) {
  return first.length === second.length && first.every((value, index) => value === second[index]);
}

function hasOnlyGameKeys(value) {
  const keys = Object.keys(value).sort();
  return arraysEqual(keys, [...GAME_KEYS].sort());
}

function restoredSokobanGame(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !hasOnlyGameKeys(value)) return null;
  if (value.schemaVersion !== SOKOBAN_SCHEMA_VERSION || value.kind !== 'sokoban') return null;
  if (!Number.isInteger(value.levelIndex) || value.levelIndex < 0 || value.levelIndex >= SOKOBAN_LEVELS.length) return null;
  const level = SOKOBAN_LEVELS[value.levelIndex];
  if (value.levelId !== level.id || value.rows !== level.rows || value.columns !== level.columns) return null;
  if (!Array.isArray(value.walls) || !arraysEqual(value.walls, level.walls)
    || !Array.isArray(value.targets) || !arraysEqual(value.targets, level.targets)) return null;
  if (!Array.isArray(value.moves) || value.moves.length > MAX_RESTORED_MOVES
    || value.moves.some((move) => !Object.hasOwn(SOKOBAN_DIRECTIONS, move))) return null;
  if (!Array.isArray(value.boxes)
    || value.boxes.length !== level.boxes.length
    || value.boxes.some((box) => !Number.isInteger(box))
    || new Set(value.boxes).size !== value.boxes.length) return null;
  if (!Number.isInteger(value.player)
    || !Number.isSafeInteger(value.steps) || value.steps < 0
    || !Number.isSafeInteger(value.pushes) || value.pushes < 0
    || !VALID_STATUSES.has(value.status)) return null;

  let replayed = baseGame(value.levelIndex);
  for (const move of value.moves) {
    const next = transition(replayed, move);
    if (!next) return null;
    replayed = next;
  }
  if (value.player !== replayed.player
    || value.status !== replayed.status
    || value.steps !== replayed.steps
    || value.pushes !== replayed.pushes
    || !arraysEqual(value.boxes, replayed.boxes)) return null;
  return replayed;
}

export function restoreSokobanGame(value) {
  try { return restoredSokobanGame(value); } catch { return null; }
}

function validatedGame(game) {
  const restored = restoredSokobanGame(game);
  if (!restored) throw new Error('SOKOBAN_GAME_INVALID');
  return restored;
}

function assertDirection(direction) {
  if (!Object.hasOwn(SOKOBAN_DIRECTIONS, direction)) throw new Error('SOKOBAN_DIRECTION_INVALID');
}

export function sokobanDirectionFromKey(key) {
  if (typeof key !== 'string') return null;
  return SOKOBAN_KEY_DIRECTIONS[key] ?? SOKOBAN_KEY_DIRECTIONS[key.toLowerCase()] ?? null;
}

export function moveSokoban(game, direction) {
  assertDirection(direction);
  const restored = validatedGame(game);
  return transition(restored, direction) ?? restored;
}

export function undoSokoban(game) {
  const restored = validatedGame(game);
  if (!restored.moves.length) return restored;
  let previous = baseGame(restored.levelIndex);
  for (const move of restored.moves.slice(0, -1)) previous = transition(previous, move);
  return previous;
}

export function selectSokobanLevel(game, level) {
  validatedGame(game);
  return baseGame(resolveLevelIndex(level));
}

export function hasNextSokobanLevel(game) {
  const restored = validatedGame(game);
  return restored.levelIndex < SOKOBAN_LEVELS.length - 1;
}

export function nextSokobanLevel(game) {
  const restored = validatedGame(game);
  return restored.levelIndex < SOKOBAN_LEVELS.length - 1
    ? baseGame(restored.levelIndex + 1)
    : restored;
}

export function serializeSokobanGame(game) {
  return JSON.stringify(validatedGame(game));
}
