import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FARM_ACTIONS_PER_DAY,
  FARM_CROPS,
  FARM_PLOT_COUNT,
  FARM_SCHEMA_VERSION,
  FARM_SEASON_DAYS,
  FARM_STARTING_COINS,
  advanceFarmDay,
  clearFarmPlot,
  farmGrowthRatio,
  farmHasProgress,
  farmLevelForXp,
  farmMarketForDay,
  farmNextLevelXp,
  farmPlotStatus,
  farmRemainingDays,
  farmRemainingMs,
  farmSeasonMedal,
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

function plantFive(game: any, cropId: string) {
  let next = game;
  for (let index = 0; index < 5; index += 1) next = plantFarmCrop(next, index, cropId);
  return next;
}

function waterFive(game: any) {
  let next = game;
  for (let index = 0; index < 5; index += 1) next = waterFarmCrop(next, index);
  return next;
}

function reachCarrotUnlock() {
  let game = plantFive(newFarmGame(), 'wheat');
  game = advanceFarmDay(game);
  game = harvestReadyFarmCrops(game);
  return game;
}

function playStandardRoute({ harvestStrawberries = true } = {}) {
  let game = plantFive(newFarmGame(), 'wheat');
  game = advanceFarmDay(game); // Day 2: wheat is ready.
  game = harvestReadyFarmCrops(game);
  game = advanceFarmDay(game); // Day 3.

  game = selectFarmCrop(game, 'carrot');
  game = plantFive(game, 'carrot');
  game = advanceFarmDay(game); // Day 4: one growth day.
  game = waterFive(game);
  game = advanceFarmDay(game); // Day 5: carrot is ready and focused.
  game = harvestReadyFarmCrops(game);
  game = advanceFarmDay(game); // Day 6.

  game = selectFarmCrop(game, 'strawberry');
  game = plantFive(game, 'strawberry');
  game = advanceFarmDay(game); // Day 7: one growth day.
  game = waterFive(game);
  game = advanceFarmDay(game); // Day 8: two growth days.
  game = waterFive(game);
  game = advanceFarmDay(game); // Day 9: strawberry is ready and focused.
  if (harvestStrawberries) game = harvestReadyFarmCrops(game);
  return game;
}

test('new seasons are deterministic, serializable, and begin with six empty plots', () => {
  const game = newFarmGame(123_456);
  assert.deepEqual(game, newFarmGame(999_999), 'legacy timestamp arguments must not affect turn state');
  assert.equal(game.schemaVersion, FARM_SCHEMA_VERSION);
  assert.equal(game.kind, 'farm');
  assert.equal(game.status, 'playing');
  assert.equal(game.day, 1);
  assert.equal(game.actionsLeft, FARM_ACTIONS_PER_DAY);
  assert.equal(game.coins, FARM_STARTING_COINS);
  assert.equal(game.xp, 0);
  assert.equal(game.level, 1);
  assert.equal(game.result, null);
  assert.equal(game.plots.length, FARM_PLOT_COUNT);
  assert.ok(game.plots.every((plot: any) => farmPlotStatus(plot) === 'empty'));
  assert.deepEqual(JSON.parse(JSON.stringify(game)), game);
  assert.equal(farmHasProgress(game), false);
});

test('market focus, level thresholds, medals, and crop balance are exact', () => {
  assert.deepEqual(farmMarketForDay(1), {
    day:1, focusId:'wheat', tomorrowFocusId:'carrot',
    prices:{ wheat:13, carrot:22, strawberry:40 },
  });
  assert.deepEqual(farmMarketForDay(2), {
    day:2, focusId:'carrot', tomorrowFocusId:'strawberry',
    prices:{ wheat:10, carrot:28, strawberry:40 },
  });
  assert.deepEqual(farmMarketForDay(3), {
    day:3, focusId:'strawberry', tomorrowFocusId:'wheat',
    prices:{ wheat:10, carrot:22, strawberry:50 },
  });
  assert.equal(farmMarketForDay(9).focusId, 'strawberry');
  assert.throws(() => farmMarketForDay(0), /FARM_DAY_INVALID/);
  assert.throws(() => farmMarketForDay(10), /FARM_DAY_INVALID/);

  assert.deepEqual(
    Object.values(FARM_CROPS).map(({ seedCost, basePrice, growDays, xp, unlockXp }) => ({ seedCost, basePrice, growDays, xp, unlockXp })),
    [
      { seedCost:4, basePrice:10, growDays:1, xp:2, unlockXp:0 },
      { seedCost:8, basePrice:22, growDays:2, xp:4, unlockXp:10 },
      { seedCost:14, basePrice:40, growDays:3, xp:7, unlockXp:30 },
    ],
  );
  assert.equal(farmLevelForXp(9), 1);
  assert.equal(farmLevelForXp(10), 2);
  assert.equal(farmLevelForXp(30), 3);
  assert.equal(farmNextLevelXp(1), 10);
  assert.equal(farmNextLevelXp(2), 30);
  assert.equal(farmNextLevelXp(3), null);
  assert.deepEqual([159, 160, 249, 250, 329, 330].map(farmSeasonMedal), [
    'none', 'bronze', 'bronze', 'silver', 'silver', 'gold',
  ]);
});

test('planting consumes one action, counts as watered, and cannot exceed the daily budget', () => {
  const original = newFarmGame();
  const planted = plantFarmCrop(original, 2, 'wheat', 987_654);
  assert.equal(original.coins, FARM_STARTING_COINS);
  assert.equal(original.plots[2].kind, 'empty');
  assert.equal(planted.coins, 32);
  assert.equal(planted.actionsLeft, 4);
  assert.equal(planted.actions, 1);
  assert.equal(planted.revision, 1);
  assert.deepEqual(planted.plots[2], {
    kind:'crop', cropId:'wheat', plantedDay:1, growthDays:0,
    wateredToday:true, dryStreak:0,
  });
  assert.equal(farmPlotStatus(planted.plots[2]), 'growing');
  assert.equal(farmRemainingDays(planted.plots[2]), 1);
  assert.equal(farmRemainingMs(planted.plots[2]), 1_000);
  assert.equal(farmGrowthRatio(planted.plots[2]), 0);
  assert.equal(farmHasProgress(planted), true);

  const five = plantFive(newFarmGame(), 'wheat');
  assert.equal(five.actionsLeft, 0);
  assertFailureDoesNotMutate(five, () => plantFarmCrop(five, 5, 'wheat'), /FARM_ACTIONS_REQUIRED/);
});

test('day advancement applies growth only at day end and resets the action budget', () => {
  const planted = plantFarmCrop(newFarmGame(), 0, 'wheat');
  assert.equal(farmPlotStatus(planted.plots[0]), 'growing');
  const dayTwo = advanceFarmDay(planted);
  assert.equal(dayTwo.day, 2);
  assert.equal(dayTwo.actionsLeft, FARM_ACTIONS_PER_DAY);
  assert.equal(dayTwo.plots[0].growthDays, 1);
  assert.equal(dayTwo.plots[0].wateredToday, false);
  assert.equal(farmPlotStatus(dayTwo.plots[0]), 'ready');
  assert.equal(farmRemainingDays(dayTwo.plots[0]), 0);
  assert.equal(farmGrowthRatio(dayTwo.plots[0]), 1);
});

test('watering is once per day, costs one action, and prevents drought without mutating input', () => {
  let game = reachCarrotUnlock();
  game = advanceFarmDay(game);
  game = selectFarmCrop(game, 'carrot');
  const planted = plantFarmCrop(game, 0, 'carrot');
  const nextDay = advanceFarmDay(planted);
  assert.equal(nextDay.plots[0].growthDays, 1);
  assert.equal(nextDay.plots[0].wateredToday, false);

  const watered = waterFarmCrop(nextDay, 0, 123_456);
  assert.equal(nextDay.actionsLeft, FARM_ACTIONS_PER_DAY);
  assert.equal(watered.actionsLeft, FARM_ACTIONS_PER_DAY - 1);
  assert.equal(watered.plots[0].wateredToday, true);
  assertFailureDoesNotMutate(watered, () => waterFarmCrop(watered, 0), /FARM_ALREADY_WATERED/);

  const ready = advanceFarmDay(watered);
  assert.equal(farmPlotStatus(ready.plots[0]), 'ready');
  assert.equal(ready.plots[0].dryStreak, 0);
  assertFailureDoesNotMutate(ready, () => waterFarmCrop(ready, 0), /FARM_CROP_READY/);
});

test('two consecutive dry day ends turn a growing crop into a weed that costs one action to clear', () => {
  let game = reachCarrotUnlock();
  game = advanceFarmDay(game); // Day 3.
  game = plantFarmCrop(selectFarmCrop(game, 'carrot'), 0, 'carrot');
  game = advanceFarmDay(game); // Day 4, growth 1.
  game = advanceFarmDay(game); // Day 5, first dry day.
  assert.equal(farmPlotStatus(game.plots[0]), 'growing');
  assert.equal(game.plots[0].dryStreak, 1);
  const beforeWeed = clone(game);
  game = advanceFarmDay(game); // Day 6, second dry day.
  assert.deepEqual(beforeWeed.plots[0], {
    kind:'crop', cropId:'carrot', plantedDay:3, growthDays:1,
    wateredToday:false, dryStreak:1,
  });
  assert.equal(farmPlotStatus(game.plots[0]), 'weed');
  const actionsBefore = game.actionsLeft;
  const cleared = clearFarmPlot(game, 0);
  assert.equal(cleared.actionsLeft, actionsBefore - 1);
  assert.equal(farmPlotStatus(cleared.plots[0]), 'empty');
  assertFailureDoesNotMutate(cleared, () => clearFarmPlot(cleared, 0), /FARM_WEED_REQUIRED/);
});

test('harvest uses the current daily market, clears the plot, and unlocks crops by XP', () => {
  let game = plantFive(newFarmGame(), 'wheat');
  game = advanceFarmDay(game); // Day 2, wheat is not focused and sells for 10.
  const before = clone(game);
  game = harvestFarmCrop(game, 0, 111_111);
  assert.deepEqual(before.plots[0], {
    kind:'crop', cropId:'wheat', plantedDay:1, growthDays:1,
    wateredToday:false, dryStreak:0,
  });
  assert.equal(game.coins, 16 + 10);
  assert.equal(game.xp, 2);
  assert.equal(game.harvests, 1);
  assert.equal(farmPlotStatus(game.plots[0]), 'empty');
  assertFailureDoesNotMutate(game, () => harvestFarmCrop(game, 5), /FARM_PLOT_EMPTY/);

  game = harvestReadyFarmCrops(game);
  assert.equal(game.coins, 66);
  assert.equal(game.xp, 10);
  assert.equal(game.level, 2);
  assert.equal(game.harvests, 5);
  assert.equal(game.actionsLeft, 0);
  assert.equal(selectFarmCrop(game, 'carrot').selectedCrop, 'carrot');
  assertFailureDoesNotMutate(game, () => selectFarmCrop(game, 'strawberry'), /FARM_CROP_LOCKED/);
});

test('harvest-all charges one action per plot and truncates in index order', () => {
  let game = plantFive(newFarmGame(), 'wheat');
  game = advanceFarmDay(game);
  const limited = { ...game, actionsLeft:2 };
  const harvested = harvestReadyFarmCrops(limited, 999_999);
  assert.equal(harvested.harvests, 2);
  assert.equal(harvested.actionsLeft, 0);
  assert.equal(harvested.lastAction, 'harvest_all');
  assert.deepEqual(harvested.plots.map((plot: any) => plot.kind), [
    'empty', 'empty', 'crop', 'crop', 'crop', 'empty',
  ]);
});

test('the canonical nine-day route closes at 346 coins, 65 XP, and 15 harvests', () => {
  const dayNine = playStandardRoute();
  assert.equal(dayNine.day, FARM_SEASON_DAYS);
  assert.equal(dayNine.status, 'playing');
  assert.equal(dayNine.coins, 346);
  assert.equal(dayNine.xp, 65);
  assert.equal(dayNine.level, 3);
  assert.equal(dayNine.harvests, 15);
  assert.equal(dayNine.actions, FARM_SEASON_DAYS * FARM_ACTIONS_PER_DAY);
  assert.equal(farmSeasonMedal(dayNine.coins), 'gold');

  const finished = advanceFarmDay(dayNine);
  assert.equal(finished.status, 'finished');
  assert.equal(finished.day, FARM_SEASON_DAYS);
  assert.equal(finished.actionsLeft, 0);
  assert.deepEqual(finished.result, {
    finalCoins:346,
    profit:310,
    xp:65,
    harvests:15,
    medal:'gold',
  });
  assert.equal(farmHasProgress(finished), true);
  assertFailureDoesNotMutate(finished, () => advanceFarmDay(finished), /FARM_SEASON_FINISHED/);
  assertFailureDoesNotMutate(finished, () => plantFarmCrop(finished, 5, 'wheat'), /FARM_SEASON_FINISHED/);
});

test('unharvested field crops receive no season-end liquidation value', () => {
  const dayNine = playStandardRoute({ harvestStrawberries:false });
  assert.equal(dayNine.coins, 96);
  assert.ok(dayNine.plots.slice(0, 5).every((plot: any) => farmPlotStatus(plot) === 'ready'));
  const finished = advanceFarmDay(dayNine);
  assert.equal(finished.result.finalCoins, 96);
  assert.equal(finished.result.profit, 60);
  assert.equal(finished.result.medal, 'none');
  assert.equal(finished.harvests, 10);
  assert.ok(finished.plots.slice(0, 5).every((plot: any) => farmPlotStatus(plot) === 'ready'));
});

test('restore round-trips without aliases and rejects malformed or inconsistent saves', () => {
  const valid = advanceFarmDay(plantFarmCrop(newFarmGame(), 0, 'wheat'));
  const serialized = clone(valid);
  const restored = restoreFarmGame(serialized);
  assert.deepEqual(restored, valid);
  assert.notEqual(restored, serialized);
  assert.notEqual(restored!.plots, serialized.plots);
  assert.notEqual(restored!.plots[0], serialized.plots[0]);

  const invalidStates = [
    null,
    { ...valid, schemaVersion:1 },
    { ...valid, kind:'not-farm' },
    { ...valid, status:'unknown' },
    { ...valid, day:0 },
    { ...valid, day:FARM_SEASON_DAYS + 1 },
    { ...valid, actionsLeft:FARM_ACTIONS_PER_DAY + 1 },
    { ...valid, coins:-1 },
    { ...valid, xp:10, level:1 },
    { ...valid, actions:valid.day * FARM_ACTIONS_PER_DAY + 1 },
    { ...valid, revision:0 },
    { ...valid, selectedCrop:'carrot' },
    { ...valid, plots:valid.plots.slice(0, 5) },
    { ...valid, plots:valid.plots.map((plot: any, index: number) => index === 0 ? { ...plot, kind:'missing' } : plot) },
    { ...valid, plots:valid.plots.map((plot: any, index: number) => index === 0 ? { ...plot, plantedDay:3 } : plot) },
    { ...valid, plots:valid.plots.map((plot: any, index: number) => index === 0 ? { ...plot, growthDays:2 } : plot) },
    { ...valid, plots:valid.plots.map((plot: any, index: number) => index === 0 ? { ...plot, wateredToday:true } : plot) },
    { ...valid, lastAction:'corrupt' },
    { ...valid, result:{ finalCoins:999, profit:963, xp:0, harvests:0, medal:'gold' } },
    { ...valid, status:'finished', actionsLeft:0, result:{ finalCoins:valid.coins, profit:valid.coins - 36, xp:valid.xp, harvests:valid.harvests, medal:farmSeasonMedal(valid.coins) } },
  ];
  for (const candidate of invalidStates) assert.equal(restoreFarmGame(candidate), null);

  assert.equal(farmHasProgress(null), false);
  assert.equal(farmHasProgress({ ...valid, schemaVersion:99 }), false);
  assert.throws(() => plantFarmCrop({ ...valid, kind:'broken' }, 1, 'wheat'), /FARM_GAME_INVALID/);
  assert.throws(() => farmPlotStatus({ kind:'crop', cropId:'wheat', plantedDay:1, growthDays:2, wateredToday:false, dryStreak:0 }), /FARM_PLOT_STATE_INVALID/);
  assert.throws(() => farmGrowthRatio({ kind:'weed', cropId:'wheat', plantedDay:null, growthDays:0, wateredToday:false, dryStreak:0 }), /FARM_PLOT_STATE_INVALID/);
});

test('identical action sequences are deterministic and wall-clock arguments are ignored', () => {
  const run = (stamp: number) => {
    let game = newFarmGame(stamp);
    game = plantFarmCrop(game, 0, 'wheat', stamp + 10);
    game = advanceFarmDay(game, stamp + 99);
    game = harvestFarmCrop(game, 0, stamp + 1_000_000);
    return game;
  };
  assert.deepEqual(run(1), run(9_999_999_999));
});
