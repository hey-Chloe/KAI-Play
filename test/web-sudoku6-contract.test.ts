import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const root = resolve(import.meta.dirname, '..');
const appSource = await readFile(resolve(root, 'web/app.js'), 'utf8');
const engineSource = await readFile(resolve(root, 'web/sudoku6.js'), 'utf8');
const styleSource = await readFile(resolve(root, 'web/styles.css'), 'utf8');
const readme = await readFile(resolve(root, 'README.md'), 'utf8');
const product = await readFile(resolve(root, 'docs/PRODUCT.md'), 'utf8');
const packageSource = await readFile(resolve(root, 'package.json'), 'utf8');
const dockerSource = await readFile(resolve(root, 'web/Dockerfile'), 'utf8');

function sourceBetween(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(startIndex, -1, `missing start marker ${start}`);
  assert.notEqual(endIndex, -1, `missing end marker ${end}`);
  return source.slice(startIndex, endIndex);
}

test('the twenty-five-game icon catalog keeps KAI Sudoku playable immediately after 1048', () => {
  const lobby = sourceBetween(appSource, 'function lobby()', 'function nav(');
  assert.match(lobby, /25 款游戏，一眼找到/);
  assert.match(lobby, /14 款本地自动保存/);
  assert.match(lobby, /class="game-world world-sudoku6"/);
  assert.match(lobby, /<h3>KAI 数独<\/h3>/);
  assert.match(lobby, /data-action="open-sudoku6"/);
  assert.match(lobby, /6×6 逻辑填数 · 单机益智/);
  const orderedCards = [
    'world-ddz', 'world-xiangqi', 'world-gomoku', 'world-reversi', 'world-mahjong', 'world-1048',
    'world-sudoku6', 'world-minesweeper', 'world-sokoban', 'world-sliding', 'world-memory',
    'world-match3', 'world-falling', 'world-snake', 'world-maze', 'world-farm',
    'world-three', 'world-reels',
  ];
  for (let index = 1; index < orderedCards.length; index += 1) {
    assert.ok(lobby.indexOf(orderedCards[index - 1]) < lobby.indexOf(orderedCards[index]), `${orderedCards[index]} must follow ${orderedCards[index - 1]}`);
  }
  assert.match(readme, /6×6 KAI 数独/);
  assert.match(product, /6×6 KAI 数独/);
});

test('the Sudoku route exposes a complete accessible 6x6 interaction surface', () => {
  const route = sourceBetween(appSource, 'function sudoku6Game()', 'function historyMatchWon(');
  assert.match(route, /role="grid"/);
  assert.match(route, /aria-rowcount="6"/);
  assert.match(route, /aria-colcount="6"/);
  assert.match(route, /game\.values\.map\(\(_, index\) => sudoku6Cell/);
  assert.match(appSource, /role="gridcell"/);
  assert.match(appSource, /aria-readonly=/);
  assert.match(appSource, /aria-invalid=/);
  assert.match(route, /data-action="sudoku6-value"/);
  assert.match(route, /data-action="sudoku6-notes"/);
  assert.match(route, /data-action="sudoku6-undo"/);
  assert.match(route, /data-action="sudoku6-clear"/);
  assert.match(route, /data-action="sudoku6-hint"/);
  assert.match(appSource, /data-sudoku6-result/);
  assert.match(route, /aria-live="polite"/);
});

test('practice difficulty, daily puzzle, notes, undo, hints, and completion are wired', () => {
  for (const action of [
    'sudoku6-value', 'sudoku6-clear', 'sudoku6-notes', 'sudoku6-undo', 'sudoku6-hint',
    'sudoku6-new', 'sudoku6-difficulty', 'sudoku6-daily', 'sudoku6-practice',
  ]) assert.match(appSource, new RegExp(`a===['"]${action}['"]`));
  assert.match(appSource, /newSudoku6Game\(\{mode:'daily',difficulty:'medium'/);
  assert.match(appSource, /loadSavedSudoku6Game\('daily'\)/);
  assert.match(appSource, /Object\.values\(SUDOKU6_DIFFICULTIES\)/);
  assert.match(engineSource, /countSudoku6Solutions\(puzzle, 2\) !== 1/);
  assert.match(engineSource, /SUDOKU6_MAX_HINTS = 3/);
  assert.match(engineSource, /undoStack/);
  assert.match(engineSource, /mode === 'daily'/);
});

test('mouse, number pad, and keyboard share the same immutable value transition', () => {
  assert.match(appSource, /function performSudoku6Value\(value\)/);
  assert.match(appSource, /enterSudoku6Value\(game, index, value/);
  assert.match(appSource, /data-sudoku6-cell/);
  assert.match(appSource, /\^\[1-6\]\$/);
  assert.match(appSource, /\['0', 'Backspace', 'Delete'\]/);
  assert.match(appSource, /event\.key === 'n'/);
  assert.match(appSource, /event\.ctrlKey \|\| event\.metaKey/);
  assert.match(appSource, /\['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'\]/);
  assert.match(appSource, /focusSudoku6Interaction\(\)/);
  assert.match(engineSource, /const next = cloneSudoku6Game\(game\)/);
});

test('Sudoku progress is local, restored defensively, and outside competitive settlement', () => {
  const route = sourceBetween(appSource, 'function sudoku6Game()', 'function historyMatchWon(');
  assert.match(appSource, /SUDOKU6_PRACTICE_SAVE_KEY/);
  assert.match(appSource, /SUDOKU6_DAILY_SAVE_PREFIX/);
  assert.match(appSource, /restoreSudoku6Game\(JSON\.parse\(raw\)\)/);
  assert.match(appSource, /saveSudoku6Game\(next\)/);
  assert.match(appSource, /updateSudoku6Clock\(\)/);
  assert.match(route, /不请求服务端结算/);
  assert.match(route, /不改变竞技分、Token 或 KAI 卡时/);
  assert.doesNotMatch(route, /api\(/);
  assert.match(appSource, /state\.view==='sudoku6'\?sudoku6Game\(\)/);
});

test('storage access remains executable when the browser blocks localStorage', () => {
  const helpersSource = sourceBetween(appSource, 'function safeStorageGet(', 'const storedHeroGame');
  const blockedStorage = {
    getItem() { throw new DOMException('blocked', 'SecurityError'); },
    setItem() { throw new DOMException('blocked', 'SecurityError'); },
    removeItem() { throw new DOMException('blocked', 'SecurityError'); },
  };
  const helpers = runInNewContext(`${helpersSource}; ({ safeStorageGet, safeStorageSet, safeStorageRemove })`, { localStorage: blockedStorage });
  assert.equal(helpers.safeStorageGet('key'), null);
  assert.equal(helpers.safeStorageSet('key', 'value'), false);
  assert.equal(helpers.safeStorageRemove('key'), false);
  assert.doesNotMatch(appSource, /(?<!globalThis\.)\blocalStorage\.(?:getItem|setItem|removeItem)\(/);
});

test('Sudoku settles elapsed time before mutations and records only eligible best times', () => {
  const settle = sourceBetween(appSource, 'function settleSudoku6Clock(', 'function settleAndSaveSudoku6(');
  assert.match(settle, /Math\.floor\(Math\.max\(0, now - lastTick\) \/ 1000\)/);
  assert.match(settle, /casual\.sudokuLastTick = lastTick \+ elapsed \* 1000/);
  const clockState = { view: 'sudoku6', casual: { game: { status: 'playing', elapsedSeconds: 4 }, sudokuLastTick: 1_000 } };
  const settleClock = runInNewContext(`${settle}; settleSudoku6Clock`, {
    state: clockState,
    Date,
    Number,
    Math,
    document: { querySelector: () => null },
  });
  assert.equal(settleClock(1_999), 0);
  assert.equal(clockState.casual.sudokuLastTick, 1_000, 'sub-second remainder must survive an interaction');
  assert.equal(settleClock(2_100), 1);
  assert.equal(clockState.casual.game.elapsedSeconds, 5);
  assert.equal(clockState.casual.sudokuLastTick, 2_000, 'only settled whole seconds advance the baseline');
  assert.equal(settleClock(2_999), 0);
  assert.equal(settleClock(3_100), 1);
  assert.equal(clockState.casual.game.elapsedSeconds, 6);
  assert.match(sourceBetween(appSource, 'function performSudoku6Value(', 'function updateSudoku6Clock('), /settleSudoku6Clock\(\)/);
  assert.match(sourceBetween(appSource, "if\(a==='sudoku6-undo'", "if\(a==='sudoku6-new'"), /settleSudoku6Clock\(\)/);
  const best = sourceBetween(appSource, 'function recordSudoku6Best(', 'function formatSudoku6Time(');
  assert.match(best, /game\.hintsUsed !== 0/);
  assert.match(best, /game\.elapsedSeconds <= 0/);
  assert.match(appSource, /`daily:\$\{game\.puzzleId\}`/);
  assert.match(appSource, /无提示最佳/);
});

test('Sudoku restart controls guard progress and the active difficulty is a no-op', () => {
  assert.match(appSource, /function confirmSudoku6Replacement/);
  assert.match(appSource, /typeof globalThis\.confirm === 'function'/);
  const difficulty = sourceBetween(appSource, "if(a==='sudoku6-difficulty'", "if(a==='sudoku6-daily'");
  assert.match(difficulty, /difficulty===current\.difficulty/);
  assert.match(difficulty, /confirmSudoku6Replacement/);
});

test('Sudoku styling preserves 2x3 boxes, visible errors, focus, touch targets, and 320px operation', () => {
  assert.match(styleSource, /\.sudoku6-board\s*\{[\s\S]*?grid-template-columns:\s*repeat\(6,/);
  assert.match(styleSource, /\.sudoku6-cell:nth-child\(6n\+3\)/);
  assert.match(styleSource, /nth-child\(n\+7\):nth-child\(-n\+12\)/);
  assert.match(styleSource, /\.sudoku6-cell\.is-wrong::after/);
  assert.match(styleSource, /\.sudoku6-cell:focus-visible/);
  assert.match(styleSource, /\.sudoku6-number-pad button\s*\{[\s\S]*?min-width:\s*44px;[\s\S]*?min-height:\s*50px/);
  assert.match(styleSource, /@media \(max-width: 360px\)[\s\S]*?\.sudoku6-number-pad\s*\{\s*grid-template-columns:\s*repeat\(3,/);
  assert.match(styleSource, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.sudoku6-cell/);
});

test('the standalone Sudoku module ships in syntax checks and the production Web image', () => {
  assert.match(packageSource, /node --check web\/sudoku6\.js/);
  assert.match(dockerSource, /web\/sudoku6\.js/);
});
