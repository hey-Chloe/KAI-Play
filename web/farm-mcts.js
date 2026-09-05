import {
  FARM_CROPS,
  FARM_SEASON_DAYS,
  advanceFarmDay,
  clearFarmPlot,
  farmMarketForDay,
  farmPlotStatus,
  harvestFarmCrop,
  plantFarmCrop,
  restoreFarmGame,
  waterFarmCrop,
} from './farm.js';

export const FARM_MCTS_DEFAULTS = Object.freeze({
  rollouts:64,
  horizon:72,
  exploration:Math.SQRT2,
});

function actionId(action) {
  return [action.type, Number.isInteger(action.plotIndex) ? action.plotIndex : '-', action.cropId || '-'].join(':');
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function requireGame(game) {
  const restored = restoreFarmGame(game);
  if (!restored) throw new Error('FARM_MCTS_GAME_INVALID');
  return restored;
}

function execute(game, action) {
  if (action.type === 'plant') return plantFarmCrop(game, action.plotIndex, action.cropId);
  if (action.type === 'water') return waterFarmCrop(game, action.plotIndex);
  if (action.type === 'harvest') return harvestFarmCrop(game, action.plotIndex);
  if (action.type === 'clear') return clearFarmPlot(game, action.plotIndex);
  if (action.type === 'advance_day') return advanceFarmDay(game);
  if (action.type === 'done') return game;
  throw new Error('FARM_MCTS_ACTION_INVALID');
}

function skillFor(action) {
  if (action.type === 'harvest') return 'harvest_ready_crop';
  if (action.type === 'clear') return 'clear_failed_plot';
  if (action.type === 'water') return 'care_for_growth';
  if (action.type === 'plant') return 'plant_for_subgoal';
  if (action.type === 'advance_day') return 'advance_when_stable';
  return null;
}

export function enumerateFarmMctsActions(game, { collapseSymmetry = true } = {}) {
  const restored = requireGame(game);
  if (restored.status === 'finished') return [{ type:'done' }];
  const actions = [];
  if (restored.actionsLeft > 0) {
    restored.plots.forEach((plot,index) => {
      const status = farmPlotStatus(plot);
      if (status === 'ready') actions.push({ type:'harvest', plotIndex:index });
      else if (status === 'weed') actions.push({ type:'clear', plotIndex:index });
      else if (status === 'growing' && !plot.wateredToday) actions.push({ type:'water', plotIndex:index });
    });
    const emptyPlots=restored.plots.flatMap((plot,index)=>farmPlotStatus(plot)==='empty'?[index]:[]);
    const plantingPlots=collapseSymmetry ? emptyPlots.slice(0,1) : emptyPlots;
    if (plantingPlots.length) {
      for (const crop of Object.values(FARM_CROPS)) {
        if (crop.unlockXp <= restored.xp && crop.seedCost <= restored.coins
          && restored.day + crop.growDays <= FARM_SEASON_DAYS) {
          // Internal nodes collapse symmetric empty plots; the root keeps every legal
          // alternative so a rejected representative can recover without losing a day.
          for (const plotIndex of plantingPlots) actions.push({ type:'plant', plotIndex, cropId:crop.id });
        }
      }
    }
  }
  actions.push({ type:'advance_day' });
  return actions.map((action)=>({ ...action, skillId:skillFor(action) }));
}

function hashSeed(value) {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash,16777619);
  }
  return hash >>> 0;
}

function randomGenerator(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ value >>> 15,value | 1);
    value ^= value + Math.imul(value ^ value >>> 7,value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

function shuffled(values, random) {
  const next = [...values];
  for (let index=next.length-1;index>0;index-=1) {
    const other=Math.floor(random()*(index+1));
    [next[index],next[other]]=[next[other],next[index]];
  }
  return next;
}

function targetCrop(game) {
  const candidates=Object.values(FARM_CROPS).filter((crop)=>crop.unlockXp<=game.xp
    && crop.seedCost<=game.coins && game.day+crop.growDays<=FARM_SEASON_DAYS);
  return candidates.at(-1)?.id || 'wheat';
}

function rolloutAction(game, actions, random) {
  if (actions.length <= 1) return actions[0];
  if (random() < .035) return actions[Math.floor(random()*actions.length)];
  const market=farmMarketForDay(game.day);
  const ready=actions.filter((action)=>action.type==='harvest');
  const focused=ready.find((action)=>game.plots[action.plotIndex]?.cropId===market.focusId);
  if (focused) return focused;
  if (ready.length && (game.day===FARM_SEASON_DAYS || random()<.9)) return ready[0];
  const clear=actions.find((action)=>action.type==='clear');
  if (clear) return clear;
  const water=actions.find((action)=>action.type==='water');
  if (water) return water;
  const desired=targetCrop(game);
  const plant=actions.find((action)=>action.type==='plant'&&action.cropId===desired)
    || actions.find((action)=>action.type==='plant');
  if (plant) return plant;
  return actions.find((action)=>action.type==='advance_day') || actions[0];
}

function reward(game) {
  const restored=requireGame(game);
  const cropValue=restored.plots.reduce((sum,plot)=>{
    if (plot.kind!=='crop') return sum;
    const crop=FARM_CROPS[plot.cropId];
    return sum + crop.basePrice * Math.min(1,plot.growthDays/Math.max(1,crop.growDays));
  },0);
  const terminalBonus=restored.status==='finished'&&restored.coins>=330 ? 600 : 0;
  // UCT assumes rewards on a compact scale. Keeping the score near [0, 1.5]
  // lets exploration compete with small early-game value differences.
  return (restored.coins + cropValue*.35 + restored.xp*.8 + terminalBonus) / 1_000;
}

function makeNode(state, parent, action, depth, random) {
  return {
    state,
    parent,
    action,
    depth,
    visits:0,
    valueSum:0,
    children:[],
    untried:shuffled(enumerateFarmMctsActions(state),random),
  };
}

function selectChild(node, exploration) {
  const parentVisits=Math.max(1,node.visits);
  return [...node.children].sort((left,right)=>{
    const leftMean=left.valueSum/Math.max(1,left.visits);
    const rightMean=right.valueSum/Math.max(1,right.visits);
    const leftUct=leftMean+exploration*Math.sqrt(Math.log(parentVisits)/Math.max(1,left.visits));
    const rightUct=rightMean+exploration*Math.sqrt(Math.log(parentVisits)/Math.max(1,right.visits));
    return rightUct-leftUct || actionId(left.action).localeCompare(actionId(right.action));
  })[0];
}

function boundedInteger(value, fallback, minimum, maximum) {
  return Number.isInteger(value) ? Math.min(maximum,Math.max(minimum,value)) : fallback;
}

export function searchFarmMcts(game, options = {}) {
  const rootState=requireGame(game);
  const rollouts=boundedInteger(options.rollouts,FARM_MCTS_DEFAULTS.rollouts,8,256);
  const horizon=boundedInteger(options.horizon,FARM_MCTS_DEFAULTS.horizon,8,96);
  const exploration=Number.isFinite(options.exploration)
    ? Math.min(4,Math.max(.01,Number(options.exploration))) : FARM_MCTS_DEFAULTS.exploration;
  const excluded=new Set(Array.isArray(options.excludedActionIds)
    ? options.excludedActionIds.filter((id)=>typeof id==='string').slice(-12) : []);
  const stateSignature=JSON.stringify({ day:rootState.day,actionsLeft:rootState.actionsLeft,coins:rootState.coins,
    xp:rootState.xp,plots:rootState.plots,excluded:[...excluded].sort() });
  const seed=Number.isInteger(options.seed) ? options.seed>>>0 : hashSeed(stateSignature);
  const random=randomGenerator(seed);
  const root=makeNode(rootState,null,null,0,random);
  root.untried=shuffled(enumerateFarmMctsActions(rootState,{collapseSymmetry:false}),random);
  root.untried=root.untried.filter((action)=>!excluded.has(actionId(action)));
  if (!root.untried.length) root.untried=[{ type:'advance_day', skillId:'advance_when_stable' }];
  let expandedNodes=0;
  let maxDepth=0;

  for (let rollout=0;rollout<rollouts;rollout+=1) {
    let node=root;
    while (node.state.status!=='finished'&&!node.untried.length&&node.children.length) {
      node=selectChild(node,exploration);
    }
    if (node.state.status!=='finished'&&node.untried.length) {
      const action=node.untried.pop();
      const child=makeNode(execute(node.state,action),node,action,node.depth+1,random);
      node.children.push(child);
      node=child;
      expandedNodes+=1;
      maxDepth=Math.max(maxDepth,node.depth);
    }
    let simulation=node.state;
    let simulationDepth=node.depth;
    while (simulation.status!=='finished'&&simulationDepth<horizon) {
      const actions=enumerateFarmMctsActions(simulation);
      simulation=execute(simulation,rolloutAction(simulation,actions,random));
      simulationDepth+=1;
    }
    const value=reward(simulation);
    maxDepth=Math.max(maxDepth,simulationDepth);
    while (node) {
      node.visits+=1;
      node.valueSum+=value;
      node=node.parent;
    }
  }

  const ranked=[...root.children].sort((left,right)=>right.visits-left.visits
    || right.valueSum/Math.max(1,right.visits)-left.valueSum/Math.max(1,left.visits)
    || actionId(left.action).localeCompare(actionId(right.action)));
  const selected=ranked[0] || { action:root.untried[0],visits:0,valueSum:0 };
  return {
    algorithm:'uct-mcts',
    selectedAction:clone(selected.action),
    selectedActionId:actionId(selected.action),
    rollouts,
    horizon,
    exploration,
    seed,
    expandedNodes,
    maxDepth,
    selectedVisits:selected.visits,
    selectedMeanValue:selected.visits ? selected.valueSum/selected.visits : 0,
    rootChildren:ranked.map((child)=>({
      actionId:actionId(child.action),
      action:clone(child.action),
      visits:child.visits,
      meanValue:child.visits ? child.valueSum/child.visits : 0,
    })),
  };
}
