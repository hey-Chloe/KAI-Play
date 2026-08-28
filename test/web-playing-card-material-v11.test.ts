import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import test from 'node:test';

const gameRoot = resolve(import.meta.dirname, '..');
const stylesSource = await readFile(resolve(gameRoot, 'web/styles.css'), 'utf8');

type CssRule = {
  selectors: string[];
  body: string;
};

type MediaBlock = {
  query: string;
  body: string;
};

function v11Styles(): string {
  const marker = [...stylesSource.matchAll(/\/\*[\s\S]*?\*\//g)]
    .find((match) => /\bV11\b/i.test(match[0]));
  assert.ok(marker?.index !== undefined, 'the playing-card material section should have a V11 marker');
  return stylesSource.slice(marker.index);
}

function cssRules(source: string): CssRule[] {
  const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, '');
  return [...withoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .map((match) => ({
      selectors: match[1]
        .split(',')
        .map((selector) => selector.trim().replace(/\s+/g, ' '))
        .filter((selector) => selector && !selector.startsWith('@')),
      body: match[2],
    }))
    .filter((rule) => rule.selectors.length > 0);
}

function selectorBodies(source: string, selector: string): string[] {
  const normalized = selector.replace(/\s+/g, ' ').trim();
  return cssRules(source)
    .filter((rule) => rule.selectors.includes(normalized))
    .map((rule) => rule.body);
}

function declarations(body: string, property: string): string[] {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return [...body.matchAll(new RegExp(`(?:^|;)\\s*${escaped}\\s*:\\s*([^;}]+)`, 'gi'))]
    .map((match) => match[1].trim());
}

function declarationValues(source: string, selector: string, property: string): string[] {
  return selectorBodies(source, selector).flatMap((body) => declarations(body, property));
}

function normalizeValue(value: string): string {
  return value.toLowerCase().replace(/\s+/g, '');
}

function localAssetUrls(source: string): string[] {
  const urls = [...source.matchAll(/url\(\s*(?:(['"])(.*?)\1|([^\s)]+))\s*\)/gi)]
    .map((match) => match[2] || match[3])
    .map((url) => url.replace(/^\.\//, ''))
    .filter((url) => url.startsWith('assets/'))
    .map((url) => url.slice('assets/'.length));
  return [...new Set(urls)];
}

function jpegDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  const startOfFrame = new Set([
    0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7,
    0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
  ]);
  const readUint16 = (offset: number) => (bytes[offset] << 8) | bytes[offset + 1];
  let offset = 2;

  while (offset + 8 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    while (bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset++];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (marker === 0xd9 || marker === 0xda || offset + 1 >= bytes.length) break;

    const segmentLength = readUint16(offset);
    if (segmentLength < 2 || offset + segmentLength > bytes.length) break;
    if (startOfFrame.has(marker)) {
      return {
        height: readUint16(offset + 3),
        width: readUint16(offset + 5),
      };
    }
    offset += segmentLength;
  }
  return null;
}

function mediaBlocks(source: string): MediaBlock[] {
  const blocks: MediaBlock[] = [];
  for (const match of source.matchAll(/@media\s*([^{}]+)\{/gi)) {
    assert.ok(match.index !== undefined);
    const openBrace = source.indexOf('{', match.index);
    let depth = 1;
    let cursor = openBrace + 1;
    while (cursor < source.length && depth > 0) {
      if (source[cursor] === '{') depth += 1;
      if (source[cursor] === '}') depth -= 1;
      cursor += 1;
    }
    if (depth === 0) {
      blocks.push({
        query: match[1].trim(),
        body: source.slice(openBrace + 1, cursor - 1),
      });
    }
  }
  return blocks;
}

function expandInset(value: string): [string, string, string, string] | null {
  const parts = value.trim().split(/\s+/);
  if (parts.length === 1) return [parts[0], parts[0], parts[0], parts[0]];
  if (parts.length === 2) return [parts[0], parts[1], parts[0], parts[1]];
  if (parts.length === 3) return [parts[0], parts[1], parts[2], parts[1]];
  if (parts.length === 4) return parts as [string, string, string, string];
  return null;
}

function percent(value: string): number | null {
  const match = value.match(/^(-?\d+(?:\.\d+)?)%$/);
  return match ? Number(match[1]) : null;
}

function expandedCustomProperties(source: string, value: string): string {
  const properties = new Map<string, string>();
  for (const rule of cssRules(source)) {
    for (const declaration of rule.body.split(';')) {
      const splitAt = declaration.indexOf(':');
      if (splitAt === -1) continue;
      const name = declaration.slice(0, splitAt).trim();
      if (name.startsWith('--')) properties.set(name, declaration.slice(splitAt + 1).trim());
    }
  }

  let expanded = value;
  for (let pass = 0; pass < 4; pass += 1) {
    const next = expanded.replace(/var\(\s*(--[\w-]+)(?:\s*,[^)]*)?\)/g, (reference, name) => (
      properties.get(name) || reference
    ));
    if (next === expanded) break;
    expanded = next;
  }
  return expanded;
}

test('V11 uses a cache-busted local 512px JPEG card-stock material', async () => {
  const v11 = v11Styles();
  const cardStockAssets = localAssetUrls(v11)
    .filter((file) => /[._-][a-f0-9]{8,}\.jpe?g$/i.test(file));

  assert.ok(cardStockAssets.length > 0, 'V11 should reference at least one content-hashed JPEG');
  for (const file of cardStockAssets) {
    assert.equal(file, basename(file), 'card material URLs must stay inside web/assets');
    assert.match(file, /^[a-z0-9][a-z0-9._-]*[._-][a-f0-9]{8,}\.jpg$/i);

    const path = resolve(gameRoot, 'web/assets', file);
    const [metadata, bytes] = await Promise.all([stat(path), readFile(path)]);
    assert.ok(metadata.size >= 16 * 1024, `${file} is too small to carry a useful paper texture`);
    assert.ok(metadata.size <= 80 * 1024, `${file} exceeds the 80 KiB card-stock budget`);
    assert.deepEqual(jpegDimensions(bytes), { width: 512, height: 512 });

    const nameDigest = file.match(/[._-]([a-f0-9]{8,})\.jpe?g$/i)?.[1].toLowerCase();
    assert.ok(nameDigest, `${file} should end in an 8+ character hexadecimal content digest`);
    const contentDigest = createHash('sha256').update(bytes).digest('hex');
    assert.equal(
      nameDigest,
      contentDigest.slice(0, nameDigest.length),
      `${file} should use the leading characters of its SHA-256 digest`,
    );
  }
});

test('card faces and backs share a physical 9:13 silhouette and restrained stock texture', () => {
  const v11 = v11Styles();
  const base = v11.split(/@media\b/i, 1)[0];
  const hashedJpegs = localAssetUrls(v11).filter((file) => /[._-][a-f0-9]{8,}\.jpg$/i.test(file));
  assert.ok(hashedJpegs.length > 0);

  const selectors = ['.poker.poker-face', '.kai-card-back'] as const;
  const radii: string[] = [];
  for (const selector of selectors) {
    const aspectRatios = declarationValues(base, selector, 'aspect-ratio').map(normalizeValue);
    assert.ok(aspectRatios.includes('9/13'), `${selector} should declare the 9:13 card ratio in V11`);

    const radius = declarationValues(base, selector, 'border-radius').at(-1);
    assert.ok(radius, `${selector} should declare the shared card corner radius in V11`);
    radii.push(normalizeValue(radius));

    const materialBodies = selectorBodies(base, selector).filter((body) => (
      hashedJpegs.some((file) => body.includes(file))
    ));
    assert.ok(materialBodies.length > 0, `${selector} should use the hashed stock JPEG`);
    assert.ok(
      materialBodies.some((body) => (
        [...declarations(body, 'background-image'), ...declarations(body, 'background')]
          .some((value) => /linear-gradient\(/i.test(value))
      )),
      `${selector} should temper the texture with a color/lighting layer`,
    );

    const blendModes = declarationValues(base, selector, 'background-blend-mode');
    assert.ok(
      blendModes.some((value) => /\b(?:soft-light|multiply)\b/i.test(value)),
      `${selector} should blend the paper grain at low contrast`,
    );

    const shadows = declarationValues(base, selector, 'box-shadow')
      .map((value) => expandedCustomProperties(base, value));
    assert.ok(
      shadows.some((shadow) => (
        /(?:^|,)\s*0\s+(?:1|2)px\s+(?:0|1|2|3)px\b/i.test(shadow)
        && /(?:^|,)\s*0\s+(?:3|[4-9]|\d{2,})px\s+(?:[4-9]|\d{2,})px\b/i.test(shadow)
      )),
      `${selector} should combine a close contact shadow with a softer ambient shadow`,
    );
  }

  assert.equal(radii[0], radii[1], 'front and back should use exactly the same corner radius token');
});

test('pip spacing is optically symmetric and court artwork uses contain sizing', () => {
  const v11 = v11Styles();
  const base = v11.split(/@media\b/i, 1)[0];
  const inset = declarationValues(base, '.poker.poker-face .card-pips', 'inset').at(-1);
  assert.ok(inset, 'V11 should rebalance the pip field');

  const expanded = expandInset(inset);
  assert.ok(expanded, 'pip inset should use ordinary CSS box shorthand');
  const percentages = expanded.map(percent);
  assert.ok(percentages.every((value) => value !== null), 'pip insets should be expressed as percentages');
  const [top, right, bottom, left] = percentages as [number, number, number, number];
  assert.ok(Math.abs(left - right) <= 3, 'left and right pip gutters should be visually symmetric');
  assert.ok(Math.abs(top - bottom) <= 3, 'top and bottom pip gutters should be visually symmetric');
  assert.ok(left <= 18 && right <= 18, 'the pip field should no longer be pushed into one side of the card');

  for (const selector of ['.poker.poker-face .card-court', '.poker.poker-face .joker-face']) {
    const sizes = declarationValues(base, selector, 'background-size');
    const backgrounds = declarationValues(base, selector, 'background');
    assert.ok(
      sizes.some((value) => /^contain(?:\s|$)/i.test(value))
        || backgrounds.some((value) => /\/\s*contain(?:\s|$)/i.test(value)),
      `${selector} should contain rather than stretch its artwork`,
    );
  }
});

test('compact phone cards remove texture and secondary marks but retain the top-left index', () => {
  const v11 = v11Styles();
  const compactBlocks = mediaBlocks(v11).filter(({ query }) => {
    const width = query.match(/max-width\s*:\s*(\d+(?:\.\d+)?)px/i);
    return width && Number(width[1]) <= 560;
  });
  assert.ok(compactBlocks.length > 0, 'V11 should include a compact-card phone breakpoint');
  const compact = compactBlocks.map((block) => block.body).join('\n');
  const hashedJpegs = localAssetUrls(v11).filter((file) => /[._-][a-f0-9]{8,}\.jpg$/i.test(file));
  assert.ok(hashedJpegs.length > 0);

  for (const selector of ['.poker.poker-face', '.kai-card-back']) {
    const compactBackgrounds = [
      ...declarationValues(compact, selector, 'background-image'),
      ...declarationValues(compact, selector, 'background'),
    ];
    assert.ok(compactBackgrounds.length > 0, `${selector} should explicitly replace its textured background on phones`);
    assert.ok(
      compactBackgrounds.every((value) => hashedJpegs.every((file) => !value.includes(file))),
      `${selector} should not paint the stock JPEG at compact sizes`,
    );
  }

  const hiddenSelectors = cssRules(compact)
    .filter((rule) => declarations(rule.body, 'display').some((value) => normalizeValue(value) === 'none'))
    .flatMap((rule) => rule.selectors);
  assert.ok(hiddenSelectors.some((selector) => /\.card-signature\b/.test(selector)));
  assert.ok(hiddenSelectors.some((selector) => /\.card-index-bottom\b/.test(selector)));
  assert.ok(
    hiddenSelectors
      .filter((selector) => /\.card-index(?![-\w])/.test(selector))
      .every((selector) => /\.card-index-bottom\b/.test(selector)),
    'the compact hide rule must not remove the primary top-left card index',
  );

  const topIndexBodies = selectorBodies(stylesSource, '.poker.poker-face .card-index');
  assert.ok(topIndexBodies.some((body) => (
    declarations(body, 'left').length > 0 && declarations(body, 'top').length > 0
  )), 'the retained primary index should remain anchored at the top-left');
});

test('reduced-motion continues to disable card animation and transitions', () => {
  const reducedMotionBlocks = mediaBlocks(stylesSource)
    .filter(({ query }) => /prefers-reduced-motion\s*:\s*reduce/i.test(query));
  assert.ok(reducedMotionBlocks.length > 0);

  const hasCardSafetyRule = reducedMotionBlocks.some(({ body }) => {
    const rules = cssRules(body);
    return rules.some((rule) => (
      rule.selectors.includes('.poker.poker-face')
      && rule.selectors.includes('.kai-card-back')
      && declarations(rule.body, 'animation').some((value) => /^none\s*!important$/i.test(value))
      && declarations(rule.body, 'transition').some((value) => /^none\s*!important$/i.test(value))
    ));
  });
  assert.ok(hasCardSafetyRule, 'face and back should remain static when reduced motion is requested');
});
