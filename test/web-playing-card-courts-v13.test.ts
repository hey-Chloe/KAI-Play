import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import test from 'node:test';

const gameRoot = resolve(import.meta.dirname, '..');
const cardsDirectory = resolve(gameRoot, 'web/assets/cards');
const stylesSource = await readFile(resolve(gameRoot, 'web/styles.css'), 'utf8');

const COURT_ASSETS = {
  'j:club': 'kai-court-j-club-3152a7a5.svg',
  'j:diamond': 'kai-court-j-diamond-1227624f.svg',
  'j:heart': 'kai-court-j-heart-59743a5f.svg',
  'j:spade': 'kai-court-j-spade-ef29a894.svg',
  'q:club': 'kai-court-q-club-023d6c89.svg',
  'q:diamond': 'kai-court-q-diamond-ff4c35ab.svg',
  'q:heart': 'kai-court-q-heart-b9086e1d.svg',
  'q:spade': 'kai-court-q-spade-6b8434bc.svg',
  'k:club': 'kai-court-k-club-d3bbb664.svg',
  'k:diamond': 'kai-court-k-diamond-d17bb7e9.svg',
  'k:heart': 'kai-court-k-heart-5cece963.svg',
  'k:spade': 'kai-court-k-spade-18b4c6ab.svg',
} as const;

const JOKER_ASSETS = {
  'big-joker:joker': 'kai-joker-big-65f2baa2.svg',
  'small-joker:joker': 'kai-joker-small-3761b22b.svg',
} as const;

const EXPECTED_ASSETS = [...Object.values(COURT_ASSETS), ...Object.values(JOKER_ASSETS)].sort();

type CssRule = {
  selectors: string[];
  body: string;
};

type ConditionalBlock = {
  query: string;
  body: string;
};

type XmlElement = {
  name: string;
  attributes: Map<string, string>;
};

function versionSection(source: string, version: number): string {
  const comments = [...source.matchAll(/\/\*[\s\S]*?\*\//g)];
  const markerPattern = new RegExp(`^/\\*\\s*V${version}\\s*:`, 'i');
  const marker = comments.find((comment) => markerPattern.test(comment[0]));
  assert.ok(marker?.index !== undefined, `missing V${version} stylesheet marker`);
  const nextVersion = comments.find((comment) => (
    (comment.index ?? -1) > marker.index!
    && /^\/\*\s*V\d+\s*:/i.test(comment[0])
    && !markerPattern.test(comment[0])
  ));
  return source.slice(marker.index, nextVersion?.index ?? source.length);
}

function splitSelectorList(selectorList: string): string[] {
  const selectors: string[] = [];
  let current = '';
  let bracketDepth = 0;
  let parenthesisDepth = 0;
  let quote = '';

  for (let index = 0; index < selectorList.length; index += 1) {
    const character = selectorList[index];
    const previous = selectorList[index - 1];
    if (quote) {
      current += character;
      if (character === quote && previous !== '\\') quote = '';
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      current += character;
      continue;
    }
    if (character === '[') bracketDepth += 1;
    if (character === ']') bracketDepth -= 1;
    if (character === '(') parenthesisDepth += 1;
    if (character === ')') parenthesisDepth -= 1;
    if (character === ',' && bracketDepth === 0 && parenthesisDepth === 0) {
      selectors.push(current.trim());
      current = '';
      continue;
    }
    current += character;
  }
  selectors.push(current.trim());
  return selectors.filter(Boolean);
}

function cssRules(source: string): CssRule[] {
  const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, '');
  return [...withoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .map((match) => ({
      selectors: splitSelectorList(match[1]).filter((selector) => !selector.startsWith('@')),
      body: match[2],
    }))
    .filter((rule) => rule.selectors.length > 0);
}

function attributeSelector(selector: string, name: string, value: string): boolean {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\[\\s*${name}\\s*=\\s*(["'])${escaped}\\1\\s*\\]`, 'i').test(selector);
}

function assetUrls(body: string): string[] {
  return [...body.matchAll(/url\(\s*(["']?)([^"')]+)\1\s*\)/gi)]
    .map((match) => match[2].trim().replace(/^\.\//, ''))
    .filter((url) => url.startsWith('assets/cards/'));
}

function rulesForCard(section: string, rank: string, suit: string, target: string): CssRule[] {
  return cssRules(section).filter((rule) => rule.selectors.some((selector) => (
    selector.includes(target)
    && attributeSelector(selector, 'data-rank', rank)
    && attributeSelector(selector, 'data-suit', suit)
  )));
}

function conditionalBlocks(source: string, atRule: 'container'): ConditionalBlock[] {
  const blocks: ConditionalBlock[] = [];
  const pattern = new RegExp(`@${atRule}\\s*([^{}]+)\\{`, 'gi');
  for (const match of source.matchAll(pattern)) {
    assert.ok(match.index !== undefined);
    const openBrace = source.indexOf('{', match.index);
    let depth = 1;
    let cursor = openBrace + 1;
    while (cursor < source.length && depth > 0) {
      if (source[cursor] === '{') depth += 1;
      if (source[cursor] === '}') depth -= 1;
      cursor += 1;
    }
    assert.equal(depth, 0, `unterminated @${atRule} block: ${match[1].trim()}`);
    blocks.push({ query: match[1].trim(), body: source.slice(openBrace + 1, cursor - 1) });
  }
  return blocks;
}

function declarationValues(body: string, property: string): string[] {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return [...body.matchAll(new RegExp(`(?:^|;)\\s*${escaped}\\s*:\\s*([^;}]+)`, 'gi'))]
    .map((match) => match[1].trim().toLowerCase().replace(/\s+/g, ''));
}

function assertEntities(value: string, context: string): void {
  const withoutEntities = value.replace(/&(?:amp|lt|gt|quot|apos|#\d+|#x[\da-f]+);/gi, '');
  assert.equal(withoutEntities.includes('&'), false, `${context} contains an invalid XML entity`);
}

function parseAttributes(source: string, context: string): Map<string, string> {
  const attributes = new Map<string, string>();
  let cursor = 0;
  while (cursor < source.length) {
    while (/\s/.test(source[cursor] ?? '')) cursor += 1;
    if (cursor >= source.length) break;
    const nameMatch = source.slice(cursor).match(/^[A-Za-z_:][A-Za-z0-9_.:-]*/);
    assert.ok(nameMatch, `${context} has an invalid attribute name near ${JSON.stringify(source.slice(cursor, cursor + 24))}`);
    const name = nameMatch[0];
    cursor += name.length;
    while (/\s/.test(source[cursor] ?? '')) cursor += 1;
    assert.equal(source[cursor], '=', `${context} attribute ${name} must have a value`);
    cursor += 1;
    while (/\s/.test(source[cursor] ?? '')) cursor += 1;
    const quote = source[cursor];
    assert.ok(quote === '"' || quote === "'", `${context} attribute ${name} must be quoted`);
    cursor += 1;
    const end = source.indexOf(quote, cursor);
    assert.notEqual(end, -1, `${context} attribute ${name} is unterminated`);
    const value = source.slice(cursor, end);
    assert.equal(value.includes('<'), false, `${context} attribute ${name} contains an unescaped <`);
    assertEntities(value, `${context} attribute ${name}`);
    assert.equal(attributes.has(name), false, `${context} repeats attribute ${name}`);
    attributes.set(name, value);
    cursor = end + 1;
  }
  return attributes;
}

function parseSvgXml(source: string, file: string): XmlElement[] {
  const elements: XmlElement[] = [];
  const stack: string[] = [];
  let cursor = 0;
  let rootClosed = false;

  while (cursor < source.length) {
    if (source[cursor] !== '<') {
      const nextTag = source.indexOf('<', cursor);
      const end = nextTag === -1 ? source.length : nextTag;
      const text = source.slice(cursor, end);
      assertEntities(text, `${file} text`);
      if (stack.length === 0) assert.match(text, /^\s*$/, `${file} has text outside its root element`);
      cursor = end;
      continue;
    }

    if (source.startsWith('<!--', cursor)) {
      const end = source.indexOf('-->', cursor + 4);
      assert.notEqual(end, -1, `${file} has an unterminated XML comment`);
      assert.equal(source.slice(cursor + 4, end).includes('--'), false, `${file} has an invalid XML comment`);
      cursor = end + 3;
      continue;
    }
    if (source.startsWith('<![CDATA[', cursor)) {
      assert.ok(stack.length > 0, `${file} has CDATA outside its root element`);
      const end = source.indexOf(']]>', cursor + 9);
      assert.notEqual(end, -1, `${file} has unterminated CDATA`);
      cursor = end + 3;
      continue;
    }
    if (source.startsWith('<?', cursor)) {
      const end = source.indexOf('?>', cursor + 2);
      assert.notEqual(end, -1, `${file} has an unterminated processing instruction`);
      const instruction = source.slice(cursor + 2, end).trim();
      assert.ok(cursor === 0 && /^xml\s+version\s*=\s*["']1\.0["'](?:\s+encoding\s*=\s*["']UTF-8["'])?$/i.test(instruction), `${file} has a forbidden processing instruction`);
      cursor = end + 2;
      continue;
    }
    assert.equal(source.startsWith('<!', cursor), false, `${file} contains a forbidden XML declaration`);

    let end = cursor + 1;
    let quote = '';
    for (; end < source.length; end += 1) {
      const character = source[end];
      if (quote) {
        if (character === quote) quote = '';
      } else if (character === '"' || character === "'") {
        quote = character;
      } else if (character === '>') {
        break;
      }
    }
    assert.ok(end < source.length, `${file} has an unterminated XML tag`);
    const rawTag = source.slice(cursor + 1, end);

    if (rawTag.startsWith('/')) {
      const closing = rawTag.slice(1).trim();
      assert.match(closing, /^[A-Za-z_:][A-Za-z0-9_.:-]*$/, `${file} has an invalid closing tag`);
      assert.equal(stack.pop(), closing, `${file} has a mismatched closing tag </${closing}>`);
      if (stack.length === 0) rootClosed = true;
    } else {
      const selfClosing = /\/\s*$/.test(rawTag);
      const opening = selfClosing ? rawTag.replace(/\/\s*$/, '').trimEnd() : rawTag;
      const nameMatch = opening.match(/^([A-Za-z_:][A-Za-z0-9_.:-]*)/);
      assert.ok(nameMatch, `${file} has an invalid opening tag`);
      const name = nameMatch[1];
      if (stack.length === 0) {
        assert.equal(rootClosed, false, `${file} has more than one root element`);
        assert.equal(elements.length, 0, `${file} has more than one root element`);
      }
      const attributes = parseAttributes(opening.slice(name.length), `${file} <${name}>`);
      elements.push({ name, attributes });
      if (!selfClosing) stack.push(name);
      else if (stack.length === 0) rootClosed = true;
    }
    cursor = end + 1;
  }

  assert.deepEqual(stack, [], `${file} has unclosed XML elements`);
  assert.ok(rootClosed && elements.length > 0, `${file} must contain one complete XML root`);
  return elements;
}

test('V13 maps every suit-specific court and both jokers to its fingerprinted local SVG', () => {
  const v13 = versionSection(stylesSource, 13);
  const mappings = { ...COURT_ASSETS, ...JOKER_ASSETS };

  for (const [key, expectedFile] of Object.entries(mappings)) {
    const [rank, suit] = key.split(':');
    const target = suit === 'joker' ? '.joker-face' : '.card-court';
    const rules = rulesForCard(v13, rank, suit, target);
    assert.ok(rules.length > 0, `missing V13 ${rank}/${suit} ${target} mapping`);
    const urls = [...new Set(rules.flatMap((rule) => assetUrls(rule.body)))];
    assert.deepEqual(urls, [`assets/cards/${expectedFile}`], `${rank}/${suit} must map to its exact fingerprinted asset`);
  }

  const referenced = [...new Set(assetUrls(v13))]
    .map((url) => basename(url))
    .sort();
  assert.deepEqual(referenced, EXPECTED_ASSETS, 'V13 must reference exactly the reviewed 12 court and 2 Joker assets');
});

test('the reviewed card-art directory has exact SHA-256 names, valid transparent SVGs and a bounded footprint', async () => {
  const actualAssets = (await readdir(cardsDirectory)).filter((file) => file.endsWith('.svg')).sort();
  assert.deepEqual(actualAssets, EXPECTED_ASSETS, 'card-art additions require an explicit V13 review and manifest update');

  let totalBytes = 0;
  for (const file of EXPECTED_ASSETS) {
    const contents = await readFile(resolve(cardsDirectory, file));
    const source = contents.toString('utf8');
    totalBytes += contents.byteLength;
    assert.ok(contents.byteLength >= 1_024, `${file} must not be an empty placeholder`);
    assert.ok(contents.byteLength <= 64 * 1_024, `${file} exceeds the 64 KiB raw SVG budget`);

    const nameDigest = file.match(/-([a-f\d]{8})\.svg$/i)?.[1];
    assert.ok(nameDigest, `${file} must contain an eight-character SHA-256 prefix`);
    const digest = createHash('sha256').update(contents).digest('hex');
    assert.equal(digest.startsWith(nameDigest.toLowerCase()), true, `${file} fingerprint does not match SHA-256 ${digest}`);

    assert.doesNotMatch(source, /<!DOCTYPE/i, `${file} must not enable DTD or entity expansion`);
    assert.doesNotMatch(source, /\bdata\s*:/i, `${file} must not embed data URLs`);
    assert.doesNotMatch(source, /@import\b/i, `${file} must not import external styles`);
    for (const match of source.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)'"\s]+))\s*\)/gi)) {
      const url = match[1] ?? match[2] ?? match[3] ?? '';
      assert.match(url, /^#[A-Za-z_][\w:.-]*$/, `${file} has an external or malformed url() reference: ${url}`);
    }

    const elements = parseSvgXml(source, file);
    const root = elements[0];
    assert.equal(root.name, 'svg', `${file} root element must be <svg>`);
    assert.equal(root.attributes.get('xmlns'), 'http://www.w3.org/2000/svg');
    assert.equal(root.attributes.has('width'), false, `${file} must be viewBox-cropped rather than fixed to a card canvas`);
    assert.equal(root.attributes.has('height'), false, `${file} must be viewBox-cropped rather than fixed to a card canvas`);
    assert.equal(root.attributes.has('style'), false, `${file} root must remain transparent`);
    assert.equal(root.attributes.has('fill'), false, `${file} root must not paint an opaque canvas`);
    const viewBox = (root.attributes.get('viewBox') ?? '').trim().split(/[\s,]+/).map(Number);
    assert.equal(viewBox.length, 4, `${file} must define a four-number cropped viewBox`);
    assert.ok(viewBox.every(Number.isFinite), `${file} viewBox must contain finite numbers`);
    assert.ok(viewBox[2] > 0 && viewBox[3] > 0, `${file} viewBox must have positive dimensions`);
    const sourceCanvasArea = file.includes('joker') ? 360 * 540 : 240 * 336;
    assert.ok(viewBox[2] * viewBox[3] < sourceCanvasArea, `${file} must be cropped inside its source card canvas`);

    assert.ok(elements.some((element) => element.name === 'path'), `${file} must contain vector artwork`);
    for (const element of elements) {
      const tag = element.name.toLowerCase();
      assert.notEqual(tag, 'rect', `${file} must not contain an opaque card/background rectangle`);
      assert.notEqual(tag, 'script', `${file} must not contain scripts`);
      assert.notEqual(tag, 'foreignobject', `${file} must not contain foreignObject content`);
      for (const [name, value] of element.attributes) {
        assert.equal(/^on/i.test(name), false, `${file} contains event handler ${name}`);
        if (name.toLowerCase() === 'href' || name.toLowerCase() === 'xlink:href') {
          assert.match(value, /^#[A-Za-z_][\w:.-]*$/, `${file} has an external or malformed ${name}: ${value}`);
        }
      }
    }
  }

  assert.ok(totalBytes <= 512 * 1_024, `card-art bundle exceeds the 512 KiB raw budget: ${totalBytes} bytes`);
});

test('Micro card LOD still hides court and Joker detail only below 40px', () => {
  const microBlocks = conditionalBlocks(stylesSource, 'container').filter((block) => {
    const match = block.query.match(/max-width\s*:\s*(\d+(?:\.\d+)?)px/i);
    return match !== null && Number(match[1]) < 40;
  });
  assert.ok(microBlocks.length > 0, 'playing cards need a container-sized Micro mode below 40px');
  const microSource = microBlocks.map((block) => block.body).join('\n');
  for (const target of ['.card-court', '.joker-face']) {
    const hidden = cssRules(microSource).some((rule) => (
      rule.selectors.some((selector) => selector.includes(target))
      && declarationValues(rule.body, 'display').includes('none')
    ));
    assert.equal(hidden, true, `${target} must remain hidden in Micro mode`);
  }
});
