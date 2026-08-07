import * as vscode from 'vscode';
import { getContextManager } from '.';
import { ApexClass, ApexTestClass } from '../classes/Apex';
import { TestRun } from '../classes/TestRun';
import { ContextManager } from './ContextManager';
import { MessageType, showTestResultMessage } from './messaging';
import { retrieveApexClasses as retrieveApexClassItems } from './ApexClassService';
import { parseApexTestRunResponse, type ApexTestCoverage } from './ApexTestRunParser';
import { retrieveApexClassCoverage, retrieveOrgWideCoverage } from './CoverageService';
import { retrieveDefaultOrgInfo, type OrgInfo } from './OrgService';
import { SfCliClient } from './SfCliClient';
import { buildRunTestClassArgs } from './sfCommandArgs';

const sfCliClient = new SfCliClient();

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

export async function runTestClass(
  testClass: ApexTestClass,
  contextManager: ContextManager,
  cancellationToken: vscode.CancellationToken
): Promise<string[] | undefined> {
  const message: string[] = [];
  const oldStatus = testClass.status;
  testClass.status = 'Running';
  contextManager.apexTestsData.refresh();

  const targetOrg = contextManager.statusData.username;
  if (!targetOrg) {
    testClass.status = oldStatus;
    contextManager.apexTestsData.refresh();
    void vscode.window.showErrorMessage('No default Salesforce org is configured.');
    return;
  }

  try {
    const response = await sfCliClient.runJson<unknown>(
      buildRunTestClassArgs(testClass.name, targetOrg),
      cancellationToken
    );
    const result = parseApexTestRunResponse(response);

    if (cancellationToken.isCancellationRequested) {
      return;
    }

    message.push(`${testClass.name} result`);

    if (result.kind === 'command-error') {
      message.push('✕ Error running test');
      const detail = result.message ?? result.name ?? 'Unexpected error';
      showTestResultMessage(
        `Error running ${testClass.name}: ${detail}`,
        MessageType.Error,
        contextManager
      );
      message.push(detail);

      testClass.status = oldStatus;
      testClass.executionBlocked = true;
      contextManager.apexTestsData.refresh();

      return message;
    }

    testClass.executionBlocked = false;
    const success = result.passed;

    if (success) {
      showTestResultMessage(`${testClass.name} passed.`, MessageType.Info, contextManager);
      testClass.status = 'Passed';
      message.push(`✓ Passed`);
    } else {
      showTestResultMessage(`${testClass.name} failed.`, MessageType.Error, contextManager);
      testClass.status = 'Failed';
      message.push('✕ Failed');
    }

    const startTime = new Date(result.testStartTime);
    testClass.startTime = startTime;
    testClass.duration = result.testExecutionTimeMs;
    contextManager.statusData.pushTestRun(
      new TestRun(testClass.name, 'Test Class', success, startTime, result.testExecutionTimeMs)
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
      void vscode.window.showErrorMessage(`Error running ${testClass.name}: ${detail}`);
    }
    testClass.status = cancellationToken.isCancellationRequested ? oldStatus : undefined;
    contextManager.apexTestsData.refresh();
    contextManager.statusData.refresh();

    return;
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
