import assert from 'node:assert/strict';
import test from 'node:test';
import {
  XIANGQI_COLUMNS,
  XIANGQI_DIFFICULTIES,
  XIANGQI_ROWS,
  chooseXiangqiMove,
  createXiangqiBoard,
  createXiangqiPiece,
  getLegalXiangqiMoves,
  getPseudoXiangqiMoves,
  getXiangqiStatus,
  isXiangqiInCheck,
  newXiangqiGame,
  playXiangqiMove,
  restoreXiangqiGame,
  undoXiangqi,
  undoXiangqiToHumanTurn,
  xiangqiCoordinates,
  xiangqiPieceLabel,
  xiangqiPosition,
} from '../web/xiangqi.js';

type Side = 'red' | 'black';
type PieceType = 'general' | 'advisor' | 'elephant' | 'horse' | 'rook' | 'cannon' | 'soldier';

function at(row: number, column: number) {
  return xiangqiPosition(row, column);
}

function piece(side: Side, type: PieceType, id: string) {
  return createXiangqiPiece(side, type, id);
}

function sparseBoard({ screen = true } = {}) {
  const board = Array(XIANGQI_ROWS * XIANGQI_COLUMNS).fill(null);
  board[at(0, 4)] = piece('black', 'general', 'black-general-test');
  board[at(9, 4)] = piece('red', 'general', 'red-general-test');
  if (screen) board[at(5, 4)] = piece('red', 'soldier', 'red-screen-test');
  return board;
}

function gameWith(board: any[], turn: Side = 'red', overrides = {}) {
  return {
    ...newXiangqiGame(),
    board,
    turn,
    status: 'playing',
    winner: null,
    endReason: null,
    inCheck: isXiangqiInCheck(board, turn),
    moveCount: 0,
    history: [],
    lastMove: null,
    ...overrides,
  };
}

function destinations(moves: Array<{to: number}>) {
  return new Set(moves.map((move) => move.to));
}

function layoutSignature(board: any[], turn: Side) {
  return `${turn}|${board.map((candidate) => candidate ? `${candidate.side[0]}${candidate.type[0]}` : '--').join('')}`;
}

const ELEPHANT_CYCLE = [
  [at(9, 2), at(7, 0)],
  [at(0, 2), at(2, 0)],
  [at(7, 0), at(9, 2)],
  [at(2, 0), at(0, 2)],
] as const;

function playMoves(game: any, moves: ReadonlyArray<readonly [number, number]>) {
  return moves.reduce((current, [from, to]) => playXiangqiMove(current, from, to), game);
}

test('standard board has 32 stable pieces, red to move, and 44 legal opening moves', () => {
  const game = newXiangqiGame();
  assert.equal(game.board.length, 90);
  assert.equal(game.board.filter(Boolean).length, 32);
  assert.equal(game.turn, 'red');
  assert.equal(game.status, 'playing');
  assert.equal(game.inCheck, false);
  assert.equal(getLegalXiangqiMoves(game).length, 44);
  assert.equal(game.board[at(9, 4)]?.type, 'general');
  assert.equal(game.board[at(9, 4)]?.side, 'red');
  assert.equal(game.board[at(0, 4)]?.side, 'black');
  assert.deepEqual(xiangqiCoordinates(at(7, 6)), { row: 7, column: 6 });
  assert.equal(xiangqiPieceLabel(game.board[at(9, 4)]), '帅');
  assert.equal(xiangqiPieceLabel(game.board[at(0, 4)]), '将');
  assert.deepEqual(Object.values(XIANGQI_DIFFICULTIES).map((entry) => entry.label), ['初学', '标准', '挑战']);
});

test('rook moves orthogonally, stops at friends, and captures the first enemy', () => {
  const board = sparseBoard();
  board[at(7, 0)] = piece('red', 'rook', 'red-rook-test');
  board[at(7, 2)] = piece('red', 'advisor', 'red-blocker-test');
  board[at(4, 0)] = piece('black', 'soldier', 'black-target-test');
  const moves = destinations(getPseudoXiangqiMoves(board, at(7, 0)));
  assert.ok(moves.has(at(7, 1)));
  assert.ok(!moves.has(at(7, 2)));
  assert.ok(!moves.has(at(7, 3)));
  assert.ok(moves.has(at(4, 0)));
  assert.ok(!moves.has(at(3, 0)));
  assert.ok(!moves.has(at(6, 1)));
});

test('cannon needs exactly one screen to capture and never jumps for a quiet move', () => {
  const noScreen = sparseBoard();
  noScreen[at(7, 1)] = piece('red', 'cannon', 'red-cannon-test');
  noScreen[at(4, 1)] = piece('black', 'soldier', 'black-cannon-target');
  let moves = destinations(getPseudoXiangqiMoves(noScreen, at(7, 1)));
  assert.ok(moves.has(at(6, 1)) && moves.has(at(5, 1)));
  assert.ok(!moves.has(at(4, 1)), 'a cannon cannot capture without a screen');

  const oneScreen = [...noScreen];
  oneScreen[at(5, 1)] = piece('red', 'soldier', 'red-cannon-screen');
  moves = destinations(getPseudoXiangqiMoves(oneScreen, at(7, 1)));
  assert.ok(moves.has(at(6, 1)));
  assert.ok(!moves.has(at(5, 1)));
  assert.ok(moves.has(at(4, 1)), 'the first piece beyond one screen can be captured');

  const twoScreens = [...oneScreen];
  twoScreens[at(6, 1)] = piece('red', 'soldier', 'red-cannon-screen-two');
  moves = destinations(getPseudoXiangqiMoves(twoScreens, at(7, 1)));
  assert.ok(!moves.has(at(4, 1)), 'two screens prevent the capture');
});

test('horse legs block the matching pair of L-shaped destinations', () => {
  const open = sparseBoard();
  open[at(7, 4)] = piece('red', 'horse', 'red-horse-test');
  const openMoves = destinations(getPseudoXiangqiMoves(open, at(7, 4)));
  assert.ok(openMoves.has(at(5, 3)) && openMoves.has(at(5, 5)));
  assert.ok(openMoves.has(at(6, 2)) && openMoves.has(at(8, 2)));

  const blocked = [...open];
  blocked[at(6, 4)] = piece('red', 'soldier', 'red-horse-vertical-leg');
  blocked[at(7, 3)] = piece('red', 'soldier', 'red-horse-horizontal-leg');
  const blockedMoves = destinations(getPseudoXiangqiMoves(blocked, at(7, 4)));
  assert.ok(!blockedMoves.has(at(5, 3)) && !blockedMoves.has(at(5, 5)));
  assert.ok(!blockedMoves.has(at(6, 2)) && !blockedMoves.has(at(8, 2)));
  assert.ok(blockedMoves.has(at(6, 6)) && blockedMoves.has(at(8, 6)));
});

test('elephants respect the eye and river while advisors and generals stay in the palace', () => {
  const board = sparseBoard();
  board[at(9, 2)] = piece('red', 'elephant', 'red-elephant-test');
  board[at(8, 3)] = piece('red', 'soldier', 'red-elephant-eye');
  let moves = destinations(getPseudoXiangqiMoves(board, at(9, 2)));
  assert.ok(moves.has(at(7, 0)));
  assert.ok(!moves.has(at(7, 4)), 'a filled elephant eye blocks the diagonal');

  const riverBoard = sparseBoard();
  riverBoard[at(5, 2)] = piece('red', 'elephant', 'red-elephant-river');
  moves = destinations(getPseudoXiangqiMoves(riverBoard, at(5, 2)));
  assert.ok(!moves.has(at(3, 0)) && !moves.has(at(3, 4)));
  assert.ok(moves.has(at(7, 0)) && moves.has(at(7, 4)));

  const palaceBoard = sparseBoard();
  palaceBoard[at(8, 4)] = piece('red', 'advisor', 'red-advisor-test');
  const advisorMoves = destinations(getPseudoXiangqiMoves(palaceBoard, at(8, 4)));
  assert.deepEqual([...advisorMoves].sort((a, b) => a - b), [at(7, 3), at(7, 5), at(9, 3), at(9, 5)].sort((a, b) => a - b));
  const generalMoves = destinations(getPseudoXiangqiMoves(palaceBoard, at(9, 4)));
  assert.ok(generalMoves.has(at(9, 3)) && generalMoves.has(at(9, 5)));
  assert.ok(!generalMoves.has(at(9, 6)) && !generalMoves.has(at(8, 3)));
});

test('soldiers gain sideways moves only after crossing and never move backward', () => {
  const before = sparseBoard();
  before[at(6, 2)] = piece('red', 'soldier', 'red-soldier-before');
  assert.deepEqual([...destinations(getPseudoXiangqiMoves(before, at(6, 2)))], [at(5, 2)]);

  const crossed = sparseBoard();
  crossed[at(4, 2)] = piece('red', 'soldier', 'red-soldier-crossed');
  const redMoves = destinations(getPseudoXiangqiMoves(crossed, at(4, 2)));
  assert.ok(redMoves.has(at(3, 2)) && redMoves.has(at(4, 1)) && redMoves.has(at(4, 3)));
  assert.ok(!redMoves.has(at(5, 2)));

  const black = sparseBoard();
  black[at(5, 6)] = piece('black', 'soldier', 'black-soldier-crossed');
  const blackMoves = destinations(getPseudoXiangqiMoves(black, at(5, 6)));
  assert.ok(blackMoves.has(at(6, 6)) && blackMoves.has(at(5, 5)) && blackMoves.has(at(5, 7)));
  assert.ok(!blackMoves.has(at(4, 6)));
});

test('flying generals are checks and a screen cannot move aside to expose them', () => {
  const faceToFace = sparseBoard({ screen: false });
  assert.equal(isXiangqiInCheck(faceToFace, 'red'), true);
  assert.equal(isXiangqiInCheck(faceToFace, 'black'), true);

  const screened = sparseBoard({ screen: false });
  screened[at(4, 4)] = piece('red', 'soldier', 'red-facing-screen');
  assert.equal(isXiangqiInCheck(screened, 'red'), false);
  const pseudo = destinations(getPseudoXiangqiMoves(screened, at(4, 4)));
  assert.ok(pseudo.has(at(4, 3)) && pseudo.has(at(4, 5)));
  const legal = destinations(getLegalXiangqiMoves(gameWith(screened), at(4, 4)));
  assert.ok(legal.has(at(3, 4)));
  assert.ok(!legal.has(at(4, 3)) && !legal.has(at(4, 5)), 'legal filtering must reject self-check by flying general');
});

test('a pinned blocker cannot expose its own general and a checked side must answer the check', () => {
  const board = sparseBoard({ screen: false });
  board[at(1, 4)] = piece('black', 'rook', 'black-checking-rook');
  board[at(7, 4)] = piece('red', 'rook', 'red-pinned-rook');
  const game = gameWith(board, 'red');
  assert.equal(isXiangqiInCheck(game, 'red'), false, 'the pinned rook currently screens its general');
  const pinnedMoves = destinations(getLegalXiangqiMoves(game, at(7, 4)));
  assert.ok(!pinnedMoves.has(at(7, 3)) && !pinnedMoves.has(at(7, 5)));
  assert.ok(pinnedMoves.has(at(1, 4)), 'capturing the checking rook resolves check');

  const checkedBoard = sparseBoard({ screen: false });
  checkedBoard[at(1, 4)] = piece('black', 'rook', 'black-direct-checking-rook');
  const checkedGame = gameWith(checkedBoard, 'red');
  assert.equal(isXiangqiInCheck(checkedGame, 'red'), true);
  for (const move of getLegalXiangqiMoves(checkedGame)) {
    const next = playXiangqiMove(checkedGame, move.from, move.to);
    assert.equal(isXiangqiInCheck(next.board, 'red'), false);
  }
});

test('checkmate ends the game with both generals still on the board', () => {
  const board = sparseBoard({ screen: false });
  board[at(0, 0)] = piece('red', 'rook', 'red-mating-rook-one');
  board[at(1, 3)] = piece('red', 'rook', 'red-mating-rook-two');
  const game = gameWith(board, 'red');
  const projected = [...board];
  projected[at(1, 4)] = projected[at(1, 3)];
  projected[at(1, 3)] = null;
  const primed = { ...game, positionCounts: { ...game.positionCounts, [layoutSignature(projected, 'black')]: 2 } };
  const next = playXiangqiMove(primed, at(1, 3), at(1, 4));
  assert.equal(next.status, 'finished');
  assert.equal(next.winner, 'red');
  assert.equal(next.endReason, 'checkmate');
  assert.equal(next.inCheck, true);
  assert.equal(next.board.filter((candidate) => candidate?.type === 'general').length, 2);
  assert.deepEqual(getLegalXiangqiMoves(next), []);
});

test('the third identical board and turn is a draw even when same-type piece ids change', () => {
  let game = playMoves(newXiangqiGame(), ELEPHANT_CYCLE);
  assert.equal(game.status, 'playing');
  assert.equal(game.positionCounts[layoutSignature(game.board, game.turn)], 2);

  const board = [...game.board];
  board[at(9, 0)] = piece('red', 'rook', 'red-rook-reidentified');
  game = { ...game, board };
  game = playMoves(game, ELEPHANT_CYCLE);
  assert.equal(game.status, 'finished');
  assert.equal(game.winner, null);
  assert.equal(game.endReason, 'repetition');
  assert.equal(game.moveCount, 8);
});

test('repetition draws survive legal-history restore and undo rebuilds their counts', () => {
  const repeated = playMoves(playMoves(newXiangqiGame(), ELEPHANT_CYCLE), ELEPHANT_CYCLE);
  const restored = restoreXiangqiGame(JSON.stringify(repeated));
  assert.deepEqual(restored, repeated);
  assert.equal(restored?.endReason, 'repetition');

  const undone = undoXiangqi(repeated);
  assert.equal(undone.status, 'playing');
  assert.equal(undone.winner, null);
  assert.equal(undone.endReason, null);
  const repeatedAgain = playXiangqiMove(undone, at(2, 0), at(0, 2));
  assert.equal(repeatedAgain.status, 'finished');
  assert.equal(repeatedAgain.endReason, 'repetition');
});

test('stalemate is a loss for the side with no legal move', () => {
  const board = sparseBoard({ screen: false });
  board[at(5, 4)] = piece('red', 'soldier', 'red-stalemate-screen');
  board[at(1, 0)] = piece('red', 'rook', 'red-stalemate-rook');
  board[at(2, 2)] = piece('red', 'horse', 'red-stalemate-horse-one');
  board[at(4, 5)] = piece('red', 'horse', 'red-stalemate-horse-two');
  const game = gameWith(board, 'red');
  const next = playXiangqiMove(game, at(4, 5), at(2, 6));
  assert.equal(next.status, 'finished');
  assert.equal(next.winner, 'red');
  assert.equal(next.endReason, 'stalemate');
  assert.equal(next.inCheck, false);
  assert.deepEqual(getXiangqiStatus(next.board, 'black'), {
    status: 'finished', winner: 'red', endReason: 'stalemate', inCheck: false,
  });
});

test('moves are immutable, captures are reversible, and paired undo returns to the human turn', () => {
  const initial = newXiangqiGame();
  const afterRed = playXiangqiMove(initial, at(6, 0), at(5, 0));
  const afterBlack = playXiangqiMove(afterRed, at(3, 0), at(4, 0));
  const captured = playXiangqiMove(afterBlack, at(5, 0), at(4, 0));
  assert.equal(initial.board[at(6, 0)]?.side, 'red');
  assert.equal(initial.board[at(5, 0)], null);
  assert.equal(captured.board[at(4, 0)]?.side, 'red');
  assert.equal(captured.history.at(-1)?.captured?.side, 'black');

  const oneBack = undoXiangqi(captured);
  assert.equal(oneBack.turn, 'red');
  assert.equal(oneBack.board[at(5, 0)]?.side, 'red');
  assert.equal(oneBack.board[at(4, 0)]?.side, 'black');

  const paired = undoXiangqiToHumanTurn(afterBlack);
  assert.equal(paired.turn, 'red');
  assert.equal(paired.moveCount, 0);
  assert.deepEqual(paired.board, createXiangqiBoard());
});

test('all three AI levels are deterministic and return legal moves', () => {
  const game = newXiangqiGame();
  const legalKeys = new Set(getLegalXiangqiMoves(game).map((move) => `${move.from}:${move.to}`));
  for (const difficulty of Object.keys(XIANGQI_DIFFICULTIES)) {
    const first = chooseXiangqiMove(game, difficulty);
    const second = chooseXiangqiMove(game, difficulty);
    assert.ok(first && second);
    assert.equal(`${first.from}:${first.to}`, `${second.from}:${second.to}`);
    assert.ok(legalKeys.has(`${first.from}:${first.to}`));
    assert.equal(first.difficulty, difficulty);
  }
});

test('AI recognizes a forced mate in one and terminal positions have no AI move', () => {
  const board = sparseBoard({ screen: false });
  board[at(0, 0)] = piece('red', 'rook', 'red-ai-rook-one');
  board[at(1, 3)] = piece('red', 'rook', 'red-ai-rook-two');
  const game = gameWith(board, 'red');
  const move = chooseXiangqiMove(game, 'beginner');
  assert.ok(move);
  const result = playXiangqiMove(game, move.from, move.to);
  assert.equal(result.winner, 'red');
  assert.equal(result.endReason, 'checkmate');
  assert.equal(chooseXiangqiMove(result, 'challenge'), null);
});

test('deterministic AI self-play terminates instead of cycling forever', () => {
  let game = newXiangqiGame({ difficulty: 'standard' });
  const maximumPlies = 120;
  while (game.status === 'playing' && game.moveCount < maximumPlies) {
    const move = chooseXiangqiMove(game, 'standard');
    assert.ok(move);
    game = playXiangqiMove(game, move.from, move.to);
  }
  assert.equal(game.status, 'finished');
  assert.ok(game.moveCount < maximumPlies);
  assert.ok(['checkmate', 'stalemate', 'repetition'].includes(game.endReason));
});

test('serialized games restore by legal replay and reject corrupt or impossible histories', () => {
  let game = newXiangqiGame({ difficulty: 'challenge' });
  game = playXiangqiMove(game, at(6, 0), at(5, 0));
  game = playXiangqiMove(game, at(3, 0), at(4, 0));
  const restored = restoreXiangqiGame(JSON.stringify(game));
  assert.deepEqual(restored, game);

  const tamperedDerived = { ...game, status: 'finished', winner: 'black', endReason: 'checkmate' };
  assert.equal(restoreXiangqiGame(tamperedDerived)?.status, 'playing');
  assert.equal(restoreXiangqiGame(tamperedDerived)?.winner, null);

  const damagedBoard = { ...game, board: [...game.board] };
  damagedBoard.board[at(9, 0)] = null;
  assert.equal(restoreXiangqiGame(damagedBoard), null);
  assert.equal(restoreXiangqiGame('{broken-json'), null);
  assert.equal(restoreXiangqiGame({ ...game, history: [{ from: at(0, 0), to: at(1, 0) }] }), null);
  assert.equal(restoreXiangqiGame({ ...game, difficulty: 'impossible' }), null);
  assert.equal(restoreXiangqiGame({ ...game, history: Array(2_049).fill({ from: 0, to: 1 }) }), null);
});

test('invalid coordinates, turns, pieces, and illegal or post-game moves fail closed', () => {
  assert.throws(() => xiangqiPosition(10, 0), /XIANGQI_POSITION_INVALID/);
  assert.throws(() => xiangqiCoordinates(-1), /XIANGQI_POSITION_INVALID/);
  assert.throws(() => createXiangqiPiece('green' as Side, 'rook', 'bad'), /XIANGQI_PIECE_INVALID/);
  const game = newXiangqiGame();
  assert.throws(() => playXiangqiMove(game, at(0, 0), at(1, 0)), /XIANGQI_TURN_INVALID/);
  assert.throws(() => playXiangqiMove(game, at(9, 0), at(8, 1)), /XIANGQI_MOVE_ILLEGAL/);

  const mateBoard = sparseBoard({ screen: false });
  mateBoard[at(0, 0)] = piece('red', 'rook', 'red-finished-rook-one');
  mateBoard[at(1, 3)] = piece('red', 'rook', 'red-finished-rook-two');
  const finished = playXiangqiMove(gameWith(mateBoard), at(1, 3), at(1, 4));
  assert.throws(() => playXiangqiMove(finished, at(0, 4), at(0, 3)), /XIANGQI_GAME_FINISHED/);
});
