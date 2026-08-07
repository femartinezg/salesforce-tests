import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getCoverageLevel } from '../../src/common/codeCoverage';

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
});
