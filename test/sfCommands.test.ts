import * as assert from 'assert';
import * as sfCommands from '../src/common/sfCommands';

describe('Salesforce CLI invocations', () => {
  const largeOutputOptions = { maxBuffer: 100 * 1024 * 1024 };
  const targetOrg = 'fixture.user@example.invalid';

  it('preserves the org information invocation', () => {
    assert.deepStrictEqual(sfCommands.getOrgInfoInvocation(), {
      args: ['org', 'display', '--json'],
    });
  });

  it('preserves the Apex classes invocation and output limit', () => {
    assert.deepStrictEqual(sfCommands.getApexClassesInvocation(targetOrg), {
      args: [
        'data',
        'query',
        '--query',
        "SELECT Id, Name, Body FROM ApexClass WHERE ManageableState = 'unmanaged' ORDER BY Name ASC",
        '--use-tooling-api',
        '--target-org',
        targetOrg,
        '--json',
      ],
      options: largeOutputOptions,
    });
  });

  it('preserves the code coverage invocation and output limit', () => {
    assert.deepStrictEqual(sfCommands.getCodeCoverageInvocation(targetOrg), {
      args: [
        'data',
        'query',
        '--query',
        'SELECT Id, ApexClassOrTriggerId, NumLinesCovered, NumLinesUncovered FROM ApexCodeCoverageAggregate',
        '--use-tooling-api',
        '--target-org',
        targetOrg,
        '--json',
      ],
      options: largeOutputOptions,
    });
  });

  it('preserves the test execution invocation and output limit', () => {
    assert.deepStrictEqual(sfCommands.getTestClassInvocation('AccountService_Test2', targetOrg), {
      args: [
        'apex',
        'test',
        'run',
        '--tests',
        'AccountService_Test2',
        '--synchronous',
        '--code-coverage',
        '--target-org',
        targetOrg,
        '--json',
      ],
      options: largeOutputOptions,
    });
  });

  it('rejects test class names outside the supported Apex identifier subset', () => {
    for (const name of [
      '',
      '_AccountTest',
      '1AccountTest',
      'Account-Test',
      'Account Test',
      'AccountTest; sf org logout',
      'AccountTest\n--json',
      'ÁccountTest',
    ]) {
      assert.throws(() => sfCommands.getTestClassInvocation(name, targetOrg), /test class name/i);
    }
  });

  it('preserves the org-wide coverage invocation', () => {
    assert.deepStrictEqual(sfCommands.getOrgCoverageInvocation(targetOrg), {
      args: [
        'data',
        'query',
        '--query',
        'SELECT Id, PercentCovered FROM ApexOrgWideCoverage',
        '--use-tooling-api',
        '--target-org',
        targetOrg,
        '--json',
      ],
    });
  });

  it('rejects a blank target org for every targeted invocation', () => {
    for (const buildInvocation of [
      () => sfCommands.getApexClassesInvocation('  '),
      () => sfCommands.getCodeCoverageInvocation(''),
      () => sfCommands.getTestClassInvocation('AccountTest', '\t'),
      () => sfCommands.getOrgCoverageInvocation(''),
    ]) {
      assert.throws(buildInvocation, /target org/i);
    }
  });
});
