import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MINESWEEPER_DIFFICULTIES,
  chordMinesweeperCell,
  getMinesweeperCell,
  getMinesweeperNeighborIndexes,
  getMinesweeperRemainingMines,
  minesweeperCoordinates,
  minesweeperPosition,
  minesweeperSeededRandom,
  newMinesweeperGame,
  restoreMinesweeperGame,
  revealMinesweeperCell,
  toggleMinesweeperFlag,
} from '../web/minesweeper.js';

function hiddenIndexes(game: any, predicate: (index: number) => boolean = () => true) {
  return game.revealed.flatMap((revealed: boolean, index: number) => !revealed && predicate(index) ? [index] : []);
}

function revealedChordCandidate(game: any) {
  return game.revealed.findIndex((revealed: boolean, index: number) => {
    if (!revealed || game.adjacent[index] < 1) return false;
    const neighbors = getMinesweeperNeighborIndexes(index, game.rows, game.columns);
    const hiddenMines = neighbors.filter((neighbor) => !game.revealed[neighbor] && game.mines[neighbor]);
    const hiddenSafe = neighbors.filter((neighbor) => !game.revealed[neighbor] && !game.mines[neighbor]);
    return hiddenMines.length === game.adjacent[index] && hiddenSafe.length > 0;
  });
}

test('difficulty definitions and coordinate helpers cover the three product levels', () => {
  assert.deepEqual(Object.values(MINESWEEPER_DIFFICULTIES).map(({ rows, columns, mines }) => [rows, columns, mines]), [
    [9, 9, 10],
    [12, 12, 22],
    [16, 16, 40],
  ]);
  assert.equal(minesweeperPosition(2, 3, 9, 9), 21);
  assert.deepEqual(minesweeperCoordinates(21, 9, 9), { row: 2, column: 3 });
  assert.deepEqual(getMinesweeperNeighborIndexes(0, 9, 9), [1, 9, 10]);
  assert.equal(getMinesweeperNeighborIndexes(40, 9, 9).length, 8);
  assert.throws(() => minesweeperPosition(-1, 0, 9, 9), /MINESWEEPER_POSITION_INVALID/);
  assert.throws(() => minesweeperCoordinates(81, 9, 9), /MINESWEEPER_POSITION_INVALID/);
  assert.throws(() => getMinesweeperNeighborIndexes(0, 0, 9), /MINESWEEPER_DIMENSIONS_INVALID/);
});

test('seeded creation is deterministic, serializable, and validates entropy sources', () => {
  const first = newMinesweeperGame({ difficulty: 'standard', seed: 'stable-seed' });
  const second = newMinesweeperGame({ difficulty: 'standard', seed: 'stable-seed' });
  assert.deepEqual(first, second);
  assert.deepEqual(JSON.parse(JSON.stringify(first)), first);
  const randomA = minesweeperSeededRandom('same');
  const randomB = minesweeperSeededRandom('same');
  assert.deepEqual(Array.from({ length: 8 }, randomA), Array.from({ length: 8 }, randomB));
  assert.equal(newMinesweeperGame({ difficulty: 'unknown', seed: 1 }).difficulty, 'beginner');
  assert.equal(newMinesweeperGame({ random: () => 0.5 }).seed, 0x8000_0000);
  assert.throws(() => newMinesweeperGame({ random: () => Number.NaN }), /MINESWEEPER_RANDOM_INVALID/);
  assert.throws(() => newMinesweeperGame({ seed: -1 }), /MINESWEEPER_SEED_INVALID/);
  assert.throws(() => newMinesweeperGame({ seed: {} }), /MINESWEEPER_SEED_INVALID/);
});

test('every difficulty protects the first cell and its full 3x3 neighborhood', () => {
  for (const difficulty of Object.keys(MINESWEEPER_DIFFICULTIES)) {
    for (const index of [0, 4, Math.floor((MINESWEEPER_DIFFICULTIES as any)[difficulty].rows * (MINESWEEPER_DIFFICULTIES as any)[difficulty].columns / 2)]) {
      const ready = newMinesweeperGame({ difficulty, seed: `safe-${difficulty}-${index}` });
      const played = revealMinesweeperCell(ready, index);
      assert.equal(ready.status, 'ready');
      assert.equal(ready.mines, null, 'input state is not mutated');
      assert.equal(played.firstReveal, index);
      assert.equal(played.mines[index], false);
      assert.equal(played.revealed[index], true);
      assert.equal(played.mines.filter(Boolean).length, played.mineCount);
      for (const neighbor of getMinesweeperNeighborIndexes(index, played.rows, played.columns)) {
        assert.equal(played.mines[neighbor], false, `${difficulty} index ${index} neighbor ${neighbor}`);
      }
    }
  }
});

test('the first empty cell floods connected blanks and their numbered border', () => {
  const ready = newMinesweeperGame({ difficulty: 'beginner', seed: 'flood' });
  const game = revealMinesweeperCell(ready, 40);
  assert.equal(game.adjacent[40], 0);
  assert.ok(game.revealedCount > 9);
  assert.equal(game.lastAction, 'flood');
  for (let index = 0; index < game.revealed.length; index += 1) {
    if (!game.revealed[index] || game.adjacent[index] !== 0) continue;
    for (const neighbor of getMinesweeperNeighborIndexes(index, game.rows, game.columns)) {
      assert.equal(game.revealed[neighbor], true, `zero ${index} must expose neighbor ${neighbor}`);
      assert.equal(game.mines[neighbor], false);
    }
  }
  assert.deepEqual(ready.revealed, Array(81).fill(false));
});

test('flags toggle immutably, update counters, cap at the mine count, and block reveals', () => {
  const ready = newMinesweeperGame({ seed: 'flags' });
  const flagged = toggleMinesweeperFlag(ready, 0);
  assert.equal(ready.flagged[0], false);
  assert.equal(flagged.flagged[0], true);
  assert.equal(flagged.flagCount, 1);
  assert.equal(flagged.moveCount, 1);
  assert.equal(getMinesweeperRemainingMines(flagged), 9);
  assert.equal(revealMinesweeperCell(flagged, 0), flagged);
  const unflagged = toggleMinesweeperFlag(flagged, 0);
  assert.equal(unflagged.flagged[0], false);
  assert.equal(unflagged.flagCount, 0);
  assert.equal(unflagged.moveCount, 2);

  let capped = ready;
  for (let index = 0; index <= ready.mineCount; index += 1) capped = toggleMinesweeperFlag(capped, index);
  assert.equal(capped.flagCount, ready.mineCount);
  assert.equal(capped.flagged[ready.mineCount], false);
  assert.equal(getMinesweeperRemainingMines(capped), 0);
});

test('repeated and invalid actions are safe while malformed game state is rejected', () => {
  const game = revealMinesweeperCell(newMinesweeperGame({ seed: 'no-op' }), 40);
  assert.equal(revealMinesweeperCell(game, 40), game);
  assert.equal(toggleMinesweeperFlag(game, 40), game);
  assert.equal(chordMinesweeperCell(game, 40), game, 'zero cells cannot be chorded');
  assert.throws(() => revealMinesweeperCell(game, -1), /MINESWEEPER_POSITION_INVALID/);
  assert.throws(() => toggleMinesweeperFlag(game, 81), /MINESWEEPER_POSITION_INVALID/);
  assert.throws(() => chordMinesweeperCell(game, 1.5), /MINESWEEPER_POSITION_INVALID/);
  assert.throws(() => revealMinesweeperCell({ ...game, status: 'broken' }, 1), /MINESWEEPER_GAME_INVALID/);
});

test('a correct chord reveals all unflagged neighbors and records one chord move', () => {
  let game = revealMinesweeperCell(newMinesweeperGame({ seed: 'correct-chord' }), 40);
  const center = revealedChordCandidate(game);
  assert.notEqual(center, -1);
  const neighbors = getMinesweeperNeighborIndexes(center, game.rows, game.columns);
  const mines = neighbors.filter((index) => game.mines[index]);
  for (const mine of mines) game = toggleMinesweeperFlag(game, mine);
  const beforeMoves = game.moveCount;
  const chorded = chordMinesweeperCell(game, center);
  assert.notEqual(chorded, game);
  assert.equal(chorded.status === 'playing' || chorded.status === 'won', true);
  assert.equal(chorded.chordCount, 1);
  assert.equal(chorded.moveCount, beforeMoves + 1);
  for (const neighbor of neighbors) {
    if (!mines.includes(neighbor)) assert.equal(chorded.revealed[neighbor], true);
  }
});

test('a chord with the right number of wrong flags exposes a mine and loses', () => {
  let game = revealMinesweeperCell(newMinesweeperGame({ seed: 'wrong-chord' }), 40);
  const center = revealedChordCandidate(game);
  assert.notEqual(center, -1);
  const neighbors = getMinesweeperNeighborIndexes(center, game.rows, game.columns);
  const mines = neighbors.filter((index) => !game.revealed[index] && game.mines[index]);
  const safe = neighbors.find((index) => !game.revealed[index] && !game.mines[index]);
  assert.ok(mines.length > 0 && safe !== undefined);
  game = toggleMinesweeperFlag(game, safe!);
  for (const mine of mines.slice(1)) game = toggleMinesweeperFlag(game, mine);
  assert.equal(neighbors.filter((index) => game.flagged[index]).length, game.adjacent[center]);
  const lost = chordMinesweeperCell(game, center);
  assert.equal(lost.status, 'lost');
  assert.equal(lost.lastAction, 'chord-mine');
  assert.equal(lost.explodedIndex, mines[0]);
  assert.equal(lost.chordCount, 1);
  assert.equal(lost.mines.every((mine: boolean, index: number) => !mine || lost.revealed[index]), true);
});

test('revealing a mine loses, exposes every mine, and freezes the terminal board', () => {
  const playing = revealMinesweeperCell(newMinesweeperGame({ seed: 'loss' }), 40);
  const mine = hiddenIndexes(playing, (index) => playing.mines[index])[0];
  const lost = revealMinesweeperCell(playing, mine);
  assert.equal(lost.status, 'lost');
  assert.equal(lost.explodedIndex, mine);
  assert.equal(lost.lastAction, 'mine');
  assert.equal(lost.mines.every((value: boolean, index: number) => !value || lost.revealed[index]), true);
  assert.equal(getMinesweeperCell(lost, mine).exploded, true);
  assert.equal(revealMinesweeperCell(lost, 0), lost);
  assert.equal(toggleMinesweeperFlag(lost, 0), lost);
  assert.equal(chordMinesweeperCell(lost, 0), lost);
});

test('revealing every safe cell wins and marks all remaining mines', () => {
  let game = revealMinesweeperCell(newMinesweeperGame({ seed: 'win' }), 40);
  while (game.status === 'playing') {
    const safe = hiddenIndexes(game, (index) => !game.mines[index] && !game.flagged[index])[0];
    assert.notEqual(safe, undefined);
    game = revealMinesweeperCell(game, safe);
  }
  assert.equal(game.status, 'won');
  assert.equal(game.revealedCount, game.rows * game.columns - game.mineCount);
  assert.deepEqual(game.flagged, game.mines);
  assert.equal(game.flagCount, game.mineCount);
  assert.equal(getMinesweeperRemainingMines(game), 0);
  assert.equal(game.lastAction, 'won');
  assert.equal(revealMinesweeperCell(game, game.firstReveal), game);
});

test('restore round-trips ready, playing, won, and lost games without aliasing arrays', () => {
  const ready = toggleMinesweeperFlag(newMinesweeperGame({ seed: 'restore-ready' }), 0);
  const playing = revealMinesweeperCell(newMinesweeperGame({ seed: 'restore-playing' }), 40);
  const mine = hiddenIndexes(playing, (index) => playing.mines[index])[0];
  const lost = revealMinesweeperCell(playing, mine);
  let won = revealMinesweeperCell(newMinesweeperGame({ seed: 'restore-won' }), 40);
  for (const index of hiddenIndexes(won, (candidate) => !won.mines[candidate])) {
    if (won.status === 'playing') won = revealMinesweeperCell(won, index);
  }
  for (const game of [ready, playing, lost, won]) {
    const serialized = JSON.parse(JSON.stringify(game));
    const restored = restoreMinesweeperGame(serialized);
    assert.deepEqual(restored, game);
    assert.notEqual(restored?.revealed, game.revealed);
    assert.notEqual(restored?.flagged, game.flagged);
    if (game.mines) assert.notEqual(restored?.mines, game.mines);
  }
});

test('restore accepts a covered safe cell left behind after a flood-blocking flag is removed', () => {
  let game = newMinesweeperGame({ seed: 'restore-after-unflag' });
  game = toggleMinesweeperFlag(game, 39);
  game = revealMinesweeperCell(game, 40);
  assert.equal(game.adjacent[40], 0);
  assert.equal(game.flagged[39], true);
  assert.equal(game.revealed[39], false);
  game = toggleMinesweeperFlag(game, 39);
  assert.equal(game.flagged[39], false);
  assert.equal(game.revealed[39], false);
  assert.deepEqual(restoreMinesweeperGame(JSON.parse(JSON.stringify(game))), game);
});

test('restore rejects forged layouts, counts, lifecycle state, and malformed storage', () => {
  const ready = newMinesweeperGame({ seed: 'tamper-ready' });
  assert.equal(restoreMinesweeperGame({ ...ready, elapsedSeconds: 1 }), null);
  const game = revealMinesweeperCell(newMinesweeperGame({ seed: 'tamper' }), 40);
  const forgedMines = [...game.mines];
  const mine = forgedMines.findIndex(Boolean);
  const safe = forgedMines.findIndex((value: boolean, index: number) => !value && !game.revealed[index]);
  forgedMines[mine] = false;
  forgedMines[safe] = true;
  assert.equal(restoreMinesweeperGame({ ...game, mines: forgedMines }), null);
  assert.equal(restoreMinesweeperGame({ ...game, adjacent: game.adjacent.with(0, 8 - game.adjacent[0]) }), null);
  assert.equal(restoreMinesweeperGame({ ...game, status: 'won' }), null);
  assert.equal(restoreMinesweeperGame({ ...game, revealedCount: game.revealedCount + 1 }), null);
  assert.equal(restoreMinesweeperGame({ ...game, flagCount: 1 }), null);
  assert.equal(restoreMinesweeperGame({ ...game, rows: 8 }), null);
  assert.equal(restoreMinesweeperGame({ ...game, seed: -1 }), null);
  assert.equal(restoreMinesweeperGame({ ...game, elapsedSeconds: Number.NaN }), null);
  assert.equal(restoreMinesweeperGame({ ...game, revealed: game.revealed.slice(1) }), null);
  assert.equal(restoreMinesweeperGame({ ...game, schemaVersion: 99 }), null);
  assert.equal(restoreMinesweeperGame(null), null);
});
