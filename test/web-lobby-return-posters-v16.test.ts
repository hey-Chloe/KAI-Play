import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');
const appSource = await readFile(resolve(root, 'web/app.js'), 'utf8');
const stylesSource = await readFile(resolve(root, 'web/styles.css'), 'utf8');

function between(source: string, start: string, end: string) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.notEqual(from, -1, `missing ${start}`);
  assert.notEqual(to, -1, `missing ${end}`);
  return source.slice(from, to);
}

const lobby = between(appSource, 'function lobby()', 'function nav(');
const discoveryLogic = between(appSource, 'function normalizeCatalogText(', 'function scrollWorldCarousel(');
const v16Styles = stylesSource.slice(stylesSource.indexOf('/* V16:'));

test('V16 exposes returning-player priority only for real resumable candidates', () => {
  assert.match(lobby, /const hasResumableGames = resumeCandidates\.length > 0/);
  assert.match(lobby, /hub-discovery\$\{hasResumableGames\?' has-resume':''\}/);
  assert.match(lobby, /hasResumableGames\?`<button[^>]*data-action="show-continuable"/);
  assert.match(lobby, /\$\{resumeCandidates\.length\} 款可继续/);
  assert.match(lobby, /:'<span class="hub-side-count">25 款可玩<\/span>'/);
});

test('view-all continuation reuses the honest catalog filter and existing result navigation', () => {
  const handler = between(appSource, 'function showContinuableGames()', 'function scrollWorldCarousel(');
  assert.match(handler, /input\.value=''/);
  assert.match(handler, /selectCatalogFilter\('continue'\)/);
  assert.match(handler, /applyCatalogDiscovery\(\)/);
  assert.match(handler, /showCatalogResults\(\)/);
  assert.match(handler, /data-catalog-filter="continue"[\s\S]*focus\(\{preventScroll:true\}\)/);
  assert.match(appSource, /if\(a==='show-continuable'\)\{showContinuableGames\(\);return;\}/);
  assert.match(discoveryLogic, /filter==='continue' && card\.dataset\.worldResumable==='true'/);
});

test('quick entries broaden the first viewport without duplicating featured tables', () => {
  const quickRail = between(lobby, '<nav class="lobby-mode-rail"', '</nav>');
  const actions = [...quickRail.matchAll(/data-action="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(actions, ['open-1048', 'open-gomoku', 'open-memory', 'open-snake']);
  assert.doesNotMatch(quickRail, /hero-select|open-mahjong|data-action="quick"/);
});

test('V16 poster covers grow more cinematic without reducing card density or touch targets', () => {
  assert.notEqual(stylesSource.indexOf('/* V16:'), -1);
  assert.match(v16Styles, /\.lobby-game-center \.world-cover\s*\{[\s\S]*height:172px;[\s\S]*flex-basis:172px/);
  assert.match(v16Styles, /--cover-art-scale/);
  assert.match(v16Styles, /\.world-copy > span\s*\{\s*font-size:\.6875rem/);
  assert.match(v16Styles, /\.world-copy p\s*\{[\s\S]*-webkit-line-clamp:1/);
  assert.match(v16Styles, /button\.hub-side-count\s*\{[\s\S]*min-height:44px/);
});

test('V16 promotes real continuation on narrow screens and remains motion safe', () => {
  assert.match(lobby, /\$\{hasResumableGames\?hubSide:''\}[\s\S]*lobby-game-carousel[\s\S]*\$\{hasResumableGames\?'':hubSide\}/);
  assert.match(v16Styles, /@media \(min-width:901px\)[\s\S]*\.hub-discovery\.has-resume\s*\{\s*grid-template-columns:minmax\(286px,\.7fr\) minmax\(0,1\.9fr\)[\s\S]*\.hub-side\s*\{\s*grid-column:1;grid-row:1[\s\S]*\.lobby-game-carousel\s*\{\s*grid-column:2;grid-row:1/);
  assert.match(v16Styles, /@media \(max-width:560px\)[\s\S]*\.hub-discovery\.has-resume \.hub-side-head[\s\S]*display:flex/);
  assert.match(v16Styles, /@media \(max-width:560px\)[\s\S]*height:154px;flex-basis:154px/);
  assert.match(v16Styles, /@media \(max-width:340px\)[\s\S]*height:148px;flex-basis:148px/);
  assert.match(v16Styles, /@media \(hover:hover\) and \(pointer:fine\)/);
  assert.match(v16Styles, /@media \(prefers-reduced-motion:reduce\)[\s\S]*scale:var\(--cover-art-scale\)/);
});
