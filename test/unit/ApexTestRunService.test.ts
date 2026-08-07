import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { executeApexTestRun, parseQueuedTestRunId } from '../../src/common/ApexTestRunService';
import type {
  CancellationTokenLike,
  DisposableLike,
  JsonSfCliClient,
} from '../../src/common/SfCliClient';
import { SfCliError } from '../../src/common/SfCliClient';

const FINISHED_RESPONSE = {
  status: 0,
  result: {
    summary: {
      outcome: 'Passed',
      testStartTime: '2026-08-07T19:00:00.000Z',
      testExecutionTime: '5 ms',
    },
    tests: [],
  },
};

void describe('parseQueuedTestRunId', () => {
  void it('recognizes a queued Salesforce CLI response', () => {
    assert.equal(
      parseQueuedTestRunId({ status: 0, result: { testRunId: '707xx0000001234' } }),
      '707xx0000001234'
    );
  });

  void it('does not hide malformed or command-error responses', () => {
    assert.equal(parseQueuedTestRunId({ status: 1, result: { testRunId: 'ignored' } }), undefined);
    assert.equal(parseQueuedTestRunId({ status: 0, result: {} }), undefined);
  });
});

void describe('executeApexTestRun', () => {
  void it('returns synchronous results without polling', async () => {
    const client = new StubClient([FINISHED_RESPONSE]);

    const result = await executeApexTestRun(client, ['apex', 'run', 'test'], 'test@example.com');

    assert.equal(result.kind, 'test-result');
    assert.equal(client.calls.length, 1);
  });

  void it('retrieves the result of a queued asynchronous run', async () => {
    const client = new StubClient([
      { status: 0, result: { testRunId: '707xx0000001234' } },
      FINISHED_RESPONSE,
    ]);

    const result = await executeApexTestRun(client, ['initial'], 'test@example.com');

    assert.equal(result.kind, 'test-result');
    assert.deepEqual(client.calls[1], [
      'apex',
      'get',
      'test',
      '--test-run-id',
      '707xx0000001234',
      '--code-coverage',
      '--json',
      '--target-org',
      'test@example.com',
    ]);
  });

  void it('does not start another poll after cancellation', async () => {
    const client = new StubClient([{ status: 0, result: { testRunId: '707xx0000001234' } }]);
    const cancellationToken: CancellationTokenLike = {
      isCancellationRequested: true,
      onCancellationRequested: (): DisposableLike => ({ dispose: () => undefined }),
    };

    await assert.rejects(
      executeApexTestRun(client, ['initial'], 'test@example.com', cancellationToken),
      (error: unknown) => error instanceof SfCliError && error.kind === 'cancelled'
    );
    assert.equal(client.calls.length, 1);
  });
});

class StubClient implements JsonSfCliClient {
  public readonly calls: string[][] = [];

  public constructor(private readonly responses: unknown[]) {}

  public runJson<T>(args: readonly string[]): Promise<T> {
    this.calls.push([...args]);
    if (this.responses.length === 0) {
      return Promise.reject(new Error('No stub response remains.'));
    }
    return Promise.resolve(this.responses.shift() as T);
  }
}
