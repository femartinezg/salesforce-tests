import { SfCliError, type JsonSfCliClient } from './SfCliClient';

const CLASS_COVERAGE_QUERY =
  'SELECT Id, ApexClassOrTriggerId, NumLinesCovered, NumLinesUncovered FROM ApexCodeCoverageAggregate';
const ORG_WIDE_COVERAGE_QUERY = 'SELECT Id, PercentCovered FROM ApexOrgWideCoverage';

export interface ApexClassCoverage {
  classId: string;
  coveredLines: number;
  uncoveredLines: number;
}

export async function retrieveApexClassCoverage(
  client: JsonSfCliClient,
  username: string
): Promise<ApexClassCoverage[]> {
  const response = await client.runJson<unknown>(
    buildToolingQueryArgs(CLASS_COVERAGE_QUERY, username)
  );
  return parseApexClassCoverageResponse(response);
}

export async function retrieveOrgWideCoverage(
  client: JsonSfCliClient,
  username: string
): Promise<number> {
  const response = await client.runJson<unknown>(
    buildToolingQueryArgs(ORG_WIDE_COVERAGE_QUERY, username)
  );
  return parseOrgWideCoverageResponse(response);
}

export function parseApexClassCoverageResponse(response: unknown): ApexClassCoverage[] {
  const records = parseRecords(response, 'Apex class coverage');

  return records.map((recordValue) => {
    const record = asRecord(recordValue);
    if (
      !record
      || !isNonEmptyString(record.Id)
      || !isNonEmptyString(record.ApexClassOrTriggerId)
      || !isLineCount(record.NumLinesCovered)
      || !isLineCount(record.NumLinesUncovered)
    ) {
      throw invalidResponse('Apex class coverage');
    }

    return {
      classId: record.ApexClassOrTriggerId,
      coveredLines: record.NumLinesCovered,
      uncoveredLines: record.NumLinesUncovered,
    };
  });
}

export function parseOrgWideCoverageResponse(response: unknown): number {
  const records = parseRecords(response, 'org-wide coverage');
  if (records.length !== 1) {
    throw invalidResponse('org-wide coverage');
  }

  const record = asRecord(records[0]);
  if (
    !record
    || !isNonEmptyString(record.Id)
    || typeof record.PercentCovered !== 'number'
    || !Number.isFinite(record.PercentCovered)
    || record.PercentCovered < 0
    || record.PercentCovered > 100
  ) {
    throw invalidResponse('org-wide coverage');
  }

  return record.PercentCovered;
}

function buildToolingQueryArgs(query: string, username: string): readonly string[] {
  return [
    'data',
    'query',
    '--query',
    query,
    '--use-tooling-api',
    '--target-org',
    username,
    '--json',
  ];
}

function parseRecords(response: unknown, operation: string): unknown[] {
  const envelope = asRecord(response);
  if (!envelope || typeof envelope.status !== 'number') {
    throw invalidResponse(operation);
  }

  if (envelope.status !== 0) {
    const detail = typeof envelope.message === 'string' ? `: ${envelope.message}` : '';
    throw new SfCliError('execution', `Salesforce CLI failed to query ${operation}${detail}`);
  }

  const result = asRecord(envelope.result);
  if (!result || !Array.isArray(result.records)) {
    throw invalidResponse(operation);
  }

  return result.records;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null ?
      (value as Record<string, unknown>)
    : undefined;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isLineCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function invalidResponse(operation: string): SfCliError {
  return new SfCliError(
    'invalid-response',
    `Salesforce CLI returned an incompatible ${operation} response.`
  );
}
