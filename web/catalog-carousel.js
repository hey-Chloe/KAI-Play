export const CATALOG_CAROUSEL_DEFAULTS = Object.freeze({
  distanceThreshold: 44,
  velocityThreshold: 0.48,
  axisRatio: 1.12,
});

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizedItemCount(value) {
  const count = Math.floor(finiteNumber(value));
  return Math.max(0, count);
}

function normalizedDirection(direction) {
  return direction === 'rtl' ? 'rtl' : 'ltr';
}

function normalizedRtlMode(mode) {
  return ['negative', 'positive-ascending', 'positive-descending'].includes(mode)
    ? mode
    : 'negative';
}

export function visibleCarouselItems(items) {
  if (!items || typeof items[Symbol.iterator] !== 'function') return [];
  return [...items].filter((item) => item != null && item.hidden !== true);
}

export function clampCarouselIndex(index, itemCount) {
  const count = normalizedItemCount(itemCount);
  if (!count) return -1;
  return Math.min(count - 1, Math.max(0, Math.round(finiteNumber(index))));
}

export function clampCarouselScroll(position, maxScroll, minScroll = 0) {
  const minimum = finiteNumber(minScroll);
  const maximum = Math.max(minimum, finiteNumber(maxScroll, minimum));
  return Math.min(maximum, Math.max(minimum, finiteNumber(position, minimum)));
}

export function carouselScrollBounds(scrollWidth, viewportWidth) {
  const content = Math.max(0, finiteNumber(scrollWidth));
  const viewport = Math.max(0, finiteNumber(viewportWidth));
  return { min:0, max:Math.max(0, content - viewport) };
}

export function carouselDragScrollPosition(startScroll, deltaX, {
  direction = 'ltr',
  minScroll = 0,
  maxScroll = 0,
} = {}) {
  const flow = normalizedDirection(direction) === 'rtl' ? 1 : -1;
  const target = finiteNumber(startScroll) + finiteNumber(deltaX) * flow;
  return clampCarouselScroll(target, maxScroll, minScroll);
}

export function carouselLogicalScrollPosition(scrollLeft, {
  direction = 'ltr',
  rtlMode = 'negative',
  maxScroll = 0,
} = {}) {
  const maximum = Math.max(0, finiteNumber(maxScroll));
  const physical = finiteNumber(scrollLeft);
  if (normalizedDirection(direction) === 'ltr') return clampCarouselScroll(physical, maximum);
  const mode = normalizedRtlMode(rtlMode);
  if (mode === 'negative') return clampCarouselScroll(-physical, maximum);
  if (mode === 'positive-descending') return clampCarouselScroll(maximum - physical, maximum);
  return clampCarouselScroll(physical, maximum);
}

export function carouselPhysicalScrollPosition(logicalPosition, {
  direction = 'ltr',
  rtlMode = 'negative',
  maxScroll = 0,
} = {}) {
  const maximum = Math.max(0, finiteNumber(maxScroll));
  const logical = clampCarouselScroll(logicalPosition, maximum);
  if (normalizedDirection(direction) === 'ltr') return logical;
  const mode = normalizedRtlMode(rtlMode);
  if (mode === 'negative') return -logical;
  if (mode === 'positive-descending') return maximum - logical;
  return logical;
}

export function carouselSnapPositions(itemStarts, {
  minScroll = 0,
  maxScroll = Number.POSITIVE_INFINITY,
} = {}) {
  if (!itemStarts || typeof itemStarts[Symbol.iterator] !== 'function') return [];
  const minimum = finiteNumber(minScroll);
  const rawMaximum = Number(maxScroll);
  const maximum = Number.isFinite(rawMaximum) ? Math.max(minimum, rawMaximum) : Number.POSITIVE_INFINITY;
  return [...itemStarts].map((position) => {
    const normalized = Math.max(minimum, finiteNumber(position, minimum));
    return Math.min(maximum, normalized);
  });
}

export function nearestCarouselIndex(itemStarts, scrollPosition, options = {}) {
  const positions = carouselSnapPositions(itemStarts, options);
  if (!positions.length) return -1;
  const current = finiteNumber(scrollPosition);
  let closestIndex = 0;
  let closestDistance = Math.abs(positions[0] - current);
  for (let index = 1; index < positions.length; index += 1) {
    const distance = Math.abs(positions[index] - current);
    if (distance < closestDistance) {
      closestIndex = index;
      closestDistance = distance;
    }
  }
  return closestIndex;
}

export function targetCarouselScrollPosition(itemStarts, targetIndex, options = {}) {
  const positions = carouselSnapPositions(itemStarts, options);
  const index = clampCarouselIndex(targetIndex, positions.length);
  return index < 0 ? 0 : positions[index];
}

export function stepCarouselIndex(currentIndex, step, itemCount) {
  const count = normalizedItemCount(itemCount);
  if (!count) return -1;
  const current = clampCarouselIndex(currentIndex, count);
  const normalizedStep = Math.sign(finiteNumber(step));
  return clampCarouselIndex(current + normalizedStep, count);
}

export function carouselReleaseDecision({
  currentIndex = 0,
  itemCount = 0,
  deltaX = 0,
  deltaY = 0,
  elapsedMs = 0,
  velocityX,
  direction = 'ltr',
  distanceThreshold = CATALOG_CAROUSEL_DEFAULTS.distanceThreshold,
  velocityThreshold = CATALOG_CAROUSEL_DEFAULTS.velocityThreshold,
  axisRatio = CATALOG_CAROUSEL_DEFAULTS.axisRatio,
} = {}) {
  const count = normalizedItemCount(itemCount);
  if (!count) return { index:-1, step:0, shouldPage:false, reason:'empty', velocity:0 };
  const current = clampCarouselIndex(currentIndex, count);
  if (count === 1) return { index:0, step:0, shouldPage:false, reason:'single', velocity:0 };

  const horizontal = finiteNumber(deltaX);
  const vertical = finiteNumber(deltaY);
  const duration = finiteNumber(elapsedMs);
  const measuredVelocity = duration > 0 ? horizontal / duration : 0;
  const releaseVelocity = Number.isFinite(Number(velocityX)) ? Number(velocityX) : measuredVelocity;
  const distanceLimit = Math.max(0, finiteNumber(distanceThreshold, CATALOG_CAROUSEL_DEFAULTS.distanceThreshold));
  const velocityLimit = Math.max(0, finiteNumber(velocityThreshold, CATALOG_CAROUSEL_DEFAULTS.velocityThreshold));
  const intentRatio = Math.max(1, finiteNumber(axisRatio, CATALOG_CAROUSEL_DEFAULTS.axisRatio));

  if (Math.abs(horizontal) < Math.abs(vertical) * intentRatio) {
    return { index:current, step:0, shouldPage:false, reason:'vertical', velocity:releaseVelocity };
  }

  const passedDistance = Math.abs(horizontal) >= distanceLimit;
  const passedVelocity = Math.abs(releaseVelocity) >= velocityLimit;
  if (!passedDistance && !passedVelocity) {
    return { index:current, step:0, shouldPage:false, reason:'threshold', velocity:releaseVelocity };
  }

  const releaseLeads = passedVelocity && Math.sign(releaseVelocity) !== 0;
  const gestureDirection = Math.sign(releaseLeads ? releaseVelocity : horizontal);
  if (!gestureDirection) {
    return { index:current, step:0, shouldPage:false, reason:'threshold', velocity:releaseVelocity };
  }
  const flowDirection = normalizedDirection(direction) === 'rtl' ? 1 : -1;
  const requestedStep = gestureDirection * flowDirection;
  const index = stepCarouselIndex(current, requestedStep, count);
  const step = index - current;
  return {
    index,
    step,
    shouldPage:step !== 0,
    reason:step === 0 ? 'boundary' : passedVelocity ? 'velocity' : 'distance',
    velocity:releaseVelocity,
  };
}

export function releaseCarouselIndex(options = {}) {
  return carouselReleaseDecision(options).index;
}
