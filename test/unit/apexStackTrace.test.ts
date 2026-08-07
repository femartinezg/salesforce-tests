import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseApexStackLocation } from '../../src/common/apexStackTrace';

void describe('parseApexStackLocation', () => {
  void it('extracts the first Apex class location from a stack trace', () => {
    assert.deepEqual(
      parseApexStackLocation(
        'External entry point\nClass.ExampleTest.fails: line 17, column 1\nClass.Helper.call: line 4, column 1'
      ),
      { className: 'ExampleTest', line: 17, column: 1 }
    );
  });

  void it('rejects absent and incompatible stack traces', () => {
    assert.equal(parseApexStackLocation(undefined), undefined);
    assert.equal(parseApexStackLocation('AnonymousBlock: line 1, column 1'), undefined);
  });
});
