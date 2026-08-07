import { SfCliError } from './SfCliClient';

export interface ApexTestFailure {
  fullName: string;
  message: string;
  stackTrace?: string;
}

export interface ApexTestCaseResult {
  fullName: string;
  outcome: string;
  runTimeMs?: number;
}

export interface ApexTestCoverage {
  name: string;
  totalLines: number;
  coveredLines: number;
  uncoveredLineNumbers?: number[];
}

export interface ApexTestRunResult {
  kind: 'test-result';
  passed: boolean;
  testStartTime: string;
  testExecutionTimeMs: number;
  failures: ApexTestFailure[];
  tests: ApexTestCaseResult[];
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
  const testExecutionTimeMs = parseDurationMs(summary.testExecutionTime);
  if (
    !outcome
    || !testStartTime
    || Number.isNaN(Date.parse(testStartTime))
    || testExecutionTimeMs === undefined
  ) {
    throw invalidResponse();
  }

  const coverageResult = parseCoverage(result.coverage);
  const testResult = parseTests(result.tests);

  return {
    kind: 'test-result',
    passed: outcome === 'Passed',
    testStartTime,
    testExecutionTimeMs,
    failures: testResult.failures,
    tests: testResult.tests,
    coverage: coverageResult.coverage,
    orgWideCoverage: coverageResult.orgWideCoverage,
  };
}

function parseTests(value: unknown): {
  failures: ApexTestFailure[];
  tests: ApexTestCaseResult[];
} {
  if (value === undefined) {
    return { failures: [], tests: [] };
  }
  if (!Array.isArray(value)) {
    throw invalidResponse();
  }

  const failures: ApexTestFailure[] = [];
  const tests: ApexTestCaseResult[] = [];
  for (const itemValue of value) {
    const item = asRecord(itemValue);
    const fullName = requiredString(item?.FullName);
    if (!item || typeof item.Outcome !== 'string' || !fullName) {
      throw invalidResponse();
    }
    tests.push({
      fullName,
      outcome: item.Outcome,
      runTimeMs: item.RunTime === undefined ? undefined : parseNumber(item.RunTime),
    });
    if (item.Outcome !== 'Fail') {
      continue;
    }

    const message = requiredString(item.Message);
    if (!message) {
      throw invalidResponse();
    }
    failures.push({
      fullName,
      message,
      stackTrace: optionalString(item.StackTrace),
    });
  }
  return { failures, tests };
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
    const uncoveredLineNumbers = parseUncoveredLineNumbers(item?.lines);
    return {
      name,
      totalLines,
      coveredLines,
      ...(uncoveredLineNumbers ? { uncoveredLineNumbers } : {}),
    };
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

function parseDurationMs(value: unknown): number | undefined {
  if (typeof value === 'number') {
    return parseNumber(value);
  }
  if (typeof value !== 'string') {
    return undefined;
  }

  const match = /^([0-9]+(?:\.[0-9]+)?)\s*ms$/i.exec(value.trim());
  return parseNumber(match?.[1] ?? value);
}

function parsePercentage(value: unknown): number | undefined {
  if (typeof value === 'string') {
    return parseNumber(value.replace('%', ''));
  }
  return parseNumber(value);
}

function parseUncoveredLineNumbers(value: unknown): number[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  const lines = asRecord(value);
  if (!lines) {
    throw invalidResponse();
  }
  const uncoveredLines: number[] = [];
  for (const [lineValue, hitValue] of Object.entries(lines)) {
    const line = Number(lineValue);
    const hits = parseNumber(hitValue);
    if (!Number.isInteger(line) || line < 1 || hits === undefined) {
      throw invalidResponse();
    }
    if (hits === 0) {
      uncoveredLines.push(line);
    }
  }
  return uncoveredLines.sort((left, right) => left - right);
}

function invalidResponse(): SfCliError {
  return new SfCliError(
    'invalid-response',
    'Salesforce CLI returned an incompatible Apex test response.'
  );
}
