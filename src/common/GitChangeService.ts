import { execFile } from 'node:child_process';
import path from 'node:path';

const GIT_TIMEOUT_MS = 10_000;
const GIT_MAX_BUFFER_BYTES = 2 * 1024 * 1024;

export interface GitCommandClient {
  run(args: readonly string[], cwd: string): Promise<string>;
}

export class GitClient implements GitCommandClient {
  public run(args: readonly string[], cwd: string): Promise<string> {
    return new Promise((resolve, reject) => {
      execFile(
        'git',
        [...args],
        {
          cwd,
          encoding: 'utf8',
          maxBuffer: GIT_MAX_BUFFER_BYTES,
          timeout: GIT_TIMEOUT_MS,
        },
        (error, stdout, stderr) => {
          if (error) {
            reject(new Error(stderr.trim() || error.message, { cause: error }));
            return;
          }
          resolve(stdout);
        }
      );
    });
  }
}

export async function retrieveChangedApexComponents(
  client: GitCommandClient,
  workspaceDirectory: string
): Promise<string[]> {
  const trackedFiles = await client.run(
    ['diff', 'HEAD', '--name-only', '--diff-filter=ACMR'],
    workspaceDirectory
  );
  const untrackedFiles = await client.run(
    ['ls-files', '--others', '--exclude-standard'],
    workspaceDirectory
  );

  const componentNames = new Set<string>();
  for (const fileName of [...parseFileNames(trackedFiles), ...parseFileNames(untrackedFiles)]) {
    const extension = path.extname(fileName).toLowerCase();
    if (extension !== '.cls' && extension !== '.trigger') {
      continue;
    }
    const componentName = path.basename(fileName, extension);
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(componentName)) {
      componentNames.add(componentName);
    }
  }
  return [...componentNames].sort((left, right) => left.localeCompare(right));
}

function parseFileNames(output: string): string[] {
  return output
    .split(/\r?\n/)
    .map((fileName) => fileName.trim())
    .filter((fileName) => fileName.length > 0);
}
