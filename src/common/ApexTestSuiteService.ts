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

export async function createApexTestSuite(
  client: JsonSfCliClient,
  name: string,
  apexClassIds: readonly string[],
  username: string
): Promise<ApexTestSuiteItem> {
  if (!isValidApexTestSuiteName(name)) {
    throw new SfCliError(
      'invalid-response',
      'Apex test suite names must start with a letter and contain only letters, numbers, or underscores.'
    );
  }
  const response = await client.runJson<unknown>(buildCreateApexTestSuiteArgs(name, username));
  const suiteId = parseMutationId(response, 'create the Apex test suite');

  try {
    for (const apexClassId of apexClassIds) {
      const membershipResponse = await client.runJson<unknown>(
        buildCreateTestSuiteMembershipArgs(suiteId, apexClassId, username)
      );
      parseMutationId(membershipResponse, 'add a class to the Apex test suite');
    }
  } catch (error: unknown) {
    try {
      await client.runJson<unknown>(buildDeleteApexTestSuiteArgs(suiteId, username));
    } catch {
      // Preserve the membership error; a later refresh will expose any incomplete suite.
    }
    throw error;
  }

  return { id: suiteId, name };
}

export async function deleteApexTestSuite(
  client: JsonSfCliClient,
  suiteId: string,
  username: string
): Promise<void> {
  const response = await client.runJson<unknown>(buildDeleteApexTestSuiteArgs(suiteId, username));
  parseMutationId(response, 'delete the Apex test suite');
}

export function isValidApexTestSuiteName(name: string): boolean {
  return /^[A-Za-z][A-Za-z0-9 _-]{0,254}$/.test(name);
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

export function buildCreateApexTestSuiteArgs(name: string, username: string): readonly string[] {
  return [
    'data',
    'create',
    'record',
    '--sobject',
    'ApexTestSuite',
    '--values',
    `TestSuiteName='${name}'`,
    '--use-tooling-api',
    '--target-org',
    username,
    '--json',
  ];
}

export function buildCreateTestSuiteMembershipArgs(
  suiteId: string,
  apexClassId: string,
  username: string
): readonly string[] {
  return [
    'data',
    'create',
    'record',
    '--sobject',
    'TestSuiteMembership',
    '--values',
    `ApexTestSuiteId=${suiteId} ApexClassId=${apexClassId}`,
    '--use-tooling-api',
    '--target-org',
    username,
    '--json',
  ];
}

export function buildDeleteApexTestSuiteArgs(suiteId: string, username: string): readonly string[] {
  return [
    'data',
    'delete',
    'record',
    '--sobject',
    'ApexTestSuite',
    '--record-id',
    suiteId,
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

function parseMutationId(response: unknown, action: string): string {
  const envelope = asRecord(response);
  const result = asRecord(envelope?.result);
  if (envelope?.status !== 0) {
    const detail = typeof envelope?.message === 'string' ? `: ${envelope.message}` : '';
    throw new SfCliError('execution', `Salesforce CLI failed to ${action}${detail}`);
  }
  if (!result || !isNonEmptyString(result.id)) {
    throw invalidResponse();
  }
  return result.id;
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
