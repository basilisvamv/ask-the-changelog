// Rate limit: allows up to `max` calls within `windowMs`. The clock is passed in from outside, so it can be tested.
export function createRateLimiter({ max, windowMs, now = () => Date.now() }) {
  const hits = [];
  return function allow() {
    const t = now();
    while (hits.length && hits[0] <= t - windowMs) hits.shift();
    if (hits.length >= max) return false;
    hits.push(t);
    return true;
  };
}

// Lock per key: the same key can be locked only once at a time.
export function createLock() {
  const held = new Set();
  return {
    tryLock(key) {
      if (held.has(key)) return false;
      held.add(key);
      return true;
    },
    unlock(key) {
      held.delete(key);
    },
  };
}
