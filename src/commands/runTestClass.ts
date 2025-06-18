import * as vscode from 'vscode';
import { getContextManager } from '../common';
import { ApexTestClass } from '../classes/Apex';
import { runTestClass } from '../common/sfActions';
import { sleep } from '../common/utils';

export async function runTestClassCommandHandler(runTestInput?: any) {
  const contextManager = getContextManager();
  const testClasses = contextManager.apexTestsData.testClasses;
  let testClass = undefined;
  let testClassName: string | undefined = undefined;

  if (runTestInput instanceof Object) {
    testClassName = runTestInput.label;
  }

  if (!runTestInput) {
    const options =
      testClasses?.map((testClass: ApexTestClass) => {
        return testClass.name;
      }) || [];
    testClassName = await vscode.window.showQuickPick(options, {
      placeHolder: 'Select the Apex test class to run',
    });
  }

  testClass = testClasses?.find((testClass: ApexTestClass) => testClass.name === testClassName);

  if (!testClass || testClass.status === 'Running') {
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

      let cancellationToken = new vscode.CancellationTokenSource();
      contextManager.runTestCancelTokens.push(cancellationToken);
      cancellationToken.token.onCancellationRequested(() => {
        isFinished = true;
        cancellationToken?.dispose();
      });

      runTestClass(testClass, contextManager, cancellationToken.token).then((message) => {
        if (message) contextManager.printOutput(message);
        isFinished = true;
        cancellationToken?.dispose();
        contextManager.runTestCancelTokens.splice(
          contextManager.runTestCancelTokens.indexOf(cancellationToken),
          1
        );
      });

      while (!isFinished) {
        await sleep(200);
      }
    }
  );
}
