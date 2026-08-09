import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { detectApexClassKind } from '../../src/common/apexSource';

void describe('detectApexClassKind', () => {
  void it('detects Apex test classes case-insensitively', () => {
    assert.equal(detectApexClassKind('@IsTest private class ExampleTest {}'), true);
    assert.equal(detectApexClassKind('@ISTEST(SeeAllData=true) class ExampleTest {}'), true);
  });

  void it('distinguishes ordinary classes and interfaces', () => {
    assert.equal(detectApexClassKind('public class Example {}'), false);
    assert.equal(detectApexClassKind('public interface Example {}'), undefined);
    assert.equal(detectApexClassKind('interface'), undefined);
  });

  void it('ignores test markers inside comments', () => {
    assert.equal(detectApexClassKind('// @IsTest\npublic class Example {}'), false);
    assert.equal(detectApexClassKind('/* @IsTest */ public class Example {}'), false);
  });
});
