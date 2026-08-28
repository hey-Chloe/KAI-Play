export const SUDOKU6_SIZE = 6;
export const SUDOKU6_BOX_ROWS = 2;
export const SUDOKU6_BOX_COLUMNS = 3;
export const SUDOKU6_MAX_HINTS = 3;
export const SUDOKU6_SCHEMA_VERSION = 1;

export const SUDOKU6_DIFFICULTIES = Object.freeze({
  easy: Object.freeze({ key: 'easy', label: '入门', clues: 26 }),
  medium: Object.freeze({ key: 'medium', label: '标准', clues: 22 }),
  hard: Object.freeze({ key: 'hard', label: '挑战', clues: 18 }),
});

const SUDOKU6_CELL_COUNT = SUDOKU6_SIZE ** 2;
const SUDOKU6_NOTE_MASK = (1 << SUDOKU6_SIZE) - 1;

function randomUnit(random) {
  if (typeof random !== 'function') throw new Error('SUDOKU6_RANDOM_INVALID');
  const value = Number(random());
  if (!Number.isFinite(value) || value < 0 || value >= 1) throw new Error('SUDOKU6_RANDOM_INVALID');
  return value;
}

function shuffled(items, random) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const next = Math.floor(randomUnit(random) * (index + 1));
    [result[index], result[next]] = [result[next], result[index]];
  }
  return result;
}

function normalizedDifficulty(value) {
  return Object.hasOwn(SUDOKU6_DIFFICULTIES, value) ? value : 'medium';
}

function isSudoku6Array(value, { notes = false } = {}) {
  if (!Array.isArray(value) || value.length !== SUDOKU6_CELL_COUNT) return false;
  if (notes) return value.every((entry) => Number.isInteger(entry) && entry >= 0 && entry <= SUDOKU6_NOTE_MASK);
  return value.every((entry) => Number.isInteger(entry) && entry >= 0 && entry <= SUDOKU6_SIZE);
}

function assertSudoku6Board(board) {
  if (!Array.isArray(board) || board.length !== SUDOKU6_CELL_COUNT) throw new Error('SUDOKU6_BOARD_REQUIRED');
  if (!isSudoku6Array(board)) throw new Error('SUDOKU6_BOARD_INVALID');
}

function groupHasDuplicates(values) {
  const filled = values.filter(Boolean);
  return new Set(filled).size !== filled.length;
}

export function isValidSudoku6Board(board, { complete = false } = {}) {
  if (!isSudoku6Array(board)) return false;
  if (complete && board.includes(0)) return false;
  for (let row = 0; row < SUDOKU6_SIZE; row += 1) {
    if (groupHasDuplicates(board.slice(row * SUDOKU6_SIZE, (row + 1) * SUDOKU6_SIZE))) return false;
  }
  for (let column = 0; column < SUDOKU6_SIZE; column += 1) {
    const values = Array.from({ length: SUDOKU6_SIZE }, (_, row) => board[row * SUDOKU6_SIZE + column]);
    if (groupHasDuplicates(values)) return false;
  }
  for (let boxRow = 0; boxRow < SUDOKU6_SIZE; boxRow += SUDOKU6_BOX_ROWS) {
    for (let boxColumn = 0; boxColumn < SUDOKU6_SIZE; boxColumn += SUDOKU6_BOX_COLUMNS) {
      const values = [];
      for (let row = boxRow; row < boxRow + SUDOKU6_BOX_ROWS; row += 1) {
        for (let column = boxColumn; column < boxColumn + SUDOKU6_BOX_COLUMNS; column += 1) {
          values.push(board[row * SUDOKU6_SIZE + column]);
        }
      }
      if (groupHasDuplicates(values)) return false;
    }
  }
  return true;
}

function sudoku6Candidates(board, index) {
  if (board[index] !== 0) return [];
  const row = Math.floor(index / SUDOKU6_SIZE);
  const column = index % SUDOKU6_SIZE;
  const used = new Set();
  for (let offset = 0; offset < SUDOKU6_SIZE; offset += 1) {
    used.add(board[row * SUDOKU6_SIZE + offset]);
    used.add(board[offset * SUDOKU6_SIZE + column]);
  }
  const boxRow = Math.floor(row / SUDOKU6_BOX_ROWS) * SUDOKU6_BOX_ROWS;
  const boxColumn = Math.floor(column / SUDOKU6_BOX_COLUMNS) * SUDOKU6_BOX_COLUMNS;
  for (let nextRow = boxRow; nextRow < boxRow + SUDOKU6_BOX_ROWS; nextRow += 1) {
    for (let nextColumn = boxColumn; nextColumn < boxColumn + SUDOKU6_BOX_COLUMNS; nextColumn += 1) {
      used.add(board[nextRow * SUDOKU6_SIZE + nextColumn]);
    }
  }
  return Array.from({ length: SUDOKU6_SIZE }, (_, offset) => offset + 1).filter((value) => !used.has(value));
}

function searchSudoku6(board, limit, solutions) {
  let targetIndex = -1;
  let targetCandidates = null;
  for (let index = 0; index < SUDOKU6_CELL_COUNT; index += 1) {
    if (board[index] !== 0) continue;
    const candidates = sudoku6Candidates(board, index);
    if (!candidates.length) return;
    if (!targetCandidates || candidates.length < targetCandidates.length) {
      targetIndex = index;
      targetCandidates = candidates;
      if (candidates.length === 1) break;
    }
  }
  if (targetIndex < 0) {
    solutions.push([...board]);
    return;
  }
  for (const value of targetCandidates) {
    board[targetIndex] = value;
    searchSudoku6(board, limit, solutions);
    board[targetIndex] = 0;
    if (solutions.length >= limit) return;
  }
}

function sudoku6Solutions(board, limit = 2) {
  assertSudoku6Board(board);
  if (!isValidSudoku6Board(board)) return [];
  const boundedLimit = Math.max(1, Math.min(100, Number.isInteger(limit) ? limit : 2));
  const solutions = [];
  searchSudoku6([...board], boundedLimit, solutions);
  return solutions;
}

export function countSudoku6Solutions(board, limit = 2) {
  return sudoku6Solutions(board, limit).length;
}

export function solveSudoku6(board) {
  return sudoku6Solutions(board, 1)[0] || null;
}

export function createSudoku6Solution(random = Math.random) {
  const digits = shuffled([1, 2, 3, 4, 5, 6], random);
  const rowBands = shuffled([0, 1, 2], random);
  const columnStacks = shuffled([0, 1], random);
  const rows = rowBands.flatMap((band) => shuffled([0, 1], random).map((offset) => band * SUDOKU6_BOX_ROWS + offset));
  const columns = columnStacks.flatMap((stack) => shuffled([0, 1, 2], random).map((offset) => stack * SUDOKU6_BOX_COLUMNS + offset));
  const pattern = (row, column) => (row * SUDOKU6_BOX_COLUMNS + Math.floor(row / SUDOKU6_BOX_ROWS) + column) % SUDOKU6_SIZE;
  const board = rows.flatMap((row) => columns.map((column) => digits[pattern(row, column)]));
  if (!isValidSudoku6Board(board, { complete: true })) throw new Error('SUDOKU6_SOLUTION_GENERATION_FAILED');
  return board;
}

function clueCount(board) {
  return board.reduce((total, value) => total + Number(value !== 0), 0);
}

export function generateSudoku6Puzzle(difficulty = 'medium', random = Math.random) {
  const level = normalizedDifficulty(difficulty);
  const targetClues = SUDOKU6_DIFFICULTIES[level].clues;
  const randomSamples = new Set();
  const trackedRandom = () => {
    const value = randomUnit(random);
    randomSamples.add(value);
    return value;
  };
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const solution = createSudoku6Solution(trackedRandom);
    const puzzle = [...solution];
    const pairs = shuffled(Array.from({ length: SUDOKU6_CELL_COUNT / 2 }, (_, index) => [index, SUDOKU6_CELL_COUNT - 1 - index]), trackedRandom);
    for (const pair of pairs) {
      if (clueCount(puzzle) - pair.length < targetClues) continue;
      const previous = pair.map((index) => puzzle[index]);
      pair.forEach((index) => { puzzle[index] = 0; });
      if (countSudoku6Solutions(puzzle, 2) !== 1) pair.forEach((index, offset) => { puzzle[index] = previous[offset]; });
      if (clueCount(puzzle) === targetClues) break;
    }
    const candidate = { puzzle, solution, difficulty: level, clueCount: clueCount(puzzle) };
    if (candidate.clueCount === targetClues) {
      if (randomSamples.size < 2) throw new Error('SUDOKU6_RANDOM_DEGENERATE');
      return candidate;
    }
  }
  if (randomSamples.size < 2) throw new Error('SUDOKU6_RANDOM_DEGENERATE');
  throw new Error('SUDOKU6_PUZZLE_GENERATION_FAILED');
}

function seedFromText(text) {
  let hash = 2_166_136_261;
  for (const character of String(text)) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

export function sudoku6SeededRandom(seed) {
  let value = seedFromText(seed);
  return () => {
    value = (Math.imul(value, 1_664_525) + 1_013_904_223) >>> 0;
    return value / 0x1_0000_0000;
  };
}

function validDateKey(value) {
  if (typeof value !== 'string') return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12) return false;
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= days[month - 1];
}

function defaultDateKey() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

function puzzleFingerprint(puzzle) {
  return seedFromText(puzzle.join('')).toString(36);
}

function emptySudoku6Notes() {
  return Array(SUDOKU6_CELL_COUNT).fill(0);
}

export function newSudoku6Game(options = {}) {
  const mode = options.mode === 'daily' ? 'daily' : 'practice';
  const difficulty = mode === 'daily' ? 'medium' : normalizedDifficulty(options.difficulty);
  const date = validDateKey(options.date) ? options.date : defaultDateKey();
  const random = options.random || (mode === 'daily'
    ? sudoku6SeededRandom(`kai-play:sudoku6:v1:${date}:${difficulty}`)
    : Math.random);
  const generated = generateSudoku6Puzzle(difficulty, random);
  const puzzleId = mode === 'daily'
    ? `daily:${date}:${difficulty}:v1`
    : `practice:${difficulty}:${puzzleFingerprint(generated.puzzle)}:v1`;
  return {
    schemaVersion: SUDOKU6_SCHEMA_VERSION,
    kind: 'sudoku6',
    puzzleId,
    mode,
    date: mode === 'daily' ? date : null,
    difficulty,
    puzzle: [...generated.puzzle],
    solution: [...generated.solution],
    values: [...generated.puzzle],
    notes: emptySudoku6Notes(),
    hinted: Array(SUDOKU6_CELL_COUNT).fill(false),
    undoStack: [],
    mistakes: 0,
    hintsUsed: 0,
    elapsedSeconds: 0,
    status: 'playing',
    lastAction: 'new',
  };
}

function sudoku6Snapshot(game) {
  return {
    values: [...game.values],
    notes: [...game.notes],
    hinted: [...game.hinted],
    mistakes: game.mistakes,
    hintsUsed: game.hintsUsed,
    status: game.status,
    lastAction: game.lastAction,
  };
}

function cloneSudoku6Game(game) {
  return {
    ...game,
    puzzle: [...game.puzzle],
    solution: [...game.solution],
    values: [...game.values],
    notes: [...game.notes],
    hinted: [...game.hinted],
    undoStack: game.undoStack.map((entry) => ({
      ...entry,
      values: [...entry.values],
      notes: [...entry.notes],
      hinted: [...entry.hinted],
    })),
  };
}

function isEditableSudoku6Cell(game, index) {
  return Number.isInteger(index) && index >= 0 && index < SUDOKU6_CELL_COUNT && game.puzzle[index] === 0;
}

export function sudoku6PeerIndexes(index) {
  if (!Number.isInteger(index) || index < 0 || index >= SUDOKU6_CELL_COUNT) return [];
  const row = Math.floor(index / SUDOKU6_SIZE);
  const column = index % SUDOKU6_SIZE;
  const boxRow = Math.floor(row / SUDOKU6_BOX_ROWS) * SUDOKU6_BOX_ROWS;
  const boxColumn = Math.floor(column / SUDOKU6_BOX_COLUMNS) * SUDOKU6_BOX_COLUMNS;
  const peers = new Set();
  for (let offset = 0; offset < SUDOKU6_SIZE; offset += 1) {
    peers.add(row * SUDOKU6_SIZE + offset);
    peers.add(offset * SUDOKU6_SIZE + column);
  }
  for (let nextRow = boxRow; nextRow < boxRow + SUDOKU6_BOX_ROWS; nextRow += 1) {
    for (let nextColumn = boxColumn; nextColumn < boxColumn + SUDOKU6_BOX_COLUMNS; nextColumn += 1) {
      peers.add(nextRow * SUDOKU6_SIZE + nextColumn);
    }
  }
  peers.delete(index);
  return [...peers];
}

export function sudoku6NoteValues(mask) {
  if (!Number.isInteger(mask) || mask < 0) return [];
  return Array.from({ length: SUDOKU6_SIZE }, (_, offset) => offset + 1).filter((value) => mask & (1 << (value - 1)));
}

export function getSudoku6Conflicts(values) {
  assertSudoku6Board(values);
  const conflicts = new Set();
  for (let index = 0; index < SUDOKU6_CELL_COUNT; index += 1) {
    const value = values[index];
    if (!value) continue;
    for (const peer of sudoku6PeerIndexes(index)) {
      if (values[peer] === value) {
        conflicts.add(index);
        conflicts.add(peer);
      }
    }
  }
  return conflicts;
}

function pushSudoku6History(game) {
  game.undoStack = [...game.undoStack.slice(-49), sudoku6Snapshot(game)];
}

function finishSudoku6IfSolved(game) {
  game.status = game.values.every((value, index) => value === game.solution[index]) ? 'completed' : 'playing';
}

function removePeerNote(game, index, value) {
  const bit = 1 << (value - 1);
  for (const peer of sudoku6PeerIndexes(index)) game.notes[peer] &= ~bit;
}

export function enterSudoku6Value(game, index, value, { noteMode = false } = {}) {
  const next = cloneSudoku6Game(game);
  if (next.status !== 'playing' || !isEditableSudoku6Cell(next, index)) return next;
  if (!Number.isInteger(value) || value < 0 || value > SUDOKU6_SIZE) throw new Error('SUDOKU6_VALUE_INVALID');
  if (noteMode) {
    if (value === 0 || next.values[index] !== 0) return next;
    pushSudoku6History(next);
    next.notes[index] ^= 1 << (value - 1);
    next.lastAction = 'note';
    return next;
  }
  if (next.values[index] === value && next.notes[index] === 0) return next;
  pushSudoku6History(next);
  next.values[index] = value;
  next.notes[index] = 0;
  if (value > 0) {
    if (value !== next.solution[index]) next.mistakes += 1;
    else removePeerNote(next, index, value);
  }
  next.lastAction = value === 0 ? 'clear' : value === next.solution[index] ? 'correct' : 'mistake';
  finishSudoku6IfSolved(next);
  return next;
}

export function hintSudoku6(game, preferredIndex = null) {
  const next = cloneSudoku6Game(game);
  if (next.status !== 'playing' || next.hintsUsed >= SUDOKU6_MAX_HINTS) return next;
  let index = isEditableSudoku6Cell(next, preferredIndex) && next.values[preferredIndex] !== next.solution[preferredIndex]
    ? preferredIndex
    : next.values.findIndex((value, candidate) => next.puzzle[candidate] === 0 && value !== next.solution[candidate]);
  if (index < 0) return next;
  pushSudoku6History(next);
  const value = next.solution[index];
  next.values[index] = value;
  next.notes[index] = 0;
  next.hinted[index] = true;
  next.hintsUsed += 1;
  next.lastAction = 'hint';
  removePeerNote(next, index, value);
  finishSudoku6IfSolved(next);
  return next;
}

export function undoSudoku6(game) {
  const next = cloneSudoku6Game(game);
  if (next.status !== 'playing') return next;
  const previous = next.undoStack.pop();
  if (!previous) return next;
  next.values = [...previous.values];
  next.notes = [...previous.notes];
  next.hinted = [...previous.hinted];
  next.status = previous.status;
  next.lastAction = 'undo';
  return next;
}

function validSudoku6Snapshot(value, puzzle) {
  if (!value || typeof value !== 'object') return false;
  if (!isSudoku6Array(value.values) || !isSudoku6Array(value.notes, { notes: true })) return false;
  if (!Array.isArray(value.hinted) || value.hinted.length !== SUDOKU6_CELL_COUNT || value.hinted.some((entry) => typeof entry !== 'boolean')) return false;
  if (puzzle.some((given, index) => given !== 0 && value.values[index] !== given)) return false;
  if (value.notes.some((mask, index) => value.values[index] !== 0 && mask !== 0)) return false;
  return Number.isSafeInteger(value.mistakes) && value.mistakes >= 0
    && Number.isSafeInteger(value.hintsUsed) && value.hintsUsed >= 0 && value.hintsUsed <= SUDOKU6_MAX_HINTS;
}

export function restoreSudoku6Game(value) {
  if (!value || typeof value !== 'object' || value.schemaVersion !== SUDOKU6_SCHEMA_VERSION || value.kind !== 'sudoku6') return null;
  if (!isSudoku6Array(value.puzzle) || !isValidSudoku6Board(value.puzzle)) return null;
  if (!Object.hasOwn(SUDOKU6_DIFFICULTIES, value.difficulty)) return null;
  if (value.mode !== 'practice' && value.mode !== 'daily') return null;
  if (!Number.isSafeInteger(value.elapsedSeconds) || value.elapsedSeconds < 0) return null;
  const difficulty = value.difficulty;
  const mode = value.mode;
  if (mode === 'daily' && difficulty !== 'medium') return null;
  const date = mode === 'daily' && validDateKey(value.date) ? value.date : null;
  if (mode === 'daily' && !date) return null;
  if (clueCount(value.puzzle) !== SUDOKU6_DIFFICULTIES[difficulty].clues) return null;
  const expectedPuzzleId = mode === 'daily'
    ? `daily:${date}:${difficulty}:v1`
    : `practice:${difficulty}:${puzzleFingerprint(value.puzzle)}:v1`;
  if (value.puzzleId !== expectedPuzzleId) return null;
  if (mode === 'daily') {
    const official = generateSudoku6Puzzle(difficulty, sudoku6SeededRandom(`kai-play:sudoku6:v1:${date}:${difficulty}`));
    if (official.puzzle.some((entry, index) => entry !== value.puzzle[index])) return null;
  }
  if (countSudoku6Solutions(value.puzzle, 2) !== 1) return null;
  const solution = solveSudoku6(value.puzzle);
  if (!solution || !validSudoku6Snapshot(value, value.puzzle)) return null;
  const completed = value.values.every((entry, index) => entry === solution[index]);
  const undoStack = Array.isArray(value.undoStack)
    ? value.undoStack.filter((entry) => validSudoku6Snapshot(entry, value.puzzle)).slice(-50).map((entry) => ({
      values: [...entry.values],
      notes: [...entry.notes],
      hinted: [...entry.hinted],
      mistakes: entry.mistakes,
      hintsUsed: entry.hintsUsed,
      status: entry.status === 'completed' ? 'completed' : 'playing',
      lastAction: typeof entry.lastAction === 'string' ? entry.lastAction : null,
    }))
    : [];
  return {
    schemaVersion: SUDOKU6_SCHEMA_VERSION,
    kind: 'sudoku6',
    puzzleId: typeof value.puzzleId === 'string' && value.puzzleId ? value.puzzleId : `restored:${puzzleFingerprint(value.puzzle)}:v1`,
    mode,
    date,
    difficulty,
    puzzle: [...value.puzzle],
    solution,
    values: [...value.values],
    notes: [...value.notes],
    hinted: [...value.hinted],
    undoStack,
    mistakes: value.mistakes,
    hintsUsed: value.hintsUsed,
    elapsedSeconds: value.elapsedSeconds,
    status: completed ? 'completed' : 'playing',
    lastAction: typeof value.lastAction === 'string' ? value.lastAction : null,
  };
}
