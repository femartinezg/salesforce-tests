import { defineConfig } from '@vscode/test-cli';
import { rmSync } from 'node:fs';
import { chmod, copyFile, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const extensionRoot = path.dirname(fileURLToPath(import.meta.url));
const runtimeRoot = await mkdtemp(path.join(tmpdir(), 'salesforce-tests-extension-'));
process.once('exit', () => rmSync(runtimeRoot, { recursive: true, force: true }));
const fakeBin = path.join(runtimeRoot, 'bin');
const workspaceRoot = path.join(runtimeRoot, 'workspace');
const homeRoot = path.join(runtimeRoot, 'home');
const tempRoot = path.join(runtimeRoot, 'tmp');
const planPath = path.join(runtimeRoot, 'fake-sf-plan.json');
const logPath = path.join(runtimeRoot, 'fake-sf-invocations.jsonl');
const fixturePlan = path.join(extensionRoot, 'test', 'fixtures', 'fake-sf-plan.json');
const fakeSfSource = path.join(extensionRoot, 'test', 'support', 'fakeSf.cjs');

await Promise.all([
  mkdir(fakeBin, { recursive: true }),
  mkdir(path.join(workspaceRoot, '.sf'), { recursive: true }),
  mkdir(homeRoot, { recursive: true }),
  mkdir(tempRoot, { recursive: true }),
  mkdir(path.join(runtimeRoot, 'xdg-config'), { recursive: true }),
  mkdir(path.join(runtimeRoot, 'xdg-cache'), { recursive: true }),
  mkdir(path.join(runtimeRoot, 'xdg-data'), { recursive: true }),
  mkdir(path.join(runtimeRoot, 'sf-config'), { recursive: true }),
  mkdir(path.join(runtimeRoot, 'sfdx-config'), { recursive: true }),
  mkdir(path.join(runtimeRoot, 'user-data'), { recursive: true }),
  mkdir(path.join(runtimeRoot, 'extensions'), { recursive: true }),
]);
await copyFile(fixturePlan, planPath);
await writeFile(logPath, '', 'utf8');
await writeFile(
  path.join(workspaceRoot, '.sf', 'config.json'),
  '{"target-org":"fixture-org"}\n',
  'utf8'
);

if (process.platform === 'win32') {
  await writeFile(
    path.join(fakeBin, 'sf.cmd'),
    `@"${process.execPath}" "${fakeSfSource}" %*\r\n`,
    'utf8'
  );
} else {
  const executablePath = path.join(fakeBin, 'sf');
  await writeFile(
    executablePath,
    `#!${process.execPath}\nrequire(${JSON.stringify(fakeSfSource)});\n`,
    'utf8'
  );
  await chmod(executablePath, 0o755);
}

const scrubbedSalesforceEnvironment = Object.fromEntries(
  Object.keys(process.env)
    .filter((name) => /^(?:SF|SFDX)_/i.test(name))
    .map((name) => [name, undefined])
);

const isolatedEnvironment = {
  ...scrubbedSalesforceEnvironment,
  PATH: fakeBin,
  HOME: homeRoot,
  USERPROFILE: homeRoot,
  XDG_CONFIG_HOME: path.join(runtimeRoot, 'xdg-config'),
  XDG_CACHE_HOME: path.join(runtimeRoot, 'xdg-cache'),
  XDG_DATA_HOME: path.join(runtimeRoot, 'xdg-data'),
  SF_CONFIG_DIR: path.join(runtimeRoot, 'sf-config'),
  SFDX_CONFIG_DIR: path.join(runtimeRoot, 'sfdx-config'),
  TMPDIR: tempRoot,
  SALESFORCE_TESTS_FAKE_ROOT: runtimeRoot,
  SALESFORCE_TESTS_FAKE_PLAN: planPath,
  SALESFORCE_TESTS_FAKE_LOG: logPath,
  SALESFORCE_TESTS_WORKSPACE: workspaceRoot,
};

export default defineConfig({
  tests: [
    {
      label: 'extension',
      files: 'out/test/**/*.test.js',
      version: '1.100.0',
      workspaceFolder: workspaceRoot,
      launchArgs: [
        `--user-data-dir=${path.join(runtimeRoot, 'user-data')}`,
        `--extensions-dir=${path.join(runtimeRoot, 'extensions')}`,
      ],
      env: isolatedEnvironment,
      mocha: {
        failZero: true,
        forbidOnly: true,
        forbidPending: true,
        ui: 'bdd',
        timeout: 10000,
        parallel: false,
        require: './out/test/support/rootHooks.js',
      },
    },
  ],
  coverage: {
    exclude: [
      path.join(extensionRoot, 'out', 'test', '**'),
      path.join(extensionRoot, 'test', '**'),
    ],
    includeAll: true,
    reporter: ['text'],
    output: 'coverage',
  },
});
