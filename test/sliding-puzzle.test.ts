import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SLIDING_PUZZLE_DIFFICULTIES,
  SLIDING_PUZZLE_DIRECTIONS,
  advanceSlidingPuzzleTime,
  getSlidingPuzzleMovableIndexes,
  isSlidingPuzzleSolvable,
  isSlidingPuzzleSolved,
  moveSlidingPuzzleDirection,
  moveSlidingPuzzleTile,
  newSlidingPuzzleGame,
  reshuffleSlidingPuzzleGame,
  restoreSlidingPuzzleGame,
  serializeSlidingPuzzleGame,
  slidingPuzzleSeededRandom,
} from '../web/sliding-puzzle.js';

function solvedTiles(size: number) {
  return Array.from({ length: size ** 2 }, (_, index) => (index + 1) % (size ** 2));
}

function directionForTile(blankIndex: number, tileIndex: number, size: number) {
  if (tileIndex === blankIndex + size) return 'up';
  if (tileIndex === blankIndex - size) return 'down';
  if (tileIndex === blankIndex + 1) return 'left';
  if (tileIndex === blankIndex - 1) return 'right';
  throw new Error('not adjacent');
}

test('three product difficulties map to 3x3, 4x4 and 5x5 boards', () => {
  assert.deepEqual(Object.values(SLIDING_PUZZLE_DIFFICULTIES).map(({ size }) => size), [3, 4, 5]);
  assert.deepEqual(SLIDING_PUZZLE_DIRECTIONS, ['up', 'down', 'left', 'right']);

  for (const [difficulty, definition] of Object.entries(SLIDING_PUZZLE_DIFFICULTIES)) {
    const game = newSlidingPuzzleGame({ difficulty, seed: `shape-${difficulty}` });
    assert.equal(game.difficulty, difficulty);
    assert.equal(game.size, definition.size);
    assert.equal(game.tiles.length, definition.size ** 2);
    assert.deepEqual([...game.tiles].sort((left, right) => left - right),
      Array.from({ length: definition.size ** 2 }, (_, index) => index));
    assert.equal(game.tiles[game.blankIndex], 0);
    assert.equal(game.status, 'ready');
    assert.equal(game.moveCount, 0);
    assert.equal(game.elapsedSeconds, 0);
  }

  assert.equal(newSlidingPuzzleGame({ difficulty: 'unknown', seed: 1 }).difficulty, 'easy');
  assert.equal(newSlidingPuzzleGame(null as any).difficulty, 'easy');
});

test('seeded and injected entropy create deterministic, JSON-safe games', () => {
  const first = newSlidingPuzzleGame({ difficulty: 'standard', seed: 'repeatable' });
  const second = newSlidingPuzzleGame({ difficulty: 'standard', seed: 'repeatable' });
  assert.deepEqual(first, second);
  assert.deepEqual(JSON.parse(JSON.stringify(first)), first);

  const randomA = slidingPuzzleSeededRandom('same-stream');
  const randomB = slidingPuzzleSeededRandom('same-stream');
  assert.deepEqual(Array.from({ length: 10 }, randomA), Array.from({ length: 10 }, randomB));
  assert.equal(newSlidingPuzzleGame({ random: () => 0.5 }).seed, 0x8000_0000);
  assert.equal(newSlidingPuzzleGame({ random: () => 0 }).seed, 0);

  assert.throws(() => newSlidingPuzzleGame({ seed: -1 }), /SLIDING_PUZZLE_SEED_INVALID/);
  assert.throws(() => newSlidingPuzzleGame({ seed: '' }), /SLIDING_PUZZLE_SEED_INVALID/);
  assert.throws(() => newSlidingPuzzleGame({ seed: 'x'.repeat(513) }), /SLIDING_PUZZLE_SEED_INVALID/);
  assert.throws(() => newSlidingPuzzleGame({ random: null }), /SLIDING_PUZZLE_RANDOM_INVALID/);
  assert.throws(() => newSlidingPuzzleGame({ random: () => Number.NaN }), /SLIDING_PUZZLE_RANDOM_INVALID/);
  assert.throws(() => newSlidingPuzzleGame({ random: () => 1 }), /SLIDING_PUZZLE_RANDOM_INVALID/);
});

test('every generated board is solvable and never starts completed', () => {
  for (const difficulty of Object.keys(SLIDING_PUZZLE_DIFFICULTIES)) {
    for (let seed = 0; seed < 80; seed += 1) {
      const game = newSlidingPuzzleGame({ difficulty, seed });
      assert.equal(isSlidingPuzzleSolvable(game.tiles, game.size), true, `${difficulty}:${seed}`);
      assert.equal(isSlidingPuzzleSolved(game.tiles), false, `${difficulty}:${seed}`);
    }
  }

  for (const size of [3, 4, 5]) {
    const solved = solvedTiles(size);
    assert.equal(isSlidingPuzzleSolvable(solved, size), true);
    assert.equal(isSlidingPuzzleSolved(solved), true);
    [solved[0], solved[1]] = [solved[1], solved[0]];
    assert.equal(isSlidingPuzzleSolvable(solved, size), false);
  }
  assert.equal(isSlidingPuzzleSolvable([1, 1, 0], 2), false);
  assert.equal(isSlidingPuzzleSolvable([], 3), false);
  assert.equal(isSlidingPuzzleSolved(null), false);
});

test('clicking an adjacent tile moves immutably while other clicks are safe no-ops', () => {
  const initial = newSlidingPuzzleGame({ difficulty: 'standard', seed: 'click-move' });
  const before = structuredClone(initial);
  const movable = getSlidingPuzzleMovableIndexes(initial);
  const index = movable[0]!;
  const tile = initial.tiles[index];
  const moved = moveSlidingPuzzleTile(initial, index);

  assert.deepEqual(initial, before);
  assert.notEqual(moved, initial);
  assert.notEqual(moved.tiles, initial.tiles);
  assert.notEqual(moved.history, initial.history);
  assert.equal(moved.tiles[initial.blankIndex], tile);
  assert.equal(moved.tiles[index], 0);
  assert.equal(moved.blankIndex, index);
  assert.equal(moved.status, 'playing');
  assert.equal(moved.moveCount, 1);
  assert.deepEqual(moved.history, [index]);
  assert.deepEqual(moved.lastMove, {
    tile,
    from: index,
    to: initial.blankIndex,
    direction: directionForTile(initial.blankIndex, index, initial.size),
  });

  const unavailable = initial.tiles.findIndex((_, candidate) => (
    candidate !== initial.blankIndex && !movable.includes(candidate)
  ));
  assert.equal(moveSlidingPuzzleTile(initial, unavailable), initial);
  assert.throws(() => moveSlidingPuzzleTile(initial, -1), /SLIDING_PUZZLE_POSITION_INVALID/);
  assert.throws(() => moveSlidingPuzzleTile(initial, initial.tiles.length), /SLIDING_PUZZLE_POSITION_INVALID/);
  assert.throws(() => moveSlidingPuzzleTile({ ...initial, blankIndex: -1 }, 0), /SLIDING_PUZZLE_GAME_INVALID/);
  assert.throws(() => moveSlidingPuzzleTile(serializeSlidingPuzzleGame(initial) as any, 0), /SLIDING_PUZZLE_GAME_INVALID/);
});

test('direction moves describe tile travel and support Arrow key aliases', () => {
  const game = newSlidingPuzzleGame({ difficulty: 'easy', seed: 3 });
  assert.equal(game.blankIndex, 4, 'fixture keeps all four directions available');
  const indexes: Record<string, number> = { up: 7, down: 1, left: 5, right: 3 };

  for (const direction of SLIDING_PUZZLE_DIRECTIONS) {
    const byDirection = moveSlidingPuzzleDirection(game, direction);
    const byClick = moveSlidingPuzzleTile(game, indexes[direction]!);
    assert.deepEqual(byDirection, byClick);
    const arrow = `Arrow${direction[0]!.toUpperCase()}${direction.slice(1)}`;
    assert.deepEqual(moveSlidingPuzzleDirection(game, arrow), byClick);
  }
  assert.deepEqual(game, newSlidingPuzzleGame({ difficulty: 'easy', seed: 3 }));
  assert.throws(() => moveSlidingPuzzleDirection(game, 'diagonal'), /SLIDING_PUZZLE_DIRECTION_INVALID/);

  const edge = newSlidingPuzzleGame({ difficulty: 'easy', seed: 24_705 });
  assert.equal(edge.blankIndex, 5);
  assert.equal(moveSlidingPuzzleDirection(edge, 'left'), edge, 'no tile can move left from beyond the right edge');
});

test('the timer runs only during active play and keeps immutable counters', () => {
  const ready = newSlidingPuzzleGame({ difficulty: 'standard', seed: 'timer' });
  assert.equal(advanceSlidingPuzzleTime(ready, 10), ready);
  const playing = moveSlidingPuzzleTile(ready, getSlidingPuzzleMovableIndexes(ready)[0]!);
  const timed = advanceSlidingPuzzleTime(playing, 12);
  assert.equal(playing.elapsedSeconds, 0);
  assert.equal(timed.elapsedSeconds, 12);
  assert.equal(timed.moveCount, 1);
  assert.equal(advanceSlidingPuzzleTime(timed, 0), timed);
  assert.throws(() => advanceSlidingPuzzleTime(timed, -1), /SLIDING_PUZZLE_TIME_INVALID/);
  assert.throws(() => advanceSlidingPuzzleTime(timed, 1.5), /SLIDING_PUZZLE_TIME_INVALID/);
  assert.throws(
    () => advanceSlidingPuzzleTime({ ...timed, elapsedSeconds: Number.MAX_SAFE_INTEGER }, 1),
    /SLIDING_PUZZLE_TIME_INVALID/,
  );
});

test('a final move completes the board and locks both movement and time', () => {
  const game = newSlidingPuzzleGame({ difficulty: 'easy', seed: 24_705 });
  assert.deepEqual(game.tiles, [1, 2, 3, 4, 5, 0, 7, 8, 6]);
  const won = moveSlidingPuzzleTile(game, 8);
  assert.equal(isSlidingPuzzleSolved(won.tiles), true);
  assert.equal(won.status, 'won');
  assert.equal(won.moveCount, 1);
  assert.equal(won.lastAction, 'won');
  assert.deepEqual(won.lastMove, { tile: 6, from: 8, to: 5, direction: 'up' });
  assert.deepEqual(getSlidingPuzzleMovableIndexes(won), []);
  assert.equal(moveSlidingPuzzleTile(won, 7), won);
  assert.equal(moveSlidingPuzzleDirection(won, 'right'), won);
  assert.equal(advanceSlidingPuzzleTime(won, 1), won);
});

test('reshuffle resets progress, preserves difficulty by default, and can switch board size', () => {
  const ready = newSlidingPuzzleGame({ difficulty: 'standard', seed: 0 });
  const progressed = advanceSlidingPuzzleTime(
    moveSlidingPuzzleTile(ready, getSlidingPuzzleMovableIndexes(ready)[0]!),
    9,
  );
  const before = structuredClone(progressed);
  const reshuffled = reshuffleSlidingPuzzleGame(progressed, { seed: 'fresh-layout' });
  assert.deepEqual(progressed, before);
  assert.equal(reshuffled.difficulty, 'standard');
  assert.equal(reshuffled.size, 4);
  assert.equal(reshuffled.status, 'ready');
  assert.equal(reshuffled.moveCount, 0);
  assert.equal(reshuffled.elapsedSeconds, 0);
  assert.deepEqual(reshuffled.history, []);
  assert.equal(reshuffled.lastMove, null);
  assert.equal(isSlidingPuzzleSolvable(reshuffled.tiles, reshuffled.size), true);
  assert.equal(isSlidingPuzzleSolved(reshuffled.tiles), false);

  const challenge = reshuffleSlidingPuzzleGame(reshuffled, { difficulty: 'challenge', seed: 8 });
  assert.equal(challenge.difficulty, 'challenge');
  assert.equal(challenge.size, 5);
  assert.equal(challenge.tiles.length, 25);
  const excluded = reshuffleSlidingPuzzleGame(ready, { random: () => 0 });
  assert.equal(excluded.seed, 1, 'an implicit repeated seed is advanced for a fresh shuffle');
});

test('serialization round-trips independent state and strict restore rejects forged data', () => {
  let game = newSlidingPuzzleGame({ difficulty: 'standard', seed: 'restore' });
  const first = getSlidingPuzzleMovableIndexes(game)[0]!;
  game = moveSlidingPuzzleTile(game, first);
  const second = getSlidingPuzzleMovableIndexes(game).find((index) => index !== game.lastMove!.to)!;
  game = moveSlidingPuzzleTile(game, second);
  game = advanceSlidingPuzzleTime(game, 17);

  const serialized = serializeSlidingPuzzleGame(game);
  const restored = restoreSlidingPuzzleGame(serialized);
  assert.deepEqual(restored, game);
  assert.deepEqual(restoreSlidingPuzzleGame(JSON.parse(serialized)), game);
  assert.notEqual(restored?.tiles, game.tiles);
  assert.notEqual(restored?.history, game.history);
  assert.notEqual(restored?.lastMove, game.lastMove);

  const nonBlank = game.tiles.flatMap((tile, index) => tile === 0 ? [] : [index]);
  const unsolvable = [...game.tiles];
  [unsolvable[nonBlank[0]!], unsolvable[nonBlank[1]!]] = [unsolvable[nonBlank[1]!], unsolvable[nonBlank[0]!]];
  const malformedCases = [
    null,
    42,
    { ...game, extra: true },
    { ...game, schemaVersion: 99 },
    { ...game, kind: 'other' },
    { ...game, difficulty: 'expert' },
    { ...game, size: 5 },
    { ...game, seed: -1 },
    { ...game, tiles: game.tiles.slice(1) },
    { ...game, tiles: unsolvable },
    { ...game, blankIndex: game.blankIndex + 1 },
    { ...game, status: 'won' },
    { ...game, moveCount: game.moveCount + 1 },
    { ...game, elapsedSeconds: -1 },
    { ...game, history: [...game.history, game.blankIndex] },
    { ...game, lastAction: 'shuffle' },
    { ...game, lastMove: { ...game.lastMove, tile: 999 } },
    { ...game, lastMove: { ...game.lastMove, extra: true } },
  ];
  for (const malformed of malformedCases) assert.equal(restoreSlidingPuzzleGame(malformed), null);
  assert.equal(restoreSlidingPuzzleGame('{broken-json'), null);
  assert.equal(restoreSlidingPuzzleGame(''), null);
  assert.throws(() => serializeSlidingPuzzleGame({ ...game, status: 'broken' }), /SLIDING_PUZZLE_GAME_INVALID/);
});
