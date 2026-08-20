import * as vscode from 'vscode';
import { getContextManager } from '../common';
import { runTestClassCommandHandler } from './runTestClass';

export async function rerunTest(runInput?: unknown): Promise<void> {
  const testClassName = getTestClassName(runInput);
  if (!testClassName) return;

  const contextManager = getContextManager();
  const testClass = contextManager.apexTestsData.testClasses?.find(
    ({ name }) => name === testClassName
  );
  if (!testClass) {
    void vscode.window.showWarningMessage(
      `Test class ${testClassName} is not available in Apex Tests. Refresh Apex Tests before rerunning.`
    );
    return;
  }

  await runTestClassCommandHandler({ label: testClass.name });
}

export async function rerunLastTest(): Promise<void> {
  const latestRun = getContextManager().statusData.testRuns[0];
  if (!latestRun) return;

  await rerunTest(latestRun);
}

function getTestClassName(runInput: unknown): string | undefined {
  if (typeof runInput !== 'object' || runInput === null) return;

  const name = (runInput as { name?: unknown }).name;
  if (typeof name === 'string') return name;

  const label = (runInput as { label?: unknown }).label;
  if (typeof label === 'string') return label;
  if (typeof label === 'object' && label !== null) {
    const text = (label as { label?: unknown }).label;
    if (typeof text === 'string') return text;
  }

  return;
}
