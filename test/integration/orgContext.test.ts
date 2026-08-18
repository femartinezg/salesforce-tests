import * as assert from 'assert';
import * as vscode from 'vscode';
import { ApexTestClass } from '../../src/classes/Apex';
import { TestRun } from '../../src/classes/TestRun';
import { getContextManager, getNewContextManager } from '../../src/common';
import { StatusTreeViewProvider } from '../../src/views/StatusTreeViewProvider';
import {
  activateExtension,
  configureFakeSf,
  defaultFakeSfPlan,
  resetFakeSf,
  waitFor,
  writeWorkspaceSfConfig,
} from '../support/extensionHarness';

describe('B. Active org and general state', () => {
  before(async () => {
    await resetFakeSf();
    await activateExtension();
    await waitFor(() => getContextManager().apexTestsData.testClasses !== undefined);
  });

  afterEach(async () => {
    await resetFakeSf();
  });

  it('B1 shows an authenticated org alias, username, coverage, and username fallback', () => {
    const provider = new StatusTreeViewProvider();
    provider.isAuthenticated = true;
    provider.alias = 'fixture-org';
    provider.username = 'fixture.user@example.invalid';
    provider.orgWideCoverage = 84;

    const aliasedOrg = provider.getRootChildren()[0];
    assert.strictEqual(aliasedOrg.label, 'fixture-org');
    assert.strictEqual(aliasedOrg.description, 'fixture.user@example.invalid');
    assert.strictEqual(
      aliasedOrg.tooltip,
      'fixture-org (fixture.user@example.invalid)\nOrg Wide Coverage: 84%'
    );

    provider.alias = undefined;
    const orgWithoutAlias = provider.getRootChildren()[0];
    assert.strictEqual(orgWithoutAlias.label, 'fixture.user@example.invalid');
    assert.strictEqual(orgWithoutAlias.description, 'fixture.user@example.invalid');
  });

  it('B2 shows No SF Org and leaves Apex Tests and Code Coverage empty when org resolution fails', async () => {
    await configureFakeSf({
      orgInfo: {
        stdout: '{"status":1}',
        stderr: 'synthetic org resolution failure',
        exitCode: 7,
      },
    });
    const contextManager = getNewContextManager();

    await contextManager.init();

    const orgItem = contextManager.statusData.getRootChildren()[0];
    assert.strictEqual(orgItem.label, 'No SF Org');
    assert.match(String(orgItem.tooltip), /default salesforce org not found/i);
    assert.deepStrictEqual(contextManager.apexTestsData.testClasses, []);
    assert.deepStrictEqual(contextManager.codeCoverageData.apexClasses, []);
  });

  it('B3 changes org coverage from Loading to a positive value and treats zero as loaded', () => {
    const provider = new StatusTreeViewProvider();
    provider.isAuthenticated = true;

    assert.strictEqual(provider.getOrgChildren()[0].description, 'Loading...');

    provider.orgWideCoverage = 84;
    assert.strictEqual(provider.getOrgChildren()[0].description, '84%');

    provider.orgWideCoverage = 0;
    assert.strictEqual(provider.getOrgChildren()[0].description, '0%');
    assert.strictEqual(provider.getOrgChildren()[0].tooltip, 'Org Wide Coverage: 0%');
  });

  it('B4/B6 refresh cancels pending runs, replaces context and history, and reloads all org data', async () => {
    const { oldContext, cancellation, wasCancelled } = seedContextWithPendingHistory();

    try {
      await vscode.commands.executeCommand('salesforce-tests.refreshOrg');
      const newContext = await waitForReload(oldContext);

      assert.strictEqual(wasCancelled(), true);
      assert.notStrictEqual(newContext, oldContext);
      assert.strictEqual(newContext.statusData.testRuns.length, 0);
      assertLoadedDefaultOrg(newContext);
    } finally {
      cancellation.dispose();
    }
  });

  it('B5/B6 changing an existing .sf/config.json cancels runs, replaces history, and reloads context', async () => {
    const { oldContext, cancellation, wasCancelled } = seedContextWithPendingHistory();

    try {
      await writeWorkspaceSfConfig({ revision: 'context-change' });
      const newContext = await waitForReload(oldContext);

      assert.strictEqual(wasCancelled(), true);
      assert.notStrictEqual(newContext, oldContext);
      assert.strictEqual(newContext.statusData.testRuns.length, 0);
      assertLoadedDefaultOrg(newContext);
    } finally {
      cancellation.dispose();
    }
  });
});

function seedContextWithPendingHistory(): {
  oldContext: ReturnType<typeof getNewContextManager>;
  cancellation: vscode.CancellationTokenSource;
  wasCancelled: () => boolean;
} {
  const oldContext = getNewContextManager();
  oldContext.statusData.isAuthenticated = true;
  oldContext.apexTestsData.testClasses = [
    new ApexTestClass('old-test-id', 'OldFixtureTest', 'Running'),
  ];
  oldContext.statusData.pushTestRun(
    new TestRun('OldFixtureTest', 'Test Class', true, new Date('2026-01-02T03:04:05Z'), 120)
  );
  const cancellation = new vscode.CancellationTokenSource();
  let cancelled = false;
  cancellation.token.onCancellationRequested(() => {
    cancelled = true;
  });
  oldContext.runTestCancelTokens.push(cancellation);
  return { oldContext, cancellation, wasCancelled: () => cancelled };
}

async function waitForReload(oldContext: ReturnType<typeof getContextManager>) {
  await waitFor(() => getContextManager() !== oldContext);
  const newContext = getContextManager();
  await waitFor(
    () =>
      newContext.statusData.orgWideCoverage === defaultFakeSfPlan().expectedOrgCoverage
      && newContext.codeCoverageData.apexClasses?.[0]?.codeCoverage
        === defaultFakeSfPlan().expectedClassCoverage
  );
  return newContext;
}

function assertLoadedDefaultOrg(contextManager: ReturnType<typeof getContextManager>): void {
  const defaults = defaultFakeSfPlan();
  assert.strictEqual(contextManager.statusData.alias, defaults.expectedAlias);
  assert.strictEqual(contextManager.statusData.username, defaults.expectedUsername);
  assert.deepStrictEqual(
    contextManager.apexTestsData.testClasses?.map(({ name }) => name),
    [defaults.expectedTestClass]
  );
  assert.deepStrictEqual(
    contextManager.codeCoverageData.apexClasses?.map(({ name }) => name),
    [defaults.expectedApexClass]
  );
  assert.strictEqual(contextManager.statusData.orgWideCoverage, defaults.expectedOrgCoverage);
  assert.strictEqual(
    contextManager.codeCoverageData.apexClasses?.[0]?.codeCoverage,
    defaults.expectedClassCoverage
  );
}
