import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FALLING_BLOCK_LINE_SCORES,
  FALLING_BLOCK_SHAPES,
  FALLING_BLOCK_TYPES,
  FALLING_BLOCKS_CELL_COUNT,
  FALLING_BLOCKS_COLUMNS,
  FALLING_BLOCKS_ROWS,
  FALLING_BLOCKS_SCHEMA_VERSION,
  FALLING_BLOCKS_STORAGE_KEY,
  advanceFallingBlocks,
  clearFallingBlocksLines,
  createFallingBlocksBoard,
  fallingBlocksCoordinates,
  fallingBlocksPosition,
  fallingBlocksSeededRandom,
  getFallingBlocksActiveIndexes,
  getFallingBlocksDropInterval,
  getFallingBlocksGhost,
  getFallingBlocksNextPieces,
  getFallingBlocksPieceCells,
  hardDropFallingBlocks,
  loadFallingBlocksGame,
  moveFallingBlocks,
  newFallingBlocksGame,
  restartFallingBlocksGame,
  restoreFallingBlocksGame,
  rotateFallingBlocks,
  saveFallingBlocksGame,
  serializeFallingBlocksGame,
  softDropFallingBlocks,
  toggleFallingBlocksPause,
} from '../web/falling-blocks.js';

type Game = ReturnType<typeof newFallingBlocksGame>;

function playPlacement(game: Game, pattern: string) {
  let next = game;
  for (const action of pattern) {
    if (action === 'l') next = moveFallingBlocks(next, 'left');
    else if (action === 'x') next = moveFallingBlocks(next, 'right');
    else if (action === 'r') next = rotateFallingBlocks(next, 'clockwise');
    else if (action === 'd') next = hardDropFallingBlocks(next);
    else throw new Error(`unknown fixture action: ${action}`);
  }
  return next;
}

const LEVEL_TWO_PLACEMENTS = [
  'llld', 'llllxxxd', 'lllxxxxxd', 'rllllxxxxxxxxd', 'rrlllxd',
  'lllxxxxxd', 'rlllld', 'lllxxxxd', 'lllxd', 'rllllxxxxxxxxd',
  'lllxxxxxd', 'lllxxxd', 'llllxd', 'rrrlllxxxxxxxxd', 'rllllxxxxxxxd',
  'rllllld', 'lllxxxxd', 'llllxxxxd', 'rrlllxd', 'rrrlllxxxxxxxxd',
  'rllllxxxxxd', 'rllllxxxxxxxxd', 'rrrlllxxxxxxd', 'rrlllxxd',
  'rllllld', 'rllllxd', 'llllxxxd', 'lllxxxxxxd', 'rrlllxxxxd',
];

test('the standard 10x20 board and all seven tetrominoes are exposed safely', () => {
  const board = createFallingBlocksBoard();
  assert.equal(FALLING_BLOCKS_ROWS, 20);
  assert.equal(FALLING_BLOCKS_COLUMNS, 10);
  assert.equal(FALLING_BLOCKS_CELL_COUNT, 200);
  assert.equal(FALLING_BLOCKS_SCHEMA_VERSION, 1);
  assert.equal(FALLING_BLOCKS_STORAGE_KEY, 'kai-play:falling-blocks:v1');
  assert.deepEqual(FALLING_BLOCK_TYPES, ['I', 'J', 'L', 'O', 'S', 'T', 'Z']);
  assert.deepEqual(FALLING_BLOCK_LINE_SCORES, [0, 100, 300, 500, 800]);
  assert.equal(board.length, 200);
  assert.ok(board.every((cell) => cell === null));
  assert.equal(Object.keys(FALLING_BLOCK_SHAPES).length, 7);
  for (const type of FALLING_BLOCK_TYPES) {
    assert.equal(FALLING_BLOCK_SHAPES[type].length, 4);
    for (const rotation of FALLING_BLOCK_SHAPES[type]) assert.equal(rotation.length, 4);
  }
  assert.equal(Object.isFrozen(FALLING_BLOCK_TYPES), true);
  assert.equal(Object.isFrozen(FALLING_BLOCK_SHAPES.I[0]), true);

  assert.equal(fallingBlocksPosition(19, 9), 199);
  assert.deepEqual(fallingBlocksCoordinates(137), { row: 13, column: 7 });
  assert.throws(() => fallingBlocksPosition(-1, 0), /FALLING_BLOCKS_POSITION_INVALID/);
  assert.throws(() => fallingBlocksPosition(0, 10), /FALLING_BLOCKS_POSITION_INVALID/);
  assert.throws(() => fallingBlocksCoordinates(200), /FALLING_BLOCKS_POSITION_INVALID/);
  assert.throws(() => getFallingBlocksPieceCells({ type: 'Q' } as any), /FALLING_BLOCKS_PIECE_INVALID/);
});

test('seeded and injected entropy produce deterministic two-bag openings', () => {
  const first = newFallingBlocksGame({ seed: 'repeatable' });
  const second = newFallingBlocksGame({ seed: 'repeatable' });
  assert.deepEqual(first, second);
  assert.deepEqual(JSON.parse(JSON.stringify(first)), first);
  assert.equal(first.status, 'playing');
  assert.deepEqual(first.board, createFallingBlocksBoard());
  assert.deepEqual([...new Set([first.active!.type, ...first.queue.slice(0, 6)])].sort(), [...FALLING_BLOCK_TYPES].sort());
  assert.deepEqual([...new Set(first.queue.slice(6, 13))].sort(), [...FALLING_BLOCK_TYPES].sort());

  let calls = 0;
  const injected = newFallingBlocksGame({ random: () => {
    calls += 1;
    return 0.5;
  } });
  assert.equal(injected.seed, 0x8000_0000);
  assert.equal(calls, 1);

  const randomA = fallingBlocksSeededRandom(42);
  const randomB = fallingBlocksSeededRandom(42);
  const valuesA = Array.from({ length: 12 }, randomA);
  assert.deepEqual(valuesA, Array.from({ length: 12 }, randomB));
  assert.ok(valuesA.every((value) => value >= 0 && value < 1));

  assert.throws(() => newFallingBlocksGame({ seed: -1 }), /FALLING_BLOCKS_SEED_INVALID/);
  assert.throws(() => newFallingBlocksGame({ seed: '' }), /FALLING_BLOCKS_SEED_INVALID/);
  assert.throws(() => newFallingBlocksGame({ seed: 'x'.repeat(513) }), /FALLING_BLOCKS_SEED_INVALID/);
  assert.throws(() => newFallingBlocksGame({ random: null }), /FALLING_BLOCKS_RANDOM_INVALID/);
  assert.throws(() => newFallingBlocksGame({ random: () => Number.NaN }), /FALLING_BLOCKS_RANDOM_INVALID/);
  assert.throws(() => newFallingBlocksGame({ random: () => 1 }), /FALLING_BLOCKS_RANDOM_INVALID/);
});

test('left and right movement is immutable and stops exactly at side walls', () => {
  const initial = newFallingBlocksGame({ seed: 1 });
  const snapshot = structuredClone(initial);
  const moved = moveFallingBlocks(initial, 'left');
  assert.deepEqual(initial, snapshot);
  assert.notEqual(moved, initial);
  assert.notEqual(moved.active, initial.active);
  assert.notEqual(moved.history, initial.history);
  assert.equal(moved.active!.column, 2);
  assert.equal(moved.lastAction, 'move');
  assert.deepEqual(moved.history.at(-1), { kind: 'move', direction: 'left' });

  let left = initial;
  while (true) {
    const candidate = moveFallingBlocks(left, 'left');
    if (candidate === left) break;
    left = candidate;
  }
  assert.equal(Math.min(...getFallingBlocksPieceCells(left.active!).map(({ column }) => column)), 0);
  assert.equal(moveFallingBlocks(left, 'left'), left);

  let right = initial;
  while (true) {
    const candidate = moveFallingBlocks(right, 'right');
    if (candidate === right) break;
    right = candidate;
  }
  assert.equal(Math.max(...getFallingBlocksPieceCells(right.active!).map(({ column }) => column)), 9);
  assert.equal(moveFallingBlocks(right, 'right'), right);
  assert.throws(() => moveFallingBlocks(initial, 'up' as any), /FALLING_BLOCKS_DIRECTION_INVALID/);
  assert.throws(() => moveFallingBlocks({ ...initial, score: 1 }, 'left'), /FALLING_BLOCKS_GAME_INVALID/);
});

test('rotation supports both directions and kicks an I piece away from the right wall', () => {
  const initial = newFallingBlocksGame({ seed: 0 });
  assert.equal(initial.active!.type, 'I');
  const vertical = rotateFallingBlocks(initial);
  assert.equal(vertical.active!.rotation, 1);
  assert.equal(rotateFallingBlocks(vertical, 'counterclockwise').active!.rotation, 0);

  let atWall = vertical;
  for (let count = 0; count < 4; count += 1) atWall = moveFallingBlocks(atWall, 'right');
  assert.equal(atWall.active!.column, 7);
  const kicked = rotateFallingBlocks(atWall, 'clockwise');
  assert.equal(kicked.active!.rotation, 2);
  assert.equal(kicked.active!.column, 6);
  assert.equal(Math.max(...getFallingBlocksPieceCells(kicked.active!).map(({ column }) => column)), 9);
  assert.deepEqual(atWall.active, { type: 'I', rotation: 1, row: 0, column: 7 });

  const withO = hardDropFallingBlocks(initial);
  assert.equal(withO.active!.type, 'O');
  assert.equal(rotateFallingBlocks(withO), withO);
  assert.throws(() => rotateFallingBlocks(initial, 'around' as any), /FALLING_BLOCKS_ROTATION_INVALID/);
});

test('ghost, soft drop, gravity tick and hard drop have distinct scoring semantics', () => {
  const initial = newFallingBlocksGame({ seed: 1 });
  assert.deepEqual(getFallingBlocksActiveIndexes(initial), [3, 4, 14, 15]);
  assert.deepEqual(getFallingBlocksNextPieces(initial, 3), ['O', 'I', 'S']);
  const ghost = getFallingBlocksGhost(initial)!;
  assert.equal(ghost.row, 18);
  assert.equal(ghost.distance, 18);
  assert.deepEqual(ghost.indexes, [183, 184, 194, 195]);

  const soft = softDropFallingBlocks(initial);
  assert.equal(soft.active!.row, 1);
  assert.equal(soft.score, 1);
  assert.equal(soft.ticks, 0);
  assert.equal(soft.lastDropDistance, 1);
  const hardAfterSoft = hardDropFallingBlocks(soft);
  assert.equal(hardAfterSoft.pieces, 1);
  assert.equal(hardAfterSoft.score, 35);
  assert.equal(hardAfterSoft.lastDropDistance, 17);

  const hard = hardDropFallingBlocks(initial);
  assert.equal(hard.score, 36);
  assert.equal(hard.pieces, 1);
  assert.equal(hard.lastAction, 'hard-drop');
  assert.equal(initial.board.every((cell) => cell === null), true);
  assert.equal(hard.board.filter(Boolean).length, 4);

  const gravity = advanceFallingBlocks(initial, 18);
  assert.equal(gravity.active!.row, 18);
  assert.equal(gravity.score, 0);
  assert.equal(gravity.ticks, 18);
  const lockedByTick = advanceFallingBlocks(gravity);
  assert.equal(lockedByTick.pieces, 1);
  assert.equal(lockedByTick.ticks, 19);
  assert.equal(lockedByTick.score, 0);
  assert.equal(advanceFallingBlocks(initial, 0), initial);

  const lockedBySoft = softDropFallingBlocks(gravity);
  assert.equal(lockedBySoft.pieces, 1);
  assert.equal(lockedBySoft.ticks, 18);
  assert.equal(lockedBySoft.score, 0);
  assert.throws(() => advanceFallingBlocks(initial, -1), /FALLING_BLOCKS_STEPS_INVALID/);
  assert.throws(() => advanceFallingBlocks(initial, 1.5), /FALLING_BLOCKS_STEPS_INVALID/);
  assert.throws(() => advanceFallingBlocks(initial, 10_001), /FALLING_BLOCKS_STEPS_INVALID/);
  assert.throws(() => getFallingBlocksNextPieces(initial, 15), /FALLING_BLOCKS_NEXT_COUNT_INVALID/);
});

test('gravity intervals accelerate by level but retain a playable floor', () => {
  assert.equal(getFallingBlocksDropInterval(1), 1_000);
  assert.equal(getFallingBlocksDropInterval({ level: 2 }), 925);
  assert.equal(getFallingBlocksDropInterval(13), 100);
  assert.equal(getFallingBlocksDropInterval(14), 80);
  assert.equal(getFallingBlocksDropInterval(999), 80);
  assert.throws(() => getFallingBlocksDropInterval(0), /FALLING_BLOCKS_LEVEL_INVALID/);
  assert.throws(() => getFallingBlocksDropInterval({}), /FALLING_BLOCKS_LEVEL_INVALID/);
});

test('completed rows clear from the bottom without mutating the source board', () => {
  const board = createFallingBlocksBoard();
  for (let column = 0; column < 10; column += 1) {
    board[fallingBlocksPosition(18, column)] = 'I';
    board[fallingBlocksPosition(19, column)] = 'T';
  }
  board[fallingBlocksPosition(17, 4)] = 'O';
  const snapshot = [...board];
  const result = clearFallingBlocksLines(board);
  assert.deepEqual(board, snapshot);
  assert.equal(result.cleared, 2);
  assert.deepEqual(result.rows, [18, 19]);
  assert.equal(result.board.filter(Boolean).length, 1);
  assert.equal(result.board[fallingBlocksPosition(19, 4)], 'O');
  assert.ok(result.board.slice(0, 20).every((cell) => cell === null));

  const untouched = clearFallingBlocksLines(createFallingBlocksBoard());
  assert.equal(untouched.cleared, 0);
  assert.deepEqual(untouched.board, createFallingBlocksBoard());
  assert.throws(() => clearFallingBlocksLines(Array(199).fill(null)), /FALLING_BLOCKS_BOARD_INVALID/);
});

test('real placements clear lines, award line points and advance to level two', () => {
  let game = newFallingBlocksGame({ seed: 1 });
  for (const pattern of LEVEL_TWO_PLACEMENTS.slice(0, 6)) game = playPlacement(game, pattern);
  assert.equal(game.lines, 1);
  assert.equal(game.lastClear, 1);
  assert.equal(game.score, 310);
  assert.equal(game.level, 1);
  assert.equal(game.pieces, 6);
  assert.equal(game.board.filter(Boolean).length, 14);

  for (const pattern of LEVEL_TWO_PLACEMENTS.slice(6)) game = playPlacement(game, pattern);
  assert.equal(game.status, 'playing');
  assert.equal(game.lines, 10);
  assert.equal(game.level, 2);
  assert.equal(game.pieces, 29);
  assert.equal(game.score, 1_982);
  assert.equal(game.lastClear, 1);
  assert.equal(getFallingBlocksDropInterval(game), 925);
  for (let row = 0; row < 20; row += 1) {
    assert.equal(game.board.slice(row * 10, row * 10 + 10).every(Boolean), false);
  }
});

test('pause freezes every gameplay transition and resumes from the same position', () => {
  const initial = newFallingBlocksGame({ seed: 9 });
  const paused = toggleFallingBlocksPause(initial);
  assert.equal(paused.status, 'paused');
  assert.equal(paused.lastAction, 'pause');
  assert.equal(moveFallingBlocks(paused, 'left'), paused);
  assert.equal(rotateFallingBlocks(paused), paused);
  assert.equal(softDropFallingBlocks(paused), paused);
  assert.equal(hardDropFallingBlocks(paused), paused);
  assert.equal(advanceFallingBlocks(paused), paused);
  const resumed = toggleFallingBlocksPause(paused);
  assert.equal(resumed.status, 'playing');
  assert.equal(resumed.lastAction, 'resume');
  assert.deepEqual(resumed.active, initial.active);
  assert.deepEqual(resumed.history.slice(-2), [{ kind: 'pause' }, { kind: 'pause' }]);
  assert.equal(moveFallingBlocks(resumed, 'left').active!.column, initial.active!.column - 1);
});

test('stacking to the spawn zone ends play and all post-game actions are safe no-ops', () => {
  let game = newFallingBlocksGame({ seed: 1 });
  let guard = 0;
  while (game.status === 'playing' && guard < 30) {
    game = hardDropFallingBlocks(game);
    guard += 1;
  }
  assert.equal(game.status, 'over');
  assert.equal(game.active, null);
  assert.equal(game.lastAction, 'game-over');
  assert.ok(game.pieces > 0);
  assert.equal(getFallingBlocksGhost(game), null);
  assert.deepEqual(getFallingBlocksActiveIndexes(game), []);
  assert.equal(moveFallingBlocks(game, 'left'), game);
  assert.equal(rotateFallingBlocks(game), game);
  assert.equal(softDropFallingBlocks(game), game);
  assert.equal(hardDropFallingBlocks(game), game);
  assert.equal(advanceFallingBlocks(game), game);
  assert.equal(toggleFallingBlocksPause(game), game);
});

test('restart resets every counter and supports deterministic seed overrides', () => {
  const played = hardDropFallingBlocks(newFallingBlocksGame({ seed: 10 }));
  const automatic = restartFallingBlocksGame(played);
  assert.equal(automatic.seed, 11);
  assert.equal(automatic.score, 0);
  assert.equal(automatic.pieces, 0);
  assert.equal(automatic.history.length, 0);
  assert.ok(automatic.board.every((cell) => cell === null));
  assert.deepEqual(restartFallingBlocksGame(played, { seed: 'again' }), newFallingBlocksGame({ seed: 'again' }));
  assert.equal(restartFallingBlocksGame(played, { random: () => 0.25 }).seed, 0x4000_0000);
  assert.equal(restartFallingBlocksGame(newFallingBlocksGame({ seed: 0xffff_ffff })).seed, 0);
  assert.throws(() => restartFallingBlocksGame({ ...played, lines: 2 }), /FALLING_BLOCKS_GAME_INVALID/);
});

test('strict restoration replays history and rejects malformed or forged saves', () => {
  let game = newFallingBlocksGame({ seed: 'save-me' });
  game = moveFallingBlocks(game, 'left');
  game = rotateFallingBlocks(game);
  game = softDropFallingBlocks(game);
  game = advanceFallingBlocks(game, 3);
  game = toggleFallingBlocksPause(game);
  game = toggleFallingBlocksPause(game);
  game = hardDropFallingBlocks(game);

  const serialized = serializeFallingBlocksGame(game);
  const restored = restoreFallingBlocksGame(serialized);
  assert.deepEqual(restored, game);
  assert.notEqual(restored, game);
  assert.notEqual(restored!.board, game.board);
  assert.notEqual(restored!.queue, game.queue);
  assert.notEqual(restored!.history, game.history);

  const corruptions = [
    { ...game, schemaVersion: 99 },
    { ...game, kind: 'other' },
    { ...game, rows: 21 },
    { ...game, columns: 11 },
    { ...game, seed: -1 },
    { ...game, rngState: -1 },
    { ...game, board: game.board.with(0, 'Q') },
    { ...game, board: game.board.with(0, game.board[0] === null ? 'I' : null) },
    { ...game, queue: [] },
    { ...game, queue: [...game.queue, 'I', 'I'] },
    { ...game, active: { ...game.active!, rotation: 4 } },
    { ...game, status: 'finished' },
    { ...game, score: game.score + 1 },
    { ...game, level: 0 },
    { ...game, lines: 1 },
    { ...game, pieces: -1 },
    { ...game, ticks: game.ticks + 1 },
    { ...game, lastAction: 'teleport' },
    { ...game, lastClear: 5 },
    { ...game, lastDropDistance: 21 },
    { ...game, history: game.history.with(0, { kind: 'move', direction: 'up' }) },
    { ...game, history: game.history.with(0, { kind: 'move', direction: 'left', extra: true }) },
    { ...game, history: [...game.history, { kind: 'tick', steps: 0 }] },
    { ...game, unexpected: true },
  ];
  for (const corruption of corruptions) assert.equal(restoreFallingBlocksGame(corruption), null);
  assert.equal(restoreFallingBlocksGame('{broken-json'), null);
  assert.equal(restoreFallingBlocksGame(''), null);
  assert.equal(restoreFallingBlocksGame(null), null);
  assert.equal(restoreFallingBlocksGame([]), null);
  assert.throws(() => serializeFallingBlocksGame({ ...game, score: -1 }), /FALLING_BLOCKS_GAME_INVALID/);
});

test('storage helpers round-trip valid games and fail closed on unavailable storage', () => {
  const values = new Map<string, string>();
  const storage = {
    setItem(key: string, value: string) { values.set(key, value); },
    getItem(key: string) { return values.get(key) ?? null; },
  };
  const game = hardDropFallingBlocks(newFallingBlocksGame({ seed: 17 }));
  assert.equal(saveFallingBlocksGame(game, storage), true);
  assert.equal(values.has(FALLING_BLOCKS_STORAGE_KEY), true);
  assert.deepEqual(loadFallingBlocksGame(storage), game);
  assert.equal(saveFallingBlocksGame(game, storage, 'custom'), true);
  assert.deepEqual(loadFallingBlocksGame(storage, 'custom'), game);

  assert.equal(saveFallingBlocksGame(game, null), false);
  assert.equal(saveFallingBlocksGame(game, storage, ''), false);
  assert.equal(loadFallingBlocksGame(null), null);
  assert.equal(loadFallingBlocksGame(storage, ''), null);
  assert.equal(loadFallingBlocksGame(storage, 'missing'), null);
  assert.equal(loadFallingBlocksGame({ getItem: () => '{bad' }), null);
  assert.equal(saveFallingBlocksGame(game, { setItem: () => { throw new Error('full'); } }), false);
  assert.equal(loadFallingBlocksGame({ getItem: () => { throw new Error('denied'); } }), null);
});
