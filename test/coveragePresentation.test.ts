import * as assert from 'assert';
import * as vscode from 'vscode';
import { ApexClass, ApexTestClass } from '../src/classes/Apex';
import { ContextManager } from '../src/common/ContextManager';
import { retrieveCodeCoverage, runTestClass } from '../src/common/sfActions';
import {
  configureFakeSf,
  getFakeSfInvocations,
  resetFakeSf,
  type FakeSfResponse,
} from './support/extensionHarness';

describe('Code coverage presentation', () => {
  beforeEach(async () => {
    await resetFakeSf();
  });

  it('E1 renders percentage, covered lines, and a coherent tooltip with two decimals', () => {
    const apexClass = coverageClass('01p-decimal', 'DecimalCoverage', (2 / 3) * 100, 2, 3);

    const item = apexClass.getTreeItem();

    assert.strictEqual(item.description, '66.67% (2/3)');
    assert.strictEqual(item.tooltip, 'DecimalCoverage\nCode Coverage: 66.67%\nCovered Lines: 2/3');
    assert.strictEqual(themeIcon(item).id, 'file-code');
    assert.strictEqual(themeIcon(item).color?.id, 'testing.iconFailed');
  });

  it('E2 transitions from Loading to the existing failed visual state when no coverage exists', async () => {
    const contextManager = ContextManager.resetInstance();
    const apexClass = new ApexClass('01p-missing', 'NoCoverageClass');
    contextManager.codeCoverageData.apexClasses = [apexClass];
    await configureFakeSf({ codeCoverage: { json: { status: 0, result: {} } } });

    const loadingItem = apexClass.getTreeItem();
    assert.strictEqual(loadingItem.description, 'Loading...');
    assert.strictEqual(loadingItem.tooltip, 'NoCoverageClass');
    assert.strictEqual(themeIcon(loadingItem).color, undefined);

    await retrieveCodeCoverage();

    const missingItem = apexClass.getTreeItem();
    assert.strictEqual(missingItem.description, '');
    assert.strictEqual(missingItem.tooltip, 'NoCoverageClass');
    assert.strictEqual(apexClass.coveredLines, -1);
    assert.strictEqual(apexClass.totalLines, -1);
    assert.strictEqual(themeIcon(missingItem).color?.id, 'testing.iconFailed');
  });

  it('E3 treats a class with no counted lines as fully covered', async () => {
    const contextManager = ContextManager.resetInstance();
    const apexClass = new ApexClass('01p-empty', 'NoCountedLines');
    contextManager.codeCoverageData.apexClasses = [apexClass];
    await configureFakeSf({
      codeCoverage: recordsResponse([
        {
          ApexClassOrTriggerId: '01p-empty',
          NumLinesCovered: 0,
          NumLinesUncovered: 0,
        },
      ]),
    });

    await retrieveCodeCoverage();

    const item = apexClass.getTreeItem();
    assert.strictEqual(apexClass.codeCoverage, 100);
    assert.strictEqual(item.description, '100.00% (0/0)');
    assert.strictEqual(themeIcon(item).color?.id, 'testing.iconPassed');
  });

  it('E4 preserves the failed, warning, and passed bands at both boundaries', () => {
    const cases = [
      { coverage: 50, color: 'testing.iconFailed' },
      { coverage: 74.99, color: 'testing.iconFailed' },
      { coverage: 75, color: 'testing.iconQueued' },
      { coverage: 80, color: 'testing.iconQueued' },
      { coverage: 84.99, color: 'testing.iconQueued' },
      { coverage: 85, color: 'testing.iconPassed' },
      { coverage: 95, color: 'testing.iconPassed' },
    ];

    for (const { coverage, color } of cases) {
      const apexClass = coverageClass('01p-band', 'BandClass', coverage, 1, 1);
      assert.strictEqual(themeIcon(apexClass.getTreeItem()).color?.id, color, `${coverage}%`);
    }
  });

  it('E5 applies coverage from a completed test to included classes and the org', async () => {
    const contextManager = ContextManager.resetInstance();
    const includedClass = new ApexClass('01p-included', 'IncludedClass');
    const untouchedClass = new ApexClass('01p-untouched', 'UntouchedClass');
    contextManager.codeCoverageData.apexClasses = [includedClass, untouchedClass];
    const testClass = new ApexTestClass('01p-test', 'CoverageUpdatingTest');
    contextManager.apexTestsData.testClasses = [testClass];
    await configureFakeSf({
      testRuns: {
        CoverageUpdatingTest: {
          json: {
            status: 0,
            result: {
              summary: {
                outcome: 'Passed',
                testStartTime: '2026-08-18T12:00:00.000Z',
                testExecutionTime: '1250',
              },
              tests: [],
              coverage: {
                coverage: [{ name: 'IncludedClass', totalLines: 8, totalCovered: 6 }],
                summary: { orgWideCoverage: '91%' },
              },
            },
          },
        },
      },
    });
    const cancellation = new vscode.CancellationTokenSource();
    let coverageRefreshes = 0;
    const coverageRefresh = contextManager.codeCoverageData.onDidChangeTreeData(() => {
      coverageRefreshes++;
    });

    try {
      await runTestClass(testClass, contextManager, cancellation.token);
    } finally {
      cancellation.dispose();
      coverageRefresh.dispose();
    }

    assert.strictEqual(includedClass.codeCoverage, 75);
    assert.strictEqual(includedClass.coveredLines, 6);
    assert.strictEqual(includedClass.totalLines, 8);
    assert.strictEqual(untouchedClass.codeCoverage, -1);
    assert.strictEqual(contextManager.statusData.orgWideCoverage, 91);
    assert.strictEqual(getFakeSfInvocations().length, 1);
    assert.strictEqual(coverageRefreshes, 1);
  });
});

function coverageClass(
  id: string,
  name: string,
  coverage: number,
  coveredLines: number,
  totalLines: number
): ApexClass {
  const apexClass = new ApexClass(id, name);
  apexClass.codeCoverage = coverage;
  apexClass.coveredLines = coveredLines;
  apexClass.totalLines = totalLines;
  return apexClass;
}

function themeIcon(item: vscode.TreeItem): vscode.ThemeIcon {
  assert.ok(item.iconPath instanceof vscode.ThemeIcon);
  return item.iconPath;
}

function recordsResponse(records: unknown[]): FakeSfResponse {
  return { json: { status: 0, result: { records } } };
}
