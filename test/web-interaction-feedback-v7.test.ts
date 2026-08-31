import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const appSource = readFileSync(new URL('../web/app.js', import.meta.url), 'utf8');
const stylesSource = readFileSync(new URL('../web/styles.css', import.meta.url), 'utf8');
const indexSource = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');

test('the main game carousel remembers its mode and supports keyboard discovery', () => {
  assert.match(appSource, /HERO_GAME_KEY\s*=\s*['"]kai\.play\.hero-game['"]/);
  assert.match(appSource, /safeStorageSet\(HERO_GAME_KEY,\s*normalized\)/);
  assert.match(appSource, /data-hero-carousel[^>]+tabindex="0"/);
  assert.match(appSource, /aria-keyshortcuts="ArrowLeft ArrowRight"/);
  assert.match(appSource, /app\.addEventListener\(['"]keydown['"]/);
  assert.match(appSource, /\['ArrowLeft','ArrowRight'\]\.includes\(event\.key\)/);
  assert.match(appSource, /↔ 滑动/);
});

test('Dou Dizhu selection exposes count, reset and pressed state', () => {
  assert.match(appSource, /aria-pressed="\$\{selected\?'true':'false'\}"/);
  assert.match(appSource, /data-action="clear-selection"/);
  assert.match(appSource, /出牌 · \$\{selectionCount\} 张/);
  assert.match(appSource, /已选 \$\{selectionCount\} 张/);
  assert.match(appSource, /a===['"]clear-selection['"]\)\{state\.selected\.clear\(\)/);
  assert.match(stylesSource, /\.ddz-table \.table-action\.selection-reset/);
});

test('Mahjong uses explicit discard confirmation and paced bot turns', () => {
  assert.match(appSource, /advanceMahjongBotTurn/);
  assert.match(appSource, /playMahjongDiscard\(game,tileId,\{advanceBots:false\}\)/);
  assert.match(appSource, /queueMahjongBotTurn\(\)/);
  assert.match(appSource, /selectedTileId:\s*null/);
  assert.match(appSource, /state\.casual\.selectedTileId===el\.dataset\.mahjongTile\?null/);
  assert.match(appSource, /打出 \$\{selectedTile\.label\}/);
  assert.match(appSource, /data-action="mahjong-confirm"/);
  assert.match(appSource, /data-action="mahjong-cancel-confirm"/);
  assert.match(appSource, /river-face \$\{tile\.id===latestTileId\?'is-latest':''\}/);
  assert.match(stylesSource, /\.mahjong-face\.river-face\.is-latest/);
});

test('short phones preserve both lobby CTAs below the compact top navigation', () => {
  assert.match(stylesSource, /V20: primary navigation belongs to the sticky top chrome/);
  assert.match(stylesSource, /@media \(max-width:420px\)[\s\S]*\.topbar\.has-primary-nav > \.nav\s*\{[\s\S]*grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
  assert.match(stylesSource, /\.topbar\.has-primary-nav > \.nav \.btn\s*\{[\s\S]*min-height:44px/);
  assert.match(stylesSource, /\.lobby-game-center \.lobby-hero-v4 \.live-join-bar \.btn,[\s\S]*\.lobby-game-center \.mahjong-hero-action \.btn[\s\S]*min-height:\s*50px/);
  assert.match(stylesSource, /@media \(max-width:\s*560px\)[\s\S]*\.lobby-game-center \.lobby-hero-v4 \.live-join-bar \.btn,[\s\S]*min-height:\s*44px/);
});

test('live announcements are scoped to changing game status', () => {
  assert.doesNotMatch(indexSource, /id="app"[^>]+aria-live/);
  assert.match(appSource, /mahjong-turn-banner" role="status" aria-live="polite"/);
  assert.match(appSource, /mahjong-result-panel[^>]+role="status" aria-live="polite"/);
});
