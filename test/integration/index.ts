import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import * as vscode from 'vscode';
import { ApexTestClass } from '../../src/classes/Apex';
import { ApexTestCodeLensProvider } from '../../src/providers/ApexTestCodeLensProvider';

export async function run(): Promise<void> {
  const extension = vscode.extensions.getExtension('femartinezg.salesforce-tests');
  assert.ok(extension, 'The Salesforce Tests extension should be installed in the test host.');

  const temporaryDirectory = await mkdtemp(path.join(tmpdir(), 'salesforce-tests-'));
  try {
    const filePath = path.join(temporaryDirectory, 'CalculatorTest.cls');
    await writeFile(
      filePath,
      '@IsTest private class CalculatorTest { @IsTest static void addsNumbers() {} }'
    );
    const document = await vscode.workspace.openTextDocument(filePath);
    const provider = new ApexTestCodeLensProvider({
      testClasses: [new ApexTestClass('class-id', 'CalculatorTest', undefined, ['addsNumbers'])],
    });
    try {
      const codeLenses = provider.provideCodeLenses(document);
      assert.deepEqual(
        codeLenses.map((codeLens) => codeLens.command?.command),
        ['salesforce-tests.runTestClass', 'salesforce-tests.runTestMethod']
      );
    } finally {
      provider.dispose();
    }
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}
