import * as vscode from 'vscode';
import { getContextManager } from '../common';
import { ApexTestClass } from '../classes/Apex';
import { runTestClass } from '../common/sfActions';
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

  if (!testClass || testClass.status === 'Running') {
    return;
  }

  contextManager.printOutput(`Running test: ${testClass.name}`);

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Running ${testClassName}...`,
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
        const message = await runTestClass(testClass, contextManager, cancellationSource.token);
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
