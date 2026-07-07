# Near Halal — Project Context

## What this is
A location-discovery app (local weather, 7-day forecast, nearby parks /
outdoor activities / restaurants) combined with a camera-based
multilingual Halal Scanner — built on a **provider-based Node.js backend**
plus a static frontend, using only free/open/keyless data sources by
default (no paid API is wired in anywhere, not even as a disabled
option).

The name **Near Halal** was chosen by the user from four proposed options
(HalalNear, Halal Compass, NearHalal, HalalScope) once the app grew from
"weather + landmarks" into also including halal ingredient scanning; a
space was added afterward for readability — everywhere user-facing
(title, header, manifest), it's two words.

**Note on the repo name/URL**: the GitHub repo is intentionally still
named `nearme-weather` (not renamed to match) to avoid an unrelated,
disruptive rename. It no longer matters for hosting the same way it used
to, though — see "Architecture history" below.

## Architecture history (important context, do not re-introduce by accident)
This project went through a genuine architecture pivot, not just feature
additions:
- **Originally**: a single `index.html` file, zero backend, zero build
  step, all free APIs (Nominatim, Open-Meteo, Wikipedia, Open Food Facts,
  MyMemory) called directly from the browser, hosted as a static site on
  GitHub Pages.
- **Now**: a real Node.js + Express backend (`backend/`) sits between the
  frontend and every external provider, and the frontend (`frontend/`)
  is served as static files by that same backend process. GitHub Pages
  **cannot** host this anymore — it only serves static files, and this
  app now needs a process that can run a server.
- This pivot happened because a product spec explicitly required a
  provider-based backend architecture (REST endpoints, env-var provider
  selection, server-side caching/rate-limiting, an evidence-based
  restaurant halal verifier) that's fundamentally incompatible with a
  static single-file app. The user was asked to confirm this tradeoff
  explicitly before it happened, since it meant leaving behind the
  "single file, no backend, GitHub Pages" setup that had been the
  project's hard constraint from the very first turn.
- **Do not silently revert to the old static-only architecture** (e.g. by
  "simplifying" a feature back to a direct browser→external-API call) —
  the whole point of this pivot was centralizing those calls server-side
  for caching, rate-limiting, and a single shared rules engine. If a
  future change seems to want that reversion, ask first — it's the same
  category of decision as the original pivot.

## Repo layout
```
frontend/        Static HTML/CSS/JS — no build step, no framework
                  (Tailwind via CDN, vanilla JS). Served by the backend
                  as static files (see backend/src/app.js).
  index.html      The entire UI in one file, as before.
  manifest.json   PWA manifest.
  sw.js           Service worker — app-shell cache-first, but explicitly
                  excludes /api/* (see comment in the file) now that API
                  calls are same-origin with the frontend.
  icon-192.png,
  icon-512.png    App icons (see "App icon design" below).

backend/          Node.js + Express API (ES modules, `"type": "module"`).
  src/providers/  One interface + one default free-provider implementation
                  each: WeatherProvider (Open-Meteo), GeocodingProvider
                  (Nominatim), PlacesProvider (Overpass), ProductProvider
                  (Open Food Facts). Swappable later via container.js
                  without touching routes/frontend.
  src/services/   HalalIngredientAnalyzer (keyword screening — the single
                  shared rules engine for both barcode and OCR paths),
                  RestaurantHalalVerifier (evidence-based classification),
                  WebMenuChecker (optional, off-by-default official
                  website/menu text fetch, robots.txt-respecting).
  src/cache/      CacheService interface + InMemoryCacheService (default;
                  swap in Redis later behind the same interface).
  src/rateLimit/  RateLimitService — throttles OUR OWN outbound calls to
                  Nominatim/Overpass. Separate from the inbound
                  express-rate-limit middleware in app.js, which protects
                  the API itself from being hammered by a client.
  src/routes/     The 8 API endpoints (see README).
  src/config.js   Single place that reads all env vars.
  src/container.js Composition root — instantiates cache/rate-limiter/
                  providers/services based on config, wires them into
                  routes.
  test/           node:test unit tests for HalalIngredientAnalyzer and
                  RestaurantHalalVerifier (pure, no network — run with
                  `npm test`).
  Dockerfile      Lives at the REPO ROOT (not backend/), since its build
                  context needs both backend/ and frontend/ as siblings.
  render.yaml     Example deployment config (Render; any Docker host works).
```

## Hard constraints — do not violate these without asking first
- **No paid API, anywhere, even as a disabled/optional path.** Every
  provider interface (`WeatherProvider`, `GeocodingProvider`,
  `PlacesProvider`, `ProductProvider`) currently has exactly one free/
  keyless implementation registered. See README "Adding a future paid
  provider" for how to add one *if the user explicitly asks* — don't add
  one preemptively "for completeness."
- **Free-first, provider-interface architecture.** Don't hardcode a
  specific provider's API shape into a route or the frontend — go
  through the provider/service abstraction so a provider can be swapped
  via `container.js` + an env var alone.
- **Respect the free upstream services.** Nominatim: 1 req/sec + a real
  `User-Agent` (`NOMINATIM_USER_AGENT`), enforced via `RateLimitService`.
  Overpass: also throttled and requires a `User-Agent` (its server 406s
  requests without one — hit and fixed during development, since Node's
  `fetch` sends none by default unlike `curl`). Cache aggressively
  (`CacheService`) rather than re-querying.
- **No `localStorage`/`sessionStorage` in the frontend** (kept out
  deliberately — no persistence by design, no account system). Backend
  in-memory caching is fine (it's server-side, not the browser).
- **Frontend stays a static, build-step-free single page** (`frontend/`)
  — the backend is where npm/Node tooling lives now, not the frontend.
- Must remain mobile-first, dark-themed, single-column (`max-w-md
  mx-auto`).

## Free API providers used (see README for the full table + rate-limit/attribution notes)
- **Open-Meteo** (weather) — `backend/src/providers/weather/OpenMeteoProvider.js`.
- **Photon** (geocoding, default) — `backend/src/providers/geocoding/PhotonProvider.js`, komoot's OSM-based geocoder. **OpenStreetMap Nominatim** is also fully implemented (`NominatimProvider.js`) and selectable via `GEOCODING_PROVIDER=nominatim`, but is NOT the default — Nominatim's public instance returned `403 Access denied` for server-side calls from a cloud/sandboxed IP during development, a real risk once geocoding is centralized through one backend instead of many browsers. Photon requires `&lang=en` on requests to avoid returning place names in the local script.
- **OpenStreetMap Overpass** (places: parks, outdoor activities, restaurants) — `backend/src/providers/places/OverpassProvider.js`.
- **Open Food Facts** (barcode/product lookup) — `backend/src/providers/product/OpenFoodFactsProvider.js`.
- **Tesseract.js** (OCR) — stays entirely client-side in `frontend/index.html`, never sends images to any server.
- **MyMemory** (translation) — stays client-side too, translates OCR'd/non-English ingredient text to English before it's POSTed to the backend for screening.

## Places categories (Parks / Outdoor Activities / Restaurants Near Me)
Replaced the old Wikipedia-GeoSearch-based "Nearby Landmarks & History"
feature entirely. OSM tag mapping lives in
`backend/src/providers/places/osmCategoryMap.js`:
- **Parks**: `leisure=park`, `leisure=garden`, `boundary=protected_area`,
  `landuse=grass`, `natural=wood`.
- **Outdoor Activities**: `leisure=playground`, `leisure=sports_centre`,
  `leisure=pitch`, `leisure=track`, `tourism=attraction`,
  `tourism=picnic_site`, `highway=path`, `route=hiking`,
  `amenity=community_centre`.
- **Restaurants**: `amenity=restaurant`, `amenity=fast_food`,
  `amenity=cafe`, `amenity=food_court`.
Each category is queried as node/way/relation via Overpass `around:`,
capped at 30 results, cached per rounded-coordinate+radius key.
`GET /api/places?category=...` serves Parks/Outdoor; `GET /api/restaurants`
is a separate endpoint since it additionally attaches a `halal`
classification to every result (see below).

## Restaurant halal verification (`RestaurantHalalVerifier`)
Evidence-based, never claims certainty — see README "Restaurant halal
verification — known limitations" for the full picture. Key design
points to preserve:
- **Two modes**: list mode (`deep: false`, used by `GET /api/restaurants`)
  classifies from OSM tags only — no outbound web requests, safe to run
  for every result in a list. Deep mode (`deep: true`, used by
  `GET /api/restaurants/:id/verify-halal`) additionally fetches the
  restaurant's own official website/menu URL (**only** a URL that came
  from OSM data — never a searched/scraped URL) if
  `ENABLE_WEB_MENU_CHECK=true`, checking `robots.txt` first.
- **Classification priority order** (`HALAL_CLASSIFICATION` in
  `RestaurantHalalVerifier.js`): pork-related text overrides halal-leaning
  evidence (unless a clearly-separated halal-only section could be
  detected, which this analyzer has no reliable way to do — that carve-out
  is intentionally never auto-applied) → `diet:halal=no` →
  `diet:halal=only`/certified text → `diet:halal=yes`/halal-options
  text/cuisine mention (split into `mixed_needs_verification` vs.
  `likely_halal` depending on whether the cuisine tag looks like a mixed
  menu) → `unknown` (no evidence at all — **never** inferred from
  cuisine type alone).
- **Frontend UI**: `HALAL_CLASSIFICATION_META` in `frontend/index.html`
  maps each classification to an emoji + color; every card shows a
  pork-detected warning badge when applicable, and a "⚠️ Please verify
  before visiting" note unless the classification is exactly
  `halal_confirmed`. The restaurants tab always shows the persistent
  disclaimer ("Halal status is based on available public data and may be
  incomplete...") regardless of classification.
- Unit tests: `backend/test/restaurantHalalVerifier.test.js` — covers
  each classification tier, list-vs-deep mode (confirms list mode never
  fetches a website even when a URL is present), and
  `ENABLE_WEB_MENU_CHECK=false` fully disabling the fetch.

## App icon design
`icon-192.png`/`icon-512.png`: a white location pin (same silhouette as
the in-app pin icon, for brand consistency) with a crescent moon inside
its head, on a sky-blue-to-emerald diagonal gradient rounded-square
background — pin = location/discovery, crescent = halal, gradient ties
together the weather (sky) and Halal Scanner (emerald) sections of the
app. Generated from an SVG source (not kept in the repo) via `sharp` at
192x192 and 512x512; both are registered as `"purpose": "any maskable"`
in `manifest.json`, and the artwork stays within the ~80% safe zone
Android's adaptive-icon mask requires.

## Header / title design
The header shows the app icon next to the wordmark, styled as two
colored words — `text-sky-400` "Near" + `text-emerald-400` "Halal" —
echoing the icon's own gradient. `locationName` underneath uses a neutral
`text-neutral-400` so it doesn't visually blend with the sky-colored
"Near" above it. The header has **no** scanner entry point (removed —
see "Home page layout" below); `openScanner()` has exactly one caller,
the hero card.

## Home page layout
Order top-to-bottom is deliberate — do not reorder without discussion:
1. **Halal Scan hero** (`#heroScanBtn`) — the primary, top-most feature.
2. **Current weather card** — directly below the hero.
3. Everything else (7-day forecast, Nearby Places tabs) follows after.

## Halal Scanner — pipeline design (frontend + backend split)
Two entry paths, both end up calling the backend for classification:
- **Barcode mode** (primary): html5-qrcode camera scan → `POST
  /api/halal/barcode/lookup` (backend calls Open Food Facts, screens
  server-side if English text was available). If Open Food Facts only
  had non-English `ingredients_text`, the frontend translates it
  client-side (MyMemory) and re-POSTs to `/api/halal/ingredients/analyze`
  for a meaningful (English) screening — the backend never translates.
- **OCR fallback**: photographed ingredients label →
  `preprocessImageForOcr` (downscale to max 1600px + grayscale/contrast
  boost via canvas — both a speed and an accuracy win) → `runOcr` (fast
  English-only Tesseract pass first, `OCR_LANGUAGES_FAST='eng'`,
  escalating to the full multilingual worker
  `OCR_LANGUAGES_FULL='eng+ara+fra+spa+ind'` only if confidence is below
  `OCR_CONFIDENCE_THRESHOLD` or text looks like gibberish) →
  `isTextLikelyGibberish()` validates both the OCR output and the
  translation (Unicode `\p{L}`/`\p{N}` ratio — real text in any script is
  mostly letters) → client-side `translateToEnglish` → `POST
  /api/halal/ingredients/analyze`.
- **Never show garbled text**: a failing confidence/gibberish check shows
  "This photo was hard to read clearly..." and sends "Try again" straight
  back to the OCR capture view (`setScannerError(message, ocrView)`)
  rather than ever displaying corrupted text as if it were a real result.
- **Performance** (measured in testing): one Tesseract worker per
  language set, created once and reused for the session — ~5000ms cold
  vs. ~120ms once warm. Barcode lookups and translation chunks are
  cached server-side/client-side respectively.
- **Back-button handling**: opening the scanner pushes one
  `history.pushState` entry; a `popstate` listener retreats one step
  inside the scanner (subview/results → mode select → fully closed)
  instead of letting the back press navigate to whatever existed before
  the app was opened (which on a phone can feel like the PWA just closed).

## Why the cautious result labeling (do not weaken this without discussion)
The Halal Scanner (ingredients) and the Restaurant Halal Verifier are both
**keyword/evidence-based screening aids**, not certification authorities
— neither can see how something was actually sourced or processed, only
whether known signals appear in available text/tags. Because of that:
- Never render an absolute claim in either direction. No "Not halal", no
  "Haram" as a verdict label, no "Verified halal", no "Safe to consume",
  no checkmark implying certainty — for restaurants OR ingredients.
- Non-halal ingredient matches: "⚠️ Potential non-halal ingredients
  found: [list]" — a possibility to check, not a verdict.
- Ambiguous ingredient matches: "🔍 Ambiguous ingredients that need
  source verification — please verify: [list]", each with a short reason.
- Mandatory meat-type detection (`MEAT_KEYWORDS` in
  `HalalIngredientAnalyzer.js`: beef, chicken, poultry, turkey, duck,
  lamb, mutton, veal, goat, venison, meat — NOT pork/ham/bacon, already
  covered more severely by `NON_HALAL_KEYWORDS`) runs unconditionally and
  is never skipped — meat presence must never silently produce a clean
  "no flags" result, since slaughter method (zabiha) can't be confirmed
  from text alone.
- A clean ingredient result: "No flagged ingredients detected in this
  text" — about the text, not a certification of the product.
- Restaurant "Unknown" is the correct, honest answer when no evidence
  exists — never inferred from cuisine type alone.
- The disclaimer(s) must always be shown alongside results, and the raw
  extracted ingredient text must always be shown too.

**Visual severity vs. wording**: non-halal and ambiguous ingredient tiers
are BOTH styled in the red/orange warning family (not a soft amber "just
FYI" tone) — an overall red "⚠️ Warning — please verify before consuming"
banner appears whenever either has any matches, vs. green/neutral for
clean. This is deliberate: risk can be visually loud while the *wording*
stays hedged. Do not literally render "Haram" or "Not Halal" as a label.

This matters because a false "verified halal"/"confirmed" claim could
cause real harm if the wording is ever loosened — keep any future changes
at least as cautious as what's described here.

## Why these choices (for context on any future changes)
- Provider-interface backend architecture: required by the product spec
  that drove the pivot — see "Architecture history" above.
- These specific free providers: the rare combination of free + keyless
  + usable at this app's scale, matching the "no paid API" requirement.
- Tesseract.js/MyMemory stay client-side rather than moving to the
  backend: keeps OCR cost at zero (no server-side compute/GPU), and
  keeps photos from ever leaving the device — only extracted text is
  sent anywhere.
- In-memory cache/rate-limiting instead of Redis from day one: this
  app's scale doesn't need it yet, and the `CacheService`/
  `RateLimitService` interfaces make swapping in Redis later a
  contained change (see README).

## When making changes
- If you touch `frontend/index.html` (or anything else in the app
  shell), bump `CACHE_NAME` in `frontend/sw.js` (e.g. `nearme-weather-v11`)
  — otherwise the service worker's cache-first strategy keeps serving
  whatever it first installed, since the byte-identical `sw.js` never
  re-triggers install.
- Preserve the distance-labeling behavior (always state what location
  distances are measured FROM).
- Preserve free-first: don't introduce a paid API, even as an "optional"
  path, without the user explicitly asking (see "Hard constraints").
- Run `npm test` and `npm run lint` in `backend/` after changing any
  provider/service code — the rules-engine services have real unit test
  coverage, keep it passing.
- See README for local setup, deployment, environment variables, and the
  full list of known restaurant-verification limitations.
