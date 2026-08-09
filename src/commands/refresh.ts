import { getContextManager } from '../common';
import { retrieveApexClasses, retrieveCodeCoverage } from '../common/sfActions';

export async function refreshOrg() {
  const contextManager = getContextManager();
  contextManager.runTestCancelTokens.forEach((token) => {
    token.cancel();
  });
  await contextManager.reset();
}

export async function refreshApexTests() {
  const contextManager = getContextManager();
  contextManager.apexTestsData.reset();
  contextManager.apexTestsData.refresh();
  const targetOrg = contextManager.statusData.username;
  if (!targetOrg) {
    contextManager.apexTestsData.testClasses = [];
    contextManager.apexTestsData.testSuites = [];
    contextManager.apexTestsData.refresh();
    return;
  }
  await contextManager.loadApexInventory(targetOrg, false);
}

export async function refreshCodeCoverage() {
  const contextManager = getContextManager();
  contextManager.codeCoverageData.reset();
  contextManager.codeCoverageData.refresh();
  const targetOrg = contextManager.statusData.username;
  if (!targetOrg) {
    contextManager.codeCoverageData.apexClasses = [];
    contextManager.codeCoverageData.refresh();
    return;
  }
  try {
    const { apexClasses } = await retrieveApexClasses(targetOrg);
    contextManager.codeCoverageData.apexClasses = apexClasses;
    contextManager.codeCoverageData.refresh();
    await retrieveCodeCoverage(targetOrg);
    contextManager.codeCoverageData.refresh();
  } catch (error: unknown) {
    contextManager.codeCoverageData.apexClasses = [];
    contextManager.codeCoverageData.refresh();
    const detail = error instanceof Error ? error.message : String(error);
    contextManager.printOutput(`Unable to refresh code coverage: ${detail}`);
  }
}
