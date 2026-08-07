import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  parseImpactedApexTestsResponse,
  retrieveImpactedApexTests,
} from '../../src/common/ImpactedTestService';
import { SfCliError, type JsonSfCliClient } from '../../src/common/SfCliClient';

void describe('ImpactedTestService', () => {
  void it('queries coverage for one class in the resolved org', async () => {
    const client: JsonSfCliClient = {
      runJson: <T>(args: readonly string[]): Promise<T> => {
        assert.equal(
          args[args.indexOf('--query') + 1],
          "SELECT ApexTestClass.Name, TestMethodName FROM ApexCodeCoverage WHERE ApexClassOrTrigger.Name = 'Calculator' ORDER BY ApexTestClass.Name, TestMethodName"
        );
        assert.equal(args[args.indexOf('--target-org') + 1], 'developer@example.com');
        return Promise.resolve({ status: 0, result: { records: [] } } as T);
      },
    };

    assert.deepEqual(
      await retrieveImpactedApexTests(client, 'Calculator', 'developer@example.com'),
      []
    );
  });

  void it('deduplicates and sorts test methods', () => {
    assert.deepEqual(
      parseImpactedApexTestsResponse({
        status: 0,
        result: {
          records: [
            { ApexTestClass: { Name: 'ZTest' }, TestMethodName: 'works' },
            { ApexTestClass: { Name: 'ATest' }, TestMethodName: 'works' },
            { ApexTestClass: { Name: 'ATest' }, TestMethodName: 'works' },
          ],
        },
      }),
      [
        { className: 'ATest', methodName: 'works', selector: 'ATest.works' },
        { className: 'ZTest', methodName: 'works', selector: 'ZTest.works' },
      ]
    );
  });

  void it('rejects unsafe class names before constructing SOQL', async () => {
    const client: JsonSfCliClient = {
      runJson: <T>(): Promise<T> => Promise.reject(new Error('should not run')),
    };

    await assert.rejects(
      retrieveImpactedApexTests(client, "Calculator' OR Name != '", 'developer@example.com'),
      (error: unknown) => error instanceof SfCliError && error.kind === 'invalid-response'
    );
  });

  void it('rejects malformed and failed responses', () => {
    assert.throws(
      () =>
        parseImpactedApexTestsResponse({
          status: 0,
          result: { records: [{ ApexTestClass: {}, TestMethodName: 'works' }] },
        }),
      hasKind('invalid-response')
    );
    assert.throws(
      () => parseImpactedApexTestsResponse({ status: 1, message: 'Denied' }),
      hasKind('execution')
    );
  });
});

function hasKind(kind: SfCliError['kind']): (error: unknown) => boolean {
  return (error: unknown) => error instanceof SfCliError && error.kind === kind;
}
