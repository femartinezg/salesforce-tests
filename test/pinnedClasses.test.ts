import * as assert from 'assert';
import * as vscode from 'vscode';
import { ApexClass, ApexTestClass } from '../src/classes/Apex';
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

  it('G3 marks visible rows with the context needed to swap their inline action immediately', async () => {
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
}

async function pin(items: vscode.TreeItem[], label: string): Promise<void> {
  await vscode.commands.executeCommand('salesforce-tests.pinClass', itemWithLabel(items, label));
}

async function unpin(items: vscode.TreeItem[], label: string): Promise<void> {
  await vscode.commands.executeCommand('salesforce-tests.unpinClass', itemWithLabel(items, label));
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

function testClasses(...names: string[]): ApexTestClass[] {
  return names.map((name, index) => new ApexTestClass(`test-${index}`, name));
}

function apexClasses(...names: string[]): ApexClass[] {
  return names.map((name, index) => new ApexClass(`class-${index}`, name));
}
