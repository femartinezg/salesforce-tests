import * as vscode from 'vscode';
import { getContextManager } from '.';
import {
  ApexClass,
  ApexTestClass,
  ApexTestLevel,
  ApexTestSuite,
  ApexTestTarget,
} from '../classes/Apex';
import { TestRun } from '../classes/TestRun';
import { ContextManager } from './ContextManager';
import { MessageType, showTestResultMessage } from './messaging';
import { retrieveApexClasses as retrieveApexClassItems } from './ApexClassService';
import { type ApexTestCaseResult, type ApexTestCoverage } from './ApexTestRunParser';
import { executeApexTestRun } from './ApexTestRunService';
import { retrieveApexClassCoverage, retrieveOrgWideCoverage } from './CoverageService';
import { retrieveApexTestSuites as retrieveApexTestSuiteItems } from './ApexTestSuiteService';
import { retrieveDefaultOrgInfo, type OrgInfo } from './OrgService';
import { SfCliClient } from './SfCliClient';
import {
  buildRunTestLevelArgs,
  buildRunTestSelectorArgs,
  buildRunTestSuiteArgs,
} from './sfCommandArgs';

const sfCliClient = new SfCliClient();
const sfTestCliClient = new SfCliClient({ timeoutMs: 10 * 60_000 });

export function retrieveOrgInfo(): Promise<OrgInfo> {
  return retrieveDefaultOrgInfo(sfCliClient);
}

export async function retrieveApexClasses(targetOrg: string): Promise<{
  testClasses: ApexTestClass[];
  apexClasses: ApexClass[];
}> {
  const result = await retrieveApexClassItems(sfCliClient, targetOrg);
  return {
    testClasses: result.testClasses.map(
      (item) => new ApexTestClass(item.id, item.name, undefined, item.methods)
    ),
    apexClasses: result.apexClasses.map((item) => new ApexClass(item.id, item.name)),
  };
}

export async function retrieveApexTestSuites(targetOrg: string): Promise<ApexTestSuite[]> {
  return (await retrieveApexTestSuiteItems(sfCliClient, targetOrg)).map(
    (item) => new ApexTestSuite(item.id, item.name)
  );
}

export async function retrieveCodeCoverage(targetOrg: string): Promise<void> {
  const contextManager = getContextManager();
  const coverageByClassId = new Map(
    (await retrieveApexClassCoverage(sfCliClient, targetOrg)).map((coverage) => [
      coverage.classId,
      coverage,
    ])
  );

  contextManager.codeCoverageData.apexClasses?.forEach((apexClass) => {
    const coverage = coverageByClassId.get(apexClass.id);
    if (!coverage) {
      apexClass.codeCoverage = -1;
      apexClass.totalLines = -1;
      apexClass.coveredLines = -1;
      return;
    }

    const totalLines = coverage.coveredLines + coverage.uncoveredLines;
    apexClass.totalLines = totalLines;
    apexClass.coveredLines = coverage.coveredLines;
    apexClass.codeCoverage = totalLines === 0 ? 100 : (coverage.coveredLines / totalLines) * 100;
  });
}

export async function runApexTest(
  testTarget: ApexTestTarget,
  contextManager: ContextManager,
  cancellationToken: vscode.CancellationToken
): Promise<string[] | undefined> {
  const message: string[] = [];
  const oldStatus = testTarget.status;
  testTarget.status = 'Running';
  contextManager.apexTestsData.refresh();

  const targetOrg = contextManager.statusData.username;
  if (!targetOrg) {
    testTarget.status = oldStatus;
    contextManager.apexTestsData.refresh();
    void vscode.window.showErrorMessage('No default Salesforce org is configured.');
    return;
  }

  try {
    const result = await executeApexTestRun(
      sfTestCliClient,
      testTarget instanceof ApexTestLevel ? buildRunTestLevelArgs(testTarget.level, targetOrg)
      : testTarget.runKind === 'suite' ? buildRunTestSuiteArgs(testTarget.selector, targetOrg)
      : buildRunTestSelectorArgs(testTarget.selector, targetOrg),
      targetOrg,
      cancellationToken
    );

    if (cancellationToken.isCancellationRequested) {
      return;
    }

    message.push(`${testTarget.selector} result`);

    if (result.kind === 'command-error') {
      message.push('✕ Error running test');
      const detail = result.message ?? result.name ?? 'Unexpected error';
      showTestResultMessage(
        `Error running ${testTarget.selector}: ${detail}`,
        MessageType.Error,
        contextManager
      );
      message.push(detail);

      testTarget.status = oldStatus;
      testTarget.executionBlocked = true;
      contextManager.apexTestsData.refresh();

      return message;
    }

    testTarget.executionBlocked = false;
    const success = result.passed;

    if (success) {
      showTestResultMessage(`${testTarget.selector} passed.`, MessageType.Info, contextManager);
      testTarget.status = 'Passed';
      message.push(`✓ Passed`);
    } else {
      showTestResultMessage(`${testTarget.selector} failed.`, MessageType.Error, contextManager);
      testTarget.status = 'Failed';
      message.push('✕ Failed');
    }

    const startTime = new Date(result.testStartTime);
    testTarget.startTime = startTime;
    testTarget.duration = result.testExecutionTimeMs;
    applyTestCaseResults(
      result.tests,
      contextManager,
      startTime,
      testTarget.runKind !== 'tests' || testTarget instanceof ApexTestClass
    );
    contextManager.recordTestRun(
      new TestRun(
        testTarget.selector,
        testTarget.historyType,
        success,
        startTime,
        result.testExecutionTimeMs
      )
    );
    message.push(
      `TestStartTime: ${result.testStartTime} | TestExecutionTime: ${result.testExecutionTimeMs}`
    );

    for (const failure of result.failures) {
      const stackTrace = failure.stackTrace?.replace(/\r?\n/g, '\\n');
      message.push(
        `• ${failure.fullName}: ${failure.message}${stackTrace ? ` - ${stackTrace}` : ''}`
      );
    }

    applyTestRunCoverage(result.coverage, contextManager);

    if (result.orgWideCoverage !== undefined) {
      contextManager.statusData.orgWideCoverage = result.orgWideCoverage;
    }

    contextManager.statusData.refresh();
    contextManager.apexTestsData.refresh();

    return message;
  } catch (error: unknown) {
    if (!cancellationToken.isCancellationRequested) {
      const detail = error instanceof Error ? error.message : String(error);
      void vscode.window.showErrorMessage(`Error running ${testTarget.selector}: ${detail}`);
    }
    testTarget.status = cancellationToken.isCancellationRequested ? oldStatus : undefined;
    contextManager.apexTestsData.refresh();
    contextManager.statusData.refresh();

    return;
  }
}

function applyTestCaseResults(
  tests: readonly ApexTestCaseResult[],
  contextManager: ContextManager,
  startTime: Date,
  updateClassSummaries: boolean
): void {
  for (const testClass of contextManager.apexTestsData.testClasses ?? []) {
    const classResults = tests.filter((test) => test.fullName.startsWith(`${testClass.name}.`));
    for (const method of testClass.methods) {
      const result = classResults.find((test) => test.fullName === method.selector);
      if (!result) {
        continue;
      }
      method.status =
        result.outcome === 'Pass' ? 'Passed'
        : result.outcome === 'Fail' ? 'Failed'
        : undefined;
      method.startTime = startTime;
      method.duration = result.runTimeMs;
      method.executionBlocked = false;
    }

    if (updateClassSummaries && classResults.length > 0) {
      testClass.status =
        classResults.some((test) => test.outcome === 'Fail') ? 'Failed'
        : classResults.every((test) => test.outcome === 'Pass') ? 'Passed'
        : undefined;
      testClass.startTime = startTime;
      testClass.duration = classResults.reduce(
        (duration, test) => duration + (test.runTimeMs ?? 0),
        0
      );
      testClass.executionBlocked = false;
    }
  }
}

function applyTestRunCoverage(
  coverage: readonly ApexTestCoverage[],
  contextManager: ContextManager
): void {
  for (const coverageItem of coverage) {
    const apexClass = contextManager.codeCoverageData.apexClasses?.find(
      (candidate) => coverageItem.name === candidate.name
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
  }

  contextManager.codeCoverageData.apexClasses?.forEach((apexClass) => {
    if (apexClass.codeCoverage === undefined) {
      apexClass.codeCoverage = -1;
      apexClass.totalLines = -1;
      apexClass.coveredLines = -1;
    }
  });
  contextManager.codeCoverageData.refresh();
}

export function retrieveOrgCoverage(targetOrg: string): Promise<number> {
  return retrieveOrgWideCoverage(sfCliClient, targetOrg);
}
