import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  parseOrgDisplayResponse,
  retrieveDefaultOrgInfo,
  type JsonSfCliClient,
} from '../../src/common/OrgService';
import { SfCliError } from '../../src/common/SfCliClient';

void describe('OrgService', () => {
  void it('requests and parses the default org', async () => {
    const client: JsonSfCliClient = {
      runJson: async <T>(args: readonly string[]): Promise<T> => {
        assert.deepEqual(args, ['org', 'display', '--json']);
        return successfulResponse as T;
      },
    };

    assert.deepEqual(await retrieveDefaultOrgInfo(client), {
      status: true,
      alias: 'salesforce-tests-dev',
      username: 'developer@example.com',
      orgName: 'example-dev-ed',
    });
  });

  void it('represents a CLI failure as an unauthenticated org', () => {
    assert.deepEqual(parseOrgDisplayResponse({ status: 1, message: 'No default org' }), {
      status: false,
    });
  });

  void it('rejects successful responses without a username', () => {
    assert.throws(
      () => parseOrgDisplayResponse({ status: 0, result: {} }),
      (error: unknown) => error instanceof SfCliError && error.kind === 'invalid-response'
    );
  });
});

const successfulResponse = {
  status: 0,
  result: {
    alias: 'salesforce-tests-dev',
    username: 'developer@example.com',
    instanceUrl: 'https://example-dev-ed.develop.my.salesforce.com',
  },
};
