import { fetchWithTimeout } from '../utils/http.js';

// Optional, off-by-default supplementary evidence source: fetches a
// restaurant's official website or menu page (URL must come from
// OpenStreetMap tags — we never search the web for a site) and looks for
// halal/pork keyword mentions in the page text. This is deliberately
// conservative per the product's "important web usage rules":
//   - Only ever fetches an OFFICIAL URL already given to us by OSM data,
//     never a URL discovered via scraping/searching.
//   - Always checks robots.txt first and honors a Disallow for the path.
//   - Never used unless ENABLE_WEB_MENU_CHECK=true.
//   - Failure (network error, disallowed, timeout) is treated as "no
//     evidence available", never as a false negative/positive signal.
export class WebMenuChecker {
  async #isAllowedByRobots(url) {
    try {
      const { origin } = new URL(url);
      const res = await fetchWithTimeout(`${origin}/robots.txt`, {}, 5000);
      if (!res.ok) return true; // no robots.txt (or unreachable) — treat as allowed
      const body = await res.text();
      return this.#robotsAllowsPath(body, new URL(url).pathname);
    } catch {
      return true; // if we can't check, don't block on an assumption either way — proceed cautiously
    }
  }

  // Minimal robots.txt parser: honors a blanket `User-agent: *` block's
  // Disallow rules for the target path. Doesn't attempt full RFC 9309
  // compliance (crawl-delay, sitemaps, wildcards) — good enough for the
  // conservative "don't fetch what's clearly disallowed" goal here.
  #robotsAllowsPath(robotsTxt, path) {
    const lines = robotsTxt.split('\n').map((l) => l.trim());
    let inWildcardBlock = false;
    const disallows = [];
    for (const line of lines) {
      const [rawKey, ...rest] = line.split(':');
      const key = (rawKey || '').toLowerCase().trim();
      const value = rest.join(':').trim();
      if (key === 'user-agent') {
        inWildcardBlock = value === '*';
      } else if (key === 'disallow' && inWildcardBlock && value) {
        disallows.push(value);
      }
    }
    return !disallows.some((rule) => path.startsWith(rule));
  }

  /**
   * Fetches `url` and returns its visible text content, or null if
   * disallowed/unreachable. Strips HTML tags with a simple regex rather
   * than pulling in an HTML parser dependency — we only need a rough
   * keyword-search corpus, not structured content.
   */
  async fetchPageText(url) {
    if (!url) return null;
    const allowed = await this.#isAllowedByRobots(url);
    if (!allowed) return null;

    try {
      const res = await fetchWithTimeout(url, { headers: { 'User-Agent': 'NearHalal/1.0 (halal restaurant verification)' } }, 8000);
      if (!res.ok) return null;
      const html = await res.text();
      return html
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    } catch {
      return null;
    }
  }
}
