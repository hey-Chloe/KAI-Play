import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const styles = await readFile(new URL('../web/styles.css', import.meta.url), 'utf8');
const marker = 'V20: primary navigation belongs to the sticky top chrome';
const start = styles.indexOf(marker);
const end = styles.indexOf('V21: a real contact book', start);
assert.notEqual(start, -1, 'missing V20 top navigation marker');
assert.ok(end > start, 'missing end of V20 top navigation section');
const topNavigationStyles = styles.slice(start, end);

function rule(selector: string) {
  const selectorIndex = topNavigationStyles.indexOf(selector);
  assert.notEqual(selectorIndex, -1, `missing selector: ${selector}`);
  const blockStart = topNavigationStyles.indexOf('{', selectorIndex);
  const blockEnd = topNavigationStyles.indexOf('}', blockStart);
  assert.ok(blockStart > selectorIndex && blockEnd > blockStart, `missing rule block for ${selector}`);
  return topNavigationStyles.slice(blockStart + 1, blockEnd);
}

test('the primary navigation is part of the sticky top header on desktop', () => {
  const topbar = rule('.topbar.has-primary-nav');
  assert.match(topbar, /position\s*:\s*sticky\s*;/);
  assert.match(topbar, /top\s*:\s*max\(0px,env\(safe-area-inset-top\)\)\s*;/);
  assert.match(topbar, /grid-template-columns\s*:\s*minmax\(160px,1fr\) minmax\(360px,456px\) minmax\(112px,1fr\)\s*;/);
  assert.match(topbar, /grid-template-areas\s*:\s*"brand nav actions"\s*;/);

  const nav = rule('.topbar.has-primary-nav > .nav');
  assert.match(nav, /position\s*:\s*static\s*;/);
  assert.match(nav, /inset\s*:\s*auto\s*;/);
  assert.match(nav, /top\s*:\s*auto\s*;/);
  assert.match(nav, /right\s*:\s*auto\s*;/);
  assert.match(nav, /bottom\s*:\s*auto\s*;/);
  assert.match(nav, /left\s*:\s*auto\s*;/);
  assert.match(nav, /transform\s*:\s*none\s*;/);
  assert.match(nav, /grid-template-columns\s*:\s*repeat\(4,minmax\(0,1fr\)\)\s*;/);
});

test('tablet widths put navigation on the second header row instead of the viewport bottom', () => {
  const tabletStart = topNavigationStyles.indexOf('@media (max-width:959px)');
  const tabletEnd = topNavigationStyles.indexOf('@media (max-width:420px)', tabletStart);
  assert.notEqual(tabletStart, -1, 'missing tablet navigation breakpoint');
  assert.ok(tabletEnd > tabletStart, 'missing tablet breakpoint end');
  const tablet = topNavigationStyles.slice(tabletStart, tabletEnd);
  assert.match(tablet, /grid-template-areas\s*:[\s\S]*"brand actions"[\s\S]*"nav nav"\s*;/);
  assert.match(tablet, /> \.nav\s*\{[\s\S]*width\s*:\s*100%[\s\S]*max-width\s*:\s*none/);
  assert.doesNotMatch(tablet, /bottom\s*:\s*max\(/);
});

test('compact phones retain four accessible top navigation targets', () => {
  const phoneStart = topNavigationStyles.indexOf('@media (max-width:420px)');
  const phoneEnd = topNavigationStyles.indexOf('@media (prefers-reduced-motion:reduce)', phoneStart);
  assert.notEqual(phoneStart, -1, 'missing compact-phone navigation breakpoint');
  assert.ok(phoneEnd > phoneStart, 'missing compact-phone breakpoint end');
  const phone = topNavigationStyles.slice(phoneStart, phoneEnd);
  assert.match(phone, /> \.nav\s*\{[\s\S]*grid-template-columns\s*:\s*repeat\(4,minmax\(0,1fr\)\)/);
  assert.match(phone, /> \.nav \.btn\s*\{[\s\S]*min-height\s*:\s*44px/);
  assert.doesNotMatch(phone, /position\s*:\s*fixed|bottom\s*:\s*max\(/);
});

test('primary pages no longer reserve bottom-bar height', () => {
  assert.match(topNavigationStyles, /\.lobby-game-center,[\s\S]*\.page-shell,[\s\S]*\.friends-page\s*\{\s*padding-bottom\s*:\s*calc\(28px \+ env\(safe-area-inset-bottom\)\)\s*;/);
  assert.doesNotMatch(topNavigationStyles, /calc\(98px \+ env\(safe-area-inset-bottom\)\)/);
});
