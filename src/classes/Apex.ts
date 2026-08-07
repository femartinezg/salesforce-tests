import * as vscode from 'vscode';
import { getCoverageLevel } from '../common/codeCoverage';
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
    const coverage = this.codeCoverage;
    const coverageLevel = getCoverageLevel(coverage);

    if (coverage === undefined) {
      item.iconPath = new vscode.ThemeIcon('file-code', undefined);
      item.description = 'Loading...';
      item.tooltip = this.name;
      return item;
    }

    if (coverageLevel === 'unavailable') {
      item.iconPath = new vscode.ThemeIcon('file-code', undefined);
      item.description = 'N/A';
      item.tooltip = this.name;
      return item;
    }

    item.description = `${coverage.toFixed(2)}% (${this.coveredLines}/${this.totalLines})`;
    item.tooltip = `${this.name}\nCode Coverage: ${coverage.toFixed(2)}%\nCovered Lines: ${this.coveredLines}/${this.totalLines}`;

    let color: vscode.ThemeColor;
    if (coverageLevel === 'belowMinimum') {
      color = new vscode.ThemeColor('testing.iconFailed');
    } else if (coverageLevel === 'warning') {
      color = new vscode.ThemeColor('testing.iconQueued');
    } else {
      color = new vscode.ThemeColor('testing.iconPassed');
    }
    item.iconPath = new vscode.ThemeIcon('file-code', color);

    return item;
  }
}

export abstract class ApexTestTarget extends Apex {
  public status: string | undefined;
  public startTime?: Date;
  public duration?: number; // ms
  public executionBlocked: boolean;

  constructor(id: string, name: string, status?: string) {
    super(id, name);
    this.status = status;
    this.executionBlocked = false;
  }

  public get selector(): string {
    return this.name;
  }

  public abstract readonly historyType: 'Test Class' | 'Test Method' | 'Test Suite';
  public abstract readonly runKind: 'tests' | 'suite';

  getTreeItem(): vscode.TreeItem {
    const item = super.getTreeItem();
    item.iconPath = new vscode.ThemeIcon('circle-large-outline', undefined);
    if (this.status === 'Running') {
      item.iconPath = new vscode.ThemeIcon('sync', undefined);
    } else if (this.status === 'Passed') {
      item.iconPath = new vscode.ThemeIcon('pass', new vscode.ThemeColor('testing.iconPassed'));
    } else if (this.status === 'Failed') {
      item.iconPath = new vscode.ThemeIcon('error', new vscode.ThemeColor('testing.iconFailed'));
    }

    let tooltip = `${this.name}`;
    let description = '';

    if (this.status === 'Passed') {
      tooltip = `✓ ${this.name}`;
    } else if (this.status === 'Failed') {
      tooltip = `✕ ${this.name}`;
    } else if (this.status === 'Running') {
      description = 'Running...';
    }

    if (
      this.startTime
      && this.duration !== undefined
      && this.status !== 'Running'
      && this.status !== undefined
    ) {
      const startTimeString = `${this.startTime.getHours().toString().padStart(2, '0')}:${this.startTime.getMinutes().toString().padStart(2, '0')}:${this.startTime.getSeconds().toString().padStart(2, '0')}`;
      const startDateString = `${this.startTime.getDate().toString().padStart(2, '0')}/${(this.startTime.getMonth() + 1).toString().padStart(2, '0')}/${this.startTime.getFullYear()}`;
      const tooltipTimeString = `${startDateString} ${startTimeString}`;
      tooltip += `\nStart Time: ${tooltipTimeString}\nExecution Time: ${this.duration} ms`;
      description = `${startTimeString} (${formatDuration(this.duration)})`;
    }

    if (this.executionBlocked && this.status !== 'Running') {
      tooltip = `${tooltip}\n⚠ Last execution was blocked.`;
      description = description ? `⚠ ${description}` : '⚠ Blocked';
    }

    item.tooltip = tooltip;
    item.description = description;

    return item;
  }
}

export class ApexTestMethod extends ApexTestTarget {
  public readonly historyType = 'Test Method' as const;
  public readonly runKind = 'tests' as const;

  constructor(
    id: string,
    public readonly className: string,
    name: string,
    status?: string
  ) {
    super(id, name, status);
  }

  public get selector(): string {
    return `${this.className}.${this.name}`;
  }

  getTreeItem(): vscode.TreeItem {
    const item = super.getTreeItem();
    item.contextValue = 'apexTestMethod';
    item.iconPath =
      this.status === undefined ? new vscode.ThemeIcon('symbol-method') : item.iconPath;
    return item;
  }
}

export class ApexTestClass extends ApexTestTarget {
  public readonly historyType = 'Test Class' as const;
  public readonly runKind = 'tests' as const;
  public readonly methods: ApexTestMethod[];

  constructor(id: string, name: string, status?: string, methodNames: readonly string[] = []) {
    super(id, name, status);
    this.methods = methodNames.map(
      (methodName) => new ApexTestMethod(`${id}.${methodName}`, name, methodName)
    );
  }

  getTreeItem(): vscode.TreeItem {
    const item = super.getTreeItem();
    item.contextValue = 'apexTestClass';
    item.collapsibleState =
      this.methods.length > 0 ? vscode.TreeItemCollapsibleState.Collapsed : undefined;
    return item;
  }
}

export class ApexTestSuite extends ApexTestTarget {
  public readonly historyType = 'Test Suite' as const;
  public readonly runKind = 'suite' as const;

  getTreeItem(): vscode.TreeItem {
    const item = super.getTreeItem();
    item.contextValue = 'apexTestSuite';
    if (this.status === undefined) {
      item.iconPath = new vscode.ThemeIcon('beaker');
      item.description = 'Test Suite';
    }
    return item;
  }
}
