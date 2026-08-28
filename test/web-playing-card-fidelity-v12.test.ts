import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

const gameRoot = resolve(import.meta.dirname, '..');
const appSource = await readFile(resolve(gameRoot, 'web/app.js'), 'utf8');
const stylesSource = await readFile(resolve(gameRoot, 'web/styles.css'), 'utf8');

type CssRule = {
  selectors: string[];
  body: string;
};

type ConditionalBlock = {
  query: string;
  body: string;
};

function sourceBetween(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1, `missing source marker: ${start}`);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `missing source marker: ${end}`);
  return source.slice(startIndex, endIndex);
}

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
  let parenthesisDepth = 0;
  let bracketDepth = 0;
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
    if (character === '(') parenthesisDepth += 1;
    if (character === ')') parenthesisDepth -= 1;
    if (character === '[') bracketDepth += 1;
    if (character === ']') bracketDepth -= 1;
    if (character === ',' && parenthesisDepth === 0 && bracketDepth === 0) {
      selectors.push(current);
      current = '';
      continue;
    }
    current += character;
  }
  selectors.push(current);
  return selectors.map((selector) => selector.trim().replace(/\s+/g, ' ')).filter(Boolean);
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

function declarations(body: string, property: string): string[] {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return [...body.matchAll(new RegExp(`(?:^|;)\\s*${escaped}\\s*:\\s*([^;}]+)`, 'gi'))]
    .map((match) => match[1].trim());
}

function rulesMatching(source: string, predicate: (selector: string) => boolean): CssRule[] {
  return cssRules(source).filter((rule) => rule.selectors.some(predicate));
}

function declarationValues(
  source: string,
  predicate: (selector: string) => boolean,
  property: string,
): string[] {
  return rulesMatching(source, predicate).flatMap((rule) => declarations(rule.body, property));
}

function conditionalBlocks(source: string, atRule: 'container' | 'media'): ConditionalBlock[] {
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
    if (depth === 0) {
      blocks.push({
        query: match[1].trim(),
        body: source.slice(openBrace + 1, cursor - 1),
      });
    }
  }
  return blocks;
}

function maxWidth(query: string): number | null {
  const match = query.match(/max-width\s*:\s*(\d+(?:\.\d+)?)px/i);
  return match ? Number(match[1]) : null;
}

function stringArray(source: string): string[] {
  return [...source.matchAll(/['"]([\w-]+)['"]/g)].map((match) => match[1]);
}

function pipPattern(source: string, rank: number): string[] {
  const match = source.match(new RegExp(`(?:^|\\n)\\s*${rank}\\s*:\\s*\\[([^\\]]*)\\]`, 'm'));
  assert.ok(match, `missing pip pattern for ${rank}`);
  return stringArray(match[1]);
}

function normalized(value: string): string {
  return value.toLowerCase().replace(/\s+/g, '');
}

function hasDisplay(source: string, selectorToken: string, expected: string): boolean {
  return declarationValues(source, (selector) => selector.includes(selectorToken), 'display')
    .some((value) => normalized(value) === normalized(expected));
}

test('traditional 7, 8 and 10 pip layouts have upper/lower centre pips with the lower one inverted', () => {
  const patterns = sourceBetween(appSource, 'const PIP_PATTERNS', '});');
  assert.deepEqual(pipPattern(patterns, 7), ['tl', 'tr', 'cu', 'ml', 'mr', 'bl', 'br']);
  assert.deepEqual(pipPattern(patterns, 8), ['tl', 'tr', 'cu', 'ml', 'mr', 'cl', 'bl', 'br']);
  assert.deepEqual(pipPattern(patterns, 10), ['tl', 'tr', 'ul', 'ur', 'cu', 'cl', 'll', 'lr', 'bl', 'br']);

  const cardPips = sourceBetween(appSource, 'function cardPips(', 'function poker(');
  const inversionList = cardPips.match(/\[([^\]]*)\]\.includes\(position\)/)?.[1];
  assert.ok(inversionList, 'cardPips should have an explicit inversion set');
  const inverted = stringArray(inversionList);
  assert.ok(inverted.includes('cl'), 'the lower-centre pip must be inverted');
  assert.ok(!inverted.includes('cu'), 'the upper-centre pip must remain upright');
});

test('every card exposes stable material coordinates, normalized data tokens and Chinese accessibility', () => {
  const pokerSource = sourceBetween(appSource, 'function poker(', 'function previewPoker(');
  const materialAndPoker = sourceBetween(appSource, 'const CARD_RANK_DATA', 'function previewPoker(');
  const stockPosition = sourceBetween(appSource, 'function cardStockPosition(', 'function cardPips(');

  assert.match(pokerSource, /data-rank\s*=\s*["']/);
  assert.match(pokerSource, /data-suit\s*=\s*["']/);
  assert.match(pokerSource, /--card-stock-x\s*:/);
  assert.match(pokerSource, /--card-stock-y\s*:/);
  assert.equal(
    pokerSource.match(/\$\{faceAttributes\}/g)?.length,
    3,
    'interactive, semantic non-interactive, and decorative faces must share the same material attributes',
  );
  assert.doesNotMatch(materialAndPoker, /Math\.random|Date\.now|crypto\.getRandomValues/);
  assert.match(stockPosition, /CARD_RANK_STOCK_INDEX/);
  assert.match(stockPosition, /CARD_SUIT_STOCK_INDEX/);
  assert.match(stockPosition, /return\s*\{[\s\S]*?x\s*:[\s\S]*?y\s*:/);

  for (const token of ['3', '10', 'j', 'q', 'k', 'a', '2', 'small-joker', 'big-joker', 'unknown']) {
    assert.match(materialAndPoker, new RegExp(`['"]${token}['"]`));
  }
  for (const token of ['spade', 'heart', 'club', 'diamond', 'joker', 'unknown']) {
    assert.match(materialAndPoker, new RegExp(`['"]${token}['"]`));
  }

  assert.match(pokerSource, /aria-label\s*=\s*"\$\{esc\(aria\)\}"/);
  for (const label of ['黑桃', '红桃', '梅花', '方块', '大王', '小王']) {
    assert.match(materialAndPoker, new RegExp(label));
  }
  assert.match(pokerSource, /`\$\{suitLabel\}\s+\$\{rawLabel\}`/);
  assert.match(appSource, /spade\s*:\s*['"]♠['"]/);
  assert.match(appSource, /heart\s*:\s*['"]♥['"]/);
  assert.match(appSource, /club\s*:\s*['"]♣['"]/);
  assert.match(appSource, /diamond\s*:\s*['"]♦['"]/);

  const v12 = versionSection(stylesSource, 12);
  assert.match(v12, /var\(\s*--card-stock-x(?:\s*,[^)]*)?\)/);
  assert.match(v12, /var\(\s*--card-stock-y(?:\s*,[^)]*)?\)/);
});

test('V12 keeps red court art contained and removes the dark multiply layer from card backs', () => {
  const v12 = versionSection(stylesSource, 12);
  const redCourtRules = rulesMatching(v12, (selector) => (
    selector.includes('.card-court')
    && (selector.includes('.red') || /data-suit\s*=\s*["'](?:heart|diamond)/.test(selector))
  ));
  assert.ok(redCourtRules.length > 0, 'V12 should explicitly protect red court artwork');
  assert.ok(redCourtRules.some((rule) => (
    declarations(rule.body, 'background-size').some((value) => normalized(value).startsWith('contain'))
  )));

  const backBlendModes = declarationValues(v12, (selector) => selector.includes('.kai-card-back'), 'background-blend-mode');
  assert.ok(backBlendModes.length > 0, 'V12 should explicitly retune card-back blending');
  assert.ok(
    backBlendModes.every((value) => !/\bmultiply\b/i.test(value)),
    `card backs must avoid dark multiply blending: ${JSON.stringify(backBlendModes)}`,
  );
  assert.ok(backBlendModes.some((value) => /\bsoft-light\b/i.test(value)));
});

test('52px cards remain Compact and only cards below 40px enter Micro mode', () => {
  const v12 = versionSection(stylesSource, 12);
  const containers = conditionalBlocks(v12, 'container');
  const compact = containers.find((block) => {
    const width = maxWidth(block.query);
    return width !== null && width >= 52 && width <= 55;
  });
  const micro = containers.find((block) => {
    const width = maxWidth(block.query);
    return width !== null && width < 40;
  });
  assert.ok(compact, 'V12 should define a container-sized Compact mode that includes 52px cards');
  assert.ok(micro, 'V12 should reserve Micro degradation for cards below 40px');

  assert.ok(hasDisplay(compact.body, '.card-pips', 'block'));
  assert.ok(
    hasDisplay(compact.body, '.card-pips .pip', 'block')
      || hasDisplay(compact.body, '.card-pips .pip', 'grid'),
  );
  assert.ok(
    hasDisplay(compact.body, '.card-court', 'block')
      || hasDisplay(compact.body, '.card-court', 'grid'),
  );
  assert.ok(
    hasDisplay(compact.body, '.joker-face', 'block')
      || hasDisplay(compact.body, '.joker-face', 'flex'),
  );
  assert.ok(hasDisplay(compact.body, '.card-signature', 'none'));
  assert.ok(hasDisplay(compact.body, '.card-index-bottom', 'none'));
  assert.ok(!hasDisplay(compact.body, '.card-pips', 'none'));
  assert.ok(!hasDisplay(compact.body, '.card-court', 'none'));

  for (const token of ['.card-pips', '.card-court', '.joker-face']) {
    assert.ok(hasDisplay(micro.body, token, 'none'), `${token} should be hidden only in Micro`);
  }
  const microHiddenSelectors = rulesMatching(micro.body, (selector) => (
    selector.includes('.card-index') && !selector.includes('.card-index-bottom')
  )).filter((rule) => declarations(rule.body, 'display').some((value) => normalized(value) === 'none'));
  assert.equal(microHiddenSelectors.length, 0, 'Micro must retain its primary rank/suit index');
});

test('pointer, selection and keyboard focus states preserve the authoritative card state', () => {
  const v12 = versionSection(stylesSource, 12);
  const finePointer = conditionalBlocks(v12, 'media')
    .filter((block) => /hover\s*:\s*hover/i.test(block.query) && /pointer\s*:\s*fine/i.test(block.query))
    .map((block) => block.body)
    .join('\n');
  assert.ok(finePointer, 'V12 hover feedback should be gated to a fine hover pointer');

  const hoverSelectors = cssRules(finePointer).flatMap((rule) => rule.selectors)
    .filter((selector) => selector.includes('.poker') && selector.includes(':hover'));
  assert.ok(hoverSelectors.length > 0);
  assert.ok(hoverSelectors.every((selector) => /\bbutton\b/.test(selector)), 'non-interactive card spans must not fake hover');
  assert.ok(
    declarationValues(v12, (selector) => (
      selector.includes('.poker') && (selector.includes(':not(button)') || selector.includes('span.poker'))
    ), 'pointer-events').some((value) => normalized(value) === 'none'),
    'non-interactive cards should not intercept pointers',
  );

  const selectedRules = rulesMatching(v12, (selector) => selector.includes('.hand-card.selected') && !selector.includes(':hover'));
  const selectedHoverRules = rulesMatching(finePointer, (selector) => selector.includes('.hand-card.selected') && selector.includes(':hover'));
  assert.ok(selectedRules.length > 0);
  assert.ok(selectedHoverRules.length > 0, 'selected hover needs an explicit precedence rule');
  const selectedTransforms = selectedRules.flatMap((rule) => declarations(rule.body, 'transform')).map(normalized);
  const hoverTransforms = selectedHoverRules.flatMap((rule) => declarations(rule.body, 'transform')).map(normalized);
  assert.ok(selectedTransforms.length > 0 && hoverTransforms.length > 0);
  for (const transforms of [selectedTransforms, hoverTransforms]) {
    assert.ok(transforms.some((value) => (
      value.includes('var(--card-selected-lift') && value.includes('scale(1.015)')
    )), 'selected and selected-hover transforms must preserve the same lift and scale');
  }
  assert.ok(selectedHoverRules.some((rule) => (
    declarations(rule.body, 'box-shadow').some((value) => /0\s+0\s+0\s+(?:2|3|4)px/i.test(value))
  )), 'selected hover must retain a visible selection ring');

  const focusRules = rulesMatching(v12, (selector) => (
    selector.includes('.hand-card') && selector.includes(':focus-visible')
  ));
  assert.ok(focusRules.length > 0, 'V12 should outrank the hand card-order rule on focus');
  assert.ok(focusRules.some((rule) => declarations(rule.body, 'z-index').some((value) => {
    const numeric = Number(value);
    return (Number.isFinite(numeric) && numeric >= 20) || /hand-count|card-order/.test(value);
  })));
  assert.ok(focusRules.some((rule) => declarations(rule.body, 'outline').some((value) => !/^none$/i.test(value))));
  assert.ok(focusRules.some((rule) => (
    declarations(rule.body, 'box-shadow').some((value) => /(?:inset|0\s+0\s+0\s+\d)/i.test(value))
  )), 'focus should combine an outer outline with an inner contrast ring');
});

test('short landscape keeps cards at least 44px wide and reduced motion stays explicit', () => {
  const v12 = versionSection(stylesSource, 12);
  const media = conditionalBlocks(v12, 'media');
  const landscape = media.find((block) => (
    /orientation\s*:\s*landscape/i.test(block.query) && /max-height\s*:/i.test(block.query)
  ));
  assert.ok(landscape, 'V12 should explicitly protect the short landscape hand');
  const landscapeWidths = declarationValues(
    landscape.body,
    (selector) => selector.includes('.hand-card'),
    'width',
  ).flatMap((value) => [...value.matchAll(/(\d+(?:\.\d+)?)px/g)].map((match) => Number(match[1])));
  assert.ok(landscapeWidths.some((width) => width >= 44), 'short-landscape cards must remain at least 44px wide');
  assert.ok(
    declarationValues(landscape.body, (selector) => selector.includes('.hand'), 'overflow-x')
      .some((value) => normalized(value) === 'auto'),
  );
  assert.ok(
    declarationValues(landscape.body, (selector) => selector.includes('.hand'), 'touch-action')
      .some((value) => /pan-x/i.test(value)),
  );

  const reduced = media.find((block) => /prefers-reduced-motion\s*:\s*reduce/i.test(block.query));
  assert.ok(reduced, 'V12 should retain a local reduced-motion safety rule');
  assert.ok(
    declarationValues(reduced.body, (selector) => selector.includes('.poker.poker-face'), 'transition')
      .some((value) => /^none(?:\s*!important)?$/i.test(value)),
  );
  const enterGame = sourceBetween(appSource, 'function enterGame(', 'function startGameSync(');
  assert.match(enterGame, /prefers-reduced-motion:\s*reduce/);
  assert.match(enterGame, /animateDeal[^;\n]*!reducedMotion/);
});
