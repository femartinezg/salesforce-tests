import * as assert from 'assert';
import * as vscode from 'vscode';
import { ApexClass, ApexTestClass, ApexTestMethod } from '../src/classes/Apex';
import { getContextManager, getNewContextManager } from '../src/common';
import {
  activateExtension,
  getFakeSfInvocations,
  resetFakeSf,
  waitFor,
} from './support/extensionHarness';

describe('Pinned classes', () => {
  before(async () => {
    await resetFakeSf();
    await activateExtension();
    await waitFor(() => getContextManager().apexTestsData.testClasses !== undefined);
  });

  beforeEach(async () => {
    await resetFakeSf();
    await clearPinnedClasses();
  });

  afterEach(async () => {
    await clearPinnedClasses();
    const contextManager = getNewContextManager();
    contextManager.statusData.isAuthenticated = false;
    contextManager.apexTestsData.testClasses = [];
    contextManager.codeCoverageData.apexClasses = [];
  });

  it("G1 pins newest-first without disturbing each panel's normal unpinned order", async () => {
    const contextManager = getNewContextManager();
    contextManager.apexTestsData.testClasses = testClasses('AlphaTest', 'BetaTest', 'GammaTest');
    contextManager.codeCoverageData.apexClasses = apexClasses(
      'AlphaService',
      'BetaService',
      'GammaService'
    );

    await pin(contextManager.apexTestsData.getRootChildren(), 'BetaTest');
    assert.deepStrictEqual(labels(contextManager.apexTestsData.getRootChildren()), [
      'BetaTest',
      'AlphaTest',
      'GammaTest',
    ]);

    await pin(contextManager.apexTestsData.getRootChildren(), 'GammaTest');
    assert.deepStrictEqual(labels(contextManager.apexTestsData.getRootChildren()), [
      'GammaTest',
      'BetaTest',
      'AlphaTest',
    ]);

    await pin(contextManager.codeCoverageData.getRootChildren(), 'BetaService');
    await pin(contextManager.codeCoverageData.getRootChildren(), 'AlphaService');
    assert.deepStrictEqual(labels(contextManager.codeCoverageData.getRootChildren()), [
      'AlphaService',
      'BetaService',
      'GammaService',
    ]);
    assert.deepStrictEqual(labels(contextManager.apexTestsData.getRootChildren()), [
      'GammaTest',
      'BetaTest',
      'AlphaTest',
    ]);

    await unpin(contextManager.apexTestsData.getRootChildren(), 'GammaTest');
    assert.deepStrictEqual(labels(contextManager.apexTestsData.getRootChildren()), [
      'BetaTest',
      'AlphaTest',
      'GammaTest',
    ]);
    assert.deepStrictEqual(getFakeSfInvocations(), []);
  });

  it('G2 persists panel-specific pins across org changes and hides absent classes without forgetting them', async () => {
    const firstOrg = getNewContextManager();
    firstOrg.apexTestsData.testClasses = testClasses('AlphaTest', 'BetaTest', 'GammaTest');
    firstOrg.codeCoverageData.apexClasses = apexClasses(
      'AlphaService',
      'BetaService',
      'GammaService'
    );
    await pin(firstOrg.apexTestsData.getRootChildren(), 'BetaTest');
    await pin(firstOrg.apexTestsData.getRootChildren(), 'GammaTest');
    await pin(firstOrg.codeCoverageData.getRootChildren(), 'BetaService');

    const secondOrg = getNewContextManager();
    secondOrg.apexTestsData.testClasses = testClasses('AlphaTest', 'BetaTest');
    secondOrg.codeCoverageData.apexClasses = apexClasses('AlphaService', 'GammaService');
    assert.deepStrictEqual(labels(secondOrg.apexTestsData.getRootChildren()), [
      'BetaTest',
      'AlphaTest',
    ]);
    assert.deepStrictEqual(labels(secondOrg.codeCoverageData.getRootChildren()), [
      'AlphaService',
      'GammaService',
    ]);

    const returningOrg = getNewContextManager();
    returningOrg.apexTestsData.testClasses = [
      new ApexTestClass('new-alpha-id', 'AlphaTest'),
      new ApexTestClass('new-beta-id', 'BetaTest'),
      new ApexTestClass('new-gamma-id', 'GammaTest'),
    ];
    returningOrg.codeCoverageData.apexClasses = [
      new ApexClass('new-alpha-id', 'AlphaService'),
      new ApexClass('new-beta-id', 'BetaService'),
      new ApexClass('new-gamma-id', 'GammaService'),
    ];
    assert.deepStrictEqual(labels(returningOrg.apexTestsData.getRootChildren()), [
      'GammaTest',
      'BetaTest',
      'AlphaTest',
    ]);
    assert.deepStrictEqual(labels(returningOrg.codeCoverageData.getRootChildren()), [
      'BetaService',
      'AlphaService',
      'GammaService',
    ]);
    assert.deepStrictEqual(getFakeSfInvocations(), []);
  });

  it('G3 marks visible rows with the context needed to swap their contextual action immediately', async () => {
    const contextManager = getNewContextManager();
    contextManager.apexTestsData.testClasses = testClasses('AlphaTest', 'BetaTest');
    contextManager.codeCoverageData.apexClasses = apexClasses('AlphaService', 'BetaService');

    assert.deepStrictEqual(contextValues(contextManager.apexTestsData.getRootChildren()), [
      'apexTestClass',
      'apexTestClass',
    ]);
    assert.deepStrictEqual(contextValues(contextManager.codeCoverageData.getRootChildren()), [
      'apexCoverageClass',
      'apexCoverageClass',
    ]);

    await pin(contextManager.apexTestsData.getRootChildren(), 'BetaTest');
    await pin(contextManager.codeCoverageData.getRootChildren(), 'BetaService');
    assert.deepStrictEqual(contextValues(contextManager.apexTestsData.getRootChildren()), [
      'pinnedApexTestClass',
      'apexTestClass',
    ]);
    assert.deepStrictEqual(contextValues(contextManager.codeCoverageData.getRootChildren()), [
      'pinnedApexCoverageClass',
      'apexCoverageClass',
    ]);

    await unpin(contextManager.apexTestsData.getRootChildren(), 'BetaTest');
    await unpin(contextManager.codeCoverageData.getRootChildren(), 'BetaService');
    assert.deepStrictEqual(contextValues(contextManager.apexTestsData.getRootChildren()), [
      'apexTestClass',
      'apexTestClass',
    ]);
    assert.deepStrictEqual(contextValues(contextManager.codeCoverageData.getRootChildren()), [
      'apexCoverageClass',
      'apexCoverageClass',
    ]);
    assert.deepStrictEqual(getFakeSfInvocations(), []);
  });

  it('G4 gives Running priority over a pinned class icon and restores the pin afterwards', async () => {
    const contextManager = getNewContextManager();
    const passingTest = new ApexTestClass('passing-test', 'PassingTest', 'Passed');
    const failingTest = new ApexTestClass('failing-test', 'FailingTest', 'Failed');
    const uncoveredClass = apexClassWithCoverage('UncoveredService', 50);
    const coveredClass = apexClassWithCoverage('CoveredService', 90);
    contextManager.apexTestsData.testClasses = [passingTest, failingTest];
    contextManager.codeCoverageData.apexClasses = [uncoveredClass, coveredClass];

    const testColors = iconColorsByLabel(contextManager.apexTestsData.getRootChildren());
    const coverageColors = iconColorsByLabel(contextManager.codeCoverageData.getRootChildren());
    await pin(contextManager.apexTestsData.getRootChildren(), 'PassingTest');
    await pin(contextManager.apexTestsData.getRootChildren(), 'FailingTest');
    await pin(contextManager.codeCoverageData.getRootChildren(), 'UncoveredService');
    await pin(contextManager.codeCoverageData.getRootChildren(), 'CoveredService');

    for (const item of contextManager.apexTestsData.getRootChildren()) {
      assertPinnedIcon(item, testColors.get(item.label as string));
    }
    for (const item of contextManager.codeCoverageData.getRootChildren()) {
      assertPinnedIcon(item, coverageColors.get(item.label as string));
    }

    passingTest.status = 'Running';
    const runningPinnedTest = itemWithLabel(
      contextManager.apexTestsData.getRootChildren(),
      'PassingTest'
    );
    assert.strictEqual(getThemeIcon(runningPinnedTest).id, 'sync');
    assert.strictEqual(runningPinnedTest.description, 'Running...');

    passingTest.status = 'Passed';
    assertPinnedIcon(
      itemWithLabel(contextManager.apexTestsData.getRootChildren(), 'PassingTest'),
      testColors.get('PassingTest')
    );

    await unpin(contextManager.apexTestsData.getRootChildren(), 'PassingTest');
    const unpinnedTest = itemWithLabel(
      contextManager.apexTestsData.getRootChildren(),
      'PassingTest'
    );
    const unpinnedIcon = getThemeIcon(unpinnedTest);
    assert.strictEqual(unpinnedIcon.id, 'pass');
    assert.strictEqual(unpinnedIcon.color?.id, testColors.get('PassingTest'));
    assert.deepStrictEqual(getFakeSfInvocations(), []);
  });

  it('G5 pins methods newest-first inside their class without moving, pinning, or expanding the parent', async () => {
    const contextManager = getNewContextManager();
    const alphaTest = testClassWithMethods('AlphaTest', [
      ['alpha', undefined],
      ['beta', 'Passed'],
      ['gamma', 'Failed'],
    ]);
    contextManager.apexTestsData.testClasses = [
      alphaTest,
      testClassWithMethods('BetaTest', [['onlyMethod', undefined]]),
    ];

    const parent = itemWithLabel(contextManager.apexTestsData.getRootChildren(), 'AlphaTest');
    assert.strictEqual(parent.collapsibleState, vscode.TreeItemCollapsibleState.Collapsed);
    await pinMethod(await contextManager.apexTestsData.getChildren(parent), 'beta');
    assert.deepStrictEqual(labels(contextManager.apexTestsData.getRootChildren()), [
      'AlphaTest',
      'BetaTest',
    ]);
    assert.strictEqual(
      itemWithLabel(contextManager.apexTestsData.getRootChildren(), 'AlphaTest').contextValue,
      'apexTestClass'
    );

    let methods = await contextManager.apexTestsData.getChildren(parent);
    assert.deepStrictEqual(labels(methods), ['beta', 'alpha', 'gamma']);
    assert.deepStrictEqual(contextValues(methods), [
      'pinnedApexTestMethod',
      'apexTestMethod',
      'apexTestMethod',
    ]);
    assertPinnedIcon(itemWithLabel(methods, 'beta'), 'testing.iconPassed');

    alphaTest.methods.find(({ name }) => name === 'beta')!.status = 'Running';
    methods = await contextManager.apexTestsData.getChildren(parent);
    const runningPinnedMethod = itemWithLabel(methods, 'beta');
    assert.strictEqual(getThemeIcon(runningPinnedMethod).id, 'sync');
    assert.strictEqual(runningPinnedMethod.description, 'Running...');

    alphaTest.methods.find(({ name }) => name === 'beta')!.status = 'Passed';
    methods = await contextManager.apexTestsData.getChildren(parent);
    assertPinnedIcon(itemWithLabel(methods, 'beta'), 'testing.iconPassed');

    await pinMethod(methods, 'gamma');
    methods = await contextManager.apexTestsData.getChildren(parent);
    assert.deepStrictEqual(labels(methods), ['gamma', 'beta', 'alpha']);
    assertPinnedIcon(itemWithLabel(methods, 'gamma'), 'testing.iconFailed');

    await unpinMethod(methods, 'gamma');
    methods = await contextManager.apexTestsData.getChildren(parent);
    assert.deepStrictEqual(labels(methods), ['beta', 'alpha', 'gamma']);
    assert.deepStrictEqual(getFakeSfInvocations(), []);
  });

  it('G6 persists method pins across org changes, hides absent methods, and preserves class pins', async () => {
    const firstOrg = getNewContextManager();
    firstOrg.apexTestsData.testClasses = [
      testClassWithMethods('AlphaTest', [
        ['alpha', undefined],
        ['beta', undefined],
        ['gamma', undefined],
      ]),
      testClassWithMethods('BetaTest', [['onlyMethod', undefined]]),
    ];
    await pin(firstOrg.apexTestsData.getRootChildren(), 'BetaTest');
    const firstParent = itemWithLabel(firstOrg.apexTestsData.getRootChildren(), 'AlphaTest');
    await pinMethod(await firstOrg.apexTestsData.getChildren(firstParent), 'beta');
    await pinMethod(await firstOrg.apexTestsData.getChildren(firstParent), 'gamma');

    const secondOrg = getNewContextManager();
    secondOrg.apexTestsData.testClasses = [
      testClassWithMethods('AlphaTest', [
        ['alpha', undefined],
        ['beta', undefined],
      ]),
      testClassWithMethods('BetaTest', [['otherMethod', undefined]]),
    ];
    assert.deepStrictEqual(labels(secondOrg.apexTestsData.getRootChildren()), [
      'BetaTest',
      'AlphaTest',
    ]);
    const secondParent = itemWithLabel(secondOrg.apexTestsData.getRootChildren(), 'AlphaTest');
    assert.deepStrictEqual(labels(await secondOrg.apexTestsData.getChildren(secondParent)), [
      'beta',
      'alpha',
    ]);

    const returningOrg = getNewContextManager();
    returningOrg.apexTestsData.testClasses = [
      testClassWithMethods('AlphaTest', [
        ['alpha', undefined],
        ['beta', undefined],
        ['gamma', undefined],
      ]),
      testClassWithMethods('BetaTest', [['onlyMethod', undefined]]),
    ];
    assert.deepStrictEqual(labels(returningOrg.apexTestsData.getRootChildren()), [
      'BetaTest',
      'AlphaTest',
    ]);
    const returningParent = itemWithLabel(
      returningOrg.apexTestsData.getRootChildren(),
      'AlphaTest'
    );
    assert.deepStrictEqual(labels(await returningOrg.apexTestsData.getChildren(returningParent)), [
      'gamma',
      'beta',
      'alpha',
    ]);
    assert.deepStrictEqual(getFakeSfInvocations(), []);
  });
});

async function clearPinnedClasses(): Promise<void> {
  const contextManager = getContextManager();
  contextManager.apexTestsData.testClasses = testClasses('AlphaTest', 'BetaTest', 'GammaTest');
  contextManager.codeCoverageData.apexClasses = apexClasses(
    'AlphaService',
    'BetaService',
    'GammaService'
  );
  for (const item of contextManager.apexTestsData.getRootChildren()) {
    await vscode.commands.executeCommand('salesforce-tests.unpinClass', item);
  }
  for (const item of contextManager.codeCoverageData.getRootChildren()) {
    await vscode.commands.executeCommand('salesforce-tests.unpinClass', item);
  }

  const registeredCommands = await vscode.commands.getCommands(true);
  if (!registeredCommands.includes('salesforce-tests.unpinTestMethod')) return;
  for (const className of ['AlphaTest', 'MethodPinCleanupTest']) {
    const methodClass = testClassWithMethods(className, [
      ['alpha', undefined],
      ['beta', undefined],
      ['gamma', undefined],
    ]);
    contextManager.apexTestsData.testClasses = [methodClass];
    const parent = contextManager.apexTestsData.getRootChildren()[0];
    for (const item of await contextManager.apexTestsData.getChildren(parent)) {
      await vscode.commands.executeCommand('salesforce-tests.unpinTestMethod', item);
    }
  }
}

async function pin(items: vscode.TreeItem[], label: string): Promise<void> {
  await vscode.commands.executeCommand('salesforce-tests.pinClass', itemWithLabel(items, label));
}

async function unpin(items: vscode.TreeItem[], label: string): Promise<void> {
  await vscode.commands.executeCommand('salesforce-tests.unpinClass', itemWithLabel(items, label));
}

async function pinMethod(items: vscode.TreeItem[], label: string): Promise<void> {
  await vscode.commands.executeCommand(
    'salesforce-tests.pinTestMethod',
    itemWithLabel(items, label)
  );
}

async function unpinMethod(items: vscode.TreeItem[], label: string): Promise<void> {
  await vscode.commands.executeCommand(
    'salesforce-tests.unpinTestMethod',
    itemWithLabel(items, label)
  );
}

function itemWithLabel(items: vscode.TreeItem[], label: string): vscode.TreeItem {
  const item = items.find((candidate) => candidate.label === label);
  assert.ok(item, `Expected a tree item named ${label}`);
  return item;
}

function labels(items: vscode.TreeItem[]): unknown[] {
  return items.map((item) => item.label);
}

function contextValues(items: vscode.TreeItem[]): (string | undefined)[] {
  return items.map((item) => item.contextValue);
}

function iconColorsByLabel(items: vscode.TreeItem[]): Map<string, string | undefined> {
  return new Map(
    items.map((item) => [item.label as string, getThemeIcon(item).color?.id] as const)
  );
}

function assertPinnedIcon(item: vscode.TreeItem, expectedColor: string | undefined): void {
  const icon = getThemeIcon(item);
  assert.strictEqual(icon.id, 'pinned');
  assert.strictEqual(icon.color?.id, expectedColor);
}

function getThemeIcon(item: vscode.TreeItem): vscode.ThemeIcon {
  assert.ok(item.iconPath instanceof vscode.ThemeIcon);
  return item.iconPath;
}

function testClasses(...names: string[]): ApexTestClass[] {
  return names.map((name, index) => new ApexTestClass(`test-${index}`, name));
}

function testClassWithMethods(
  className: string,
  methods: [name: string, status: string | undefined][]
): ApexTestClass {
  const testClass = new ApexTestClass(`test-${className}`, className);
  testClass.methods = methods.map(
    ([methodName, status]) => new ApexTestMethod(className, methodName, status)
  );
  return testClass;
}

function apexClasses(...names: string[]): ApexClass[] {
  return names.map((name, index) => new ApexClass(`class-${index}`, name));
}

function apexClassWithCoverage(name: string, coverage: number): ApexClass {
  const apexClass = new ApexClass(`class-${name}`, name);
  apexClass.codeCoverage = coverage;
  apexClass.coveredLines = coverage;
  apexClass.totalLines = 100;
  return apexClass;
}
