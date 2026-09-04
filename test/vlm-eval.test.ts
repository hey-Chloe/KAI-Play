import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { resolve } from 'node:path';
import test from 'node:test';
import { runVlmEvaluation } from '../scripts/vlm-eval-lib.mjs';

const manifestPath=resolve('evals/kai-farm-vlm-v1/manifest.json');

test('frozen KAI Farm VLM manifest contains six hash-verified PNG states',async()=>{
  const manifest=JSON.parse(await readFile(manifestPath,'utf8'));
  assert.equal(manifest.schemaVersion,1);
  assert.equal(manifest.status,'SYNTHETIC_FIXTURES_READY_REAL_MODEL_NOT_RUN');
  assert.equal(manifest.samples.length,6);
  assert.equal(new Set(manifest.samples.flatMap((sample:any)=>sample.tags)).has('weed'),true);
  assert.equal(new Set(manifest.samples.flatMap((sample:any)=>sample.tags)).has('ready'),true);
  for(const sample of manifest.samples){
    const bytes=await readFile(resolve('evals/kai-farm-vlm-v1',sample.frame));
    assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
    assert.equal(bytes.readUInt32BE(16),512);
    assert.equal(bytes.readUInt32BE(20),340);
    assert.equal(createHash('sha256').update(bytes).digest('hex'),sample.sha256);
    assert.equal(sample.rpc.plots.length,6);
  }
});

test('online VLM evaluator aggregates accuracy, latency and measured token use',async()=>{
  const server=createServer(async(request,response)=>{
    response.setHeader('content-type','application/json');
    if(request.url==='/v1/sessions/guest')return response.end(JSON.stringify({ok:true,token:'eval-token'}));
    assert.equal(request.headers.authorization,'Bearer eval-token');
    if(request.url==='/v1/agent/vlm/status')return response.end(JSON.stringify({ok:true,status:{ready:true,model:'eval-vlm',specialization:'fixture'}}));
    const chunks=[];for await(const chunk of request)chunks.push(chunk);
    const body=JSON.parse(Buffer.concat(chunks).toString('utf8'));
    const revision=body.rpc.revision;
    const expected=['A','B','C','D'][revision%4];
    const matched=revision!==3;
    response.end(JSON.stringify({ok:true,observation:{
      matched,label:matched?expected:'A',expectedLabel:expected,decision:matched?'pass':'hold',
      latencyMs:10+revision,model:'eval-vlm',checkpoint:'fixture-checkpoint',
      usage:{inputTokens:100+revision,outputTokens:1,totalTokens:101+revision},
    }}));
  });
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const address=server.address();assert.ok(address&&typeof address!=='string');
  try{
    const report=await runVlmEvaluation({baseUrl:`http://127.0.0.1:${address.port}`,manifestPath,now:()=> '2026-09-04T00:00:00.000Z'});
    assert.equal(report.startedAt,'2026-09-04T00:00:00.000Z');
    assert.deepEqual(report.summary,{attempted:6,completed:6,errors:0,correct:5,accuracy:.8333,p50LatencyMs:12,p95LatencyMs:15,totalInputTokens:615,totalOutputTokens:6,averageTokensPerCompleted:103.5});
    assert.equal(report.rows.find((row:any)=>row.id==='day5-drought-and-weed')?.matched,false);
    assert.match(report.boundary,/not evidence of general game understanding/);
  }finally{
    server.close();await once(server,'close');
  }
});
