import { fetchWithTimeout } from '../utils/http.js';
import { haversineDistanceMeters } from '../utils/geo.js';

// Cross-checks restaurants against two real, independent Canadian halal
// certification bodies' own public directories — HMA Canada (Halal
// Monitoring Authority) and ISNA Canada. Both publish plain server-
// rendered HTML pages (no login, no API key, no JS execution required to
// read them), so this is fetched the same conservative way as
// WebMenuChecker: read-only, cached, never used to submit anything.
//
// A match here is treated as the STRONGEST possible evidence in
// RestaurantHalalVerifier — stronger than an OSM tag or scraped menu
// text — because it means a real third-party auditor has certified this
// specific business, not just an inferred/self-reported signal.
const HMA_DIRECTORY_URL = 'https://hmacanada.org/hma-certified-restaurants/';
const ISNA_DIRECTORY_URL = 'https://isnahalal.com/certified-companies/';
const USER_AGENT = 'NearHalal/1.0 (+https://github.com/hasanalid/nearme-weather)';

const DIRECTORY_TTL_SECONDS = 24 * 60 * 60; // directories change rarely; refetch once a day
const FAILURE_TTL_SECONDS = 10 * 60; // don't hammer the source again immediately after a failure
const ISNA_MATCH_RADIUS_METERS = 300; // ISNA entries carry real coordinates, so proximity is trustworthy

function normalizeName(name) {
  return (name || '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ') // strip parenthetical qualifiers, e.g. "(Bolton)"
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function namesMatch(a, b) {
  if (!a || !b) return false;
  return a.includes(b) || b.includes(a);
}

// HMA's certified-restaurants page groups entries under a per-city <h3>
// heading (e.g. "Brampton"), each followed by its own Elementor icon-list
// of restaurant names — the city almost never appears on the entry
// itself (a rare exception like "Fortinos Supermarket (Bolton)" repeats
// it parenthetically, but most entries like "The Kabab Shoppe" rely
// entirely on the preceding heading). So this does a single sequential
// scan, tracking "current city" across headings as it encounters them.
// No coordinates are published at all, only this city label — see
// findMatch() for why that means we require an addr:city match rather
// than trusting name alone.
//
// Scoped to between the city <select> dropdown and the page footer,
// because elsewhere on the page (nav, footer social links) reuses the
// exact same icon-list widget markup for unrelated links.
export function parseHmaDirectory(html) {
  const startIdx = html.indexOf('</select>');
  const endIdx = html.search(/elementor-location-footer|<footer/i);
  const scoped = startIdx !== -1 && endIdx !== -1 ? html.slice(startIdx, endIdx) : html;

  const entries = [];
  const re = /<h3 class="pxl-item--title[^>]*>\s*([^<]+?)\s*<\/h3>|elementor-icon-list-text">\s*([^<(]+?)(?:\s*\([^)]+\))?\s*(?:→|&#8594;)?\s*<\/span>/g;
  let currentCity = null;
  let m;
  while ((m = re.exec(scoped))) {
    if (m[1] !== undefined) {
      currentCity = m[1].trim();
      continue;
    }
    const rawName = (m[2] || '').trim();
    if (!rawName) continue;
    entries.push({ name: rawName, city: currentCity, normalizedName: normalizeName(rawName) });
  }
  return entries;
}

// ISNA's certified-companies page renders every certified business
// (all categories, all provinces) as one static grid — each entry's
// wrapping div carries a `job_listing_category-restaurants` class when
// it's a restaurant, and (for most entries) real data-latitude/
// data-longitude attributes, which is far more reliable than name
// matching alone.
export function parseIsnaDirectory(html) {
  const blocks = html.split(/(?=<div class="job-grid-style )/);
  const entries = [];
  for (const block of blocks) {
    const classMatch = block.match(/^<div class="([^"]+)"/);
    if (!classMatch) continue;
    if (!/\bjob_listing_category-restaurants\b/.test(classMatch[1])) continue;

    const nameMatch = block.match(/class=listing-title>\s*<a href="([^"]+)">([^<]+)</);
    if (!nameMatch) continue;

    const latMatch = block.match(/data-latitude=([-0-9.]+)/);
    const lonMatch = block.match(/data-longitude=([-0-9.]+)/);
    const regionMatch = block.match(/listing-location[\s\S]*?<a href="\/region\/[^"]+">([^<]+)<\/a>/);

    entries.push({
      name: nameMatch[2].trim(),
      url: `https://isnahalal.com${nameMatch[1]}`,
      lat: latMatch ? Number(latMatch[1]) : null,
      lon: lonMatch ? Number(lonMatch[1]) : null,
      city: regionMatch ? regionMatch[1].trim() : null,
      normalizedName: normalizeName(nameMatch[2]),
    });
  }
  return entries;
}

export class HalalCertificationDirectoryService {
  constructor({ cache, cacheTtlSeconds = DIRECTORY_TTL_SECONDS } = {}) {
    this.cache = cache;
    this.cacheTtlSeconds = cacheTtlSeconds;
    // Dedupes concurrent cold-cache fetches — verify() runs per-restaurant
    // via Promise.all in the /api/restaurants list route, so without this
    // a cache miss during a busy moment would fire one fetch per
    // restaurant instead of one fetch total.
    this.pending = new Map();
  }

  async #fetchDirectory(cacheKey, url, parse) {
    const cached = await this.cache.get(cacheKey);
    if (cached) return cached;
    if (this.pending.has(cacheKey)) return this.pending.get(cacheKey);

    const promise = (async () => {
      try {
        const res = await fetchWithTimeout(url, { headers: { 'User-Agent': USER_AGENT } }, 8000);
        if (!res.ok) throw new Error(`status ${res.status}`);
        const html = await res.text();
        const entries = parse(html);
        await this.cache.set(cacheKey, entries, this.cacheTtlSeconds);
        return entries;
      } catch (err) {
        console.error(`[HalalCertification] Failed to fetch ${url}`, { error: err.message });
        await this.cache.set(cacheKey, [], FAILURE_TTL_SECONDS);
        return [];
      } finally {
        this.pending.delete(cacheKey);
      }
    })();

    this.pending.set(cacheKey, promise);
    return promise;
  }

  async getHmaDirectory() {
    return this.#fetchDirectory('halal-cert:hma', HMA_DIRECTORY_URL, parseHmaDirectory);
  }

  async getIsnaDirectory() {
    return this.#fetchDirectory('halal-cert:isna', ISNA_DIRECTORY_URL, parseIsnaDirectory);
  }

  /**
   * Looks for a real certification match for one restaurant. Deliberately
   * conservative: a name match alone is never enough on its own for
   * either source, because these directories list national chains
   * (Fortinos, Paramount Fine Foods, etc.) where only specific branches
   * are certified — matching by name only would wrongly certify every
   * branch everywhere. ISNA matches are gated by real GPS proximity when
   * available; both sources fall back to requiring the restaurant's own
   * addr:city tag to agree with the directory's city label when no
   * coordinates are available.
   */
  async findMatch({ name, lat, lon, addrCity }) {
    const normalizedTarget = normalizeName(name);
    if (!normalizedTarget) return null;

    const [hma, isna] = await Promise.all([this.getHmaDirectory(), this.getIsnaDirectory()]);
    const normalizedCity = addrCity ? addrCity.toLowerCase() : null;

    for (const entry of isna) {
      if (!namesMatch(normalizedTarget, entry.normalizedName)) continue;
      if (entry.lat != null && entry.lon != null && lat != null && lon != null) {
        const distance = haversineDistanceMeters(lat, lon, entry.lat, entry.lon);
        if (distance <= ISNA_MATCH_RADIUS_METERS) {
          return { source: 'ISNA Canada', url: entry.url, matchedName: entry.name };
        }
        continue; // name matched but it's a different branch elsewhere — not this restaurant
      }
      if (normalizedCity && entry.city && entry.city.toLowerCase().includes(normalizedCity)) {
        return { source: 'ISNA Canada', url: entry.url, matchedName: entry.name };
      }
    }

    if (normalizedCity) {
      for (const entry of hma) {
        if (!namesMatch(normalizedTarget, entry.normalizedName)) continue;
        if (entry.city && entry.city.toLowerCase().includes(normalizedCity)) {
          return { source: 'HMA Canada', url: HMA_DIRECTORY_URL, matchedName: entry.name };
        }
      }
    }

    return null;
  }
}
