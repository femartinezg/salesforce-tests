import * as vscode from 'vscode';
import { getContextManager } from '../common';
import { ApexTestClass } from '../classes/Apex';
import { ORG_TARGET_ERROR_MESSAGE, runTestClass } from '../common/sfActions';
import { sleep } from '../common/utils';

export async function runTestClassCommandHandler(runTestInput?: unknown) {
  const contextManager = getContextManager();
  const testClasses = contextManager.apexTestsData.testClasses;
  let testClass = undefined;
  let testClassName: string | undefined = undefined;

  if (runTestInput instanceof Object) {
    testClassName = (runTestInput as { label?: string }).label;
  }

  if (!runTestInput) {
    const availableOptions = testClasses?.map((testClass: ApexTestClass) => {
      return testClass.name;
    });
    let options: string[];
    if (availableOptions) {
      options = availableOptions;
    } else {
      options = [];
    }
    testClassName = await vscode.window.showQuickPick(options, {
      placeHolder: 'Select the Apex test class to run',
    });
  }

  testClass = testClasses?.find((testClass: ApexTestClass) => testClass.name === testClassName);

  if (!testClass || testClass.status === 'Running') {
    return;
  }
  const targetOrg = contextManager.targetOrg;
  if (!targetOrg) {
    void vscode.window.showErrorMessage(ORG_TARGET_ERROR_MESSAGE);
    return;
  }

  contextManager.printOutput(`Running test: ${testClass.name}`);

  vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Running ${testClassName}...`,
      cancellable: false,
    },
    async () => {
      let isFinished = false;

      const cancellationToken = new vscode.CancellationTokenSource();
      contextManager.runTestCancelTokens.push(cancellationToken);
      cancellationToken.token.onCancellationRequested(() => {
        isFinished = true;
        cancellationToken?.dispose();
      });

      void runTestClass(testClass, contextManager, targetOrg, cancellationToken.token).then(
        (message) => {
          if (message) contextManager.printOutput(message);
          isFinished = true;
          cancellationToken?.dispose();
          contextManager.runTestCancelTokens.splice(
            contextManager.runTestCancelTokens.indexOf(cancellationToken),
            1
          );
        }
      );

      while (!isFinished) {
        await sleep(200);
      }
    }
  );
}
