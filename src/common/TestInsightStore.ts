const STORAGE_KEY = 'salesforceTests.testInsights';
const MAX_SAMPLES_PER_TEST = 10;
const MAX_TRACKED_TESTS_PER_ORG = 5_000;

export interface TestInsightStorage {
  get<T>(key: string, defaultValue: T): T;
  update(key: string, value: unknown): PromiseLike<void>;
}

export interface TestInsightSample {
  selector: string;
  success: boolean;
  durationMs?: number;
}

export interface TestInsight {
  selector: string;
  passCount: number;
  failCount: number;
  averageDurationMs?: number;
}

interface StoredOrgInsights {
  targetOrg: string;
  tests: StoredTestInsight[];
}

interface StoredTestInsight {
  selector: string;
  samples: StoredTestSample[];
}

interface StoredTestSample {
  success: boolean;
  durationMs?: number;
}

export class TestInsightStore {
  public constructor(private readonly storage: TestInsightStorage) {}

  public load(targetOrg: string): TestInsight[] {
    const org = parseStoredInsights(this.storage.get<unknown>(STORAGE_KEY, [])).find(
      (item) => item.targetOrg === targetOrg
    );
    return (org?.tests ?? []).map(toInsight);
  }

  public async record(targetOrg: string, samples: readonly TestInsightSample[]): Promise<void> {
    const histories = parseStoredInsights(this.storage.get<unknown>(STORAGE_KEY, []));
    let org = histories.find((item) => item.targetOrg === targetOrg);
    if (!org) {
      org = { targetOrg, tests: [] };
      histories.push(org);
    }

    const testsBySelector = new Map(org.tests.map((test) => [test.selector, test]));
    const updatedTests: StoredTestInsight[] = [];
    const updatedSelectors = new Set<string>();
    for (const sample of samples) {
      if (!sample.selector || !isDuration(sample.durationMs)) {
        continue;
      }
      let test = testsBySelector.get(sample.selector);
      if (!test) {
        test = { selector: sample.selector, samples: [] };
        testsBySelector.set(sample.selector, test);
      }
      if (!updatedSelectors.has(sample.selector)) {
        updatedSelectors.add(sample.selector);
        updatedTests.push(test);
      }
      test.samples.unshift({
        success: sample.success,
        ...(sample.durationMs === undefined ? {} : { durationMs: sample.durationMs }),
      });
      test.samples = test.samples.slice(0, MAX_SAMPLES_PER_TEST);
    }
    const retainedUpdates = updatedTests.slice(-MAX_TRACKED_TESTS_PER_ORG);
    org.tests = [
      ...retainedUpdates,
      ...org.tests.filter((test) => !updatedSelectors.has(test.selector)),
    ].slice(0, MAX_TRACKED_TESTS_PER_ORG);

    await this.storage.update(STORAGE_KEY, histories);
  }
}

function toInsight(test: StoredTestInsight): TestInsight {
  const durations = test.samples.flatMap((sample) =>
    sample.durationMs === undefined ? [] : [sample.durationMs]
  );
  return {
    selector: test.selector,
    passCount: test.samples.filter((sample) => sample.success).length,
    failCount: test.samples.filter((sample) => !sample.success).length,
    ...(durations.length === 0 ?
      {}
    : {
        averageDurationMs:
          durations.reduce((sum, duration) => sum + duration, 0) / durations.length,
      }),
  };
}

function parseStoredInsights(value: unknown): StoredOrgInsights[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((orgValue) => {
    const org = asRecord(orgValue);
    if (!org || typeof org.targetOrg !== 'string' || !Array.isArray(org.tests)) {
      return [];
    }
    return [
      {
        targetOrg: org.targetOrg,
        tests: org.tests.flatMap((testValue) => {
          const test = asRecord(testValue);
          if (!test || typeof test.selector !== 'string' || !Array.isArray(test.samples)) {
            return [];
          }
          const samples = test.samples.flatMap((sampleValue) => {
            const sample = asRecord(sampleValue);
            if (!sample || typeof sample.success !== 'boolean' || !isDuration(sample.durationMs)) {
              return [];
            }
            return [
              {
                success: sample.success,
                ...(sample.durationMs === undefined ? {} : { durationMs: sample.durationMs }),
              },
            ];
          });
          return samples.length === 0 ? [] : [{ selector: test.selector, samples }];
        }),
      },
    ];
  });
}

function isDuration(value: unknown): value is number | undefined {
  return value === undefined || (typeof value === 'number' && Number.isFinite(value) && value >= 0);
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null ?
      (value as Record<string, unknown>)
    : undefined;
}
