import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { TestHistoryStore, type TestHistoryStorage } from '../../src/common/TestHistoryStore';

void describe('TestHistoryStore', () => {
  void it('stores histories independently by Salesforce org', async () => {
    const storage = new MemoryStorage();
    const store = new TestHistoryStore(storage);

    await store.save('first@example.com', [testRun('FirstTest', true)]);
    await store.save('second@example.com', [testRun('SecondTest', false)]);

    assert.deepEqual(store.load('first@example.com'), [testRun('FirstTest', true)]);
    assert.deepEqual(store.load('second@example.com'), [testRun('SecondTest', false)]);
  });

  void it('keeps only the five most recent runs', async () => {
    const storage = new MemoryStorage();
    const store = new TestHistoryStore(storage);
    const runs = Array.from({ length: 7 }, (_value, index) => testRun(`Test${index}`, true));

    await store.save('test@example.com', runs);

    assert.deepEqual(
      store.load('test@example.com').map((run) => run.name),
      ['Test0', 'Test1', 'Test2', 'Test3', 'Test4']
    );
  });

  void it('ignores malformed persisted values', async () => {
    const storage = new MemoryStorage();
    await storage.update('salesforceTests.testHistory', [
      {
        targetOrg: 'test@example.com',
        runs: [
          { ...testRun('valid', true), startTime: '2026-08-07T19:00:00.000Z' },
          { name: 'invalid', duration: -1 },
        ],
      },
    ]);
    const store = new TestHistoryStore(storage);

    assert.deepEqual(store.load('test@example.com'), [testRun('valid', true)]);
  });
});

function testRun(name: string, success: boolean) {
  return {
    name,
    type: 'Test Class',
    success,
    startTime: new Date('2026-08-07T19:00:00.000Z'),
    duration: 42,
  };
}

class MemoryStorage implements TestHistoryStorage {
  private readonly values = new Map<string, unknown>();

  public get<T>(key: string, defaultValue: T): T {
    return (this.values.has(key) ? this.values.get(key) : defaultValue) as T;
  }

  public update(key: string, value: unknown): PromiseLike<void> {
    this.values.set(key, value);
    return Promise.resolve();
  }
}
