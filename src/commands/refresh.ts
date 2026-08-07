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
  const { testClasses } = await retrieveApexClasses();
  contextManager.apexTestsData.testClasses = testClasses;
  contextManager.apexTestsData.refresh();
}

export async function refreshCodeCoverage() {
  const contextManager = getContextManager();
  contextManager.codeCoverageData.reset();
  contextManager.codeCoverageData.refresh();
  const { apexClasses } = await retrieveApexClasses();
  contextManager.codeCoverageData.apexClasses = apexClasses;
  contextManager.codeCoverageData.refresh();
  await retrieveCodeCoverage();
  contextManager.codeCoverageData.refresh();
}
