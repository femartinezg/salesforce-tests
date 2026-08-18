import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

interface RunSfResult {
  stdout: string;
  error?: Error;
}

interface RunSfOptions {
  maxBuffer?: number;
}

interface SfRunnerModule {
  runSf(args: string[], options?: RunSfOptions): Promise<RunSfResult>;
}

const sfRunner = require('../src/common/sfRunner') as SfRunnerModule;

describe('runSf', () => {
  let temporaryDirectory: string;
  let originalPath: string | undefined;

  beforeEach(() => {
    temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'salesforce-tests-sf-runner-'));
    originalPath = process.env.PATH;

    const executablePath = path.join(
      temporaryDirectory,
      process.platform === 'win32' ? 'sf.cmd' : 'sf'
    );
    if (process.platform === 'win32') {
      fs.writeFileSync(
        executablePath,
        '@echo off\r\n"'
          + process.execPath
          + '" "'
          + path.join(temporaryDirectory, 'fake-sf.js')
          + '" %*\r\n'
      );
      fs.writeFileSync(path.join(temporaryDirectory, 'fake-sf.js'), fakeSfSource());
    } else {
      fs.writeFileSync(executablePath, `#!${process.execPath}\n${fakeSfSource()}`);
      fs.chmodSync(executablePath, 0o755);
    }

    process.env.PATH = `${temporaryDirectory}${path.delimiter}${originalPath ?? ''}`;
  });

  afterEach(() => {
    if (originalPath === undefined) {
      delete process.env.PATH;
    } else {
      process.env.PATH = originalPath;
    }
    delete process.env.FAKE_SF_MODE;
    delete process.env.FAKE_SF_MARKER;
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  });

  it('runs the fixed sf command from PATH and passes every argument literally', async () => {
    const marker = path.join(temporaryDirectory, 'injected');
    const untrustedArgument = `$(touch ${marker})`;

    const result = await sfRunner.runSf(['apex', 'test', 'run', '--tests', untrustedArgument]);

    assert.strictEqual(result.error, undefined);
    assert.deepStrictEqual(JSON.parse(result.stdout), [
      'apex',
      'test',
      'run',
      '--tests',
      untrustedArgument,
    ]);
    assert.strictEqual(fs.existsSync(marker), false);
  });

  it('rejects non-text arguments before starting sf', async () => {
    const marker = path.join(temporaryDirectory, 'started');
    process.env.FAKE_SF_MARKER = marker;

    await assert.rejects(sfRunner.runSf([123] as unknown as string[]), /argument.*text/i);
    assert.strictEqual(fs.existsSync(marker), false);
  });

  it('rejects NUL, CR, and LF before starting sf', async () => {
    const marker = path.join(temporaryDirectory, 'started');
    process.env.FAKE_SF_MARKER = marker;

    for (const argument of ['nul\0argument', 'cr\rargument', 'lf\nargument']) {
      await assert.rejects(sfRunner.runSf([argument]), /argument.*(nul|cr|lf|control)/i);
    }
    assert.strictEqual(fs.existsSync(marker), false);
  });

  it('preserves stdout and reports a non-zero exit as an error', async () => {
    process.env.FAKE_SF_MODE = 'nonzero';

    const result = await sfRunner.runSf(['org', 'display', '--json']);

    assert.strictEqual(result.stdout, '{"status":1}');
    assert.ok(result.error instanceof Error);
    assert.match(result.error.message, /exit|status|code|failure/i);
  });

  it('reports a missing sf executable without fabricating stdout', async () => {
    process.env.PATH = path.join(temporaryDirectory, 'missing');

    const result = await sfRunner.runSf(['org', 'display', '--json']);

    assert.strictEqual(result.stdout, '');
    assert.ok(result.error instanceof Error);
  });

  it('enforces the requested stdout limit', async () => {
    process.env.FAKE_SF_MODE = 'large';

    const result = await sfRunner.runSf(['data', 'query'], { maxBuffer: 4 });

    assert.ok(result.error instanceof Error);
    assert.match(result.error.message, /buffer|stdout|output/i);
  });
});

function fakeSfSource(): string {
  return `
const fs = require('fs');

if (process.env.FAKE_SF_MARKER) {
  fs.writeFileSync(process.env.FAKE_SF_MARKER, 'started');
}

switch (process.env.FAKE_SF_MODE) {
  case 'nonzero':
    process.stdout.write('{"status":1}');
    process.stderr.write('failure from sf');
    process.exitCode = 7;
    break;
  case 'large':
    process.stdout.write('12345');
    break;
  default:
    process.stdout.write(JSON.stringify(process.argv.slice(2)));
}
`;
}
