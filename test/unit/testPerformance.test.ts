import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isSlowTest } from '../../src/common/testPerformance';

void describe('isSlowTest', () => {
  void it('uses the configured threshold inclusively', () => {
    assert.equal(isSlowTest(4_999, 5_000), false);
    assert.equal(isSlowTest(5_000, 5_000), true);
  });

  void it('ignores missing durations and disabled thresholds', () => {
    assert.equal(isSlowTest(undefined, 5_000), false);
    assert.equal(isSlowTest(10_000, 0), false);
  });
});
