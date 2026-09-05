import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FARM_AGENT_SKILLS,
  FARM_AGENT_MEMORY_LIMIT,
  FARM_AGENT_VISUAL_MODES,
  createFarmAgentSession,
  emptyFarmAgentLongTermMemory,
  enumerateFarmAgentActions,
  evaluateFarmAgentMemoryTransfer,
  evaluateFarmAgentPolicies,
  farmAgentActionId,
  farmVisualGuardReason,
  observeFarmAgent,
  planFarmAgent,
  restoreFarmAgentLongTermMemory,
  runFarmAgentEpisode,
  stepFarmAgent,
} from '../web/game-agent.js';
import { newFarmGame, plantFarmCrop } from '../web/farm.js';

test('farm agent observation fuses screen semantics, text, RPC state, and recent history', () => {
  const game = newFarmGame();
  const observation = observeFarmAgent(game, {
    frame:'frame://farm-day-1',
    uiText:'第一日测试画面',
    history:[{ step:1, action:{ type:'observe' }, outcome:'success' }],
  });
  assert.equal(observation.modalities.screen.source, 'frame_reference');
  assert.equal(observation.modalities.screen.frame, 'frame://farm-day-1');
  assert.equal(observation.modalities.screen.objects.length, 6);
  assert.equal(observation.modalities.text.ui, '第一日测试画面');
  assert.equal(observation.modalities.rpc.day, 1);
  assert.equal(observation.modalities.history.length, 1);
  assert.deepEqual(observation.summary.empty, [0,1,2,3,4,5]);
  assert.throws(() => observeFarmAgent({ ...game, day:99 }), /FARM_AGENT_GAME_INVALID/);
});

test('farm agent session exposes goal, hierarchical plan, skill library stats, and memory', () => {
  const session = createFarmAgentSession({ policy:'skill_memory' });
  assert.equal(session.goal.targetCoins, 330);
  assert.equal(session.plan.phases.length, 3);
  assert.equal(Object.keys(session.memory.skillStats).length, FARM_AGENT_SKILLS.length);
  assert.equal(session.trajectory.length, 0);
  stepFarmAgent(session);
  assert.equal(session.status, 'running');
  assert.equal(session.trajectory.length, 1);
  assert.equal(session.trajectory[0].outcome, 'success');
  assert.equal(session.activeSkill?.id, 'plant_for_subgoal');
});

test('executable plans select an active-phase candidate and expose bounded alternatives', () => {
  const game = newFarmGame();
  const candidates = enumerateFarmAgentActions(game,'skill_memory');
  assert.equal(candidates.length,7);
  assert.equal(candidates[0].id,'plant:0:wheat');
  assert.equal(candidates.at(-1)?.id,'advance_day:-:-');
  const plan = planFarmAgent(game,{policy:'skill_memory'});
  assert.equal(plan.activePhaseId,'unlock-carrot');
  assert.equal(plan.selectedActionId,candidates[0].id);
  assert.deepEqual(plan.selectedAction,candidates[0].action);
  assert.equal(plan.alternativesConsidered,6);
  assert.equal(farmAgentActionId(plan.selectedAction),'plant:0:wheat');
  assert.throws(()=>enumerateFarmAgentActions(game,'unknown'),/FARM_AGENT_POLICY_INVALID/);
});

test('a rejected planned action is excluded and the next plan executes a real alternative', () => {
  const session = createFarmAgentSession({ policy:'skill_memory' });
  stepFarmAgent(session,{rejectPlannedAction:true});
  assert.equal(session.game.revision,0);
  assert.equal(session.trajectory[0].action.plotIndex,0);
  assert.equal(session.trajectory[0].error,'PLANNED_ACTION_REJECTED');
  assert.deepEqual(session.failedActionIds,['plant:0:wheat']);
  stepFarmAgent(session);
  assert.equal(session.trajectory[1].replanTrigger,'action_failed');
  assert.equal(session.trajectory[1].action.plotIndex,1);
  assert.equal(session.trajectory[1].candidateRank,2);
  assert.equal(session.trajectory[1].outcome,'success');
  assert.equal(session.metrics.recoveries,1);
  assert.equal(session.metrics.alternativeActionsConsidered,1);
});

test('farm agent can take over the exact live game instead of resetting a parallel simulation', () => {
  const liveGame = plantFarmCrop(newFarmGame(), 4, 'wheat');
  const session = createFarmAgentSession({ game:liveGame, policy:'skill_memory' });
  assert.equal(session.game.revision, liveGame.revision);
  assert.equal(session.game.coins, liveGame.coins);
  assert.equal(session.game.plots[4].cropId, 'wheat');

  stepFarmAgent(session);
  assert.equal(session.trajectory[0].before.revision, liveGame.revision);
  assert.ok(session.game.revision > liveGame.revision);
  assert.equal(session.game.plots[4].cropId, 'wheat');
});

test('hierarchical and skill-memory policies complete the canonical gold route', () => {
  for (const policy of ['hierarchical','skill_memory']) {
    const episode = runFarmAgentEpisode({ policy });
    assert.equal(episode.report.taskSuccess, true);
    assert.equal(episode.report.finalCoins, 346);
    assert.equal(episode.report.medal, 'gold');
    assert.equal(episode.game.result?.profit, 310);
    assert.equal(episode.game.result?.harvests, 15);
    assert.equal(episode.memory.episodes.length, 1);
    assert.ok(episode.report.contentCoverage >= 0.8);
  }
});

test('the myopic baseline is reproducible and misses the long-horizon gold target', () => {
  const first = runFarmAgentEpisode({ policy:'myopic' });
  const second = runFarmAgentEpisode({ policy:'myopic' });
  assert.deepEqual(first.report, second.report);
  assert.equal(first.report.taskSuccess, false);
  assert.equal(first.report.finalCoins, 151);
  assert.equal(first.report.medal, 'none');
  assert.equal(first.report.recoveryRate, null);
});

test('reflection preserves state after an invalid action and recovers on the next decision', () => {
  const episode = runFarmAgentEpisode({ policy:'skill_memory', injectFailureAtStep:2 });
  const failure = episode.trajectory.find((entry: any) => entry.outcome === 'failed');
  assert.ok(failure);
  assert.equal(failure.error, 'FARM_PLOT_INVALID');
  assert.equal(failure.before.revision, 1);
  assert.equal(episode.metrics.invalidActions, 1);
  assert.equal(episode.metrics.replans, 1);
  assert.equal(episode.metrics.recoveries, 1);
  assert.equal(episode.memory.failures.length, 1);
  assert.equal(episode.report.recoveryRate, 1);
  assert.equal(episode.report.taskSuccess, true);
});

test('successful episodes become bounded local Skill macros and are retrieved by the next run', () => {
  const first = runFarmAgentEpisode({ policy:'skill_memory' });
  assert.equal(first.memory.longTerm.totalEpisodes, 1);
  assert.equal(first.memory.longTerm.episodes.length, 1);
  assert.equal(first.memory.longTerm.macros.length, 1);
  assert.equal(first.memory.longTerm.episodes[0].finalRevision, first.game.revision);
  assert.equal(first.memory.longTerm.episodes[0].xp, first.game.xp);
  assert.equal(first.memory.longTerm.episodes[0].harvests, first.game.harvests);
  assert.equal(first.memory.longTerm.episodes[0].uniqueSkills, first.metrics.uniqueSkills);
  assert.ok(first.memory.longTerm.macros[0].sequence.length > 3);
  assert.equal(first.report.reusedSkillMacro, false);

  const second = runFarmAgentEpisode({ policy:'skill_memory', longTermMemory:first.memory.longTerm });
  assert.match(second.plan.memoryHint, /成功轨迹/);
  assert.equal(second.report.reusedSkillMacro, true);
  assert.equal(second.macroCursor, first.memory.longTerm.macros[0].sequence.length);
  assert.equal(second.memory.longTerm.totalEpisodes, 2);
  assert.equal(second.memory.longTerm.macros[0].successes, 2);
  assert.equal(second.report.finalCoins, 346);
});

test('long-term memory restoration rejects unknown Skills and bounds stored episodes', () => {
  const empty = emptyFarmAgentLongTermMemory();
  const invalid = restoreFarmAgentLongTermMemory({
    ...empty,
    schemaVersion:1,
    totalEpisodes:1,
    episodes:[{ id:'bad', policy:'skill_memory', skillSequence:['invented_skill'] }],
    macros:[{ id:'bad', policy:'skill_memory', sequence:['invented_skill'], successes:99 }],
    skillStats:{ plant_for_subgoal:{ uses:-3, successes:Number.MAX_SAFE_INTEGER + 1, failures:2 } },
  });
  assert.equal(invalid.episodes.length, 0);
  assert.equal(invalid.macros.length, 0);
  assert.equal(invalid.skillStats.plant_for_subgoal.uses, 0);
  assert.equal(invalid.skillStats.plant_for_subgoal.successes, 0);
  assert.equal(invalid.skillStats.plant_for_subgoal.failures, 2);

  const validEpisode = {
    id:'restored', goalId:'farm-gold-season', policy:'skill_memory', success:true,
    finalCoins:346, medal:'gold', steps:54, lesson:'ok',
    skillSequence:['plant_for_subgoal'], invalidActions:0, visualBlocks:0,
  };
  const bounded = restoreFarmAgentLongTermMemory({
    ...empty,
    schemaVersion:1,
    totalEpisodes:FARM_AGENT_MEMORY_LIMIT + 5,
    episodes:Array.from({ length:FARM_AGENT_MEMORY_LIMIT + 5 }, (_, index) => ({ ...validEpisode, id:`episode-${index}` })),
  });
  assert.equal(bounded.episodes.length, FARM_AGENT_MEMORY_LIMIT);
  assert.equal(bounded.episodes[0].id, 'episode-5');
});

test('visual shadow records a mismatch while RPC execution continues', () => {
  const session = createFarmAgentSession({ policy:'skill_memory', visualMode:'shadow' });
  stepFarmAgent(session, { visualObservation:{
    matched:false, label:'C', expectedLabel:'A', model:'test-vlm', latencyMs:80,
    structuredObservation:{ scene:'farm', frameRevision:0, plots:[] },
    usage:{ inputTokens:100, outputTokens:1 },
  } });
  assert.equal(FARM_AGENT_VISUAL_MODES.shadow.id, 'shadow');
  assert.equal(session.game.revision, 1);
  assert.equal(session.trajectory[0].outcome, 'success');
  assert.equal(session.metrics.visualMismatches, 1);
  assert.equal(session.metrics.visualBlocks, 0);
  assert.equal(session.metrics.vlmInputTokens, 100);
});

test('visual guard blocks a conflicting or unavailable frame without mutating game state', () => {
  const session = createFarmAgentSession({ policy:'skill_memory', visualMode:'guard' });
  const before = JSON.stringify(session.game);
  stepFarmAgent(session, { visualRequired:true, visualObservation:{
    matched:false, label:'D', expectedLabel:'A', model:'test-vlm', latencyMs:75,
    structuredObservation:{ scene:'farm', frameRevision:0, plots:[] },
    usage:{ inputTokens:90, outputTokens:1 },
  } });
  assert.equal(JSON.stringify(session.game), before);
  assert.equal(session.status, 'guarded');
  assert.equal(session.trajectory[0].outcome, 'guarded');
  assert.equal(session.trajectory[0].error, 'VLM_RPC_MISMATCH');
  assert.equal(session.metrics.visualBlocks, 1);
  assert.equal(session.metrics.replans, 1);
  assert.equal(session.memory.visualConflicts.length, 1);

  stepFarmAgent(session, { visualRequired:true });
  assert.equal(JSON.stringify(session.game), before);
  assert.equal(session.trajectory[1].error, 'VLM_UNAVAILABLE');
  assert.equal(session.metrics.visualBlocks, 2);

  stepFarmAgent(session, { visualRequired:true, visualObservation:{
    matched:true, label:'A', expectedLabel:'A', model:'test-vlm', latencyMs:65,
    structuredObservation:{ scene:'farm', frameRevision:0, plots:[] },
    usage:{ inputTokens:88, outputTokens:1 },
  } });
  assert.equal(session.status, 'running');
  assert.equal(session.game.revision, 1);
  assert.equal(session.trajectory[2].outcome, 'success');
  assert.equal(session.metrics.visualMatches, 1);
});

test('visual guard rejects a matched but stale or structurally inconsistent frame', () => {
  const game = newFarmGame();
  const stale = { matched:true, structuredObservation:{scene:'farm',frameRevision:9}, usage:{} };
  assert.equal(farmVisualGuardReason(game,stale),'VLM_STALE_FRAME');
  assert.equal(farmVisualGuardReason(game,{matched:true,structuredObservation:{scene:'farm',frameRevision:0,coins:999},usage:{}}),'VLM_STATE_MISMATCH');
  const session = createFarmAgentSession({ policy:'skill_memory', visualMode:'guard' });
  const before = JSON.stringify(session.game);
  stepFarmAgent(session,{visualRequired:true,visualObservation:stale});
  assert.equal(JSON.stringify(session.game),before);
  assert.equal(session.trajectory[0].error,'VLM_STALE_FRAME');
  assert.equal(session.trajectory[0].replanTrigger,'initial');
  assert.equal(session.nextPlanTrigger,'stale_visual_frame');
});

test('offline evaluation compares four policies across normal and recovery tasks', () => {
  const results = evaluateFarmAgentPolicies();
  assert.equal(results.length, 8);
  assert.deepEqual(new Set(results.map((entry) => entry.policy.id)), new Set(['myopic','hierarchical','skill_memory','mcts']));
  assert.deepEqual(new Set(results.map((entry) => entry.task.id)), new Set(['normal-season','action-recovery']));
  assert.equal(results.filter((entry) => entry.report.taskSuccess).length, 6);
  const recoveries = results.filter((entry) => entry.task.id === 'action-recovery');
  assert.ok(recoveries.every((entry) => entry.report.recoveryRate === 1));
  assert.ok(recoveries.every((entry) => entry.report.alternativeActionsConsidered >= 1));
  assert.ok(results.every((entry) => entry.report.planRevisions === entry.report.decisions + 1));
});

test('offline memory-transfer evaluation separates discovery, replay, and recovery evidence', () => {
  const result = evaluateFarmAgentMemoryTransfer();
  assert.equal(result.discovery.reusedSkillMacro, false);
  assert.equal(result.replay.reusedSkillMacro, true);
  assert.equal(result.recovery.reusedSkillMacro, true);
  assert.equal(result.macro.sequenceLength, 18);
  assert.equal(result.macro.replayMatchedSteps, 18);
  assert.equal(result.replay.skillMacroCoverage, 1);
  assert.equal(result.recovery.recoveryRate, 1);
});

test('invalid policy and bounded unfinished runs fail explicitly', () => {
  assert.throws(() => createFarmAgentSession({ policy:'unknown' }), /FARM_AGENT_POLICY_INVALID/);
  assert.throws(() => createFarmAgentSession({ visualMode:'unknown' }), /FARM_AGENT_VISUAL_MODE_INVALID/);
  const blocked = runFarmAgentEpisode({ policy:'skill_memory', maxDecisions:1 });
  assert.equal(blocked.status, 'blocked');
  assert.equal(blocked.report.taskSuccess, false);
});
