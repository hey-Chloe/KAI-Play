import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

const gameRoot = resolve(import.meta.dirname, '..');
const appSource = await readFile(resolve(gameRoot, 'web/app.js'), 'utf8');
const stylesSource = await readFile(resolve(gameRoot, 'web/styles.css'), 'utf8');
const v9Styles = stylesSource.slice(stylesSource.indexOf('/* V9:'));

const courtAssets = [
  ['kai-court-j.svg', 'jack-half'],
  ['kai-court-q.svg', 'queen-half'],
  ['kai-court-k.svg', 'king-half'],
  ['kai-joker-court.svg', 'joker-half'],
] as const;

const courtSources = new Map(
  await Promise.all(courtAssets.map(async ([file]) => [
    file,
    await readFile(resolve(gameRoot, 'web/assets', file), 'utf8'),
  ] as const)),
);

function sourceBetween(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1, `missing source marker: ${start}`);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `missing source marker: ${end}`);
  return source.slice(startIndex, endIndex);
}

test('J, Q, K and Joker use local mirrored two-headed SVG artwork', () => {
  for (const [file, halfId] of courtAssets) {
    const source = courtSources.get(file);
    assert.ok(source, `${file} should be readable`);
    assert.match(source, /viewBox="0 0 120 180"/);
    assert.match(source, new RegExp(`<g id="${halfId}">`));
    assert.equal(source.match(new RegExp(`<use href="#${halfId}"`, 'g'))?.length, 2);
    assert.match(source, /transform="rotate\(180 60 90\)"/);
    assert.match(v9Styles, new RegExp(file.replaceAll('.', '\\.')));
  }
});

test('Dou Dizhu rank 15 renders the label 2 with a two-pip center pattern', () => {
  assert.match(appSource, /15:'2'/);
  assert.match(appSource, /card\.rank === 14 \? 1 : card\.rank === 15 \? 2 : Number\(card\.rank\)/);
  assert.match(appSource, /2:\s*\['tc','bc'\]/);
  assert.match(appSource, /card-pips card-pips-\$\{count\}/);
});

test('the Mahjong lobby preview has four 17-stack walls and four rivers', () => {
  assert.match(appSource, /const previewWall = '<i><\/i>'\.repeat\(17\)/);
  assert.match(appSource, /\['north','east','south','west'\]\.map\(\(position,index\)=>/);
  for (const side of ['top', 'right', 'bottom', 'left']) {
    assert.match(appSource, new RegExp(`preview-wall-${side}`));
    assert.match(v9Styles, new RegExp(`\\.preview-wall-${side}`));
  }
  assert.match(v9Styles, /grid-template-columns:\s*repeat\(17,\s*minmax\(0,\s*1fr\)\)/);
});

test('phone Mahjong fits all 14 tiles without negative overlap', () => {
  const phoneStyles = sourceBetween(
    v9Styles,
    '@media (max-width: 560px)',
    '@media (max-width: 340px)',
  );
  const handRule = phoneStyles.match(/\.mahjong-match-stage \.match-player-hand\s*\{([^}]*)\}/)?.[1];
  const tileRule = phoneStyles.match(/\.mahjong-match-stage \.mahjong-tile\s*\{([^}]*)\}/)?.[1];
  assert.ok(handRule, 'phone hand sizing rule should exist');
  assert.ok(tileRule, 'phone tile sizing rule should exist');
  assert.match(handRule, /--tile-width:\s*calc\(\(100% - 19px\) \/ 14\)/);
  assert.match(tileRule, /margin-left:\s*0/);
  assert.doesNotMatch(tileRule, /margin-left:\s*-/);
  assert.match(phoneStyles, /\.mahjong-match-stage \.mahjong-tile\.drawn\s*\{\s*margin-left:\s*5px/);
});

test('revealed three-card opponents keep their real faces visible on phones', () => {
  assert.match(appSource, /three-opponent \$\{revealed\?'is-revealed':''\}/);
  assert.match(appSource, /revealed \? player\.hand\.map\(\(card\) => poker\(card,false\)\)\.join\(''\) : player\.hand\.map\(\(\) => cardBack\(false\)\)\.join\(''\)/);
  assert.match(v9Styles, /@media \(max-width:\s*760px\)[\s\S]*?\.three-opponent\.is-revealed \.three-hand\s*\{\s*display:\s*flex/);
  assert.match(v9Styles, /\.three-opponent\.is-revealed \.three-hand \.poker:nth-child\(3\)/);
});

test('friend rooms long-poll changes and stop polling when a game starts', () => {
  const roomSyncSource = sourceBetween(appSource, 'function stopRoomSync()', 'function finishDeal(');
  assert.match(roomSyncSource, /state\.roomWaitController\?\.abort\(\)/);
  assert.match(roomSyncSource, /const controller=new AbortController\(\)/);
  assert.match(roomSyncSource, /while \(!controller\.signal\.aborted&&state\.view==='room'/);
  assert.match(roomSyncSource, /\/v1\/rooms\/\$\{roomId\}\/wait\?version=\$\{version\}&timeoutMs=20000/);
  assert.match(roomSyncSource, /\{signal:controller\.signal\}/);
  assert.match(roomSyncSource, /if \(result\.room\.gameId\)[\s\S]*?stopRoomSync\(\)[\s\S]*?loadGame\(result\.room\.gameId,\{animateDeal:true\}\)/);
  assert.match(roomSyncSource, /if \(result\.changed\) render\(\)/);

  const roomEntryActions = [
    sourceBetween(appSource, "if(a==='resume')", "if(a==='create-room')"),
    sourceBetween(appSource, "if(a==='create-room')", "if(a==='join-room')"),
    sourceBetween(appSource, "if(a==='join-room')", "if(a==='copy-room')"),
  ];
  for (const actionSource of roomEntryActions) assert.match(actionSource, /startRoomSync\(\)/);
});

test('friend-room exits require confirmation and clean up room polling', () => {
  assert.match(appSource, /state\.roomExitConfirm \? `<div class="exit-shade"><section class="exit-dialog" role="dialog" aria-modal="true" aria-labelledby="room-exit-title">/);
  assert.match(appSource, /data-action="open-room-exit"/);
  assert.match(appSource, /data-action="cancel-room-exit"/);
  assert.match(appSource, /data-action="leave-room"/);
  assert.match(appSource, /if\(a==='open-room-exit'\)[\s\S]{0,160}?state\.roomExitConfirm=true[\s\S]{0,80}?render\(\)/);
  assert.match(appSource, /if\(a==='cancel-room-exit'\)[\s\S]{0,160}?state\.roomExitConfirm=false[\s\S]{0,80}?render\(\)/);

  const leaveSource = sourceBetween(appSource, "if(a==='leave-room')", "if(a==='pass')");
  assert.match(leaveSource, /stopRoomSync\(\)/);
  assert.match(leaveSource, /\/v1\/rooms\/\$\{(?:roomId|state\.room\.id)\}\/leave/);
  assert.match(leaveSource, /state\.room=null/);
  assert.match(leaveSource, /state\.roomExitConfirm=false/);
  assert.match(leaveSource, /state\.view='lobby'/);
});
