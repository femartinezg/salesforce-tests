import { SfCliError, type JsonSfCliClient } from './SfCliClient';

export interface ImpactedApexTest {
  className: string;
  methodName: string;
  selector: string;
}

export async function retrieveImpactedApexTests(
  client: JsonSfCliClient,
  apexClassName: string,
  targetOrg: string
): Promise<ImpactedApexTest[]> {
  return retrieveImpactedApexTestsForComponents(client, [apexClassName], targetOrg);
}

export async function retrieveImpactedApexTestsForComponents(
  client: JsonSfCliClient,
  apexComponentNames: readonly string[],
  targetOrg: string
): Promise<ImpactedApexTest[]> {
  const componentNames = [...new Set(apexComponentNames)];
  const invalidName = componentNames.find((name) => !isApexIdentifier(name));
  if (invalidName) {
    throw new SfCliError('invalid-response', `${invalidName} is not a valid Apex component name.`);
  }
  if (componentNames.length === 0) {
    return [];
  }
  const response = await client.runJson<unknown>(
    buildImpactedApexTestsQueryArgs(componentNames, targetOrg)
  );
  return parseImpactedApexTestsResponse(response);
}

export function buildImpactedApexTestsQueryArgs(
  apexComponentNames: readonly string[],
  targetOrg: string
): readonly string[] {
  const names = apexComponentNames.map((name) => `'${name}'`).join(', ');
  const query =
    'SELECT ApexTestClass.Name, TestMethodName FROM ApexCodeCoverage '
    + `WHERE ApexClassOrTrigger.Name IN (${names}) `
    + 'ORDER BY ApexTestClass.Name, TestMethodName';
  return [
    'data',
    'query',
    '--query',
    query,
    '--use-tooling-api',
    '--target-org',
    targetOrg,
    '--json',
  ];
}

export function parseImpactedApexTestsResponse(response: unknown): ImpactedApexTest[] {
  const envelope = asRecord(response);
  if (!envelope || typeof envelope.status !== 'number') {
    throw invalidResponse();
  }
  if (envelope.status !== 0) {
    const detail = typeof envelope.message === 'string' ? `: ${envelope.message}` : '';
    throw new SfCliError('execution', `Salesforce CLI failed to query impacted tests${detail}`);
  }

  const result = asRecord(envelope.result);
  if (!result || !Array.isArray(result.records)) {
    throw invalidResponse();
  }

  const selectors = new Map<string, ImpactedApexTest>();
  for (const value of result.records) {
    const record = asRecord(value);
    const apexTestClass = asRecord(record?.ApexTestClass);
    const className = apexTestClass?.Name;
    const methodName = record?.TestMethodName;
    if (!isNonEmptyString(className) || !isNonEmptyString(methodName)) {
      throw invalidResponse();
    }
    const selector = `${className}.${methodName}`;
    selectors.set(selector, { className, methodName, selector });
  }
  return [...selectors.values()].sort((left, right) => left.selector.localeCompare(right.selector));
}

function isApexIdentifier(value: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(value);
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
    'Salesforce CLI returned an incompatible impacted-test response.'
  );
}
