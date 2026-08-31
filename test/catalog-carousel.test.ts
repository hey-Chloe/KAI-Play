import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CATALOG_CAROUSEL_DEFAULTS,
  carouselDragScrollPosition,
  carouselLogicalScrollPosition,
  carouselPhysicalScrollPosition,
  carouselReleaseDecision,
  carouselScrollBounds,
  carouselSnapPositions,
  clampCarouselIndex,
  clampCarouselScroll,
  nearestCarouselIndex,
  releaseCarouselIndex,
  stepCarouselIndex,
  targetCarouselScrollPosition,
  visibleCarouselItems,
} from '../web/catalog-carousel.js';

test('visibleCarouselItems preserves filtered order without mutating the source', () => {
  const cards = [
    { id:'ddz', hidden:false, start:2 },
    { id:'xiangqi', hidden:true, start:228 },
    { id:'farm', start:454 },
    null,
    { id:'snake', hidden:false, start:680 },
  ];
  const before = [...cards];
  assert.deepEqual(visibleCarouselItems(cards).map((card) => card.id), ['ddz', 'farm', 'snake']);
  assert.deepEqual(cards, before);
  assert.deepEqual(visibleCarouselItems(new Set([cards[0], cards[1], cards[2]])).map((card) => card.id), ['ddz', 'farm']);
  assert.deepEqual(visibleCarouselItems(null), []);
  assert.deepEqual(visibleCarouselItems({ length:1 }), []);
});

test('index and scroll clamps provide stable empty and boundary behavior', () => {
  assert.equal(clampCarouselIndex(2, 5), 2);
  assert.equal(clampCarouselIndex(2.6, 5), 3);
  assert.equal(clampCarouselIndex(-20, 5), 0);
  assert.equal(clampCarouselIndex(20, 5), 4);
  assert.equal(clampCarouselIndex(Number.NaN, 5), 0);
  assert.equal(clampCarouselIndex(3, 0), -1);
  assert.equal(clampCarouselIndex(3, -2), -1);

  assert.equal(clampCarouselScroll(80, 400), 80);
  assert.equal(clampCarouselScroll(-12, 400), 0);
  assert.equal(clampCarouselScroll(900, 400), 400);
  assert.equal(clampCarouselScroll(3, 2, 5), 5);
  assert.equal(clampCarouselScroll(Number.NaN, 400, 7), 7);
  assert.deepEqual(carouselScrollBounds(1_420, 900), { min:0, max:520 });
  assert.deepEqual(carouselScrollBounds(500, 900), { min:0, max:0 });
  assert.deepEqual(carouselScrollBounds(-1, Number.NaN), { min:0, max:0 });

  assert.equal(carouselDragScrollPosition(200, -70, { maxScroll:600 }), 270);
  assert.equal(carouselDragScrollPosition(200, 70, { maxScroll:600 }), 130);
  assert.equal(carouselDragScrollPosition(580, -70, { maxScroll:600 }), 600);
  assert.equal(carouselDragScrollPosition(20, 70, { maxScroll:600 }), 0);
  assert.equal(carouselDragScrollPosition(200, 70, { direction:'rtl', maxScroll:600 }), 270);
  assert.equal(carouselDragScrollPosition(200, -70, { direction:'rtl', maxScroll:600 }), 130);
});

test('logical and physical scroll conversions round-trip LTR and explicit RTL models', () => {
  const ltr = { direction:'ltr', maxScroll:600 } as const;
  assert.equal(carouselLogicalScrollPosition(180, ltr), 180);
  assert.equal(carouselPhysicalScrollPosition(180, ltr), 180);
  assert.equal(carouselLogicalScrollPosition(900, ltr), 600);

  const negative = { direction:'rtl', rtlMode:'negative', maxScroll:600 } as const;
  assert.equal(carouselLogicalScrollPosition(-180, negative), 180);
  assert.equal(carouselPhysicalScrollPosition(180, negative), -180);

  const descending = { direction:'rtl', rtlMode:'positive-descending', maxScroll:600 } as const;
  assert.equal(carouselLogicalScrollPosition(420, descending), 180);
  assert.equal(carouselPhysicalScrollPosition(180, descending), 420);

  const ascending = { direction:'rtl', rtlMode:'positive-ascending', maxScroll:600 } as const;
  assert.equal(carouselLogicalScrollPosition(180, ascending), 180);
  assert.equal(carouselPhysicalScrollPosition(180, ascending), 180);

  assert.equal(carouselLogicalScrollPosition(-80, { direction:'rtl', rtlMode:'unknown', maxScroll:600 }), 80);
  assert.equal(carouselPhysicalScrollPosition(80, { direction:'rtl', rtlMode:'unknown', maxScroll:600 }), -80);
  assert.equal(carouselLogicalScrollPosition(-80, { direction:'unknown', maxScroll:600 }), 0);
});

test('snap geometry handles uneven cards, filtered gaps, the terminal clamp, and ties', () => {
  const allCards = [
    { id:'a', hidden:false, start:2 },
    { id:'hidden', hidden:true, start:228 },
    { id:'b', hidden:false, start:248 },
    { id:'c', hidden:false, start:510 },
    { id:'d', hidden:false, start:790 },
  ];
  const starts = visibleCarouselItems(allCards).map((card) => card.start);
  assert.deepEqual(starts, [2, 248, 510, 790]);
  assert.deepEqual(carouselSnapPositions(starts, { minScroll:2, maxScroll:540 }), [2, 248, 510, 540]);
  assert.equal(nearestCarouselIndex(starts, 246, { minScroll:2, maxScroll:540 }), 1);
  assert.equal(nearestCarouselIndex(starts, 525, { minScroll:2, maxScroll:540 }), 2, 'ties keep the earlier stable card');
  assert.equal(nearestCarouselIndex(starts, 900, { minScroll:2, maxScroll:540 }), 3);
  assert.equal(targetCarouselScrollPosition(starts, 2, { minScroll:2, maxScroll:540 }), 510);
  assert.equal(targetCarouselScrollPosition(starts, 99, { minScroll:2, maxScroll:540 }), 540);
  assert.equal(targetCarouselScrollPosition(starts, -99, { minScroll:2, maxScroll:540 }), 2);

  assert.deepEqual(carouselSnapPositions([20, Number.NaN, -5]), [20, 0, 0]);
  assert.deepEqual(carouselSnapPositions(null), []);
  assert.equal(nearestCarouselIndex([], 0), -1);
  assert.equal(targetCarouselScrollPosition([], 4), 0);
});

test('stepCarouselIndex advances one card and clamps both ends', () => {
  assert.equal(stepCarouselIndex(2, 1, 5), 3);
  assert.equal(stepCarouselIndex(2, -8, 5), 1, 'a command advances exactly one page regardless of magnitude');
  assert.equal(stepCarouselIndex(2, 0, 5), 2);
  assert.equal(stepCarouselIndex(0, -1, 5), 0);
  assert.equal(stepCarouselIndex(4, 1, 5), 4);
  assert.equal(stepCarouselIndex(0, 1, 1), 0);
  assert.equal(stepCarouselIndex(0, 1, 0), -1);
});

test('LTR release uses either deliberate distance or a short fast flick', () => {
  const below = carouselReleaseDecision({ currentIndex:2, itemCount:6, deltaX:-30, deltaY:4, elapsedMs:180 });
  assert.deepEqual(below, { index:2, step:0, shouldPage:false, reason:'threshold', velocity:-1 / 6 });

  const distance = carouselReleaseDecision({ currentIndex:2, itemCount:6, deltaX:-60, deltaY:8, elapsedMs:400 });
  assert.equal(distance.index, 3);
  assert.equal(distance.step, 1);
  assert.equal(distance.shouldPage, true);
  assert.equal(distance.reason, 'distance');

  const fast = carouselReleaseDecision({ currentIndex:2, itemCount:6, deltaX:-18, deltaY:2, elapsedMs:20 });
  assert.equal(fast.index, 3);
  assert.equal(fast.reason, 'velocity');
  assert.equal(fast.velocity, -0.9);

  const previous = carouselReleaseDecision({ currentIndex:2, itemCount:6, deltaX:58, deltaY:2, elapsedMs:500 });
  assert.equal(previous.index, 1);
  assert.equal(previous.step, -1);
  assert.equal(previous.reason, 'distance');
});

test('release velocity follows the final gesture, while vertical motion does not hijack the page', () => {
  const reversed = carouselReleaseDecision({
    currentIndex:3,
    itemCount:7,
    deltaX:-70,
    deltaY:3,
    elapsedMs:300,
    velocityX:0.72,
  });
  assert.equal(reversed.index, 2, 'a fast reversal at release wins over the older total displacement');
  assert.equal(reversed.reason, 'velocity');

  const vertical = carouselReleaseDecision({
    currentIndex:3,
    itemCount:7,
    deltaX:-60,
    deltaY:80,
    elapsedMs:50,
  });
  assert.equal(vertical.index, 3);
  assert.equal(vertical.reason, 'vertical');
  assert.equal(vertical.shouldPage, false);

  const missingTime = carouselReleaseDecision({ currentIndex:2, itemCount:5, deltaX:-20 });
  assert.equal(missingTime.index, 2, 'missing timing cannot turn a short movement into an artificial fast flick');
  assert.equal(missingTime.velocity, 0);
});

test('release clamps boundaries, handles one or zero cards, and supports RTL flow', () => {
  const atEnd = carouselReleaseDecision({ currentIndex:4, itemCount:5, deltaX:-70, elapsedMs:300 });
  assert.deepEqual({ index:atEnd.index, step:atEnd.step, shouldPage:atEnd.shouldPage, reason:atEnd.reason }, {
    index:4, step:0, shouldPage:false, reason:'boundary',
  });
  const atStart = carouselReleaseDecision({ currentIndex:0, itemCount:5, deltaX:70, elapsedMs:300 });
  assert.equal(atStart.index, 0);
  assert.equal(atStart.reason, 'boundary');

  assert.deepEqual(carouselReleaseDecision({ currentIndex:4, itemCount:1, deltaX:-100, elapsedMs:100 }), {
    index:0, step:0, shouldPage:false, reason:'single', velocity:0,
  });
  assert.deepEqual(carouselReleaseDecision({ itemCount:0, deltaX:-100, elapsedMs:100 }), {
    index:-1, step:0, shouldPage:false, reason:'empty', velocity:0,
  });

  assert.equal(releaseCarouselIndex({ currentIndex:2, itemCount:5, deltaX:60, elapsedMs:300, direction:'rtl' }), 3);
  assert.equal(releaseCarouselIndex({ currentIndex:2, itemCount:5, deltaX:-60, elapsedMs:300, direction:'rtl' }), 1);
});

test('thresholds remain configurable for card width and motion tuning', () => {
  assert.deepEqual(CATALOG_CAROUSEL_DEFAULTS, {
    distanceThreshold:44,
    velocityThreshold:0.48,
    axisRatio:1.12,
  });
  const exactDistance = carouselReleaseDecision({
    currentIndex:1,
    itemCount:4,
    deltaX:-30,
    deltaY:20,
    elapsedMs:1_000,
    distanceThreshold:30,
    velocityThreshold:2,
    axisRatio:1.4,
  });
  assert.equal(exactDistance.index, 2);
  assert.equal(exactDistance.reason, 'distance');

  const exactVelocity = carouselReleaseDecision({
    currentIndex:1,
    itemCount:4,
    deltaX:-10,
    elapsedMs:100,
    velocityX:-0.2,
    distanceThreshold:100,
    velocityThreshold:0.2,
  });
  assert.equal(exactVelocity.index, 2);
  assert.equal(exactVelocity.reason, 'velocity');
});
