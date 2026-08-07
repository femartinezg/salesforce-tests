import * as vscode from 'vscode';
import { getContextManager } from '../common';
import { ApexTestClass, ApexTestMethod, ApexTestTarget } from '../classes/Apex';
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
