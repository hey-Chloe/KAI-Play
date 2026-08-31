import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MAZE_DIFFICULTIES,
  MAZE_DIRECTIONS,
  getMazeAvailableDirections,
  getMazeCell,
  getMazeCells,
  getMazeHintPath,
  isPerfectMaze,
  mazeCoordinates,
  mazeDirectionFromKey,
  mazePosition,
  mazeSeededRandom,
  moveMaze,
  newMazeForGame,
  newMazeGame,
  restartMazeGame,
  restoreMazeGame,
  serializeMazeGame,
  toggleMazeHint,
} from '../web/maze.js';

type MazeGame = ReturnType<typeof newMazeGame>;
type MazeDirection = 'up' | 'right' | 'down' | 'left';

const OPPOSITE: Record<MazeDirection, MazeDirection> = {
  up: 'down',
  right: 'left',
  down: 'up',
  left: 'right',
};

function directionBetween(from: number, to: number, columns: number): MazeDirection {
  if (to === from - columns) return 'up';
  if (to === from + 1 && Math.floor(to / columns) === Math.floor(from / columns)) return 'right';
  if (to === from + columns) return 'down';
  if (to === from - 1 && Math.floor(to / columns) === Math.floor(from / columns)) return 'left';
  throw new Error(`cells ${from} and ${to} are not adjacent`);
}

function directionsForPath(path: readonly number[], columns: number) {
  return path.slice(1).map((index, offset) => directionBetween(path[offset]!, index, columns));
}

function complete(game: MazeGame) {
  const hinted = toggleMazeHint(game);
  return directionsForPath(getMazeHintPath(hinted), game.columns)
    .reduce((current, direction) => moveMaze(current, direction), hinted);
}

test('three product difficulties create distinct 7x7, 11x11 and 15x15 games', () => {
  assert.deepEqual(Object.values(MAZE_DIFFICULTIES).map(({ rows, columns }) => [rows, columns]), [
    [7, 7],
    [11, 11],
    [15, 15],
  ]);
  assert.deepEqual(MAZE_DIRECTIONS, ['up', 'right', 'down', 'left']);

  for (const [difficulty, definition] of Object.entries(MAZE_DIFFICULTIES)) {
    const game = newMazeGame({ difficulty, seed: `shape-${difficulty}` });
    assert.equal(game.difficulty, difficulty);
    assert.equal(game.rows, definition.rows);
    assert.equal(game.columns, definition.columns);
    assert.equal(game.passages.length, definition.rows * definition.columns);
    assert.equal(game.startIndex, 0);
    assert.equal(game.goalIndex, game.passages.length - 1);
    assert.equal(game.playerIndex, game.startIndex);
    assert.equal(game.status, 'ready');
    assert.equal(game.stepCount, 0);
    assert.equal(game.bestPathLength > 0, true);
    assert.deepEqual(game.history, []);
    assert.equal(game.lastMove, null);
    assert.equal(game.hintVisible, false);
  }

  assert.equal(newMazeGame({ difficulty: 'unknown', seed: 1 }).difficulty, 'easy');
  assert.equal(newMazeGame(null as any).difficulty, 'easy');
});

test('seed and injected entropy are deterministic and strictly bounded', () => {
  const first = newMazeGame({ difficulty: 'standard', seed: 'repeatable' });
  const second = newMazeGame({ difficulty: 'standard', seed: 'repeatable' });
  assert.deepEqual(first, second);
  assert.deepEqual(JSON.parse(JSON.stringify(first)), first);
  assert.notDeepEqual(
    newMazeGame({ difficulty: 'standard', seed: 'repeatable-a' }).passages,
    newMazeGame({ difficulty: 'standard', seed: 'repeatable-b' }).passages,
  );

  const randomA = mazeSeededRandom('same-stream');
  const randomB = mazeSeededRandom('same-stream');
  assert.deepEqual(Array.from({ length: 12 }, randomA), Array.from({ length: 12 }, randomB));
  assert.equal(newMazeGame({ random: () => 0.5 }).seed, 0x8000_0000);
  assert.equal(newMazeGame({ random: () => 0 }).seed, 0);

  assert.throws(() => newMazeGame({ seed: -1 }), /MAZE_SEED_INVALID/);
  assert.throws(() => newMazeGame({ seed: 0x1_0000_0000 }), /MAZE_SEED_INVALID/);
  assert.throws(() => newMazeGame({ seed: '' }), /MAZE_SEED_INVALID/);
  assert.throws(() => newMazeGame({ seed: 'x'.repeat(513) }), /MAZE_SEED_INVALID/);
  assert.throws(() => newMazeGame({ random: null }), /MAZE_RANDOM_INVALID/);
  assert.throws(() => newMazeGame({ random: () => Number.NaN }), /MAZE_RANDOM_INVALID/);
  assert.throws(() => newMazeGame({ random: () => -0.1 }), /MAZE_RANDOM_INVALID/);
  assert.throws(() => newMazeGame({ random: () => 1 }), /MAZE_RANDOM_INVALID/);
});

test('generation always produces a connected acyclic perfect maze', () => {
  for (const difficulty of Object.keys(MAZE_DIFFICULTIES)) {
    for (let seed = 0; seed < 60; seed += 1) {
      const game = newMazeGame({ difficulty, seed });
      assert.equal(isPerfectMaze(game.passages, game.rows, game.columns), true, `${difficulty}:${seed}`);
      const openingCount = game.passages.reduce((sum, value) => (
        sum + value.toString(2).replaceAll('0', '').length
      ), 0);
      assert.equal(openingCount / 2, game.passages.length - 1, `${difficulty}:${seed} has n-1 edges`);
      assert.equal(getMazeHintPath(toggleMazeHint(game)).length, game.bestPathLength + 1);
    }
  }

  assert.equal(isPerfectMaze([6, 8, 3, 8], 2, 2), true);
  assert.equal(isPerfectMaze([6, 12, 3, 9], 2, 2), false, 'a cycle is not perfect');
  assert.equal(isPerfectMaze([2, 8, 2, 8], 2, 2), false, 'disconnected rooms are not perfect');
  assert.equal(isPerfectMaze([7, 8, 3, 8], 2, 2), false, 'an opening cannot leave the board');
  assert.equal(isPerfectMaze([2, 0, 0, 0], 2, 2), false, 'openings must be symmetric');
  assert.equal(isPerfectMaze([6, 8, 3], 2, 2), false);
  assert.equal(isPerfectMaze([6, 8, 3, 16], 2, 2), false);
  assert.equal(isPerfectMaze([], 1, 1), false);
});

test('coordinates and cell projections expose a board without leaking mutable state', () => {
  assert.equal(mazePosition(2, 3, 7, 7), 17);
  assert.deepEqual(mazeCoordinates(17, 7, 7), { row: 2, column: 3 });
  assert.throws(() => mazePosition(-1, 0, 7, 7), /MAZE_POSITION_INVALID/);
  assert.throws(() => mazePosition(7, 0, 7, 7), /MAZE_POSITION_INVALID/);
  assert.throws(() => mazeCoordinates(49, 7, 7), /MAZE_POSITION_INVALID/);
  assert.throws(() => mazeCoordinates(0, 1, 1), /MAZE_DIMENSIONS_INVALID/);

  const game = newMazeGame({ seed: 'cells' });
  const start = getMazeCell(game, game.startIndex);
  const goal = getMazeCell(game, game.goalIndex);
  const cells = getMazeCells(game);
  assert.deepEqual(Object.entries(start.openings).flatMap(([direction, open]) => (
    open ? [direction] : []
  )), getMazeAvailableDirections(game));
  assert.equal(start.start, true);
  assert.equal(start.player, true);
  assert.equal(start.goal, false);
  assert.equal(goal.goal, true);
  assert.equal(goal.player, false);
  assert.equal(Object.isFrozen(start), true);
  assert.equal(Object.isFrozen(start.openings), true);
  assert.equal(cells.length, game.rows * game.columns);
  assert.deepEqual(cells[game.startIndex], start);
  assert.deepEqual(cells[game.goalIndex], goal);
  assert.equal(Object.isFrozen(cells), true);
  assert.equal(Object.isFrozen(cells[0]), true);
  assert.equal(Object.isFrozen(getMazeAvailableDirections(game)), true);
  assert.throws(() => getMazeCell(game, -1), /MAZE_POSITION_INVALID/);
  assert.throws(() => getMazeAvailableDirections(game, game.passages.length), /MAZE_POSITION_INVALID/);
});

test('direction keys and WASD move through openings immutably while walls are no-ops', () => {
  const game = newMazeGame({ difficulty: 'easy', seed: 'keyboard' });
  const before = structuredClone(game);
  const direction = getMazeAvailableDirections(game)[0]! as MazeDirection;
  const keyForDirection = { up: 'ArrowUp', right: 'ArrowRight', down: 'ArrowDown', left: 'ArrowLeft' }[direction];
  const wasdForDirection = { up: 'w', right: 'd', down: 's', left: 'a' }[direction];
  const moved = moveMaze(game, direction);

  assert.deepEqual(game, before);
  assert.notEqual(moved, game);
  assert.notEqual(moved.history, game.history);
  assert.equal(moved.status, moved.playerIndex === moved.goalIndex ? 'won' : 'playing');
  assert.equal(moved.stepCount, 1);
  assert.deepEqual(moved.history, [direction]);
  assert.deepEqual(moved.lastMove, { direction, from: game.startIndex, to: moved.playerIndex });
  assert.deepEqual(moveMaze(game, keyForDirection), moved);
  assert.deepEqual(moveMaze(game, wasdForDirection), moved);
  assert.deepEqual(moveMaze(game, wasdForDirection.toUpperCase()), moved);

  const blocked = MAZE_DIRECTIONS.find((candidate) => !getMazeAvailableDirections(game).includes(candidate))!;
  assert.equal(moveMaze(game, blocked), game);
  assert.throws(() => moveMaze(game, 'q'), /MAZE_DIRECTION_INVALID/);
  assert.throws(() => moveMaze({ ...game, playerIndex: -1 } as any, direction), /MAZE_GAME_INVALID/);
  assert.throws(() => moveMaze(serializeMazeGame(game) as any, direction), /MAZE_GAME_INVALID/);
});

test('key normalization covers Arrow keys, WASD and canonical directions', () => {
  const mappings: Record<string, MazeDirection> = {
    ArrowUp: 'up', ArrowRight: 'right', ArrowDown: 'down', ArrowLeft: 'left',
    w: 'up', W: 'up', d: 'right', D: 'right', s: 'down', S: 'down', a: 'left', A: 'left',
    up: 'up', right: 'right', down: 'down', left: 'left',
  };
  for (const [key, direction] of Object.entries(mappings)) assert.equal(mazeDirectionFromKey(key), direction);
  assert.equal(mazeDirectionFromKey('Space'), null);
  assert.equal(mazeDirectionFromKey(null as any), null);
});

test('route hint toggles without moving and continuously follows the shortest route', () => {
  const initial = newMazeGame({ difficulty: 'standard', seed: 'hint' });
  assert.deepEqual(getMazeHintPath(initial), []);
  const hinted = toggleMazeHint(initial);
  const path = getMazeHintPath(hinted);

  assert.equal(initial.hintVisible, false);
  assert.equal(hinted.hintVisible, true);
  assert.equal(hinted.playerIndex, initial.playerIndex);
  assert.equal(hinted.stepCount, 0);
  assert.equal(hinted.status, 'ready');
  assert.deepEqual(hinted.history, []);
  assert.equal(path[0], initial.startIndex);
  assert.equal(path.at(-1), initial.goalIndex);
  assert.equal(path.length, initial.bestPathLength + 1);

  const moved = moveMaze(hinted, directionBetween(path[0]!, path[1]!, initial.columns));
  const remaining = getMazeHintPath(moved);
  assert.equal(moved.hintVisible, true);
  assert.equal(remaining[0], moved.playerIndex);
  assert.equal(remaining.at(-1), moved.goalIndex);
  assert.equal(remaining.length, path.length - 1);

  const hidden = toggleMazeHint(moved);
  assert.equal(hidden.playerIndex, moved.playerIndex);
  assert.equal(hidden.stepCount, moved.stepCount);
  assert.deepEqual(getMazeHintPath(hidden), []);
});

test('following the hinted route reaches the goal, scores the optimum and locks the result', () => {
  const initial = newMazeGame({ difficulty: 'challenge', seed: 'finish' });
  const before = structuredClone(initial);
  const won = complete(initial);

  assert.deepEqual(initial, before);
  assert.equal(won.status, 'won');
  assert.equal(won.playerIndex, won.goalIndex);
  assert.equal(won.stepCount, won.bestPathLength);
  assert.equal(won.history.length, won.bestPathLength);
  assert.equal(won.hintVisible, false);
  assert.equal(won.lastMove?.to, won.goalIndex);
  assert.equal(moveMaze(won, OPPOSITE[won.lastMove!.direction as MazeDirection]), won);
  assert.equal(toggleMazeHint(won), won);
  assert.deepEqual(getMazeHintPath(won), []);
});

test('step count records detours rather than distance from the entrance', () => {
  const initial = newMazeGame({ seed: 'detour' });
  const outward = getMazeAvailableDirections(initial)[0]! as MazeDirection;
  const moved = moveMaze(initial, outward);
  const returned = moveMaze(moved, OPPOSITE[outward]);
  assert.equal(returned.playerIndex, initial.startIndex);
  assert.equal(returned.stepCount, 2);
  assert.equal(returned.status, 'playing');
  assert.deepEqual(returned.history, [outward, OPPOSITE[outward]]);
});

test('restart keeps the seed while a new maze resets progress and can switch difficulty', () => {
  const ready = newMazeGame({ difficulty: 'standard', seed: 0 });
  const progressed = toggleMazeHint(moveMaze(ready, getMazeAvailableDirections(ready)[0]!));
  const before = structuredClone(progressed);
  const restarted = restartMazeGame(progressed);

  assert.deepEqual(progressed, before);
  assert.deepEqual(restarted, newMazeGame({ difficulty: 'standard', seed: ready.seed }));
  const fresh = newMazeForGame(progressed, { seed: 'fresh-layout' });
  assert.equal(fresh.difficulty, 'standard');
  assert.equal(fresh.status, 'ready');
  assert.equal(fresh.stepCount, 0);
  assert.equal(fresh.hintVisible, false);
  assert.notEqual(fresh.seed, ready.seed);
  assert.notDeepEqual(fresh.passages, ready.passages);

  const challenge = newMazeForGame(fresh, { difficulty: 'challenge', seed: 8 });
  assert.equal(challenge.difficulty, 'challenge');
  assert.equal(challenge.rows, 15);
  assert.equal(challenge.passages.length, 225);
  assert.equal(newMazeForGame(ready, { random: () => 0 }).seed, 1,
    'an implicit duplicate seed advances to make a new maze');
});

test('strict JSON restore replays history and rejects corrupted or forged progress', () => {
  let game = newMazeGame({ difficulty: 'standard', seed: 'restore' });
  for (let count = 0; count < 3; count += 1) {
    const next = getMazeAvailableDirections(game)
      .find((direction) => direction !== (game.lastMove && OPPOSITE[game.lastMove.direction as MazeDirection]))!;
    game = moveMaze(game, next);
  }
  game = toggleMazeHint(game);

  const serialized = serializeMazeGame(game);
  const restored = restoreMazeGame(serialized);
  assert.deepEqual(restored, game);
  assert.deepEqual(restoreMazeGame(JSON.parse(serialized)), game);
  assert.notEqual(restored?.passages, game.passages);
  assert.notEqual(restored?.history, game.history);
  assert.notEqual(restored?.lastMove, game.lastMove);
  assert.deepEqual(restoreMazeGame(serializeMazeGame(complete(newMazeGame({ seed: 91 }))))?.status, 'won');

  const forgedPassages = [...game.passages];
  forgedPassages[0] ^= 1;
  const blocked = MAZE_DIRECTIONS.find((direction) => (
    !getMazeAvailableDirections(newMazeGame({ difficulty: game.difficulty, seed: game.seed })).includes(direction)
  ))!;
  const malformedCases = [
    null,
    42,
    { ...game, extra: true },
    { ...game, schemaVersion: 99 },
    { ...game, kind: 'other' },
    { ...game, difficulty: 'expert' },
    { ...game, rows: game.rows + 1 },
    { ...game, columns: game.columns + 1 },
    { ...game, seed: -1 },
    { ...game, seed: 0x1_0000_0000 },
    { ...game, passages: game.passages.slice(1) },
    { ...game, passages: forgedPassages },
    { ...game, startIndex: 1 },
    { ...game, goalIndex: game.goalIndex - 1 },
    { ...game, playerIndex: -1 },
    { ...game, status: 'won' },
    { ...game, stepCount: game.stepCount + 1 },
    { ...game, bestPathLength: game.bestPathLength + 1 },
    { ...game, history: [...game.history, 'sideways'] },
    { ...game, history: [blocked], stepCount: 1, playerIndex: game.startIndex, status: 'playing' },
    { ...game, lastMove: { ...game.lastMove, to: game.startIndex } },
    { ...game, lastMove: { ...game.lastMove, extra: true } },
    { ...game, hintVisible: 'yes' },
  ];
  for (const malformed of malformedCases) assert.equal(restoreMazeGame(malformed), null);
  const won = complete(newMazeGame({ seed: 'won-restore' }));
  assert.equal(restoreMazeGame({ ...won, hintVisible: true }), null);
  assert.equal(restoreMazeGame('{broken-json'), null);
  assert.equal(restoreMazeGame(''), null);
  assert.equal(restoreMazeGame('x'.repeat(10_000_001)), null);
  assert.throws(() => serializeMazeGame({ ...game, status: 'broken' }), /MAZE_GAME_INVALID/);
});
