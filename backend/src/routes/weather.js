import { Router } from 'express';

export function weatherRouter({ weatherProvider }) {
  const router = Router();

  router.get('/weather', async (req, res) => {
    const lat = parseFloat(req.query.lat);
    const lon = parseFloat(req.query.lon);
    if (Number.isNaN(lat) || Number.isNaN(lon)) {
      return res.status(400).json({ error: 'lat and lon query parameters are required and must be numbers' });
    }

    try {
      const forecast = await weatherProvider.getForecast(lat, lon);
      res.json(forecast);
    } catch (err) {
      res.status(502).json({ error: 'Failed to fetch weather data', detail: err.message });
    }
  });

  return router;
}
