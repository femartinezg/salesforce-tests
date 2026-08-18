import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { getContextManager, getNewContextManager } from '../../src/common';

export interface FakeSfResponse {
  stdout?: string;
  json?: unknown;
  stderr?: string;
  exitCode?: number;
  delayMs?: number;
  gate?: string;
}

export interface FakeSfInvocation {
  operation: 'orgInfo' | 'apexClasses' | 'codeCoverage' | 'orgCoverage' | 'runTest' | 'unknown';
  args: string[];
}

interface FakeSfExpectedValues {
  alias: string;
  username: string;
  testClass: string;
  apexClass: string;
  orgCoverage: number;
  classCoverage: number;
}

interface FakeSfPlan {
  expected: FakeSfExpectedValues;
  orgInfo: FakeSfResponse;
  apexClasses: FakeSfResponse;
  codeCoverage: FakeSfResponse;
  orgCoverage: FakeSfResponse;
  testRuns: Record<string, FakeSfResponse>;
}

export type FakeSfPlanOverrides = Partial<
  Omit<FakeSfPlan, 'expected' | 'testRuns'> & {
    testRuns: Record<string, FakeSfResponse>;
  }
>;

export const extensionRoot = path.resolve(__dirname, '..', '..', '..');

const runtimeRoot = requiredEnvironment('SALESFORCE_TESTS_FAKE_ROOT');
const planPath = requiredEnvironment('SALESFORCE_TESTS_FAKE_PLAN');
const logPath = requiredEnvironment('SALESFORCE_TESTS_FAKE_LOG');
const workspaceRoot = requiredEnvironment('SALESFORCE_TESTS_WORKSPACE');
const fixturePlanPath = path.join(extensionRoot, 'test', 'fixtures', 'fake-sf-plan.json');
let initialLoadObservedDuringActivation = false;

export async function activateExtension(): Promise<vscode.Extension<unknown>> {
  const extension = vscode.extensions.getExtension<unknown>('femartinezg.salesforce-tests');
  assert.ok(extension, 'Salesforce Tests must be available in the Extension Host');
  if (!extension.isActive) {
    getNewContextManager();
    const previousOrgInfoCalls = getFakeSfInvocations().filter(
      ({ operation }) => operation === 'orgInfo'
    ).length;
    await extension.activate();
    await waitFor(
      () =>
        getFakeSfInvocations().filter(({ operation }) => operation === 'orgInfo').length
        > previousOrgInfoCalls
    );
    const expected = defaultFakeSfPlan();
    await waitFor(() => {
      const contextManager = getContextManager();
      return (
        contextManager.statusData.alias === expected.expectedAlias
        && contextManager.statusData.username === expected.expectedUsername
        && contextManager.statusData.orgWideCoverage === expected.expectedOrgCoverage
        && contextManager.apexTestsData.testClasses?.some(
          ({ name }) => name === expected.expectedTestClass
        ) === true
        && contextManager.codeCoverageData.apexClasses?.some(
          ({ name, codeCoverage }) =>
            name === expected.expectedApexClass && codeCoverage === expected.expectedClassCoverage
        ) === true
      );
    });
    initialLoadObservedDuringActivation = true;
  }
  return extension;
}

export function wasInitialLoadObservedDuringActivation(): boolean {
  return initialLoadObservedDuringActivation;
}

export function defaultFakeSfPlan(): {
  expectedAlias: string;
  expectedUsername: string;
  expectedTestClass: string;
  expectedApexClass: string;
  expectedOrgCoverage: number;
  expectedClassCoverage: number;
} {
  const { expected } = readFixturePlan();
  return {
    expectedAlias: expected.alias,
    expectedUsername: expected.username,
    expectedTestClass: expected.testClass,
    expectedApexClass: expected.apexClass,
    expectedOrgCoverage: expected.orgCoverage,
    expectedClassCoverage: expected.classCoverage,
  };
}

export function resetFakeSf(): Promise<void> {
  fs.rmSync(path.join(runtimeRoot, 'gates'), { recursive: true, force: true });
  fs.mkdirSync(path.join(runtimeRoot, 'gates'), { recursive: true });
  writePlan(readFixturePlan());
  return clearFakeSfInvocations();
}

export function configureFakeSf(overrides: FakeSfPlanOverrides): Promise<void> {
  const defaults = readFixturePlan();
  writePlan({
    ...defaults,
    ...overrides,
    expected: defaults.expected,
    testRuns: {
      ...defaults.testRuns,
      ...(overrides.testRuns ?? {}),
    },
  });
  return Promise.resolve();
}

export function clearFakeSfInvocations(): Promise<void> {
  fs.writeFileSync(logPath, '', 'utf8');
  return Promise.resolve();
}

export function getFakeSfInvocations(): FakeSfInvocation[] {
  if (!fs.existsSync(logPath)) return [];
  const contents = fs.readFileSync(logPath, 'utf8').trim();
  if (!contents) return [];
  return contents.split('\n').map((line) => JSON.parse(line) as FakeSfInvocation);
}

export function releaseFakeSfGate(gate: string): Promise<void> {
  if (!/^[A-Za-z0-9_-]+$/.test(gate)) {
    throw new Error('Synthetic gate names may contain only letters, digits, underscore, or dash');
  }
  fs.mkdirSync(path.join(runtimeRoot, 'gates'), { recursive: true });
  fs.writeFileSync(path.join(runtimeRoot, 'gates', gate), 'released', 'utf8');
  return Promise.resolve();
}

export async function writeWorkspaceSfConfig(contents: object): Promise<void> {
  const configPath = path.join(workspaceRoot, '.sf', 'config.json');
  assert.ok(fs.existsSync(configPath), 'The synthetic .sf/config.json must already exist');
  await vscode.workspace.fs.writeFile(
    vscode.Uri.file(configPath),
    Buffer.from(`${JSON.stringify(contents)}\n`, 'utf8')
  );
}

export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  timeoutMs = 5000
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!(await condition())) {
    if (Date.now() >= deadline) {
      throw new Error(`Condition was not met within ${timeoutMs} ms`);
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 20));
  }
}

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function readFixturePlan(): FakeSfPlan {
  return JSON.parse(fs.readFileSync(fixturePlanPath, 'utf8')) as FakeSfPlan;
}

function writePlan(plan: FakeSfPlan): void {
  const temporaryPlan = `${planPath}.${process.pid}.next`;
  fs.writeFileSync(temporaryPlan, `${JSON.stringify(plan)}\n`, 'utf8');
  fs.renameSync(temporaryPlan, planPath);
}
