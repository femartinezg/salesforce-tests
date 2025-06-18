import * as vscode from 'vscode';
import { ApexTestClass } from '../classes/Apex';

export class ApexTestsTreeViewProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | undefined | void> =
    new vscode.EventEmitter<vscode.TreeItem | undefined | void>();
  readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined | void> =
    this._onDidChangeTreeData.event;

  private _testClasses: ApexTestClass[] | undefined = undefined;

  get testClasses(): ApexTestClass[] | undefined {
    return this._testClasses;
  }
  set testClasses(value: ApexTestClass[] | undefined) {
    this._testClasses = value;
    if (!value) {
      vscode.commands.executeCommand('setContext', 'apexTestsLoading', true);
    } else {
      vscode.commands.executeCommand('setContext', 'apexTestsLoading', false);
    }
  }

  constructor() {
    this.testClasses = undefined;
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: vscode.TreeItem): Thenable<vscode.TreeItem[]> {
    let children: vscode.TreeItem[] = [];

    if (!element) {
      children = this.getRootChildren();
    }

    return Promise.resolve(children);
  }

  getRootChildren(): vscode.TreeItem[] {
    let children: vscode.TreeItem[] = [];

    if (this.testClasses === undefined) {
      return children;
    }

    if (this.testClasses.length === 0) {
      const noTestItem = new vscode.TreeItem('No Test Classes Found');
      noTestItem.iconPath = new vscode.ThemeIcon('warning');
      children.push(noTestItem);
      return children;
    }

    this.testClasses.map((testClass) => {
      children.push(testClass.getTreeItem());
    });

    return children;
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  reset(): void {
    this.testClasses = undefined;
  }
}
