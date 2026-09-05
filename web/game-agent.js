import {
  FARM_CROPS,
  FARM_SEASON_DAYS,
  advanceFarmDay,
  clearFarmPlot,
  farmMarketForDay,
  farmPlotStatus,
  farmRemainingDays,
  farmSeasonMedal,
  harvestFarmCrop,
  newFarmGame,
  plantFarmCrop,
  restoreFarmGame,
  waterFarmCrop,
} from './farm.js';
import { searchFarmMcts } from './farm-mcts.js';

export const FARM_AGENT_POLICIES = Object.freeze({
  myopic: Object.freeze({ id:'myopic', label:'即时贪心基线', description:'只种周转最快的小麦，不做长期解锁规划。' }),
  hierarchical: Object.freeze({ id:'hierarchical', label:'层级规划 Agent', description:'按解锁、成长和金牌目标分阶段执行。' }),
  skill_memory: Object.freeze({ id:'skill_memory', label:'Skill + Memory Agent', description:'复用成功经验，从亏损轨迹提出 Skill 修订，验收通过后再启用。' }),
  mcts: Object.freeze({ id:'mcts', label:'MCTS 搜索 Agent', description:'每一步在可克隆规则环境中执行 64 次 UCT 树搜索。' }),
});

export const FARM_AGENT_VISUAL_MODES = Object.freeze({
  shadow: Object.freeze({ id:'shadow', label:'视觉旁路', description:'记录 VLM 判断和延迟，但继续以 RPC 真值执行。' }),
  guard: Object.freeze({ id:'guard', label:'视觉守卫', description:'画面与 RPC 冲突或 VLM 离线时暂停动作并请求重规划。' }),
});

export const FARM_AGENT_GOAL = Object.freeze({
  id:'farm-gold-season',
  title:'九日内取得农场金牌',
  targetCoins:330,
  horizonDays:FARM_SEASON_DAYS,
  successCondition:'season_finished && final_coins >= 330',
});

export const FARM_AGENT_SKILLS = Object.freeze([
  Object.freeze({
    id:'harvest_ready_crop', label:'收获成熟作物',
    precondition:'存在成熟地块且今日仍有行动', effect:'出售作物、获得金币与经验',
  }),
  Object.freeze({
    id:'clear_failed_plot', label:'清理失败地块',
    precondition:'地块因连续缺水变成杂草', effect:'恢复为空地，允许重新播种',
  }),
  Object.freeze({
    id:'care_for_growth', label:'维持成长链',
    precondition:'存在未成熟且今日未浇水的作物', effect:'避免杂草并推进成长',
  }),
  Object.freeze({
    id:'plant_for_subgoal', label:'按子目标播种',
    precondition:'存在空地、行动和足够金币', effect:'建立下一阶段的收益与经验来源',
  }),
  Object.freeze({
    id:'advance_when_stable', label:'稳定推进时间',
    precondition:'当前优先动作完成或行动耗尽', effect:'进入下一日并刷新行动预算',
  }),
]);

export const FARM_AGENT_MEMORY_SCHEMA_VERSION = 1;
export const FARM_AGENT_MEMORY_LIMIT = 20;

const POLICY_IDS = new Set(Object.keys(FARM_AGENT_POLICIES));
const VISUAL_MODE_IDS = new Set(Object.keys(FARM_AGENT_VISUAL_MODES));

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function requireGame(game) {
  const restored = restoreFarmGame(game);
  if (!restored) throw new Error('FARM_AGENT_GAME_INVALID');
  return restored;
}

function plotIndexes(game, status) {
  const indexes = [];
  game.plots.forEach((plot, index) => {
    if (farmPlotStatus(plot) === status) indexes.push(index);
  });
  return indexes;
}

function availableCropIds(game) {
  return Object.values(FARM_CROPS)
    .filter((crop) => crop.unlockXp <= game.xp)
    .map((crop) => crop.id);
}

function targetCropFor(game, policy) {
  if (policy === 'myopic') return 'wheat';
  const desired = game.day >= 6 ? 'strawberry' : game.day >= 3 ? 'carrot' : 'wheat';
  if (FARM_CROPS[desired].unlockXp <= game.xp) return desired;
  return availableCropIds(game).at(-1) || 'wheat';
}

function currentSubgoal(game, policy) {
  if (game.status === 'finished') return '复核赛季结果并写入长期记忆';
  if (policy === 'myopic') return '优先获得下一笔即时收益';
  if (game.xp < FARM_CROPS.carrot.unlockXp) return '收获小麦，将经验提升到 10 XP';
  if (game.xp < FARM_CROPS.strawberry.unlockXp) return '种植并照料胡萝卜，将经验提升到 30 XP';
  if (game.day < 9) return '维持草莓成长链，在第九日完成高价值收获';
  return '收获成熟草莓，使金币达到金牌线';
}

function activePhaseId(game, policy) {
  if (policy === 'myopic') return 'cash-now';
  if (game.xp < FARM_CROPS.carrot.unlockXp) return 'unlock-carrot';
  if (game.xp < FARM_CROPS.strawberry.unlockXp) return 'unlock-strawberry';
  return 'gold-harvest';
}

export function farmAgentActionId(action) {
  if (!action || typeof action !== 'object') return 'invalid';
  return [action.type, Number.isInteger(action.plotIndex) ? action.plotIndex : '-', action.cropId || '-'].join(':');
}

export function enumerateFarmAgentActions(game, policy = 'skill_memory') {
  const restored = requireGame(game);
  if (!POLICY_IDS.has(policy)) throw new Error('FARM_AGENT_POLICY_INVALID');
  if (restored.status === 'finished') return [{
    id:'done:-:-', rank:1, phaseId:activePhaseId(restored,policy), skillId:null,
    action:{ type:'done' }, projected:{ coinDelta:0, xpDelta:0, harvestInDays:0 },
  }];
  const actions = [];
  const phaseId = activePhaseId(restored,policy);
  const add = (action, skillId, projected = {}) => actions.push({
    id:farmAgentActionId(action), rank:actions.length + 1, phaseId, skillId,
    action:{ ...action, skillId }, projected:{ coinDelta:0, xpDelta:0, harvestInDays:null, ...projected },
  });
  if (restored.actionsLeft > 0) {
    for (const index of plotIndexes(restored,'ready')) {
      const crop = FARM_CROPS[restored.plots[index].cropId];
      add({ type:'harvest', plotIndex:index },'harvest_ready_crop',{ coinDelta:crop?.sellPrice || 0, xpDelta:crop?.xp || 0, harvestInDays:0 });
    }
    for (const index of plotIndexes(restored,'weed')) add({ type:'clear', plotIndex:index },'clear_failed_plot');
    for (const index of plotIndexes(restored,'growing').filter((index)=>!restored.plots[index].wateredToday)) {
      add({ type:'water', plotIndex:index },'care_for_growth',{ harvestInDays:farmRemainingDays(restored.plots[index]) });
    }
    const empty = plotIndexes(restored,'empty');
    const target = targetCropFor(restored,policy);
    const crops = availableCropIds(restored).filter((id)=>restored.coins >= FARM_CROPS[id].seedCost)
      .sort((left,right)=>Number(right === target)-Number(left === target));
    for (const cropId of crops) for (const plotIndex of empty) {
      const crop = FARM_CROPS[cropId];
      add({ type:'plant', plotIndex, cropId },'plant_for_subgoal',{ coinDelta:-crop.seedCost, xpDelta:crop.xp, harvestInDays:crop.growDays });
    }
  }
  add({ type:'advance_day' },'advance_when_stable',{ harvestInDays:1 });
  return actions;
}

function bestMacroFor(memory, policy) {
  return memory?.macros
    ?.filter((macro) => macro.policy === policy && macro.successes > 0)
    .sort((left, right) => right.successes - left.successes || right.bestFinalCoins - left.bestFinalCoins)[0] || null;
}

export function planFarmAgent(game, { policy = 'skill_memory', longTermMemory = null, excludedActionIds = [], previousPlan = null, trigger = 'initial' } = {}) {
  const restored = requireGame(game);
  if (!POLICY_IDS.has(policy)) throw new Error('FARM_AGENT_POLICY_INVALID');
  const excluded = new Set(Array.isArray(excludedActionIds) ? excludedActionIds.filter((id)=>typeof id === 'string').slice(-12) : []);
  const phases = policy === 'myopic'
    ? [{ id:'cash-now', label:'重复种植小麦并立即出售', status:restored.status === 'finished' ? 'completed' : 'active' }]
    : [
      { id:'unlock-carrot', label:'小麦启动 · 解锁胡萝卜', status:restored.xp >= 10 ? 'completed' : 'active' },
      { id:'unlock-strawberry', label:'胡萝卜成长 · 解锁草莓', status:restored.xp >= 30 ? 'completed' : restored.xp >= 10 ? 'active' : 'pending' },
      { id:'gold-harvest', label:'草莓三日成长 · 冲击金牌', status:restored.status === 'finished' ? 'completed' : restored.xp >= 30 ? 'active' : 'pending' },
    ];
  const macro = policy === 'skill_memory' ? bestMacroFor(longTermMemory, policy) : null;
  const candidates = enumerateFarmAgentActions(restored,policy);
  const search = policy === 'mcts' ? searchFarmMcts(restored,{ excludedActionIds:[...excluded] }) : null;
  const selected = search
    ? candidates.find((candidate)=>candidate.id===search.selectedActionId&&!excluded.has(candidate.id))
      || candidates.find((candidate)=>!excluded.has(candidate.id)) || candidates.at(-1)
    : candidates.find((candidate)=>!excluded.has(candidate.id)) || candidates.at(-1);
  const revision = Math.max(1,Number.isSafeInteger(previousPlan?.revision) ? previousPlan.revision + 1 : 1);
  return {
    id:`farm-plan-${restored.revision}-${revision}`,
    revision,
    stateRevision:restored.revision,
    trigger,
    goal:FARM_AGENT_GOAL,
    subgoal:currentSubgoal(restored, policy),
    activePhaseId:activePhaseId(restored,policy),
    phases,
    candidates,
    selectedActionId:selected?.id || null,
    selectedAction:selected ? clone(selected.action) : { type:'done' },
    selectedCandidateRank:selected?.rank ?? null,
    alternativesConsidered:search ? Math.max(0,search.rootChildren.length - 1) : Math.max(0,candidates.length - 1),
    excludedActionIds:[...excluded],
    search:search ? clone(search) : null,
    memoryHint:[macro ? `检索到 ${macro.successes} 次成功轨迹，用 ${macro.sequence.length} 步 Skill 宏核对当前执行序列。` : '',
      policy === 'skill_memory' && longTermMemory?.evolution?.active ? `自改进 Skill v${longTermMemory.evolution.version}：播种前验证收获期限，当前状态退步时回退基线。` : ''].filter(Boolean).join(' ') || null,
  };
}

function buildPlan(game, policy, longTermMemory = null) {
  return planFarmAgent(game,{ policy,longTermMemory });
}

function normalizeVisualObservation(value) {
  if (!value || typeof value !== 'object' || typeof value.matched !== 'boolean') return null;
  const usage = value.usage && typeof value.usage === 'object' ? value.usage : {};
  return {
    matched:value.matched,
    label:typeof value.label === 'string' ? value.label : null,
    expectedLabel:typeof value.expectedLabel === 'string' ? value.expectedLabel : null,
    model:typeof value.model === 'string' ? value.model : null,
    latencyMs:Number.isFinite(value.latencyMs) && value.latencyMs >= 0 ? Number(value.latencyMs) : null,
    structuredObservation:value.structuredObservation && typeof value.structuredObservation === 'object'
      ? clone(value.structuredObservation) : null,
    usage:{
      inputTokens:Number.isSafeInteger(usage.inputTokens) && usage.inputTokens >= 0 ? usage.inputTokens : null,
      outputTokens:Number.isSafeInteger(usage.outputTokens) && usage.outputTokens >= 0 ? usage.outputTokens : null,
    },
  };
}

export function farmVisualGuardReason(game, visualObservation, { required = false } = {}) {
  const restored = requireGame(game);
  const visual = normalizeVisualObservation(visualObservation);
  if (!visual) return required ? 'VLM_UNAVAILABLE' : null;
  if (!visual.matched) return 'VLM_RPC_MISMATCH';
  const structured = visual.structuredObservation;
  if (!structured || structured.scene !== 'farm') return 'VLM_STATE_MISMATCH';
  if (!Number.isSafeInteger(structured.frameRevision) || structured.frameRevision !== restored.revision) return 'VLM_STALE_FRAME';
  for (const [key,value] of [['day',restored.day],['actionsLeft',restored.actionsLeft],['coins',restored.coins],['xp',restored.xp]]) {
    if (Object.hasOwn(structured,key) && structured[key] !== value) return 'VLM_STATE_MISMATCH';
  }
  return null;
}

export function observeFarmAgent(game, { history = [], frame = null, uiText = '', visualObservation = null } = {}) {
  const restored = requireGame(game);
  const visual = normalizeVisualObservation(visualObservation);
  const market = farmMarketForDay(restored.day);
  const objects = restored.plots.map((plot, index) => {
    const status = farmPlotStatus(plot);
    return {
      id:`plot-${index + 1}`,
      position:index,
      status,
      cropId:plot.cropId,
      wateredToday:plot.wateredToday,
      remainingDays:farmRemainingDays(plot),
    };
  });
  const text = uiText || `第 ${restored.day} 日，剩余 ${restored.actionsLeft} 次行动，${restored.coins} 金币，今日旺需 ${FARM_CROPS[market.focusId].label}。`;
  return {
    id:`farm-day-${restored.day}-revision-${restored.revision}`,
    timestampStep:restored.revision,
    modalities:{
      screen:{
        source:frame ? 'frame_reference' : 'surface_semantics',
        frame,
        scene:'2x3 farm field with market and action dock',
        objects,
      },
      text:{ ui:text, marketFocus:FARM_CROPS[market.focusId].label, tomorrowFocus:FARM_CROPS[market.tomorrowFocusId].label },
      rpc:{
        day:restored.day, actionsLeft:restored.actionsLeft, coins:restored.coins,
        xp:restored.xp, level:restored.level, harvests:restored.harvests,
        status:restored.status, selectedCrop:restored.selectedCrop,
      },
      history:history.slice(-8).map((entry) => ({ step:entry.step, action:entry.action, outcome:entry.outcome })),
      vision:visual ? {
        source:'vlm', matched:visual.matched, model:visual.model, latencyMs:visual.latencyMs,
        structuredObservation:visual.structuredObservation,
      } : null,
    },
    summary:{
      ready:objects.filter((plot) => plot.status === 'ready').map((plot) => plot.position),
      growing:objects.filter((plot) => plot.status === 'growing').map((plot) => plot.position),
      weeds:objects.filter((plot) => plot.status === 'weed').map((plot) => plot.position),
      empty:objects.filter((plot) => plot.status === 'empty').map((plot) => plot.position),
    },
  };
}

function chooseAction(game, policy) {
  if (game.status === 'finished') return { type:'done' };
  const ready = plotIndexes(game, 'ready');
  const weeds = plotIndexes(game, 'weed');
  const growing = plotIndexes(game, 'growing');
  const empty = plotIndexes(game, 'empty');

  if (game.actionsLeft > 0 && ready.length) {
    return { type:'harvest', plotIndex:ready[0], skillId:'harvest_ready_crop' };
  }
  if (game.actionsLeft > 0 && weeds.length) {
    return { type:'clear', plotIndex:weeds[0], skillId:'clear_failed_plot' };
  }
  const dry = growing.find((index) => !game.plots[index].wateredToday);
  if (game.actionsLeft > 0 && dry !== undefined) {
    return { type:'water', plotIndex:dry, skillId:'care_for_growth' };
  }
  if (game.actionsLeft > 0 && empty.length) {
    const cropId = targetCropFor(game, policy);
    if (game.coins >= FARM_CROPS[cropId].seedCost) {
      return { type:'plant', plotIndex:empty[0], cropId, skillId:'plant_for_subgoal' };
    }
  }
  return { type:'advance_day', skillId:'advance_when_stable' };
}

function actionLabel(action) {
  const plot = Number.isInteger(action.plotIndex) ? `第 ${action.plotIndex + 1} 块田` : '';
  if (action.type === 'plant') return `${plot}播种${FARM_CROPS[action.cropId]?.label || action.cropId}`;
  if (action.type === 'water') return `给${plot}浇水`;
  if (action.type === 'harvest') return `收获${plot}`;
  if (action.type === 'clear') return `清理${plot}`;
  if (action.type === 'advance_day') return '结束本日并推进时间';
  return '结束任务';
}

function executeAction(game, action) {
  if (action.type === 'plant') return plantFarmCrop(game, action.plotIndex, action.cropId);
  if (action.type === 'water') return waterFarmCrop(game, action.plotIndex);
  if (action.type === 'harvest') return harvestFarmCrop(game, action.plotIndex);
  if (action.type === 'clear') return clearFarmPlot(game, action.plotIndex);
  if (action.type === 'advance_day') return advanceFarmDay(game);
  if (action.type === 'done') return game;
  throw new Error('FARM_AGENT_ACTION_INVALID');
}

// Constrained Skill synthesis: data-only variants, never generated executable code.
const EVOLUTION_SUITE = 'farm-deadline-v1';
const EVOLUTION_VARIANTS = new Set(['skip_late_plant', 'replace_late_plant']);

function emptyEvolution() {
  return { suite:EVOLUTION_SUITE, version:0, active:null, blockedVariants:[], history:[] };
}

function restoreEvolution(value) {
  if (!value || typeof value !== 'object') return emptyEvolution();
  return {
    suite:value.suite === EVOLUTION_SUITE ? EVOLUTION_SUITE : 'outdated',
    version:safeCount(value.version),
    active:EVOLUTION_VARIANTS.has(value.active) ? value.active : null,
    blockedVariants:Array.isArray(value.blockedVariants) ? [...new Set(value.blockedVariants.filter((variant)=>EVOLUTION_VARIANTS.has(variant)))] : [],
    history:Array.isArray(value.history) ? value.history.slice(-20).flatMap((entry) => {
      if (!entry || !['promoted','rejected','rollback'].includes(entry.status)) return [];
      return [{ version:safeCount(entry.version), status:entry.status,
        variant:EVOLUTION_VARIANTS.has(entry.variant) ? entry.variant : null,
        reason:typeof entry.reason === 'string' ? entry.reason.slice(0,240) : '',
        evidenceCount:safeCount(entry.evidenceCount), suite:EVOLUTION_SUITE }];
    }) : [],
  };
}

function evolvedAction(game, base, variant) {
  if (!EVOLUTION_VARIANTS.has(variant) || base.type !== 'plant'
    || game.day + FARM_CROPS[base.cropId].growDays <= FARM_SEASON_DAYS) return base;
  if (variant === 'replace_late_plant') {
    const cropId = availableCropIds(game).reverse().find((id) =>
      game.day + FARM_CROPS[id].growDays <= FARM_SEASON_DAYS && game.coins >= FARM_CROPS[id].seedCost);
    if (cropId) return { ...base, cropId, evolvedSkill:variant };
  }
  return { type:'advance_day', skillId:'advance_when_stable', evolvedSkill:variant };
}

function skillTrial(initialGame, variant) {
  let game = requireGame(initialGame);
  let steps = 0;
  let invalid = 0;
  while (game.status !== 'finished' && steps < 96) {
    steps += 1;
    try { game = executeAction(game, evolvedAction(game, chooseAction(game,'skill_memory'), variant)); }
    catch { invalid += 1; break; }
  }
  return { coins:game.coins, completed:game.status === 'finished', invalid, steps };
}

function delayedFarm(days) {
  let game = newFarmGame();
  for (let day = 0; day < days; day += 1) game = advanceFarmDay(game);
  return game;
}

function evolutionFixtures() {
  const readyCrop = advanceFarmDay(plantFarmCrop(newFarmGame(),0,'wheat'));
  let crowded = newFarmGame();
  for (let index = 0; index < 5; index += 1) crowded = plantFarmCrop(crowded,index,'wheat');
  return [
    { id:'canonical', game:newFarmGame() },
    { id:'late-day2', game:delayedFarm(1) },
    { id:'late-day7', game:delayedFarm(6) },
    { id:'late-day8', game:delayedFarm(7) },
    { id:'ready-crop', game:readyCrop },
    { id:'limited-actions', game:crowded },
  ];
}

export function evaluateFarmSkillCandidate(variant, { incumbent = null, cases = evolutionFixtures() } = {}) {
  if (!EVOLUTION_VARIANTS.has(variant)) throw new Error('FARM_SKILL_VARIANT_INVALID');
  if (incumbent !== null && !EVOLUTION_VARIANTS.has(incumbent)) throw new Error('FARM_SKILL_INCUMBENT_INVALID');
  if (!Array.isArray(cases) || !cases.length || cases.length > 12) throw new Error('FARM_SKILL_CASES_INVALID');
  const rows = cases.map(({id,game}) => ({ id, before:skillTrial(game,incumbent), after:skillTrial(game,variant) }));
  const nonRegression = rows.every(({before,after}) => after.completed && !after.invalid && after.coins >= before.coins);
  const gain = rows.reduce((sum,{before,after}) => sum + after.coins - before.coins,0);
  return { suite:EVOLUTION_SUITE, accepted:nonRegression && gain > 0, gain, rows };
}

function validateRestoredEvolution(memory) {
  const variant = memory.evolution.active;
  const lastEvent = memory.evolution.history.at(-1);
  const provenance = memory.evolution.version > 0 && memory.evolution.history.some((event) =>
    event.status === 'promoted' && event.variant === variant && event.version === memory.evolution.version && event.evidenceCount > 0);
  const report = variant && memory.evolution.suite === EVOLUTION_SUITE && provenance && lastEvent?.status !== 'rollback'
    && !memory.evolution.blockedVariants.includes(variant) ? evaluateFarmSkillCandidate(variant) : null;
  if (variant && !report?.accepted) {
    memory.evolution.active = null;
    memory.evolution.history.push({ version:memory.evolution.version, status:'rollback', variant,
      evidenceCount:0, suite:EVOLUTION_SUITE, reason:'恢复时重新验收未通过，回退固定基线' });
    memory.evolution.history = memory.evolution.history.slice(-20);
  }
  memory.evolution.suite = EVOLUTION_SUITE;
  return { rollouts:report ? report.rows.length*2 : 0,
    steps:report ? report.rows.reduce((sum,{before,after})=>sum+before.steps+after.steps,0) : 0 };
}

function learnFarmSkill(session) {
  if (session.policy !== 'skill_memory') return;
  const evolution = session.memory.longTerm.evolution;
  const evidence = session.trajectory.filter((entry) => entry.outcome === 'success' && entry.action.type === 'plant'
    && entry.before.day + FARM_CROPS[entry.action.cropId].growDays > FARM_SEASON_DAYS);
  if (!evidence.length) return;
  const candidates = [...EVOLUTION_VARIANTS].filter((variant)=>!evolution.blockedVariants.includes(variant)).map((variant) => ({ variant,
    report:evaluateFarmSkillCandidate(variant,{incumbent:evolution.active}) }));
  for (const {report} of candidates) {
    session.metrics.skillTrialRollouts += report.rows.length * 2;
    session.metrics.skillTrialSteps += report.rows.reduce((sum,{before,after})=>sum+before.steps+after.steps,0);
  }
  const best = candidates.filter(({report}) => report.accepted).sort((a,b)=>b.report.gain-a.report.gain)[0];
  const variant = best?.variant ?? null;
  if (best) { evolution.version += 1; evolution.active = variant; }
  const event = { version:evolution.version, status:best?'promoted':'rejected', variant,
    suite:EVOLUTION_SUITE, evidenceCount:evidence.length,
    reason:best?`发现 ${evidence.length} 次来不及收获的播种；${best.report.rows.length} 个验收场景无退步，总收益提升 ${best.report.gain} 金币`
      :'候选没有通过无退步且收益严格提升的门槛，保留旧 Skill' };
  evolution.history = [...evolution.history,event].slice(-20);
  session.evolutionEvent = event;
  session.reflection += best ? ` 自改进 v${evolution.version} 验收通过，下一季启用收获期限约束。` : ' 候选 Skill 未通过验收，旧版本保留。';
}

function selectSessionAction(session) {
  const base = session.plan?.selectedAction ? clone(session.plan.selectedAction) : chooseAction(session.game,session.policy);
  const variant = session.policy === 'skill_memory' ? session.memory.longTerm.evolution.active : null;
  const proposed = evolvedAction(session.game,base,variant);
  if (proposed === base) return base;
  // Counterfactuals run only on cloned rule states; never touch the live save or VLM guard.
  const before = skillTrial(session.game,null);
  const after = skillTrial(session.game,variant);
  session.metrics.skillTrialRollouts += 2;
  session.metrics.skillTrialSteps += before.steps + after.steps;
  if (!after.completed || after.invalid || after.coins < before.coins) {
    const evolution = session.memory.longTerm.evolution;
    const event = { version:evolution.version, status:'rollback', variant,
      evidenceCount:1, suite:EVOLUTION_SUITE, reason:'当前状态反事实验证退步，停用候选并回退固定基线' };
    evolution.active = null;
    evolution.blockedVariants = [...new Set([...evolution.blockedVariants,variant])];
    evolution.history = [...evolution.history,event].slice(-20);
    session.evolutionEvent = event;
    return base;
  }
  return proposed;
}

function newSkillStats() {
  return Object.fromEntries(FARM_AGENT_SKILLS.map((skill) => [skill.id, { uses:0, successes:0, failures:0 }]));
}

export function emptyFarmAgentLongTermMemory() {
  return {
    schemaVersion:FARM_AGENT_MEMORY_SCHEMA_VERSION,
    totalEpisodes:0,
    episodes:[],
    macros:[],
    skillStats:newSkillStats(),
    evolution:emptyEvolution(),
  };
}

function safeCount(value) {
  return Number.isSafeInteger(value) && value >= 0 ? Math.min(value, 1_000_000) : 0;
}

function safeSkillSequence(value) {
  if (!Array.isArray(value) || value.length > 96) return null;
  const allowed = new Set(FARM_AGENT_SKILLS.map((skill) => skill.id));
  return value.every((skillId) => allowed.has(skillId)) ? [...value] : null;
}

export function restoreFarmAgentLongTermMemory(value) {
  const empty = emptyFarmAgentLongTermMemory();
  if (!value || typeof value !== 'object' || value.schemaVersion !== FARM_AGENT_MEMORY_SCHEMA_VERSION) return empty;
  const episodes = Array.isArray(value.episodes) ? value.episodes.slice(-FARM_AGENT_MEMORY_LIMIT).flatMap((episode) => {
    const sequence = safeSkillSequence(episode?.skillSequence);
    if (!episode || typeof episode !== 'object' || !POLICY_IDS.has(episode.policy) || !sequence) return [];
    return [{
      id:typeof episode.id === 'string' ? episode.id.slice(0, 80) : `episode-restored-${safeCount(value.totalEpisodes)}`,
      goalId:episode.goalId === FARM_AGENT_GOAL.id ? episode.goalId : FARM_AGENT_GOAL.id,
      policy:episode.policy,
      success:episode.success === true,
      finalCoins:safeCount(episode.finalCoins),
      finalRevision:safeCount(episode.finalRevision),
      xp:safeCount(episode.xp),
      harvests:safeCount(episode.harvests),
      medal:['gold','silver','bronze','none'].includes(episode.medal) ? episode.medal : 'none',
      steps:safeCount(episode.steps),
      uniqueSkills:safeCount(episode.uniqueSkills),
      recoveries:safeCount(episode.recoveries),
      visualObservations:safeCount(episode.visualObservations),
      lesson:typeof episode.lesson === 'string' ? episode.lesson.slice(0, 240) : '',
      skillSequence:sequence,
      invalidActions:safeCount(episode.invalidActions),
      visualBlocks:safeCount(episode.visualBlocks),
    }];
  }) : [];
  const macros = Array.isArray(value.macros) ? value.macros.slice(-FARM_AGENT_MEMORY_LIMIT).flatMap((macro) => {
    const sequence = safeSkillSequence(macro?.sequence);
    if (!macro || typeof macro !== 'object' || !POLICY_IDS.has(macro.policy) || !sequence?.length) return [];
    return [{
      id:typeof macro.id === 'string' ? macro.id.slice(0, 80) : `macro-${macro.policy}`,
      policy:macro.policy,
      sequence,
      successes:safeCount(macro.successes),
      uses:safeCount(macro.uses),
      bestFinalCoins:safeCount(macro.bestFinalCoins),
    }];
  }) : [];
  const skillStats = newSkillStats();
  for (const skill of FARM_AGENT_SKILLS) {
    const stats = value.skillStats?.[skill.id];
    skillStats[skill.id] = {
      uses:safeCount(stats?.uses),
      successes:safeCount(stats?.successes),
      failures:safeCount(stats?.failures),
    };
  }
  return {
    schemaVersion:FARM_AGENT_MEMORY_SCHEMA_VERSION,
    totalEpisodes:Math.max(safeCount(value.totalEpisodes), episodes.length),
    episodes,
    macros,
    skillStats,
    evolution:restoreEvolution(value.evolution),
  };
}

function successfulSkillSequence(trajectory) {
  const sequence = [];
  for (const entry of trajectory) {
    if (!['success','done'].includes(entry.outcome) || !entry.skillId) continue;
    if (sequence.at(-1) !== entry.skillId) sequence.push(entry.skillId);
  }
  return sequence;
}

function commitEpisodeToLongTermMemory(memory, session, episode) {
  const next = restoreFarmAgentLongTermMemory(memory);
  next.totalEpisodes += 1;
  const skillSequence = successfulSkillSequence(session.trajectory);
  const stored = {
    ...episode,
    id:`farm-episode-${next.totalEpisodes}`,
    skillSequence,
    invalidActions:session.metrics.invalidActions,
    visualBlocks:session.metrics.visualBlocks,
  };
  next.episodes = [...next.episodes, stored].slice(-FARM_AGENT_MEMORY_LIMIT);
  for (const skill of FARM_AGENT_SKILLS) {
    const current = session.memory.skillStats[skill.id];
    next.skillStats[skill.id].uses += current.uses;
    next.skillStats[skill.id].successes += current.successes;
    next.skillStats[skill.id].failures += current.failures;
  }
  if (stored.success && skillSequence.length) {
    const signature = `${stored.policy}:${skillSequence.join('>')}`;
    const existing = next.macros.find((macro) => `${macro.policy}:${macro.sequence.join('>')}` === signature);
    if (existing) {
      existing.successes += 1;
      existing.uses += 1;
      existing.bestFinalCoins = Math.max(existing.bestFinalCoins, stored.finalCoins);
    } else {
      next.macros.push({
        id:`farm-macro-${next.totalEpisodes}`,
        policy:stored.policy,
        sequence:skillSequence,
        successes:1,
        uses:1,
        bestFinalCoins:stored.finalCoins,
      });
      next.macros = next.macros.slice(-FARM_AGENT_MEMORY_LIMIT);
    }
  }
  return next;
}

export function createFarmAgentSession({ game = newFarmGame(), policy = 'skill_memory', visualMode = 'shadow', injectFailureAtStep = null, injectPlannedFailureAtStep = null, longTermMemory = null } = {}) {
  if (!POLICY_IDS.has(policy)) throw new Error('FARM_AGENT_POLICY_INVALID');
  if (!VISUAL_MODE_IDS.has(visualMode)) throw new Error('FARM_AGENT_VISUAL_MODE_INVALID');
  const restoredGame = requireGame(game);
  const restoredMemory = restoreFarmAgentLongTermMemory(longTermMemory);
  const restoredValidation = validateRestoredEvolution(restoredMemory);
  const retrievedMacro = policy === 'skill_memory' ? bestMacroFor(restoredMemory, policy) : null;
  const initialPlan = buildPlan(restoredGame,policy,restoredMemory);
  return {
    schemaVersion:1,
    id:`farm-agent-${policy}`,
    policy,
    visualMode,
    status:'ready',
    game:restoredGame,
    goal:clone(FARM_AGENT_GOAL),
    plan:initialPlan,
    observation:null,
    activeSkill:null,
    reflection:'等待第一次观察。',
    trajectory:[],
    memory:{ episodes:[], failures:[], visualConflicts:[], skillStats:newSkillStats(), longTerm:restoredMemory },
    retrievedMacro:retrievedMacro ? clone(retrievedMacro) : null,
    macroCursor:0,
    evolutionEvent:restoredMemory.evolution.history.at(-1)?.status==='rollback' ? clone(restoredMemory.evolution.history.at(-1)) : null,
    metrics:{ decisions:0, validActions:0, invalidActions:0, replans:0, recoveries:0, estimatedTokens:0, uniqueSkills:0, macroMatches:0, evolvedActions:0, skillTrialRollouts:restoredValidation.rollouts, skillTrialSteps:restoredValidation.steps, mctsSearches:0, mctsRollouts:0, mctsExpandedNodes:0, visualObservations:0, visualMatches:0, visualMismatches:0, visualBlocks:0, visualLatencyMs:0, vlmInputTokens:0, vlmOutputTokens:0, alternativeActionsConsidered:0 },
    injectFailureAtStep:Number.isInteger(injectFailureAtStep) ? injectFailureAtStep : null,
    injectPlannedFailureAtStep:Number.isInteger(injectPlannedFailureAtStep) ? injectPlannedFailureAtStep : null,
    faultInjected:false,
    pendingRecovery:false,
    failedActionIds:[],
    failedStateRevision:null,
    nextPlanTrigger:'initial',
  };
}

function rememberSkill(session, skillId, succeeded) {
  if (!skillId || !session.memory.skillStats[skillId]) return;
  const stats = session.memory.skillStats[skillId];
  stats.uses += 1;
  stats[succeeded ? 'successes' : 'failures'] += 1;
  session.metrics.uniqueSkills = Object.values(session.memory.skillStats).filter((entry) => entry.uses > 0).length;
}

function reasoningFor(session, action) {
  const skill = FARM_AGENT_SKILLS.find((entry) => entry.id === action.skillId);
  const failureHint = session.policy === 'skill_memory' && session.memory.failures.length
    ? `；已记录 ${session.memory.failures.length} 条失败动作反馈`
    : '';
  const macroSkill = session.retrievedMacro?.sequence?.[session.macroCursor];
  const macroHint = macroSkill && macroSkill === action.skillId ? '；当前动作与历史成功 Skill 宏匹配' : '';
  const searchHint = session.plan.search?.algorithm === 'uct-mcts'
    ? `；UCT-MCTS 完成 ${session.plan.search.rollouts} 次 rollout，所选根动作访问 ${session.plan.search.selectedVisits} 次`
    : '';
  return `${session.plan.subgoal}。调用「${skill?.label || '直接决策'}」：${actionLabel(action)}${failureHint}${macroHint}${searchHint}${action.evolvedSkill?'；自改进 Skill：保证能在结算前收获':''}`;
}

function finishEpisode(session) {
  const result = session.game.result;
  const success = Boolean(result && result.finalCoins >= session.goal.targetCoins);
  session.status = success ? 'succeeded' : 'completed';
  session.reflection = success
    ? `目标达成：${result.finalCoins} 金币，获得${result.medal === 'gold' ? '金牌' : result.medal}。`
    : `赛季完成但未达到 ${session.goal.targetCoins} 金币，需要调整作物与成长周期。`;
  const episode = {
    goalId:session.goal.id,
    policy:session.policy,
    success,
    finalCoins:result?.finalCoins ?? session.game.coins,
    finalRevision:session.game.revision,
    xp:session.game.xp,
    harvests:session.game.harvests,
    medal:result?.medal ?? farmSeasonMedal(session.game.coins),
    steps:session.trajectory.length,
    uniqueSkills:session.metrics.uniqueSkills,
    recoveries:session.metrics.recoveries,
    visualObservations:session.metrics.visualObservations,
    lesson:session.reflection,
  };
  session.memory.episodes.push(episode);
  session.memory.longTerm = commitEpisodeToLongTermMemory(session.memory.longTerm, session, episode);
  learnFarmSkill(session);
}

export function stepFarmAgent(session, context = {}) {
  if (!session || !POLICY_IDS.has(session.policy)) throw new Error('FARM_AGENT_SESSION_INVALID');
  if (['succeeded','completed','blocked'].includes(session.status)) return session;
  session.status = 'running';
  const visual = normalizeVisualObservation(context.visualObservation);
  const visualRequired = context.visualRequired === true;
  if (session.failedStateRevision !== null && session.failedStateRevision !== session.game.revision) {
    session.failedActionIds = [];
    session.failedStateRevision = null;
  }
  session.observation = observeFarmAgent(session.game, { history:session.trajectory, ...context, visualObservation:visual });
  session.plan = planFarmAgent(session.game, {
    policy:session.policy,
    longTermMemory:session.memory.longTerm,
    excludedActionIds:session.failedActionIds,
    previousPlan:session.plan,
    trigger:session.nextPlanTrigger || 'state_changed',
  });
  session.nextPlanTrigger = 'state_changed';
  session.metrics.decisions += 1;
  session.metrics.estimatedTokens += Math.ceil(JSON.stringify(session.observation).length / 4);
  if (session.plan.search?.algorithm === 'uct-mcts') {
    session.metrics.mctsSearches += 1;
    session.metrics.mctsRollouts += session.plan.search.rollouts;
    session.metrics.mctsExpandedNodes += session.plan.search.expandedNodes;
  }

  if (visual) {
    session.metrics.visualObservations += 1;
    session.metrics[visual.matched ? 'visualMatches' : 'visualMismatches'] += 1;
    session.metrics.visualLatencyMs += visual.latencyMs ?? 0;
    session.metrics.vlmInputTokens += visual.usage.inputTokens ?? 0;
    session.metrics.vlmOutputTokens += visual.usage.outputTokens ?? 0;
  }
  const guardReason = session.visualMode === 'guard'
    ? farmVisualGuardReason(session.game,visual,{required:visualRequired})
    : null;
  if (guardReason) {
    const before = { day:session.game.day, revision:session.game.revision, coins:session.game.coins, xp:session.game.xp };
    const conflict = {
      observationId:session.observation.id,
      reason:guardReason,
      label:visual?.label ?? null,
      expectedLabel:visual?.expectedLabel ?? null,
      frameRevision:visual?.structuredObservation?.frameRevision ?? session.game.revision,
    };
    session.memory.visualConflicts.push(conflict);
    session.metrics.visualBlocks += 1;
    session.metrics.replans += 1;
    session.nextPlanTrigger = guardReason === 'VLM_STALE_FRAME' ? 'stale_visual_frame' : 'visual_guard';
    session.activeSkill = null;
    session.status = 'guarded';
    session.reflection = guardReason === 'VLM_UNAVAILABLE'
      ? '视觉守卫未取得可靠观察，已暂停动作并保留当前状态。'
      : guardReason === 'VLM_STALE_FRAME'
        ? '视觉帧已落后于当前 RPC 状态，已阻止动作并请求最新画面。'
        : guardReason === 'VLM_STATE_MISMATCH'
          ? '视觉结构化状态与当前环境不一致，已阻止动作并请求重新观察。'
      : '视觉观察与 RPC 真值冲突，已阻止动作并等待重新观察或人工确认。';
    session.trajectory.push({
      step:session.metrics.decisions,
      observationId:session.observation.id,
      goalId:session.goal.id,
      subgoal:session.plan.subgoal,
      skillId:null,
      action:{ type:'hold', reason:guardReason },
      actionLabel:'视觉守卫暂停动作',
      reasoning:session.reflection,
      before,
      after:before,
      outcome:'guarded',
      error:guardReason,
      visual,
      planId:session.plan.id,
      planRevision:session.plan.revision,
      replanTrigger:session.plan.trigger,
      candidateRank:null,
      alternativesConsidered:session.plan.alternativesConsidered,
      search:session.plan.search ? clone(session.plan.search) : null,
    });
    return session;
  }

  let action = selectSessionAction(session);
  if (session.injectFailureAtStep === session.metrics.decisions && !session.faultInjected) {
    action = { type:'plant', plotIndex:99, cropId:'wheat', skillId:'plant_for_subgoal', injected:true };
    session.faultInjected = true;
  }
  session.activeSkill = FARM_AGENT_SKILLS.find((entry) => entry.id === action.skillId) || null;
  const before = { day:session.game.day, revision:session.game.revision, coins:session.game.coins, xp:session.game.xp };
  const reasoning = reasoningFor(session, action);
  const matchesRetrievedMacro = session.retrievedMacro?.sequence?.[session.macroCursor] === action.skillId;
  const entry = {
    step:session.metrics.decisions,
    observationId:session.observation.id,
    goalId:session.goal.id,
    subgoal:session.plan.subgoal,
    skillId:action.skillId || null,
    action:clone(action),
    actionLabel:actionLabel(action),
    reasoning,
    visual,
    planId:session.plan.id,
    planRevision:session.plan.revision,
    replanTrigger:session.plan.trigger,
    candidateRank:session.plan.selectedCandidateRank,
    alternativesConsidered:session.plan.alternativesConsidered,
    search:session.plan.search ? clone(session.plan.search) : null,
    before,
    outcome:'pending',
  };

  try {
    if (context.rejectPlannedAction === true || (session.injectPlannedFailureAtStep === session.metrics.decisions && !session.faultInjected)) {
      session.faultInjected = true;
      throw new Error('PLANNED_ACTION_REJECTED');
    }
    session.game = executeAction(session.game, action);
    if (action.evolvedSkill) session.metrics.evolvedActions += 1;
    session.metrics.validActions += action.type === 'done' ? 0 : 1;
    rememberSkill(session, action.skillId, true);
    if (matchesRetrievedMacro) {
      session.macroCursor += 1;
      session.metrics.macroMatches += 1;
    }
    entry.outcome = action.type === 'done' ? 'done' : 'success';
    entry.after = { day:session.game.day, revision:session.game.revision, coins:session.game.coins, xp:session.game.xp };
    if (session.pendingRecovery) {
      session.metrics.recoveries += 1;
      session.pendingRecovery = false;
      session.metrics.alternativeActionsConsidered += Math.max(1,session.plan.selectedCandidateRank - 1);
      session.reflection = `替代路径成功：${actionLabel(action)}。`;
    } else {
      session.reflection = `执行成功：${actionLabel(action)}。下一步根据新状态重规划。`;
    }
    if (action.evolvedSkill) session.reflection += ` 自改进 Skill v${session.memory.longTerm.evolution.version} 已修订原动作，避免无法兑现的播种。`;
    session.nextPlanTrigger = 'state_changed';
  } catch (error) {
    session.metrics.invalidActions += 1;
    session.metrics.replans += 1;
    rememberSkill(session, action.skillId, false);
    entry.outcome = 'failed';
    entry.error = error?.message || 'UNKNOWN_ACTION_ERROR';
    session.memory.failures.push({ observationId:session.observation.id, action:clone(action), error:entry.error });
    session.pendingRecovery = true;
    session.failedActionIds = [...new Set([...session.failedActionIds,farmAgentActionId(action)])].slice(-12);
    session.failedStateRevision = session.game.revision;
    session.nextPlanTrigger = 'action_failed';
    session.reflection = `动作失败（${entry.error}），保留环境状态并搜索替代路径。`;
  }
  session.trajectory.push(entry);

  if (session.game.status === 'finished') finishEpisode(session);
  return session;
}

export function runFarmAgentEpisode(options = {}) {
  const session = createFarmAgentSession(options);
  const maxDecisions = Number.isInteger(options.maxDecisions) ? options.maxDecisions : 96;
  while (!['succeeded','completed','blocked'].includes(session.status) && session.metrics.decisions < maxDecisions) {
    stepFarmAgent(session, options.context || {});
  }
  if (!['succeeded','completed'].includes(session.status)) {
    session.status = 'blocked';
    session.reflection = `超过 ${maxDecisions} 次决策仍未完成，终止本轮评测。`;
  }
  const totalAttempts = session.metrics.validActions + session.metrics.invalidActions;
  return {
    ...session,
    report:{
      taskSuccess:session.status === 'succeeded',
      finalCoins:session.game.result?.finalCoins ?? session.game.coins,
      medal:session.game.result?.medal ?? farmSeasonMedal(session.game.coins),
      contentCoverage:session.metrics.uniqueSkills / FARM_AGENT_SKILLS.length,
      invalidActionRate:totalAttempts ? session.metrics.invalidActions / totalAttempts : 0,
      recoveryRate:session.metrics.invalidActions ? session.metrics.recoveries / session.metrics.invalidActions : null,
      decisions:session.metrics.decisions,
      estimatedTokens:session.metrics.estimatedTokens,
      visualAgreementRate:session.metrics.visualObservations ? session.metrics.visualMatches / session.metrics.visualObservations : null,
      visualBlocks:session.metrics.visualBlocks,
      averageVisualLatencyMs:session.metrics.visualObservations ? session.metrics.visualLatencyMs / session.metrics.visualObservations : null,
      vlmInputTokens:session.metrics.vlmInputTokens,
      vlmOutputTokens:session.metrics.vlmOutputTokens,
      longTermEpisodes:session.memory.longTerm.totalEpisodes,
      reusedSkillMacro:Boolean(session.retrievedMacro && session.metrics.macroMatches > 0),
      skillMacroCoverage:session.retrievedMacro?.sequence?.length ? session.metrics.macroMatches / session.retrievedMacro.sequence.length : null,
      evolvedActions:session.metrics.evolvedActions,
      evolutionVersion:session.memory.longTerm.evolution.version,
      activeEvolvedSkill:session.memory.longTerm.evolution.active,
      skillTrialRollouts:session.metrics.skillTrialRollouts,
      skillTrialSteps:session.metrics.skillTrialSteps,
      mctsSearches:session.metrics.mctsSearches,
      mctsRollouts:session.metrics.mctsRollouts,
      mctsExpandedNodes:session.metrics.mctsExpandedNodes,
      planRevisions:session.plan.revision,
      alternativeActionsConsidered:session.metrics.alternativeActionsConsidered,
    },
  };
}

export function evaluateFarmAgentPolicies() {
  const tasks = [
    { id:'normal-season', label:'标准九日赛季', options:{} },
    { id:'action-recovery', label:'含一次被环境拒绝动作的替代路径任务', options:{ injectPlannedFailureAtStep:2 } },
  ];
  return Object.keys(FARM_AGENT_POLICIES).flatMap((policy) => tasks.map((task) => {
    const episode = runFarmAgentEpisode({ policy, ...task.options });
    return { task, policy:FARM_AGENT_POLICIES[policy], report:episode.report };
  }));
}

export function evaluateFarmAgentMemoryTransfer() {
  const discovery = runFarmAgentEpisode({ policy:'skill_memory' });
  const replay = runFarmAgentEpisode({ policy:'skill_memory', longTermMemory:discovery.memory.longTerm });
  const recovery = runFarmAgentEpisode({ policy:'skill_memory', injectPlannedFailureAtStep:2, longTermMemory:discovery.memory.longTerm });
  return {
    discovery:discovery.report,
    replay:replay.report,
    recovery:recovery.report,
    macro:{
      sequenceLength:discovery.memory.longTerm.macros[0]?.sequence.length ?? 0,
      storedEpisodes:discovery.memory.longTerm.totalEpisodes,
      replayMatchedSteps:replay.metrics.macroMatches,
      recoveryMatchedSteps:recovery.metrics.macroMatches,
    },
  };
}

export function evaluateFarmAgentEvolution() {
  // Discovery and final transfer starts are not members of the promotion suite.
  const discoveryStart = delayedFarm(2);
  const discovery = runFarmAgentEpisode({game:discoveryStart});
  const memory = clone(discovery.memory.longTerm);
  const replay = runFarmAgentEpisode({game:discoveryStart,longTermMemory:memory});
  const transfer = [3,5].map((days) => {
    const game = delayedFarm(days);
    const before = runFarmAgentEpisode({game,policy:'hierarchical'});
    const after = runFarmAgentEpisode({game,longTermMemory:memory});
    return { id:`untuned-day${days+1}`, before:before.report, after:after.report };
  });
  return { discovery:discovery.report, replay:replay.report, evolution:memory.evolution, transfer,
    boundary:'Constrained template synthesis and rule-model rollouts in one deterministic game; no neural training or cross-game generalization.' };
}
