import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getTreeItemLabel } from '../../src/common/treeItemLabel';

void describe('getTreeItemLabel', () => {
  void it('reads plain and highlighted VS Code tree labels', () => {
    assert.equal(getTreeItemLabel('ExampleTest'), 'ExampleTest');
    assert.equal(getTreeItemLabel({ label: 'ExampleTest' }), 'ExampleTest');
  });

  void it('preserves an absent label', () => {
    assert.equal(getTreeItemLabel(undefined), undefined);
  });
});
