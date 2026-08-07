import { SfCliError, type JsonSfCliClient } from './SfCliClient';

export interface OrgInfo {
  status: boolean;
  alias?: string;
  username?: string;
  orgName?: string;
}

export async function retrieveDefaultOrgInfo(client: JsonSfCliClient): Promise<OrgInfo> {
  const response = await client.runJson<unknown>(['org', 'display', '--json']);
  return parseOrgDisplayResponse(response);
}

export function parseOrgDisplayResponse(response: unknown): OrgInfo {
  const envelope = asRecord(response);
  if (!envelope || typeof envelope.status !== 'number') {
    throw invalidResponse();
  }

  if (envelope.status !== 0) {
    return { status: false };
  }

  const result = asRecord(envelope.result);
  if (!result || typeof result.username !== 'string') {
    throw invalidResponse();
  }

  const alias = optionalString(result.alias);
  const instanceUrl = optionalString(result.instanceUrl);

  return {
    status: true,
    alias,
    username: result.username,
    orgName: instanceUrl ? getOrgName(instanceUrl) : undefined,
  };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null ?
      (value as Record<string, unknown>)
    : undefined;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function getOrgName(instanceUrl: string): string | undefined {
  try {
    return new URL(instanceUrl).hostname.split('.')[0] || undefined;
  } catch {
    return undefined;
  }
}

function invalidResponse(): SfCliError {
  return new SfCliError(
    'invalid-response',
    'Salesforce CLI returned an incompatible org response.'
  );
}
