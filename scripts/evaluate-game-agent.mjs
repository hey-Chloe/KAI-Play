import { evaluateFarmAgentPolicies } from '../web/game-agent.js';

const results = evaluateFarmAgentPolicies();
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
}));

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ schemaVersion:1, environment:'kai-farm-v2', rows }, null, 2));
} else {
  console.log('KAI Play Game Agent P0 · deterministic offline evaluation');
  console.table(rows);
  console.log('Boundary: deterministic policy baselines; no external LLM/VLM inference or SFT/RL claim.');
}
