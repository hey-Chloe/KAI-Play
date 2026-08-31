import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import test from 'node:test';

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

test('Xiangqi is part of the browser module graph and every production artifact', () => {
  assert.match(appSource, /from ['"]\.\/xiangqi\.js['"]/);
  assert.match(indexSource, /十五款即开即玩的牌桌、策略、益智与经营玩法/);
  assert.match(indexSource, /支持本地训练进度恢复/);
  assert.match(packageSource, /node --check web\/xiangqi\.js/);
  assert.match(dockerSource, /COPY[^\n]*web\/xiangqi\.js[^\n]*\.\//);
  assert.match(preflightSource, /['"]web\/xiangqi\.js['"]/);
  assert.match(preflightSource, /production image must include the standalone Xiangqi engine/);
});

test('the fifteen-card lobby opens the local Xiangqi route', () => {
  const lobby = sourceBetween(appSource, 'function lobby()', 'function nav(');
  assert.match(lobby, /15 款玩法，即刻开局/);
  assert.match(lobby, /1 款竞技 · 14 款免费畅玩/);
  assert.equal([...lobby.matchAll(/class="game-world\s/g)].length, 15);
  assert.match(lobby, /class="game-world world-xiangqi"/);
  assert.match(lobby, /data-action="open-xiangqi"/);
  assert.match(appSource, /if\(a===['"]open-xiangqi['"]\)/);
  assert.match(appSource, /state\.view===['"]xiangqi['"]\?xiangqiGame\(\)/);
  assert.doesNotMatch(appSource, /KAI 象棋正在设计中/);
});

test('Xiangqi exposes a keyboard- and screen-reader-operable 10 by 9 board', () => {
  assert.match(appSource, /class="[^"]*xiangqi-board[^"]*"[^>]*role="grid"/);
  assert.match(appSource, /aria-rowcount="10"/);
  assert.match(appSource, /aria-colcount="9"/);
  assert.match(appSource, /role="row"/);
  assert.match(appSource, /role="gridcell"/);
  assert.match(appSource, /data-xiangqi-cell/);
  assert.match(appSource, /aria-live="polite"/);
  assert.match(appSource, /aria-busy=/);
  assert.match(appSource, /ArrowUp/);
  assert.match(appSource, /ArrowDown/);
  assert.match(appSource, /ArrowLeft/);
  assert.match(appSource, /ArrowRight/);
  assert.match(appSource, /Enter/);
  assert.match(appSource, /Escape/);
  assert.match(styleSource, /\.xiangqi-(?:cell|piece):focus-visible/);
  assert.match(appSource, /['"]is-capture['"]\s*:\s*['"]is-legal['"]/);
  assert.match(styleSource, /\.xiangqi-target-mark/);
  assert.match(styleSource, /\.xiangqi-cell\.is-capture/);
  assert.match(styleSource, /\.xiangqi-(?:cell|piece)\.is-check/);
  assert.match(styleSource, /@media \(max-width: 360px\)[\s\S]*?\.xiangqi-/);
  assert.match(styleSource, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.xiangqi-/);
});

test('Xiangqi dialogs isolate the board and restore keyboard focus safely', () => {
  assert.match(appSource, /modalOpen \? ['"] inert aria-hidden=/);
  assert.match(appSource, /function trapXiangqiDialogTab\(/);
  assert.match(appSource, /function focusXiangqiReturnControl\(/);
  assert.match(appSource, /casual\?\.confirmAction \|\| casual\?\.showRules/);
  assert.match(appSource, /aria-describedby="xiangqi-confirm-description"/);
  assert.match(appSource, /aria-describedby="xiangqi-rules-summary"/);
  assert.doesNotMatch(sourceBetween(appSource, 'function xiangqiResult(', 'function xiangqiConfirmDialog('), /role="dialog"/);
});

test('Xiangqi progress remains local and the mobile client does not advertise an unavailable route', () => {
  assert.match(appSource, /kai\.play\.xiangqi\.game\.v1/);
  assert.match(appSource, /kai\.play\.xiangqi\.tutorial\.v1/);
  const route = sourceBetween(appSource, 'function xiangqiGame()', 'function merge1048Tile(');
  assert.doesNotMatch(route, /api\(/);
  assert.match(route, /不会?改变竞技分、Token 或 KAI 卡时/);
  assert.doesNotMatch(mobileSource, /open-xiangqi|view\s*[:=]\s*['"]xiangqi['"]/);
  for (const source of [readme, product, productSpec]) {
    assert.match(source, /KAI 象棋/);
    assert.match(source, /本地/);
  }
  assert.match(product, /新增本地玩法本期只在 Web 交付/);
  assert.match(productSpec, /KAI 象棋、KAI 五子棋、KAI 扫雷、KAI 记忆翻牌与 KAI 贪吃蛇本期只在 Web 交付/);
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

test('the production Web server serves Xiangqi with compression and security headers', async () => {
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

    const response = await fetch(`http://127.0.0.1:${port}/xiangqi.js`, {
      headers: { 'accept-encoding': 'br' },
    });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') ?? '', /^text\/javascript/);
    assert.equal(response.headers.get('content-encoding'), 'br');
    assert.match(response.headers.get('vary') ?? '', /accept-encoding/i);
    assert.match(response.headers.get('content-security-policy') ?? '', /default-src 'self'/);
    assert.ok(response.headers.get('etag'));
    assert.match(await response.text(), /export/);
  } finally {
    await stop(child);
  }
});
