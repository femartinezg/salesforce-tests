import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseApexTestRunResponse } from '../../src/common/ApexTestRunParser';
import { SfCliError } from '../../src/common/SfCliClient';

void describe('parseApexTestRunResponse', () => {
  void it('parses a passing run with coverage', () => {
    assert.deepEqual(
      parseApexTestRunResponse({
        status: 0,
        result: {
          summary: {
            outcome: 'Passed',
            testStartTime: '2026-08-07T19:00:00.000Z',
            testExecutionTime: '42 ms',
          },
          tests: [{ Outcome: 'Pass', FullName: 'ExampleTest.passes', RunTime: 5 }],
          coverage: {
            coverage: [{ name: 'Example', totalLines: 10, totalCovered: 8 }],
            summary: { orgWideCoverage: '75%' },
          },
        },
      }),
      {
        kind: 'test-result',
        passed: true,
        testStartTime: '2026-08-07T19:00:00.000Z',
        testExecutionTimeMs: 42,
        failures: [],
        tests: [{ fullName: 'ExampleTest.passes', outcome: 'Pass', runTimeMs: 5 }],
        coverage: [{ name: 'Example', totalLines: 10, coveredLines: 8 }],
        orgWideCoverage: 75,
      }
    );
  });

  void it('parses a failed test run without assuming a stack trace exists', () => {
    const result = parseApexTestRunResponse({
      status: 100,
      result: {
        summary: {
          outcome: 'Failed',
          testStartTime: '2026-08-07T19:00:00.000Z',
          testExecutionTime: 7,
        },
        tests: [
          {
            Outcome: 'Fail',
            FullName: 'ExampleTest.fails',
            Message: 'Expected failure',
            StackTrace: null,
          },
        ],
      },
    });

    assert.deepEqual(result, {
      kind: 'test-result',
      passed: false,
      testStartTime: '2026-08-07T19:00:00.000Z',
      testExecutionTimeMs: 7,
      failures: [
        {
          fullName: 'ExampleTest.fails',
          message: 'Expected failure',
          stackTrace: undefined,
        },
      ],
      tests: [{ fullName: 'ExampleTest.fails', outcome: 'Fail', runTimeMs: undefined }],
      coverage: [],
      orgWideCoverage: undefined,
    });
  });

  void it('preserves structured command errors', () => {
    assert.deepEqual(
      parseApexTestRunResponse({ status: 1, name: 'INVALID_INPUT', message: 'Unknown class' }),
      {
        kind: 'command-error',
        name: 'INVALID_INPUT',
        message: 'Unknown class',
      }
    );
  });

  void it('rejects malformed successful responses', () => {
    assert.throws(
      () => parseApexTestRunResponse({ status: 0, result: { summary: {} } }),
      (error: unknown) => error instanceof SfCliError && error.kind === 'invalid-response'
    );
  });

  void it('rejects invalid test start times', () => {
    assert.throws(
      () =>
        parseApexTestRunResponse({
          status: 0,
          result: {
            summary: {
              outcome: 'Passed',
              testStartTime: 'not-a-date',
              testExecutionTime: '1 ms',
            },
          },
        }),
      (error: unknown) => error instanceof SfCliError && error.kind === 'invalid-response'
    );
  });
});
