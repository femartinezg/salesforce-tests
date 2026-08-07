import path from 'node:path';
import * as vscode from 'vscode';
import { ApexTestMethod, ApexTestTarget } from '../classes/Apex';
import { getContextManager } from '../common';
import type { ImpactedApexTest } from '../common/ImpactedTestService';
import { retrieveImpactedApexTests } from '../common/sfActions';
import { runTestClassCommandHandler, runTestMethodCommandHandler } from './runTestClass';

export async function runTestsCoveringCurrentClassCommandHandler(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor || path.extname(editor.document.uri.fsPath).toLowerCase() !== '.cls') {
    void vscode.window.showInformationMessage(
      'Open a local Apex class before running covering tests.'
    );
    return;
  }

  const contextManager = getContextManager();
  const targetOrg = contextManager.statusData.username;
  if (!targetOrg) {
    void vscode.window.showErrorMessage('No default Salesforce org is configured.');
    return;
  }

  const apexClassName = path.basename(
    editor.document.uri.fsPath,
    path.extname(editor.document.uri.fsPath)
  );
  let impactedTests: ImpactedApexTest[];
  try {
    impactedTests = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Finding tests that cover ${apexClassName}...`,
      },
      () => retrieveImpactedApexTests(apexClassName, targetOrg)
    );
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    const message = `Unable to find tests covering ${apexClassName}: ${detail}`;
    contextManager.printOutput(message);
    void vscode.window.showErrorMessage(message);
    return;
  }

  const targets = resolveImpactedTargets(impactedTests.map((test) => test.selector));
  if (targets.length === 0) {
    void vscode.window.showInformationMessage(
      `No discovered Apex tests currently cover ${apexClassName}. Run tests to refresh org coverage first.`
    );
    return;
  }

  for (const target of targets) {
    if (target instanceof ApexTestMethod) {
      await runTestMethodCommandHandler(target);
    } else {
      await runTestClassCommandHandler(target);
    }
  }
}

function resolveImpactedTargets(selectors: readonly string[]): ApexTestTarget[] {
  const testClasses = getContextManager().apexTestsData.testClasses ?? [];
  const classByName = new Map(testClasses.map((testClass) => [testClass.name, testClass]));
  const methodBySelector = new Map(
    testClasses.flatMap((testClass) => testClass.methods).map((method) => [method.selector, method])
  );
  const targets = new Map<string, ApexTestTarget>();

  for (const selector of selectors) {
    const method = methodBySelector.get(selector);
    if (method) {
      targets.set(method.selector, method);
      continue;
    }
    const className = selector.split('.', 1)[0];
    const testClass = classByName.get(className);
    if (testClass) {
      targets.set(testClass.selector, testClass);
    }
  }
  return [...targets.values()];
}
