import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');
const styles = await readFile(resolve(root, 'web/styles.css'), 'utf8');
const app = await readFile(resolve(root, 'web/app.js'), 'utf8');
const manifest = JSON.parse(await readFile(resolve(root, 'docs/asset-provenance/game-covers-v1.json'), 'utf8')) as {
  assets: Array<{ gameId: string; file: string; sha256: string }>;
};

test('each catalog game has one unique fingerprinted production cover', async () => {
  const catalog = app.slice(app.indexOf('const CATALOG_GAME_IDS'), app.indexOf('const GAME_CONTENT'));
  const cardIds = [...catalog.matchAll(/'([^']+)'/g)].map((match) => match[1]);
  assert.equal(cardIds.length, 25);
  assert.equal(new Set(cardIds).size, 25);
  assert.equal(manifest.assets.length, 25);
  assert.deepEqual(new Set(manifest.assets.map((asset) => asset.gameId)), new Set(cardIds));
  assert.equal(new Set(manifest.assets.map((asset) => asset.file)).size, 25);

  for (const asset of manifest.assets) {
    assert.match(asset.file, new RegExp(`kai-cover-${asset.gameId}-v1-[a-f0-9]{8}\\.jpg$`));
    assert.match(styles, new RegExp(`\\.world-${asset.gameId.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}[^}]*${asset.file.replace('web', '')}`));
    const bytes = await readFile(resolve(root, asset.file));
    assert.ok((await stat(resolve(root, asset.file))).size > 50_000, `${asset.gameId} cover is too small to be a production asset`);
    assert.equal(bytes[0], 0xff);
    assert.equal(bytes[1], 0xd8);
  }
});

test('cover media remains decorative while the game state and actions stay in DOM', () => {
  const v25 = styles.slice(styles.indexOf('/* V25'));
  assert.match(v25, /background-image:var\(--game-cover\)/);
  assert.match(v25, /\.world-cover-mark \{ display:none!important; \}/);
  assert.match(v25, /grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/);
  assert.match(v25, /max-width:560px[\s\S]*?repeat\(2,minmax\(0,1fr\)\)/);
  assert.equal((app.match(/data-action="(?:quick|open-[^"]+)"/g) ?? []).length >= 18, true);
  assert.match(app, /QUICK_GAME_KINDS\.map/);
  assert.match(app, /data-world-resumable/);
  assert.match(app, /data-catalog-result aria-live="polite"/);
});
