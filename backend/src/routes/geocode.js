import { Router } from 'express';

export function geocodeRouter({ geocodingProvider }) {
  const router = Router();

  router.get('/geocode', async (req, res) => {
    const { q, lat, lon } = req.query;

    try {
      if (lat !== undefined && lon !== undefined) {
        const parsedLat = parseFloat(lat);
        const parsedLon = parseFloat(lon);
        if (Number.isNaN(parsedLat) || Number.isNaN(parsedLon)) {
          return res.status(400).json({ error: 'lat and lon must be numbers' });
        }
        const result = await geocodingProvider.reverse(parsedLat, parsedLon);
        return res.json({ results: [result] });
      }

      if (!q || !q.trim()) {
        return res.status(400).json({ error: 'q query parameter is required (or provide lat & lon for reverse geocoding)' });
      }

      const limit = req.query.limit ? Math.min(Number(req.query.limit), 10) : 5;
      const results = await geocodingProvider.search(q.trim(), { limit });
      res.json({ results });
    } catch (err) {
      res.status(502).json({ error: 'Failed to geocode', detail: err.message });
    }
  });

  return router;
}
