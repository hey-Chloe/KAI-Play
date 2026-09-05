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
  assert.match(appSource, /data-action="agent-vlm-observe"/);
  assert.match(appSource, /data-action="agent-vlm-mode"/);
  assert.match(appSource, /data-action="agent-reset"/);
  assert.match(appSource, /data-action="agent-memory-clear"/);
  assert.match(appSource, /data-action="agent-fault"/);
});

test('Agent Lab renders real state, plan, trajectory, skills, memory, and honest capability boundaries', () => {
  assert.match(appSource, /真实农场状态/);
  assert.match(appSource, /层级计划/);
  assert.match(appSource, /行动轨迹/);
  assert.match(appSource, /Skill Library/);
  assert.match(appSource, /Memory · 本地长期/);
  assert.match(appSource, /最多保留最近 20 轮，仅存当前浏览器，不跨设备、不上传服务器/);
  assert.match(appSource, /当前浏览器拒绝持久化，Memory 仅在本次页面会话可用/);
  assert.match(appSource, /Skill 宏来自成功轨迹归纳，不代表模型训练/);
  assert.match(appSource, /saveFarmAgentLongTermMemory/);
  assert.match(appSource, /VLM PIXEL FRAME/);
  assert.match(appSource, /服务离线时明确降级，不伪造模型输出/);
  assert.match(appSource, /视觉判断通过/);
  assert.match(appSource, /视觉守卫会暂停动作/);
  assert.match(appSource, /visualRequired:session\.visualMode===['"]guard['"]/);
  assert.match(appSource, /UCT-MCTS 搜索/);
  assert.match(appSource, /RL 待实验/);
  assert.match(appSource, /UCT TREE SEARCH/);
  assert.match(appSource, /累计 Rollout/);
  assert.match(appSource, /与 RPC 真值做跨域一致性判断/);
});

test('Agent Lab ships in syntax checks and the production Web image with 320px reflow rules', () => {
  assert.match(packageSource, /node --check web\/game-agent\.js/);
  assert.match(dockerSource, /game-agent\.js/);
  assert.match(stylesSource, /@media \(max-width:360px\)[^{]*\{[^}]*\.agent-lab-main/);
  assert.match(stylesSource, /\.agent-run-controls[^}]*overflow-x:auto/);
  assert.match(stylesSource, /@media \(prefers-reduced-motion:reduce\)[^{]*\{[^}]*\.agent-run-state/);
});
