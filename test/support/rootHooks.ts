import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

export function mochaGlobalSetup(): void {
  const runtimeRoot = requiredEnvironment('SALESFORCE_TESTS_FAKE_ROOT');
  const workspaceRoot = requiredEnvironment('SALESFORCE_TESTS_WORKSPACE');
  const fakeBin = path.join(runtimeRoot, 'bin');

  assertPathWithin(
    runtimeRoot,
    requiredEnvironment('SALESFORCE_TESTS_SYSTEM_TMP'),
    'synthetic runtime root'
  );
  assert.match(path.basename(runtimeRoot), /^salesforce-tests-extension-/);
  assertPathWithin(fakeBin, runtimeRoot, 'fake binary directory');
  assert.ok(
    fs.existsSync(path.join(fakeBin, process.platform === 'win32' ? 'sf.cmd' : 'sf')),
    'The isolated PATH must contain the synthetic sf executable'
  );
  assertSyntheticSfPrecedesAnyHostPath(fakeBin);
  for (const variable of [
    'HOME',
    'USERPROFILE',
    'XDG_CONFIG_HOME',
    'XDG_CACHE_HOME',
    'XDG_DATA_HOME',
    'SF_CONFIG_DIR',
    'SFDX_CONFIG_DIR',
  ]) {
    assertPathWithin(requiredEnvironment(variable), runtimeRoot, variable);
  }
  assertPathWithin(requiredEnvironment('TMPDIR'), runtimeRoot, 'TMPDIR');
  assertPathWithin(requiredEnvironment('SALESFORCE_TESTS_FAKE_PLAN'), runtimeRoot, 'fake plan');
  assertPathWithin(
    requiredEnvironment('SALESFORCE_TESTS_FAKE_LOG'),
    runtimeRoot,
    'fake invocation log'
  );
  assertPathWithin(workspaceRoot, runtimeRoot, 'workspace');
  assert.deepStrictEqual(
    Object.keys(process.env).filter(
      (name) => /^(?:SF|SFDX)_/i.test(name) && !['SF_CONFIG_DIR', 'SFDX_CONFIG_DIR'].includes(name)
    ),
    [],
    'Real Salesforce environment variables must not reach the Extension Host'
  );
  assert.strictEqual(vscode.workspace.workspaceFolders?.length, 1);
  assert.strictEqual(vscode.workspace.workspaceFolders[0].uri.fsPath, workspaceRoot);

  process.env.SALESFORCE_TESTS_ISOLATION_VERIFIED = runtimeRoot;
}

export function mochaGlobalTeardown(): void {
  delete process.env.SALESFORCE_TESTS_ISOLATION_VERIFIED;
  const runtimeRoot = process.env.SALESFORCE_TESTS_FAKE_ROOT;
  if (runtimeRoot) {
    fs.rmSync(runtimeRoot, { recursive: true, force: true });
  }
}

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function assertPathWithin(candidate: string, parent: string, label: string): void {
  const relative = path.relative(fs.realpathSync(parent), fs.realpathSync(candidate));
  assert.ok(
    relative.length > 0 && !relative.startsWith('..') && !path.isAbsolute(relative),
    `${label} must be isolated below the synthetic runtime root`
  );
}

function assertSyntheticSfPrecedesAnyHostPath(fakeBin: string): void {
  const pathEntries = requiredEnvironment('PATH').split(path.delimiter);
  assert.ok(
    pathEntries.every(Boolean),
    'PATH must not contain an implicit working-directory entry'
  );
  assert.strictEqual(
    fs.realpathSync(pathEntries[0]),
    fs.realpathSync(fakeBin),
    'The synthetic sf directory must be first on PATH'
  );

  const executableNames =
    process.platform === 'win32' ? ['sf.exe', 'sf.cmd', 'sf.bat', 'sf.com'] : ['sf'];
  for (const hostPath of pathEntries.slice(1)) {
    for (const executableName of executableNames) {
      assert.ok(
        !fs.existsSync(path.join(hostPath, executableName)),
        `Host PATH must not expose another ${executableName} executable`
      );
    }
  }
}
