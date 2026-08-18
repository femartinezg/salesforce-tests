import * as assert from 'assert';
import * as vscode from 'vscode';
import * as sinon from 'sinon';
import { ApexClass, ApexTestClass } from '../../src/classes/Apex';
import { getContextManager, getNewContextManager } from '../../src/common';
import { runTestClass } from '../../src/common/sfActions';
import { MessageType, showTestResultMessage } from '../../src/common/messaging';
import {
  activateExtension,
  clearFakeSfInvocations,
  configureFakeSf,
  getFakeSfInvocations,
  releaseFakeSfGate,
  resetFakeSf,
  waitFor,
  writeWorkspaceSfConfig,
} from '../support/extensionHarness';

const passingClassName = 'FixturePassingTest';
const failingClassName = 'FixtureFailingTest';
const pendingClassName = 'FixturePendingTest';

describe('D. Running an Apex test class', () => {
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

  it('D1 runs the selected class both inline and through the general selector', async () => {
    const { contextManager, testClass } = createExecutionContext(passingClassName);
    stubProgress(sandbox);
    sandbox.stub(vscode.window, 'showInformationMessage').resolves(undefined);
    const output = sandbox.spy(contextManager, 'printOutput');

    await vscode.commands.executeCommand('salesforce-tests.runTestClass', {
      label: passingClassName,
    });
    await waitFor(() => testClass.status === 'Passed' && output.callCount === 2);
    assert.strictEqual(testRunInvocations().length, 1);

    testClass.status = undefined;
    const quickPick = sandbox
      .stub(vscode.window, 'showQuickPick')
      .resolves(passingClassName as never);
    await vscode.commands.executeCommand('salesforce-tests.runTestClass');
    await waitFor(
      () =>
        testRunInvocations().length === 2 && testClass.status === 'Passed' && output.callCount === 4
    );

    assert.deepStrictEqual(quickPick.firstCall.args, [
      [passingClassName],
      { placeHolder: 'Select the Apex test class to run' },
    ]);
    const outputMessages = output.getCalls().map(({ args }) => args[0]);
    const expectedResult = [
      `${passingClassName} result`,
      '✓ Passed',
      'TestStartTime: 2026-01-02T03:04:05.000Z | TestExecutionTime: 1250',
    ];
    assert.strictEqual(outputMessages[0], `Running test: ${passingClassName}`);
    assert.deepStrictEqual(outputMessages[1], expectedResult);
    assert.strictEqual(outputMessages[2], `Running test: ${passingClassName}`);
    assert.deepStrictEqual(outputMessages[3], expectedResult);
  });

  it('D2 does not start execution after cancelling, choosing an unknown class, or selecting Running', async () => {
    const { testClass } = createExecutionContext(passingClassName);
    const quickPick = sandbox.stub(vscode.window, 'showQuickPick').resolves(undefined);

    await vscode.commands.executeCommand('salesforce-tests.runTestClass');
    await vscode.commands.executeCommand('salesforce-tests.runTestClass', {
      label: 'UnknownFixtureTest',
    });
    testClass.status = 'Running';
    await vscode.commands.executeCommand('salesforce-tests.runTestClass', {
      label: passingClassName,
    });

    assert.strictEqual(quickPick.callCount, 1);
    assert.deepStrictEqual(testRunInvocations(), []);
  });

  it('D3 exposes Running state and notification progress with the class name while pending', async () => {
    const { contextManager, testClass } = createExecutionContext(pendingClassName);
    await configureFakeSf({
      testRuns: {
        [pendingClassName]: {
          stdout: JSON.stringify(passedResult(pendingClassName)),
          gate: 'running-state',
        },
      },
    });
    const progress = stubProgress(sandbox);
    sandbox.stub(vscode.window, 'showInformationMessage').resolves(undefined);
    let apexRefreshes = 0;
    const apexRefresh = contextManager.apexTestsData.onDidChangeTreeData(() => {
      apexRefreshes++;
    });

    try {
      await vscode.commands.executeCommand('salesforce-tests.runTestClass', {
        label: pendingClassName,
      });
      await waitFor(() => testClass.status === 'Running' && testRunInvocations().length === 1);

      assert.strictEqual(progress.callCount, 1);
      const progressOptions = progress.firstCall.args[0] as vscode.ProgressOptions;
      assert.strictEqual(progressOptions.location, vscode.ProgressLocation.Notification);
      assert.strictEqual(progressOptions.title, `Running ${pendingClassName}...`);
      assert.strictEqual(progressOptions.cancellable, false);
      assert.strictEqual(apexRefreshes, 1);
    } finally {
      await releaseFakeSfGate('running-state');
    }
    await waitFor(() => testClass.status === 'Passed');
    assert.strictEqual(apexRefreshes, 2);
    apexRefresh.dispose();
  });

  it('D4 stores a Passed result, time, duration, history, class coverage, and org coverage', async () => {
    const { contextManager, testClass, apexClass } = createExecutionContext(passingClassName);
    const information = sandbox.stub(vscode.window, 'showInformationMessage').resolves(undefined);
    const cancellation = new vscode.CancellationTokenSource();
    let apexRefreshes = 0;
    let statusRefreshes = 0;
    let coverageRefreshes = 0;
    const refreshes = [
      contextManager.apexTestsData.onDidChangeTreeData(() => apexRefreshes++),
      contextManager.statusData.onDidChangeTreeData(() => statusRefreshes++),
      contextManager.codeCoverageData.onDidChangeTreeData(() => coverageRefreshes++),
    ];

    try {
      const message = await runTestClass(testClass, contextManager, cancellation.token);

      assert.strictEqual(testClass.status, 'Passed');
      assert.strictEqual(testClass.executionBlocked, false);
      assert.deepStrictEqual(testClass.startTime, new Date('2026-01-02T03:04:05.000Z'));
      assert.strictEqual(testClass.duration, 1250);
      assert.strictEqual(contextManager.statusData.testRuns.length, 1);
      assert.strictEqual(contextManager.statusData.testRuns[0].name, passingClassName);
      assert.strictEqual(contextManager.statusData.testRuns[0].success, true);
      assert.deepStrictEqual(
        contextManager.statusData.testRuns[0].startTime,
        new Date('2026-01-02T03:04:05.000Z')
      );
      assert.strictEqual(contextManager.statusData.testRuns[0].duration, 1250);
      assert.strictEqual(apexClass.codeCoverage, 90);
      assert.strictEqual(apexClass.coveredLines, 9);
      assert.strictEqual(apexClass.totalLines, 10);
      assert.strictEqual(contextManager.statusData.orgWideCoverage, 91);
      assert.ok(message?.includes('✓ Passed'));
      assert.strictEqual(information.firstCall.args[0], `${passingClassName} passed.`);
      assert.strictEqual(apexRefreshes, 2);
      assert.strictEqual(statusRefreshes, 1);
      assert.strictEqual(coverageRefreshes, 1);
    } finally {
      cancellation.dispose();
      refreshes.forEach((refresh) => {
        refresh.dispose();
      });
    }
  });

  it('D5 stores a Failed result and reports only failed methods with message and stack trace', async () => {
    const { contextManager, testClass } = createExecutionContext(failingClassName);
    await configureFakeSf({
      testRuns: {
        [failingClassName]: { stdout: JSON.stringify(failedResult(failingClassName)) },
      },
    });
    const errorMessage = sandbox.stub(vscode.window, 'showErrorMessage').resolves(undefined);
    const output = sandbox.spy(contextManager, 'printOutput');
    stubProgress(sandbox);
    let apexRefreshes = 0;
    let statusRefreshes = 0;
    let coverageRefreshes = 0;
    const refreshes = [
      contextManager.apexTestsData.onDidChangeTreeData(() => apexRefreshes++),
      contextManager.statusData.onDidChangeTreeData(() => statusRefreshes++),
      contextManager.codeCoverageData.onDidChangeTreeData(() => coverageRefreshes++),
    ];

    await vscode.commands.executeCommand('salesforce-tests.runTestClass', {
      label: failingClassName,
    });
    await waitFor(
      () =>
        testClass.status === 'Failed'
        && output.getCalls().some(({ args }) => Array.isArray(args[0]))
    );
    const resultOutput = output
      .getCalls()
      .map(({ args }) => args[0])
      .find((message): message is string[] => Array.isArray(message));

    assert.strictEqual(testClass.status, 'Failed');
    assert.strictEqual(contextManager.statusData.testRuns[0].success, false);
    assert.match(
      resultOutput?.join('\n') ?? '',
      /FixtureFailingTest\.fails: synthetic assertion - Class\.FixtureFailingTest: line 7\\nClass\.FixtureFailingTest: line 3/
    );
    assert.doesNotMatch(resultOutput?.join('\n') ?? '', /FixtureFailingTest\.passes/);
    assert.strictEqual(errorMessage.firstCall.args[0], `${failingClassName} failed.`);
    assert.strictEqual(apexRefreshes, 2);
    assert.strictEqual(statusRefreshes, 1);
    assert.strictEqual(coverageRefreshes, 1);
    refreshes.forEach((refresh) => {
      refresh.dispose();
    });
  });

  it('D6 restores the previous state and marks a rejected execution as blocked', async () => {
    const { contextManager, testClass } = createExecutionContext(passingClassName);
    testClass.status = 'Passed';
    testClass.startTime = new Date('2026-01-01T00:00:00.000Z');
    testClass.duration = 250;
    const previousStartTime = testClass.startTime;
    const previousDuration = testClass.duration;
    const previousDescription = testClass.getTreeItem().description;
    const previousCoverage = contextManager.statusData.orgWideCoverage;
    await configureFakeSf({
      testRuns: {
        [passingClassName]: {
          stdout: JSON.stringify({
            status: 1,
            name: 'SyntheticOperationError',
            message: 'Fixture execution rejected',
          }),
        },
      },
    });
    const errorMessage = sandbox.stub(vscode.window, 'showErrorMessage').resolves(undefined);
    const cancellation = new vscode.CancellationTokenSource();
    let apexRefreshes = 0;
    let statusRefreshes = 0;
    let coverageRefreshes = 0;
    const refreshes = [
      contextManager.apexTestsData.onDidChangeTreeData(() => apexRefreshes++),
      contextManager.statusData.onDidChangeTreeData(() => statusRefreshes++),
      contextManager.codeCoverageData.onDidChangeTreeData(() => coverageRefreshes++),
    ];

    try {
      const message = await runTestClass(testClass, contextManager, cancellation.token);

      assert.strictEqual(testClass.status, 'Passed');
      assert.strictEqual(testClass.executionBlocked, true);
      assert.deepStrictEqual(testClass.startTime, previousStartTime);
      assert.strictEqual(testClass.duration, previousDuration);
      assert.strictEqual(contextManager.statusData.orgWideCoverage, previousCoverage);
      assert.strictEqual(contextManager.statusData.testRuns.length, 0);
      assert.strictEqual(contextManager.codeCoverageData.apexClasses?.[0]?.codeCoverage, undefined);
      assert.strictEqual(testClass.getTreeItem().description, `⚠ ${previousDescription}`);
      assert.match(
        message?.join('\n') ?? '',
        /SyntheticOperationError: Fixture execution rejected/
      );
      assert.match(String(errorMessage.firstCall.args[0]), /Fixture execution rejected/);
      assert.strictEqual(apexRefreshes, 2);
      assert.strictEqual(statusRefreshes, 0);
      assert.strictEqual(coverageRefreshes, 0);
    } finally {
      cancellation.dispose();
      refreshes.forEach((refresh) => {
        refresh.dispose();
      });
    }
  });

  it('D7 clears Running and reports both a failed process and non-JSON output', async () => {
    const errorMessage = sandbox.stub(vscode.window, 'showErrorMessage').resolves(undefined);

    for (const response of [
      { stdout: '', stderr: 'synthetic process failure', exitCode: 9 },
      { stdout: 'not-json' },
    ]) {
      const { contextManager, testClass } = createExecutionContext(passingClassName);
      let apexRefreshes = 0;
      let statusRefreshes = 0;
      let coverageRefreshes = 0;
      const refreshes = [
        contextManager.apexTestsData.onDidChangeTreeData(() => apexRefreshes++),
        contextManager.statusData.onDidChangeTreeData(() => statusRefreshes++),
        contextManager.codeCoverageData.onDidChangeTreeData(() => coverageRefreshes++),
      ];
      await configureFakeSf({ testRuns: { [passingClassName]: response } });
      const cancellation = new vscode.CancellationTokenSource();
      try {
        await runTestClass(testClass, contextManager, cancellation.token);
        assert.notStrictEqual(testClass.status, 'Running');
        assert.strictEqual(testClass.status, undefined);
        assert.strictEqual(contextManager.statusData.testRuns.length, 0);
        assert.strictEqual(apexRefreshes, 2);
        assert.strictEqual(statusRefreshes, 1);
        assert.strictEqual(coverageRefreshes, 0);
      } finally {
        cancellation.dispose();
        refreshes.forEach((refresh) => {
          refresh.dispose();
        });
      }
    }

    assert.strictEqual(errorMessage.callCount, 2);
    assert.match(String(errorMessage.firstCall.args[0]), /Error running FixturePassingTest/);
    assert.match(String(errorMessage.secondCall.args[0]), /Error running FixturePassingTest/);
  });

  it('D8 opens the output for View Results from both success and error notifications', async () => {
    const displayOutput = sandbox.spy();
    const contextManager = { displayOutput };
    const information = sandbox
      .stub(vscode.window, 'showInformationMessage')
      .resolves('View Results' as never);
    const error = sandbox.stub(vscode.window, 'showErrorMessage').resolves('View Results' as never);

    showTestResultMessage('synthetic success', MessageType.Info, contextManager);
    showTestResultMessage('synthetic failure', MessageType.Error, contextManager);
    await waitFor(() => displayOutput.callCount === 2);

    assert.deepStrictEqual(information.firstCall.args, ['synthetic success', 'View Results']);
    assert.deepStrictEqual(error.firstCall.args, ['synthetic failure', 'View Results']);
    assert.strictEqual(displayOutput.callCount, 2);
  });

  it('D9.1 ignores a pending result after Refresh Org replaces its context', async () => {
    const information = sandbox.stub(vscode.window, 'showInformationMessage').resolves(undefined);
    const error = sandbox.stub(vscode.window, 'showErrorMessage').resolves(undefined);
    await assertLateResultIgnored(
      async () => {
        await vscode.commands.executeCommand('salesforce-tests.refreshOrg');
      },
      'refresh-org',
      sandbox
    );
    assert.strictEqual(information.callCount, 0);
    assert.strictEqual(error.callCount, 0);
  });

  it('D9.2 ignores a pending result after .sf/config.json replaces its context', async () => {
    const information = sandbox.stub(vscode.window, 'showInformationMessage').resolves(undefined);
    const error = sandbox.stub(vscode.window, 'showErrorMessage').resolves(undefined);
    await assertLateResultIgnored(
      async () => {
        await writeWorkspaceSfConfig({ executionRevision: 'late-result' });
      },
      'config-change',
      sandbox
    );
    assert.strictEqual(information.callCount, 0);
    assert.strictEqual(error.callCount, 0);
  });
});

function createExecutionContext(testClassName: string): {
  contextManager: ReturnType<typeof getNewContextManager>;
  testClass: ApexTestClass;
  apexClass: ApexClass;
} {
  const contextManager = getNewContextManager();
  const testClass = new ApexTestClass('fixture-test-id', testClassName);
  const apexClass = new ApexClass('fixture-class-id', 'FixtureService');
  contextManager.statusData.isAuthenticated = true;
  contextManager.statusData.orgWideCoverage = 84;
  contextManager.apexTestsData.testClasses = [testClass];
  contextManager.codeCoverageData.apexClasses = [apexClass];
  return { contextManager, testClass, apexClass };
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

async function assertLateResultIgnored(
  replaceContext: () => Promise<void>,
  gate: string,
  sandbox: sinon.SinonSandbox
): Promise<void> {
  const { contextManager: oldContext, testClass } = createExecutionContext(pendingClassName);
  await configureFakeSf({
    testRuns: {
      [pendingClassName]: {
        stdout: JSON.stringify(passedResult(pendingClassName)),
        gate,
      },
    },
  });
  stubProgress(sandbox);
  const output = sandbox.spy(oldContext, 'printOutput');
  await vscode.commands.executeCommand('salesforce-tests.runTestClass', {
    label: pendingClassName,
  });

  try {
    await waitFor(
      () =>
        testClass.status === 'Running'
        && testRunInvocations().length === 1
        && oldContext.runTestCancelTokens.length === 1
    );
    const cancellation = oldContext.runTestCancelTokens[0];
    await replaceContext();
    await waitFor(
      () => getContextManager() !== oldContext && cancellation.token.isCancellationRequested
    );
    const newContext = getContextManager();
    await releaseFakeSfGate(gate);
    await waitFor(() => oldContext.runTestCancelTokens.length === 0);
    await waitFor(
      () =>
        newContext.statusData.orgWideCoverage === 84
        && newContext.codeCoverageData.apexClasses?.[0]?.codeCoverage === 80
    );

    assert.strictEqual(newContext.statusData.testRuns.length, 0);
    assert.strictEqual(newContext.statusData.orgWideCoverage, 84);
    assert.strictEqual(newContext.codeCoverageData.apexClasses?.[0]?.codeCoverage, 80);
    assert.strictEqual(newContext.apexTestsData.testClasses?.[0]?.status, undefined);
    assert.deepStrictEqual(
      output.getCalls().map(({ args }) => args[0]),
      [`Running test: ${pendingClassName}`]
    );
  } finally {
    await releaseFakeSfGate(gate);
  }
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

function failedResult(testClassName: string) {
  return {
    status: 100,
    result: {
      summary: {
        outcome: 'Failed',
        testStartTime: '2026-01-02T03:04:05.000Z',
        testExecutionTime: '875',
      },
      tests: [
        { FullName: `${testClassName}.passes`, Outcome: 'Pass' },
        {
          FullName: `${testClassName}.fails`,
          Outcome: 'Fail',
          Message: 'synthetic assertion',
          StackTrace: `Class.${testClassName}: line 7\nClass.${testClassName}: line 3`,
        },
      ],
      coverage: {
        coverage: [{ name: 'FixtureService', totalLines: 10, totalCovered: 6 }],
        summary: { orgWideCoverage: '72%' },
      },
    },
  };
}
