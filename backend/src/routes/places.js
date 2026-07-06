import { Router } from 'express';
import { config } from '../config.js';
import { VALID_CATEGORIES } from '../providers/places/osmCategoryMap.js';

export function placesRouter({ placesProvider }) {
  const router = Router();

  router.get('/places', async (req, res) => {
    const lat = parseFloat(req.query.lat);
    const lon = parseFloat(req.query.lon);
    const category = req.query.category;

    if (Number.isNaN(lat) || Number.isNaN(lon)) {
      return res.status(400).json({ error: 'lat and lon query parameters are required' });
    }
    if (!VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({ error: `category must be one of: ${VALID_CATEGORIES.join(', ')}` });
    }

    // Clamp to [100, MAX_SEARCH_RADIUS_METERS] so a caller can't request
    // an unreasonably large radius against the shared Overpass instance.
    const requestedRadius = req.query.radius ? Number(req.query.radius) : config.defaultSearchRadiusMeters;
    const radiusMeters = Math.min(Math.max(requestedRadius, 100), config.maxSearchRadiusMeters);

    try {
      const places = await placesProvider.search({ lat, lon, category, radiusMeters });
      res.json({ category, radiusMeters, count: places.length, places });
    } catch (err) {
      res.status(502).json({ error: 'Failed to fetch places', detail: err.message });
    }
  });

  return router;
}
