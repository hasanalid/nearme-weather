import 'dotenv/config';

// Central place that reads environment variables — everything else in the
// app imports `config` instead of touching `process.env` directly, so the
// available knobs are easy to find in one file and easy to document in
// .env.example / README.
export const config = {
  port: Number(process.env.PORT) || 3000,

  providers: {
    weather: process.env.WEATHER_PROVIDER || 'openmeteo',
    // Default is photon, not nominatim — see PhotonProvider.js for why
    // (Nominatim's public instance blocked server-side calls from a
    // cloud/sandboxed IP during development). Nominatim is still fully
    // supported; set GEOCODING_PROVIDER=nominatim to use it instead.
    geocoding: process.env.GEOCODING_PROVIDER || 'photon',
    places: process.env.PLACES_PROVIDER || 'overpass',
    product: process.env.PRODUCT_PROVIDER || 'openfoodfacts',
  },

  nominatimUserAgent: process.env.NOMINATIM_USER_AGENT || 'NearHalal/1.0 (no contact configured - set NOMINATIM_USER_AGENT)',

  enableWebMenuCheck: process.env.ENABLE_WEB_MENU_CHECK === 'true',

  cacheTtlSeconds: Number(process.env.CACHE_TTL_SECONDS) || 3600,
  // Optional persistent cache. Unset (the default) means in-memory, which
  // is simplest for local dev but is wiped on every restart/redeploy. Set
  // to a real Redis connection string (e.g. from a free Upstash instance)
  // to survive restarts — see container.js and RedisCacheService.js.
  redisUrl: process.env.REDIS_URL || null,

  maxSearchRadiusMeters: Number(process.env.MAX_SEARCH_RADIUS_METERS) || 5000,
  defaultSearchRadiusMeters: Number(process.env.DEFAULT_SEARCH_RADIUS_METERS) || 3000,

  apiRateLimitPerMinute: Number(process.env.API_RATE_LIMIT_PER_MINUTE) || 60,
};
