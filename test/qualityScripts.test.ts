import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { extensionRoot } from './support/extensionHarness';

interface PackageManifest {
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
});
