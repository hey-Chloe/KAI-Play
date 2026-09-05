import assert from 'node:assert/strict';
import test from 'node:test';
import { advanceFarmDay, newFarmGame, plantFarmCrop } from '../web/farm.js';
import {
  createFarmAgentSession, emptyFarmAgentLongTermMemory, evaluateFarmAgentEvolution,
  evaluateFarmSkillCandidate, restoreFarmAgentLongTermMemory, runFarmAgentEpisode, stepFarmAgent,
} from '../web/game-agent.js';

function delayed(days) {
  let game = newFarmGame();
  for (let index=0;index<days;index+=1) game=advanceFarmDay(game);
  return game;
}

test('economic failure induces a versioned Skill and changes next-run decisions', () => {
  const game=delayed(2);
  const original=JSON.stringify(game);
  const first=runFarmAgentEpisode({game});
  assert.equal(first.report.finalCoins,81);
  assert.equal(first.report.taskSuccess,false);
  assert.equal(first.report.evolvedActions,0);
  assert.equal(first.report.skillTrialRollouts,24);
  assert.ok(first.report.skillTrialSteps<=24*96);
  assert.equal(first.memory.longTerm.evolution.version,1);
  assert.equal(first.memory.longTerm.evolution.active,'replace_late_plant');
  const event=first.memory.longTerm.evolution.history.at(-1);
  assert.equal(event?.status,'promoted');
  assert.ok(event.evidenceCount>0);
  const persisted=JSON.parse(JSON.stringify(first.memory.longTerm));
  const second=runFarmAgentEpisode({game,longTermMemory:persisted});
  assert.equal(second.report.finalCoins,181);
  assert.equal(second.report.evolvedActions,5);
  assert.equal(second.report.skillTrialRollouts,22);
  assert.equal(second.report.invalidActionRate,0);
  assert.ok(second.trajectory.some((entry)=>entry.action.evolvedSkill));
  assert.equal(second.memory.longTerm.evolution.version,1);
  assert.equal(JSON.stringify(game),original);
  assert.deepEqual(persisted,first.memory.longTerm);
});

test('candidate promotion rejects ties and validates multiple legal starting states', () => {
  for(const variant of ['skip_late_plant','replace_late_plant']) {
    const report=evaluateFarmSkillCandidate(variant);
    assert.equal(report.rows.length,6);
    assert.equal(report.accepted,true);
    assert.ok(report.rows.every(({before,after})=>after.completed && !after.invalid && after.coins>=before.coins));
    assert.equal(evaluateFarmSkillCandidate(variant,{incumbent:variant}).accepted,false);
  }
  assert.throws(()=>evaluateFarmSkillCandidate('eval(code)'),/VARIANT_INVALID/);
  assert.throws(()=>evaluateFarmSkillCandidate('skip_late_plant',{incumbent:'unknown'}),/INCUMBENT_INVALID/);
  assert.throws(()=>evaluateFarmSkillCandidate('skip_late_plant',{cases:[]}),/CASES_INVALID/);
  assert.throws(()=>evaluateFarmSkillCandidate('skip_late_plant',{cases:[{id:'bad',game:{}}]}),/GAME_INVALID/);
});

test('no evidence means no invented evolution, and the original gold route stays unchanged', () => {
  const normal=runFarmAgentEpisode();
  assert.equal(normal.report.finalCoins,346);
  assert.equal(normal.memory.longTerm.evolution.version,0);
  assert.deepEqual(normal.memory.longTerm.evolution.history,[]);
  const learned=runFarmAgentEpisode({game:delayed(2)}).memory.longTerm;
  const improved=runFarmAgentEpisode({longTermMemory:learned});
  assert.equal(improved.report.finalCoins,346);
  assert.equal(improved.report.evolvedActions,0);
  assert.equal(improved.report.evolutionVersion,1);
  const baseline=runFarmAgentEpisode({policy:'hierarchical',game:delayed(2),longTermMemory:learned});
  assert.equal(baseline.report.finalCoins,81);
  assert.equal(baseline.report.evolvedActions,0);
});

test('restored versions are revalidated and outdated suites roll back without live mutation', () => {
  const learned=runFarmAgentEpisode({game:delayed(2)}).memory.longTerm;
  const serialized=JSON.stringify(learned);
  const restored=createFarmAgentSession({longTermMemory:JSON.parse(serialized)});
  assert.equal(restored.memory.longTerm.evolution.active,'replace_late_plant');
  assert.match(restored.plan.memoryHint,/自改进 Skill v1/);
  const outdated=JSON.parse(serialized);
  outdated.evolution.suite='old-rules';
  const safe=createFarmAgentSession({game:delayed(2),longTermMemory:outdated});
  assert.equal(safe.memory.longTerm.evolution.active,null);
  assert.equal(safe.memory.longTerm.evolution.history.at(-1)?.status,'rollback');
  assert.equal(safe.evolutionEvent?.status,'rollback');
  assert.deepEqual(safe.game,delayed(2));
  assert.equal(outdated.evolution.active,'replace_late_plant');
  const forged=JSON.parse(serialized);
  forged.evolution.history=[];
  assert.equal(createFarmAgentSession({longTermMemory:forged}).memory.longTerm.evolution.active,null);
});

test('rolled-back variants remain quarantined and cannot be silently promoted again', () => {
  const memory=emptyFarmAgentLongTermMemory();
  memory.evolution.blockedVariants=['replace_late_plant','skip_late_plant'];
  const result=runFarmAgentEpisode({game:delayed(2),longTermMemory:memory});
  assert.equal(result.report.finalCoins,81);
  assert.equal(result.report.activeEvolvedSkill,null);
  assert.equal(result.report.evolutionVersion,0);
  assert.equal(result.evolutionEvent?.status,'rejected');
  assert.equal(result.report.skillTrialRollouts,0);
  const roundTrip=restoreFarmAgentLongTermMemory(JSON.parse(JSON.stringify(result.memory.longTerm)));
  assert.deepEqual(roundTrip.evolution.blockedVariants,memory.evolution.blockedVariants);
});

test('untrusted evolution memory is bounded and cannot introduce executable Skills', () => {
  const memory=emptyFarmAgentLongTermMemory();
  memory.evolution={suite:'farm-deadline-v1',version:-8,active:'arbitrary-code',history:[
    null,{status:'injected'},{status:'rejected',variant:'untrusted',reason:'x'.repeat(400)},
  ]};
  const safe=restoreFarmAgentLongTermMemory(memory);
  assert.equal(safe.evolution.active,null);
  assert.equal(safe.evolution.version,0);
  assert.equal(safe.evolution.history.length,1);
  assert.equal(safe.evolution.history[0].variant,null);
  assert.equal(safe.evolution.history[0].reason.length,240);
  memory.evolution.history=Array.from({length:100},()=>({status:'rejected'}));
  assert.equal(restoreFarmAgentLongTermMemory(memory).evolution.history.length,20);
  delete memory.evolution;
  assert.equal(restoreFarmAgentLongTermMemory(memory).evolution.active,null);
});

test('the VLM guard blocks before an evolved Skill can act', () => {
  const learned=runFarmAgentEpisode({game:delayed(2)}).memory.longTerm;
  const session=createFarmAgentSession({game:delayed(8),longTermMemory:learned,visualMode:'guard'});
  const before=JSON.stringify(session.game);
  stepFarmAgent(session,{visualRequired:true,visualObservation:{matched:false}});
  assert.equal(session.status,'guarded');
  assert.equal(JSON.stringify(session.game),before);
  assert.equal(session.metrics.evolvedActions,0);
  stepFarmAgent(session,{visualRequired:true,visualObservation:{matched:true}});
  assert.equal(session.game.status,'finished');
  assert.equal(session.game.coins,36);
  assert.equal(session.metrics.evolvedActions,1);
});

test('frozen transfer probes are reported separately from discovery and promotion cases', () => {
  const report=evaluateFarmAgentEvolution();
  assert.equal(report.discovery.finalCoins,81);
  assert.equal(report.replay.finalCoins,181);
  assert.deepEqual(report.transfer.map((row)=>[row.id,row.before.finalCoins,row.after.finalCoins]),[
    ['untuned-day4',96,166],['untuned-day6',41,111],
  ]);
  assert.ok(report.transfer.every((row)=>row.after.invalidActionRate===0));
  const gateIds=evaluateFarmSkillCandidate('replace_late_plant').rows.map((row)=>row.id);
  assert.ok(!gateIds.includes('late-day3')&&!gateIds.includes('late-day4')&&!gateIds.includes('late-day6'));
});

test('a rejected replacement does not count as an executed evolved action', () => {
  const learned=runFarmAgentEpisode({game:delayed(2)}).memory.longTerm;
  const session=createFarmAgentSession({game:delayed(8),longTermMemory:learned,injectFailureAtStep:1});
  stepFarmAgent(session);
  assert.equal(session.metrics.invalidActions,1);
  assert.equal(session.metrics.evolvedActions,0);
  stepFarmAgent(session);
  assert.equal(session.metrics.evolvedActions,1);
  assert.equal(session.metrics.recoveries,1);
});

test('poor harvest timing is learned even after an injected rejected action', () => {
  const game=plantFarmCrop(delayed(2),2,'wheat');
  const run=runFarmAgentEpisode({game,injectFailureAtStep:2});
  assert.equal(run.metrics.invalidActions,1);
  assert.equal(run.metrics.recoveries,1);
  assert.equal(run.memory.longTerm.evolution.active,'replace_late_plant');
  assert.ok(run.evolutionEvent.evidenceCount>0);
});
