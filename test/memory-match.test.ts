import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MEMORY_MATCH_DIFFICULTIES,
  MEMORY_MATCH_STORAGE_KEYS,
  advanceMemoryMatchTime,
  compareMemoryMatchScores,
  flipMemoryMatchCard,
  getMemoryMatchCard,
  loadMemoryMatchSession,
  memoryMatchScore,
  memoryMatchSeededRandom,
  newMemoryMatchBestScores,
  newMemoryMatchGame,
  resolveMemoryMatchMismatch,
  restartMemoryMatchGame,
  restoreMemoryMatchBestScores,
  restoreMemoryMatchGame,
  saveMemoryMatchSession,
  updateMemoryMatchBestScores,
} from '../web/memory-match.js';

function indexesByPair(game: any) {
  const pairs = new Map<string, number[]>();
  game.deck.forEach((pair: string, index: number) => {
    pairs.set(pair, [...(pairs.get(pair) ?? []), index]);
  });
  return pairs;
}

function finishMemoryGame(rawGame: any, { mismatch = false, seconds = 0 } = {}) {
  let game = rawGame;
  const pairs = [...indexesByPair(game).values()];
  if (mismatch) {
    game = flipMemoryMatchCard(game, pairs[0]![0]!);
    game = flipMemoryMatchCard(game, pairs[1]![0]!);
    assert.equal(game.pendingMismatch, true);
    game = resolveMemoryMatchMismatch(game);
  }
  if (seconds > 0) {
    if (game.status === 'ready') game = flipMemoryMatchCard(game, pairs[0]![0]!);
    game = advanceMemoryMatchTime(game, seconds);
  }
  for (const [first, second] of pairs) {
    if (game.matched[first]) continue;
    if (game.pendingMismatch) game = resolveMemoryMatchMismatch(game);
    if (game.faceUp.length === 1 && ![first, second].includes(game.faceUp[0])) {
      game = flipMemoryMatchCard(game, first);
      game = resolveMemoryMatchMismatch(game);
    }
    game = flipMemoryMatchCard(game, first);
    game = flipMemoryMatchCard(game, second);
  }
  return game;
}

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem(key: string) { return values.get(key) ?? null; },
    setItem(key: string, value: string) { values.set(key, String(value)); },
  };
}

test('difficulty definitions create deterministic boards with exactly two of every symbol', () => {
  assert.deepEqual(Object.values(MEMORY_MATCH_DIFFICULTIES).map(({ rows, columns, pairs }) => [rows, columns, pairs]), [
    [3, 4, 6],
    [4, 4, 8],
    [4, 6, 12],
  ]);

  for (const [difficulty, definition] of Object.entries(MEMORY_MATCH_DIFFICULTIES)) {
    const first = newMemoryMatchGame({ difficulty, seed: 'repeatable' });
    const second = newMemoryMatchGame({ difficulty, seed: 'repeatable' });
    assert.deepEqual(first, second);
    assert.equal(first.deck.length, definition.rows * definition.columns);
    assert.equal(indexesByPair(first).size, definition.pairs);
    assert.equal([...indexesByPair(first).values()].every((indexes) => indexes.length === 2), true);
    assert.deepEqual(JSON.parse(JSON.stringify(first)), first);
  }

  const randomA = memoryMatchSeededRandom('same');
  const randomB = memoryMatchSeededRandom('same');
  assert.deepEqual(Array.from({ length: 8 }, randomA), Array.from({ length: 8 }, randomB));
  assert.equal(newMemoryMatchGame({ difficulty: 'unknown', seed: 1 }).difficulty, 'easy');
  assert.equal(newMemoryMatchGame({ random: () => 0.5 }).seed, 0x8000_0000);
  assert.throws(() => newMemoryMatchGame({ seed: -1 }), /MEMORY_MATCH_SEED_INVALID/);
  assert.throws(() => newMemoryMatchGame({ random: () => 1 }), /MEMORY_MATCH_RANDOM_INVALID/);
});

test('a matching pair flips immutably, counts one move and hides symbols until revealed', () => {
  const ready = newMemoryMatchGame({ seed: 'one-pair' });
  const [first, second] = indexesByPair(ready).values().next().value!;
  assert.deepEqual(getMemoryMatchCard(ready, first), {
    id: `memory:${ready.seed}:${first}`,
    index: first,
    state: 'hidden',
    matched: false,
    faceUp: false,
    pair: null,
    label: null,
    glyph: null,
  });

  const flipped = flipMemoryMatchCard(ready, first);
  assert.equal(ready.status, 'ready');
  assert.deepEqual(ready.faceUp, []);
  assert.equal(flipped.status, 'playing');
  assert.deepEqual(flipped.faceUp, [first]);
  assert.equal(flipped.moveCount, 0);
  assert.equal(getMemoryMatchCard(flipped, first).state, 'face-up');
  assert.ok(getMemoryMatchCard(flipped, first).glyph);
  assert.equal(flipMemoryMatchCard(flipped, first), flipped, 'the same card cannot fill both turn slots');

  const matched = flipMemoryMatchCard(flipped, second);
  assert.equal(matched.moveCount, 1);
  assert.equal(matched.matchedPairs, 1);
  assert.equal(matched.matched[first], true);
  assert.equal(matched.matched[second], true);
  assert.deepEqual(matched.faceUp, []);
  assert.equal(matched.lastAction, 'match');
  assert.equal(getMemoryMatchCard(matched, first).state, 'matched');
  assert.equal(flipMemoryMatchCard(matched, first), matched);
});

test('a mismatch locks the board until it is explicitly resolved', () => {
  const ready = newMemoryMatchGame({ difficulty: 'standard', seed: 'mismatch' });
  const pairs = [...indexesByPair(ready).values()];
  const first = pairs[0]![0]!;
  const second = pairs[1]![0]!;
  const blockedTarget = pairs[2]![0]!;
  const one = flipMemoryMatchCard(ready, first);
  const mismatch = flipMemoryMatchCard(one, second);
  assert.equal(mismatch.pendingMismatch, true);
  assert.deepEqual(mismatch.faceUp, [first, second]);
  assert.equal(mismatch.moveCount, 1);
  assert.equal(mismatch.lastAction, 'mismatch');
  assert.equal(flipMemoryMatchCard(mismatch, blockedTarget), mismatch);
  assert.equal(advanceMemoryMatchTime(mismatch, 2).elapsedSeconds, 2, 'mismatch animation time remains active play time');

  const resolved = resolveMemoryMatchMismatch(mismatch);
  assert.equal(resolved.pendingMismatch, false);
  assert.deepEqual(resolved.faceUp, []);
  assert.equal(resolved.moveCount, 1);
  assert.equal(resolved.lastAction, 'resolve');
  assert.deepEqual(mismatch.faceUp, [first, second], 'resolution must not mutate the pending state');
  assert.equal(resolveMemoryMatchMismatch(resolved), resolved);
});

test('timer, completion and restart preserve authoritative counters', () => {
  const ready = newMemoryMatchGame({ difficulty: 'easy', seed: 'finish' });
  assert.equal(advanceMemoryMatchTime(ready, 5), ready, 'time begins only after the first flip');
  const won = finishMemoryGame(ready, { seconds: 19 });
  assert.equal(won.status, 'won');
  assert.equal(won.matchedPairs, won.pairCount);
  assert.equal(won.moveCount, won.pairCount);
  assert.equal(won.elapsedSeconds, 19);
  assert.equal(won.matched.every(Boolean), true);
  assert.equal(advanceMemoryMatchTime(won, 1), won);
  assert.equal(flipMemoryMatchCard(won, 0), won);
  assert.deepEqual(memoryMatchScore(won), { moveCount: 6, elapsedSeconds: 19 });
  assert.throws(() => advanceMemoryMatchTime(won, -1), /MEMORY_MATCH_TIME_INVALID/);

  const restarted = restartMemoryMatchGame(won, { seed: 'restart-layout' });
  assert.equal(restarted.difficulty, 'easy');
  assert.equal(restarted.status, 'ready');
  assert.equal(restarted.moveCount, 0);
  assert.equal(restarted.elapsedSeconds, 0);
  assert.equal(restarted.matched.every((value: boolean) => !value), true);
  const challenge = restartMemoryMatchGame(restarted, { difficulty: 'challenge', seed: 'larger' });
  assert.equal(challenge.pairCount, 12);
  assert.equal(challenge.deck.length, 24);
});

test('restore round-trips independent state and rejects forged progress', () => {
  let game = newMemoryMatchGame({ difficulty: 'standard', seed: 'restore' });
  const pairs = [...indexesByPair(game).values()];
  game = flipMemoryMatchCard(game, pairs[0]![0]!);
  game = flipMemoryMatchCard(game, pairs[0]![1]!);
  game = advanceMemoryMatchTime(game, 12);
  const restored = restoreMemoryMatchGame(JSON.parse(JSON.stringify(game)));
  assert.deepEqual(restored, game);
  assert.notEqual(restored?.deck, game.deck);
  assert.notEqual(restored?.matched, game.matched);
  assert.notEqual(restored?.faceUp, game.faceUp);

  assert.equal(restoreMemoryMatchGame({ ...game, schemaVersion: 99 }), null);
  assert.equal(restoreMemoryMatchGame({ ...game, deck: game.deck.with(0, 'forged') }), null);
  assert.equal(restoreMemoryMatchGame({ ...game, matched: game.matched.with(pairs[1]![0]!, true) }), null);
  assert.equal(restoreMemoryMatchGame({ ...game, faceUp: [0, 0] }), null);
  assert.equal(restoreMemoryMatchGame({ ...game, pendingMismatch: true }), null);
  assert.equal(restoreMemoryMatchGame({ ...game, matchedPairs: game.matchedPairs + 1 }), null);
  assert.equal(restoreMemoryMatchGame({ ...game, elapsedSeconds: -1 }), null);
  assert.equal(restoreMemoryMatchGame({ ...game, status: 'won' }), null);
  const ready = newMemoryMatchGame({ seed: 'fake-playing' });
  assert.equal(restoreMemoryMatchGame({ ...ready, status: 'playing', lastAction: 'resolve' }), null);
  assert.equal(restoreMemoryMatchGame(null), null);
  assert.throws(() => flipMemoryMatchCard(game, -1), /MEMORY_MATCH_CARD_INVALID/);
  assert.throws(() => getMemoryMatchCard({ ...game, status: 'broken' }, 0), /MEMORY_MATCH_GAME_INVALID/);
});

test('best scores are isolated by difficulty and rank moves before elapsed time', () => {
  const initial = newMemoryMatchBestScores();
  const slowOptimal = finishMemoryGame(newMemoryMatchGame({ difficulty: 'easy', seed: 'slow' }), { seconds: 100 });
  const fastExtraMove = finishMemoryGame(newMemoryMatchGame({ difficulty: 'easy', seed: 'extra' }), { mismatch: true, seconds: 5 });
  const fasterOptimal = finishMemoryGame(newMemoryMatchGame({ difficulty: 'easy', seed: 'faster' }), { seconds: 40 });
  assert.equal(compareMemoryMatchScores(memoryMatchScore(slowOptimal), memoryMatchScore(fastExtraMove)), -1);

  const first = updateMemoryMatchBestScores(initial, slowOptimal);
  assert.deepEqual(first.scores.easy, { moveCount: 6, elapsedSeconds: 100 });
  assert.equal(first.scores.standard, null);
  assert.equal(initial.scores.easy, null, 'best-score updates must be immutable');
  const retained = updateMemoryMatchBestScores(first, fastExtraMove);
  assert.deepEqual(retained, first, 'a faster result with an extra move is not the best score');
  const improved = updateMemoryMatchBestScores(retained, fasterOptimal);
  assert.deepEqual(improved.scores.easy, { moveCount: 6, elapsedSeconds: 40 });
  assert.deepEqual(restoreMemoryMatchBestScores(JSON.parse(JSON.stringify(improved))), improved);
  assert.equal(restoreMemoryMatchBestScores({ ...improved, scores: { easy: null } }), null);
  assert.equal(restoreMemoryMatchBestScores({
    ...improved,
    scores: { ...improved.scores, easy: { moveCount: 1, elapsedSeconds: 1 } },
  }), null);
  assert.throws(() => compareMemoryMatchScores(null, { moveCount: 1, elapsedSeconds: 1 }), /MEMORY_MATCH_SCORE_INVALID/);
});

test('local session helpers save, auto-restore and fail safely on unavailable storage', () => {
  const storage = memoryStorage();
  let game = newMemoryMatchGame({ difficulty: 'standard', seed: 'persisted' });
  game = flipMemoryMatchCard(game, 3);
  game = advanceMemoryMatchTime(game, 9);
  const saved = saveMemoryMatchSession(storage, game);
  assert.equal(saved.saved, true);
  assert.ok(storage.values.has(MEMORY_MATCH_STORAGE_KEYS.game));
  assert.ok(storage.values.has(MEMORY_MATCH_STORAGE_KEYS.bestScores));

  const loaded = loadMemoryMatchSession(storage);
  assert.equal(loaded.restored, true);
  assert.equal(loaded.saveAvailable, true);
  assert.deepEqual(loaded.game, game);
  assert.notEqual(loaded.game.deck, game.deck);
  assert.notEqual(loaded.game.faceUp, game.faceUp);

  const won = finishMemoryGame(newMemoryMatchGame({ difficulty: 'standard', seed: 'local-best' }), { seconds: 31 });
  const savedWin = saveMemoryMatchSession(storage, won, loaded.bestScores);
  assert.equal(savedWin.saved, true);
  assert.deepEqual(savedWin.bestScores.scores.standard, { moveCount: 8, elapsedSeconds: 31 });
  assert.deepEqual(loadMemoryMatchSession(storage).bestScores, savedWin.bestScores);

  storage.values.set(MEMORY_MATCH_STORAGE_KEYS.game, '{broken');
  storage.values.set(MEMORY_MATCH_STORAGE_KEYS.bestScores, JSON.stringify({ forged: true }));
  const fallback = loadMemoryMatchSession(storage, { difficulty: 'challenge', seed: 'fallback' });
  assert.equal(fallback.restored, false);
  assert.equal(fallback.game.difficulty, 'challenge');
  assert.equal(fallback.bestScores.scores.challenge, null);

  const unavailable = {
    getItem() { throw new Error('blocked'); },
    setItem() { throw new Error('blocked'); },
  };
  const safeFallback = loadMemoryMatchSession(unavailable, { seed: 'no-storage' });
  assert.equal(safeFallback.restored, false);
  assert.equal(saveMemoryMatchSession(unavailable, safeFallback.game).saved, false);
});
