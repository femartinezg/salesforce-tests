export class SfResponseError extends Error {}

export interface OrgInfoDto {
  alias: string;
  username: string;
  orgName?: string;
}

export interface ApexInventoryRecordDto {
  id: string;
  name: string;
  body: string;
}

export interface ApexInventoryDto {
  records: ApexInventoryRecordDto[];
  discardedRecords: number;
}

export interface CodeCoverageRecordDto {
  apexId: string;
  coveredLines: number;
  uncoveredLines: number;
}

export interface CodeCoverageDto {
  records: CodeCoverageRecordDto[];
  discardedRecords: number;
}

export interface CoverageRecordIdsDto {
  ids: string[];
  discardedRecords: number;
}

export interface FailedTestDto {
  fullName: string;
  message: string;
  stackTrace: string;
}

export interface TestClassCoverageDto {
  name: string;
  totalLines: number;
  coveredLines: number;
}

export interface TestCoverageDto {
  classes: TestClassCoverageDto[];
  orgWideCoverage: number;
}

export interface RejectedTestExecutionDto {
  kind: 'rejected';
  name?: string;
  message?: string;
}

export interface CompletedTestExecutionDto {
  kind: 'completed';
  outcome: string;
  startTime: Date;
  startTimeLabel: string;
  duration: number;
  durationLabel: string;
  failedTests: FailedTestDto[];
  coverage?: TestCoverageDto;
}

export type TestExecutionDto = RejectedTestExecutionDto | CompletedTestExecutionDto;

type UnknownRecord = Record<string, unknown>;

const RESPONSE_ERRORS = {
  org: 'Salesforce CLI returned an incompatible org response.',
  apexInventory: 'Salesforce CLI returned an incompatible Apex inventory response.',
  codeCoverage: 'Salesforce CLI returned an incompatible code coverage response.',
  coverageRecords: 'Salesforce CLI returned an incompatible coverage record response.',
  orgCoverage: 'Salesforce CLI returned an incompatible org coverage response.',
  testExecution: 'Salesforce CLI returned an incompatible test execution response.',
} as const;

export function parseOrgInfoResponse(response: unknown): OrgInfoDto {
  const result = getRequiredResult(response, RESPONSE_ERRORS.org);
  const username = nonEmptyString(result.username);
  if (username === undefined) incompatible(RESPONSE_ERRORS.org);

  const alias = nonEmptyString(result.alias) ?? username;
  const orgName = parseOrgName(result.instanceUrl);
  return { alias, username, orgName };
}

export function parseApexInventoryResponse(response: unknown): ApexInventoryDto {
  const result = getRequiredResult(response, RESPONSE_ERRORS.apexInventory);
  if (!Array.isArray(result.records)) incompatible(RESPONSE_ERRORS.apexInventory);

  const records: ApexInventoryRecordDto[] = [];
  let discardedRecords = 0;
  for (const candidate of result.records) {
    const record = asRecord(candidate);
    if (
      record === undefined
      || typeof record.Id !== 'string'
      || typeof record.Name !== 'string'
      || typeof record.Body !== 'string'
    ) {
      discardedRecords++;
      continue;
    }
    records.push({ id: record.Id, name: record.Name, body: record.Body });
  }

  return { records, discardedRecords };
}

export function parseCodeCoverageResponse(response: unknown): CodeCoverageDto {
  const result = getRequiredResult(response, RESPONSE_ERRORS.codeCoverage);
  if (!Array.isArray(result.records)) incompatible(RESPONSE_ERRORS.codeCoverage);

  const records: CodeCoverageRecordDto[] = [];
  let discardedRecords = 0;
  for (const candidate of result.records) {
    const record = asRecord(candidate);
    const apexId = nonEmptyString(record?.ApexClassOrTriggerId);
    const coveredLines = nonNegativeFiniteNumber(record?.NumLinesCovered);
    const uncoveredLines = nonNegativeFiniteNumber(record?.NumLinesUncovered);
    if (apexId === undefined || coveredLines === undefined || uncoveredLines === undefined) {
      discardedRecords++;
      continue;
    }
    records.push({ apexId, coveredLines, uncoveredLines });
  }

  return { records, discardedRecords };
}

export function parseCoverageRecordIdsResponse(response: unknown): CoverageRecordIdsDto {
  const result = getRequiredResult(response, RESPONSE_ERRORS.coverageRecords);
  if (!Array.isArray(result.records)) incompatible(RESPONSE_ERRORS.coverageRecords);

  const ids: string[] = [];
  let discardedRecords = 0;
  for (const candidate of result.records) {
    const record = asRecord(candidate);
    const id = record?.Id;
    if (typeof id !== 'string' || !/^[A-Za-z0-9]{15}(?:[A-Za-z0-9]{3})?$/.test(id)) {
      discardedRecords++;
      continue;
    }
    ids.push(id);
  }

  return { ids, discardedRecords };
}

export function parseOrgCoverageResponse(response: unknown): number {
  const result = getRequiredResult(response, RESPONSE_ERRORS.orgCoverage);
  if (!Array.isArray(result.records)) incompatible(RESPONSE_ERRORS.orgCoverage);
  if (result.records.length === 0) return 0;

  const firstRecord = asRecord(result.records[0]);
  const percentCovered = firstRecord?.PercentCovered;
  if (
    typeof percentCovered !== 'number'
    || !Number.isFinite(percentCovered)
    || percentCovered < 0
    || percentCovered > 100
  ) {
    incompatible(RESPONSE_ERRORS.orgCoverage);
  }
  return percentCovered;
}

export function parseTestExecutionResponse(response: unknown): TestExecutionDto {
  const envelope = asRecord(response);
  const status = envelope?.status;
  if (typeof status !== 'number' || !Number.isFinite(status)) {
    incompatible(RESPONSE_ERRORS.testExecution);
  }

  if (status !== 0 && status !== 100) {
    const name = envelope === undefined ? undefined : optionalString(envelope.name);
    const message = envelope === undefined ? undefined : optionalString(envelope.message);
    return name !== undefined && message !== undefined ?
        { kind: 'rejected', name, message }
      : { kind: 'rejected' };
  }

  const result = asRecord(envelope?.result);
  const summary = asRecord(result?.summary);
  const outcome = optionalString(summary?.outcome);
  const startTimeLabel = optionalString(summary?.testStartTime);
  const duration = parseDuration(summary?.testExecutionTime);
  if (outcome === undefined || startTimeLabel === undefined || duration === undefined) {
    incompatible(RESPONSE_ERRORS.testExecution);
  }

  const startTime = new Date(startTimeLabel);
  if (Number.isNaN(startTime.getTime())) incompatible(RESPONSE_ERRORS.testExecution);

  return {
    kind: 'completed',
    outcome,
    startTime,
    startTimeLabel,
    duration: duration.value,
    durationLabel: duration.label,
    failedTests: parseFailedTests(result?.tests),
    coverage: parseTestCoverage(result?.coverage),
  };
}

export function incompatibleResponseError(
  operation: keyof typeof RESPONSE_ERRORS
): SfResponseError {
  return new SfResponseError(RESPONSE_ERRORS[operation]);
}

function getRequiredResult(response: unknown, errorMessage: string): UnknownRecord {
  const envelope = asRecord(response);
  const result = asRecord(envelope?.result);
  if (result === undefined) incompatible(errorMessage);
  return result;
}

function asRecord(value: unknown): UnknownRecord | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  return value as UnknownRecord;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function nonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function nonNegativeFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function parseOrgName(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  try {
    const hostname = new URL(value).hostname;
    return nonEmptyString(hostname.split('.')[0]);
  } catch {
    return undefined;
  }
}

function parseDuration(value: unknown): { value: number; label: string } | undefined {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0) return undefined;
    return { value: Math.trunc(value), label: String(value) };
  }
  if (typeof value !== 'string') return undefined;

  const match = /^\s*(\d+(?:\.\d+)?)(?:\s*[A-Za-z]+)?\s*$/.exec(value);
  if (!match) return undefined;
  const parsed = Number(match[1]);
  if (!Number.isFinite(parsed)) return undefined;
  return { value: Math.trunc(parsed), label: value };
}

function parseFailedTests(value: unknown): FailedTestDto[] {
  if (!Array.isArray(value)) return [];
  const failedTests: FailedTestDto[] = [];
  for (const candidate of value) {
    const record = asRecord(candidate);
    if (record?.Outcome !== 'Fail') continue;
    const fullName = optionalString(record.FullName);
    const message = optionalString(record.Message);
    const stackTrace = optionalString(record.StackTrace);
    if (fullName === undefined || message === undefined || stackTrace === undefined) continue;
    failedTests.push({ fullName, message, stackTrace });
  }
  return failedTests;
}

function parseTestCoverage(value: unknown): TestCoverageDto | undefined {
  const coverage = asRecord(value);
  const classRecords = coverage?.coverage;
  const summary = asRecord(coverage?.summary);
  const orgWideCoverage = parsePercent(summary?.orgWideCoverage);
  if (!Array.isArray(classRecords) || orgWideCoverage === undefined) return undefined;

  const classes: TestClassCoverageDto[] = [];
  for (const candidate of classRecords) {
    const record = asRecord(candidate);
    const name = optionalString(record?.name);
    const totalLines = nonNegativeFiniteNumber(record?.totalLines);
    const coveredLines = nonNegativeFiniteNumber(record?.totalCovered);
    if (name === undefined || totalLines === undefined || coveredLines === undefined) {
      return undefined;
    }
    classes.push({ name, totalLines, coveredLines });
  }

  return { classes, orgWideCoverage };
}

function parsePercent(value: unknown): number | undefined {
  if (typeof value !== 'string') return undefined;
  const match = /^\s*(\d+(?:\.\d+)?)%\s*$/.exec(value);
  if (!match) return undefined;
  const parsed = Number(match[1]);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) return undefined;
  return Math.trunc(parsed);
}

function incompatible(message: string): never {
  throw new SfResponseError(message);
}
