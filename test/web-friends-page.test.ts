import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');
const appSource = await readFile(resolve(root, 'web/app.js'), 'utf8');

function between(source: string, start: string, end: string) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.notEqual(from, -1, `missing start marker ${start}`);
  assert.notEqual(to, -1, `missing end marker ${end}`);
  return source.slice(from, to);
}

function functionSource(name: string) {
  const marker = `function ${name}(`;
  const from = appSource.indexOf(marker);
  assert.notEqual(from, -1, `missing ${name} function`);
  const to = appSource.indexOf('\nfunction ', from + marker.length);
  assert.notEqual(to, -1, `missing function after ${name}`);
  return appSource.slice(from, to);
}

function actionSource(action: string, length = 320) {
  const marker = new RegExp("if\\(a===['\"]" + action + "['\"]\\)");
  const match = marker.exec(appSource);
  assert.ok(match, "missing " + action + " action handler");
  return appSource.slice(match.index, match.index + length);
}

const lobby = between(appSource, 'function lobby()', 'function nav(');
const nav = functionSource('nav');

test('the bottom navigation exposes Friend Rooms directly beside Rules', () => {
  const destinations = [...nav.matchAll(/data-(?:view|action)="([^"]+)"/g)].map((match) => match[1]);
  const rulesIndex = destinations.indexOf('rules');
  const friendsIndex = destinations.indexOf('view-friends');
  assert.notEqual(rulesIndex, -1, 'Rules must remain in the bottom navigation');
  assert.equal(friendsIndex, rulesIndex + 1, 'Friend Rooms must sit directly after Rules');
  assert.match(nav, /active===['"]friends['"]/);
  assert.match(nav, /data-action="view-friends"[^>]*>好友房<\/button>/);
});

test('the lobby links to Friend Rooms without embedding room forms in game discovery', () => {
  assert.match(lobby, /<button[^>]*data-action="view-friends"[^>]*>/);
  assert.match(lobby, /好友房/);
  assert.doesNotMatch(lobby, /data-action="create-room"/);
  assert.doesNotMatch(lobby, /data-action="join-room"/);
  assert.doesNotMatch(lobby, /id="room-code"/);
  assert.doesNotMatch(lobby, /class="friend-row"/);
});

test('the dedicated Friend Rooms page contains the complete create and six-digit join flow', () => {
  const friends = functionSource('friends');
  assert.match(friends, /<h1[^>]*>好友房<\/h1>|<h1[^>]*>[^<]*好友[^<]*房[^<]*<\/h1>/);
  assert.match(friends, /data-action="create-room"/);
  assert.match(friends, /<label[^>]*for="room-code"[^>]*>[^<]*六位房号[^<]*<\/label>/);
  assert.match(friends, /<input[^>]*id="room-code"[^>]*maxlength="6"[^>]*inputmode="numeric"/);
  assert.match(friends, /data-action="join-room"/);
  assert.match(friends, /斗地主/);
  assert.match(friends, /房主|三人|三位|智能牌友/);
  assert.match(friends, /房号|房间说明|好友房说明/);
  assert.match(friends, /nav\(['"]friends['"]\)/);
});

test('Friend Rooms reuses the existing room API handlers rather than duplicating room logic', () => {
  assert.equal([...appSource.matchAll(/if\(a===['"]create-room['"]\)/g)].length, 1);
  assert.equal([...appSource.matchAll(/if\(a===['"]join-room['"]\)/g)].length, 1);

  const createHandler = between(appSource, "if(a==='create-room')", "if(a==='join-room')");
  assert.match(createHandler, /api\(['"]\/v1\/rooms['"]/);
  assert.match(createHandler, /state\.view=['"]room['"]/);
  assert.match(createHandler, /startRoomSync\(\)/);

  const joinHandler = between(appSource, "if(a==='join-room')", "if(a==='copy-room')");
  assert.match(joinHandler, /document\.querySelector\(['"]#room-code['"]\)/);
  assert.match(joinHandler, /\^\\d\{6\}\$/);
  assert.match(joinHandler, /api\(['"]\/v1\/rooms\/join['"]/);
  assert.match(joinHandler, /state\.view=['"]room['"]/);
  assert.match(joinHandler, /startRoomSync\(\)/);
});

test('Friend Rooms is rendered as an independent route and can return to the lobby', () => {
  const render = functionSource('render');
  assert.match(render, /state\.view===['"]friends['"]\?friends\(\)/);

  const open = actionSource('view-friends');
  assert.match(open, /state\.view=['"]friends['"]/);
  assert.match(open, /render\(\)/);

  assert.match(nav, /data-view="lobby"[^>]*>游戏<\/button>/);
  assert.match(functionSource('friends'), /nav\(['"]friends['"]\)/);
  assert.match(appSource, /if\(el\.dataset\.view\)[\s\S]*state\.view=el\.dataset\.view[\s\S]*render\(\)/);
});
