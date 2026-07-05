# NearMe Weather — Project Context

## What this is
A single-file, client-only mobile web app (PWA) that shows the user's local
weather, a 7-day forecast, nearby Wikipedia landmarks, and a camera-based
multilingual Halal Scanner with halal keyword screening — with zero backend,
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
- **Open Food Facts** — `https://world.openfoodfacts.org/api/v2/product/{barcode}.json`
  — free, keyless, CORS-friendly product lookup by barcode for the
  Halal Scanner. It's a community-editable database, so its fields
  (`product_name`, `ingredients_text`, `allergens_tags`) are treated as
  untrusted text and HTML-escaped before rendering (see `escapeHtml` in
  the JS) rather than inserted into the DOM raw.
- **MyMemory Translation** — `https://api.mymemory.translated.net/get?q={text}&langpair=autodetect|en`
  — free, keyless, CORS-friendly translation, used to translate OCR'd or
  non-English `ingredients_text` to English before keyword screening
  (`translateToEnglish` in the JS). Anonymous requests are capped at a few
  hundred characters each, so long ingredient lists are split into
  comma-boundary chunks (`chunkTextForTranslation`) and rejoined. If
  translation fails for any reason, screening falls back to the original
  text and the UI shows an explicit caveat rather than silently screening
  nothing — see "Why the cautious result labeling" below.

## Libraries used (all open-source, loaded via CDN script tag — no build step)
- **html5-qrcode** — camera-based barcode/QR decoding for the ingredient
  scanner's primary path.
- **Tesseract.js** — client-side OCR (no API key, runs entirely in the
  browser) for the ingredient scanner's fallback path, used when no
  barcode is found.

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
10. **Halal Scanner** (camera icon + visible "Halal Scanner" label in the
    header, not just a hover tooltip — mobile has no hover) — two entry
    paths that both feed the same halal keyword screening:
    - **Barcode mode** (primary): live camera scan via html5-qrcode, then
      looks the decoded barcode up on Open Food Facts for `product_name`,
      `ingredients_text`, and `allergens_tags`. Prefers OFF's own
      `ingredients_text_en` field when present; only calls the translation
      API as a fallback when OFF doesn't already provide English text.
    - **OCR fallback**: for loose/unpackaged food or a barcode not found
      in Open Food Facts, the user instead photographs the ingredients
      label directly (a plain `<input type="file" capture="environment">`
      — simpler and more reliable across mobile browsers than hand-building
      a live-preview capture pipeline), and Tesseract.js OCRs it client-side
      using a multilingual language pack (`OCR_LANGUAGES = 'eng+ara+fra+spa+ind'`
      — English, Arabic, French, Spanish, Indonesian/Malay; extend this
      constant if more languages are needed) since ingredient labels
      aren't always in English.
    - Whatever text comes out of either path is translated to English via
      MyMemory (`translateToEnglish`) before screening, since the keyword
      lists are English-only. Both the original and translated text are
      shown to the user (only as two separate blocks when they actually
      differ, to avoid redundant UI when the source was already English).
    - Screening matches the English text against two keyword lists —
      `NON_HALAL_KEYWORDS` and `AMBIGUOUS_KEYWORDS` (each with a short
      reason) — and always shows the raw extracted ingredient text
      alongside the flags, plus a persistent non-certification disclaimer.
      See "Why the cautious result labeling" below before changing any
      of this wording.
    - **Back-button handling**: opening the scanner pushes one
      `history.pushState` entry; a `popstate` listener intercepts the
      browser/hardware back button to retreat one step inside the scanner
      (subview/results → mode select → fully closed) instead of letting
      the back press navigate to whatever history entry existed before
      the app was opened, which on a phone can feel like the whole PWA
      just closed. See `pushScannerHistoryState`/`popScannerHistoryStateIfNeeded`
      in the JS.

## Why the cautious result labeling (do not weaken this without discussion)
The Halal Scanner is a **keyword screening aid**, not a halal
certification authority — it cannot see how an ingredient was actually
sourced or processed, only whether a flagged word appears in the text.
Because of that:
- Never render an absolute claim in either direction. No "Not halal", no
  "Haram" as a verdict label, no "Verified halal", no "Safe to consume",
  no checkmark implying certainty.
- Non-halal matches are phrased as "⚠️ Potential non-halal ingredients
  found: [list]" — a possibility to check, not a verdict.
- Ambiguous matches are phrased as "🔍 Ambiguous ingredients that need
  source verification — please verify: [list]", each with a short reason
  why it's ambiguous (e.g. gelatin's animal source isn't specified by the
  word alone).
- A clean result is phrased as "No flagged ingredients detected in this
  text" — explicitly about the text, not a certification of the product.
- The disclaimer ("This is an automated keyword screening tool, not a
  halal certification…") must always be shown alongside results, and the
  raw extracted ingredient text must always be shown too, so the user can
  read the actual source instead of only trusting the flags.

**Visual severity vs. wording**: both the "clearly flagged" and
"ambiguous" tiers are styled in the red/orange warning color family (an
overall red "⚠️ Warning — please verify before consuming" summary banner
appears whenever either tier has any matches at all, vs. a green/neutral
banner for a clean result) — ambiguous ingredients are NOT downplayed
with a soft amber "just FYI" tone, because they still represent real
non-halal risk that deserves a hard-to-miss visual. This was a deliberate
choice to make risk visually loud while keeping the *wording* hedged —
the color can shout "pay attention" without the text ever claiming
certainty. Do not literally render the word "Haram" or "Not Halal" as a
label even though users may describe results using those words verbally
— the visual can be as alarming as needed, but the printed text must stay
in the "potential / needs verification / please verify" register.

This matters because a false "verified halal" claim could cause real harm
if the wording is ever loosened — keep any future changes to this section
at least as cautious as what's described here.

## Why these choices (for context on any future changes)
- Vanilla JS instead of React/Vue: app has too little state to justify a
  framework or build step, and the brief was "single file, no build tools."
- Tailwind via CDN instead of compiled Tailwind: same reasoning — zero
  build step, at the cost of a heavier uncompiled CSS payload.
- These APIs specifically: they're the rare combination of free +
  keyless + CORS-enabled, matching the "no registration" requirement.
- html5-qrcode and Tesseract.js instead of a hosted scanning/OCR API:
  same "no registration, no API keys" requirement — both run entirely
  client-side and are loaded via plain CDN script tags, no build step.
- MyMemory instead of a hosted translation API (e.g. Google Cloud
  Translate): same "no registration, no API keys" requirement — MyMemory
  works anonymously over a plain HTTPS GET, at the cost of a per-request
  character cap (handled via chunking) and no uptime/rate guarantees.

## Deployment
Hosted as a static site on GitHub Pages. All 5 files live at the repo root
(not in a subfolder) since they reference each other by relative path.

## When making changes
- Keep everything in `index.html` unless a change specifically needs a new
  file (e.g. a new icon size).
- If you touch `index.html` (or anything else in the app shell), bump
  `CACHE_NAME` in `sw.js` (e.g. `nearme-weather-v6`) — otherwise the
  service worker's cache-first strategy keeps serving whatever it first
  installed, since the byte-identical `sw.js` never re-triggers install.
- Preserve the distance-labeling behavior (always state what location
  distances are measured FROM).
- Preserve copyright/attribution: no API keys should ever be introduced for
  the three core APIs above — that would break the "no registration" premise
  of the whole app.
