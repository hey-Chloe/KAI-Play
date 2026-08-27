import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

const gameRoot = resolve(import.meta.dirname, '..');
const appSource = await readFile(resolve(gameRoot, 'web/app.js'), 'utf8');
const stylesSource = await readFile(resolve(gameRoot, 'web/styles.css'), 'utf8');
const v8Styles = stylesSource.slice(stylesSource.indexOf('/* V8:'));

test('playing cards use mirrored indices, pip patterns and a restrained hand fan', () => {
  assert.match(appSource, /PIP_PATTERNS/);
  assert.match(appSource, /card-index-bottom/);
  assert.match(appSource, /card-pips card-pips-/);
  assert.match(appSource, /--card-angle:/);
  assert.match(appSource, /--card-curve:/);
  assert.match(v8Styles, /aspect-ratio:\s*9 \/ 13/);
  assert.match(v8Styles, /\.hand-dock \.poker\.hand-card\.selected/);
});

test('Mahjong reuses one semantic mark across hand, river and preview tiles', () => {
  assert.match(appSource, /function mahjongMark\(/);
  assert.match(appSource, /MAHJONG_HONORS/);
  assert.match(appSource, /mahjongFace[\s\S]*mahjongMark\(tile\)/);
  assert.match(appSource, /mahjongTile[\s\S]*mahjongMark\(tile\)/);
  assert.match(appSource, /previewTiles[\s\S]*mahjongMark\(tile\)/);
  assert.match(v8Styles, /\.symbol-tong/);
  assert.match(v8Styles, /\.symbol-tiao/);
  assert.match(v8Styles, /\.mark-blank::before/);
});

test('the Mahjong wall has four physical sides and readable bot identities', () => {
  for (const side of ['north', 'east', 'south', 'west']) {
    assert.match(appSource, new RegExp(`['"]${side}['"]`));
    assert.match(v8Styles, new RegExp(`wall-track--${side}`));
  }
  assert.match(appSource, /remainingStacks/);
  assert.match(appSource, /String\.fromCharCode\(64 \+ seat\)/);
});

test('generated V5 felt and leather textures are local and active', async () => {
  for (const [file, minimumBytes] of [
    ['kai-felt-v5.jpg', 100_000],
    ['kai-leather-v5.jpg', 100_000],
  ] as const) {
    assert.ok((await stat(resolve(gameRoot, 'web/assets', file))).size >= minimumBytes);
    assert.match(v8Styles, new RegExp(file.replace('.', '\\.')));
  }
});
