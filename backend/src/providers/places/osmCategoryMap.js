// Maps our three frontend discovery categories to OpenStreetMap tags,
// per the product spec. Each entry is queried as node/way/relation
// (parks in particular are often mapped as ways or relations, e.g. a
// protected_area boundary).
export const OSM_CATEGORY_TAGS = {
  parks: [
    { key: 'leisure', value: 'park' },
    { key: 'leisure', value: 'garden' },
    { key: 'boundary', value: 'protected_area' },
    { key: 'landuse', value: 'grass' },
    { key: 'natural', value: 'wood' },
  ],
  outdoor: [
    { key: 'leisure', value: 'playground' },
    { key: 'leisure', value: 'sports_centre' },
    { key: 'leisure', value: 'pitch' },
    { key: 'leisure', value: 'track' },
    { key: 'tourism', value: 'attraction' },
    { key: 'tourism', value: 'picnic_site' },
    { key: 'highway', value: 'path' },
    { key: 'route', value: 'hiking' },
    // Included per spec ("only if useful and clearly outdoor-related") —
    // community centres are a mixed bag indoor/outdoor, kept as a low-
    // priority inclusion rather than dropped entirely.
    { key: 'amenity', value: 'community_centre' },
  ],
  restaurants: [
    { key: 'amenity', value: 'restaurant' },
    { key: 'amenity', value: 'fast_food' },
    { key: 'amenity', value: 'cafe' },
    { key: 'amenity', value: 'food_court' },
  ],
};

export const VALID_CATEGORIES = Object.keys(OSM_CATEGORY_TAGS);
