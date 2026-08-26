import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

const gameRoot = resolve(import.meta.dirname, '..');
const appSource = await readFile(resolve(gameRoot, 'web/app.js'), 'utf8');
const stylesSource = await readFile(resolve(gameRoot, 'web/styles.css'), 'utf8');
const v4Styles = stylesSource.slice(stylesSource.indexOf('/* Lobby Hero V4'));

function sourceBetween(start: string, end: string) {
  const startIndex = appSource.indexOf(start);
  const endIndex = appSource.indexOf(end, startIndex + start.length);
  assert.notEqual(startIndex, -1, `Missing source boundary: ${start}`);
  assert.notEqual(endIndex, -1, `Missing source boundary: ${end}`);
  return appSource.slice(startIndex, endIndex);
}

const headerSource = sourceBetween('function header(', 'function competitiveScore(');
const lobbySource = sourceBetween('function lobby()', 'function nav(');
const tableSource = sourceBetween('function tableFrame(', 'function turnRemaining(');

test('the Lobby opens with a compact, local KAI PLAY wordmark and no marketing intro', () => {
  assert.match(headerSource, /data-wordmark/);
  assert.match(headerSource, /aria-label="返回 KAI PLAY 大厅"/);
  assert.match(headerSource, /<b>KAI<\/b><em>PLAY<\/em>/);
  assert.match(lobbySource, /header\('lobby'\)/);
  assert.doesNotMatch(lobbySource, /lobby-intro|现在开一局|点击后创建牌局，两位智能牌友/);
  assert.doesNotMatch(stylesSource, /@font-face|@import\s+url|url\(["']?https?:/i);
});

test('the Lobby canvas uses the warm ivory environment tokens', () => {
  for (const token of ['--lobby-warm-ivory', '--lobby-ivory-light', '--lobby-ivory-shadow']) {
    assert.match(v4Styles, new RegExp(token));
  }
  assert.match(v4Styles, /body:has\(\.lobby-v4\)[\s\S]*var\(--lobby-warm-ivory\)/);
  assert.match(v4Styles, /\.lobby-hero-v4[\s\S]*background:[\s\S]*radial-gradient/);
});

test('the table exposes five ordered material layers rather than one flat SVG', () => {
  const layers = [...tableSource.matchAll(/data-table-layer="([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(layers, ['shadow', 'base', 'rail', 'inlay', 'felt']);
  assert.doesNotMatch(tableSource, /<svg|preserveAspectRatio/);
  for (const layer of layers) assert.match(v4Styles, new RegExp(`\\.table-layer-${layer}`));
  assert.match(v4Styles, /kai-felt-v4\.avif/);
  assert.match(v4Styles, /kai-leather-v4\.avif/);
  assert.match(v4Styles, /kai-table-rail-mask\.svg/);
});

test('generated material assets and local masks are present and non-placeholder', async () => {
  for (const [file, minimumBytes] of [
    ['kai-felt-v4.avif', 20_000],
    ['kai-leather-v4.avif', 20_000],
    ['kai-table-outer-mask.svg', 200],
    ['kai-table-rail-mask.svg', 200],
    ['kai-table-felt-mask.svg', 200],
    ['kai-table-mobile-outer-mask.svg', 180],
    ['kai-table-mobile-rail-mask.svg', 180],
    ['kai-table-mobile-felt-mask.svg', 180],
  ] as const) {
    const filePath = resolve(gameRoot, 'web/assets', file);
    assert.ok((await stat(filePath)).size >= minimumBytes, `${file} is missing or too small`);
  }
});

test('the Hero keeps a branded five-card fan at 1.2 to 1.3 times the V3 scale', () => {
  assert.match(v4Styles, /--hero-card-scale:\s*1\.25/);
  assert.equal((lobbySource.match(/previewPoker\(/g) || []).length >= 4, true);
  assert.match(lobbySource, /cardBack\(true,'live-card-back'\)/);
  assert.match(v4Styles, /width:\s*98px;\s*\n\s*height:\s*145px/);
  assert.match(v4Styles, /width:\s*80px;\s*height:\s*120px/);
  assert.match(v4Styles, /width:\s*70px;\s*height:\s*105px/);
  assert.match(v4Styles, /rotate\(-16deg\)/);
  assert.match(v4Styles, /rotate\(16deg\)/);
});

test('the Hero actions remain real while unavailable daily puzzles stay disabled', () => {
  for (const action of ['quick', 'open-mahjong', 'create-room', 'join-room']) {
    assert.match(lobbySource, new RegExp(`data-action=["']${action}["']`));
    assert.match(appSource, new RegExp(`a\\s*===\\s*["']${action}["']`));
  }
  assert.match(appSource, /\/v1\/games\/quick/);
  assert.match(appSource, /\/v1\/rooms(?:\/join)?/);
  assert.match(lobbySource, /每日残局/);
  assert.match(lobbySource, /<button class="btn" disabled>筹备中<\/button>/);
  assert.doesNotMatch(lobbySource, /在线牌桌|好友正在玩|\d+\s*人在线|已入桌|正在进行/);
});

test('the Hero does not import casino wagering interactions', () => {
  const heroSource = lobbySource.slice(lobbySource.indexOf('<section class="live-table'), lobbySource.indexOf('</section>', lobbySource.indexOf('<section class="live-table')) + 10);
  assert.doesNotMatch(heroSource, /筹码|下注|跟注|加注|梭哈|买入|提现|奖池|赔率|返奖/);
});

test('narrow-screen and reduced-motion contracts preserve the table and controls', () => {
  assert.match(v4Styles, /@media \(max-width: 560px\)[\s\S]*\.lobby-hero-v4[\s\S]*\.table-frame-preview/);
  assert.match(v4Styles, /@media \(max-width: 340px\)[\s\S]*\.lobby-hero-v4/);
  assert.match(v4Styles, /\.lobby-hero-v4 \.live-join-bar \.btn[\s\S]*min-height:\s*50px/);
  assert.match(v4Styles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.table-layer/);
  assert.match(v4Styles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.lobby-card-scene > \*/);
  assert.match(v4Styles, /animation:\s*none\s*!important/);
  assert.match(v4Styles, /transition:\s*none\s*!important/);
});
