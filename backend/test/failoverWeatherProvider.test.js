import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FailoverWeatherProvider } from '../src/providers/weather/FailoverWeatherProvider.js';

test('uses primary result when primary succeeds', async () => {
  const primary = { getForecast: async () => ({ source: 'primary' }) };
  const secondary = { getForecast: async () => ({ source: 'secondary' }) };
  const failover = new FailoverWeatherProvider(primary, secondary);
  const result = await failover.getForecast(1, 1);
  assert.equal(result.source, 'primary');
});

test('falls back to secondary when primary throws', async () => {
  const primary = { getForecast: async () => { throw new Error('primary down'); } };
  const secondary = { getForecast: async () => ({ source: 'secondary' }) };
  const failover = new FailoverWeatherProvider(primary, secondary);
  const result = await failover.getForecast(1, 1);
  assert.equal(result.source, 'secondary');
});

test('throws the primary error when both providers fail', async () => {
  const primary = { getForecast: async () => { throw new Error('primary down'); } };
  const secondary = { getForecast: async () => { throw new Error('secondary down'); } };
  const failover = new FailoverWeatherProvider(primary, secondary);
  await assert.rejects(() => failover.getForecast(1, 1), /primary down/);
});
