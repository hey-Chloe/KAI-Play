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
const resultAndGameSource = sourceBetween('function matchResult(', 'function casualHeader(');
const historySource = sourceBetween('function history()', 'function rules()');

test('live lobby keeps one-click quick play and a dedicated friend-room route wired', () => {
  for (const action of ['quick', 'view-friends']) {
    assert.match(lobbySource, new RegExp(`data-action=["']${action}["']`), `Lobby action is missing: ${action}`);
    assert.match(appSource, new RegExp(`a\\s*===\\s*["']${action}["']`), `Lobby handler is missing: ${action}`);
  }
  for (const roomAction of ['create-room', 'join-room']) {
    assert.match(appSource, new RegExp(`data-action=["']${roomAction}["']`), `Friend-room action is missing: ${roomAction}`);
    assert.match(appSource, new RegExp(`a\\s*===\\s*["']${roomAction}["']`), `Friend-room handler is missing: ${roomAction}`);
    assert.doesNotMatch(lobbySource, new RegExp(`data-action=["']${roomAction}["']`));
  }
  assert.match(appSource, /\/v1\/games\/quick/, 'Quick play must remain connected to the authoritative game API');
  assert.match(appSource, /\/v1\/rooms(?:\/join)?/, 'Friend rooms must remain connected to the room API');
});

test('CloudPay and compute-service promotion stay out of the lobby path', () => {
  assert.doesNotMatch(lobbySource, /\$\{\s*computeServices\(\)\s*\}/, 'Compute services must not be rendered by the lobby');
  assert.doesNotMatch(lobbySource, /CloudPay|KAI\s*卡时/, 'Payment or compute-credit promotion must not appear in the lobby');
});

test('finished match exposes authentic score change, rematch, and lobby return', () => {
  assert.match(resultAndGameSource, /settlement\?*\.deltas/, 'Result score change must come from the server settlement');
  assert.match(resultAndGameSource, /data-action=["']rematch["']/, 'Finished result must offer a rematch');
  assert.match(resultAndGameSource, /data-action=["']finish["']/, 'Finished result must offer a return to the lobby');
  assert.match(appSource, /a\s*===\s*["']rematch["'][\s\S]{0,180}startQuickGame/, 'Rematch must start a real quick game');
});

test('record surfaces use API-backed state and do not invent social or ranking KPIs', () => {
  assert.match(historySource, /state\.history/, 'Record view must read the history API state');
  assert.match(historySource, /\.games/, 'Record view must derive entries or aggregates from completed games');
  assert.match(historySource, /state\.profile|competitiveScore\(/, 'Record score must come from the current profile');

  for (const fabricatedKpi of [
    /\d[\d,]*\s*人在线/,
    /好友正在玩\s*\d/,
    /在线牌桌\s*\d/,
    /全国\s*TOP\s*\d/i,
    /已有\s*\d+\s*%\s*玩家/,
  ]) {
    assert.doesNotMatch(appSource, fabricatedKpi, `Static social or ranking KPI is forbidden: ${fabricatedKpi}`);
  }
});

test('motion and layout retain accessible fallbacks', () => {
  const reducedMotion = stylesSource.match(/@media\s*\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)\s*\{[\s\S]*?\n\}/)?.[0] ?? '';
  assert.ok(reducedMotion, 'A prefers-reduced-motion stylesheet branch is required');
  assert.match(reducedMotion, /animation\s*:\s*none\s*!important/, 'Reduced motion must disable animation');
  assert.match(reducedMotion, /transition\s*:\s*none\s*!important/, 'Reduced motion must disable transitions');

  const mobileBreakpoints = [...stylesSource.matchAll(/@media\s*\([^)]*max-width\s*:\s*(\d+)px[^)]*\)/g)]
    .map((match) => Number(match[1]));
  assert.ok(mobileBreakpoints.some((width) => width <= 640), 'A mobile breakpoint at 640px or narrower is required');
});
