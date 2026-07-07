import { config } from './config.js';
import { InMemoryCacheService } from './cache/CacheService.js';
import { RateLimitService } from './rateLimit/RateLimitService.js';
import { OpenMeteoProvider } from './providers/weather/OpenMeteoProvider.js';
import { NominatimProvider } from './providers/geocoding/NominatimProvider.js';
import { PhotonProvider } from './providers/geocoding/PhotonProvider.js';
import { OverpassProvider } from './providers/places/OverpassProvider.js';
import { OpenFoodFactsProvider } from './providers/product/OpenFoodFactsProvider.js';
import { HalalIngredientAnalyzer } from './services/HalalIngredientAnalyzer.js';
import { WebMenuChecker } from './services/WebMenuChecker.js';
import { RestaurantHalalVerifier } from './services/RestaurantHalalVerifier.js';

// Simple composition root — every provider is registered by its
// PROVIDER env var name, so switching providers later (e.g. adding a
// second weather provider) is a matter of adding another entry here,
// never touching routes or services.
export function createContainer() {
  const cache = new InMemoryCacheService();
  const rateLimiter = new RateLimitService();

  const weatherProviders = {
    openmeteo: () => new OpenMeteoProvider({ cache, cacheTtlSeconds: config.cacheTtlSeconds }),
  };
  const geocodingProviders = {
    // Default — see PhotonProvider.js for why: Nominatim's public
    // instance blocked server-side calls from a cloud/sandboxed IP
    // during development, which is a real risk now that geocoding is
    // centralized through one backend instead of many browsers.
    photon: () => new PhotonProvider({ cache, rateLimiter, cacheTtlSeconds: config.cacheTtlSeconds }),
    nominatim: () =>
      new NominatimProvider({
        cache,
        rateLimiter,
        userAgent: config.nominatimUserAgent,
        cacheTtlSeconds: config.cacheTtlSeconds,
      }),
  };
  const placesProviders = {
    overpass: () => new OverpassProvider({ cache, rateLimiter, cacheTtlSeconds: config.cacheTtlSeconds }),
  };
  const productProviders = {
    openfoodfacts: () => new OpenFoodFactsProvider({ cache, cacheTtlSeconds: config.cacheTtlSeconds }),
  };

  const weatherProvider = (weatherProviders[config.providers.weather] || weatherProviders.openmeteo)();
  const geocodingProvider = (geocodingProviders[config.providers.geocoding] || geocodingProviders.photon)();
  const placesProvider = (placesProviders[config.providers.places] || placesProviders.overpass)();
  const productProvider = (productProviders[config.providers.product] || productProviders.openfoodfacts)();

  const halalIngredientAnalyzer = new HalalIngredientAnalyzer();
  const webMenuChecker = new WebMenuChecker();
  const restaurantHalalVerifier = new RestaurantHalalVerifier({
    webMenuChecker,
    enableWebMenuCheck: config.enableWebMenuCheck,
  });

  return {
    cache,
    rateLimiter,
    weatherProvider,
    geocodingProvider,
    placesProvider,
    productProvider,
    halalIngredientAnalyzer,
    restaurantHalalVerifier,
  };
}
