import assert from 'node:assert/strict';
import * as vscode from 'vscode';

export function run(): Promise<void> {
  const extension = vscode.extensions.getExtension('femartinezg.salesforce-tests');
  assert.ok(extension, 'The Salesforce Tests extension should be installed in the test host.');
  return Promise.resolve();
}
