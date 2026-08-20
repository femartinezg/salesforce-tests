import * as assert from 'assert';
import * as vscode from 'vscode';
import * as sinon from 'sinon';
import { ApexClass, ApexTestClass } from '../../src/classes/Apex';
import { TestRun } from '../../src/classes/TestRun';
import { getContextManager, getNewContextManager } from '../../src/common';
import {
  activateExtension,
  clearFakeSfInvocations,
  configureFakeSf,
  getFakeSfInvocations,
  releaseFakeSfGate,
  resetFakeSf,
  waitFor,
} from '../support/extensionHarness';

const passingClassName = 'FixturePassingTest';
const targetOrg = 'fixture.user@example.invalid';

describe('History actions', () => {
  let sandbox: sinon.SinonSandbox;

  before(async () => {
    await resetFakeSf();
    await activateExtension();
    await waitFor(() => getContextManager().apexTestsData.testClasses !== undefined);
  });

  beforeEach(async () => {
    sandbox = sinon.createSandbox();
    await resetFakeSf();
    await clearFakeSfInvocations();
  });

  afterEach(() => {
    sandbox.restore();
  });

  it('H1 clears all history immediately, refreshes it, and leaves unrelated state untouched', async () => {
    const { contextManager, testClass, apexClass } = createExecutionContext();
    testClass.status = 'Passed';
    testClass.startTime = new Date('2026-01-01T00:00:00.000Z');
    testClass.duration = 250;
    apexClass.codeCoverage = 80;
    apexClass.coveredLines = 8;
    apexClass.totalLines = 10;
    contextManager.statusData.pushTestRun(historyRun('OlderRun', '2025-01-01T00:00:00.000Z'));
    contextManager.statusData.pushTestRun(historyRun(passingClassName, '2026-01-01T00:00:00.000Z'));
    const information = sandbox.stub(vscode.window, 'showInformationMessage').resolves(undefined);
    const warning = sandbox.stub(vscode.window, 'showWarningMessage').resolves(undefined);
    const error = sandbox.stub(vscode.window, 'showErrorMessage').resolves(undefined);
    const output = sandbox.spy(contextManager, 'printOutput');
    let refreshes = 0;
    const refresh = contextManager.statusData.onDidChangeTreeData(() => refreshes++);

    try {
      await vscode.commands.executeCommand('salesforce-tests.clearTestRuns');

      assert.deepStrictEqual(contextManager.statusData.testRuns, []);
      assert.strictEqual(refreshes, 1);
      assert.strictEqual(testClass.status, 'Passed');
      assert.deepStrictEqual(testClass.startTime, new Date('2026-01-01T00:00:00.000Z'));
      assert.strictEqual(testClass.duration, 250);
      assert.strictEqual(contextManager.statusData.orgWideCoverage, 84);
      assert.strictEqual(apexClass.codeCoverage, 80);
      assert.strictEqual(apexClass.coveredLines, 8);
      assert.strictEqual(apexClass.totalLines, 10);
      assert.deepStrictEqual(getFakeSfInvocations(), []);
      assert.strictEqual(output.callCount, 0);
      assert.strictEqual(information.callCount, 0);
      assert.strictEqual(warning.callCount, 0);
      assert.strictEqual(error.callCount, 0);

      await vscode.commands.executeCommand('salesforce-tests.clearTestRuns');

      assert.deepStrictEqual(contextManager.statusData.testRuns, []);
      assert.strictEqual(refreshes, 2);
      assert.strictEqual(information.callCount, 0);
      assert.strictEqual(warning.callCount, 0);
      assert.strictEqual(error.callCount, 0);
    } finally {
      refresh.dispose();
    }
  });

  it('H2 reruns a visible history entry through normal class execution and preserves the old entry', async () => {
    const { contextManager, testClass } = createExecutionContext();
    const previousRun = historyRun(passingClassName, '2025-01-01T00:00:00.000Z');
    contextManager.statusData.pushTestRun(previousRun);
    const progress = stubProgress(sandbox);
    sandbox.stub(vscode.window, 'showInformationMessage').resolves(undefined);
    const output = sandbox.spy(contextManager, 'printOutput');
    const historyItem = contextManager.statusData.getLastTestRunsChildren()[0];

    assert.strictEqual(historyItem.contextValue, 'statusTestRun');
    await vscode.commands.executeCommand('salesforce-tests.rerunTest', historyItem);
    await waitFor(
      () =>
        testClass.status === 'Passed'
        && contextManager.statusData.testRuns.length === 2
        && contextManager.runTestCancelTokens.length === 0
    );

    assert.strictEqual(testRunInvocations().length, 1);
    assert.strictEqual(testRunInvocations()[0].args.includes(passingClassName), true);
    assert.strictEqual(contextManager.statusData.testRuns[0].name, passingClassName);
    assert.strictEqual(contextManager.statusData.testRuns[1], previousRun);
    assert.deepStrictEqual(
      output.getCalls().map(({ args }) => args[0]),
      [
        `Running test: ${passingClassName}`,
        [
          `${passingClassName} result`,
          '✓ Passed',
          'TestStartTime: 2026-01-02T03:04:05.000Z | TestExecutionTime: 1250',
        ],
      ]
    );
    assert.strictEqual(progress.callCount, 1);
    assert.strictEqual(
      (progress.firstCall.args[0] as vscode.ProgressOptions).title,
      `Running ${passingClassName}...`
    );
  });

  it('H3 warns and does not invoke Salesforce CLI when the historical class is absent', async () => {
    const { contextManager } = createExecutionContext();
    contextManager.statusData.pushTestRun(
      historyRun('RemovedFixtureTest', '2025-01-01T00:00:00.000Z')
    );
    const warning = sandbox.stub(vscode.window, 'showWarningMessage').resolves(undefined);
    const progress = stubProgress(sandbox);
    const output = sandbox.spy(contextManager, 'printOutput');
    const historyItem = contextManager.statusData.getLastTestRunsChildren()[0];

    await vscode.commands.executeCommand('salesforce-tests.rerunTest', historyItem);

    assert.strictEqual(warning.callCount, 1);
    assert.match(String(warning.firstCall.args[0]), /Refresh Apex Tests/);
    assert.deepStrictEqual(testRunInvocations(), []);
    assert.strictEqual(progress.callCount, 0);
    assert.strictEqual(output.callCount, 0);
  });

  it('H4 reruns the most recent entry from the palette command', async () => {
    const { contextManager, testClass } = createExecutionContext();
    contextManager.apexTestsData.testClasses?.push(
      new ApexTestClass('fixture-older-id', 'OlderFixtureTest')
    );
    const olderRun = historyRun('OlderFixtureTest', '2025-01-01T00:00:00.000Z');
    const latestRun = historyRun(passingClassName, '2026-01-01T00:00:00.000Z');
    contextManager.statusData.pushTestRun(olderRun);
    contextManager.statusData.pushTestRun(latestRun);
    stubProgress(sandbox);
    sandbox.stub(vscode.window, 'showInformationMessage').resolves(undefined);

    await vscode.commands.executeCommand('salesforce-tests.rerunLastTest');
    await waitFor(
      () =>
        testClass.status === 'Passed'
        && testRunInvocations().length === 1
        && contextManager.runTestCancelTokens.length === 0
    );

    const invocation = testRunInvocations()[0];
    assert.strictEqual(invocation.args.includes(passingClassName), true);
    assert.strictEqual(invocation.args.includes('OlderFixtureTest'), false);
    assert.strictEqual(contextManager.statusData.testRuns.length, 3);
    assert.strictEqual(contextManager.statusData.testRuns[0].name, passingClassName);
    assert.strictEqual(contextManager.statusData.testRuns[1], latestRun);
    assert.strictEqual(contextManager.statusData.testRuns[2], olderRun);
  });

  it('H5 allows an execution already in progress to repopulate cleared history', async () => {
    const { contextManager, testClass } = createExecutionContext();
    contextManager.statusData.pushTestRun(historyRun('OldRun', '2025-01-01T00:00:00.000Z'));
    await configureFakeSf({
      testRuns: {
        [passingClassName]: {
          json: passedResult(passingClassName),
          gate: 'clear-running-history',
        },
      },
    });
    stubProgress(sandbox);
    sandbox.stub(vscode.window, 'showInformationMessage').resolves(undefined);

    await vscode.commands.executeCommand('salesforce-tests.runTestClass', {
      label: passingClassName,
    });

    try {
      await waitFor(
        () =>
          testClass.status === 'Running'
          && testRunInvocations().length === 1
          && contextManager.runTestCancelTokens.length === 1
      );
      await vscode.commands.executeCommand('salesforce-tests.clearTestRuns');
      assert.strictEqual(contextManager.statusData.testRuns.length, 0);

      await releaseFakeSfGate('clear-running-history');
      await waitFor(
        () =>
          testClass.status === 'Passed'
          && contextManager.statusData.testRuns.length === 1
          && contextManager.runTestCancelTokens.length === 0
      );

      assert.strictEqual(contextManager.statusData.testRuns[0].name, passingClassName);
    } finally {
      await releaseFakeSfGate('clear-running-history');
    }
  });
});

function createExecutionContext(): {
  contextManager: ReturnType<typeof getNewContextManager>;
  testClass: ApexTestClass;
  apexClass: ApexClass;
} {
  const contextManager = getNewContextManager();
  const testClass = new ApexTestClass('fixture-test-id', passingClassName);
  const apexClass = new ApexClass('fixture-class-id', 'FixtureService');
  contextManager.targetOrg = targetOrg;
  contextManager.statusData.isAuthenticated = true;
  contextManager.statusData.orgWideCoverage = 84;
  contextManager.apexTestsData.testClasses = [testClass];
  contextManager.codeCoverageData.apexClasses = [apexClass];
  return { contextManager, testClass, apexClass };
}

function historyRun(name: string, startTime: string): TestRun {
  return new TestRun(name, 'Test Class', true, new Date(startTime), 250);
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

function testRunInvocations() {
  return getFakeSfInvocations().filter(({ operation }) => operation === 'runTest');
}

function passedResult(testClassName: string) {
  return {
    status: 0,
    result: {
      summary: {
        outcome: 'Passed',
        testStartTime: '2026-01-02T03:04:05.000Z',
        testExecutionTime: '1250',
      },
      tests: [{ FullName: `${testClassName}.passes`, Outcome: 'Pass' }],
      coverage: {
        coverage: [{ name: 'FixtureService', totalLines: 10, totalCovered: 9 }],
        summary: { orgWideCoverage: '91%' },
      },
    },
  };
}
