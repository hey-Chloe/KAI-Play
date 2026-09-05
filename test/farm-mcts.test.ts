import assert from 'node:assert/strict';
import test from 'node:test';
import { newFarmGame } from '../web/farm.js';
import { enumerateFarmMctsActions, searchFarmMcts } from '../web/farm-mcts.js';
import { runFarmAgentEpisode } from '../web/game-agent.js';

test('UCT-MCTS is deterministic, bounded, and does not mutate the live game', () => {
  const game=newFarmGame();
  const before=JSON.stringify(game);
  const first=searchFarmMcts(game,{rollouts:64,horizon:72});
  const second=searchFarmMcts(game,{rollouts:64,horizon:72});
  assert.equal(first.algorithm,'uct-mcts');
  assert.equal(first.rollouts,64);
  assert.ok(first.expandedNodes>0&&first.expandedNodes<=64);
  assert.ok(first.maxDepth<=72);
  assert.deepEqual(first.selectedAction,second.selectedAction);
  assert.deepEqual(first.rootChildren,second.rootChildren);
  assert.equal(JSON.stringify(game),before);
});

test('MCTS exposes only legal root actions and validates its budget', () => {
  const game=newFarmGame();
  const legal=enumerateFarmMctsActions(game,{collapseSymmetry:false});
  assert.equal(legal.filter((action)=>action.type==='plant').length,6);
  assert.equal(legal.at(-1)?.type,'advance_day');
  const bounded=searchFarmMcts(game,{rollouts:1,horizon:999,exploration:99});
  assert.equal(bounded.rollouts,8);
  assert.equal(bounded.horizon,96);
  assert.equal(bounded.exploration,4);
  assert.throws(()=>searchFarmMcts({}),/GAME_INVALID/);
});

test('MCTS reaches the canonical gold target and recovers from one rejected root action', () => {
  const standard=runFarmAgentEpisode({policy:'mcts'});
  assert.equal(standard.report.taskSuccess,true);
  assert.equal(standard.report.finalCoins,346);
  assert.equal(standard.report.invalidActionRate,0);
  assert.equal(standard.report.mctsRollouts,standard.report.mctsSearches*64);
  assert.ok(standard.report.mctsExpandedNodes>0);
  assert.ok(standard.trajectory.every((entry)=>entry.search?.algorithm==='uct-mcts'));

  const recovery=runFarmAgentEpisode({policy:'mcts',injectPlannedFailureAtStep:2});
  assert.equal(recovery.report.taskSuccess,true);
  assert.equal(recovery.report.finalCoins,346);
  assert.equal(recovery.report.recoveryRate,1);
  assert.equal(recovery.metrics.invalidActions,1);
  assert.ok(recovery.metrics.alternativeActionsConsidered>0);
});
