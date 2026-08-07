import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  parseApexClassCoverageResponse,
  parseOrgWideCoverageResponse,
  retrieveApexClassCoverage,
  retrieveOrgWideCoverage,
} from '../../src/common/CoverageService';
import { SfCliError, type JsonSfCliClient } from '../../src/common/SfCliClient';

const classCoverageQuery =
  'SELECT Id, ApexClassOrTriggerId, NumLinesCovered, NumLinesUncovered FROM ApexCodeCoverageAggregate';
const orgWideCoverageQuery = 'SELECT Id, PercentCovered FROM ApexOrgWideCoverage';

void describe('CoverageService', () => {
  void it('queries class coverage with isolated arguments pinned to the resolved org', async () => {
    const client = clientReturning(
      successfulResponse([
        {
          Id: 'coverage-record',
          ApexClassOrTriggerId: '01p-class',
          NumLinesCovered: 8,
          NumLinesUncovered: 2,
        },
      ]),
      [
        'data',
        'query',
        '--query',
        classCoverageQuery,
        '--use-tooling-api',
        '--target-org',
        'developer@example.com',
        '--json',
      ]
    );

    assert.deepEqual(await retrieveApexClassCoverage(client, 'developer@example.com'), [
      { classId: '01p-class', coveredLines: 8, uncoveredLines: 2 },
    ]);
  });

  void it('queries org-wide coverage with isolated arguments pinned to the resolved org', async () => {
    const client = clientReturning(
      successfulResponse([{ Id: 'org-coverage', PercentCovered: 83 }]),
      [
        'data',
        'query',
        '--query',
        orgWideCoverageQuery,
        '--use-tooling-api',
        '--target-org',
        'developer@example.com',
        '--json',
      ]
    );

    assert.equal(await retrieveOrgWideCoverage(client, 'developer@example.com'), 83);
  });

  void it('accepts empty class coverage records', () => {
    assert.deepEqual(parseApexClassCoverageResponse(successfulResponse([])), []);
  });

  void it('rejects malformed class coverage records', () => {
    const malformedRecords = [
      {
        Id: 'coverage-record',
        NumLinesCovered: 8,
        NumLinesUncovered: 2,
      },
      {
        Id: 'coverage-record',
        ApexClassOrTriggerId: '01p-class',
        NumLinesCovered: -1,
        NumLinesUncovered: 2,
      },
      {
        Id: 'coverage-record',
        ApexClassOrTriggerId: '01p-class',
        NumLinesCovered: '8',
        NumLinesUncovered: 2,
      },
    ];

    for (const record of malformedRecords) {
      assert.throws(
        () => parseApexClassCoverageResponse(successfulResponse([record])),
        hasKind('invalid-response')
      );
    }
  });

  void it('rejects missing or malformed org-wide coverage', () => {
    const malformedResponses = [
      successfulResponse([]),
      successfulResponse([{ Id: 'org-coverage' }]),
      successfulResponse([{ Id: 'org-coverage', PercentCovered: '83' }]),
      successfulResponse([{ Id: 'org-coverage', PercentCovered: 101 }]),
    ];

    for (const response of malformedResponses) {
      assert.throws(() => parseOrgWideCoverageResponse(response), hasKind('invalid-response'));
    }
  });

  void it('rejects malformed successful envelopes', () => {
    assert.throws(
      () => parseApexClassCoverageResponse({ status: 0, result: {} }),
      hasKind('invalid-response')
    );
    assert.throws(
      () => parseOrgWideCoverageResponse({ status: 0, result: { records: 'invalid' } }),
      hasKind('invalid-response')
    );
  });

  void it('reports nonzero class coverage envelopes as execution errors', () => {
    assert.throws(
      () => parseApexClassCoverageResponse({ status: 1, message: 'Query failed' }),
      hasKind('execution')
    );
  });

  void it('reports nonzero org-wide coverage envelopes as execution errors', () => {
    assert.throws(
      () => parseOrgWideCoverageResponse({ status: 1, message: 'Query failed' }),
      hasKind('execution')
    );
  });
});

function successfulResponse(records: unknown[]): unknown {
  return { status: 0, result: { records } };
}

function clientReturning(response: unknown, expectedArgs: readonly string[]): JsonSfCliClient {
  return {
    runJson: <T>(args: readonly string[]): Promise<T> => {
      assert.deepEqual(args, expectedArgs);
      return Promise.resolve(response as T);
    },
  };
}

function hasKind(kind: SfCliError['kind']): (error: unknown) => boolean {
  return (error: unknown) => error instanceof SfCliError && error.kind === kind;
}
