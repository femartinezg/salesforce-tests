import * as vscode from 'vscode';
import { ApexTestClass, ApexTestMethod, ApexTestSuite } from '../classes/Apex';

type ApexTestTreeElement = ApexTestClass | ApexTestMethod | ApexTestSuite | vscode.TreeItem;

export class ApexTestsTreeViewProvider implements vscode.TreeDataProvider<ApexTestTreeElement> {
  private _onDidChangeTreeData: vscode.EventEmitter<ApexTestTreeElement | undefined | void> =
    new vscode.EventEmitter<ApexTestTreeElement | undefined | void>();
  readonly onDidChangeTreeData: vscode.Event<ApexTestTreeElement | undefined | void> =
    this._onDidChangeTreeData.event;

  private _testClasses: ApexTestClass[] | undefined = undefined;
  private _testSuites: ApexTestSuite[] | undefined = undefined;

  get testClasses(): ApexTestClass[] | undefined {
    return this._testClasses;
  }
  set testClasses(value: ApexTestClass[] | undefined) {
    this._testClasses = value;
    this.updateLoadingContext();
  }

  get testSuites(): ApexTestSuite[] | undefined {
    return this._testSuites;
  }
  set testSuites(value: ApexTestSuite[] | undefined) {
    this._testSuites = value;
    this.updateLoadingContext();
  }

  constructor() {
    this.testClasses = undefined;
    this.testSuites = undefined;
  }

  getTreeItem(element: ApexTestTreeElement): vscode.TreeItem {
    return (
        element instanceof ApexTestClass
          || element instanceof ApexTestMethod
          || element instanceof ApexTestSuite
      ) ?
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

    if (this.testClasses === undefined || this.testSuites === undefined) {
      return children;
    }

    if (this.testClasses.length === 0 && this.testSuites.length === 0) {
      const noTestItem = new vscode.TreeItem('No Apex Tests Found');
      noTestItem.iconPath = new vscode.ThemeIcon('warning');
      children.push(noTestItem);
      return children;
    }

    children.push(...this.testSuites, ...this.testClasses);

    return children;
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  reset(): void {
    this.testClasses = undefined;
    this.testSuites = undefined;
  }

  private updateLoadingContext(): void {
    void vscode.commands.executeCommand(
      'setContext',
      'apexTestsLoading',
      this._testClasses === undefined || this._testSuites === undefined
    );
  }
}
