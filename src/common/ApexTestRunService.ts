import { parseApexTestRunResponse, type ParsedApexTestRun } from './ApexTestRunParser';
import { type CancellationTokenLike, type JsonSfCliClient, SfCliError } from './SfCliClient';
import { buildGetTestResultArgs } from './sfCommandArgs';

export async function executeApexTestRun(
  client: JsonSfCliClient,
  runArgs: readonly string[],
  targetOrg: string,
  cancellationToken?: CancellationTokenLike
): Promise<ParsedApexTestRun> {
  const initialResponse = await client.runJson<unknown>(runArgs, cancellationToken);
  const testRunId = parseQueuedTestRunId(initialResponse);
  if (!testRunId) {
    return parseApexTestRunResponse(initialResponse);
  }
  if (cancellationToken?.isCancellationRequested) {
    throw new SfCliError('cancelled', 'Salesforce CLI command was cancelled.');
  }

  const completedResponse = await client.runJson<unknown>(
    buildGetTestResultArgs(testRunId, targetOrg),
    cancellationToken
  );
  return parseApexTestRunResponse(completedResponse);
}

export function parseQueuedTestRunId(response: unknown): string | undefined {
  if (typeof response !== 'object' || response === null) {
    return undefined;
  }
  const envelope = response as Record<string, unknown>;
  if (envelope.status !== 0 || typeof envelope.result !== 'object' || envelope.result === null) {
    return undefined;
  }
  const testRunId = (envelope.result as Record<string, unknown>).testRunId;
  return typeof testRunId === 'string' && testRunId.length > 0 ? testRunId : undefined;
}
