import {
  MERGE_1048_TARGET,
  advanceMahjongBotTurn,
  canMove1048,
  compareThreeCard,
  evaluateThreeCard,
  move1048,
  new1048Game,
  newMahjongGame,
  newThreeCardRound,
  playMahjongDiscard,
  restore1048Game,
  sortMahjong,
  spinSlots,
} from './casual-games.js';

const API = '/api';
const app = document.querySelector('#app');
const toastNode = document.querySelector('#toast');
const LEGACY_TOKEN_KEY = 'doujoy.web.token';
const TOKEN_KEY = 'kai.play.token';
const HERO_GAME_KEY = 'kai.play.hero-game';
const MERGE_1048_SAVE_KEY = 'kai.play.1048.game';
const TURN_TIMEOUT_MS = 45_000;
const DEAL_ANIMATION_MS = 3_750;
const storedHeroGame = localStorage.getItem(HERO_GAME_KEY);
const state = { token: localStorage.getItem(TOKEN_KEY) || localStorage.getItem(LEGACY_TOKEN_KEY), profile: null, view: 'lobby', game: null, room: null, history: null, historyStatus: 'idle', historyError: '', selected: new Set(), busy: false, error: '', dealingGameId: null, dealTimer: null, waitController: null, roomWaitController: null, exitConfirm: false, roomExitConfirm: false, casual: null, heroGame: storedHeroGame === 'mahjong' ? 'mahjong' : 'ddz' };
let heroPointer = null;
let merge1048Pointer = null;
let heroTransitionTimer = null;
let mahjongBotTimer = null;
let toastTimer = null;
let threeRevealTimer = null;
let slotSpinTimer = null;

const SYNC_TERMINAL_STATUSES = new Set([401, 403, 404]);

function syncRetryDelay(signal, failureCount) {
  const exponential = Math.min(8_000, 750 * (2 ** Math.min(failureCount, 4)));
  const delay = exponential + Math.floor(Math.random() * 251);
  return new Promise(resolve => {
    if (signal.aborted) { resolve(); return; }
    const onAbort = () => { clearTimeout(timer); resolve(); };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, delay);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

function isTerminalSyncError(error) {
  return SYNC_TERMINAL_STATUSES.has(Number(error?.status));
}

const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const money = value => new Intl.NumberFormat('zh-CN').format(value || 0);
const rank = n => ({3:'3',4:'4',5:'5',6:'6',7:'7',8:'8',9:'9',10:'10',11:'J',12:'Q',13:'K',14:'A',15:'2',16:'小王',17:'大王'}[n] || n);
const suit = s => ({spade:'♠',heart:'♥',club:'♣',diamond:'♦',joker:'★'}[s] || '');
const isRed = c => c.suit === 'heart' || c.suit === 'diamond';
const toast = msg => {
  if (toastTimer) clearTimeout(toastTimer);
  toastNode.textContent = msg;
  toastNode.classList.add('show');
  toastTimer = setTimeout(() => { toastNode.classList.remove('show'); toastTimer = null; }, 2200);
};
const requestId = () => globalThis.crypto?.randomUUID?.() || `web-${Date.now()}-${Math.random().toString(16).slice(2)}`;

function loadSaved1048Game() {
  try {
    const raw = localStorage.getItem(MERGE_1048_SAVE_KEY);
    if (!raw) return null;
    const game = restore1048Game(JSON.parse(raw));
    if (!game) localStorage.removeItem(MERGE_1048_SAVE_KEY);
    return game;
  } catch {
    try { localStorage.removeItem(MERGE_1048_SAVE_KEY); } catch { /* Storage can be unavailable in hardened browsers. */ }
    return null;
  }
}

function save1048Game(game) {
  try { localStorage.setItem(MERGE_1048_SAVE_KEY, JSON.stringify(game)); } catch { /* The game remains playable without persistence. */ }
}

function syncFailureNotice() {
  if (!state.error || !state.error.includes('同步已停止')) return '';
  return `<aside class="route-sync-error" role="alert"><div><b>连接已经停止</b><span>${esc(state.error)}</span></div><button class="btn" data-action="retry-sync">重新连接</button></aside>`;
}

async function api(path, options = {}) {
  const fetchOptions = { ...options };
  const externalSignal = fetchOptions.signal;
  const controller = new AbortController();
  const forwardAbort = () => controller.abort();
  if (externalSignal?.aborted) controller.abort();
  else externalSignal?.addEventListener('abort', forwardAbort, { once: true });
  fetchOptions.signal = controller.signal;
  const timeoutMs = path.includes('/wait?') ? 30_000 : 12_000;
  let timedOut = false;
  const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  let res;
  let body;
  try {
    res = await fetch(`${API}${path}`, { ...fetchOptions, headers: { 'content-type':'application/json', ...(state.token ? {'x-doujoy-token':state.token} : {}), ...options.headers } });
    body = await res.json().catch(error => {
      if (controller.signal.aborted) throw error;
      return {};
    });
  } catch (error) {
    if (timedOut) {
      const timeoutError = new Error('请求超时，请检查网络后重试。');
      timeoutError.code = 'REQUEST_TIMEOUT';
      timeoutError.status = 0;
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    externalSignal?.removeEventListener('abort', forwardAbort);
  }
  if (!res.ok || !body.ok) {
    const error = new Error(body?.error?.message || `请求失败（${res.status}）`);
    error.code = body?.error?.code || 'REQUEST_FAILED';
    error.status = res.status;
    throw error;
  }
  return body;
}

function acceptGame(nextGame, nextProfile = null) {
  const current = state.game;
  if (!nextGame || !current || current.id !== nextGame.id) return false;
  if (Number(nextGame.sequence) < Number(current.sequence)) return false;
  state.game = nextGame;
  if (nextProfile) state.profile = nextProfile;
  return true;
}

async function bootstrap() {
  try {
    if (state.token) {
      try { state.profile = (await api('/v1/me')).profile; }
      catch (error) {
        if (error.status !== 401) throw error;
        state.token = null;
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(LEGACY_TOKEN_KEY);
      }
    }
    if (!state.token) {
      const session = await api('/v1/sessions/guest', {method:'POST', body:'{}'});
      state.token = session.token; state.profile = session.profile;
      localStorage.setItem(TOKEN_KEY, state.token);
    }
    const resumed = await api('/v1/resume');
    if (resumed.game) enterGame(resumed.game);
    else if (resumed.room) { state.room = resumed.room; state.view = 'room'; startRoomSync(); }
  } catch (e) { state.error = `无法连接后端：${e.message}`; }
  render();
}

function header(mode = 'default') {
  const name = state.profile?.name || '正在登录';
  const lobbyMode = mode === 'lobby';
  const brandControl = mode === 'room' ? 'data-action="open-room-exit" aria-label="退出好友房"' : 'data-view="lobby" aria-label="返回 KAI PLAY 大厅"';
  return `<header class="topbar ${lobbyMode?'topbar-lobby':''}"><button class="brand brand-button brand-wordmark" data-wordmark ${brandControl}><div class="logo"><span></span>K</div><span class="wordmark"><b>KAI</b><em>PLAY</em>${lobbyMode?'':'<small>牌桌游乐场</small>'}</span></button><div class="top-actions">${lobbyMode?'':`<div class="player-chip"><span class="player-avatar">${esc(name.slice(0,1))}</span><span><b>${esc(name)}</b><small>${tierName(state.profile)}</small></span></div>`}<div class="score-pill"><small>竞技分</small><strong>${money(competitiveScore(state.profile))}</strong></div></div></header>`;
}

function competitiveScore(profile) { return Math.max(0, Number(profile?.balance) || 0); }
function winRatePercent(profile) {
  const value = Math.max(0, Number(profile?.winRate) || 0);
  return Math.min(100, Math.round(value));
}
function tierName(profile) {
  const score = competitiveScore(profile);
  if (score >= 12000) return '星域段位';
  if (score >= 8000) return '跃迁段位';
  if (score >= 4000) return '巡航段位';
  return '启航段位';
}

function lobby() {
  const p = state.profile || {games:0,wins:0,winRate:0,name:'游客'};
  const firstGame = (Number(p.games) || 0) === 0;
  const saved1048 = loadSaved1048Game();
  const merge1048Action = !saved1048 ? '开始合并' : saved1048.status === 'playing' ? '继续上局' : '查看上局';
  const heroGame = state.heroGame === 'mahjong' ? 'mahjong' : 'ddz';
  const ddzActive = heroGame === 'ddz';
  const previewWall = '<i></i>'.repeat(17);
  const previewTileData = [
    { rank:1, suit:'万', label:'一万' }, { rank:2, suit:'万', label:'二万' }, { rank:3, suit:'万', label:'三万' },
    { rank:3, suit:'筒', label:'三筒' }, { rank:4, suit:'筒', label:'四筒' }, { rank:5, suit:'筒', label:'五筒' },
    { rank:2, suit:'条', label:'二条' }, { rank:4, suit:'条', label:'四条' }, { rank:6, suit:'条', label:'六条' }, { rank:8, suit:'条', label:'八条' },
    { rank:0, suit:'字', label:'东' }, { rank:0, suit:'字', label:'南' }, { rank:0, suit:'字', label:'白' }, { rank:0, suit:'字', label:'中' },
  ];
  const previewTiles = previewTileData.map((tile)=>`<i class="${mahjongTone(tile)}">${mahjongMark(tile)}</i>`).join('');
  const previewRiverData = [
    [{rank:1,suit:'万',label:'一万'},{rank:9,suit:'筒',label:'九筒'},{rank:0,suit:'字',label:'东'}],
    [{rank:3,suit:'条',label:'三条'},{rank:0,suit:'字',label:'白'},{rank:5,suit:'万',label:'五万'}],
    [{rank:0,suit:'字',label:'南'},{rank:7,suit:'筒',label:'七筒'},{rank:2,suit:'万',label:'二万'}],
    [{rank:6,suit:'条',label:'六条'},{rank:4,suit:'筒',label:'四筒'},{rank:0,suit:'字',label:'北'}],
  ];
  const previewRivers = ['north','east','south','west'].map((position,index)=>`<div class="preview-river preview-river--${position}">${previewRiverData[index].map((tile)=>mahjongFace(tile,'preview-river-tile')).join('')}</div>`).join('');
  return `<div class="shell lobby-shell lobby-v4">${header('lobby')}${state.error ? `<div class="banner">${esc(state.error)}　游戏服务暂时离线，请稍后刷新。</div>`:''}
    <main class="live-lobby">
      <section class="lobby-game-carousel" data-hero-carousel tabindex="0" aria-label="主要玩法，可左右滑动或使用方向键切换" aria-roledescription="carousel" aria-keyshortcuts="ArrowLeft ArrowRight">
        <section class="live-table live-table-preview lobby-hero-v4 lobby-game-stage game-stage--ddz ${ddzActive?'is-active':''}" data-hero-stage="ddz" aria-labelledby="live-table-title" aria-hidden="${ddzActive?'false':'true'}" ${ddzActive?'':'inert'}>
          ${tableFrame('preview')}
          <div class="live-table-seat live-seat-left"><span>A</span><b>智能牌友 A</b><small>左侧牌友</small></div>
          <div class="live-table-seat live-seat-right"><span>B</span><b>智能牌友 B</b><small>右侧牌友</small></div>
          <div class="live-table-center"><small>三人斗地主 · 牌桌预览</small><h1 id="live-table-title">还差你</h1><div class="lobby-card-scene" aria-hidden="true">${cardBack(true,'live-card-back')}${previewPoker(10,'spade')}${previewPoker(11,'spade')}${previewPoker(12,'heart')}${previewPoker(13,'club')}</div></div>
          <div class="live-table-seat live-seat-you"><span>${esc((p.name || '你').slice(0,1))}</span><b>${esc(p.name || '你')}</b><small>你的座位</small></div>
          <div class="live-join-bar"><button class="btn primary" data-action="quick" aria-label="${firstGame?'开始首局':'快速人机'}，创建斗地主牌局">${firstGame?'开始首局':'快速人机'} <b>→</b></button><small>游客免注册 · 智能牌友补位 · 可断线恢复</small><span class="sr-only">点击后创建真实牌局，服务端统一判定。</span></div>
        </section>
        <section class="live-table live-table-preview lobby-hero-v4 lobby-game-stage game-stage--mahjong ${ddzActive?'':'is-active'}" data-hero-stage="mahjong" aria-labelledby="mahjong-hero-title" aria-hidden="${ddzActive?'true':'false'}" ${ddzActive?'inert':''}>
          <div class="mahjong-preview-table" aria-hidden="true">
            <i class="mahjong-table-shadow"></i><i class="mahjong-table-base"></i><i class="mahjong-table-felt"></i>
            <div class="mahjong-preview-wall preview-wall-top">${previewWall}</div><div class="mahjong-preview-wall preview-wall-left">${previewWall}</div><div class="mahjong-preview-wall preview-wall-right">${previewWall}</div><div class="mahjong-preview-wall preview-wall-bottom">${previewWall}</div>
            <div class="mahjong-preview-rivers">${previewRivers}</div>
            <div class="mahjong-preview-center"><small>东一局</small><b>83</b><span>余牌</span></div>
            <div class="mahjong-preview-hand">${previewTiles}</div>
          </div>
          <div class="mahjong-preview-seat seat-north"><span>B</span><b>智能牌友 B</b><small>西家</small></div>
          <div class="mahjong-preview-seat seat-west"><span>C</span><b>智能牌友 C</b><small>北家</small></div>
          <div class="mahjong-preview-seat seat-east"><span>A</span><b>智能牌友 A</b><small>南家</small></div>
          <div class="mahjong-preview-seat seat-south"><span>${esc((p.name || '你').slice(0,1))}</span><b>${esc(p.name || '你')}</b><small>东家 · 你</small></div>
          <div class="mahjong-hero-copy"><small>KAI 麻将 · 四人基础速战</small><h1 id="mahjong-hero-title">听风入局</h1><p>你与三位智能牌友，摸打至自摸、荣和或流局。</p></div>
          <div class="mahjong-hero-action"><button class="btn primary" data-action="open-mahjong">开始麻将 <b>→</b></button><small>免费人机局 · 不影响斗地主竞技分</small></div>
        </section>
        <nav class="hero-switcher" aria-label="切换主玩法"><button class="${ddzActive?'active':''}" data-action="hero-select" data-hero-game="ddz" aria-pressed="${ddzActive}">斗地主</button><button class="${ddzActive?'':'active'}" data-action="hero-select" data-hero-game="mahjong" aria-pressed="${!ddzActive}">麻将</button><span aria-hidden="true">↔ 滑动</span></nav>
        <p class="sr-only" data-hero-status aria-live="polite">当前展示${ddzActive?'斗地主':'麻将'}</p>
      </section>
      <nav class="lobby-mode-rail" aria-label="大厅玩法入口"><button class="mode-entry ${ddzActive?'is-primary':''}" data-action="hero-select" data-hero-game="ddz"><b>斗地主</b><small>三人牌桌</small></button><button class="mode-entry ${ddzActive?'':'is-primary'}" data-action="hero-select" data-hero-game="mahjong"><b>麻将</b><small>四人速战</small></button><button class="mode-entry" data-action="open-1048"><b>1048 <em>新</em></b><small>数字合并</small></button><button class="mode-entry" data-action="create-room"><b>好友房</b><small>创建斗地主房间</small></button></nav>
      <section class="lobby-shortcuts" aria-label="大厅快捷入口">
        <article class="room-panel"><div><span>房间码</span><h2>加入好友桌</h2></div><div class="room-actions"><div class="friend-row"><label for="room-code">六位房号</label><input class="input" id="room-code" maxlength="6" inputmode="numeric" aria-label="六位房号" placeholder="输入 6 位房号"><button class="btn" data-action="join-room">加入</button></div></div></article>
        <article class="history-summary"><div><span>我的记录</span><h2>${tierName(p)}</h2><p>${Number(p.games) || 0} 局已保存 · 胜率 ${winRatePercent(p)}%</p></div><div><strong>${money(competitiveScore(p))}</strong><small>竞技分</small><button class="text-link" data-view="history">查看战绩 →</button></div></article>
      </section>
      <section class="section-block" id="game-selection"><div class="section-head"><div><span class="section-kicker">全部玩法</span><h2>5 款玩法，即刻开局</h2></div><div class="world-carousel-meta"><span class="catalog-summary">1 款竞技 · 4 款免费训练</span><div class="world-carousel-controls" aria-label="切换全部玩法"><button type="button" data-action="world-prev" aria-label="上一张玩法卡片">←</button><button type="button" data-action="world-next" aria-label="下一张玩法卡片">→</button></div></div></div><p class="world-swipe-hint" id="world-carousel-hint">左右滑动或使用箭头，查看全部 5 款玩法</p>
        <div class="world-strip" data-world-strip tabindex="0" role="region" aria-label="全部玩法卡片轮播" aria-describedby="world-carousel-hint">
          <article class="game-world world-ddz"><div><span>服务端三人桌</span><h3>斗地主</h3><p>争分、出牌、结算，完成一局会写入战绩。</p><button class="btn primary" data-action="quick">快速开局</button></div><div class="world-ddz-hand" aria-hidden="true">${previewPoker(10,'spade')}${previewPoker(11,'heart')}${previewPoker(12,'club')}${previewPoker(13,'diamond')}${previewPoker(14,'spade')}</div></article>
          <article class="game-world world-1048"><span class="world-badge">${saved1048?'进度已保存':'新上线'}</span><div><span>数字合并 · 单机益智</span><h3>1048</h3><p>普通数字逐级翻倍，最后两枚 512 特别融合为 1048。</p><button class="btn" data-action="open-1048">${merge1048Action}</button></div><div class="world-1048-board" aria-hidden="true"><i>2</i><i></i><i>4</i><i></i><i></i><i>8</i><i></i><i>16</i><i>32</i><i></i><i>128</i><i></i><i></i><i>512</i><i></i><i>1048</i></div></article>
          <article class="game-world world-three"><div class="world-three-cards" aria-hidden="true">${cardBack(true)}${cardBack(true)}${cardBack(true)}</div><div><span>三张定胜负</span><h3>炸金花训练</h3><p>免费单机比牌，不计竞技分。</p><button class="btn" data-action="open-three">翻开这一手</button></div></article>
          <article class="game-world world-mahjong"><div><span>四人东一局 · 人机速战</span><h3>KAI 麻将</h3><p>轮流摸打、四家牌河、自摸与荣和，完整打完一局。</p><button class="btn" data-action="open-mahjong">开始麻将</button></div><div class="world-mahjong-tiles" aria-hidden="true"><i>一<small>万</small></i><i>三<small>条</small></i><i>●<small>筒</small></i><i>發</i></div></article>
          <article class="game-world world-reels"><div><span>大厅彩蛋</span><h3>算力转轮</h3><p>免费娱乐 · 无现金下注 · 无提现。</p></div><button class="btn" data-action="open-slots" aria-label="打开算力转轮"><span aria-hidden="true">7 · KAI · ⚡</span> 试转一次</button></article>
        </div>
      </section>
    </main>${nav('lobby')}</div>`;
}

function nav(active) { return `<nav class="nav"><button class="btn ${active==='lobby'?'active':''}" data-view="lobby">游戏</button><button class="btn ${active==='history'?'active':''}" data-view="history">战绩</button><button class="btn ${active==='rules'?'active':''}" data-view="rules">规则</button></nav>`; }

function room() {
  const r = state.room;
  if (!r) return lobby();
  const syncStopped = state.error.startsWith('房间同步已停止');
  const seats = [0,1,2].map(i => { const m=r.members[i]; return m ? `<div class="seat"><div class="avatar">${esc(m.name.slice(0,1))}</div><b>${esc(m.name)}${m.isYou?'（我）':''}</b><p class="muted">${m.id===r.hostId?'房主':'已加入'}</p></div>` : `<div class="seat empty"><div class="avatar">＋</div><b>等待加入</b><p>分享房号邀请好友</p></div>`; }).join('');
  const exitDialog = state.roomExitConfirm ? `<div class="exit-shade"><section class="exit-dialog" role="dialog" aria-modal="true" aria-labelledby="room-exit-title"><span>离开好友房</span><h2 id="room-exit-title">确定退出当前房间？</h2><p>退出后将不再占用座位；如果你是房主，房主会自动转交给下一位牌友。</p><div><button class="btn" data-action="cancel-room-exit">继续等待</button><button class="btn danger" data-action="leave-room">退出房间</button></div></section></div>` : '';
  return `<div class="shell">${header('room')}${syncFailureNotice()}<div class="page-head"><button class="btn ghost" data-action="open-room-exit">← 退出</button><h1>斗地主 · 好友同桌</h1><button class="btn" data-action="refresh-room">立即刷新</button></div><section class="card"><p class="room-sync-status ${syncStopped?'is-stopped':''}"><i></i>${syncStopped?'同步已停止，等待重新连接':'牌友与开局状态自动同步'}</p><p class="muted" style="text-align:center">邀请房号</p><div class="room-code">${esc(r.code)}</div><div class="actions" style="justify-content:center"><button class="btn gold" data-action="copy-room">复制房号</button></div><div class="seats" style="margin-top:24px">${seats}</div><div class="actions" style="justify-content:center;margin-top:24px">${r.isHost?`<button class="btn primary" data-action="start-room">${r.members.length===3?'三人开始':'智能牌友补位'}</button>`:'<span class="muted">等待房主开始游戏…</span>'}</div></section>${exitDialog}</div>`;
}

const PIP_PATTERNS = Object.freeze({
  1: ['mc'],
  2: ['tc','bc'],
  3: ['tc','mc','bc'],
  4: ['tl','tr','bl','br'],
  5: ['tl','tr','mc','bl','br'],
  6: ['tl','tr','ml','mr','bl','br'],
  7: ['tl','tr','ml','mc','mr','bl','br'],
  8: ['tl','tr','ul','ur','ll','lr','bl','br'],
  9: ['tl','tr','ul','ur','mc','ll','lr','bl','br'],
  10: ['tl','tr','ul','ur','ml','mr','ll','lr','bl','br'],
});

function cardPips(card, symbol) {
  const count = card.rank === 14 ? 1 : card.rank === 15 ? 2 : Number(card.rank);
  const pattern = PIP_PATTERNS[count];
  if (!pattern) return '';
  return `<i class="card-pips card-pips-${count}" aria-hidden="true">${pattern.map((position)=>`<b class="pip pip-${position} ${['ll','lr','bl','bc','br'].includes(position)?'is-inverted':''}">${symbol}</b>`).join('')}</i>`;
}

function poker(c, selectable = true, decorative = false, fan = null) {
  const rawLabel = rank(c.rank);
  const symbol = suit(c.suit);
  const joker = c.suit === 'joker';
  const bigJoker = joker && c.rank === 17;
  const classes = ['poker-face', isRed(c)?'red':'', joker?'joker-card':'', joker?(bigJoker?'joker-red':'joker-gray'):'', decorative?'is-decorative':'', fan?'hand-card':''].filter(Boolean).join(' ');
  const bottomIndex = joker ? '' : `<span class="card-index card-index-bottom" aria-hidden="true"><b>${rawLabel}</b><small>${symbol}</small></span>`;
  const content = joker
    ? `<span class="joker-index">${bigJoker?'大王':'小王'}</span><i class="joker-face"><em>${bigJoker?'RED':'GREY'}</em><b>JOKER</b><strong>K</strong></i><span class="card-signature">KAI</span>`
    : `<span class="card-index"><b>${rawLabel}</b><small>${symbol}</small></span>${bottomIndex}${[11,12,13].includes(c.rank)
      ? `<i class="card-court face-${String(rawLabel).toLowerCase()}"><em>${rawLabel}</em><b>${symbol}</b><strong>KAI</strong></i>`
      : cardPips(c, symbol)}<span class="card-signature">KAI</span>`;
  const aria = joker ? `${bigJoker?'大王':'小王'} ${bigJoker?'红色':'灰色'} JOKER` : `${rawLabel}${symbol}`;
  const selected = state.selected.has(c.id);
  const fanStyle = fan ? ` style="--card-angle:${(((fan.index - (fan.total - 1) / 2) / Math.max(1, (fan.total - 1) / 2)) * 3).toFixed(2)}deg;--card-curve:${(Math.abs((fan.index - (fan.total - 1) / 2) / Math.max(1, (fan.total - 1) / 2)) * 4).toFixed(2)}px;--card-order:${fan.index}"` : '';
  if (!selectable) return decorative
    ? `<span class="poker ${classes}" aria-hidden="true">${content}</span>`
    : `<span class="poker ${classes}" role="img" aria-label="${esc(aria)}"${fanStyle}>${content}</span>`;
  return `<button class="poker ${classes} ${selected?'selected':''}" data-card="${esc(c.id)}" aria-label="${esc(aria)}" aria-pressed="${selected?'true':'false'}"${fanStyle}>${content}</button>`;
}

function previewPoker(rankValue, suitValue) {
  return poker({ id:`preview-${rankValue}-${suitValue}`, rank:rankValue, suit:suitValue }, false, true);
}

function tableFrame(variant = 'game') {
  return `<div class="table-frame table-frame-${variant}" aria-hidden="true"><i class="table-layer table-layer-shadow" data-table-layer="shadow"></i><i class="table-layer table-layer-base" data-table-layer="base"></i><i class="table-layer table-layer-rail" data-table-layer="rail"></i><i class="table-layer table-layer-inlay" data-table-layer="inlay"></i><i class="table-layer table-layer-felt" data-table-layer="felt"></i></div>`;
}

function turnRemaining(g) {
  const deadline = Date.parse(g?.turn?.deadline || '');
  const fallback = Date.parse(g?.updatedAt || '') + TURN_TIMEOUT_MS;
  const effectiveDeadline = Number.isFinite(deadline) ? deadline : fallback;
  if (!Number.isFinite(effectiveDeadline) || g?.phase === 'finished') return 0;
  return Math.max(0, Math.ceil((effectiveDeadline - Date.now()) / 1000));
}

function dealSequence(game) {
  const otherSeats = game.players.filter((player)=>player.seat !== game.viewerSeat).map((player)=>player.seat);
  const relativeSeat = new Map([[game.viewerSeat,2],[otherSeats[0],0],[otherSeats[1],1]]);
  const flights = Array.from({length: 51}, (_, index) => `<i class="deal-card kai-card-back deal-seat-${relativeSeat.get(index % 3) ?? 2}" style="--deal-index:${index}" aria-hidden="true"></i>`).join('');
  const target = (position, label) => `<div class="deal-target ${position}" aria-hidden="true"><span><i class="kai-card-back"></i><i class="kai-card-back"></i><i class="kai-card-back"></i></span><b>${label}</b><small>17 张</small></div>`;
  return `<div class="deal-sequence" role="status" aria-live="polite" aria-label="开局发牌中，每位玩家十七张，预留三张增补牌">
    <div class="deal-copy"><span>开局发牌</span><b>正在依次发给三位玩家</b><small>每人 17 张 · 预留 3 张增补牌</small><ol><li>准备牌组</li><li>安全发牌</li><li>牌局锁定</li></ol></div>
    ${target('target-left','左侧牌友')}${target('target-right','右侧牌友')}${target('target-bottom','你的手牌')}
    <div class="deal-deck" aria-hidden="true"><i class="kai-card-back"></i><i class="kai-card-back"></i><i class="kai-card-back"></i><b>3</b><small>增补牌</small></div>${flights}
  </div>`;
}

function turnFeedbackState(g, canAct) {
  const remaining = turnRemaining(g);
  const current = g.players.find(player => player.seat === g.currentSeat);
  const botTurn = g.turn?.kind === 'bot' || current?.isBot;
  const durationSeconds = Math.max(1, Math.ceil((g.turn?.durationMs || TURN_TIMEOUT_MS) / 1000));
  const urgent = !botTurn && remaining <= 10;
  const progress = Math.min(360, Math.round((remaining / durationSeconds) * 360));
  const title = canAct ? '你的思考时间' : `${current?.name || '牌友'}正在思考`;
  const detail = remaining > 0
    ? (canAct ? '请在倒计时结束前完成操作' : botTurn ? `预计 ${remaining} 秒内行动` : '对方操作后牌桌会自动同步')
    : '时间到，服务端正在自动托管';
  return { remaining, botTurn, urgent, progress, title, detail };
}

function turnFeedback(g, canAct) {
  const model = turnFeedbackState(g, canAct);
  return `<div class="turn-feedback ${canAct?'is-mine':'is-waiting'} ${model.botTurn?'is-bot':''} ${model.urgent?'is-urgent':''}" data-turn-feedback role="timer" aria-live="${model.urgent?'polite':'off'}" aria-label="${esc(model.title)}，${model.remaining > 0 ? `剩余 ${model.remaining} 秒` : model.detail}">
    <div class="turn-timer" data-turn-timer style="--turn-progress:${model.progress}deg"><strong data-turn-seconds>${model.remaining || '··'}</strong><small data-turn-unit>${model.remaining ? '秒' : '托管'}</small></div>
    <div class="turn-copy"><b>${esc(model.title)}${model.botTurn?'<span class="thinking-dots"><i></i><i></i><i></i></span>':''}</b><small data-turn-detail>${model.detail}</small></div>
  </div>`;
}

function updateTurnClock() {
  if (state.view !== 'game' || !state.game || state.game.phase === 'finished') return;
  const root = document.querySelector('[data-turn-feedback]');
  if (!root) return;
  const canAct = state.game.currentSeat === state.game.viewerSeat;
  const model = turnFeedbackState(state.game, canAct);
  root.classList.toggle('is-urgent', model.urgent);
  root.setAttribute('aria-live', model.urgent ? 'polite' : 'off');
  root.setAttribute('aria-label', `${model.title}，${model.remaining > 0 ? `剩余 ${model.remaining} 秒` : model.detail}`);
  root.querySelector('[data-turn-timer]')?.style.setProperty('--turn-progress', `${model.progress}deg`);
  const seconds = root.querySelector('[data-turn-seconds]');
  const unit = root.querySelector('[data-turn-unit]');
  const detail = root.querySelector('[data-turn-detail]');
  if (seconds) seconds.textContent = model.remaining || '··';
  if (unit) unit.textContent = model.remaining ? '秒' : '托管';
  if (detail) detail.textContent = model.detail;
}

function actionTrail(g) {
  const events = (g.recentEvents || []).slice(-3);
  if (!events.length) return '<p>牌局开始，祝你好运</p>';
  return `<div class="action-trail" aria-label="最近行动">${events.map(event => {
    const player = g.players.find(candidate => candidate.seat === event.seat);
    const cards = (event.cards || []).map(card => `${rank(card.rank)}${suit(card.suit)}`);
    const summary = event.kind === 'pass' ? '略过' : `${cards.slice(0,4).join(' ')}${cards.length>4?` +${cards.length-4}`:''}`;
    return `<span class="${event.seat===g.currentSeat?'current':''}"><b>${esc(player?.name || '玩家')}</b>${esc(summary || '已出牌')}</span>`;
  }).join('<i>→</i>')}</div>`;
}

function matchResult(g, viewer) {
  const settlement = g.settlement;
  const delta = Number(settlement?.deltas?.[viewer.id]) || 0;
  const viewerWon = delta > 0;
  const viewerRole = viewer.role === 'landlord' ? '领队' : '协作位';
  const lastEvent = (g.recentEvents || []).at(-1);
  const lastPlayer = lastEvent ? g.players.find(player => player.seat === lastEvent.seat) : null;
  const lastCards = (lastEvent?.cards || []).map(card => `${rank(card.rank)}${suit(card.suit)}`).join(' ');
  const lastAction = !lastEvent
    ? '当前视图没有可展示的出牌记录'
    : `${lastPlayer?.name || '玩家'}${lastEvent.kind === 'pass' ? '选择略过' : `打出 ${lastCards || `${lastEvent.cards?.length || 0} 张牌`}`}`;
  const fairnessCode = g.fairness?.commitment ? g.fairness.commitment.slice(0, 12) : '未提供';
  return `<main class="match-result ${viewerWon?'is-win':'is-loss'}">
    <header class="game-top"><div class="game-branding"><div class="brand compact"><div class="logo"><span></span>K</div><div>KAI PLAY<small>斗地主 · 本局结束</small></div></div></div><div class="score-pill compact-score"><small>当前竞技分</small><strong>${money(competitiveScore(state.profile))}</strong></div></header>
    <section class="result-score" aria-live="polite"><span>${settlement?.winner === 'landlord' ? '领队获胜' : '协作方获胜'}</span><h1>${viewerWon ? '这局拿下了' : '这局惜败'}</h1><strong class="${delta>=0?'positive':'negative'}">${delta>=0?'+':''}${money(delta)}</strong><small>竞技分 · 服务端已完成结算</small></section>
    <section class="review-panel" aria-labelledby="review-title"><div><span>牌局记录</span><h2 id="review-title">复盘预览</h2><p>这里只整理服务端已经记录的事实，当前不提供策略优劣、最优解或胜率推断。</p></div>
      <div class="decision-row"><span>身份与结果</span><b>${viewerRole} · ${viewerWon?'获胜':'落败'}</b><small>本局最高争分 ${Number(g.highestBid) || 0} 档</small></div>
      <div class="decision-row"><span>结算信息</span><b>${Number(settlement?.multiplier) || 1} 倍</b><small>炸弹记录 ${Number(g.bombs) || 0} 次 · 基础分 ${Number(g.baseStake) || 0}</small></div>
      <div class="decision-row"><span>最后行动</span><b>${esc(lastAction)}</b><small>当前视图保留最近 ${(g.recentEvents || []).length} 条行动</small></div>
      <div class="decision-row"><span>公平校验</span><b>${esc(fairnessCode)}</b><small>完整牌序在结束后由服务端公开校验</small></div>
    </section>
    <div class="result-actions"><button class="btn primary" data-action="rematch">快速人机再来一局 <b>→</b></button><button class="btn" data-action="finish">返回大厅</button></div>
  </main>`;
}

function game() {
  const g=state.game; if(!g) return lobby();
  const isDealing=state.dealingGameId===g.id;
  const viewer=g.players.find(p=>p.seat===g.viewerSeat) || g.players[0];
  if (g.phase==='finished' && g.settlement) return `<div class="shell table">${matchResult(g,viewer)}</div>`;
  const rivals=g.players.filter(p=>p.seat!==g.viewerSeat);
  const roleName=role=>role==='landlord'?'领队':role==='farmer'?'协作位':'定主位';
  const playerPod=(p,position)=>`<div class="player-pod ${position} ${p.seat===g.currentSeat?'turn':''}" data-seat="${p.seat}" data-role="${esc(p.role || 'unassigned')}">${p.seat===g.viewerSeat?'':cardBackStack()}<div class="pod-avatar">${esc(p.name.slice(0,1))}<span>${roleName(p.role)}</span></div><div class="pod-copy"><b>${esc(p.name)}</b><small>${p.isBot?'智能牌友':p.seat===g.viewerSeat?'我':'好友房牌友'}</small></div><div class="pod-count"><b>${p.cardCount}</b><small>张</small></div></div>`;
  const lead=g.leadCards?.length?g.leadCards.map(c=>poker(c,false)).join(''):'<span class="table-prompt">等待出牌</span>';
  const viewerTurn=g.currentSeat===g.viewerSeat;
  const canAct=!isDealing&&viewerTurn;
  const selectionCount=state.selected.size;
  const actions=g.phase==='bidding'
    ? [0,1,2,3].map(n=>`<button class="btn table-action ${n===3?'gold':''}" data-bid="${n}" ${canAct&&(n===0||n>Number(g.highestBid||0))?'':'disabled'}>${n===0?'让先':n+' 档'}</button>`).join('')
    : `<button class="btn table-action ghost" data-action="pass" ${canAct&&g.leadCombination?'':'disabled'}>不出</button>${canAct&&selectionCount?'<button class="btn table-action selection-reset" data-action="clear-selection">重选</button>':''}<button class="btn table-action primary" data-action="play" ${canAct&&selectionCount?'':'disabled'}>${selectionCount?`出牌 · ${selectionCount} 张`:'出牌'}</button>`;
  const currentPlayer=g.players.find(p=>p.seat===g.currentSeat);
  const currentMultiplier=Math.max(1,Number(g.highestBid)||1)*(2**Number(g.bombs||0));
  const handInteractive=canAct&&g.phase==='playing';
  const turnText = isDealing?'正在依次发牌':g.phase==='finished'?'本局已结束':viewerTurn?(g.phase==='bidding'?'轮到你选择争分':'轮到你出牌'):`${currentPlayer?.name||'牌友'}正在思考`;
  const handHint = handInteractive ? (selectionCount ? `已选 ${selectionCount} 张 · 可重选或确认出牌` : '点击手牌选择 · 再确认出牌') : '等待轮次 · 规则由服务端统一判定';
  const exitDialog=state.exitConfirm?`<div class="exit-shade"><section class="exit-dialog" role="dialog" aria-modal="true" aria-labelledby="exit-title"><span>结束本局</span><h2 id="exit-title">确定不打了吗？</h2><p>退出会按本局负场结算；好友局也会同时结束。你可以留下继续完成这一局。</p><div><button class="btn" data-action="cancel-exit">继续本局</button><button class="btn danger" data-action="confirm-exit">认输并退出</button></div></section></div>`:'';
  return `<div class="shell table route-game"><header class="game-top"><div class="game-branding"><div class="brand compact"><div class="logo"><span></span>K</div><div>KAI PLAY<small>斗地主</small></div></div></div><div class="round-state"><span>${turnText}</span><b>基础分 ${g.baseStake} · 明示倍数 ${currentMultiplier}</b></div><div class="score-pill compact-score"><small>竞技分</small><strong>${money(competitiveScore(state.profile))}</strong></div></header>${syncFailureNotice()}<section class="landscape-table ddz-table ${isDealing?'is-dealing':''}">${tableFrame('game')}<button class="table-exit table-exit-float" data-action="open-exit" aria-label="退出当前牌局">← 退出</button><div class="table-score"><b>基础分 ${g.baseStake}</b><span>明示倍数 ${currentMultiplier}</span></div>${playerPod(rivals[0]||viewer,'opponent-left')}${playerPod(rivals[1]||viewer,'opponent-right')}${playerPod(viewer,'viewer-pod')}${g.bottomCards?.length?`<div class="bottom-reveal"><small>增补牌</small>${g.bottomCards.map(c=>poker(c,false)).join('')}</div>`:''}<div class="play-zone"><div class="play-cards">${lead}</div>${actionTrail(g)}</div><div class="center-controls" ${isDealing?'aria-hidden="true"':''}>${turnFeedback(g,viewerTurn)}<div class="game-actions">${actions}</div></div><footer class="hand-dock" ${isDealing?'aria-hidden="true"':''}><div class="hand" style="--hand-count:${g.hand.length}">${g.hand.map((c,index,hand)=>poker(c,handInteractive,false,{index,total:hand.length})).join('')}</div><p>${handHint}</p></footer>${isDealing?dealSequence(g):''}</section>${exitDialog}</div>`;
}

function casualHeader(title, mode, status) {
  return `<header class="casual-top"><button class="table-exit" data-action="casual-home">← 游戏大厅</button><div><span>${esc(mode)}</span><h1>${esc(title)}</h1></div><b>${esc(status)}</b></header>`;
}

function cardBack(decorative = false, extraClass = '') {
  const accessibility = decorative ? 'aria-hidden="true"' : 'role="img" aria-label="未公开的 KAI PLAY 牌"';
  return `<span class="training-card-back kai-card-back ${esc(extraClass)}" ${accessibility}><i class="card-back-mark"><b>K</b><small>KAI PLAY</small></i></span>`;
}

function cardBackStack() {
  return `<div class="pod-card-stack" aria-hidden="true"><i class="kai-card-back"></i><i class="kai-card-back"></i><i class="kai-card-back"></i></div>`;
}

function threeCardGame() {
  const round = state.casual?.round;
  if (!round) return lobby();
  const revealed = state.casual.revealed;
  const ranked = round.players.map((player, index) => ({ player, index, score: evaluateThreeCard(player.hand) }))
    .sort((a, b) => compareThreeCard(b.player.hand, a.player.hand));
  const winner = ranked[0];
  const result = revealed ? `<div class="training-result ${winner.index===0?'win':'lose'}"><span>${winner.index===0?'本轮获胜':'本轮结果'}</span><b>${esc(winner.player.name)} · ${esc(winner.score.label)}</b><small>免费训练局，不影响竞技分</small></div>` : '';
  const seats = round.players.slice(1).map((player) => `<article class="three-opponent ${revealed?'is-revealed':''}"><div class="training-avatar">${esc(player.name.slice(0,1))}</div><b>${esc(player.name)}</b><div class="three-hand">${revealed ? player.hand.map((card) => poker(card,false)).join('') : player.hand.map(() => cardBack(false)).join('')}</div>${revealed?`<span>${esc(evaluateThreeCard(player.hand).label)}</span>`:'<span>等待比牌</span>'}</article>`).join('');
  return `<div class="shell casual-shell">${casualHeader('炸金花','THREE CARD','免费训练 · 不计竞技分')}<section class="casual-stage three-stage">${result}<div class="three-how"><span>1 看自己的三张牌</span><i>→</i><span>2 点击翻开并比牌</span><i>→</i><span>3 最大牌型获胜</span></div><div class="three-opponents">${seats}</div><div class="three-center"><span>本局免费</span><b>${state.casual.thinking?'两位牌友正在思考…':revealed?'三家牌面已揭晓':'三张牌，一次定胜负'}</b><small>无筹码 · 无下注</small></div><article class="three-player"><div class="training-avatar">你</div><div><b>你的手牌</b><span>${esc(evaluateThreeCard(round.players[0].hand).label)}</span></div><div class="three-hand">${round.players[0].hand.map((card) => poker(card,false)).join('')}</div></article><div class="casual-actions"><button class="btn primary" data-action="three-reveal" ${state.casual.thinking||revealed?'disabled':''}>${state.casual.thinking?'牌友思考中…':'翻开并比牌'}</button><button class="btn" data-action="three-new">换一手牌</button></div></section><p class="casual-disclaimer">牌型顺序：豹子 ＞ 顺金 ＞ 金花 ＞ 顺子 ＞ 对子 ＞ 高牌。当前为单机训练，不使用现金、Token 或卡时。</p></div>`;
}

function mahjongTone(tile) {
  if (tile.suit !== '字') return tile.suit === '万' ? 'wan' : tile.suit === '筒' ? 'tong' : 'tiao';
  if (tile.label === '中') return 'honor honor-red';
  if (tile.label === '发') return 'honor honor-green';
  return 'honor';
}

const MAHJONG_NUMERALS = ['', '一','二','三','四','五','六','七','八','九'];
const MAHJONG_HONORS = Object.freeze({ 东:'東', 南:'南', 西:'西', 北:'北', 中:'中', 发:'發', 白:'' });
const MAHJONG_MARK_PATTERNS = Object.freeze({
  1: ['mc'],
  2: ['tc','bc'],
  3: ['tc','mc','bc'],
  4: ['tl','tr','bl','br'],
  5: ['tl','tr','mc','bl','br'],
  6: ['tl','tr','ml','mr','bl','br'],
  7: ['tc','ul','ur','ml','mr','ll','lr'],
  8: ['tl','tr','ul','ur','ll','lr','bl','br'],
  9: ['tl','tc','tr','ml','mc','mr','bl','bc','br'],
});

function mahjongPattern(rank, type) {
  if (type === 'tiao' && rank === 1) return '<b class="bamboo-bird">雀</b>';
  const pattern = MAHJONG_MARK_PATTERNS[Math.max(1, Math.min(9, Number(rank) || 1))] || MAHJONG_MARK_PATTERNS[1];
  return pattern.map((position)=>`<i class="mahjong-symbol symbol-${type} symbol-${position}"></i>`).join('');
}

function mahjongMark(tile) {
  if (tile.suit === '字') {
    const honor = MAHJONG_HONORS[tile.label] ?? tile.label;
    return `<span class="mahjong-mark mark-honor ${tile.label==='白'?'mark-blank':''}"><b>${esc(honor)}</b></span>`;
  }
  if (tile.suit === '万') return `<span class="mahjong-mark mark-wan"><b>${MAHJONG_NUMERALS[tile.rank] || esc(tile.rank)}</b><small>萬</small></span>`;
  const type = tile.suit === '筒' ? 'tong' : 'tiao';
  return `<span class="mahjong-mark mark-${type} mark-count-${tile.rank}">${mahjongPattern(tile.rank,type)}</span>`;
}

function mahjongFace(tile, extraClass = '') {
  return `<span class="mahjong-face ${mahjongTone(tile)} ${esc(extraClass)}" title="${esc(tile.label)}">${mahjongMark(tile)}</span>`;
}

function mahjongTile(tile) {
  const game = state.casual?.game;
  const selected = state.casual?.selectedTileId === tile.id;
  const interactive = game?.phase === 'playing' && game.currentSeat === 0 && game.hands[0].length === 14;
  return `<button class="mahjong-tile ${mahjongTone(tile)} ${selected?'selected':''} ${game?.drawnId===tile.id?'drawn':''}" data-mahjong-tile="${esc(tile.id)}" aria-label="${esc(tile.label)}${game?.drawnId===tile.id?'，刚摸到':''}" aria-pressed="${selected?'true':'false'}" ${interactive?'':'disabled'}>${mahjongMark(tile)}</button>`;
}

function mahjongBackRack(count, position) {
  const backs = Array.from({ length: Math.min(13, count) }, () => '<i></i>').join('');
  return `<div class="mahjong-hidden-hand hidden-hand--${position}" aria-label="暗牌 ${count} 张">${backs}<small>${count}</small></div>`;
}

function mahjongSeat(game, seat, position) {
  const player = game.players[seat];
  const name = seat === 0 ? (state.profile?.name || '你') : player.name;
  const avatar = seat === 0 ? name.slice(0,1) : (name.match(/([ABC])$/i)?.[1]?.toUpperCase() || String.fromCharCode(64 + seat));
  const active = game.phase === 'playing' && game.currentSeat === seat;
  const winner = game.result?.winnerSeat === seat;
  return `<article class="mahjong-match-seat match-seat--${position} ${active?'is-turn':''} ${winner?'is-winner':''}" data-wind="${esc(player.wind)}家" aria-label="${esc(name)}，${esc(player.wind)}家，${game.hands[seat].length}张"><span>${esc(avatar)}</span><div><b>${esc(name)}</b><small>${esc(player.wind)}家 · ${game.hands[seat].length}张</small></div></article>`;
}

function mahjongWall(game) {
  const remainingStacks = Math.ceil(game.wall.length / 2);
  return ['north','east','south','west'].map((position,side)=>`<div class="mahjong-wall-track wall-track--${position}">${Array.from({length:17},(_,index)=>`<i class="${side * 17 + index < remainingStacks ? '' : 'is-used'}"></i>`).join('')}</div>`).join('');
}

function mahjongRiver(game, seat, position, latestTileId) {
  const tiles = game.rivers[seat].slice(-24);
  return `<div class="mahjong-river match-river--${position}" aria-label="${esc(game.players[seat].name)}的牌河">${tiles.map((tile) => mahjongFace(tile, `river-face ${tile.id===latestTileId?'is-latest':''}`)).join('') || '<small>尚未出牌</small>'}</div>`;
}

function mahjongResult(game) {
  if (game.phase !== 'finished') return '';
  const result = game.result;
  if (result.kind === 'draw') return `<div class="mahjong-result-panel is-draw" role="status" aria-live="polite"><span>东一局结束</span><h2>流局</h2><p>牌墙已摸完，本局无人和牌。</p></div>`;
  const winner = game.players[result.winnerSeat];
  const winnerName = result.winnerSeat === 0 ? (state.profile?.name || '你') : winner.name;
  const action = result.kind === 'tsumo' ? '自摸' : '荣和';
  const detail = result.kind === 'ron' ? `荣和 ${esc(game.players[result.fromSeat].name)} 的弃牌` : '摸到和牌张';
  return `<div class="mahjong-result-panel ${result.winnerSeat===0?'is-win':'is-loss'}" role="status" aria-live="polite"><span>东一局结束</span><h2>${esc(winnerName)} · ${action}</h2><p>${detail}</p><b>${esc(result.pattern?.label || '完成和牌牌型')}</b></div>`;
}

function mahjongConfirmDialog() {
  const action = state.casual?.confirmAction;
  if (!action) return '';
  const leaving = action === 'home';
  return `<div class="exit-shade"><section class="exit-dialog" role="dialog" aria-modal="true" aria-labelledby="mahjong-confirm-title"><span>麻将对局进行中</span><h2 id="mahjong-confirm-title">${leaving?'确定离开这一局？':'确定重新开局？'}</h2><p>${leaving?'当前单机牌局不会保留，离开后将返回游戏大厅。':'当前进度会被清空，并立即重新洗牌开局。'}</p><div><button class="btn" data-action="mahjong-cancel-confirm">继续本局</button><button class="btn danger" data-action="mahjong-confirm">${leaving?'离开牌局':'确认重开'}</button></div></section></div>`;
}

function mahjongGame() {
  const game = state.casual?.game;
  if (!game) return lobby();
  const canDiscard = game.phase === 'playing' && game.currentSeat === 0 && game.hands[0].length === 14;
  const activeName = game.currentSeat === 0 ? (state.profile?.name || '你') : game.players[game.currentSeat].name;
  const turnHint = game.phase === 'finished' ? '本局已结束'
    : game.currentSeat === 0 ? '轮到你：选择一张手牌，再确认打出'
      : `${activeName} 正在摸打`;
  const latestDiscard = [...game.events].reverse().find((event) => event.kind === 'discard');
  const latestTile = latestDiscard ? game.rivers.flat().find((tile) => tile.id === latestDiscard.tileId) : null;
  const latestCopy = latestDiscard && latestTile ? `${game.players[latestDiscard.seat].name} 打出 ${latestTile.label}` : '你是东家，先打出一张牌';
  const sortedHand = sortMahjong(game.hands[0]);
  const drawnTile = sortedHand.find((tile) => tile.id === game.drawnId);
  const displayHand = drawnTile ? [...sortedHand.filter((tile) => tile.id !== drawnTile.id), drawnTile] : sortedHand;
  const selectedTile = displayHand.find((tile) => tile.id === state.casual?.selectedTileId);
  const discardLabel = game.phase === 'finished' ? '本局已结束' : selectedTile ? `打出 ${selectedTile.label}` : '请选择一张牌';
  return `<div class="shell casual-shell mahjong-route">${casualHeader('KAI 麻将','FOUR PLAYER MAHJONG',`东一局 · 余牌 ${game.wall.length}`)}<section class="casual-stage mahjong-match-stage">
    <div class="mahjong-table-volume" aria-hidden="true"></div><div class="mahjong-match-felt"></div>
    <div class="mahjong-wall-ring" aria-hidden="true">${mahjongWall(game)}</div>
    ${mahjongSeat(game,2,'north')}${mahjongSeat(game,3,'west')}${mahjongSeat(game,1,'east')}${mahjongSeat(game,0,'south')}
    ${mahjongBackRack(game.hands[2].length,'north')}${mahjongBackRack(game.hands[3].length,'west')}${mahjongBackRack(game.hands[1].length,'east')}
    <div class="mahjong-river-board">${mahjongRiver(game,2,'north',latestDiscard?.tileId)}${mahjongRiver(game,3,'west',latestDiscard?.tileId)}<div class="mahjong-center-score"><small>东一局</small><b>${game.wall.length}</b><span>余牌</span><i>${esc(game.players[game.currentSeat].wind)}家行动</i></div>${mahjongRiver(game,1,'east',latestDiscard?.tileId)}${mahjongRiver(game,0,'south',latestDiscard?.tileId)}</div>
    <div class="mahjong-turn-banner" role="status" aria-live="polite" aria-atomic="true"><span class="turn-pulse"></span><b>${esc(turnHint)}</b><small>${esc(latestCopy)}</small></div>
    ${mahjongResult(game)}
    <div class="mahjong-hand match-player-hand" style="--tile-count:${game.hands[0].length}">${displayHand.map(mahjongTile).join('')}</div>
    <div class="casual-actions mahjong-match-actions"><button class="btn primary" data-action="mahjong-discard" ${canDiscard&&selectedTile?'':'disabled'}>${esc(discardLabel)}</button><button class="btn" data-action="mahjong-new">${game.phase==='finished'?'再来一局':'重新开局'}</button></div>
  </section>${mahjongConfirmDialog()}<p class="casual-disclaimer">四人东一局基础速战：136 张牌、三位智能牌友、四家牌河，支持常规和牌、七对与国士无双的自摸/荣和。当前为基础规则，吃碰杠、立直、宝牌与完整点数结算将在后续版本加入。</p></div>`;
}

function merge1048Tile(value, index) {
  const label = value ? `数字 ${value}` : '空格';
  return `<div class="merge-1048-tile value-${value || 0}" role="gridcell" aria-label="第 ${index + 1} 格，${label}">${value ? `<b>${value}</b>` : ''}</div>`;
}

function merge1048Result(game) {
  if (game.status === 'won') {
    return `<section class="merge-1048-result is-win" data-1048-result role="dialog" aria-labelledby="merge-1048-result-title" tabindex="-1"><span>目标达成</span><h2 id="merge-1048-result-title">合成 1048</h2><p>你用了 ${game.moves} 步，当前得分 ${money(game.score)}。</p><div><button class="btn primary" data-action="1048-continue">继续挑战</button><button class="btn" data-action="1048-new">再来一局</button></div></section>`;
  }
  if (game.status === 'over') {
    return `<section class="merge-1048-result is-over" data-1048-result role="dialog" aria-labelledby="merge-1048-result-title" tabindex="-1"><span>本局结束</span><h2 id="merge-1048-result-title">没有可移动的方块</h2><p>最高方块 ${game.bestTile} · 得分 ${money(game.score)}</p><button class="btn primary" data-action="1048-new">重新开局</button></section>`;
  }
  return '';
}

function merge1048Game() {
  const game = state.casual?.game;
  if (!game) return lobby();
  const status = game.status === 'won' ? '已达成 1048' : game.status === 'over' ? '本局结束' : game.lastGained ? `刚刚 +${game.lastGained}` : '合并相同数字';
  return `<div class="shell casual-shell merge-1048-route">${casualHeader('1048','NUMBER MERGE',`目标 ${MERGE_1048_TARGET}`)}<main class="merge-1048-stage">
    <section class="merge-1048-copy"><div><span>免费单机益智 · 自动保存</span><h1>把数字推向 <b>1048</b></h1><p>滑动棋盘或使用方向键。普通方块逐级翻倍；KAI 特殊终局规则会让最后两枚 512 融合成 1048。</p></div><button class="btn" data-action="1048-new">重新开局</button></section>
    <section class="merge-1048-play"><div class="merge-1048-metrics" aria-label="本局数据"><div><small>得分</small><strong>${money(game.score)}</strong></div><div><small>最高方块</small><strong>${game.bestTile}</strong></div><div><small>移动</small><strong>${game.moves}</strong></div></div>
      <div class="merge-1048-status" role="status" aria-live="polite"><i></i><b>${esc(status)}</b><span>512 + 512 = 1048</span></div>
      <div class="merge-1048-board" data-1048-board role="grid" aria-label="1048 数字棋盘，使用方向键或滑动移动" aria-rowcount="4" aria-colcount="4" aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight W A S D" aria-disabled="${game.status === 'playing' ? 'false' : 'true'}" tabindex="${game.status === 'playing' ? '0' : '-1'}">${game.board.map(merge1048Tile).join('')}</div>
      <div class="merge-1048-controls" aria-label="移动方向"><span></span><button data-action="1048-move" data-merge-direction="up" aria-label="向上移动" ${game.status === 'playing' ? '' : 'disabled'}>↑</button><span></span><button data-action="1048-move" data-merge-direction="left" aria-label="向左移动" ${game.status === 'playing' ? '' : 'disabled'}>←</button><button data-action="1048-move" data-merge-direction="down" aria-label="向下移动" ${game.status === 'playing' ? '' : 'disabled'}>↓</button><button data-action="1048-move" data-merge-direction="right" aria-label="向右移动" ${game.status === 'playing' ? '' : 'disabled'}>→</button></div>
      <p class="merge-1048-hint">键盘：方向键 / WASD　·　触屏：在棋盘上滑动</p>
      ${merge1048Result(game)}
    </section>
  </main><p class="casual-disclaimer">本局进度自动保存在当前浏览器。1048 是免费本地益智训练，不请求服务端结算，也不会改变竞技分、Token 或 KAI 卡时。</p></div>`;
}

function slotsGame() {
  const casual = state.casual;
  if (!casual) return lobby();
  const result = casual.last?.result;
  const resultCopy = result?.tier==='jackpot' ? '三个图标完全相同' : result?.tier==='pair' ? '其中两个图标相同' : result ? '三个图标各不相同' : '点击按钮，等待三个转轮依次停止';
  return `<div class="shell casual-shell">${casualHeader('算力转轮','COMPUTE REELS',`已旋转 ${casual.spins} 次`)}<section class="casual-stage slots-stage"><div class="slot-guide"><b>怎么玩？</b><span><i>1</i>点击免费旋转</span><span><i>2</i>三个转轮停止</span><span><i>3</i>查看图标组合</span></div><div class="slot-machine"><div class="slot-crown"><span>KAI PLAY</span><b>算力转轮</b><small>免费娱乐 · 零消耗</small></div><div class="slot-reels ${casual.spinning?'spinning':''}">${casual.reels.map((symbol,index)=>`<div class="slot-reel" style="--reel:${index}"><small>◆</small><span class="slot-symbol symbol-${symbol==='7'?'seven':'kai'}">${esc(symbol)}</span><small>★</small></div>`).join('')}</div><div class="slot-paytable"><span><b>三枚相同</b><small>三连共振</small></span><span><b>两枚相同</b><small>双核同频</small></span><span><b>各不相同</b><small>继续挑战</small></span></div><div class="slot-result ${result?.tier||''}"><b>${casual.spinning?'转轮依次停止中…':result?.label||'准备好了吗？'}</b><small>${resultCopy}</small></div><button class="slot-lever" data-action="slots-spin" ${casual.spinning?'disabled':''}><i></i><span>${casual.spinning?'正在旋转…':'免费旋转一次'}</span></button></div></section><p class="casual-disclaimer">纯视觉娱乐，不支付、不下注、不发放可兑换奖励，不会扣除竞技分、Token 或 KAI 卡时。</p></div>`;
}

function historyMatchWon(match) {
  if (match.role === 'landlord') return match.winner === 'landlord';
  if (match.role === 'farmer') return match.winner === 'farmers';
  return Number(match.delta) > 0;
}

function currentWinStreak(matches) {
  let streak = 0;
  for (const match of matches) {
    if (!historyMatchWon(match)) break;
    streak += 1;
  }
  return streak;
}

function bestWinStreak(matches) {
  let current = 0;
  let best = 0;
  for (const match of matches) {
    current = historyMatchWon(match) ? current + 1 : 0;
    best = Math.max(best, current);
  }
  return best;
}

function history() {
  if (state.historyStatus === 'loading' && !state.history) {
    return `<div class="shell page-shell season-page">${header()}<section class="history-state-card" aria-live="polite"><i class="history-state-spinner" aria-hidden="true"></i><span>正在整理战绩</span><h1>读取最近牌局…</h1><p>竞技分与已结算记录正在从服务端同步。</p></section>${nav('history')}</div>`;
  }
  if (state.historyStatus === 'error' && !state.history) {
    return `<div class="shell page-shell season-page">${header()}<section class="history-state-card is-error" role="alert"><span>暂时无法读取</span><h1>战绩没有被清空</h1><p>${esc(state.historyError || '网络连接暂时不可用，请稍后重试。')}</p><button class="btn primary" data-action="retry-history">重新读取</button></section>${nav('history')}</div>`;
  }
  const matches=Array.isArray(state.history?.games) ? state.history.games : [];
  const profile=state.profile || {};
  const totalGames=Math.max(0,Number(profile.games) || 0);
  const totalWins=Math.max(0,Number(profile.wins) || 0);
  const trend=[...matches.slice(0,10)].reverse();
  const recentDelta=trend.reduce((sum,match)=>sum+(Number(match.delta)||0),0);
  const trendScale=Math.max(1,...trend.map(match=>Math.abs(Number(match.delta)||0)));
  const trendBars=trend.length ? trend.map((match,index)=>{
    const delta=Number(match.delta)||0;
    const height=Math.max(12,Math.round(Math.abs(delta)/trendScale*100));
    return `<i class="${delta>=0?'positive':'negative'}" style="--trend-height:${height}%" title="第 ${index+1} 局：${delta>=0?'+':''}${delta} 分"><span>${delta>=0?'+':''}${delta}</span></i>`;
  }).join('') : '<p>完成首局后，这里会按时间显示最近的竞技分变化。</p>';
  const recentMatches=matches.length ? matches.map(match=>{
    const won=historyMatchWon(match);
    const delta=Number(match.delta)||0;
    const updated=new Date(match.updatedAt);
    const dateLabel=Number.isNaN(updated.getTime()) ? '时间未记录' : updated.toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});
    return `<article class="recent-match"><span class="${won?'positive':'negative'}">${won?'胜':'负'}</span><div><b>斗地主 · ${match.role==='landlord'?'领队':'协作位'}</b><small>${esc(dateLabel)} · ${Number(match.multiplier)||1} 倍结算</small></div><strong class="${delta>=0?'positive':'negative'}">${delta>=0?'+':''}${money(delta)}</strong></article>`;
  }).join('') : `<div class="empty-state"><b>还没有完成的牌局</b><p>你的段位、趋势和最近对局会在首局结算后出现在这里。</p><button class="btn primary" data-action="quick">开始第一局</button></div>`;
  const statusNotice=state.historyStatus==='error' ? `<div class="history-inline-error" role="alert"><span>显示上次成功读取的记录</span><b>${esc(state.historyError || '最新战绩同步失败')}</b><button class="btn" data-action="retry-history">重试</button></div>` : '';
  return `<div class="shell page-shell season-page">${header()}${statusNotice}
    <section class="season-hero"><div class="season-rank"><span>我的战绩</span><h1>${tierName(profile)}</h1><p>当前账户 · 全部已保存对局</p></div><div class="score-overview"><small>竞技分</small><strong>${money(competitiveScore(profile))}</strong></div></section>
    <section class="season-metrics" aria-label="战绩摘要"><div><strong>${totalGames}</strong><span>完成对局</span></div><div><strong>${totalGames?winRatePercent(profile):0}%</strong><span>总胜率</span></div><div><strong>${totalWins}</strong><span>累计胜局</span></div><div><strong>${currentWinStreak(matches)}</strong><span>近 ${matches.length || 0} 局当前连胜</span></div><div><strong>${bestWinStreak(matches)}</strong><span>近 ${matches.length || 0} 局最佳连胜</span></div></section>
    <section class="trend-strip"><div class="history-summary"><div><span>近期走势</span><h2>最近 ${trend.length} 局</h2></div><strong class="${recentDelta>=0?'positive':'negative'}">${recentDelta>=0?'+':''}${money(recentDelta)}<small> 分</small></strong></div><div class="trend-bars" aria-label="最近对局竞技分变化">${trendBars}</div></section>
    <section class="history-list"><div class="section-head"><div><span class="section-kicker">最近牌局</span><h2>${matches.length?'逐局记录':'等待第一场记录'}</h2></div><p>最多展示服务端返回的最近 20 局</p></div>${recentMatches}</section>
    ${nav('history')}</div>`;
}

function rules() { return `<div class="shell page-shell">${header()}<div class="section-head page-title"><div><span class="section-kicker">FAIR PLAY</span><h1>规则与公平</h1></div><p>免费竞技，结果透明</p></div><section class="card"><div class="rules"><div class="rule"><span>01</span><div><h3>竞技分不是支付资产</h3><p class="muted">竞技分只用于斗地主段位、匹配与战绩展示，不可购买、提现、转让或兑换。</p></div></div><div class="rule"><span>02</span><div><h3>45 秒思考与自动托管</h3><p class="muted">斗地主真人回合有 45 秒思考时间；智能牌友会分别思考后行动，倒计时结束由服务端托管。</p></div></div><div class="rule"><span>03</span><div><h3>系统发牌与数字生成</h3><p class="muted">斗地主开局向三位玩家各发 17 张并预留 3 张增补牌；炸金花每轮独立发三张；麻将使用 136 张基础牌墙；1048 每次有效移动后生成一个新数字。</p></div></div><div class="rule"><span>04</span><div><h3>竞技与试玩分区</h3><p class="muted">斗地主由服务端判定并记录战绩；炸金花、麻将、1048 和算力转轮当前是免费训练场，不计竞技分。</p></div></div><div class="rule"><span>05</span><div><h3>卡时与输赢隔离</h3><p class="muted">KAI 卡时只用于明确的 AI 与云端服务，不作为牌桌筹码；试玩场也不支付、不下注、不发放可兑换奖励。</p></div></div></div></section>${nav('rules')}</div>`; }

function render() {
  app.innerHTML = state.view==='game'?game():state.view==='room'?room():state.view==='three'?threeCardGame():state.view==='mahjong'?mahjongGame():state.view==='1048'?merge1048Game():state.view==='slots'?slotsGame():state.view==='history'?history():state.view==='rules'?rules():lobby();
  app.setAttribute('aria-busy', String(state.busy));
  if (state.busy) {
    app.querySelectorAll('button,input').forEach((control) => { control.disabled = true; });
    app.insertAdjacentHTML('beforeend', '<div class="global-busy" role="status" aria-live="polite"><i aria-hidden="true"></i><span>正在处理，请稍候…</span></div>');
  }
}

function stopMahjongBotSequence() {
  if (mahjongBotTimer) clearTimeout(mahjongBotTimer);
  mahjongBotTimer = null;
}

function stopCasualTimers() {
  if (threeRevealTimer) clearTimeout(threeRevealTimer);
  if (slotSpinTimer) clearTimeout(slotSpinTimer);
  threeRevealTimer = null;
  slotSpinTimer = null;
}

function queueMahjongBotTurn() {
  stopMahjongBotSequence();
  const game = state.casual?.game;
  if (state.view !== 'mahjong' || !game || game.phase !== 'playing' || !game.players[game.currentSeat]?.isBot || state.casual?.confirmAction) return;
  mahjongBotTimer = setTimeout(() => {
    mahjongBotTimer = null;
    const liveGame = state.casual?.game;
    if (state.view !== 'mahjong' || !liveGame || liveGame.phase !== 'playing' || !liveGame.players[liveGame.currentSeat]?.isBot) return;
    try {
      state.casual.game = advanceMahjongBotTurn(liveGame);
      state.casual.selectedTileId = null;
    } catch (error) {
      toast(error.message);
      return;
    }
    render();
    queueMahjongBotTurn();
  }, 650);
}

function updateHeroControls(nextGame) {
  document.querySelectorAll('[data-action="hero-select"]').forEach((control) => {
    const selected = control.dataset.heroGame === nextGame;
    control.setAttribute('aria-pressed', String(selected));
    control.classList.toggle('active', selected && control.closest('.hero-switcher'));
    control.classList.toggle('is-primary', selected && control.closest('.lobby-mode-rail'));
  });
  const status = document.querySelector('[data-hero-status]');
  if (status) status.textContent = `当前展示${nextGame === 'mahjong' ? '麻将' : '斗地主'}`;
}

function switchHero(nextGame, direction = 'next') {
  const normalized = nextGame === 'mahjong' ? 'mahjong' : 'ddz';
  if (state.view !== 'lobby') return;
  const previous = state.heroGame === 'mahjong' ? 'mahjong' : 'ddz';
  if (normalized === previous) return;
  const carousel = document.querySelector('[data-hero-carousel]');
  const stages = [...(carousel?.querySelectorAll('.lobby-game-stage') || [])];
  const current = carousel?.querySelector(`[data-hero-stage="${previous}"]`);
  const next = carousel?.querySelector(`[data-hero-stage="${normalized}"]`);
  state.heroGame = normalized;
  localStorage.setItem(HERO_GAME_KEY, normalized);
  updateHeroControls(normalized);
  if (!current || !next) { render(); return; }
  if (heroTransitionTimer) {
    clearTimeout(heroTransitionTimer);
    heroTransitionTimer = null;
  }

  const transitionClasses = ['is-active','is-preparing','is-from-left','is-from-right','is-leaving-left','is-leaving-right'];
  stages.forEach((stage) => {
    stage.classList.remove(...transitionClasses);
    stage.setAttribute('aria-hidden', 'true');
    stage.setAttribute('inert', '');
  });

  const reducedMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  next.removeAttribute('inert');
  next.setAttribute('aria-hidden', 'false');
  if (reducedMotion) {
    next.classList.add('is-active');
    return;
  }

  const reverse = direction === 'previous';
  current.classList.add('is-active');
  current.setAttribute('aria-hidden', 'false');
  next.classList.add('is-preparing', reverse ? 'is-from-left' : 'is-from-right');
  void next.offsetWidth;
  current.classList.add(reverse ? 'is-leaving-right' : 'is-leaving-left');
  next.classList.add('is-active');
  next.classList.remove('is-preparing', 'is-from-left', 'is-from-right');
  heroTransitionTimer = setTimeout(() => {
    current.classList.remove('is-active', 'is-leaving-left', 'is-leaving-right');
    current.setAttribute('aria-hidden', 'true');
    current.setAttribute('inert', '');
    heroTransitionTimer = null;
  }, 460);
}

function openThreeCard() {
  stopGameSync();
  stopRoomSync();
  stopMahjongBotSequence();
  stopCasualTimers();
  state.casual = { kind: 'three', round: newThreeCardRound(), revealed: false, thinking: false };
  state.view = 'three';
}
function openMahjong() {
  stopGameSync();
  stopRoomSync();
  stopMahjongBotSequence();
  stopCasualTimers();
  const game = newMahjongGame();
  state.heroGame = 'mahjong';
  localStorage.setItem(HERO_GAME_KEY, 'mahjong');
  state.casual = { kind: 'mahjong', game, selectedTileId: null, confirmAction: null };
  state.view = 'mahjong';
}
function open1048() {
  stopGameSync();
  stopRoomSync();
  stopMahjongBotSequence();
  stopCasualTimers();
  const game = loadSaved1048Game() || new1048Game();
  state.casual = { kind: '1048', game };
  save1048Game(game);
  state.view = '1048';
}
function focus1048Interaction() {
  const target = document.querySelector('[data-1048-result]') || document.querySelector('[data-1048-board]');
  target?.focus({ preventScroll: true });
}
function perform1048Move(direction) {
  const game = state.casual?.game;
  if (state.view !== '1048' || !game || game.status !== 'playing') return;
  const next = move1048(game, direction);
  state.casual.game = next;
  save1048Game(next);
  render();
  focus1048Interaction();
}
function openSlots() {
  stopGameSync();
  stopRoomSync();
  stopMahjongBotSequence();
  stopCasualTimers();
  state.casual = { kind: 'slots', reels: ['7', 'KAI', '⚡'], last: null, spins: 0, spinning: false };
  state.view = 'slots';
}

async function refreshProfile(){ state.profile=(await api('/v1/me')).profile; }
async function loadHistoryData(){
  state.historyStatus='loading';
  state.historyError='';
  render();
  try {
    state.history=await api('/v1/history');
    state.historyStatus='ready';
  } catch (error) {
    state.historyStatus='error';
    state.historyError=error.message || '网络连接暂时不可用，请稍后重试。';
    throw error;
  }
}
function stopGameSync() {
  state.waitController?.abort();
  state.waitController=null;
}
function stopRoomSync() {
  state.roomWaitController?.abort();
  state.roomWaitController=null;
}
function startRoomSync() {
  stopRoomSync();
  if (state.view!=='room'||!state.room) return;
  const roomId=state.room.id;
  const controller=new AbortController();
  state.roomWaitController=controller;
  void (async()=>{
    let failureCount=0;
    while (!controller.signal.aborted&&state.view==='room'&&state.room?.id===roomId) {
      const version=Number(state.room.version)||0;
      try {
        const result=await api(`/v1/rooms/${roomId}/wait?version=${version}&timeoutMs=20000`,{signal:controller.signal});
        if (controller.signal.aborted||state.view!=='room'||state.room?.id!==roomId) return;
        state.room=result.room;
        if (result.room.gameId) {
          stopRoomSync();
          await loadGame(result.room.gameId,{animateDeal:true});
          return;
        }
        failureCount=0;
        if (result.changed) render();
      } catch (error) {
        if (controller.signal.aborted||error.name==='AbortError') return;
        if (isTerminalSyncError(error)) {
          state.error=`房间同步已停止：${error.message}`;
          toast(state.error);
          render();
          return;
        }
        failureCount+=1;
        await syncRetryDelay(controller.signal,failureCount);
      }
    }
  })();
}
function finishDeal(gameId) {
  if (state.dealingGameId!==gameId) return;
  state.dealingGameId=null;
  state.dealTimer=null;
  render();
}
function enterGame(nextGame, {animateDeal=false}={}) {
  stopMahjongBotSequence();
  stopRoomSync();
  if (state.dealTimer) clearTimeout(state.dealTimer);
  state.game=nextGame;
  state.view='game';
  state.selected.clear();
  state.exitConfirm=false;
  const reducedMotion=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  state.dealingGameId=animateDeal&&nextGame.phase==='bidding'&&!reducedMotion ? nextGame.id : null;
  state.dealTimer=state.dealingGameId ? setTimeout(()=>finishDeal(nextGame.id),DEAL_ANIMATION_MS) : null;
  startGameSync();
}
function startGameSync() {
  stopGameSync();
  if (state.view!=='game'||!state.game||state.game.phase==='finished') return;
  const gameId=state.game.id;
  const controller=new AbortController();
  state.waitController=controller;
  void (async()=>{
    let failureCount=0;
    while (!controller.signal.aborted&&state.view==='game'&&state.game?.id===gameId&&state.game.phase!=='finished') {
      const version=state.game.sequence;
      const timeoutMs=Math.max(1_000,Math.min(20_000,turnRemaining(state.game)*1_000+250));
      try {
        const result=await api(`/v1/games/${gameId}/wait?version=${version}&timeoutMs=${timeoutMs}`,{signal:controller.signal});
        if (controller.signal.aborted||state.game?.id!==gameId) return;
        if (result.game.sequence>=state.game.sequence) {
          if (result.game.sequence!==state.game.sequence) state.selected.clear();
          if (!acceptGame(result.game)) continue;
          if (result.game.phase==='finished') {
            try { await refreshProfile(); } catch { /* The verified settlement remains visible if profile refresh is temporarily unavailable. */ }
          }
          render();
        }
        failureCount=0;
      } catch (error) {
        if (controller.signal.aborted||error.name==='AbortError') return;
        if (isTerminalSyncError(error)) {
          state.error=`牌局同步已停止：${error.message}`;
          toast(state.error);
          render();
          return;
        }
        failureCount+=1;
        await syncRetryDelay(controller.signal,failureCount);
      }
    }
  })();
}
async function loadGame(id,{animateDeal=false}={}){ enterGame((await api(`/v1/games/${id}`)).game,{animateDeal}); render(); }
async function startQuickGame(){
  const activeGameId=state.game?.phase!=='finished' ? state.game?.id : null;
  let nextGame;
  try {
    nextGame=(await api('/v1/games/quick',{method:'POST',body:'{}'})).game;
  } catch (error) {
    if (error.code !== 'RELIEF_REQUIRED') throw error;
    const relief=await api('/v1/relief',{method:'POST',body:'{}'});
    state.profile=relief.profile;
    nextGame=(await api('/v1/games/quick',{method:'POST',body:'{}'})).game;
    toast('已领取免费竞技分补给');
  }
  enterGame(nextGame,{animateDeal:nextGame.id!==activeGameId});
}
async function act(fn){ if(state.busy)return; state.busy=true;render();try{await fn(); state.error='';}catch(e){toast(e.message);}finally{state.busy=false;render();} }

function scrollWorldCarousel(direction) {
  const strip=document.querySelector('[data-world-strip]');
  const card=strip?.querySelector('.game-world');
  if(!strip||!card)return;
  const gap=Number.parseFloat(globalThis.getComputedStyle?.(strip).columnGap||'0')||16;
  const step=card.getBoundingClientRect().width+gap;
  const reduceMotion=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  strip.scrollBy({left:direction*step,behavior:reduceMotion?'auto':'smooth'});
}

app.addEventListener('click', e => {
  const el=e.target.closest('button'); if(!el)return;
  if(el.dataset.card){
    const id=el.dataset.card;
    const previousScroll=el.closest('.hand')?.scrollLeft || 0;
    state.selected.has(id)?state.selected.delete(id):state.selected.add(id);
    render();
    const nextHand=document.querySelector('.hand-dock .hand');
    if(nextHand) nextHand.scrollLeft=previousScroll;
    [...document.querySelectorAll('[data-card]')].find((control)=>control.dataset.card===id)?.focus({preventScroll:true});
    return;
  }
  if(el.dataset.mahjongTile){
    const game=state.casual?.game;
    if(state.view==='mahjong'&&game?.phase==='playing'&&game.currentSeat===0&&game.hands[0].length===14){
      const previousScroll=el.closest('.match-player-hand')?.scrollLeft || 0;
      const tileId=el.dataset.mahjongTile;
      state.casual.selectedTileId=state.casual.selectedTileId===el.dataset.mahjongTile?null:el.dataset.mahjongTile;
      render();
      const nextHand=document.querySelector('.match-player-hand');
      if(nextHand) nextHand.scrollLeft=previousScroll;
      [...document.querySelectorAll('[data-mahjong-tile]')].find((control)=>control.dataset.mahjongTile===tileId)?.focus({preventScroll:true});
    }
    return;
  }
  if(el.dataset.view){
    state.view=el.dataset.view;
    stopMahjongBotSequence();
    if(state.view!=='game') stopGameSync();
    if(state.view!=='room') stopRoomSync();
    if(state.view==='history') act(loadHistoryData); else render();
    return;
  }
  if(el.dataset.bid!==undefined) act(async()=>{const current=state.game;const body={score:Number(el.dataset.bid),expectedSequence:current.sequence};const r=await api(`/v1/games/${current.id}/bid`,{method:'POST',body:JSON.stringify(body),headers:{'x-request-id':requestId()}});acceptGame(r.game,r.profile);});
  const a=el.dataset.action;
  if(a==='hero-select'){switchHero(el.dataset.heroGame,el.dataset.heroGame==='ddz'?'previous':'next');return;}
  if(a==='world-prev'){scrollWorldCarousel(-1);return;}
  if(a==='world-next'){scrollWorldCarousel(1);return;}
  if(a==='clear-selection'){state.selected.clear();render();return;}
  if(a==='quick') act(startQuickGame);
  if(a==='open-three'){openThreeCard();render();}
  if(a==='open-mahjong'){openMahjong();render();globalThis.scrollTo?.(0,0);}
  if(a==='open-1048'){open1048();render();globalThis.scrollTo?.(0,0);focus1048Interaction();}
  if(a==='open-slots'){openSlots();render();}
  if(a==='casual-home'){
    if(state.view==='mahjong'&&state.casual?.game?.phase==='playing'){
      stopMahjongBotSequence();state.casual.confirmAction='home';render();return;
    }
    stopMahjongBotSequence();stopCasualTimers();state.casual=null;state.view='lobby';render();return;
  }
  if(a==='three-new'){stopCasualTimers();state.casual={kind:'three',round:newThreeCardRound(),revealed:false,thinking:false};render();}
  if(a==='three-reveal'&&state.view==='three'&&!state.casual?.thinking&&!state.casual?.revealed){
    const casual=state.casual;
    casual.thinking=true;
    render();
    threeRevealTimer=setTimeout(()=>{
      threeRevealTimer=null;
      if(state.view!=='three'||state.casual!==casual)return;
      casual.thinking=false;casual.revealed=true;render();
    },1_400);
  }
  if(a==='mahjong-new'){
    if(state.casual?.game?.phase==='playing'){stopMahjongBotSequence();state.casual.confirmAction='new';render();return;}
    const game=newMahjongGame();state.casual={kind:'mahjong',game,selectedTileId:null,confirmAction:null};render();return;
  }
  if(a==='mahjong-cancel-confirm'){state.casual.confirmAction=null;render();queueMahjongBotTurn();return;}
  if(a==='mahjong-confirm'){
    const nextAction=state.casual?.confirmAction;stopMahjongBotSequence();
    if(nextAction==='home'){state.casual=null;state.view='lobby';render();return;}
    if(nextAction==='new'){const game=newMahjongGame();state.casual={kind:'mahjong',game,selectedTileId:null,confirmAction:null};render();return;}
  }
  if(a==='mahjong-discard'&&state.view==='mahjong'){
    const game=state.casual?.game;const tileId=state.casual?.selectedTileId;
    if(!game||!tileId||game.phase!=='playing'||game.currentSeat!==0)return;
    try{state.casual.game=playMahjongDiscard(game,tileId,{advanceBots:false});state.casual.selectedTileId=null;}catch(error){toast(error.message);}render();queueMahjongBotTurn();return;
  }
  if(a==='1048-move'){perform1048Move(el.dataset.mergeDirection);return;}
  if(a==='1048-new'){const game=new1048Game();state.casual={kind:'1048',game};save1048Game(game);state.view='1048';render();focus1048Interaction();return;}
  if(a==='1048-continue'){
    const game=state.casual?.game;
    if(state.view==='1048'&&game?.status==='won'){
      state.casual.game={...game,status:canMove1048(game.board)?'playing':'over',continued:true};save1048Game(state.casual.game);render();focus1048Interaction();
    }
    return;
  }
  if(a==='slots-spin'&&state.view==='slots'&&!state.casual?.spinning){
    const casual=state.casual;
    casual.spinning=true;casual.last=null;render();
    slotSpinTimer=setTimeout(()=>{
      slotSpinTimer=null;
      if(state.view!=='slots'||state.casual!==casual)return;
      const next=spinSlots();casual.reels=next.reels;casual.last=next;casual.spins+=1;casual.spinning=false;render();
    },850);
  }
  if(a==='retry-history') act(loadHistoryData);
  if(a==='resume') act(async()=>{const r=await api('/v1/resume');if(r.game){enterGame(r.game);}else if(r.room){state.room=r.room;state.roomExitConfirm=false;state.view='room';startRoomSync();}else toast('没有待恢复的牌局');});
  if(a==='create-room') act(async()=>{state.room=(await api('/v1/rooms',{method:'POST',body:'{}'})).room;state.roomExitConfirm=false;state.view='room';startRoomSync();});
  if(a==='join-room') act(async()=>{const code=document.querySelector('#room-code')?.value.trim();if(!/^\d{6}$/.test(code))throw new Error('请输入 6 位房号');state.room=(await api('/v1/rooms/join',{method:'POST',body:JSON.stringify({code})})).room;state.roomExitConfirm=false;state.view='room';startRoomSync();});
  if(a==='copy-room') {
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(state.room.code).then(()=>toast('房号已复制')).catch(()=>toast(`房号：${state.room.code}`));
    else toast(`房号：${state.room.code}`);
  }
  if(a==='open-room-exit'){state.roomExitConfirm=true;render();return;}
  if(a==='cancel-room-exit'){state.roomExitConfirm=false;render();return;}
  if(a==='refresh-room') act(async()=>{state.room=(await api(`/v1/rooms/${state.room.id}`)).room;if(state.room.gameId)await loadGame(state.room.gameId,{animateDeal:true});else startRoomSync();});
  if(a==='retry-sync') act(async()=>{
    if(state.view==='room'&&state.room){state.room=(await api(`/v1/rooms/${state.room.id}`)).room;if(state.room.gameId)await loadGame(state.room.gameId,{animateDeal:true});else startRoomSync();return;}
    if(state.view==='game'&&state.game){const currentId=state.game.id;const next=(await api(`/v1/games/${currentId}`)).game;if(state.game?.id===currentId){state.game=next;startGameSync();}}
  });
  if(a==='start-room') act(async()=>{const r=await api(`/v1/rooms/${state.room.id}/start`,{method:'POST',body:'{}'});state.room=r.room;enterGame(r.game,{animateDeal:true});});
  if(a==='leave-room') act(async()=>{const roomId=state.room.id;stopRoomSync();try{await api(`/v1/rooms/${roomId}/leave`,{method:'POST',body:'{}'});}catch(error){startRoomSync();throw error;}state.room=null;state.roomExitConfirm=false;state.view='lobby';});
  if(a==='pass') act(async()=>{const current=state.game;const r=await api(`/v1/games/${current.id}/pass`,{method:'POST',body:JSON.stringify({expectedSequence:current.sequence}),headers:{'x-request-id':requestId()}});acceptGame(r.game,r.profile);state.selected.clear();});
  if(a==='play') act(async()=>{if(!state.selected.size)throw new Error('请先选择要出的牌');const current=state.game;const r=await api(`/v1/games/${current.id}/play`,{method:'POST',body:JSON.stringify({cardIds:[...state.selected],expectedSequence:current.sequence}),headers:{'x-request-id':requestId()}});acceptGame(r.game,r.profile);state.selected.clear();});
  if(a==='rematch') act(async()=>{stopGameSync();await refreshProfile();await startQuickGame();});
  if(a==='finish') act(async()=>{stopGameSync();await refreshProfile();state.game=null;state.view='lobby';});
  if(a==='open-exit'){state.exitConfirm=true;render();}
  if(a==='cancel-exit'){state.exitConfirm=false;render();}
  if(a==='confirm-exit') act(async()=>{const current=state.game;const r=await api(`/v1/games/${current.id}/abandon`,{method:'POST',body:'{}'});stopGameSync();acceptGame(r.game,r.profile);state.exitConfirm=false;state.view='game';});
  if(a?.startsWith('preview-')) {
    const messages = {
      'preview-xiangqi':'KAI 象棋正在设计中，当前页面只展示产品方向。',
      'preview-three':'三张竞技尚未开放，不包含现金下注或可提现筹码。',
      'preview-ai':'AI 挑战场即将开放，当前不会产生任何费用。',
      'preview-cloudpay':'该服务即将接入 CloudPay，目前没有支付或扣除卡时。'
    };
    toast(messages[a] || '该能力即将开放');
  }
});

app.addEventListener('pointerdown', (event) => {
  const mergeBoard = event.target.closest?.('[data-1048-board]');
  if (mergeBoard && state.view === '1048') {
    merge1048Pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
    mergeBoard.setPointerCapture?.(event.pointerId);
    return;
  }
  const carousel = event.target.closest?.('[data-hero-carousel]');
  if (!carousel || event.target.closest?.('button, input, a')) return;
  heroPointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
  carousel.setPointerCapture?.(event.pointerId);
});

app.addEventListener('pointerup', (event) => {
  if (merge1048Pointer && merge1048Pointer.id === event.pointerId) {
    const deltaX = event.clientX - merge1048Pointer.x;
    const deltaY = event.clientY - merge1048Pointer.y;
    merge1048Pointer = null;
    const horizontal = Math.abs(deltaX) >= Math.abs(deltaY) * 1.2;
    const distance = horizontal ? Math.abs(deltaX) : Math.abs(deltaY);
    if (distance >= 28) perform1048Move(horizontal ? (deltaX < 0 ? 'left' : 'right') : (deltaY < 0 ? 'up' : 'down'));
    return;
  }
  if (!heroPointer || heroPointer.id !== event.pointerId) return;
  const deltaX = event.clientX - heroPointer.x;
  const deltaY = event.clientY - heroPointer.y;
  heroPointer = null;
  if (Math.abs(deltaX) < 42 || Math.abs(deltaX) < Math.abs(deltaY) * 1.15) return;
  const nextGame = state.heroGame === 'ddz' ? 'mahjong' : 'ddz';
  switchHero(nextGame, deltaX < 0 ? 'next' : 'previous');
});

app.addEventListener('pointercancel', () => { heroPointer = null; merge1048Pointer = null; });

app.addEventListener('keydown', (event) => {
  if (state.view === '1048' && event.target.closest?.('[data-1048-board]')) {
    const direction = ({ ArrowLeft:'left', a:'left', A:'left', ArrowRight:'right', d:'right', D:'right', ArrowUp:'up', w:'up', W:'up', ArrowDown:'down', s:'down', S:'down' })[event.key];
    if (direction) {
      event.preventDefault();
      perform1048Move(direction);
      return;
    }
  }
  const worldStrip = event.target.closest?.('[data-world-strip]');
  if (worldStrip && event.target === worldStrip && ['ArrowLeft','ArrowRight'].includes(event.key)) {
    event.preventDefault();
    scrollWorldCarousel(event.key === 'ArrowLeft' ? -1 : 1);
    return;
  }
  const carousel = event.target.closest?.('[data-hero-carousel]');
  if (!carousel || event.target !== carousel || !['ArrowLeft','ArrowRight'].includes(event.key)) return;
  event.preventDefault();
  const nextGame = state.heroGame === 'ddz' ? 'mahjong' : 'ddz';
  switchHero(nextGame, event.key === 'ArrowLeft' ? 'previous' : 'next');
});

bootstrap();
setInterval(() => {
  updateTurnClock();
}, 1000);
