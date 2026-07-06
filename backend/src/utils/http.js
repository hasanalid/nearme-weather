// Thin wrapper around fetch with a timeout, so a slow/unresponsive
// upstream (Nominatim, Overpass, Open-Meteo, Open Food Facts) can't hang
// a request to our own API indefinitely.
export async function fetchWithTimeout(url, options = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
