import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { sortByActionableCoverage } from '../../src/common/coverageSort';

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
