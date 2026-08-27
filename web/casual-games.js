const SUITS = ['spade', 'heart', 'club', 'diamond'];
const THREE_CARD_LABELS = ['高牌', '对子', '顺子', '金花', '顺金', '豹子'];

export function shuffle(items, random = Math.random) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const next = Math.floor(random() * (index + 1));
    [result[index], result[next]] = [result[next], result[index]];
  }
  return result;
}

export function createTrainingDeck() {
  return SUITS.flatMap((suit) => Array.from({ length: 13 }, (_, index) => ({
    id: `train-${suit}-${index + 2}`,
    suit,
    rank: index + 2,
  })));
}

function straightHigh(ranks) {
  const unique = [...new Set(ranks)].sort((a, b) => a - b);
  if (unique.length !== 3) return 0;
  if (unique.join(',') === '2,3,14') return 3;
  return unique[2] - unique[0] === 2 ? unique[2] : 0;
}

export function evaluateThreeCard(hand) {
  if (!Array.isArray(hand) || hand.length !== 3) throw new Error('THREE_CARDS_REQUIRED');
  const ranks = hand.map((card) => card.rank).sort((a, b) => b - a);
  const counts = new Map(ranks.map((value) => [value, ranks.filter((rank) => rank === value).length]));
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const flush = hand.every((card) => card.suit === hand[0].suit);
  const high = straightHigh(ranks);
  let category = 0;
  let tiebreak = ranks;
  if (groups[0][1] === 3) { category = 5; tiebreak = [groups[0][0]]; }
  else if (flush && high) { category = 4; tiebreak = [high]; }
  else if (flush) { category = 3; }
  else if (high) { category = 2; tiebreak = [high]; }
  else if (groups[0][1] === 2) { category = 1; tiebreak = [groups[0][0], groups[1][0]]; }
  return { category, label: THREE_CARD_LABELS[category], tiebreak };
}

export function compareThreeCard(left, right) {
  const a = evaluateThreeCard(left);
  const b = evaluateThreeCard(right);
  if (a.category !== b.category) return Math.sign(a.category - b.category);
  const length = Math.max(a.tiebreak.length, b.tiebreak.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (a.tiebreak[index] || 0) - (b.tiebreak[index] || 0);
    if (difference) return Math.sign(difference);
  }
  return 0;
}

export function newThreeCardRound(random = Math.random) {
  const deck = shuffle(createTrainingDeck(), random);
  return {
    players: [
      { name: '你', hand: deck.slice(0, 3) },
      { name: '阿满', hand: deck.slice(3, 6) },
      { name: '小禾', hand: deck.slice(6, 9) },
    ],
  };
}

const HONORS = ['东', '南', '西', '北', '中', '发', '白'];
const MAHJONG_SUITS = ['万', '筒', '条', '字'];
const MAHJONG_WIN_PATTERNS = Object.freeze({
  standard: Object.freeze({ type: 'standard', label: '四面子一对将' }),
  sevenPairs: Object.freeze({ type: 'seven_pairs', label: '七对' }),
  thirteenOrphans: Object.freeze({ type: 'thirteen_orphans', label: '国士无双（十三幺）' }),
});
const MAHJONG_PLAYERS = Object.freeze([
  Object.freeze({ id: 'mahjong:you', name: '你', isBot: false, seat: 0, wind: '东' }),
  Object.freeze({ id: 'mahjong:bot-a', name: '智能牌友 A', isBot: true, seat: 1, wind: '南' }),
  Object.freeze({ id: 'mahjong:bot-b', name: '智能牌友 B', isBot: true, seat: 2, wind: '西' }),
  Object.freeze({ id: 'mahjong:bot-c', name: '智能牌友 C', isBot: true, seat: 3, wind: '北' }),
]);

export class MahjongRuleError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'MahjongRuleError';
    this.code = code;
  }
}

export function createMahjongWall() {
  const suited = ['万', '筒', '条'].flatMap((suit) => Array.from({ length: 9 }, (_, index) =>
    Array.from({ length: 4 }, (__, copy) => ({ id: `${suit}-${index + 1}-${copy}`, key: `${suit}${index + 1}`, suit, rank: index + 1, label: `${index + 1}${suit}` })),
  )).flat();
  const honors = HONORS.flatMap((label) => Array.from({ length: 4 }, (_, copy) => ({
    id: `字-${label}-${copy}`, key: `字${label}`, suit: '字', rank: HONORS.indexOf(label) + 1, label,
  })));
  return [...suited, ...honors];
}

export function sortMahjong(hand) {
  const order = { 万: 0, 筒: 1, 条: 2, 字: 3 };
  return [...hand].sort((a, b) => order[a.suit] - order[b.suit] || a.rank - b.rank || a.id.localeCompare(b.id));
}

function mahjongTileIndex(tile) {
  const suit = MAHJONG_SUITS.indexOf(tile?.suit);
  const rank = Number(tile?.rank);
  if (suit < 0 || !Number.isInteger(rank)) return -1;
  if (suit < 3) return rank >= 1 && rank <= 9 ? suit * 9 + rank - 1 : -1;
  return rank >= 1 && rank <= 7 ? 27 + rank - 1 : -1;
}

function mahjongCounts(hand) {
  if (!Array.isArray(hand) || hand.length !== 14) return null;
  const counts = Array(34).fill(0);
  const physicalIds = new Set();
  for (const tile of hand) {
    const index = mahjongTileIndex(tile);
    if (index < 0 || typeof tile.id !== 'string' || physicalIds.has(tile.id)) return null;
    physicalIds.add(tile.id);
    counts[index] += 1;
    if (counts[index] > 4) return null;
  }
  return counts;
}

function canFormMahjongMelds(counts, memo = new Map()) {
  const first = counts.findIndex((count) => count > 0);
  if (first < 0) return true;
  const signature = counts.join('');
  if (memo.has(signature)) return memo.get(signature);

  if (counts[first] >= 3) {
    counts[first] -= 3;
    if (canFormMahjongMelds(counts, memo)) {
      counts[first] += 3;
      memo.set(signature, true);
      return true;
    }
    counts[first] += 3;
  }

  const rankIndex = first % 9;
  if (first < 27 && rankIndex <= 6 && counts[first + 1] > 0 && counts[first + 2] > 0) {
    counts[first] -= 1;
    counts[first + 1] -= 1;
    counts[first + 2] -= 1;
    if (canFormMahjongMelds(counts, memo)) {
      counts[first] += 1;
      counts[first + 1] += 1;
      counts[first + 2] += 1;
      memo.set(signature, true);
      return true;
    }
    counts[first] += 1;
    counts[first + 1] += 1;
    counts[first + 2] += 1;
  }

  memo.set(signature, false);
  return false;
}

function isThirteenOrphans(counts) {
  const required = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33];
  const requiredSet = new Set(required);
  return required.every((index) => counts[index] >= 1)
    && counts.every((count, index) => requiredSet.has(index) || count === 0)
    && required.filter((index) => counts[index] === 2).length === 1;
}

export function evaluateMahjongHand(hand) {
  const counts = mahjongCounts(hand);
  if (!counts) return null;
  if (isThirteenOrphans(counts)) return MAHJONG_WIN_PATTERNS.thirteenOrphans;
  if (counts.filter((count) => count === 2).length === 7) return MAHJONG_WIN_PATTERNS.sevenPairs;

  for (let pair = 0; pair < counts.length; pair += 1) {
    if (counts[pair] < 2) continue;
    const candidate = [...counts];
    candidate[pair] -= 2;
    if (canFormMahjongMelds(candidate)) return MAHJONG_WIN_PATTERNS.standard;
  }
  return null;
}

export function isWinningMahjong(hand) {
  return evaluateMahjongHand(hand) !== null;
}

export function newMahjongRound(random = Math.random) {
  const wall = shuffle(createMahjongWall(), random);
  return { hand: sortMahjong(wall.splice(0, 13)), wall, discards: [], drawnId: null, won: false };
}

function cloneMahjongGame(game) {
  return {
    ...game,
    players: game.players.map((player) => ({ ...player })),
    hands: game.hands.map((hand) => [...hand]),
    wall: [...game.wall],
    rivers: game.rivers.map((river) => [...river]),
    events: game.events.map((event) => ({ ...event })),
    result: game.result ? {
      ...game.result,
      pattern: game.result.pattern ? { ...game.result.pattern } : null,
    } : null,
  };
}

function mahjongZoneTiles(game) {
  if (!game || !Array.isArray(game.hands) || !Array.isArray(game.wall) || !Array.isArray(game.rivers)) return [];
  return [...game.hands.flat(), ...game.wall, ...game.rivers.flat()];
}

export function validateMahjongTileConservation(game) {
  if (game?.hands?.length !== 4 || game?.rivers?.length !== 4) return false;
  const tiles = mahjongZoneTiles(game);
  if (tiles.length !== 136) return false;
  const ids = tiles.map((tile) => tile?.id);
  const actual = new Set(ids);
  if (actual.size !== 136 || ids.some((id) => typeof id !== 'string')) return false;
  const expected = new Set(createMahjongWall().map((tile) => tile.id));
  return actual.size === expected.size && [...actual].every((id) => expected.has(id));
}

function assertMahjongGame(game) {
  if (!validateMahjongTileConservation(game)) {
    throw new MahjongRuleError('MAHJONG_TILE_CONSERVATION', '麻将牌状态不完整，请重新开局。');
  }
  if (!Array.isArray(game.players) || game.players.length !== 4) {
    throw new MahjongRuleError('FOUR_MAHJONG_PLAYERS_REQUIRED', '四人麻将需要四个座位。');
  }
  if (game.phase === 'playing') {
    for (let seat = 0; seat < 4; seat += 1) {
      const expected = seat === game.currentSeat ? 14 : 13;
      if (game.hands[seat]?.length !== expected) {
        throw new MahjongRuleError('MAHJONG_HAND_SIZE_INVALID', '当前手牌数量不正确，请重新开局。');
      }
    }
  }
}

function appendMahjongEvent(game, event) {
  game.sequence += 1;
  game.events.push({ ...event, sequence: game.sequence });
}

function finishMahjongGame(game, result) {
  game.phase = 'finished';
  game.result = result;
  appendMahjongEvent(game, {
    kind: 'finish',
    result: result.kind,
    winnerSeat: result.winnerSeat,
    fromSeat: result.fromSeat,
    tileId: result.tileId,
  });
}

function firstMahjongRon(game, fromSeat, tile) {
  for (let distance = 1; distance < 4; distance += 1) {
    const seat = (fromSeat + distance) % 4;
    const pattern = evaluateMahjongHand([...game.hands[seat], tile]);
    if (pattern) return { seat, pattern };
  }
  return null;
}

function drawMahjongForSeat(game, seat) {
  game.currentSeat = seat;
  if (game.wall.length === 0) {
    game.drawnId = null;
    finishMahjongGame(game, {
      kind: 'draw', reason: 'wall_exhausted', winnerSeat: null, fromSeat: null, tileId: null, pattern: null,
    });
    return;
  }

  const tile = game.wall.shift();
  game.hands[seat] = sortMahjong([...game.hands[seat], tile]);
  game.drawnId = tile.id;
  appendMahjongEvent(game, { kind: 'draw', seat, tileId: tile.id });
  const pattern = evaluateMahjongHand(game.hands[seat]);
  if (pattern) {
    finishMahjongGame(game, {
      kind: 'tsumo', winnerSeat: seat, fromSeat: null, tileId: tile.id, pattern,
    });
  }
}

function discardAndAdvanceMahjong(game, seat, tileId) {
  if (game.phase !== 'playing') throw new MahjongRuleError('MAHJONG_FINISHED', '本局麻将已经结束。');
  if (seat !== game.currentSeat) throw new MahjongRuleError('NOT_MAHJONG_TURN', '还没轮到这个座位出牌。');
  const hand = game.hands[seat];
  if (hand.length !== 14) throw new MahjongRuleError('MAHJONG_DISCARD_REQUIRED', '摸牌后才能打出一张牌。');
  const index = hand.findIndex((tile) => tile.id === tileId);
  if (index < 0) throw new MahjongRuleError('MAHJONG_TILE_NOT_OWNED', '所选麻将牌不在当前手牌中。');

  const [tile] = hand.splice(index, 1);
  const tsumogiri = tile.id === game.drawnId;
  game.rivers[seat].push(tile);
  game.drawnId = null;
  appendMahjongEvent(game, { kind: 'discard', seat, tileId: tile.id, tsumogiri });

  const ron = firstMahjongRon(game, seat, tile);
  if (ron) {
    game.currentSeat = ron.seat;
    finishMahjongGame(game, {
      kind: 'ron', winnerSeat: ron.seat, fromSeat: seat, tileId: tile.id, pattern: ron.pattern,
    });
    return;
  }
  drawMahjongForSeat(game, (seat + 1) % 4);
}

function mahjongShapeScore(hand) {
  const counts = Array(34).fill(0);
  for (const tile of hand) {
    const index = mahjongTileIndex(tile);
    if (index >= 0) counts[index] += 1;
  }
  let score = 0;
  for (const count of counts) score += count >= 4 ? 20 : count === 3 ? 17 : count === 2 ? 6 : 0;
  for (let base = 0; base < 27; base += 9) {
    for (let rank = 0; rank < 9; rank += 1) {
      const index = base + rank;
      if (rank <= 6) score += Math.min(counts[index], counts[index + 1], counts[index + 2]) * 9;
      if (rank <= 7) score += Math.min(counts[index], counts[index + 1]) * 3;
      if (rank <= 6) score += Math.min(counts[index], counts[index + 2]);
    }
  }
  return score;
}

function mahjongDiscardPriority(tile, hand, drawnId) {
  const index = mahjongTileIndex(tile);
  const copies = hand.filter((candidate) => mahjongTileIndex(candidate) === index).length;
  let priority = copies === 1 ? 10 : copies === 2 ? 2 : 0;
  if (tile.suit === '字') priority += 6;
  else if (tile.rank === 1 || tile.rank === 9) priority += 3;
  if (tile.id === drawnId) priority += 0.5;
  return priority;
}

export function chooseMahjongBotDiscard(hand, drawnId = null) {
  if (!Array.isArray(hand) || hand.length !== 14) {
    throw new MahjongRuleError('FOURTEEN_MAHJONG_TILES_REQUIRED', '机器人需要十四张牌才能选择弃牌。');
  }
  let best = null;
  for (const tile of hand) {
    const remaining = hand.filter((candidate) => candidate.id !== tile.id);
    const score = mahjongShapeScore(remaining);
    const priority = mahjongDiscardPriority(tile, hand, drawnId);
    if (!best || score > best.score || (score === best.score && priority > best.priority)
      || (score === best.score && priority === best.priority && tile.id.localeCompare(best.tile.id) < 0)) {
      best = { tile, score, priority };
    }
  }
  return best.tile;
}

function advanceMahjongBotTurnInPlace(game) {
  if (game.phase !== 'playing' || !game.players[game.currentSeat].isBot) return false;
  const seat = game.currentSeat;
  const pattern = evaluateMahjongHand(game.hands[seat]);
  if (pattern) {
    finishMahjongGame(game, {
      kind: 'tsumo', winnerSeat: seat, fromSeat: null, tileId: game.drawnId, pattern,
    });
  } else {
    const tile = chooseMahjongBotDiscard(game.hands[seat], game.drawnId);
    discardAndAdvanceMahjong(game, seat, tile.id);
  }
  return true;
}

function advanceMahjongBotsInPlace(game) {
  let safety = 0;
  while (game.phase === 'playing' && game.players[game.currentSeat].isBot) {
    if (safety++ >= 128) throw new Error('MAHJONG_BOT_TURN_SAFETY_LIMIT');
    advanceMahjongBotTurnInPlace(game);
  }
}

export function advanceMahjongBotTurn(game) {
  assertMahjongGame(game);
  const next = cloneMahjongGame(game);
  advanceMahjongBotTurnInPlace(next);
  assertMahjongGame(next);
  return next;
}

export function advanceMahjongBots(game) {
  assertMahjongGame(game);
  const next = cloneMahjongGame(game);
  advanceMahjongBotsInPlace(next);
  assertMahjongGame(next);
  return next;
}

export function playMahjongDiscard(game, tileId, options = {}) {
  assertMahjongGame(game);
  if (game.phase !== 'playing') throw new MahjongRuleError('MAHJONG_FINISHED', '本局麻将已经结束。');
  const player = game.players[game.currentSeat];
  if (player.isBot) throw new MahjongRuleError('MAHJONG_BOT_TURN', '智能牌友正在行动，请稍候。');
  const next = cloneMahjongGame(game);
  discardAndAdvanceMahjong(next, next.currentSeat, tileId);
  if (options.advanceBots !== false) advanceMahjongBotsInPlace(next);
  assertMahjongGame(next);
  return next;
}

export function newMahjongGame(random = Math.random) {
  const wall = shuffle(createMahjongWall(), random);
  const hands = [[], [], [], []];
  for (let draw = 0; draw < 13; draw += 1) {
    for (let seat = 0; seat < 4; seat += 1) hands[seat].push(wall.shift());
  }
  const dealerTile = wall.shift();
  hands[0].push(dealerTile);
  const game = {
    kind: 'mahjong',
    phase: 'playing',
    players: MAHJONG_PLAYERS.map((player) => ({ ...player })),
    hands: hands.map(sortMahjong),
    wall,
    rivers: [[], [], [], []],
    dealerSeat: 0,
    currentSeat: 0,
    drawnId: dealerTile.id,
    sequence: 0,
    events: [],
    result: null,
  };
  const pattern = evaluateMahjongHand(game.hands[0]);
  if (pattern) {
    finishMahjongGame(game, {
      kind: 'tsumo', winnerSeat: 0, fromSeat: null, tileId: dealerTile.id, pattern,
    });
  }
  assertMahjongGame(game);
  return game;
}

export const SLOT_SYMBOLS = Object.freeze(['7', 'KAI', '⚡', 'AI', '★']);

export function spinSlots(random = Math.random) {
  const reels = Array.from({ length: 3 }, () => SLOT_SYMBOLS[Math.floor(random() * SLOT_SYMBOLS.length)]);
  const unique = new Set(reels).size;
  const result = unique === 1 ? { tier: 'jackpot', label: '三连共振' }
    : unique === 2 ? { tier: 'pair', label: '双核同频' }
      : { tier: 'none', label: '继续挑战' };
  return { reels, result };
}
