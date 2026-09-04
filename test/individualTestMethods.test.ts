import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { ApexClass, ApexTestClass, ApexTestMethod } from '../src/classes/Apex';
import { TestRun } from '../src/classes/TestRun';
import { getContextManager, getNewContextManager } from '../src/common';
import { runTestClass } from '../src/common/sfActions';
import { ApexTestsTreeViewProvider } from '../src/views/ApexTestsTreeViewProvider';
import {
  activateExtension,
  clearFakeSfInvocations,
  configureFakeSf,
  getFakeSfInvocations,
  releaseFakeSfGate,
  resetFakeSf,
  waitFor,
} from './support/extensionHarness';

const testClassName = 'FixturePassingTest';
const targetOrg = 'fixture.user@example.invalid';

describe('G. Running individual Apex test methods', () => {
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

  afterEach(() => sandbox.restore());

  it('G1 discovers modern and legacy test methods in alphabetical order without extra queries', async () => {
    const contextManager = getNewContextManager();
    contextManager.targetOrg = targetOrg;
    await configureFakeSf({
      apexClasses: recordsResponse([
        {
          Id: '01p-complex',
          Name: 'ComplexTest',
          Body: `
            @IsTest(SeeAllData=false)
            private class ComplexTest {
              @TestSetup static void setupRecords() {}
              private static void helper() {}
              @IsTest static void zetaWorks() {}
              static testMethod void legacyWorks() {}
              @isTest
              static void alphaWorks() {
                String decoy = '@IsTest static void stringDecoy() {}';
              }
              // @IsTest static void commentDecoy() {}
              /* testMethod static void blockDecoy() {} */
              private class InnerHelper {
                @IsTest static void nestedDecoy() {}
              }
            }
          `,
        },
      ]),
    });

    const result = await vscode.commands.executeCommand('salesforce-tests.refreshApexTests');
    assert.strictEqual(result, undefined);
    const testClass = contextManager.apexTestsData.testClasses?.[0];
    assert.strictEqual(testClass?.name, 'ComplexTest');
    assert.deepStrictEqual(
      testClass?.methods.map(({ name }) => name),
      ['alphaWorks', 'legacyWorks', 'zetaWorks']
    );
    assert.strictEqual(
      getFakeSfInvocations().filter(({ operation }) => operation === 'apexClasses').length,
      1
    );
  });

  it('G2 renders classes collapsed and exposes neutral method rows as alphabetical children', async () => {
    const provider = new ApexTestsTreeViewProvider();
    const testClass = classWithMethods('TreeTest', ['zeta', 'alpha']);
    provider.testClasses = [testClass];

    const classItem = provider.getRootChildren()[0];
    assert.strictEqual(classItem.label, 'TreeTest');
    assert.strictEqual(classItem.id, 'apex-test-class:id-TreeTest');
    assert.strictEqual(classItem.collapsibleState, vscode.TreeItemCollapsibleState.Collapsed);
    const methods = await provider.getChildren(classItem);
    assert.deepStrictEqual(
      methods.map(({ label }) => label),
      ['alpha', 'zeta']
    );
    assert.ok(methods.every(({ contextValue }) => contextValue === 'apexTestMethod'));
    assert.deepStrictEqual(
      methods.map(({ id }) => id),
      ['apex-test-method:TreeTest.alpha', 'apex-test-method:TreeTest.zeta']
    );
    assert.ok(
      methods.every(
        ({ iconPath }) =>
          iconPath instanceof vscode.ThemeIcon && iconPath.id === 'circle-large-outline'
      )
    );
  });

  it('G3 selects class then method from the palette and updates only the completed method', async () => {
    const { contextManager, testClass } = createExecutionContext(['passes', 'sibling']);
    const [passes, sibling] = testClass.methods;
    testClass.status = 'Failed';
    sibling.status = 'Failed';
    const picks = sandbox
      .stub(vscode.window, 'showQuickPick')
      .onFirstCall()
      .resolves(testClassName as never)
      .onSecondCall()
      .resolves('passes' as never);
    stubProgress(sandbox);
    sandbox.stub(vscode.window, 'showInformationMessage').resolves(undefined);

    await vscode.commands.executeCommand('salesforce-tests.runTestMethod');
    await waitFor(
      () => passes.status === 'Passed' && contextManager.runTestCancelTokens.length === 0
    );

    assert.deepStrictEqual(picks.firstCall.args, [
      [testClassName],
      { placeHolder: 'Select the Apex test class' },
    ]);
    assert.deepStrictEqual(picks.secondCall.args, [
      ['passes', 'sibling'],
      { placeHolder: 'Select the Apex test method to run' },
    ]);
    assert.strictEqual(testClass.status, 'Failed');
    assert.strictEqual(sibling.status, 'Failed');
    assert.deepStrictEqual(passes.startTime, new Date('2026-01-02T03:04:05.000Z'));
    assert.strictEqual(passes.duration, 1250);
    assert.deepStrictEqual(testTargets(), [`${testClassName}.passes`]);
    assert.strictEqual(contextManager.statusData.testRuns[0].name, `${testClassName}.passes`);
    assert.strictEqual(contextManager.statusData.testRuns[0].type, 'Test Method');
    assert.deepStrictEqual(contextManager.statusData.testRuns[0].target, {
      className: testClassName,
      methodName: 'passes',
    });
  });

  it('G4 cancels either palette step and ignores unknown or already-running methods', async () => {
    const { testClass } = createExecutionContext(['passes']);
    const method = testClass.methods[0];
    const pick = sandbox.stub(vscode.window, 'showQuickPick').resolves(undefined);

    await vscode.commands.executeCommand('salesforce-tests.runTestMethod');
    pick
      .onFirstCall()
      .resolves(testClassName as never)
      .onSecondCall()
      .resolves(undefined);
    await vscode.commands.executeCommand('salesforce-tests.runTestMethod');
    await vscode.commands.executeCommand('salesforce-tests.runTestMethod', {
      testClassName,
      methodName: 'unknown',
    });
    method.status = 'Running';
    await vscode.commands.executeCommand('salesforce-tests.runTestMethod', {
      testClassName,
      methodName: 'passes',
    });

    assert.deepStrictEqual(testTargets(), []);
  });

  it('G5 marks only the method Running and rejects a duplicate while its result is pending', async () => {
    const { contextManager, testClass } = createExecutionContext(['passes', 'sibling']);
    const [passes, sibling] = testClass.methods;
    testClass.status = 'Passed';
    sibling.status = 'Failed';
    await configureFakeSf({
      testRuns: {
        [`${testClassName}.passes`]: {
          json: passedResult(`${testClassName}.passes`),
          gate: 'method-running',
        },
      },
    });
    stubProgress(sandbox);
    sandbox.stub(vscode.window, 'showInformationMessage').resolves(undefined);

    await vscode.commands.executeCommand('salesforce-tests.runTestMethod', {
      testClassName,
      methodName: 'passes',
    });
    try {
      await waitFor(() => passes.status === 'Running' && testTargets().length === 1);
      await vscode.commands.executeCommand('salesforce-tests.runTestMethod', {
        testClassName,
        methodName: 'passes',
      });
      assert.deepStrictEqual(testTargets(), [`${testClassName}.passes`]);
      assert.strictEqual(testClass.status, 'Passed');
      assert.strictEqual(sibling.status, 'Failed');
    } finally {
      await releaseFakeSfGate('method-running');
    }
    await waitFor(
      () => passes.status === 'Passed' && contextManager.runTestCancelTokens.length === 0
    );
  });

  it('G6 applies class results to methods only on completion and clears method timing', async () => {
    const { contextManager, testClass } = createExecutionContext(['passes', 'fails', 'omitted']);
    for (const [index, method] of testClass.methods.entries()) {
      method.status = index === 1 ? 'Passed' : 'Failed';
      method.startTime = new Date('2025-01-01T00:00:00.000Z');
      method.duration = 100 + index;
    }
    const previous = testClass.methods.map(({ status, startTime, duration }) => ({
      status,
      startTime,
      duration,
    }));
    await configureFakeSf({
      testRuns: {
        [testClassName]: {
          json: failedClassResult(testClassName),
          gate: 'class-method-results',
        },
      },
    });
    sandbox.stub(vscode.window, 'showErrorMessage').resolves(undefined);
    const cancellation = new vscode.CancellationTokenSource();

    const execution = runTestClass(testClass, contextManager, targetOrg, cancellation.token);
    try {
      await waitFor(() => testClass.status === 'Running' && testTargets().length === 1);
      assert.deepStrictEqual(
        testClass.methods.map(({ status, startTime, duration }) => ({
          status,
          startTime,
          duration,
        })),
        previous
      );
    } finally {
      await releaseFakeSfGate('class-method-results');
    }
    await execution;

    assert.strictEqual(testClass.status, 'Failed');
    assert.deepStrictEqual(
      testClass.methods.map(({ name, status, startTime, duration }) => ({
        name,
        status,
        startTime,
        duration,
      })),
      [
        { name: 'fails', status: 'Failed', startTime: undefined, duration: undefined },
        { name: 'omitted', status: undefined, startTime: undefined, duration: undefined },
        { name: 'passes', status: 'Passed', startTime: undefined, duration: undefined },
      ]
    );
    cancellation.dispose();
  });

  it('G7 reruns a method history target and warns when its method is no longer available', async () => {
    const { contextManager, testClass } = createExecutionContext(['passes']);
    const history = new TestRun(
      `${testClassName}.passes`,
      'Test Method',
      true,
      new Date('2025-01-01T00:00:00.000Z'),
      250,
      { className: testClassName, methodName: 'passes' }
    );
    contextManager.statusData.pushTestRun(history);
    stubProgress(sandbox);
    sandbox.stub(vscode.window, 'showInformationMessage').resolves(undefined);
    const warning = sandbox.stub(vscode.window, 'showWarningMessage').resolves(undefined);

    await vscode.commands.executeCommand(
      'salesforce-tests.rerunTest',
      contextManager.statusData.getLastTestRunsChildren()[0]
    );
    await waitFor(
      () =>
        testClass.methods[0].status === 'Passed' && contextManager.runTestCancelTokens.length === 0
    );
    assert.deepStrictEqual(testTargets(), [`${testClassName}.passes`]);

    await clearFakeSfInvocations();
    testClass.methods = [];
    await vscode.commands.executeCommand('salesforce-tests.rerunTest', history.getTreeItem());
    assert.deepStrictEqual(testTargets(), []);
    assert.match(String(warning.firstCall.args[0]), /Refresh Apex Tests/);
  });

  it('G8 preserves the last valid method result when execution is rejected', async () => {
    const { contextManager, testClass } = createExecutionContext(['passes']);
    const method = testClass.methods[0];
    method.status = 'Passed';
    method.startTime = new Date('2025-01-01T00:00:00.000Z');
    method.duration = 250;
    await configureFakeSf({
      testRuns: {
        [`${testClassName}.passes`]: {
          json: { status: 1, name: 'Rejected', message: 'Synthetic rejection' },
          exitCode: 1,
        },
      },
    });
    sandbox.stub(vscode.window, 'showErrorMessage').resolves(undefined);
    const cancellation = new vscode.CancellationTokenSource();

    await vscode.commands.executeCommand('salesforce-tests.runTestMethod', {
      testClassName,
      methodName: 'passes',
    });
    await waitFor(() => contextManager.runTestCancelTokens.length === 0);

    assert.strictEqual(method.status, 'Passed');
    assert.deepStrictEqual(method.startTime, new Date('2025-01-01T00:00:00.000Z'));
    assert.strictEqual(method.duration, 250);
    assert.strictEqual(method.executionBlocked, true);
    cancellation.dispose();
  });
});

function classWithMethods(className: string, methodNames: string[]): ApexTestClass {
  const testClass = new ApexTestClass(`id-${className}`, className);
  testClass.methods = methodNames.map((name) => new ApexTestMethod(className, name));
  testClass.methods.sort((left, right) => left.name.localeCompare(right.name));
  return testClass;
}

function createExecutionContext(methodNames: string[]) {
  const contextManager = getNewContextManager();
  const testClass = classWithMethods(testClassName, methodNames);
  contextManager.targetOrg = targetOrg;
  contextManager.statusData.isAuthenticated = true;
  contextManager.statusData.orgWideCoverage = 84;
  contextManager.apexTestsData.testClasses = [testClass];
  contextManager.codeCoverageData.apexClasses = [
    new ApexClass('fixture-class-id', 'FixtureService'),
  ];
  return { contextManager, testClass };
}

function recordsResponse(records: unknown[]) {
  return { json: { status: 0, result: { records } } };
}

function passedResult(target: string) {
  return {
    status: 0,
    result: {
      summary: {
        outcome: 'Passed',
        testStartTime: '2026-01-02T03:04:05.000Z',
        testExecutionTime: '1250',
      },
      tests: [{ FullName: target, Outcome: 'Pass' }],
      coverage: {
        coverage: [{ name: 'FixtureService', totalLines: 10, totalCovered: 9 }],
        summary: { orgWideCoverage: '91%' },
      },
    },
  };
}

function failedClassResult(className: string) {
  return {
    status: 100,
    result: {
      summary: {
        outcome: 'Failed',
        testStartTime: '2026-01-02T03:04:05.000Z',
        testExecutionTime: '875',
      },
      tests: [
        { FullName: `${className}.passes`, Outcome: 'Pass' },
        {
          FullName: `${className}.fails`,
          Outcome: 'Fail',
          Message: 'synthetic assertion',
          StackTrace: `Class.${className}: line 7`,
        },
      ],
    },
  };
}

function stubProgress(sandbox: sinon.SinonSandbox): sinon.SinonStub {
  return sandbox.stub(vscode.window, 'withProgress').callsFake(async (_options, task) => {
    const cancellation = new vscode.CancellationTokenSource();
    try {
      return await task({ report: () => undefined }, cancellation.token);
    } finally {
      cancellation.dispose();
    }
  });
}

function testTargets(): string[] {
  return getFakeSfInvocations()
    .filter(({ operation }) => operation === 'runTest')
    .map(({ args }) => args[args.indexOf('--tests') + 1]);
}
