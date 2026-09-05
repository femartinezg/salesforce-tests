import * as vscode from 'vscode';
import { getContextManager } from '../common';
import { type ApexTestTreeItem } from '../classes/Apex';
import { ORG_TARGET_ERROR_MESSAGE, runTestMethod } from '../common/sfActions';
import { sleep } from '../common/utils';

interface RunTestMethodInput extends ApexTestTreeItem {
  methodName?: string;
}

export async function runTestMethodCommandHandler(runTestInput?: unknown): Promise<void> {
  const contextManager = getContextManager();
  const testClasses = contextManager.apexTestsData.testClasses;
  const invokedFromPalette = typeof runTestInput !== 'object' || runTestInput === null;
  let testClassName: string | undefined;
  let testMethodName: string | undefined;

  if (typeof runTestInput === 'object' && runTestInput !== null) {
    const input = runTestInput as RunTestMethodInput;
    testClassName = input.testClassName;
    testMethodName = input.testMethodName ?? input.methodName;
  } else {
    testClassName = await vscode.window.showQuickPick(testClasses?.map(({ name }) => name) ?? [], {
      placeHolder: 'Select the Apex test class',
    });
    if (!testClassName) return;

    const selectedClass = testClasses?.find(({ name }) => name === testClassName);
    testMethodName = await vscode.window.showQuickPick(
      selectedClass?.methods.map(({ name }) => name) ?? [],
      { placeHolder: 'Select the Apex test method to run' }
    );
  }

  if (!testClassName || !testMethodName) return;
  const testClass = testClasses?.find(({ name }) => name === testClassName);
  const testMethod = testClass?.methods.find(({ name }) => name === testMethodName);
  if (!testMethod || testMethod.status === 'Running') return;

  const targetOrg = contextManager.targetOrg;
  if (!targetOrg) {
    void vscode.window.showErrorMessage(ORG_TARGET_ERROR_MESSAGE);
    return;
  }

  if (invokedFromPalette) {
    try {
      await contextManager.apexTestsView.reveal(testMethod.getTreeItem(), {
        select: true,
        focus: false,
        expand: false,
      });
    } catch {
      // Revealing the method is optional feedback and must not block a valid test run.
    }
  }

  const fullName = testMethod.fullName;
  contextManager.printOutput(`Running test: ${fullName}`);
  void vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Running ${fullName}...`,
      cancellable: false,
    },
    async () => {
      let isFinished = false;
      const cancellationToken = new vscode.CancellationTokenSource();
      contextManager.runTestCancelTokens.push(cancellationToken);
      cancellationToken.token.onCancellationRequested(() => {
        isFinished = true;
        cancellationToken.dispose();
      });

      void runTestMethod(testMethod, contextManager, targetOrg, cancellationToken.token).then(
        (message) => {
          if (message) contextManager.printOutput(message);
          isFinished = true;
          cancellationToken.dispose();
          const tokenIndex = contextManager.runTestCancelTokens.indexOf(cancellationToken);
          if (tokenIndex >= 0) contextManager.runTestCancelTokens.splice(tokenIndex, 1);
        }
      );

      while (!isFinished) await sleep(200);
    }
  );
}
