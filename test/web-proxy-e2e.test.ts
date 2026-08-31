import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

async function ready(child: ChildProcess, marker: string) {
  await new Promise<void>((resolveReady, reject) => {
    const timer = setTimeout(() => reject(new Error(`START_TIMEOUT: ${marker}`)), 10_000);
    child.stdout?.on('data', (chunk) => {
      if (String(chunk).includes(marker)) {
        clearTimeout(timer);
        resolveReady();
      }
    });
    child.once('exit', (code) => reject(new Error(`PROCESS_EXITED_${code}: ${marker}`)));
  });
}

async function stop(child: ChildProcess) {
  if (child.exitCode !== null) return;
  child.kill();
  await Promise.race([once(child, 'exit'), new Promise((resolveTimeout) => setTimeout(resolveTimeout, 2_000))]);
}

test('web preview serves cache-aware local assets and proxies a complete authenticated quick-play flow', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'doujoy-web-e2e-'));
  const offset = Math.floor(Math.random() * 250);
  const serverPort = 6_000 + offset;
  const webPort = 6_400 + offset;
  const webOrigin = `http://127.0.0.1:${webPort}`;
  const server = spawn(process.execPath, ['--experimental-strip-types', resolve('server/src/server.ts')], {
    cwd: resolve('.'),
    env: { ...process.env, DOUJOY_PORT: String(serverPort), DOUJOY_DATA_PATH: join(directory, 'state.json') },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let web: ChildProcess | null = null;

  try {
    await ready(server, 'DouJoy server listening');
    web = spawn(process.execPath, [resolve('web/serve.mjs')], {
      cwd: resolve('.'),
      env: {
        ...process.env,
        DOUJOY_WEB_PORT: String(webPort),
        DOUJOY_WEB_UPSTREAM: `http://127.0.0.1:${serverPort}`,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    await ready(web, 'DouJoy web preview listening');

    const index = await fetch(`${webOrigin}/`);
    assert.equal(index.status, 200);
    assert.match(index.headers.get('content-type') ?? '', /^text\/html/);
    assert.match(await index.text(), /<script type="module" src="\.\/app\.js"><\/script>/);

    const asset = await fetch(`${webOrigin}/assets/kai-card-back.svg`);
    assert.equal(asset.status, 200);
    assert.match(asset.headers.get('content-type') ?? '', /^image\/svg\+xml/);
    assert.equal(asset.headers.get('cache-control'), 'public, max-age=3600, must-revalidate');
    const etag = asset.headers.get('etag');
    assert.ok(etag, 'static assets should expose a validator');
    assert.match(await asset.text(), /<svg/);
    const cached = await fetch(`${webOrigin}/assets/kai-card-back.svg`, { headers: { 'if-none-match': etag } });
    assert.equal(cached.status, 304);
    assert.equal(await cached.text(), '');

    const cardStock = await fetch(`${webOrigin}/assets/kai-card-stock-6912c163.jpg`);
    assert.equal(cardStock.status, 200);
    assert.match(cardStock.headers.get('content-type') ?? '', /^image\/jpeg/);
    const cardStockCache = new Set(
      (cardStock.headers.get('cache-control') ?? '').split(',').map((directive) => directive.trim().toLowerCase()),
    );
    assert.ok(cardStockCache.has('public'));
    assert.ok(cardStockCache.has('max-age=31536000'));
    assert.ok(cardStockCache.has('immutable'));
    const cardStockEtag = cardStock.headers.get('etag');
    assert.ok(cardStockEtag, 'generated card stock must expose a validator');
    assert.ok((await cardStock.arrayBuffer()).byteLength > 40_000, 'card stock texture must not be an empty placeholder');
    const cachedCardStock = await fetch(`${webOrigin}/assets/kai-card-stock-6912c163.jpg`, { headers: { 'if-none-match': cardStockEtag } });
    assert.equal(cachedCardStock.status, 304);
    assert.equal(cachedCardStock.headers.get('etag'), cardStockEtag);
    assert.equal(cachedCardStock.headers.get('cache-control'), 'public, max-age=31536000, immutable');
    assert.equal((await cachedCardStock.arrayBuffer()).byteLength, 0);

    const court = await fetch(`${webOrigin}/assets/cards/kai-court-j-spade-ef29a894.svg`);
    assert.equal(court.status, 200);
    assert.match(court.headers.get('content-type') ?? '', /^image\/svg\+xml/);
    assert.equal(court.headers.get('cache-control'), 'public, max-age=31536000, immutable');
    const courtEtag = court.headers.get('etag');
    assert.ok(courtEtag, 'fingerprinted court art must expose a validator');
    assert.match(await court.text(), /^<svg\b/);
    const cachedCourt = await fetch(`${webOrigin}/assets/cards/kai-court-j-spade-ef29a894.svg`, {
      headers: { 'if-none-match': courtEtag },
    });
    assert.equal(cachedCourt.status, 304);
    assert.equal(cachedCourt.headers.get('etag'), courtEtag);
    assert.equal(cachedCourt.headers.get('cache-control'), 'public, max-age=31536000, immutable');

    for (const path of [
      '/styles.css', '/app.js', '/sudoku6.js',
      '/gomoku.js', '/memory-match.js', '/snake.js', '/farm.js',
    ]) {
      const compressed = await fetch(`${webOrigin}${path}`, { headers: { 'accept-encoding': 'br' } });
      assert.equal(compressed.status, 200);
      assert.equal(compressed.headers.get('content-encoding'), 'br', `${path} must use Brotli when the client accepts it`);
      assert.match(compressed.headers.get('vary') ?? '', /accept-encoding/i);
      await compressed.arrayBuffer();
    }

    const sessionResponse = await fetch(`${webOrigin}/api/v1/sessions/guest`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: '代理端到端' }),
    });
    assert.equal(sessionResponse.status, 201);
    const session = await sessionResponse.json() as { ok: boolean; token: string; profile: { id: string } };
    assert.equal(session.ok, true);

    const profileResponse = await fetch(`${webOrigin}/api/v1/me`, { headers: { 'x-doujoy-token': session.token } });
    assert.equal(profileResponse.status, 200, 'the preview must translate x-doujoy-token to Authorization');
    const profile = await profileResponse.json() as { profile: { id: string } };
    assert.equal(profile.profile.id, session.profile.id);

    const quickResponse = await fetch(`${webOrigin}/api/v1/games/quick`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-doujoy-token': session.token },
      body: '{}',
    });
    assert.equal(quickResponse.status, 201);
    const quick = await quickResponse.json() as { ok: boolean; game: { id: string; phase: string; hand: unknown[] } };
    assert.equal(quick.ok, true);
    assert.equal(quick.game.phase, 'bidding');
    assert.equal(quick.game.hand.length, 17);
    assert.equal(quickResponse.headers.get('cache-control'), 'no-store');

    const malformedPath = await fetch(`${webOrigin}/%E0%A4%A`);
    assert.ok([400, 404].includes(malformedPath.status));
    const stillHealthy = await fetch(`${webOrigin}/`);
    assert.equal(stillHealthy.status, 200, 'one malformed percent path must not terminate the preview process');
  } finally {
    if (web) await stop(web);
    await stop(server);
    await rm(directory, { recursive: true, force: true });
  }
});
