import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildRunTestClassArgs } from '../../src/common/sfCommandArgs';

void describe('buildRunTestClassArgs', () => {
  void it('uses the Salesforce CLI apex run test command order', () => {
    assert.deepEqual(buildRunTestClassArgs('ExampleTest', 'developer@example.com'), [
      'apex',
      'run',
      'test',
      '--tests',
      'ExampleTest',
      '--synchronous',
      '--code-coverage',
      '--json',
      '--target-org',
      'developer@example.com',
    ]);
  });

  void it('keeps the class name as one argument', () => {
    const className = 'ExampleTest; echo unsafe';

    assert.equal(buildRunTestClassArgs(className, 'developer@example.com')[4], className);
  });
});
