import { getContextManager, getNewContextManager } from '../common';
import { retrieveApexClasses, retrieveCodeCoverage } from '../common/sfActions';

export async function refreshOrg() {
  let contextManager = getContextManager();
  contextManager.runTestCancelTokens.forEach((token) => {
    token.cancel();
  });
  contextManager = getNewContextManager();
  contextManager.init();
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
  retrieveCodeCoverage().then(() => contextManager.codeCoverageData.refresh());
}
