import * as vscode from 'vscode';
import { ApexClass, ApexTestClass, ApexTestMethod, type ApexTestState } from '../classes/Apex';
import { TestRun } from '../classes/TestRun';
import { ContextManager } from './ContextManager';
import { MessageType, showTestResultMessage } from './messaging';
import {
  getApexClassesInvocation,
  getCodeCoverageInvocation,
  getCoverageRecordIdsInvocation,
  getDeleteCoverageBatchInvocation,
  getOrgCoverageInvocation,
  getOrgInfoInvocation,
  getTestClassInvocation,
  getTestMethodInvocation,
  getUpdateOrgCoverageInvocation,
  TOOLING_COMPOSITE_BATCH_SIZE,
  type CoverageDeleteObject,
  type CoverageQueryObject,
} from './sfCommands';
import {
  incompatibleResponseError,
  parseApexInventoryResponse,
  parseCodeCoverageResponse,
  parseCompositeDeleteResponse,
  parseCoverageRecordIdsResponse,
  parseOrgCoverageResponse,
  parseOrgInfoResponse,
  parseTestExecutionResponse,
  SfResponseError,
  type CompletedTestExecutionDto,
  type TestClassCoverageDto,
} from './sfResponseParsers';
import { runSf } from './sfRunner';
import { analyzeApexBody } from './apexBodyParser';

export const ORG_TARGET_ERROR_MESSAGE =
  'Unable to use the selected Salesforce org. Check authentication or run Refresh Org.';
export const COVERAGE_COMPOSITE_CONCURRENCY = 4;

class OrgTargetError extends Error {}

export async function retrieveOrgInfo(): Promise<{
  status: boolean;
  alias?: string;
  username?: string;
  apiVersion?: string;
  orgName?: string;
}> {
  const invocation = getOrgInfoInvocation();
  const { error, stdout } = await runSf(invocation.args, invocation.options);
  if (error) return { status: false };

  try {
    const { alias, username, apiVersion, orgName } = parseJsonResponse(
      stdout,
      'org',
      parseOrgInfoResponse
    );
    return { status: true, alias, username, ...(apiVersion ? { apiVersion } : {}), orgName };
  } catch (error) {
    reportOperationError(error);
    return { status: false };
  }
}

export async function retrieveApexClasses(targetOrg: string): Promise<{
  testClasses: ApexTestClass[];
  apexClasses: ApexClass[];
}> {
  const invocation = getApexClassesInvocation(targetOrg);
  const { error, stdout } = await runSf(invocation.args, invocation.options);
  if (error) {
    const orgError = new OrgTargetError(ORG_TARGET_ERROR_MESSAGE);
    reportOperationError(orgError);
    throw orgError;
  }

  try {
    const { records, discardedRecords } = parseJsonResponse(
      stdout,
      'apexInventory',
      parseApexInventoryResponse
    );
    const testClasses = [];
    const apexClasses = [];

    for (const apex of records) {
      const analysis = analyzeApexBody(apex.body);
      if (analysis.isTest) {
        const testClass = new ApexTestClass(apex.id, apex.name);
        testClass.methods = analysis.testMethodNames.map(
          (methodName) => new ApexTestMethod(apex.name, methodName)
        );
        testClasses.push(testClass);
      } else if (analysis.kind !== 'interface') {
        apexClasses.push(new ApexClass(apex.id, apex.name));
      }
    }

    if (discardedRecords > 0) {
      void vscode.window.showWarningMessage(
        'Some Apex classes were omitted because Salesforce CLI returned incompatible records.'
      );
    }

    return {
      testClasses: testClasses,
      apexClasses: apexClasses,
    };
  } catch (e: unknown) {
    reportOperationError(e);
    if (e instanceof Error) throw e;
    throw new Error('Unexpected error');
  }
}

export async function retrieveCodeCoverage(contextManager: ContextManager, targetOrg: string) {
  const invocation = getCodeCoverageInvocation(targetOrg);
  const { error, stdout } = await runSf(invocation.args, invocation.options);
  if (error) {
    const orgError = new OrgTargetError(ORG_TARGET_ERROR_MESSAGE);
    reportOperationError(orgError);
    throw orgError;
  }

  try {
    const { records } = parseJsonResponse(stdout, 'codeCoverage', parseCodeCoverageResponse);

    for (const coverage of records) {
      const apexClass = contextManager.codeCoverageData.apexClasses?.find(
        (apexClass: ApexClass) => coverage.apexId === apexClass.id
      );
      const numLinesCovered = coverage.coveredLines;
      const numLinesUncovered = coverage.uncoveredLines;
      const totalLines = numLinesCovered + numLinesUncovered;

      if (apexClass) {
        apexClass.totalLines = totalLines;
        apexClass.coveredLines = numLinesCovered;
        if (totalLines === 0) {
          apexClass.codeCoverage = 100;
        } else {
          apexClass.codeCoverage = (numLinesCovered / totalLines) * 100;
        }
      }
    }

    contextManager.codeCoverageData.apexClasses?.forEach((apexClass: ApexClass) => {
      if (apexClass.codeCoverage === undefined) {
        apexClass.codeCoverage = -1;
        apexClass.totalLines = -1;
        apexClass.coveredLines = -1;
      }
    });
  } catch (e: unknown) {
    reportOperationError(e);
    if (e instanceof Error) throw e;
    throw new Error('Unexpected error');
  }
}

export async function clearCodeCoverageRecords(
  targetOrg: string,
  apiVersion: string
): Promise<{
  failedRecords: number;
  failedQueries: number;
}> {
  const result = { failedRecords: 0, failedQueries: 0 };

  const sources = await deleteCoveragePhase('ApexCodeCoverage', targetOrg, apiVersion);
  addPhaseResult(result, sources);
  if (!sources.succeeded) return result;

  const aggregates = await deleteCoveragePhase('ApexCodeCoverageAggregate', targetOrg, apiVersion);
  addPhaseResult(result, aggregates);
  if (!aggregates.succeeded) return result;

  const orgCoverage = await updateOrgCoveragePhase(targetOrg);
  addPhaseResult(result, orgCoverage);
  return result;
}

interface CoveragePhaseResult {
  failedRecords: number;
  failedQueries: number;
  succeeded: boolean;
}

async function deleteCoveragePhase(
  coverageObject: CoverageDeleteObject,
  targetOrg: string,
  apiVersion: string
): Promise<CoveragePhaseResult> {
  const query = await queryCoverageRecordIds(coverageObject, targetOrg);
  if (query.failedQueries > 0) return query;

  const batches = chunk(query.ids, TOOLING_COMPOSITE_BATCH_SIZE);
  const batchFailures = await runWithConcurrency(batches, COVERAGE_COMPOSITE_CONCURRENCY, (ids) =>
    deleteCoverageBatch(coverageObject, ids, targetOrg, apiVersion)
  );
  const failedRecords =
    query.failedRecords + batchFailures.reduce((total, failures) => total + failures, 0);

  return {
    failedRecords,
    failedQueries: 0,
    succeeded: failedRecords === 0,
  };
}

async function deleteCoverageBatch(
  coverageObject: CoverageDeleteObject,
  ids: string[],
  targetOrg: string,
  apiVersion: string
): Promise<number> {
  try {
    const invocation = getDeleteCoverageBatchInvocation(coverageObject, ids, targetOrg, apiVersion);
    const deletion = await runSf(invocation.args, invocation.options);
    if (deletion.error) return ids.length;
    return parseJsonResponse(deletion.stdout, 'compositeMutation', (response) =>
      parseCompositeDeleteResponse(response, ids.length)
    ).failedRecords;
  } catch {
    return ids.length;
  }
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  operation: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  const worker = async (): Promise<void> => {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await operation(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

async function updateOrgCoveragePhase(targetOrg: string): Promise<CoveragePhaseResult> {
  const query = await queryCoverageRecordIds('ApexOrgWideCoverage', targetOrg);
  if (query.failedQueries > 0) return query;

  let failedRecords = query.failedRecords;
  for (const id of query.ids) {
    try {
      const invocation = getUpdateOrgCoverageInvocation(id, targetOrg);
      const update = await runSf(invocation.args, invocation.options);
      if (update.error) failedRecords++;
    } catch {
      failedRecords++;
    }
  }

  return {
    failedRecords,
    failedQueries: 0,
    succeeded: failedRecords === 0,
  };
}

async function queryCoverageRecordIds(
  coverageObject: CoverageQueryObject,
  targetOrg: string
): Promise<CoveragePhaseResult & { ids: string[] }> {
  const invocation = getCoverageRecordIdsInvocation(coverageObject, targetOrg);
  const query = await runSf(invocation.args, invocation.options);
  if (query.error) {
    return { ids: [], failedRecords: 0, failedQueries: 1, succeeded: false };
  }

  try {
    const parsed = parseJsonResponse(
      query.stdout,
      'coverageRecords',
      parseCoverageRecordIdsResponse
    );
    return {
      ids: parsed.ids,
      failedRecords: parsed.discardedRecords,
      failedQueries: 0,
      succeeded: parsed.discardedRecords === 0,
    };
  } catch {
    return { ids: [], failedRecords: 0, failedQueries: 1, succeeded: false };
  }
}

function addPhaseResult(
  result: { failedRecords: number; failedQueries: number },
  phase: CoveragePhaseResult
): void {
  result.failedRecords += phase.failedRecords;
  result.failedQueries += phase.failedQueries;
}

export function runTestClass(
  testClass: ApexTestClass,
  contextManager: ContextManager,
  targetOrg: string,
  cancellationToken: vscode.CancellationToken
): Promise<string[] | undefined> {
  return runTestTarget(
    testClass,
    testClass.name,
    'Test Class',
    { className: testClass.name },
    getTestClassInvocation(testClass.name, targetOrg),
    contextManager,
    cancellationToken,
    (result) => applyClassMethodResults(testClass, result)
  );
}

export function runTestMethod(
  testMethod: ApexTestMethod,
  contextManager: ContextManager,
  targetOrg: string,
  cancellationToken: vscode.CancellationToken
): Promise<string[] | undefined> {
  return runTestTarget(
    testMethod,
    testMethod.fullName,
    'Test Method',
    { className: testMethod.className, methodName: testMethod.name },
    getTestMethodInvocation(testMethod.className, testMethod.name, targetOrg),
    contextManager,
    cancellationToken
  );
}

async function runTestTarget(
  testItem: ApexTestState,
  targetName: string,
  targetType: 'Test Class' | 'Test Method',
  historyTarget: { className: string; methodName?: string },
  invocation: ReturnType<typeof getTestClassInvocation>,
  contextManager: ContextManager,
  cancellationToken: vscode.CancellationToken,
  applyRelatedResults?: (result: CompletedTestExecutionDto) => void
): Promise<string[] | undefined> {
  const message: string[] = [];
  const oldStatus = testItem.status;
  testItem.status = 'Running';
  contextManager.apexTestsData.refresh();

  try {
    const execution = await runSf(invocation.args, invocation.options);
    if (!execution.stdout) {
      throw new OrgTargetError(ORG_TARGET_ERROR_MESSAGE);
    }
    const stdout = execution.stdout;

    const result = parseJsonResponse(stdout, 'testExecution', parseTestExecutionResponse);

    if (cancellationToken.isCancellationRequested) {
      return;
    }

    message.push(`${targetName} result`);

    if (result.kind === 'rejected') {
      message.push('✕ Error running test');
      if (result.name && result.message) {
        showTestResultMessage(
          `Error running ${targetName}: ${result.name} - ${result.message}`,
          MessageType.Error,
          contextManager
        );
        message.push(`${result.name}: ${result.message}`);
      } else {
        showTestResultMessage(
          `Error running ${targetName}: Unexpected error`,
          MessageType.Error,
          contextManager
        );
        message.push(`Unexpected error`);
      }

      testItem.status = oldStatus;
      testItem.executionBlocked = true;
      contextManager.apexTestsData.refresh();

      return message;
    }

    testItem.executionBlocked = false;
    const targetedMethodResult = result.methodResults.find(
      ({ fullName }) => fullName === targetName
    );
    const success =
      targetType === 'Test Method' && targetedMethodResult ?
        targetedMethodResult.outcome === 'Pass'
      : result.outcome === 'Passed';

    if (success) {
      showTestResultMessage(`${targetName} passed.`, MessageType.Info, contextManager);
      testItem.status = 'Passed';
      message.push(`✓ Passed`);
    } else {
      showTestResultMessage(`${targetName} failed.`, MessageType.Error, contextManager);
      testItem.status = 'Failed';
      message.push('✕ Failed');
    }

    testItem.startTime = result.startTime;
    testItem.duration = result.duration;
    applyRelatedResults?.(result);

    const testRun = new TestRun(
      targetName,
      targetType,
      success,
      result.startTime,
      result.duration,
      historyTarget
    );

    contextManager.statusData.pushTestRun(testRun);
    message.push(
      `TestStartTime: ${result.startTimeLabel} | TestExecutionTime: ${result.durationLabel}`
    );

    if (!success) {
      for (const test of result.failedTests) {
        message.push(
          `• ${test.fullName}: ${test.message} - ${test.stackTrace.replace('\n', '\\n')}`
        );
      }
    }

    if (result.coverage) {
      void getCodeCoverage(result.coverage.classes, contextManager);
      contextManager.statusData.orgWideCoverage = result.coverage.orgWideCoverage;
    }

    contextManager.statusData.refresh();
    contextManager.apexTestsData.refresh();

    return message;
  } catch (error) {
    const responseErrorMessage = (error as { message?: string }).message;
    let errorMessage: unknown;
    if (responseErrorMessage) {
      errorMessage = responseErrorMessage;
    } else {
      errorMessage = error;
    }
    vscode.window.showErrorMessage(`Error running ${targetName}: ${errorMessage as string}`);
    testItem.status = undefined;
    contextManager.apexTestsData.refresh();
    contextManager.statusData.refresh();

    return;
  }
}

function applyClassMethodResults(
  testClass: ApexTestClass,
  result: CompletedTestExecutionDto
): void {
  const resultsByName = new Map(result.methodResults.map((method) => [method.fullName, method]));
  for (const method of testClass.methods) {
    const methodResult = resultsByName.get(method.fullName);
    method.status =
      methodResult?.outcome === 'Pass' ? 'Passed'
      : methodResult?.outcome === 'Fail' ? 'Failed'
      : undefined;
    method.startTime = undefined;
    method.duration = undefined;
    method.executionBlocked = false;
  }
}

function getCodeCoverage(
  coverage: TestClassCoverageDto[],
  contextManager: ContextManager
): Promise<void> {
  try {
    for (const coverageItem of coverage) {
      const apexClass = contextManager.codeCoverageData.apexClasses?.find(
        (apexClass: ApexClass) => coverageItem.name === apexClass.name
      );
      if (apexClass) {
        apexClass.totalLines = coverageItem.totalLines;
        apexClass.coveredLines = coverageItem.coveredLines;
        if (coverageItem.totalLines === 0) {
          apexClass.codeCoverage = 100;
        } else {
          apexClass.codeCoverage = (coverageItem.coveredLines / coverageItem.totalLines) * 100;
        }
      }

      contextManager.codeCoverageData.apexClasses?.forEach((apexClass: ApexClass) => {
        if (apexClass.codeCoverage === undefined) {
          apexClass.codeCoverage = -1;
          apexClass.totalLines = -1;
          apexClass.coveredLines = -1;
        }
      });
    }
    contextManager.codeCoverageData.refresh();
    return Promise.resolve();
  } catch (error) {
    return Promise.reject(error as Error);
  }
}

export async function retrieveOrgCoverage(targetOrg: string) {
  const invocation = getOrgCoverageInvocation(targetOrg);
  const { error, stdout } = await runSf(invocation.args, invocation.options);
  if (error) {
    const orgError = new OrgTargetError(ORG_TARGET_ERROR_MESSAGE);
    reportOperationError(orgError);
    throw orgError;
  }

  try {
    return parseJsonResponse(stdout, 'orgCoverage', parseOrgCoverageResponse);
  } catch (e: unknown) {
    reportOperationError(e);
    if (e instanceof Error) throw e;
    throw new Error('Unexpected error');
  }
}

function parseJsonResponse<T>(
  stdout: string,
  operation: Parameters<typeof incompatibleResponseError>[0],
  parser: (response: unknown) => T
): T {
  let response: unknown;
  try {
    response = JSON.parse(stdout) as unknown;
  } catch {
    throw incompatibleResponseError(operation);
  }
  return parser(response);
}

function reportOperationError(error: unknown): void {
  if (error instanceof SfResponseError || error instanceof OrgTargetError) {
    void vscode.window.showErrorMessage(error.message);
  }
}
