import { GeocodingProvider } from './GeocodingProvider.js';
import { fetchWithTimeout } from '../../utils/http.js';

// OpenStreetMap Nominatim — free, keyless, but shared community
// infrastructure with an explicit usage policy we must respect:
//   https://operations.osmfoundation.org/policies/nominatim/
// In particular: max 1 request/second, a real identifying User-Agent,
// and no bulk/automated scraping. `rateLimiter` + `cache` enforce the
// first and reduce load from repeat lookups; `userAgent` covers the second.
export class NominatimProvider extends GeocodingProvider {
  constructor({ cache, rateLimiter, userAgent, cacheTtlSeconds }) {
    super();
    this.cache = cache;
    this.rateLimiter = rateLimiter;
    this.userAgent = userAgent;
    this.cacheTtlSeconds = cacheTtlSeconds;
  }

  async #request(url) {
    return this.rateLimiter.schedule('nominatim', 1000, async () => {
      const res = await fetchWithTimeout(url, {
        headers: { 'User-Agent': this.userAgent, Accept: 'application/json' },
      });
      if (!res.ok) throw new Error(`Nominatim request failed (${res.status})`);
      return res.json();
    });
  }

  #normalize(result) {
    const a = result.address || {};
    const city = a.city || a.town || a.village || a.county || result.display_name.split(',')[0];
    const state = a.state || '';
    const country = a.country || '';
    const label = state && state !== city ? `${city}, ${state}` : city;
    return {
      lat: parseFloat(result.lat),
      lon: parseFloat(result.lon),
      label,
      address: { city, state, country },
    };
  }

  async search(query, { limit = 5 } = {}) {
    const cacheKey = `geocode:search:${query.toLowerCase()}:${limit}`;
    const cached = await this.cache.get(cacheKey);
    if (cached) return cached;

    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&addressdetails=1&limit=${limit}`;
    const raw = await this.#request(url);
    const normalized = raw.map((r) => this.#normalize(r));

    await this.cache.set(cacheKey, normalized, this.cacheTtlSeconds);
    return normalized;
  }

  async reverse(lat, lon) {
    const cacheKey = `geocode:reverse:${lat.toFixed(4)}:${lon.toFixed(4)}`;
    const cached = await this.cache.get(cacheKey);
    if (cached) return cached;

    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=14&addressdetails=1`;
    const raw = await this.#request(url);
    const normalized = this.#normalize({ ...raw, lat, lon });

    await this.cache.set(cacheKey, normalized, this.cacheTtlSeconds);
    return normalized;
  }
}
