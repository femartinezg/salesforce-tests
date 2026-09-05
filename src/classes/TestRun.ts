import * as vscode from 'vscode';
import { formatDuration } from '../common/utils';

export interface TestRunTarget {
  className: string;
  methodName?: string;
}

export interface TestRunTreeItem extends vscode.TreeItem {
  testRunTarget?: TestRunTarget;
}

export class TestRun {
  public name: string;
  public type: string;
  public success: boolean;
  public startTime: Date;
  public duration: number; // ms
  public target: TestRunTarget;

  constructor(
    name: string,
    type: string,
    success: boolean,
    startTime: Date,
    duration: number,
    target?: TestRunTarget
  ) {
    this.name = name;
    this.type = type;
    this.success = success;
    this.startTime = startTime;
    this.duration = duration;
    this.target = target ?? { className: name };
  }

  getTreeItem(): vscode.TreeItem {
    const treeItem = new vscode.TreeItem(`${this.name}`);
    treeItem.contextValue = 'statusTestRun';
    (treeItem as TestRunTreeItem).testRunTarget = this.target;

    treeItem.iconPath = new vscode.ThemeIcon(this.success ? 'check' : 'x');
    const startTimeString = `${this.startTime.getHours().toString().padStart(2, '0')}:${this.startTime.getMinutes().toString().padStart(2, '0')}:${this.startTime.getSeconds().toString().padStart(2, '0')}`;
    const startDateString = `${this.startTime.getDate().toString().padStart(2, '0')}/${(this.startTime.getMonth() + 1).toString().padStart(2, '0')}/${this.startTime.getFullYear()}`;
    const descriptionTimeString =
      this.startTime.getDate() === new Date().getDate() ?
        startTimeString
      : `${startDateString} ${startTimeString}`;
    treeItem.description = `${descriptionTimeString} (${formatDuration(this.duration)})`;
    const successString = this.success ? '✓' : '✕';
    treeItem.tooltip = `${successString} ${this.name}\nStart Time: ${startDateString} ${startTimeString}\nExecution Time: ${this.duration}ms`;

    return treeItem;
  }
}
