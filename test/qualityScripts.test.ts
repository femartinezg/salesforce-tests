import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { extensionRoot } from './support/extensionHarness';

interface PackageManifest {
  capabilities?: {
    untrustedWorkspaces?: {
      supported?: boolean;
      description?: string;
    };
  };
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  engines?: Record<string, string>;
  scripts: Record<string, string>;
}

describe('Local quality checks', () => {
  it('QA-R5 exposes one dependency-free cross-platform check command', () => {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(extensionRoot, 'package.json'), 'utf8')
    ) as PackageManifest;

    assert.strictEqual(manifest.scripts.lint, 'eslint src test');
    assert.strictEqual(manifest.scripts['lint:tests'], 'eslint test');
    assert.strictEqual(
      manifest.scripts.check,
      'npm run compile && npm run lint && npm run test:extension'
    );
    assert.doesNotMatch(manifest.scripts.check, /\bnpm ci\b/);
  });

  it('does not declare the unused Salesforce Core production dependency', () => {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(extensionRoot, 'package.json'), 'utf8')
    ) as PackageManifest;
    const packageLock = fs.readFileSync(path.join(extensionRoot, 'package-lock.json'), 'utf8');

    assert.strictEqual(manifest.dependencies?.['@salesforce/core'], undefined);
    assert.doesNotMatch(packageLock, /"@salesforce\/core"/);
    assert.doesNotMatch(packageLock, /node_modules\/@salesforce\/core/);
  });

  it('declares that untrusted workspaces are unsupported with an explanation', () => {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(extensionRoot, 'package.json'), 'utf8')
    ) as PackageManifest;

    assert.deepStrictEqual(manifest.capabilities?.untrustedWorkspaces, {
      supported: false,
      description: 'The extension executes Salesforce CLI commands using workspace configuration.',
    });
  });

  it('keeps the supported VS Code and test-host baseline aligned', () => {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(extensionRoot, 'package.json'), 'utf8')
    ) as PackageManifest;
    const testConfig = fs.readFileSync(path.join(extensionRoot, '.vscode-test.mjs'), 'utf8');

    assert.strictEqual(manifest.engines?.vscode, '^1.100.0');
    assert.strictEqual(manifest.devDependencies?.['@types/vscode'], '^1.100.0');
    assert.match(testConfig, /version: '1\.100\.0'/);
  });
});
