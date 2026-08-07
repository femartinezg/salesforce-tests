import { SfCliError, type JsonSfCliClient } from './SfCliClient';

const APEX_TEST_SUITES_QUERY =
  'SELECT Id, TestSuiteName FROM ApexTestSuite ORDER BY TestSuiteName ASC';

export interface ApexTestSuiteItem {
  id: string;
  name: string;
}

export async function retrieveApexTestSuites(
  client: JsonSfCliClient,
  username: string
): Promise<ApexTestSuiteItem[]> {
  const response = await client.runJson<unknown>(buildApexTestSuiteQueryArgs(username));
  return parseApexTestSuiteQueryResponse(response);
}

export function buildApexTestSuiteQueryArgs(username: string): readonly string[] {
  return [
    'data',
    'query',
    '--query',
    APEX_TEST_SUITES_QUERY,
    '--use-tooling-api',
    '--target-org',
    username,
    '--json',
  ];
}

export function parseApexTestSuiteQueryResponse(response: unknown): ApexTestSuiteItem[] {
  const envelope = asRecord(response);
  if (!envelope || typeof envelope.status !== 'number') {
    throw invalidResponse();
  }
  if (envelope.status !== 0) {
    const detail = typeof envelope.message === 'string' ? `: ${envelope.message}` : '';
    throw new SfCliError('execution', `Salesforce CLI failed to query Apex test suites${detail}`);
  }

  const result = asRecord(envelope.result);
  if (!result || !Array.isArray(result.records)) {
    throw invalidResponse();
  }

  return result.records.map((value) => {
    const record = asRecord(value);
    if (!record || !isNonEmptyString(record.Id) || !isNonEmptyString(record.TestSuiteName)) {
      throw invalidResponse();
    }
    return { id: record.Id, name: record.TestSuiteName };
  });
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null ?
      (value as Record<string, unknown>)
    : undefined;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function invalidResponse(): SfCliError {
  return new SfCliError(
    'invalid-response',
    'Salesforce CLI returned an incompatible Apex test suite response.'
  );
}
