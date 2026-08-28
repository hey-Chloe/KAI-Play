export const XIANGQI_ROWS = 10;
export const XIANGQI_COLUMNS = 9;
export const XIANGQI_SCHEMA_VERSION = 1;

export const XIANGQI_DIFFICULTIES = Object.freeze({
  beginner: Object.freeze({ key: 'beginner', label: '初学', depth: 1, nodeLimit: 4_000 }),
  standard: Object.freeze({ key: 'standard', label: '标准', depth: 2, nodeLimit: 24_000 }),
  challenge: Object.freeze({ key: 'challenge', label: '挑战', depth: 3, nodeLimit: 60_000 }),
});

const SIDES = Object.freeze(['red', 'black']);
const PIECE_TYPES = Object.freeze(['general', 'advisor', 'elephant', 'horse', 'rook', 'cannon', 'soldier']);
const PIECE_LIMITS = Object.freeze({ general: 1, advisor: 2, elephant: 2, horse: 2, rook: 2, cannon: 2, soldier: 5 });
const PIECE_VALUES = Object.freeze({ general: 100_000, rook: 900, cannon: 450, horse: 400, elephant: 210, advisor: 210, soldier: 100 });
const LABELS = Object.freeze({
  red: Object.freeze({ general: '帅', advisor: '仕', elephant: '相', horse: '马', rook: '车', cannon: '炮', soldier: '兵' }),
  black: Object.freeze({ general: '将', advisor: '士', elephant: '象', horse: '马', rook: '车', cannon: '炮', soldier: '卒' }),
});
const MAX_RESTORED_MOVES = 2_048;
const MATE_SCORE = 1_000_000;

function oppositeSide(side) {
  return side === 'red' ? 'black' : 'red';
}

function isSide(value) {
  return SIDES.includes(value);
}

function isPieceType(value) {
  return PIECE_TYPES.includes(value);
}

function normalizeDifficulty(value) {
  return Object.hasOwn(XIANGQI_DIFFICULTIES, value) ? value : 'standard';
}

function inBounds(row, column) {
  return row >= 0 && row < XIANGQI_ROWS && column >= 0 && column < XIANGQI_COLUMNS;
}

function positionUnchecked(row, column) {
  return row * XIANGQI_COLUMNS + column;
}

export function xiangqiPosition(row, column) {
  if (!Number.isInteger(row) || !Number.isInteger(column) || !inBounds(row, column)) {
    throw new Error('XIANGQI_POSITION_INVALID');
  }
  return positionUnchecked(row, column);
}

export function xiangqiCoordinates(index) {
  if (!Number.isInteger(index) || index < 0 || index >= XIANGQI_ROWS * XIANGQI_COLUMNS) {
    throw new Error('XIANGQI_POSITION_INVALID');
  }
  return { row: Math.floor(index / XIANGQI_COLUMNS), column: index % XIANGQI_COLUMNS };
}

export function createXiangqiPiece(side, type, id) {
  if (!isSide(side) || !isPieceType(type) || typeof id !== 'string' || !id || id.length > 80) {
    throw new Error('XIANGQI_PIECE_INVALID');
  }
  return Object.freeze({ id, side, type });
}

function placePiece(board, row, column, side, type, ordinal) {
  board[positionUnchecked(row, column)] = createXiangqiPiece(side, type, `${side}-${type}-${ordinal}`);
}

export function createXiangqiBoard() {
  const board = Array(XIANGQI_ROWS * XIANGQI_COLUMNS).fill(null);
  const backRank = ['rook', 'horse', 'elephant', 'advisor', 'general', 'advisor', 'elephant', 'horse', 'rook'];
  const ordinals = new Map();
  const nextOrdinal = (side, type) => {
    const key = `${side}:${type}`;
    const value = (ordinals.get(key) || 0) + 1;
    ordinals.set(key, value);
    return value;
  };
  for (const side of SIDES) {
    const row = side === 'black' ? 0 : 9;
    backRank.forEach((type, column) => placePiece(board, row, column, side, type, nextOrdinal(side, type)));
    const cannonRow = side === 'black' ? 2 : 7;
    for (const column of [1, 7]) placePiece(board, cannonRow, column, side, 'cannon', nextOrdinal(side, 'cannon'));
    const soldierRow = side === 'black' ? 3 : 6;
    for (const column of [0, 2, 4, 6, 8]) placePiece(board, soldierRow, column, side, 'soldier', nextOrdinal(side, 'soldier'));
  }
  return board;
}

function isXiangqiPiece(piece) {
  return piece !== null
    && typeof piece === 'object'
    && isSide(piece.side)
    && isPieceType(piece.type)
    && typeof piece.id === 'string'
    && piece.id.length > 0
    && piece.id.length <= 80;
}

function isXiangqiBoard(board, { requireGenerals = true } = {}) {
  if (!Array.isArray(board) || board.length !== XIANGQI_ROWS * XIANGQI_COLUMNS) return false;
  const ids = new Set();
  const counts = new Map();
  for (const piece of board) {
    if (piece === null) continue;
    if (!isXiangqiPiece(piece) || ids.has(piece.id)) return false;
    ids.add(piece.id);
    const key = `${piece.side}:${piece.type}`;
    const count = (counts.get(key) || 0) + 1;
    if (count > PIECE_LIMITS[piece.type]) return false;
    counts.set(key, count);
  }
  if (!requireGenerals) return true;
  return SIDES.every((side) => counts.get(`${side}:general`) === 1);
}

function assertXiangqiBoard(board, options) {
  if (!isXiangqiBoard(board, options)) throw new Error('XIANGQI_BOARD_INVALID');
}

function palaceContains(side, row, column) {
  return column >= 3 && column <= 5 && (side === 'red' ? row >= 7 && row <= 9 : row >= 0 && row <= 2);
}

function elephantSideContains(side, row) {
  return side === 'red' ? row >= 5 : row <= 4;
}

function moveRecord(board, from, to) {
  return Object.freeze({ from, to, piece: board[from], captured: board[to] });
}

function addStepMove(board, moves, piece, from, row, column) {
  if (!inBounds(row, column)) return;
  const to = positionUnchecked(row, column);
  const target = board[to];
  if (!target || target.side !== piece.side) moves.push(moveRecord(board, from, to));
}

function rayMoves(board, from, piece, directions, cannon = false) {
  const { row, column } = xiangqiCoordinates(from);
  const moves = [];
  for (const [rowStep, columnStep] of directions) {
    let nextRow = row + rowStep;
    let nextColumn = column + columnStep;
    let screenFound = false;
    while (inBounds(nextRow, nextColumn)) {
      const to = positionUnchecked(nextRow, nextColumn);
      const target = board[to];
      if (!cannon) {
        if (!target) moves.push(moveRecord(board, from, to));
        else {
          if (target.side !== piece.side) moves.push(moveRecord(board, from, to));
          break;
        }
      } else if (!screenFound) {
        if (!target) moves.push(moveRecord(board, from, to));
        else screenFound = true;
      } else if (target) {
        if (target.side !== piece.side) moves.push(moveRecord(board, from, to));
        break;
      }
      nextRow += rowStep;
      nextColumn += columnStep;
    }
  }
  return moves;
}

function pseudoMovesUnchecked(board, from) {
  const piece = board[from];
  if (!piece) return [];
  const { row, column } = xiangqiCoordinates(from);
  const moves = [];
  if (piece.type === 'rook') {
    return rayMoves(board, from, piece, [[-1, 0], [1, 0], [0, -1], [0, 1]]);
  }
  if (piece.type === 'cannon') {
    return rayMoves(board, from, piece, [[-1, 0], [1, 0], [0, -1], [0, 1]], true);
  }
  if (piece.type === 'horse') {
    const candidates = [
      [-2, -1, -1, 0], [-2, 1, -1, 0], [2, -1, 1, 0], [2, 1, 1, 0],
      [-1, -2, 0, -1], [1, -2, 0, -1], [-1, 2, 0, 1], [1, 2, 0, 1],
    ];
    for (const [rowDelta, columnDelta, legRowDelta, legColumnDelta] of candidates) {
      const legRow = row + legRowDelta;
      const legColumn = column + legColumnDelta;
      if (!inBounds(legRow, legColumn) || board[positionUnchecked(legRow, legColumn)]) continue;
      addStepMove(board, moves, piece, from, row + rowDelta, column + columnDelta);
    }
    return moves;
  }
  if (piece.type === 'elephant') {
    for (const [rowDelta, columnDelta] of [[-2, -2], [-2, 2], [2, -2], [2, 2]]) {
      const nextRow = row + rowDelta;
      const nextColumn = column + columnDelta;
      if (!inBounds(nextRow, nextColumn) || !elephantSideContains(piece.side, nextRow)) continue;
      if (board[positionUnchecked(row + rowDelta / 2, column + columnDelta / 2)]) continue;
      addStepMove(board, moves, piece, from, nextRow, nextColumn);
    }
    return moves;
  }
  if (piece.type === 'advisor') {
    for (const [rowDelta, columnDelta] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
      const nextRow = row + rowDelta;
      const nextColumn = column + columnDelta;
      if (palaceContains(piece.side, nextRow, nextColumn)) addStepMove(board, moves, piece, from, nextRow, nextColumn);
    }
    return moves;
  }
  if (piece.type === 'general') {
    for (const [rowDelta, columnDelta] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const nextRow = row + rowDelta;
      const nextColumn = column + columnDelta;
      if (palaceContains(piece.side, nextRow, nextColumn)) addStepMove(board, moves, piece, from, nextRow, nextColumn);
    }
    for (const rowStep of [-1, 1]) {
      let nextRow = row + rowStep;
      while (inBounds(nextRow, column)) {
        const to = positionUnchecked(nextRow, column);
        const target = board[to];
        if (target) {
          if (target.side !== piece.side && target.type === 'general') moves.push(moveRecord(board, from, to));
          break;
        }
        nextRow += rowStep;
      }
    }
    return moves;
  }
  if (piece.type === 'soldier') {
    const forward = piece.side === 'red' ? -1 : 1;
    addStepMove(board, moves, piece, from, row + forward, column);
    const crossedRiver = piece.side === 'red' ? row <= 4 : row >= 5;
    if (crossedRiver) {
      addStepMove(board, moves, piece, from, row, column - 1);
      addStepMove(board, moves, piece, from, row, column + 1);
    }
  }
  return moves;
}

export function getPseudoXiangqiMoves(board, fromIndex) {
  assertXiangqiBoard(board);
  xiangqiCoordinates(fromIndex);
  return pseudoMovesUnchecked(board, fromIndex);
}

function boardAfterMove(board, move) {
  const next = [...board];
  next[move.to] = next[move.from];
  next[move.from] = null;
  return next;
}

function positionSignature(board, turn) {
  return `${turn}|${board.map((piece) => piece ? `${piece.side[0]}${piece.type[0]}` : '--').join('')}`;
}

function nextPositionCounts(game, board, turn) {
  const counts = game.positionCounts && typeof game.positionCounts === 'object' && !Array.isArray(game.positionCounts)
    ? { ...game.positionCounts }
    : {};
  const currentSignature = positionSignature(game.board, game.turn);
  if (!Number.isSafeInteger(counts[currentSignature]) || counts[currentSignature] < 1) counts[currentSignature] = 1;
  const signature = positionSignature(board, turn);
  counts[signature] = Number.isSafeInteger(counts[signature]) && counts[signature] > 0 ? counts[signature] + 1 : 1;
  return { counts, repetitions: counts[signature] };
}

function generalIndex(board, side) {
  return board.findIndex((piece) => piece?.side === side && piece.type === 'general');
}

function boardIsInCheck(board, side) {
  const target = generalIndex(board, side);
  if (target < 0) return true;
  const attacker = oppositeSide(side);
  for (let from = 0; from < board.length; from += 1) {
    if (board[from]?.side !== attacker) continue;
    if (pseudoMovesUnchecked(board, from).some((move) => move.to === target)) return true;
  }
  return false;
}

export function isXiangqiInCheck(gameOrBoard, requestedSide = null) {
  const board = Array.isArray(gameOrBoard) ? gameOrBoard : gameOrBoard?.board;
  const side = requestedSide || (!Array.isArray(gameOrBoard) ? gameOrBoard?.turn : null);
  assertXiangqiBoard(board);
  if (!isSide(side)) throw new Error('XIANGQI_SIDE_INVALID');
  return boardIsInCheck(board, side);
}

function legalMovesForBoard(board, side, fromIndex = null) {
  const moves = [];
  const indexes = fromIndex === null
    ? Array.from({ length: board.length }, (_, index) => index)
    : [fromIndex];
  for (const from of indexes) {
    const piece = board[from];
    if (!piece || piece.side !== side) continue;
    for (const move of pseudoMovesUnchecked(board, from)) {
      if (move.captured?.type === 'general') continue;
      if (!boardIsInCheck(boardAfterMove(board, move), side)) moves.push(move);
    }
  }
  return moves;
}

function deriveTurnState(board, turn) {
  const inCheck = boardIsInCheck(board, turn);
  const legalMoves = legalMovesForBoard(board, turn);
  if (legalMoves.length) return { status: 'playing', winner: null, endReason: null, inCheck };
  return {
    status: 'finished',
    winner: oppositeSide(turn),
    endReason: inCheck ? 'checkmate' : 'stalemate',
    inCheck,
  };
}

export function newXiangqiGame(options = {}) {
  const humanSide = isSide(options.humanSide) ? options.humanSide : 'red';
  const difficulty = normalizeDifficulty(options.difficulty);
  const board = createXiangqiBoard();
  const turn = 'red';
  return {
    schemaVersion: XIANGQI_SCHEMA_VERSION,
    kind: 'xiangqi',
    mode: 'ai',
    humanSide,
    difficulty,
    board,
    turn,
    status: 'playing',
    winner: null,
    endReason: null,
    inCheck: false,
    moveCount: 0,
    history: [],
    lastMove: null,
    positionCounts: { [positionSignature(board, turn)]: 1 },
  };
}

function assertPlayableGame(game) {
  if (!game || typeof game !== 'object' || game.kind !== 'xiangqi') throw new Error('XIANGQI_GAME_INVALID');
  assertXiangqiBoard(game.board);
  if (!isSide(game.turn)) throw new Error('XIANGQI_TURN_INVALID');
}

export function getLegalXiangqiMoves(game, fromIndex = null) {
  assertPlayableGame(game);
  if (game.status !== 'playing') return [];
  if (fromIndex !== null) xiangqiCoordinates(fromIndex);
  return legalMovesForBoard(game.board, game.turn, fromIndex);
}

export function getXiangqiStatus(gameOrBoard, requestedSide = null) {
  const board = Array.isArray(gameOrBoard) ? gameOrBoard : gameOrBoard?.board;
  const side = requestedSide || (!Array.isArray(gameOrBoard) ? gameOrBoard?.turn : null);
  assertXiangqiBoard(board);
  if (!isSide(side)) throw new Error('XIANGQI_SIDE_INVALID');
  return deriveTurnState(board, side);
}

export function playXiangqiMove(game, fromIndex, toIndex) {
  assertPlayableGame(game);
  xiangqiCoordinates(fromIndex);
  xiangqiCoordinates(toIndex);
  if (game.status !== 'playing') throw new Error('XIANGQI_GAME_FINISHED');
  const piece = game.board[fromIndex];
  if (!piece || piece.side !== game.turn) throw new Error('XIANGQI_TURN_INVALID');
  const move = legalMovesForBoard(game.board, game.turn, fromIndex).find((candidate) => candidate.to === toIndex);
  if (!move) throw new Error('XIANGQI_MOVE_ILLEGAL');
  const board = boardAfterMove(game.board, move);
  const turn = oppositeSide(game.turn);
  const repeated = nextPositionCounts(game, board, turn);
  const terminal = deriveTurnState(board, turn);
  const outcome = terminal.status !== 'playing' || repeated.repetitions < 3
    ? terminal
    : { status: 'finished', winner: null, endReason: 'repetition', inCheck: terminal.inCheck };
  const storedMove = Object.freeze({
    from: move.from,
    to: move.to,
    piece: move.piece,
    captured: move.captured,
    side: game.turn,
    givesCheck: outcome.inCheck,
  });
  return {
    ...game,
    board,
    turn,
    ...outcome,
    moveCount: game.moveCount + 1,
    history: [...game.history, storedMove],
    lastMove: storedMove,
    positionCounts: repeated.counts,
  };
}

function replayXiangqiHistory(history, { humanSide, difficulty }) {
  let game = newXiangqiGame({ humanSide, difficulty });
  for (const entry of history) {
    if (!entry || !Number.isInteger(entry.from) || !Number.isInteger(entry.to)) throw new Error('XIANGQI_HISTORY_INVALID');
    game = playXiangqiMove(game, entry.from, entry.to);
  }
  return game;
}

export function undoXiangqi(game, count = 1) {
  assertPlayableGame(game);
  if (!Number.isInteger(count) || count < 1) throw new Error('XIANGQI_UNDO_INVALID');
  const history = Array.isArray(game.history) ? game.history : [];
  const keep = Math.max(0, history.length - count);
  return replayXiangqiHistory(history.slice(0, keep), {
    humanSide: isSide(game.humanSide) ? game.humanSide : 'red',
    difficulty: normalizeDifficulty(game.difficulty),
  });
}

export function undoXiangqiToHumanTurn(game) {
  assertPlayableGame(game);
  if (!game.history?.length) return undoXiangqi(game, 1);
  const humanSide = isSide(game.humanSide) ? game.humanSide : 'red';
  let count = 1;
  let restored = undoXiangqi(game, count);
  while (restored.history.length && restored.turn !== humanSide) {
    count += 1;
    restored = undoXiangqi(game, count);
  }
  return restored;
}

function boardsEqual(left, right) {
  if (!Array.isArray(left) || left.length !== right.length) return false;
  return left.every((piece, index) => {
    const candidate = right[index];
    return piece === null ? candidate === null
      : candidate !== null && piece.id === candidate.id && piece.side === candidate.side && piece.type === candidate.type;
  });
}

export function restoreXiangqiGame(raw) {
  try {
    const value = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!value || typeof value !== 'object' || value.schemaVersion !== XIANGQI_SCHEMA_VERSION) return null;
    if (value.kind !== 'xiangqi' || value.mode !== 'ai' || !isSide(value.humanSide)) return null;
    if (!Object.hasOwn(XIANGQI_DIFFICULTIES, value.difficulty)) return null;
    if (!Array.isArray(value.history) || value.history.length > MAX_RESTORED_MOVES) return null;
    const restored = replayXiangqiHistory(value.history, { humanSide: value.humanSide, difficulty: value.difficulty });
    if (value.board !== undefined && (!isXiangqiBoard(value.board) || !boardsEqual(value.board, restored.board))) return null;
    return restored;
  } catch {
    return null;
  }
}

function moveOrderingScore(move) {
  const captured = move.captured ? PIECE_VALUES[move.captured.type] : 0;
  const mover = PIECE_VALUES[move.piece.type];
  return captured * 16 - mover;
}

function orderedMoves(moves) {
  return [...moves].sort((left, right) => {
    const score = moveOrderingScore(right) - moveOrderingScore(left);
    return score || left.from - right.from || left.to - right.to;
  });
}

function evaluateBoard(board, perspective) {
  let score = 0;
  for (let index = 0; index < board.length; index += 1) {
    const piece = board[index];
    if (!piece) continue;
    const { row, column } = xiangqiCoordinates(index);
    let value = PIECE_VALUES[piece.type];
    if (piece.type === 'soldier') {
      const progress = piece.side === 'red' ? 6 - row : row - 3;
      value += Math.max(0, progress) * 12;
      if (piece.side === 'red' ? row <= 4 : row >= 5) value += 55;
    } else if (piece.type === 'horse' || piece.type === 'cannon') {
      value += Math.max(0, 4 - Math.abs(4 - column)) * 3;
    }
    score += piece.side === perspective ? value : -value;
  }
  return score;
}

function minimax(board, sideToMove, perspective, depth, alpha, beta, context, ply) {
  if (context.nodes >= context.nodeLimit) return { score: evaluateBoard(board, perspective), aborted: true };
  context.nodes += 1;
  const legalMoves = legalMovesForBoard(board, sideToMove);
  if (!legalMoves.length) {
    const losingScore = MATE_SCORE - ply;
    return { score: sideToMove === perspective ? -losingScore : losingScore, aborted: false };
  }
  if (depth <= 0) return { score: evaluateBoard(board, perspective), aborted: false };
  const maximizing = sideToMove === perspective;
  let best = maximizing ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY;
  for (const move of orderedMoves(legalMoves)) {
    const result = minimax(boardAfterMove(board, move), oppositeSide(sideToMove), perspective, depth - 1, alpha, beta, context, ply + 1);
    if (result.aborted) return result;
    if (maximizing) {
      best = Math.max(best, result.score);
      alpha = Math.max(alpha, best);
    } else {
      best = Math.min(best, result.score);
      beta = Math.min(beta, best);
    }
    if (beta <= alpha) break;
  }
  return { score: best, aborted: false };
}

export function chooseXiangqiMove(game, requestedDifficulty = game?.difficulty) {
  assertPlayableGame(game);
  if (game.status !== 'playing') return null;
  const difficulty = normalizeDifficulty(typeof requestedDifficulty === 'object' ? requestedDifficulty?.difficulty : requestedDifficulty);
  const settings = XIANGQI_DIFFICULTIES[difficulty];
  const moves = orderedMoves(legalMovesForBoard(game.board, game.turn));
  if (!moves.length) return null;
  let completedBest = moves[0];
  const context = { nodes: 0, nodeLimit: settings.nodeLimit };
  for (let depth = 1; depth <= settings.depth; depth += 1) {
    let iterationBest = moves[0];
    let iterationScore = Number.NEGATIVE_INFINITY;
    let rootAlpha = Number.NEGATIVE_INFINITY;
    let completed = true;
    for (const move of moves) {
      const result = minimax(
        boardAfterMove(game.board, move),
        oppositeSide(game.turn),
        game.turn,
        depth - 1,
        rootAlpha,
        Number.POSITIVE_INFINITY,
        context,
        1,
      );
      if (result.aborted) { completed = false; break; }
      if (result.score > iterationScore) {
        iterationScore = result.score;
        iterationBest = move;
      }
      rootAlpha = Math.max(rootAlpha, iterationScore);
    }
    if (!completed) break;
    completedBest = iterationBest;
  }
  return { ...completedBest, difficulty };
}

export function xiangqiPieceLabel(piece) {
  if (!isXiangqiPiece(piece)) return '';
  return LABELS[piece.side][piece.type];
}
