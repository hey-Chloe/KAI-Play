import { evaluateFarmAgentEvolution, evaluateFarmAgentMemoryTransfer, evaluateFarmAgentPolicies } from '../web/game-agent.js';

const results = evaluateFarmAgentPolicies();
const memoryTransfer = evaluateFarmAgentMemoryTransfer();
const evolution = evaluateFarmAgentEvolution();
const rows = results.map(({ task, policy, report }) => ({
  task:task.id,
  policy:policy.id,
  success:report.taskSuccess,
  finalCoins:report.finalCoins,
  medal:report.medal,
  decisions:report.decisions,
  invalidActionRate:Number(report.invalidActionRate.toFixed(4)),
  recoveryRate:report.recoveryRate === null ? 'N/A' : Number(report.recoveryRate.toFixed(4)),
  skillCoverage:Number(report.contentCoverage.toFixed(4)),
  estimatedTokens:report.estimatedTokens,
  planRevisions:report.planRevisions,
  alternativeActionsConsidered:report.alternativeActionsConsidered,
}));

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ schemaVersion:3, environment:'kai-farm-v2', rows, memoryTransfer, evolution }, null, 2));
} else {
  console.log('KAI Play Game Agent · deterministic offline evaluation');
  console.table(rows);
  console.table([
    { phase:'discovery', success:memoryTransfer.discovery.taskSuccess, coins:memoryTransfer.discovery.finalCoins, macroReuse:memoryTransfer.discovery.reusedSkillMacro, macroCoverage:'N/A' },
    { phase:'replay', success:memoryTransfer.replay.taskSuccess, coins:memoryTransfer.replay.finalCoins, macroReuse:memoryTransfer.replay.reusedSkillMacro, macroCoverage:memoryTransfer.replay.skillMacroCoverage },
    { phase:'recovery', success:memoryTransfer.recovery.taskSuccess, coins:memoryTransfer.recovery.finalCoins, macroReuse:memoryTransfer.recovery.reusedSkillMacro, macroCoverage:memoryTransfer.recovery.skillMacroCoverage },
  ]);
  console.log(`Memory transfer: ${memoryTransfer.macro.sequenceLength}-step successful Skill macro; replay matched ${memoryTransfer.macro.replayMatchedSteps} steps.`);
  console.table([
    { phase:'discovery', coins:evolution.discovery.finalCoins, evolvedActions:evolution.discovery.evolvedActions },
    { phase:'next-run', coins:evolution.replay.finalCoins, evolvedActions:evolution.replay.evolvedActions },
    ...evolution.transfer.map((row)=>({ phase:row.id, before:row.before.finalCoins, coins:row.after.finalCoins, evolvedActions:row.after.evolvedActions })),
  ]);
  console.log(evolution.boundary);
  console.log('Boundary: deterministic policy baselines and transparent trajectory retrieval; no external LLM/VLM inference or SFT/RL claim.');
}
