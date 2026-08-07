import assert from 'node:assert/strict';
import * as vscode from 'vscode';

suite('Salesforce Tests extension', () => {
  test('is discoverable by its published identifier', () => {
    const extension = vscode.extensions.getExtension('femartinezg.salesforce-tests');

    assert.ok(extension, 'The Salesforce Tests extension should be installed in the test host.');
  });
});
