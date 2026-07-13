import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RedisCacheService } from '../src/cache/RedisCacheService.js';

// A minimal fake standing in for an ioredis client — only implements the
// two methods RedisCacheService actually calls, with the same async
// get(key)/set(key, value, 'EX', ttlSeconds) shape.
function fakeClient({ getImpl, setImpl } = {}) {
  const store = new Map();
  return {
    store,
    get: getImpl || (async (key) => (store.has(key) ? store.get(key) : null)),
    set: setImpl || (async (key, value) => { store.set(key, value); }),
  };
}

test('set stores a JSON-serialized value, get parses it back', async () => {
  const client = fakeClient();
  const cache = new RedisCacheService({ client });
  await cache.set('k', { a: 1, b: [1, 2, 3] }, 60);
  const result = await cache.get('k');
  assert.deepEqual(result, { a: 1, b: [1, 2, 3] });
});

test('set passes the TTL through as EX seconds', async () => {
  const calls = [];
  const client = fakeClient({ setImpl: async (...args) => { calls.push(args); } });
  const cache = new RedisCacheService({ client });
  await cache.set('k', 'v', 120);
  assert.deepEqual(calls[0], ['k', JSON.stringify('v'), 'EX', 120]);
});

test('get returns null for a missing key', async () => {
  const cache = new RedisCacheService({ client: fakeClient() });
  const result = await cache.get('missing');
  assert.equal(result, null);
});

test('get returns null (not a throw) for corrupted JSON', async () => {
  const client = fakeClient({ getImpl: async () => 'not valid json{' });
  const cache = new RedisCacheService({ client });
  const result = await cache.get('k');
  assert.equal(result, null);
});

test('a client error on get is treated as a cache miss, not a thrown error', async () => {
  const client = fakeClient({ getImpl: async () => { throw new Error('ECONNREFUSED'); } });
  const cache = new RedisCacheService({ client });
  const result = await cache.get('k');
  assert.equal(result, null);
});

test('a client error on set is swallowed, not thrown (caller never has to handle a cache failure)', async () => {
  const client = fakeClient({ setImpl: async () => { throw new Error('ECONNREFUSED'); } });
  const cache = new RedisCacheService({ client });
  await assert.doesNotReject(() => cache.set('k', 'v', 60));
});
