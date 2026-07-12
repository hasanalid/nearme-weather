import { WeatherProvider } from './WeatherProvider.js';

// Wraps a primary + secondary WeatherProvider: tries primary first,
// automatically falls back to secondary if it throws. Added after a real
// production incident where Open-Meteo returned a persistent 429 from a
// deployed Render free-tier instance (a shared-outbound-IP rate-limit
// collision — see README "Centralization tradeoff") for well over an
// hour, leaving the weather card stuck loading with no way to recover
// short of a code/config change. This makes that class of failure
// self-healing instead.
export class FailoverWeatherProvider extends WeatherProvider {
  constructor(primary, secondary) {
    super();
    this.primary = primary;
    this.secondary = secondary;
  }

  async getForecast(lat, lon) {
    try {
      return await this.primary.getForecast(lat, lon);
    } catch (primaryErr) {
      console.error('[Weather] Primary provider failed, falling back', { error: primaryErr.message });
      try {
        return await this.secondary.getForecast(lat, lon);
      } catch (secondaryErr) {
        console.error('[Weather] Fallback provider also failed', { error: secondaryErr.message });
        // Surface the primary's error - it's the one operators need to
        // act on (e.g. re-check Open-Meteo's status), not the fallback's.
        throw primaryErr;
      }
    }
  }
}
