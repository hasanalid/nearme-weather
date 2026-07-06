import { Router } from 'express';
import { config } from '../config.js';

// Disclaimer text shown alongside every restaurant result — see
// README "Restaurant halal verification limitations" for why this is
// always present rather than only shown for uncertain results.
export const RESTAURANT_DISCLAIMER =
  'Halal status is based on available public data and may be incomplete. Please verify directly with the restaurant before visiting.';

function parsePlaceId(id) {
  const dashIndex = id.indexOf('-');
  if (dashIndex === -1) return null;
  const osmType = id.slice(0, dashIndex);
  const osmId = id.slice(dashIndex + 1);
  if (!['node', 'way', 'relation'].includes(osmType) || !/^\d+$/.test(osmId)) return null;
  return { osmType, osmId };
}

export function restaurantsRouter({ placesProvider, restaurantHalalVerifier }) {
  const router = Router();

  // List restaurants near a point. Uses only cheap, tag-based evidence
  // (no outbound website fetches) so it's safe to run for every result
  // in a list without hammering third-party sites.
  router.get('/restaurants', async (req, res) => {
    const lat = parseFloat(req.query.lat);
    const lon = parseFloat(req.query.lon);
    if (Number.isNaN(lat) || Number.isNaN(lon)) {
      return res.status(400).json({ error: 'lat and lon query parameters are required' });
    }
    const requestedRadius = req.query.radius ? Number(req.query.radius) : config.defaultSearchRadiusMeters;
    const radiusMeters = Math.min(Math.max(requestedRadius, 100), config.maxSearchRadiusMeters);

    try {
      const places = await placesProvider.search({ lat, lon, category: 'restaurants', radiusMeters });
      const restaurants = await Promise.all(
        places.map(async (place) => ({
          ...place,
          halal: await restaurantHalalVerifier.verify(place, { deep: false }),
        }))
      );
      res.json({ radiusMeters, count: restaurants.length, disclaimer: RESTAURANT_DISCLAIMER, restaurants });
    } catch (err) {
      res.status(502).json({ error: 'Failed to fetch restaurants', detail: err.message });
    }
  });

  // Deep, single-restaurant verification: additionally fetches the
  // restaurant's own official website/menu (if ENABLE_WEB_MENU_CHECK=true
  // and a URL is available from OSM data) for supplementary evidence.
  // Intentionally NOT run automatically for every restaurant in a list —
  // that would mean fetching many third-party sites per page view.
  router.get('/restaurants/:id/verify-halal', async (req, res) => {
    const parsed = parsePlaceId(req.params.id);
    if (!parsed) {
      return res.status(400).json({ error: 'Invalid restaurant id format (expected e.g. "node-123456")' });
    }

    try {
      const place = await placesProvider.getById(parsed.osmType, parsed.osmId);
      if (!place) {
        return res.status(404).json({ error: 'Restaurant not found' });
      }
      const halal = await restaurantHalalVerifier.verify(place, { deep: true });
      res.json({ place, halal, disclaimer: RESTAURANT_DISCLAIMER });
    } catch (err) {
      res.status(502).json({ error: 'Failed to verify restaurant', detail: err.message });
    }
  });

  return router;
}
