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

  it('builds pinned Tooling API queries for each ordered clearing phase', () => {
    assert.deepStrictEqual(
      sfCommands.getCoverageRecordIdsInvocation('ApexCodeCoverage', targetOrg),
      {
        args: [
          'data',
          'query',
          '--query',
          'SELECT Id FROM ApexCodeCoverage',
          '--use-tooling-api',
          '--target-org',
          targetOrg,
          '--json',
        ],
        options: largeOutputOptions,
      }
    );
    assert.deepStrictEqual(
      sfCommands.getCoverageRecordIdsInvocation('ApexCodeCoverageAggregate', targetOrg),
      {
        args: [
          'data',
          'query',
          '--query',
          'SELECT Id FROM ApexCodeCoverageAggregate WHERE NumLinesCovered > 0',
          '--use-tooling-api',
          '--target-org',
          targetOrg,
          '--json',
        ],
        options: largeOutputOptions,
      }
    );
    assert.strictEqual(
      sfCommands.getCoverageRecordIdsInvocation('ApexOrgWideCoverage', targetOrg).args[3],
      'SELECT Id FROM ApexOrgWideCoverage'
    );
  });

  it('builds pinned Tooling API mutations for deleting coverage and zeroing org coverage', () => {
    assert.deepStrictEqual(
      sfCommands.getDeleteCoverageRecordInvocation(
        'ApexCodeCoverage',
        '714000000000001AAA',
        targetOrg
      ),
      {
        args: [
          'data',
          'delete',
          'record',
          '--sobject',
          'ApexCodeCoverage',
          '--record-id',
          '714000000000001AAA',
          '--use-tooling-api',
          '--target-org',
          targetOrg,
          '--json',
        ],
      }
    );
    assert.deepStrictEqual(
      sfCommands
        .getDeleteCoverageRecordInvocation(
          'ApexCodeCoverageAggregate',
          '716000000000001AAA',
          targetOrg
        )
        .args.slice(3, 8),
      [
        '--sobject',
        'ApexCodeCoverageAggregate',
        '--record-id',
        '716000000000001AAA',
        '--use-tooling-api',
      ]
    );
    assert.deepStrictEqual(
      sfCommands.getUpdateOrgCoverageInvocation('715000000000001AAA', targetOrg),
      {
        args: [
          'data',
          'update',
          'record',
          '--sobject',
          'ApexOrgWideCoverage',
          '--record-id',
          '715000000000001AAA',
          '--values',
          'PercentCovered=0',
          '--use-tooling-api',
          '--target-org',
          targetOrg,
          '--json',
        ],
      }
    );
  });

  it('rejects invalid coverage record IDs before invoking Salesforce CLI', () => {
    for (const id of ['', '715 bad', '715;sf org logout', '715\n--json']) {
      assert.throws(
        () => sfCommands.getDeleteCoverageRecordInvocation('ApexCodeCoverage', id, targetOrg),
        /coverage record id/i
      );
      assert.throws(
        () => sfCommands.getUpdateOrgCoverageInvocation(id, targetOrg),
        /coverage record id/i
      );
    }
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
      () => sfCommands.getCoverageRecordIdsInvocation('ApexCodeCoverage', ''),
      () =>
        sfCommands.getDeleteCoverageRecordInvocation(
          'ApexCodeCoverageAggregate',
          '716000000000001AAA',
          ''
        ),
      () => sfCommands.getUpdateOrgCoverageInvocation('715000000000001AAA', ''),
      () => sfCommands.getTestClassInvocation('AccountTest', '\t'),
      () => sfCommands.getOrgCoverageInvocation(''),
    ]) {
      assert.throws(buildInvocation, /target org/i);
    }
  });
});
