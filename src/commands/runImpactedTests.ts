import path from 'node:path';
import * as vscode from 'vscode';
import { ApexTestMethod, ApexTestTarget } from '../classes/Apex';
import { getContextManager } from '../common';
import { GitClient, retrieveChangedApexComponents } from '../common/GitChangeService';
import type { ImpactedApexTest } from '../common/ImpactedTestService';
import {
  retrieveImpactedApexTests,
  retrieveImpactedApexTestsForComponents,
} from '../common/sfActions';
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

  await runResolvedTargets(targets);
}

export async function runTestsAffectedByChangesCommandHandler(): Promise<void> {
  const contextManager = getContextManager();
  const targetOrg = contextManager.statusData.username;
  if (!targetOrg) {
    void vscode.window.showErrorMessage('No default Salesforce org is configured.');
    return;
  }
  const workspaceFolders = vscode.workspace.workspaceFolders ?? [];
  if (workspaceFolders.length === 0) {
    void vscode.window.showInformationMessage(
      'Open a Git workspace before running affected tests.'
    );
    return;
  }

  let changedComponents: string[];
  try {
    changedComponents = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Finding Apex tests affected by local changes...',
      },
      async () => {
        const gitClient = new GitClient();
        const componentNames = new Set<string>();
        const errors: string[] = [];
        let inspectedFolders = 0;
        for (const folder of workspaceFolders) {
          try {
            for (const name of await retrieveChangedApexComponents(gitClient, folder.uri.fsPath)) {
              componentNames.add(name);
            }
            inspectedFolders += 1;
          } catch (error: unknown) {
            const detail = error instanceof Error ? error.message : String(error);
            errors.push(`${folder.name}: ${detail}`);
          }
        }
        if (inspectedFolders === 0) {
          throw new Error(errors.join('\n'));
        }
        errors.forEach((error) =>
          contextManager.printOutput(`Unable to inspect Git changes: ${error}`)
        );
        return [...componentNames];
      }
    );
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    const message = `Unable to inspect local Apex changes: ${detail}`;
    contextManager.printOutput(message);
    void vscode.window.showErrorMessage(message);
    return;
  }

  if (changedComponents.length === 0) {
    void vscode.window.showInformationMessage('Git reports no changed Apex classes or triggers.');
    return;
  }

  const discoveredTestClasses = new Set(
    (contextManager.apexTestsData.testClasses ?? []).map((testClass) => testClass.name)
  );
  const changedTestClasses = changedComponents.filter((name) => discoveredTestClasses.has(name));
  const sourceComponents = changedComponents.filter((name) => !discoveredTestClasses.has(name));

  let impactedTests: ImpactedApexTest[];
  try {
    impactedTests = await retrieveImpactedApexTestsForComponents(sourceComponents, targetOrg);
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    const message = `Unable to find tests affected by local changes: ${detail}`;
    contextManager.printOutput(message);
    void vscode.window.showErrorMessage(message);
    return;
  }

  const targets = resolveImpactedTargets([
    ...changedTestClasses,
    ...impactedTests.map((test) => test.selector),
  ]);
  if (targets.length === 0) {
    void vscode.window.showInformationMessage(
      'No discovered Apex tests cover the changed components. Coverage may be stale or the changes may not be deployed.'
    );
    return;
  }

  await runResolvedTargets(targets);
}

async function runResolvedTargets(targets: readonly ApexTestTarget[]): Promise<void> {
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
