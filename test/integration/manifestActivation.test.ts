import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import sinon = require('sinon');
import { ApexClass, ApexTestClass } from '../../src/classes/Apex';
import { getContextManager } from '../../src/common';
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
      activitybar: Array<{ id: string; title: string }>;
    };
    views: Record<string, Array<{ id: string; name: string }>>;
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
  });

  it('A3 keeps data-dependent actions disabled and all three views empty while loading', async () => {
    const manifest = readManifest();
    const enablementByCommand = new Map(
      manifest.contributes.commands.map(({ command, enablement }) => [command, enablement])
    );
    const contextManager = getContextManager();

    contextManager.statusData.reset();
    contextManager.apexTestsData.reset();
    contextManager.codeCoverageData.reset();

    assert.deepStrictEqual(await contextManager.statusData.getChildren(), []);
    assert.deepStrictEqual(await contextManager.apexTestsData.getChildren(), []);
    assert.deepStrictEqual(await contextManager.codeCoverageData.getChildren(), []);
    assert.match(enablementByCommand.get('salesforce-tests.refreshOrg') ?? '', /!statusLoading/);
    for (const command of [
      'salesforce-tests.runTestClass',
      'salesforce-tests.refreshApexTests',
      'salesforce-tests.findTest',
    ]) {
      assert.match(enablementByCommand.get(command) ?? '', /!apexTestsLoading/);
    }
    for (const command of ['salesforce-tests.refreshCodeCoverage', 'salesforce-tests.findClass']) {
      assert.match(enablementByCommand.get(command) ?? '', /!codeCoverageLoading/);
    }

    contextManager.statusData.isAuthenticated = true;
    contextManager.statusData.username = 'fixture.user@example.invalid';
    contextManager.apexTestsData.testClasses = [
      new ApexTestClass('fixture-test-id', 'FixturePassingTest'),
    ];
    contextManager.codeCoverageData.apexClasses = [
      new ApexClass('fixture-class-id', 'FixtureService'),
    ];

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
      sandbox.stub(vscode.commands, 'executeCommand').callsFake(async (command: string) => {
        delegatedCommands.push(command);
        return undefined;
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
