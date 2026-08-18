import * as assert from 'assert';

interface SfInvocation {
  args: string[];
  options?: { maxBuffer?: number };
}

interface SfCommandsModule {
  getOrgInfoInvocation(): SfInvocation;
  getApexClassesInvocation(): SfInvocation;
  getCodeCoverageInvocation(): SfInvocation;
  getTestClassInvocation(testClassName: string): SfInvocation;
  getOrgCoverageInvocation(): SfInvocation;
}

const sfCommands = require('../src/common/sfCommands') as SfCommandsModule;

describe('Salesforce CLI invocations', () => {
  const largeOutputOptions = { maxBuffer: 100 * 1024 * 1024 };

  it('preserves the org information invocation', () => {
    assert.deepStrictEqual(sfCommands.getOrgInfoInvocation(), {
      args: ['org', 'display', '--json'],
    });
  });

  it('preserves the Apex classes invocation and output limit', () => {
    assert.deepStrictEqual(sfCommands.getApexClassesInvocation(), {
      args: [
        'data',
        'query',
        '--query',
        "SELECT Id, Name, Body FROM ApexClass WHERE ManageableState = 'unmanaged' ORDER BY Name ASC",
        '--use-tooling-api',
        '--json',
      ],
      options: largeOutputOptions,
    });
  });

  it('preserves the code coverage invocation and output limit', () => {
    assert.deepStrictEqual(sfCommands.getCodeCoverageInvocation(), {
      args: [
        'data',
        'query',
        '--query',
        'SELECT Id, ApexClassOrTriggerId, NumLinesCovered, NumLinesUncovered FROM ApexCodeCoverageAggregate',
        '--use-tooling-api',
        '--json',
      ],
      options: largeOutputOptions,
    });
  });

  it('preserves the test execution invocation and output limit', () => {
    assert.deepStrictEqual(sfCommands.getTestClassInvocation('AccountService_Test2'), {
      args: [
        'apex',
        'test',
        'run',
        '--tests',
        'AccountService_Test2',
        '--synchronous',
        '--code-coverage',
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
      assert.throws(() => sfCommands.getTestClassInvocation(name), /test class name/i);
    }
  });

  it('preserves the org-wide coverage invocation', () => {
    assert.deepStrictEqual(sfCommands.getOrgCoverageInvocation(), {
      args: [
        'data',
        'query',
        '--query',
        'SELECT Id, PercentCovered FROM ApexOrgWideCoverage',
        '--use-tooling-api',
        '--json',
      ],
    });
  });
});
