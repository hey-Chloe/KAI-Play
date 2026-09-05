import assert from 'node:assert/strict';
import test from 'node:test';
import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { DIRECTIONS, GAMES, coverUrl, filterPreviewGames, renderPreview } from '../web/lobby-preview.js';

test('all three proposals use the same game set and mark their sample balance honestly', () => {
  assert.deepEqual(Object.keys(DIRECTIONS),['a','b','c']);
  for(const theme of ['a','b','c']) {
    const html=renderPreview(theme);
    assert.match(html,new RegExp(`theme-${theme}`));
    for(const game of GAMES)assert.ok(html.includes(`data-game="${game.id}"`));
    assert.match(html,/卡时豆 <small>示例<\/small>/);
    assert.match(html,/30,000/);
    assert.doesNotMatch(html,/人在线|已到账|领取成功/);
  }
  assert.equal(renderPreview('bad'),renderPreview('a'));
  assert.equal(renderPreview('__proto__'),renderPreview('a'));
});

test('search and categories filter the proposal without mutating the catalog', () => {
  assert.equal(filterPreviewGames().length,8);
  assert.deepEqual(filterPreviewGames(' 农场 ').map(game=>game.id),['farm']);
  assert.deepEqual(filterPreviewGames('','puzzle').map(game=>game.id),['sudoku6','minesweeper']);
  assert.equal(filterPreviewGames('农场','table').length,0);
  assert.equal(filterPreviewGames('<script>').length,0);
  assert.equal(GAMES.length,8);
});

test('selected A uses two image-first tiles without changing B and C or game targets', async () => {
  const html=renderPreview('a');
  assert.equal((html.match(/class="mini-feature cover-tile"/g)||[]).length,2);
  assert.match(html,/class="mini-feature cover-tile" data-game="farm"/);
  assert.match(html,/class="mini-feature cover-tile" data-game="mahjong"/);
  assert.equal((html.match(/class="tile-media"/g)||[]).length,2);
  for(const theme of ['b','c'])assert.doesNotMatch(renderPreview(theme),/cover-tile|tile-media/);
  const css=await readFile(resolve('web/lobby-preview.css'),'utf8');
  assert.match(css,/@media\(hover:hover\) and \(pointer:fine\)/);
  assert.match(css,/\.cover-tile:focus-visible \.tile-arrow/);
  assert.match(css,/\.cover-tile:active/);
  const reduced=css.slice(css.lastIndexOf('@media(prefers-reduced-motion:reduce)'));
  assert.match(reduced,/transform:none!important/);
  assert.match(reduced,/\.theme-a \.tile-arrow \{opacity:1\}/);
});

test('every cover is a real existing asset and proposal assets have valid local paths', async () => {
  for(const game of GAMES)await access(resolve('web',coverUrl(game)));
  const html=await readFile(resolve('web/lobby-preview.html'),'utf8');
  for(const asset of ['lobby-preview.css','lobby-preview.js']) {
    assert.ok(html.includes(`./${asset}`));await access(resolve('web',asset));
  }
  assert.match(html,/name="robots" content="noindex,nofollow"/);
  assert.match(html,/aria-label="切换大厅方案"/);
  assert.match(html,/<dialog[^>]*aria-labelledby="dialog-title"/);
  assert.match(html,/不修改正式游戏或账户/);
});

test('proposal styles are isolated and have real layout differences and narrow viewport rules', async () => {
  const css=await readFile(resolve('web/lobby-preview.css'),'utf8');
  const script=await readFile(resolve('web/lobby-preview.js'),'utf8');
  const app=await readFile(resolve('web/index.html'),'utf8');
  assert.match(css,/\.theme-b \.content-layout\{display:grid;grid-template-columns:142px/);
  assert.match(css,/\.theme-c \.feature-main\{min-height:350px/);
  assert.match(css,/@container lobby \(max-width:650px\)/);
  assert.match(css,/\[data-size=mobile\]\{max-width:390px/);
  assert.match(css,/prefers-reduced-motion:reduce/);
  assert.doesNotMatch(app,/lobby-preview/);
  assert.doesNotMatch(script,/\bfetch\s*\(|localStorage|sessionStorage|\/api\/|\.postMessage\(/);
  assert.match(script,/history\.replaceState/);
  assert.match(script,/dialog\.showModal\(\)/);
});
