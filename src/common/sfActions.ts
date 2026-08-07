import * as vscode from 'vscode';
import { execFile } from 'node:child_process';
import { getContextManager } from '.';
import { ApexClass, ApexTestClass } from '../classes/Apex';
import { TestRun } from '../classes/TestRun';
import { ContextManager } from './ContextManager';
import { MessageType, showTestResultMessage } from './messaging';
import { retrieveApexClasses as retrieveApexClassItems } from './ApexClassService';
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
    testClasses: result.testClasses.map((item) => new ApexTestClass(item.id, item.name)),
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

  const args = buildRunTestClassArgs(testClass.name, contextManager.statusData.username);
  let cancellationSubscription: vscode.Disposable | undefined;

  try {
    const stdout: string = await new Promise((resolve, reject) => {
      const child = execFile('sf', args, { maxBuffer: 100 * 1024 * 1024 }, (error, stdout) => {
        if (cancellationToken.isCancellationRequested) {
          reject(new Error('Apex test run cancelled'));
        } else if (stdout) {
          resolve(stdout);
        } else {
          reject(error ?? new Error('Salesforce CLI returned no output'));
        }
      });

      cancellationSubscription = cancellationToken.onCancellationRequested(() => {
        child.kill();
      });

      if (cancellationToken.isCancellationRequested) {
        child.kill();
      }
    });

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
      for (let test of tests) {
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
  } catch (error: unknown) {
    if (!cancellationToken.isCancellationRequested) {
      const detail = error instanceof Error ? error.message : String(error);
      void vscode.window.showErrorMessage(`Error running ${testClass.name}: ${detail}`);
    }
    testClass.status = cancellationToken.isCancellationRequested ? oldStatus : undefined;
    contextManager.apexTestsData.refresh();
    contextManager.statusData.refresh();

    return;
  } finally {
    cancellationSubscription?.dispose();
  }
}

async function getCodeCoverage(coverage: any[]) {
  const contextManager = getContextManager();
  for (let coverageItem of coverage) {
    let apexClass = contextManager.codeCoverageData.apexClasses?.find(
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

export function retrieveOrgCoverage(targetOrg: string): Promise<number> {
  return retrieveOrgWideCoverage(sfCliClient, targetOrg);
}
