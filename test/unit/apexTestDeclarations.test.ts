import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { findApexTestDeclarations } from '../../src/common/apexTestDeclarations';

void describe('findApexTestDeclarations', () => {
  void it('finds the test class and known test methods in source order', () => {
    const source = `@IsTest
private class CalculatorTest {
  @IsTest
  static void addsNumbers() {}

  static testMethod void subtractsNumbers() {}
}`;

    const declarations = findApexTestDeclarations(source, 'CalculatorTest', [
      'subtractsNumbers',
      'addsNumbers',
    ]);

    assert.deepEqual(
      declarations.map(({ kind, name, start }) => ({ kind, name, start })),
      [
        { kind: 'class', name: 'CalculatorTest', start: source.indexOf('CalculatorTest') },
        { kind: 'method', name: 'addsNumbers', start: source.indexOf('addsNumbers') },
        {
          kind: 'method',
          name: 'subtractsNumbers',
          start: source.indexOf('subtractsNumbers'),
        },
      ]
    );
  });

  void it('matches Apex declarations case-insensitively', () => {
    const source = 'private CLASS CalculatorTest { STATIC VOID AddsNumbers() {} }';

    assert.deepEqual(
      findApexTestDeclarations(source, 'calculatortest', ['addsnumbers']).map(({ kind, name }) => ({
        kind,
        name,
      })),
      [
        { kind: 'class', name: 'calculatortest' },
        { kind: 'method', name: 'addsnumbers' },
      ]
    );
  });

  void it('ignores declarations inside comments and strings', () => {
    const source = `@IsTest private class RealTest {
  // static void commentedOut() {}
  /* static void blockedOut() {} */
  static void realMethod() {
    String text = 'void stringMethod() and \\' escaped';
  }
}`;

    assert.deepEqual(
      findApexTestDeclarations(source, 'RealTest', [
        'commentedOut',
        'blockedOut',
        'stringMethod',
        'realMethod',
      ]).map(({ kind, name }) => ({ kind, name })),
      [
        { kind: 'class', name: 'RealTest' },
        { kind: 'method', name: 'realMethod' },
      ]
    );
  });

  void it('does not mistake method calls for declarations', () => {
    const source = `@IsTest private class CallTest {
  static void actualTest() {
    helperTest();
  }
}`;

    assert.deepEqual(
      findApexTestDeclarations(source, 'CallTest', ['actualTest', 'helperTest']).map(
        ({ kind, name }) => ({ kind, name })
      ),
      [
        { kind: 'class', name: 'CallTest' },
        { kind: 'method', name: 'actualTest' },
      ]
    );
  });

  void it('preserves UTF-16 offsets after non-BMP characters', () => {
    const source = `/* 🧪 */ @IsTest private class UnicodeTest {
  static void worksAfterEmoji() {}
}`;

    const declarations = findApexTestDeclarations(source, 'UnicodeTest', ['worksAfterEmoji']);

    assert.deepEqual(
      declarations.map(({ name, start }) => ({ name, start })),
      [
        { name: 'UnicodeTest', start: source.indexOf('UnicodeTest') },
        { name: 'worksAfterEmoji', start: source.indexOf('worksAfterEmoji') },
      ]
    );
  });

  void it('returns no locations when the local file does not match the org inventory', () => {
    assert.deepEqual(findApexTestDeclarations('class Other {}', 'ExpectedTest', ['testOne']), []);
  });
});
