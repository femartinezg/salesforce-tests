import { detectApexClassKind } from './apexSource';
import { SfCliError, type JsonSfCliClient } from './SfCliClient';

const APEX_CLASSES_QUERY =
  "SELECT Id, Name, Body, SymbolTable FROM ApexClass WHERE ManageableState = 'unmanaged' ORDER BY Name ASC";

export interface ApexClassItem {
  id: string;
  name: string;
}

export interface ApexTestClassItem extends ApexClassItem {
  methods: string[];
}

export interface ApexClasses {
  testClasses: ApexTestClassItem[];
  apexClasses: ApexClassItem[];
}

export async function retrieveApexClasses(
  client: JsonSfCliClient,
  username: string
): Promise<ApexClasses> {
  const response = await client.runJson<unknown>(buildApexClassQueryArgs(username));
  return parseApexClassQueryResponse(response);
}

export function buildApexClassQueryArgs(username: string): readonly string[] {
  return [
    'data',
    'query',
    '--query',
    APEX_CLASSES_QUERY,
    '--use-tooling-api',
    '--target-org',
    username,
    '--json',
  ];
}

export function parseApexClassQueryResponse(response: unknown): ApexClasses {
  const envelope = asRecord(response);
  if (!envelope || typeof envelope.status !== 'number') {
    throw invalidResponse();
  }

  if (envelope.status !== 0) {
    const detail = typeof envelope.message === 'string' ? `: ${envelope.message}` : '';
    throw new SfCliError('execution', `Salesforce CLI failed to query Apex classes${detail}`);
  }

  const result = asRecord(envelope.result);
  if (!result || !Array.isArray(result.records)) {
    throw invalidResponse();
  }

  const apexClasses: ApexClassItem[] = [];
  const testClasses: ApexTestClassItem[] = [];

  for (const recordValue of result.records) {
    const record = asRecord(recordValue);
    if (!record || !isNonEmptyString(record.Id) || !isNonEmptyString(record.Name)) {
      throw invalidResponse();
    }
    if (typeof record.Body !== 'string') {
      throw invalidResponse();
    }

    const item = { id: record.Id, name: record.Name };
    const classKind = detectApexClassKind(record.Body);
    const testMethods = parseTestMethods(record.SymbolTable);

    if (classKind === true || testMethods.length > 0) {
      testClasses.push({ ...item, methods: testMethods });
    } else if (classKind === false) {
      apexClasses.push(item);
    }
  }

  return { testClasses, apexClasses };
}

function parseTestMethods(value: unknown): string[] {
  if (value === undefined || value === null) {
    return [];
  }

  const symbolTable = asRecord(value);
  if (!symbolTable || (symbolTable.methods !== undefined && !Array.isArray(symbolTable.methods))) {
    throw invalidResponse();
  }

  const methodNames = new Set<string>();
  for (const methodValue of symbolTable.methods ?? []) {
    const method = asRecord(methodValue);
    if (!method || !isNonEmptyString(method.name)) {
      throw invalidResponse();
    }

    const annotationNames = parseSymbolNames(method.annotations);
    const modifiers = parseStringList(method.modifiers);
    if (
      annotationNames.some((name) => name.toLowerCase() === 'istest')
      || modifiers.some((modifier) => modifier.toLowerCase() === 'testmethod')
    ) {
      methodNames.add(method.name);
    }
  }

  return [...methodNames];
}

function parseSymbolNames(value: unknown): string[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw invalidResponse();
  }
  return value.map((item) => {
    const record = asRecord(item);
    if (!record || !isNonEmptyString(record.name)) {
      throw invalidResponse();
    }
    return record.name;
  });
}

function parseStringList(value: unknown): string[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    throw invalidResponse();
  }
  return value;
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
    'Salesforce CLI returned an incompatible Apex class query response.'
  );
}
