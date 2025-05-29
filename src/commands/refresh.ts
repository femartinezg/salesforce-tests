import { contextManager } from "../common";
import { retrieveApexClasses, retrieveCodeCoverage } from "../common/sfActions";

export async function refreshOrg() {
    contextManager.reset();
}

export async function refreshApexTests() {
    contextManager.apexTestsData.reset();
    contextManager.apexTestsData.refresh();
    const { testClasses } = await retrieveApexClasses();
    contextManager.apexTestsData.testClasses = testClasses;
    contextManager.apexTestsData.refresh();
}

export async function refreshCodeCoverage() {
    contextManager.codeCoverageData.reset();
    contextManager.codeCoverageData.refresh();
    const { apexClasses } = await retrieveApexClasses();
    contextManager.codeCoverageData.apexClasses = apexClasses;
    contextManager.codeCoverageData.refresh();
    retrieveCodeCoverage().then(() => contextManager.codeCoverageData.refresh());
}