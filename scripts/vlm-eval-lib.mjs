import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

function percentile(values, fraction) {
  if (!values.length) return null;
  const sorted=[...values].sort((left,right)=>left-right);
  return sorted[Math.min(sorted.length-1,Math.ceil(sorted.length*fraction)-1)];
}

async function jsonRequest(fetchImpl, url, options = {}) {
  const response=await fetchImpl(url,options);
  const payload=await response.json().catch(()=>null);
  if(!response.ok||!payload||payload.ok!==true){
    const error=new Error(payload?.error?.message||`HTTP_${response.status}`);
    error.code=payload?.error?.code||'EVAL_HTTP_ERROR';
    error.status=response.status;
    throw error;
  }
  return payload;
}

export async function runVlmEvaluation({
  baseUrl='http://127.0.0.1:4310',
  manifestPath=resolve('evals/kai-farm-vlm-v1/manifest.json'),
  fetchImpl=fetch,
  now=()=>new Date().toISOString(),
}={}) {
  const manifestBytes=await readFile(manifestPath);
  const manifest=JSON.parse(manifestBytes.toString('utf8'));
  if(manifest.schemaVersion!==1||manifest.benchmark!=='kai-farm-vlm-v1'||!Array.isArray(manifest.samples)||!manifest.samples.length){
    throw new Error('VLM_EVAL_MANIFEST_INVALID');
  }
  const origin=baseUrl.replace(/\/$/,'');
  const guest=await jsonRequest(fetchImpl,`${origin}/v1/sessions/guest`,{
    method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'VLM Eval Runner'}),
  });
  const headers={'content-type':'application/json',authorization:`Bearer ${guest.token}`};
  const service=await jsonRequest(fetchImpl,`${origin}/v1/agent/vlm/status`,{headers});
  if(!service.status?.ready)throw new Error('VLM_EVAL_PROVIDER_NOT_READY');
  const rows=[];
  for(const sample of manifest.samples){
    const absoluteFrame=resolve(manifestPath,'..',sample.frame);
    try{
      const bytes=await readFile(absoluteFrame);
      const digest=createHash('sha256').update(bytes).digest('hex');
      if(digest!==sample.sha256)throw new Error('VLM_EVAL_FRAME_HASH_MISMATCH');
      const payload=await jsonRequest(fetchImpl,`${origin}/v1/agent/vlm/observe`,{
        method:'POST',headers,
        body:JSON.stringify({imageDataUrl:`data:image/png;base64,${bytes.toString('base64')}`,rpc:sample.rpc}),
      });
      const observation=payload.observation||{};
      rows.push({
        id:sample.id,tags:sample.tags,ok:true,matched:observation.matched===true,
        label:observation.label??null,expectedLabel:observation.expectedLabel??null,
        decision:observation.decision??null,latencyMs:Number.isFinite(observation.latencyMs)?observation.latencyMs:null,
        inputTokens:Number.isSafeInteger(observation.usage?.inputTokens)?observation.usage.inputTokens:null,
        outputTokens:Number.isSafeInteger(observation.usage?.outputTokens)?observation.usage.outputTokens:null,
        model:observation.model??service.status.model??null,checkpoint:observation.checkpoint??null,
      });
    }catch(error){
      rows.push({id:sample.id,tags:sample.tags,ok:false,matched:false,error:error.code||error.message||'VLM_EVAL_SAMPLE_FAILED'});
    }
  }
  const successful=rows.filter((row)=>row.ok);
  const matched=successful.filter((row)=>row.matched).length;
  const latencies=successful.map((row)=>row.latencyMs).filter(Number.isFinite);
  const inputTokens=successful.map((row)=>row.inputTokens).filter(Number.isSafeInteger);
  const outputTokens=successful.map((row)=>row.outputTokens).filter(Number.isSafeInteger);
  const sum=(values)=>values.reduce((total,value)=>total+value,0);
  return {
    schemaVersion:1,benchmark:manifest.benchmark,startedAt:now(),
    manifest:{path:manifestPath,sha256:createHash('sha256').update(manifestBytes).digest('hex'),samples:manifest.samples.length,status:manifest.status},
    provider:{ready:true,model:service.status.model??null,specialization:service.status.specialization??null,evidence:'authenticated HTTP response; checkpoint loading must be verified on the serving host'},
    summary:{
      attempted:rows.length,completed:successful.length,errors:rows.length-successful.length,
      correct:matched,accuracy:successful.length?Number((matched/successful.length).toFixed(4)):null,
      p50LatencyMs:percentile(latencies,.5),p95LatencyMs:percentile(latencies,.95),
      totalInputTokens:sum(inputTokens),totalOutputTokens:sum(outputTokens),
      averageTokensPerCompleted:successful.length?Number(((sum(inputTokens)+sum(outputTokens))/successful.length).toFixed(2)):null,
    },
    rows,
    boundary:'Synthetic KAI Farm fixtures measure the bounded visual-state task only. This report is not evidence of general game understanding, planning quality, or production readiness.',
  };
}
