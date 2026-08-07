import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  parseApexClassQueryResponse,
  retrieveApexClasses,
} from '../../src/common/ApexClassService';
import { SfCliError, type JsonSfCliClient } from '../../src/common/SfCliClient';

const query =
  "SELECT Id, Name, Body, SymbolTable FROM ApexClass WHERE ManageableState = 'unmanaged' ORDER BY Name ASC";

void describe('ApexClassService', () => {
  void it('queries the Tooling API with isolated arguments pinned to the resolved org', async () => {
    const client: JsonSfCliClient = {
      runJson: <T>(args: readonly string[]): Promise<T> => {
        assert.deepEqual(args, [
          'data',
          'query',
          '--query',
          query,
          '--use-tooling-api',
          '--target-org',
          'developer@example.com',
          '--json',
        ]);
        return Promise.resolve(successfulResponse([]) as T);
      },
    };

    assert.deepEqual(await retrieveApexClasses(client, 'developer@example.com'), {
      testClasses: [],
      apexClasses: [],
    });
  });

  void it('classifies test and ordinary classes while omitting interfaces', () => {
    const response = successfulResponse([
      {
        Id: '01p-test',
        Name: 'ExampleTest',
        Body: '@IsTest private class ExampleTest {}',
        SymbolTable: {
          methods: [
            { name: 'passes', annotations: [{ name: 'IsTest' }], modifiers: ['static'] },
            { name: 'setup', annotations: [{ name: 'TestSetup' }], modifiers: ['static'] },
          ],
        },
      },
      { Id: '01p-class', Name: 'Example', Body: 'public class Example {}' },
      { Id: '01p-interface', Name: 'Exampleable', Body: 'public interface Exampleable {}' },
    ]);

    assert.deepEqual(parseApexClassQueryResponse(response), {
      testClasses: [{ id: '01p-test', name: 'ExampleTest', methods: ['passes'] }],
      apexClasses: [{ id: '01p-class', name: 'Example' }],
    });
  });

  void it('detects legacy testMethod declarations from the symbol table', () => {
    const response = successfulResponse([
      {
        Id: '01p-legacy',
        Name: 'LegacyTest',
        Body: 'private class LegacyTest { static testMethod void passes() {} }',
        SymbolTable: {
          methods: [{ name: 'passes', annotations: [], modifiers: ['private', 'testMethod'] }],
        },
      },
    ]);

    assert.deepEqual(parseApexClassQueryResponse(response), {
      testClasses: [{ id: '01p-legacy', name: 'LegacyTest', methods: ['passes'] }],
      apexClasses: [],
    });
  });

  void it('accepts an empty record set', () => {
    assert.deepEqual(parseApexClassQueryResponse(successfulResponse([])), {
      testClasses: [],
      apexClasses: [],
    });
  });

  void it('rejects malformed successful records', () => {
    const malformedRecords = [
      { Id: '01p-missing-body', Name: 'MissingBody' },
      { Id: '', Name: 'EmptyId', Body: 'public class EmptyId {}' },
      { Id: '01p-missing-name', Body: 'public class MissingName {}' },
    ];

    for (const record of malformedRecords) {
      assert.throws(
        () => parseApexClassQueryResponse(successfulResponse([record])),
        hasKind('invalid-response')
      );
    }
  });

  void it('rejects malformed successful envelopes', () => {
    assert.throws(
      () => parseApexClassQueryResponse({ status: 0, result: {} }),
      hasKind('invalid-response')
    );
  });
});

function successfulResponse(records: unknown[]): unknown {
  return { status: 0, result: { records } };
}

function hasKind(kind: SfCliError['kind']): (error: unknown) => boolean {
  return (error: unknown) => error instanceof SfCliError && error.kind === kind;
}
