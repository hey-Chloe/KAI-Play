import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SNAKE_DIFFICULTIES,
  advanceSnake,
  newSnakeGame,
  restoreSnakeGame,
  setSnakeDirection,
  snakeCoordinates,
  snakePosition,
  spawnSnakeFood,
  toggleSnakePause,
} from '../web/snake.js';

test('snake exposes three speeds and coordinate helpers', () => {
  assert.deepEqual(Object.values(SNAKE_DIFFICULTIES).map((entry) => entry.tickMs), [240, 170, 115]);
  assert.equal(snakePosition(2, 3, 16, 16), 35);
  assert.deepEqual(snakeCoordinates(35, 16, 16), { row: 2, column: 3 });
  assert.throws(() => snakePosition(-1, 0), /SNAKE_COORDINATES_INVALID/);
  assert.throws(() => snakeCoordinates(256), /SNAKE_INDEX_INVALID/);
});

test('new game is serializable and food never overlaps the snake', () => {
  const game = newSnakeGame({ difficulty: 'turbo', random: () => 0 });
  assert.equal(game.status, 'ready');
  assert.equal(game.difficulty, 'turbo');
  assert.equal(game.snake.length, 3);
  assert.equal(game.snake.includes(game.food!), false);
  assert.deepEqual(JSON.parse(JSON.stringify(game)), game);
  assert.equal(newSnakeGame({ difficulty: 'unknown' }).difficulty, 'normal');
  assert.equal(spawnSnakeFood(Array.from({ length: 64 }, (_, index) => index), 8, 8), null);
});

test('direction input starts play and blocks immediate reversal', () => {
  const ready = newSnakeGame({ random: () => 0 });
  const playing = setSnakeDirection(ready, 'up');
  assert.equal(ready.status, 'ready');
  assert.equal(playing.status, 'playing');
  assert.equal(playing.queuedDirection, 'up');
  const blocked = setSnakeDirection(playing, 'down');
  assert.equal(blocked.queuedDirection, 'up');
  const rapidReverse = setSnakeDirection(setSnakeDirection(ready, 'up'), 'left');
  assert.equal(rapidReverse.queuedDirection, 'up');
  assert.throws(() => setSnakeDirection(playing, 'diagonal'), /SNAKE_DIRECTION_INVALID/);
});

test('advancing moves immutably, eats food, and increases score', () => {
  const base = setSnakeDirection(newSnakeGame({ rows: 8, columns: 8, random: () => 0 }), 'right');
  const nextHead = base.snake[0] + 1;
  const arranged = { ...base, food: nextHead };
  const eaten = advanceSnake(arranged, () => 0);
  assert.equal(arranged.snake.length, 3);
  assert.equal(eaten.snake.length, 4);
  assert.equal(eaten.snake[0], nextHead);
  assert.equal(eaten.score, 10);
  assert.equal(eaten.foodsEaten, 1);
  assert.equal(eaten.snake.includes(eaten.food!), false);
});

test('wall and body collisions end the round while moving into the old tail is legal', () => {
  const wall = {
    ...newSnakeGame({ rows: 8, columns: 8, random: () => 0 }),
    status: 'playing', direction: 'up', queuedDirection: 'up', snake: [1, 9, 17], food: 63,
  };
  assert.equal(advanceSnake(wall).status, 'over');

  const body = {
    ...newSnakeGame({ rows: 8, columns: 8, random: () => 0 }),
    status: 'playing', direction: 'left', queuedDirection: 'down',
    snake: [27, 28, 36, 35, 34, 26], food: 63, foodsEaten: 3, score: 30,
  };
  assert.equal(advanceSnake(body).status, 'over');

  const tail = {
    ...body,
    direction: 'right', queuedDirection: 'right', snake: [42, 50, 51, 52, 44, 43],
  };
  const moved = advanceSnake(tail);
  assert.equal(moved.status, 'playing');
  assert.equal(moved.snake[0], 43);
});

test('pause toggles only live rounds and restore rejects malformed snapshots', () => {
  const playing = setSnakeDirection(newSnakeGame({ random: () => 0 }), 'up');
  assert.equal(toggleSnakePause(playing).status, 'paused');
  assert.equal(toggleSnakePause(toggleSnakePause(playing)).status, 'playing');
  const restored = restoreSnakeGame(JSON.parse(JSON.stringify(playing)));
  assert.deepEqual(restored, playing);
  assert.notEqual(restored?.snake, playing.snake);
  assert.equal(restoreSnakeGame({ ...playing, food: playing.snake[0] }), null);
  assert.equal(restoreSnakeGame({ ...playing, score: 999 }), null);
  assert.equal(restoreSnakeGame({ ...playing, snake: [...playing.snake, playing.snake[0]] }), null);
  assert.equal(restoreSnakeGame({ ...playing, snake: [0, 2, 3] }), null);
});
