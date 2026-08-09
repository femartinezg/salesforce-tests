import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  SfCliClient,
  SfCliError,
  type CancellationTokenLike,
  type SfCliExecutor,
} from '../../src/common/SfCliClient';

void describe('SfCliClient', () => {
  void it('runs sf with isolated arguments and configured limits', async () => {
    const executor: SfCliExecutor = (executable, args, options, callback) => {
      assert.equal(executable, 'sf');
      assert.deepEqual(args, ['org', 'display', '--json']);
      assert.deepEqual(options, { encoding: 'utf8', maxBuffer: 2048, timeout: 5000 });
      queueMicrotask(() => callback(null, '{"status":0}', ''));
      return { kill: () => true };
    };
    const client = new SfCliClient({ executor, maxBufferBytes: 2048, timeoutMs: 5000 });

    assert.equal(await client.run(['org', 'display', '--json']), '{"status":0}');
  });

  void it('parses JSON responses', async () => {
    const client = new SfCliClient({ executor: successfulExecutor('{"status":0}') });

    assert.deepEqual(await client.runJson<{ status: number }>(['org', 'display', '--json']), {
      status: 0,
    });
  });

  void it('normalizes a missing sf executable', async () => {
    const executor: SfCliExecutor = (_executable, _args, _options, callback) => {
      const error = Object.assign(new Error('spawn sf ENOENT'), { code: 'ENOENT' });
      queueMicrotask(() => callback(error, '', ''));
      return { kill: () => true };
    };

    await assert.rejects(new SfCliClient({ executor }).run([]), hasKind('not-found'));
  });

  void it('normalizes timeouts', async () => {
    const executor: SfCliExecutor = (_executable, _args, _options, callback) => {
      const error = Object.assign(new Error('command timed out'), { killed: true });
      queueMicrotask(() => callback(error, '', ''));
      return { kill: () => true };
    };

    await assert.rejects(new SfCliClient({ executor }).run([]), hasKind('timeout'));
  });

  void it('rejects invalid JSON responses', async () => {
    const client = new SfCliClient({ executor: successfulExecutor('not json') });

    await assert.rejects(client.runJson([]), hasKind('invalid-json'));
  });

  void it('parses structured JSON from a failed Salesforce command', async () => {
    const executor: SfCliExecutor = (_executable, _args, _options, callback) => {
      queueMicrotask(() =>
        callback(new Error('exit code 1'), '{"status":1,"message":"No default org"}', '')
      );
      return { kill: () => true };
    };
    const client = new SfCliClient({ executor });

    assert.deepEqual(await client.runJson<{ status: number; message: string }>([]), {
      status: 1,
      message: 'No default org',
    });
  });

  void it('kills and rejects a cancelled command', async () => {
    let cancellationListener: (() => void) | undefined;
    let killed = false;
    const token: CancellationTokenLike = {
      isCancellationRequested: false,
      onCancellationRequested: (listener) => {
        cancellationListener = listener;
        return { dispose: () => undefined };
      },
    };
    const executor: SfCliExecutor = () => ({
      kill: () => {
        killed = true;
        return true;
      },
    });
    const run = new SfCliClient({ executor }).run([], token);

    cancellationListener?.();

    await assert.rejects(run, hasKind('cancelled'));
    assert.equal(killed, true);
  });

  void it('disposes listeners when cancellation fires during registration', async () => {
    let disposed = false;
    const token: CancellationTokenLike = {
      isCancellationRequested: true,
      onCancellationRequested: (listener) => {
        listener();
        return {
          dispose: () => {
            disposed = true;
          },
        };
      },
    };
    const executor: SfCliExecutor = () => ({ kill: () => true });

    await assert.rejects(new SfCliClient({ executor }).run([], token), hasKind('cancelled'));
    assert.equal(disposed, true);
  });
});

function successfulExecutor(stdout: string): SfCliExecutor {
  return (_executable, _args, _options, callback) => {
    queueMicrotask(() => callback(null, stdout, ''));
    return { kill: () => true };
  };
}

function hasKind(kind: SfCliError['kind']): (error: unknown) => boolean {
  return (error: unknown) => error instanceof SfCliError && error.kind === kind;
}
