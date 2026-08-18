import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

type FixtureKind = 'apex' | 'coverage' | 'testRun';

const managedEnvironmentVariables = [
  'PATH',
  'HOME',
  'USERPROFILE',
  'XDG_CONFIG_HOME',
  'MODELS_SF_APEX_RECORDS',
  'MODELS_SF_COVERAGE_RECORDS',
  'MODELS_SF_TEST_RESULT',
  'MODELS_SF_APEX_GATE',
  'MODELS_SF_COVERAGE_GATE',
  'MODELS_SF_TEST_GATE',
  'MODELS_SF_INVOCATIONS',
] as const;

export class ModelsSfHarness {
  private readonly originalEnvironment = new Map<string, string | undefined>();
  private readonly gates = new Map<FixtureKind, string>();
  readonly temporaryDirectory: string;
  readonly invocationsPath: string;

  constructor() {
    this.temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'salesforce-tests-models-'));
    this.invocationsPath = path.join(this.temporaryDirectory, 'invocations.jsonl');

    for (const variable of managedEnvironmentVariables) {
      this.originalEnvironment.set(variable, process.env[variable]);
    }

    const homeDirectory = path.join(this.temporaryDirectory, 'home');
    fs.mkdirSync(homeDirectory);
    process.env.HOME = homeDirectory;
    process.env.USERPROFILE = homeDirectory;
    process.env.XDG_CONFIG_HOME = path.join(homeDirectory, '.config');
    process.env.MODELS_SF_INVOCATIONS = this.invocationsPath;

    this.writeFakeExecutable();
    process.env.PATH = this.temporaryDirectory;
  }

  setApexRecords(records: unknown[]): void {
    process.env.MODELS_SF_APEX_RECORDS = JSON.stringify(records);
  }

  setCoverageRecords(records: unknown[]): void {
    process.env.MODELS_SF_COVERAGE_RECORDS = JSON.stringify(records);
  }

  setTestResult(result: unknown): void {
    process.env.MODELS_SF_TEST_RESULT = JSON.stringify(result);
  }

  block(kind: FixtureKind): void {
    const gatePath = path.join(this.temporaryDirectory, `${kind}.released`);
    this.gates.set(kind, gatePath);
    process.env[this.gateVariable(kind)] = gatePath;
  }

  release(kind: FixtureKind): void {
    const gatePath = this.gates.get(kind);
    assertHarness(gatePath, `${kind} was not blocked`);
    fs.writeFileSync(gatePath, 'released');
  }

  async waitForInvocation(fragment: string): Promise<void> {
    if (this.hasInvocation(fragment)) return;

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        watcher.close();
        reject(new Error(`Timed out waiting for fake sf invocation containing ${fragment}`));
      }, 3000);
      const watcher = fs.watch(this.temporaryDirectory, () => {
        if (!this.hasInvocation(fragment)) return;
        clearTimeout(timeout);
        watcher.close();
        resolve();
      });
      if (this.hasInvocation(fragment)) {
        clearTimeout(timeout);
        watcher.close();
        resolve();
      }
    });
  }

  readInvocations(): string[][] {
    if (!fs.existsSync(this.invocationsPath)) return [];
    return fs
      .readFileSync(this.invocationsPath, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as string[]);
  }

  dispose(): void {
    for (const gatePath of this.gates.values()) {
      if (!fs.existsSync(gatePath)) fs.writeFileSync(gatePath, 'released');
    }
    for (const [variable, value] of this.originalEnvironment) {
      if (value === undefined) {
        delete process.env[variable];
      } else {
        process.env[variable] = value;
      }
    }
    fs.rmSync(this.temporaryDirectory, { recursive: true, force: true });
  }

  private hasInvocation(fragment: string): boolean {
    return this.readInvocations().some((args) => args.some((arg) => arg.includes(fragment)));
  }

  private gateVariable(kind: FixtureKind): string {
    switch (kind) {
      case 'apex':
        return 'MODELS_SF_APEX_GATE';
      case 'coverage':
        return 'MODELS_SF_COVERAGE_GATE';
      case 'testRun':
        return 'MODELS_SF_TEST_GATE';
    }
  }

  private writeFakeExecutable(): void {
    const executablePath = path.join(
      this.temporaryDirectory,
      process.platform === 'win32' ? 'sf.cmd' : 'sf'
    );
    const scriptPath = path.join(this.temporaryDirectory, 'models-fake-sf.js');
    const source = fakeSfSource();

    if (process.platform === 'win32') {
      fs.writeFileSync(scriptPath, source);
      fs.writeFileSync(executablePath, `@echo off\r\n"${process.execPath}" "${scriptPath}" %*\r\n`);
    } else {
      fs.writeFileSync(executablePath, `#!${process.execPath}\n${source}`);
      fs.chmodSync(executablePath, 0o755);
    }
  }
}

function assertHarness<T>(value: T | undefined, message: string): asserts value is T {
  if (value === undefined) throw new Error(message);
}

function fakeSfSource(): string {
  return `
const fs = require('fs');

const args = process.argv.slice(2);
fs.appendFileSync(process.env.MODELS_SF_INVOCATIONS, JSON.stringify(args) + '\\n');

let payload;
let gate;
const query = args[args.indexOf('--query') + 1] || '';

if (args[0] === 'data' && query.includes('FROM ApexClass')) {
  payload = { result: { records: JSON.parse(process.env.MODELS_SF_APEX_RECORDS || '[]') } };
  gate = process.env.MODELS_SF_APEX_GATE;
} else if (args[0] === 'data' && query.includes('ApexCodeCoverageAggregate')) {
  payload = { result: { records: JSON.parse(process.env.MODELS_SF_COVERAGE_RECORDS || '[]') } };
  gate = process.env.MODELS_SF_COVERAGE_GATE;
} else if (args[0] === 'apex' && args[1] === 'test' && args[2] === 'run') {
  payload = JSON.parse(process.env.MODELS_SF_TEST_RESULT || '{}');
  gate = process.env.MODELS_SF_TEST_GATE;
} else {
  process.stderr.write('Unexpected fake sf invocation: ' + JSON.stringify(args));
  process.exitCode = 2;
}

const finish = () => {
  if (payload !== undefined) process.stdout.write(JSON.stringify(payload));
};

if (!gate || fs.existsSync(gate)) {
  finish();
} else {
  const interval = setInterval(() => {
    if (!fs.existsSync(require('path').dirname(gate))) {
      clearInterval(interval);
      process.exitCode = 3;
      return;
    }
    if (!fs.existsSync(gate)) return;
    clearInterval(interval);
    finish();
  }, 5);
}
`;
}
