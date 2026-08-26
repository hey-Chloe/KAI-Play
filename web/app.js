import { compareThreeCard, evaluateThreeCard, isWinningMahjong, newMahjongRound, newThreeCardRound, sortMahjong, spinSlots } from './casual-games.js';

const API = '/api';
const app = document.querySelector('#app');
const toastNode = document.querySelector('#toast');
const LEGACY_TOKEN_KEY = 'doujoy.web.token';
const TOKEN_KEY = 'kai.play.token';
const TURN_TIMEOUT_MS = 45_000;
const DEAL_ANIMATION_MS = 3_750;
const state = { token: localStorage.getItem(TOKEN_KEY) || localStorage.getItem(LEGACY_TOKEN_KEY), profile: null, view: 'lobby', game: null, room: null, history: null, selected: new Set(), busy: false, error: '', dealingGameId: null, dealTimer: null, waitController: null, exitConfirm: false, casual: null };

const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const money = value => new Intl.NumberFormat('zh-CN').format(value || 0);
const rank = n => ({3:'3',4:'4',5:'5',6:'6',7:'7',8:'8',9:'9',10:'10',11:'J',12:'Q',13:'K',14:'A',15:'2',16:'小王',17:'大王'}[n] || n);
const suit = s => ({spade:'♠',heart:'♥',club:'♣',diamond:'♦',joker:'★'}[s] || '');
const isRed = c => c.suit === 'heart' || c.suit === 'diamond';
const toast = msg => { toastNode.textContent = msg; toastNode.classList.add('show'); setTimeout(() => toastNode.classList.remove('show'), 2200); };
const requestId = () => globalThis.crypto?.randomUUID?.() || `web-${Date.now()}-${Math.random().toString(16).slice(2)}`;

async function api(path, options = {}) {
  const res = await fetch(`${API}${path}`, { ...options, headers: { 'content-type':'application/json', ...(state.token ? {'x-doujoy-token':state.token} : {}), ...options.headers } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.ok) {
    const error = new Error(body?.error?.message || `请求失败（${res.status}）`);
    error.code = body?.error?.code || 'REQUEST_FAILED';
    throw error;
  }
  return body;
}

async function bootstrap() {
  try {
    if (state.token) {
      try { state.profile = (await api('/v1/me')).profile; }
      catch { state.token = null; localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(LEGACY_TOKEN_KEY); }
    }
    if (!state.token) {
      const session = await api('/v1/sessions/guest', {method:'POST', body:'{}'});
      state.token = session.token; state.profile = session.profile;
      localStorage.setItem(TOKEN_KEY, state.token);
    }
    const resumed = await api('/v1/resume');
    if (resumed.game) enterGame(resumed.game);
    else if (resumed.room) { state.room = resumed.room; state.view = 'room'; }
  } catch (e) { state.error = `无法连接后端：${e.message}`; }
  render();
}

function header(mode = 'default') {
  const name = state.profile?.name || '正在登录';
  const lobbyMode = mode === 'lobby';
  return `<header class="topbar ${lobbyMode?'topbar-lobby':''}"><button class="brand brand-button brand-wordmark" data-wordmark data-view="lobby" aria-label="返回 KAI PLAY 大厅"><div class="logo"><span></span>K</div><span class="wordmark"><b>KAI</b><em>PLAY</em>${lobbyMode?'':'<small>牌桌游乐场</small>'}</span></button><div class="top-actions">${lobbyMode?'':`<div class="player-chip"><span class="player-avatar">${esc(name.slice(0,1))}</span><span><b>${esc(name)}</b><small>${tierName(state.profile)}</small></span></div>`}<div class="score-pill"><small>竞技分</small><strong>${money(competitiveScore(state.profile))}</strong></div></div></header>`;
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
  return `<div class="shell lobby-shell lobby-v4">${header('lobby')}${state.error ? `<div class="banner">${esc(state.error)}　游戏服务暂时离线，请稍后刷新。</div>`:''}
    <main class="live-lobby">
      <section class="live-table live-table-preview lobby-hero-v4" aria-labelledby="live-table-title">
        ${tableFrame('preview')}
        <div class="live-table-seat live-seat-left"><span>A</span><b>智能牌友 A</b><small>开局后补位</small></div>
        <div class="live-table-seat live-seat-right"><span>B</span><b>智能牌友 B</b><small>开局后补位</small></div>
        <div class="live-table-center"><small>三人斗地主 · 牌桌预览</small><h1 id="live-table-title">还差你</h1><div class="lobby-card-scene" aria-hidden="true">${cardBack(true,'live-card-back')}${previewPoker(10,'spade')}${previewPoker(11,'spade')}${previewPoker(12,'heart')}${previewPoker(13,'club')}</div></div>
        <div class="live-table-seat live-seat-you"><span>${esc((p.name || '你').slice(0,1))}</span><b>${esc(p.name || '你')}</b><small>你的座位</small></div>
        <div class="live-join-bar"><button class="btn primary" data-action="quick" aria-label="直接入桌，创建斗地主牌局">直接入桌 <b>→</b></button><span class="sr-only">点击后创建真实牌局，智能牌友自动补位，服务端统一判定。</span></div>
      </section>
      <nav class="lobby-mode-rail" aria-label="大厅玩法入口"><button class="mode-entry is-primary" data-action="quick"><b>斗地主</b><small>快速入桌</small></button><button class="mode-entry" data-action="create-room"><b>好友房</b><small>创建房间</small></button><button class="mode-entry" disabled aria-label="每日残局，筹备中"><b>每日残局</b><small>筹备中</small></button></nav>
      <section class="lobby-shortcuts" aria-label="大厅快捷入口">
        <article class="room-panel"><div><span>房间码</span><h2>加入好友桌</h2></div><div class="room-actions"><div class="friend-row"><label for="room-code">六位房号</label><input class="input" id="room-code" maxlength="6" inputmode="numeric" aria-label="六位房号" placeholder="输入 6 位房号"><button class="btn" data-action="join-room">加入</button></div></div></article>
        <article class="history-summary"><div><span>我的记录</span><h2>${tierName(p)}</h2><p>${Number(p.games) || 0} 局已保存 · 胜率 ${winRatePercent(p)}%</p></div><div><strong>${money(competitiveScore(p))}</strong><small>竞技分</small><button class="text-link" data-view="history">查看战绩 →</button></div></article>
      </section>
      <section class="section-block" id="game-selection"><div class="section-head"><div><span class="section-kicker">游戏世界</span><h2>换一种节奏</h2></div><button class="text-link" data-action="scroll-games">全部玩法</button></div>
        <div class="world-strip">
          <article class="game-world world-ddz"><div><span>服务端三人桌</span><h3>斗地主</h3><p>争分、出牌、结算，完成一局会写入战绩。</p><button class="btn primary" data-action="quick">快速开局</button></div><div class="world-ddz-hand" aria-hidden="true">${previewPoker(10,'spade')}${previewPoker(11,'heart')}${previewPoker(12,'club')}${previewPoker(13,'diamond')}${previewPoker(14,'spade')}</div></article>
          <article class="game-world world-three"><div class="world-three-cards" aria-hidden="true">${cardBack(true)}${cardBack(true)}${cardBack(true)}</div><div><span>三张定胜负</span><h3>炸金花训练</h3><p>免费单机比牌，不计竞技分。</p><button class="btn" data-action="open-three">翻开这一手</button></div></article>
          <article class="game-world world-mahjong"><div><span>摸一张 · 打一张</span><h3>麻将练习</h3><p>136 张基础牌墙与胡牌结构检测。</p><button class="btn" data-action="open-mahjong">进入练习场</button></div><div class="world-mahjong-tiles" aria-hidden="true"><i>一<small>万</small></i><i>三<small>条</small></i><i>●<small>筒</small></i><i>發</i></div></article>
          <article class="game-world world-reels"><div><span>大厅彩蛋</span><h3>算力转轮</h3><p>免费娱乐 · 无现金下注 · 无提现。</p></div><button class="btn" data-action="open-slots" aria-label="打开算力转轮"><span aria-hidden="true">7 · KAI · ⚡</span> 试转一次</button></article>
        </div>
      </section>
      <article class="daily-table"><div><span>每日残局</span><h2>残局题库正在准备</h2><p>当前版本尚未接入每日题目与评估。</p></div><button class="btn" disabled>筹备中</button></article>
    </main>${nav('lobby')}</div>`;
}

function nav(active) { return `<nav class="nav"><button class="btn ${active==='lobby'?'active':''}" data-view="lobby">游戏</button><button class="btn ${active==='history'?'active':''}" data-view="history">战绩</button><button class="btn ${active==='rules'?'active':''}" data-view="rules">规则</button></nav>`; }

function room() {
  const r = state.room;
  if (!r) return lobby();
  const seats = [0,1,2].map(i => { const m=r.members[i]; return m ? `<div class="seat"><div class="avatar">${esc(m.name.slice(0,1))}</div><b>${esc(m.name)}${m.isYou?'（我）':''}</b><p class="muted">${m.id===r.hostId?'房主':'已加入'}</p></div>` : `<div class="seat empty"><div class="avatar">＋</div><b>等待加入</b><p>分享房号邀请好友</p></div>`; }).join('');
  return `<div class="shell">${header()}<div class="page-head"><button class="btn ghost" data-action="leave-room">← 退出</button><h1>斗地主 · 好友同桌</h1><button class="btn" data-action="refresh-room">刷新</button></div><section class="card"><p class="muted" style="text-align:center">邀请房号</p><div class="room-code">${esc(r.code)}</div><div class="actions" style="justify-content:center"><button class="btn gold" data-action="copy-room">复制房号</button></div><div class="seats" style="margin-top:24px">${seats}</div><div class="actions" style="justify-content:center;margin-top:24px">${r.isHost?`<button class="btn primary" data-action="start-room">${r.members.length===3?'三人开始':'智能牌友补位'}</button>`:'<span class="muted">等待房主开始游戏…</span>'}</div></section></div>`;
}

function poker(c, selectable = true, decorative = false) {
  const rawLabel = rank(c.rank);
  const symbol = suit(c.suit);
  const joker = c.suit === 'joker';
  const bigJoker = joker && c.rank === 17;
  const classes = ['poker-face', isRed(c)?'red':'', joker?'joker-card':'', joker?(bigJoker?'joker-red':'joker-gray'):'', decorative?'is-decorative':''].filter(Boolean).join(' ');
  const content = joker
    ? `<span class="joker-index">${bigJoker?'大王':'小王'}</span><i class="joker-face"><em>${bigJoker?'RED':'GREY'}</em><b>JOKER</b><strong>K</strong></i><span class="card-signature">KAI</span>`
    : `<span class="card-index"><b>${rawLabel}</b><small>${symbol}</small></span>${[11,12,13].includes(c.rank)
      ? `<i class="card-court face-${String(rawLabel).toLowerCase()}"><em>${rawLabel}</em><b>${symbol}</b><strong>KAI</strong></i>`
      : `<i class="card-pip"><b>${symbol}</b><small>${rawLabel}</small></i>`}<span class="card-signature">KAI</span>`;
  const aria = joker ? `${bigJoker?'大王':'小王'} ${bigJoker?'红色':'灰色'} JOKER` : `${rawLabel}${symbol}`;
  if (!selectable) return decorative
    ? `<span class="poker ${classes}" aria-hidden="true">${content}</span>`
    : `<span class="poker ${classes}" role="img" aria-label="${esc(aria)}">${content}</span>`;
  return `<button class="poker ${classes} ${state.selected.has(c.id)?'selected':''}" data-card="${esc(c.id)}" aria-label="${esc(aria)}">${content}</button>`;
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

function dealSequence() {
  const flights = Array.from({length: 51}, (_, index) => `<i class="deal-card kai-card-back deal-seat-${index % 3}" style="--deal-index:${index}" aria-hidden="true"></i>`).join('');
  const target = (position, label) => `<div class="deal-target ${position}" aria-hidden="true"><span><i class="kai-card-back"></i><i class="kai-card-back"></i><i class="kai-card-back"></i></span><b>${label}</b><small>17 张</small></div>`;
  return `<div class="deal-sequence" role="status" aria-live="polite" aria-label="开局发牌中，每位玩家十七张，预留三张增补牌">
    <div class="deal-copy"><span>开局发牌</span><b>正在依次发给三位玩家</b><small>每人 17 张 · 预留 3 张增补牌</small><ol><li>准备牌组</li><li>安全发牌</li><li>牌局锁定</li></ol></div>
    ${target('target-left','左侧牌友')}${target('target-right','右侧牌友')}${target('target-bottom','你的手牌')}
    <div class="deal-deck" aria-hidden="true"><i class="kai-card-back"></i><i class="kai-card-back"></i><i class="kai-card-back"></i><b>3</b><small>增补牌</small></div>${flights}
  </div>`;
}

function turnFeedback(g, canAct) {
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
  return `<div class="turn-feedback ${canAct?'is-mine':'is-waiting'} ${botTurn?'is-bot':''} ${urgent?'is-urgent':''}" role="timer" aria-live="${urgent?'polite':'off'}" aria-label="${esc(title)}，${remaining > 0 ? `剩余 ${remaining} 秒` : detail}">
    <div class="turn-timer" style="--turn-progress:${progress}deg"><strong>${remaining || '··'}</strong><small>${remaining ? '秒' : '托管'}</small></div>
    <div class="turn-copy"><b>${esc(title)}${botTurn?'<span class="thinking-dots"><i></i><i></i><i></i></span>':''}</b><small>${detail}</small></div>
  </div>`;
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
    <div class="result-actions"><button class="btn primary" data-action="rematch">再来一局 <b>→</b></button><button class="btn" data-action="finish">返回大厅</button></div>
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
  const disabled=canAct?'':'disabled';
  const actions=g.phase==='bidding'
    ? [0,1,2,3].map(n=>`<button class="btn table-action ${n===3?'gold':''}" data-bid="${n}" ${canAct&&(n===0||n>Number(g.highestBid||0))?'':'disabled'}>${n===0?'让先':n+' 档'}</button>`).join('')
    : `<button class="btn table-action ghost" data-action="pass" ${canAct&&g.leadCombination?'':'disabled'}>不出</button><button class="btn table-action primary" data-action="play" ${disabled}>出牌</button>`;
  const currentPlayer=g.players.find(p=>p.seat===g.currentSeat);
  const currentMultiplier=Math.max(1,Number(g.highestBid)||1)*(2**Number(g.bombs||0));
  const handInteractive=canAct&&g.phase==='playing';
  const turnText = isDealing?'正在依次发牌':g.phase==='finished'?'本局已结束':viewerTurn?(g.phase==='bidding'?'轮到你选择争分':'轮到你出牌'):`${currentPlayer?.name||'牌友'}正在思考`;
  const exitDialog=state.exitConfirm?`<div class="exit-shade"><section class="exit-dialog" role="dialog" aria-modal="true" aria-labelledby="exit-title"><span>结束本局</span><h2 id="exit-title">确定不打了吗？</h2><p>退出会按本局负场结算；好友局也会同时结束。你可以留下继续完成这一局。</p><div><button class="btn" data-action="cancel-exit">继续本局</button><button class="btn danger" data-action="confirm-exit">认输并退出</button></div></section></div>`:'';
  return `<div class="shell table route-game"><header class="game-top"><div class="game-branding"><div class="brand compact"><div class="logo"><span></span>K</div><div>KAI PLAY<small>斗地主</small></div></div></div><div class="round-state"><span>${turnText}</span><b>基础分 ${g.baseStake} · 明示倍数 ${currentMultiplier}</b></div><div class="score-pill compact-score"><small>竞技分</small><strong>${money(competitiveScore(state.profile))}</strong></div></header><section class="landscape-table ddz-table ${isDealing?'is-dealing':''}">${tableFrame('game')}<button class="table-exit table-exit-float" data-action="open-exit" aria-label="退出当前牌局">← 退出</button><div class="table-score"><b>基础分 ${g.baseStake}</b><span>明示倍数 ${currentMultiplier}</span></div>${playerPod(rivals[0]||viewer,'opponent-top')}${playerPod(rivals[1]||viewer,'opponent-left')}${playerPod(viewer,'viewer-pod')}${g.bottomCards?.length?`<div class="bottom-reveal"><small>增补牌</small>${g.bottomCards.map(c=>poker(c,false)).join('')}</div>`:''}<div class="play-zone"><div class="play-cards">${lead}</div>${actionTrail(g)}</div><div class="center-controls" ${isDealing?'aria-hidden="true"':''}>${turnFeedback(g,viewerTurn)}<div class="game-actions">${actions}</div></div><footer class="hand-dock" ${isDealing?'aria-hidden="true"':''}><div class="hand" style="--hand-count:${g.hand.length}">${g.hand.map(c=>poker(c,handInteractive)).join('')}</div><p>${handInteractive?'点击手牌选择 · 再点击出牌':'等待轮次 · 规则由服务端统一判定'}</p></footer>${isDealing?dealSequence():''}</section>${exitDialog}</div>`;
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
  const seats = round.players.slice(1).map((player) => `<article class="three-opponent"><div class="training-avatar">${esc(player.name.slice(0,1))}</div><b>${esc(player.name)}</b><div class="three-hand">${revealed ? player.hand.map((card) => poker(card,false)).join('') : player.hand.map(() => cardBack(false)).join('')}</div>${revealed?`<span>${esc(evaluateThreeCard(player.hand).label)}</span>`:'<span>等待比牌</span>'}</article>`).join('');
  return `<div class="shell casual-shell">${casualHeader('炸金花','THREE CARD','免费训练 · 不计竞技分')}<section class="casual-stage three-stage">${result}<div class="three-how"><span>1 看自己的三张牌</span><i>→</i><span>2 点击翻开并比牌</span><i>→</i><span>3 最大牌型获胜</span></div><div class="three-opponents">${seats}</div><div class="three-center"><span>本局免费</span><b>${state.casual.thinking?'两位牌友正在思考…':revealed?'三家牌面已揭晓':'三张牌，一次定胜负'}</b><small>无筹码 · 无下注</small></div><article class="three-player"><div class="training-avatar">你</div><div><b>你的手牌</b><span>${esc(evaluateThreeCard(round.players[0].hand).label)}</span></div><div class="three-hand">${round.players[0].hand.map((card) => poker(card,false)).join('')}</div></article><div class="casual-actions"><button class="btn primary" data-action="three-reveal" ${state.casual.thinking||revealed?'disabled':''}>${state.casual.thinking?'牌友思考中…':'翻开并比牌'}</button><button class="btn" data-action="three-new">换一手牌</button></div></section><p class="casual-disclaimer">牌型顺序：豹子 ＞ 顺金 ＞ 金花 ＞ 顺子 ＞ 对子 ＞ 高牌。当前为单机训练，不使用现金、Token 或卡时。</p></div>`;
}

function mahjongTile(tile) {
  const selected = state.casual?.selectedTileId === tile.id;
  const tone = tile.suit === '万' ? 'wan' : tile.suit === '筒' ? 'tong' : tile.suit === '条' ? 'tiao' : 'honor';
  return `<button class="mahjong-tile ${tone} ${selected?'selected':''} ${state.casual?.round.drawnId===tile.id?'drawn':''}" data-mahjong-tile="${esc(tile.id)}" aria-label="${esc(tile.label)}"><b>${esc(tile.suit==='字'?tile.label:tile.rank)}</b><small>${esc(tile.suit==='字'?'':tile.suit)}</small></button>`;
}

function mahjongGame() {
  const round = state.casual?.round;
  if (!round) return lobby();
  const canDraw = round.hand.length === 13 && round.wall.length > 0;
  const canDiscard = round.hand.length === 14;
  const notice = round.won ? '<div class="training-result win"><span>牌型完成</span><b>胡牌</b><small>四组面子加一对将</small></div>' : '';
  const wall = Array.from({length:Math.min(18,Math.ceil(round.wall.length/8))},()=>'<i></i>').join('');
  const turnHint = canDraw ? '轮到你摸牌' : state.casual.selectedTileId ? '点击“打出所选”' : '请选择一张牌';
  return `<div class="shell casual-shell">${casualHeader('麻将','MAHJONG LAB',`牌墙 ${round.wall.length} 张`)}<section class="casual-stage mahjong-stage">${notice}<div class="mahjong-wall wall-top" aria-hidden="true">${wall}</div><div class="mahjong-wall wall-left" aria-hidden="true">${wall}</div><div class="mahjong-wall wall-right" aria-hidden="true">${wall}</div><div class="mahjong-wall wall-bottom" aria-hidden="true">${wall}</div><div class="mahjong-counter"><small>牌墙剩余</small><b>${round.wall.length}</b><span>${turnHint}</span></div><div class="discard-river"><span>牌河</span><div>${round.discards.slice(-24).map((tile)=>`<i class="river-tile">${esc(tile.label)}</i>`).join('')||`<small>${canDraw?'第一步：点击下方“摸一张”':'第二步：确认高亮牌，再点击“打出所选”'}</small>`}</div></div><div class="mahjong-hand">${sortMahjong(round.hand).map(mahjongTile).join('')}</div><div class="casual-actions"><button class="btn primary" data-action="mahjong-draw" ${canDraw&&!round.won?'':'disabled'}>① 摸一张</button><button class="btn" data-action="mahjong-discard" ${canDiscard&&state.casual.selectedTileId&&!round.won?'':'disabled'}>② 打出所选</button><button class="btn" data-action="mahjong-new">重新开局</button></div></section><p class="casual-disclaimer">完整 136 张基础牌墙，练习摸打与常规胡牌结构；暂不包含吃碰杠、花牌和多人计番。</p></div>`;
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
  return `<div class="shell page-shell season-page">${header()}
    <section class="season-hero"><div class="season-rank"><span>我的赛季</span><h1>${tierName(profile)}</h1><p>当前记录周期 · 全部已保存对局</p></div><div class="score-overview"><small>竞技分</small><strong>${money(competitiveScore(profile))}</strong></div></section>
    <section class="season-metrics" aria-label="赛季战绩摘要"><div><strong>${totalGames}</strong><span>完成对局</span></div><div><strong>${totalGames?winRatePercent(profile):0}%</strong><span>总胜率</span></div><div><strong>${totalWins}</strong><span>累计胜局</span></div><div><strong>${currentWinStreak(matches)}</strong><span>当前连胜</span></div><div><strong>${bestWinStreak(matches)}</strong><span>近 ${matches.length || 0} 局最佳连胜</span></div></section>
    <section class="trend-strip"><div class="history-summary"><div><span>近期走势</span><h2>最近 ${trend.length} 局</h2></div><strong class="${recentDelta>=0?'positive':'negative'}">${recentDelta>=0?'+':''}${money(recentDelta)}<small> 分</small></strong></div><div class="trend-bars" aria-label="最近对局竞技分变化">${trendBars}</div></section>
    <section class="history-list"><div class="section-head"><div><span class="section-kicker">最近牌局</span><h2>${matches.length?'逐局记录':'等待第一场记录'}</h2></div><p>最多展示服务端返回的最近 20 局</p></div>${recentMatches}</section>
    ${nav('history')}</div>`;
}

function rules() { return `<div class="shell page-shell">${header()}<div class="section-head page-title"><div><span class="section-kicker">FAIR PLAY</span><h1>规则与公平</h1></div><p>免费竞技，结果透明</p></div><section class="card"><div class="rules"><div class="rule"><span>01</span><div><h3>竞技分不是支付资产</h3><p class="muted">竞技分只用于斗地主段位、匹配与战绩展示，不可购买、提现、转让或兑换。</p></div></div><div class="rule"><span>02</span><div><h3>45 秒思考与自动托管</h3><p class="muted">斗地主真人回合有 45 秒思考时间；智能牌友会分别思考后行动，倒计时结束由服务端托管。</p></div></div><div class="rule"><span>03</span><div><h3>系统自动发牌</h3><p class="muted">斗地主开局向三位玩家各发 17 张并预留 3 张增补牌；炸金花每轮独立发三张；麻将使用 136 张基础牌墙。</p></div></div><div class="rule"><span>04</span><div><h3>竞技与试玩分区</h3><p class="muted">斗地主由服务端判定并记录战绩；炸金花、麻将和算力转轮当前是免费训练场，不计竞技分。</p></div></div><div class="rule"><span>05</span><div><h3>卡时与输赢隔离</h3><p class="muted">KAI 卡时只用于明确的 AI 与云端服务，不作为牌桌筹码；试玩场也不支付、不下注、不发放可兑换奖励。</p></div></div></div></section>${nav('rules')}</div>`; }

function render() { app.innerHTML = state.view==='game'?game():state.view==='room'?room():state.view==='three'?threeCardGame():state.view==='mahjong'?mahjongGame():state.view==='slots'?slotsGame():state.view==='history'?history():state.view==='rules'?rules():lobby(); }

function openThreeCard() {
  stopGameSync();
  state.casual = { kind: 'three', round: newThreeCardRound(), revealed: false, thinking: false };
  state.view = 'three';
}
function openMahjong() {
  stopGameSync();
  state.casual = { kind: 'mahjong', round: newMahjongRound(), selectedTileId: null };
  state.view = 'mahjong';
}
function openSlots() {
  stopGameSync();
  state.casual = { kind: 'slots', reels: ['7', 'KAI', '⚡'], last: null, spins: 0, spinning: false };
  state.view = 'slots';
}

async function refreshProfile(){ state.profile=(await api('/v1/me')).profile; }
function stopGameSync() {
  state.waitController?.abort();
  state.waitController=null;
}
function finishDeal(gameId) {
  if (state.dealingGameId!==gameId) return;
  state.dealingGameId=null;
  state.dealTimer=null;
  render();
}
function enterGame(nextGame, {animateDeal=false}={}) {
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
    while (!controller.signal.aborted&&state.view==='game'&&state.game?.id===gameId&&state.game.phase!=='finished') {
      const version=state.game.sequence;
      const timeoutMs=Math.max(1_000,Math.min(20_000,turnRemaining(state.game)*1_000+250));
      try {
        const result=await api(`/v1/games/${gameId}/wait?version=${version}&timeoutMs=${timeoutMs}`,{signal:controller.signal});
        if (controller.signal.aborted||state.game?.id!==gameId) return;
        if (result.game.sequence>=state.game.sequence) {
          if (result.game.sequence!==state.game.sequence) state.selected.clear();
          state.game=result.game;
          if (result.game.phase==='finished') {
            try { await refreshProfile(); } catch { /* The verified settlement remains visible if profile refresh is temporarily unavailable. */ }
          }
          render();
        }
      } catch (error) {
        if (controller.signal.aborted||error.name==='AbortError') return;
        await new Promise(resolve=>setTimeout(resolve,1_500));
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
async function act(fn){ if(state.busy)return; state.busy=true; try{await fn(); state.error='';}catch(e){toast(e.message);}finally{state.busy=false;render();} }

app.addEventListener('click', e => {
  const el=e.target.closest('button'); if(!el)return;
  if(el.dataset.card){ const id=el.dataset.card; state.selected.has(id)?state.selected.delete(id):state.selected.add(id); render(); return; }
  if(el.dataset.mahjongTile){ if(state.view==='mahjong'&&state.casual?.round.hand.length===14){state.casual.selectedTileId=el.dataset.mahjongTile;render();} return; }
  if(el.dataset.view){ state.view=el.dataset.view; if(state.view!=='game') stopGameSync(); if(state.view==='history') act(async()=>{state.history=await api('/v1/history');}); else render(); return; }
  if(el.dataset.bid!==undefined) act(async()=>{const body={score:Number(el.dataset.bid),expectedSequence:state.game.sequence};const r=await api(`/v1/games/${state.game.id}/bid`,{method:'POST',body:JSON.stringify(body),headers:{'x-request-id':requestId()}});state.game=r.game;state.profile=r.profile;});
  const a=el.dataset.action;
  if(a==='quick') act(startQuickGame);
  if(a==='scroll-games') document.querySelector('#game-selection')?.scrollIntoView({behavior:'smooth',block:'start'});
  if(a==='open-three'){openThreeCard();render();}
  if(a==='open-mahjong'){openMahjong();render();}
  if(a==='open-slots'){openSlots();render();}
  if(a==='casual-home'){state.casual=null;state.view='lobby';render();}
  if(a==='three-new'){state.casual={kind:'three',round:newThreeCardRound(),revealed:false,thinking:false};render();}
  if(a==='three-reveal'&&state.view==='three'&&!state.casual?.thinking&&!state.casual?.revealed){
    state.casual.thinking=true;render();setTimeout(()=>{if(state.view!=='three'||!state.casual)return;state.casual.thinking=false;state.casual.revealed=true;render();},1_400);
  }
  if(a==='mahjong-new'){state.casual={kind:'mahjong',round:newMahjongRound(),selectedTileId:null};render();}
  if(a==='mahjong-draw'&&state.view==='mahjong'){
    const round=state.casual.round;
    if(round.hand.length!==13||!round.wall.length)return;
    const drawn=round.wall.shift();round.hand=sortMahjong([...round.hand,drawn]);round.drawnId=drawn.id;round.won=isWinningMahjong(round.hand);state.casual.selectedTileId=drawn.id;render();
  }
  if(a==='mahjong-discard'&&state.view==='mahjong'){
    const round=state.casual.round;const tile=round.hand.find(candidate=>candidate.id===state.casual.selectedTileId);
    if(!tile||round.hand.length!==14)return;
    round.hand=round.hand.filter(candidate=>candidate.id!==tile.id);round.discards.push(tile);round.drawnId=null;state.casual.selectedTileId=null;render();
  }
  if(a==='slots-spin'&&state.view==='slots'&&!state.casual?.spinning){
    state.casual.spinning=true;state.casual.last=null;render();
    setTimeout(()=>{if(state.view!=='slots'||!state.casual)return;const next=spinSlots();state.casual.reels=next.reels;state.casual.last=next;state.casual.spins+=1;state.casual.spinning=false;render();},850);
  }
  if(a==='resume') act(async()=>{const r=await api('/v1/resume');if(r.game){enterGame(r.game);}else if(r.room){state.room=r.room;state.view='room';}else toast('没有待恢复的牌局');});
  if(a==='create-room') act(async()=>{state.room=(await api('/v1/rooms',{method:'POST',body:'{}'})).room;state.view='room';});
  if(a==='join-room') act(async()=>{const code=document.querySelector('#room-code')?.value.trim();if(!/^\d{6}$/.test(code))throw new Error('请输入 6 位房号');state.room=(await api('/v1/rooms/join',{method:'POST',body:JSON.stringify({code})})).room;state.view='room';});
  if(a==='copy-room') {
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(state.room.code).then(()=>toast('房号已复制')).catch(()=>toast(`房号：${state.room.code}`));
    else toast(`房号：${state.room.code}`);
  }
  if(a==='refresh-room') act(async()=>{state.room=(await api(`/v1/rooms/${state.room.id}`)).room;if(state.room.gameId)await loadGame(state.room.gameId,{animateDeal:true});});
  if(a==='start-room') act(async()=>{const r=await api(`/v1/rooms/${state.room.id}/start`,{method:'POST',body:'{}'});state.room=r.room;enterGame(r.game,{animateDeal:true});});
  if(a==='leave-room') act(async()=>{await api(`/v1/rooms/${state.room.id}/leave`,{method:'POST',body:'{}'});state.room=null;state.view='lobby';});
  if(a==='pass') act(async()=>{const r=await api(`/v1/games/${state.game.id}/pass`,{method:'POST',body:JSON.stringify({expectedSequence:state.game.sequence}),headers:{'x-request-id':requestId()}});state.game=r.game;state.profile=r.profile;});
  if(a==='play') act(async()=>{if(!state.selected.size)throw new Error('请先选择要出的牌');const r=await api(`/v1/games/${state.game.id}/play`,{method:'POST',body:JSON.stringify({cardIds:[...state.selected],expectedSequence:state.game.sequence}),headers:{'x-request-id':requestId()}});state.game=r.game;state.profile=r.profile;state.selected.clear();});
  if(a==='rematch') act(async()=>{stopGameSync();await refreshProfile();await startQuickGame();});
  if(a==='finish') act(async()=>{stopGameSync();await refreshProfile();state.game=null;state.view='lobby';});
  if(a==='open-exit'){state.exitConfirm=true;render();}
  if(a==='cancel-exit'){state.exitConfirm=false;render();}
  if(a==='confirm-exit') act(async()=>{const r=await api(`/v1/games/${state.game.id}/abandon`,{method:'POST',body:'{}'});stopGameSync();state.profile=r.profile;state.game=r.game;state.exitConfirm=false;state.view='game';});
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

bootstrap();
setInterval(() => {
  if (state.view === 'game' && state.game && state.game.phase !== 'finished') render();
}, 1000);
