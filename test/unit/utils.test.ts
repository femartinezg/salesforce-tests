import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatDuration, isSameLocalDate } from '../../src/common/utils';

void describe('formatDuration', () => {
  void it('formats millisecond, second, and minute durations compactly', () => {
    assert.equal(formatDuration(42), '42ms');
    assert.equal(formatDuration(1_250), '1.25s');
    assert.equal(formatDuration(61_500), '1m02s');
  });
});

void describe('isSameLocalDate', () => {
  void it('accepts different times on the same local date', () => {
    assert.equal(
      isSameLocalDate(new Date(2026, 7, 7, 0, 0, 0), new Date(2026, 7, 7, 23, 59, 59)),
      true
    );
  });

  void it('rejects matching day numbers from different months or years', () => {
    const reference = new Date(2026, 7, 7);

    assert.equal(isSameLocalDate(reference, new Date(2026, 6, 7)), false);
    assert.equal(isSameLocalDate(reference, new Date(2025, 7, 7)), false);
  });
});
