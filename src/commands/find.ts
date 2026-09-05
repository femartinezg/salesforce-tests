import * as vscode from 'vscode';

export async function findTest(): Promise<void> {
  await vscode.commands.executeCommand('apexTestsTreeView.focus');
  await vscode.commands.executeCommand('list.find');
}

export async function findClass(): Promise<void> {
  await vscode.commands.executeCommand('codeCoverageTreeView.focus');
  await vscode.commands.executeCommand('list.find');
}
