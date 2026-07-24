import test from 'node:test';
import assert from 'node:assert/strict';
import { formatUtc8, utc8InputToIso } from '../../public/js/time_zone.mjs';

test('datetime-local input is interpreted as UTC+8 regardless of browser timezone', () => {
  assert.equal(utc8InputToIso('2026-07-24T20:30'), '2026-07-24T12:30:00.000Z');
});

test('timestamps are displayed in UTC+8', () => {
  assert.match(formatUtc8('2026-07-24T12:30:00.000Z'), /20:30/);
});
