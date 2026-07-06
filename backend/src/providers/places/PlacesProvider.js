// Interface: search({ lat, lon, category, radiusMeters }) -> normalized place[]
//
// Normalized place schema:
// {
//   id, name, category, lat, lon, distanceMeters, tags,
//   address, website, websiteMenu, phone, openingHours,
// }
export class PlacesProvider {
  // eslint-disable-next-line no-unused-vars
  async search({ lat, lon, category, radiusMeters }) {
    throw new Error('PlacesProvider.search() not implemented');
  }
}
