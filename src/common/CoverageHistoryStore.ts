const STORAGE_KEY = 'salesforceTests.coverageHistory';
const MAX_SNAPSHOTS_PER_ORG = 30;
const MAX_TRACKED_ORGS = 50;

export interface CoverageHistoryStorage {
  get<T>(key: string, defaultValue: T): T;
  update(key: string, value: unknown): PromiseLike<void>;
}

export interface CoverageSnapshot {
  coverage: number;
  recordedAt: Date;
}

interface StoredOrgCoverageHistory {
  targetOrg: string;
  snapshots: StoredCoverageSnapshot[];
}

interface StoredCoverageSnapshot {
  coverage: number;
  recordedAt: string;
}

export class CoverageHistoryStore {
  public constructor(private readonly storage: CoverageHistoryStorage) {}

  public load(targetOrg: string): CoverageSnapshot[] {
    const org = parseStoredHistories(this.storage.get<unknown>(STORAGE_KEY, [])).find(
      (history) => history.targetOrg === targetOrg
    );
    return (org?.snapshots ?? []).map((snapshot) => ({
      coverage: snapshot.coverage,
      recordedAt: new Date(snapshot.recordedAt),
    }));
  }

  public async record(
    targetOrg: string,
    coverage: number,
    recordedAt: Date = new Date()
  ): Promise<void> {
    if (!targetOrg || !isCoverage(coverage) || Number.isNaN(recordedAt.getTime())) {
      return;
    }

    const histories = parseStoredHistories(this.storage.get<unknown>(STORAGE_KEY, []));
    const existingIndex = histories.findIndex((history) => history.targetOrg === targetOrg);
    const history =
      existingIndex >= 0 ? histories.splice(existingIndex, 1)[0] : { targetOrg, snapshots: [] };

    if (history.snapshots[0]?.coverage !== coverage) {
      history.snapshots.unshift({ coverage, recordedAt: recordedAt.toISOString() });
      history.snapshots = history.snapshots.slice(0, MAX_SNAPSHOTS_PER_ORG);
    }

    histories.unshift(history);
    await this.storage.update(STORAGE_KEY, histories.slice(0, MAX_TRACKED_ORGS));
  }
}

function parseStoredHistories(value: unknown): StoredOrgCoverageHistory[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((historyValue) => {
    const history = asRecord(historyValue);
    if (!history || typeof history.targetOrg !== 'string' || !Array.isArray(history.snapshots)) {
      return [];
    }
    return [
      {
        targetOrg: history.targetOrg,
        snapshots: history.snapshots
          .flatMap((snapshotValue) => {
            const snapshot = asRecord(snapshotValue);
            if (
              !snapshot
              || !isCoverage(snapshot.coverage)
              || typeof snapshot.recordedAt !== 'string'
              || Number.isNaN(Date.parse(snapshot.recordedAt))
            ) {
              return [];
            }
            return [
              {
                coverage: snapshot.coverage,
                recordedAt: snapshot.recordedAt,
              },
            ];
          })
          .slice(0, MAX_SNAPSHOTS_PER_ORG),
      },
    ];
  });
}

function isCoverage(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null ?
      (value as Record<string, unknown>)
    : undefined;
}
