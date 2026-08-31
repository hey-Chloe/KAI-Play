import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const root = resolve(import.meta.dirname, '..');
const appSource = await readFile(resolve(root, 'web/app.js'), 'utf8');
const stylesSource = await readFile(resolve(root, 'web/styles.css'), 'utf8');
const productSource = await readFile(resolve(root, 'docs/KAI_PLAY_PRODUCT_V2.md'), 'utf8');

function between(source: string, start: string, end: string) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.notEqual(from, -1, `missing ${start}`);
  assert.notEqual(to, -1, `missing ${end}`);
  return source.slice(from, to);
}

const lobby = between(appSource, 'function lobby()', 'function nav(');
const v10Styles = stylesSource.slice(stylesSource.indexOf('/* V10:'));

function cssRule(source: string, selector: string) {
  const selectorAt = source.indexOf(selector);
  assert.notEqual(selectorAt, -1, `missing CSS selector ${selector}`);
  const open = source.indexOf('{', selectorAt + selector.length);
  const close = source.indexOf('}', open + 1);
  assert.ok(open > selectorAt && close > open, `missing CSS rule body for ${selector}`);
  return source.slice(open + 1, close);
}

function assertPixelDeclarationAtLeast(source: string, selector: string, property: string, minimum: number) {
  const body = cssRule(source, selector);
  const match = body.match(new RegExp(`${property.replace('-', '\\-')}\\s*:\\s*(\\d+)px`));
  assert.ok(match, `${selector} must declare ${property} in CSS pixels`);
  assert.ok(Number(match[1]) >= minimum, `${selector} ${property} must be at least ${minimum}px`);
}

function renderLobbyWithSaves({
  minesweeper = null,
  sudoku6 = null,
  merge1048 = null,
  xiangqi = null,
  gomoku = null,
  memory = null,
  snake = null,
  last = null,
}: {
  minesweeper?: Record<string, unknown> | null;
  sudoku6?: Record<string, unknown> | null;
  merge1048?: Record<string, unknown> | null;
  xiangqi?: Record<string, unknown> | null;
  gomoku?: Record<string, unknown> | null;
  memory?: Record<string, unknown> | null;
  snake?: Record<string, unknown> | null;
  last?: string | null;
} = {}) {
  return runInNewContext(`(${lobby})()`, {
    state: { profile:null, error:'', heroGame:'ddz' },
    LAST_LOCAL_GAME_KEY: 'kai.play.last-local-game',
    safeStorageGet: () => last,
    loadSavedMinesweeperGame: () => minesweeper,
    loadSavedSudoku6Game: () => sudoku6,
    loadSaved1048Game: () => merge1048,
    loadSavedXiangqiSession: () => xiangqi,
    loadGomokuGame: () => gomoku,
    loadMemoryMatchSession: () => memory || {
      restored:false,
      game:null,
      bestScores:{},
      saveAvailable:true,
    },
    loadSavedSnakeGame: () => snake,
    MINESWEEPER_DIFFICULTIES: { beginner:{ label:'入门' }, standard:{ label:'标准' }, challenge:{ label:'挑战' } },
    SUDOKU6_DIFFICULTIES: { easy:{ label:'入门' }, medium:{ label:'标准' }, hard:{ label:'挑战' } },
    XIANGQI_DIFFICULTIES: { beginner:{ label:'初学' }, standard:{ label:'标准' }, challenge:{ label:'挑战' } },
    MEMORY_MATCH_DIFFICULTIES: {
      easy:{ label:'轻松', rows:3, columns:4 },
      medium:{ label:'标准', rows:4, columns:4 },
      hard:{ label:'挑战', rows:4, columns:6 },
    },
    SNAKE_DIFFICULTIES: {
      relaxed:{ label:'舒缓', tickMs:220 },
      normal:{ label:'标准', tickMs:150 },
      swift:{ label:'疾速', tickMs:95 },
    },
    tableFrame: () => '',
    mahjongTone: () => '',
    mahjongMark: () => '',
    mahjongFace: () => '',
    previewPoker: () => '',
    cardBack: () => '',
    header: () => '',
    nav: () => '',
    esc: (value: unknown) => String(value ?? ''),
    competitiveScore: () => 0,
    winRatePercent: () => 0,
    tierName: () => '启航段位',
    money: (value: unknown) => String(value ?? 0),
  });
}

test('game discovery leads while room and record tools remain available later', () => {
  const intro = lobby.indexOf('game-center-intro');
  const discovery = lobby.indexOf('hub-discovery');
  const catalog = lobby.indexOf('id="game-selection"');
  const tools = lobby.indexOf('id="lobby-tools"');
  assert.ok(intro >= 0 && intro < discovery);
  assert.ok(discovery < catalog);
  assert.ok(catalog < tools);
  assert.match(lobby, /现在，想玩点什么？/);
  assert.match(lobby, /data-action="create-room"/);
  assert.match(lobby, /data-action="join-room"/);
  assert.match(productSource, /Game Center V10 信息架构/);
});

test('continuation uses real local state and has an honest first-time fallback', () => {
  for (const loader of [
    'loadSavedMinesweeperGame', 'loadSavedSudoku6Game', 'loadSaved1048Game', 'loadSavedXiangqiSession',
    'loadGomokuGame', 'loadMemoryMatchSession', 'loadSavedSnakeGame',
  ]) assert.match(lobby, new RegExp(loader));
  assert.match(lobby, /revealedCount/);
  assert.match(lobby, /已填 \$\{completed\}\/\$\{blanks\} 格/);
  assert.match(lobby, /最高方块 \$\{saved1048\.bestTile\}/);
  assert.match(lobby, /已走 \$\{savedXiangqi\.game\.moveCount\} 手/);
  assert.match(lobby, /已落 \$\{savedGomoku\.moveCount\} 手/);
  assert.match(lobby, /已配对 \$\{savedMemory\.matchedPairs\}\/\$\{savedMemory\.pairCount\}/);
  assert.match(lobby, /得分 \$\{savedSnake\.score\}/);
  assert.match(lobby, /新手推荐/);
  assert.match(lobby, /首击必安全/);
  assert.match(lobby, /role="progressbar"/);
});

test('continuation prefers the most recently opened game but only while it can really continue', () => {
  const playingMinesweeper = { status:'playing', rows:9, columns:9, mineCount:10, revealedCount:12, difficulty:'beginner' };
  const sudokuValues = Array(36).fill(0);
  sudokuValues[0] = 3;
  const playingSudoku = { status:'playing', puzzle:Array(36).fill(0), values:sudokuValues, difficulty:'medium' };
  const playing1048 = { status:'playing', bestTile:64, moves:18 };
  const playingXiangqi = { game:{ status:'playing', difficulty:'standard', moveCount:9 } };
  const playingGomoku = { status:'playing', moveCount:7 };
  const playingMemory = {
    restored:true,
    game:{ status:'playing', difficulty:'easy', moveCount:4, faceUp:[], matchedPairs:2, pairCount:6 },
  };
  const playingSnake = { status:'paused', difficulty:'normal', ticks:24, score:30, snake:[1, 2, 3, 4, 5] };

  const recentXiangqi = renderLobbyWithSaves({
    minesweeper:playingMinesweeper, sudoku6:playingSudoku, merge1048:playing1048, xiangqi:playingXiangqi, last:'xiangqi',
  });
  assert.match(recentXiangqi, /继续游玩[\s\S]*KAI 象棋/);

  const fallbackSudoku = renderLobbyWithSaves({
    minesweeper:{ ...playingMinesweeper, status:'lost' }, sudoku6:playingSudoku, last:'minesweeper',
  });
  assert.match(fallbackSudoku, /继续游玩[\s\S]*KAI 数独/);

  const recentGomoku = renderLobbyWithSaves({ gomoku:playingGomoku, last:'gomoku' });
  assert.match(recentGomoku, /继续游玩[\s\S]*KAI 五子棋[\s\S]*已落 7 手/);
  const recentMemory = renderLobbyWithSaves({ memory:playingMemory, last:'memory' });
  assert.match(recentMemory, /继续游玩[\s\S]*KAI 记忆翻牌[\s\S]*已配对 2\/6/);
  const recentSnake = renderLobbyWithSaves({ snake:playingSnake, last:'snake' });
  assert.match(recentSnake, /继续游玩[\s\S]*KAI 贪吃蛇[\s\S]*得分 30/);

  const untouchedSudoku = renderLobbyWithSaves({
    sudoku6:{ ...playingSudoku, values:Array(36).fill(0) }, last:'sudoku6',
  });
  assert.match(untouchedSudoku, /新手推荐[\s\S]*先来一局扫雷/);
  assert.doesNotMatch(untouchedSudoku, /<span>继续游玩<\/span>/);

  const untouchedNewGames = renderLobbyWithSaves({
    gomoku:{ status:'playing', moveCount:0 },
    memory:{ restored:true, game:{ status:'ready', difficulty:'easy', moveCount:0, faceUp:[], matchedPairs:0, pairCount:6 } },
    snake:{ status:'ready', difficulty:'normal', ticks:0, score:0, snake:[1, 2, 3] },
    last:'gomoku',
  });
  assert.match(untouchedNewGames, /新手推荐[\s\S]*先来一局扫雷/);
  assert.doesNotMatch(untouchedNewGames, /<span>继续游玩<\/span>/);

  const terminalOnly = renderLobbyWithSaves({
    minesweeper:{ ...playingMinesweeper, status:'won' },
    sudoku6:{ ...playingSudoku, status:'completed' },
    merge1048:{ ...playing1048, status:'over' },
    xiangqi:{ game:{ ...playingXiangqi.game, status:'finished' } },
    last:'minesweeper',
  });
  assert.match(terminalOnly, /新手推荐[\s\S]*先来一局扫雷/);
  assert.doesNotMatch(terminalOnly, /<span>继续游玩<\/span>/);
});

test('each of the seven persisted local games records itself as the most recently opened candidate', () => {
  assert.match(appSource, /const LAST_LOCAL_GAME_KEY\s*=\s*'kai\.play\.last-local-game'/);
  assert.match(appSource, /function rememberLastLocalGame\(game\)[\s\S]{0,500}safeStorageSet\(LAST_LOCAL_GAME_KEY,\s*game\)/);
  for (const [start, end, game] of [
    ['function openXiangqi()', 'function settleXiangqiClock(', 'xiangqi'],
    ['function open1048()', 'function focus1048Interaction(', '1048'],
    ['function openSudoku6()', 'function focusSudoku6Interaction(', 'sudoku6'],
    ['function openMinesweeper()', 'function newMinesweeperSession(', 'minesweeper'],
    ['function openGomoku()', 'function newGomokuSession(', 'gomoku'],
    ['function openMemoryMatch()', 'function newMemorySession(', 'memory'],
    ['function openSnake()', 'function newSnakeSession(', 'snake'],
  ] as const) {
    assert.match(between(appSource, start, end), new RegExp(`rememberLastLocalGame\\('${game}'\\)`));
  }
});

test('the global trust row scopes local persistence to the seven games that provide it', () => {
  assert.match(lobby, /<span>7 款本地自动保存<\/span>/);
  assert.doesNotMatch(lobby, /<span>本地自动保存<\/span>/);
  assert.match(productSource, /7 款本地自动保存/);
});

test('mood shortcuts navigate only to known playable destinations', () => {
  assert.equal([...lobby.matchAll(/data-action="jump-world"/g)].length, 5);
  for (const target of ['minesweeper', 'sudoku6', 'xiangqi', 'ddz', 'friends']) {
    assert.match(lobby, new RegExp(`data-world-target="${target}"`));
  }
  const jump = between(appSource, 'function jumpToLobbyTarget(', "app.addEventListener('click'");
  assert.match(jump, /new Set\(\['ddz','xiangqi','gomoku','mahjong','1048','sudoku6','minesweeper','memory','snake','three','reels'\]\)/);
  assert.match(jump, /target==='friends'/);
  assert.match(appSource, /if\(a==='jump-world'\)\{jumpToLobbyTarget/);
});

test('all eleven games use equal poster cards with one horizontal rail', () => {
  assert.equal([...lobby.matchAll(/data-world-card/g)].length, 11);
  assert.equal([...lobby.matchAll(/class="world-cover"/g)].length, 11);
  assert.equal([...lobby.matchAll(/class="world-copy"/g)].length, 11);
  assert.match(lobby, /data-world-status/);
  assert.match(appSource, /function updateWorldCarouselStatus/);
  assert.match(v10Styles, /\.lobby-game-center \.game-world[\s\S]*flex:\s*0 0 clamp\(236px, 22vw, 274px\)/);
  assert.match(v10Styles, /\.lobby-game-center \.world-strip[\s\S]*gap:\s*14px/);
});

test('phone discovery is compact, swipeable, and motion-safe', () => {
  const phone = between(v10Styles, '@media (max-width: 560px)', '@media (max-width: 340px)');
  assert.match(phone, /\.lobby-game-center \.lobby-game-carousel,[\s\S]*height:\s*245px/);
  assert.match(phone, /width:\s*min\(82vw, 320px\)/);
  assert.match(phone, /grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(phone, /\.lobby-game-center > \.nav[\s\S]*env\(safe-area-inset-bottom\)/);
  assert.match(v10Styles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.lobby-game-center \.game-world/);
});

test('phone discovery keeps every primary touch target at least 44 CSS pixels', () => {
  const phone = between(v10Styles, '@media (max-width: 560px)', '@media (max-width: 340px)');
  for (const selector of [
    '.mood-rail button',
    '.lobby-game-center .hero-switcher button',
    '.lobby-game-center .mahjong-hero-action .btn',
    '.resume-card .btn',
    '.lobby-game-center .mode-entry',
    '.lobby-game-center .world-copy .btn',
    '.lobby-game-center > .nav .btn',
  ]) assertPixelDeclarationAtLeast(phone, selector, 'min-height', 44);
  assertPixelDeclarationAtLeast(phone, '.lobby-game-center .world-carousel-controls button', 'width', 44);
  assertPixelDeclarationAtLeast(phone, '.lobby-game-center .world-carousel-controls button', 'height', 44);
});

test('the 320px catalog heading can wrap without colliding with paging controls', () => {
  const narrow = between(v10Styles, '@media (max-width: 340px)', '@media (prefers-reduced-motion: reduce)');
  const headingLayout = cssRule(narrow, '.lobby-game-center .game-catalog > .section-head');
  assert.match(headingLayout, /(?:grid-template-columns:\s*1fr|flex-wrap:\s*wrap)/);
  assert.match(cssRule(narrow, '.lobby-game-center .game-catalog .section-head h2'), /white-space:\s*normal/);
});

test('editorial signals never pretend to be measured popularity', () => {
  assert.match(lobby, /竞技牌桌|新上线|可继续|牌桌经典|稀有目标|首击安全|大厅彩蛋/);
  assert.doesNotMatch(lobby, /\d+\s*人在线|在线人数|五星|好评率|今日热门|为你推荐/);
});
