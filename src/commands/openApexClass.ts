import * as vscode from 'vscode';
import { ApexClass } from '../classes/Apex';
import { getContextManager } from '../common';

export async function openApexClassCommandHandler(input?: ApexClass): Promise<void> {
  let apexClass = input instanceof ApexClass ? input : undefined;
  if (!apexClass) {
    const selection = await vscode.window.showQuickPick(
      (getContextManager().codeCoverageData.apexClasses ?? []).map((candidate) => ({
        label: candidate.name,
        candidate,
      })),
      { placeHolder: 'Select the local Apex class to open' }
    );
    apexClass = selection?.candidate;
  }
  if (!apexClass) {
    return;
  }

  const matches = await vscode.workspace.findFiles(
    `**/${apexClass.name}.cls`,
    '**/{node_modules,.git,.sf,.sfdx}/**',
    20
  );
  if (matches.length === 0) {
    void vscode.window.showInformationMessage(
      `${apexClass.name}.cls is not present in the current workspace.`
    );
    return;
  }

  let target: vscode.Uri | undefined = matches[0];
  if (matches.length > 1) {
    const selection = await vscode.window.showQuickPick(
      matches.map((uri) => ({
        label: vscode.workspace.asRelativePath(uri),
        uri,
      })),
      { placeHolder: `Select ${apexClass.name}.cls` }
    );
    target = selection?.uri;
  }
  if (target) {
    await vscode.window.showTextDocument(target);
  }
}
