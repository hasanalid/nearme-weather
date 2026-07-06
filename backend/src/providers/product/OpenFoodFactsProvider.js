import { ProductProvider } from './ProductProvider.js';
import { fetchWithTimeout } from '../../utils/http.js';

// Open Food Facts — free, keyless, CORS-friendly, community-editable
// product database. https://world.openfoodfacts.org/
export class OpenFoodFactsProvider extends ProductProvider {
  constructor({ cache, cacheTtlSeconds }) {
    super();
    this.cache = cache;
    this.cacheTtlSeconds = cacheTtlSeconds;
  }

  async lookupByBarcode(barcode) {
    const cacheKey = `product:${barcode}`;
    const cached = await this.cache.get(cacheKey);
    if (cached) return cached;

    const res = await fetchWithTimeout(
      `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json`
    );
    if (!res.ok) throw new Error(`Open Food Facts request failed (${res.status})`);
    const data = await res.json();

    let normalized;
    if (data.status !== 1 || !data.product) {
      normalized = { found: false, barcode };
    } else {
      const p = data.product;
      normalized = {
        found: true,
        barcode,
        name: p.product_name || 'Unknown product',
        brand: p.brands || null,
        ingredientsText: p.ingredients_text || '',
        ingredientsTextEn: p.ingredients_text_en || '',
        allergens: (p.allergens_tags || []).map((a) => a.replace(/^en:/, '')),
        traces: (p.traces_tags || []).map((t) => t.replace(/^en:/, '')),
        labels: (p.labels_tags || []).map((l) => l.replace(/^en:/, '')),
        categories: (p.categories_tags || []).map((c) => c.replace(/^en:/, '')),
      };
    }

    // Cache both hits and misses — a repeated scan of a barcode that
    // genuinely isn't in the database shouldn't re-hit Open Food Facts
    // every time either.
    await this.cache.set(cacheKey, normalized, this.cacheTtlSeconds);
    return normalized;
  }
}
