import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

const appSource = await readFile(resolve(import.meta.dirname, '../web/app.js'), 'utf8');
const styleSource = await readFile(resolve(import.meta.dirname, '../web/styles.css'), 'utf8');
const readme = await readFile(resolve(import.meta.dirname, '../README.md'), 'utf8');
const product = await readFile(resolve(import.meta.dirname, '../docs/PRODUCT.md'), 'utf8');

function sourceBetween(start: string, end: string) {
  const startIndex = appSource.indexOf(start);
  const endIndex = appSource.indexOf(end, startIndex + start.length);
  assert.notEqual(startIndex, -1, `missing start marker ${start}`);
  assert.notEqual(endIndex, -1, `missing end marker ${end}`);
  return appSource.slice(startIndex, endIndex);
}

test('the lobby exposes 1048 as a local game-world entry', () => {
  const catalog = sourceBetween('id="game-selection"', '</section>');
  assert.match(catalog, /section-kicker">全部玩法/);
  assert.match(catalog, /class="game-world world-1048"/);
  assert.match(catalog, /<h3>1048<\/h3>/);
  assert.match(catalog, /data-action="open-1048"/);
  assert.match(catalog, /数字合并 · 单机益智/);
  assert.ok(catalog.indexOf('world-mahjong') < catalog.indexOf('world-1048'), '1048 should follow Mahjong');
  assert.ok(catalog.indexOf('world-1048') < catalog.indexOf('world-sudoku6'), '1048 should precede Sudoku');
  assert.match(readme, /四人基础麻将、1048、6×6 KAI 数独/);
  assert.match(product, /1048 数字合并/);
});

test('the 1048 route renders an accessible four-by-four board and honest product boundary', () => {
  const route = sourceBetween('function merge1048Game()', 'function slotsGame()');
  assert.match(route, /aria-rowcount="4"/);
  assert.match(route, /aria-colcount="4"/);
  assert.match(route, /role="grid"/);
  assert.match(appSource, /role="gridcell"/);
  assert.match(route, /game\.board\.map\(merge1048Tile\)/);
  assert.match(route, /得分/);
  assert.match(route, /最高方块/);
  assert.match(route, /移动/);
  assert.match(route, /512 \+ 512 = 1048/);
  assert.match(route, /免费本地益智训练/);
  assert.match(route, /不会改变卡时豆、Token 或 KAI 卡时/);
  assert.doesNotMatch(route, /api\(/, 'the local training game must not call the server');
  assert.match(appSource, /state\.view==='1048'\?merge1048Game\(\)/);
});

test('1048 buttons, keyboard, and swipe gestures share the same move transition', () => {
  assert.match(appSource, /function perform1048Move\(direction\)/);
  assert.match(appSource, /move1048\(game, direction\)/);
  assert.match(appSource, /data-merge-direction="up"/);
  assert.match(appSource, /if\(a==='1048-move'\)\{perform1048Move\(el\.dataset\.mergeDirection\)/);
  assert.match(appSource, /event\.target\.closest\?\.\('\[data-1048-board\]'\)/);
  assert.match(appSource, /ArrowLeft:'left'/);
  assert.match(appSource, /w:'up'/);
  assert.match(appSource, /distance >= 28/);
  assert.match(appSource, /Math\.abs\(deltaX\) >= Math\.abs\(deltaY\) \* 1\.2/);
  assert.match(appSource, /pointercancel[\s\S]{0,120}merge1048Pointer = null/);
});

test('1048 has restart, continue, and lobby-return paths', () => {
  assert.match(appSource, /data-action="1048-new"/);
  assert.match(appSource, /data-action="1048-continue"/);
  assert.match(appSource, /data-action="casual-home"/);
  assert.match(appSource, /if\(a==='1048-new'\)/);
  assert.match(appSource, /if\(a==='1048-continue'\)/);
  assert.match(appSource, /continued:true/);
  assert.match(appSource, /canMove1048\(game\.board\)\?'playing':'over'/);
});

test('1048 styles preserve four columns, touch controls, focus, narrow screens, and reduced motion', () => {
  assert.match(styleSource, /\.merge-1048-board\s*\{[\s\S]*?grid-template-columns:\s*repeat\(4,/);
  assert.match(styleSource, /touch-action:\s*none/);
  assert.match(styleSource, /\.merge-1048-board:focus-visible/);
  assert.match(styleSource, /\.merge-1048-controls button\s*\{[\s\S]*?min-height:\s*48px/);
  assert.match(styleSource, /@media \(max-width: 340px\)[\s\S]*?\.merge-1048-board/);
  assert.match(styleSource, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.merge-1048-tile/);
});
