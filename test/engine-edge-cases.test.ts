import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateHand } from '../core/bot.ts';
import { createDeck } from '../core/cards.ts';
import { advanceTimedOutPlayer, bid, createGame, forfeit, pass, play } from '../core/engine.ts';
import { GameRuleError } from '../core/types.ts';

const hasCode = (code: string) => (error: unknown) => error instanceof GameRuleError && error.code === code;

test('three zero bids deterministically choose the strongest hand and start from that landlord', () => {
  const game = createGame({ humanId: 'a', humanName: '甲', baseStake: 20, deck: createDeck(), players: [
    { id: 'a', name: '甲', isBot: false },
    { id: 'b', name: '乙', isBot: false },
    { id: 'c', name: '丙', isBot: false },
  ] });
  const expectedSeat = game.players
    .map((player, seat) => ({ seat, strength: evaluateHand(game.hands[player.id]!) }))
    .sort((left, right) => right.strength - left.strength || left.seat - right.seat)[0]!.seat;

  bid(game, 'a', 0);
  bid(game, 'b', 0);
  bid(game, 'c', 0);

  assert.equal(game.phase, 'playing');
  assert.equal(game.highestBid, 1);
  assert.equal(game.landlordSeat, expectedSeat);
  assert.equal(game.currentSeat, expectedSeat);
  assert.equal(game.hands[game.players[expectedSeat]!.id]!.length, 20);
});

test('invalid bids, duplicate cards and leading passes are rejected atomically', () => {
  const game = createGame({ humanId: 'human', humanName: '原子性', baseStake: 20, deck: createDeck() });
  const beforeInvalidBid = structuredClone(game);
  assert.throws(() => bid(game, 'human', 4 as 0), hasCode('INVALID_BID'));
  assert.deepEqual(game, beforeInvalidBid);

  bid(game, 'human', 3);
  const beforePass = structuredClone(game);
  assert.throws(() => pass(game, 'human'), hasCode('CANNOT_PASS'));
  assert.deepEqual(game, beforePass);

  const card = game.hands.human[0]!;
  const beforeDuplicate = structuredClone(game);
  assert.throws(() => play(game, 'human', [card.id, card.id]), hasCode('INVALID_SELECTION'));
  assert.deepEqual(game, beforeDuplicate);
});

test('turn timeout auto-bids, auto-leads, and auto-passes without skipping more than one turn', () => {
  const bidding = createGame({ humanId: 'human', humanName: '超时玩家', baseStake: 20, deck: createDeck() });
  const biddingTime = Date.parse(bidding.updatedAt);
  assert.equal(advanceTimedOutPlayer(bidding, biddingTime + 999, 1_000), false);
  assert.equal(advanceTimedOutPlayer(bidding, biddingTime + 1_000, 1_000), true);
  assert.equal(bidding.sequence, 1);
  assert.deepEqual(bidding.bids, [{ seat: 0, score: 0 }]);
  assert.equal(bidding.currentSeat, 1);

  const leading = createGame({ humanId: 'human', humanName: '超时首家', baseStake: 20, deck: createDeck() });
  bid(leading, 'human', 3);
  const leadSequence = leading.sequence;
  assert.equal(advanceTimedOutPlayer(leading, Date.parse(leading.updatedAt) + 1_000, 1_000), true);
  assert.equal(leading.sequence, leadSequence + 1);
  assert.equal(leading.events.at(-1)?.kind, 'play');
  assert.equal(leading.currentSeat, 1);

  const responding = createGame({ humanId: 'a', humanName: '甲', baseStake: 20, deck: createDeck(), players: [
    { id: 'a', name: '甲', isBot: false },
    { id: 'b', name: '乙', isBot: false },
    { id: 'c', name: '丙', isBot: false },
  ] });
  bid(responding, 'a', 0);
  bid(responding, 'b', 3);
  play(responding, 'b', [responding.hands.b[0]!.id]);
  pass(responding, 'c');
  const responseSequence = responding.sequence;
  assert.equal(responding.currentSeat, 0);
  assert.equal(advanceTimedOutPlayer(responding, Date.parse(responding.updatedAt) + 1_000, 1_000), true);
  assert.equal(responding.sequence, responseSequence + 1);
  assert.equal(responding.events.at(-1)?.kind, 'pass');
  assert.equal(responding.currentSeat, 1);
  assert.equal(responding.leadCombination, null);
});

test('a farmer forfeit awards the game to the landlord with a zero-sum settlement', () => {
  const game = createGame({ humanId: 'a', humanName: '甲', baseStake: 20, deck: createDeck(), players: [
    { id: 'a', name: '甲', isBot: false },
    { id: 'b', name: '乙', isBot: false },
    { id: 'c', name: '丙', isBot: false },
  ] });
  bid(game, 'a', 0);
  bid(game, 'b', 3);
  forfeit(game, 'a');

  assert.equal(game.phase, 'finished');
  assert.equal(game.landlordSeat, 1);
  assert.equal(game.settlement?.winner, 'landlord');
  assert.ok(game.settlement!.deltas.a! < 0);
  assert.ok(game.settlement!.deltas.b! > 0);
  assert.equal(Object.values(game.settlement!.deltas).reduce((sum, delta) => sum + delta, 0), 0);
});
