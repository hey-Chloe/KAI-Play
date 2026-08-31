import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FARM_CROPS,
  FARM_PLOT_COUNT,
  FARM_SCHEMA_VERSION,
  FARM_STARTING_COINS,
  farmGrowthRatio,
  farmHasProgress,
  farmLevelForXp,
  farmNextLevelXp,
  farmPlotStatus,
  farmRemainingMs,
  harvestFarmCrop,
  harvestReadyFarmCrops,
  newFarmGame,
  plantFarmCrop,
  restoreFarmGame,
  selectFarmCrop,
  waterFarmCrop,
} from '../web/farm.js';

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function assertFailureDoesNotMutate(game: any, action: () => unknown, code: RegExp) {
  const snapshot = clone(game);
  assert.throws(action, code);
  assert.deepEqual(game, snapshot);
}

test('new farms are deterministic, serializable, and begin with six empty plots', () => {
  const game = newFarmGame(1_000);
  assert.deepEqual(game, {
    schemaVersion:FARM_SCHEMA_VERSION,
    kind:'farm',
    coins:FARM_STARTING_COINS,
    xp:0,
    level:1,
    harvests:0,
    actions:0,
    selectedCrop:'wheat',
    plots:Array.from({ length:FARM_PLOT_COUNT }, () => ({
      cropId:null, plantedAt:null, matureAt:null, watered:false,
    })),
    lastAction:'new',
    updatedAt:1_000,
  });
  assert.deepEqual(JSON.parse(JSON.stringify(game)), game);
  assert.equal(farmHasProgress(game), false);
  assert.equal(farmLevelForXp(0), 1);
  assert.equal(farmNextLevelXp(1), 30);
  assert.equal(farmNextLevelXp(2), 80);
  assert.equal(farmNextLevelXp(3), null);
  assert.throws(() => newFarmGame(-1), /FARM_TIME_INVALID/);
});

test('planting spends seed coins, records exact growth time, and never aliases the input', () => {
  const game = newFarmGame(1_000);
  const planted = plantFarmCrop(game, 2, 'wheat', 2_000);
  assert.equal(game.coins, FARM_STARTING_COINS);
  assert.equal(game.plots[2].cropId, null);
  assert.notEqual(planted, game);
  assert.notEqual(planted.plots, game.plots);
  assert.equal(planted.coins, FARM_STARTING_COINS - FARM_CROPS.wheat.seedCost);
  assert.equal(planted.actions, 1);
  assert.equal(planted.lastAction, 'plant');
  assert.equal(planted.updatedAt, 2_000);
  assert.deepEqual(planted.plots[2], {
    cropId:'wheat',
    plantedAt:2_000,
    matureAt:2_000 + FARM_CROPS.wheat.growMs,
    watered:false,
  });
  assert.equal(farmPlotStatus(planted.plots[2], 2_000), 'growing');
  assert.equal(farmRemainingMs(planted.plots[2], 2_000), FARM_CROPS.wheat.growMs);
  assert.equal(farmGrowthRatio(planted.plots[2], 2_000), 0);
  assert.equal(farmGrowthRatio(planted.plots[2], 12_000), 0.5);
  assert.equal(farmHasProgress(planted), true);
});

test('crop selection enforces level unlocks and records an immutable selection', () => {
  const game = newFarmGame(1_000);
  assertFailureDoesNotMutate(game, () => selectFarmCrop(game, 'carrot', 2_000), /FARM_CROP_LOCKED/);
  assertFailureDoesNotMutate(game, () => selectFarmCrop(game, 'missing', 2_000), /FARM_CROP_INVALID/);

  const levelTwo = { ...game, xp:30, level:2 };
  const selected = selectFarmCrop(levelTwo, 'carrot', 2_000);
  assert.equal(levelTwo.selectedCrop, 'wheat');
  assert.equal(selected.selectedCrop, 'carrot');
  assert.equal(selected.lastAction, 'select');
  assert.equal(selected.updatedAt, 2_000);
});

test('watering once shortens growth without changing coins or mutating the planted game', () => {
  const planted = plantFarmCrop(newFarmGame(1_000), 0, 'wheat', 2_000);
  const watered = waterFarmCrop(planted, 0, 3_000);
  assert.equal(planted.plots[0].watered, false);
  assert.equal(planted.plots[0].matureAt, 22_000);
  assert.equal(watered.plots[0].watered, true);
  assert.equal(watered.plots[0].matureAt, 17_000);
  assert.equal(watered.coins, planted.coins);
  assert.equal(watered.actions, planted.actions + 1);
  assert.equal(watered.lastAction, 'water');
  assert.equal(farmRemainingMs(watered.plots[0], 3_000), 14_000);
  assertFailureDoesNotMutate(watered, () => waterFarmCrop(watered, 0, 4_000), /FARM_ALREADY_WATERED/);
});

test('readiness changes exactly at maturity while offline time grants no automatic reward', () => {
  const planted = plantFarmCrop(newFarmGame(10_000), 0, 'wheat', 10_000);
  const before = clone(planted);
  assert.equal(farmPlotStatus(planted.plots[0], 29_999), 'growing');
  assert.equal(farmRemainingMs(planted.plots[0], 29_999), 1);
  assert.ok(farmGrowthRatio(planted.plots[0], 29_999) < 1);
  assert.equal(farmPlotStatus(planted.plots[0], 30_000), 'ready');
  assert.equal(farmRemainingMs(planted.plots[0], 30_000), 0);
  assert.equal(farmGrowthRatio(planted.plots[0], 90_000), 1);
  assert.equal(planted.coins, FARM_STARTING_COINS - FARM_CROPS.wheat.seedCost);
  assert.equal(planted.xp, 0);
  assert.equal(planted.harvests, 0);
  assert.deepEqual(planted, before, 'observing an offline-mature crop must not mint rewards or mutate storage');
});

test('harvest requires maturity, pays the crop reward, clears the plot, and remains immutable', () => {
  const planted = plantFarmCrop(newFarmGame(1_000), 0, 'wheat', 2_000);
  assertFailureDoesNotMutate(planted, () => harvestFarmCrop(planted, 0, 21_999), /FARM_CROP_GROWING/);
  const harvested = harvestFarmCrop(planted, 0, 22_000);
  assert.equal(planted.plots[0].cropId, 'wheat');
  assert.deepEqual(harvested.plots[0], { cropId:null, plantedAt:null, matureAt:null, watered:false });
  assert.equal(harvested.coins, FARM_STARTING_COINS - FARM_CROPS.wheat.seedCost + FARM_CROPS.wheat.reward);
  assert.equal(harvested.xp, FARM_CROPS.wheat.xp);
  assert.equal(harvested.level, 1);
  assert.equal(harvested.harvests, 1);
  assert.equal(harvested.actions, 2);
  assert.equal(harvested.lastAction, 'harvest');
  assert.equal(farmHasProgress(harvested), true);
});

test('harvest-all collects only ready plots and unlocks level two at 30 XP', () => {
  let game = newFarmGame(0);
  for (let index = 0; index < FARM_PLOT_COUNT; index += 1) {
    game = plantFarmCrop(game, index, 'wheat', index * 1_000);
  }
  const before = clone(game);
  const harvested = harvestReadyFarmCrops(game, 25_000);
  assert.deepEqual(game, before);
  assert.equal(harvested.harvests, FARM_PLOT_COUNT);
  assert.equal(harvested.xp, FARM_CROPS.wheat.xp * FARM_PLOT_COUNT);
  assert.equal(harvested.level, 2);
  assert.equal(harvested.coins, FARM_STARTING_COINS
    - FARM_CROPS.wheat.seedCost * FARM_PLOT_COUNT
    + FARM_CROPS.wheat.reward * FARM_PLOT_COUNT);
  assert.equal(harvested.actions, FARM_PLOT_COUNT * 2);
  assert.equal(harvested.lastAction, 'harvest_all');
  assert.ok(harvested.plots.every((plot: any) => plot.cropId === null));

  const noReady = harvestReadyFarmCrops(plantFarmCrop(newFarmGame(50_000), 0, 'wheat', 50_000), 50_100);
  assert.equal(noReady.harvests, 0);
  assert.equal(noReady.plots[0].cropId, 'wheat');
});

test('invalid actions fail without changing the supplied game', () => {
  const empty = newFarmGame(1_000);
  assertFailureDoesNotMutate(empty, () => plantFarmCrop(empty, -1, 'wheat', 2_000), /FARM_PLOT_INVALID/);
  assertFailureDoesNotMutate(empty, () => plantFarmCrop(empty, 6, 'wheat', 2_000), /FARM_PLOT_INVALID/);
  assertFailureDoesNotMutate(empty, () => plantFarmCrop(empty, 0, 'carrot', 2_000), /FARM_CROP_LOCKED/);
  assertFailureDoesNotMutate(empty, () => waterFarmCrop(empty, 0, 2_000), /FARM_PLOT_EMPTY/);
  assertFailureDoesNotMutate(empty, () => harvestFarmCrop(empty, 0, 2_000), /FARM_PLOT_EMPTY/);

  const planted = plantFarmCrop(empty, 0, 'wheat', 2_000);
  assertFailureDoesNotMutate(planted, () => plantFarmCrop(planted, 0, 'wheat', 3_000), /FARM_PLOT_OCCUPIED/);
  const ready = { ...planted, updatedAt:planted.plots[0].matureAt };
  assertFailureDoesNotMutate(ready, () => waterFarmCrop(ready, 0, 0), /FARM_CROP_READY/);

  const broke = { ...empty, coins:0 };
  assertFailureDoesNotMutate(broke, () => plantFarmCrop(broke, 1, 'wheat', 2_000), /FARM_COINS_REQUIRED/);
});

test('mutations clamp a rolled-back clock to the persisted update timestamp', () => {
  const base = newFarmGame(10_000);
  const planted = plantFarmCrop(base, 0, 'wheat', 1_000);
  assert.equal(planted.updatedAt, 10_000);
  assert.equal(planted.plots[0].plantedAt, 10_000);
  assert.equal(planted.plots[0].matureAt, 30_000);

  const watered = waterFarmCrop(planted, 0, 2_000);
  assert.equal(watered.updatedAt, 10_000);
  assert.equal(watered.plots[0].matureAt, 25_000);

  const persistedAfterMaturity = { ...watered, updatedAt:25_000 };
  const harvested = harvestFarmCrop(persistedAfterMaturity, 0, 3_000);
  assert.equal(harvested.updatedAt, 25_000);
  assert.equal(harvested.harvests, 1);
});

test('restore round-trips without aliases and rejects malformed or inconsistent schemas', () => {
  const valid = waterFarmCrop(plantFarmCrop(newFarmGame(1_000), 0, 'wheat', 2_000), 0, 3_000);
  const serialized = clone(valid);
  const restored = restoreFarmGame(serialized);
  assert.deepEqual(restored, valid);
  assert.notEqual(restored, serialized);
  assert.notEqual(restored!.plots, serialized.plots);
  assert.notEqual(restored!.plots[0], serialized.plots[0]);

  const invalidStates = [
    null,
    { ...valid, schemaVersion:FARM_SCHEMA_VERSION + 1 },
    { ...valid, kind:'not-farm' },
    { ...valid, coins:-1 },
    { ...valid, xp:1.5 },
    { ...valid, level:3 },
    { ...valid, harvests:Number.MAX_SAFE_INTEGER + 1 },
    { ...valid, actions:-1 },
    { ...valid, selectedCrop:'missing' },
    { ...valid, selectedCrop:'strawberry' },
    { ...valid, plots:valid.plots.slice(0, 5) },
    { ...valid, plots:valid.plots.map((plot: any, index: number) => index === 0 ? { ...plot, matureAt:plot.matureAt + 1 } : plot) },
    { ...valid, plots:valid.plots.map((plot: any, index: number) => index === 1 ? { cropId:null, plantedAt:1, matureAt:null, watered:false } : plot) },
    { ...valid, plots:valid.plots.map((plot: any, index: number) => index === 0 ? { ...plot, plantedAt:valid.updatedAt + 1, matureAt:valid.updatedAt + 1 + (FARM_CROPS.wheat.growMs - FARM_CROPS.wheat.waterBonusMs) } : plot) },
    { ...valid, lastAction:'corrupt' },
    { ...valid, updatedAt:-1 },
  ];
  for (const candidate of invalidStates) assert.equal(restoreFarmGame(candidate), null);

  assert.equal(farmHasProgress(null), false);
  assert.equal(farmHasProgress({ ...valid, schemaVersion:99 }), false);
  assert.throws(() => plantFarmCrop({ ...valid, kind:'broken' }, 1, 'wheat', 4_000), /FARM_GAME_INVALID/);
  assert.throws(() => farmPlotStatus({ cropId:'wheat', plantedAt:0, matureAt:1, watered:false }, 0), /FARM_PLOT_STATE_INVALID/);
  assert.throws(() => farmRemainingMs(valid.plots[0], -1), /FARM_TIME_INVALID/);
  assert.throws(() => farmGrowthRatio(valid.plots[0], Number.NaN), /FARM_TIME_INVALID/);
});
