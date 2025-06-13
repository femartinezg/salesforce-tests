import * as vscode from 'vscode';

export enum MessageType {
    Info = 'Info',
    Error = 'Error'
}

export function showTestResultMessage(message: string, type: MessageType, contextManager: any) {
    if (!message) {
        return;
    }

    const viewResults = (selection: string | undefined) => {
        if (selection === 'View Results') {
            contextManager.displayOutput();
        }
    }; 

    if (type === MessageType.Error) {
        vscode.window.showErrorMessage(message, 'View Results').then((selection) => {
            viewResults(selection);
        });
        return;
    } else if (type === MessageType.Info) {
        vscode.window.showInformationMessage(message, 'View Results').then((selection) => {
            viewResults(selection);
        });
        return;
    }
}