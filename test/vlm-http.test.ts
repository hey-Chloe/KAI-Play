import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

test('authenticated KAI PLAY route proxies one bounded farm frame to the configured VLM', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'doujoy-vlm-http-'));
  const upstream = createServer(async (request, response) => {
    assert.equal(request.headers.authorization, 'Bearer upstream-secret');
    if (request.url === '/health') {
      response.writeHead(200, { 'content-type':'application/json' });
      response.end(JSON.stringify({ ok:true, ready:true, model:'kai-vlm-test' }));
      return;
    }
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    assert.equal(body.image.mimeType, 'image/jpeg');
    assert.equal(body.choices.length, 4);
    response.writeHead(200, { 'content-type':'application/json' });
    response.end(JSON.stringify({ ok:true, result:{ label:'A', rawText:'A', model:'kai-vlm-test', latencyMs:7, usage:{ inputTokens:120, outputTokens:1 } } }));
  });
  upstream.listen(0, '127.0.0.1');
  await once(upstream, 'listening');
  const upstreamAddress = upstream.address();
  assert.ok(upstreamAddress && typeof upstreamAddress !== 'string');
  const port = 6_100 + Math.floor(Math.random() * 300);
  const origin = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['--experimental-strip-types', resolve('server/src/server.ts')], {
    cwd:resolve('.'),
    env:{
      ...process.env,
      DOUJOY_PORT:String(port),
      DOUJOY_DATA_PATH:join(directory, 'state.json'),
      DOUJOY_VLM_MODE:'http',
      DOUJOY_VLM_URL:`http://127.0.0.1:${upstreamAddress.port}`,
      DOUJOY_VLM_API_KEY:'upstream-secret',
      DOUJOY_VLM_TIMEOUT_MS:'1000',
    },
    stdio:['ignore', 'pipe', 'pipe'],
  });
  try {
    await new Promise<void>((resolveReady, reject) => {
      const timer = setTimeout(() => reject(new Error('SERVER_START_TIMEOUT')), 10_000);
      child.stdout.on('data', (chunk) => {
        if (String(chunk).includes('DouJoy server listening')) {
          clearTimeout(timer);
          resolveReady();
        }
      });
      child.once('exit', (code) => reject(new Error(`SERVER_EXITED_${code}`)));
    });
    const unauthorized = await fetch(`${origin}/v1/agent/vlm/status`);
    assert.equal(unauthorized.status, 401);
    const guestResponse = await fetch(`${origin}/v1/sessions/guest`, {
      method:'POST', headers:{ 'content-type':'application/json' }, body:JSON.stringify({ name:'VLM 测试' }),
    });
    const guest = await guestResponse.json() as { token: string };
    const headers = { authorization:`Bearer ${guest.token}`, 'content-type':'application/json' };
    const statusResponse = await fetch(`${origin}/v1/agent/vlm/status`, { headers });
    const status = await statusResponse.json() as { status: { ready: boolean; model: string } };
    assert.equal(status.status.ready, true);
    assert.equal(status.status.model, 'kai-vlm-test');
    const rpc = {
      day:1, revision:0, actionsLeft:5, coins:36, xp:0,
      plots:Array.from({ length:6 }, () => ({ status:'empty', cropId:null, wateredToday:false })),
    };
    const observeResponse = await fetch(`${origin}/v1/agent/vlm/observe`, {
      method:'POST', headers,
      body:JSON.stringify({ imageDataUrl:`data:image/jpeg;base64,${Buffer.from('jpeg').toString('base64')}`, rpc }),
    });
    const observed = await observeResponse.json() as { observation: { matched: boolean; model: string; expectedLabel: string; decision: string; structuredObservation: { scene: string; plots: unknown[] }; usage: { totalTokens: number } } };
    assert.equal(observeResponse.status, 200);
    assert.equal(observed.observation.matched, true);
    assert.equal(observed.observation.model, 'kai-vlm-test');
    assert.equal(observed.observation.expectedLabel, 'A');
    assert.equal(observed.observation.decision, 'pass');
    assert.equal(observed.observation.structuredObservation.scene, 'farm');
    assert.equal(observed.observation.structuredObservation.plots.length, 6);
    assert.equal(observed.observation.usage.totalTokens, 121);
    const invalidResponse = await fetch(`${origin}/v1/agent/vlm/observe`, {
      method:'POST', headers, body:JSON.stringify({ imageDataUrl:'not-an-image', rpc }),
    });
    const invalid = await invalidResponse.json() as { error: { code: string } };
    assert.equal(invalidResponse.status, 400);
    assert.equal(invalid.error.code, 'VLM_IMAGE_INVALID');
  } finally {
    if (child.exitCode === null) {
      child.kill();
      await Promise.race([once(child, 'exit'), new Promise((resolveTimeout) => setTimeout(resolveTimeout, 2_000))]);
    }
    upstream.close();
    await once(upstream, 'close');
    await rm(directory, { recursive:true, force:true });
  }
});
