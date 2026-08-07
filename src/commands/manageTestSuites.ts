import * as vscode from 'vscode';
import { ApexTestSuite } from '../classes/Apex';
import { getContextManager } from '../common';
import { isValidApexTestSuiteName } from '../common/ApexTestSuiteService';
import { createApexTestSuite, deleteApexTestSuite } from '../common/sfActions';
import { refreshApexTests } from './refresh';

export async function createTestSuiteCommandHandler(): Promise<void> {
  const contextManager = getContextManager();
  const targetOrg = contextManager.statusData.username;
  if (!targetOrg) {
    void vscode.window.showErrorMessage('No default Salesforce org is configured.');
    return;
  }

  const name = await vscode.window.showInputBox({
    prompt: 'Name the Apex test suite',
    placeHolder: 'Regression',
    validateInput: (value) =>
      isValidApexTestSuiteName(value) ? undefined : (
        'Start with a letter and use only letters, numbers, spaces, underscores, or hyphens.'
      ),
  });
  if (!name) {
    return;
  }

  const selection = await vscode.window.showQuickPick(
    (contextManager.apexTestsData.testClasses ?? []).map((testClass) => ({
      label: testClass.name,
      testClass,
    })),
    {
      canPickMany: true,
      placeHolder: 'Select one or more Apex test classes for the suite',
    }
  );
  if (!selection || selection.length === 0) {
    return;
  }

  try {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Creating Apex test suite ${name}...`,
      },
      async () => {
        await createApexTestSuite(
          name,
          selection.map((item) => item.testClass.id),
          targetOrg
        );
        await refreshApexTests();
      }
    );
    void vscode.window.showInformationMessage(`Apex test suite ${name} created.`);
  } catch (error: unknown) {
    reportSuiteError(`Unable to create Apex test suite ${name}`, error);
  }
}

export async function deleteTestSuiteCommandHandler(input?: ApexTestSuite): Promise<void> {
  const contextManager = getContextManager();
  const targetOrg = contextManager.statusData.username;
  if (!targetOrg) {
    void vscode.window.showErrorMessage('No default Salesforce org is configured.');
    return;
  }

  let suite = input instanceof ApexTestSuite ? input : undefined;
  if (!suite) {
    const selection = await vscode.window.showQuickPick(
      (contextManager.apexTestsData.testSuites ?? []).map((candidate) => ({
        label: candidate.name,
        suite: candidate,
      })),
      { placeHolder: 'Select the Apex test suite to delete' }
    );
    suite = selection?.suite;
  }
  if (!suite) {
    return;
  }

  const confirmation = await vscode.window.showWarningMessage(
    `Delete the Apex test suite ${suite.name}? Test classes are not deleted.`,
    { modal: true },
    'Delete Suite'
  );
  if (confirmation !== 'Delete Suite') {
    return;
  }

  try {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Deleting Apex test suite ${suite.name}...`,
      },
      async () => {
        await deleteApexTestSuite(suite.id, targetOrg);
        await refreshApexTests();
      }
    );
    void vscode.window.showInformationMessage(`Apex test suite ${suite.name} deleted.`);
  } catch (error: unknown) {
    reportSuiteError(`Unable to delete Apex test suite ${suite.name}`, error);
  }
}

function reportSuiteError(summary: string, error: unknown): void {
  const detail = error instanceof Error ? error.message : String(error);
  const message = `${summary}: ${detail}`;
  getContextManager().printOutput(message);
  void vscode.window.showErrorMessage(message);
}
