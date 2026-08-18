import * as assert from 'assert';
import * as vscode from 'vscode';
import sinon = require('sinon');
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
    const { testClass } = createExecutionContext(passingClassName);
    stubProgress(sandbox);
    sandbox.stub(vscode.window, 'showInformationMessage').resolves(undefined);

    await vscode.commands.executeCommand('salesforce-tests.runTestClass', {
      label: passingClassName,
    });
    await waitFor(() => testClass.status === 'Passed');
    assert.strictEqual(testRunInvocations().length, 1);

    testClass.status = undefined;
    sandbox.stub(vscode.window, 'showQuickPick').resolves(passingClassName as never);
    await vscode.commands.executeCommand('salesforce-tests.runTestClass');
    await waitFor(() => testRunInvocations().length === 2 && testClass.status === 'Passed');
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
    const { testClass } = createExecutionContext(pendingClassName);
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

    try {
      await vscode.commands.executeCommand('salesforce-tests.runTestClass', {
        label: pendingClassName,
      });
      await waitFor(() => testClass.status === 'Running' && testRunInvocations().length === 1);

      assert.strictEqual(progress.callCount, 1);
      assert.strictEqual(progress.firstCall.args[0].location, vscode.ProgressLocation.Notification);
      assert.strictEqual(progress.firstCall.args[0].title, `Running ${pendingClassName}...`);
      assert.strictEqual(progress.firstCall.args[0].cancellable, false);
    } finally {
      await releaseFakeSfGate('running-state');
    }
    await waitFor(() => testClass.status === 'Passed');
  });

  it('D4 stores a Passed result, time, duration, history, class coverage, and org coverage', async () => {
    const { contextManager, testClass, apexClass } = createExecutionContext(passingClassName);
    const information = sandbox.stub(vscode.window, 'showInformationMessage').resolves(undefined);
    const cancellation = new vscode.CancellationTokenSource();

    try {
      const message = await runTestClass(testClass, contextManager, cancellation.token);

      assert.strictEqual(testClass.status, 'Passed');
      assert.strictEqual(testClass.executionBlocked, false);
      assert.deepStrictEqual(testClass.startTime, new Date('2026-01-02T03:04:05.000Z'));
      assert.strictEqual(testClass.duration, 1250);
      assert.strictEqual(contextManager.statusData.testRuns.length, 1);
      assert.strictEqual(contextManager.statusData.testRuns[0].name, passingClassName);
      assert.strictEqual(contextManager.statusData.testRuns[0].success, true);
      assert.strictEqual(apexClass.codeCoverage, 90);
      assert.strictEqual(apexClass.coveredLines, 9);
      assert.strictEqual(apexClass.totalLines, 10);
      assert.strictEqual(contextManager.statusData.orgWideCoverage, 91);
      assert.ok(message?.includes('✓ Passed'));
      assert.strictEqual(information.firstCall.args[0], `${passingClassName} passed.`);
    } finally {
      cancellation.dispose();
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
  });

  it('D6 restores the previous state and marks a rejected execution as blocked', async () => {
    const { contextManager, testClass } = createExecutionContext(passingClassName);
    testClass.status = 'Passed';
    testClass.startTime = new Date('2026-01-01T00:00:00.000Z');
    testClass.duration = 250;
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

    try {
      const message = await runTestClass(testClass, contextManager, cancellation.token);

      assert.strictEqual(testClass.status, 'Passed');
      assert.strictEqual(testClass.executionBlocked, true);
      assert.match(String(testClass.getTreeItem().description ?? ''), /^⚠ /);
      assert.match(
        message?.join('\n') ?? '',
        /SyntheticOperationError: Fixture execution rejected/
      );
      assert.match(String(errorMessage.firstCall.args[0]), /Fixture execution rejected/);
    } finally {
      cancellation.dispose();
    }
  });

  it('D7 clears Running and reports both a failed process and non-JSON output', async () => {
    const errorMessage = sandbox.stub(vscode.window, 'showErrorMessage').resolves(undefined);

    for (const response of [
      { stdout: '', stderr: 'synthetic process failure', exitCode: 9 },
      { stdout: 'not-json' },
    ]) {
      const { contextManager, testClass } = createExecutionContext(passingClassName);
      await configureFakeSf({ testRuns: { [passingClassName]: response } });
      const cancellation = new vscode.CancellationTokenSource();
      try {
        await runTestClass(testClass, contextManager, cancellation.token);
        assert.notStrictEqual(testClass.status, 'Running');
        assert.strictEqual(testClass.status, undefined);
      } finally {
        cancellation.dispose();
      }
    }

    assert.strictEqual(errorMessage.callCount, 2);
    assert.match(String(errorMessage.firstCall.args[0]), /Error running FixturePassingTest/);
    assert.match(String(errorMessage.secondCall.args[0]), /Error running FixturePassingTest/);
  });

  it('D8 opens the output for View Results from both success and error notifications', async () => {
    const displayOutput = sandbox.spy();
    const contextManager = { displayOutput };
    sandbox.stub(vscode.window, 'showInformationMessage').resolves('View Results' as never);
    sandbox.stub(vscode.window, 'showErrorMessage').resolves('View Results' as never);

    showTestResultMessage('synthetic success', MessageType.Info, contextManager);
    showTestResultMessage('synthetic failure', MessageType.Error, contextManager);
    await waitFor(() => displayOutput.callCount === 2);

    assert.strictEqual(displayOutput.callCount, 2);
  });

  it('D9.1 ignores a pending result after Refresh Org replaces its context', async () => {
    await assertLateResultIgnored(async () => {
      await vscode.commands.executeCommand('salesforce-tests.refreshOrg');
    }, 'refresh-org');
  });

  it('D9.2 ignores a pending result after .sf/config.json replaces its context', async () => {
    await assertLateResultIgnored(async () => {
      await writeWorkspaceSfConfig({ executionRevision: 'late-result' });
    }, 'config-change');
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
  return sandbox.stub(vscode.window, 'withProgress').callsFake(async (_options: any, task: any) => {
    const cancellation = new vscode.CancellationTokenSource();
    try {
      return await task({ report: () => undefined }, cancellation.token);
    } finally {
      cancellation.dispose();
    }
  });
}

function testRunInvocations() {
  return getFakeSfInvocations().filter(({ operation }) => operation === 'runTest');
}

async function assertLateResultIgnored(
  replaceContext: () => Promise<void>,
  gate: string
): Promise<void> {
  const { contextManager: oldContext, testClass } = createExecutionContext(pendingClassName);
  const cancellation = new vscode.CancellationTokenSource();
  oldContext.runTestCancelTokens.push(cancellation);
  await configureFakeSf({
    testRuns: {
      [pendingClassName]: {
        stdout: JSON.stringify(passedResult(pendingClassName)),
        gate,
      },
    },
  });
  const pendingResult = runTestClass(testClass, oldContext, cancellation.token);

  try {
    await waitFor(() => testClass.status === 'Running' && testRunInvocations().length === 1);
    await replaceContext();
    await waitFor(
      () => getContextManager() !== oldContext && cancellation.token.isCancellationRequested
    );
    const newContext = getContextManager();
    await releaseFakeSfGate(gate);
    await pendingResult;
    await waitFor(
      () =>
        newContext.statusData.orgWideCoverage === 84
        && newContext.codeCoverageData.apexClasses?.[0]?.codeCoverage === 80
    );

    assert.strictEqual(newContext.statusData.testRuns.length, 0);
    assert.strictEqual(newContext.statusData.orgWideCoverage, 84);
    assert.strictEqual(newContext.codeCoverageData.apexClasses?.[0]?.codeCoverage, 80);
    assert.strictEqual(newContext.apexTestsData.testClasses?.[0]?.status, undefined);
  } finally {
    await releaseFakeSfGate(gate);
    cancellation.dispose();
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
