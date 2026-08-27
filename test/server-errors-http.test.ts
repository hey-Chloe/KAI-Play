import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

type ErrorPayload = { ok: false; error: { code: string; message: string } };

test('HTTP boundary rejects malformed, unauthorized and stale mutations without corrupting a game', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'doujoy-http-errors-'));
  const port = 5_600 + Math.floor(Math.random() * 300);
  const origin = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['--experimental-strip-types', resolve('server/src/server.ts')], {
    cwd: resolve('.'),
    env: { ...process.env, DOUJOY_PORT: String(port), DOUJOY_DATA_PATH: join(directory, 'state.json') },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const payload = async <T>(response: Response) => ({ response, body: await response.json() as T });
  const authorized = (token: string, body?: string, requestId?: string) => ({
    authorization: `Bearer ${token}`,
    ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    ...(requestId ? { 'x-request-id': requestId } : {}),
  });

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

    const unauthorized = await payload<ErrorPayload>(await fetch(`${origin}/v1/me`));
    assert.equal(unauthorized.response.status, 401);
    assert.equal(unauthorized.body.error.code, 'UNAUTHORIZED');
    assert.equal(unauthorized.response.headers.get('cache-control'), 'no-store');
    assert.equal(unauthorized.response.headers.get('x-content-type-options'), 'nosniff');

    const malformed = await payload<ErrorPayload>(await fetch(`${origin}/v1/sessions/guest`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{',
    }));
    assert.equal(malformed.response.status, 400);
    assert.equal(malformed.body.error.code, 'INVALID_JSON');

    for (const invalidRoot of ['null', '[]']) {
      const invalidShape = await payload<ErrorPayload>(await fetch(`${origin}/v1/sessions/guest`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: invalidRoot,
      }));
      assert.equal(invalidShape.response.status, 400, `${invalidRoot} must not be accepted as an object body`);
      assert.equal(invalidShape.body.error.code, 'INVALID_JSON');
    }

    const oversized = await payload<ErrorPayload>(await fetch(`${origin}/v1/sessions/guest`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'x'.repeat(66_000) }),
    }));
    assert.equal(oversized.response.status, 413);
    assert.equal(oversized.body.error.code, 'BODY_TOO_LARGE');

    const session = await payload<{ token: string }>(await fetch(`${origin}/v1/sessions/guest`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: '边界测试' }),
    }));
    const token = session.body.token;
    const quick = await payload<{ game: { id: string; sequence: number } }>(await fetch(`${origin}/v1/games/quick`, {
      method: 'POST', headers: authorized(token, '{}'), body: '{}',
    }));
    assert.equal(quick.body.game.sequence, 0);

    const missingVersion = await payload<ErrorPayload>(await fetch(`${origin}/v1/games/${quick.body.game.id}/wait`, {
      headers: authorized(token),
    }));
    assert.equal(missingVersion.response.status, 400);
    assert.equal(missingVersion.body.error.code, 'VERSION_REQUIRED');

    const wrongWaitMethod = await payload<ErrorPayload>(await fetch(`${origin}/v1/games/${quick.body.game.id}/wait`, {
      method: 'POST', headers: authorized(token, '{}', 'must-not-be-an-action'), body: '{}',
    }));
    assert.ok([404, 405].includes(wrongWaitMethod.response.status));
    assert.ok(['NOT_FOUND', 'METHOD_NOT_ALLOWED'].includes(wrongWaitMethod.body.error.code));
    const afterWrongMethod = await payload<{ game: { sequence: number } }>(await fetch(`${origin}/v1/games/${quick.body.game.id}`, {
      headers: authorized(token),
    }));
    assert.equal(afterWrongMethod.body.game.sequence, 0, 'POST /wait must never be interpreted as a game action');

    const invalidJoinShape = await payload<ErrorPayload>(await fetch(`${origin}/v1/rooms/join`, {
      method: 'POST', headers: authorized(token, '[]'), body: '[]',
    }));
    assert.equal(invalidJoinShape.response.status, 400);
    assert.equal(invalidJoinShape.body.error.code, 'INVALID_JSON');

    const missingRequestId = await payload<ErrorPayload>(await fetch(`${origin}/v1/games/${quick.body.game.id}/bid`, {
      method: 'POST', headers: authorized(token, '{}'), body: JSON.stringify({ expectedSequence: 0, score: 3 }),
    }));
    assert.equal(missingRequestId.response.status, 400);
    assert.equal(missingRequestId.body.error.code, 'REQUEST_ID_REQUIRED');

    const invalid = await payload<ErrorPayload>(await fetch(`${origin}/v1/games/${quick.body.game.id}/bid`, {
      method: 'POST', headers: authorized(token, '{}', 'retryable-action'), body: JSON.stringify({ expectedSequence: 0, score: 4 }),
    }));
    assert.equal(invalid.response.status, 409);
    assert.equal(invalid.body.error.code, 'INVALID_BID');

    const unchanged = await payload<{ game: { sequence: number; phase: string } }>(await fetch(`${origin}/v1/games/${quick.body.game.id}`, {
      headers: authorized(token),
    }));
    assert.equal(unchanged.body.game.sequence, 0);
    assert.equal(unchanged.body.game.phase, 'bidding');

    const accepted = await payload<{ game: { sequence: number; phase: string } }>(await fetch(`${origin}/v1/games/${quick.body.game.id}/bid`, {
      method: 'POST', headers: authorized(token, '{}', 'retryable-action'), body: JSON.stringify({ expectedSequence: 0, score: 3 }),
    }));
    assert.equal(accepted.response.status, 200);
    assert.equal(accepted.body.game.sequence, 1);
    assert.equal(accepted.body.game.phase, 'playing');

    const replay = await payload<{ game: { sequence: number } }>(await fetch(`${origin}/v1/games/${quick.body.game.id}/bid`, {
      method: 'POST', headers: authorized(token, '{}', 'retryable-action'), body: JSON.stringify({ expectedSequence: 0, score: 3 }),
    }));
    assert.equal(replay.response.status, 200);
    assert.equal(replay.body.game.sequence, 1);

    const conflictingReplay = await payload<ErrorPayload>(await fetch(`${origin}/v1/games/${quick.body.game.id}/bid`, {
      method: 'POST', headers: authorized(token, '{}', 'retryable-action'), body: JSON.stringify({ expectedSequence: 0, score: 2 }),
    }));
    assert.equal(conflictingReplay.response.status, 409);
    assert.equal(conflictingReplay.body.error.code, 'IDEMPOTENCY_CONFLICT');

    const stale = await payload<ErrorPayload>(await fetch(`${origin}/v1/games/${quick.body.game.id}/bid`, {
      method: 'POST', headers: authorized(token, '{}', 'stale-action'), body: JSON.stringify({ expectedSequence: 0, score: 3 }),
    }));
    assert.equal(stale.response.status, 409);
    assert.equal(stale.body.error.code, 'STALE_GAME');

    const notFound = await payload<ErrorPayload>(await fetch(`${origin}/v1/does-not-exist`, { headers: authorized(token) }));
    assert.equal(notFound.response.status, 404);
    assert.equal(notFound.body.error.code, 'NOT_FOUND');
  } finally {
    if (child.exitCode === null) {
      child.kill();
      await Promise.race([once(child, 'exit'), new Promise((resolveTimeout) => setTimeout(resolveTimeout, 2_000))]);
    }
    await rm(directory, { recursive: true, force: true });
  }
});
