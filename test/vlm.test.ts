import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import test from 'node:test';
import {
  VlmError,
  VlmService,
  buildFarmVisualQuestion,
  vlmConfigFromEnvironment,
  type FarmVlmObservationInput,
} from '../server/src/vlm.ts';

function input(revision = 0): FarmVlmObservationInput {
  return {
    imageDataUrl:`data:image/png;base64,${Buffer.from('image').toString('base64')}`,
    rpc:{
      day:1, revision, actionsLeft:5, coins:36, xp:0,
      plots:Array.from({ length:6 }, () => ({ status:'empty' as const, cropId:null, wateredToday:false })),
    },
  };
}

test('VLM configuration is disabled by default and rejects unsafe values', () => {
  assert.deepEqual(vlmConfigFromEnvironment({}), { mode:'disabled', baseUrl:null, apiKey:null, timeoutMs:30_000 });
  assert.throws(() => vlmConfigFromEnvironment({ DOUJOY_VLM_MODE:'http' }), /DOUJOY_VLM_URL_REQUIRED/);
  assert.throws(() => vlmConfigFromEnvironment({ DOUJOY_VLM_MODE:'http', DOUJOY_VLM_URL:'file:///tmp/model' }), /PROTOCOL/);
  assert.throws(() => vlmConfigFromEnvironment({ DOUJOY_VLM_TIMEOUT_MS:'1' }), /TIMEOUT/);
});

test('visual question randomizes the answer position while keeping the RPC truth', () => {
  const first = buildFarmVisualQuestion(input(0));
  const third = buildFarmVisualQuestion(input(2));
  assert.equal(first.expectedLabel, 'A');
  assert.equal(third.expectedLabel, 'C');
  assert.match(first.choices[0].text, /第1日，36金币，0经验/);
  assert.equal(third.choices.find((choice) => choice.label === 'C')?.text, first.choices[0].text);
  assert.equal(third.candidates.find((choice) => choice.label === 'C')?.state.plots.length, 6);
  assert.throws(() => buildFarmVisualQuestion({ ...input(), imageDataUrl:'data:image/svg+xml;base64,PHN2Zy8+' }), (error: unknown) => error instanceof VlmError && error.code === 'VLM_IMAGE_INVALID');
});

test('HTTP VLM bridge authenticates upstream and returns a verified observation', async () => {
  const calls: Array<{ url: string; authorization?: string }> = [];
  const upstream = createServer(async (request, response) => {
    calls.push({ url:request.url ?? '', authorization:request.headers.authorization });
    if (request.url === '/health') {
      response.writeHead(200, { 'content-type':'application/json' });
      response.end(JSON.stringify({ ok:true, ready:true, model:'kai-test-vlm' }));
      return;
    }
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const requestBody = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    response.writeHead(200, { 'content-type':'application/json' });
    response.end(JSON.stringify({ ok:true, result:{
      label:requestBody.choices[0].label,
      rawText:requestBody.choices[0].label,
      model:'kai-test-vlm', checkpoint:'test-adapter', latencyMs:21,
      usage:{ inputTokens:143, outputTokens:1 },
    } }));
  });
  upstream.listen(0, '127.0.0.1');
  await once(upstream, 'listening');
  const address = upstream.address();
  assert.ok(address && typeof address !== 'string');
  const service = new VlmService({ mode:'http', baseUrl:`http://127.0.0.1:${address.port}`, apiKey:'secret', timeoutMs:1_000 });
  try {
    const status = await service.status();
    assert.equal(status.ready, true);
    assert.equal(status.model, 'kai-test-vlm');
    const observation = await service.observe(input());
    assert.equal(observation.matched, true);
    assert.equal(observation.expectedLabel, 'A');
    assert.equal(observation.model, 'kai-test-vlm');
    assert.equal(observation.decision, 'pass');
    assert.equal(observation.structuredObservation.scene, 'farm');
    assert.equal(observation.structuredObservation.frameRevision, 0);
    assert.equal(observation.structuredObservation.plots.length, 6);
    assert.deepEqual(observation.usage, { inputTokens:143, outputTokens:1, totalTokens:144 });
    assert.match(observation.domainWarning, /ScienceQA/);
    const mismatch = await service.observe(input(1));
    assert.equal(mismatch.matched, false);
    assert.equal(mismatch.decision, 'hold');
    assert.equal(mismatch.expectedLabel, 'B');
    assert.deepEqual(calls.map((call) => call.authorization), ['Bearer secret', 'Bearer secret', 'Bearer secret']);
  } finally {
    upstream.close();
    await once(upstream, 'close');
  }
});

test('disabled and unavailable VLM states fail closed instead of fabricating inference', async () => {
  const disabled = new VlmService({ mode:'disabled', baseUrl:null, apiKey:null, timeoutMs:1_000 });
  assert.equal((await disabled.status()).ready, false);
  await assert.rejects(() => disabled.observe(input()), (error: unknown) => error instanceof VlmError && error.code === 'VLM_DISABLED');
  const unavailable = new VlmService({ mode:'http', baseUrl:'http://127.0.0.1:1', apiKey:null, timeoutMs:50 });
  const status = await unavailable.status();
  assert.equal(status.ready, false);
  assert.equal(status.error, 'VLM_UNAVAILABLE');
});
