import { WeatherProvider } from './WeatherProvider.js';
import { fetchWithTimeout } from '../../utils/http.js';

// Open-Meteo: free, keyless, CORS-friendly, no account/registration
// needed for non-commercial use. https://open-meteo.com/
export class OpenMeteoProvider extends WeatherProvider {
  async getForecast(lat, lon) {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&current=temperature_2m,wind_speed_10m,weather_code` +
      `&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset` +
      `&hourly=temperature_2m,weather_code,precipitation_probability` +
      `&timezone=auto`;

    const res = await fetchWithTimeout(url);
    if (!res.ok) throw new Error(`Open-Meteo request failed (${res.status})`);
    const data = await res.json();

    return {
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
  }
}
