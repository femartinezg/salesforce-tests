import * as vscode from 'vscode';

export function findTest() {
  vscode.commands.executeCommand('apexTestsTreeView.focus');
  vscode.commands.executeCommand('list.find');
}

export function findClass() {
  vscode.commands.executeCommand('codeCoverageTreeView.focus');
  vscode.commands.executeCommand('list.find');
}
