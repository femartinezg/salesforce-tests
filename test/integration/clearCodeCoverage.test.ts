import * as assert from 'assert';
import * as vscode from 'vscode';
import * as sinon from 'sinon';
import { ApexClass } from '../../src/classes/Apex';
import { getNewContextManager } from '../../src/common';
import {
  clearFakeSfInvocations,
  configureFakeSf,
  getFakeSfInvocations,
  releaseFakeSfGate,
  resetFakeSf,
  waitForFakeSfGate,
} from '../support/extensionHarness';

describe('F. Clearing org code coverage', () => {
  const targetOrg = 'fixture.user@example.invalid';
  let sandbox: sinon.SinonSandbox;

  beforeEach(async () => {
    sandbox = sinon.createSandbox();
    await resetFakeSf();
    await clearFakeSfInvocations();
  });

  afterEach(async () => {
    sandbox.restore();
    await resetFakeSf();
  });

  it('F1 clears sources, covered aggregates, and org coverage in order before refreshing', async () => {
    const contextManager = createCoverageContext(targetOrg);
    await configureFakeSf({
      codeCoverageRecordIds: recordsResponse([
        { Id: '714000000000001AAA' },
        { Id: '714000000000002AAA' },
      ]),
      coveredAggregateRecordIds: recordsResponse([
        { Id: '716000000000001AAA' },
        { Id: '716000000000002AAA' },
      ]),
      orgCoverageRecordIds: recordsResponse([{ Id: '715000000000001AAA' }]),
      codeCoverageDeletes: {
        '714000000000001AAA': successMutation('714000000000001AAA'),
        '714000000000002AAA': successMutation('714000000000002AAA'),
      },
      coveredAggregateDeletes: {
        '716000000000001AAA': successMutation('716000000000001AAA'),
        '716000000000002AAA': successMutation('716000000000002AAA'),
      },
      orgCoverageUpdates: {
        '715000000000001AAA': successMutation('715000000000001AAA'),
      },
      codeCoverage: recordsResponse([
        {
          ApexClassOrTriggerId: 'fixture-class-id',
          NumLinesCovered: 0,
          NumLinesUncovered: 10,
        },
      ]),
      orgCoverage: recordsResponse([{ PercentCovered: 0 }]),
    });
    const progress = stubProgress(sandbox);
    const information = sandbox.stub(vscode.window, 'showInformationMessage').resolves(undefined);
    const warning = sandbox.stub(vscode.window, 'showWarningMessage').resolves(undefined);
    const error = sandbox.stub(vscode.window, 'showErrorMessage').resolves(undefined);

    await vscode.commands.executeCommand('salesforce-tests.clearCodeCoverage');

    assert.deepStrictEqual(progress.firstCall.args[0], {
      location: vscode.ProgressLocation.Notification,
      title: 'Clearing code coverage...',
      cancellable: false,
    });
    const invocations = getFakeSfInvocations();
    const operations = invocations.map(({ operation }) => operation);
    assert.deepStrictEqual(operations.slice(0, 8), [
      'codeCoverageRecordIds',
      'deleteCodeCoverage',
      'deleteCodeCoverage',
      'coveredAggregateRecordIds',
      'deleteCoveredAggregate',
      'deleteCoveredAggregate',
      'orgCoverageRecordIds',
      'updateOrgCoverage',
    ]);
    assert.deepStrictEqual(operations.slice(8).sort(), [
      'apexClasses',
      'codeCoverage',
      'orgCoverage',
    ]);
    for (const invocation of invocations) assertTargetOrg(invocation.args, targetOrg);
    assertUpdateValues('715000000000001AAA', 'PercentCovered=0');
    assert.strictEqual(contextManager.statusData.orgWideCoverage, 0);
    assert.strictEqual(contextManager.codeCoverageData.apexClasses?.[0]?.codeCoverage, 0);
    assert.strictEqual(contextManager.codeCoverageData.apexClasses?.[0]?.coveredLines, 0);
    assert.strictEqual(contextManager.codeCoverageData.apexClasses?.[0]?.totalLines, 10);
    assert.strictEqual(information.callCount, 0);
    assert.strictEqual(warning.callCount, 0);
    assert.strictEqual(error.callCount, 0);
  });

  it('F2 treats an org without coverage records as a successful no-op and still refreshes', async () => {
    const contextManager = createCoverageContext(targetOrg);
    await configureFakeSf({
      codeCoverageRecordIds: recordsResponse([]),
      coveredAggregateRecordIds: recordsResponse([]),
      orgCoverageRecordIds: recordsResponse([]),
      codeCoverage: recordsResponse([]),
      orgCoverage: recordsResponse([]),
    });
    stubProgress(sandbox);
    const error = sandbox.stub(vscode.window, 'showErrorMessage').resolves(undefined);

    await vscode.commands.executeCommand('salesforce-tests.clearCodeCoverage');

    const operations = getFakeSfInvocations().map(({ operation }) => operation);
    assert.deepStrictEqual(operations.slice(0, 3), [
      'codeCoverageRecordIds',
      'coveredAggregateRecordIds',
      'orgCoverageRecordIds',
    ]);
    assert.deepStrictEqual(operations.slice(3).sort(), [
      'apexClasses',
      'codeCoverage',
      'orgCoverage',
    ]);
    assert.strictEqual(contextManager.statusData.orgWideCoverage, 0);
    assert.strictEqual(contextManager.codeCoverageData.apexClasses?.[0]?.codeCoverage, -1);
    assert.strictEqual(error.callCount, 0);
  });

  it('F3 completes a failing source phase but does not advance to dependent phases', async () => {
    const contextManager = createCoverageContext(targetOrg);
    await configureFakeSf({
      codeCoverageRecordIds: recordsResponse([
        { Id: '714000000000001AAA' },
        { Id: '714000000000002AAA' },
      ]),
      codeCoverageDeletes: {
        '714000000000001AAA': { stderr: 'synthetic delete failure', exitCode: 1 },
        '714000000000002AAA': successMutation('714000000000002AAA'),
      },
      codeCoverage: coverageResponse(2, 8),
      orgCoverage: recordsResponse([{ PercentCovered: 20 }]),
    });
    stubProgress(sandbox);
    const error = sandbox.stub(vscode.window, 'showErrorMessage').resolves(undefined);

    await vscode.commands.executeCommand('salesforce-tests.clearCodeCoverage');

    const operations = getFakeSfInvocations().map(({ operation }) => operation);
    assert.deepStrictEqual(operations.slice(0, 3), [
      'codeCoverageRecordIds',
      'deleteCodeCoverage',
      'deleteCodeCoverage',
    ]);
    assert.ok(!operations.includes('coveredAggregateRecordIds'));
    assert.ok(!operations.includes('orgCoverageRecordIds'));
    assert.strictEqual(error.callCount, 1);
    assert.strictEqual(
      error.firstCall.args[0],
      'Unable to clear 1 code coverage record. Coverage was refreshed to show the current org state.'
    );
    assert.strictEqual(contextManager.statusData.orgWideCoverage, 20);
    assert.strictEqual(contextManager.codeCoverageData.apexClasses?.[0]?.codeCoverage, 20);
  });

  it('F3.1 completes a failing aggregate phase but does not zero org coverage', async () => {
    createCoverageContext(targetOrg);
    await configureFakeSf({
      codeCoverageRecordIds: recordsResponse([]),
      coveredAggregateRecordIds: recordsResponse([
        { Id: '716000000000001AAA' },
        { Id: '716000000000002AAA' },
      ]),
      coveredAggregateDeletes: {
        '716000000000001AAA': { stderr: 'synthetic delete failure', exitCode: 1 },
        '716000000000002AAA': successMutation('716000000000002AAA'),
      },
      codeCoverage: coverageResponse(2, 8),
      orgCoverage: recordsResponse([{ PercentCovered: 20 }]),
    });
    stubProgress(sandbox);
    const error = sandbox.stub(vscode.window, 'showErrorMessage').resolves(undefined);

    await vscode.commands.executeCommand('salesforce-tests.clearCodeCoverage');

    const operations = getFakeSfInvocations().map(({ operation }) => operation);
    assert.deepStrictEqual(operations.slice(0, 4), [
      'codeCoverageRecordIds',
      'coveredAggregateRecordIds',
      'deleteCoveredAggregate',
      'deleteCoveredAggregate',
    ]);
    assert.ok(!operations.includes('orgCoverageRecordIds'));
    assert.strictEqual(error.callCount, 1);
  });

  it('F3.2 completes all org-wide updates after an individual update fails', async () => {
    createCoverageContext(targetOrg);
    await configureFakeSf({
      codeCoverageRecordIds: recordsResponse([]),
      coveredAggregateRecordIds: recordsResponse([]),
      orgCoverageRecordIds: recordsResponse([
        { Id: '715000000000001AAA' },
        { Id: '715000000000002AAA' },
      ]),
      orgCoverageUpdates: {
        '715000000000001AAA': { stderr: 'synthetic update failure', exitCode: 1 },
        '715000000000002AAA': successMutation('715000000000002AAA'),
      },
      codeCoverage: recordsResponse([]),
      orgCoverage: recordsResponse([{ PercentCovered: 11 }]),
    });
    stubProgress(sandbox);
    const error = sandbox.stub(vscode.window, 'showErrorMessage').resolves(undefined);

    await vscode.commands.executeCommand('salesforce-tests.clearCodeCoverage');

    const operations = getFakeSfInvocations().map(({ operation }) => operation);
    assert.deepStrictEqual(operations.slice(0, 5), [
      'codeCoverageRecordIds',
      'coveredAggregateRecordIds',
      'orgCoverageRecordIds',
      'updateOrgCoverage',
      'updateOrgCoverage',
    ]);
    assert.strictEqual(error.callCount, 1);
  });

  it('F3.3 stops after a failed query and reports the operation before refreshing', async () => {
    createCoverageContext(targetOrg);
    await configureFakeSf({
      codeCoverageRecordIds: { stderr: 'synthetic query failure', exitCode: 1 },
      codeCoverage: recordsResponse([]),
      orgCoverage: recordsResponse([]),
    });
    stubProgress(sandbox);
    const error = sandbox.stub(vscode.window, 'showErrorMessage').resolves(undefined);

    await vscode.commands.executeCommand('salesforce-tests.clearCodeCoverage');

    const operations = getFakeSfInvocations().map(({ operation }) => operation);
    assert.strictEqual(operations[0], 'codeCoverageRecordIds');
    assert.ok(!operations.includes('coveredAggregateRecordIds'));
    assert.ok(!operations.includes('orgCoverageRecordIds'));
    assert.strictEqual(
      error.firstCall.args[0],
      'Unable to clear code coverage. Coverage was refreshed to show the current org state.'
    );
  });

  it('F4 prevents a duplicate clear while one is running without disabling test execution', async () => {
    createCoverageContext(targetOrg);
    await configureFakeSf({
      codeCoverageRecordIds: recordsResponse([{ Id: '714000000000001AAA' }]),
      coveredAggregateRecordIds: recordsResponse([]),
      orgCoverageRecordIds: recordsResponse([]),
      codeCoverageDeletes: {
        '714000000000001AAA': {
          ...successMutation('714000000000001AAA'),
          gate: 'coverage-delete',
        },
      },
      codeCoverage: recordsResponse([]),
      orgCoverage: recordsResponse([]),
    });
    stubProgress(sandbox);

    const firstClear = vscode.commands.executeCommand('salesforce-tests.clearCodeCoverage');
    await waitForFakeSfGate('coverage-delete');
    await vscode.commands.executeCommand('salesforce-tests.clearCodeCoverage');

    assert.strictEqual(
      getFakeSfInvocations().filter(({ operation }) => operation === 'codeCoverageRecordIds')
        .length,
      1
    );
    await releaseFakeSfGate('coverage-delete');
    await firstClear;
  });

  it('F5 refuses to call Salesforce when no org is active', async () => {
    const contextManager = getNewContextManager();
    contextManager.targetOrg = undefined;
    contextManager.codeCoverageData.apexClasses = [];
    const error = sandbox.stub(vscode.window, 'showErrorMessage').resolves(undefined);

    await vscode.commands.executeCommand('salesforce-tests.clearCodeCoverage');

    assert.deepStrictEqual(getFakeSfInvocations(), []);
    assert.strictEqual(
      error.firstCall.args[0],
      'Unable to use the selected Salesforce org. Check authentication or run Refresh Org.'
    );
  });

  it('F6 pins the operation to its starting org and does not overwrite a replacement context', async () => {
    createCoverageContext(targetOrg);
    await configureFakeSf({
      codeCoverageRecordIds: recordsResponse([{ Id: '714000000000001AAA' }]),
      coveredAggregateRecordIds: recordsResponse([]),
      orgCoverageRecordIds: recordsResponse([]),
      codeCoverageDeletes: {
        '714000000000001AAA': {
          ...successMutation('714000000000001AAA'),
          gate: 'context-replacement',
        },
      },
    });
    stubProgress(sandbox);

    const clear = vscode.commands.executeCommand('salesforce-tests.clearCodeCoverage');
    await waitForFakeSfGate('context-replacement');
    const replacement = createCoverageContext('replacement.user@example.invalid');
    replacement.statusData.orgWideCoverage = 67;
    replacement.codeCoverageData.apexClasses![0].codeCoverage = 60;
    await releaseFakeSfGate('context-replacement');
    await clear;

    for (const invocation of getFakeSfInvocations()) assertTargetOrg(invocation.args, targetOrg);
    assert.strictEqual(replacement.statusData.orgWideCoverage, 67);
    assert.strictEqual(replacement.codeCoverageData.apexClasses?.[0]?.codeCoverage, 60);
  });
});

function createCoverageContext(targetOrg: string) {
  const contextManager = getNewContextManager();
  contextManager.targetOrg = targetOrg;
  contextManager.statusData.isAuthenticated = true;
  contextManager.statusData.orgWideCoverage = 84;
  contextManager.apexTestsData.testClasses = [];
  const apexClass = new ApexClass('fixture-class-id', 'FixtureService');
  apexClass.codeCoverage = 80;
  apexClass.coveredLines = 8;
  apexClass.totalLines = 10;
  contextManager.codeCoverageData.apexClasses = [apexClass];
  return contextManager;
}

function recordsResponse(records: unknown[]) {
  return { json: { status: 0, result: { records } } };
}

function coverageResponse(covered: number, uncovered: number) {
  return recordsResponse([
    {
      ApexClassOrTriggerId: 'fixture-class-id',
      NumLinesCovered: covered,
      NumLinesUncovered: uncovered,
    },
  ]);
}

function successMutation(id: string) {
  return { json: { status: 0, result: { id } } };
}

function assertTargetOrg(args: string[], targetOrg: string): void {
  const index = args.indexOf('--target-org');
  assert.ok(index >= 0, `Missing explicit target org in ${args.join(' ')}`);
  assert.strictEqual(args[index + 1], targetOrg);
}

function assertUpdateValues(recordId: string, expectedValues: string): void {
  const invocation = getFakeSfInvocations().find(
    ({ args }) => args[args.indexOf('--record-id') + 1] === recordId
  );
  assert.ok(invocation, `Missing update for ${recordId}`);
  const valuesIndex = invocation.args.indexOf('--values');
  assert.strictEqual(invocation.args[valuesIndex + 1], expectedValues);
}

function stubProgress(sandbox: sinon.SinonSandbox): sinon.SinonStub {
  const withProgress = async <R>(
    _options: vscode.ProgressOptions,
    task: (
      progress: vscode.Progress<{ message?: string; increment?: number }>,
      token: vscode.CancellationToken
    ) => Thenable<R>
  ): Promise<R> => {
    const cancellation = new vscode.CancellationTokenSource();
    try {
      return await task({ report: () => undefined }, cancellation.token);
    } finally {
      cancellation.dispose();
    }
  };
  return sandbox.stub(vscode.window, 'withProgress').callsFake(withProgress);
}
