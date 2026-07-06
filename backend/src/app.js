import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { createContainer } from './container.js';
import { healthRouter } from './routes/health.js';
import { weatherRouter } from './routes/weather.js';
import { geocodeRouter } from './routes/geocode.js';
import { placesRouter } from './routes/places.js';
import { restaurantsRouter } from './routes/restaurants.js';
import { halalRouter } from './routes/halal.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApp(container = createContainer()) {
  const app = express();

  app.use(cors());
  app.use(express.json());

  // Inbound rate limiting: protects OUR OWN API (and, transitively, the
  // free upstream services it calls) from being hammered by a client —
  // separate concern from RateLimitService, which throttles our OUTBOUND
  // calls to Nominatim/Overpass specifically.
  const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: config.apiRateLimitPerMinute,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please slow down.' },
  });
  app.use('/api', apiLimiter);

  app.use('/api', healthRouter());
  app.use('/api', weatherRouter(container));
  app.use('/api', geocodeRouter(container));
  app.use('/api', placesRouter(container));
  app.use('/api', restaurantsRouter(container));
  app.use('/api', halalRouter(container));

  // Serve the frontend as static files from the same process — keeps
  // deployment to a single service (no separate frontend host, no CORS
  // to configure between them).
  const frontendDir = path.join(__dirname, '../../frontend');
  app.use(express.static(frontendDir));

  return app;
}
