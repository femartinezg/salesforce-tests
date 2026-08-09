import * as path from 'node:path';
import * as vscode from 'vscode';
import type { ApexTestClass, ApexTestMethod, ApexTestTarget } from '../classes/Apex';
import { findApexTestDeclarations } from '../common/apexTestDeclarations';

export interface ApexTestInventory {
  readonly testClasses: readonly ApexTestClass[] | undefined;
}

export class ApexTestCodeLensProvider implements vscode.CodeLensProvider, vscode.Disposable {
  private readonly changeEmitter = new vscode.EventEmitter<void>();
  public readonly onDidChangeCodeLenses = this.changeEmitter.event;

  constructor(private readonly inventory: ApexTestInventory) {}

  public provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    const extension = path.extname(document.uri.fsPath);
    if (extension.toLowerCase() !== '.cls') {
      return [];
    }

    const localClassName = path.basename(document.uri.fsPath, extension);
    const testClass = this.inventory.testClasses?.find(
      (candidate) => candidate.name.toLowerCase() === localClassName.toLowerCase()
    );
    if (!testClass) {
      return [];
    }

    const methodsByName = new Map(
      testClass.methods.map((method) => [method.name.toLowerCase(), method])
    );
    return findApexTestDeclarations(
      document.getText(),
      testClass.name,
      testClass.methods.map((method) => method.name)
    ).flatMap((declaration) => {
      const target: ApexTestTarget | undefined =
        declaration.kind === 'class' ?
          testClass
        : methodsByName.get(declaration.name.toLowerCase());
      if (!target) {
        return [];
      }

      return [
        new vscode.CodeLens(
          new vscode.Range(
            document.positionAt(declaration.start),
            document.positionAt(declaration.start + declaration.length)
          ),
          createRunCommand(target)
        ),
      ];
    });
  }

  public refresh(): void {
    this.changeEmitter.fire();
  }

  public dispose(): void {
    this.changeEmitter.dispose();
  }
}

function createRunCommand(target: ApexTestTarget): vscode.Command {
  const isMethod = isApexTestMethod(target);
  return {
    command: isMethod ? 'salesforce-tests.runTestMethod' : 'salesforce-tests.runTestClass',
    title: isMethod ? 'Run Apex Test Method' : 'Run Apex Test Class',
    tooltip: `Run ${target.selector} against the current default org`,
    arguments: [target],
  };
}

function isApexTestMethod(target: ApexTestTarget): target is ApexTestMethod {
  return target.historyType === 'Test Method';
}
