import assert from 'node:assert/strict';
import test from 'node:test';
import { ChangeBroker } from '../server/src/change-broker.ts';

test('change notifications wake every waiter for only the changed resource and release registrations', async () => {
  const broker = new ChangeBroker();
  const roomGeneration = broker.generation('room:one');
  const firstRoomWait = broker.wait('room:one', roomGeneration, 1_000);
  const secondRoomWait = broker.wait('room:one', roomGeneration, 1_000);
  const gameController = new AbortController();
  const gameWait = broker.wait('game:one', broker.generation('game:one'), 1_000, gameController.signal);

  assert.equal(broker.pendingCount('room:one'), 2);
  assert.equal(broker.pendingCount('game:one'), 1);
  assert.equal(broker.pendingCount(), 3);

  broker.notify('room:one');
  assert.deepEqual(await Promise.all([firstRoomWait, secondRoomWait]), ['changed', 'changed']);
  assert.equal(broker.generation('room:one'), roomGeneration + 1);
  assert.equal(broker.pendingCount('room:one'), 0);
  assert.equal(broker.pendingCount('game:one'), 1, 'unrelated waiters must remain registered');

  gameController.abort();
  assert.equal(await gameWait, 'aborted');
  assert.equal(broker.pendingCount(), 0);
});

test('stale generations and pre-aborted signals resolve immediately without leaking waiters', async () => {
  const broker = new ChangeBroker();
  const generation = broker.generation('room:race');
  broker.notify('room:race');
  assert.equal(await broker.wait('room:race', generation, 1_000), 'changed');

  const controller = new AbortController();
  controller.abort();
  assert.equal(await broker.wait('room:aborted', 0, 1_000, controller.signal), 'aborted');
  assert.equal(broker.pendingCount(), 0);
});

test('timed-out waits are removed and a later notification advances only the generation', async () => {
  const broker = new ChangeBroker();
  assert.equal(await broker.wait('game:quiet', 0, 15), 'timeout');
  assert.equal(broker.pendingCount('game:quiet'), 0);
  broker.notify('game:quiet');
  assert.equal(broker.generation('game:quiet'), 1);
  assert.equal(broker.pendingCount(), 0);
});
