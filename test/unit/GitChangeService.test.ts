import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  retrieveChangedApexComponents,
  type GitCommandClient,
} from '../../src/common/GitChangeService';

void describe('retrieveChangedApexComponents', () => {
  void it('combines tracked and untracked Apex classes and triggers', async () => {
    const client = new StubGitClient([
      'force-app/main/default/classes/Calculator.cls\nREADME.md\nforce-app/main/default/triggers/Account.trigger\n',
      'force-app/main/default/classes/NewService.cls\nforce-app/main/default/classes/Calculator.cls\n',
    ]);

    assert.deepEqual(await retrieveChangedApexComponents(client, '/workspace'), [
      'Account',
      'Calculator',
      'NewService',
    ]);
    assert.deepEqual(client.calls, [
      { args: ['diff', 'HEAD', '--name-only', '--diff-filter=ACMR'], cwd: '/workspace' },
      { args: ['ls-files', '--others', '--exclude-standard'], cwd: '/workspace' },
    ]);
  });

  void it('ignores deleted, unrelated, and invalid component paths reported by Git', async () => {
    const client = new StubGitClient(['docs/guide.md\nclasses/not-valid!.cls\n', '']);

    assert.deepEqual(await retrieveChangedApexComponents(client, '/workspace'), []);
  });
});

class StubGitClient implements GitCommandClient {
  public readonly calls: { args: string[]; cwd: string }[] = [];

  public constructor(private readonly responses: string[]) {}

  public run(args: readonly string[], cwd: string): Promise<string> {
    this.calls.push({ args: [...args], cwd });
    const response = this.responses.shift();
    return response === undefined ?
        Promise.reject(new Error('No stub response remains.'))
      : Promise.resolve(response);
  }
}
