import assert from 'node:assert/strict';
import test from 'node:test';
import {
  chooseMahjongBotDiscard,
  compareThreeCard,
  createMahjongWall,
  evaluateMahjongHand,
  evaluateThreeCard,
  isWinningMahjong,
  newMahjongGame,
  playMahjongDiscard,
  spinSlots,
  validateMahjongTileConservation,
} from '../web/casual-games.js';

const card = (rank: number, suit = 'spade') => ({ id: `${suit}-${rank}`, rank, suit });
const tile = (suit: string, rank: number, suffix: string) => ({ id: `${suit}-${rank}-${suffix}`, key: `${suit}${rank}`, suit, rank, label: suit === '字' ? suffix : `${rank}${suit}` });

function seededRandom(seed: number) {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1_664_525) + 1_013_904_223) >>> 0;
    return value / 0x1_0000_0000;
  };
}

function takeMahjongTiles(keys: string[]) {
  const pool = createMahjongWall();
  return keys.map((key) => {
    const index = pool.findIndex((candidate) => candidate.key === key);
    assert.notEqual(index, -1, `missing tile ${key}`);
    return pool.splice(index, 1)[0]!;
  });
}

function activeMahjongGame(seed = 1): ReturnType<typeof newMahjongGame> {
  for (let offset = 0; offset < 100; offset += 1) {
    const game = newMahjongGame(seededRandom(seed + offset));
    if (game.phase === 'playing') return game;
  }
  throw new Error('could not create a non-winning opening hand');
}

function rigMahjongHand(game: ReturnType<typeof newMahjongGame>, seat: number, keys: string[]) {
  assert.equal(game.rivers.every((river) => river.length === 0), true);
  assert.equal(keys.length, game.hands[seat]!.length);
  const sizes = game.hands.map((hand) => hand.length);
  const pool = [...game.hands.flat(), ...game.wall];
  const selected = keys.map((key) => {
    const index = pool.findIndex((candidate) => candidate.key === key);
    assert.notEqual(index, -1, `rig is missing tile ${key}`);
    return pool.splice(index, 1)[0]!;
  });
  game.hands = game.hands.map((_, candidateSeat) => (
    candidateSeat === seat ? selected : pool.splice(0, sizes[candidateSeat])
  ));
  game.wall = pool;
  game.hands = game.hands.map((hand) => [...hand].sort((a, b) => a.suit.localeCompare(b.suit) || a.rank - b.rank || a.id.localeCompare(b.id)));
  game.drawnId = game.hands[game.currentSeat]!.at(-1)!.id;
  assert.equal(validateMahjongTileConservation(game), true);
}

function putWallTileInHand(game: ReturnType<typeof newMahjongGame>, key: string, seat: number) {
  const wallIndex = game.wall.findIndex((candidate) => candidate.key === key);
  assert.notEqual(wallIndex, -1, `wall is missing tile ${key}`);
  const handIndex = 0;
  const wanted = game.wall[wallIndex]!;
  game.wall[wallIndex] = game.hands[seat]![handIndex]!;
  game.hands[seat]![handIndex] = wanted;
  game.drawnId = game.hands[game.currentSeat]!.at(-1)!.id;
  assert.equal(validateMahjongTileConservation(game), true);
  return wanted;
}

function putWallTileOnTop(game: ReturnType<typeof newMahjongGame>, key: string) {
  const index = game.wall.findIndex((candidate) => candidate.key === key);
  assert.notEqual(index, -1, `wall is missing tile ${key}`);
  [game.wall[0], game.wall[index]] = [game.wall[index]!, game.wall[0]!];
  assert.equal(validateMahjongTileConservation(game), true);
}

test('three-card evaluator ranks 豹子 above 顺金 above 对子', () => {
  assert.equal(evaluateThreeCard([card(9), card(9, 'heart'), card(9, 'club')]).label, '豹子');
  assert.equal(evaluateThreeCard([card(7), card(8), card(9)]).label, '顺金');
  assert.equal(compareThreeCard([card(9), card(9, 'heart'), card(2)], [card(14), card(13, 'heart'), card(10, 'club')]), 1);
});

test('mahjong wall contains 136 unique physical tiles', () => {
  const wall = createMahjongWall();
  assert.equal(wall.length, 136);
  assert.equal(new Set(wall.map((entry) => entry.id)).size, 136);
  const copies = new Map<string, number>();
  for (const entry of wall) copies.set(entry.key, (copies.get(entry.key) ?? 0) + 1);
  assert.equal(copies.size, 34);
  assert.equal([...copies.values()].every((count) => count === 4), true);
});

test('mahjong win detector accepts four melds and one pair', () => {
  const hand = [
    tile('万', 1, 'a'), tile('万', 2, 'a'), tile('万', 3, 'a'),
    tile('万', 4, 'a'), tile('万', 5, 'a'), tile('万', 6, 'a'),
    tile('筒', 2, 'a'), tile('筒', 3, 'a'), tile('筒', 4, 'a'),
    tile('条', 7, 'a'), tile('条', 7, 'b'), tile('条', 7, 'c'),
    tile('字', 1, '东'), tile('字', 1, '东2'),
  ];
  assert.equal(isWinningMahjong(hand), true);
  assert.equal(evaluateMahjongHand(hand)?.type, 'standard');
  assert.equal(isWinningMahjong(hand.slice(0, 13)), false);
});

test('mahjong win detector recognizes seven pairs and thirteen orphans', () => {
  const sevenPairs = takeMahjongTiles([
    '万1', '万1', '万4', '万4', '筒2', '筒2', '筒8', '筒8',
    '条3', '条3', '条9', '条9', '字东', '字东',
  ]);
  const thirteenOrphans = takeMahjongTiles([
    '万1', '万9', '筒1', '筒9', '条1', '条9',
    '字东', '字南', '字西', '字北', '字中', '字发', '字白', '字东',
  ]);
  const honorSequenceIsInvalid = takeMahjongTiles([
    '字东', '字南', '字西',
    '万1', '万2', '万3', '筒2', '筒3', '筒4', '条6', '条7', '条8', '字白', '字白',
  ]);
  assert.equal(evaluateMahjongHand(sevenPairs)?.type, 'seven_pairs');
  assert.equal(evaluateMahjongHand(thirteenOrphans)?.type, 'thirteen_orphans');
  assert.equal(evaluateMahjongHand(honorSequenceIsInvalid), null);
});

test('new mahjong games deal four deterministic seats and conserve all tiles', () => {
  const first = activeMahjongGame(42);
  const second = activeMahjongGame(42);
  assert.deepEqual(first, second);
  assert.equal(first.kind, 'mahjong');
  assert.equal(first.currentSeat, 0);
  assert.equal(first.players.length, 4);
  assert.deepEqual(first.hands.map((hand) => hand.length), [14, 13, 13, 13]);
  assert.equal(first.wall.length, 83);
  assert.deepEqual(first.rivers.map((river) => river.length), [0, 0, 0, 0]);
  assert.equal(validateMahjongTileConservation(first), true);
});

test('a player discard advances three deterministic bots to the next player decision', () => {
  let game: ReturnType<typeof newMahjongGame> | null = null;
  let next: ReturnType<typeof newMahjongGame> | null = null;
  for (let seed = 1; seed < 100 && !next; seed += 1) {
    const candidate = activeMahjongGame(seed);
    const discard = chooseMahjongBotDiscard(candidate.hands[0]!, candidate.drawnId);
    const advanced = playMahjongDiscard(candidate, discard.id);
    if (advanced.phase === 'playing') { game = candidate; next = advanced; }
  }
  assert.ok(game && next);
  const original = structuredClone(game);
  const discard = chooseMahjongBotDiscard(game.hands[0]!, game.drawnId);
  const replay = playMahjongDiscard(game, discard.id);
  assert.deepEqual(game, original, 'the transition must not mutate its input state');
  assert.equal(replay.phase, 'playing');
  assert.equal(replay.currentSeat, 0);
  assert.deepEqual(replay.hands.map((hand) => hand.length), [14, 13, 13, 13]);
  assert.equal(replay.events.filter((event) => event.kind === 'discard').length, 4);
  assert.equal(replay.events.filter((event) => event.kind === 'draw').length, 4);
  assert.equal(replay.hands[0]!.some((entry) => entry.id === replay.drawnId), true);
  assert.equal(validateMahjongTileConservation(replay), true);
});

test('a discarded winning tile ends the game by ron without duplicating the tile', () => {
  const game = activeMahjongGame(200);
  rigMahjongHand(game, 1, [
    '万1', '万2', '万3', '万4', '万5', '万6',
    '筒2', '筒3', '筒4', '条7', '条7', '条7', '字东',
  ]);
  const east = putWallTileInHand(game, '字东', 0);
  const result = playMahjongDiscard(game, east.id);
  assert.equal(result.phase, 'finished');
  assert.equal(result.result?.kind, 'ron');
  assert.equal(result.result?.winnerSeat, 1);
  assert.equal(result.result?.fromSeat, 0);
  assert.equal(result.result?.pattern?.type, 'standard');
  assert.equal(result.rivers[0]!.at(-1)?.id, east.id);
  assert.equal(validateMahjongTileConservation(result), true);
});

test('a bot drawing its winning tile ends the game by tsumo', () => {
  const game = activeMahjongGame(300);
  rigMahjongHand(game, 1, [
    '万1', '万2', '万3', '万4', '万5', '万6',
    '筒2', '筒3', '筒4', '条7', '条7', '条7', '字东',
  ]);
  putWallTileOnTop(game, '字东');
  const safeDiscard = game.hands[0]!.find((candidate) => (
    [1, 2, 3].every((seat) => evaluateMahjongHand([...game.hands[seat]!, candidate]) === null)
  ));
  assert.ok(safeDiscard);
  const result = playMahjongDiscard(game, safeDiscard.id);
  assert.equal(result.phase, 'finished');
  assert.equal(result.result?.kind, 'tsumo');
  assert.equal(result.result?.winnerSeat, 1);
  assert.equal(result.result?.fromSeat, null);
  assert.equal(result.result?.pattern?.type, 'standard');
  assert.equal(validateMahjongTileConservation(result), true);
});

test('an empty wall ends the round as an exhaustive draw', () => {
  let game = activeMahjongGame(400);
  for (const [index, entry] of game.wall.splice(0).entries()) game.rivers[index % 4]!.push(entry);
  const safeDiscard = game.hands[0]!.find((candidate) => (
    [1, 2, 3].every((seat) => evaluateMahjongHand([...game.hands[seat]!, candidate]) === null)
  ));
  assert.ok(safeDiscard);
  assert.equal(validateMahjongTileConservation(game), true);
  game = playMahjongDiscard(game, safeDiscard.id);
  assert.equal(game.phase, 'finished');
  assert.equal(game.result?.kind, 'draw');
  assert.equal(game.result?.reason, 'wall_exhausted');
  assert.equal(validateMahjongTileConservation(game), true);
});

test('seeded mahjong games always finish within the live wall', () => {
  for (let seed = 1; seed <= 24; seed += 1) {
    let game = newMahjongGame(seededRandom(seed));
    let playerDecisions = 0;
    while (game.phase === 'playing' && playerDecisions < 30) {
      const discard = chooseMahjongBotDiscard(game.hands[0]!, game.drawnId);
      game = playMahjongDiscard(game, discard.id);
      playerDecisions += 1;
      assert.equal(validateMahjongTileConservation(game), true);
    }
    assert.equal(game.phase, 'finished', `seed ${seed} did not finish`);
    assert.ok(['tsumo', 'ron', 'draw'].includes(game.result?.kind));
    assert.ok(playerDecisions <= 21, `seed ${seed} consumed too many player decisions`);
  }
});

test('slot result is deterministic with an injected random source', () => {
  assert.deepEqual(spinSlots(() => 0), { reels: ['7', '7', '7'], result: { tier: 'jackpot', label: '三连共振' } });
});
