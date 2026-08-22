import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vsce from '@vscode/vsce';
import JSZip from 'jszip';

const extensionRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temporaryRoot = await mkdtemp(path.join(tmpdir(), 'salesforce-tests-vsix-'));
const packagePath = path.join(temporaryRoot, 'salesforce-tests.vsix');

try {
  await vsce.createVSIX({ cwd: extensionRoot, packagePath });

  const archive = await JSZip.loadAsync(await readFile(packagePath));
  const files = Object.values(archive.files)
    .filter((entry) => !entry.dir)
    .map((entry) => entry.name);
  const fileNames = new Set(files);

  const requiredFiles = [
    '[Content_Types].xml',
    'extension.vsixmanifest',
    'extension/LICENSE.txt',
    'extension/changelog.md',
    'extension/package.json',
    'extension/readme.md',
    'extension/images/icon.png',
    'extension/out/src/extension.js',
  ];
  for (const requiredFile of requiredFiles) {
    assert.ok(fileNames.has(requiredFile), `VSIX is missing ${requiredFile}`);
  }

  const forbiddenFiles = [
    'extension/.env',
    'extension/.gitignore',
    'extension/.prettierignore',
    'extension/.vscode-test.mjs',
    'extension/images/icon-master.png',
  ];
  for (const forbiddenFile of forbiddenFiles) {
    assert.ok(!fileNames.has(forbiddenFile), `VSIX includes ${forbiddenFile}`);
  }

  const forbiddenPrefixes = [
    'extension/.vscode/',
    'extension/out/test/',
    'extension/scripts/',
    'extension/src/',
    'extension/test/',
  ];
  for (const fileName of files) {
    assert.ok(
      !forbiddenPrefixes.some((prefix) => fileName.startsWith(prefix)),
      `VSIX includes development file ${fileName}`
    );
    assert.ok(!fileName.endsWith('.map'), `VSIX includes source map ${fileName}`);
  }

  const manifestEntry = archive.file('extension/package.json');
  assert.ok(manifestEntry, 'VSIX is missing its packaged manifest');
  const manifest = JSON.parse(await manifestEntry.async('string'));
  assert.strictEqual(manifest.main, './out/src/extension.js');
  assert.strictEqual(manifest.icon, 'images/icon.png');

  for (const dependency of Object.keys(manifest.dependencies ?? {})) {
    assert.ok(
      fileNames.has(`extension/node_modules/${dependency}/package.json`),
      `VSIX is missing production dependency ${dependency}`
    );
  }

  const iconEntry = archive.file(`extension/${manifest.icon}`);
  assert.ok(iconEntry, 'VSIX is missing the manifest icon');
  const icon = await iconEntry.async('nodebuffer');
  assert.deepStrictEqual(
    icon.subarray(0, 8),
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    'Packaged icon is not a PNG'
  );
  assert.strictEqual(icon.toString('ascii', 12, 16), 'IHDR');
  assert.strictEqual(icon.readUInt32BE(16), 256, 'Packaged icon width must be 256');
  assert.strictEqual(icon.readUInt32BE(20), 256, 'Packaged icon height must be 256');

  console.log(`Verified VSIX: ${files.length} files, 256x256 icon, runtime-only contents.`);
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
