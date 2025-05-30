import * as vscode from 'vscode';

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
            item.tooltip = `${item.label}`;
            return item;
        } else if (this.codeCoverage < 0) {
            item.description = '';
            item.tooltip = `${item.label}`;
        } else {
            item.description = `${this.codeCoverage.toFixed(2)}% (${this.coveredLines}/${this.totalLines})`;
            item.tooltip = `${item.label}\nCode Coverage: ${this.codeCoverage.toFixed(2)}%\nCovered Lines: ${this.coveredLines}/${this.totalLines}`;
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

    constructor(id: string, name: string, status?: string) {
        super(id, name);
        this.status = status;
    }

    getTreeItem(): vscode.TreeItem {
        const item = super.getTreeItem();
        item.iconPath = new vscode.ThemeIcon('play-circle', undefined);
        if (this.status === 'Running') {
            item.iconPath = new vscode.ThemeIcon('sync', undefined);
        } else if (this.status === 'Passed') {
            item.iconPath = new vscode.ThemeIcon('pass', new vscode.ThemeColor('testing.iconPassed'));
        } else if (this.status === 'Failed') {
            item.iconPath = new vscode.ThemeIcon('error', new vscode.ThemeColor('testing.iconFailed'));
        }
        item.command = {
            command: 'salesforce-tests.runTestClass',
            title: 'Run Test Class',
            arguments: [this.name]
        };
        return item;
    }
}