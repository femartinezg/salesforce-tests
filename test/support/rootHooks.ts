import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

export const mochaHooks: Mocha.RootHookObject = {
  beforeAll() {
    const runtimeRoot = requiredEnvironment('SALESFORCE_TESTS_FAKE_ROOT');
    const workspaceRoot = requiredEnvironment('SALESFORCE_TESTS_WORKSPACE');
    const fakeBin = path.join(runtimeRoot, 'bin');

    assert.strictEqual(process.env.PATH, fakeBin, 'PATH must expose only the synthetic sf binary');
    for (const variable of [
      'HOME',
      'USERPROFILE',
      'XDG_CONFIG_HOME',
      'XDG_CACHE_HOME',
      'XDG_DATA_HOME',
      'SF_CONFIG_DIR',
    ]) {
      assertPathWithin(requiredEnvironment(variable), runtimeRoot, variable);
    }
    assertPathWithin(requiredEnvironment('TMPDIR'), runtimeRoot, 'TMPDIR');
    assert.strictEqual(vscode.workspace.workspaceFolders?.length, 1);
    assert.strictEqual(vscode.workspace.workspaceFolders[0].uri.fsPath, workspaceRoot);
  },

  afterAll() {
    const runtimeRoot = process.env.SALESFORCE_TESTS_FAKE_ROOT;
    if (runtimeRoot) {
      fs.rmSync(runtimeRoot, { recursive: true, force: true });
    }
  },
};

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function assertPathWithin(candidate: string, parent: string, label: string): void {
  const relative = path.relative(parent, candidate);
  assert.ok(
    relative.length > 0 && !relative.startsWith('..') && !path.isAbsolute(relative),
    `${label} must be isolated below the synthetic runtime root`
  );
}
