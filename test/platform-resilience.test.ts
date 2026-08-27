import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DouJoyPlatform, PlatformError } from '../server/src/platform.ts';
import { JsonGameStore } from '../server/src/store.ts';

async function withPlatform(name: string, run: (platform: DouJoyPlatform, store: JsonGameStore) => Promise<void>) {
  const directory = await mkdtemp(join(tmpdir(), `${name}-`));
  try {
    const store = new JsonGameStore(join(directory, 'state.json'));
    await store.load();
    await run(new DouJoyPlatform(store, 45_000, 10, 10), store);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

const platformCode = (code: string) => (error: unknown) => error instanceof PlatformError && error.code === code;

test('host departure wakes room sync, transfers ownership, and the last departure closes the room', async () => {
  await withPlatform('doujoy-room-lifecycle', async (platform, store) => {
    const host = await platform.guest('原房主');
    const member = await platform.guest('新房主');
    const created = await platform.createRoom(host.profile.id);
    const joined = await platform.joinRoom(member.profile.id, created.code);
    const wait = platform.waitRoom(created.id, member.profile.id, joined.version, 1_000);

    await platform.leaveRoom(created.id, host.profile.id);
    const changed = await wait;
    assert.ok(changed);
    assert.equal(changed.changed, true);
    assert.equal(changed.timedOut, false);
    assert.equal(changed.room.hostId, member.profile.id);
    assert.equal(changed.room.isHost, true);
    assert.equal(changed.room.members.length, 1);
    assert.equal(platform.changes.pendingCount(), 0);
    assert.throws(() => platform.room(created.id, host.profile.id), platformCode('ROOM_FORBIDDEN'));

    const replacement = await platform.createRoom(host.profile.id);
    assert.notEqual(replacement.id, created.id, 'a player who left may create another room');
    await platform.leaveRoom(created.id, member.profile.id);
    assert.equal(store.room(created.id)?.status, 'finished');
    assert.equal((await platform.resume(member.profile.id)).room, null);
  });
});

test('starting a one-player friend room fills bot seats exactly once and closes waiting-room exits', async () => {
  await withPlatform('doujoy-room-start', async (platform) => {
    const host = await platform.guest('单人房主');
    const room = await platform.createRoom(host.profile.id);
    const started = await platform.startRoom(room.id, host.profile.id);

    assert.equal(started.room.status, 'playing');
    assert.equal(started.room.gameId, started.game.id);
    assert.equal(started.game.players.length, 3);
    assert.equal(started.game.players.filter((player) => player.isBot).length, 2);
    assert.equal((await platform.quickGame(host.profile.id)).id, started.game.id, 'quick play resumes the active game');
    await assert.rejects(() => platform.startRoom(room.id, host.profile.id), platformCode('ROOM_ALREADY_STARTED'));
    await assert.rejects(() => platform.leaveRoom(room.id, host.profile.id), platformCode('ROOM_ALREADY_STARTED'));
  });
});

test('friend-room codes, membership privacy, and the three-seat capacity fail closed', async () => {
  await withPlatform('doujoy-room-boundaries', async (platform) => {
    const host = await platform.guest('边界房主');
    const second = await platform.guest('二号玩家');
    const third = await platform.guest('三号玩家');
    const fourth = await platform.guest('第四玩家');
    const room = await platform.createRoom(host.profile.id);

    await assert.rejects(() => platform.joinRoom(second.profile.id, '123'), platformCode('ROOM_CODE_INVALID'));
    await assert.rejects(() => platform.joinRoom(second.profile.id, room.code === '999999' ? '888888' : '999999'), platformCode('ROOM_NOT_FOUND'));
    assert.throws(() => platform.room(room.id, fourth.profile.id), platformCode('ROOM_FORBIDDEN'));

    await platform.joinRoom(second.profile.id, room.code);
    const full = await platform.joinRoom(third.profile.id, room.code);
    await assert.rejects(() => platform.joinRoom(fourth.profile.id, room.code), platformCode('ROOM_FULL'));
    assert.equal(platform.room(room.id, host.profile.id).version, full.version);
    assert.equal(platform.room(room.id, host.profile.id).members.length, 3);
    assert.equal((await platform.resume(fourth.profile.id)).room, null);
  });
});

test('a failed room start preserves the waiting room version and membership', async () => {
  await withPlatform('doujoy-room-start-atomic', async (platform, store) => {
    const host = await platform.guest('低分房主');
    const room = await platform.createRoom(host.profile.id);
    store.post({
      key: 'drain-room-host', referenceType: 'game', referenceId: 'test', entries: [
        { accountId: host.profile.id, amount: -9_900, memo: '测试扣减' },
        { accountId: 'treasury', amount: 9_900, memo: '测试扣减' },
      ],
    });
    const before = platform.room(room.id, host.profile.id);

    await assert.rejects(() => platform.startRoom(room.id, host.profile.id), platformCode('PLAYER_RELIEF_REQUIRED'));
    const after = platform.room(room.id, host.profile.id);
    assert.deepEqual(after, before);
    assert.equal(store.gamesForUser(host.profile.id).length, 0);
  });
});

test('concurrent retries with one request id advance an authoritative game only once', async () => {
  await withPlatform('doujoy-action-race', async (platform) => {
    const session = await platform.guest('并发重试');
    const initial = await platform.quickGame(session.profile.id);
    const input = {
      gameId: initial.id,
      userId: session.profile.id,
      requestId: 'concurrent-bid',
      expectedSequence: initial.sequence,
      kind: 'bid' as const,
      score: 3,
    };

    const [first, second] = await Promise.all([platform.action(input), platform.action(input)]);
    assert.deepEqual(second, first);
    assert.equal(first.game.sequence, initial.sequence + 1);
    assert.equal(platform.view(initial.id, session.profile.id).sequence, initial.sequence + 1);
  });
});

test('concurrent idempotent retries never observe success before the snapshot is durable', async () => {
  await withPlatform('doujoy-action-save-failure', async (platform, store) => {
    const session = await platform.guest('落盘失败');
    const initial = await platform.quickGame(session.profile.id);
    const input = {
      gameId: initial.id,
      userId: session.profile.id,
      requestId: 'failed-durable-bid',
      expectedSequence: initial.sequence,
      kind: 'bid' as const,
      score: 3,
    };
    const durableSave = store.save.bind(store);
    let saveAttempts = 0;
    store.save = () => {
      saveAttempts += 1;
      return saveAttempts === 1
        ? Promise.reject(new Error('SIMULATED_DISK_FAILURE'))
        : durableSave();
    };

    const outcomes = await Promise.allSettled([platform.action(input), platform.action(input)]);
    assert.deepEqual(outcomes.map((outcome) => outcome.status), ['rejected', 'rejected']);
    assert.equal(saveAttempts, 1, 'same-key retries must share the failed persistence attempt');
    assert.equal(store.actionResult(`${session.profile.id}:${initial.id}:${input.requestId}`), undefined);
    await assert.rejects(() => platform.action(input), platformCode('STALE_GAME'));
    assert.equal(saveAttempts, 1, 'a failed cache entry must not replay success or trigger a misleading second save');
  });
});

test('reusing one request id with a different action payload is rejected as an idempotency conflict', async () => {
  await withPlatform('doujoy-action-conflict', async (platform) => {
    const scoreSession = await platform.guest('分值冲突');
    const scoreGame = await platform.quickGame(scoreSession.profile.id);
    const bidInput = {
      gameId: scoreGame.id,
      userId: scoreSession.profile.id,
      requestId: 'same-bid-key',
      expectedSequence: scoreGame.sequence,
      kind: 'bid' as const,
      score: 3,
    };
    await platform.action(bidInput);
    await assert.rejects(
      () => platform.action({ ...bidInput, score: 2 }),
      (error) => error instanceof PlatformError && error.status === 409 && error.code === 'IDEMPOTENCY_CONFLICT',
    );
    await assert.rejects(
      () => platform.action({ ...bidInput, kind: 'pass' as const, score: undefined }),
      (error) => error instanceof PlatformError && error.status === 409 && error.code === 'IDEMPOTENCY_CONFLICT',
    );
    assert.equal(platform.view(scoreGame.id, scoreSession.profile.id).sequence, scoreGame.sequence + 1);

    const cardsSession = await platform.guest('牌组冲突');
    const cardsGame = await platform.quickGame(cardsSession.profile.id);
    const bidding = await platform.action({
      gameId: cardsGame.id,
      userId: cardsSession.profile.id,
      requestId: 'prepare-playing',
      expectedSequence: cardsGame.sequence,
      kind: 'bid',
      score: 3,
    });
    const [firstCard, secondCard] = bidding.game.hand;
    assert.ok(firstCard && secondCard);
    const playInput = {
      gameId: cardsGame.id,
      userId: cardsSession.profile.id,
      requestId: 'same-play-key',
      expectedSequence: bidding.game.sequence,
      kind: 'play' as const,
      cardIds: [firstCard.id],
    };
    const played = await platform.action(playInput);
    await assert.rejects(
      () => platform.action({ ...playInput, cardIds: [secondCard.id] }),
      (error) => error instanceof PlatformError && error.status === 409 && error.code === 'IDEMPOTENCY_CONFLICT',
    );
    assert.equal(platform.view(cardsGame.id, cardsSession.profile.id).sequence, played.game.sequence);
  });
});

test('failed actions do not consume idempotency keys or mutate the game', async () => {
  await withPlatform('doujoy-action-atomic', async (platform) => {
    const session = await platform.guest('动作原子性');
    const initial = await platform.quickGame(session.profile.id);
    const before = platform.view(initial.id, session.profile.id);
    const base = {
      gameId: initial.id,
      userId: session.profile.id,
      requestId: 'retry-after-invalid',
      expectedSequence: initial.sequence,
      kind: 'bid' as const,
    };

    await assert.rejects(() => platform.action({ ...base, score: 4 }), platformCode('INVALID_BID'));
    assert.deepEqual(platform.view(initial.id, session.profile.id), before);

    const recovered = await platform.action({ ...base, score: 3 });
    assert.equal(recovered.game.sequence, initial.sequence + 1);
    assert.equal(recovered.game.phase, 'playing');
  });
});

test('idempotent action results and their payload fingerprints survive a store restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'doujoy-action-restart-'));
  const path = join(directory, 'state.json');
  try {
    const firstStore = new JsonGameStore(path);
    await firstStore.load();
    const firstPlatform = new DouJoyPlatform(firstStore, 45_000, 10, 10);
    const session = await firstPlatform.guest('持久幂等');
    const game = await firstPlatform.quickGame(session.profile.id);
    const input = {
      gameId: game.id,
      userId: session.profile.id,
      requestId: 'durable-action',
      expectedSequence: game.sequence,
      kind: 'bid' as const,
      score: 3,
    };
    const committed = await firstPlatform.action(input);

    const reloadedStore = new JsonGameStore(path);
    await reloadedStore.load();
    const reloadedPlatform = new DouJoyPlatform(reloadedStore, 45_000, 10, 10);
    const replay = await reloadedPlatform.action(input);
    assert.deepEqual(replay, committed);
    assert.equal(reloadedPlatform.view(game.id, session.profile.id).sequence, committed.game.sequence);
    await assert.rejects(
      () => reloadedPlatform.action({ ...input, score: 2 }),
      (error) => error instanceof PlatformError && error.status === 409 && error.code === 'IDEMPOTENCY_CONFLICT',
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
