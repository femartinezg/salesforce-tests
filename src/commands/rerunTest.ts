import * as vscode from 'vscode';
import { getContextManager } from '../common';
import { runTestClassCommandHandler } from './runTestClass';
import { runTestMethodCommandHandler } from './runTestMethod';
import { type TestRunTarget, type TestRunTreeItem } from '../classes/TestRun';

export async function rerunTest(runInput?: unknown): Promise<void> {
  const target = getTestTarget(runInput);
  if (!target) return;

  const contextManager = getContextManager();
  const testClass = contextManager.apexTestsData.testClasses?.find(
    ({ name }) => name === target.className
  );
  if (!testClass) {
    void vscode.window.showWarningMessage(
      `Test class ${target.className} is not available in Apex Tests. Refresh Apex Tests before rerunning.`
    );
    return;
  }

  if (target.methodName) {
    const testMethod = testClass.methods.find(({ name }) => name === target.methodName);
    if (!testMethod) {
      void vscode.window.showWarningMessage(
        `Test method ${target.className}.${target.methodName} is not available in Apex Tests. Refresh Apex Tests before rerunning.`
      );
      return;
    }
    await runTestMethodCommandHandler({
      testClassName: target.className,
      testMethodName: target.methodName,
    });
    return;
  }
  await runTestClassCommandHandler({ label: testClass.name });
}

export async function rerunLastTest(): Promise<void> {
  const latestRun = getContextManager().statusData.testRuns[0];
  if (!latestRun) return;

  await rerunTest(latestRun);
}

function getTestTarget(runInput: unknown): TestRunTarget | undefined {
  if (typeof runInput !== 'object' || runInput === null) return;

  const structuredTarget =
    (runInput as TestRunTreeItem).testRunTarget ?? (runInput as { target?: TestRunTarget }).target;
  if (isTestRunTarget(structuredTarget)) return structuredTarget;

  const name = (runInput as { name?: unknown }).name;
  if (typeof name === 'string') return { className: name };

  const label = (runInput as { label?: unknown }).label;
  if (typeof label === 'string') return { className: label };
  if (typeof label === 'object' && label !== null) {
    const text = (label as { label?: unknown }).label;
    if (typeof text === 'string') return { className: text };
  }

  return;
}

function isTestRunTarget(value: unknown): value is TestRunTarget {
  if (typeof value !== 'object' || value === null) return false;
  const target = value as { className?: unknown; methodName?: unknown };
  return (
    typeof target.className === 'string'
    && (target.methodName === undefined || typeof target.methodName === 'string')
  );
}
