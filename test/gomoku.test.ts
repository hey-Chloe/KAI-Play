import assert from 'node:assert/strict';
import test from 'node:test';
import {
  GOMOKU_AI_SIDE,
  GOMOKU_CELL_COUNT,
  GOMOKU_HUMAN_SIDE,
  GOMOKU_SIZE,
  GOMOKU_STORAGE_KEY,
  chooseGomokuMove,
  createGomokuBoard,
  getGomokuStatus,
  getGomokuWinner,
  getGomokuWinningLine,
  gomokuCoordinates,
  gomokuPosition,
  isValidGomokuBoard,
  loadGomokuGame,
  newGomokuGame,
  playGomokuHumanMove,
  playGomokuMove,
  restartGomokuGame,
  restoreGomokuGame,
  saveGomokuGame,
  serializeGomokuGame,
} from '../web/gomoku.js';

function at(row: number, column: number) {
  return gomokuPosition(row, column);
}

function playIndexes(indexes: number[]) {
  return indexes.reduce((game, index) => playGomokuMove(game, index), newGomokuGame());
}

test('a new game is a 15x15 local AI board with the human fixed to black', () => {
  const game = newGomokuGame();
  assert.equal(GOMOKU_SIZE, 15);
  assert.equal(GOMOKU_CELL_COUNT, 225);
  assert.equal(game.board.length, GOMOKU_CELL_COUNT);
  assert.equal(game.board.every((cell) => cell === null), true);
  assert.equal(game.humanSide, GOMOKU_HUMAN_SIDE);
  assert.equal(game.aiSide, GOMOKU_AI_SIDE);
  assert.equal(game.turn, 'black');
  assert.equal(game.status, 'playing');
  assert.equal(game.mode, 'ai');
  assert.equal(isValidGomokuBoard(game.board), true);
  assert.deepEqual(gomokuCoordinates(at(14, 14)), { row: 14, column: 14 });
  assert.throws(() => gomokuPosition(15, 0), /GOMOKU_POSITION_INVALID/);
  assert.throws(() => gomokuCoordinates(-1), /GOMOKU_POSITION_INVALID/);
});

test('move transitions are immutable, alternate colours, and reject occupied cells', () => {
  const initial = newGomokuGame();
  const snapshot = structuredClone(initial);
  const black = playGomokuMove(initial, at(7, 7));
  assert.deepEqual(initial, snapshot);
  assert.equal(black.board[at(7, 7)], 'black');
  assert.equal(black.turn, 'white');
  assert.equal(black.moveCount, 1);
  assert.deepEqual(black.lastMove, { index: at(7, 7), row: 7, column: 7, side: 'black' });

  const white = playGomokuMove(black, at(7, 8));
  assert.equal(white.board[at(7, 8)], 'white');
  assert.equal(white.turn, 'black');
  assert.equal(white.moveCount, 2);
  assert.equal(black.board[at(7, 8)], null);
  assert.throws(() => playGomokuMove(white, at(7, 7)), /GOMOKU_CELL_OCCUPIED/);
});

test('pure winner detection covers horizontal, vertical, and both diagonal axes', () => {
  const cases = [
    { start: [7, 3], step: [0, 1] },
    { start: [3, 7], step: [1, 0] },
    { start: [3, 3], step: [1, 1] },
    { start: [3, 11], step: [1, -1] },
  ];
  for (const item of cases) {
    const board = createGomokuBoard();
    const indexes: number[] = [];
    for (let offset = 0; offset < 5; offset += 1) {
      const index = at(
        item.start[0] + item.step[0] * offset,
        item.start[1] + item.step[1] * offset,
      );
      board[index] = 'black';
      indexes.push(index);
    }
    assert.equal(getGomokuWinner(board, indexes[4]), 'black');
    assert.deepEqual(getGomokuWinningLine(board, indexes[4]), indexes);
    assert.deepEqual(getGomokuStatus(board, indexes[4]), {
      status: 'finished',
      winner: 'black',
      endReason: 'five-in-a-row',
      winningLine: indexes,
    });
  }
});

test('five connected stones finish legal play and lock out later moves', () => {
  const moves = [
    at(7, 3), at(0, 0),
    at(7, 4), at(0, 2),
    at(7, 5), at(0, 4),
    at(7, 6), at(0, 6),
    at(7, 7),
  ];
  const game = playIndexes(moves);
  assert.equal(game.status, 'finished');
  assert.equal(game.winner, 'black');
  assert.equal(game.endReason, 'five-in-a-row');
  assert.deepEqual(game.winningLine, [at(7, 3), at(7, 4), at(7, 5), at(7, 6), at(7, 7)]);
  assert.throws(() => playGomokuMove(game, at(1, 1)), /GOMOKU_GAME_FINISHED/);
  assert.equal(chooseGomokuMove(game), null);
});

test('the basic AI blocks an immediate black win and takes its own win first', () => {
  const threatened = playIndexes([
    at(7, 3), at(0, 0),
    at(7, 4), at(0, 2),
    at(7, 5), at(0, 4),
    at(7, 6),
  ]);
  const block = chooseGomokuMove(threatened);
  assert.ok(block);
  assert.equal(block.reason, 'block');
  assert.ok([at(7, 2), at(7, 7)].includes(block.index));
  const blocked = playGomokuMove(threatened, block.index);
  assert.equal(blocked.board[block.index], 'white');

  const winning = playIndexes([
    at(10, 1), at(5, 5),
    at(10, 2), at(5, 6),
    at(10, 3), at(5, 7),
    at(10, 4), at(5, 8),
    at(14, 14),
  ]);
  const finish = chooseGomokuMove(winning);
  assert.ok(finish);
  assert.equal(finish.reason, 'win');
  assert.ok([at(5, 4), at(5, 9)].includes(finish.index));
  const result = playGomokuMove(winning, finish.index);
  assert.equal(result.status, 'finished');
  assert.equal(result.winner, 'white');
});

test('one human action can deterministically complete the black and white turn pair', () => {
  const initial = newGomokuGame();
  const first = playGomokuHumanMove(initial, at(7, 7));
  const replay = playGomokuHumanMove(initial, at(7, 7));
  assert.deepEqual(first, replay);
  assert.equal(first.moveCount, 2);
  assert.equal(first.board[at(7, 7)], 'black');
  assert.equal(first.board.filter((cell) => cell === 'white').length, 1);
  assert.equal(first.turn, 'black');
  assert.deepEqual(initial, newGomokuGame());

  const waitingForWhite = playGomokuMove(initial, at(6, 6));
  assert.throws(
    () => playGomokuHumanMove(waitingForWhite, at(7, 7)),
    /GOMOKU_HUMAN_TURN_REQUIRED/,
  );
});

test('a full board without five in a row is an explicit draw', () => {
  const finalIndex = at(14, 13);
  const black: number[] = [];
  const white: number[] = [];
  for (let row = 0; row < GOMOKU_SIZE; row += 1) {
    for (let column = 0; column < GOMOKU_SIZE; column += 1) {
      const index = at(row, column);
      const side = (row + Math.floor(column / 2)) % 2 === 0 ? 'black' : 'white';
      if (side === 'black' && index !== finalIndex) black.push(index);
      else if (side === 'white') white.push(index);
    }
  }
  assert.equal(black.length, 112);
  assert.equal(white.length, 112);
  let game = newGomokuGame();
  for (let index = 0; index < black.length; index += 1) {
    game = playGomokuMove(game, black[index]);
    game = playGomokuMove(game, white[index]);
  }
  assert.equal(game.status, 'playing');
  const draw = playGomokuMove(game, finalIndex);
  assert.equal(draw.moveCount, GOMOKU_CELL_COUNT);
  assert.equal(draw.status, 'finished');
  assert.equal(draw.winner, null);
  assert.equal(draw.endReason, 'board-full');
  assert.deepEqual(draw.winningLine, []);
});

test('restart returns a fresh game without changing the previous session', () => {
  const progressed = playGomokuHumanMove(newGomokuGame(), at(6, 6));
  const snapshot = structuredClone(progressed);
  const restarted = restartGomokuGame();
  assert.deepEqual(progressed, snapshot);
  assert.deepEqual(restarted, newGomokuGame());
  assert.notEqual(restarted.board, progressed.board);
});

test('saved games restore by legal history replay and reject corrupt progress', () => {
  let game = playGomokuHumanMove(newGomokuGame(), at(7, 7));
  game = playGomokuHumanMove(game, at(8, 8));
  const serialized = serializeGomokuGame(game);
  assert.deepEqual(restoreGomokuGame(serialized), game);

  const forgedOutcome = { ...game, status: 'finished', winner: 'black', endReason: 'five-in-a-row' };
  assert.deepEqual(restoreGomokuGame(forgedOutcome), game);

  const damagedBoard = { ...game, board: [...game.board] };
  damagedBoard.board[at(0, 0)] = 'black';
  assert.equal(restoreGomokuGame(damagedBoard), null);
  assert.equal(restoreGomokuGame('{broken-json'), null);
  assert.equal(restoreGomokuGame({ ...game, schemaVersion: 99 }), null);
  assert.equal(restoreGomokuGame({ ...game, humanSide: 'white' }), null);
  assert.equal(restoreGomokuGame({
    ...game,
    history: [{ index: at(7, 7), side: 'white' }],
  }), null);
  assert.equal(restoreGomokuGame({
    ...game,
    history: [{ index: at(7, 7), side: 'black' }, { index: at(7, 7), side: 'white' }],
  }), null);
});

test('local storage helpers are injectable and fail closed when storage is unavailable', () => {
  const values = new Map<string, string>();
  const storage = {
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
  };
  const game = playGomokuHumanMove(newGomokuGame(), at(7, 7));
  assert.equal(saveGomokuGame(game, storage), true);
  assert.ok(values.has(GOMOKU_STORAGE_KEY));
  assert.deepEqual(loadGomokuGame(storage), game);

  values.set(GOMOKU_STORAGE_KEY, '{broken-json');
  assert.equal(loadGomokuGame(storage), null);
  const blocked = {
    getItem() {
      throw new Error('blocked');
    },
    setItem() {
      throw new Error('blocked');
    },
  };
  assert.equal(saveGomokuGame(game, blocked), false);
  assert.equal(loadGomokuGame(blocked), null);
  assert.equal(saveGomokuGame(game, undefined, ''), false);

  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    get() {
      throw new Error('browser storage access denied');
    },
  });
  try {
    assert.equal(saveGomokuGame(game), false);
    assert.equal(loadGomokuGame(), null);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
    else delete (globalThis as { localStorage?: unknown }).localStorage;
  }
});
