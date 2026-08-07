import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { filterByCoverageThreshold, sortByActionableCoverage } from '../../src/common/coverageSort';

void describe('sortByActionableCoverage', () => {
  void it('puts the lowest known coverage first and unavailable data last', () => {
    const items = [
      { name: 'Loading', codeCoverage: undefined },
      { name: 'Good', codeCoverage: 90 },
      { name: 'Missing', codeCoverage: -1 },
      { name: 'Critical', codeCoverage: 20 },
    ];

    assert.deepEqual(
      sortByActionableCoverage(items).map((item) => item.name),
      ['Critical', 'Good', 'Missing', 'Loading']
    );
    assert.equal(items[0].name, 'Loading');
  });

  void it('uses class name as a stable tie breaker', () => {
    assert.deepEqual(
      sortByActionableCoverage([
        { name: 'Zulu', codeCoverage: 75 },
        { name: 'Alpha', codeCoverage: 75 },
      ]).map((item) => item.name),
      ['Alpha', 'Zulu']
    );
  });
});

void describe('filterByCoverageThreshold', () => {
  void it('returns only known coverage below the selected threshold', () => {
    const items = [
      { name: 'Below', codeCoverage: 74 },
      { name: 'Equal', codeCoverage: 75 },
      { name: 'Unavailable', codeCoverage: -1 },
      { name: 'Loading' },
    ];

    assert.deepEqual(filterByCoverageThreshold(items, 75), [items[0]]);
  });
});
