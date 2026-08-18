import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import {
  getApexClassesInvocation,
  getCodeCoverageInvocation,
  getOrgCoverageInvocation,
  getOrgInfoInvocation,
  getTestClassInvocation,
  type SfInvocation,
} from '../src/common/sfCommands';
import { runSf } from '../src/common/sfRunner';
import {
  configureFakeSf,
  defaultFakeSfPlan,
  extensionRoot,
  getFakeSfInvocations,
  releaseFakeSfGate,
  resetFakeSf,
  waitFor,
  waitForFakeSfGate,
} from './support/extensionHarness';
import { mochaGlobalTeardown } from './support/rootHooks';

describe('Synthetic Salesforce CLI contract', () => {
  beforeEach(async () => {
    await resetFakeSf();
  });

  it('runs the global isolation preflight before loading the test suite', () => {
    assert.strictEqual(
      process.env.SALESFORCE_TESTS_ISOLATION_VERIFIED,
      process.env.SALESFORCE_TESTS_FAKE_ROOT
    );
  });

  it('defers runtime cleanup until after the Extension Host has stopped', () => {
    const runtimeRoot = process.env.SALESFORCE_TESTS_FAKE_ROOT;
    const isolationCanary = process.env.SALESFORCE_TESTS_ISOLATION_VERIFIED;
    assert.ok(runtimeRoot);
    assert.ok(isolationCanary);

    try {
      mochaGlobalTeardown();

      assert.ok(
        fs.existsSync(runtimeRoot),
        'The Extension Host teardown must leave its active runtime for the outer runner to clean'
      );
      assert.strictEqual(process.env.SALESFORCE_TESTS_ISOLATION_VERIFIED, undefined);
    } finally {
      process.env.SALESFORCE_TESTS_ISOLATION_VERIFIED = isolationCanary;
    }
  });

  it('keeps the committed fixture deterministic, coherent, and synthetic', () => {
    const fixturePath = path.join(extensionRoot, 'test', 'fixtures', 'fake-sf-plan.json');
    const fixtureText = fs.readFileSync(fixturePath, 'utf8');
    const fixture = JSON.parse(fixtureText) as {
      orgInfo: { json: { result: { alias: string; username: string } } };
      apexClasses: { json: { result: { records: { Id: string; Name: string }[] } } };
      codeCoverage: {
        json: {
          result: {
            records: {
              ApexClassOrTriggerId: string;
              NumLinesCovered: number;
              NumLinesUncovered: number;
            }[];
          };
        };
      };
      orgCoverage: { json: { result: { records: { PercentCovered: number }[] } } };
    };
    const expected = {
      expectedAlias: 'fixture-org',
      expectedUsername: 'fixture.user@example.invalid',
      expectedTestClass: 'FixturePassingTest',
      expectedApexClass: 'FixtureService',
      expectedOrgCoverage: 84,
      expectedClassCoverage: 80,
    };

    assert.deepStrictEqual(defaultFakeSfPlan(), expected);
    assert.strictEqual(fixture.orgInfo.json.result.alias, expected.expectedAlias);
    assert.strictEqual(fixture.orgInfo.json.result.username, expected.expectedUsername);
    const records = fixture.apexClasses.json.result.records;
    assert.ok(
      records.some(({ Name }) => Name === expected.expectedTestClass),
      'The fixture test class must exist in Apex discovery'
    );
    const apexClass = records.find(({ Name }) => Name === expected.expectedApexClass);
    assert.ok(apexClass, 'The fixture production class must exist in Apex discovery');
    const coverage = fixture.codeCoverage.json.result.records.find(
      ({ ApexClassOrTriggerId }) => ApexClassOrTriggerId === apexClass.Id
    );
    assert.ok(coverage, 'The fixture production class must have matching coverage');
    assert.strictEqual(
      (coverage.NumLinesCovered / (coverage.NumLinesCovered + coverage.NumLinesUncovered)) * 100,
      expected.expectedClassCoverage
    );
    assert.strictEqual(
      fixture.orgCoverage.json.result.records[0].PercentCovered,
      expected.expectedOrgCoverage
    );
    assert.doesNotMatch(fixtureText, /\b00D[A-Za-z0-9]{12}(?:[A-Za-z0-9]{3})?\b/);
    assert.doesNotMatch(fixtureText, /(?:\/home\/|\/Users\/|[A-Za-z]:\\\\)/);
    assert.doesNotMatch(
      fixtureText,
      /(?:access[_-]?token|refresh[_-]?token|client[_-]?secret|private[_-]?key|password)/i
    );
  });

  it('routes every supported invocation to its own configured response and records exact arguments', async () => {
    await configureFakeSf({
      orgInfo: { stdout: 'org-info-route' },
      apexClasses: { stdout: 'apex-classes-route' },
      codeCoverage: { stdout: 'code-coverage-route' },
      orgCoverage: { stdout: 'org-coverage-route' },
      testRuns: { RoutedTest: { stdout: 'test-run-route' } },
    });
    const cases: { operation: string; invocation: SfInvocation; stdout: string }[] = [
      { operation: 'orgInfo', invocation: getOrgInfoInvocation(), stdout: 'org-info-route' },
      {
        operation: 'apexClasses',
        invocation: getApexClassesInvocation(),
        stdout: 'apex-classes-route',
      },
      {
        operation: 'codeCoverage',
        invocation: getCodeCoverageInvocation(),
        stdout: 'code-coverage-route',
      },
      {
        operation: 'orgCoverage',
        invocation: getOrgCoverageInvocation(),
        stdout: 'org-coverage-route',
      },
      {
        operation: 'runTest',
        invocation: getTestClassInvocation('RoutedTest'),
        stdout: 'test-run-route',
      },
    ];

    for (const { invocation, stdout } of cases) {
      const result = await runSf(invocation.args, invocation.options);
      assert.strictEqual(result.error, undefined);
      assert.strictEqual(result.stdout, stdout);
    }

    assert.deepStrictEqual(
      getFakeSfInvocations(),
      cases.map(({ operation, invocation }) => ({ operation, args: invocation.args }))
    );
  });

  it('fails closed for unknown operations and unconfigured test classes', async () => {
    const unknownArgs = ['data', 'query', '--query', 'SELECT Id FROM UnknownObject', '--json'];
    const unknown = await runSf(unknownArgs);
    const unconfiguredInvocation = getTestClassInvocation('UnconfiguredTest');
    const unconfigured = await runSf(unconfiguredInvocation.args, unconfiguredInvocation.options);

    assert.strictEqual(unknown.stdout, '');
    assert.match(unknown.error?.message ?? '', /exit code 64.*No synthetic Salesforce response/i);
    assert.strictEqual(unconfigured.stdout, '');
    assert.match(
      unconfigured.error?.message ?? '',
      /exit code 64.*No synthetic Salesforce response/i
    );
    assert.deepStrictEqual(getFakeSfInvocations(), [
      { operation: 'unknown', args: unknownArgs },
      { operation: 'runTest', args: unconfiguredInvocation.args },
    ]);
  });

  it('honors literal stdout, stderr, and non-zero exit controls independently of JSON fixtures', async () => {
    await configureFakeSf({
      orgInfo: {
        stdout: 'literal stdout',
        json: { ignored: true },
        stderr: 'synthetic controlled failure',
        exitCode: 23,
      },
    });

    const invocation = getOrgInfoInvocation();
    const result = await runSf(invocation.args, invocation.options);

    assert.strictEqual(result.stdout, 'literal stdout');
    assert.match(result.error?.message ?? '', /exit code 23: synthetic controlled failure/);
    assert.deepStrictEqual(getFakeSfInvocations(), [
      { operation: 'orgInfo', args: invocation.args },
    ]);
  });

  it('keeps a gated response pending until the named gate is released', async () => {
    await configureFakeSf({
      orgInfo: { stdout: 'released response', gate: 'contract-gate' },
    });
    const invocation = getOrgInfoInvocation();
    let settled = false;
    const pending = runSf(invocation.args, invocation.options).then((result) => {
      settled = true;
      return result;
    });

    try {
      await waitFor(() => getFakeSfInvocations().length === 1);
      await waitForFakeSfGate('contract-gate');
      assert.strictEqual(settled, false);

      await releaseFakeSfGate('contract-gate');
      const result = await pending;
      assert.strictEqual(result.error, undefined);
      assert.strictEqual(result.stdout, 'released response');
      assert.strictEqual(settled, true);
    } finally {
      await releaseFakeSfGate('contract-gate');
      await pending;
    }
  });

  it('delays a configured response after the invocation has reached the fake', async () => {
    await configureFakeSf({
      orgInfo: { stdout: 'delayed response', delayMs: 200 },
    });
    const invocation = getOrgInfoInvocation();
    const pending = runSf(invocation.args, invocation.options);

    await waitFor(() => getFakeSfInvocations().length === 1);
    const observedAt = Date.now();
    const result = await pending;

    assert.strictEqual(result.error, undefined);
    assert.strictEqual(result.stdout, 'delayed response');
    assert.ok(Date.now() - observedAt >= 120, 'The fake must honor its configured delay');
  });
});
