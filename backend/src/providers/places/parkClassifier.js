// Splits "parks" category results into two subcategories for the UI:
// large provincial/territorial parks vs. everyday local/neighbourhood
// parks. OpenStreetMap has no single reliable tag for "this is a
// provincial park" everywhere, so this is a best-effort, tag-based
// approximation (documented in CLAUDE.md) similar in spirit to
// MetNoProvider's longitude-based UTC offset — it will under-classify a
// provincial park that isn't textually labelled as such in its tags, but
// never mis-labels a small local park as provincial (the pattern only
// matches on explicit "provincial" wording, not on size or protection
// status alone).
const PROVINCIAL_PATTERN = /provincial/i;

export const PARK_TYPE = {
  PROVINCIAL: 'provincial',
  LOCAL: 'local',
};

export function classifyParkType(tags = {}) {
  const haystack = [tags.protection_title, tags.operator, tags.designation, tags.name]
    .filter(Boolean)
    .join(' ');
  return PROVINCIAL_PATTERN.test(haystack) ? PARK_TYPE.PROVINCIAL : PARK_TYPE.LOCAL;
}
