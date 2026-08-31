import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SOKOBAN_DIRECTIONS,
  SOKOBAN_KEY_DIRECTIONS,
  SOKOBAN_LEVELS,
  hasNextSokobanLevel,
  moveSokoban,
  newSokobanGame,
  nextSokobanLevel,
  restoreSokobanGame,
  selectSokobanLevel,
  serializeSokobanGame,
  sokobanCoordinates,
  sokobanDirectionFromKey,
  sokobanPosition,
  undoSokoban,
} from '../web/sokoban.js';

const SOLUTIONS = Object.freeze([
  ['right'],
  ['up'],
  ['right', 'up'],
  ['left', 'up', 'down', 'right', 'right', 'right', 'up'],
  ['left', 'left', 'right', 'right', 'down', 'left', 'left'],
  ['down', 'left', 'left', 'left', 'up', 'up', 'right', 'right', 'down', 'right', 'up'],
]);

function play(game: any, moves: readonly string[]) {
  return moves.reduce((current, direction) => moveSokoban(current, direction), game);
}

test('six original built-in levels expose immutable canonical boards', () => {
  assert.equal(SOKOBAN_LEVELS.length, 6);
  assert.equal(new Set(SOKOBAN_LEVELS.map((level) => level.id)).size, 6);
  assert.equal(Object.isFrozen(SOKOBAN_LEVELS), true);
  for (const level of SOKOBAN_LEVELS) {
    assert.equal(Object.isFrozen(level), true);
    assert.equal(Object.isFrozen(level.walls), true);
    assert.equal(Object.isFrozen(level.targets), true);
    assert.equal(Object.isFrozen(level.boxes), true);
    assert.equal(level.boxes.length, level.targets.length);
    assert.ok(level.boxes.length >= 1);
    assert.equal(level.walls.includes(level.player), false);
    assert.equal(level.boxes.some((box) => level.walls.includes(box)), false);
  }
  const game = newSokobanGame();
  assert.equal(game.levelId, SOKOBAN_LEVELS[0].id);
  assert.equal(game.status, 'playing');
  assert.deepEqual(JSON.parse(JSON.stringify(game)), game);
  assert.notEqual(game.walls, SOKOBAN_LEVELS[0].walls);
  assert.throws(() => newSokobanGame({ level: 99 }), /SOKOBAN_LEVEL_INVALID/);
});

test('coordinate helpers and keyboard input map exactly four movement directions', () => {
  assert.deepEqual(Object.keys(SOKOBAN_DIRECTIONS), ['up', 'down', 'left', 'right']);
  assert.equal(sokobanPosition(2, 3, 5, 6), 15);
  assert.deepEqual(sokobanCoordinates(15, 5, 6), { row: 2, column: 3 });
  assert.throws(() => sokobanPosition(-1, 0, 5, 6), /SOKOBAN_COORDINATES_INVALID/);
  assert.throws(() => sokobanCoordinates(30, 5, 6), /SOKOBAN_INDEX_INVALID/);
  assert.equal(sokobanDirectionFromKey('ArrowUp'), 'up');
  assert.equal(sokobanDirectionFromKey('ArrowDown'), 'down');
  assert.equal(sokobanDirectionFromKey('ArrowLeft'), 'left');
  assert.equal(sokobanDirectionFromKey('ArrowRight'), 'right');
  assert.equal(sokobanDirectionFromKey('W'), 'up');
  assert.equal(sokobanDirectionFromKey('a'), 'left');
  assert.equal(sokobanDirectionFromKey('S'), 'down');
  assert.equal(sokobanDirectionFromKey('d'), 'right');
  assert.equal(sokobanDirectionFromKey('Enter'), null);
  assert.equal(SOKOBAN_KEY_DIRECTIONS.ArrowRight, 'right');
});

test('walking, wall blocking and a single-box push are immutable and count only successful steps', () => {
  const ready = newSokobanGame({ level: 0 });
  const up = moveSokoban(ready, 'up');
  assert.notEqual(up, ready);
  assert.equal(ready.steps, 0);
  assert.equal(up.steps, 1);
  assert.equal(up.pushes, 0);
  assert.deepEqual(ready.moves, []);
  const atLeftEdge = play(ready, ['left']);
  const blocked = moveSokoban(atLeftEdge, 'left');
  assert.deepEqual(blocked, atLeftEdge);
  assert.equal(blocked.steps, 1);

  const won = moveSokoban(ready, 'right');
  assert.equal(won.status, 'won');
  assert.equal(won.steps, 1);
  assert.equal(won.pushes, 1);
  assert.equal(won.boxes.every((box) => won.targets.includes(box)), true);
  assert.deepEqual(moveSokoban(won, 'left'), won, 'completed boards are locked');
  assert.throws(() => moveSokoban(ready, 'diagonal'), /SOKOBAN_DIRECTION_INVALID/);
});

test('a box cannot be chain-pushed through another box or pushed into a wall', () => {
  const twin = play(newSokobanGame({ level: 'twin-lanterns' }), ['left', 'left', 'up', 'right', 'right']);
  assert.equal(twin.pushes, 2);
  const chainBlocked = moveSokoban(twin, 'right');
  assert.deepEqual(chainBlocked, twin);
  assert.equal(chainBlocked.pushes, 2);

  const vertical = play(newSokobanGame({ level: 'north-star' }), [
    'left', 'up', 'up', 'right', 'down', 'down',
  ]);
  assert.equal(vertical.pushes, 2);
  const wallBlocked = moveSokoban(vertical, 'down');
  assert.deepEqual(wallBlocked, vertical);
  assert.equal(wallBlocked.steps, vertical.steps);
});

test('every built-in level has a verified solution and completes only when every box is on a target', () => {
  assert.equal(SOLUTIONS.length, SOKOBAN_LEVELS.length);
  SOLUTIONS.forEach((solution, level) => {
    const ready = newSokobanGame({ level });
    const won = play(ready, solution);
    assert.equal(won.status, 'won', `level ${level + 1} should be solvable`);
    assert.equal(won.steps, solution.length);
    assert.equal(won.boxes.length, won.targets.length);
    assert.equal(won.boxes.every((box) => won.targets.includes(box)), true);
    if (won.boxes.length > 1) {
      const beforeFinal = play(ready, solution.slice(0, -1));
      assert.equal(beforeFinal.status, 'playing');
    }
  });
});

test('undo restores the exact previous immutable state, including a completed board', () => {
  const ready = newSokobanGame({ level: 3 });
  const walked = moveSokoban(ready, 'left');
  const pushed = moveSokoban(walked, 'up');
  assert.equal(pushed.pushes, 1);
  assert.deepEqual(undoSokoban(pushed), walked);
  assert.equal(pushed.pushes, 1, 'undo must not mutate its input');
  assert.deepEqual(undoSokoban(ready), ready);

  const won = play(newSokobanGame({ level: 0 }), SOLUTIONS[0]);
  const reopened = undoSokoban(won);
  assert.equal(reopened.status, 'playing');
  assert.equal(reopened.steps, 0);
  assert.equal(reopened.pushes, 0);
  assert.deepEqual(reopened, newSokobanGame({ level: 0 }));
});

test('level selection resets progress and next-level navigation stops safely at the finale', () => {
  const progressed = moveSokoban(newSokobanGame({ level: 0 }), 'up');
  const selected = selectSokobanLevel(progressed, 'parallel-lines');
  assert.equal(selected.levelIndex, 4);
  assert.equal(selected.steps, 0);
  assert.equal(selected.pushes, 0);
  assert.deepEqual(selected.moves, []);
  assert.equal(hasNextSokobanLevel(selected), true);

  const next = nextSokobanLevel(selected);
  assert.equal(next.levelIndex, 5);
  assert.equal(next.levelId, 'stone-gate');
  assert.equal(hasNextSokobanLevel(next), false);
  assert.deepEqual(nextSokobanLevel(next), next);
  assert.throws(() => selectSokobanLevel(selected, 'missing'), /SOKOBAN_LEVEL_INVALID/);
});

test('serialization round-trips independent state and strict restore rejects forged snapshots', () => {
  const game = play(newSokobanGame({ level: 3 }), ['left', 'up', 'down', 'right']);
  const serialized = serializeSokobanGame(game);
  const restored = restoreSokobanGame(JSON.parse(serialized));
  assert.deepEqual(restored, game);
  assert.notEqual(restored?.walls, game.walls);
  assert.notEqual(restored?.targets, game.targets);
  assert.notEqual(restored?.boxes, game.boxes);
  assert.notEqual(restored?.moves, game.moves);

  assert.equal(restoreSokobanGame({ ...game, schemaVersion: 99 }), null);
  assert.equal(restoreSokobanGame({ ...game, unexpected: true }), null);
  assert.equal(restoreSokobanGame({ ...game, levelId: 'forged' }), null);
  assert.equal(restoreSokobanGame({ ...game, walls: game.walls.slice(1) }), null);
  assert.equal(restoreSokobanGame({ ...game, targets: [...game.targets].reverse() }), null);
  assert.equal(restoreSokobanGame({ ...game, boxes: [game.boxes[0], game.boxes[0]] }), null);
  assert.equal(restoreSokobanGame({ ...game, player: game.player + 1 }), null);
  assert.equal(restoreSokobanGame({ ...game, steps: game.steps + 1 }), null);
  assert.equal(restoreSokobanGame({ ...game, pushes: game.pushes + 1 }), null);
  assert.equal(restoreSokobanGame({ ...game, status: 'won' }), null);
  assert.equal(restoreSokobanGame({ ...game, moves: [...game.moves, 'invalid'] }), null);
  assert.equal(restoreSokobanGame(null), null);
  assert.throws(() => serializeSokobanGame({ ...game, steps: -1 }), /SOKOBAN_GAME_INVALID/);
  assert.throws(() => undoSokoban({ ...game, boxes: [] }), /SOKOBAN_GAME_INVALID/);
});
