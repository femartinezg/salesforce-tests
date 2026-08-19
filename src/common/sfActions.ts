import * as vscode from 'vscode';
import { getContextManager } from '.';
import { ApexClass, ApexTestClass } from '../classes/Apex';
import { TestRun } from '../classes/TestRun';
import { ContextManager } from './ContextManager';
import { MessageType, showTestResultMessage } from './messaging';
import {
  getApexClassesInvocation,
  getCodeCoverageInvocation,
  getOrgCoverageInvocation,
  getOrgInfoInvocation,
  getTestClassInvocation,
} from './sfCommands';
import {
  incompatibleResponseError,
  parseApexInventoryResponse,
  parseCodeCoverageResponse,
  parseOrgCoverageResponse,
  parseOrgInfoResponse,
  parseTestExecutionResponse,
  SfResponseError,
  type TestClassCoverageDto,
} from './sfResponseParsers';
import { runSf } from './sfRunner';

export async function retrieveOrgInfo(): Promise<{
  status: boolean;
  alias?: string;
  username?: string;
  orgName?: string;
}> {
  const invocation = getOrgInfoInvocation();
  const { error, stdout } = await runSf(invocation.args, invocation.options);
  if (error) return { status: false };

  try {
    const { alias, username, orgName } = parseJsonResponse(stdout, 'org', parseOrgInfoResponse);
    return { status: true, alias, username, orgName };
  } catch (error) {
    reportResponseError(error);
    return { status: false };
  }
}

export async function retrieveApexClasses(): Promise<{
  testClasses: ApexTestClass[];
  apexClasses: ApexClass[];
}> {
  const invocation = getApexClassesInvocation();
  const { error, stdout } = await runSf(invocation.args, invocation.options);
  if (error) throw new Error(String(error));

  try {
    const { records, discardedRecords } = parseJsonResponse(
      stdout,
      'apexInventory',
      parseApexInventoryResponse
    );
    const testClasses = [];
    const apexClasses = [];

    for (const apex of records) {
      const isTest = parseBody(apex.body);
      if (isTest) {
        testClasses.push(new ApexTestClass(apex.id, apex.name));
      } else if (isTest === false) {
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
    reportResponseError(e);
    if (e instanceof Error) throw e;
    throw new Error('Unexpected error');
  }
}

function parseBody(body: string): boolean | undefined {
  const length = body.length;
  let i = 0;
  let inSingleLineComment = false;
  let inMultiLineComment = false;
  let tokenChars: string[] = [];

  const isWordChar = (ch: string) => {
    const code = ch.charCodeAt(0);
    return (
      (code >= 65 && code <= 90) // A-Z
      || (code >= 97 && code <= 122) // a-z
      || (code >= 48 && code <= 57) // 0-9
      || ch === '@'
      || ch === '_'
    );
  };

  while (i < length) {
    const ch = body[i];
    const next = body[i + 1];

    // --- Handle comment entry ---
    if (!inMultiLineComment && !inSingleLineComment && ch === '/' && next === '/') {
      inSingleLineComment = true;
      i += 2;
      continue;
    }
    if (!inMultiLineComment && !inSingleLineComment && ch === '/' && next === '*') {
      inMultiLineComment = true;
      i += 2;
      continue;
    }

    // --- Handle comment exit ---
    if (inSingleLineComment && (ch === '\n' || ch === '\r')) {
      inSingleLineComment = false;
      i++;
      continue;
    }
    if (inMultiLineComment && ch === '*' && next === '/') {
      inMultiLineComment = false;
      i += 2;
      continue;
    }

    // --- Tokenization ---
    if (!inSingleLineComment && !inMultiLineComment) {
      if (isWordChar(ch)) {
        tokenChars.push(ch);
      } else if (tokenChars.length > 0) {
        const lower = tokenChars.join('').toLowerCase();
        if (lower === '@istest') return true;
        if (lower === 'class') return false;
        if (lower === 'interface') return undefined;
        tokenChars = [];
      }
    }

    i++;
  }

  if (tokenChars.length > 0) {
    const lower = tokenChars.join('').toLowerCase();
    if (lower === '@istest') return true;
    if (lower === 'class') return false;
    if (lower === 'interface') return undefined;
  }

  return false;
}

export async function retrieveCodeCoverage() {
  const contextManager = getContextManager();
  const invocation = getCodeCoverageInvocation();
  const { error, stdout } = await runSf(invocation.args, invocation.options);
  if (error) throw new Error(String(error));

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
    reportResponseError(e);
    if (e instanceof Error) throw e;
    throw new Error('Unexpected error');
  }
}

export async function runTestClass(
  testClass: ApexTestClass,
  contextManager: ContextManager,
  cancellationToken: vscode.CancellationToken
): Promise<string[] | undefined> {
  const message: string[] = [];
  const oldStatus = testClass.status;
  testClass.status = 'Running';
  contextManager.apexTestsData.refresh();

  try {
    const invocation = getTestClassInvocation(testClass.name);
    const execution = await runSf(invocation.args, invocation.options);
    if (!execution.stdout) throw execution.error ?? new Error('Salesforce CLI returned no output');
    const stdout = execution.stdout;

    const result = parseJsonResponse(stdout, 'testExecution', parseTestExecutionResponse);

    if (cancellationToken.isCancellationRequested) {
      return;
    }

    message.push(`${testClass.name} result`);

    if (result.kind === 'rejected') {
      message.push('✕ Error running test');
      if (result.name && result.message) {
        showTestResultMessage(
          `Error running ${testClass.name}: ${result.name} - ${result.message}`,
          MessageType.Error,
          contextManager
        );
        message.push(`${result.name}: ${result.message}`);
      } else {
        showTestResultMessage(
          `Error running ${testClass.name}: Unexpected error`,
          MessageType.Error,
          contextManager
        );
        message.push(`Unexpected error`);
      }

      testClass.status = oldStatus;
      testClass.executionBlocked = true;
      contextManager.apexTestsData.refresh();

      return message;
    }

    testClass.executionBlocked = false;
    const success = result.outcome === 'Passed';

    if (success) {
      showTestResultMessage(`${testClass.name} passed.`, MessageType.Info, contextManager);
      testClass.status = 'Passed';
      message.push(`✓ Passed`);
    } else {
      showTestResultMessage(`${testClass.name} failed.`, MessageType.Error, contextManager);
      testClass.status = 'Failed';
      message.push('✕ Failed');
    }

    testClass.startTime = result.startTime;
    testClass.duration = result.duration;

    const testRun = new TestRun(
      testClass.name,
      'Test Class',
      success,
      result.startTime,
      result.duration
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
      void getCodeCoverage(result.coverage.classes);
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
    vscode.window.showErrorMessage(`Error running ${testClass.name}: ${errorMessage as string}`);
    testClass.status = undefined;
    contextManager.apexTestsData.refresh();
    contextManager.statusData.refresh();

    return;
  }
}

function getCodeCoverage(coverage: TestClassCoverageDto[]): Promise<void> {
  try {
    const contextManager = getContextManager();
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

export async function retrieveOrgCoverage() {
  const invocation = getOrgCoverageInvocation();
  const { error, stdout } = await runSf(invocation.args, invocation.options);
  if (error) throw new Error(String(error));

  try {
    return parseJsonResponse(stdout, 'orgCoverage', parseOrgCoverageResponse);
  } catch (e: unknown) {
    reportResponseError(e);
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

function reportResponseError(error: unknown): void {
  if (error instanceof SfResponseError) {
    void vscode.window.showErrorMessage(error.message);
  }
}
