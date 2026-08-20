import * as vscode from 'vscode';
import { getContextManager, getNewContextManager } from '../common';
import {
  ORG_TARGET_ERROR_MESSAGE,
  retrieveApexClasses,
  retrieveCodeCoverage,
} from '../common/sfActions';

export function refreshOrg(): Promise<void> {
  try {
    let contextManager = getContextManager();
    contextManager.runTestCancelTokens.forEach((token) => {
      token.cancel();
    });
    contextManager = getNewContextManager();
    void contextManager.init();
    return Promise.resolve();
  } catch (error) {
    return Promise.reject(error as Error);
  }
}

export async function refreshApexTests() {
  const contextManager = getContextManager();
  const targetOrg = contextManager.targetOrg;
  if (!targetOrg) {
    void vscode.window.showErrorMessage(ORG_TARGET_ERROR_MESSAGE);
    return;
  }
  contextManager.apexTestsData.reset();
  contextManager.apexTestsData.refresh();
  const { testClasses } = await retrieveApexClasses(targetOrg);
  contextManager.apexTestsData.testClasses = testClasses;
  contextManager.apexTestsData.refresh();
}

export async function refreshCodeCoverage() {
  const contextManager = getContextManager();
  const targetOrg = contextManager.targetOrg;
  if (!targetOrg) {
    void vscode.window.showErrorMessage(ORG_TARGET_ERROR_MESSAGE);
    return;
  }
  contextManager.codeCoverageData.reset();
  contextManager.codeCoverageData.refresh();
  const { apexClasses } = await retrieveApexClasses(targetOrg);
  contextManager.codeCoverageData.apexClasses = apexClasses;
  contextManager.codeCoverageData.refresh();
  void retrieveCodeCoverage(contextManager, targetOrg)
    .then(() => contextManager.codeCoverageData.refresh())
    .catch(() => undefined);
}
