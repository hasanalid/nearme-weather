import { WeatherProvider } from './WeatherProvider.js';
import { fetchWithTimeout } from '../../utils/http.js';

// MET Norway (Norwegian Meteorological Institute) — free, keyless,
// globally available. Used as a fallback when Open-Meteo is unreachable
// (see FailoverWeatherProvider) — a real production incident, not a
// hypothetical: Open-Meteo returned a persistent 429 from a deployed
// Render free-tier instance while working fine elsewhere, for well over
// an hour. https://api.met.no/weatherapi/locationforecast/2.0/documentation
//
// Requires a real, identifying User-Agent per met.no's usage policy
// (same requirement as Nominatim) — requests with a generic/missing one
// get rejected with a 403.
const USER_AGENT = 'NearHalal/1.0 (+https://github.com/hasanalid/nearme-weather)';

// met.no's "symbol_code" values (clearsky_day, lightrainshowers_night, ...)
// don't map onto WMO codes directly — translated here so the rest of the
// app (WEATHER_CODE_MAP in the frontend) needs zero changes to render a
// met.no-sourced forecast the same way as an Open-Meteo one. Approximate
// by design (this is a fallback path) — day/night/polartwilight suffixes
// are stripped since our WMO subset doesn't distinguish them anyway.
const SYMBOL_BASE_TO_WMO = {
  clearsky: 0,
  fair: 1,
  partlycloudy: 2,
  cloudy: 3,
  fog: 45,
  lightrain: 51,
  rain: 63,
  heavyrain: 65,
  lightrainandthunder: 95,
  rainandthunder: 95,
  heavyrainandthunder: 96,
  lightsleet: 66,
  sleet: 66,
  heavysleet: 67,
  lightsleetshowers: 80,
  sleetshowers: 80,
  heavysleetshowers: 81,
  lightsnow: 71,
  snow: 73,
  heavysnow: 75,
  lightsnowshowers: 85,
  snowshowers: 85,
  heavysnowshowers: 86,
  snowandthunder: 96,
  sleetandthunder: 96,
  lightsnowshowersandthunder: 95,
  snowshowersandthunder: 96,
  heavysnowshowersandthunder: 96,
  lightrainshowers: 80,
  rainshowers: 80,
  heavyrainshowers: 81,
  lightrainshowersandthunder: 95,
  rainshowersandthunder: 95,
  heavyrainshowersandthunder: 96,
};

function symbolToWmoCode(symbolCode) {
  if (!symbolCode) return 3;
  const base = symbolCode.replace(/_(day|night|polartwilight)$/, '');
  return SYMBOL_BASE_TO_WMO[base] ?? 3;
}

function mostCommon(arr) {
  const counts = new Map();
  arr.forEach((v) => counts.set(v, (counts.get(v) || 0) + 1));
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

// met.no returns real UTC instants ("...Z"), unlike Open-Meteo which
// returns naive local-time strings for the queried location. The rest
// of this app (frontend hourly "Now" matching, daily grouping) expects
// the naive-local convention, so we shift by an approximate UTC offset
// and format to match. met.no has no location-timezone endpoint, so this
// uses a longitude-based approximation (~1 hour per 15°) — imprecise
// around DST transitions and political timezone boundaries, but this
// whole provider is a fallback path: "roughly right" beats "no weather
// at all" when Open-Meteo is unreachable.
function approximateUtcOffsetSeconds(lon) {
  return Math.round(lon / 15) * 3600;
}
function toNaiveLocalString(utcIsoString, offsetSeconds) {
  const shifted = new Date(new Date(utcIsoString).getTime() + offsetSeconds * 1000);
  return shifted.toISOString().slice(0, 16);
}

export class MetNoProvider extends WeatherProvider {
  async #fetchLocationforecast(lat, lon) {
    const url = `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${lat}&lon=${lon}`;
    const res = await fetchWithTimeout(url, { headers: { 'User-Agent': USER_AGENT } }, 15000);
    if (!res.ok) throw new Error(`met.no Locationforecast request failed (${res.status})`);
    return res.json();
  }

  async #fetchSunriseSunset(lat, lon, dateStr) {
    try {
      const url = `https://api.met.no/weatherapi/sunrise/3.0/sun?lat=${lat}&lon=${lon}&date=${dateStr}`;
      const res = await fetchWithTimeout(url, { headers: { 'User-Agent': USER_AGENT } }, 10000);
      if (!res.ok) return null;
      const data = await res.json();
      return { sunrise: data.properties?.sunrise?.time, sunset: data.properties?.sunset?.time };
    } catch {
      return null; // sunrise/sunset is a nice-to-have; never block the whole forecast on it
    }
  }

  async getForecast(lat, lon) {
    const offsetSeconds = approximateUtcOffsetSeconds(lon);
    const locationData = await this.#fetchLocationforecast(lat, lon);
    const timeseries = locationData.properties.timeseries;
    if (!timeseries.length) throw new Error('met.no returned no forecast data');

    const hourly = { time: [], temperatureC: [], weatherCode: [], precipitationProbability: [] };
    const dailyMap = new Map(); // date -> { tempMax, tempMin, codes: [] }

    for (const entry of timeseries) {
      const details = entry.data.instant.details;
      const summaryBlock = entry.data.next_1_hours || entry.data.next_6_hours || entry.data.next_12_hours;
      const wmoCode = symbolToWmoCode(summaryBlock?.summary?.symbol_code);
      const localTime = toNaiveLocalString(entry.time, offsetSeconds);

      hourly.time.push(localTime);
      hourly.temperatureC.push(details.air_temperature);
      hourly.weatherCode.push(wmoCode);
      hourly.precipitationProbability.push(entry.data.next_1_hours?.details?.probability_of_precipitation ?? null);

      const dateStr = localTime.slice(0, 10);
      if (!dailyMap.has(dateStr)) dailyMap.set(dateStr, { tempMax: -Infinity, tempMin: Infinity, codes: [] });
      const d = dailyMap.get(dateStr);
      d.tempMax = Math.max(d.tempMax, details.air_temperature);
      d.tempMin = Math.min(d.tempMin, details.air_temperature);
      d.codes.push(wmoCode);
    }

    const dailyDates = [...dailyMap.keys()].slice(0, 7);
    // Only fetch sunrise/sunset for today and reuse it across the week
    // (shifts only ~1-4 minutes/day outside polar regions) rather than
    // firing 7 separate requests on a path that only runs when the
    // primary provider is already down.
    const todaySunTimes = await this.#fetchSunriseSunset(lat, lon, dailyDates[0]);
    const sunrise = todaySunTimes ? toNaiveLocalString(todaySunTimes.sunrise, offsetSeconds) : null;
    const sunset = todaySunTimes ? toNaiveLocalString(todaySunTimes.sunset, offsetSeconds) : null;

    const daily = {
      time: dailyDates,
      weatherCode: dailyDates.map((d) => mostCommon(dailyMap.get(d).codes)),
      tempMaxC: dailyDates.map((d) => dailyMap.get(d).tempMax),
      tempMinC: dailyDates.map((d) => dailyMap.get(d).tempMin),
      sunrise: dailyDates.map(() => sunrise),
      sunset: dailyDates.map(() => sunset),
    };

    const now = timeseries[0];
    const nowSummaryBlock = now.data.next_1_hours || now.data.next_6_hours || now.data.next_12_hours;
    const current = {
      temperatureC: now.data.instant.details.air_temperature,
      windKmh: now.data.instant.details.wind_speed * 3.6, // m/s -> km/h
      weatherCode: symbolToWmoCode(nowSummaryBlock?.summary?.symbol_code),
      time: toNaiveLocalString(now.time, offsetSeconds),
    };

    return { current, daily, hourly, utcOffsetSeconds: offsetSeconds };
  }
}
