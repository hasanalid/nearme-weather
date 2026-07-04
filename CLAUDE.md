# NearMe Weather — Project Context

## What this is
A single-file, client-only mobile web app (PWA) that shows the user's local
weather, a 7-day forecast, and nearby Wikipedia landmarks — with zero backend,
zero accounts, and zero API keys.

## Files
- `index.html` — the entire app: HTML, Tailwind CSS (via CDN script tag), and
  vanilla JavaScript, all in one file. No build step.
- `manifest.json` — PWA manifest (name, icons, theme color, standalone display).
- `sw.js` — minimal service worker. Caches the app shell only (index.html,
  manifest, icons) for offline installability. Does NOT cache live API
  responses — weather/location data should always be fetched fresh.
- `icon-192.png`, `icon-512.png` — app icons (dark background, sky-blue pin).

## Hard constraints — do not violate these without asking first
- No npm, no bundler, no build step. Everything must keep running as plain
  static files openable via a simple local server or GitHub Pages.
- No API keys, no login, no accounts, no backend of any kind.
- No `localStorage`/`sessionStorage` (kept out deliberately — no persistence
  by design, since there's no account system).
- Must remain mobile-first, dark-themed, single-column (`max-w-md mx-auto`).

## APIs used (all free, keyless, CORS-friendly) — do not swap these without discussion
- **Nominatim** (OpenStreetMap) — `https://nominatim.openstreetmap.org/reverse`
  and `/search` — for reverse geocoding (coords → place name) and forward
  geocoding (typed city → coords) and autocomplete suggestions. Has a fair-use
  rate limit (~1 req/sec) since there's no per-user API key.
- **Open-Meteo** — `https://api.open-meteo.com/v1/forecast` — current weather
  + 7-day daily forecast in one call. Weather codes follow the WMO standard
  (mapped in `WEATHER_CODE_MAP` in the JS).
- **Wikipedia GeoSearch** — `https://en.wikipedia.org/w/api.php?action=query&list=geosearch`
  — nearby landmarks within a 10km radius (`gsradius=10000`).
- **Google Maps** — link-only, not fetched. Built from lat/lon as
  `https://www.google.com/maps/search/?api=1&query={lat},{lon}` — no API key
  needed for a plain deep link.

## Key features already implemented
1. Mobile-first dark UI (Tailwind CDN)
2. Geolocation on load (`navigator.geolocation`)
3. Reverse geocoding to show a readable place name
4. Current weather (temp, wind, condition text/emoji, sunrise/sunset)
5. 7-day horizontally scrolling forecast strip
6. Nearby landmarks grouped into collapsible categories (Parks & Nature,
   Museums & Culture, Religious Sites, Historic Landmarks, Buildings &
   Transit, Other Attractions) — classified by keyword-matching each
   place's Wikipedia short description (`prop=description`, one batched
   call for all pageids). Collapsed by default so someone in a hurry sees
   category counts instead of scrolling a long flat list. Each card still
   has a Wikipedia link AND a Google Maps link, with distance explicitly
   labeled ("X km from your current location" or "X km from <searched
   city>")
7. Manual city search bar with debounced (300ms) autocomplete dropdown,
   keyboard navigation (arrows/enter/escape), tolerant of typos via
   Nominatim's built-in fuzzy matching
8. PWA install support via manifest + service worker
9. Hourly forecast bottom-sheet modal — tapping the current weather card
   or any day in the 7-day strip opens that day's hour-by-hour breakdown
   (temp, condition, precipitation probability), with the current hour
   highlighted as "Now" when viewing today. Reads from the same
   Open-Meteo response already fetched (`hourly=...`), no extra request.
   Note: Open-Meteo returns naive local-time strings for the queried
   location (no UTC offset embedded), so the "Now" comparison shifts the
   real UTC clock by the response's `utc_offset_seconds` and compares as
   strings — don't compare those timestamps directly against `new Date()`.

## Why these choices (for context on any future changes)
- Vanilla JS instead of React/Vue: app has too little state to justify a
  framework or build step, and the brief was "single file, no build tools."
- Tailwind via CDN instead of compiled Tailwind: same reasoning — zero
  build step, at the cost of a heavier uncompiled CSS payload.
- These three APIs specifically: they're the rare combination of free +
  keyless + CORS-enabled, matching the "no registration" requirement.

## Deployment
Hosted as a static site on GitHub Pages. All 5 files live at the repo root
(not in a subfolder) since they reference each other by relative path.

## When making changes
- Keep everything in `index.html` unless a change specifically needs a new
  file (e.g. a new icon size).
- If you touch `sw.js`, bump `CACHE_NAME` (e.g. `nearme-weather-v2`) so
  browsers don't keep serving a stale cached shell.
- Preserve the distance-labeling behavior (always state what location
  distances are measured FROM).
- Preserve copyright/attribution: no API keys should ever be introduced for
  the three core APIs above — that would break the "no registration" premise
  of the whole app.
