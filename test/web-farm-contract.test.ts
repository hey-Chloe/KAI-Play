import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const root = resolve(import.meta.dirname, '..');
const read = (path: string) => readFile(resolve(root, path), 'utf8');
const [
  appSource,
  styleSource,
  indexSource,
  packageSource,
  dockerSource,
  preflightSource,
  proxyTestSource,
  readmeSource,
  productSource,
] = await Promise.all([
  read('web/app.js'),
  read('web/styles.css'),
  read('web/index.html'),
  read('package.json'),
  read('web/Dockerfile'),
  read('scripts/preflight.ts'),
  read('test/web-proxy-e2e.test.ts'),
  read('README.md'),
  read('docs/PRODUCT.md'),
]);

function between(source: string, start: string, end: string) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.notEqual(from, -1, `missing start marker ${start}`);
  assert.notEqual(to, -1, `missing end marker ${end}`);
  return source.slice(from, to);
}

const lobby = between(appSource, 'function lobby()', 'function nav(');
const route = between(appSource, 'function farmGame()', 'function historyMatchWon(');

test('KAI Farm ships as a standalone browser module through every production path', async () => {
  assert.match(appSource, /from ['"]\.\/farm\.js['"]/);
  assert.match(packageSource, /node --check web\/farm\.js/);
  assert.match(dockerSource, /COPY[^\n]*web\/farm\.js[^\n]*\.\//);
  assert.match(preflightSource, /['"]web\/farm\.js['"]/);
  assert.match(preflightSource, /production image must include the standalone Farm engine/);
  assert.match(preflightSource, /load the standalone Farm engine/);
  assert.match(proxyTestSource, /['"]\/farm\.js['"]/);
  assert.match(indexSource, /KAI 农场/);
  assert.match(await read('web/farm.js'), /export const FARM_CROPS/);
});

test('the twelve-card catalog makes the farm searchable, filterable, and playable in place', () => {
  assert.match(lobby, /class="game-world world-farm"[^>]*data-world-card[^>]*data-world-id="farm"/);
  assert.match(lobby, /<h3>KAI 农场<\/h3>/);
  assert.match(lobby, /经典农场经营 · 20 秒首获/);
  assert.match(lobby, /data-action="open-farm"/);
  assert.ok(lobby.indexOf('world-snake') < lobby.indexOf('world-farm'), 'Farm must follow Snake');
  assert.ok(lobby.indexOf('world-farm') < lobby.indexOf('world-three'), 'Farm must precede Three Card');
  assert.match(appSource, /farm:\s*\{\s*categories:\[['"]quick['"],['"]save['"]\]/);
  assert.match(appSource.toLowerCase(), /qq农场[^\n]*(?:farm|farming)[^\n]*种菜[^\n]*收菜/);
  assert.match(appSource, /if\(a===['"]open-farm['"]\)/);
  assert.match(appSource, /state\.view===['"]farm['"]\?farmGame\(\)/);
});

test('the farm route exposes a complete sow, water, mature, and harvest loop', () => {
  assert.match(route, /KAI 农场/);
  assert.match(route, /播种/);
  assert.match(route, /浇水/);
  assert.match(route, /成熟/);
  assert.match(route, /收获/);
  assert.match(route, /Object\.values\(FARM_CROPS\)/);
  assert.match(route, /data-action="farm-select"/);
  assert.match(route, /data-action="farm-harvest-all"/);
  assert.match(route, /data-action="farm-reset"/);
  assert.match(appSource, /function performFarmPlot\(index\)/);
  assert.match(appSource, /plantFarmCrop\(game, index, game\.selectedCrop, now\)/);
  assert.match(appSource, /waterFarmCrop\(game, index, now\)/);
  assert.match(appSource, /harvestFarmCrop\(game, index, now\)/);
  assert.match(appSource, /harvestReadyFarmCrops\(game,now\)/);
  assert.match(appSource, /if\s*\(farmPlotStatus\(plot, now\) === ['"]ready['"]\)/);
});

test('six farm plots and all controls remain keyboard and screen-reader operable', () => {
  assert.match(route, /role="grid"/);
  assert.match(route, /aria-rowcount="2"/);
  assert.match(route, /aria-colcount="3"/);
  assert.match(route, /game\.plots\.map\(\(_, index\) => farmPlotMarkup/);
  assert.match(appSource, /data-farm-plot="\$\{index\}"[^>]*role="gridcell"/);
  assert.match(route, /aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight Enter Space"/);
  assert.match(route, /role="status" aria-live="polite"/);
  assert.match(appSource, /farmPlotNode/);
  assert.match(appSource, /\['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'\]/);
  assert.match(appSource, /if\(el\.dataset\.farmPlot!==undefined\)[\s\S]{0,120}performFarmPlot/);
  assert.match(route, /role="progressbar"/);
});

test('farm progress restores defensively and states offline and product boundaries honestly', () => {
  assert.match(appSource, /const FARM_SAVE_KEY\s*=\s*['"]kai\.play\.farm\.game\.v1['"]/);
  assert.match(appSource, /restoreFarmGame\(JSON\.parse\(raw\)\)/);
  assert.match(appSource, /safeStorageRemove\(FARM_SAVE_KEY\)/);
  assert.match(appSource, /safeStorageSet\(FARM_SAVE_KEY, serialized\)/);
  assert.match(appSource, /farmHasProgress\(savedFarm\)/);
  assert.match(appSource, /rememberLastLocalGame\(['"]farm['"]\)/);
  assert.match(appSource, /event\.key !== FARM_SAVE_KEY/);
  assert.match(appSource, /event\.newValue === state\.casual\.farmPersistedSnapshot/);
  assert.doesNotMatch(route, /api\(/, 'the local farm must not call competitive services');
  assert.match(route, /当前浏览器本地运行并自动保存/);
  assert.match(route, /离开后作物只继续成长，不会自动产币/);
  assert.match(route, /暂不支持好友拜访、偷菜或跨设备同步/);
  assert.match(route, /不可购买、提现、转让或兑换/);
  assert.match(route, /刷新后不会恢复/);
  for (const source of [readmeSource, productSource]) {
    assert.match(source, /KAI 农场/);
    assert.match(source, /不会自动产币/);
  }
});

test('farm storage refuses to overwrite a newer save from another browser tab', () => {
  const saveSource = between(appSource, 'function saveFarmGame(', 'function localDateKey(');
  const saveKey = 'farm-save';
  const values = new Map<string, string>([[saveKey, 'newer-tab-value']]);
  let writes = 0;
  const saveFarmGame = runInNewContext(`${saveSource}; saveFarmGame`, {
    state:{ casual:null },
    FARM_SAVE_KEY:saveKey,
    JSON,
    safeStorageGet:(key: string) => values.get(key) ?? null,
    safeStorageSet:(key: string, value: string) => {
      writes += 1;
      values.set(key, value);
      return true;
    },
  });
  const casual = {
    kind:'farm',
    farmPersistedSnapshot:'older-local-value',
    saveAvailable:true,
    saveConflict:false,
  };
  const game = { kind:'farm', coins:32, plots:[] };

  assert.equal(saveFarmGame(game, casual), false);
  assert.equal(writes, 0, 'a stale farm tab must not overwrite newer storage');
  assert.equal(casual.saveAvailable, false);
  assert.equal(casual.saveConflict, true);

  values.set(saveKey, casual.farmPersistedSnapshot);
  assert.equal(saveFarmGame(game, casual), true);
  assert.equal(writes, 1);
  assert.equal(casual.saveConflict, false);
  assert.equal(casual.farmPersistedSnapshot, JSON.stringify(game));
});

test('farm timers update countdowns incrementally and respect hidden tabs', () => {
  const timer = between(appSource, 'function queueFarmTick()', 'function startFarmSession(');
  assert.match(timer, /document\.visibilityState === ['"]hidden['"]/);
  assert.match(timer, /data-farm-countdown/);
  assert.match(timer, /data-farm-progress/);
  assert.match(timer, /setAttribute\(['"]aria-valuenow['"]/);
  assert.match(timer, /style\.setProperty\(['"]--farm-progress['"]/);
  assert.match(timer, /signature !== casual\.readySignature/);
  assert.match(between(appSource, 'function stopCasualTimers()', 'function queueMahjongBotTurn()'), /clearTimeout\(farmTimer\)/);
  const visibility = appSource.slice(appSource.indexOf("document.addEventListener('visibilitychange'"));
  assert.match(visibility, /state\.view === ['"]farm['"]/);
  assert.match(visibility, /saveFarmGame\(state\.casual\.game\)/);
  assert.match(visibility, /queueFarmTick\(\)/);
});

test('farm presentation keeps real status labels, touch targets, responsive grids, and reduced motion', () => {
  assert.match(styleSource, /\.lobby-game-center \.world-farm\s*\{/);
  assert.match(styleSource, /\.world-farm-field\s*\{/);
  assert.match(styleSource, /\.farm-field\s*\{[\s\S]*?grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(styleSource, /\.farm-plot\s*\{[\s\S]*?min-height:\s*1[2-9]\dpx/);
  assert.match(styleSource, /\.farm-crop-choice\s*\{[\s\S]*?min-height:\s*5[4-9]px/);
  assert.match(styleSource, /\.farm-plot:focus-visible/);
  assert.match(styleSource, /\.farm-plot\.is-empty/);
  assert.match(styleSource, /\.farm-plot\.is-growing/);
  assert.match(styleSource, /\.farm-plot\.is-watered/);
  assert.match(styleSource, /\.farm-plot\.is-ready/);
  assert.match(styleSource, /@media \(hover:hover\) and \(pointer:fine\)[\s\S]*?\.farm-plot:hover/);
  assert.match(styleSource, /@media \(max-width:760px\)[\s\S]*?\.farm-field\s*\{\s*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(styleSource, /@media \(max-width:360px\)[\s\S]*?\.farm-plot/);
  assert.match(styleSource, /@media \(prefers-reduced-motion:reduce\)[\s\S]*?\.farm-plot\.is-ready \.farm-crop\s*\{\s*animation:none!important/);
});
