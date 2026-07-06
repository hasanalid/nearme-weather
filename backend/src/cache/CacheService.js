// Interface (documented via JSDoc rather than TypeScript, to keep the
// backend dependency-light): any cache implementation must provide
// async get(key) -> value|null and async set(key, value, ttlSeconds) -> void.
export class CacheService {
  // eslint-disable-next-line no-unused-vars
  async get(key) {
    throw new Error('CacheService.get() not implemented');
  }

  // eslint-disable-next-line no-unused-vars
  async set(key, value, ttlSeconds) {
    throw new Error('CacheService.set() not implemented');
  }
}

// Development/default implementation — a plain in-memory Map with TTL.
// Cleared on process restart, per-instance only (doesn't share state
// across multiple backend instances). Swap in a RedisCacheService with
// the same get/set shape when that matters (multi-instance deployment,
// persistence across restarts) — nothing else in the app needs to change,
// since routes/providers only depend on this interface.
export class InMemoryCacheService extends CacheService {
  constructor() {
    super();
    this.store = new Map();
  }

  async get(key) {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key, value, ttlSeconds) {
    this.store.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  }

  // Convenience for tests/diagnostics — not part of the CacheService interface.
  size() {
    return this.store.size;
  }
}
