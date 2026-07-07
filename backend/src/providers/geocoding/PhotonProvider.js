import { GeocodingProvider } from './GeocodingProvider.js';
import { fetchWithTimeout } from '../../utils/http.js';

// Photon (https://photon.komoot.io) — free, keyless, OSM-based geocoder
// run by komoot. Same underlying OpenStreetMap data as Nominatim, but a
// separate public instance with its own (more lenient in practice)
// infrastructure. Added as an alternative to Nominatim after Nominatim's
// public instance returned "Access denied" (403) for server-side calls
// from a cloud/sandboxed IP during development — a real risk for any
// backend-centralized deployment, since all users' geocoding requests
// now come from one server IP instead of many separate browsers. Still
// throttled and cached the same way, out of the same courtesy to a
// shared community resource.
export class PhotonProvider extends GeocodingProvider {
  constructor({ cache, rateLimiter, cacheTtlSeconds }) {
    super();
    this.cache = cache;
    this.rateLimiter = rateLimiter;
    this.cacheTtlSeconds = cacheTtlSeconds;
  }

  async #request(url) {
    return this.rateLimiter.schedule('photon', 1000, async () => {
      const res = await fetchWithTimeout(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(`Photon request failed (${res.status})`);
      return res.json();
    });
  }

  #normalize(feature) {
    const [lon, lat] = feature.geometry.coordinates; // GeoJSON order: [lon, lat]
    const p = feature.properties || {};
    const place = p.city || p.district || p.locality || p.name || p.county || 'Unknown location';
    const state = p.state || '';
    const country = p.country || '';
    const region = state || country;
    const label = region && region !== place ? `${place}, ${region}` : place;
    return { lat, lon, label, address: { city: p.city || place, state, country } };
  }

  async search(query, { limit = 5 } = {}) {
    const cacheKey = `geocode:search:${query.toLowerCase()}:${limit}`;
    const cached = await this.cache.get(cacheKey);
    if (cached) return cached;

    // lang=en so place names come back in English (matching the app's UI)
    // rather than the local script — Photon defaults to local names otherwise.
    const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=${limit}&lang=en`;
    const data = await this.#request(url);
    const normalized = (data.features || []).map((f) => this.#normalize(f));

    await this.cache.set(cacheKey, normalized, this.cacheTtlSeconds);
    return normalized;
  }

  async reverse(lat, lon) {
    const cacheKey = `geocode:reverse:${lat.toFixed(4)}:${lon.toFixed(4)}`;
    const cached = await this.cache.get(cacheKey);
    if (cached) return cached;

    const url = `https://photon.komoot.io/reverse?lat=${lat}&lon=${lon}&lang=en`;
    const data = await this.#request(url);
    const feature = (data.features || [])[0];
    const normalized = feature ? this.#normalize(feature) : { lat, lon, label: 'Unknown location', address: {} };

    await this.cache.set(cacheKey, normalized, this.cacheTtlSeconds);
    return normalized;
  }
}
