import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { runVlmEvaluation } from './vlm-eval-lib.mjs';

function argument(name){
  const index=process.argv.indexOf(name);
  return index>=0?process.argv[index+1]:null;
}

const report=await runVlmEvaluation({
  baseUrl:argument('--url')||process.env.KAI_VLM_EVAL_URL||'http://127.0.0.1:4310',
  manifestPath:resolve(argument('--manifest')||'evals/kai-farm-vlm-v1/manifest.json'),
});
const encoded=`${JSON.stringify(report,null,2)}\n`;
const output=argument('--output');
if(output){
  await writeFile(resolve(output),encoded,'utf8');
  console.error(`KAI Farm VLM evaluation report written to ${resolve(output)}`);
}
process.stdout.write(encoded);
if(report.summary.errors)process.exitCode=2;
