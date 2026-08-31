import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

type PublicFriend = { id: string; name: string; friendCode: string; createdAt?: string };
type FriendRequest = { id: string; user: PublicFriend; createdAt: string };
type FriendCenter = {
  ok: true;
  profile: PublicFriend;
  friends: PublicFriend[];
  incoming: FriendRequest[];
  outgoing: FriendRequest[];
};

test('HTTP friend endpoints return render-ready profile, friend and request collections', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'kai-play-friends-http-'));
  const port = 6_200 + Math.floor(Math.random() * 300);
  const origin = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['--experimental-strip-types', resolve('server/src/server.ts')], {
    cwd: resolve('.'),
    env: { ...process.env, DOUJOY_PORT: String(port), DOUJOY_DATA_PATH: join(directory, 'state.json') },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const headers = (token: string) => ({ authorization: `Bearer ${token}`, 'content-type': 'application/json' });
  const createGuest = async (name: string) => fetch(`${origin}/v1/sessions/guest`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name }),
  }).then((response) => response.json()) as Promise<{ token: string; profile: PublicFriend }>;

  try {
    await new Promise<void>((resolveReady, reject) => {
      const timer = setTimeout(() => reject(new Error('SERVER_START_TIMEOUT')), 10_000);
      child.stdout.on('data', (chunk) => {
        if (String(chunk).includes('DouJoy server listening')) {
          clearTimeout(timer);
          resolveReady();
        }
      });
      child.once('exit', (code) => reject(new Error(`SERVER_EXITED_${code}`)));
    });

    const alice = await createGuest('HTTP 青禾');
    const bob = await createGuest('HTTP 远山');
    const carol = await createGuest('HTTP 星河');
    assert.match(alice.profile.friendCode, /^KAI-/);

    const initialResponse = await fetch(`${origin}/v1/friends`, { headers: headers(alice.token) });
    const initial = await initialResponse.json() as FriendCenter;
    assert.equal(initialResponse.status, 200);
    assert.deepEqual(initial.profile, {
      id: alice.profile.id, name: alice.profile.name, friendCode: alice.profile.friendCode,
    });
    assert.deepEqual(initial.friends, []);
    assert.deepEqual(initial.incoming, []);
    assert.deepEqual(initial.outgoing, []);

    const search = await fetch(`${origin}/v1/friends/search?q=${encodeURIComponent('远山')}`, {
      headers: headers(alice.token),
    }).then((response) => response.json()) as {
      ok: true;
      results: Array<PublicFriend & { relationship: string; requestId: string | null }>;
    };
    assert.deepEqual(search.results, [{
      id: bob.profile.id, name: bob.profile.name, friendCode: bob.profile.friendCode,
      relationship: 'none', requestId: null,
    }]);

    const sentResponse = await fetch(`${origin}/v1/friends/requests`, {
      method: 'POST', headers: headers(alice.token), body: JSON.stringify({ userId: bob.profile.id }),
    });
    const sent = await sentResponse.json() as FriendCenter & { created: boolean };
    assert.equal(sentResponse.status, 201);
    assert.equal(sent.created, true);
    assert.equal(sent.outgoing.length, 1);
    assert.equal(sent.outgoing[0]!.user.id, bob.profile.id);
    const requestId = sent.outgoing[0]!.id;

    const bobPending = await fetch(`${origin}/v1/friends`, { headers: headers(bob.token) })
      .then((response) => response.json()) as FriendCenter;
    assert.equal(bobPending.incoming[0]!.id, requestId);
    assert.equal(bobPending.incoming[0]!.user.id, alice.profile.id);
    assert.equal('online' in bobPending.incoming[0]!.user, false);

    const acceptedResponse = await fetch(`${origin}/v1/friends/requests/${requestId}/accept`, {
      method: 'POST', headers: headers(bob.token), body: '{}',
    });
    const accepted = await acceptedResponse.json() as FriendCenter;
    assert.equal(acceptedResponse.status, 200);
    assert.deepEqual(accepted.incoming, []);
    assert.deepEqual(accepted.friends.map((friend) => friend.id), [alice.profile.id]);

    const aliceFriends = await fetch(`${origin}/v1/friends`, { headers: headers(alice.token) })
      .then((response) => response.json()) as FriendCenter;
    assert.deepEqual(aliceFriends.friends.map((friend) => friend.id), [bob.profile.id]);

    const removed = await fetch(`${origin}/v1/friends/${bob.profile.id}/remove`, {
      method: 'POST', headers: headers(alice.token), body: '{}',
    }).then((response) => response.json()) as FriendCenter & { removed: boolean };
    assert.equal(removed.removed, true);
    assert.deepEqual(removed.friends, []);
    const bobAfterRemoval = await fetch(`${origin}/v1/friends`, { headers: headers(bob.token) })
      .then((response) => response.json()) as FriendCenter;
    assert.deepEqual(bobAfterRemoval.friends, []);

    const carolRequest = await fetch(`${origin}/v1/friends/requests`, {
      method: 'POST', headers: headers(alice.token), body: JSON.stringify({ userId: carol.profile.id }),
    }).then((response) => response.json()) as FriendCenter & { created: boolean };
    const carolRequestId = carolRequest.outgoing[0]!.id;
    const declined = await fetch(`${origin}/v1/friends/requests/${carolRequestId}/decline`, {
      method: 'POST', headers: headers(carol.token), body: '{}',
    }).then((response) => response.json()) as FriendCenter;
    assert.deepEqual(declined.incoming, []);
    const aliceAfterDecline = await fetch(`${origin}/v1/friends`, { headers: headers(alice.token) })
      .then((response) => response.json()) as FriendCenter;
    assert.deepEqual(aliceAfterDecline.outgoing, []);
  } finally {
    if (child.exitCode === null) {
      child.kill();
      await Promise.race([once(child, 'exit'), new Promise((resolveTimeout) => setTimeout(resolveTimeout, 2_000))]);
    }
    await rm(directory, { recursive: true, force: true });
  }
});
