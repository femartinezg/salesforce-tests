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

  const target = await findApexClassSource(apexClass.name);
  if (target) {
    const editor = await vscode.window.showTextDocument(target);
    const firstUncoveredLine = apexClass.uncoveredLineNumbers?.[0];
    if (firstUncoveredLine) {
      const position = new vscode.Position(firstUncoveredLine - 1, 0);
      editor.selection = new vscode.Selection(position, position);
      editor.revealRange(
        new vscode.Range(position, position),
        vscode.TextEditorRevealType.InCenter
      );
    }
  }
}

export async function findApexClassSource(className: string): Promise<vscode.Uri | undefined> {
  const matches = await vscode.workspace.findFiles(
    `**/${className}.cls`,
    '**/{node_modules,.git,.sf,.sfdx}/**',
    20
  );
  if (matches.length === 0) {
    void vscode.window.showInformationMessage(`${className}.cls is not present in the workspace.`);
    return;
  }

  let target: vscode.Uri | undefined = matches[0];
  if (matches.length > 1) {
    const selection = await vscode.window.showQuickPick(
      matches.map((uri) => ({
        label: vscode.workspace.asRelativePath(uri),
        uri,
      })),
      { placeHolder: `Select ${className}.cls` }
    );
    target = selection?.uri;
  }
  return target;
}
