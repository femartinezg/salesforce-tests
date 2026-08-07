import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  parseApexTestSuiteQueryResponse,
  retrieveApexTestSuites,
} from '../../src/common/ApexTestSuiteService';
import { SfCliError, type JsonSfCliClient } from '../../src/common/SfCliClient';

const query = 'SELECT Id, TestSuiteName FROM ApexTestSuite ORDER BY TestSuiteName ASC';

void describe('ApexTestSuiteService', () => {
  void it('queries suites through Tooling API for the resolved org', async () => {
    const client: JsonSfCliClient = {
      runJson: <T>(args: readonly string[]): Promise<T> => {
        assert.deepEqual(args, [
          'data',
          'query',
          '--query',
          query,
          '--use-tooling-api',
          '--target-org',
          'developer@example.com',
          '--json',
        ]);
        return Promise.resolve({ status: 0, result: { records: [] } } as T);
      },
    };

    assert.deepEqual(await retrieveApexTestSuites(client, 'developer@example.com'), []);
  });

  void it('parses suite identifiers and names', () => {
    assert.deepEqual(
      parseApexTestSuiteQueryResponse({
        status: 0,
        result: { records: [{ Id: '05F-suite', TestSuiteName: 'Regression' }] },
      }),
      [{ id: '05F-suite', name: 'Regression' }]
    );
  });

  void it('rejects malformed and failed responses', () => {
    assert.throws(
      () => parseApexTestSuiteQueryResponse({ status: 0, result: { records: [{}] } }),
      hasKind('invalid-response')
    );
    assert.throws(
      () => parseApexTestSuiteQueryResponse({ status: 1, message: 'Denied' }),
      hasKind('execution')
    );
  });
});

function hasKind(kind: SfCliError['kind']): (error: unknown) => boolean {
  return (error: unknown) => error instanceof SfCliError && error.kind === kind;
}
