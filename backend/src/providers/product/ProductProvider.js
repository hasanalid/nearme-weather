// Interface: lookupByBarcode(barcode) -> normalized product | { found: false }
//
// Normalized product schema:
// {
//   found, barcode, name, brand, ingredientsText, ingredientsTextEn,
//   allergens, traces, labels, categories,
// }
export class ProductProvider {
  // eslint-disable-next-line no-unused-vars
  async lookupByBarcode(barcode) {
    throw new Error('ProductProvider.lookupByBarcode() not implemented');
  }
}
