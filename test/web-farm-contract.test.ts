import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const root = resolve(import.meta.dirname, '..');
const read = (path: string) => readFile(resolve(root, path), 'utf8');
const [appSource, styleSource, indexSource, packageSource, dockerSource, preflightSource, proxyTestSource] = await Promise.all([
  read('web/app.js'), read('web/styles.css'), read('web/index.html'), read('package.json'),
  read('web/Dockerfile'), read('scripts/preflight.ts'), read('test/web-proxy-e2e.test.ts'),
]);

function between(source: string, start: string, end: string) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.notEqual(from, -1, `missing start marker ${start}`);
  assert.notEqual(to, -1, `missing end marker ${end}`);
  return source.slice(from, to);
}

const lobby = between(appSource, 'function lobby()', 'function nav(');
const farmUi = between(appSource, 'function farmReadySignature(', 'function historyMatchWon(');
const route = between(appSource, 'function farmGame()', 'function historyMatchWon(');
const farmImport = between(appSource, 'import {\n  FARM_ACTIONS_PER_DAY,', "} from './farm.js';");

test('KAI Farm ships its nine-day rules and media through every production path', async () => {
  assert.match(appSource, /from ['"]\.\/farm\.js['"]/);
  for (const binding of [
    'FARM_ACTIONS_PER_DAY', 'FARM_SEASON_DAYS', 'advanceFarmDay', 'clearFarmPlot',
    'farmMarketForDay', 'farmRemainingDays', 'farmSeasonMedal',
  ]) assert.match(farmImport, new RegExp(`\\b${binding}\\b`));
  assert.match(packageSource, /node --check web\/farm\.js/);
  assert.match(dockerSource, /COPY[^\n]*web\/farm\.js[^\n]*\.\//);
  assert.match(preflightSource, /['"]web\/farm\.js['"]/);
  assert.match(proxyTestSource, /['"]\/farm\.js['"]/);
  assert.match(indexSource, /KAI 农场/);
  assert.match(await read('web/farm.js'), /export const FARM_SEASON_DAYS\s*=\s*9/);
  assert.match(styleSource, /url\(['"]?\/assets\/farm\/kai-farm-field-v1\.webp['"]?\)/);
  assert.match(styleSource, /url\(['"]?\/assets\/farm\/kai-farm-crops-v1\.webp['"]?\)/);
  await Promise.all([
    access(resolve(root, 'web/assets/farm/kai-farm-field-v1.webp')),
    access(resolve(root, 'web/assets/farm/kai-farm-crops-v1.webp')),
  ]);
});

test('the eighteen-game catalog presents Farm as a resumable nine-day strategy game', () => {
  assert.match(lobby, /class="game-world world-farm"[^>]*data-world-card[^>]*data-world-id="farm"/);
  assert.match(lobby, /<h3>KAI 农场<\/h3>/);
  assert.match(lobby, /九日经营 · 五步一日 · 行情轮换/);
  assert.match(lobby, /data-action="open-farm"/);
  assert.ok(lobby.indexOf('world-snake') < lobby.indexOf('world-farm'), 'Farm must follow Snake');
  assert.ok(lobby.indexOf('world-farm') < lobby.indexOf('world-three'), 'Farm must precede Three Card');
  assert.match(appSource, /farm:\s*\{\s*categories:\[['"]quick['"],['"]save['"]\]/);
  assert.match(appSource.toLowerCase(), /农场[^\n]*(?:farm|farming)[^\n]*九日赛季[^\n]*市场行情/);
  assert.match(appSource, /if\(a===['"]open-farm['"]\)/);
  assert.match(appSource, /state\.view===['"]farm['"]\?farmGame\(\)/);
});

test('the route exposes day, action, market, drought, harvest, and season-result states', () => {
  assert.match(route, /NINE DAY HARVEST/);
  assert.match(route, /九日丰收挑战/);
  assert.match(route, /game\.day/);
  assert.match(route, /game\.actionsLeft/);
  assert.match(route, /FARM_SEASON_DAYS/);
  assert.match(route, /FARM_ACTIONS_PER_DAY/);
  assert.match(route, /farmMarketForDay\(game\.day\)/);
  assert.match(route, /今日旺需/);
  assert.match(route, /明日旺需/);
  assert.match(farmUi, /farmPlotStatus\(plot\) === ['"]weed['"]/);
  assert.match(farmUi, /class="farm-plot is-weed"/);
  assert.match(appSource, /clearFarmPlot\(game,index\)/);
  assert.match(route, /data-action="farm-select"/);
  assert.match(route, /data-action="farm-harvest-all"/);
  assert.match(route, /data-action="farm-next-day"/);
  assert.match(route, /data-action="farm-reset"/);
  assert.match(route, /data-farm-result/);
  assert.match(route, /九日经营完成/);
  assert.match(route, /地里未收作物不计入结算/);
});

test('farm-next-day advances the turn, reports weeds or maturity, and settles day nine', () => {
  const handler = between(appSource, "if(a==='farm-next-day'&&state.view==='farm')", "if(a==='farm-reset'&&state.view==='farm')");
  assert.match(handler, /advanceFarmDay\(game\)/);
  assert.match(handler, /farmPlotStatus\(plot\)===['"]weed['"]/);
  assert.match(handler, /farmPlotStatus\(plot\)===['"]ready['"]/);
  assert.match(handler, /next\.status===['"]finished['"]/);
  assert.match(handler, /九日经营完成/);
  assert.match(handler, /farmMarketForDay\(next\.day\)/);
  assert.match(handler, /commitFarmGame\(next,announcement/);
});

test('all season controls and state surfaces remain keyboard and screen-reader operable', () => {
  assert.match(route, /role="grid"/);
  assert.match(route, /aria-rowcount="2"/);
  assert.match(route, /aria-colcount="3"/);
  assert.match(route, /aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight Enter Space"/);
  assert.match(farmUi, /data-farm-plot="\$\{index\}"[^>]*role="gridcell"/);
  assert.match(farmUi, /aria-describedby="farm-key-hint"/);
  assert.match(route, /role="status" aria-live="polite"/);
  assert.match(route, /aria-label="今日市场行情"/);
  assert.match(route, /aria-label="本季数据"/);
  assert.match(route, /role="progressbar"[^>]*aria-label="农场升级进度"[^>]*aria-valuemin="0"[^>]*aria-valuemax="100"/);
  assert.match(route, /aria-pressed="\$\{selected\}"/);
  assert.match(route, /data-farm-result[^>]*tabindex="-1"/);
  assert.match(appSource, /next\.status === ['"]finished['"][^\n]*querySelector\(['"]\[data-farm-result\]['"]\)\?\.focus/);
  assert.match(appSource, /\['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'\]/);
  assert.match(appSource, /if\(el\.dataset\.farmPlot!==undefined\)[\s\S]{0,120}performFarmPlot/);
});

test('season progress restores defensively without API settlement or redeemable coins', () => {
  assert.match(appSource, /const FARM_SAVE_KEY\s*=\s*['"]kai\.play\.farm\.season\.v2['"]/);
  assert.doesNotMatch(appSource, /const FARM_SAVE_KEY\s*=\s*['"]kai\.play\.farm\.game\.v1['"]/);
  assert.match(appSource, /restoreFarmGame\(JSON\.parse\(raw\)\)/);
  assert.match(appSource, /safeStorageRemove\(FARM_SAVE_KEY\)/);
  assert.match(appSource, /safeStorageSet\(FARM_SAVE_KEY, serialized\)/);
  assert.match(appSource, /farmHasProgress\(savedFarm\)/);
  assert.match(appSource, /rememberLastLocalGame\(['"]farm['"]\)/);
  assert.match(appSource, /event\.key !== FARM_SAVE_KEY/);
  assert.match(appSource, /event\.newValue === state\.casual\.farmPersistedSnapshot/);
  assert.doesNotMatch(farmUi, /\bapi\s*\(/, 'the local season must not call competitive services');
  assert.doesNotMatch(route, /服务端已完成结算/);
  assert.match(route, /当前浏览器本地运行并自动保存/);
  assert.match(route, /农场金币和奖章只用于本地娱乐/);
  assert.match(route, /不可购买、提现、转让或兑换/);
  assert.match(route, /不会改变竞技分、Token 或 KAI 卡时/);
  assert.match(route, /刷新后不会恢复/);
});

test('farm storage refuses to overwrite a newer save from another browser tab', () => {
  const saveSource = between(appSource, 'function saveFarmGame(', 'function localDateKey(');
  const saveKey = 'farm-save';
  const values = new Map<string, string>([[saveKey, 'newer-tab-value']]);
  let writes = 0;
  const saveFarmGame = runInNewContext(`${saveSource}; saveFarmGame`, {
    state:{ casual:null }, FARM_SAVE_KEY:saveKey, JSON,
    safeStorageGet:(key: string) => values.get(key) ?? null,
    safeStorageSet:(key: string, value: string) => {
      writes += 1;
      values.set(key, value);
      return true;
    },
  });
  const casual = {
    kind:'farm', farmPersistedSnapshot:'older-local-value',
    saveAvailable:true, saveConflict:false,
  };
  const game = { kind:'farm', status:'playing', day:4, actionsLeft:2, coins:32, plots:[] };

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

test('season presentation uses real media, responsive controls, state labels, and reduced motion', () => {
  assert.match(styleSource, /\.lobby-game-center \.world-farm\s*\{/);
  assert.match(styleSource, /\.world-farm \.world-cover\s*\{[^\n]*kai-farm-field-v1\.webp/);
  assert.match(styleSource, /\.world-farm-field > i\s*\{[^\n]*kai-farm-crops-v1\.webp/);
  assert.match(styleSource, /\.farm-field\s*\{[\s\S]*?grid-template-columns:repeat\(3,minmax\(0,1fr\)\)[\s\S]*?kai-farm-field-v1\.webp/);
  assert.match(styleSource, /\.farm-crop-art\s*\{[\s\S]*?kai-farm-crops-v1\.webp/);
  assert.match(styleSource, /\.farm-weed-art\s*\{/);
  assert.match(styleSource, /\.farm-status\.has-weeds/);
  assert.match(styleSource, /\.farm-result\s*\{/);
  assert.match(styleSource, /\.farm-crop-choice:focus-visible,\.farm-plot:focus-visible,\.farm-actions \.btn:focus-visible/);
  assert.match(styleSource, /@media \(max-width:540px\)[\s\S]*?\.farm-actions \.btn\s*\{[^}]*min-height:44px/);
  assert.match(styleSource, /@media \(prefers-reduced-motion:reduce\)[\s\S]*?\.farm-plot\.is-ready \.farm-crop-art\s*\{\s*animation:none!important/);
});
