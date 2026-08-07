import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { TestInsightStore, type TestInsightStorage } from '../../src/common/TestInsightStore';

void describe('TestInsightStore', () => {
  void it('aggregates recent outcomes and durations independently by org', async () => {
    const storage = new MemoryStorage();
    const store = new TestInsightStore(storage);

    await store.record('org-a', [
      { selector: 'ExampleTest.passes', success: true, durationMs: 10 },
      { selector: 'ExampleTest.flaky', success: false, durationMs: 30 },
    ]);
    await store.record('org-a', [{ selector: 'ExampleTest.flaky', success: true, durationMs: 10 }]);
    await store.record('org-b', [
      { selector: 'ExampleTest.flaky', success: false, durationMs: 50 },
    ]);

    assert.deepEqual(store.load('org-a').sort(bySelector), [
      { selector: 'ExampleTest.flaky', passCount: 1, failCount: 1, averageDurationMs: 20 },
      { selector: 'ExampleTest.passes', passCount: 1, failCount: 0, averageDurationMs: 10 },
    ]);
    assert.deepEqual(store.load('org-b'), [
      { selector: 'ExampleTest.flaky', passCount: 0, failCount: 1, averageDurationMs: 50 },
    ]);
  });

  void it('keeps the ten most recent samples per test', async () => {
    const storage = new MemoryStorage();
    const store = new TestInsightStore(storage);

    for (let index = 0; index < 12; index += 1) {
      await store.record('org-a', [
        { selector: 'ExampleTest.flaky', success: index % 2 === 0, durationMs: index },
      ]);
    }

    assert.deepEqual(store.load('org-a'), [
      { selector: 'ExampleTest.flaky', passCount: 5, failCount: 5, averageDurationMs: 6.5 },
    ]);
  });

  void it('ignores malformed persisted values and invalid new samples', async () => {
    const storage = new MemoryStorage({
      'salesforceTests.testInsights': [
        { targetOrg: 'org-a', tests: [{ selector: 'Bad', samples: [{ success: 'yes' }] }] },
      ],
    });
    const store = new TestInsightStore(storage);

    assert.deepEqual(store.load('org-a'), []);
    await store.record('org-a', [
      { selector: '', success: true, durationMs: 1 },
      { selector: 'BadDuration', success: true, durationMs: Number.NaN },
    ]);
    assert.equal(
      store.load('org-a').some((item) => item.selector === 'BadDuration'),
      false
    );
  });

  void it('bounds retained selectors while keeping newly updated tests', async () => {
    const storage = new MemoryStorage();
    const store = new TestInsightStore(storage);
    await store.record(
      'org-a',
      Array.from({ length: 5_001 }, (_, index) => ({
        selector: `ExampleTest.method${index}`,
        success: true,
      }))
    );

    const insights = store.load('org-a');
    assert.equal(insights.length, 5_000);
    assert.equal(
      insights.some((item) => item.selector === 'ExampleTest.method0'),
      false
    );
    assert.equal(
      insights.some((item) => item.selector === 'ExampleTest.method5000'),
      true
    );
  });
});

function bySelector(left: { selector: string }, right: { selector: string }): number {
  return left.selector.localeCompare(right.selector);
}

class MemoryStorage implements TestInsightStorage {
  public constructor(private readonly values: Record<string, unknown> = {}) {}

  public get<T>(key: string, defaultValue: T): T {
    return (key in this.values ? this.values[key] : defaultValue) as T;
  }

  public update(key: string, value: unknown): PromiseLike<void> {
    this.values[key] = value;
    return Promise.resolve();
  }
}
