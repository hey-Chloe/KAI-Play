import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

const appSource = await readFile(resolve(import.meta.dirname, '../web/app.js'), 'utf8');

function sourceBetween(start: string, end: string) {
  const startIndex = appSource.indexOf(start);
  const endIndex = appSource.indexOf(end, startIndex + start.length);
  assert.notEqual(startIndex, -1, `missing start marker ${start}`);
  assert.notEqual(endIndex, -1, `missing end marker ${end}`);
  return appSource.slice(startIndex, endIndex);
}

test('every statically rendered button action has a reachable click handler', () => {
  const declared = new Set([...appSource.matchAll(/data-action="([^"]+)"/g)].map((match) => match[1]!));
  const handled = new Set([...appSource.matchAll(/if\s*\(a===['"]([^'"]+)['"]/g)].map((match) => match[1]!));
  const missing = [...declared].filter((action) => !handled.has(action));

  assert.ok(declared.size >= 30, `expected the full interaction surface, found only ${declared.size} actions`);
  assert.deepEqual(missing, []);
  assert.match(appSource, /if\(el\.dataset\.view\)/, 'navigation buttons need the generic data-view handler');
  assert.match(appSource, /if\(el\.dataset\.bid!==undefined\)/, 'bid buttons need the generic data-bid handler');
});

test('authoritative game mutations are busy-guarded and carry unique request ids', () => {
  const actSource = sourceBetween('async function act(fn)', "app.addEventListener('click'");
  assert.match(actSource, /if\(state\.busy\)return/);
  assert.match(actSource, /state\.busy=true;render\(\);try/, 'busy feedback must render before awaiting the network');
  assert.match(actSource, /finally\{state\.busy=false;render\(\);\}/);

  for (const [action, next] of [['pass', 'play'], ['play', 'rematch']] as const) {
    const mutation = sourceBetween(`if(a==='${action}')`, `if(a==='${next}')`);
    assert.match(mutation, /const current=state\.game/);
    assert.match(mutation, /expectedSequence:current\.sequence/);
    assert.match(mutation, /headers:\{'x-request-id':requestId\(\)\}/);
    assert.match(mutation, /acceptGame\(r\.game,r\.profile\)/);
  }
  assert.match(appSource, /if\(el\.dataset\.bid!==undefined\)[\s\S]{0,360}?'x-request-id':requestId\(\)/);
});

test('game responses are monotonic and request timeouts cover response-body parsing', () => {
  const acceptSource = sourceBetween('function acceptGame(', 'async function bootstrap()');
  assert.match(acceptSource, /current\.id !== nextGame\.id/);
  assert.match(acceptSource, /Number\(nextGame\.sequence\) < Number\(current\.sequence\)/);

  const apiSource = sourceBetween('async function api(', 'function acceptGame(');
  assert.match(apiSource, /const controller = new AbortController\(\)/);
  assert.match(apiSource, /path\.includes\('\/wait\?'\) \? 30_000 : 12_000/);
  assert.match(apiSource, /externalSignal\?\.addEventListener\('abort', forwardAbort/);
  assert.ok(apiSource.indexOf('body = await res.json()') < apiSource.indexOf('clearTimeout(timeout)'), 'timeout must remain active while the body is read');
  assert.match(apiSource, /externalSignal\?\.removeEventListener\('abort', forwardAbort\)/);
});

test('leaving synchronized views aborts their long polls and retry paths keep state recoverable', () => {
  const navigation = sourceBetween('if(el.dataset.view)', 'if(el.dataset.bid!==undefined)');
  assert.match(navigation, /if\(state\.view!=='game'\) stopGameSync\(\)/);
  assert.match(navigation, /if\(state\.view!=='room'\) stopRoomSync\(\)/);

  const roomLeave = sourceBetween("if(a==='leave-room')", "if(a==='pass')");
  assert.match(roomLeave, /stopRoomSync\(\)/);
  assert.match(roomLeave, /catch\(error\)\{startRoomSync\(\);throw error;\}/);

  const historyLoad = sourceBetween('async function loadHistoryData()', 'function stopGameSync()');
  assert.match(historyLoad, /state\.historyStatus='loading'/);
  assert.match(historyLoad, /state\.historyStatus='ready'/);
  assert.match(historyLoad, /state\.historyStatus='error'/);
  assert.match(appSource, /if\(a==='retry-history'\) act\(loadHistoryData\)/);
});

test('web bootstrap deletes a stored session only for an explicit unauthorized response', () => {
  const apiSource = sourceBetween('async function api(', 'async function bootstrap()');
  assert.match(apiSource, /error\.status\s*=\s*res\.status/);

  const bootstrapSource = sourceBetween('async function bootstrap()', 'function header(');
  const tokenValidation = sourceBetween("if (state.token)", "if (!state.token)");
  assert.match(tokenValidation, /catch\s*\(error\)/);
  assert.match(tokenValidation, /error\.status\s*===?\s*401|error\.status\s*!==?\s*401/);
  assert.match(tokenValidation, /throw error/, 'network and 5xx failures must reach the outer error state');
  assert.match(tokenValidation, /localStorage\.removeItem\(TOKEN_KEY\)/);
  assert.match(tokenValidation, /localStorage\.removeItem\(LEGACY_TOKEN_KEY\)/);
  assert.match(bootstrapSource, /catch\s*\([A-Za-z_$][\w$]*\)\s*\{\s*state\.error\s*=/, 'non-auth failures need a visible outer error state');
});

test('three-card and slot timers cannot update a replaced casual-game instance', () => {
  assert.match(appSource, /let threeRevealTimer\s*=\s*null/);
  assert.match(appSource, /let slotSpinTimer\s*=\s*null/);
  const timerCleanup = sourceBetween('function stopCasualTimers()', 'function queueMahjongBotTurn()');
  assert.match(timerCleanup, /clearTimeout\(threeRevealTimer\)/);
  assert.match(timerCleanup, /clearTimeout\(slotSpinTimer\)/);
  assert.match(timerCleanup, /threeRevealTimer\s*=\s*null/);
  assert.match(timerCleanup, /slotSpinTimer\s*=\s*null/);

  for (const [start, end] of [
    ['function openThreeCard()', 'function openMahjong()'],
    ['function openMahjong()', 'function openSlots()'],
    ['function openSlots()', 'async function refreshProfile()'],
  ] as const) {
    assert.match(sourceBetween(start, end), /stopCasualTimers\(\)/);
  }

  const revealAction = sourceBetween("if(a==='three-reveal'", "if(a==='mahjong-new')");
  assert.match(revealAction, /const casual=state\.casual/);
  assert.match(revealAction, /threeRevealTimer=setTimeout/);
  assert.match(revealAction, /state\.casual!==casual/);

  const slotAction = sourceBetween("if(a==='slots-spin'", "if(a==='retry-history')");
  assert.match(slotAction, /const casual=state\.casual/);
  assert.match(slotAction, /slotSpinTimer=setTimeout/);
  assert.match(slotAction, /state\.casual!==casual/);

  assert.match(sourceBetween("if(a==='casual-home')", "if(a==='three-new')"), /stopCasualTimers\(\)/);
  assert.match(sourceBetween("if(a==='three-new')", "if(a==='three-reveal'"), /stopCasualTimers\(\)/);
});

test('the one-second countdown tick updates only turn-clock nodes instead of rerendering the table', () => {
  const feedback = sourceBetween('function turnFeedback(', 'function actionTrail(');
  assert.match(feedback, /data-turn-timer/);
  assert.match(feedback, /data-turn-seconds/);
  assert.match(feedback, /data-turn-detail/);
  assert.match(appSource, /function updateTurnClock\(\)/);

  const intervalIndex = appSource.lastIndexOf('setInterval(');
  assert.notEqual(intervalIndex, -1);
  const intervalSource = appSource.slice(intervalIndex);
  assert.match(intervalSource, /updateTurnClock\(\)/);
  assert.doesNotMatch(intervalSource, /\brender\(\)/, 'a clock tick must not rebuild the full hand and table DOM');
});
