import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const appSource = await readFile(new URL('../web/app.js', import.meta.url), 'utf8');
const styles = await readFile(new URL('../web/styles.css', import.meta.url), 'utf8');

function sourceBetween(start: string, end: string) {
  const from = appSource.indexOf(start);
  const to = appSource.indexOf(end, from + start.length);
  assert.ok(from >= 0, `missing source marker: ${start}`);
  assert.ok(to > from, `missing source marker: ${end}`);
  return appSource.slice(from, to);
}

test('all fifteen games publish one honest gameplay content contract', () => {
  const content = sourceBetween('const GAME_CONTENT', 'const TURN_TIMEOUT_MS');
  const ids = [...content.matchAll(/^  (?:'([^']+)'|([a-z0-9]+)): \{/gm)].map((match) => match[1] || match[2]);
  assert.deepEqual(ids, [
    'ddz', 'xiangqi', 'gomoku', 'reversi', 'mahjong', '1048', 'sudoku6',
    'minesweeper', 'sokoban', 'sliding', 'memory', 'snake', 'farm', 'three', 'reels',
  ]);
  for (const field of ['name', 'duration', 'mode', 'persistence', 'goal', 'loop', 'finish', 'limits', 'action', 'actionLabel']) {
    assert.equal([...content.matchAll(new RegExp(`\\b${field}:`, 'g'))].length, 15, `${field} must describe every game`);
  }
  assert.match(content, /mahjong:[\s\S]*?单局不保存[\s\S]*?暂不含吃碰杠与完整番型计分/);
  assert.match(content, /farm:[\s\S]*?无好友偷菜、跨设备同步或现金兑换/);
  assert.match(content, /reels:[\s\S]*?不支付、不下注、不发放任何可兑换奖励/);
});

test('the current-card playbook and full rules index reuse the gameplay content source', () => {
  const playbook = sourceBetween('function catalogPlaybookMarkup', 'function updateCatalogPlaybook');
  assert.match(playbook, /gameContent\(gameId\)/);
  assert.match(playbook, /核心循环/);
  assert.match(playbook, /完成条件/);
  assert.match(playbook, /catalog-playbook-meta/);
  const guide = sourceBetween('function rulesGameGuide', 'function lobby');
  assert.match(guide, /CATALOG_GAME_IDS\.map/);
  assert.match(guide, /15 款玩法，一次看懂/);
  assert.match(sourceBetween('function rules()', 'function render()'), /rulesGameGuide\(\)/);
  assert.match(styles, /\.catalog-playbook\s*\{/);
  assert.match(styles, /\.rules-game-index\s*\{/);
});

test('the catalog rail shares exact geometry across arrows, drag release, state, and filters', () => {
  assert.match(appSource, /from ['"]\.\/catalog-carousel\.js['"]/);
  const catalog = sourceBetween('function worldCarouselGeometry', 'app.addEventListener(\'click\'');
  assert.match(catalog, /targetCarouselScrollPosition/);
  assert.match(catalog, /stepCarouselIndex/);
  assert.match(catalog, /carouselReleaseDecision/);
  assert.match(catalog, /is-current/);
  assert.match(catalog, /is-at-start/);
  assert.match(catalog, /is-at-end/);
  assert.match(catalog, /updateCatalogPlaybook/);
  assert.doesNotMatch(catalog, /strip\.scrollLeft=0/);
  assert.match(appSource, /worldPointerSuppressClickUntil/);
  assert.match(appSource, /carouselDragScrollPosition/);
  assert.match(styles, /scroll-snap-type:inline proximity/);
  assert.match(styles, /scroll-snap-stop:normal/);
});

test('thin novelty games now expose meaningful session loops without value mechanics', () => {
  const three = sourceBetween('const THREE_CARD_LABELS', 'function mahjongTone');
  assert.match(three, /newThreeCardTrainingSession/);
  assert.match(three, /roundsTotal:3/);
  assert.match(three, /data-action="three-guess"/);
  assert.match(three, /判断正确/);
  assert.match(three, /并列/);
  const slots = sourceBetween('function slotsGame()', 'function sudoku6Cell');
  assert.match(slots, /slot-session-metrics/);
  assert.match(slots, /共振值/);
  assert.match(slots, /已见符号/);
  assert.match(slots, /不支付、不下注、不发放可兑换奖励/);
  const handlers = sourceBetween("if(a==='three-guess'", "if(a==='retry-history')");
  assert.match(handlers, /casual\.correct\+=Number\(correct\)/);
  assert.match(handlers, /casual\.ties\+=Number\(outcome\.playerTied\)/);
  assert.match(handlers, /casual\.resonance\+=/);
  assert.match(handlers, /casual\.discoveries\.includes/);
});
