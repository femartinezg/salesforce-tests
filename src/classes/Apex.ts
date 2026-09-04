import * as vscode from 'vscode';
import { formatDuration } from '../common/utils';

abstract class Apex {
  public id: string;
  public name: string;

  constructor(id: string, name: string) {
    this.id = id;
    this.name = name;
  }

  getTreeItem(): vscode.TreeItem {
    const item = new vscode.TreeItem(this.name);
    return item;
  }
}

export class ApexClass extends Apex {
  public codeCoverage?: number;
  public totalLines?: number;
  public coveredLines?: number;

  constructor(id: string, name: string) {
    super(id, name);
  }

  getTreeItem(): vscode.TreeItem {
    const item = super.getTreeItem();

    if (this.codeCoverage === undefined) {
      item.iconPath = new vscode.ThemeIcon('file-code', undefined);
      item.description = 'Loading...';
      item.tooltip = `${item.label as string}`;
      return item;
    } else if (this.codeCoverage < 0) {
      item.description = '';
      item.tooltip = `${item.label as string}`;
    } else {
      item.description = `${this.codeCoverage.toFixed(2)}% (${this.coveredLines}/${this.totalLines})`;
      item.tooltip = `${item.label as string}\nCode Coverage: ${this.codeCoverage.toFixed(2)}%\nCovered Lines: ${this.coveredLines}/${this.totalLines}`;
    }

    let color = undefined;
    if (this.codeCoverage < 75) {
      color = new vscode.ThemeColor('testing.iconFailed');
    } else if (this.codeCoverage < 85) {
      color = new vscode.ThemeColor('testing.iconQueued');
    } else {
      color = new vscode.ThemeColor('testing.iconPassed');
    }
    item.iconPath = new vscode.ThemeIcon('file-code', color);

    return item;
  }
}

export class ApexTestClass extends Apex {
  public status: string | undefined;
  public startTime?: Date;
  public duration?: number; // ms
  public executionBlocked: boolean;
  public methods: ApexTestMethod[];

  constructor(id: string, name: string, status?: string) {
    super(id, name);
    this.status = status;
    this.executionBlocked = false;
    this.methods = [];
  }

  getTreeItem(): vscode.TreeItem {
    const item = super.getTreeItem();
    item.id = `apex-test-class:${this.id}`;
    item.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
    const actionableItem = item as ApexTestTreeItem;
    actionableItem.testClassName = this.name;
    applyTestPresentation(item, this);
    return item;
  }
}

export class ApexTestMethod {
  public readonly className: string;
  public readonly name: string;
  public status: string | undefined;
  public startTime?: Date;
  public duration?: number;
  public executionBlocked: boolean;

  constructor(className: string, name: string, status?: string) {
    this.className = className;
    this.name = name;
    this.status = status;
    this.executionBlocked = false;
  }

  get fullName(): string {
    return `${this.className}.${this.name}`;
  }

  getTreeItem(): vscode.TreeItem {
    const item = new vscode.TreeItem(this.name);
    item.id = `apex-test-method:${this.fullName}`;
    item.contextValue = 'apexTestMethod';
    const actionableItem = item as ApexTestTreeItem;
    actionableItem.testClassName = this.className;
    actionableItem.testMethodName = this.name;
    applyTestPresentation(item, this);
    return item;
  }
}

export interface ApexTestTreeItem extends vscode.TreeItem {
  testClassName?: string;
  testMethodName?: string;
}

export interface ApexTestState {
  name: string;
  status: string | undefined;
  startTime?: Date;
  duration?: number;
  executionBlocked: boolean;
}

function applyTestPresentation(item: vscode.TreeItem, test: ApexTestState): void {
  item.iconPath = new vscode.ThemeIcon('circle-large-outline', undefined);
  if (test.status === 'Running') {
    item.iconPath = new vscode.ThemeIcon('sync', undefined);
  } else if (test.status === 'Passed') {
    item.iconPath = new vscode.ThemeIcon('pass', new vscode.ThemeColor('testing.iconPassed'));
  } else if (test.status === 'Failed') {
    item.iconPath = new vscode.ThemeIcon('error', new vscode.ThemeColor('testing.iconFailed'));
  }

  let tooltip = `${test.name}`;
  let description = '';

  if (test.status === 'Passed') {
    tooltip = `✓ ${test.name}`;
  } else if (test.status === 'Failed') {
    tooltip = `✕ ${test.name}`;
  } else if (test.status === 'Running') {
    description = 'Running...';
  }

  if (
    test.startTime
    && test.duration !== undefined
    && test.status !== 'Running'
    && test.status !== undefined
  ) {
    const startTimeString = `${test.startTime.getHours().toString().padStart(2, '0')}:${test.startTime.getMinutes().toString().padStart(2, '0')}:${test.startTime.getSeconds().toString().padStart(2, '0')}`;
    const startDateString = `${test.startTime.getDate().toString().padStart(2, '0')}/${(test.startTime.getMonth() + 1).toString().padStart(2, '0')}/${test.startTime.getFullYear()}`;
    const tooltipTimeString = `${startDateString} ${startTimeString}`;
    tooltip += `\nStart Time: ${tooltipTimeString}\nExecution Time: ${test.duration} ms`;
    description = `${startTimeString} (${formatDuration(test.duration)})`;
    if (test.executionBlocked) {
      tooltip = `${tooltip}\n⚠ Last execution was blocked.`;
      description = `⚠ ${description}`;
    }
  }

  item.tooltip = tooltip;
  item.description = description;
}
