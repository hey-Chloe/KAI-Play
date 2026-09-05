import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { beanRewardDate, JsonGameStore } from '../server/src/store.ts';
import { DouJoyPlatform } from '../server/src/platform.ts';

test('new accounts receive 30000 once and concurrent daily claims grant only 3000', async () => {
  const directory=await mkdtemp(join(tmpdir(),'kai-beans-'));
  try {
    const path=join(directory,'state.json');
    const store=new JsonGameStore(path);await store.load();
    const platform=new DouJoyPlatform(store);
    const session=await platform.guest('礼包测试');
    assert.equal(session.profile.balance,30_000);
    assert.equal(store.entries(session.profile.id).length,1);
    const results=await Promise.all(Array.from({length:8},()=>platform.relief(session.profile.id)));
    assert.equal(results.filter(result=>result.claimed).length,1);
    assert.equal(store.balance(session.profile.id),33_000);
    assert.equal(store.balance('treasury'),-33_000);
    const restored=new JsonGameStore(path);await restored.load();
    assert.equal(restored.userForToken(session.token)?.id,session.profile.id);
    assert.equal(restored.claimRelief(session.profile.id),false);
    assert.equal(restored.balance(session.profile.id),33_000);
  } finally { await rm(directory,{recursive:true,force:true}); }
});

test('daily rewards reset at Beijing midnight with no balance threshold or missed-day backfill', async () => {
  const store=new JsonGameStore('/unused-bean-test.json');
  const {user}=store.createUser('跨日测试');
  const before=new Date('2026-09-04T15:59:59.999Z');
  const after=new Date('2026-09-04T16:00:00.000Z');
  assert.equal(beanRewardDate(before),'2026-09-04');
  assert.equal(beanRewardDate(after),'2026-09-05');
  assert.equal(store.claimRelief(user.id,before),true);
  assert.equal(store.claimRelief(user.id,before),false);
  assert.equal(store.claimRelief(user.id,after),true);
  assert.equal(store.claimRelief(user.id,new Date('2026-09-10T00:00:00Z')),true);
  assert.equal(store.balance(user.id),39_000);
  assert.throws(()=>store.claimRelief('missing'),/USER_NOT_FOUND/);
});

test('existing balances are not reset and ledger idempotency survives stale reward metadata', () => {
  const store=new JsonGameStore('/unused-bean-test.json');
  const {user}=store.createUser('老玩家');
  store.post({key:'prior-play',referenceType:'game',referenceId:'fixture',entries:[
    {accountId:user.id,amount:-20_000,memo:'existing balance'},
    {accountId:'treasury',amount:20_000,memo:'existing balance'},
  ]});
  assert.equal(store.balance(user.id),10_000);
  assert.equal(store.dailyBeanReward(user.id).claimed,false);
  assert.equal(store.balance(user.id),10_000);
  assert.equal(store.claimRelief(user.id),true);
  user.lastReliefDate=null;
  assert.equal(store.dailyBeanReward(user.id).claimed,true);
  assert.equal(store.claimRelief(user.id),false);
  assert.equal(store.balance(user.id),13_000);
});

const source=await readFile(resolve('web/app.js'),'utf8');
const index=await readFile(resolve('web/index.html'),'utf8');
const slice=(start:string,end:string)=>source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));

test('wallet renders true account balance, daily state, and the approved external GPU link', () => {
  const url=index.match(/name="kai-gpu-url" content="([^"]*)"/)?.[1];
  assert.equal(url,'https://kai-gpu.itankg64.chatgpt.site/?release=0.8.0');
  const state:any={profile:{balance:30_000,dailyReward:{claimed:false}}};
  const context:any={state,Date,URL,document:{querySelector:()=>({content:url})},money:(n:number)=>n.toLocaleString('en-US'),
    competitiveScore:(profile:any)=>profile.balance,esc:(value:any)=>String(value)};
  const render=runInNewContext(slice('function gpuRechargeUrl()', 'async function claimDailyBeans()')+';beanWallet',context);
  const html=render();
  assert.match(html,/卡时豆/);assert.match(html,/30,000/);assert.match(html,/领取今日 3,000/);
  assert.match(html,/target="_blank" rel="noopener noreferrer"/);
  assert.match(html,/尚不支持付款后自动增加卡时豆/);
  assert.match(html,/<details/);assert.match(html,/<summary/);
  state.profile.dailyReward={claimed:true,date:beanRewardDate()};
  assert.match(render(),/data-action="claim-beans" disabled/);
  state.profile.dailyReward.date='2000-01-01';
  assert.doesNotMatch(render(),/data-action="claim-beans" disabled/);
  state.profile=null;
  assert.match(render(),/账户未连接/);assert.doesNotMatch(render(),/data-action="claim-beans"/);
  context.document.querySelector=()=>({content:'javascript:alert(1)'});
  assert.match(render(),/充值入口暂未配置/);assert.doesNotMatch(render(),/href="javascript:/);
});

test('claim errors never mint local beans and shortage never initiates payment or retries a game', async () => {
  const state:any={profile:{balance:0}};
  const claim=runInNewContext(slice('async function claimDailyBeans()', 'function showBeanShortage(')+';claimDailyBeans',{
    state,api:async()=>{throw new Error('offline');},toast:()=>{},
  });
  await assert.rejects(claim,/offline/);assert.equal(state.profile.balance,0);
  let calls=0,shortages=0;
  const quick=runInNewContext(slice('async function startQuickGame()', 'async function act(')+';startQuickGame',{
    state,api:async()=>{calls++;throw Object.assign(new Error('low'),{code:'RELIEF_REQUIRED'});},
    refreshProfile:async()=>{},showBeanShortage:()=>{shortages++;},enterGame:()=>{throw new Error('must not start');},
  });
  await quick();assert.equal(calls,1);assert.equal(shortages,1);
});
