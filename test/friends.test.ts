import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { DouJoyPlatform, friendCodeForUserId, PlatformError } from '../server/src/platform.ts';
import { JsonGameStore } from '../server/src/store.ts';

test('friend search, requests, acceptance, persistence and bilateral removal use real server state', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'kai-play-friends-'));
  const path = join(directory, 'state.json');
  try {
    const store = new JsonGameStore(path);
    await store.load();
    const platform = new DouJoyPlatform(store);
    const alice = await platform.guest('青禾');
    const bob = await platform.guest('远山牌友');
    const carol = await platform.guest('远山棋友');

    assert.equal(alice.profile.friendCode, friendCodeForUserId(alice.profile.id));
    assert.match(alice.profile.friendCode, /^KAI-(?:[A-F0-9]{4}-){3}[A-F0-9]{4}$/);
    assert.equal(platform.profile(alice.profile.id).friendCode, alice.profile.friendCode);

    const exact = platform.searchFriends(alice.profile.id, bob.profile.friendCode);
    assert.deepEqual(exact.results.map((result) => result.id), [bob.profile.id]);
    assert.equal(exact.results[0]!.relationship, 'none');
    assert.equal(exact.results[0]!.requestId, null);

    const byNickname = platform.searchFriends(alice.profile.id, '远山');
    assert.deepEqual(new Set(byNickname.results.map((result) => result.id)), new Set([bob.profile.id, carol.profile.id]));
    const self = platform.searchFriends(alice.profile.id, '青禾').results.find((result) => result.id === alice.profile.id);
    assert.equal(self?.relationship, 'self');

    await assert.rejects(
      () => platform.sendFriendRequest(alice.profile.id, alice.profile.id),
      (error) => error instanceof PlatformError && error.code === 'FRIEND_SELF',
    );

    const sent = await platform.sendFriendRequest(alice.profile.id, bob.profile.id);
    assert.equal(sent.created, true);
    assert.equal(sent.outgoing.length, 1);
    assert.equal(sent.outgoing[0]!.user.id, bob.profile.id);
    assert.equal(sent.incoming.length, 0);
    const requestId = sent.outgoing[0]!.id;

    const duplicate = await platform.sendFriendRequest(alice.profile.id, bob.profile.id);
    assert.equal(duplicate.created, false);
    assert.equal(duplicate.outgoing[0]!.id, requestId);
    assert.equal(platform.friends(bob.profile.id).incoming[0]!.user.id, alice.profile.id);
    assert.deepEqual(
      platform.searchFriends(alice.profile.id, bob.profile.friendCode).results[0],
      { id: bob.profile.id, name: bob.profile.name, friendCode: bob.profile.friendCode, relationship: 'outgoing', requestId },
    );
    assert.deepEqual(
      platform.searchFriends(bob.profile.id, alice.profile.friendCode).results[0],
      { id: alice.profile.id, name: alice.profile.name, friendCode: alice.profile.friendCode, relationship: 'incoming', requestId },
    );

    await assert.rejects(
      () => platform.acceptFriendRequest(alice.profile.id, requestId),
      (error) => error instanceof PlatformError && error.code === 'FRIEND_REQUEST_FORBIDDEN',
    );
    const accepted = await platform.acceptFriendRequest(bob.profile.id, requestId);
    assert.deepEqual(accepted.incoming, []);
    assert.deepEqual(accepted.outgoing, []);
    assert.deepEqual(accepted.friends.map((friend) => friend.id), [alice.profile.id]);
    assert.equal(platform.searchFriends(alice.profile.id, bob.profile.friendCode).results[0]!.relationship, 'friend');
    await assert.rejects(
      () => platform.sendFriendRequest(alice.profile.id, bob.profile.id),
      (error) => error instanceof PlatformError && error.code === 'FRIEND_ALREADY_EXISTS',
    );

    const reloadedStore = new JsonGameStore(path);
    await reloadedStore.load();
    const reloaded = new DouJoyPlatform(reloadedStore);
    assert.deepEqual(reloaded.friends(alice.profile.id).friends.map((friend) => friend.id), [bob.profile.id]);
    assert.deepEqual(reloaded.friends(bob.profile.id).friends.map((friend) => friend.id), [alice.profile.id]);

    const removed = await reloaded.removeFriend(alice.profile.id, bob.profile.id);
    assert.equal(removed.removed, true);
    assert.deepEqual(removed.friends, []);
    assert.deepEqual(reloaded.friends(bob.profile.id).friends, []);
    assert.equal((await reloaded.removeFriend(alice.profile.id, bob.profile.id)).removed, false);

    const ignoredRequest = await reloaded.sendFriendRequest(alice.profile.id, carol.profile.id);
    const ignoredRequestId = ignoredRequest.outgoing[0]!.id;
    const declined = await reloaded.declineFriendRequest(carol.profile.id, ignoredRequestId);
    assert.deepEqual(declined.incoming, []);
    assert.deepEqual(reloaded.friends(alice.profile.id).outgoing, []);
    assert.equal(reloaded.searchFriends(alice.profile.id, carol.profile.friendCode).results[0]!.relationship, 'none');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('friend search validates empty and oversized queries', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'kai-play-friend-search-'));
  try {
    const store = new JsonGameStore(join(directory, 'state.json'));
    await store.load();
    const platform = new DouJoyPlatform(store);
    const session = await platform.guest('搜索者');
    assert.throws(
      () => platform.searchFriends(session.profile.id, '  '),
      (error) => error instanceof PlatformError && error.code === 'FRIEND_SEARCH_REQUIRED',
    );
    assert.throws(
      () => platform.searchFriends(session.profile.id, 'x'.repeat(65)),
      (error) => error instanceof PlatformError && error.code === 'FRIEND_SEARCH_INVALID',
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
