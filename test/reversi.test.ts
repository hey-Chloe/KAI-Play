import assert from 'node:assert/strict';
import test from 'node:test';
import {
  REVERSI_AI_SIDE,
  REVERSI_CELL_COUNT,
  REVERSI_DIFFICULTIES,
  REVERSI_HUMAN_SIDE,
  REVERSI_SIZE,
  REVERSI_STORAGE_KEY,
  chooseReversiMove,
  createReversiBoard,
  getReversiFlips,
  getReversiLegalMoves,
  getReversiScore,
  isReversiLegalMove,
  isValidReversiBoard,
  loadReversiGame,
  newReversiGame,
  playReversiHumanMove,
  playReversiMove,
  restartReversiGame,
  restoreReversiGame,
  reversiCoordinates,
  reversiPosition,
  saveReversiGame,
  serializeReversiGame,
} from '../web/reversi.js';

function at(row: number, column: number) {
  return reversiPosition(row, column);
}

function playSequence(indexes: number[], difficulty = 'standard') {
  return indexes.reduce((game, index) => playReversiMove(game, index), newReversiGame({ difficulty }));
}

test('new games use the standard 8x8 opening with black moving first', () => {
  const game = newReversiGame();
  assert.equal(REVERSI_SIZE, 8);
  assert.equal(REVERSI_CELL_COUNT, 64);
  assert.equal(game.board.length, REVERSI_CELL_COUNT);
  assert.equal(game.board[at(3, 3)], 'white');
  assert.equal(game.board[at(3, 4)], 'black');
  assert.equal(game.board[at(4, 3)], 'black');
  assert.equal(game.board[at(4, 4)], 'white');
  assert.equal(game.board.filter(Boolean).length, 4);
  assert.equal(game.turn, REVERSI_HUMAN_SIDE);
  assert.equal(game.humanSide, REVERSI_HUMAN_SIDE);
  assert.equal(game.aiSide, REVERSI_AI_SIDE);
  assert.equal(game.status, 'playing');
  assert.deepEqual(game.score, { black: 2, white: 2, empty: 60 });
  assert.deepEqual(getReversiLegalMoves(game.board, 'black').map((move) => move.index), [
    at(2, 3), at(3, 2), at(4, 5), at(5, 4),
  ]);
  assert.deepEqual(reversiCoordinates(at(7, 7)), { row: 7, column: 7 });
  assert.throws(() => reversiPosition(8, 0), /REVERSI_POSITION_INVALID/);
  assert.throws(() => reversiCoordinates(-1), /REVERSI_POSITION_INVALID/);
});

test('legal move discovery closes and flips lines in all eight directions', () => {
  const board = Array(REVERSI_CELL_COUNT).fill(null);
  const adjacent = [
    at(2, 2), at(2, 3), at(2, 4), at(3, 2),
    at(3, 4), at(4, 2), at(4, 3), at(4, 4),
  ];
  const anchors = [
    at(1, 1), at(1, 3), at(1, 5), at(3, 1),
    at(3, 5), at(5, 1), at(5, 3), at(5, 5),
  ];
  for (const index of adjacent) board[index] = 'white';
  for (const index of anchors) board[index] = 'black';

  assert.equal(isValidReversiBoard(board), true);
  assert.deepEqual(getReversiFlips(board, at(3, 3), 'black'), [...adjacent].sort((a, b) => a - b));
  assert.equal(isReversiLegalMove(board, at(3, 3), 'black'), true);
  assert.equal(isReversiLegalMove(board, at(0, 0), 'black'), false);

  const openRay = [...board];
  openRay[at(1, 1)] = null;
  assert.equal(getReversiFlips(openRay, at(3, 3), 'black').includes(at(2, 2)), false);
  assert.throws(() => getReversiFlips(board.slice(1), 0, 'black'), /REVERSI_BOARD_INVALID/);
  assert.throws(() => getReversiLegalMoves(board, 'green'), /REVERSI_SIDE_INVALID/);
});

test('moves are immutable, flip every captured disc, and reject illegal cells', () => {
  const initial = newReversiGame();
  const snapshot = structuredClone(initial);
  const played = playReversiMove(initial, at(2, 3));
  assert.deepEqual(initial, snapshot);
  assert.notEqual(played.board, initial.board);
  assert.equal(initial.board[at(3, 3)], 'white');
  assert.equal(played.board[at(2, 3)], 'black');
  assert.equal(played.board[at(3, 3)], 'black');
  assert.deepEqual(played.score, { black: 4, white: 1, empty: 59 });
  assert.equal(played.turn, 'white');
  assert.equal(played.moveCount, 1);
  assert.deepEqual(played.lastMove, {
    index: at(2, 3), row: 2, column: 3, side: 'black', flipped: [at(3, 3)], passedSide: null,
  });
  assert.throws(() => playReversiMove(played, at(2, 3)), /REVERSI_CELL_OCCUPIED/);
  assert.throws(() => playReversiMove(initial, at(0, 0)), /REVERSI_MOVE_ILLEGAL/);
  assert.deepEqual(getReversiScore(initial.board), { black: 2, white: 2, empty: 60 });
});

test('a side without a legal move is skipped automatically without mutating history inputs', () => {
  const sequence = [19, 18, 17, 9, 1, 0, 26, 2, 10, 11, 3, 4, 8, 16, 37, 12, 5];
  const beforeSkip = playSequence(sequence);
  const snapshot = structuredClone(beforeSkip);
  assert.equal(beforeSkip.turn, 'white');
  const skipped = playReversiMove(beforeSkip, 6);
  assert.deepEqual(beforeSkip, snapshot);
  assert.equal(skipped.status, 'playing');
  assert.equal(skipped.lastMove?.side, 'white');
  assert.equal(skipped.lastPass, 'black');
  assert.equal(skipped.lastMove?.passedSide, 'black');
  assert.equal(skipped.turn, 'white');
  assert.equal(skipped.passCount, 1);
  assert.equal(getReversiLegalMoves(skipped.board, 'black').length, 0);
  assert.ok(getReversiLegalMoves(skipped.board, 'white').length > 0);
});

test('board-full and bilateral-no-move endings are explicit and score the winner', () => {
  let full = newReversiGame();
  while (full.status === 'playing') {
    const move = getReversiLegalMoves(full.board, full.turn)[0];
    assert.ok(move);
    full = playReversiMove(full, move.index);
  }
  assert.equal(full.endReason, 'board-full');
  assert.equal(full.score.empty, 0);
  assert.equal(full.score.black + full.score.white, REVERSI_CELL_COUNT);
  assert.equal(full.winner, full.score.black > full.score.white ? 'black' : full.score.white > full.score.black ? 'white' : null);
  assert.throws(() => playReversiMove(full, 0), /REVERSI_GAME_FINISHED/);

  const noMoveSequence = [
    26, 20, 29, 38, 12, 34, 42, 25, 16, 50, 19, 11, 17, 4, 13,
    22, 41, 18, 44, 8, 30, 31, 5, 33, 47, 52, 43, 10, 21, 51, 23,
    3, 9, 32, 0, 2, 39, 37, 24, 1, 59, 58, 40, 6, 7, 14, 15, 49,
    56, 48, 46, 55, 61, 60, 45, 54, 57, 53, 63,
  ];
  const noMoves = playSequence(noMoveSequence);
  assert.equal(noMoves.status, 'finished');
  assert.equal(noMoves.endReason, 'no-legal-moves');
  assert.deepEqual(noMoves.score, { black: 57, white: 6, empty: 1 });
  assert.equal(noMoves.winner, 'black');
  assert.equal(getReversiLegalMoves(noMoves.board, 'black').length, 0);
  assert.equal(getReversiLegalMoves(noMoves.board, 'white').length, 0);
});

test('all three white AI levels are deterministic and expose distinct strategies', () => {
  const waitingForWhite = playReversiMove(newReversiGame(), at(2, 3));
  const snapshot = structuredClone(waitingForWhite);
  assert.deepEqual(Object.keys(REVERSI_DIFFICULTIES), ['beginner', 'standard', 'challenge']);

  const beginner = chooseReversiMove(waitingForWhite, 'beginner');
  const standard = chooseReversiMove(waitingForWhite, 'standard');
  const challenge = chooseReversiMove(waitingForWhite, 'challenge');
  assert.deepEqual(chooseReversiMove(waitingForWhite, 'beginner'), beginner);
  assert.deepEqual(chooseReversiMove(waitingForWhite, 'standard'), standard);
  assert.deepEqual(chooseReversiMove(waitingForWhite, 'challenge'), challenge);
  assert.deepEqual(waitingForWhite, snapshot);
  assert.equal(beginner?.index, 18);
  assert.equal(beginner?.reason, 'first-legal');
  assert.equal(standard?.index, 18);
  assert.equal(standard?.reason, 'positional');
  assert.equal(challenge?.index, 34);
  assert.equal(challenge?.reason, 'search');
  for (const move of [beginner, standard, challenge]) {
    assert.ok(move);
    assert.equal(move.side, 'white');
    assert.equal(isReversiLegalMove(waitingForWhite.board, move.index, 'white'), true);
  }
  assert.throws(() => chooseReversiMove(waitingForWhite, 'impossible'), /REVERSI_DIFFICULTY_INVALID/);
  assert.equal(chooseReversiMove(newReversiGame()), null);
});

test('one human action resolves the deterministic local white response', () => {
  const initial = newReversiGame({ difficulty: 'standard' });
  const first = playReversiHumanMove(initial, at(2, 3));
  const replay = playReversiHumanMove(initial, at(2, 3));
  assert.deepEqual(first, replay);
  assert.deepEqual(initial, newReversiGame({ difficulty: 'standard' }));
  assert.equal(first.moveCount, 2);
  assert.equal(first.turn, 'black');
  assert.equal(first.history[0].side, 'black');
  assert.equal(first.history[1].side, 'white');
  assert.equal(first.board.filter((cell) => cell === 'black').length, 3);
  assert.equal(first.board.filter((cell) => cell === 'white').length, 3);
  const waitingForWhite = playReversiMove(initial, at(2, 3));
  assert.throws(() => playReversiHumanMove(waitingForWhite, 20), /REVERSI_HUMAN_TURN_REQUIRED/);
});

test('strict restore replays legal history, round-trips JSON, and rejects forged state', () => {
  let game = playReversiHumanMove(newReversiGame({ difficulty: 'challenge' }), at(2, 3));
  const humanMove = getReversiLegalMoves(game.board, 'black')[0];
  game = playReversiHumanMove(game, humanMove.index);
  const serialized = serializeReversiGame(game);
  const restored = restoreReversiGame(serialized);
  assert.deepEqual(restored, game);
  assert.notEqual(restored?.board, game.board);
  assert.notEqual(restored?.history, game.history);
  assert.notEqual(restored?.history[0]?.flipped, game.history[0].flipped);

  const corruptions = [
    { ...game, schemaVersion: 99 },
    { ...game, difficulty: 'impossible' },
    { ...game, board: game.board.with(0, game.board[0] === 'black' ? 'white' : 'black') },
    { ...game, turn: game.turn === 'black' ? 'white' : 'black' },
    { ...game, score: { ...game.score, black: game.score.black + 1 } },
    { ...game, passCount: game.passCount + 1 },
    { ...game, lastPass: 'white' },
    { ...game, history: game.history.map((entry, index) => index ? entry : { ...entry, side: 'white' }) },
    { ...game, history: game.history.map((entry, index) => index ? entry : { ...entry, flipped: [] }) },
    { ...game, unexpected: true },
  ];
  for (const value of corruptions) assert.equal(restoreReversiGame(value), null);
  assert.equal(restoreReversiGame('{broken-json'), null);
  assert.equal(restoreReversiGame(null), null);
  assert.equal(restoreReversiGame([]), null);
  assert.throws(() => serializeReversiGame({ ...game, moveCount: -1 }), /REVERSI_GAME_INVALID/);
});

test('restart and injectable storage helpers preserve difficulty and fail closed', () => {
  const progressed = playReversiHumanMove(newReversiGame({ difficulty: 'beginner' }), at(2, 3));
  const snapshot = structuredClone(progressed);
  const restarted = restartReversiGame('challenge');
  assert.deepEqual(progressed, snapshot);
  assert.deepEqual(restarted, newReversiGame({ difficulty: 'challenge' }));

  const values = new Map<string, string>();
  const storage = {
    getItem(key: string) { return values.get(key) ?? null; },
    setItem(key: string, value: string) { values.set(key, value); },
  };
  assert.equal(saveReversiGame(progressed, storage), true);
  assert.ok(values.has(REVERSI_STORAGE_KEY));
  assert.deepEqual(loadReversiGame(storage), progressed);
  values.set(REVERSI_STORAGE_KEY, '{bad');
  assert.equal(loadReversiGame(storage), null);

  const blocked = {
    getItem() { throw new Error('blocked'); },
    setItem() { throw new Error('blocked'); },
  };
  assert.equal(saveReversiGame(progressed, blocked), false);
  assert.equal(loadReversiGame(blocked), null);
  assert.equal(saveReversiGame(progressed, storage, ''), false);
});
