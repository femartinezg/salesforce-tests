import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { test } from 'node:test';
import { retrieveApexClasses } from '../../src/common/ApexClassService';
import { parseApexTestRunResponse } from '../../src/common/ApexTestRunParser';
import {
  createApexTestSuite,
  deleteApexTestSuite,
  retrieveApexTestSuites,
} from '../../src/common/ApexTestSuiteService';
import {
  retrieveApexClassCoverage,
  retrieveOrgWideCoverage,
} from '../../src/common/CoverageService';
import { retrieveImpactedApexTests } from '../../src/common/ImpactedTestService';
import { SfCliClient } from '../../src/common/SfCliClient';
import {
  buildRunTestClassArgs,
  buildRunTestMethodArgs,
  buildRunTestSuiteArgs,
} from '../../src/common/sfCommandArgs';

const FIXTURE_CLASS = 'SalesforceTestsFixtureCalculator';
const FIXTURE_TEST_CLASS = 'SalesforceTestsFixtureCalculatorTest';

void test(
  'deploys fixtures and validates discovery, execution, and coverage against an org',
  { timeout: 240_000 },
  async () => {
    const targetOrg = process.env.SALESFORCE_TEST_ORG;
    assert.ok(targetOrg, 'Set SALESFORCE_TEST_ORG to an authenticated non-production org alias.');

    const fixtureProject = path.resolve(process.cwd(), 'test/fixtures/salesforce');
    const deployment = await runSf(
      [
        'project',
        'deploy',
        'start',
        '--source-dir',
        'force-app',
        '--target-org',
        targetOrg,
        '--wait',
        '5',
        '--json',
      ],
      fixtureProject
    );
    assert.equal(parseStatus(deployment), 0);

    const client = new SfCliClient({ timeoutMs: 180_000 });
    const classes = await retrieveApexClasses(client, targetOrg);
    assert.ok(classes.apexClasses.some((item) => item.name === FIXTURE_CLASS));
    const fixtureTestClass = classes.testClasses.find((item) => item.name === FIXTURE_TEST_CLASS);
    assert.ok(fixtureTestClass);
    assert.deepEqual(fixtureTestClass.methods, ['addsNumbers', 'subtractsNumbers']);

    const rawTestRun = await client.runJson<unknown>(
      buildRunTestClassArgs(FIXTURE_TEST_CLASS, targetOrg)
    );
    const testRun = parseApexTestRunResponse(rawTestRun);
    assert.equal(testRun.kind, 'test-result');
    if (testRun.kind !== 'test-result') {
      return;
    }
    assert.equal(testRun.passed, true);
    assert.equal(testRun.failures.length, 0);
    assert.ok(testRun.coverage.some((item) => item.name === FIXTURE_CLASS));

    const rawMethodRun = await client.runJson<unknown>(
      buildRunTestMethodArgs(FIXTURE_TEST_CLASS, 'addsNumbers', targetOrg)
    );
    const methodRun = parseApexTestRunResponse(rawMethodRun);
    assert.equal(methodRun.kind, 'test-result');
    assert.equal(methodRun.kind === 'test-result' && methodRun.passed, true);

    const impactedTests = await retrieveImpactedApexTests(client, FIXTURE_CLASS, targetOrg);
    assert.deepEqual(
      impactedTests.map((item) => item.selector),
      [`${FIXTURE_TEST_CLASS}.addsNumbers`, `${FIXTURE_TEST_CLASS}.subtractsNumbers`]
    );

    const suiteName = `SalesforceTestsFixtureSuite_${Date.now()}`;
    const suite = await createApexTestSuite(client, suiteName, [fixtureTestClass.id], targetOrg);
    try {
      assert.ok(
        (await retrieveApexTestSuites(client, targetOrg)).some((item) => item.id === suite.id)
      );
      const rawSuiteRun = await client.runJson<unknown>(
        buildRunTestSuiteArgs(suiteName, targetOrg)
      );
      const suiteRun = parseApexTestRunResponse(rawSuiteRun);
      assert.equal(suiteRun.kind, 'test-result');
      assert.equal(suiteRun.kind === 'test-result' && suiteRun.passed, true);
    } finally {
      await deleteApexTestSuite(client, suite.id, targetOrg);
    }
    assert.equal(
      (await retrieveApexTestSuites(client, targetOrg)).some((item) => item.id === suite.id),
      false
    );

    const coverage = await retrieveApexClassCoverage(client, targetOrg);
    assert.ok(coverage.some((item) => item.classId.length > 0));

    const orgWideCoverage = await retrieveOrgWideCoverage(client, targetOrg);
    assert.ok(orgWideCoverage >= 0 && orgWideCoverage <= 100);
  }
);

function runSf(args: readonly string[], cwd: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    execFile(
      'sf',
      [...args],
      { cwd, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, timeout: 180_000 },
      (error, stdout) => {
        if (error) {
          reject(new Error(error.message, { cause: error }));
          return;
        }
        try {
          resolve(JSON.parse(stdout) as unknown);
        } catch (parseError: unknown) {
          reject(parseError instanceof Error ? parseError : new Error(String(parseError)));
        }
      }
    );
  });
}

function parseStatus(response: unknown): number | undefined {
  if (typeof response !== 'object' || response === null || !('status' in response)) {
    return undefined;
  }
  return typeof response.status === 'number' ? response.status : undefined;
}
