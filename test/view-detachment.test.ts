import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createDeck } from '../core/cards.ts';
import { bid, createGame } from '../core/engine.ts';
import { gameView } from '../core/view.ts';
import { DouJoyPlatform } from '../server/src/platform.ts';
import { JsonGameStore } from '../server/src/store.ts';

test('game views are detached in both directions from the authoritative engine state', () => {
  const game = createGame({ humanId: 'human', humanName: '视图隔离', baseStake: 20, deck: createDeck() });
  const originalState = structuredClone(game);
  const issued = gameView(game, 'human');

  issued.hand[0]!.rank = 99;
  issued.hand.pop();
  issued.bids.push({ seat: 2, score: 3 });
  issued.players[0]!.name = '被篡改';
  issued.fairness.commitment = 'tampered';
  assert.deepEqual(game, originalState, 'mutating a response must not mutate the stored game graph');

  const stableView = gameView(game, 'human');
  bid(game, 'human', 3);
  assert.equal(stableView.phase, 'bidding');
  assert.equal(stableView.sequence, 0);
  assert.equal(stableView.bids.length, 0);
  assert.equal(stableView.hand.length, 17);
  assert.equal(game.phase, 'playing');
  assert.equal(game.sequence, 1);
  assert.equal(game.hands.human.length, 20);
});

test('idempotent replays are detached snapshots that do not drift after later game actions', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'doujoy-replay-detached-'));
  try {
    const store = new JsonGameStore(join(directory, 'state.json'));
    await store.load();
    const platform = new DouJoyPlatform(store, 45_000, 10, 10);
    const session = await platform.guest('重放隔离');
    const initial = await platform.quickGame(session.profile.id);
    const input = {
      gameId: initial.id,
      userId: session.profile.id,
      requestId: 'detached-replay',
      expectedSequence: initial.sequence,
      kind: 'bid' as const,
      score: 1,
    };
    const first = await platform.action(input);
    const committedResponse = structuredClone(first);

    first.game.hand[0]!.rank = 99;
    first.game.hand.pop();
    first.game.bids[0]!.score = 0;
    first.profile.balance = -1;
    const immediateReplay = await platform.action(input);
    assert.deepEqual(immediateReplay, committedResponse, 'caller mutations must not pollute the cached response');

    const currentBeforeBot = platform.view(initial.id, session.profile.id);
    const afterBot = await platform.refreshedView(
      initial.id,
      session.profile.id,
      Date.parse(currentBeforeBot.updatedAt) + 100,
    );
    assert.equal(afterBot.sequence, committedResponse.game.sequence + 1, 'a later authoritative action should advance the live game');

    const oldReplay = await platform.action(input);
    assert.deepEqual(oldReplay, committedResponse, 'an earlier replay must remain the originally committed response');
    assert.equal(platform.view(initial.id, session.profile.id).sequence, afterBot.sequence);

    oldReplay.game.hand[0]!.id = 'second-mutation';
    assert.deepEqual(await platform.action(input), committedResponse, 'each replay must itself be a detached copy');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
