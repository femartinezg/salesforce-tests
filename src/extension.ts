import * as vscode from 'vscode';
import { runTestClassCommandHandler }  from './commands/runTestClass';
import { getContextManager, getNewContextManager } from './common';
import { refreshApexTests, refreshCodeCoverage, refreshOrg } from './commands/refresh';
import { findClass, findTest } from './commands/find';

export async function activate(context: vscode.ExtensionContext) {
    registerFileSystemWatchers();
    registerCommands(context);
    const contextManager = getContextManager();
    await contextManager.init();

    const outputChannel = vscode.window.createOutputChannel('Salesforce Tests');
    outputChannel.appendLine('Salesforce Tests extension activated.');
}

export function deactivate() {}

function registerFileSystemWatchers() {
    // Handle change org
    const sfConfigWatcher = vscode.workspace.createFileSystemWatcher('**/.sf/config.json');
    sfConfigWatcher.onDidChange(async () => {
        let contextManager = getContextManager();
        contextManager.runTestCancelTokens.forEach(token => {
            token.cancel();
        });
        contextManager = getNewContextManager();
        await contextManager.init();
    });
}

function registerCommands(context: vscode.ExtensionContext) {
    context.subscriptions.push(vscode.commands.registerCommand(
        'salesforce-tests.runTestClass', 
        (testClass) => runTestClassCommandHandler(testClass)
    ));

    context.subscriptions.push(vscode.commands.registerCommand(
        'salesforce-tests.refreshOrg', 
        () => refreshOrg()
    ));
    context.subscriptions.push(vscode.commands.registerCommand(
        'salesforce-tests.refreshApexTests', 
        () => refreshApexTests()
    ));
    context.subscriptions.push(vscode.commands.registerCommand(
        'salesforce-tests.refreshCodeCoverage', 
        () => refreshCodeCoverage()
    ));

    context.subscriptions.push(vscode.commands.registerCommand(
        'salesforce-tests.findTest', () => findTest()
    ));
    context.subscriptions.push(vscode.commands.registerCommand(
        'salesforce-tests.findClass', () => findClass()
    ));
}
