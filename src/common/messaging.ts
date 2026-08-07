import * as vscode from 'vscode';
import type { ContextManager } from './ContextManager';

export enum MessageType {
  Info = 'Info',
  Error = 'Error',
}

export function showTestResultMessage(
  message: string,
  type: MessageType,
  contextManager: Pick<ContextManager, 'displayOutput'>
): void {
  if (!message) {
    return;
  }

  const viewResults = (selection: string | undefined): void => {
    if (selection === 'View Results') {
      contextManager.displayOutput();
    }
  };

  if (type === MessageType.Error) {
    void vscode.window.showErrorMessage(message, 'View Results').then((selection) => {
      viewResults(selection);
    });
    return;
  } else if (type === MessageType.Info) {
    void vscode.window.showInformationMessage(message, 'View Results').then((selection) => {
      viewResults(selection);
    });
    return;
  }
}
