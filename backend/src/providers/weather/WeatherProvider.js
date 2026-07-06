// Interface: any weather provider must implement getForecast(lat, lon)
// and resolve to the normalized schema documented below, so routes/
// callers never need to know which upstream is actually in use.
//
// Normalized schema:
// {
//   current: { temperatureC, windKmh, weatherCode, time },
//   daily: { time: [...], weatherCode: [...], tempMaxC: [...], tempMinC: [...], sunrise: [...], sunset: [...] },
//   hourly: { time: [...], temperatureC: [...], weatherCode: [...], precipitationProbability: [...] },
//   utcOffsetSeconds: number,
// }
export class WeatherProvider {
  // eslint-disable-next-line no-unused-vars
  async getForecast(lat, lon) {
    throw new Error('WeatherProvider.getForecast() not implemented');
  }
}
