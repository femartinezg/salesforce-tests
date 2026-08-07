import * as vscode from 'vscode';
import { ApexClass } from '../classes/Apex';
import { sortByActionableCoverage } from '../common/coverageSort';

type CodeCoverageTreeElement = ApexClass | vscode.TreeItem;

export class CodeCoverageTreeViewProvider
  implements vscode.TreeDataProvider<CodeCoverageTreeElement>
{
  private _onDidChangeTreeData: vscode.EventEmitter<CodeCoverageTreeElement | undefined | void> =
    new vscode.EventEmitter<CodeCoverageTreeElement | undefined | void>();
  readonly onDidChangeTreeData: vscode.Event<CodeCoverageTreeElement | undefined | void> =
    this._onDidChangeTreeData.event;

  private _apexClasses: ApexClass[] | undefined = undefined;

  get apexClasses(): ApexClass[] | undefined {
    return this._apexClasses;
  }
  set apexClasses(value: ApexClass[] | undefined) {
    this._apexClasses = value;
    if (!value) {
      vscode.commands.executeCommand('setContext', 'codeCoverageLoading', true);
    } else {
      vscode.commands.executeCommand('setContext', 'codeCoverageLoading', false);
    }
  }

  constructor() {
    this.apexClasses = undefined;
  }

  getTreeItem(element: CodeCoverageTreeElement): vscode.TreeItem {
    return element instanceof ApexClass ? element.getTreeItem() : element;
  }

  getChildren(element?: CodeCoverageTreeElement): Thenable<CodeCoverageTreeElement[]> {
    let children: CodeCoverageTreeElement[] = [];

    if (!element && this.apexClasses) {
      children = this.getRootChildren();
    }

    return Promise.resolve(children);
  }

  getRootChildren(): CodeCoverageTreeElement[] {
    const children: CodeCoverageTreeElement[] = [];

    if (this.apexClasses === undefined) {
      return children;
    }

    if (this.apexClasses.length === 0) {
      const noApexItem = new vscode.TreeItem('No Apex Classes Found');
      noApexItem.iconPath = new vscode.ThemeIcon('warning');
      children.push(noApexItem);
      return children;
    }

    children.push(...sortByActionableCoverage(this.apexClasses));

    return children;
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  reset(): void {
    this.apexClasses = undefined;
  }
}
