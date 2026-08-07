import * as vscode from 'vscode';
import { ApexTestClass, ApexTestMethod } from '../classes/Apex';

type ApexTestTreeElement = ApexTestClass | ApexTestMethod | vscode.TreeItem;

export class ApexTestsTreeViewProvider implements vscode.TreeDataProvider<ApexTestTreeElement> {
  private _onDidChangeTreeData: vscode.EventEmitter<ApexTestTreeElement | undefined | void> =
    new vscode.EventEmitter<ApexTestTreeElement | undefined | void>();
  readonly onDidChangeTreeData: vscode.Event<ApexTestTreeElement | undefined | void> =
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

  getTreeItem(element: ApexTestTreeElement): vscode.TreeItem {
    return element instanceof ApexTestClass || element instanceof ApexTestMethod ?
        element.getTreeItem()
      : element;
  }

  getChildren(element?: ApexTestTreeElement): Thenable<ApexTestTreeElement[]> {
    let children: ApexTestTreeElement[] = [];

    if (!element) {
      children = this.getRootChildren();
    } else if (element instanceof ApexTestClass) {
      children = element.methods;
    }

    return Promise.resolve(children);
  }

  getRootChildren(): ApexTestTreeElement[] {
    const children: ApexTestTreeElement[] = [];

    if (this.testClasses === undefined) {
      return children;
    }

    if (this.testClasses.length === 0) {
      const noTestItem = new vscode.TreeItem('No Test Classes Found');
      noTestItem.iconPath = new vscode.ThemeIcon('warning');
      children.push(noTestItem);
      return children;
    }

    children.push(...this.testClasses);

    return children;
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  reset(): void {
    this.testClasses = undefined;
  }
}
