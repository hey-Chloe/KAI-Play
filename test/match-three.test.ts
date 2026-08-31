import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MATCH_THREE_BASE_SCORE,
  MATCH_THREE_CELL_COUNT,
  MATCH_THREE_COLUMNS,
  MATCH_THREE_DEFAULT_MOVE_LIMIT,
  MATCH_THREE_DEFAULT_TARGET_SCORE,
  MATCH_THREE_ROWS,
  MATCH_THREE_SYMBOLS,
  findMatchThreeMatches,
  getMatchThreeLegalSwaps,
  isMatchThreeSwapValid,
  matchThreeCoordinates,
  matchThreePosition,
  matchThreeSeededRandom,
  newMatchThreeGame,
  restartMatchThreeGame,
  restoreMatchThreeGame,
  serializeMatchThreeGame,
  shuffleMatchThreeGame,
  swapMatchThree,
} from '../web/match-three.js';

function stablePattern() {
  return Array.from({ length: MATCH_THREE_CELL_COUNT }, (_, index) => {
    const row = Math.floor(index / MATCH_THREE_COLUMNS);
    const column = index % MATCH_THREE_COLUMNS;
    return (row + column * 2) % MATCH_THREE_SYMBOLS.length;
  });
}

function firstInvalidAdjacent(game: ReturnType<typeof newMatchThreeGame>) {
  const legal = new Set(getMatchThreeLegalSwaps(game)
    .flatMap(({ from, to }) => [`${from}:${to}`, `${to}:${from}`]));
  for (let index = 0; index < MATCH_THREE_CELL_COUNT; index += 1) {
    const row = Math.floor(index / MATCH_THREE_COLUMNS);
    const column = index % MATCH_THREE_COLUMNS;
    for (const target of [
      column < MATCH_THREE_COLUMNS - 1 ? index + 1 : -1,
      row < MATCH_THREE_ROWS - 1 ? index + MATCH_THREE_COLUMNS : -1,
    ]) {
      if (target >= 0 && !legal.has(`${index}:${target}`)) return { from:index, to:target };
    }
  }
  throw new Error('fixture unexpectedly allows every adjacent swap');
}

test('the product contract is an 8x8 board with six stable symbol identities', () => {
  assert.equal(MATCH_THREE_ROWS, 8);
  assert.equal(MATCH_THREE_COLUMNS, 8);
  assert.equal(MATCH_THREE_CELL_COUNT, 64);
  assert.equal(MATCH_THREE_SYMBOLS.length, 6);
  assert.equal(new Set(MATCH_THREE_SYMBOLS).size, MATCH_THREE_SYMBOLS.length);
  assert.equal(Object.isFrozen(MATCH_THREE_SYMBOLS), true);

  const game = newMatchThreeGame({ seed:'shape' });
  assert.equal(game.rows, 8);
  assert.equal(game.columns, 8);
  assert.equal(game.symbolCount, 6);
  assert.equal(game.board.length, 64);
  assert.equal(new Set(game.board).size, 6);
  assert.equal(game.moveLimit, MATCH_THREE_DEFAULT_MOVE_LIMIT);
  assert.equal(game.targetScore, MATCH_THREE_DEFAULT_TARGET_SCORE);
  assert.equal(game.moveCount, 0);
  assert.equal(game.score, 0);
  assert.equal(game.status, 'playing');
  assert.deepEqual(JSON.parse(JSON.stringify(game)), game);
});

test('seeds and injected entropy are deterministic and validated at the boundary', () => {
  assert.deepEqual(
    newMatchThreeGame({ seed:'repeatable', moveLimit:30, targetScore:2_000 }),
    newMatchThreeGame({ seed:'repeatable', moveLimit:30, targetScore:2_000 }),
  );
  assert.notDeepEqual(
    newMatchThreeGame({ seed:'repeatable' }).board,
    newMatchThreeGame({ seed:'another-seed' }).board,
  );
  const randomA = matchThreeSeededRandom('stream');
  const randomB = matchThreeSeededRandom('stream');
  assert.deepEqual(Array.from({ length:12 }, randomA), Array.from({ length:12 }, randomB));
  assert.equal(newMatchThreeGame({ random:() => 0.5 }).seed, 0x8000_0000);
  assert.equal(newMatchThreeGame({ random:() => 0 }).seed, 0);

  assert.throws(() => newMatchThreeGame({ seed:-1 }), /MATCH_THREE_SEED_INVALID/);
  assert.throws(() => newMatchThreeGame({ seed:'' }), /MATCH_THREE_SEED_INVALID/);
  assert.throws(() => newMatchThreeGame({ seed:'x'.repeat(513) }), /MATCH_THREE_SEED_INVALID/);
  assert.throws(() => newMatchThreeGame({ random:null }), /MATCH_THREE_RANDOM_INVALID/);
  assert.throws(() => newMatchThreeGame({ random:() => Number.NaN }), /MATCH_THREE_RANDOM_INVALID/);
  assert.throws(() => newMatchThreeGame({ random:() => 1 }), /MATCH_THREE_RANDOM_INVALID/);
  assert.throws(() => newMatchThreeGame({ moveLimit:0 }), /MATCH_THREE_MOVE_LIMIT_INVALID/);
  assert.throws(() => newMatchThreeGame({ moveLimit:201 }), /MATCH_THREE_MOVE_LIMIT_INVALID/);
  assert.throws(() => newMatchThreeGame({ targetScore:0 }), /MATCH_THREE_TARGET_SCORE_INVALID/);
});

test('every generated opening is settled, uses every symbol, and guarantees a legal move', () => {
  for (let seed = 0; seed < 160; seed += 1) {
    const game = newMatchThreeGame({ seed });
    assert.deepEqual(findMatchThreeMatches(game.board), [], `seed ${seed} must not begin matched`);
    assert.equal(new Set(game.board).size, MATCH_THREE_SYMBOLS.length, `seed ${seed} must show all symbols`);
    assert.ok(getMatchThreeLegalSwaps(game).length > 0, `seed ${seed} must be playable`);
  }
});

test('match detection merges horizontal and vertical runs without double-counting crossings', () => {
  const board = stablePattern();
  for (const index of [10, 17, 18, 19, 26]) board[index] = 0;
  assert.deepEqual(findMatchThreeMatches(board), [10, 17, 18, 19, 26]);
  assert.deepEqual(findMatchThreeMatches(stablePattern()), []);
  assert.throws(() => findMatchThreeMatches(board.slice(1)), /MATCH_THREE_BOARD_INVALID/);
  assert.throws(() => findMatchThreeMatches(Array(64)), /MATCH_THREE_BOARD_INVALID/);
  assert.throws(
    () => findMatchThreeMatches(board.map((value, index) => index === 0 ? 99 : value)),
    /MATCH_THREE_BOARD_INVALID/,
  );
  assert.equal(matchThreePosition(2, 3), 19);
  assert.deepEqual(matchThreeCoordinates(19), { row:2, column:3 });
  assert.throws(() => matchThreePosition(-0, 0), /MATCH_THREE_COORDINATES_INVALID/);
  assert.throws(() => matchThreePosition(8, 0), /MATCH_THREE_COORDINATES_INVALID/);
  assert.throws(() => matchThreeCoordinates(64), /MATCH_THREE_POSITION_INVALID/);
});

test('only an adjacent match-making exchange consumes a move and every transition is immutable', () => {
  const game = newMatchThreeGame({ seed:'swap-boundaries', targetScore:1_000_000 });
  const before = structuredClone(game);
  const legal = getMatchThreeLegalSwaps(game)[0]!;
  assert.equal(isMatchThreeSwapValid(game, legal.from, legal.to), true);
  assert.equal(isMatchThreeSwapValid(game, legal.to, legal.from), true);
  const moved = swapMatchThree(game, legal.from, legal.to);

  assert.deepEqual(game, before);
  assert.notEqual(moved, game);
  assert.notEqual(moved.board, game.board);
  assert.notEqual(moved.history, game.history);
  assert.equal(moved.moveCount, 1);
  assert.ok(moved.score >= 3 * MATCH_THREE_BASE_SCORE);
  assert.ok(moved.totalCleared >= 3);
  assert.deepEqual(moved.lastSwap, legal);
  assert.deepEqual(moved.history, [{ type:'swap', ...legal }]);
  assert.equal(moved.lastResolution!.cascadeSizes.length, moved.lastResolution!.cascadeCount);
  assert.deepEqual(findMatchThreeMatches(moved.board), []);

  const invalid = firstInvalidAdjacent(game);
  assert.equal(isMatchThreeSwapValid(game, invalid.from, invalid.to), false);
  assert.equal(swapMatchThree(game, invalid.from, invalid.to), game);
  assert.equal(swapMatchThree(game, 0, 2), game, 'non-adjacent cells cannot exchange');
  assert.throws(() => swapMatchThree(game, -1, 0), /MATCH_THREE_POSITION_INVALID/);
  assert.throws(() => swapMatchThree(game, -0, 8), /MATCH_THREE_POSITION_INVALID/);
  assert.throws(() => isMatchThreeSwapValid(game, 0, 64), /MATCH_THREE_POSITION_INVALID/);
});

test('one deterministic move resolves vertical and horizontal matches through seven gravity cascades', () => {
  const game = newMatchThreeGame({ seed:0, moveLimit:200, targetScore:1_000_000 });
  assert.equal(isMatchThreeSwapValid(game, 6, 14), true);
  const resolved = swapMatchThree(game, 6, 14);
  assert.deepEqual(resolved.lastResolution, {
    cascadeCount:7,
    cascadeSizes:[3, 3, 6, 5, 5, 3, 3],
    clearedCount:28,
    scoreGained:1_110,
    autoShuffled:false,
  });
  assert.equal(resolved.score, 1_110);
  assert.equal(resolved.totalCleared, 28);
  assert.deepEqual(findMatchThreeMatches(resolved.board), []);
  assert.ok(getMatchThreeLegalSwaps(resolved).length > 0);
  assert.deepEqual(swapMatchThree(game, 6, 14), resolved, 'refill is reproducible from saved RNG state');
});

test('a dead settled board is automatically replaced without consuming an extra move', () => {
  const seed = 25;
  let game = newMatchThreeGame({ seed, targetScore:1_000_000 });
  for (let turn = 0; turn < 22; turn += 1) {
    const legal = getMatchThreeLegalSwaps(game);
    const chosen = legal[(seed * 17 + turn * 31) % legal.length]!;
    game = swapMatchThree(game, chosen.from, chosen.to);
    if (turn < 21) assert.equal(game.lastResolution!.autoShuffled, false);
  }
  assert.equal(game.moveCount, 22);
  assert.equal(game.shuffleCount, 1);
  assert.equal(game.lastResolution!.autoShuffled, true);
  assert.deepEqual(findMatchThreeMatches(game.board), []);
  assert.ok(getMatchThreeLegalSwaps(game).length > 0);
  assert.deepEqual(restoreMatchThreeGame(serializeMatchThreeGame(game)), game);
});

test('score target wins before the move limit, while an exhausted target becomes a loss', () => {
  const winning = newMatchThreeGame({ seed:0, moveLimit:1, targetScore:100 });
  const won = swapMatchThree(winning, 6, 14);
  assert.equal(won.status, 'won');
  assert.equal(won.moveCount, 1);
  assert.ok(won.score >= won.targetScore);
  assert.deepEqual(getMatchThreeLegalSwaps(won), []);
  assert.equal(swapMatchThree(won, 6, 14), won, 'terminal games are locked');
  assert.equal(shuffleMatchThreeGame(won), won);

  const losing = newMatchThreeGame({ seed:0, moveLimit:1, targetScore:1_000_000 });
  const lost = swapMatchThree(losing, 6, 14);
  assert.equal(lost.status, 'lost');
  assert.equal(lost.moveCount, lost.moveLimit);
  assert.ok(lost.score < lost.targetScore);
  assert.deepEqual(getMatchThreeLegalSwaps(lost), []);
  assert.equal(swapMatchThree(lost, 6, 14), lost);
});

test('manual shuffle preserves progress, while restart returns the exact seeded opening', () => {
  const initial = newMatchThreeGame({ seed:0, moveLimit:40, targetScore:50_000 });
  const progressed = swapMatchThree(initial, 6, 14);
  const before = structuredClone(progressed);
  const shuffled = shuffleMatchThreeGame(progressed);

  assert.deepEqual(progressed, before);
  assert.notDeepEqual(shuffled.board, progressed.board);
  assert.equal(shuffled.moveCount, progressed.moveCount);
  assert.equal(shuffled.score, progressed.score);
  assert.equal(shuffled.totalCleared, progressed.totalCleared);
  assert.equal(shuffled.shuffleCount, progressed.shuffleCount + 1);
  assert.notEqual(shuffled.history[0], progressed.history[0]);
  assert.deepEqual(shuffled.history.at(-1), { type:'shuffle' });
  assert.equal(shuffled.lastSwap, null);
  assert.equal(shuffled.lastResolution, null);
  assert.deepEqual(findMatchThreeMatches(shuffled.board), []);
  assert.ok(getMatchThreeLegalSwaps(shuffled).length > 0);
  assert.deepEqual(shuffleMatchThreeGame(progressed), shuffled);

  const restarted = restartMatchThreeGame(shuffled);
  assert.deepEqual(restarted, initial);
  assert.notEqual(restarted.board, initial.board);
  assert.notEqual(restarted.history, initial.history);
});

test('shuffle history reserves enough capacity to play every remaining move', () => {
  let game = newMatchThreeGame({ seed:0, moveLimit:200, targetScore:1_000_000 });
  for (let index = 0; index < 56; index += 1) game = shuffleMatchThreeGame(game);
  assert.equal(game.history.length, 56);
  assert.throws(() => shuffleMatchThreeGame(game), /MATCH_THREE_SHUFFLE_LIMIT/);

  const legal = getMatchThreeLegalSwaps(game)[0]!;
  const moved = swapMatchThree(game, legal.from, legal.to);
  assert.equal(moved.moveCount, 1);
  assert.equal(moved.history.length, 57);
  assert.ok(getMatchThreeLegalSwaps(moved).length > 0);
  assert.deepEqual(restoreMatchThreeGame(serializeMatchThreeGame(moved)), moved);
});

test('strict JSON restore replays swaps and shuffles and rejects forged snapshots', () => {
  let game = newMatchThreeGame({ seed:0, moveLimit:40, targetScore:50_000 });
  game = swapMatchThree(game, 6, 14);
  game = shuffleMatchThreeGame(game);
  const nextSwap = getMatchThreeLegalSwaps(game)[0]!;
  game = swapMatchThree(game, nextSwap.from, nextSwap.to);

  const serialized = serializeMatchThreeGame(game);
  const restored = restoreMatchThreeGame(serialized);
  assert.deepEqual(restored, game);
  assert.deepEqual(restoreMatchThreeGame(JSON.parse(serialized)), game);
  assert.notEqual(restored?.board, game.board);
  assert.notEqual(restored?.history, game.history);
  assert.notEqual(restored?.lastSwap, game.lastSwap);
  assert.notEqual(restored?.lastResolution, game.lastResolution);
  assert.notEqual(restored?.lastResolution?.cascadeSizes, game.lastResolution?.cascadeSizes);

  const matchedBoard = [...game.board];
  matchedBoard[0] = matchedBoard[1] = matchedBoard[2] = 0;
  const malformed = [
    null,
    42,
    { ...game, extra:true },
    { ...game, schemaVersion:99 },
    { ...game, kind:'other' },
    { ...game, rows:7 },
    { ...game, symbolCount:5 },
    { ...game, seed:-1 },
    { ...game, seed:-0 },
    { ...game, rngState:-1 },
    { ...game, board:game.board.map((value, index) => index === 0 ? -0 : value) },
    { ...game, board:game.board.slice(1) },
    { ...game, board:matchedBoard },
    { ...game, status:'won' },
    { ...game, moveCount:game.moveCount + 1 },
    { ...game, score:game.score + 1 },
    { ...game, totalCleared:game.totalCleared + 1 },
    { ...game, shuffleCount:game.shuffleCount + 1 },
    { ...game, history:game.history.slice(1) },
    { ...game, history:[...game.history, { type:'shuffle', extra:true }] },
    { ...game, lastSwap:{ ...game.lastSwap!, from:game.lastSwap!.to } },
    { ...game, lastResolution:{ ...game.lastResolution!, cascadeSizes:[999] } },
  ];
  for (const value of malformed) assert.equal(restoreMatchThreeGame(value), null);
  assert.equal(restoreMatchThreeGame('{broken-json'), null);
  assert.equal(restoreMatchThreeGame(''), null);
  assert.throws(
    () => serializeMatchThreeGame({ ...game, score:game.score + 1 }),
    /MATCH_THREE_GAME_INVALID/,
  );
});

test('seeded sessions preserve settled and playable invariants across many moves', () => {
  for (let seed = 0; seed < 12; seed += 1) {
    let game = newMatchThreeGame({ seed, moveLimit:12, targetScore:1_000_000 });
    for (let turn = 0; turn < 10 && game.status === 'playing'; turn += 1) {
      const legal = getMatchThreeLegalSwaps(game);
      assert.ok(legal.length > 0);
      const chosen = legal[(seed + turn) % legal.length]!;
      const previous = game;
      const before = structuredClone(game);
      game = swapMatchThree(previous, chosen.from, chosen.to);
      assert.deepEqual(previous, before);
      assert.equal(game.moveCount, turn + 1);
      assert.deepEqual(findMatchThreeMatches(game.board), []);
      assert.deepEqual(restoreMatchThreeGame(serializeMatchThreeGame(game)), game);
      if (game.status === 'playing') assert.ok(getMatchThreeLegalSwaps(game).length > 0);
    }
  }
});
