import assert from 'node:assert/strict';
import test from 'node:test';
import { QUICK_GAME_KINDS, newQuickGame, playQuickGame, restartQuickGame, startQuickSequence } from '../web/quick-games.js';

test('seven quick games expose deterministic serializable openings',()=>{
  assert.deepEqual(QUICK_GAME_KINDS,['tictactoe','lights','guess','rps','math','sequence','stroop']);
  for(const kind of QUICK_GAME_KINDS){const a=newQuickGame(kind,{seed:'same'}),b=newQuickGame(kind,{seed:'same'});assert.deepEqual(a,b);assert.deepEqual(JSON.parse(JSON.stringify(a)),a);assert.equal(a.status,'playing');}
});

test('tic tac toe alternates with KAI and reaches a terminal result',()=>{
  let game=newQuickGame('tictactoe',{seed:3});
  for(const index of [0,1,2,3,5,6,7,8,4]){const next=playQuickGame(game,index);if(next!==game)game=next;if(game.status!=='playing')break;}
  assert.notEqual(game.status,'playing');assert.equal(game.board.filter(Boolean).length>=3,true);assert.equal(playQuickGame(game,4),game);
});

test('lights out toggles a bounded cross',()=>{
  const game=newQuickGame('lights',{seed:11});const next=playQuickGame(game,12);
  assert.equal(next.board.filter((value,index)=>value!==game.board[index]).length,5);assert.equal(next.board.length,25);assert.equal(next.moves,1);assert.equal(playQuickGame(game,-1),game);
});

test('guess number gives truthful bounds and wins exactly',()=>{
  const game=newQuickGame('guess',{seed:19});const low=playQuickGame(game,Math.max(1,game.target-1));if(game.target>1)assert.equal(low.hint,'再大一点');const won=playQuickGame(low,game.target);assert.equal(won.status,'won');assert.match(won.hint,/猜中了/);
});

test('rock paper scissors settles no later than seven rounds',()=>{
  let game=newQuickGame('rps',{seed:27});for(let i=0;i<7&&game.status==='playing';i+=1)game=playQuickGame(game,['rock','paper','scissors'][i%3]);assert.notEqual(game.status,'playing');assert.equal(game.rounds.length<=7,true);
});

test('math challenge runs ten questions and scores answers',()=>{
  let game=newQuickGame('math',{seed:35});for(let i=0;i<10;i+=1)game=playQuickGame(game,game.question.answer);assert.equal(game.status,'won');assert.equal(game.round,10);assert.equal(game.score,10);
});

test('sequence requires watch confirmation, grows, and rejects an error',()=>{
  let game=newQuickGame('sequence',{seed:43});assert.equal(playQuickGame(game,game.sequence[0]),game);game=startQuickSequence(game);for(const color of [...game.sequence])game=playQuickGame(game,color);assert.equal(game.round,2);assert.equal(game.sequence.length,4);game=startQuickSequence(game);const wrong=['mint','coral','violet','gold'].find(color=>color!==game.sequence[0]);game=playQuickGame(game,wrong);assert.equal(game.status,'lost');
});

test('stroop scores displayed ink rather than word',()=>{
  let game=newQuickGame('stroop',{seed:51});assert.notEqual(game.prompt.word,game.prompt.color);for(let i=0;i<10;i+=1)game=playQuickGame(game,game.prompt.color);assert.equal(game.status,'won');assert.equal(game.score,10);
});

test('restart preserves kind and resets progress',()=>{
  const game=playQuickGame(newQuickGame('guess',{seed:99}),50);const restarted=restartQuickGame(game);assert.equal(restarted.kind,'guess');assert.notEqual(restarted.seed,game.seed);assert.equal(restarted.moves,0);assert.deepEqual(restarted.attempts,[]);
});
