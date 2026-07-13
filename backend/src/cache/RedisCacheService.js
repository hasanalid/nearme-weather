import { CacheService } from './CacheService.js';

// Persistent cache backend — same get/set interface as
// InMemoryCacheService, but the data survives process restarts and
// redeploys (in-memory doesn't: every Render restart/redeploy wipes it,
// so the next visitor after any deploy pays full cold-fetch price again
// for weather/places/halal-certification lookups).
//
// Takes an already-constructed client (e.g. `new Redis(url)` from
// ioredis) rather than a URL, so it's trivially testable with a fake
// client and container.js stays the one place that knows about actual
// connection details/env vars.
//
// Fails CLOSED, not open: if Redis is unreachable or returns garbage, get()
// returns null (a cache miss) and set() silently no-ops, rather than
// throwing. Every caller in this codebase (OverpassProvider,
// OpenMeteoProvider, HalalCertificationDirectoryService, etc.) assumes
// cache.get()/set() never throws — a Redis outage should degrade to
// "slower, always re-fetching," never to a 502 for the whole app.
export class RedisCacheService extends CacheService {
  constructor({ client }) {
    super();
    this.client = client;
  }

  async get(key) {
    try {
      const raw = await this.client.get(key);
      if (raw == null) return null;
      return JSON.parse(raw);
    } catch (err) {
      console.error('[RedisCacheService] get failed, treating as a cache miss', { key, error: err.message });
      return null;
    }
  }

  async set(key, value, ttlSeconds) {
    try {
      await this.client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch (err) {
      console.error('[RedisCacheService] set failed, continuing without caching this entry', { key, error: err.message });
    }
  }
}
