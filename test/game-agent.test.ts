import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FARM_AGENT_SKILLS,
  createFarmAgentSession,
  evaluateFarmAgentPolicies,
  observeFarmAgent,
  runFarmAgentEpisode,
  stepFarmAgent,
} from '../web/game-agent.js';
import { newFarmGame } from '../web/farm.js';

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

test('offline evaluation compares three policies across normal and recovery tasks', () => {
  const results = evaluateFarmAgentPolicies();
  assert.equal(results.length, 6);
  assert.deepEqual(new Set(results.map((entry) => entry.policy.id)), new Set(['myopic','hierarchical','skill_memory']));
  assert.deepEqual(new Set(results.map((entry) => entry.task.id)), new Set(['normal-season','action-recovery']));
  assert.equal(results.filter((entry) => entry.report.taskSuccess).length, 4);
});

test('invalid policy and bounded unfinished runs fail explicitly', () => {
  assert.throws(() => createFarmAgentSession({ policy:'unknown' }), /FARM_AGENT_POLICY_INVALID/);
  const blocked = runFarmAgentEpisode({ policy:'skill_memory', maxDecisions:1 });
  assert.equal(blocked.status, 'blocked');
  assert.equal(blocked.report.taskSuccess, false);
});
