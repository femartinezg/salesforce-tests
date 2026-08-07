const STORAGE_KEY = 'salesforceTests.testHistory';
const MAX_TEST_RUNS = 5;

export interface TestHistoryStorage {
  get<T>(key: string, defaultValue: T): T;
  update(key: string, value: unknown): PromiseLike<void>;
}

export interface TestHistoryRecord {
  name: string;
  type: string;
  success: boolean;
  startTime: Date;
  duration: number;
}

interface StoredOrgHistory {
  targetOrg: string;
  runs: StoredTestRun[];
}

interface StoredTestRun {
  name: string;
  type: string;
  success: boolean;
  startTime: string;
  duration: number;
}

export class TestHistoryStore {
  public constructor(private readonly storage: TestHistoryStorage) {}

  public load(targetOrg: string): TestHistoryRecord[] {
    const histories = parseStoredHistories(this.storage.get<unknown>(STORAGE_KEY, []));
    const history = histories.find((item) => item.targetOrg === targetOrg);
    return (history?.runs ?? []).map((run) => ({
      ...run,
      startTime: new Date(run.startTime),
    }));
  }

  public async save(targetOrg: string, runs: readonly TestHistoryRecord[]): Promise<void> {
    const histories = parseStoredHistories(this.storage.get<unknown>(STORAGE_KEY, []));
    const storedRuns = runs.slice(0, MAX_TEST_RUNS).map((run) => ({
      name: run.name,
      type: run.type,
      success: run.success,
      startTime: run.startTime.toISOString(),
      duration: run.duration,
    }));
    const existingIndex = histories.findIndex((item) => item.targetOrg === targetOrg);
    if (existingIndex >= 0) {
      histories[existingIndex] = { targetOrg, runs: storedRuns };
    } else {
      histories.push({ targetOrg, runs: storedRuns });
    }
    await this.storage.update(STORAGE_KEY, histories);
  }
}

function parseStoredHistories(value: unknown): StoredOrgHistory[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const histories: StoredOrgHistory[] = [];
  for (const itemValue of value) {
    const item = asRecord(itemValue);
    if (!item || typeof item.targetOrg !== 'string' || !Array.isArray(item.runs)) {
      continue;
    }
    histories.push({
      targetOrg: item.targetOrg,
      runs: item.runs.flatMap((run) => {
        const parsed = parseStoredRun(run);
        return parsed ? [parsed] : [];
      }),
    });
  }
  return histories;
}

function parseStoredRun(value: unknown): StoredTestRun | undefined {
  const run = asRecord(value);
  if (
    !run
    || typeof run.name !== 'string'
    || typeof run.type !== 'string'
    || typeof run.success !== 'boolean'
    || typeof run.startTime !== 'string'
    || Number.isNaN(Date.parse(run.startTime))
    || typeof run.duration !== 'number'
    || !Number.isFinite(run.duration)
    || run.duration < 0
  ) {
    return undefined;
  }
  return {
    name: run.name,
    type: run.type,
    success: run.success,
    startTime: run.startTime,
    duration: run.duration,
  };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null ?
      (value as Record<string, unknown>)
    : undefined;
}
