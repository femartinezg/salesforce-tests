import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import {
  parseApexInventoryResponse,
  parseCodeCoverageResponse,
  parseOrgCoverageResponse,
  parseOrgInfoResponse,
  parseTestExecutionResponse,
} from '../src/common/sfResponseParsers';
import { extensionRoot } from './support/extensionHarness';

const fixtures = JSON.parse(
  fs.readFileSync(path.join(extensionRoot, 'test', 'fixtures', 'sf-responses.json'), 'utf8')
) as Record<string, unknown>;

describe('Salesforce CLI response parsers', () => {
  describe('org information', () => {
    it('accepts the consumed fields from a sanitized response and ignores extras', () => {
      assert.deepStrictEqual(
        parseOrgInfoResponse({
          ...(fixtures.org as object),
          unusedEnvelopeField: 'ignored',
        }),
        {
          alias: 'fixture-org',
          username: 'fixture.user@example.invalid',
          orgName: 'fixture',
        }
      );
    });

    it('falls back to username for an invalid alias and omits an invalid instance URL', () => {
      assert.deepStrictEqual(
        parseOrgInfoResponse({
          result: {
            alias: 42,
            username: 'fixture.user@example.invalid',
            instanceUrl: 'not a URL',
          },
        }),
        {
          alias: 'fixture.user@example.invalid',
          username: 'fixture.user@example.invalid',
          orgName: undefined,
        }
      );
    });

    it('rejects missing, empty, and incompatible usernames without exposing values', () => {
      for (const response of [
        undefined,
        {},
        { result: {} },
        { result: { username: '' } },
        { result: { username: 42, secret: 'org-response-secret' } },
      ]) {
        assertSafeFailure(
          () => parseOrgInfoResponse(response),
          'Salesforce CLI returned an incompatible org response.'
        );
      }
    });
  });

  describe('Apex inventory', () => {
    it('accepts sanitized records and an empty collection', () => {
      assert.deepStrictEqual(parseApexInventoryResponse(fixtures.apexInventory), {
        records: [
          {
            id: 'fixture-test-id',
            name: 'FixturePassingTest',
            body: '@IsTest private class FixturePassingTest {}',
          },
          {
            id: 'fixture-class-id',
            name: 'FixtureService',
            body: 'public class FixtureService {}',
          },
        ],
        discardedRecords: 0,
      });
      assert.deepStrictEqual(parseApexInventoryResponse({ result: { records: [] } }), {
        records: [],
        discardedRecords: 0,
      });
    });

    it('keeps valid records and counts every incompatible record', () => {
      assert.deepStrictEqual(
        parseApexInventoryResponse({
          result: {
            records: [
              { Id: 'valid-id', Name: 'ValidClass', Body: 'class ValidClass {}', extra: true },
              { Id: 'missing-body', Name: 'MissingBody' },
              { Id: 42, Name: 'WrongId', Body: 'class WrongId {}' },
              null,
            ],
          },
        }),
        {
          records: [{ id: 'valid-id', name: 'ValidClass', body: 'class ValidClass {}' }],
          discardedRecords: 3,
        }
      );
    });

    it('rejects incompatible collection envelopes', () => {
      for (const response of [undefined, {}, { result: {} }, { result: { records: {} } }]) {
        assertSafeFailure(
          () => parseApexInventoryResponse(response),
          'Salesforce CLI returned an incompatible Apex inventory response.'
        );
      }
    });
  });

  describe('class coverage', () => {
    it('accepts sanitized records, including zero counters', () => {
      assert.deepStrictEqual(parseCodeCoverageResponse(fixtures.codeCoverage), {
        records: [
          {
            apexId: 'fixture-class-id',
            coveredLines: 8,
            uncoveredLines: 2,
          },
        ],
        discardedRecords: 0,
      });
      assert.deepStrictEqual(
        parseCodeCoverageResponse({
          result: {
            records: [
              {
                ApexClassOrTriggerId: 'zero-id',
                NumLinesCovered: 0,
                NumLinesUncovered: 0,
              },
            ],
          },
        }).records[0],
        { apexId: 'zero-id', coveredLines: 0, uncoveredLines: 0 }
      );
    });

    it('discards records with missing identifiers or invalid counters before application', () => {
      const parsed = parseCodeCoverageResponse({
        result: {
          records: [
            {
              ApexClassOrTriggerId: 'valid-id',
              NumLinesCovered: 3,
              NumLinesUncovered: 1,
            },
            {
              ApexClassOrTriggerId: '',
              NumLinesCovered: 1,
              NumLinesUncovered: 1,
            },
            {
              ApexClassOrTriggerId: 'negative-id',
              NumLinesCovered: -1,
              NumLinesUncovered: 2,
            },
            {
              ApexClassOrTriggerId: 'nan-id',
              NumLinesCovered: Number.NaN,
              NumLinesUncovered: 2,
            },
          ],
        },
      });

      assert.deepStrictEqual(parsed.records, [
        { apexId: 'valid-id', coveredLines: 3, uncoveredLines: 1 },
      ]);
      assert.strictEqual(parsed.discardedRecords, 3);
    });

    it('rejects incompatible collection envelopes', () => {
      for (const response of [undefined, {}, { result: {} }, { result: { records: 'none' } }]) {
        assertSafeFailure(
          () => parseCodeCoverageResponse(response),
          'Salesforce CLI returned an incompatible code coverage response.'
        );
      }
    });
  });

  describe('org-wide coverage', () => {
    it('accepts a sanitized percentage and both valid boundaries', () => {
      assert.strictEqual(parseOrgCoverageResponse(fixtures.orgCoverage), 84);
      assert.strictEqual(
        parseOrgCoverageResponse({ result: { records: [{ PercentCovered: 0 }] } }),
        0
      );
      assert.strictEqual(
        parseOrgCoverageResponse({ result: { records: [{ PercentCovered: 100 }] } }),
        100
      );
    });

    it('rejects absent, non-finite, non-numeric, and out-of-range percentages', () => {
      for (const percent of [undefined, '84', Number.NaN, Number.POSITIVE_INFINITY, -1, 101]) {
        assertSafeFailure(
          () =>
            parseOrgCoverageResponse({
              result: { records: percent === undefined ? [] : [{ PercentCovered: percent }] },
            }),
          'Salesforce CLI returned an incompatible org coverage response.'
        );
      }
    });
  });

  describe('test execution', () => {
    it('parses sanitized Passed and Failed responses before they are applied', () => {
      const passed = parseTestExecutionResponse(fixtures.testPassed);
      assert.deepStrictEqual(passed, {
        kind: 'completed',
        outcome: 'Passed',
        startTime: new Date('2026-01-02T03:04:05.000Z'),
        startTimeLabel: '2026-01-02T03:04:05.000Z',
        duration: 1250,
        durationLabel: '1250 ms',
        failedTests: [],
        coverage: {
          classes: [{ name: 'FixtureService', totalLines: 10, coveredLines: 9 }],
          orgWideCoverage: 91,
        },
      });

      const failed = parseTestExecutionResponse(fixtures.testFailed);
      assert.strictEqual(failed.kind, 'completed');
      if (failed.kind !== 'completed') assert.fail('Expected a completed response');
      assert.strictEqual(failed.outcome, 'Failed');
      assert.strictEqual(failed.duration, 875);
      assert.deepStrictEqual(failed.failedTests, [
        {
          fullName: 'FixtureFailingTest.fails',
          message: 'synthetic assertion',
          stackTrace: 'Class.FixtureFailingTest: line 7',
        },
      ]);
    });

    it('degrades safely when coverage is absent or incompatible', () => {
      const absent = parseTestExecutionResponse(fixtures.testWithoutCoverage);
      const incompatible = parseTestExecutionResponse({
        ...(fixtures.testWithoutCoverage as object),
        result: {
          ...(fixtures.testWithoutCoverage as { result: object }).result,
          coverage: { coverage: 'not-an-array', summary: { orgWideCoverage: 'secret' } },
        },
      });

      assert.strictEqual(absent.kind, 'completed');
      assert.strictEqual(incompatible.kind, 'completed');
      if (absent.kind !== 'completed' || incompatible.kind !== 'completed') {
        assert.fail('Expected completed responses');
      }
      assert.strictEqual(absent.coverage, undefined);
      assert.strictEqual(incompatible.coverage, undefined);
    });

    it('omits incomplete method details while retaining compatible failures', () => {
      const parsed = parseTestExecutionResponse(fixtures.testWithIncompleteMethods);

      assert.strictEqual(parsed.kind, 'completed');
      if (parsed.kind !== 'completed') assert.fail('Expected a completed response');
      assert.strictEqual(parsed.duration, 625);
      assert.deepStrictEqual(parsed.failedTests, [
        {
          fullName: 'FixtureFailingTest.complete',
          message: 'synthetic assertion',
          stackTrace: 'Class.FixtureFailingTest: line 9',
        },
      ]);
    });

    it('accepts rejected operations with a numeric status and safely degrades their details', () => {
      assert.deepStrictEqual(
        parseTestExecutionResponse({
          status: 1,
          name: 'SyntheticOperationError',
          message: 'Execution rejected',
          result: 'not-required',
        }),
        {
          kind: 'rejected',
          name: 'SyntheticOperationError',
          message: 'Execution rejected',
        }
      );
      assert.deepStrictEqual(parseTestExecutionResponse({ status: 1, name: 42, message: null }), {
        kind: 'rejected',
      });
    });

    it('rejects non-numeric status and incomplete required completion summaries safely', () => {
      const invalidResponses = [
        { status: '0' },
        { status: Number.NaN },
        { status: 0 },
        { status: 0, result: {} },
        {
          status: 0,
          result: {
            summary: {
              outcome: 42,
              testStartTime: '2026-01-02T03:04:05.000Z',
              testExecutionTime: '1250',
            },
          },
        },
        {
          status: 0,
          result: {
            summary: {
              outcome: 'Passed',
              testStartTime: 'not-a-date',
              testExecutionTime: '1250',
            },
          },
        },
        {
          status: 0,
          result: {
            summary: {
              outcome: 'Passed',
              testStartTime: '2026-01-02T03:04:05.000Z',
              testExecutionTime: '-1 ms',
            },
            secret: 'test-response-secret',
          },
        },
      ];

      for (const response of invalidResponses) {
        assertSafeFailure(
          () => parseTestExecutionResponse(response),
          'Salesforce CLI returned an incompatible test execution response.'
        );
      }
    });
  });
});

function assertSafeFailure(operation: () => unknown, expectedMessage: string): void {
  assert.throws(operation, (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.strictEqual(error.message, expectedMessage);
    assert.doesNotMatch(error.message, /secret|\{|\}/i);
    return true;
  });
}
