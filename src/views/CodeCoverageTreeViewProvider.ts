import * as vscode from 'vscode';
import { ApexClass } from '../classes/Apex';
import { PinnedClasses } from '../common/PinnedClasses';
import { usePinnedClassIcon } from './pinnedClassTreeItem';

export class CodeCoverageTreeViewProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | undefined | void> =
    new vscode.EventEmitter<vscode.TreeItem | undefined | void>();
  readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined | void> =
    this._onDidChangeTreeData.event;

  private _apexClasses: ApexClass[] | undefined = undefined;
  private readonly pinnedClasses: PinnedClasses;

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

  constructor(pinnedClasses = new PinnedClasses()) {
    this.pinnedClasses = pinnedClasses;
    this.apexClasses = undefined;
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: vscode.TreeItem): Thenable<vscode.TreeItem[]> {
    let children: vscode.TreeItem[] = [];

    if (!element && this.apexClasses) {
      children = this.getRootChildren();
    }

    return Promise.resolve(children);
  }

  getRootChildren(): vscode.TreeItem[] {
    const children: vscode.TreeItem[] = [];

    if (this.apexClasses === undefined) {
      return children;
    }

    if (this.apexClasses.length === 0) {
      const noApexItem = new vscode.TreeItem('No Apex Classes Found');
      noApexItem.iconPath = new vscode.ThemeIcon('warning');
      children.push(noApexItem);
      return children;
    }

    this.pinnedClasses.order('codeCoverage', this.apexClasses).map((apexClass) => {
      const item = apexClass.getTreeItem();
      const isPinned = this.pinnedClasses.isPinned('codeCoverage', apexClass.name);
      item.contextValue = isPinned ? 'pinnedApexCoverageClass' : 'apexCoverageClass';
      if (isPinned) usePinnedClassIcon(item);
      children.push(item);
    });

    return children;
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  reset(): void {
    this.apexClasses = undefined;
  }
}
