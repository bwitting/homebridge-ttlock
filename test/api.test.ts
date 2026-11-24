import assert from 'assert';
import axios from 'axios';
import { TtlockApiClient } from '../src/api';
import { TtlockPlatform } from '../src/platform';

type MockPlatform = {
  config: Record<string, unknown>;
  log: {
    debug: (message: string) => void;
    warn: (message: string) => void;
  };
};

function makeClient(maximumApiRetry: number): { client: TtlockApiClient; debugLogs: string[] } {
  const debugLogs: string[] = [];
  const platform = {
    config: {
      maximumApiRetry,
      clientid: 'client-id',
      clientsecret: 'client-secret',
      username: 'user',
      password: 'hashed-password',
    },
    log: {
      debug: (message: string) => debugLogs.push(message),
      warn: () => undefined,
    },
  } as MockPlatform as unknown as TtlockPlatform;

  return { client: new TtlockApiClient(platform), debugLogs };
}

async function runTest(name: string, test: () => Promise<void>): Promise<void> {
  await test();
  process.stdout.write(`✓ ${name}\n`);
}

async function main(): Promise<void> {
  const originalPost = axios.post;

  try {
    await runTest('uses configured retries and succeeds after transient failures', async () => {
      const { client } = makeClient(2);
      let calls = 0;
      axios.post = (async () => {
        calls += 1;
        if (calls < 3) {
          throw new Error('temporary network failure');
        }
        return { data: { access_token: 'test-access-token', expires_in: 3600 } };
      }) as typeof axios.post;

      assert.strictEqual(await client.getAccessTokenAsync(), 'test-access-token');
      assert.strictEqual(calls, 3);
    });

    await runTest('honors an explicit zero retry count', async () => {
      const { client } = makeClient(5);
      let calls = 0;
      axios.post = (async () => {
        calls += 1;
        throw new Error('unavailable');
      }) as typeof axios.post;

      await assert.rejects(client.getAccessTokenAsync(0), /unavailable/);
      assert.strictEqual(calls, 1);
    });

    await runTest('falls back to configured retries for a non-finite retry count', async () => {
      const { client } = makeClient(1);
      let calls = 0;
      axios.post = (async () => {
        calls += 1;
        if (calls === 1) {
          throw new Error('temporary network failure');
        }
        return { data: { access_token: 'test-access-token', expires_in: 3600 } };
      }) as typeof axios.post;

      assert.strictEqual(await client.getAccessTokenAsync(Number.NaN), 'test-access-token');
      assert.strictEqual(calls, 2);
    });

    await runTest('rejects after the configured retries are exhausted', async () => {
      const { client } = makeClient(1);
      let calls = 0;
      axios.post = (async () => {
        calls += 1;
        throw new Error('still unavailable');
      }) as typeof axios.post;

      await assert.rejects(client.getAccessTokenAsync(), /still unavailable/);
      assert.strictEqual(calls, 2);
    });

    await runTest('does not write the access token to debug logs', async () => {
      const { client, debugLogs } = makeClient(0);
      const token = 'secret-test-token';
      axios.post = (async () => ({
        data: { access_token: token, expires_in: 3600 },
      })) as typeof axios.post;

      await client.getAccessTokenAsync();
      assert.ok(debugLogs.every(message => !message.includes(token)));
    });
  } finally {
    axios.post = originalPost;
  }
}

main().catch(error => {
  process.stderr.write(`${error}\n`);
  process.exitCode = 1;
});
