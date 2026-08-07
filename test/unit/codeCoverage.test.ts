import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatUncoveredLineSummary, getCoverageLevel } from '../../src/common/codeCoverage';

void describe('getCoverageLevel', () => {
  void it('distinguishes loading and unavailable coverage', () => {
    assert.equal(getCoverageLevel(undefined), 'loading');
    assert.equal(getCoverageLevel(-1), 'unavailable');
  });

  void it('classifies known coverage at each threshold', () => {
    assert.equal(getCoverageLevel(0), 'belowMinimum');
    assert.equal(getCoverageLevel(74.99), 'belowMinimum');
    assert.equal(getCoverageLevel(75), 'warning');
    assert.equal(getCoverageLevel(84.99), 'warning');
    assert.equal(getCoverageLevel(85), 'good');
    assert.equal(getCoverageLevel(100), 'good');
  });

  void it('supports a custom minimum coverage threshold', () => {
    assert.equal(getCoverageLevel(79, 80), 'belowMinimum');
    assert.equal(getCoverageLevel(80, 80), 'warning');
    assert.equal(getCoverageLevel(90, 80), 'good');
  });
});

void describe('formatUncoveredLineSummary', () => {
  void it('lists short coverage gaps without decoration', () => {
    assert.equal(formatUncoveredLineSummary([3, 8, 13]), '3, 8, 13');
  });

  void it('summarizes coverage gaps that exceed the display limit', () => {
    assert.equal(formatUncoveredLineSummary([1, 2, 3, 4], 2), '1, 2 … (+2 more)');
  });
});
