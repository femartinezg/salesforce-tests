import * as vscode from 'vscode';

export class StatusTreeViewProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | undefined | void> = new vscode.EventEmitter<vscode.TreeItem | undefined | void>();
    readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined | void> = this._onDidChangeTreeData.event;

    private _isAuthenticated?: boolean;
    public alias?: string;
    public username?: string;
    
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
        }

        return Promise.resolve(children);
    }

    getRootChildren(): vscode.TreeItem[] {
        let children: vscode.TreeItem[] = [];
        let orgItem: vscode.TreeItem;

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
            orgItem.iconPath = new vscode.ThemeIcon('cloud');
            orgItem.contextValue = 'statusOrg';
        }

        children.push(orgItem);
        return children;
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    reset(): void {
        this.isAuthenticated = undefined;
        this.alias = undefined;
        this.username = undefined;
    }
}
