# Near Halal

A location-discovery app (weather, parks, outdoor activities, restaurants)
combined with a camera-based Halal Scanner — built entirely on free,
open, keyless data providers. No paid APIs are used anywhere by default.

> **Repo name note**: the repo is still named `nearme-weather` from an
> earlier version of this project (a single-page static app hosted on
> GitHub Pages). That static deployment no longer applies — this is now
> a Node.js backend + static frontend, and needs a host that can run a
> server (see "Deployment" below), not GitHub Pages.

## Architecture

```
frontend/        Static HTML/CSS/JS (no build step, no framework) — served
                 by the backend as static files.
backend/         Node.js + Express API. Provider-based: every external
                 data source sits behind a small interface so it can be
                 swapped later without touching routes or the frontend.
  src/providers/ WeatherProvider, GeocodingProvider, PlacesProvider,
                 ProductProvider — one default (free) implementation each.
  src/services/  HalalIngredientAnalyzer, RestaurantHalalVerifier,
                 WebMenuChecker — the halal screening/verification logic.
  src/cache/     CacheService (in-memory by default; swappable for Redis).
  src/rateLimit/ RateLimitService — throttles OUR OWN outbound calls to
                 Nominatim/Overpass, separate from the inbound
                 express-rate-limit middleware that protects the API itself.
  src/routes/    The 8 API endpoints (see below).
  test/          node:test unit tests for the two rules-engine services.
```

## Free API providers used

| Concern | Default provider | Notes |
|---|---|---|
| Weather | [Open-Meteo](https://open-meteo.com/) | Free, keyless for non-commercial use. |
| Geocoding | [Photon](https://photon.komoot.io/) (default) or [OpenStreetMap Nominatim](https://nominatim.org/) | Both free, keyless, OSM-based. Photon is the default — see rate-limit notes below for why. Switch with `GEOCODING_PROVIDER=nominatim`. |
| Places (parks, outdoor activities, restaurants) | [OpenStreetMap Overpass API](https://overpass-api.de/) | Free, keyless, shared community resource. |
| Product/barcode lookup | [Open Food Facts](https://world.openfoodfacts.org/) | Free, keyless, community-editable product database. |
| Ingredient OCR | [Tesseract.js](https://github.com/naptha/tesseract.js) | Runs entirely client-side (in the browser) — no image is ever sent to a server for OCR. |
| Ingredient translation | [MyMemory](https://mymemory.translated.net/) | Free, keyless, used client-side to translate OCR'd/non-English ingredient text to English before the backend screens it. |

None of these require an API key for the usage this app makes of them.
**No paid API (Google Places, Yelp, Foursquare, etc.) is used anywhere,
and none is wired in even as a disabled option** — the provider
interfaces make it straightforward to add one later if ever needed (see
"Adding a future paid provider" below), but nothing here calls out to one.

## Rate-limit notes (please read before deploying at any scale)

- **Why Photon is the default, not Nominatim**: during development,
  Nominatim's public instance returned `403 Access denied` for
  server-side geocoding calls made from a cloud/sandboxed IP — this is a
  real risk for ANY backend-centralized deployment (see "Centralization
  tradeoff" below), not just this dev environment. Photon (run by komoot,
  same underlying OSM data) worked cleanly from the same IP in testing.
  Both are still fully supported behind the same `GeocodingProvider`
  interface — switch back with `GEOCODING_PROVIDER=nominatim` if you'd
  rather use Nominatim (e.g. if you're self-hosting it). Note: Photon
  defaults to returning place names in the local script; we pass
  `lang=en` to keep results in English, matching the app's UI.
- **Nominatim** (if selected): max 1 request/second, enforced server-side
  via `RateLimitService`. Requires a real, identifying `User-Agent` — set
  `NOMINATIM_USER_AGENT` in your `.env` before switching to it
  (Nominatim's policy:
  <https://operations.osmfoundation.org/policies/nominatim/>). Results
  are cached (`CACHE_TTL_SECONDS`) so repeat lookups don't re-hit it at all.
- **Photon**: no stricter published policy than Nominatim's, but still a
  shared community-run public instance — throttled (1/second) and cached
  the same way, out of the same courtesy.
- **Overpass**: no official rate limit as strict as Nominatim's, but it's
  explicitly a donated, shared community resource — outbound calls are
  still throttled (1/second) and results cached the same way. Overpass's
  server also rejects requests with no `User-Agent` header (a 406 — this
  was hit and fixed during development; Node's `fetch` doesn't send a
  default one, unlike `curl`).
- **Centralization tradeoff**: because these calls now go through YOUR
  backend instead of directly from each user's own browser, your
  server's IP is responsible for every user's combined request volume —
  a busier app hits Nominatim/Overpass's fair-use limits faster than the
  old per-browser architecture would have. If this app grows, the
  documented mitigation path is: increase `CACHE_TTL_SECONDS`, or swap in
  a paid geocoding provider / self-hosted Nominatim instance behind the
  same `GeocodingProvider` interface — no route or frontend changes
  needed.
- **Open Food Facts**: no strict published rate limit for this volume of
  use; results are cached (hits and misses both) the same way.

## Attribution

- **OpenStreetMap** (Nominatim + Overpass data): "© OpenStreetMap
  contributors", data available under the [Open Database License
  (ODbL)](https://www.openstreetmap.org/copyright). Shown in the
  frontend's footer.
- **Open-Meteo**: attribution appreciated, not strictly required for this
  usage tier — shown in the footer anyway.
- **Open Food Facts**: community project under the [Open Database
  License](https://opendatacommons.org/licenses/odbl/1-0/) — shown in
  the footer.

## Local setup

```bash
cd backend
cp .env.example .env      # then edit NOMINATIM_USER_AGENT at minimum
npm install
npm test                  # runs the HalalIngredientAnalyzer / RestaurantHalalVerifier unit tests
npm run lint
npm start                 # serves the API + the static frontend on http://localhost:3000
```

Open `http://localhost:3000` — the backend serves the frontend as static
files from the same process, so there's no separate frontend server or
CORS configuration needed.

## Environment variables

See `backend/.env.example` for the full list with defaults and comments.
Summary:

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | Backend port. |
| `WEATHER_PROVIDER` | `openmeteo` | Provider key looked up in `container.js`. |
| `GEOCODING_PROVIDER` | `nominatim` | Same. |
| `PLACES_PROVIDER` | `overpass` | Same. |
| `PRODUCT_PROVIDER` | `openfoodfacts` | Same. |
| `NOMINATIM_USER_AGENT` | *(placeholder — change this)* | Required by Nominatim's usage policy. |
| `ENABLE_WEB_MENU_CHECK` | `false` | Whether the restaurant verifier may fetch a restaurant's own official website/menu URL (from OSM data only) as supplementary evidence. Off by default since it performs a live third-party fetch. |
| `CACHE_TTL_SECONDS` | `3600` | In-memory cache TTL for geocoding/places/restaurant/product lookups. |
| `MAX_SEARCH_RADIUS_METERS` | `5000` | Hard cap on the `radius` query param for `/api/places` and `/api/restaurants`. |
| `DEFAULT_SEARCH_RADIUS_METERS` | `3000` | Used when `radius` isn't specified. |
| `API_RATE_LIMIT_PER_MINUTE` | `60` | Inbound rate limit per client IP against our own API (protects the free upstream providers from being hammered via us). |

## API endpoints

- `GET /api/health`
- `GET /api/weather?lat=&lon=`
- `GET /api/geocode?q=` or `?lat=&lon=` (forward or reverse)
- `GET /api/places?lat=&lon=&category=parks|outdoor|restaurants&radius=`
- `GET /api/restaurants?lat=&lon=&radius=` — like `/api/places?category=restaurants`, but each result includes a `halal` classification computed from OSM tags only (cheap, safe to run for a whole list).
- `GET /api/restaurants/:id/verify-halal` — deeper, single-restaurant check; additionally fetches the restaurant's own official site/menu if `ENABLE_WEB_MENU_CHECK=true` and a URL is available.
- `POST /api/halal/ingredients/analyze` — body `{ "text": "..." }`, returns the keyword screening result.
- `POST /api/halal/barcode/lookup` — body `{ "barcode": "..." }`, looks the product up on Open Food Facts and screens its ingredients server-side.

## Deployment

The Dockerfile at the repo root builds an image containing both
`backend/` and the `frontend/` it serves — build context is the **repo
root**, not `backend/`:

```bash
docker build -t near-halal .
docker run -p 3000:3000 --env-file backend/.env near-halal
```

`render.yaml` is an example config for [Render](https://render.com)
(Docker-based, has a free tier) — other Docker-friendly hosts (Fly.io,
Railway, a plain VPS) work the same way. GitHub Pages **cannot** run
this — it only serves static files, and this app now needs a real
server process.

## Restaurant halal verification — known limitations

This is a **free-first, evidence-based screening aid**, not a
certification authority. Please read this before trusting or extending
its output:

- **Data completeness**: OpenStreetMap doesn't have a `diet:halal` tag
  (or any halal-related tag) for most restaurants worldwide. Many results
  will honestly be "Unknown" — that's the correct, honest answer when no
  evidence exists, not a bug.
- **Cuisine-based heuristic**: as a narrow exception to "never infer from
  cuisine alone," restaurants tagged with a cuisine commonly associated
  with halal food worldwide (Turkish, Lebanese, Pakistani, Persian,
  Moroccan, etc. — see `HALAL_LIKELY_CUISINE_KEYWORDS` in
  `RestaurantHalalVerifier.js`) get a **"Likely Halal," low-confidence**
  classification instead of "Unknown" when no stronger evidence exists.
  This is still just a heuristic, not a confirmation — a specific
  restaurant using one of these cuisines can still be run non-halal,
  which is why it's always low confidence and always says "not confirmed,
  please verify." Pork evidence or an explicit `diet:halal=no` tag still
  overrides it.
- **No ratings**: OSM has no rating/review field, unlike commercial
  providers (Google Places, Yelp). The UI simply omits a rating rather
  than fabricating one.
- **Official website/menu check is shallow**: when enabled, it does a
  plain-text keyword scan of the fetched page (after checking
  `robots.txt`) — it cannot distinguish a halal-only branch/menu section
  from a mixed one, understand images/PDFs, or parse structured menu
  data. A pork mention anywhere on the page is treated as disqualifying
  evidence for the *whole* place, which could theoretically be wrong for
  a restaurant with a clearly separated halal-only section — the
  classification for that edge case defaults to the safer / more
  cautious outcome (Non-Halal) rather than guessing.
- **Never treat "Halal Confirmed" as absolute**: always shown alongside
  a "Please verify before visiting" note in the UI unless the
  classification is exactly `halal_confirmed`, and the persistent
  disclaimer ("Halal status is based on available public data and may be
  incomplete...") is always shown in the restaurants tab regardless of
  classification.
- **This applies to the ingredient scanner too**: see
  `backend/src/services/HalalIngredientAnalyzer.js` and CLAUDE.md's "Why
  the cautious result labeling" section — the same non-absolute wording
  principle governs both features.

## Adding a future paid provider

Every external data source sits behind a small interface
(`WeatherProvider`, `GeocodingProvider`, `PlacesProvider`,
`ProductProvider` — see `backend/src/providers/`). To add a paid
provider (e.g. Google Places for richer restaurant data/ratings):

1. Implement the interface, e.g. `backend/src/providers/places/GooglePlacesProvider.js`.
2. Register it in `backend/src/container.js`'s provider map under a new
   key (e.g. `googleplaces`).
3. Point `PLACES_PROVIDER=googleplaces` in `.env`, and add the
   provider's own API key as a new env var (document it in
   `.env.example`).
4. No changes needed to routes, the frontend, or any other provider —
   they only depend on the interface, not the concrete implementation.

Per this project's "free-first" principle, any paid provider should stay
**optional and disabled by default** — `openmeteo`/`nominatim`/
`overpass`/`openfoodfacts` should remain the defaults unless there's a
deliberate, discussed reason to change them.
