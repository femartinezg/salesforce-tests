import * as assert from 'assert';
import * as vscode from 'vscode';
import { ApexClass, ApexTestClass } from '../src/classes/Apex';
import { ContextManager } from '../src/common/ContextManager';
import { retrieveApexClasses } from '../src/common/sfActions';
import { refreshApexTests, refreshCodeCoverage } from '../src/commands/refresh';
import { ApexTestsTreeViewProvider } from '../src/views/ApexTestsTreeViewProvider';
import { CodeCoverageTreeViewProvider } from '../src/views/CodeCoverageTreeViewProvider';
import {
  configureFakeSf,
  getFakeSfInvocations,
  releaseFakeSfGate,
  resetFakeSf,
  waitFor,
  type FakeSfResponse,
} from './support/extensionHarness';

describe('Apex discovery and views', () => {
  beforeEach(async () => {
    await resetFakeSf();
  });

  it('C1 requests unmanaged Apex in name order and separates test and production classes', async () => {
    await configureFakeSf({
      apexClasses: recordsResponse([
        { Id: '01p-alpha', Name: 'AlphaService', Body: 'public class AlphaService {}' },
        { Id: '01p-beta', Name: 'BetaServiceTest', Body: '@isTest class BetaServiceTest {}' },
        { Id: '01p-gamma', Name: 'GammaService', Body: 'public class GammaService {}' },
        { Id: '01p-zeta', Name: 'ZetaServiceTest', Body: '@isTest class ZetaServiceTest {}' },
      ]),
    });

    const result = await retrieveApexClasses();

    assert.deepStrictEqual(
      result.apexClasses.map(({ id, name }) => ({ id, name })),
      [
        { id: '01p-alpha', name: 'AlphaService' },
        { id: '01p-gamma', name: 'GammaService' },
      ]
    );
    assert.deepStrictEqual(
      result.testClasses.map(({ id, name }) => ({ id, name })),
      [
        { id: '01p-beta', name: 'BetaServiceTest' },
        { id: '01p-zeta', name: 'ZetaServiceTest' },
      ]
    );

    const invocation = getFakeSfInvocations()[0].args;
    const query = invocation[invocation.indexOf('--query') + 1];
    assert.match(query, /ManageableState = 'unmanaged'/);
    assert.match(query, /ORDER BY Name ASC/);
  });

  it('C2 classifies case-insensitively, ignores comment tokens, and omits interfaces', async () => {
    await configureFakeSf({
      apexClasses: recordsResponse([
        {
          Id: '01p-production',
          Name: 'ProductionClass',
          Body: '// @isTest\n/* interface Hidden {} */\npublic CLASS ProductionClass {}',
        },
        {
          Id: '01p-test',
          Name: 'MixedCaseTest',
          Body: '/* class Hidden {} */\n@IsTeSt private class MixedCaseTest {}',
        },
        {
          Id: '01p-interface',
          Name: 'IgnoredInterface',
          Body: '// @isTest class Hidden {}\npublic InTeRfAcE IgnoredInterface {}',
        },
      ]),
    });

    const result = await retrieveApexClasses();

    assert.deepStrictEqual(
      result.testClasses.map((item) => item.name),
      ['MixedCaseTest']
    );
    assert.deepStrictEqual(
      result.apexClasses.map((item) => item.name),
      ['ProductionClass']
    );
  });

  it('C3 presents loading, empty, and populated Apex Tests states', () => {
    const provider = new ApexTestsTreeViewProvider();

    assert.deepStrictEqual(provider.getRootChildren(), []);

    provider.testClasses = [];
    const emptyItems = provider.getRootChildren();
    assert.strictEqual(emptyItems.length, 1);
    assert.strictEqual(emptyItems[0].label, 'No Test Classes Found');
    assert.strictEqual((emptyItems[0].iconPath as vscode.ThemeIcon).id, 'warning');

    provider.testClasses = [
      new ApexTestClass('01p-alpha', 'AlphaTest'),
      new ApexTestClass('01p-beta', 'BetaTest'),
    ];
    assert.deepStrictEqual(
      provider.getRootChildren().map((item) => item.label),
      ['AlphaTest', 'BetaTest']
    );
  });

  it('C4 presents loading coverage classes, the empty state, and populated production classes', () => {
    const provider = new CodeCoverageTreeViewProvider();

    assert.deepStrictEqual(provider.getRootChildren(), []);

    provider.apexClasses = [new ApexClass('01p-loading', 'LoadingClass')];
    const loadingItem = provider.getRootChildren()[0];
    assert.strictEqual(loadingItem.label, 'LoadingClass');
    assert.strictEqual(loadingItem.description, 'Loading...');

    provider.apexClasses = [];
    const emptyItem = provider.getRootChildren()[0];
    assert.strictEqual(emptyItem.label, 'No Apex Classes Found');
    assert.strictEqual((emptyItem.iconPath as vscode.ThemeIcon).id, 'warning');

    const alpha = coveredClass('01p-alpha', 'AlphaClass', 90, 9, 10);
    const beta = coveredClass('01p-beta', 'BetaClass', 80, 8, 10);
    provider.apexClasses = [alpha, beta];
    assert.deepStrictEqual(
      provider.getRootChildren().map((item) => item.label),
      ['AlphaClass', 'BetaClass']
    );
  });

  it('C5 clears and replaces only Apex Tests while a focused refresh is pending', async () => {
    const contextManager = ContextManager.resetInstance();
    const oldProductionClass = coveredClass('01p-old', 'ExistingProduction', 90, 9, 10);
    contextManager.apexTestsData.testClasses = [new ApexTestClass('01p-test-old', 'OldTest')];
    contextManager.codeCoverageData.apexClasses = [oldProductionClass];
    await configureFakeSf({
      apexClasses: recordsResponse(
        [
          { Id: '01p-new-test', Name: 'NewTest', Body: '@isTest class NewTest {}' },
          { Id: '01p-new-class', Name: 'NewProduction', Body: 'public class NewProduction {}' },
        ],
        'models-apex'
      ),
    });

    const refresh = refreshApexTests();
    await waitForInvocation('FROM ApexClass');

    assert.strictEqual(contextManager.apexTestsData.testClasses, undefined);
    assert.deepStrictEqual(contextManager.apexTestsData.getRootChildren(), []);
    assert.deepStrictEqual(contextManager.codeCoverageData.apexClasses, [oldProductionClass]);

    await releaseFakeSfGate('models-apex');
    await refresh;

    const refreshedTests = contextManager.apexTestsData.testClasses as ApexTestClass[] | undefined;
    assert.deepStrictEqual(
      refreshedTests?.map((item) => item.name),
      ['NewTest']
    );
    assert.deepStrictEqual(contextManager.codeCoverageData.apexClasses, [oldProductionClass]);
    assert.strictEqual(getFakeSfInvocations().length, 1);
  });

  it('C6 replaces production classes first and refreshes their coverage asynchronously', async () => {
    const contextManager = ContextManager.resetInstance();
    const existingTest = new ApexTestClass('01p-existing-test', 'ExistingTest');
    contextManager.apexTestsData.testClasses = [existingTest];
    contextManager.codeCoverageData.apexClasses = [new ApexClass('01p-old', 'OldProduction')];
    await configureFakeSf({
      apexClasses: recordsResponse([
        { Id: '01p-new-test', Name: 'NewTestIgnoredHere', Body: '@isTest class NewTest {}' },
        { Id: '01p-new-class', Name: 'NewProduction', Body: 'public class NewProduction {}' },
      ]),
      codeCoverage: recordsResponse(
        [
          {
            ApexClassOrTriggerId: '01p-new-class',
            NumLinesCovered: 3,
            NumLinesUncovered: 1,
          },
        ],
        'models-coverage'
      ),
    });

    await refreshCodeCoverage();
    await waitForInvocation('ApexCodeCoverageAggregate');

    assert.deepStrictEqual(contextManager.apexTestsData.testClasses, [existingTest]);
    assert.deepStrictEqual(
      contextManager.codeCoverageData.apexClasses?.map((item) => item.name),
      ['NewProduction']
    );
    assert.strictEqual(
      contextManager.codeCoverageData.getRootChildren()[0].description,
      'Loading...'
    );

    const finalRefresh = nextTreeRefresh(contextManager.codeCoverageData.onDidChangeTreeData);
    await releaseFakeSfGate('models-coverage');
    await finalRefresh;

    const updatedClass = contextManager.codeCoverageData.apexClasses?.[0];
    assert.strictEqual(updatedClass?.codeCoverage, 75);
    assert.strictEqual(updatedClass?.coveredLines, 3);
    assert.strictEqual(updatedClass?.totalLines, 4);
    assert.strictEqual(
      contextManager.codeCoverageData.getRootChildren()[0].description,
      '75.00% (3/4)'
    );
    assert.strictEqual(getFakeSfInvocations().length, 2);
  });
});

function coveredClass(
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

function nextTreeRefresh(event: vscode.Event<vscode.TreeItem | undefined | void>): Promise<void> {
  return new Promise((resolve) => {
    const disposable = event(() => {
      disposable.dispose();
      resolve();
    });
  });
}

function recordsResponse(records: unknown[], gate?: string): FakeSfResponse {
  return {
    json: { status: 0, result: { records } },
    ...(gate ? { gate } : {}),
  };
}

async function waitForInvocation(fragment: string): Promise<void> {
  await waitFor(() =>
    getFakeSfInvocations().some(({ args }) => args.some((argument) => argument.includes(fragment)))
  );
}
