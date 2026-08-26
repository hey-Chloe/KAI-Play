import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

const gameRoot = resolve(import.meta.dirname, '..');
const appSource = await readFile(resolve(gameRoot, 'web/app.js'), 'utf8');
const stylesSource = await readFile(resolve(gameRoot, 'web/styles.css'), 'utf8');

function sourceBetween(start: string, end: string) {
  const startIndex = appSource.indexOf(start);
  const endIndex = appSource.indexOf(end, startIndex + start.length);
  assert.notEqual(startIndex, -1, `Missing source boundary: ${start}`);
  assert.notEqual(endIndex, -1, `Missing source boundary: ${end}`);
  return appSource.slice(startIndex, endIndex);
}

const lobbySource = sourceBetween('function lobby()', 'function nav(');
const mahjongSource = sourceBetween('function mahjongTone(', 'function slotsGame(');
const openMahjongSource = sourceBetween('function openMahjong()', 'function openSlots(');

test('the main gameplay area is a two-stage looping swipe carousel', () => {
  assert.match(lobbySource, /data-hero-carousel/);
  assert.match(lobbySource, /data-hero-stage="ddz"/);
  assert.match(lobbySource, /data-hero-stage="mahjong"/);
  assert.match(lobbySource, /aria-roledescription="carousel"/);
  assert.match(lobbySource, /aria-hidden=/);
  assert.match(lobbySource, /inert/);
  assert.match(appSource, /pointerdown/);
  assert.match(appSource, /pointerup/);
  assert.match(appSource, /Math\.abs\(deltaX\)\s*<\s*42/);
  assert.match(appSource, /switchHero\(nextGame,\s*deltaX\s*<\s*0\s*\?\s*'next'\s*:\s*'previous'\)/);
  assert.match(stylesSource, /\.lobby-game-carousel[\s\S]*touch-action:\s*pan-y/);
  assert.match(stylesSource, /\.lobby-game-stage\.is-leaving-left/);
  assert.match(stylesSource, /prefers-reduced-motion:\s*reduce/);
});

test('the Mahjong CTA opens one player plus three deterministic bot seats', () => {
  assert.match(appSource, /newMahjongGame/);
  assert.match(appSource, /playMahjongDiscard/);
  assert.match(openMahjongSource, /state\.heroGame\s*=\s*'mahjong'/);
  assert.match(openMahjongSource, /kind:\s*'mahjong',\s*game/);
  for (const position of ['north', 'west', 'east', 'south']) {
    assert.match(mahjongSource, new RegExp(`mahjongSeat\\(game,\\d,'${position}'\\)`));
    assert.match(stylesSource, new RegExp(`\\.match-seat--${position}`));
  }
  assert.match(mahjongSource, /mahjongBackRack/);
  assert.match(mahjongSource, /mahjong-river-board/);
  assert.match(mahjongSource, /game\.rivers\[seat\]/);
  assert.match(mahjongSource, /东一局/);
});

test('the Mahjong surface exposes honest interaction, result and scope contracts', () => {
  assert.match(mahjongSource, /点两次手牌/);
  assert.match(mahjongSource, /data-action="mahjong-discard"/);
  assert.match(mahjongSource, /result\.kind === 'tsumo'/);
  assert.match(mahjongSource, /result\.kind === 'ron'/);
  assert.match(mahjongSource, /牌墙已摸完/);
  assert.match(mahjongSource, /常规和牌、七对与国士无双/);
  assert.match(mahjongSource, /吃碰杠、立直、宝牌与完整点数结算将在后续版本加入/);
  assert.match(stylesSource, /\/\* V5: four-player Mahjong match surface\. \*\//);
  assert.match(stylesSource, /@media \(max-width: 760px\)[\s\S]*\.mahjong-match-stage/);
  assert.match(stylesSource, /@media \(max-width: 340px\)[\s\S]*\.mahjong-match-stage/);
});
