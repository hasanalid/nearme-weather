import { Router } from 'express';

export function halalRouter({ halalIngredientAnalyzer, productProvider }) {
  const router = Router();

  // Frontend does OCR + translation to English client-side (Tesseract.js
  // + MyMemory), then POSTs the resulting text here for classification —
  // a single shared rules engine for both the barcode and OCR paths.
  router.post('/halal/ingredients/analyze', (req, res) => {
    const { text } = req.body || {};
    if (typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ error: 'Request body must include a non-empty "text" string' });
    }
    const result = halalIngredientAnalyzer.analyze(text);
    res.json(result);
  });

  router.post('/halal/barcode/lookup', async (req, res) => {
    const { barcode } = req.body || {};
    if (typeof barcode !== 'string' || !barcode.trim()) {
      return res.status(400).json({ error: 'Request body must include a non-empty "barcode" string' });
    }

    try {
      const product = await productProvider.lookupByBarcode(barcode.trim());
      if (!product.found) {
        return res.json({ product, screening: null });
      }

      const ingredientsText = product.ingredientsTextEn || product.ingredientsText || '';
      const screening = ingredientsText.trim() ? halalIngredientAnalyzer.analyze(ingredientsText) : null;

      res.json({ product, screening });
    } catch (err) {
      res.status(502).json({ error: 'Failed to look up product', detail: err.message });
    }
  });

  return router;
}
