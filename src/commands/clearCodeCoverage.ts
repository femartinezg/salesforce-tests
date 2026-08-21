import * as vscode from 'vscode';
import { getContextManager } from '../common';
import {
  clearCodeCoverageRecords,
  ORG_TARGET_ERROR_MESSAGE,
  retrieveApexClasses,
  retrieveCodeCoverage,
  retrieveOrgCoverage,
} from '../common/sfActions';

let isClearingCodeCoverage = false;

export async function clearCodeCoverageCommandHandler(): Promise<void> {
  if (isClearingCodeCoverage) return;

  const contextManager = getContextManager();
  const targetOrg = contextManager.targetOrg;
  const apiVersion = contextManager.targetOrgApiVersion;
  if (!targetOrg || !apiVersion) {
    void vscode.window.showErrorMessage(ORG_TARGET_ERROR_MESSAGE);
    return;
  }

  isClearingCodeCoverage = true;
  await vscode.commands.executeCommand('setContext', 'codeCoverageClearing', true);
  try {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Clearing code coverage...',
        cancellable: false,
      },
      async () => {
        let failedRecords: number | undefined;
        let failedQueries = 0;
        try {
          const result = await clearCodeCoverageRecords(targetOrg, apiVersion);
          failedRecords = result.failedRecords;
          failedQueries = result.failedQueries;
        } catch {
          failedRecords = undefined;
        }

        await refreshCoverage(contextManager, targetOrg);
        reportClearFailure(failedRecords, failedQueries);
      }
    );
  } finally {
    isClearingCodeCoverage = false;
    await vscode.commands.executeCommand('setContext', 'codeCoverageClearing', false);
  }
}

async function refreshCoverage(
  contextManager: ReturnType<typeof getContextManager>,
  targetOrg: string
): Promise<void> {
  if (getContextManager() !== contextManager) return;

  const [codeCoverageResult, orgCoverageResult] = await Promise.allSettled([
    refreshClassCoverage(contextManager, targetOrg),
    retrieveOrgCoverage(targetOrg),
  ]);
  if (getContextManager() !== contextManager) return;

  if (codeCoverageResult.status === 'fulfilled') contextManager.codeCoverageData.refresh();
  if (orgCoverageResult.status === 'fulfilled') {
    contextManager.statusData.orgWideCoverage = orgCoverageResult.value;
    contextManager.statusData.refresh();
  }
}

async function refreshClassCoverage(
  contextManager: ReturnType<typeof getContextManager>,
  targetOrg: string
): Promise<void> {
  const { apexClasses } = await retrieveApexClasses(targetOrg);
  if (getContextManager() !== contextManager) return;

  contextManager.codeCoverageData.apexClasses = apexClasses;
  contextManager.codeCoverageData.refresh();
  await retrieveCodeCoverage(contextManager, targetOrg);
}

function reportClearFailure(failedRecords: number | undefined, failedQueries: number): void {
  if (failedRecords === undefined || failedQueries > 0) {
    void vscode.window.showErrorMessage(
      'Unable to clear code coverage. Coverage was refreshed to show the current org state.'
    );
    return;
  }

  if (failedRecords > 0) {
    const noun = failedRecords === 1 ? 'record' : 'records';
    void vscode.window.showErrorMessage(
      `Unable to clear ${failedRecords} code coverage ${noun}. Coverage was refreshed to show the current org state.`
    );
  }
}
