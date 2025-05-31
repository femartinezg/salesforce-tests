import * as vscode from 'vscode';
import { TestRun } from '../classes/TestRun';

export class StatusTreeViewProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | undefined | void> = new vscode.EventEmitter<vscode.TreeItem | undefined | void>();
    readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined | void> = this._onDidChangeTreeData.event;

    private _isAuthenticated?: boolean;
    public alias?: string;
    public username?: string;
    public orgWideCoverage?: number;

    public testRuns: TestRun[] = [];
    
    get isAuthenticated(): boolean | undefined {
        return this._isAuthenticated;
    }
    set isAuthenticated(value: boolean | undefined) {
        this._isAuthenticated = value;
        if (value === undefined) {
            vscode.commands.executeCommand('setContext', 'statusLoading', true);
        } else {
            vscode.commands.executeCommand('setContext', 'statusLoading', false);
        }
    }

    constructor() {
        this.isAuthenticated = undefined;
    }

    getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: vscode.TreeItem): Thenable<vscode.TreeItem[]> {
        let children: vscode.TreeItem[] = [];

        if (!element) {
            children = this.getRootChildren();
        } else if (element.contextValue === 'statusOrg') {
            children = this.getOrgChildren();
        } else if (element.contextValue === 'statusLastTestRuns') {
            children = this.getLastTestRunsChildren();
        }

        return Promise.resolve(children);
    }

    getRootChildren(): vscode.TreeItem[] {
        let children: vscode.TreeItem[] = [];
        let orgItem: vscode.TreeItem;
        let lastTestRunsItem: vscode.TreeItem;

        if (this.isAuthenticated === undefined) {
            return children;
        } else if (this.isAuthenticated === false) {
            orgItem = new vscode.TreeItem('No SF Org');
            orgItem.tooltip = 'Default Salesforce org not found. Please authenticate using the Salesforce CLI to enable Salesforce features in this extension.';
            orgItem.iconPath = new vscode.ThemeIcon('error', new vscode.ThemeColor('errorForeground'));
            orgItem.contextValue = 'statusOrg';
        } else {
            orgItem = new vscode.TreeItem(this.alias || this.username || 'Authenticated');
            orgItem.description = this.username;
            let tooltip = this.alias ? `${this.alias} (${this.username})` : this.username;
            if (this.orgWideCoverage !== undefined) tooltip += `\nOrg Wide Coverage: ${this.orgWideCoverage}%`;
            orgItem.tooltip = tooltip;
            orgItem.iconPath = new vscode.ThemeIcon('cloud');
            orgItem.contextValue = 'statusOrg';
            orgItem.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
        }

        lastTestRunsItem = new vscode.TreeItem('Last Test Runs');
        lastTestRunsItem.iconPath = new vscode.ThemeIcon('activate-breakpoints');
        lastTestRunsItem.contextValue = 'statusLastTestRuns';
        lastTestRunsItem.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;

        children.push(orgItem);
        children.push(lastTestRunsItem);
        return children;
    }

    getOrgChildren(): vscode.TreeItem[] {
        const coverageItem = new vscode.TreeItem('Org Coverage');
        coverageItem.description = 'Loading...';
        coverageItem.iconPath = new vscode.ThemeIcon('arrow-small-right');
        if(this.orgWideCoverage !== undefined) {
            coverageItem.tooltip = `Org Wide Coverage: ${this.orgWideCoverage}%`;
            coverageItem.description = `${this.orgWideCoverage}%`;
        }
        return [coverageItem];
    }

    getLastTestRunsChildren(): vscode.TreeItem[] {
        let children = []

        if(this.testRuns.length === 0) {
            const noTestRunsItem = new vscode.TreeItem('');
            noTestRunsItem.description = 'No test runs yet';
            children.push(noTestRunsItem);
        }
        this.testRuns.map(testRun => {
            children.push(testRun.getTreeItem());
        });

        return children;
    }

    pushTestRun(testRun: TestRun): void {
        if(this.testRuns.length >= 5) {
            this.testRuns.pop();
        }
        this.testRuns.unshift(testRun);
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    reset(): void {
        this.isAuthenticated = undefined;
        this.alias = undefined;
        this.username = undefined;
        this.orgWideCoverage = undefined;
        this.testRuns = [];
    }
}
