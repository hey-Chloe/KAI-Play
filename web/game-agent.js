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

export const FARM_AGENT_POLICIES = Object.freeze({
  myopic: Object.freeze({ id:'myopic', label:'即时贪心基线', description:'只种周转最快的小麦，不做长期解锁规划。' }),
  hierarchical: Object.freeze({ id:'hierarchical', label:'层级规划 Agent', description:'按解锁、成长和金牌目标分阶段执行。' }),
  skill_memory: Object.freeze({ id:'skill_memory', label:'Skill + Memory Agent', description:'在层级规划上记录技能结果，并从失败中重规划。' }),
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

const POLICY_IDS = new Set(Object.keys(FARM_AGENT_POLICIES));

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

function buildPlan(game, policy) {
  const phases = policy === 'myopic'
    ? [{ id:'cash-now', label:'重复种植小麦并立即出售', status:game.status === 'finished' ? 'completed' : 'active' }]
    : [
      { id:'unlock-carrot', label:'小麦启动 · 解锁胡萝卜', status:game.xp >= 10 ? 'completed' : 'active' },
      { id:'unlock-strawberry', label:'胡萝卜成长 · 解锁草莓', status:game.xp >= 30 ? 'completed' : game.xp >= 10 ? 'active' : 'pending' },
      { id:'gold-harvest', label:'草莓三日成长 · 冲击金牌', status:game.status === 'finished' ? 'completed' : game.xp >= 30 ? 'active' : 'pending' },
    ];
  return { goal:FARM_AGENT_GOAL, subgoal:currentSubgoal(game, policy), phases };
}

export function observeFarmAgent(game, { history = [], frame = null, uiText = '' } = {}) {
  const restored = requireGame(game);
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

function newSkillStats() {
  return Object.fromEntries(FARM_AGENT_SKILLS.map((skill) => [skill.id, { uses:0, successes:0, failures:0 }]));
}

export function createFarmAgentSession({ game = newFarmGame(), policy = 'skill_memory', injectFailureAtStep = null } = {}) {
  if (!POLICY_IDS.has(policy)) throw new Error('FARM_AGENT_POLICY_INVALID');
  return {
    schemaVersion:1,
    id:`farm-agent-${policy}`,
    policy,
    status:'ready',
    game:requireGame(game),
    goal:clone(FARM_AGENT_GOAL),
    plan:buildPlan(game, policy),
    observation:null,
    activeSkill:null,
    reflection:'等待第一次观察。',
    trajectory:[],
    memory:{ episodes:[], failures:[], skillStats:newSkillStats() },
    metrics:{ decisions:0, validActions:0, invalidActions:0, replans:0, recoveries:0, estimatedTokens:0, uniqueSkills:0 },
    injectFailureAtStep:Number.isInteger(injectFailureAtStep) ? injectFailureAtStep : null,
    faultInjected:false,
    pendingRecovery:false,
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
  const memoryHint = session.policy === 'skill_memory' && session.memory.failures.length
    ? `；已避开 ${session.memory.failures.length} 条失败动作记录`
    : '';
  return `${session.plan.subgoal}。调用「${skill?.label || '直接决策'}」：${actionLabel(action)}${memoryHint}`;
}

function finishEpisode(session) {
  const result = session.game.result;
  const success = Boolean(result && result.finalCoins >= session.goal.targetCoins);
  session.status = success ? 'succeeded' : 'completed';
  session.reflection = success
    ? `目标达成：${result.finalCoins} 金币，获得${result.medal === 'gold' ? '金牌' : result.medal}。`
    : `赛季完成但未达到 ${session.goal.targetCoins} 金币，需要调整作物与成长周期。`;
  session.memory.episodes.push({
    goalId:session.goal.id,
    policy:session.policy,
    success,
    finalCoins:result?.finalCoins ?? session.game.coins,
    medal:result?.medal ?? farmSeasonMedal(session.game.coins),
    steps:session.trajectory.length,
    lesson:session.reflection,
  });
}

export function stepFarmAgent(session, context = {}) {
  if (!session || !POLICY_IDS.has(session.policy)) throw new Error('FARM_AGENT_SESSION_INVALID');
  if (['succeeded','completed','blocked'].includes(session.status)) return session;
  session.status = 'running';
  session.observation = observeFarmAgent(session.game, { history:session.trajectory, ...context });
  session.plan = buildPlan(session.game, session.policy);
  session.metrics.decisions += 1;
  session.metrics.estimatedTokens += Math.ceil(JSON.stringify(session.observation).length / 4);

  let action = chooseAction(session.game, session.policy);
  if (session.injectFailureAtStep === session.metrics.decisions && !session.faultInjected) {
    action = { type:'plant', plotIndex:99, cropId:'wheat', skillId:'plant_for_subgoal', injected:true };
    session.faultInjected = true;
  }
  session.activeSkill = FARM_AGENT_SKILLS.find((entry) => entry.id === action.skillId) || null;
  const before = { day:session.game.day, revision:session.game.revision, coins:session.game.coins, xp:session.game.xp };
  const reasoning = reasoningFor(session, action);
  const entry = {
    step:session.metrics.decisions,
    observationId:session.observation.id,
    goalId:session.goal.id,
    subgoal:session.plan.subgoal,
    skillId:action.skillId || null,
    action:clone(action),
    actionLabel:actionLabel(action),
    reasoning,
    before,
    outcome:'pending',
  };

  try {
    session.game = executeAction(session.game, action);
    session.metrics.validActions += action.type === 'done' ? 0 : 1;
    rememberSkill(session, action.skillId, true);
    entry.outcome = action.type === 'done' ? 'done' : 'success';
    entry.after = { day:session.game.day, revision:session.game.revision, coins:session.game.coins, xp:session.game.xp };
    if (session.pendingRecovery) {
      session.metrics.recoveries += 1;
      session.pendingRecovery = false;
      session.reflection = `替代路径成功：${actionLabel(action)}。`;
    } else {
      session.reflection = `执行成功：${actionLabel(action)}。下一步根据新状态重规划。`;
    }
  } catch (error) {
    session.metrics.invalidActions += 1;
    session.metrics.replans += 1;
    rememberSkill(session, action.skillId, false);
    entry.outcome = 'failed';
    entry.error = error?.message || 'UNKNOWN_ACTION_ERROR';
    session.memory.failures.push({ observationId:session.observation.id, action:clone(action), error:entry.error });
    session.pendingRecovery = true;
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
    },
  };
}

export function evaluateFarmAgentPolicies() {
  const tasks = [
    { id:'normal-season', label:'标准九日赛季', injectFailureAtStep:null },
    { id:'action-recovery', label:'含一次无效动作的恢复任务', injectFailureAtStep:2 },
  ];
  return Object.keys(FARM_AGENT_POLICIES).flatMap((policy) => tasks.map((task) => {
    const episode = runFarmAgentEpisode({ policy, injectFailureAtStep:task.injectFailureAtStep });
    return { task, policy:FARM_AGENT_POLICIES[policy], report:episode.report };
  }));
}
