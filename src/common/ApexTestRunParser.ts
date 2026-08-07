import { SfCliError } from './SfCliClient';

export interface ApexTestFailure {
  fullName: string;
  message: string;
  stackTrace?: string;
}

export interface ApexTestCoverage {
  name: string;
  totalLines: number;
  coveredLines: number;
}

export interface ApexTestRunResult {
  kind: 'test-result';
  passed: boolean;
  testStartTime: string;
  testExecutionTimeMs: number;
  failures: ApexTestFailure[];
  coverage: ApexTestCoverage[];
  orgWideCoverage?: number;
}

export interface ApexTestCommandError {
  kind: 'command-error';
  name?: string;
  message?: string;
}

export type ParsedApexTestRun = ApexTestRunResult | ApexTestCommandError;

export function parseApexTestRunResponse(response: unknown): ParsedApexTestRun {
  const envelope = asRecord(response);
  if (!envelope || typeof envelope.status !== 'number') {
    throw invalidResponse();
  }

  if (envelope.status !== 0 && envelope.status !== 100) {
    return {
      kind: 'command-error',
      name: optionalString(envelope.name),
      message: optionalString(envelope.message),
    };
  }

  const result = asRecord(envelope.result);
  const summary = asRecord(result?.summary);
  if (!result || !summary) {
    throw invalidResponse();
  }

  const outcome = requiredString(summary.outcome);
  const testStartTime = requiredString(summary.testStartTime);
  const testExecutionTimeMs = parseNumber(summary.testExecutionTime);
  if (!outcome || !testStartTime || testExecutionTimeMs === undefined) {
    throw invalidResponse();
  }

  const coverageResult = parseCoverage(result.coverage);

  return {
    kind: 'test-result',
    passed: outcome === 'Passed',
    testStartTime,
    testExecutionTimeMs,
    failures: parseFailures(result.tests),
    coverage: coverageResult.coverage,
    orgWideCoverage: coverageResult.orgWideCoverage,
  };
}

function parseFailures(value: unknown): ApexTestFailure[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw invalidResponse();
  }

  const failures: ApexTestFailure[] = [];
  for (const itemValue of value) {
    const item = asRecord(itemValue);
    if (!item || typeof item.Outcome !== 'string') {
      throw invalidResponse();
    }
    if (item.Outcome !== 'Fail') {
      continue;
    }

    const fullName = requiredString(item.FullName);
    const message = requiredString(item.Message);
    if (!fullName || !message) {
      throw invalidResponse();
    }
    failures.push({
      fullName,
      message,
      stackTrace: optionalString(item.StackTrace),
    });
  }
  return failures;
}

function parseCoverage(value: unknown): {
  coverage: ApexTestCoverage[];
  orgWideCoverage?: number;
} {
  if (value === undefined) {
    return { coverage: [] };
  }

  const coverageResult = asRecord(value);
  if (!coverageResult) {
    throw invalidResponse();
  }

  const items = coverageResult.coverage;
  if (items !== undefined && !Array.isArray(items)) {
    throw invalidResponse();
  }

  const coverage = (items ?? []).map((itemValue) => {
    const item = asRecord(itemValue);
    const name = requiredString(item?.name);
    const totalLines = parseNumber(item?.totalLines);
    const coveredLines = parseNumber(item?.totalCovered);
    if (!name || totalLines === undefined || coveredLines === undefined) {
      throw invalidResponse();
    }
    return { name, totalLines, coveredLines };
  });

  const coverageSummary = asRecord(coverageResult.summary);
  const orgWideCoverage =
    coverageSummary ? parsePercentage(coverageSummary.orgWideCoverage) : undefined;

  return { coverage, orgWideCoverage };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null ?
      (value as Record<string, unknown>)
    : undefined;
}

function requiredString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function parseNumber(value: unknown): number | undefined {
  const parsed =
    typeof value === 'number' ? value
    : typeof value === 'string' ? Number(value)
    : NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function parsePercentage(value: unknown): number | undefined {
  if (typeof value === 'string') {
    return parseNumber(value.replace('%', ''));
  }
  return parseNumber(value);
}

function invalidResponse(): SfCliError {
  return new SfCliError(
    'invalid-response',
    'Salesforce CLI returned an incompatible Apex test response.'
  );
}
