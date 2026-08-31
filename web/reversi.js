export const REVERSI_SIZE = 8;
export const REVERSI_CELL_COUNT = REVERSI_SIZE ** 2;
export const REVERSI_SCHEMA_VERSION = 1;
export const REVERSI_STORAGE_KEY = 'kai-play:reversi:v1';
export const REVERSI_HUMAN_SIDE = 'black';
export const REVERSI_AI_SIDE = 'white';

export const REVERSI_DIFFICULTIES = Object.freeze({
  beginner: Object.freeze({ key: 'beginner', label: '入门', searchDepth: 0 }),
  standard: Object.freeze({ key: 'standard', label: '标准', searchDepth: 1 }),
  challenge: Object.freeze({ key: 'challenge', label: '挑战', searchDepth: 4 }),
});

const REVERSI_SIDES = Object.freeze([REVERSI_HUMAN_SIDE, REVERSI_AI_SIDE]);
const REVERSI_STATUSES = Object.freeze(['playing', 'finished']);
const REVERSI_END_REASONS = Object.freeze(['board-full', 'no-legal-moves']);
const REVERSI_DIRECTIONS = Object.freeze([
  Object.freeze([-1, -1]),
  Object.freeze([-1, 0]),
  Object.freeze([-1, 1]),
  Object.freeze([0, -1]),
  Object.freeze([0, 1]),
  Object.freeze([1, -1]),
  Object.freeze([1, 0]),
  Object.freeze([1, 1]),
]);
const MAX_REVERSI_MOVES = REVERSI_CELL_COUNT - 4;
const GAME_KEYS = Object.freeze([
  'schemaVersion', 'kind', 'mode', 'difficulty', 'size', 'humanSide', 'aiSide',
  'board', 'turn', 'status', 'winner', 'endReason', 'score', 'moveCount',
  'passCount', 'history', 'lastMove', 'lastPass',
]);
const MOVE_KEYS = Object.freeze(['index', 'row', 'column', 'side', 'flipped', 'passedSide']);
const SCORE_KEYS = Object.freeze(['black', 'white', 'empty']);

// Corners remain valuable throughout the game; squares next to an empty corner
// are deliberately expensive so every level above beginner avoids the classic trap.
const POSITION_WEIGHTS = Object.freeze([
  120, -28, 18, 7, 7, 18, -28, 120,
  -28, -45, -6, -5, -5, -6, -45, -28,
  18, -6, 15, 4, 4, 15, -6, 18,
  7, -5, 4, 3, 3, 4, -5, 7,
  7, -5, 4, 3, 3, 4, -5, 7,
  18, -6, 15, 4, 4, 15, -6, 18,
  -28, -45, -6, -5, -5, -6, -45, -28,
  120, -28, 18, 7, 7, 18, -28, 120,
]);

function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isReversiSide(value) {
  return REVERSI_SIDES.includes(value);
}

function oppositeSide(side) {
  return side === REVERSI_HUMAN_SIDE ? REVERSI_AI_SIDE : REVERSI_HUMAN_SIDE;
}

function inBounds(row, column) {
  return row >= 0 && row < REVERSI_SIZE && column >= 0 && column < REVERSI_SIZE;
}

function uncheckedPosition(row, column) {
  return row * REVERSI_SIZE + column;
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

export function reversiPosition(row, column) {
  if (!Number.isInteger(row) || !Number.isInteger(column) || !inBounds(row, column)) {
    throw new Error('REVERSI_POSITION_INVALID');
  }
  return uncheckedPosition(row, column);
}

export function reversiCoordinates(index) {
  if (!Number.isInteger(index) || index < 0 || index >= REVERSI_CELL_COUNT) {
    throw new Error('REVERSI_POSITION_INVALID');
  }
  return { row: Math.floor(index / REVERSI_SIZE), column: index % REVERSI_SIZE };
}

export function createReversiBoard() {
  const board = Array(REVERSI_CELL_COUNT).fill(null);
  board[uncheckedPosition(3, 3)] = REVERSI_AI_SIDE;
  board[uncheckedPosition(3, 4)] = REVERSI_HUMAN_SIDE;
  board[uncheckedPosition(4, 3)] = REVERSI_HUMAN_SIDE;
  board[uncheckedPosition(4, 4)] = REVERSI_AI_SIDE;
  return board;
}

export function isValidReversiBoard(board) {
  return Array.isArray(board)
    && board.length === REVERSI_CELL_COUNT
    && board.every((cell) => cell === null || isReversiSide(cell));
}

function assertBoard(board) {
  if (!isValidReversiBoard(board)) throw new Error('REVERSI_BOARD_INVALID');
}

function assertSide(side) {
  if (!isReversiSide(side)) throw new Error('REVERSI_SIDE_INVALID');
}

export function getReversiFlips(board, index, side) {
  assertBoard(board);
  const origin = reversiCoordinates(index);
  assertSide(side);
  if (board[index] !== null) return [];
  const opponent = oppositeSide(side);
  const flips = [];

  for (const [rowStep, columnStep] of REVERSI_DIRECTIONS) {
    const ray = [];
    let row = origin.row + rowStep;
    let column = origin.column + columnStep;
    while (inBounds(row, column) && board[uncheckedPosition(row, column)] === opponent) {
      ray.push(uncheckedPosition(row, column));
      row += rowStep;
      column += columnStep;
    }
    if (ray.length && inBounds(row, column) && board[uncheckedPosition(row, column)] === side) {
      flips.push(...ray);
    }
  }
  return flips.sort((left, right) => left - right);
}

export function getReversiLegalMoves(board, side) {
  assertBoard(board);
  assertSide(side);
  const moves = [];
  for (let index = 0; index < REVERSI_CELL_COUNT; index += 1) {
    if (board[index] !== null) continue;
    const flips = getReversiFlips(board, index, side);
    if (!flips.length) continue;
    moves.push({ index, ...reversiCoordinates(index), flips });
  }
  return moves;
}

export function isReversiLegalMove(board, index, side) {
  return getReversiFlips(board, index, side).length > 0;
}

export function getReversiScore(board) {
  assertBoard(board);
  let black = 0;
  let white = 0;
  for (const cell of board) {
    if (cell === REVERSI_HUMAN_SIDE) black += 1;
    else if (cell === REVERSI_AI_SIDE) white += 1;
  }
  return { black, white, empty: REVERSI_CELL_COUNT - black - white };
}

function winnerFromScore(score) {
  if (score.black === score.white) return null;
  return score.black > score.white ? REVERSI_HUMAN_SIDE : REVERSI_AI_SIDE;
}

function normalizeDifficulty(value) {
  return Object.hasOwn(REVERSI_DIFFICULTIES, value) ? value : 'standard';
}

export function newReversiGame({ difficulty = 'standard' } = {}) {
  const board = createReversiBoard();
  return {
    schemaVersion: REVERSI_SCHEMA_VERSION,
    kind: 'reversi',
    mode: 'ai',
    difficulty: normalizeDifficulty(difficulty),
    size: REVERSI_SIZE,
    humanSide: REVERSI_HUMAN_SIDE,
    aiSide: REVERSI_AI_SIDE,
    board,
    turn: REVERSI_HUMAN_SIDE,
    status: 'playing',
    winner: null,
    endReason: null,
    score: getReversiScore(board),
    moveCount: 0,
    passCount: 0,
    history: [],
    lastMove: null,
    lastPass: null,
  };
}

function applyMoveUnchecked(game, index) {
  const side = game.turn;
  const flips = getReversiFlips(game.board, index, side);
  if (!flips.length) throw new Error('REVERSI_MOVE_ILLEGAL');
  const board = [...game.board];
  board[index] = side;
  for (const flippedIndex of flips) board[flippedIndex] = side;

  const opponent = oppositeSide(side);
  const score = getReversiScore(board);
  const boardFull = score.empty === 0;
  const opponentMoves = boardFull ? [] : getReversiLegalMoves(board, opponent);
  const sameSideMoves = boardFull || opponentMoves.length ? [] : getReversiLegalMoves(board, side);
  const noMovesForEitherSide = !boardFull && !opponentMoves.length && !sameSideMoves.length;
  const finished = boardFull || noMovesForEitherSide;
  const passedSide = !finished && !opponentMoves.length ? opponent : null;
  const move = {
    index,
    ...reversiCoordinates(index),
    side,
    flipped: flips,
    passedSide,
  };

  return {
    ...game,
    board,
    turn: passedSide ? side : opponent,
    status: finished ? 'finished' : 'playing',
    winner: finished ? winnerFromScore(score) : null,
    endReason: boardFull ? 'board-full' : noMovesForEitherSide ? 'no-legal-moves' : null,
    score,
    moveCount: game.moveCount + 1,
    passCount: game.passCount + Number(Boolean(passedSide)),
    history: [...game.history, move],
    lastMove: move,
    lastPass: passedSide,
  };
}

function moveIsExact(value, expected) {
  return exactKeys(value, MOVE_KEYS)
    && value.index === expected.index
    && value.row === expected.row
    && value.column === expected.column
    && value.side === expected.side
    && value.passedSide === expected.passedSide
    && arraysEqual(value.flipped, expected.flipped);
}

function scoreIsExact(value, expected) {
  return exactKeys(value, SCORE_KEYS)
    && value.black === expected.black
    && value.white === expected.white
    && value.empty === expected.empty;
}

function replayReversiHistory(history, difficulty) {
  let game = newReversiGame({ difficulty });
  for (const entry of history) {
    if (!exactKeys(entry, MOVE_KEYS)
      || !Number.isInteger(entry.index)
      || entry.side !== game.turn
      || !Array.isArray(entry.flipped)
      || !entry.flipped.every((index) => Number.isInteger(index))) {
      throw new Error('REVERSI_HISTORY_INVALID');
    }
    if (game.status !== 'playing') throw new Error('REVERSI_HISTORY_INVALID');
    const next = applyMoveUnchecked(game, entry.index);
    if (!moveIsExact(entry, next.lastMove)) throw new Error('REVERSI_HISTORY_INVALID');
    game = next;
  }
  return game;
}

function restoredReversiGame(raw) {
  const value = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (!exactKeys(value, GAME_KEYS)
    || value.schemaVersion !== REVERSI_SCHEMA_VERSION
    || value.kind !== 'reversi'
    || value.mode !== 'ai'
    || !Object.hasOwn(REVERSI_DIFFICULTIES, value.difficulty)
    || value.size !== REVERSI_SIZE
    || value.humanSide !== REVERSI_HUMAN_SIDE
    || value.aiSide !== REVERSI_AI_SIDE
    || !isValidReversiBoard(value.board)
    || !isReversiSide(value.turn)
    || !REVERSI_STATUSES.includes(value.status)
    || (value.winner !== null && !isReversiSide(value.winner))
    || (value.endReason !== null && !REVERSI_END_REASONS.includes(value.endReason))
    || !Number.isSafeInteger(value.moveCount)
    || value.moveCount < 0
    || !Number.isSafeInteger(value.passCount)
    || value.passCount < 0
    || !Array.isArray(value.history)
    || value.history.length !== value.moveCount
    || value.history.length > MAX_REVERSI_MOVES) return null;

  const restored = replayReversiHistory(value.history, value.difficulty);
  if (!arraysEqual(value.board, restored.board)
    || value.turn !== restored.turn
    || value.status !== restored.status
    || value.winner !== restored.winner
    || value.endReason !== restored.endReason
    || !scoreIsExact(value.score, restored.score)
    || value.moveCount !== restored.moveCount
    || value.passCount !== restored.passCount
    || value.lastPass !== restored.lastPass
    || (value.lastMove === null) !== (restored.lastMove === null)
    || (value.lastMove !== null && !moveIsExact(value.lastMove, restored.lastMove))) return null;

  return restored;
}

export function restoreReversiGame(raw) {
  try {
    return restoredReversiGame(raw);
  } catch {
    return null;
  }
}

function assertGame(game) {
  const restored = restoreReversiGame(game);
  if (!restored) throw new Error('REVERSI_GAME_INVALID');
  return restored;
}

export function playReversiMove(game, index) {
  const restored = assertGame(game);
  reversiCoordinates(index);
  if (restored.status !== 'playing') throw new Error('REVERSI_GAME_FINISHED');
  if (restored.board[index] !== null) throw new Error('REVERSI_CELL_OCCUPIED');
  if (!isReversiLegalMove(restored.board, index, restored.turn)) throw new Error('REVERSI_MOVE_ILLEGAL');
  return applyMoveUnchecked(restored, index);
}

function boardAfterMove(board, move, side) {
  const next = [...board];
  next[move.index] = side;
  for (const index of move.flips) next[index] = side;
  return next;
}

function terminalBoardScore(board) {
  const score = getReversiScore(board);
  const difference = score.white - score.black;
  if (difference === 0) return 0;
  return Math.sign(difference) * (100_000 + Math.abs(difference) * 1_000);
}

function boardHeuristic(board) {
  const score = getReversiScore(board);
  let positional = 0;
  let frontierBlack = 0;
  let frontierWhite = 0;
  for (let index = 0; index < board.length; index += 1) {
    const side = board[index];
    if (!side) continue;
    positional += POSITION_WEIGHTS[index] * (side === REVERSI_AI_SIDE ? 1 : -1);
    const { row, column } = reversiCoordinates(index);
    const frontier = REVERSI_DIRECTIONS.some(([rowStep, columnStep]) => {
      const nextRow = row + rowStep;
      const nextColumn = column + columnStep;
      return inBounds(nextRow, nextColumn) && board[uncheckedPosition(nextRow, nextColumn)] === null;
    });
    if (frontier && side === REVERSI_AI_SIDE) frontierWhite += 1;
    else if (frontier) frontierBlack += 1;
  }
  const whiteMobility = getReversiLegalMoves(board, REVERSI_AI_SIDE).length;
  const blackMobility = getReversiLegalMoves(board, REVERSI_HUMAN_SIDE).length;
  const occupied = REVERSI_CELL_COUNT - score.empty;
  const discWeight = occupied < 44 ? 1 : occupied < 56 ? 4 : 12;
  return positional * 4
    + (whiteMobility - blackMobility) * 11
    + (frontierBlack - frontierWhite) * 5
    + (score.white - score.black) * discWeight;
}

function minimax(board, side, depth, alpha, beta, consecutivePasses) {
  const moves = getReversiLegalMoves(board, side);
  if (moves.length === 0) {
    if (consecutivePasses === 1 || board.every(Boolean)) return terminalBoardScore(board);
    return minimax(board, oppositeSide(side), depth, alpha, beta, consecutivePasses + 1);
  }
  if (depth === 0) return boardHeuristic(board);

  if (side === REVERSI_AI_SIDE) {
    let value = Number.NEGATIVE_INFINITY;
    for (const move of moves) {
      value = Math.max(value, minimax(boardAfterMove(board, move, side), oppositeSide(side), depth - 1, alpha, beta, 0));
      alpha = Math.max(alpha, value);
      if (alpha >= beta) break;
    }
    return value;
  }

  let value = Number.POSITIVE_INFINITY;
  for (const move of moves) {
    value = Math.min(value, minimax(boardAfterMove(board, move, side), oppositeSide(side), depth - 1, alpha, beta, 0));
    beta = Math.min(beta, value);
    if (alpha >= beta) break;
  }
  return value;
}

function standardMoveScore(board, move) {
  const next = boardAfterMove(board, move, REVERSI_AI_SIDE);
  const opponentMobility = getReversiLegalMoves(next, REVERSI_HUMAN_SIDE).length;
  return POSITION_WEIGHTS[move.index] * 5 + move.flips.length * 14 - opponentMobility * 8 + boardHeuristic(next);
}

export function chooseReversiMove(game, requestedDifficulty = game?.difficulty) {
  const restored = assertGame(game);
  if (restored.status !== 'playing' || restored.turn !== REVERSI_AI_SIDE) return null;
  if (!Object.hasOwn(REVERSI_DIFFICULTIES, requestedDifficulty)) throw new Error('REVERSI_DIFFICULTY_INVALID');
  const moves = getReversiLegalMoves(restored.board, REVERSI_AI_SIDE);
  if (!moves.length) return null;

  let evaluated;
  let reason;
  if (requestedDifficulty === 'beginner') {
    evaluated = moves.map((move) => ({ move, score: -move.index }));
    reason = 'first-legal';
  } else if (requestedDifficulty === 'standard') {
    evaluated = moves.map((move) => ({ move, score: standardMoveScore(restored.board, move) }));
    reason = 'positional';
  } else {
    const depth = REVERSI_DIFFICULTIES.challenge.searchDepth;
    evaluated = moves.map((move) => ({
      move,
      score: minimax(
        boardAfterMove(restored.board, move, REVERSI_AI_SIDE),
        REVERSI_HUMAN_SIDE,
        depth - 1,
        Number.NEGATIVE_INFINITY,
        Number.POSITIVE_INFINITY,
        0,
      ),
    }));
    reason = 'search';
  }
  evaluated.sort((left, right) => right.score - left.score || left.move.index - right.move.index);
  const selected = evaluated[0];
  return {
    ...selected.move,
    side: REVERSI_AI_SIDE,
    difficulty: requestedDifficulty,
    reason,
    score: selected.score,
  };
}

export function playReversiHumanMove(game, index) {
  const restored = assertGame(game);
  if (restored.status !== 'playing') throw new Error('REVERSI_GAME_FINISHED');
  if (restored.turn !== REVERSI_HUMAN_SIDE) throw new Error('REVERSI_HUMAN_TURN_REQUIRED');
  let next = playReversiMove(restored, index);
  while (next.status === 'playing' && next.turn === REVERSI_AI_SIDE) {
    const aiMove = chooseReversiMove(next);
    if (!aiMove) throw new Error('REVERSI_AI_MOVE_UNAVAILABLE');
    next = playReversiMove(next, aiMove.index);
  }
  return next;
}

export function restartReversiGame(difficulty = 'standard') {
  return newReversiGame({ difficulty });
}

export function serializeReversiGame(game) {
  const restored = restoreReversiGame(game);
  if (!restored) throw new Error('REVERSI_GAME_INVALID');
  return JSON.stringify(restored);
}

export function saveReversiGame(game, storage, key = REVERSI_STORAGE_KEY) {
  try {
    const target = storage === undefined ? globalThis.localStorage : storage;
    if (!target || typeof target.setItem !== 'function' || typeof key !== 'string' || !key) return false;
    target.setItem(key, serializeReversiGame(game));
    return true;
  } catch {
    return false;
  }
}

export function loadReversiGame(storage, key = REVERSI_STORAGE_KEY) {
  try {
    const target = storage === undefined ? globalThis.localStorage : storage;
    if (!target || typeof target.getItem !== 'function' || typeof key !== 'string' || !key) return null;
    const raw = target.getItem(key);
    return raw === null ? null : restoreReversiGame(raw);
  } catch {
    return null;
  }
}
