import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HalalIngredientAnalyzer } from '../src/services/HalalIngredientAnalyzer.js';

const analyzer = new HalalIngredientAnalyzer();

test('clean ingredient text has no flags', () => {
  const result = analyzer.analyze('water, sugar, salt, citric acid');
  assert.deepEqual(result.nonHalalMatches, []);
  assert.deepEqual(result.ambiguousMatches, []);
  assert.deepEqual(result.meatMatches, []);
  assert.equal(result.hasRisk, false);
});

test('pork is flagged as non-halal', () => {
  const result = analyzer.analyze('water, sugar, pork, salt');
  assert.deepEqual(result.nonHalalMatches, ['pork']);
  assert.equal(result.hasRisk, true);
});

test('"ham" does not false-positive inside "chamomile"', () => {
  const result = analyzer.analyze('chamomile extract, sugar, citric acid');
  assert.deepEqual(result.nonHalalMatches, []);
  assert.equal(result.hasRisk, false);
});

test('meat detection is mandatory and never silently passes', () => {
  const result = analyzer.analyze('chicken breast, water, salt, spices');
  assert.equal(result.meatMatches.length, 1);
  assert.equal(result.meatMatches[0].key, 'chicken');
  assert.equal(result.hasRisk, true);
});

test('pork gelatin is non-halal, not double-counted as ambiguous gelatin', () => {
  const result = analyzer.analyze('water, sugar, pork gelatin, natural flavor');
  assert.deepEqual(result.nonHalalMatches, ['pork gelatin']);
  assert.equal(result.ambiguousMatches.some((m) => m.key === 'gelatin'), false);
});

test('generic gelatin (no specified source) is ambiguous', () => {
  const result = analyzer.analyze('water, sugar, gelatin');
  assert.equal(result.nonHalalMatches.length, 0);
  assert.equal(result.ambiguousMatches.some((m) => m.key === 'gelatin'), true);
});

test('overlapping keyword matches are deduped (mono- and diglycerides vs diglycerides)', () => {
  const result = analyzer.analyze('mono- and diglycerides, water');
  const keys = result.ambiguousMatches.map((m) => m.key);
  assert.equal(keys.includes('mono- and diglycerides'), true);
  assert.equal(keys.includes('diglycerides'), false);
});

test('multilingual safety net catches untranslated Arabic pork term', () => {
  const result = analyzer.analyze('ماء، سكر، خنزير');
  assert.equal(result.nonHalalMatches.length > 0, true);
  assert.equal(result.hasRisk, true);
});
