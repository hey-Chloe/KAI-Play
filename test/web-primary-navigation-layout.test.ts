import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const styles = await readFile(new URL('../web/styles.css', import.meta.url), 'utf8');

function ruleAfter(marker: string, selector: string) {
  const markerIndex = styles.indexOf(marker);
  assert.notEqual(markerIndex, -1, `missing marker: ${marker}`);
  const selectorIndex = styles.indexOf(selector, markerIndex);
  assert.notEqual(selectorIndex, -1, `missing selector after marker: ${selector}`);
  const blockStart = styles.indexOf('{', selectorIndex);
  const blockEnd = styles.indexOf('}', blockStart);
  assert.ok(blockStart > selectorIndex && blockEnd > blockStart, `missing rule block for ${selector}`);
  return styles.slice(blockStart + 1, blockEnd);
}

test('the shared primary navigation has one vertical anchor and cannot stretch across the viewport', () => {
  const rule = ruleAfter(
    'Four destinations stay horizontal on every primary page',
    '.lobby-game-center > .nav,',
  );

  assert.match(rule, /top\s*:\s*auto\s*;/, 'the legacy desktop top anchor must be reset');
  assert.match(rule, /bottom\s*:\s*max\(8px,env\(safe-area-inset-bottom\)\)\s*;/);
  assert.match(rule, /grid-template-columns\s*:\s*repeat\(4,minmax\(0,1fr\)\)\s*;/);
});

test('the phone navigation remains a four-column bottom bar above the safe area', () => {
  const phoneSectionStart = styles.lastIndexOf('@media (max-width:420px)');
  assert.notEqual(phoneSectionStart, -1, 'missing compact-phone navigation breakpoint');
  const phoneSectionEnd = styles.indexOf('@media (max-width:340px)', phoneSectionStart);
  assert.ok(phoneSectionEnd > phoneSectionStart, 'missing end of compact-phone breakpoint');
  const phoneSection = styles.slice(phoneSectionStart, phoneSectionEnd);

  assert.match(phoneSection, /\.lobby-game-center > \.nav,[\s\S]*bottom\s*:\s*max\(6px,env\(safe-area-inset-bottom\)\)/);
  assert.match(phoneSection, /grid-template-columns\s*:\s*repeat\(4,minmax\(0,1fr\)\)/);
  assert.match(phoneSection, /width\s*:\s*calc\(100vw - 12px\)/);
});
