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
const v24Styles = stylesSource.slice(stylesSource.indexOf('/* V24'));

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
  reversi = null,
  sokoban = null,
  sliding = null,
  memory = null,
  matchThree = null,
  falling = null,
  snake = null,
  maze = null,
  farm = null,
  last = null,
}: {
  minesweeper?: Record<string, unknown> | null;
  sudoku6?: Record<string, unknown> | null;
  merge1048?: Record<string, unknown> | null;
  xiangqi?: Record<string, unknown> | null;
  gomoku?: Record<string, unknown> | null;
  reversi?: Record<string, unknown> | null;
  sokoban?: Record<string, unknown> | null;
  sliding?: Record<string, unknown> | null;
  memory?: Record<string, unknown> | null;
  matchThree?: Record<string, unknown> | null;
  falling?: Record<string, unknown> | null;
  snake?: Record<string, unknown> | null;
  maze?: Record<string, unknown> | null;
  farm?: Record<string, unknown> | null;
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
    loadSavedReversiGame: () => reversi,
    loadSavedSokobanGame: () => sokoban,
    loadSavedSlidingPuzzleGame: () => sliding,
    loadMemoryMatchSession: () => memory || {
      restored:false,
      game:null,
      bestScores:{},
      saveAvailable:true,
    },
    loadSavedMatchThreeGame: () => matchThree,
    loadSavedFallingBlocksGame: () => falling,
    loadSavedSnakeGame: () => snake,
    loadSavedMazeGame: () => maze,
    loadSavedFarmGame: () => farm,
    farmHasProgress: (game: any) => Boolean(game)
      && (game?.status === 'finished'
        || Number(game?.day) > 1
        || Number(game?.actions) > 0
        || Number(game?.harvests) > 0
        || Number(game?.xp) > 0
        || Number(game?.coins) !== 36
        || game?.plots?.some((plot: any) => plot?.kind !== 'empty')),
    farmPlotStatus: (plot: any) => {
      if (plot?.kind === 'weed') return 'weed';
      if (plot?.kind !== 'crop') return 'empty';
      const required = { wheat:1, carrot:2, strawberry:3 }[plot.cropId] || 1;
      return Number(plot?.growthDays) >= required ? 'ready' : 'growing';
    },
    isResumableMinesweeperGame: (game: any) => (game?.status === 'playing' && Number(game?.revealedCount) > 0)
      || (game?.status === 'ready' && Number(game?.flagCount) > 0),
    isResumableSudoku6Game: (game: any) => game?.status === 'playing'
      && (game.values?.some((value: number, index: number) => game.puzzle?.[index] === 0 && value !== 0)
        || game.notes?.some((mask: number) => mask !== 0)),
    isResumableReversiGame: (game: any) => game?.status === 'playing' && Number(game?.moveCount) > 0,
    isResumableSokobanGame: (game: any) => game?.status === 'playing' && Number(game?.steps) > 0,
    isResumableSlidingPuzzleGame: (game: any) => game?.status === 'playing' && Number(game?.moveCount) > 0,
    isResumableMatchThreeGame: (game: any) => game?.status === 'playing' && Number(game?.moveCount) > 0,
    isResumableFallingBlocksGame: (game: any) => ['playing','paused'].includes(game?.status) && Number(game?.pieces) > 0,
    isResumableMazeGame: (game: any) => game?.status === 'playing' && Number(game?.stepCount) > 0,
    MINESWEEPER_DIFFICULTIES: { beginner:{ label:'入门' }, standard:{ label:'标准' }, challenge:{ label:'挑战' } },
    SUDOKU6_DIFFICULTIES: { easy:{ label:'入门' }, medium:{ label:'标准' }, hard:{ label:'挑战' } },
    XIANGQI_DIFFICULTIES: { beginner:{ label:'初学' }, standard:{ label:'标准' }, challenge:{ label:'挑战' } },
    REVERSI_CELL_COUNT: 64,
    REVERSI_DIFFICULTIES: { beginner:{ label:'入门' }, standard:{ label:'标准' }, challenge:{ label:'挑战' } },
    SOKOBAN_LEVELS: [{ name:'初次推动' }],
    SLIDING_PUZZLE_DIFFICULTIES: { easy:{ label:'入门' }, standard:{ label:'标准' }, challenge:{ label:'挑战' } },
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
    QUICK_GAME_KINDS: ['tictactoe','lights','guess','rps','math','sequence','stroop'],
    QUICK_GAME_META: {
      tictactoe:{ name:'KAI 井字棋', glyph:'╳' }, lights:{ name:'KAI 点灯', glyph:'✦' },
      guess:{ name:'KAI 猜数字', glyph:'?' }, rps:{ name:'KAI 猜拳', glyph:'✌' },
      math:{ name:'KAI 心算', glyph:'+' }, sequence:{ name:'KAI 顺序记忆', glyph:'◆' },
      stroop:{ name:'KAI 颜色挑战', glyph:'彩' },
    },
    PORTAL_GAME_GLYPHS: { tictactoe:'╳', lights:'✦', guess:'?', rps:'✌', math:'+', sequence:'◆', stroop:'彩' },
    portalRecommendationCard: () => '',
    portalRankingPanel: () => '',
    gameContent: (gameId: string) => ({ name:gameId, eyebrow:'本地短局', duration:'3 分钟', mode:'单人', goal:'完成挑战', actionLabel:'开始' }),
    tableFrame: () => '',
    mahjongTone: () => '',
    mahjongMark: () => '',
    mahjongFace: () => '',
    previewPoker: () => '',
    cardBack: () => '',
    catalogPlaybookMarkup: () => '',
    header: () => '',
    nav: () => '',
    esc: (value: unknown) => String(value ?? ''),
    competitiveScore: () => 0,
    winRatePercent: () => 0,
    tierName: () => '启航段位',
    money: (value: unknown) => String(value ?? 0),
    formatSudoku6Time: (seconds: unknown) => `${Number(seconds) || 0}s`,
    Date,
  });
}

test('game discovery stays focused while room and record tools move to Friends', () => {
  const intro = lobby.indexOf('game-center-intro');
  const discovery = lobby.indexOf('hub-discovery');
  const catalog = lobby.indexOf('id="game-selection"');
  const tools = lobby.indexOf('id="lobby-tools"');
  assert.ok(intro >= 0 && intro < discovery);
  assert.ok(discovery < catalog);
  assert.equal(tools, -1);
  assert.match(lobby, /现在，想玩点什么？/);
  assert.match(lobby, /data-action="view-friends"/);
  assert.doesNotMatch(lobby, /data-action="create-room"|data-action="join-room"|id="room-code"/);
  assert.match(appSource, /class="friend-history-card"/);
  assert.match(appSource, /class="friends-portal"/);
  assert.match(productSource, /Game Center V10 信息架构/);
});

test('continuation uses real local state and has an honest first-time fallback', () => {
  for (const loader of [
    'loadSavedMinesweeperGame', 'loadSavedSudoku6Game', 'loadSaved1048Game', 'loadSavedXiangqiSession',
    'loadGomokuGame', 'loadSavedReversiGame', 'loadSavedSokobanGame', 'loadSavedSlidingPuzzleGame',
    'loadMemoryMatchSession', 'loadSavedMatchThreeGame', 'loadSavedFallingBlocksGame',
    'loadSavedSnakeGame', 'loadSavedMazeGame', 'loadSavedFarmGame',
  ]) assert.match(lobby, new RegExp(loader));
  assert.match(lobby, /revealedCount/);
  assert.match(lobby, /已填 \$\{completed\}\/\$\{blanks\} 格/);
  assert.match(lobby, /最高方块 \$\{saved1048\.bestTile\}/);
  assert.match(lobby, /已走 \$\{savedXiangqi\.game\.moveCount\} 手/);
  assert.match(lobby, /已落 \$\{savedGomoku\.moveCount\} 手/);
  assert.match(lobby, /已配对 \$\{savedMemory\.matchedPairs\}\/\$\{savedMemory\.pairCount\}/);
  assert.match(lobby, /得分 \$\{savedSnake\.score\}/);
  assert.match(lobby, /savedFarm\.plots\.filter/);
  assert.match(lobby, /块成熟|块生长中/);
  assert.match(lobby, /新手推荐/);
  assert.match(lobby, /首击必安全/);
  assert.match(lobby, /role="progressbar"/);
});

test('continuation prefers the most recently opened game but only while it can really continue', () => {
  const playingMinesweeper = { status:'playing', rows:9, columns:9, mineCount:10, revealedCount:12, flagCount:0, moveCount:12, elapsedSeconds:0, difficulty:'beginner' };
  const sudokuValues = Array(36).fill(0);
  sudokuValues[0] = 3;
  const playingSudoku = { status:'playing', puzzle:Array(36).fill(0), values:sudokuValues, difficulty:'medium' };
  const playing1048 = { status:'playing', bestTile:64, moves:18 };
  const playingXiangqi = { game:{ status:'playing', difficulty:'standard', moveCount:9 } };
  const playingGomoku = { status:'playing', moveCount:7 };
  const playingReversi = { status:'playing', difficulty:'standard', moveCount:8, score:{ black:7, white:5, empty:52 } };
  const playingSokoban = { status:'playing', levelIndex:0, steps:3, boxes:[8], targets:[9] };
  const playingSliding = { status:'playing', difficulty:'easy', size:3, moveCount:5, elapsedSeconds:12 };
  const playingMemory = {
    restored:true,
    game:{ status:'playing', difficulty:'easy', moveCount:4, faceUp:[], matchedPairs:2, pairCount:6 },
  };
  const playingSnake = { status:'paused', difficulty:'normal', ticks:24, score:30, snake:[1, 2, 3, 4, 5] };
  const playingFarm = {
    schemaVersion:2, kind:'farm', status:'playing', day:2, actionsLeft:5,
    coins:32, xp:0, level:1, harvests:0, actions:1, revision:2, selectedCrop:'wheat',
    plots:[
      { kind:'crop', cropId:'wheat', plantedDay:1, growthDays:1, wateredToday:false, dryStreak:0 },
      ...Array.from({ length:5 }, () => ({ kind:'empty', cropId:null, plantedDay:null, growthDays:0, wateredToday:false, dryStreak:0 })),
    ],
    lastAction:'advance_day', result:null,
  };

  const recentXiangqi = renderLobbyWithSaves({
    minesweeper:playingMinesweeper, sudoku6:playingSudoku, merge1048:playing1048, xiangqi:playingXiangqi, last:'xiangqi',
  });
  assert.match(recentXiangqi, /继续游玩[\s\S]*KAI 象棋/);
  assert.match(recentXiangqi, /class="hub-discovery has-resume"/);
  assert.match(recentXiangqi, /data-action="show-continuable"[\s\S]*4 款可继续/);
  assert.ok(recentXiangqi.indexOf('<aside class="hub-side">') < recentXiangqi.indexOf('<section class="lobby-game-carousel"'));

  const fallbackSudoku = renderLobbyWithSaves({
    minesweeper:{ ...playingMinesweeper, status:'lost' }, sudoku6:playingSudoku, last:'minesweeper',
  });
  assert.match(fallbackSudoku, /继续游玩[\s\S]*KAI 数独/);

  const recentGomoku = renderLobbyWithSaves({ gomoku:playingGomoku, last:'gomoku' });
  assert.match(recentGomoku, /继续游玩[\s\S]*KAI 五子棋[\s\S]*已落 7 手/);
  const recentReversi = renderLobbyWithSaves({ reversi:playingReversi, last:'reversi' });
  assert.match(recentReversi, /继续对弈[\s\S]*KAI 黑白棋[\s\S]*黑 7 : 5 白/);
  const recentSokoban = renderLobbyWithSaves({ sokoban:playingSokoban, last:'sokoban' });
  assert.match(recentSokoban, /继续闯关[\s\S]*KAI 推箱子[\s\S]*已归位 0\/1/);
  const recentSliding = renderLobbyWithSaves({ sliding:playingSliding, last:'sliding' });
  assert.match(recentSliding, /继续拼图[\s\S]*KAI 数字华容道[\s\S]*已移动 5 步/);
  const recentMemory = renderLobbyWithSaves({ memory:playingMemory, last:'memory' });
  assert.match(recentMemory, /继续游玩[\s\S]*KAI 记忆翻牌[\s\S]*已配对 2\/6/);
  const recentSnake = renderLobbyWithSaves({ snake:playingSnake, last:'snake' });
  assert.match(recentSnake, /继续游玩[\s\S]*KAI 贪吃蛇[\s\S]*得分 30/);
  const recentFarm = renderLobbyWithSaves({ farm:playingFarm, last:'farm' });
  assert.match(recentFarm, /继续经营[\s\S]*KAI 农场[\s\S]*1 块成熟 · 第 2 日/);

  const flaggedMinesweeper = renderLobbyWithSaves({
    minesweeper:{ ...playingMinesweeper, status:'ready', revealedCount:0, flagCount:1, moveCount:1 },
    last:'minesweeper',
  });
  assert.match(flaggedMinesweeper, /继续游玩[\s\S]*KAI 扫雷[\s\S]*已标记 1 处[\s\S]*旗位已保存 · 首击仍然安全/);
  const clearedFlags = renderLobbyWithSaves({
    minesweeper:{ ...playingMinesweeper, status:'ready', revealedCount:0, flagCount:0, moveCount:2 },
    last:'minesweeper',
  });
  assert.doesNotMatch(clearedFlags, /hub-discovery has-resume|data-action="show-continuable"/);

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
  assert.doesNotMatch(terminalOnly, /hub-discovery has-resume|data-action="show-continuable"/);
  assert.ok(terminalOnly.indexOf('<section class="lobby-game-carousel"') < terminalOnly.indexOf('<aside class="hub-side">'));
});

test('Sudoku continuation checks both daily and practice saves before falling back to the last mode', () => {
  const loaderSource = between(appSource, 'function loadSavedSudoku6Game(', 'function saveSudoku6Game(');
  const progressSource = between(appSource, 'function isResumableSudoku6Game(', 'function isResumableMinesweeperGame(');
  const date = '2026-08-31';
  const empty = Array(36).fill(0);
  const daily = { mode:'daily', date, status:'playing', puzzle:empty, values:[...empty], notes:[...empty] };
  const practiceValues = [...empty];
  practiceValues[7] = 4;
  const practice = { mode:'practice', date:null, status:'playing', puzzle:empty, values:practiceValues, notes:[...empty] };
  const storage = new Map<string, string>([
    ['last-mode', 'daily'],
    [`daily:${date}`, JSON.stringify(daily)],
    ['practice', JSON.stringify(practice)],
  ]);
  const loadSavedSudoku6Game = runInNewContext(`${loaderSource}\n${progressSource}; loadSavedSudoku6Game`, {
    JSON,
    SUDOKU6_LAST_MODE_KEY:'last-mode',
    SUDOKU6_DAILY_SAVE_PREFIX:'daily:',
    SUDOKU6_PRACTICE_SAVE_KEY:'practice',
    safeStorageGet:(key: string) => storage.get(key) ?? null,
    safeStorageRemove:(key: string) => storage.delete(key),
    localDateKey:() => date,
    sudoku6SaveKey:(mode: string) => mode === 'daily' ? `daily:${date}` : 'practice',
    restoreSudoku6Game:(value: object) => value,
  });

  assert.equal(loadSavedSudoku6Game().mode, 'practice', 'a real alternate-mode save must beat a zero-progress last mode');
  assert.equal(loadSavedSudoku6Game('daily').mode, 'daily', 'an explicit mode selection must remain exact');

  const dailyNotes = [...empty];
  dailyNotes[4] = 2;
  storage.set('last-mode', 'practice');
  storage.set(`daily:${date}`, JSON.stringify({ ...daily, notes:dailyNotes }));
  storage.set('practice', JSON.stringify({ ...practice, values:[...empty] }));
  assert.equal(loadSavedSudoku6Game().mode, 'daily', 'notes in the alternate daily puzzle must count as resumable');

  storage.set('practice', JSON.stringify(practice));
  assert.equal(loadSavedSudoku6Game().mode, 'practice', 'when both modes can resume, the last mode remains preferred');

  storage.set(`daily:${date}`, JSON.stringify({ ...daily, status:'completed' }));
  storage.set('practice', JSON.stringify({ ...practice, values:[...empty] }));
  assert.equal(loadSavedSudoku6Game().mode, 'practice', 'without resumable progress, the last valid mode remains the fallback');
});

test('quick entries complement the featured card tables instead of repeating them', () => {
  const quickRail = between(lobby, '<nav class="lobby-mode-rail"', '</nav>');
  const actions = [...quickRail.matchAll(/data-action="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(actions, ['open-1048', 'open-gomoku', 'open-memory', 'open-snake']);
  assert.doesNotMatch(quickRail, /hero-select|data-hero-game/);
  for (const name of ['1048', '五子棋', '记忆翻牌', '贪吃蛇']) assert.match(quickRail, new RegExp(name));
});

test('each of the fourteen persisted local games records itself as the most recently opened candidate', () => {
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
    ['function openFarm()', 'function farmActionError(', 'farm'],
  ] as const) {
    assert.match(between(appSource, start, end), new RegExp(`rememberLastLocalGame\\('${game}'\\)`));
  }
  for (const [opener, game] of [
    ['openReversi', 'reversi'],
    ['openSokoban', 'sokoban'],
    ['openSlidingPuzzle', 'sliding'],
    ['openMatchThree', 'match3'],
    ['openFallingBlocks', 'falling'],
    ['openMaze', 'maze'],
  ] as const) {
    assert.match(appSource, new RegExp(`function ${opener}\\([^)]*\\)[\\s\\S]{0,2400}rememberLastLocalGame\\('${game}'\\)`));
  }
});

test('the global trust row scopes local persistence to the fourteen games that provide it', () => {
  assert.match(lobby, /<span>14 款本地自动保存<\/span>/);
  assert.doesNotMatch(lobby, /<span>本地自动保存<\/span>/);
  assert.match(productSource, /14 款本地自动保存/);
});

test('the three new local routes recover safely and keep one accessible interaction surface', () => {
  const reversiOpen = between(appSource, 'function openReversi()', 'function newReversiSession(');
  assert.match(reversiOpen, /game\.turn === 'white'/);
  assert.match(reversiOpen, /chooseReversiMove\(game\)/);
  assert.match(reversiOpen, /playReversiMove\(game, aiMove\.index\)/);

  const sokoban = between(appSource, 'function sokobanCell(', 'function slidingPuzzleGame(');
  assert.match(sokoban, /class="sokoban-row" role="row"/);
  assert.match(sokoban, /data-sokoban-board role="grid"/);
  assert.match(sokoban, /aria-rowindex=/);
  assert.match(sokoban, /aria-colindex=/);
  assert.match(sokoban, /aria-describedby="sokoban-position-summary"/);
  assert.doesNotMatch(sokoban, /role="application"/);

  const sliding = between(appSource, 'function slidingPuzzleGame()', 'function quickGameStatus(');
  assert.match(sliding, /data-sliding-tile="\$\{index\}"[^>]*tabindex="-1"/);
  assert.doesNotMatch(sliding, /<h1>/);
  assert.match(stylesSource, /\.sokoban-row\s*\{\s*display:contents/);
  assert.match(stylesSource, /\.reversi-route \.table-exit[^\{]*\{\s*min-height:44px/);
});

test('mood shortcuts navigate only to known playable destinations', () => {
  assert.equal([...lobby.matchAll(/data-action="jump-world"/g)].length, 4);
  for (const target of ['minesweeper', 'sudoku6', 'xiangqi', 'ddz']) {
    assert.match(lobby, new RegExp(`data-world-target="${target}"`));
  }
  assert.match(lobby, /data-action="view-friends"[^>]*>[\s\S]*?和朋友玩/);
  const jump = between(appSource, 'function jumpToLobbyTarget(', "app.addEventListener('click'");
  assert.match(jump, /new Set\(CATALOG_GAME_IDS\)/);
  assert.match(jump, /target==='friends'/);
  assert.match(appSource, /if\(a==='jump-world'\)\{jumpToLobbyTarget/);
});

test('all twenty-five games use compact icon entries in one responsive grid', () => {
  assert.equal([...lobby.matchAll(/data-world-card/g)].length, 19);
  assert.match(lobby, /QUICK_GAME_KINDS\.map/);
  assert.equal([...lobby.matchAll(/class="world-cover"/g)].length, 19);
  assert.equal([...lobby.matchAll(/class="world-copy"/g)].length, 19);
  assert.match(lobby, /class="world-strip game-icon-grid"/);
  assert.doesNotMatch(lobby, /data-world-status|data-action="world-(?:prev|next)"|world-carousel-hint/);
  assert.match(v24Styles, /\.game-icon-grid\s*\{[\s\S]*?grid-template-columns:repeat\(9,minmax\(0,1fr\)\)/);
  assert.match(v24Styles, /\.game-icon-grid \.game-world\s*\{[\s\S]*?width:auto!important;[\s\S]*?flex:none!important/);
});

test('phone discovery stays dense, vertically scrollable, and motion-safe', () => {
  assert.match(v24Styles, /@media \(max-width:560px\)[\s\S]*?\.game-icon-grid\s*\{ grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
  assert.match(v24Styles, /@media \(max-width:350px\)[\s\S]*?\.game-icon-grid\s*\{ grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(v24Styles, /\.game-icon-grid\s*\{[\s\S]*?overflow:visible;[\s\S]*?touch-action:auto/);
  assert.match(v24Styles, /@media \(prefers-reduced-motion:reduce\)[\s\S]*\.game-icon-grid \.game-world/);
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
  ]) assertPixelDeclarationAtLeast(phone, selector, 'min-height', 44);
  assertPixelDeclarationAtLeast(v24Styles, '.lobby-game-center .game-icon-grid .world-copy .btn', 'min-height', 44);
});

test('the narrow catalog heading flows beside a concise result summary without paging controls', () => {
  assert.match(v24Styles, /@media \(max-width:560px\)[\s\S]*?\.game-catalog > \.section-head\s*\{[^}]*display:flex;[^}]*align-items:flex-start/);
  assert.match(v24Styles, /@media \(max-width:560px\)[\s\S]*?\.icon-wall-summary span:first-child\s*\{ display:none; \}/);
  assert.doesNotMatch(lobby, /world-carousel-controls|data-world-status/);
});

test('editorial signals never pretend to be measured popularity', () => {
  assert.match(lobby, /竞技牌桌|新上线|可继续|牌桌经典|稀有目标|首击安全|大厅彩蛋/);
  assert.doesNotMatch(lobby, /\d+\s*人在线|在线人数|五星|好评率|今日热门|为你推荐/);
});
