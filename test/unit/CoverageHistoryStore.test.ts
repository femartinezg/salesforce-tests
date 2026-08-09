import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CoverageHistoryStore,
  type CoverageHistoryStorage,
} from '../../src/common/CoverageHistoryStore';

void describe('CoverageHistoryStore', () => {
  void it('stores distinct coverage snapshots independently by org', async () => {
    const storage = new MemoryStorage();
    const store = new CoverageHistoryStore(storage);

    await store.record('org-a', 74, new Date('2026-08-08T00:00:00.000Z'));
    await store.record('org-a', 76.5, new Date('2026-08-08T01:00:00.000Z'));
    await store.record('org-b', 90, new Date('2026-08-08T02:00:00.000Z'));

    assert.deepEqual(store.load('org-a'), [
      { coverage: 76.5, recordedAt: new Date('2026-08-08T01:00:00.000Z') },
      { coverage: 74, recordedAt: new Date('2026-08-08T00:00:00.000Z') },
    ]);
    assert.deepEqual(store.load('org-b'), [
      { coverage: 90, recordedAt: new Date('2026-08-08T02:00:00.000Z') },
    ]);
  });

  void it('does not add consecutive duplicate values', async () => {
    const storage = new MemoryStorage();
    const store = new CoverageHistoryStore(storage);

    await store.record('org-a', 75, new Date('2026-08-08T00:00:00.000Z'));
    await store.record('org-a', 75, new Date('2026-08-08T01:00:00.000Z'));

    assert.deepEqual(store.load('org-a'), [
      { coverage: 75, recordedAt: new Date('2026-08-08T00:00:00.000Z') },
    ]);
  });

  void it('keeps only thirty snapshots and fifty orgs', async () => {
    const storage = new MemoryStorage();
    const store = new CoverageHistoryStore(storage);
    for (let index = 0; index < 32; index += 1) {
      await store.record('org-a', index, new Date(1_700_000_000_000 + index));
    }
    for (let index = 0; index < 51; index += 1) {
      await store.record(`org-${index}`, index, new Date(1_800_000_000_000 + index));
    }

    assert.equal(store.load('org-a').length, 0);
    assert.equal(store.load('org-0').length, 0);
    assert.equal(store.load('org-50').length, 1);
  });

  void it('ignores malformed persisted and new snapshots', async () => {
    const storage = new MemoryStorage({
      'salesforceTests.coverageHistory': [
        {
          targetOrg: 'org-a',
          snapshots: [
            { coverage: 75, recordedAt: '2026-08-08T00:00:00.000Z' },
            { coverage: 101, recordedAt: 'invalid' },
          ],
        },
      ],
    });
    const store = new CoverageHistoryStore(storage);

    await store.record('org-a', Number.NaN);
    await store.record('org-a', -1);

    assert.deepEqual(store.load('org-a'), [
      { coverage: 75, recordedAt: new Date('2026-08-08T00:00:00.000Z') },
    ]);
  });
});

class MemoryStorage implements CoverageHistoryStorage {
  public constructor(private readonly values: Record<string, unknown> = {}) {}

  public get<T>(key: string, defaultValue: T): T {
    return (key in this.values ? this.values[key] : defaultValue) as T;
  }

  public update(key: string, value: unknown): PromiseLike<void> {
    this.values[key] = value;
    return Promise.resolve();
  }
}
