import { WeatherProvider } from './WeatherProvider.js';
import { fetchWithTimeout } from '../../utils/http.js';

// Open-Meteo: free, keyless, CORS-friendly, no account/registration
// needed for non-commercial use. https://open-meteo.com/
//
// Caching + retry added after observing 429s (rate limited) from a
// deployed Render free-tier instance while the exact same request
// worked fine from a different network — Open-Meteo rate-limits by IP,
// and free-tier hosts often share/rotate outbound IPs across many
// unrelated customers' apps, so this app's own traffic isn't
// necessarily the cause. Caching reduces how much this app itself
// contributes to that shared quota; it can't fix a quota already
// exhausted by other traffic on the same IP, which resolves on its own
// once Open-Meteo's rate-limit window resets.
export class OpenMeteoProvider extends WeatherProvider {
  constructor({ cache, cacheTtlSeconds } = {}) {
    super();
    this.cache = cache;
    // Deliberately much shorter than the general CACHE_TTL_SECONDS used
    // for geocoding/places (which change far less often) — weather data
    // itself updates roughly every 15 minutes, so caching much longer
    // than that would start showing visibly stale conditions.
    this.cacheTtlSeconds = Math.min(cacheTtlSeconds ?? 600, 600);
  }

  async #fetchWithRetry(url, { retries = 2 } = {}) {
    let lastError;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await fetchWithTimeout(url, {}, 15000);
        if (!res.ok) {
          const err = new Error(`Open-Meteo request failed (${res.status})`);
          err.status = res.status;
          throw err;
        }
        return await res.json();
      } catch (err) {
        lastError = err;
        const isRateLimited = err.status === 429;
        const isTransientServerError = err.status >= 500;
        if (!isRateLimited && !isTransientServerError) break;
        if (attempt === retries) break;
        await new Promise((resolve) => setTimeout(resolve, isRateLimited ? 3000 : 500 * (attempt + 1)));
      }
    }
    throw lastError;
  }

  async getForecast(lat, lon) {
    // Rounded to ~1km precision — weather doesn't meaningfully vary at
    // finer granularity, so nearby repeat requests share a cache entry.
    const cacheKey = this.cache ? `weather:${lat.toFixed(2)}:${lon.toFixed(2)}` : null;
    if (cacheKey) {
      const cached = await this.cache.get(cacheKey);
      if (cached) return cached;
    }

    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&current=temperature_2m,wind_speed_10m,weather_code` +
      `&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset` +
      `&hourly=temperature_2m,weather_code,precipitation_probability` +
      `&timezone=auto`;

    const data = await this.#fetchWithRetry(url);

    const normalized = {
      current: {
        temperatureC: data.current.temperature_2m,
        windKmh: data.current.wind_speed_10m,
        weatherCode: data.current.weather_code,
        time: data.current.time,
      },
      daily: {
        time: data.daily.time,
        weatherCode: data.daily.weather_code,
        tempMaxC: data.daily.temperature_2m_max,
        tempMinC: data.daily.temperature_2m_min,
        sunrise: data.daily.sunrise,
        sunset: data.daily.sunset,
      },
      hourly: {
        time: data.hourly.time,
        temperatureC: data.hourly.temperature_2m,
        weatherCode: data.hourly.weather_code,
        precipitationProbability: data.hourly.precipitation_probability,
      },
      utcOffsetSeconds: data.utc_offset_seconds,
    };

    if (cacheKey) await this.cache.set(cacheKey, normalized, this.cacheTtlSeconds);
    return normalized;
  }
}
