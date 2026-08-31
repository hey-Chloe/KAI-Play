export const GOMOKU_SIZE = 15;
export const GOMOKU_CELL_COUNT = GOMOKU_SIZE ** 2;
export const GOMOKU_SCHEMA_VERSION = 1;
export const GOMOKU_STORAGE_KEY = 'kai-play:gomoku:v1';
export const GOMOKU_HUMAN_SIDE = 'black';
export const GOMOKU_AI_SIDE = 'white';

const GOMOKU_SIDES = Object.freeze([GOMOKU_HUMAN_SIDE, GOMOKU_AI_SIDE]);
const GOMOKU_DIRECTIONS = Object.freeze([
  Object.freeze([0, 1]),
  Object.freeze([1, 0]),
  Object.freeze([1, 1]),
  Object.freeze([1, -1]),
]);
const MAX_RESTORED_MOVES = GOMOKU_CELL_COUNT;

function isGomokuSide(value) {
  return GOMOKU_SIDES.includes(value);
}

function oppositeSide(side) {
  return side === GOMOKU_HUMAN_SIDE ? GOMOKU_AI_SIDE : GOMOKU_HUMAN_SIDE;
}

function inBounds(row, column) {
  return row >= 0 && row < GOMOKU_SIZE && column >= 0 && column < GOMOKU_SIZE;
}

function positionUnchecked(row, column) {
  return row * GOMOKU_SIZE + column;
}

export function gomokuPosition(row, column) {
  if (!Number.isInteger(row) || !Number.isInteger(column) || !inBounds(row, column)) {
    throw new Error('GOMOKU_POSITION_INVALID');
  }
  return positionUnchecked(row, column);
}

export function gomokuCoordinates(index) {
  if (!Number.isInteger(index) || index < 0 || index >= GOMOKU_CELL_COUNT) {
    throw new Error('GOMOKU_POSITION_INVALID');
  }
  return { row: Math.floor(index / GOMOKU_SIZE), column: index % GOMOKU_SIZE };
}

export function createGomokuBoard() {
  return Array(GOMOKU_CELL_COUNT).fill(null);
}

function hasGomokuBoardShape(board) {
  return Array.isArray(board)
    && board.length === GOMOKU_CELL_COUNT
    && board.every((cell) => cell === null || isGomokuSide(cell));
}

function stoneCounts(board) {
  let black = 0;
  let white = 0;
  for (const cell of board) {
    if (cell === GOMOKU_HUMAN_SIDE) black += 1;
    else if (cell === GOMOKU_AI_SIDE) white += 1;
  }
  return { black, white };
}

export function isValidGomokuBoard(board) {
  if (!hasGomokuBoardShape(board)) return false;
  const counts = stoneCounts(board);
  return counts.black === counts.white || counts.black === counts.white + 1;
}

function assertGomokuBoard(board) {
  if (!hasGomokuBoardShape(board)) throw new Error('GOMOKU_BOARD_INVALID');
}

function collectDirection(board, index, side, rowStep, columnStep) {
  const origin = gomokuCoordinates(index);
  const before = [];
  let row = origin.row - rowStep;
  let column = origin.column - columnStep;
  while (inBounds(row, column) && board[positionUnchecked(row, column)] === side) {
    before.push(positionUnchecked(row, column));
    row -= rowStep;
    column -= columnStep;
  }
  before.reverse();

  const after = [];
  row = origin.row + rowStep;
  column = origin.column + columnStep;
  while (inBounds(row, column) && board[positionUnchecked(row, column)] === side) {
    after.push(positionUnchecked(row, column));
    row += rowStep;
    column += columnStep;
  }
  return [...before, index, ...after];
}

export function getGomokuWinningLine(board, lastIndex = null) {
  assertGomokuBoard(board);
  if (lastIndex !== null) {
    gomokuCoordinates(lastIndex);
    const side = board[lastIndex];
    if (!side) return [];
    for (const [rowStep, columnStep] of GOMOKU_DIRECTIONS) {
      const line = collectDirection(board, lastIndex, side, rowStep, columnStep);
      if (line.length >= 5) return line;
    }
    return [];
  }

  for (let index = 0; index < board.length; index += 1) {
    if (!board[index]) continue;
    for (const [rowStep, columnStep] of GOMOKU_DIRECTIONS) {
      const line = collectDirection(board, index, board[index], rowStep, columnStep);
      if (line.length >= 5) return line;
    }
  }
  return [];
}

export function getGomokuWinner(board, lastIndex = null) {
  const line = getGomokuWinningLine(board, lastIndex);
  return line.length ? board[line[0]] : null;
}

export function getGomokuStatus(board, lastIndex = null) {
  assertGomokuBoard(board);
  const winningLine = getGomokuWinningLine(board, lastIndex);
  if (winningLine.length) {
    return {
      status: 'finished',
      winner: board[winningLine[0]],
      endReason: 'five-in-a-row',
      winningLine,
    };
  }
  if (board.every(Boolean)) {
    return { status: 'finished', winner: null, endReason: 'board-full', winningLine: [] };
  }
  return { status: 'playing', winner: null, endReason: null, winningLine: [] };
}

export function newGomokuGame() {
  return {
    schemaVersion: GOMOKU_SCHEMA_VERSION,
    kind: 'gomoku',
    mode: 'ai',
    size: GOMOKU_SIZE,
    humanSide: GOMOKU_HUMAN_SIDE,
    aiSide: GOMOKU_AI_SIDE,
    board: createGomokuBoard(),
    turn: GOMOKU_HUMAN_SIDE,
    status: 'playing',
    winner: null,
    endReason: null,
    winningLine: [],
    moveCount: 0,
    history: [],
    lastMove: null,
  };
}

function assertGomokuGame(game) {
  if (!game || typeof game !== 'object' || game.kind !== 'gomoku' || game.mode !== 'ai') {
    throw new Error('GOMOKU_GAME_INVALID');
  }
  if (game.size !== GOMOKU_SIZE
    || game.humanSide !== GOMOKU_HUMAN_SIDE
    || game.aiSide !== GOMOKU_AI_SIDE
    || !isGomokuSide(game.turn)
    || !isValidGomokuBoard(game.board)
    || !Array.isArray(game.history)
    || !Number.isSafeInteger(game.moveCount)
    || game.moveCount !== game.history.length) {
    throw new Error('GOMOKU_GAME_INVALID');
  }
  if (game.status !== 'playing' && game.status !== 'finished') throw new Error('GOMOKU_GAME_INVALID');
  const counts = stoneCounts(game.board);
  if (counts.black + counts.white !== game.moveCount) throw new Error('GOMOKU_GAME_INVALID');
  const expectedTurn = counts.black === counts.white ? GOMOKU_HUMAN_SIDE : GOMOKU_AI_SIDE;
  if (game.turn !== expectedTurn) throw new Error('GOMOKU_TURN_INVALID');
}

export function playGomokuMove(game, index) {
  assertGomokuGame(game);
  const { row, column } = gomokuCoordinates(index);
  if (game.status !== 'playing') throw new Error('GOMOKU_GAME_FINISHED');
  if (game.board[index] !== null) throw new Error('GOMOKU_CELL_OCCUPIED');

  const side = game.turn;
  const board = [...game.board];
  board[index] = side;
  const outcome = getGomokuStatus(board, index);
  const move = { index, row, column, side };
  return {
    ...game,
    board,
    turn: oppositeSide(side),
    ...outcome,
    moveCount: game.moveCount + 1,
    history: [...game.history, move],
    lastMove: move,
  };
}

function virtualLineMetrics(board, index, side, rowStep, columnStep) {
  const origin = gomokuCoordinates(index);
  let length = 1;
  let openEnds = 0;

  for (const direction of [-1, 1]) {
    let row = origin.row + rowStep * direction;
    let column = origin.column + columnStep * direction;
    while (inBounds(row, column) && board[positionUnchecked(row, column)] === side) {
      length += 1;
      row += rowStep * direction;
      column += columnStep * direction;
    }
    if (inBounds(row, column) && board[positionUnchecked(row, column)] === null) openEnds += 1;
  }
  return { length, openEnds };
}

function isVirtualWin(board, index, side) {
  return GOMOKU_DIRECTIONS.some(([rowStep, columnStep]) =>
    virtualLineMetrics(board, index, side, rowStep, columnStep).length >= 5);
}

function shapeScore(length, openEnds) {
  if (length >= 5) return 10_000_000;
  if (openEnds === 0) return 0;
  const base = [0, 8, 70, 900, 45_000][length] || 0;
  return openEnds === 2 ? base * 3 : base;
}

function sidePotential(board, index, side) {
  let total = 0;
  for (const [rowStep, columnStep] of GOMOKU_DIRECTIONS) {
    const metrics = virtualLineMetrics(board, index, side, rowStep, columnStep);
    total += shapeScore(metrics.length, metrics.openEnds);
  }
  return total;
}

function candidateIndexes(board) {
  const occupied = board.flatMap((cell, index) => cell ? [index] : []);
  if (!occupied.length) return [gomokuPosition(7, 7)];
  const candidates = new Set();
  for (const index of occupied) {
    const { row, column } = gomokuCoordinates(index);
    for (let rowOffset = -2; rowOffset <= 2; rowOffset += 1) {
      for (let columnOffset = -2; columnOffset <= 2; columnOffset += 1) {
        const nextRow = row + rowOffset;
        const nextColumn = column + columnOffset;
        if (!inBounds(nextRow, nextColumn)) continue;
        const candidate = positionUnchecked(nextRow, nextColumn);
        if (board[candidate] === null) candidates.add(candidate);
      }
    }
  }
  return [...candidates].sort((left, right) => left - right);
}

function centreDistance(index) {
  const { row, column } = gomokuCoordinates(index);
  return Math.abs(7 - row) + Math.abs(7 - column);
}

function candidateScore(board, index) {
  const attack = sidePotential(board, index, GOMOKU_AI_SIDE);
  const defence = sidePotential(board, index, GOMOKU_HUMAN_SIDE);
  let neighbours = 0;
  const { row, column } = gomokuCoordinates(index);
  for (let rowOffset = -1; rowOffset <= 1; rowOffset += 1) {
    for (let columnOffset = -1; columnOffset <= 1; columnOffset += 1) {
      if (rowOffset === 0 && columnOffset === 0) continue;
      const nextRow = row + rowOffset;
      const nextColumn = column + columnOffset;
      if (inBounds(nextRow, nextColumn) && board[positionUnchecked(nextRow, nextColumn)]) neighbours += 1;
    }
  }
  return attack * 1.05 + defence + neighbours * 5 - centreDistance(index);
}

function bestCandidate(board, indexes) {
  return indexes
    .map((index) => ({ index, score: candidateScore(board, index) }))
    .sort((left, right) =>
      right.score - left.score
      || centreDistance(left.index) - centreDistance(right.index)
      || left.index - right.index)[0] || null;
}

export function chooseGomokuMove(game) {
  assertGomokuGame(game);
  if (game.status !== 'playing' || game.turn !== GOMOKU_AI_SIDE) return null;
  const candidates = candidateIndexes(game.board);
  if (!candidates.length) return null;

  const wins = candidates.filter((index) => isVirtualWin(game.board, index, GOMOKU_AI_SIDE));
  const threats = candidates.filter((index) => isVirtualWin(game.board, index, GOMOKU_HUMAN_SIDE));
  const reason = wins.length ? 'win' : threats.length ? 'block' : 'build';
  const best = bestCandidate(game.board, wins.length ? wins : threats.length ? threats : candidates);
  if (!best) return null;
  return { ...best, ...gomokuCoordinates(best.index), side: GOMOKU_AI_SIDE, reason };
}

export function playGomokuHumanMove(game, index) {
  assertGomokuGame(game);
  if (game.status !== 'playing') throw new Error('GOMOKU_GAME_FINISHED');
  if (game.turn !== GOMOKU_HUMAN_SIDE) throw new Error('GOMOKU_HUMAN_TURN_REQUIRED');
  let next = playGomokuMove(game, index);
  if (next.status !== 'playing') return next;
  const aiMove = chooseGomokuMove(next);
  return aiMove ? playGomokuMove(next, aiMove.index) : next;
}

export function restartGomokuGame() {
  return newGomokuGame();
}

function boardsEqual(left, right) {
  return Array.isArray(left)
    && left.length === right.length
    && left.every((cell, index) => cell === right[index]);
}

function replayGomokuHistory(history) {
  let game = newGomokuGame();
  for (const entry of history) {
    if (!entry || typeof entry !== 'object' || !Number.isInteger(entry.index)) {
      throw new Error('GOMOKU_HISTORY_INVALID');
    }
    if (entry.side !== undefined && entry.side !== game.turn) throw new Error('GOMOKU_HISTORY_INVALID');
    game = playGomokuMove(game, entry.index);
  }
  return game;
}

export function restoreGomokuGame(raw) {
  try {
    const value = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!value || typeof value !== 'object' || value.schemaVersion !== GOMOKU_SCHEMA_VERSION) return null;
    if (value.kind !== 'gomoku'
      || value.mode !== 'ai'
      || value.size !== GOMOKU_SIZE
      || value.humanSide !== GOMOKU_HUMAN_SIDE
      || value.aiSide !== GOMOKU_AI_SIDE
      || !Array.isArray(value.history)
      || value.history.length > MAX_RESTORED_MOVES) return null;
    const restored = replayGomokuHistory(value.history);
    if (value.board !== undefined && (!hasGomokuBoardShape(value.board) || !boardsEqual(value.board, restored.board))) return null;
    return restored;
  } catch {
    return null;
  }
}

export function serializeGomokuGame(game) {
  const restored = restoreGomokuGame(game);
  if (!restored) throw new Error('GOMOKU_GAME_INVALID');
  return JSON.stringify(restored);
}

export function saveGomokuGame(game, storage, key = GOMOKU_STORAGE_KEY) {
  try {
    const target = storage === undefined ? globalThis.localStorage : storage;
    if (!target || typeof target.setItem !== 'function' || typeof key !== 'string' || !key) return false;
    target.setItem(key, serializeGomokuGame(game));
    return true;
  } catch {
    return false;
  }
}

export function loadGomokuGame(storage, key = GOMOKU_STORAGE_KEY) {
  try {
    const target = storage === undefined ? globalThis.localStorage : storage;
    if (!target || typeof target.getItem !== 'function' || typeof key !== 'string' || !key) return null;
    const raw = target.getItem(key);
    return raw === null ? null : restoreGomokuGame(raw);
  } catch {
    return null;
  }
}
