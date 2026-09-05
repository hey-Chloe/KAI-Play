export const DIRECTIONS = {
  a:{name:'A · 白底珊瑚',description:'轻量画廊：白色留白、珊瑚橙点缀，游戏封面是主角。',heading:'今天，想玩什么？',subtitle:'选一款喜欢的，把这一小段时间留给自己。'},
  b:{name:'B · 冷灰电蓝',description:'快速选游戏：冷灰底、电蓝导航，分类在侧，搜索和游戏列表优先。',heading:'找到你的下一局',subtitle:'按玩法挑选，或直接搜游戏名称。'},
  c:{name:'C · 深色街机',description:'夜间沉浸：石墨黑与少量青柠，放大牌桌画面，减少外围装饰。',heading:'你的游戏时间，开始了。',subtitle:'牌桌、谜题、农场。今晚想去哪个世界？'},
};

export const GAMES = [
  {id:'ddz',name:'斗地主',category:'table',categoryName:'牌桌',copy:'三人对局 · 智能牌友',detail:'经典三人斗地主。真实开局需要连接游戏服务端，支持智能牌友补位。',cover:'kai-cover-ddz-v1-75734997.jpg'},
  {id:'mahjong',name:'KAI 麻将',category:'table',categoryName:'牌桌',copy:'四人基础速战',detail:'和三位智能牌友摸打，练习自摸、荣和与听牌。免费本地玩法。',cover:'kai-cover-mahjong-v1-7bb39c62.jpg'},
  {id:'farm',name:'KAI 农场',category:'strategy',categoryName:'经营',copy:'九日经营 · 种植与收获',detail:'九天内安排播种、收获和市场出售。每一天的行动都有取舍，支持本地存档。',cover:'kai-cover-farm-v1-fe9f4af5.jpg'},
  {id:'xiangqi',name:'中国象棋',category:'strategy',categoryName:'棋类',copy:'人机对弈 · 三档难度',detail:'从轻松练习到认真对弈，和 KAI 下盘棋。可在现有大厅选择难度。',cover:'kai-cover-xiangqi-v1-adc82f4c.jpg'},
  {id:'match3',name:'KAI 三消',category:'quick',categoryName:'短局',copy:'8 × 8 宝石盘',detail:'交换相邻宝石形成三连，在有限步数里争取更高分。',cover:'kai-cover-match3-v1-2d4d94be.jpg'},
  {id:'falling',name:'KAI 方块',category:'quick',categoryName:'短局',copy:'10 × 20 经典场',detail:'移动、旋转并落下方块，拼满一行即可消除。',cover:'kai-cover-falling-v1-15909f41.jpg'},
  {id:'sudoku6',name:'六宫数独',category:'puzzle',categoryName:'益智',copy:'每日一题 · 自由练习',detail:'用 1–6 填满六宫格，每行、每列和每宫都不能重复。',cover:'kai-cover-sudoku6-v1-88f1e623.jpg'},
  {id:'minesweeper',name:'扫雷',category:'puzzle',categoryName:'益智',copy:'数字推理 · 三档雷区',detail:'根据周围的数字推断雷的位置，逐步揭开安全格。',cover:'kai-cover-minesweeper-v1-60e8515a.jpg'},
];

const CATEGORIES=[['all','全部游戏'],['table','牌桌对战'],['strategy','策略经营'],['puzzle','动脑解谜'],['quick','短局放松']];
export const coverUrl=(game)=>`./assets/covers/${game.cover}`;
export function filterPreviewGames(query='',category='all') {
  const normalized=String(query).trim().normalize('NFKC').toLocaleLowerCase('zh-CN');
  return GAMES.filter(game=>(category==='all'||game.category===category)&&`${game.name} ${game.copy} ${game.categoryName}`.toLocaleLowerCase('zh-CN').includes(normalized));
}

function gameCard(game,index) {
  return `<button class="game-card" data-game="${game.id}" aria-label="查看${game.name}玩法"><span class="game-image"><img src="${coverUrl(game)}" alt="" loading="${index<4?'eager':'lazy'}" width="768" height="480"><span class="card-arrow" aria-hidden="true">↗</span></span><span class="game-card-info"><b>${game.name}</b><small>${game.copy}</small></span></button>`;
}
function miniFeature(game,theme) {
  if(theme==='a') {
    const caption=game.id==='farm'?'种植 · 收获 · 经营':'摸一手，慢慢来';
    return `<button class="mini-feature cover-tile" data-game="${game.id}" aria-label="查看${game.name}玩法"><span class="tile-media"><img src="${coverUrl(game)}" alt="" width="768" height="480"><span class="tile-arrow" aria-hidden="true">↗</span></span><span class="tile-caption"><b>${game.name}</b><em>${caption}</em></span></button>`;
  }
  return `<button class="mini-feature" data-game="${game.id}"><img src="${coverUrl(game)}" alt="" width="768" height="480"><span><small>${game.categoryName}</small><b>${game.name}</b><em>${game.copy}</em></span><i aria-hidden="true">↗</i></button>`;
}
export function renderPreview(theme='a') {
  const selected=Object.hasOwn(DIRECTIONS,theme)?theme:'a';
  const direction=DIRECTIONS[selected];
  return `<div class="game-shell theme-${selected}">
    <header class="game-header"><a class="wordmark" href="/" aria-label="返回原版 KAI PLAY"><b>KAI</b><span>PLAY</span><i></i></a><nav class="product-nav" aria-label="产品导航示意"><span aria-current="page">游戏</span><span>Agent</span><span>战绩</span><span>好友</span></nav><div class="preview-beans"><span>卡时豆 <small>示例</small></span><b>30,000</b><span class="bean-plus" aria-hidden="true">＋</span></div></header>
    <section class="discovery-head"><div><span class="eyebrow">随时开一局</span><h1>${direction.heading}</h1><p>${direction.subtitle}</p></div><label class="search"><span aria-hidden="true">⌕</span><input type="search" aria-label="搜索预览游戏" placeholder="搜索游戏，如：象棋、农场" autocomplete="off"><kbd aria-hidden="true">/</kbd></label></section>
    <div class="content-layout"><nav class="category-nav" aria-label="游戏分类">${CATEGORIES.map(([id,label],index)=>`<button data-category="${id}" aria-pressed="${index===0}"><span>${label}</span><small>${id==='all'?GAMES.length:GAMES.filter(game=>game.category===id).length}</small></button>`).join('')}</nav>
    <div class="content-main"><section class="spotlight" aria-label="精选游戏"><article class="feature-main"><img src="${coverUrl(GAMES[0])}" alt="翡翠绿斗地主牌桌与扇形手牌" width="768" height="480"><div class="feature-copy"><span>牌桌精选</span><h2>三人斗地主</h2><p>两位牌友，一手好牌。</p><button class="play-button" data-game="ddz">看看玩法 <b aria-hidden="true">→</b></button></div><small class="feature-footnote">智能牌友补位 · 服务端牌局</small></article><aside class="feature-side"><div class="side-heading"><small>换个心情</small><h2>还有这些好玩的</h2></div>${miniFeature(GAMES[2],selected)}${miniFeature(GAMES[1],selected)}</aside></section>
    <section class="catalog" aria-labelledby="catalog-heading"><div class="catalog-heading"><h2 id="catalog-heading">挑一款，轻松一下</h2><span id="result-count" role="status">8 款预览</span></div><div class="game-grid">${GAMES.map(gameCard).join('')}</div><p class="empty-results" hidden>没有找到这款游戏。试试“农场”，或切回全部游戏。</p></section></div></div>
    <footer class="game-footer"><span>KAI PLAY</span><p>同样的游戏，不同的打开方式。</p><a href="/">返回原版，开始玩 →</a></footer>
  </div>`;
}

if(typeof document!=='undefined') {
  const params=new URLSearchParams(location.search);
  let theme=Object.hasOwn(DIRECTIONS,params.get('theme'))?params.get('theme'):'a';
  let size=params.get('size')==='mobile'?'mobile':'desktop';
  let category='all';
  const root=document.querySelector('#preview-root');
  const viewport=document.querySelector('#preview-viewport');
  const dialog=document.querySelector('#game-preview-dialog');
  let opener=null;
  function syncAddress(){const url=new URL(location.href);url.searchParams.set('theme',theme);url.searchParams.set('size',size);history.replaceState(null,'',url);}
  function updateSize(){viewport.dataset.size=size;document.querySelectorAll('[data-size]').forEach(button=>{if(button.tagName==='BUTTON')button.setAttribute('aria-pressed',String(button.dataset.size===size));});syncAddress();}
  function mount(){category='all';root.innerHTML=renderPreview(theme);document.querySelector('#direction').textContent=DIRECTIONS[theme].description;document.querySelectorAll('[data-theme]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.theme===theme)));updateSize();}
  function updateResults(){const input=root.querySelector('input[type="search"]');const games=filterPreviewGames(input.value,category);root.querySelector('.game-grid').innerHTML=games.map(gameCard).join('');root.querySelector('#result-count').textContent=`${games.length} 款预览`;root.querySelector('.empty-results').hidden=games.length>0;root.querySelector('.spotlight').hidden=Boolean(input.value.trim())||category!=='all';}
  document.querySelector('.theme-options').addEventListener('click',event=>{const button=event.target.closest('[data-theme]');if(!button)return;theme=button.dataset.theme;mount();});
  document.querySelector('.size-options').addEventListener('click',event=>{const button=event.target.closest('[data-size]');if(!button)return;size=button.dataset.size;updateSize();});
  root.addEventListener('input',event=>{if(event.target.matches('input[type="search"]'))updateResults();});
  root.addEventListener('click',event=>{
    const filter=event.target.closest('[data-category]');
    if(filter){category=filter.dataset.category;root.querySelectorAll('[data-category]').forEach(button=>button.setAttribute('aria-pressed',String(button===filter)));updateResults();return;}
    const card=event.target.closest('[data-game]');if(!card)return;
    const game=GAMES.find(entry=>entry.id===card.dataset.game);if(!game)return;
    opener=card;document.querySelector('#dialog-image').src=coverUrl(game);document.querySelector('#dialog-title').textContent=game.name;document.querySelector('#dialog-copy').textContent=game.detail;dialog.showModal();
  });
  document.querySelector('.dialog-close').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('close',()=>opener?.focus());
  document.addEventListener('keydown',event=>{if(event.key==='/'&&!dialog.open&&!['INPUT','TEXTAREA'].includes(document.activeElement?.tagName)){event.preventDefault();root.querySelector('input[type="search"]').focus();}});
  mount();
}
