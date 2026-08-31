import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const root = resolve(import.meta.dirname, '..');
const read = (path: string) => readFile(resolve(root, path), 'utf8');
const [
  appSource,
  styleSource,
  indexSource,
  packageSource,
  dockerSource,
  preflightSource,
  readme,
  product,
  productSpec,
  mobileSource,
] = await Promise.all([
  read('web/app.js'),
  read('web/styles.css'),
  read('web/index.html'),
  read('package.json'),
  read('web/Dockerfile'),
  read('scripts/preflight.ts'),
  read('README.md'),
  read('docs/PRODUCT.md'),
  read('docs/KAI_PLAY_PRODUCT.md'),
  read('mobile/App.tsx'),
]);

function sourceBetween(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(startIndex, -1, `missing start marker ${start}`);
  assert.notEqual(endIndex, -1, `missing end marker ${end}`);
  return source.slice(startIndex, endIndex);
}

test('Minesweeper is part of the browser module graph and every production artifact', () => {
  assert.match(appSource, /from ['"]\.\/minesweeper\.js['"]/);
  assert.match(indexSource, /十五款即开即玩的牌桌、策略、益智与经营玩法/);
  assert.match(indexSource, /扫雷/);
  assert.match(packageSource, /node --check web\/minesweeper\.js/);
  assert.match(dockerSource, /COPY[^\n]*web\/minesweeper\.js[^\n]*\.\//);
  assert.match(preflightSource, /['"]web\/minesweeper\.js['"]/);
  assert.match(preflightSource, /production image must include the standalone Minesweeper engine/);
  assert.match(preflightSource, /load the standalone Minesweeper engine/);
});

test('the fifteen-card lobby opens Minesweeper in the requested catalog position', () => {
  const lobby = sourceBetween(appSource, 'function lobby()', 'function nav(');
  assert.match(lobby, /15 款玩法，即刻开局/);
  assert.match(lobby, /1 款竞技 · 14 款免费畅玩/);
  assert.equal([...lobby.matchAll(/class="game-world\s/g)].length, 15);
  assert.match(lobby, /class="game-world world-minesweeper"/);
  assert.match(lobby, /<h3>KAI 扫雷<\/h3>/);
  assert.match(lobby, /data-action="open-minesweeper"/);
  const orderedCards = [
    'world-ddz', 'world-xiangqi', 'world-gomoku', 'world-reversi', 'world-mahjong', 'world-1048',
    'world-sudoku6', 'world-minesweeper', 'world-sokoban', 'world-sliding', 'world-memory',
    'world-snake', 'world-farm', 'world-three', 'world-reels',
  ];
  for (let index = 1; index < orderedCards.length; index += 1) {
    assert.ok(
      lobby.indexOf(orderedCards[index - 1]) < lobby.indexOf(orderedCards[index]),
      `${orderedCards[index]} must follow ${orderedCards[index - 1]}`,
    );
  }
  assert.match(appSource, /if\(a===['"]open-minesweeper['"]\)/);
  assert.match(appSource, /state\.view===['"]minesweeper['"]\?minesweeperGame\(\)/);
});

test('Minesweeper exposes a keyboard- and screen-reader-operable grid', () => {
  const route = sourceBetween(appSource, 'function minesweeperGame()', 'function historyMatchWon(');
  assert.match(route, /role="grid"/);
  assert.match(route, /aria-rowcount="\$\{game\.rows\}"/);
  assert.match(route, /aria-colcount="\$\{game\.columns\}"/);
  assert.match(appSource, /role="row"/);
  assert.match(appSource, /role="gridcell"/);
  assert.match(appSource, /data-minesweeper-cell/);
  assert.match(route, /aria-live="polite"/);
  assert.match(route, /aria-keyshortcuts="[^"]*ArrowUp[^"]*Enter[^"]*Space[^"]*F[^"]*Escape/);
  assert.match(route, /data-action="minesweeper-mode"/);
  assert.match(appSource, /event\.key === ['"]Enter['"]|\[['"]Enter['"],\s*['"] ['"]\]/);
  assert.match(appSource, /ArrowUp/);
  assert.match(appSource, /ArrowDown/);
  assert.match(appSource, /ArrowLeft/);
  assert.match(appSource, /ArrowRight/);
  assert.match(appSource, /addEventListener\(['"]contextmenu['"]/);
  assert.match(appSource, /\[['"]touch['"],['"]pen['"]\]\.includes\(event\.pointerType\)/);
  assert.match(appSource, /minesweeperLongPress/);
  assert.match(styleSource, /\.minesweeper-cell:focus-visible/);
  assert.match(styleSource, /\.minesweeper-board-scroll/);
  assert.match(styleSource, /\.minesweeper-board\s*\{[\s\S]*?width:\s*max-content/);
  assert.match(styleSource, /\.minesweeper-input-modes button\s*\{[\s\S]*?min-height:\s*4[4-9]px/);
  assert.match(styleSource, /@media \(max-width: 360px\)[\s\S]*?\.minesweeper-/);
  assert.match(styleSource, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.minesweeper-/);
  assert.match(appSource, /cell\.revealed\) actionHint = cell\.adjacentMines > 0[\s\S]*?'，已展开'/);
  assert.doesNotMatch(appSource, /cell\.revealed && cell\.adjacentMines > 0 \? '，可按回车和弦展开'/);
  assert.match(appSource, /game\.columns >= 12/);
  assert.match(styleSource, /\.minesweeper-metrics small[^}]*color:\s*#606d65/);
  assert.match(styleSource, /\.minesweeper-key-hint[^}]*color:\s*#626760/);
  assert.match(styleSource, /\.minesweeper-scroll-hint[^}]*color:\s*#655647/);
});

test('Minesweeper progress is local, defensive, and protects unfinished games', () => {
  const route = sourceBetween(appSource, 'function minesweeperGame()', 'function historyMatchWon(');
  assert.match(appSource, /kai\.play\.minesweeper\.game\.v1/);
  assert.match(appSource, /restoreMinesweeperGame\(JSON\.parse\(raw\)\)/);
  assert.match(appSource, /safeStorageSet\(MINESWEEPER_SAVE_KEY/);
  assert.doesNotMatch(route, /api\(/);
  assert.match(route, /不请求服务端结算/);
  assert.match(route, /不会改变竞技分、Token 或 KAI 卡时/);
  assert.match(appSource, /data-minesweeper-confirm-dialog[^>]*role="dialog"[^>]*aria-modal="true"/);
  assert.match(appSource, /aria-describedby="minesweeper-confirm-description"/);
  assert.match(appSource, /modalOpen \? ['"] inert aria-hidden=/);
  assert.match(appSource, /function trapMinesweeperDialogTab\(/);
  assert.match(appSource, /function focusMinesweeperReturnControl\(/);
  assert.match(appSource, /game\.status===['"]playing['"]|\[['"]ready['"],['"]playing['"]\]/);
  assert.match(appSource, /addEventListener\?\.\(['"]storage['"]/);
  assert.match(route, /多标签冲突保护/);
  assert.doesNotMatch(mobileSource, /open-minesweeper|view\s*[:=]\s*['"]minesweeper['"]/);
  for (const source of [readme, product, productSpec]) {
    assert.match(source, /KAI 扫雷/);
    assert.match(source, /本地/);
  }
  assert.match(product, /新增本地玩法本期只在 Web 交付/);
  assert.match(productSpec, /KAI 象棋、KAI 五子棋、KAI 扫雷、KAI 记忆翻牌与 KAI 贪吃蛇本期只在 Web 交付/);
});

test('Minesweeper clock starts on first reveal and preserves active sub-second time', () => {
  const settleSource = sourceBetween(appSource, 'function settleMinesweeperClock(', 'function updateMinesweeperClock(');
  const commitSource = sourceBetween(appSource, 'function commitMinesweeperGame(', 'function performMinesweeperReveal(');
  const revealSource = sourceBetween(appSource, 'function performMinesweeperReveal(', 'function performMinesweeperFlag(');
  const clockState = {
    view: 'minesweeper',
    casual: {
      kind: 'minesweeper',
      game: { status: 'playing', elapsedSeconds: 4 },
      confirmAction: null,
      minesweeperLastTick: 1_000,
      minesweeperPausedAt: null as number | null,
    },
  };
  const clockApi = runInNewContext(`${settleSource}; ({ settleMinesweeperClock, pauseMinesweeperClock, resumeMinesweeperClock })`, {
    state: clockState,
    Date,
    Number,
    Math,
    safeLocalCounter: (value: number) => Math.max(0, Math.floor(value)),
    formatMinesweeperTime: (value: number) => String(value),
    document: { querySelector: () => null },
  });
  const settleClock = clockApi.settleMinesweeperClock;

  assert.equal(settleClock(1_999), 0);
  assert.equal(clockState.casual.minesweeperLastTick, 1_000, 'a rapid move must not discard the sub-second remainder');
  assert.equal(settleClock(2_100), 1);
  assert.equal(clockState.casual.game.elapsedSeconds, 5);
  assert.equal(clockState.casual.minesweeperLastTick, 2_000, 'only whole settled seconds advance the clock baseline');
  assert.equal(settleClock(2_999), 0);
  assert.equal(clockState.casual.minesweeperLastTick, 2_000);
  assert.equal(settleClock(3_100), 1);
  assert.equal(clockState.casual.game.elapsedSeconds, 6);
  assert.doesNotMatch(commitSource, /minesweeperLastTick\s*=\s*Date\.now\(\)/, 'committing a move must preserve the settled remainder');
  assert.match(revealSource, /wasReady && next !== game && next\.status === ['"]playing['"][^\n]*minesweeperLastTick = Date\.now\(\)/, 'only a successful first reveal starts the clock');

  const readyGame = { status: 'ready', revealedCount: 0 };
  const firstRevealState = {
    view: 'minesweeper',
    casual: { game: readyGame, confirmAction: null, focusedCell: 0, minesweeperLastTick: 1_000 },
  };
  const revealedGame = { status: 'playing', revealedCount: 8 };
  let blocked = false;
  const performReveal = runInNewContext(`${revealSource}; performMinesweeperReveal`, {
    state: firstRevealState,
    Date: { now: () => 5_000 },
    Number,
    Math,
    settleMinesweeperClock: () => 0,
    getMinesweeperCell: () => ({ revealed: false, adjacentMines: 0, flagged: blocked }),
    revealMinesweeperCell: (game: object) => blocked ? game : revealedGame,
    chordMinesweeperCell: () => readyGame,
    commitMinesweeperGame: () => {},
    render: () => {},
    focusMinesweeperInteraction: () => {},
  });
  performReveal(4);
  assert.equal(firstRevealState.casual.minesweeperLastTick, 5_000, 'time spent choosing the first cell must not count');
  firstRevealState.casual.minesweeperLastTick = 6_000;
  blocked = true;
  performReveal(4);
  assert.equal(firstRevealState.casual.minesweeperLastTick, 6_000, 'a blocked ready-state reveal must not start the clock');

  clockState.casual.minesweeperLastTick = 4_000;
  clockState.casual.minesweeperPausedAt = null;
  clockApi.pauseMinesweeperClock(4_500);
  assert.equal(clockState.casual.minesweeperLastTick, 4_000);
  assert.equal(clockState.casual.minesweeperPausedAt, 4_500);
  clockApi.resumeMinesweeperClock(6_000);
  assert.equal(clockState.casual.minesweeperLastTick, 5_500, 'pausing must shift the baseline without discarding the prior 500ms');
  assert.equal(clockState.casual.minesweeperPausedAt, null);
  assert.equal(settleClock(6_499), 0);
  assert.equal(settleClock(6_500), 1, 'active time on both sides of a pause must accumulate');
});

test('Minesweeper storage uses optimistic conflict protection across tabs', () => {
  const saveSource = sourceBetween(appSource, 'function saveMinesweeperGame(', 'function localDateKey(');
  const gameKey = 'game';
  const difficultyKey = 'difficulty';
  const values = new Map<string, string>([[gameKey, 'newer-tab-value']]);
  let writes = 0;
  const saveGame = runInNewContext(`${saveSource}; saveMinesweeperGame`, {
    state: { casual: null },
    MINESWEEPER_SAVE_KEY: gameKey,
    MINESWEEPER_DIFFICULTY_KEY: difficultyKey,
    JSON,
    safeStorageGet: (key: string) => values.get(key) ?? null,
    safeStorageSet: (key: string, value: string) => { writes += 1; values.set(key, value); return true; },
  });
  const casual = {
    kind: 'minesweeper',
    minesweeperPersistedSnapshot: 'older-local-value',
    saveAvailable: true,
    saveConflict: false,
  };
  const game = { difficulty: 'beginner', status: 'playing', flagCount: 1 };

  assert.equal(saveGame(game, casual), false);
  assert.equal(writes, 0, 'a stale tab must not overwrite newer storage');
  assert.equal(casual.saveConflict, true);
  values.set(gameKey, casual.minesweeperPersistedSnapshot);
  assert.equal(saveGame(game, casual), true);
  assert.equal(casual.saveConflict, false);
  assert.equal(casual.minesweeperPersistedSnapshot, JSON.stringify(game));
});

async function unusedPort() {
  const probe = createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const address = probe.address();
  assert.ok(address && typeof address === 'object');
  const port = address.port;
  probe.close();
  await once(probe, 'close');
  return port;
}

async function stop(child: ChildProcess) {
  if (child.exitCode !== null) return;
  await new Promise<void>((resolveStopped) => {
    const timer = setTimeout(resolveStopped, 2_000);
    timer.unref();
    child.once('exit', () => {
      clearTimeout(timer);
      resolveStopped();
    });
    child.kill('SIGTERM');
  });
}

async function ready(child: ChildProcess, stderr: () => string) {
  await new Promise<void>((resolveReady, reject) => {
    const timer = setTimeout(() => reject(new Error(`Web preview start timeout: ${stderr()}`)), 10_000);
    child.stdout?.on('data', (chunk) => {
      if (!String(chunk).includes('DouJoy web preview listening')) return;
      clearTimeout(timer);
      resolveReady();
    });
    child.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`Web preview exited ${code}: ${stderr()}`));
    });
  });
}

test('the production Web server serves Minesweeper with compression and security headers', async () => {
  const port = await unusedPort();
  const child = spawn(process.execPath, [resolve(root, 'web/serve.mjs')], {
    cwd: root,
    env: { ...process.env, DOUJOY_WEB_PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr?.on('data', (chunk) => { stderr += String(chunk); });

  try {
    await ready(child, () => stderr);
    const headers = { 'accept-encoding': 'br' };
    const response = await fetch(`http://127.0.0.1:${port}/minesweeper.js`, { headers });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') ?? '', /^text\/javascript/);
    assert.equal(response.headers.get('content-encoding'), 'br');
    assert.match(response.headers.get('vary') ?? '', /accept-encoding/i);
    assert.match(response.headers.get('content-security-policy') ?? '', /default-src 'self'/);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    const etag = response.headers.get('etag');
    assert.ok(etag);
    assert.match(await response.text(), /export/);

    const cached = await fetch(`http://127.0.0.1:${port}/minesweeper.js`, {
      headers: { ...headers, 'if-none-match': etag },
    });
    assert.equal(cached.status, 304);
    assert.equal(await cached.text(), '');
  } finally {
    await stop(child);
  }
});
