import * as assert from 'assert';
import * as vscode from 'vscode';
import { ApexTestClass } from '../src/classes/Apex';
import { TestRun } from '../src/classes/TestRun';
import { ContextManager } from '../src/common/ContextManager';
import { formatDuration } from '../src/common/utils';
import { StatusTreeViewProvider } from '../src/views/StatusTreeViewProvider';

describe('History, timing, states, and output', () => {
  it('F1 shows the empty history and retains only the five latest completed runs', () => {
    const provider = new StatusTreeViewProvider();

    const emptyHistory = provider.getLastTestRunsChildren();
    assert.strictEqual(emptyHistory.length, 1);
    assert.strictEqual(emptyHistory[0].description, 'No test runs yet');

    for (let index = 1; index <= 6; index++) {
      provider.pushTestRun(
        new TestRun(
          `Run${index}`,
          'Test Class',
          true,
          new Date(2026, 0, index, 12, 0, 0),
          index * 100
        )
      );
    }

    assert.strictEqual(provider.testRuns.length, 5);
    assert.deepStrictEqual(
      provider.testRuns.map((run) => run.name),
      ['Run6', 'Run5', 'Run4', 'Run3', 'Run2']
    );
    assert.deepStrictEqual(
      provider.getLastTestRunsChildren().map((item) => item.label),
      ['Run6', 'Run5', 'Run4', 'Run3', 'Run2']
    );
  });

  it('F2 distinguishes Passed and Failed history entries with name, start, and duration', () => {
    const start = new Date(2026, 0, 2, 3, 4, 5);
    const passed = new TestRun('PassingTest', 'Test Class', true, start, 1250).getTreeItem();
    const failed = new TestRun('FailingTest', 'Test Class', false, start, 2500).getTreeItem();

    assert.strictEqual(passed.label, 'PassingTest');
    assert.strictEqual(themeIcon(passed).id, 'check');
    assert.match(String(passed.description), /03:04:05 \(1\.25s\)$/);
    assert.strictEqual(
      passed.tooltip,
      '✓ PassingTest\nStart Time: 02/01/2026 03:04:05\nExecution Time: 1250ms'
    );

    assert.strictEqual(failed.label, 'FailingTest');
    assert.strictEqual(themeIcon(failed).id, 'x');
    assert.match(String(failed.description), /03:04:05 \(2\.50s\)$/);
    assert.strictEqual(
      failed.tooltip,
      '✕ FailingTest\nStart Time: 02/01/2026 03:04:05\nExecution Time: 2500ms'
    );
  });

  it('F3 uses time today, date and time for older runs, and exact duration boundaries', () => {
    const instant = '2026-08-18T13:14:15.000Z';
    const reference = new Date(instant);
    const today = new Date(
      reference.getFullYear(),
      reference.getMonth(),
      reference.getDate(),
      9,
      8,
      7
    );
    const differentDay = reference.getDate() === 1 ? 2 : 1;
    const old = new Date(2000, 0, differentDay, 6, 5, 4);

    const [todayItem, oldItem] = withFixedNow(instant, () => [
      new TestRun('Today', 'Test Class', true, today, 999).getTreeItem(),
      new TestRun('Old', 'Test Class', true, old, 60000).getTreeItem(),
    ]);

    assert.strictEqual(todayItem.description, '09:08:07 (999ms)');
    assert.strictEqual(
      oldItem.description,
      `${differentDay.toString().padStart(2, '0')}/01/2000 06:05:04 (1m00s)`
    );
    assert.strictEqual(formatDuration(999), '999ms');
    assert.strictEqual(formatDuration(1000), '1.00s');
    assert.strictEqual(formatDuration(1500), '1.50s');
    assert.strictEqual(formatDuration(60000), '1m00s');
    assert.strictEqual(formatDuration(65000), '1m05s');
  });

  it('F4 presents initial, Running, Passed, Failed, and blocked class states', () => {
    const initial = new ApexTestClass('01p-initial', 'InitialTest').getTreeItem();
    assert.strictEqual(themeIcon(initial).id, 'circle-large-outline');
    assert.strictEqual(initial.description, '');
    assert.strictEqual(initial.tooltip, 'InitialTest');

    const running = new ApexTestClass('01p-running', 'RunningTest', 'Running').getTreeItem();
    assert.strictEqual(themeIcon(running).id, 'sync');
    assert.strictEqual(running.description, 'Running...');
    assert.strictEqual(running.tooltip, 'RunningTest');

    const passed = completedTest('PassedTest', 'Passed', false).getTreeItem();
    assert.strictEqual(themeIcon(passed).id, 'pass');
    assert.strictEqual(themeIcon(passed).color?.id, 'testing.iconPassed');
    assert.strictEqual(passed.description, '03:04:05 (1.50s)');
    assert.match(stringTooltip(passed), /^✓ PassedTest/);
    assert.match(stringTooltip(passed), /Execution Time: 1500 ms/);

    const failed = completedTest('FailedTest', 'Failed', false).getTreeItem();
    assert.strictEqual(themeIcon(failed).id, 'error');
    assert.strictEqual(themeIcon(failed).color?.id, 'testing.iconFailed');
    assert.strictEqual(failed.description, '03:04:05 (1.50s)');
    assert.match(stringTooltip(failed), /^✕ FailedTest/);

    const blocked = completedTest('BlockedTest', 'Passed', true).getTreeItem();
    assert.strictEqual(themeIcon(blocked).id, 'pass');
    assert.strictEqual(blocked.description, '⚠ 03:04:05 (1.50s)');
    assert.match(stringTooltip(blocked), /⚠ Last execution was blocked\.$/);
  });

  it('F5 timestamps lifecycle output and indents subsequent result lines', () => {
    const contextManager = ContextManager.resetInstance();
    const originalOutputChannel = ContextManager.outputChannel;
    let output = '';
    ContextManager.outputChannel = {
      append(value: string) {
        output += value;
      },
    } as unknown as vscode.OutputChannel;
    const instant = '2026-08-18T13:14:15.000Z';
    const expectedTime = new Date(instant).toLocaleTimeString('en-US', { hour12: false });

    try {
      withFixedNow(instant, () => {
        contextManager.printOutput('Salesforce Tests extension activated');
        contextManager.printOutput('Connected to org: fixture-org');
        contextManager.printOutput('Running OutputTest');
        contextManager.printOutput([
          'OutputTest result',
          '✓ Passed',
          'TestStartTime: fixture | TestExecutionTime: 1250',
        ]);
      });
    } finally {
      ContextManager.outputChannel = originalOutputChannel;
    }

    assert.strictEqual(
      output,
      `[${expectedTime}] Salesforce Tests extension activated\n`
        + `[${expectedTime}] Connected to org: fixture-org\n`
        + `[${expectedTime}] Running OutputTest\n`
        + `[${expectedTime}] OutputTest result\n`
        + '           ✓ Passed\n'
        + '           TestStartTime: fixture | TestExecutionTime: 1250\n'
    );
  });
});

function completedTest(name: string, status: 'Passed' | 'Failed', blocked: boolean): ApexTestClass {
  const testClass = new ApexTestClass('01p-completed', name, status);
  testClass.startTime = new Date(2026, 0, 2, 3, 4, 5);
  testClass.duration = 1500;
  testClass.executionBlocked = blocked;
  return testClass;
}

function themeIcon(item: vscode.TreeItem): vscode.ThemeIcon {
  assert.ok(item.iconPath instanceof vscode.ThemeIcon);
  return item.iconPath;
}

function stringTooltip(item: vscode.TreeItem): string {
  const tooltip = item.tooltip;
  if (typeof tooltip !== 'string') assert.fail('Expected a string tooltip');
  return tooltip;
}

function withFixedNow<T>(instant: string, operation: () => T): T {
  const OriginalDate = Date;
  class FixedDate extends OriginalDate {
    constructor(value?: string | number) {
      super(value ?? instant);
    }

    static now(): number {
      return new OriginalDate(instant).getTime();
    }
  }

  globalThis.Date = FixedDate as DateConstructor;
  try {
    return operation();
  } finally {
    globalThis.Date = OriginalDate;
  }
}
