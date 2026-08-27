import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

const gameRoot = resolve(import.meta.dirname, '..');
const appSource = await readFile(resolve(gameRoot, 'web/app.js'), 'utf8');
const stylesSource = await readFile(resolve(gameRoot, 'web/styles.css'), 'utf8');
const v3Styles = stylesSource.slice(stylesSource.indexOf('/* Card + Table V3'));
const cardBackSvg = await readFile(resolve(gameRoot, 'web/assets/kai-card-back.svg'), 'utf8');
const cardPaperSvg = await readFile(resolve(gameRoot, 'web/assets/card-paper.svg'), 'utf8');

function sourceBetween(start: string, end: string) {
  const startIndex = appSource.indexOf(start);
  const endIndex = appSource.indexOf(end, startIndex + start.length);
  assert.notEqual(startIndex, -1, `Missing source boundary: ${start}`);
  assert.notEqual(endIndex, -1, `Missing source boundary: ${end}`);
  return appSource.slice(startIndex, endIndex);
}

const lobbySource = sourceBetween('function lobby()', 'function nav(');
const gameSource = sourceBetween('function game()', 'function casualHeader(');
const cardSource = sourceBetween('function poker(', 'function turnRemaining(');
const resultSource = sourceBetween('function matchResult(', 'function game()');

test('one KAI card-back asset is reused across lobby, opponents and the deal sequence', () => {
  assert.match(cardBackSvg, /<pattern\b/);
  assert.match(cardBackSvg, />KAI PLAY</);
  assert.match(stylesSource, /\.kai-card-back\s*\{[\s\S]*kai-card-back\.svg/);
  assert.match(lobbySource, /cardBack\(true/);
  assert.match(gameSource, /cardBackStack\(\)/);
  assert.match(appSource, /deal-card kai-card-back/);
});

test('card faces use the V3 paper, ink, coral and edge tokens', () => {
  for (const token of ['--card-warm-white', '--card-paper-light', '--card-graphite', '--card-coral']) {
    assert.match(stylesSource, new RegExp(token));
  }
  assert.match(stylesSource, /\.poker\.poker-face[\s\S]*card-paper\.svg/);
  assert.match(cardPaperSvg, /feTurbulence/);
  assert.match(cardSource, /card-index/);
  assert.match(cardSource, /card-signature/);
  assert.match(cardSource, /role="img" aria-label/);
  assert.match(cardSource, /aria-hidden="true"/);
});

test('the lobby preview is honest and does not invent presence', () => {
  assert.match(lobbySource, /智能牌友补位/);
  assert.match(lobbySource, /牌桌预览/);
  assert.match(lobbySource, /服务端统一判定/);
  assert.doesNotMatch(lobbySource, /已就位|阿曜|阿禾|在线牌桌|好友正在玩|\d+\s*人在线/);
});

test('the live table is a three-seat surface bound to authoritative game state', () => {
  for (const stateField of ['g.players', 'g.currentSeat', 'g.leadCards', 'g.bottomCards', 'g.hand', 'g.recentEvents']) {
    assert.match(gameSource + appSource, new RegExp(stateField.replace('.', '\\.')));
  }
  assert.match(gameSource, /data-seat=/);
  assert.match(gameSource, /data-role=/);
  assert.match(gameSource, /opponent-left/);
  assert.match(gameSource, /opponent-right/);
  assert.match(gameSource, /viewer-pod/);
  assert.match(gameSource, /highestBid/);
});

test('lobby, live game and result are visibly separate route surfaces', () => {
  assert.match(lobbySource, /live-table-preview/);
  assert.match(gameSource, /route-game/);
  assert.match(resultSource, /match-result/);
  assert.match(stylesSource, /body:has\(\.route-game\)/);
  assert.match(stylesSource, /\.match-result/);
});

test('the active card and result surfaces avoid gambling chip and cash interactions', () => {
  for (const source of [gameSource, resultSource]) {
    assert.doesNotMatch(source, /筹码|下注|买入|提现|bet\b|wager\b|buy[- ]?in/i);
  }
  assert.match(lobbySource, /免费娱乐 · 无现金下注 · 无提现/);
});

test('compact layouts preserve the timer and hand while reduced motion remains supported', () => {
  const compactStart = v3Styles.indexOf('@media (max-width: 340px) {');
  const compactEnd = v3Styles.indexOf('@media (max-width: 340px) and', compactStart);
  const compact = v3Styles.slice(compactStart, compactEnd);
  assert.match(compact, /\.turn-feedback\s*\{[\s\S]*display:\s*flex/);
  assert.match(compact, /\.hand-dock \.poker\s*\{[\s\S]*width:\s*36px/);
  assert.match(compact, /min-height:\s*44px/);
  assert.doesNotMatch(v3Styles, /\.turn-feedback\s*\{\s*display:\s*none/);

  assert.match(v3Styles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.poker\.poker-face/);
  assert.match(v3Styles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.kai-card-back/);
  assert.match(v3Styles, /animation:\s*none\s*!important/);
  assert.match(v3Styles, /transition:\s*none\s*!important/);
});
