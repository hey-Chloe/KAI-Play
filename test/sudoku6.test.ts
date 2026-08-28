import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SUDOKU6_DIFFICULTIES,
  SUDOKU6_MAX_HINTS,
  countSudoku6Solutions,
  createSudoku6Solution,
  enterSudoku6Value,
  generateSudoku6Puzzle,
  getSudoku6Conflicts,
  hintSudoku6,
  isValidSudoku6Board,
  newSudoku6Game,
  restoreSudoku6Game,
  solveSudoku6,
  sudoku6NoteValues,
  sudoku6PeerIndexes,
  sudoku6SeededRandom,
  undoSudoku6,
} from '../web/sudoku6.js';

const solved = [
  1, 2, 3, 4, 5, 6,
  4, 5, 6, 1, 2, 3,
  2, 3, 4, 5, 6, 1,
  5, 6, 1, 2, 3, 4,
  3, 4, 5, 6, 1, 2,
  6, 1, 2, 3, 4, 5,
];

function seeded(seed: string) {
  return sudoku6SeededRandom(seed);
}

test('6x6 Sudoku validates rows, columns, and two-by-three boxes', () => {
  assert.equal(isValidSudoku6Board(solved, { complete: true }), true);
  assert.equal(isValidSudoku6Board(solved.slice(0, 35), { complete: true }), false);
  assert.equal(isValidSudoku6Board(solved.with(1, 1)), false, 'row duplicate');
  assert.equal(isValidSudoku6Board(solved.with(6, 1)), false, 'column duplicate');
  assert.equal(isValidSudoku6Board(solved.with(8, 2)), false, '2x3 box duplicate');
  assert.equal(isValidSudoku6Board(solved.with(0, 7)), false, 'digits are limited to 1-6');
  assert.equal(isValidSudoku6Board(solved.with(0, 0), { complete: true }), false);
  assert.equal(isValidSudoku6Board(solved.with(0, 0)), true);
});

test('solution generation is deterministic, complete, and valid', () => {
  const first = createSudoku6Solution(seeded('solution-42'));
  const second = createSudoku6Solution(seeded('solution-42'));
  assert.deepEqual(first, second);
  assert.equal(first.length, 36);
  assert.equal(isValidSudoku6Board(first, { complete: true }), true);
  assert.deepEqual(new Set(first), new Set([1, 2, 3, 4, 5, 6]));
});

test('generated puzzles hit clue targets and always have one solution', () => {
  for (const [difficulty, definition] of Object.entries(SUDOKU6_DIFFICULTIES)) {
    for (let seed = 0; seed < 24; seed += 1) {
      const generated = generateSudoku6Puzzle(difficulty, seeded(`${difficulty}-${seed}`));
      assert.equal(generated.puzzle.filter(Boolean).length, definition.clues, `${difficulty} seed ${seed}`);
      assert.equal(countSudoku6Solutions(generated.puzzle, 2), 1, `${difficulty} seed ${seed}`);
      assert.deepEqual(solveSudoku6(generated.puzzle), generated.solution);
      assert.equal(isValidSudoku6Board(generated.solution, { complete: true }), true);
    }
  }
});

test('puzzle generation rejects an invalid or degenerate random source instead of returning a wrong difficulty', () => {
  assert.throws(() => generateSudoku6Puzzle('hard', () => Number.NaN), /SUDOKU6_RANDOM_INVALID/);
  assert.throws(() => generateSudoku6Puzzle('hard', () => 0), /SUDOKU6_RANDOM_DEGENERATE/);
});

test('daily puzzle is stable for a date and changes its puzzle id on another date', () => {
  const first = newSudoku6Game({ mode: 'daily', date: '2026-08-28', difficulty: 'medium' });
  const replay = newSudoku6Game({ mode: 'daily', date: '2026-08-28', difficulty: 'medium' });
  const tomorrow = newSudoku6Game({ mode: 'daily', date: '2026-08-29', difficulty: 'medium' });
  assert.deepEqual(first.puzzle, replay.puzzle);
  assert.deepEqual(first.solution, replay.solution);
  assert.equal(first.puzzleId, replay.puzzleId);
  assert.notEqual(first.puzzleId, tomorrow.puzzleId);
  assert.equal(first.mode, 'daily');
  assert.equal(first.date, '2026-08-28');
  const forcedHard = newSudoku6Game({ mode: 'daily', date: '2026-08-28', difficulty: 'hard' });
  assert.equal(forcedHard.difficulty, 'medium');
  assert.deepEqual(forcedHard.puzzle, first.puzzle);
});

test('value entry protects givens, records mistakes, clears cells, and never mutates input', () => {
  const game = newSudoku6Game({ difficulty: 'easy', random: seeded('entry') });
  const original = structuredClone(game);
  const givenIndex = game.puzzle.findIndex(Boolean);
  const emptyIndex = game.puzzle.findIndex((value) => value === 0);
  const protectedGame = enterSudoku6Value(game, givenIndex, game.solution[givenIndex] === 6 ? 5 : 6);
  assert.deepEqual(protectedGame, game);

  const wrong = game.solution[emptyIndex] === 6 ? 5 : 6;
  const mistaken = enterSudoku6Value(game, emptyIndex, wrong);
  assert.deepEqual(game, original);
  assert.equal(mistaken.values[emptyIndex], wrong);
  assert.equal(mistaken.mistakes, 1);
  assert.equal(mistaken.lastAction, 'mistake');
  assert.equal(mistaken.undoStack.length, 1);

  const corrected = enterSudoku6Value(mistaken, emptyIndex, game.solution[emptyIndex]);
  assert.equal(corrected.values[emptyIndex], game.solution[emptyIndex]);
  assert.equal(corrected.mistakes, 1);
  assert.equal(corrected.lastAction, 'correct');
  const cleared = enterSudoku6Value(corrected, emptyIndex, 0);
  assert.equal(cleared.values[emptyIndex], 0);
  assert.equal(cleared.lastAction, 'clear');
  assert.throws(() => enterSudoku6Value(game, emptyIndex, 7), /SUDOKU6_VALUE_INVALID/);
});

test('notes toggle on empty cells and a correct value prunes matching peer notes', () => {
  const game = newSudoku6Game({ difficulty: 'hard', random: seeded('notes') });
  const emptyIndex = game.puzzle.findIndex((value) => value === 0);
  const value = game.solution[emptyIndex];
  const peer = sudoku6PeerIndexes(emptyIndex).find((index) => game.puzzle[index] === 0);
  assert.notEqual(peer, undefined);
  const peerWithNote = enterSudoku6Value(game, peer!, value, { noteMode: true });
  assert.deepEqual(sudoku6NoteValues(peerWithNote.notes[peer!]), [value]);
  const filled = enterSudoku6Value(peerWithNote, emptyIndex, value);
  assert.deepEqual(sudoku6NoteValues(filled.notes[peer!]), []);
  const noteOnFilled = enterSudoku6Value(filled, emptyIndex, 2, { noteMode: true });
  assert.deepEqual(noteOnFilled, filled);
});

test('conflicts identify both cells in row, column, and box duplicates', () => {
  const values = Array(36).fill(0);
  values[0] = 3;
  values[2] = 3;
  values[12] = 4;
  values[30] = 4;
  values[6] = 5;
  values[8] = 5;
  assert.deepEqual([...getSudoku6Conflicts(values)].sort((a, b) => a - b), [0, 2, 6, 8, 12, 30]);
});

test('hint and undo restore the board without refunding the consumed hint', () => {
  const game = newSudoku6Game({ difficulty: 'medium', random: seeded('hint') });
  const emptyIndex = game.puzzle.findIndex((value) => value === 0);
  const hinted = hintSudoku6(game, emptyIndex);
  assert.equal(hinted.values[emptyIndex], game.solution[emptyIndex]);
  assert.equal(hinted.hinted[emptyIndex], true);
  assert.equal(hinted.hintsUsed, 1);
  assert.deepEqual(game.values, game.puzzle);
  const undone = undoSudoku6(hinted);
  assert.deepEqual(undone.values, game.values);
  assert.deepEqual(undone.notes, game.notes);
  assert.equal(undone.hintsUsed, 1);
  assert.equal(undone.lastAction, 'undo');

  let capped = game;
  for (let count = 0; count < SUDOKU6_MAX_HINTS + 2; count += 1) capped = hintSudoku6(capped);
  assert.equal(capped.hintsUsed, SUDOKU6_MAX_HINTS);
});

test('undo restores the board without refunding a recorded mistake', () => {
  const game = newSudoku6Game({ difficulty: 'easy', random: seeded('undo-mistake') });
  const emptyIndex = game.puzzle.findIndex((value) => value === 0);
  const wrong = game.solution[emptyIndex] === 6 ? 5 : 6;
  const mistaken = enterSudoku6Value(game, emptyIndex, wrong);
  const undone = undoSudoku6(mistaken);
  assert.equal(undone.values[emptyIndex], 0);
  assert.equal(undone.mistakes, 1);
});

test('filling the final editable cell completes exactly once', () => {
  const game = newSudoku6Game({ difficulty: 'easy', random: seeded('finish') });
  const editable = game.puzzle.flatMap((value, index) => value === 0 ? [index] : []);
  const last = editable.at(-1)!;
  game.values = [...game.solution];
  game.values[last] = 0;
  const completed = enterSudoku6Value(game, last, game.solution[last]);
  assert.equal(completed.status, 'completed');
  const undoAttempt = undoSudoku6(completed);
  assert.deepEqual(undoAttempt, completed, 'undoing a completed game must not consume its history');
  const unchanged = enterSudoku6Value(completed, last, 0);
  assert.deepEqual(unchanged, completed);
});

test('restore derives the trusted solution and rejects damaged or forged progress', () => {
  const game = newSudoku6Game({ difficulty: 'medium', random: seeded('restore') });
  const emptyIndex = game.puzzle.findIndex((value) => value === 0);
  const progressed = enterSudoku6Value(game, emptyIndex, game.solution[emptyIndex]);
  progressed.elapsedSeconds = 95;
  const restored = restoreSudoku6Game({ ...progressed, solution: Array(36).fill(6), status: 'completed' });
  assert.ok(restored);
  assert.deepEqual(restored.solution, solveSudoku6(game.puzzle));
  assert.equal(restored.status, 'playing');
  assert.equal(restored.elapsedSeconds, 95);
  assert.notEqual(restored.values, progressed.values);

  const givenIndex = game.puzzle.findIndex(Boolean);
  const tamperedValues = [...game.values];
  tamperedValues[givenIndex] = game.puzzle[givenIndex] === 6 ? 5 : 6;
  assert.equal(restoreSudoku6Game({ ...game, values: tamperedValues }), null);
  assert.equal(restoreSudoku6Game({ ...game, puzzle: game.puzzle.slice(0, 35) }), null);
  assert.equal(restoreSudoku6Game({ ...game, notes: Array(36).fill(99) }), null);
  assert.equal(restoreSudoku6Game({ ...game, elapsedSeconds: -1 }), null);
  assert.equal(restoreSudoku6Game({ ...game, elapsedSeconds: 1.5 }), null);
  const { elapsedSeconds: _missingElapsed, ...missingElapsed } = game;
  assert.equal(restoreSudoku6Game(missingElapsed), null);
  assert.equal(restoreSudoku6Game({ ...game, schemaVersion: 99 }), null);
  assert.equal(restoreSudoku6Game(null), null);
});

test('restore validates real calendar dates and the complete puzzle identity', () => {
  const leapDay = newSudoku6Game({ mode: 'daily', date: '2024-02-29', difficulty: 'medium' });
  assert.ok(restoreSudoku6Game(leapDay));
  for (const date of ['2023-02-29', '2026-02-30', '2026-13-01', '2026-00-10', '0000-01-01']) {
    assert.equal(restoreSudoku6Game({
      ...leapDay,
      date,
      puzzleId: `daily:${date}:medium:v1`,
    }), null, date);
  }

  const practice = newSudoku6Game({ difficulty: 'easy', random: seeded('identity-practice') });
  assert.equal(restoreSudoku6Game({ ...practice, puzzleId: 'practice:easy:forged:v1' }), null);
  assert.equal(restoreSudoku6Game({
    ...practice,
    difficulty: 'medium',
    puzzleId: practice.puzzleId.replace('practice:easy:', 'practice:medium:'),
  }), null, 'the declared difficulty must match the clue count');

  const official = newSudoku6Game({ mode: 'daily', date: '2026-08-28', difficulty: 'medium' });
  const otherPuzzle = newSudoku6Game({ difficulty: 'medium', random: seeded('forged-daily-board') });
  assert.notDeepEqual(otherPuzzle.puzzle, official.puzzle);
  assert.equal(restoreSudoku6Game({
    ...otherPuzzle,
    mode: 'daily',
    date: official.date,
    puzzleId: official.puzzleId,
  }), null, 'a daily save must contain the deterministic official puzzle');
});

test('solver safely reports invalid and unsatisfiable boards', () => {
  assert.equal(countSudoku6Solutions(solved.with(1, 1)), 0);
  assert.equal(solveSudoku6(solved.with(1, 1)), null);
  assert.throws(() => countSudoku6Solutions([1, 2, 3]), /SUDOKU6_BOARD_REQUIRED/);
});
