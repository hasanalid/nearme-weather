import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RestaurantHalalVerifier, HALAL_CLASSIFICATION } from '../src/services/RestaurantHalalVerifier.js';

function makeVerifier({ webMenuText = null, enableWebMenuCheck = false } = {}) {
  const webMenuChecker = { fetchPageText: async () => webMenuText };
  return new RestaurantHalalVerifier({ webMenuChecker, enableWebMenuCheck });
}

test('no evidence -> unknown, never inferred from cuisine alone', async () => {
  const verifier = makeVerifier();
  const result = await verifier.verify({ tags: { amenity: 'restaurant', cuisine: 'chinese' } });
  assert.equal(result.classification, HALAL_CLASSIFICATION.UNKNOWN);
  assert.equal(result.needsManualVerification, true);
});

test('diet:halal=only -> halal confirmed, high confidence', async () => {
  const verifier = makeVerifier();
  const result = await verifier.verify({ tags: { 'diet:halal': 'only' } });
  assert.equal(result.classification, HALAL_CLASSIFICATION.HALAL_CONFIRMED);
  assert.equal(result.confidence, 'high');
  assert.equal(result.needsManualVerification, false);
});

test('diet:halal=yes -> likely halal, medium confidence', async () => {
  const verifier = makeVerifier();
  const result = await verifier.verify({ tags: { 'diet:halal': 'yes' } });
  assert.equal(result.classification, HALAL_CLASSIFICATION.LIKELY_HALAL);
  assert.equal(result.needsManualVerification, true);
});

test('diet:halal=no -> non-halal', async () => {
  const verifier = makeVerifier();
  const result = await verifier.verify({ tags: { 'diet:halal': 'no' } });
  assert.equal(result.classification, HALAL_CLASSIFICATION.NON_HALAL);
});

test('cuisine tag listing halal alongside other cuisines -> mixed, needs verification', async () => {
  const verifier = makeVerifier();
  const result = await verifier.verify({ tags: { cuisine: 'halal;kebab;pizza' } });
  assert.equal(result.classification, HALAL_CLASSIFICATION.MIXED_NEEDS_VERIFICATION);
});

test('list mode (deep: false) never fetches the website, even if a URL is present', async () => {
  let fetchCalled = false;
  const webMenuChecker = { fetchPageText: async () => { fetchCalled = true; return 'has pork on the menu'; } };
  const verifier = new RestaurantHalalVerifier({ webMenuChecker, enableWebMenuCheck: true });
  const result = await verifier.verify({ tags: {}, website: 'https://example.com' }, { deep: false });
  assert.equal(fetchCalled, false);
  assert.equal(result.classification, HALAL_CLASSIFICATION.UNKNOWN);
});

test('deep mode with pork mentioned on official menu -> non-halal, overrides halal-leaning tag', async () => {
  const verifier = makeVerifier({ webMenuText: 'Our menu includes halal chicken and pork ribs.', enableWebMenuCheck: true });
  const result = await verifier.verify(
    { tags: { 'diet:halal': 'yes' }, websiteMenu: 'https://example.com/menu' },
    { deep: true }
  );
  assert.equal(result.classification, HALAL_CLASSIFICATION.NON_HALAL);
  assert.equal(result.porkDetected, true);
  assert.equal(result.sourceType, 'official_menu');
});

test('deep mode with halal-certified mention on official website -> halal confirmed', async () => {
  const verifier = makeVerifier({ webMenuText: 'This restaurant is 100% halal certified.', enableWebMenuCheck: true });
  const result = await verifier.verify({ tags: {}, website: 'https://example.com' }, { deep: true });
  assert.equal(result.classification, HALAL_CLASSIFICATION.HALAL_CONFIRMED);
  assert.equal(result.sourceType, 'official_website');
});

test('cuisine commonly associated with halal (e.g. Turkish) with no other evidence -> likely halal, low confidence', async () => {
  const verifier = makeVerifier();
  const result = await verifier.verify({ tags: { amenity: 'restaurant', cuisine: 'turkish' } });
  assert.equal(result.classification, HALAL_CLASSIFICATION.LIKELY_HALAL);
  assert.equal(result.confidence, 'low');
  assert.equal(result.needsManualVerification, true);
});

test('halal-likely cuisine mixed with an unrelated cuisine -> mixed, needs verification', async () => {
  const verifier = makeVerifier();
  const result = await verifier.verify({ tags: { cuisine: 'lebanese;pizza' } });
  assert.equal(result.classification, HALAL_CLASSIFICATION.MIXED_NEEDS_VERIFICATION);
  assert.equal(result.confidence, 'low');
});

test('halal-likely cuisine is overridden by an explicit diet:halal=no tag', async () => {
  const verifier = makeVerifier();
  const result = await verifier.verify({ tags: { cuisine: 'turkish', 'diet:halal': 'no' } });
  assert.equal(result.classification, HALAL_CLASSIFICATION.NON_HALAL);
});

test('halal-likely cuisine is overridden by pork found on the official menu (deep mode)', async () => {
  const verifier = makeVerifier({ webMenuText: 'Our menu includes bacon.', enableWebMenuCheck: true });
  const result = await verifier.verify(
    { tags: { cuisine: 'turkish' }, websiteMenu: 'https://example.com/menu' },
    { deep: true }
  );
  assert.equal(result.classification, HALAL_CLASSIFICATION.NON_HALAL);
  assert.equal(result.porkDetected, true);
});

test('cuisine with no halal association at all stays unknown (e.g. Chinese)', async () => {
  const verifier = makeVerifier();
  const result = await verifier.verify({ tags: { cuisine: 'chinese' } });
  assert.equal(result.classification, HALAL_CLASSIFICATION.UNKNOWN);
});

test('ENABLE_WEB_MENU_CHECK=false skips the website fetch entirely, even in deep mode', async () => {
  let fetchCalled = false;
  const webMenuChecker = { fetchPageText: async () => { fetchCalled = true; return 'pork'; } };
  const verifier = new RestaurantHalalVerifier({ webMenuChecker, enableWebMenuCheck: false });
  const result = await verifier.verify({ tags: {}, website: 'https://example.com' }, { deep: true });
  assert.equal(fetchCalled, false);
  assert.equal(result.classification, HALAL_CLASSIFICATION.UNKNOWN);
});
