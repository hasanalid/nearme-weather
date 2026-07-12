import { PlacesProvider } from './PlacesProvider.js';
import { OSM_CATEGORY_TAGS } from './osmCategoryMap.js';
import { classifyParkType } from './parkClassifier.js';
import { fetchWithTimeout } from '../../utils/http.js';
import { haversineDistanceMeters } from '../../utils/geo.js';

const OVERPASS_ENDPOINT = 'https://overpass-api.de/api/interpreter';
const RESULT_LIMIT = 30; // keep responses small and queries cheap on the shared public instance
// Overpass's server rejects requests with no User-Agent header with a
// generic 406 (observed directly — Node's fetch sends none by default,
// unlike curl). Identifying ourselves is also just good etiquette for a
// shared community resource, same reasoning as Nominatim's policy.
const OVERPASS_HEADERS = { 'Content-Type': 'text/plain', 'User-Agent': 'NearHalal/1.0 (+https://github.com/hasanalid/nearme-weather)' };

function buildQuery(tagPairs, lat, lon, radiusMeters) {
  const clauses = tagPairs
    .flatMap(({ key, value }) => [
      `node["${key}"="${value}"](around:${radiusMeters},${lat},${lon});`,
      `way["${key}"="${value}"](around:${radiusMeters},${lat},${lon});`,
      `relation["${key}"="${value}"](around:${radiusMeters},${lat},${lon});`,
    ])
    .join('\n  ');

  return `[out:json][timeout:25];
(
  ${clauses}
);
out center ${RESULT_LIMIT};`;
}

// Overpass's public instance can be genuinely slow/overloaded for
// certain query shapes — single-ID lookups (used by getById) were
// observed failing with a 504 "server is probably too busy" roughly half
// the time in testing, even though a plain retry a moment later usually
// succeeds. Radius/"around" searches are less affected (they use a
// spatial index) but can hit the same issue under load. Retrying a
// couple of times with a short gap turns an intermittent 504 into a
// transparent success far more often than surfacing it to the user
// immediately. The timeout here (27s) is deliberately ABOVE the query's
// own `[timeout:25]`, so we don't abort client-side before Overpass's
// own server-side timeout would have naturally resolved the request.
async function executeOverpassQuery(query, rateLimiter, { retries = 2 } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await rateLimiter.schedule('overpass', 1000, async () => {
        const res = await fetchWithTimeout(
          OVERPASS_ENDPOINT,
          { method: 'POST', body: query, headers: OVERPASS_HEADERS },
          27000
        );
        if (!res.ok) {
          const err = new Error(`Overpass request failed (${res.status})`);
          err.status = res.status;
          throw err;
        }
        return res.json();
      });
    } catch (err) {
      lastError = err;
      // 429 is Overpass explicitly telling us to slow down (distinct from a
      // transient 502/503/504 "server is busy" — a plain 5xx is worth a
      // quick retry, but hammering a 429 again immediately is exactly the
      // opposite of respecting a shared resource). Other 4xx errors (bad
      // query) won't fix themselves on retry either.
      const isRateLimited = err.status === 429;
      const isTransientServerError = err.status >= 500;
      if (!isRateLimited && !isTransientServerError) break;
      if (attempt === retries) break;
      await new Promise((resolve) => setTimeout(resolve, isRateLimited ? 3000 : 800 * (attempt + 1)));
    }
  }
  throw lastError;
}

function addressFromTags(tags) {
  const parts = [tags['addr:housenumber'], tags['addr:street'], tags['addr:city']].filter(Boolean);
  return parts.length ? parts.join(' ') : null;
}

function normalizeElement(el, category) {
  const lat = el.lat ?? el.center?.lat;
  const lon = el.lon ?? el.center?.lon;
  if (lat == null || lon == null) return null;

  const tags = el.tags || {};
  return {
    id: `${el.type}-${el.id}`, // dash-joined (not slash) so it's a single URL path segment
    name: tags.name || 'Unnamed place',
    category,
    lat,
    lon,
    tags,
    address: addressFromTags(tags),
    website: tags.website || tags['contact:website'] || null,
    websiteMenu: tags['website:menu'] || null,
    phone: tags.phone || tags['contact:phone'] || null,
    openingHours: tags.opening_hours || null,
    ...(category === 'parks' ? { parkType: classifyParkType(tags) } : {}),
  };
}

// OpenStreetMap data via the Overpass API — free, keyless, but a shared
// community resource (https://overpass-api.de is run on donated
// infrastructure). We throttle our own outbound calls and cache results
// aggressively so a burst of frontend requests doesn't translate into a
// burst of Overpass queries.
export class OverpassProvider extends PlacesProvider {
  constructor({ cache, rateLimiter, cacheTtlSeconds }) {
    super();
    this.cache = cache;
    this.rateLimiter = rateLimiter;
    this.cacheTtlSeconds = cacheTtlSeconds;
  }

  async search({ lat, lon, category, radiusMeters }) {
    const tagPairs = OSM_CATEGORY_TAGS[category];
    if (!tagPairs) throw new Error(`Unknown places category: ${category}`);

    // Round coordinates for the cache key so nearby-identical requests
    // (e.g. the user hasn't moved) hit the cache instead of re-querying.
    const cacheKey = `places:${category}:${lat.toFixed(3)}:${lon.toFixed(3)}:${radiusMeters}`;
    const cached = await this.cache.get(cacheKey);
    if (cached) return cached;

    const query = buildQuery(tagPairs, lat, lon, radiusMeters);
    const data = await executeOverpassQuery(query, this.rateLimiter);

    const seen = new Set();
    const places = (data.elements || [])
      .map((el) => normalizeElement(el, category))
      .filter((place) => {
        if (!place) return false;
        if (!place.tags.name) return false; // skip unnamed places - not useful to show without a name
        if (seen.has(place.id)) return false;
        seen.add(place.id);
        return true;
      })
      .map((place) => ({ ...place, distanceMeters: Math.round(haversineDistanceMeters(lat, lon, place.lat, place.lon)) }))
      .sort((a, b) => a.distanceMeters - b.distanceMeters);

    await this.cache.set(cacheKey, places, this.cacheTtlSeconds);
    return places;
  }

  // Looks up a single element by its OSM type+id (e.g. type="node", id="12345"),
  // used by the restaurant detail/verify-halal endpoint so it doesn't need
  // to re-run a whole radius search just to re-fetch one known place.
  async getById(osmType, osmId) {
    const cacheKey = `places:byid:${osmType}/${osmId}`;
    const cached = await this.cache.get(cacheKey);
    if (cached) return cached;

    const query = `[out:json][timeout:25];\n${osmType}(${osmId});\nout center;`;
    const data = await executeOverpassQuery(query, this.rateLimiter);

    const el = (data.elements || [])[0];
    if (!el) return null;

    const normalized = normalizeElement(el, null);
    await this.cache.set(cacheKey, normalized, this.cacheTtlSeconds);
    return normalized;
  }
}
