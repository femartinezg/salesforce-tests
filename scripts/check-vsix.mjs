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
    'extension/images/preview.gif',
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

  const previewEntry = archive.file('extension/images/preview.gif');
  assert.ok(previewEntry, 'VSIX is missing the README preview');
  const preview = await previewEntry.async('nodebuffer');
  assert.ok(
    ['GIF87a', 'GIF89a'].includes(preview.toString('ascii', 0, 6)),
    'Packaged preview is not a GIF'
  );
  assert.strictEqual(preview.readUInt16LE(6), 1200, 'Packaged preview width must be 1200');
  assert.strictEqual(preview.readUInt16LE(8), 800, 'Packaged preview height must be 800');
  assert.ok(preview.length <= 2 * 1024 * 1024, 'Packaged preview must not exceed 2 MiB');

  const frameDelays = [];
  for (let index = 0; index <= preview.length - 8; index++) {
    if (preview[index] === 0x21 && preview[index + 1] === 0xf9 && preview[index + 2] === 0x04) {
      frameDelays.push(preview.readUInt16LE(index + 4));
    }
  }
  assert.ok(frameDelays.length >= 2, 'Packaged preview is not an animated GIF');
  const previewDurationMs = frameDelays.reduce((total, delay) => total + delay, 0) * 10;
  assert.ok(
    previewDurationMs >= 5000 && previewDurationMs <= 20000,
    'Packaged preview duration must stay between 5 and 20 seconds'
  );

  console.log(
    `Verified VSIX: ${files.length} files, 256x256 icon, 1200x800 animated preview, runtime-only contents.`
  );
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
