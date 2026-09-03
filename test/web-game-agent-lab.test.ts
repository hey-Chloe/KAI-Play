import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const appSource = await readFile(new URL('../web/app.js', import.meta.url), 'utf8');
const stylesSource = await readFile(new URL('../web/styles.css', import.meta.url), 'utf8');
const dockerSource = await readFile(new URL('../web/Dockerfile', import.meta.url), 'utf8');
const packageSource = await readFile(new URL('../package.json', import.meta.url), 'utf8');

test('Agent Lab is a first-class primary route with explicit human controls', () => {
  assert.match(appSource, /data-view="agent"[^>]*>Agent<\/button>/);
  assert.match(appSource, /state\.view===['"]agent['"]\?agentLab\(\)/);
  assert.match(appSource, /aria-label="Agent 运行控制"/);
  assert.match(appSource, /data-action="agent-auto"/);
  assert.match(appSource, /data-action="agent-step"/);
  assert.match(appSource, /data-action="agent-reset"/);
  assert.match(appSource, /data-action="agent-fault"/);
});

test('Agent Lab renders real state, plan, trajectory, skills, memory, and honest capability boundaries', () => {
  assert.match(appSource, /真实农场状态/);
  assert.match(appSource, /层级计划/);
  assert.match(appSource, /行动轨迹/);
  assert.match(appSource, /Skill Library/);
  assert.match(appSource, /Memory · 本次运行/);
  assert.match(appSource, /真实 VLM \/ LLM 待接入/);
  assert.match(appSource, /MCTS \/ RL 待实验/);
  assert.match(appSource, /不冒充已经接入的 VLM、LLM 或强化学习模型/);
});

test('Agent Lab ships in syntax checks and the production Web image with 320px reflow rules', () => {
  assert.match(packageSource, /node --check web\/game-agent\.js/);
  assert.match(dockerSource, /game-agent\.js/);
  assert.match(stylesSource, /@media \(max-width:360px\)[^{]*\{[^}]*\.agent-lab-main/);
  assert.match(stylesSource, /\.agent-run-controls[^}]*overflow-x:auto/);
  assert.match(stylesSource, /@media \(prefers-reduced-motion:reduce\)[^{]*\{[^}]*\.agent-run-state/);
});
