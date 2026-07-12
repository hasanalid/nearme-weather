import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  HalalCertificationDirectoryService,
  parseHmaDirectory,
  parseIsnaDirectory,
} from '../src/services/HalalCertificationDirectoryService.js';
import { InMemoryCacheService } from '../src/cache/CacheService.js';

const HMA_FIXTURE = `
</select>
<h3 class="pxl-item--title style-default">
Bolton
</h3>
<div class="elementor-widget elementor-widget-icon-list" data-widget_type="icon-list.default">
<ul class="elementor-icon-list-items">
<li class="elementor-icon-list-item">
<a href="https://hmacanada.org/hma-certified-restaurants/fortinos-bolton/">
<span class="elementor-icon-list-icon"><i class="far fa-map-marker-alt"></i></span>
<span class="elementor-icon-list-text"> Fortinos Supermarket (Bolton) &#8594;</span>
</a>
</li>
</ul>
</div>
<h3 class="pxl-item--title style-default">
Brampton
</h3>
<div class="elementor-widget elementor-widget-icon-list" data-widget_type="icon-list.default">
<ul class="elementor-icon-list-items">
<li class="elementor-icon-list-item">
<a href="https://hmacanada.org/hma-certified-restaurants/the-kabab-shoppe/">
<span class="elementor-icon-list-text"> The Kabab Shoppe &#8594;</span>
</a>
</li>
</ul>
</div>
<div class="elementor-location-footer">
<a><span class="elementor-icon-list-text">Follow this link to our WhatsApp group</span></a>
</div>
`;

const isnaBlock = ({ name, href, category = 'restaurants', lat, lon, region }) => `
<div class="job-grid-style post-1 job_listing type-job_listing status-publish hentry job_listing_category-${category} job_listing_type-certified-by-isna job_listing_region-ontario" data-latitude=${lat ?? ''} data-longitude=${lon ?? ''} data-permalink="https://isnahalal.com${href}">
<div class=bottom-grid>
<div class=listing-content>
<div class="listing-content-inner clearfix">
<h3 class=listing-title>
<a href="${href}">${name}</a>
</h3>
</div>
</div>
<div class=listing-contact>
<div class="grid-contact-inner flex-middle"><div class="listing-location listing-address">
<a href="/region/${region || 'toronto'}/">${region ? region[0].toUpperCase() + region.slice(1) : 'Toronto'}</a>, <a href="/region/ontario/">Ontario</a>
</div></div>
</div>
</div>
`;

test('parseHmaDirectory associates entries with the preceding city heading, not a parenthetical', () => {
  const entries = parseHmaDirectory(HMA_FIXTURE);
  assert.equal(entries.length, 2);
  assert.equal(entries[0].name, 'Fortinos Supermarket');
  assert.equal(entries[0].city, 'Bolton');
  // "The Kabab Shoppe" has no parenthetical qualifier at all — its city
  // comes entirely from the "Brampton" heading above it.
  assert.equal(entries[1].name, 'The Kabab Shoppe');
  assert.equal(entries[1].city, 'Brampton');
});

test('parseHmaDirectory ignores icon-list markup outside the restaurant list (e.g. the footer)', () => {
  const entries = parseHmaDirectory(HMA_FIXTURE);
  assert.ok(!entries.some((e) => e.name.includes('WhatsApp')));
});

test('parseIsnaDirectory only keeps entries tagged with the restaurants category', () => {
  const html =
    isnaBlock({ name: 'El Chorizo', href: '/business/el-chorizo/', category: 'meat-processor', lat: 53.5, lon: -113.5 }) +
    isnaBlock({ name: 'PakHavelly Grill', href: '/business/pakhavelly-grill/', category: 'restaurants', lat: 43.61, lon: -79.58, region: 'toronto' });
  const entries = parseIsnaDirectory(html);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].name, 'PakHavelly Grill');
  assert.equal(entries[0].lat, 43.61);
  assert.equal(entries[0].lon, -79.58);
  assert.equal(entries[0].url, 'https://isnahalal.com/business/pakhavelly-grill/');
});

function seededService({ hma = [], isna = [] } = {}) {
  const cache = new InMemoryCacheService();
  const service = new HalalCertificationDirectoryService({ cache });
  cache.set('halal-cert:hma', hma, 3600);
  cache.set('halal-cert:isna', isna, 3600);
  return service;
}

test('findMatch: ISNA match requires the restaurant to actually be near the certified coordinates', async () => {
  const service = seededService({
    isna: [{ name: 'PakHavelly Grill', normalizedName: 'pakhavelly grill', url: 'https://isnahalal.com/business/pakhavelly-grill/', lat: 43.61, lon: -79.58, city: 'Toronto' }],
  });

  const near = await service.findMatch({ name: 'PakHavelly Grill', lat: 43.6105, lon: -79.58, addrCity: null });
  assert.equal(near.source, 'ISNA Canada');

  const farAway = await service.findMatch({ name: 'PakHavelly Grill', lat: 45.5, lon: -73.6, addrCity: null });
  assert.equal(farAway, null);
});

test('findMatch: HMA match requires addr:city agreement (no coordinates published)', async () => {
  const service = seededService({
    hma: [{ name: 'Fortinos Supermarket', normalizedName: 'fortinos supermarket', city: 'Bolton' }],
  });

  const matched = await service.findMatch({ name: 'Fortinos Supermarket', lat: null, lon: null, addrCity: 'Bolton' });
  assert.equal(matched.source, 'HMA Canada');

  const wrongCity = await service.findMatch({ name: 'Fortinos Supermarket', lat: null, lon: null, addrCity: 'Hamilton' });
  assert.equal(wrongCity, null);

  const noCityAtAll = await service.findMatch({ name: 'Fortinos Supermarket', lat: null, lon: null, addrCity: null });
  assert.equal(noCityAtAll, null, 'a chain name alone is never enough without a city to disambiguate the branch');
});

test('findMatch: no match when the restaurant name is not in either directory', async () => {
  const service = seededService({
    hma: [{ name: 'Fortinos Supermarket', normalizedName: 'fortinos supermarket', city: 'Bolton' }],
  });
  const result = await service.findMatch({ name: 'Some Random Diner', lat: 1, lon: 1, addrCity: 'Bolton' });
  assert.equal(result, null);
});

test('a fetch failure is treated as no evidence, not an error, and does not throw', async () => {
  const cache = new InMemoryCacheService();
  const service = new HalalCertificationDirectoryService({ cache });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 503 });
  try {
    const result = await service.findMatch({ name: 'Anything', lat: 1, lon: 1, addrCity: 'Anywhere' });
    assert.equal(result, null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
