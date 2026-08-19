import { getContextManager, getNewContextManager } from '../common';
import { retrieveApexClasses, retrieveCodeCoverage } from '../common/sfActions';

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
  void retrieveCodeCoverage().then(() => contextManager.codeCoverageData.refresh());
}
