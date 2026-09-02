import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');
const read = (path: string) => readFile(resolve(root, path), 'utf8');
const [
  appSource,
  indexSource,
  packageSource,
  dockerSource,
  preflightSource,
  proxyTestSource,
] = await Promise.all([
  read('web/app.js'),
  read('web/index.html'),
  read('package.json'),
  read('web/Dockerfile'),
  read('scripts/preflight.ts'),
  read('test/web-proxy-e2e.test.ts'),
]);

function sourceBetween(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(startIndex, -1, 'missing start marker ' + start);
  assert.notEqual(endIndex, -1, 'missing end marker ' + end);
  return source.slice(startIndex, endIndex);
}

test('the catalog publishes exactly twenty-five games in the reviewed order', () => {
  const lobby = sourceBetween(appSource, 'function lobby()', 'function nav(');
  const catalog = sourceBetween(appSource, 'const CATALOG_GAME_IDS', 'const GAME_CONTENT');
  const ids = [...catalog.matchAll(/'([^']+)'/g)].map((match) => match[1]);
  assert.deepEqual(ids, [
    'ddz', 'xiangqi', 'gomoku', 'reversi', 'mahjong', '1048', 'sudoku6',
    'minesweeper', 'sokoban', 'sliding', 'memory', 'match3', 'falling', 'snake',
    'maze', 'farm', 'tictactoe', 'lights', 'guess', 'rps', 'math', 'sequence', 'stroop', 'three', 'reels',
  ]);
  assert.match(lobby, /25 款即开即玩的牌桌、策略、益智、反应与经营游戏/);
  assert.match(lobby, /25 款游戏，一眼找到/);
  assert.match(lobby, /显示全部 25 款/);
  assert.match(lobby, /全部 25 款玩法，小图标网格排列/);
  assert.match(indexSource, /二十五款即开即玩的牌桌、策略、益智、反应与经营玩法/);
  assert.match(lobby, /QUICK_GAME_KINDS\.map/);
});

test('the local-save promise is limited to its exact fourteen game ids', () => {
  const declaration = appSource.match(/const LOCAL_GAME_IDS = new Set\(\[([^\]]+)\]\)/);
  assert.ok(declaration);
  const ids = [...declaration[1].matchAll(/'([^']+)'/g)].map((match) => match[1]);
  assert.equal(ids.length, 14);
  assert.deepEqual(new Set(ids), new Set([
    'xiangqi', 'gomoku', 'reversi', '1048', 'sudoku6', 'minesweeper',
    'sokoban', 'sliding', 'memory', 'match3', 'falling', 'snake', 'maze', 'farm',
  ]));
  const lobby = sourceBetween(appSource, 'function lobby()', 'function nav(');
  assert.match(lobby, /14 款本地自动保存/);
  assert.doesNotMatch(lobby, /25 款本地自动保存/);
});

test('Gomoku, Memory Match, and Snake are wired as playable local routes', () => {
  for (const entry of [
    { module:'gomoku.js', action:'open-gomoku', view:'gomoku', renderer:'gomokuGame' },
    { module:'memory-match.js', action:'open-memory', view:'memory', renderer:'memoryMatchGame' },
    { module:'snake.js', action:'open-snake', view:'snake', renderer:'snakeGame' },
  ]) {
    const escapedModule = entry.module.replace('.', '\\.');
    assert.match(appSource, new RegExp("from ['\"]\\.\\/" + escapedModule + "['\"]"));
    assert.match(appSource, new RegExp("if\\(a===['\"]" + entry.action + "['\"]\\)"));
    assert.match(appSource, new RegExp("state\\.view===['\"]" + entry.view + "['\"]\\?" + entry.renderer + '\\(\\)'));
  }
});

test('all three V14 engines ship in syntax checks, the Web image, preflight, and proxy compression coverage', async () => {
  for (const module of ['gomoku.js', 'memory-match.js', 'snake.js']) {
    const escapedModule = module.replace('.', '\\.');
    assert.match(packageSource, new RegExp('node --check web\\/' + escapedModule));
    assert.match(dockerSource, new RegExp('COPY[^\\n]*web\\/' + escapedModule + '[^\\n]*\\.\\/'));
    assert.match(preflightSource, new RegExp("['\"]web\\/" + escapedModule + "['\"]"));
    assert.match(proxyTestSource, new RegExp("['\"]\\/" + escapedModule + "['\"]"));
    const engine = await read('web/' + module);
    assert.match(engine, /\bexport\s+(?:const|function|class)\b/);
  }
});

test('Falling Blocks, Match Three, and Maze ship on every production surface', async () => {
  for (const entry of [
    { module:'falling-blocks.js', action:'open-falling', view:'falling' },
    { module:'match-three.js', action:'open-match3', view:'match3' },
    { module:'maze.js', action:'open-maze', view:'maze' },
  ]) {
    const escapedModule = entry.module.replace('.', '\\.');
    assert.match(appSource, new RegExp("from ['\"]\\.\\/" + escapedModule + "['\"]"));
    assert.match(appSource, new RegExp("if\\(a===['\"]" + entry.action + "['\"]\\)"));
    assert.match(appSource, new RegExp("state\\.view===['\"]" + entry.view + "['\"]"));
    assert.match(packageSource, new RegExp('node --check web\\/' + escapedModule));
    assert.match(dockerSource, new RegExp('COPY[^\\n]*web\\/' + escapedModule + '[^\\n]*\\.\\/'));
    assert.match(preflightSource, new RegExp("['\"]web\\/" + escapedModule + "['\"]"));
    assert.match(proxyTestSource, new RegExp("['\"]\\/" + escapedModule + "['\"]"));
    assert.match(await read('web/' + entry.module), /\bexport\s+(?:const|function|class)\b/);
  }
});

test('the seven quick games ship as one production engine and complete route', async () => {
  for (const source of [packageSource,dockerSource,preflightSource]) assert.match(source,/quick-games\.js/);
  assert.match(appSource,/from ['"]\.\/quick-games\.js['"]/);
  assert.match(appSource,/state\.view==='quick'\?quickGame\(\)/);
  assert.match(appSource,/if\(a==='open-quick'\)/);
  assert.match(await read('web/quick-games.js'),/export function newQuickGame/);
});

test('Reversi, Sokoban, and Sliding Puzzle are assembled into every production surface', async () => {
  for (const module of ['reversi.js', 'sokoban.js', 'sliding-puzzle.js']) {
    const escapedModule = module.replace('.', '\\.');
    assert.match(appSource, new RegExp("from ['\"]\\.\\/" + escapedModule + "['\"]"));
    assert.match(packageSource, new RegExp('node --check web\\/' + escapedModule));
    assert.match(dockerSource, new RegExp('COPY[^\\n]*web\\/' + escapedModule + '[^\\n]*\\.\\/'));
    assert.match(preflightSource, new RegExp("['\"]web\\/" + escapedModule + "['\"]"));
    assert.match(proxyTestSource, new RegExp("['\"]\\/" + escapedModule + "['\"]"));
    assert.match(await read('web/' + module), /\bexport\s+(?:const|function|class)\b/);
  }
});

test('Snake ticks update changed cells in place and reserve full render and focus for exceptional paths', () => {
  const frameUpdate = sourceBetween(appSource, 'function updateSnakeFrame(', 'function queueSnakeTick(');
  for (const hook of [
    'data-snake-board',
    'data-snake-score',
    'data-snake-best',
    'data-snake-length',
    'data-snake-status',
    'data-snake-status-text',
  ]) {
    assert.match(frameUpdate, new RegExp(`\\[${hook}\\]`));
  }
  const changedCells = frameUpdate.match(/const\s+changedCells\s*=\s*new\s+Set\(([^;]+)\)\s*;/s);
  assert.ok(changedCells, 'incremental renderer must derive a bounded set of changed cells');
  assert.match(changedCells[1], /previous\?\.snake/);
  assert.match(changedCells[1], /game\.snake/);
  assert.match(frameUpdate, /board\.children\.item\(index\)/);
  assert.match(frameUpdate, /cell\.className\s*=\s*visual\.className/);
  assert.match(frameUpdate, /cell\.innerHTML\s*=\s*visual\.content/);
  assert.doesNotMatch(frameUpdate, /board\.innerHTML\s*=/);
  assert.match(frameUpdate, /return\s+true\s*;/);

  const tick = sourceBetween(appSource, 'function queueSnakeTick()', 'function performSnakeDirection(');
  const fallback = tick.match(
    /if\s*\(\s*\[\s*['"]over['"]\s*,\s*['"]won['"]\s*\]\.includes\(next\.status\)\s*\|\|\s*persistenceFailed\s*\|\|\s*!updateSnakeFrame\(next\s*,\s*casual\.announcement\s*,\s*previous\)\s*\)\s*\{\s*render\(\s*\)\s*;\s*focusSnakeInteraction\(\s*\)\s*;\s*\}/,
  );
  assert.ok(fallback, 'terminal, persistence-failure, or DOM-fallback branch must own full render and focus');
  const beforeFallback = tick.slice(0, fallback.index);
  assert.doesNotMatch(beforeFallback, /\brender\(\s*\)/);
  assert.doesNotMatch(beforeFallback, /\bfocusSnakeInteraction\(\s*\)/);
  assert.equal((tick.match(/\brender\(\s*\)/g) || []).length, 1);
  assert.equal((tick.match(/\bfocusSnakeInteraction\(\s*\)/g) || []).length, 1);
});

test('Memory Match does not advance its clock while the document is hidden', () => {
  const clock = sourceBetween(appSource, 'function updateMemoryMatchClock()', 'function focusSnakeInteraction(');
  const hiddenGuard = clock.indexOf("document.visibilityState === 'hidden'");
  const advance = clock.indexOf('advanceMemoryMatchTime(');
  assert.ok(hiddenGuard >= 0, 'missing hidden-document guard');
  assert.ok(advance > hiddenGuard, 'the hidden-document guard must run before advancing time');
  assert.match(
    clock.slice(0, advance),
    /if\s*\([^;]*document\.visibilityState\s*===\s*['"]hidden['"][^;]*\)\s*return\s*;/s,
  );
});

test('in-progress local games ask before destructive restart or difficulty changes', () => {
  const confirmation = sourceBetween(appSource, 'function confirmLocalGameReplacement(', 'function performGomokuMove(');
  assert.match(confirmation, /if\s*\(\s*!hasProgress\s*\)\s*return\s+true\s*;/);
  assert.match(confirmation, /typeof\s+globalThis\.confirm\s*===\s*['"]function['"]/);
  assert.match(confirmation, /globalThis\.confirm\(message\)\s*:\s*false/);

  const handlers = sourceBetween(appSource, "if(a==='gomoku-new'", "if(a==='slots-spin'");
  assert.equal((handlers.match(/confirmLocalGameReplacement\(/g) || []).length, 6);

  const gomokuRestart = sourceBetween(handlers, "if(a==='gomoku-new'", "if(a==='memory-new'");
  assert.match(gomokuRestart, /game\?\.status\s*===\s*['"]playing['"]/);
  assert.match(gomokuRestart, /Number\(game\.moveCount\)\s*>\s*0/);
  assert.match(gomokuRestart, /if\s*\(\s*!confirmLocalGameReplacement\([^;]+\)\s*\)\s*return\s*;/s);

  const memoryRestart = sourceBetween(handlers, "if(a==='memory-new'", "if(a==='memory-difficulty'");
  assert.match(memoryRestart, /game\?\.status\s*===\s*['"]playing['"]/);
  assert.match(memoryRestart, /game\.faceUp\?\.length/);
  assert.match(memoryRestart, /Number\(game\.matchedPairs\)\s*>\s*0/);
  assert.match(memoryRestart, /if\s*\(\s*!confirmLocalGameReplacement\(hasProgress/);

  const memoryDifficulty = sourceBetween(handlers, "if(a==='memory-difficulty'", "if(a==='snake-direction'");
  assert.match(memoryDifficulty, /difficulty\s*===\s*game\.difficulty/);
  assert.match(memoryDifficulty, /game\.status\s*===\s*['"]playing['"]/);
  assert.match(memoryDifficulty, /if\s*\(\s*!confirmLocalGameReplacement\(hasProgress/);

  const snakeRestart = sourceBetween(handlers, "if(a==='snake-new'", "if(a==='snake-difficulty'");
  assert.match(snakeRestart, /\[\s*['"]playing['"]\s*,\s*['"]paused['"]\s*\]\.includes\(game\?\.status\)/);
  assert.match(snakeRestart, /Number\(game\.ticks\)\s*>\s*0/);
  assert.match(snakeRestart, /if\s*\(\s*!confirmLocalGameReplacement\(/);

  const snakeDifficulty = sourceBetween(appSource, "if(a==='snake-difficulty'", "if(a==='slots-spin'");
  assert.match(snakeDifficulty, /difficulty\s*===\s*game\.difficulty/);
  assert.match(snakeDifficulty, /\[\s*['"]playing['"]\s*,\s*['"]paused['"]\s*\]\.includes\(game\.status\)/);
  assert.match(snakeDifficulty, /Number\(game\.ticks\)\s*>\s*0/);
  assert.match(snakeDifficulty, /if\s*\(\s*!confirmLocalGameReplacement\(/);
});

test('Memory Match exposes every interactive card as a grid cell', () => {
  const card = sourceBetween(appSource, 'function memoryMatchCard(', 'function memoryMatchResult(');
  assert.match(card, /return\s+`<button\b[^`]*\brole="gridcell"/s);
  const route = sourceBetween(appSource, 'function memoryMatchGame()', 'function snakeCell(');
  assert.match(route, /data-memory-board\b[^>]*\brole="grid"/s);
  assert.match(route, /aria-rowcount="\$\{definition\.rows\}"/);
  assert.match(route, /aria-colcount="\$\{definition\.columns\}"/);
});

test('save failures are described honestly in all three new local-game routes', () => {
  const routes = [
    sourceBetween(appSource, 'function gomokuGame()', 'function formatMemoryTime('),
    sourceBetween(appSource, 'function memoryMatchGame()', 'function snakeCell('),
    sourceBetween(appSource, 'function snakeGame()', 'function historyMatchWon('),
  ];
  for (const route of routes) {
    assert.match(route, /const\s+persistenceAvailable\s*=\s*casual\.saveAvailable\s*!==\s*false\s*;/);
    assert.match(route, /persistenceAvailable\s*\?\s*['"][^'"]*自动保存[^'"]*['"]\s*:\s*['"][^'"]*(?:仅本轮可玩|存储不可用)[^'"]*['"]/);
    assert.match(route, /存储不可用[^'"`]*刷新后不会恢复/);
  }
});

test('zero-progress saves neither claim continuation badges nor restored progress', () => {
  const lobby = sourceBetween(appSource, 'function lobby()', 'function nav(');
  assert.match(lobby, /savedGomoku\?\.status\s*===\s*['"]playing['"]\s*&&\s*Number\(savedGomoku\.moveCount\)\s*>\s*0/);
  assert.match(lobby, /savedMemory\?\.status\s*===\s*['"]playing['"][^;]*Number\(savedMemory\.moveCount\)\s*>\s*0[^;]*savedMemory\.faceUp\?\.length[^;]*Number\(savedMemory\.matchedPairs\)\s*>\s*0/s);
  assert.match(lobby, /\[\s*['"]playing['"]\s*,\s*['"]paused['"]\s*\]\.includes\(savedSnake\?\.status\)\s*&&\s*Number\(savedSnake\.ticks\)\s*>\s*0/);
  assert.match(lobby, /canContinueGomoku\s*\?\s*['"]可继续['"]\s*:\s*savedGomoku\?\.status\s*===\s*['"]finished['"]\s*\?\s*['"]战果已保存['"]\s*:\s*['"]全新策略['"]/);
  assert.match(lobby, /canContinueMemory\s*\?\s*['"]可继续['"]\s*:\s*savedMemory\?\.status\s*===\s*['"]won['"]\s*\?\s*['"]成绩已保存['"]\s*:\s*['"]轻松短局['"]/);
  assert.match(lobby, /canContinueSnake\s*\?\s*['"]可继续['"]\s*:\s*\[\s*['"]over['"]\s*,\s*['"]won['"]\s*\]\.includes\(savedSnake\?\.status\)\s*\?\s*['"]上轮已保存['"]\s*:\s*['"]即时操作['"]/);

  const gomokuOpen = sourceBetween(appSource, 'function openGomoku()', 'function newGomokuSession(');
  assert.match(gomokuOpen, /Number\(saved\.moveCount\)\s*>\s*0\s*\?\s*['"]已恢复本地棋局['"]\s*:\s*['"]你执黑先行['"]/);

  const memoryOpen = sourceBetween(appSource, 'function openMemoryMatch()', 'function newMemorySession(');
  assert.match(memoryOpen, /!session\.restored\s*\|\|\s*session\.game\.status\s*===\s*['"]ready['"]\s*\?\s*['"]翻开两张牌，寻找相同图案['"]/);
  assert.match(memoryOpen, /session\.game\.status\s*===\s*['"]won['"]\s*\?\s*['"]上局成绩已保留['"]\s*:\s*['"]已恢复本地翻牌进度['"]/);

  const snakeOpen = sourceBetween(appSource, 'function openSnake()', 'function newSnakeSession(');
  assert.match(snakeOpen, /!saved\s*\|\|\s*Number\(game\.ticks\)\s*===\s*0\s*\?\s*['"]选择方向开始['"]/);
  assert.match(snakeOpen, /\[\s*['"]over['"]\s*,\s*['"]won['"]\s*\]\.includes\(game\.status\)\s*\?\s*['"]上轮结果已保留['"]\s*:\s*['"]已恢复本地进度['"]/);
});
