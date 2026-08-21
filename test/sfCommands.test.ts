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

  it('builds pinned Tooling Composite deletes and the individual org coverage update', () => {
    assert.strictEqual(sfCommands.TOOLING_COMPOSITE_BATCH_SIZE, 25);
    const sourceDelete = sfCommands.getDeleteCoverageBatchInvocation(
      'ApexCodeCoverage',
      ['714000000000001AAA', '714000000000002AAA'],
      targetOrg,
      '67.0'
    );
    assert.deepStrictEqual(sourceDelete.args.slice(0, 7), [
      'api',
      'request',
      'rest',
      '/services/data/v67.0/tooling/composite',
      '--method',
      'POST',
      '--body',
    ]);
    assert.deepStrictEqual(JSON.parse(sourceDelete.args[7]), {
      allOrNone: false,
      compositeRequest: [
        {
          method: 'DELETE',
          url: '/services/data/v67.0/tooling/sobjects/ApexCodeCoverage/714000000000001AAA',
          referenceId: 'delete0',
        },
        {
          method: 'DELETE',
          url: '/services/data/v67.0/tooling/sobjects/ApexCodeCoverage/714000000000002AAA',
          referenceId: 'delete1',
        },
      ],
    });
    assert.deepStrictEqual(sourceDelete.args.slice(8), ['--target-org', targetOrg]);

    const aggregateDelete = sfCommands.getDeleteCoverageBatchInvocation(
      'ApexCodeCoverageAggregate',
      ['716000000000001AAA'],
      targetOrg,
      '67.0'
    );
    const aggregateBody = JSON.parse(aggregateDelete.args[7]) as {
      compositeRequest: { url: string }[];
    };
    assert.strictEqual(
      aggregateBody.compositeRequest[0].url,
      '/services/data/v67.0/tooling/sobjects/ApexCodeCoverageAggregate/716000000000001AAA'
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
        () =>
          sfCommands.getDeleteCoverageBatchInvocation('ApexCodeCoverage', [id], targetOrg, '67.0'),
        /coverage record id/i
      );
      assert.throws(
        () => sfCommands.getUpdateOrgCoverageInvocation(id, targetOrg),
        /coverage record id/i
      );
    }
  });

  it('rejects empty, oversized, and version-ambiguous Composite batches', () => {
    assert.throws(
      () => sfCommands.getDeleteCoverageBatchInvocation('ApexCodeCoverage', [], targetOrg, '67.0'),
      /batch/i
    );
    assert.throws(
      () =>
        sfCommands.getDeleteCoverageBatchInvocation(
          'ApexCodeCoverage',
          Array.from({ length: 26 }, (_, index) => coverageId('714', index)),
          targetOrg,
          '67.0'
        ),
      /batch/i
    );
    for (const apiVersion of ['', '67', 'v67.0', '67.0/tooling']) {
      assert.throws(
        () =>
          sfCommands.getDeleteCoverageBatchInvocation(
            'ApexCodeCoverage',
            ['714000000000001AAA'],
            targetOrg,
            apiVersion
          ),
        /api version/i
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
        sfCommands.getDeleteCoverageBatchInvocation(
          'ApexCodeCoverageAggregate',
          ['716000000000001AAA'],
          '',
          '67.0'
        ),
      () => sfCommands.getUpdateOrgCoverageInvocation('715000000000001AAA', ''),
      () => sfCommands.getTestClassInvocation('AccountTest', '\t'),
      () => sfCommands.getOrgCoverageInvocation(''),
    ]) {
      assert.throws(buildInvocation, /target org/i);
    }
  });
});

function coverageId(prefix: string, index: number): string {
  return `${prefix}${String(index).padStart(12, '0')}AAA`;
}
