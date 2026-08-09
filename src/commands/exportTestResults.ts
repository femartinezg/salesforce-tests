import * as vscode from 'vscode';
import { getContextManager } from '../common';
import {
  serializeTestResultsJson,
  serializeTestResultsJunit,
  type ExportableTestResult,
} from '../common/TestResultExport';

export async function exportTestResultsCommandHandler(): Promise<void> {
  const contextManager = getContextManager();
  const results: ExportableTestResult[] = (contextManager.apexTestsData.testClasses ?? [])
    .flatMap((testClass) => testClass.methods)
    .filter(
      (method): method is typeof method & { status: 'Passed' | 'Failed' } =>
        method.status === 'Passed' || method.status === 'Failed'
    )
    .map((method) => ({
      selector: method.selector,
      status: method.status,
      durationMs: method.duration,
      failureMessage: method.failureMessage,
      failureStackTrace: method.failureStackTrace,
    }))
    .sort((left, right) => left.selector.localeCompare(right.selector));

  if (results.length === 0) {
    void vscode.window.showInformationMessage('Run Apex tests before exporting results.');
    return;
  }

  const format = await vscode.window.showQuickPick(
    [
      { label: 'JUnit XML', extension: 'xml', serialize: serializeTestResultsJunit },
      { label: 'JSON', extension: 'json', serialize: serializeTestResultsJson },
    ],
    { placeHolder: 'Select an Apex test result format' }
  );
  if (!format) {
    return;
  }

  const workspaceUri = vscode.workspace.workspaceFolders?.[0]?.uri;
  const defaultUri =
    workspaceUri ?
      vscode.Uri.joinPath(workspaceUri, `apex-test-results.${format.extension}`)
    : undefined;
  const destination = await vscode.window.showSaveDialog({
    defaultUri,
    filters: { [format.label]: [format.extension] },
    saveLabel: 'Export Apex Test Results',
  });
  if (!destination) {
    return;
  }

  try {
    await vscode.workspace.fs.writeFile(
      destination,
      Buffer.from(format.serialize(results), 'utf8')
    );
    void vscode.window.showInformationMessage(
      `Apex test results exported to ${vscode.workspace.asRelativePath(destination)}.`
    );
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    const message = `Unable to export Apex test results: ${detail}`;
    contextManager.printOutput(message);
    void vscode.window.showErrorMessage(message);
  }
}
