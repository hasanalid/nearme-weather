import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyParkType, PARK_TYPE } from '../src/providers/places/parkClassifier.js';

test('protection_title mentioning "provincial" classifies as provincial', () => {
  assert.equal(classifyParkType({ protection_title: 'Provincial Park' }), PARK_TYPE.PROVINCIAL);
});

test('operator mentioning "provincial" classifies as provincial', () => {
  assert.equal(classifyParkType({ operator: 'Ontario Provincial Parks' }), PARK_TYPE.PROVINCIAL);
});

test('name mentioning "Provincial Park" classifies as provincial even with no other tags', () => {
  assert.equal(classifyParkType({ name: 'Algonquin Provincial Park' }), PARK_TYPE.PROVINCIAL);
});

test('an ordinary neighbourhood park with no provincial signal classifies as local', () => {
  assert.equal(classifyParkType({ name: 'Maple Street Park', leisure: 'park' }), PARK_TYPE.LOCAL);
});

test('a protected_area boundary without "provincial" wording still classifies as local (conservative default)', () => {
  assert.equal(classifyParkType({ boundary: 'protected_area', operator: 'Parks Canada' }), PARK_TYPE.LOCAL);
});

test('missing tags object does not throw and classifies as local', () => {
  assert.equal(classifyParkType(undefined), PARK_TYPE.LOCAL);
});
