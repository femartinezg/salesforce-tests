import * as vscode from 'vscode';
import { runTestClassCommandHandler } from './commands/runTestClass';
import { getContextManager, getNewContextManager } from './common';
import { refreshApexTests, refreshCodeCoverage, refreshOrg } from './commands/refresh';
import { findClass, findTest } from './commands/find';
import { clearTestRuns } from './commands/clearTestRuns';
import { rerunLastTest, rerunTest } from './commands/rerunTest';
import { clearCodeCoverageCommandHandler } from './commands/clearCodeCoverage';

export function activate(context: vscode.ExtensionContext): Promise<void> {
  try {
    registerFileSystemWatchers();
    registerCommands(context);
    const contextManager = getContextManager();
    void contextManager.init();
    contextManager.printOutput('Salesforce Tests extension activated');
    return Promise.resolve();
  } catch (error) {
    return Promise.reject(error as Error);
  }
}

export function deactivate() {
  const contextManager = getContextManager();
  contextManager.printOutput('Salesforce Tests extension deactivated');
}

function registerFileSystemWatchers() {
  // Handle change org
  const sfConfigWatcher = vscode.workspace.createFileSystemWatcher('**/.sf/config.json');
  sfConfigWatcher.onDidChange(async () => {
    let contextManager = getContextManager();
    contextManager.runTestCancelTokens.forEach((token) => {
      token.cancel();
    });
    contextManager = getNewContextManager();
    await contextManager.init();
  });
}

function registerCommands(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand('salesforce-tests.runTestClass', (testClass) =>
      runTestClassCommandHandler(testClass)
    )
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('salesforce-tests.clearTestRuns', () => clearTestRuns())
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('salesforce-tests.rerunTest', (testRun) => rerunTest(testRun))
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('salesforce-tests.rerunLastTest', () => rerunLastTest())
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('salesforce-tests.refreshOrg', () => refreshOrg())
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('salesforce-tests.refreshApexTests', () => refreshApexTests())
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('salesforce-tests.refreshCodeCoverage', () =>
      refreshCodeCoverage()
    )
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('salesforce-tests.clearCodeCoverage', () =>
      clearCodeCoverageCommandHandler()
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('salesforce-tests.findTest', () => findTest())
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('salesforce-tests.findClass', () => findClass())
  );
}
