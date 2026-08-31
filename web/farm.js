export const FARM_SCHEMA_VERSION = 1;
export const FARM_PLOT_COUNT = 6;
export const FARM_STARTING_COINS = 36;

export const FARM_CROPS = Object.freeze({
  wheat: Object.freeze({
    id:'wheat', label:'小麦', glyph:'麦', unlockLevel:1,
    seedCost:4, reward:10, xp:6, growMs:20_000, waterBonusMs:5_000,
  }),
  carrot: Object.freeze({
    id:'carrot', label:'胡萝卜', glyph:'萝', unlockLevel:2,
    seedCost:8, reward:22, xp:10, growMs:45_000, waterBonusMs:10_000,
  }),
  strawberry: Object.freeze({
    id:'strawberry', label:'草莓', glyph:'莓', unlockLevel:3,
    seedCost:14, reward:38, xp:16, growMs:90_000, waterBonusMs:20_000,
  }),
});

const FARM_LEVEL_THRESHOLDS = Object.freeze([0, 30, 80]);
const VALID_LAST_ACTIONS = new Set(['new', 'select', 'plant', 'water', 'harvest', 'harvest_all']);

function emptyPlot() {
  return { cropId:null, plantedAt:null, matureAt:null, watered:false };
}

function clonePlot(plot) {
  return { cropId:plot.cropId, plantedAt:plot.plantedAt, matureAt:plot.matureAt, watered:plot.watered };
}

function validCounter(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function validTimestamp(value) {
  return validCounter(value);
}

function addCounter(value, increment) {
  const next = value + increment;
  if (!validCounter(next)) throw new Error('FARM_COUNTER_OVERFLOW');
  return next;
}

function normalizedNow(now) {
  if (!validTimestamp(now)) throw new Error('FARM_TIME_INVALID');
  return now;
}

function normalizedPlotIndex(index) {
  if (!Number.isInteger(index) || index < 0 || index >= FARM_PLOT_COUNT) throw new Error('FARM_PLOT_INVALID');
  return index;
}

function validPlot(plot) {
  if (!plot || typeof plot !== 'object' || typeof plot.watered !== 'boolean') return false;
  if (plot.cropId === null) {
    return plot.plantedAt === null && plot.matureAt === null && plot.watered === false;
  }
  if (!Object.hasOwn(FARM_CROPS, plot.cropId)) return false;
  const crop = FARM_CROPS[plot.cropId];
  const expectedDuration = crop.growMs - (plot.watered ? crop.waterBonusMs : 0);
  return validTimestamp(plot.plantedAt)
    && validTimestamp(plot.matureAt)
    && plot.matureAt - plot.plantedAt === expectedDuration;
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

export function newFarmGame(now = Date.now()) {
  const timestamp = normalizedNow(now);
  return {
    schemaVersion:FARM_SCHEMA_VERSION,
    kind:'farm',
    coins:FARM_STARTING_COINS,
    xp:0,
    level:1,
    harvests:0,
    actions:0,
    selectedCrop:'wheat',
    plots:Array.from({ length:FARM_PLOT_COUNT }, emptyPlot),
    lastAction:'new',
    updatedAt:timestamp,
  };
}

function validateFarmGame(value) {
  if (!value || typeof value !== 'object' || value.schemaVersion !== FARM_SCHEMA_VERSION || value.kind !== 'farm') return null;
  if (!validCounter(value.coins) || !validCounter(value.xp) || !validCounter(value.harvests) || !validCounter(value.actions)) return null;
  if (!Number.isInteger(value.level) || value.level !== farmLevelForXp(value.xp)) return null;
  if (!Object.hasOwn(FARM_CROPS, value.selectedCrop) || FARM_CROPS[value.selectedCrop].unlockLevel > value.level) return null;
  if (!Array.isArray(value.plots) || value.plots.length !== FARM_PLOT_COUNT || !value.plots.every(validPlot)) return null;
  if (!VALID_LAST_ACTIONS.has(value.lastAction) || !validTimestamp(value.updatedAt)) return null;
  if (value.plots.some((plot) => plot.plantedAt !== null && plot.plantedAt > value.updatedAt)) return null;
  return {
    schemaVersion:FARM_SCHEMA_VERSION,
    kind:'farm',
    coins:value.coins,
    xp:value.xp,
    level:value.level,
    harvests:value.harvests,
    actions:value.actions,
    selectedCrop:value.selectedCrop,
    plots:value.plots.map(clonePlot),
    lastAction:value.lastAction,
    updatedAt:value.updatedAt,
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

function effectiveMutationNow(game, now) {
  return Math.max(normalizedNow(now), game.updatedAt);
}

export function farmPlotStatus(plot, now = Date.now()) {
  const timestamp = normalizedNow(now);
  if (!validPlot(plot)) throw new Error('FARM_PLOT_STATE_INVALID');
  if (plot.cropId === null) return 'empty';
  return timestamp >= plot.matureAt ? 'ready' : 'growing';
}

export function farmRemainingMs(plot, now = Date.now()) {
  const timestamp = normalizedNow(now);
  if (!validPlot(plot)) throw new Error('FARM_PLOT_STATE_INVALID');
  if (plot.cropId === null) return 0;
  return Math.max(0, plot.matureAt - timestamp);
}

export function farmGrowthRatio(plot, now = Date.now()) {
  const timestamp = normalizedNow(now);
  if (!validPlot(plot)) throw new Error('FARM_PLOT_STATE_INVALID');
  if (plot.cropId === null) return 0;
  const duration = Math.max(1, plot.matureAt - plot.plantedAt);
  return Math.min(1, Math.max(0, (timestamp - plot.plantedAt) / duration));
}

export function farmHasProgress(game) {
  const restored = validateFarmGame(game);
  if (!restored) return false;
  return restored.harvests > 0
    || restored.xp > 0
    || restored.coins !== FARM_STARTING_COINS
    || restored.plots.some((plot) => plot.cropId !== null);
}

export function selectFarmCrop(game, cropId, now = Date.now()) {
  const restored = requireFarmGame(game);
  const timestamp = effectiveMutationNow(restored, now);
  const crop = FARM_CROPS[cropId];
  if (!crop) throw new Error('FARM_CROP_INVALID');
  if (crop.unlockLevel > restored.level) throw new Error('FARM_CROP_LOCKED');
  if (restored.selectedCrop === cropId) return restored;
  return { ...restored, selectedCrop:cropId, lastAction:'select', updatedAt:timestamp };
}

export function plantFarmCrop(game, plotIndex, cropId = game?.selectedCrop, now = Date.now()) {
  const restored = requireFarmGame(game);
  const index = normalizedPlotIndex(plotIndex);
  const timestamp = effectiveMutationNow(restored, now);
  const crop = FARM_CROPS[cropId];
  if (!crop) throw new Error('FARM_CROP_INVALID');
  if (crop.unlockLevel > restored.level) throw new Error('FARM_CROP_LOCKED');
  if (restored.plots[index].cropId !== null) throw new Error('FARM_PLOT_OCCUPIED');
  if (restored.coins < crop.seedCost) throw new Error('FARM_COINS_REQUIRED');
  const plots = restored.plots.map(clonePlot);
  plots[index] = {
    cropId,
    plantedAt:timestamp,
    matureAt:addCounter(timestamp, crop.growMs),
    watered:false,
  };
  return {
    ...restored,
    coins:restored.coins - crop.seedCost,
    actions:addCounter(restored.actions, 1),
    plots,
    lastAction:'plant',
    updatedAt:timestamp,
  };
}

export function waterFarmCrop(game, plotIndex, now = Date.now()) {
  const restored = requireFarmGame(game);
  const index = normalizedPlotIndex(plotIndex);
  const timestamp = effectiveMutationNow(restored, now);
  const plot = restored.plots[index];
  if (plot.cropId === null) throw new Error('FARM_PLOT_EMPTY');
  if (farmPlotStatus(plot, timestamp) === 'ready') throw new Error('FARM_CROP_READY');
  if (plot.watered) throw new Error('FARM_ALREADY_WATERED');
  const crop = FARM_CROPS[plot.cropId];
  const plots = restored.plots.map(clonePlot);
  plots[index] = {
    ...plots[index],
    matureAt:Math.max(plot.plantedAt + 1, plot.matureAt - crop.waterBonusMs),
    watered:true,
  };
  return {
    ...restored,
    actions:addCounter(restored.actions, 1),
    plots,
    lastAction:'water',
    updatedAt:timestamp,
  };
}

export function harvestFarmCrop(game, plotIndex, now = Date.now()) {
  const restored = requireFarmGame(game);
  const index = normalizedPlotIndex(plotIndex);
  const timestamp = effectiveMutationNow(restored, now);
  const plot = restored.plots[index];
  if (plot.cropId === null) throw new Error('FARM_PLOT_EMPTY');
  if (farmPlotStatus(plot, timestamp) !== 'ready') throw new Error('FARM_CROP_GROWING');
  const crop = FARM_CROPS[plot.cropId];
  const xp = addCounter(restored.xp, crop.xp);
  const plots = restored.plots.map(clonePlot);
  plots[index] = emptyPlot();
  return {
    ...restored,
    coins:addCounter(restored.coins, crop.reward),
    xp,
    level:farmLevelForXp(xp),
    harvests:addCounter(restored.harvests, 1),
    actions:addCounter(restored.actions, 1),
    plots,
    lastAction:'harvest',
    updatedAt:timestamp,
  };
}

export function harvestReadyFarmCrops(game, now = Date.now()) {
  let next = requireFarmGame(game);
  const timestamp = effectiveMutationNow(next, now);
  let harvested = 0;
  for (let index = 0; index < FARM_PLOT_COUNT; index += 1) {
    if (next.plots[index].cropId !== null && farmPlotStatus(next.plots[index], timestamp) === 'ready') {
      next = harvestFarmCrop(next, index, timestamp);
      harvested += 1;
    }
  }
  if (!harvested) return next;
  return { ...next, lastAction:'harvest_all', updatedAt:timestamp };
}
