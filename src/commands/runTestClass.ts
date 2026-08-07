import * as vscode from 'vscode';
import { getContextManager } from '../common';
import {
  ApexTestClass,
  ApexTestLevel,
  ApexTestMethod,
  ApexTestSuite,
  ApexTestTarget,
} from '../classes/Apex';
import { TestRun } from '../classes/TestRun';
import { runApexTest } from '../common/sfActions';
import { getTreeItemLabel } from '../common/treeItemLabel';

export async function runTestClassCommandHandler(
  runTestInput?: ApexTestClass | vscode.TreeItem
): Promise<void> {
  const contextManager = getContextManager();
  const testClasses = contextManager.apexTestsData.testClasses;
  let testClassName =
    runTestInput instanceof ApexTestClass ?
      runTestInput.name
    : getTreeItemLabel(runTestInput?.label);

  if (!runTestInput) {
    const options =
      testClasses?.map((testClass: ApexTestClass) => {
        return testClass.name;
      }) ?? [];
    testClassName = await vscode.window.showQuickPick(options, {
      placeHolder: 'Select the Apex test class to run',
    });
  }

  const testClass = testClasses?.find(
    (candidate: ApexTestClass) => candidate.name === testClassName
  );

  if (!testClass) {
    return;
  }

  await runTestTargetCommand(testClass);
}

export async function runTestMethodCommandHandler(runTestInput?: ApexTestMethod): Promise<void> {
  const testClasses = getContextManager().apexTestsData.testClasses ?? [];
  const methods = testClasses.flatMap((testClass) => testClass.methods);
  let testMethod = runTestInput instanceof ApexTestMethod ? runTestInput : undefined;

  if (!testMethod) {
    const selection = await vscode.window.showQuickPick(
      methods.map((method) => ({ label: method.selector, method })),
      { placeHolder: 'Select the Apex test method to run' }
    );
    testMethod = selection?.method;
  }

  if (!testMethod) {
    return;
  }

  await runTestTargetCommand(testMethod);
}

export async function runTestSuiteCommandHandler(runTestInput?: ApexTestSuite): Promise<void> {
  const testSuites = getContextManager().apexTestsData.testSuites ?? [];
  let testSuite = runTestInput instanceof ApexTestSuite ? runTestInput : undefined;

  if (!testSuite) {
    const selection = await vscode.window.showQuickPick(
      testSuites.map((suite) => ({ label: suite.name, suite })),
      { placeHolder: 'Select the Apex test suite to run' }
    );
    testSuite = selection?.suite;
  }

  if (!testSuite) {
    return;
  }

  await runTestTargetCommand(testSuite);
}

export async function rerunTestCommandHandler(testRun?: TestRun): Promise<void> {
  const contextManager = getContextManager();
  const selectedRun = testRun ?? contextManager.statusData.testRuns[0];
  if (!selectedRun) {
    void vscode.window.showInformationMessage('No Apex test run is available to rerun.');
    return;
  }

  const testTarget = findTestTarget(selectedRun);
  if (!testTarget) {
    void vscode.window.showWarningMessage(
      `${selectedRun.name} is no longer available in the current Salesforce org.`
    );
    return;
  }

  await runTestTargetCommand(testTarget);
}

export async function runSelectedTestsCommandHandler(): Promise<void> {
  const testData = getContextManager().apexTestsData;
  const targets: ApexTestTarget[] = [
    ...(testData.testSuites ?? []),
    ...(testData.testClasses ?? []),
    ...(testData.testClasses?.flatMap((testClass) => testClass.methods) ?? []),
  ];
  const selection = await vscode.window.showQuickPick(
    targets.map((target) => ({
      label: target.selector,
      description: target.historyType,
      target,
    })),
    {
      canPickMany: true,
      placeHolder: 'Select Apex tests to run',
    }
  );

  for (const item of selection ?? []) {
    await runTestTargetCommand(item.target);
  }
}

export async function rerunFailedTestsCommandHandler(): Promise<void> {
  const testData = getContextManager().apexTestsData;
  const failedMethods = (testData.testClasses ?? [])
    .flatMap((testClass) => testClass.methods)
    .filter((method) => method.status === 'Failed');
  const failedMethodClasses = new Set(failedMethods.map((method) => method.className));
  const failedClasses = (testData.testClasses ?? []).filter(
    (testClass) => testClass.status === 'Failed' && !failedMethodClasses.has(testClass.name)
  );
  const failedSuites =
    failedMethods.length === 0 && failedClasses.length === 0 ?
      (testData.testSuites ?? []).filter((suite) => suite.status === 'Failed')
    : [];
  const failedTargets: ApexTestTarget[] = [...failedMethods, ...failedClasses, ...failedSuites];

  if (failedTargets.length === 0) {
    void vscode.window.showInformationMessage('There are no failed Apex tests to rerun.');
    return;
  }

  for (const target of failedTargets) {
    await runTestTargetCommand(target);
  }
}

export async function runLocalTestsCommandHandler(): Promise<void> {
  await runTestTargetCommand(new ApexTestLevel('RunLocalTests'));
}

export async function runAllOrgTestsCommandHandler(): Promise<void> {
  await runTestTargetCommand(new ApexTestLevel('RunAllTestsInOrg'));
}

function findTestTarget(testRun: TestRun): ApexTestTarget | undefined {
  const testData = getContextManager().apexTestsData;
  if (testRun.type === 'Test Suite') {
    return testData.testSuites?.find((suite) => suite.name === testRun.name);
  }
  if (testRun.type === 'Test Level') {
    if (testRun.name === 'All Local Tests') {
      return new ApexTestLevel('RunLocalTests');
    }
    if (testRun.name === 'All Tests in Org') {
      return new ApexTestLevel('RunAllTestsInOrg');
    }
  }
  if (testRun.type === 'Test Method') {
    return testData.testClasses
      ?.flatMap((testClass) => testClass.methods)
      .find((method) => method.selector === testRun.name);
  }
  return testData.testClasses?.find((testClass) => testClass.name === testRun.name);
}

async function runTestTargetCommand(testTarget: ApexTestTarget): Promise<void> {
  if (testTarget.status === 'Running') {
    return;
  }

  const contextManager = getContextManager();

  contextManager.printOutput(`Running test: ${testTarget.selector}`);

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Running ${testTarget.selector}...`,
      cancellable: true,
    },
    async (_progress, progressCancellationToken) => {
      const cancellationSource = new vscode.CancellationTokenSource();
      const progressCancellationSubscription = progressCancellationToken.onCancellationRequested(
        () => {
          cancellationSource.cancel();
        }
      );
      contextManager.runTestCancelTokens.push(cancellationSource);

      try {
        const message = await runApexTest(testTarget, contextManager, cancellationSource.token);
        if (message) {
          contextManager.printOutput(message);
        }
      } finally {
        progressCancellationSubscription.dispose();
        const tokenIndex = contextManager.runTestCancelTokens.indexOf(cancellationSource);
        if (tokenIndex >= 0) {
          contextManager.runTestCancelTokens.splice(tokenIndex, 1);
        }
        cancellationSource.dispose();
      }
    }
  );
}
