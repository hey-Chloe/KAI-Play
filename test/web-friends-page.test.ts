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

function actionSource(action: string, length = 900) {
  const marker = new RegExp("if\\(a===['\"]" + action + "['\"]\\)");
  const match = marker.exec(appSource);
  assert.ok(match, `missing ${action} action handler`);
  return appSource.slice(match.index, match.index + length);
}

const lobby = between(appSource, 'function lobby()', 'function nav(');
const nav = functionSource('nav');
const header = functionSource('header');
const friends = functionSource('friends');

test('the four primary destinations live inside the top header on every primary page', () => {
  const destinations = [...nav.matchAll(/data-(?:view|action)="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(destinations, ['lobby', 'history', 'rules', 'view-friends']);
  assert.match(nav, />游戏<\/button>.*>战绩<\/button>.*>规则<\/button>.*>好友<\/button>/s);
  assert.match(nav, /active===['"]friends['"]/);
  assert.match(header, /class="topbar[^"`]*\$\{lobbyMode/);
  assert.match(header, /\$\{active\?nav\(active\):''\}/);
  assert.match(lobby, /header\(['"]lobby['"],['"]lobby['"]\)/);
  assert.match(appSource, /header\(['"]default['"],['"]history['"]\)/);
  assert.match(appSource, /header\(['"]default['"],['"]rules['"]\)/);
  assert.match(friends, /header\(['"]default['"],['"]friends['"]\)/);
});

test('the lobby keeps one friend shortcut but moves friend and record utilities out of game discovery', () => {
  assert.match(lobby, /<button[^>]*data-action="view-friends"[^>]*><i[^>]*>＋<\/i>和朋友玩<\/button>/);
  assert.doesNotMatch(lobby, /id="lobby-tools"/);
  assert.doesNotMatch(lobby, /class="friends-portal"/);
  assert.doesNotMatch(lobby, /data-action="create-room"/);
  assert.doesNotMatch(lobby, /data-action="join-room"/);
  assert.doesNotMatch(lobby, /id="room-code"/);
  assert.match(friends, /class="friend-history-card"/);
  assert.match(friends, /class="friends-portal"/);
});

test('the dedicated Friends page is a real QQ-style contact and request center', () => {
  assert.match(friends, /id="friends-title"/);
  assert.match(friends, /我的 KAI 号/);
  assert.match(friends, /data-action="copy-friend-code"/);
  assert.match(friends, /id="friend-list"/);
  assert.match(friends, /我的好友/);
  assert.match(friends, /id="new-friends"/);
  assert.match(friends, /id="friend-search-input"[^>]*type="search"/);
  assert.match(friends, /<div class="friend-search"><i[^>]*>[^<]*<\/i><label class="sr-only" for="friend-search-input">/);
  assert.doesNotMatch(friends, /<label class="friend-search"/);
  assert.match(friends, /输入 KAI 号或昵称/);
  assert.match(functionSource('friendSearchAction'), /data-action="friend-request"/);
  assert.match(friends, /data-action="friend-accept"/);
  assert.match(friends, /data-action="friend-decline"/);
  assert.match(friends, /data-action="friend-remove"/);
  assert.match(friends, /收到的申请/);
  assert.match(friends, /我发出的申请/);
});

test('Friends retains the complete create and six-digit join flow without claiming unavailable chat', () => {
  assert.match(friends, /id="friend-rooms"/);
  assert.match(friends, /data-action="create-room"/);
  assert.match(friends, /<label[^>]*for="room-code"[^>]*>六位房号<\/label>/);
  assert.match(friends, /<input[^>]*id="room-code"[^>]*maxlength="6"[^>]*inputmode="numeric"/);
  assert.match(friends, /data-action="join-room"/);
  assert.match(friends, /当前支持三人斗地主/);
  assert.match(friends, /站内暂不发送消息/);
  assert.match(friends, /在线状态、站内聊天和自动发送邀请暂未开放/);
  assert.doesNotMatch(friends, /\d+\s*人在线|正在输入|已读/);

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
});

test('friend search and relationship mutations use the real friend API contract', () => {
  assert.match(functionSource('loadFriendsData'), /api\(['"]\/v1\/friends['"]\)/);
  assert.match(functionSource('searchFriendsData'), /\/v1\/friends\/search\?q=/);
  assert.match(functionSource('updateFriendsFromMutation'), /applyFriendsPayload/);
  assert.match(functionSource('updateFriendsFromMutation'), /searchFriendsData/);
  assert.match(actionSource('friend-request'), /\/v1\/friends\/requests/);
  assert.match(actionSource('friend-accept'), /\/v1\/friends\/requests\/\$\{encodeURIComponent\(requestId\)\}\/accept/);
  assert.match(actionSource('friend-decline'), /\/v1\/friends\/requests\/\$\{encodeURIComponent\(requestId\)\}\/decline/);
  assert.match(actionSource('friend-remove'), /\/v1\/friends\/\$\{encodeURIComponent\(friendId\)\}\/remove/);
  const invite = actionSource('friend-invite');
  assert.match(invite, /api\(['"]\/v1\/rooms['"]/);
  assert.match(invite, /请把房号分享给/);
});

test('friend loading failures stay visible and retryable instead of pretending the list is empty', () => {
  const load = functionSource('loadFriendsData');
  assert.match(load, /state\.friendsStatus = ['"]loading['"]/);
  assert.match(load, /catch \(error\) \{ state\.friendsStatus = ['"]error['"]/);
  assert.match(friends, /state\.friendsStatus === ['"]error['"]/);
  assert.match(friends, /class="friends-load-error" role="alert"/);
  assert.match(friends, /不代表你的好友和申请为空/);
  assert.match(friends, /data-action="friend-retry"/);
  assert.match(actionSource('friend-retry'), /act\(loadFriendsData\)/);
});

test('Friends is an independent route and opening it refreshes server data', () => {
  const render = functionSource('render');
  assert.match(render, /state\.view===['"]friends['"]\?friends\(\)/);

  const open = actionSource('view-friends');
  assert.match(open, /state\.view=['"]friends['"]/);
  assert.match(open, /render\(\)/);
  assert.match(open, /act\(loadFriendsData\)/);
  assert.match(nav, /data-view="lobby"[^>]*>游戏<\/button>/);
  assert.match(appSource, /if\(el\.dataset\.view\)[\s\S]*state\.view=el\.dataset\.view[\s\S]*render\(\)/);
});
