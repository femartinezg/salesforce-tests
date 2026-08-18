import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import * as sinon from 'sinon';
import { ApexClass, ApexTestClass } from '../../src/classes/Apex';
import { getContextManager, getNewContextManager } from '../../src/common';
import {
  activateExtension,
  extensionRoot,
  resetFakeSf,
  wasInitialLoadObservedDuringActivation,
  waitFor,
} from '../support/extensionHarness';

interface CommandContribution {
  command: string;
  enablement?: string;
}

interface ExtensionManifest {
  contributes: {
    commands: CommandContribution[];
    viewsContainers: {
      activitybar: { id: string; title: string }[];
    };
    views: Record<string, { id: string; name: string }[]>;
    viewsWelcome: { view: string; contents: string }[];
  };
}

describe('A. VS Code integration and navigation', () => {
  let sandbox: sinon.SinonSandbox;

  before(async () => {
    await resetFakeSf();
    await activateExtension();
    await waitFor(() => getContextManager().apexTestsData.testClasses !== undefined);
  });

  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });

  afterEach(() => {
    sandbox.restore();
  });

  it('A1 contributes exactly the Salesforce Tests container and its three views', () => {
    const manifest = readManifest();

    assert.deepStrictEqual(manifest.contributes.viewsContainers.activitybar, [
      { id: 'sfTests', title: 'Salesforce Tests', icon: '$(beaker)' },
    ]);
    assert.deepStrictEqual(
      manifest.contributes.views.sfTests.map(({ id, name }) => ({ id, name })),
      [
        { id: 'statusTreeView', name: 'Status' },
        { id: 'apexTestsTreeView', name: 'Apex Tests' },
        { id: 'codeCoverageTreeView', name: 'Code Coverage' },
      ]
    );
    assert.deepStrictEqual(Object.keys(manifest.contributes.views), ['sfTests']);
  });

  it('A2 activates all three providers, registers the six commands, and starts initial loading', async () => {
    const expectedCommands = [
      'salesforce-tests.findClass',
      'salesforce-tests.findTest',
      'salesforce-tests.refreshApexTests',
      'salesforce-tests.refreshCodeCoverage',
      'salesforce-tests.refreshOrg',
      'salesforce-tests.runTestClass',
    ];
    const registeredCommands = await vscode.commands.getCommands(true);
    const contextManager = getContextManager();

    assert.deepStrictEqual(
      registeredCommands.filter((command) => command.startsWith('salesforce-tests.')).sort(),
      expectedCommands
    );
    assert.ok(contextManager.statusData);
    assert.ok(contextManager.apexTestsData);
    assert.ok(contextManager.codeCoverageData);
    assert.strictEqual(wasInitialLoadObservedDuringActivation(), true);
    assert.notStrictEqual(contextManager.statusData.isAuthenticated, undefined);
    assert.notStrictEqual(contextManager.apexTestsData.testClasses, undefined);
    assert.notStrictEqual(contextManager.codeCoverageData.apexClasses, undefined);

    const registerProvider = sandbox.stub(vscode.window, 'registerTreeDataProvider');
    const isolatedContext = getNewContextManager();
    assert.deepStrictEqual(
      registerProvider.getCalls().map(({ args }) => args[0]),
      ['statusTreeView', 'apexTestsTreeView', 'codeCoverageTreeView']
    );
    assert.strictEqual(registerProvider.firstCall.args[1], isolatedContext.statusData);
    assert.strictEqual(registerProvider.secondCall.args[1], isolatedContext.apexTestsData);
    assert.strictEqual(registerProvider.thirdCall.args[1], isolatedContext.codeCoverageData);
  });

  it('A3 keeps data-dependent actions disabled and all three views empty while loading', async () => {
    const manifest = readManifest();
    const enablementByCommand = new Map(
      manifest.contributes.commands.map(({ command, enablement }) => [command, enablement])
    );
    const contextManager = getContextManager();
    const setContext = sandbox.stub(vscode.commands, 'executeCommand').resolves(undefined);

    contextManager.statusData.reset();
    contextManager.apexTestsData.reset();
    contextManager.codeCoverageData.reset();

    assert.deepStrictEqual(
      setContext.getCalls().map(({ args }) => args),
      [
        ['setContext', 'statusLoading', true],
        ['setContext', 'apexTestsLoading', true],
        ['setContext', 'codeCoverageLoading', true],
      ]
    );
    assert.deepStrictEqual(await contextManager.statusData.getChildren(), []);
    assert.deepStrictEqual(await contextManager.apexTestsData.getChildren(), []);
    assert.deepStrictEqual(await contextManager.codeCoverageData.getChildren(), []);
    assert.strictEqual(
      enablementByCommand.get('salesforce-tests.runTestClass'),
      '!apexTestsLoading'
    );
    assert.strictEqual(enablementByCommand.get('salesforce-tests.refreshOrg'), '!statusLoading');
    assert.strictEqual(
      enablementByCommand.get('salesforce-tests.refreshApexTests'),
      'view == apexTestsTreeView && !apexTestsLoading'
    );
    assert.strictEqual(
      enablementByCommand.get('salesforce-tests.findTest'),
      'view == apexTestsTreeView && !apexTestsLoading'
    );
    assert.strictEqual(
      enablementByCommand.get('salesforce-tests.refreshCodeCoverage'),
      'view == codeCoverageTreeView && !codeCoverageLoading'
    );
    assert.strictEqual(
      enablementByCommand.get('salesforce-tests.findClass'),
      'view == codeCoverageTreeView && !codeCoverageLoading'
    );
    assert.deepStrictEqual(manifest.contributes.viewsWelcome, [
      { view: 'statusTreeView', contents: 'Loading...' },
      { view: 'apexTestsTreeView', contents: 'Loading...' },
      { view: 'codeCoverageTreeView', contents: 'Loading...' },
    ]);

    contextManager.statusData.isAuthenticated = true;
    contextManager.statusData.username = 'fixture.user@example.invalid';
    contextManager.apexTestsData.testClasses = [
      new ApexTestClass('fixture-test-id', 'FixturePassingTest'),
    ];
    contextManager.codeCoverageData.apexClasses = [
      new ApexClass('fixture-class-id', 'FixtureService'),
    ];

    assert.deepStrictEqual(
      setContext
        .getCalls()
        .slice(3)
        .map(({ args }) => args),
      [
        ['setContext', 'statusLoading', false],
        ['setContext', 'apexTestsLoading', false],
        ['setContext', 'codeCoverageLoading', false],
      ]
    );
    assert.strictEqual((await contextManager.statusData.getChildren()).length, 2);
    assert.strictEqual((await contextManager.apexTestsData.getChildren()).length, 1);
    assert.strictEqual((await contextManager.codeCoverageData.getChildren()).length, 1);
  });

  for (const scenario of [
    {
      id: 'A4.1',
      extensionCommand: 'salesforce-tests.findTest',
      focusCommand: 'apexTestsTreeView.focus',
    },
    {
      id: 'A4.2',
      extensionCommand: 'salesforce-tests.findClass',
      focusCommand: 'codeCoverageTreeView.focus',
    },
  ]) {
    it(`${scenario.id} focuses the intended view before opening list search`, async () => {
      const executeRegisteredCommand = vscode.commands.executeCommand.bind(vscode.commands);
      const delegatedCommands: string[] = [];
      sandbox.stub(vscode.commands, 'executeCommand').callsFake((command: string) => {
        delegatedCommands.push(command);
        return Promise.resolve(undefined);
      });

      await executeRegisteredCommand(scenario.extensionCommand);

      assert.deepStrictEqual(delegatedCommands, [scenario.focusCommand, 'list.find']);
    });
  }
});

function readManifest(): ExtensionManifest {
  return JSON.parse(
    fs.readFileSync(path.join(extensionRoot, 'package.json'), 'utf8')
  ) as ExtensionManifest;
}
