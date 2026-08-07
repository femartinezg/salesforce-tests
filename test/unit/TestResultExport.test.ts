import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  serializeTestResultsJson,
  serializeTestResultsJunit,
} from '../../src/common/TestResultExport';

const results = [
  { selector: 'CalculatorTest.adds', status: 'Passed' as const, durationMs: 25 },
  {
    selector: 'CalculatorTest.fails',
    status: 'Failed' as const,
    durationMs: 5,
    failureMessage: 'Expected <2> & received <3>',
    failureStackTrace: 'Class.CalculatorTest.fails: line 7, column 1',
  },
];

void describe('serializeTestResultsJson', () => {
  void it('writes a stable versioned JSON document', () => {
    assert.deepEqual(JSON.parse(serializeTestResultsJson(results)), {
      version: 1,
      tests: results,
    });
  });
});

void describe('serializeTestResultsJunit', () => {
  void it('writes JUnit counts, timings, and escaped failures', () => {
    const xml = serializeTestResultsJunit(results);

    assert.match(xml, /tests="2" failures="1" time="0\.030"/);
    assert.match(xml, /classname="CalculatorTest" name="adds" time="0\.025"/);
    assert.match(xml, /Expected &lt;2&gt; &amp; received &lt;3&gt;/);
    assert.match(xml, /Class\.CalculatorTest\.fails: line 7, column 1/);
  });
});
