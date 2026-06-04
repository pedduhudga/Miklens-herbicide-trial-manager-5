/**
 * Performance utilities for throttling, debouncing, and memoization
 */

/**
 * Throttle a function to only execute once per wait period
 */
export function throttle(func, wait = 100) {
  let lastCall = 0;
  let timeout = null;
  let lastArgs = null;

  return function throttled(...args) {
    const now = Date.now();
    lastArgs = args;

    if (now - lastCall >= wait) {
      lastCall = now;
      return func.apply(this, args);
    }

    if (!timeout) {
      timeout = setTimeout(() => {
        lastCall = Date.now();
        timeout = null;
        func.apply(this, lastArgs);
      }, wait - (now - lastCall));
    }
  };
}

/**
 * Debounce a function to execute after wait period of inactivity
 */
export function debounce(func, wait = 300) {
  let timeout = null;

  return function debounced(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

/**
 * Create a memoized version of a function
 */
export function memoize(fn, keyGenerator = (...args) => JSON.stringify(args)) {
  const cache = new Map();

  return function memoized(...args) {
    const key = keyGenerator(...args);
    if (cache.has(key)) {
      return cache.get(key);
    }
    const result = fn.apply(this, args);
    cache.set(key, result);
    return result;
  };
}

/**
 * Run a heavy computation off the main thread using requestIdleCallback
 */
export function runWhenIdle(callback, timeout = 2000) {
  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    return window.requestIdleCallback(callback, { timeout });
  }
  // Fallback to setTimeout
  return setTimeout(callback, 1);
}

/**
 * Batch multiple state updates into a single frame
 */
export function batchUpdates(updates, maxBatchSize = 100) {
  const batches = [];
  for (let i = 0; i < updates.length; i += maxBatchSize) {
    batches.push(updates.slice(i, i + maxBatchSize));
  }

  batches.forEach((batch, index) => {
    runWhenIdle(() => {
      batch.forEach(update => update());
    }, 100 * index);
  });
}

/**
 * Measure function performance
 */
export function measurePerformance(fn, label = 'Function') {
  return function measured(...args) {
    const start = performance.now();
    const result = fn.apply(this, args);
    const end = performance.now();
    console.log(`[Perf] ${label}: ${(end - start).toFixed(2)}ms`);
    return result;
  };
}

/**
 * Create a virtual list config for long lists
 */
export function createVirtualList(totalItems, itemHeight, viewportHeight, overscan = 3) {
  const visibleCount = Math.ceil(viewportHeight / itemHeight);
  const startIndex = 0;
  const endIndex = Math.min(totalItems, visibleCount + overscan);

  return {
    itemHeight,
    viewportHeight,
    visibleCount,
    overscan,
    startIndex,
    endIndex,
    totalHeight: totalItems * itemHeight,
    getVisibleRange: (scrollTop) => {
      const start = Math.floor(scrollTop / itemHeight);
      const end = Math.min(totalItems, start + visibleCount + overscan * 2);
      return { start: Math.max(0, start - overscan), end };
    }
  };
}

// Expose to window for legacy compatibility
if (typeof window !== 'undefined') {
  window.throttle = throttle;
  window.debounce = debounce;
  window.memoize = memoize;
  window.runWhenIdle = runWhenIdle;
}
