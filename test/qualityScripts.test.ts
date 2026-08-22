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
  it('QA-R5 exposes cross-platform formatting, packaging, audit, and aggregate checks', () => {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(extensionRoot, 'package.json'), 'utf8')
    ) as PackageManifest;

    assert.strictEqual(manifest.scripts.format, 'prettier --write .');
    assert.strictEqual(manifest.scripts['format:check'], 'prettier --check .');
    assert.strictEqual(manifest.scripts.lint, 'eslint src test');
    assert.strictEqual(manifest.scripts['lint:tests'], 'eslint test');
    assert.strictEqual(manifest.scripts.package, 'vsce package');
    assert.strictEqual(manifest.scripts['package:check'], 'node scripts/check-vsix.mjs');
    assert.strictEqual(manifest.scripts['audit:prod'], 'npm audit --omit=dev');
    assert.strictEqual(
      manifest.scripts.check,
      'npm run format:check && npm run lint && npm test && npm run package:check'
    );
    assert.doesNotMatch(manifest.scripts.check, /\bnpm ci\b/);
    assert.strictEqual(manifest.devDependencies?.['@vscode/vsce'], '3.9.2');
    assert.strictEqual(manifest.devDependencies?.jszip, '3.10.1');
    assert.ok(fs.existsSync(path.join(extensionRoot, 'scripts', 'check-vsix.mjs')));
  });

  it('keeps local environment and Salesforce state out of Git and packaging', () => {
    const gitIgnore = new Set(
      fs
        .readFileSync(path.join(extensionRoot, '.gitignore'), 'utf8')
        .split(/\r?\n/u)
        .filter((entry) => entry.length > 0)
    );
    const vscodeIgnore = new Set(
      fs
        .readFileSync(path.join(extensionRoot, '.vscodeignore'), 'utf8')
        .split(/\r?\n/u)
        .filter((entry) => entry.length > 0)
    );

    assert.ok(gitIgnore.has('.env'));
    assert.ok(gitIgnore.has('.sf/'));
    assert.ok(gitIgnore.has('.sfdx/'));
    assert.ok(!gitIgnore.has('ignore'));
    assert.ok(vscodeIgnore.has('scripts/**'));
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
    assert.strictEqual(manifest.devDependencies?.['@types/vscode'], '1.100.0');
    assert.match(testConfig, /version: '1\.100\.0'/);
  });
});
