import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');
const appSource = await readFile(resolve(root, 'web/app.js'), 'utf8');
const indexSource = await readFile(resolve(root, 'web/index.html'), 'utf8');
const stylesSource = await readFile(resolve(root, 'web/styles.css'), 'utf8');
const mobileSource = await readFile(resolve(root, 'mobile/App.tsx'), 'utf8');

function between(source: string, start: string, end: string) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.notEqual(from, -1, `missing ${start}`);
  assert.notEqual(to, -1, `missing ${end}`);
  return source.slice(from, to);
}

test('Web startup and authoritative actions always expose visible progress', () => {
  assert.match(indexSource, /class="boot-shell"/);
  assert.match(indexSource, /正在连接牌局服务/);
  assert.match(indexSource, /自动恢复未结束对局/);
  assert.match(appSource, /class="global-busy" role="status"/);
  assert.match(appSource, /state\.busy=true;render\(\);try/);
  assert.match(stylesSource, /\.global-busy\s*\{/);
});

test('stopped room and game synchronization has a persistent recovery path', () => {
  assert.match(appSource, /function syncFailureNotice\(\)/);
  assert.match(appSource, /data-action="retry-sync"/);
  assert.match(appSource, /if\(a==='retry-sync'\)/);
  assert.match(appSource, /startRoomSync\(\)/);
  assert.match(appSource, /startGameSync\(\)/);
  assert.match(stylesSource, /\.route-sync-error\s*\{/);
});

test('the lobby promotes only playable content and makes 1048 discoverable', () => {
  const lobby = between(appSource, 'function lobby()', 'function nav(');
  assert.match(lobby, /开始首局/);
  assert.match(lobby, /游客免注册 · 智能牌友补位 · 可断线恢复/);
  assert.match(lobby, /world-badge/);
  assert.match(lobby, /继续游玩/);
  assert.match(lobby, /resume-progress/);
  assert.doesNotMatch(lobby, /scroll-games|每日残局|筹备中/);
  assert.match(stylesSource, /\.world-swipe-hint/);
});

test('the game center puts discovery before room and history utilities', () => {
  const lobby = between(appSource, 'function lobby()', 'function nav(');
  const intro = lobby.indexOf('game-center-intro');
  const discovery = lobby.indexOf('hub-discovery');
  const catalog = lobby.indexOf('id="game-selection"');
  const tools = lobby.indexOf('id="lobby-tools"');
  assert.ok(intro >= 0 && intro < discovery);
  assert.ok(discovery < catalog);
  assert.ok(catalog < tools);
  assert.match(lobby, /现在，想玩点什么？/);
  assert.match(lobby, /按心情选择玩法/);
  assert.match(lobby, /本地自动保存/);
});

test('poster cards keep one real action and a truthful benefit promise', () => {
  const lobby = between(appSource, 'function lobby()', 'function nav(');
  assert.equal([...lobby.matchAll(/data-world-card/g)].length, 8);
  assert.equal([...lobby.matchAll(/class="world-cover"/g)].length, 8);
  assert.equal([...lobby.matchAll(/class="world-copy"/g)].length, 8);
  assert.match(lobby, /首击必安全/);
  assert.match(lobby, /三档 KAI 对手/);
  assert.match(lobby, /无现金下注 · 无提现/);
  assert.doesNotMatch(lobby, /\d+\s*人在线|五星|好评率|今日热门/);
});

test('all eight games form one horizontally sliding card carousel', () => {
  const lobby = between(appSource, 'function lobby()', 'function nav(');
  assert.match(lobby, /data-world-strip/);
  assert.match(lobby, /全部玩法卡片轮播/);
  assert.match(lobby, /data-action="world-prev"/);
  assert.match(lobby, /data-action="world-next"/);
  assert.match(appSource, /function scrollWorldCarousel\(direction\)/);
  assert.match(appSource, /strip\.scrollBy\(\{left:direction\*step/);
  assert.match(stylesSource, /\.world-strip\s*\{[\s\S]*?display:\s*flex;[\s\S]*?flex-wrap:\s*nowrap;[\s\S]*?overflow-x:\s*auto;[\s\S]*?scroll-snap-type:\s*inline mandatory/);
  assert.match(stylesSource, /\.game-world\s*\{[\s\S]*?flex:\s*0 0 clamp\([\s\S]*?scroll-snap-align:\s*start/);
});

test('1048 local progress is restored, saved after moves, and described honestly', () => {
  assert.match(appSource, /MERGE_1048_SAVE_KEY/);
  assert.match(appSource, /restore1048Game\(JSON\.parse\(raw\)\)/);
  assert.match(appSource, /save1048Game\(next\)/);
  assert.match(appSource, /最后两枚 512 特别融合为 1048/);
  assert.match(appSource, /本局进度自动保存在当前浏览器/);
});

test('mobile focuses on shipped value and closes the post-match loop', () => {
  const lobby = between(mobileSource, 'function Lobby(', 'function RoomScreen(');
  const table = between(mobileSource, 'function Table(', 'function HistoryScreen(');
  assert.match(mobileSource, /function greetingForHour\(/);
  assert.match(lobby, /免费开局 · 服务端判定 · 可断线恢复/);
  assert.doesNotMatch(lobby, /KAI 象棋|AI 挑战场|卡时服务|规划中/);
  assert.match(table, /快速人机再来一局/);
  assert.match(table, /查看战绩/);
  assert.match(mobileSource, /onHistory=\{showResultHistory\}/);
});

test('phone card and Mahjong hands are horizontally operable without losing position', () => {
  assert.match(stylesSource, /\.ddz-table \.hand-dock \.hand\s*\{[\s\S]*?overflow-x:\s*auto/);
  assert.match(stylesSource, /\.ddz-table \.hand-dock \.poker\.hand-card\s*\{[\s\S]*?flex:\s*0 0 52px/);
  assert.match(stylesSource, /\.mahjong-match-stage \.match-player-hand\s*\{[\s\S]*?overflow-x:\s*auto/);
  assert.match(appSource, /nextHand\.scrollLeft=previousScroll/);
  assert.match(appSource, /control\.dataset\.card===id/);
  assert.match(appSource, /control\.dataset\.mahjongTile===tileId/);
});
