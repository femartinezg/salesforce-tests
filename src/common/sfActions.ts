import * as vscode from 'vscode';
import { execFile } from 'node:child_process';
import { getContextManager } from '.';
import { ApexClass, ApexTestClass } from '../classes/Apex';
import { TestRun } from '../classes/TestRun';
import { ContextManager } from './ContextManager';
import { MessageType, showTestResultMessage } from './messaging';
import { detectApexClassKind } from './apexSource';
import { retrieveDefaultOrgInfo, type OrgInfo } from './OrgService';
import { SfCliClient } from './SfCliClient';
import { buildRunTestClassArgs } from './sfCommandArgs';

const sfCliClient = new SfCliClient();

export function retrieveOrgInfo(): Promise<OrgInfo> {
  return retrieveDefaultOrgInfo(sfCliClient);
}

export async function retrieveApexClasses(): Promise<{
  testClasses: ApexTestClass[];
  apexClasses: ApexClass[];
}> {
  const { exec } = require('child_process');

  return new Promise((resolve, reject) => {
    const query = `SELECT Id, Name, Body FROM ApexClass WHERE ManageableState = 'unmanaged' ORDER BY Name ASC`;
    const command = `sf data query --query "${query}" --use-tooling-api --json`;

    exec(command, { maxBuffer: 100 * 1024 * 1024 }, (error: any, stdout: string) => {
      if (error) {
        reject(new Error(error));
        return;
      }

      try {
        const result = JSON.parse(stdout);
        const records = result.result.records || [];
        const testClasses = [];
        const apexClasses = [];

        for (let apex of records) {
          const isTest = detectApexClassKind(apex.Body);
          if (isTest) {
            testClasses.push(new ApexTestClass(apex.Id, apex.Name));
          } else if (isTest === false) {
            apexClasses.push(new ApexClass(apex.Id, apex.Name));
          }
        }

        const response = {
          testClasses: testClasses,
          apexClasses: apexClasses,
        };
        resolve(response);
      } catch (e: unknown) {
        if (e instanceof Error) {
          reject(e);
        } else {
          reject(new Error('Unexpected error'));
        }
      }
    });
  });
}

export async function retrieveCodeCoverage() {
  const contextManager = getContextManager();
  const { exec } = require('child_process');

  return new Promise<void>((resolve, reject) => {
    const query = `SELECT Id, ApexClassOrTriggerId, NumLinesCovered, NumLinesUncovered FROM ApexCodeCoverageAggregate`;
    const command = `sf data query --query "${query}" --use-tooling-api --json`;

    exec(command, { maxBuffer: 100 * 1024 * 1024 }, (error: any, stdout: string) => {
      if (error) {
        reject(new Error(error));
        return;
      }

      try {
        const result = JSON.parse(stdout);
        const records = result.result.records || [];

        for (let coverage of records) {
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

        resolve();
      } catch (e: unknown) {
        if (e instanceof Error) {
          reject(e);
        } else {
          reject(new Error('Unexpected error'));
        }
      }
    });
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

export async function retrieveOrgCoverage() {
  const { exec } = require('child_process');

  return new Promise<number>((resolve, reject) => {
    const query = 'SELECT Id, PercentCovered FROM ApexOrgWideCoverage';
    const command = `sf data query --query "${query}" --use-tooling-api --json`;

    exec(command, (error: any, stdout: string) => {
      if (error) {
        reject(new Error(error));
        return;
      }

      try {
        const result = JSON.parse(stdout);
        const records = result.result.records || [];
        if (records.length > 0) {
          resolve(records[0].PercentCovered);
        } else {
          reject(new Error('No coverage data found'));
        }
      } catch (e: unknown) {
        if (e instanceof Error) {
          reject(e);
        } else {
          reject(new Error('Unexpected error'));
        }
      }
    });
  });
}
