import spawn from 'cross-spawn';

export interface RunSfOptions {
  maxBuffer?: number;
}

export interface RunSfResult {
  stdout: string;
  error?: Error;
}

const DEFAULT_MAX_BUFFER = 1024 * 1024;

export function runSf(args: string[], options: RunSfOptions = {}): Promise<RunSfResult> {
  try {
    validateArguments(args);
  } catch (error) {
    return Promise.reject(
      error instanceof Error ? error : new Error('Invalid Salesforce CLI arguments')
    );
  }

  const maxBuffer = options.maxBuffer ?? DEFAULT_MAX_BUFFER;
  if (!Number.isSafeInteger(maxBuffer) || maxBuffer < 0) {
    return Promise.reject(new Error('Salesforce CLI maxBuffer must be a non-negative integer'));
  }

  return new Promise((resolve) => {
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let stdoutLength = 0;
    let stderrLength = 0;
    let settled = false;

    const child = spawn('sf', args, { shell: false });

    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      resolve({
        stdout: Buffer.concat(stdoutChunks, stdoutLength).toString('utf8'),
        ...(error ? { error } : {}),
      });
    };

    const capture = (
      chunk: Buffer | string,
      chunks: Buffer[],
      currentLength: number,
      streamName: 'stdout' | 'stderr'
    ): number => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      if (currentLength + buffer.length > maxBuffer) {
        child.kill();
        finish(new Error(`Salesforce CLI ${streamName} exceeded maxBuffer of ${maxBuffer} bytes`));
        return currentLength;
      }
      chunks.push(buffer);
      return currentLength + buffer.length;
    };

    child.stdout?.on('data', (chunk: Buffer | string) => {
      stdoutLength = capture(chunk, stdoutChunks, stdoutLength, 'stdout');
    });
    child.stderr?.on('data', (chunk: Buffer | string) => {
      stderrLength = capture(chunk, stderrChunks, stderrLength, 'stderr');
    });

    child.once('error', (error) => {
      finish(error);
    });

    child.once('close', (code, signal) => {
      if (settled) return;
      if (code === 0) {
        finish();
        return;
      }

      const stderr = Buffer.concat(stderrChunks, stderrLength).toString('utf8').trim();
      const outcome = signal ? `signal ${signal}` : `exit code ${String(code)}`;
      finish(new Error(`Salesforce CLI failed with ${outcome}${stderr ? `: ${stderr}` : ''}`));
    });
  });
}

function validateArguments(args: string[]): void {
  if (!Array.isArray(args)) {
    throw new TypeError('Every Salesforce CLI argument must be text');
  }

  for (const argument of args) {
    if (typeof argument !== 'string') {
      throw new TypeError('Every Salesforce CLI argument must be text');
    }
    if (/[\0\r\n]/.test(argument)) {
      throw new TypeError('Salesforce CLI arguments cannot contain NUL, CR, or LF controls');
    }
  }
}
