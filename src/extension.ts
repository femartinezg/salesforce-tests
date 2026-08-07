import * as vscode from 'vscode';
import { runTestClassCommandHandler } from './commands/runTestClass';
import { getContextManager } from './common';
import { ContextManager } from './common/ContextManager';
import { refreshApexTests, refreshCodeCoverage, refreshOrg } from './commands/refresh';
import { findClass, findTest } from './commands/find';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const contextManager = getContextManager();
  registerTreeDataProviders(context, contextManager);
  registerFileSystemWatchers(context, contextManager);
  registerCommands(context);
  context.subscriptions.push(ContextManager.outputChannel);

  try {
    await contextManager.init();
    contextManager.printOutput('Salesforce Tests extension activated');
  } catch (error: unknown) {
    reportInitializationError(contextManager, error);
  }
}

export function deactivate() {
  const contextManager = getContextManager();
  contextManager.printOutput('Salesforce Tests extension deactivated');
}

function registerTreeDataProviders(
  context: vscode.ExtensionContext,
  contextManager: ContextManager
): void {
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('statusTreeView', contextManager.statusData),
    vscode.window.registerTreeDataProvider('apexTestsTreeView', contextManager.apexTestsData),
    vscode.window.registerTreeDataProvider('codeCoverageTreeView', contextManager.codeCoverageData)
  );
}

function registerFileSystemWatchers(
  context: vscode.ExtensionContext,
  contextManager: ContextManager
): void {
  // Handle change org
  const sfConfigWatcher = vscode.workspace.createFileSystemWatcher('**/.sf/config.json');
  const configChangeSubscription = sfConfigWatcher.onDidChange(() => {
    void resetForOrgChange(contextManager);
  });
  context.subscriptions.push(sfConfigWatcher, configChangeSubscription);
}

function registerCommands(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand('salesforce-tests.runTestClass', runTestClassCommandHandler)
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
    vscode.commands.registerCommand('salesforce-tests.findTest', () => findTest())
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('salesforce-tests.findClass', () => findClass())
  );
}

async function resetForOrgChange(contextManager: ContextManager): Promise<void> {
  contextManager.runTestCancelTokens.forEach((token) => {
    token.cancel();
  });

  try {
    await contextManager.reset();
  } catch (error: unknown) {
    reportInitializationError(contextManager, error);
  }
}

function reportInitializationError(contextManager: ContextManager, error: unknown): void {
  const detail = error instanceof Error ? error.message : String(error);
  const message = `Unable to initialize Salesforce Tests: ${detail}`;
  contextManager.printOutput(message);
  void vscode.window.showErrorMessage(message);
}
