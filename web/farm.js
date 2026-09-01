export const FARM_SCHEMA_VERSION = 2;
export const FARM_PLOT_COUNT = 6;
export const FARM_STARTING_COINS = 36;
export const FARM_SEASON_DAYS = 9;
export const FARM_ACTIONS_PER_DAY = 5;

export const FARM_CROPS = Object.freeze({
  wheat: Object.freeze({
    id:'wheat', label:'小麦', glyph:'麦', unlockLevel:1, unlockXp:0,
    seedCost:4, reward:10, basePrice:10, xp:2, growDays:1, growMs:1_000, waterBonusMs:0,
  }),
  carrot: Object.freeze({
    id:'carrot', label:'胡萝卜', glyph:'萝', unlockLevel:2, unlockXp:10,
    seedCost:8, reward:22, basePrice:22, xp:4, growDays:2, growMs:2_000, waterBonusMs:0,
  }),
  strawberry: Object.freeze({
    id:'strawberry', label:'草莓', glyph:'莓', unlockLevel:3, unlockXp:30,
    seedCost:14, reward:40, basePrice:40, xp:7, growDays:3, growMs:3_000, waterBonusMs:0,
  }),
});

const FARM_LEVEL_THRESHOLDS = Object.freeze([0, 10, 30]);
const FARM_MARKET_CYCLE = Object.freeze(['wheat', 'carrot', 'strawberry']);
const VALID_LAST_ACTIONS = new Set([
  'new', 'select', 'plant', 'water', 'harvest', 'harvest_all', 'clear', 'advance_day',
]);
const VALID_STATUSES = new Set(['playing', 'finished']);
const VALID_MEDALS = new Set(['none', 'bronze', 'silver', 'gold']);

function emptyPlot() {
  return {
    kind:'empty', cropId:null, plantedDay:null, growthDays:0,
    wateredToday:false, dryStreak:0,
  };
}

function weedPlot() {
  return {
    kind:'weed', cropId:null, plantedDay:null, growthDays:0,
    wateredToday:false, dryStreak:0,
  };
}

function clonePlot(plot) {
  return {
    kind:plot.kind,
    cropId:plot.cropId,
    plantedDay:plot.plantedDay,
    growthDays:plot.growthDays,
    wateredToday:plot.wateredToday,
    dryStreak:plot.dryStreak,
  };
}

function cloneResult(result) {
  return result ? {
    finalCoins:result.finalCoins,
    profit:result.profit,
    xp:result.xp,
    harvests:result.harvests,
    medal:result.medal,
  } : null;
}

function validCounter(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function addCounter(value, increment) {
  const next = value + increment;
  if (!validCounter(next)) throw new Error('FARM_COUNTER_OVERFLOW');
  return next;
}

function normalizedPlotIndex(index) {
  if (!Number.isInteger(index) || index < 0 || index >= FARM_PLOT_COUNT) throw new Error('FARM_PLOT_INVALID');
  return index;
}

function validDay(day) {
  return Number.isInteger(day) && day >= 1 && day <= FARM_SEASON_DAYS;
}

function validPlot(plot, day) {
  if (!plot || typeof plot !== 'object' || !['empty', 'crop', 'weed'].includes(plot.kind)) return false;
  if (typeof plot.wateredToday !== 'boolean'
    || !validCounter(plot.growthDays)
    || !validCounter(plot.dryStreak)) return false;
  if (plot.kind !== 'crop') {
    return plot.cropId === null
      && plot.plantedDay === null
      && plot.growthDays === 0
      && plot.wateredToday === false
      && plot.dryStreak === 0;
  }
  if (!Object.hasOwn(FARM_CROPS, plot.cropId)) return false;
  const crop = FARM_CROPS[plot.cropId];
  if (!Number.isInteger(plot.plantedDay) || plot.plantedDay < 1 || plot.plantedDay > day) return false;
  if (plot.growthDays > crop.growDays || plot.dryStreak > 1) return false;
  if (plot.wateredToday && plot.dryStreak !== 0) return false;
  if (plot.growthDays === crop.growDays
    && (plot.wateredToday || plot.dryStreak !== 0)) return false;
  return true;
}

export function farmLevelForXp(xp) {
  if (!validCounter(xp)) throw new Error('FARM_XP_INVALID');
  let level = 1;
  for (let index = 1; index < FARM_LEVEL_THRESHOLDS.length; index += 1) {
    if (xp >= FARM_LEVEL_THRESHOLDS[index]) level = index + 1;
  }
  return level;
}

export function farmNextLevelXp(level) {
  if (!Number.isInteger(level) || level < 1 || level > FARM_LEVEL_THRESHOLDS.length) throw new Error('FARM_LEVEL_INVALID');
  return FARM_LEVEL_THRESHOLDS[level] ?? null;
}

export function farmMarketForDay(day) {
  if (!validDay(day)) throw new Error('FARM_DAY_INVALID');
  const focusId = FARM_MARKET_CYCLE[(day - 1) % FARM_MARKET_CYCLE.length];
  const tomorrowFocusId = FARM_MARKET_CYCLE[day % FARM_MARKET_CYCLE.length];
  const prices = Object.fromEntries(Object.values(FARM_CROPS).map((crop) => [
    crop.id,
    crop.id === focusId ? Math.round(crop.basePrice * 1.25) : crop.basePrice,
  ]));
  return Object.freeze({ day, focusId, tomorrowFocusId, prices:Object.freeze(prices) });
}

export function farmSeasonMedal(coins) {
  if (!validCounter(coins)) throw new Error('FARM_COINS_INVALID');
  if (coins >= 330) return 'gold';
  if (coins >= 250) return 'silver';
  if (coins >= 160) return 'bronze';
  return 'none';
}

export function newFarmGame() {
  return {
    schemaVersion:FARM_SCHEMA_VERSION,
    kind:'farm',
    status:'playing',
    day:1,
    actionsLeft:FARM_ACTIONS_PER_DAY,
    coins:FARM_STARTING_COINS,
    xp:0,
    level:1,
    harvests:0,
    actions:0,
    revision:0,
    selectedCrop:'wheat',
    plots:Array.from({ length:FARM_PLOT_COUNT }, emptyPlot),
    lastAction:'new',
    result:null,
  };
}

function validResult(result, game) {
  if (game.status === 'playing') return result === null;
  if (!result || typeof result !== 'object' || !VALID_MEDALS.has(result.medal)) return false;
  return result.finalCoins === game.coins
    && result.profit === game.coins - FARM_STARTING_COINS
    && result.xp === game.xp
    && result.harvests === game.harvests
    && result.medal === farmSeasonMedal(game.coins);
}

function validateFarmGame(value) {
  if (!value || typeof value !== 'object'
    || value.schemaVersion !== FARM_SCHEMA_VERSION
    || value.kind !== 'farm'
    || !VALID_STATUSES.has(value.status)
    || !validDay(value.day)) return null;
  if (!validCounter(value.coins)
    || !validCounter(value.xp)
    || !validCounter(value.harvests)
    || !validCounter(value.actions)
    || !validCounter(value.revision)) return null;
  if (!Number.isInteger(value.actionsLeft)
    || value.actionsLeft < 0
    || value.actionsLeft > FARM_ACTIONS_PER_DAY) return null;
  if (value.status === 'finished' && (value.day !== FARM_SEASON_DAYS || value.actionsLeft !== 0)) return null;
  if (value.actions > value.day * FARM_ACTIONS_PER_DAY || value.harvests > value.actions) return null;
  if (value.revision < value.actions) return null;
  if (!Number.isInteger(value.level) || value.level !== farmLevelForXp(value.xp)) return null;
  if (!Object.hasOwn(FARM_CROPS, value.selectedCrop)
    || FARM_CROPS[value.selectedCrop].unlockXp > value.xp) return null;
  if (!Array.isArray(value.plots)
    || value.plots.length !== FARM_PLOT_COUNT
    || !value.plots.every((plot) => validPlot(plot, value.day))) return null;
  if (!VALID_LAST_ACTIONS.has(value.lastAction) || !validResult(value.result, value)) return null;
  return {
    schemaVersion:FARM_SCHEMA_VERSION,
    kind:'farm',
    status:value.status,
    day:value.day,
    actionsLeft:value.actionsLeft,
    coins:value.coins,
    xp:value.xp,
    level:value.level,
    harvests:value.harvests,
    actions:value.actions,
    revision:value.revision,
    selectedCrop:value.selectedCrop,
    plots:value.plots.map(clonePlot),
    lastAction:value.lastAction,
    result:cloneResult(value.result),
  };
}

export function restoreFarmGame(value) {
  return validateFarmGame(value);
}

function requireFarmGame(game) {
  const restored = validateFarmGame(game);
  if (!restored) throw new Error('FARM_GAME_INVALID');
  return restored;
}

function requirePlayable(game) {
  const restored = requireFarmGame(game);
  if (restored.status !== 'playing') throw new Error('FARM_SEASON_FINISHED');
  return restored;
}

function spendAction(game) {
  if (game.actionsLeft < 1) throw new Error('FARM_ACTIONS_REQUIRED');
  return {
    actionsLeft:game.actionsLeft - 1,
    actions:addCounter(game.actions, 1),
    revision:addCounter(game.revision, 1),
  };
}

export function farmPlotStatus(plot) {
  if (!validPlot(plot, FARM_SEASON_DAYS)) throw new Error('FARM_PLOT_STATE_INVALID');
  if (plot.kind === 'empty') return 'empty';
  if (plot.kind === 'weed') return 'weed';
  return plot.growthDays >= FARM_CROPS[plot.cropId].growDays ? 'ready' : 'growing';
}

export function farmRemainingDays(plot) {
  if (!validPlot(plot, FARM_SEASON_DAYS)) throw new Error('FARM_PLOT_STATE_INVALID');
  if (plot.kind !== 'crop') return 0;
  return Math.max(0, FARM_CROPS[plot.cropId].growDays - plot.growthDays);
}

// Compatibility for the existing browser formatter while the route adopts day labels.
export function farmRemainingMs(plot) {
  return farmRemainingDays(plot) * 1_000;
}

export function farmGrowthRatio(plot) {
  if (!validPlot(plot, FARM_SEASON_DAYS)) throw new Error('FARM_PLOT_STATE_INVALID');
  if (plot.kind !== 'crop') return 0;
  return Math.min(1, plot.growthDays / FARM_CROPS[plot.cropId].growDays);
}

export function farmHasProgress(game) {
  const restored = validateFarmGame(game);
  if (!restored) return false;
  return restored.status === 'finished'
    || restored.day > 1
    || restored.actions > 0
    || restored.harvests > 0
    || restored.xp > 0
    || restored.coins !== FARM_STARTING_COINS
    || restored.plots.some((plot) => plot.kind !== 'empty');
}

export function selectFarmCrop(game, cropId) {
  const restored = requirePlayable(game);
  const crop = FARM_CROPS[cropId];
  if (!crop) throw new Error('FARM_CROP_INVALID');
  if (crop.unlockXp > restored.xp) throw new Error('FARM_CROP_LOCKED');
  if (restored.selectedCrop === cropId) return restored;
  return {
    ...restored,
    selectedCrop:cropId,
    lastAction:'select',
    revision:addCounter(restored.revision, 1),
  };
}

export function plantFarmCrop(game, plotIndex, cropId = game?.selectedCrop) {
  const restored = requirePlayable(game);
  const index = normalizedPlotIndex(plotIndex);
  const crop = FARM_CROPS[cropId];
  if (!crop) throw new Error('FARM_CROP_INVALID');
  if (crop.unlockXp > restored.xp) throw new Error('FARM_CROP_LOCKED');
  if (restored.plots[index].kind !== 'empty') throw new Error('FARM_PLOT_OCCUPIED');
  if (restored.coins < crop.seedCost) throw new Error('FARM_COINS_REQUIRED');
  const action = spendAction(restored);
  const plots = restored.plots.map(clonePlot);
  plots[index] = {
    kind:'crop', cropId, plantedDay:restored.day, growthDays:0,
    wateredToday:true, dryStreak:0,
  };
  return {
    ...restored,
    ...action,
    coins:restored.coins - crop.seedCost,
    plots,
    lastAction:'plant',
  };
}

export function waterFarmCrop(game, plotIndex) {
  const restored = requirePlayable(game);
  const index = normalizedPlotIndex(plotIndex);
  const plot = restored.plots[index];
  if (plot.kind === 'empty' || plot.kind === 'weed') throw new Error('FARM_PLOT_EMPTY');
  if (farmPlotStatus(plot) === 'ready') throw new Error('FARM_CROP_READY');
  if (plot.wateredToday) throw new Error('FARM_ALREADY_WATERED');
  const action = spendAction(restored);
  const plots = restored.plots.map(clonePlot);
  plots[index] = { ...plots[index], wateredToday:true, dryStreak:0 };
  return { ...restored, ...action, plots, lastAction:'water' };
}

export function harvestFarmCrop(game, plotIndex) {
  const restored = requirePlayable(game);
  const index = normalizedPlotIndex(plotIndex);
  const plot = restored.plots[index];
  if (plot.kind !== 'crop') throw new Error('FARM_PLOT_EMPTY');
  if (farmPlotStatus(plot) !== 'ready') throw new Error('FARM_CROP_GROWING');
  const action = spendAction(restored);
  const crop = FARM_CROPS[plot.cropId];
  const reward = farmMarketForDay(restored.day).prices[crop.id];
  const xp = addCounter(restored.xp, crop.xp);
  const plots = restored.plots.map(clonePlot);
  plots[index] = emptyPlot();
  return {
    ...restored,
    ...action,
    coins:addCounter(restored.coins, reward),
    xp,
    level:farmLevelForXp(xp),
    harvests:addCounter(restored.harvests, 1),
    plots,
    lastAction:'harvest',
  };
}

export function harvestReadyFarmCrops(game) {
  let next = requirePlayable(game);
  let harvested = 0;
  for (let index = 0; index < FARM_PLOT_COUNT && next.actionsLeft > 0; index += 1) {
    if (next.plots[index].kind === 'crop' && farmPlotStatus(next.plots[index]) === 'ready') {
      next = harvestFarmCrop(next, index);
      harvested += 1;
    }
  }
  return harvested ? { ...next, lastAction:'harvest_all' } : next;
}

export function clearFarmPlot(game, plotIndex) {
  const restored = requirePlayable(game);
  const index = normalizedPlotIndex(plotIndex);
  if (restored.plots[index].kind !== 'weed') throw new Error('FARM_WEED_REQUIRED');
  const action = spendAction(restored);
  const plots = restored.plots.map(clonePlot);
  plots[index] = emptyPlot();
  return { ...restored, ...action, plots, lastAction:'clear' };
}

export function advanceFarmDay(game) {
  const restored = requirePlayable(game);
  const plots = restored.plots.map((plot) => {
    if (plot.kind !== 'crop') return clonePlot(plot);
    if (farmPlotStatus(plot) === 'ready') return { ...clonePlot(plot), wateredToday:false, dryStreak:0 };
    if (plot.wateredToday) {
      const crop = FARM_CROPS[plot.cropId];
      return {
        ...clonePlot(plot),
        growthDays:Math.min(crop.growDays, plot.growthDays + 1),
        wateredToday:false,
        dryStreak:0,
      };
    }
    const dryDays = plot.dryStreak + 1;
    return dryDays >= 2
      ? weedPlot()
      : { ...clonePlot(plot), wateredToday:false, dryStreak:dryDays };
  });
  const revision = addCounter(restored.revision, 1);
  if (restored.day === FARM_SEASON_DAYS) {
    const result = {
      finalCoins:restored.coins,
      profit:restored.coins - FARM_STARTING_COINS,
      xp:restored.xp,
      harvests:restored.harvests,
      medal:farmSeasonMedal(restored.coins),
    };
    return {
      ...restored,
      status:'finished',
      actionsLeft:0,
      revision,
      plots,
      lastAction:'advance_day',
      result,
    };
  }
  return {
    ...restored,
    day:restored.day + 1,
    actionsLeft:FARM_ACTIONS_PER_DAY,
    revision,
    plots,
    lastAction:'advance_day',
  };
}
