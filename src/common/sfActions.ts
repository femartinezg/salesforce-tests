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
    const result = JSON.parse(stdout);
    const alias = result.result.alias || undefined;
    const username = result.result.username || undefined;
    const orgName = result.result.instanceUrl?.split('//')[1].split('.')[0] || undefined;
    return { status: true, alias: alias, username: username, orgName: orgName };
  } catch {
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
    const result = JSON.parse(stdout);
    const records = result.result.records || [];
    const testClasses = [];
    const apexClasses = [];

    for (const apex of records) {
      const isTest = parseBody(apex.Body);
      if (isTest) {
        testClasses.push(new ApexTestClass(apex.Id, apex.Name));
      } else if (isTest === false) {
        apexClasses.push(new ApexClass(apex.Id, apex.Name));
      }
    }

    return {
      testClasses: testClasses,
      apexClasses: apexClasses,
    };
  } catch (e: unknown) {
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
    const result = JSON.parse(stdout);
    const records = result.result.records || [];

    for (const coverage of records) {
      const apexClass = contextManager.codeCoverageData.apexClasses?.find(
        (apexClass: ApexClass) => coverage.ApexClassOrTriggerId === apexClass.id
      );
      const numLinesCovered = coverage.NumLinesCovered || 0;
      const numLinesUncovered = coverage.NumLinesUncovered || 0;
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

    const result = JSON.parse(stdout);

    if (cancellationToken.isCancellationRequested) {
      return;
    }

    message.push(`${testClass.name} result`);

    if (result.status != 0 && result.status != 100) {
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
    const success = result.result.summary.outcome === 'Passed';
    const coverageResult = result.result.coverage;
    const summary = result.result.summary;
    const tests = result.result.tests;

    if (success) {
      showTestResultMessage(`${testClass.name} passed.`, MessageType.Info, contextManager);
      testClass.status = 'Passed';
      message.push(`✓ Passed`);
    } else {
      showTestResultMessage(`${testClass.name} failed.`, MessageType.Error, contextManager);
      testClass.status = 'Failed';
      message.push('✕ Failed');
    }

    if (summary) {
      testClass.startTime = new Date(summary.testStartTime);
      testClass.duration = parseInt(summary.testExecutionTime);

      const testRun = new TestRun(
        testClass.name,
        'Test Class',
        success,
        new Date(summary.testStartTime),
        parseInt(summary.testExecutionTime)
      );

      contextManager.statusData.pushTestRun(testRun);
      message.push(
        `TestStartTime: ${summary.testStartTime} | TestExecutionTime: ${summary.testExecutionTime}`
      );
    }

    if (!success && tests) {
      for (const test of tests) {
        if (test.Outcome === 'Fail') {
          message.push(
            `• ${test.FullName}: ${test.Message} - ${test.StackTrace.replace('\n', '\\n')}`
          );
        }
      }
    }

    if (coverageResult.coverage) {
      getCodeCoverage(coverageResult.coverage);
    }

    if (coverageResult.summary) {
      contextManager.statusData.orgWideCoverage = parseInt(
        coverageResult.summary.orgWideCoverage.split('%')[0]
      );
    }

    contextManager.statusData.refresh();
    contextManager.apexTestsData.refresh();

    return message;
  } catch (error: any) {
    vscode.window.showErrorMessage(`Error running ${testClass.name}: ${error.message || error}`);
    testClass.status = undefined;
    contextManager.apexTestsData.refresh();
    contextManager.statusData.refresh();

    return;
  }
}

async function getCodeCoverage(coverage: any[]) {
  const contextManager = getContextManager();
  for (const coverageItem of coverage) {
    const apexClass = contextManager.codeCoverageData.apexClasses?.find(
      (apexClass: ApexClass) => coverageItem.name === apexClass.name
    );
    if (apexClass) {
      apexClass.totalLines = coverageItem.totalLines;
      apexClass.coveredLines = coverageItem.totalCovered;
      if (coverageItem.totalLines === 0) {
        apexClass.codeCoverage = 100;
      } else {
        apexClass.codeCoverage = (coverageItem.totalCovered / coverageItem.totalLines) * 100;
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
}

export async function retrieveOrgCoverage() {
  const invocation = getOrgCoverageInvocation();
  const { error, stdout } = await runSf(invocation.args, invocation.options);
  if (error) throw new Error(String(error));

  try {
    const result = JSON.parse(stdout);
    const records = result.result.records || [];
    if (records.length > 0) return records[0].PercentCovered;
    throw new Error('No coverage data found');
  } catch (e: unknown) {
    if (e instanceof Error) throw e;
    throw new Error('Unexpected error');
  }
}
