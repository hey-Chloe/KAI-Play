import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { deflateSync } from 'node:zlib';

const WIDTH = 512;
const HEIGHT = 340;
const OUTPUT = resolve('evals/kai-farm-vlm-v1');
const STATES = {
  E:{ status:'empty', cropId:null, wateredToday:false },
  W:{ status:'growing', cropId:'wheat', wateredToday:true },
  w:{ status:'growing', cropId:'wheat', wateredToday:false },
  C:{ status:'growing', cropId:'carrot', wateredToday:true },
  c:{ status:'growing', cropId:'carrot', wateredToday:false },
  S:{ status:'growing', cropId:'strawberry', wateredToday:true },
  s:{ status:'growing', cropId:'strawberry', wateredToday:false },
  H:{ status:'ready', cropId:'wheat', wateredToday:false },
  R:{ status:'ready', cropId:'carrot', wateredToday:false },
  B:{ status:'ready', cropId:'strawberry', wateredToday:false },
  X:{ status:'weed', cropId:null, wateredToday:false },
};

const SCENARIOS = [
  { id:'day1-empty-start', tags:['empty','opening'], day:1, revision:0, actionsLeft:5, coins:36, xp:0, plots:'EEEEEE' },
  { id:'day1-wheat-planted', tags:['growing','watered'], day:1, revision:1, actionsLeft:2, coins:21, xp:0, plots:'WWWEEE' },
  { id:'day3-ready-harvest', tags:['ready','mixed'], day:3, revision:2, actionsLeft:4, coins:44, xp:10, plots:'HHCcEE' },
  { id:'day5-drought-and-weed', tags:['weed','dry','recovery'], day:5, revision:3, actionsLeft:3, coins:73, xp:24, plots:'XcWRHE' },
  { id:'day7-strawberry-chain', tags:['strawberry','long-horizon'], day:7, revision:4, actionsLeft:1, coins:91, xp:36, plots:'SSsBCE' },
  { id:'day9-final-harvest', tags:['final-day','ready','dense'], day:9, revision:5, actionsLeft:2, coins:248, xp:58, plots:'BBBRHX' },
];

const FONT = {
  ' ':['000','000','000','000','000','000','000'],
  '-':['000','000','000','111','000','000','000'],
  '/':['001','001','010','010','100','100','000'],
  '0':['111','101','101','101','101','101','111'], '1':['010','110','010','010','010','010','111'],
  '2':['111','001','001','111','100','100','111'], '3':['111','001','001','111','001','001','111'],
  '4':['101','101','101','111','001','001','001'], '5':['111','100','100','111','001','001','111'],
  '6':['111','100','100','111','101','101','111'], '7':['111','001','001','010','010','100','100'],
  '8':['111','101','101','111','101','101','111'], '9':['111','101','101','111','001','001','111'],
  A:['010','101','101','111','101','101','101'], B:['110','101','101','110','101','101','110'],
  C:['111','100','100','100','100','100','111'], D:['110','101','101','101','101','101','110'],
  E:['111','100','100','110','100','100','111'], F:['111','100','100','110','100','100','100'],
  G:['111','100','100','101','101','101','111'], H:['101','101','101','111','101','101','101'],
  I:['111','010','010','010','010','010','111'], K:['101','101','110','100','110','101','101'],
  L:['100','100','100','100','100','100','111'], M:['101','111','111','101','101','101','101'],
  N:['101','111','111','111','111','111','101'], O:['111','101','101','101','101','101','111'],
  P:['110','101','101','110','100','100','100'], R:['110','101','101','110','110','101','101'],
  S:['111','100','100','111','001','001','111'], T:['111','010','010','010','010','010','010'],
  U:['101','101','101','101','101','101','111'], V:['101','101','101','101','101','101','010'],
  W:['101','101','101','101','111','111','101'], X:['101','101','010','010','010','101','101'],
  Y:['101','101','101','010','010','010','010'],
};

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data = Buffer.alloc(0)) {
  const name = Buffer.from(type);
  const output = Buffer.alloc(12 + data.length);
  output.writeUInt32BE(data.length, 0); name.copy(output, 4); data.copy(output, 8);
  output.writeUInt32BE(crc32(Buffer.concat([name, data])), 8 + data.length);
  return output;
}

function png(pixels) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(WIDTH, 0); header.writeUInt32BE(HEIGHT, 4);
  header[8] = 8; header[9] = 6;
  const scanlines = Buffer.alloc(HEIGHT * (WIDTH * 4 + 1));
  for (let y = 0; y < HEIGHT; y += 1) pixels.copy(scanlines, y * (WIDTH * 4 + 1) + 1, y * WIDTH * 4, (y + 1) * WIDTH * 4);
  return Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'), chunk('IHDR', header), chunk('IDAT', deflateSync(scanlines, { level:9 })), chunk('IEND')]);
}

function renderer() {
  const pixels = Buffer.alloc(WIDTH * HEIGHT * 4, 255);
  const set = (x,y,color) => {
    if (x < 0 || y < 0 || x >= WIDTH || y >= HEIGHT) return;
    const index = (y * WIDTH + x) * 4;
    pixels[index] = color[0]; pixels[index + 1] = color[1]; pixels[index + 2] = color[2]; pixels[index + 3] = color[3] ?? 255;
  };
  const rect = (x,y,w,h,color) => { for (let py=y; py<y+h; py+=1) for (let px=x; px<x+w; px+=1) set(px,py,color); };
  const outline = (x,y,w,h,color,size=2) => { rect(x,y,w,size,color);rect(x,y+h-size,w,size,color);rect(x,y,size,h,color);rect(x+w-size,y,size,h,color); };
  const circle = (cx,cy,r,color) => { for(let y=-r;y<=r;y+=1)for(let x=-r;x<=r;x+=1)if(x*x+y*y<=r*r)set(cx+x,cy+y,color); };
  const text = (value,x,y,color=[236,245,239,255],scale=2) => {
    let cursor=x;
    for(const char of String(value).toUpperCase()){
      const glyph=FONT[char]||FONT[' '];
      glyph.forEach((row,ry)=>[...row].forEach((pixel,rx)=>{if(pixel==='1')rect(cursor+rx*scale,y+ry*scale,scale,scale,color);}));
      cursor += 4*scale;
    }
  };
  return { pixels, rect, outline, circle, text };
}

function drawCrop(r, cropId, status, x, y) {
  const mature = status === 'ready';
  const size = mature ? 12 : 8;
  r.rect(x-2,y,4,23,[57,112,76,255]);
  if (cropId === 'wheat') {
    for (let offset=-size; offset<=size; offset+=6) r.circle(x+offset,y+2+Math.abs(offset)/3,4,[230,181,65,255]);
  } else if (cropId === 'carrot') {
    r.circle(x,y+8,size,[232,118,50,255]); r.rect(x-5,y-3,3,10,[74,147,83,255]); r.rect(x+2,y-5,3,12,[74,147,83,255]);
  } else if (cropId === 'strawberry') {
    r.circle(x,y+7,size,[198,63,61,255]); r.rect(x-6,y-4,12,5,[65,139,77,255]);
  }
}

function renderScenario(scenario) {
  const r=renderer();
  r.rect(0,0,WIDTH,HEIGHT,[22,55,43,255]);
  r.rect(18,16,476,52,[27,73,56,255]);r.outline(18,16,476,52,[70,133,101,255],2);
  r.text('KAI FARM',32,28,[143,224,189,255],3);r.text(`DAY ${scenario.day}`,350,28,[255,255,255,255],3);
  r.text(`COIN ${scenario.coins} / XP ${scenario.xp} / ACTION ${scenario.actionsLeft}`,32,78,[214,227,219,255],2);
  scenario.rpc.plots.forEach((plot,index)=>{
    const column=index%3,row=Math.floor(index/3),x=24+column*158,y=108+row*104;
    r.rect(x,y,146,92,[122,87,57,255]);r.outline(x,y,146,92,[72,115,82,255],4);
    r.circle(x+16,y+16,11,[35,59,47,255]);r.text(String(index+1),x+13,y+10,[255,255,255,255],1);
    if(plot.status==='empty')r.text('EMPTY',x+46,y+39,[231,217,190,255],2);
    else if(plot.status==='weed'){
      for(let leaf=-18;leaf<=18;leaf+=9){r.rect(x+72+leaf,y+35,3,30,[63,104,61,255]);r.circle(x+72+leaf,y+33,5,[84,125,70,255]);}
      r.text('WEED',x+52,y+70,[220,231,211,255],2);
    } else {
      drawCrop(r,plot.cropId,plot.status,x+73,y+26);
      const crop=plot.cropId==='strawberry'?'STRAW':plot.cropId.toUpperCase();
      r.text(`${crop} ${plot.status==='ready'?'READY':'GROW'}`,x+25,y+68,[255,244,214,255],2);
      if(plot.wateredToday)r.circle(x+130,y+15,6,[75,170,218,255]);
    }
  });
  r.text(`REV ${scenario.revision}`,414,322,[151,180,164,255],1);
  return png(r.pixels);
}

await mkdir(resolve(OUTPUT,'frames'), { recursive:true });
const samples=[];
for(const scenario of SCENARIOS){
  const plots=[...scenario.plots].map((symbol)=>({ ...STATES[symbol] }));
  const rpc={ day:scenario.day, revision:scenario.revision, actionsLeft:scenario.actionsLeft, coins:scenario.coins, xp:scenario.xp, plots };
  const enriched={ ...scenario, rpc };
  const bytes=renderScenario(enriched);
  const relativePath=`frames/${scenario.id}.png`;
  await writeFile(resolve(OUTPUT,relativePath),bytes);
  samples.push({ id:scenario.id, frame:relativePath, sha256:createHash('sha256').update(bytes).digest('hex'), dimensions:[WIDTH,HEIGHT], tags:scenario.tags, rpc });
}
const manifest={
  schemaVersion:1,
  benchmark:'kai-farm-vlm-v1',
  status:'SYNTHETIC_FIXTURES_READY_REAL_MODEL_NOT_RUN',
  source:'Deterministic project-owned raster renderer aligned with the Agent Lab observation surface.',
  license:'Project-generated evaluation fixtures; no ScienceQA examples or third-party images are embedded.',
  truthBoundary:'These frames test the integration and bounded visual-state task. They are not real-player screenshots and do not establish general game understanding.',
  samples,
};
const manifestPath=resolve(OUTPUT,'manifest.json');
await writeFile(manifestPath,`${JSON.stringify(manifest,null,2)}\n`,'utf8');
console.log(`Generated ${samples.length} deterministic KAI Farm VLM fixtures at ${dirname(manifestPath)}`);
