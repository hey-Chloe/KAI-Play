import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeCombination, canBeat } from '../core/rules.ts';
import type { Card } from '../core/types.ts';

function cards(...ranks: number[]): Card[] {
  return ranks.map((rank, index) => ({ id: `${rank}-${index}`, rank, suit: rank >= 16 ? 'joker' : 'heart' }));
}

test('recognizes airplane wings and four-with-two variants at their exact shapes', () => {
  assert.deepEqual(analyzeCombination(cards(3, 3, 3, 4, 4, 4, 8, 8, 9, 9)), {
    type: 'airplane_pair', mainRank: 4, cardCount: 10, chainLength: 2,
  });
  assert.equal(analyzeCombination(cards(7, 7, 7, 7, 3, 4))?.type, 'four_two_single');
  assert.equal(analyzeCombination(cards(7, 7, 7, 7, 3, 3, 4, 4))?.type, 'four_two_pair');

  assert.equal(analyzeCombination(cards(3, 3, 3, 5, 5, 5, 8, 8, 9, 9)), null, 'triple chains must be consecutive');
  assert.equal(analyzeCombination(cards(7, 7, 7, 7, 3, 3, 3, 4)), null, 'four-with-two-pairs requires two actual pairs');
});

test('comparison requires equal shape and no play can beat a rocket', () => {
  const straightFive = analyzeCombination(cards(3, 4, 5, 6, 7))!;
  const straightSix = analyzeCombination(cards(3, 4, 5, 6, 7, 8))!;
  const pair = analyzeCombination(cards(14, 14))!;
  const bomb = analyzeCombination(cards(3, 3, 3, 3))!;
  const rocket = analyzeCombination(cards(16, 17))!;

  assert.equal(canBeat(straightSix, straightFive), false);
  assert.equal(canBeat(pair, straightFive), false);
  assert.equal(canBeat(bomb, straightFive), true);
  assert.equal(canBeat(rocket, rocket), false);
  assert.equal(canBeat(pair, rocket), false);
});
