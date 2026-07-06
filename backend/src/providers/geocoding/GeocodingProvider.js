// Interface: search(query) -> normalized result[]; reverse(lat, lon) -> normalized result
//
// Normalized result schema:
// { lat, lon, label, address: { city, state, country, ... } }
export class GeocodingProvider {
  // eslint-disable-next-line no-unused-vars
  async search(query) {
    throw new Error('GeocodingProvider.search() not implemented');
  }

  // eslint-disable-next-line no-unused-vars
  async reverse(lat, lon) {
    throw new Error('GeocodingProvider.reverse() not implemented');
  }
}
