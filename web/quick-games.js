export const QUICK_GAME_KINDS = Object.freeze([
  'tictactoe', 'lights', 'guess', 'rps', 'math', 'sequence', 'stroop',
]);

export const QUICK_GAME_META = Object.freeze({
  tictactoe:{ name:'KAI 井字棋', glyph:'井' },
  lights:{ name:'KAI 点灯', glyph:'灯' },
  guess:{ name:'KAI 猜数字', glyph:'?' },
  rps:{ name:'KAI 猜拳', glyph:'拳' },
  math:{ name:'KAI 口算', glyph:'+' },
  sequence:{ name:'KAI 节奏记忆', glyph:'♪' },
  stroop:{ name:'KAI 颜色反应', glyph:'色' },
});

const RPS_CHOICES = Object.freeze(['rock','paper','scissors']);
const STROOP_COLORS = Object.freeze(['red','blue','green','gold']);
const STROOP_LABELS = Object.freeze({ red:'红', blue:'蓝', green:'绿', gold:'黄' });
const SEQUENCE_COLORS = Object.freeze(['mint','coral','violet','gold']);

function seedNumber(seed) {
  if (Number.isSafeInteger(seed) && seed >= 0) return seed >>> 0;
  const text = String(seed ?? 'kai-play');
  let value = 2166136261;
  for (const char of text) value = Math.imul(value ^ char.codePointAt(0), 16777619);
  return value >>> 0;
}

function randomAt(seed, index, max) {
  let value = (seedNumber(seed) + Math.imul(index + 1, 0x9e3779b1)) >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d);
  value ^= value >>> 15;
  value = Math.imul(value, 0x846ca68b);
  value ^= value >>> 16;
  return Math.abs(value >>> 0) % max;
}

function base(kind, seed) {
  return { kind, seed:seedNumber(seed), status:'playing', moves:0 };
}

function ticWinner(board) {
  const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
  for (const line of lines) if (board[line[0]] && line.every((index) => board[index] === board[line[0]])) return board[line[0]];
  return board.every(Boolean) ? 'draw' : null;
}

function newTicTacToe(seed) {
  return { ...base('tictactoe', seed), board:Array(9).fill(''), result:null, lastMove:null };
}

function playTicTacToe(game, value) {
  const index = Number(value);
  if (game.status !== 'playing' || !Number.isInteger(index) || index < 0 || index > 8 || game.board[index]) return game;
  const board = [...game.board];
  board[index] = 'X';
  let result = ticWinner(board);
  let lastMove = index;
  if (!result) {
    const open = [4,0,2,6,8,1,3,5,7].filter((cell) => !board[cell]);
    const winning = open.find((cell) => { const copy=[...board];copy[cell]='O';return ticWinner(copy)==='O'; });
    const blocking = open.find((cell) => { const copy=[...board];copy[cell]='X';return ticWinner(copy)==='X'; });
    const bot = winning ?? blocking ?? open[randomAt(game.seed, game.moves, open.length)];
    if (Number.isInteger(bot)) { board[bot] = 'O';lastMove = bot; }
    result = ticWinner(board);
  }
  return { ...game, board, moves:game.moves + 1, lastMove, result, status:result ? (result === 'X' ? 'won' : result === 'O' ? 'lost' : 'draw') : 'playing' };
}

function toggleLight(board, index) {
  const next = [...board];
  const row = Math.floor(index / 5);
  const column = index % 5;
  for (const [dr,dc] of [[0,0],[-1,0],[1,0],[0,-1],[0,1]]) {
    const r=row+dr,c=column+dc;
    if (r >= 0 && r < 5 && c >= 0 && c < 5) next[r * 5 + c] = !next[r * 5 + c];
  }
  return next;
}

function newLights(seed) {
  let board = Array(25).fill(false);
  for (let index=0;index<8;index+=1) board = toggleLight(board, randomAt(seed,index,25));
  if (board.every((cell) => !cell)) board = toggleLight(board,12);
  return { ...base('lights',seed), board, lit:board.filter(Boolean).length };
}

function playLights(game, value) {
  const index=Number(value);
  if (game.status !== 'playing' || !Number.isInteger(index) || index < 0 || index >= 25) return game;
  const board=toggleLight(game.board,index);
  const lit=board.filter(Boolean).length;
  return { ...game, board, lit, moves:game.moves+1, status:lit===0?'won':'playing' };
}

function newGuess(seed) {
  return {
    ...base('guess',seed), target:randomAt(seed,0,100)+1, attempts:[],
    lower:1, upper:100, maxAttempts:7, hint:'7 次机会，先从中间开始',
  };
}

function playGuess(game, value) {
  const guess=Number(value);
  if (game.status !== 'playing' || !Number.isInteger(guess) || guess < 1 || guess > 100) return { ...game, hint:'请输入 1–100 之间的整数' };
  const attempts=[...game.attempts,guess];
  const won=guess===game.target;
  const lower=won?game.target:guess<game.target?Math.max(game.lower,guess+1):game.lower;
  const upper=won?game.target:guess>game.target?Math.min(game.upper,guess-1):game.upper;
  const lost=!won&&attempts.length>=game.maxAttempts;
  const hint=won?`猜中了，就是 ${game.target}`:lost?`机会用完，答案是 ${game.target}`:guess<game.target?`比 ${guess} 大，范围缩到 ${lower}–${upper}`:`比 ${guess} 小，范围缩到 ${lower}–${upper}`;
  return { ...game, attempts, lower, upper, moves:attempts.length, hint, status:won?'won':lost?'lost':'playing' };
}

function newRps(seed) {
  return { ...base('rps',seed), playerScore:0, botScore:0, rounds:[], last:null };
}

function playRps(game, value) {
  if (game.status !== 'playing' || !RPS_CHOICES.includes(value)) return game;
  const bot=RPS_CHOICES[randomAt(game.seed,game.rounds.length,3)];
  const win=(value==='rock'&&bot==='scissors')||(value==='paper'&&bot==='rock')||(value==='scissors'&&bot==='paper');
  const draw=value===bot;
  const playerScore=game.playerScore+Number(win);
  const botScore=game.botScore+Number(!win&&!draw);
  const rounds=[...game.rounds,{ player:value,bot,result:draw?'draw':win?'win':'lost' }];
  const status=playerScore>=3?'won':botScore>=3?'lost':rounds.length>=7?(playerScore>botScore?'won':botScore>playerScore?'lost':'draw'):'playing';
  return { ...game, playerScore,botScore,rounds,last:rounds.at(-1),moves:rounds.length,status };
}

function mathQuestion(seed, round) {
  const operation=['+','−','×'][randomAt(seed,round*3,3)];
  const a=randomAt(seed,round*3+1,operation==='×'?10:30)+1;
  const b=randomAt(seed,round*3+2,operation==='×'?10:30)+1;
  if(operation==='−') { const high=Math.max(a,b),low=Math.min(a,b);return { text:`${high} − ${low}`,answer:high-low }; }
  return { text:`${a} ${operation} ${b}`,answer:operation==='+'?a+b:a*b };
}

function newMath(seed) {
  return { ...base('math',seed), round:0, score:0, streak:0, bestStreak:0, question:mathQuestion(seed,0), lastCorrect:null };
}

function playMath(game, value) {
  const answer=Number(value);
  if (game.status !== 'playing' || !Number.isInteger(answer)) return game;
  const correct=answer===game.question.answer;
  const round=game.round+1;
  const score=game.score+Number(correct);
  const streak=correct?game.streak+1:0;
  const bestStreak=Math.max(game.bestStreak,streak);
  return { ...game, round,score,streak,bestStreak,lastCorrect:correct,moves:round,question:round<10?mathQuestion(game.seed,round):game.question,status:round>=10?(score>=7?'won':'lost'):'playing' };
}

function newSequence(seed) {
  const sequence=Array.from({length:3},(_,index)=>SEQUENCE_COLORS[randomAt(seed,index,4)]);
  return { ...base('sequence',seed), sequence,input:[],round:1,phase:'watch',lastCorrect:null,lives:2 };
}

function startSequence(game) {
  if (game.kind !== 'sequence' || game.status !== 'playing' || game.phase !== 'watch') return game;
  return { ...game, phase:'input',input:[],lastCorrect:null };
}

function playSequence(game, value) {
  if (game.status !== 'playing' || game.phase !== 'input' || !SEQUENCE_COLORS.includes(value)) return game;
  const input=[...game.input,value];
  if (game.sequence[input.length-1] !== value) {
    const lives=game.lives-1;
    return { ...game,input:[],phase:lives>0?'watch':'input',lastCorrect:false,lives,status:lives>0?'playing':'lost',moves:game.moves+1 };
  }
  if (input.length < game.sequence.length) return { ...game,input,moves:game.moves+1 };
  if (game.round >= 6) return { ...game,input,lastCorrect:true,status:'won',moves:game.moves+1 };
  const round=game.round+1;
  const sequence=[...game.sequence,SEQUENCE_COLORS[randomAt(game.seed,game.sequence.length,4)]];
  return { ...game,sequence,input:[],round,phase:'watch',lastCorrect:true,moves:game.moves+1 };
}

function stroopPrompt(seed, round) {
  const word=STROOP_COLORS[randomAt(seed,round*2,4)];
  let color=STROOP_COLORS[randomAt(seed,round*2+1,4)];
  if(color===word) color=STROOP_COLORS[(STROOP_COLORS.indexOf(color)+1)%4];
  return { word,color,label:STROOP_LABELS[word] };
}

function newStroop(seed) {
  return { ...base('stroop',seed), round:0,score:0,streak:0,bestStreak:0,prompt:stroopPrompt(seed,0),lastCorrect:null };
}

function playStroop(game, value) {
  if (game.status !== 'playing' || !STROOP_COLORS.includes(value)) return game;
  const correct=value===game.prompt.color;
  const round=game.round+1;
  const score=game.score+Number(correct);
  const streak=correct?game.streak+1:0;
  const bestStreak=Math.max(game.bestStreak,streak);
  return { ...game,round,score,streak,bestStreak,lastCorrect:correct,moves:round,prompt:round<10?stroopPrompt(game.seed,round):game.prompt,status:round>=10?(score>=7?'won':'lost'):'playing' };
}

export function newQuickGame(kind, options={}) {
  const normalized=QUICK_GAME_KINDS.includes(kind)?kind:'tictactoe';
  const seed=options.seed ?? Math.floor(Math.random()*0x1_0000_0000);
  if(normalized==='tictactoe')return newTicTacToe(seed);
  if(normalized==='lights')return newLights(seed);
  if(normalized==='guess')return newGuess(seed);
  if(normalized==='rps')return newRps(seed);
  if(normalized==='math')return newMath(seed);
  if(normalized==='sequence')return newSequence(seed);
  return newStroop(seed);
}

export function playQuickGame(game, value) {
  if (!game || !QUICK_GAME_KINDS.includes(game.kind)) return game;
  if(game.kind==='tictactoe')return playTicTacToe(game,value);
  if(game.kind==='lights')return playLights(game,value);
  if(game.kind==='guess')return playGuess(game,value);
  if(game.kind==='rps')return playRps(game,value);
  if(game.kind==='math')return playMath(game,value);
  if(game.kind==='sequence')return playSequence(game,value);
  return playStroop(game,value);
}

export function startQuickSequence(game) { return startSequence(game); }
export function restartQuickGame(game) { return newQuickGame(game?.kind,{seed:(seedNumber(game?.seed)+1)>>>0}); }
export const QUICK_RPS_CHOICES=RPS_CHOICES;
export const QUICK_SEQUENCE_COLORS=SEQUENCE_COLORS;
export const QUICK_STROOP_COLORS=STROOP_COLORS;
export const QUICK_STROOP_LABELS=STROOP_LABELS;
