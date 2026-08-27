import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MERGE_1048_TARGET,
  canMove1048,
  collapse1048Line,
  move1048,
  new1048Game,
  restore1048Game,
  spawn1048Tile,
} from '../web/casual-games.js';

function sequenceRandom(values: number[]) {
  let index = 0;
  return () => values[index++] ?? 0;
}

function game1048(board: number[], overrides = {}) {
  return {
    kind: '1048',
    board: [...board],
    score: 0,
    moves: 0,
    bestTile: Math.max(...board),
    status: 'playing',
    continued: false,
    lastDirection: null,
    lastGained: 0,
    ...overrides,
  };
}

test('1048 starts reproducibly with exactly two 2-or-4 tiles', () => {
  const first = new1048Game(sequenceRandom([0, 0, 0.999, 0.95]));
  const second = new1048Game(sequenceRandom([0, 0, 0.999, 0.95]));
  assert.deepEqual(first, second);
  assert.equal(first.board.length, 16);
  assert.deepEqual(first.board.filter(Boolean).sort((a, b) => a - b), [2, 4]);
  assert.equal(first.score, 0);
  assert.equal(first.moves, 0);
  assert.equal(first.status, 'playing');
  assert.equal(first.bestTile, 4);
});

test('1048 line collapse merges each tile at most once', () => {
  assert.deepEqual(collapse1048Line([2, 2, 0, 0]), { line: [4, 0, 0, 0], gained: 4 });
  assert.deepEqual(collapse1048Line([2, 2, 2, 2]), { line: [4, 4, 0, 0], gained: 8 });
  assert.deepEqual(collapse1048Line([2, 2, 4, 0]), { line: [4, 4, 0, 0], gained: 4 });
  assert.deepEqual(collapse1048Line([4, 4, 4, 0]), { line: [8, 4, 0, 0], gained: 8 });
});

test('1048 maps merges correctly in all four directions', () => {
  const horizontal = [0, 2, 0, 2, ...Array(12).fill(0)];
  const left = move1048(game1048(horizontal), 'left', sequenceRandom([0, 0]));
  const right = move1048(game1048(horizontal), 'right', sequenceRandom([0, 0]));
  assert.deepEqual(left.board.slice(0, 4), [4, 2, 0, 0]);
  assert.deepEqual(right.board.slice(0, 4), [2, 0, 0, 4]);

  const vertical = Array(16).fill(0);
  vertical[4] = 2;
  vertical[12] = 2;
  const up = move1048(game1048(vertical), 'up', sequenceRandom([0, 0]));
  const down = move1048(game1048(vertical), 'down', sequenceRandom([0, 0]));
  assert.equal(up.board[0], 4);
  assert.equal(down.board[12], 4);
  assert.equal(up.moves, 1);
  assert.equal(down.moves, 1);
  assert.equal(up.lastDirection, 'up');
  assert.equal(down.lastDirection, 'down');
});

test('512 plus 512 creates the named 1048 target and pauses on a win', () => {
  const board = [512, 512, 0, 0, ...Array(12).fill(0)];
  const original = game1048(board);
  const next = move1048(original, 'left', sequenceRandom([0, 0]));
  assert.deepEqual(original.board, board, 'the transition must not mutate its input');
  assert.equal(next.board[0], MERGE_1048_TARGET);
  assert.equal(next.status, 'won');
  assert.equal(next.score, MERGE_1048_TARGET);
  assert.equal(next.lastGained, MERGE_1048_TARGET);
  assert.equal(next.bestTile, MERGE_1048_TARGET);
  assert.equal(next.moves, 1);
});

test('1048 is terminal and cannot merge with another 1048 tile', () => {
  assert.deepEqual(collapse1048Line([1048, 1048, 0, 0]), { line: [1048, 1048, 0, 0], gained: 0 });
  const won = game1048([1048, 2, ...Array(14).fill(0)], { status: 'won' });
  const unchanged = move1048(won, 'right', sequenceRandom([0, 0]));
  assert.deepEqual(unchanged.board, won.board);
  assert.equal(unchanged.moves, 0);
});

test('an ineffective 1048 move does not consume randomness or add a move', () => {
  const current = game1048([2, 4, 0, 0, ...Array(12).fill(0)]);
  let calls = 0;
  const next = move1048(current, 'left', () => { calls += 1; return 0; });
  assert.notEqual(next.board, current.board);
  assert.deepEqual(next.board, current.board);
  assert.equal(next.moves, 0);
  assert.equal(next.score, 0);
  assert.equal(calls, 0);
});

test('1048 spawns one deterministic tile only into an empty cell', () => {
  const board = [2, 0, 4, ...Array(13).fill(0)];
  const two = spawn1048Tile(board, sequenceRandom([0, 0]));
  const four = spawn1048Tile(board, sequenceRandom([0.999, 0.999]));
  assert.deepEqual(board.slice(0, 3), [2, 0, 4]);
  assert.equal(two[1], 2);
  assert.equal(four[15], 4);
  assert.equal(two.filter(Boolean).length, 3);
  assert.equal(four.filter(Boolean).length, 3);

  const full = Array(16).fill(2);
  const copy = spawn1048Tile(full, () => { throw new Error('full boards do not need randomness'); });
  assert.notEqual(copy, full);
  assert.deepEqual(copy, full);
});

test('1048 recognizes available merges and a blocked full board', () => {
  const mergeable = [
    2, 2, 4, 8,
    16, 32, 64, 128,
    4, 8, 16, 32,
    64, 128, 256, 512,
  ];
  const blocked = [
    2, 4, 8, 16,
    32, 64, 128, 256,
    4, 8, 16, 32,
    64, 128, 256, 512,
  ];
  assert.equal(canMove1048(mergeable), true);
  assert.equal(canMove1048(blocked), false);
  const next = move1048(game1048(blocked), 'left', sequenceRandom([0, 0]));
  assert.equal(next.status, 'over');
  assert.equal(next.moves, 0);
});

test('1048 detects game over after the last empty cell is filled', () => {
  const board = [
    2, 4, 8, 0,
    16, 32, 64, 128,
    4, 8, 16, 32,
    64, 128, 256, 512,
  ];
  const next = move1048(game1048(board), 'right', sequenceRandom([0, 0.95]));
  assert.deepEqual(next.board.slice(0, 4), [4, 2, 4, 8]);
  assert.equal(next.status, 'over');
  assert.equal(next.moves, 1);
});

test('1048 rejects malformed boards, lines, and directions', () => {
  assert.throws(() => canMove1048([2, 4]), /1048_BOARD_REQUIRED/);
  assert.throws(() => canMove1048([3, ...Array(15).fill(0)]), /1048_BOARD_INVALID/);
  assert.throws(() => collapse1048Line([2, 3, 0, 0]), /1048_LINE_INVALID/);
  assert.throws(() => collapse1048Line([2, 2]), /1048_LINE_REQUIRED/);
  assert.throws(() => move1048(game1048(Array(16).fill(0)), 'diagonal'), /1048_DIRECTION_INVALID/);
});

test('1048 clamps unusable random values instead of indexing outside the board', () => {
  const board = Array(16).fill(0);
  const nan = spawn1048Tile(board, sequenceRandom([Number.NaN, Number.NaN]));
  const infinity = spawn1048Tile(board, sequenceRandom([Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]));
  assert.equal(nan[0], 2);
  assert.equal(infinity[0], 2);
});

test('1048 restores only valid local progress and derives trustworthy status', () => {
  const saved = game1048([1048, 2, ...Array(14).fill(0)], {
    score: 1500,
    moves: 42,
    bestTile: 2,
    status: 'playing',
    lastDirection: 'left',
    lastGained: 1048,
  });
  const restored = restore1048Game(saved);
  assert.equal(restored?.status, 'won');
  assert.equal(restored?.bestTile, 1048);
  assert.equal(restored?.score, 1500);
  assert.equal(restored?.moves, 42);
  assert.notEqual(restored?.board, saved.board);

  const blocked = game1048([
    2, 4, 8, 16,
    32, 64, 128, 256,
    4, 8, 16, 32,
    64, 128, 256, 512,
  ], { status: 'playing' });
  assert.equal(restore1048Game(blocked)?.status, 'over');
  assert.equal(restore1048Game({ ...saved, board: [2, 4] }), null);
  assert.equal(restore1048Game({ ...saved, board: [3, ...Array(15).fill(0)] }), null);
  assert.equal(restore1048Game(null), null);
});
