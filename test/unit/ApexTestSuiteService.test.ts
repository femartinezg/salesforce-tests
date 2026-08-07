import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createApexTestSuite,
  deleteApexTestSuite,
  isValidApexTestSuiteName,
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

  void it('creates a suite and its selected class memberships', async () => {
    const client = new QueueClient([
      { status: 0, result: { id: '05F-suite' } },
      { status: 0, result: { id: '05G-member' } },
    ]);

    assert.deepEqual(
      await createApexTestSuite(client, 'Regression', ['01p-class'], 'developer@example.com'),
      { id: '05F-suite', name: 'Regression' }
    );
    assert.deepEqual(client.calls[0], [
      'data',
      'create',
      'record',
      '--sobject',
      'ApexTestSuite',
      '--values',
      "TestSuiteName='Regression'",
      '--use-tooling-api',
      '--target-org',
      'developer@example.com',
      '--json',
    ]);
    assert.equal(
      client.calls[1][client.calls[1].indexOf('--values') + 1],
      'ApexTestSuiteId=05F-suite ApexClassId=01p-class'
    );
  });

  void it('removes a partially created suite after a membership failure', async () => {
    const client = new QueueClient([
      { status: 0, result: { id: '05F-suite' } },
      { status: 1, message: 'Membership denied' },
      { status: 0, result: { id: '05F-suite' } },
    ]);

    await assert.rejects(
      createApexTestSuite(client, 'Regression', ['01p-class'], 'developer@example.com'),
      hasKind('execution')
    );
    assert.equal(client.calls[2][1], 'delete');
    assert.equal(client.calls[2][client.calls[2].indexOf('--record-id') + 1], '05F-suite');
  });

  void it('deletes a suite in the resolved org', async () => {
    const client = new QueueClient([{ status: 0, result: { id: '05F-suite' } }]);

    await deleteApexTestSuite(client, '05F-suite', 'developer@example.com');

    assert.equal(client.calls[0][1], 'delete');
    assert.equal(
      client.calls[0][client.calls[0].indexOf('--target-org') + 1],
      'developer@example.com'
    );
  });

  void it('validates suite names before building CLI values', () => {
    assert.equal(isValidApexTestSuiteName('Regression_2026'), true);
    assert.equal(isValidApexTestSuiteName('Regression Suite'), true);
    assert.equal(isValidApexTestSuiteName('1Invalid'), false);
    assert.equal(isValidApexTestSuiteName("Invalid'Name"), false);
  });
});

function hasKind(kind: SfCliError['kind']): (error: unknown) => boolean {
  return (error: unknown) => error instanceof SfCliError && error.kind === kind;
}

class QueueClient implements JsonSfCliClient {
  public readonly calls: string[][] = [];

  public constructor(private readonly responses: unknown[]) {}

  public runJson<T>(args: readonly string[]): Promise<T> {
    this.calls.push([...args]);
    const response = this.responses.shift();
    return response === undefined ?
        Promise.reject(new Error('No stub response remains.'))
      : Promise.resolve(response as T);
  }
}
