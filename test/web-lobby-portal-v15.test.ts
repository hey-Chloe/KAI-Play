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
const discovery = between(appSource, 'const CATALOG_DISCOVERY', 'const TURN_TIMEOUT_MS');
const filterLogic = between(appSource, 'function normalizeCatalogText(', 'function scrollWorldCarousel(');
const v15Styles = stylesSource.slice(stylesSource.indexOf('/* V15:'));

test('V15 exposes a first-class local search with a discoverable keyboard shortcut', () => {
  assert.match(lobby, /type="search"[^>]*data-catalog-search/);
  assert.match(lobby, /placeholder="搜索游戏或玩法，例如：象棋、短局"/);
  assert.match(lobby, /<kbd[^>]*>\/<\/kbd>/);
  assert.match(appSource, /event\.key==='\/'&&!editable/);
  assert.match(appSource, /event\.key==='Escape'&&event\.target===search[\s\S]*clearCatalogSearch/);
  assert.match(appSource, /event\.key==='Enter'&&event\.target===search/);
  assert.match(lobby, /data-action="catalog-show-results"[^>]*hidden/);
  assert.match(filterLogic, /searchJump\.hidden=!query/);
  assert.match(appSource, /function showCatalogResults\(\)[\s\S]*scrollIntoView/);
  assert.match(appSource, /addEventListener\('input'[\s\S]*data-catalog-search[\s\S]*applyCatalogDiscovery/);
});

test('V15 filters cover all useful intents without pretending to measure popularity', () => {
  const filters = [...lobby.matchAll(/data-catalog-filter="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(filters, ['all', 'continue', 'quick', 'card', 'board', 'puzzle', 'arcade', 'save']);
  assert.equal([...lobby.matchAll(/data-catalog-filter="all"[^>]*aria-pressed="true"/g)].length, 1);
  assert.match(filterLogic, /metadata\.categories\.includes\(filter\)/);
  assert.match(filterLogic, /card\.dataset\.worldResumable==='true'/);
  assert.match(filterLogic, /card\.hidden=/);
  assert.match(lobby, /data-catalog-empty[^>]*hidden/);
  assert.doesNotMatch(lobby, /今日热门|猜你喜欢|\d+\s*人在线/);
});

test('V15 discovery metadata covers every shipped game and common Chinese or English aliases', () => {
  for (const id of ['ddz', 'xiangqi', 'gomoku', 'mahjong', '1048', 'sudoku6', 'minesweeper', 'memory', 'snake', 'three', 'reels']) {
    assert.match(discovery, new RegExp(`(?:^|\\n)\\s*(?:'${id}'|${id}):\\s*\\{`));
  }
  for (const alias of ['中国象棋', 'xiangqi', 'chinese chess', 'dou dizhu', 'gomoku', 'five in a row', '2048', 'sudoku', 'minesweeper', 'memory match', 'snake', 'three card poker']) {
    assert.match(discovery.toLowerCase(), new RegExp(alias.toLowerCase()));
  }
  const reelsMetadata = between(discovery, "reels: {", '\n});');
  assert.doesNotMatch(reelsMetadata, /反应/);
  assert.match(lobby, /canContinueSudoku6[\s\S]*savedSudoku6\.notes/);
});

test('filtered carousel paging ignores hidden cards and reports an honest empty state', () => {
  const status = between(appSource, 'function scrollWorldCarousel(', 'function scheduleWorldCarouselStatus(');
  assert.match(status, /\.game-world:not\(\[hidden\]\)/);
  assert.match(status, /status\.textContent='0 \/ 0'/);
  assert.match(filterLogic, /visibleCount!==0/);
  assert.match(filterLogic, /找到 \$\{visibleCount\} 款/);
  assert.match(filterLogic, /cannotPage=visibleCount<=1/);
  assert.match(filterLogic, /world-carousel-hint'[\s\S]*hint\.hidden=cannotPage/);
  assert.match(filterLogic, /world-prev[\s\S]*control\.disabled=cannotPage/);
  assert.match(appSource, /if\(a==='catalog-reset'\)\{resetCatalogDiscovery/);
});

test('V15 keeps the requested one-row slider while exposing about five compact cards on desktop', () => {
  assert.notEqual(stylesSource.indexOf('/* V15:'), -1);
  assert.match(v15Styles, /\.lobby-game-center \.game-world\s*\{[\s\S]*width:calc\(\(100% - 48px\)\/5\)/);
  assert.match(v15Styles, /min-height:316px/);
  assert.match(v15Styles, /\.lobby-game-center \.world-cover\s*\{\s*height:148px/);
  assert.match(v15Styles, /@media \(max-width:560px\)[\s\S]*width:min\(72vw,270px\)/);
  assert.match(v15Styles, /\.catalog-filters button\s*\{[\s\S]*min-height:44px/);
  assert.match(v15Styles, /@media \(max-width:760px\)[\s\S]*\.catalog-filters button\s*\{\s*min-height:44px/);
  assert.match(v15Styles, /@media \(max-width:900px\)[\s\S]*\.hub-discovery\s*\{\s*grid-template-columns:1fr[\s\S]*\.hub-side\s*\{\s*display:grid/);
});

test('V15 compresses the showcase so discovery enters the first viewport sooner', () => {
  assert.match(v15Styles, /\.lobby-game-center \.lobby-game-carousel,[\s\S]*height:342px;min-height:342px/);
  assert.match(v15Styles, /\.game-center-intro\s*\{[\s\S]*padding:18px 22px 14px/);
  assert.match(v15Styles, /\.catalog-search:focus-within/);
  assert.match(v15Styles, /@media \(prefers-reduced-motion:reduce\)[\s\S]*\.catalog-filters button/);
});
