import { execFile } from 'node:child_process';

const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_BUFFER_BYTES = 100 * 1024 * 1024;

export type SfCliErrorKind =
  | 'cancelled'
  | 'timeout'
  | 'not-found'
  | 'execution'
  | 'invalid-json'
  | 'invalid-response';

export interface SfCliErrorOptions extends ErrorOptions {
  stdout?: string;
}

export class SfCliError extends Error {
  public readonly stdout?: string;

  constructor(
    public readonly kind: SfCliErrorKind,
    message: string,
    options?: SfCliErrorOptions
  ) {
    super(message, options);
    this.name = 'SfCliError';
    this.stdout = options?.stdout;
  }
}

export interface CancellationTokenLike {
  readonly isCancellationRequested: boolean;
  onCancellationRequested(listener: () => void): DisposableLike;
}

export interface DisposableLike {
  dispose(): void;
}

export interface KillableProcess {
  kill(): boolean;
}

export interface SfCliProcessError extends Error {
  code?: string | number | null;
  killed?: boolean;
}

export interface SfCliExecutionOptions {
  encoding: 'utf8';
  maxBuffer: number;
  timeout: number;
}

export type SfCliExecutor = (
  executable: string,
  args: string[],
  options: SfCliExecutionOptions,
  callback: (error: SfCliProcessError | null, stdout: string, stderr: string) => void
) => KillableProcess;

export interface SfCliClientOptions {
  executor?: SfCliExecutor;
  timeoutMs?: number;
  maxBufferBytes?: number;
}

export interface JsonSfCliClient {
  runJson<T>(args: readonly string[], cancellationToken?: CancellationTokenLike): Promise<T>;
}

export class SfCliClient {
  private readonly executor: SfCliExecutor;
  private readonly timeoutMs: number;
  private readonly maxBufferBytes: number;

  constructor(options: SfCliClientOptions = {}) {
    this.executor = options.executor ?? executeSf;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxBufferBytes = options.maxBufferBytes ?? DEFAULT_MAX_BUFFER_BYTES;
  }

  public run(args: readonly string[], cancellationToken?: CancellationTokenLike): Promise<string> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const cancellation = { subscription: undefined as DisposableLike | undefined };

      const rejectOnce = (error: SfCliError): void => {
        if (settled) {
          return;
        }
        settled = true;
        cancellation.subscription?.dispose();
        reject(error);
      };

      const process = this.executor(
        'sf',
        [...args],
        {
          encoding: 'utf8',
          maxBuffer: this.maxBufferBytes,
          timeout: this.timeoutMs,
        },
        (error, stdout, stderr) => {
          if (settled) {
            return;
          }
          settled = true;
          cancellation.subscription?.dispose();

          if (error) {
            reject(normalizeProcessError(error, stdout, stderr));
            return;
          }

          if (!stdout) {
            reject(new SfCliError('execution', 'Salesforce CLI returned no output.'));
            return;
          }

          resolve(stdout);
        }
      );

      if (settled) {
        return;
      }

      cancellation.subscription = cancellationToken?.onCancellationRequested(() => {
        process.kill();
        rejectOnce(new SfCliError('cancelled', 'Salesforce CLI command was cancelled.'));
      });

      if (settled) {
        cancellation.subscription?.dispose();
        return;
      }

      if (cancellationToken?.isCancellationRequested) {
        process.kill();
        rejectOnce(new SfCliError('cancelled', 'Salesforce CLI command was cancelled.'));
      }
    });
  }

  public async runJson<T>(
    args: readonly string[],
    cancellationToken?: CancellationTokenLike
  ): Promise<T> {
    let stdout: string;
    let processError: SfCliError | undefined;

    try {
      stdout = await this.run(args, cancellationToken);
    } catch (error: unknown) {
      if (error instanceof SfCliError && error.kind === 'execution' && error.stdout) {
        stdout = error.stdout;
        processError = error;
      } else {
        throw error;
      }
    }

    try {
      return JSON.parse(stdout) as T;
    } catch (error: unknown) {
      throw new SfCliError('invalid-json', 'Salesforce CLI returned invalid JSON.', {
        cause: processError ?? error,
      });
    }
  }
}

const executeSf: SfCliExecutor = (executable, args, options, callback) =>
  execFile(executable, args, options, (error, stdout, stderr) => {
    callback(error, stdout, stderr);
  });

function normalizeProcessError(
  error: SfCliProcessError,
  stdout: string,
  stderr: string
): SfCliError {
  if (error.code === 'ENOENT') {
    return new SfCliError('not-found', 'Salesforce CLI executable `sf` was not found.', {
      cause: error,
    });
  }

  if (error.killed) {
    return new SfCliError('timeout', 'Salesforce CLI command timed out.', { cause: error });
  }

  const detail = stderr.trim() || error.message;
  return new SfCliError('execution', `Salesforce CLI command failed: ${detail}`, {
    cause: error,
    stdout,
  });
}
