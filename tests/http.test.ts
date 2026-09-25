import assert from 'node:assert/strict';
import test from 'node:test';

import { hmacValid, requireApiKey } from '../src/http.ts';
import type { Env } from '../src/types.ts';

test('requireApiKey accepts the matching owner API key', () => {
  const env = {
    OWNER_API_KEY: 'super-secret-token',
    APP_NAME: 'GITA AI',
    APP_VERSION: '50.0.0',
    ALLOWED_ORIGINS: 'http://localhost:8787',
    MAX_UPLOAD_MB: '250',
    MAX_VIDEO_SECONDS: '1800'
  } as Env;

  const request = new Request('https://example.com/api/v1/agents', {
    headers: {
      'X-Owner-Api-Key': 'super-secret-token'
    }
  });

  assert.doesNotThrow(() => requireApiKey(request, env));
});

test('requireApiKey rejects mismatched or missing keys', () => {
  const env = {
    OWNER_API_KEY: 'super-secret-token',
    APP_NAME: 'GITA AI',
    APP_VERSION: '50.0.0',
    ALLOWED_ORIGINS: 'http://localhost:8787',
    MAX_UPLOAD_MB: '250',
    MAX_VIDEO_SECONDS: '1800'
  } as Env;

  const request = new Request('https://example.com/api/v1/agents', {
    headers: {
      'X-Owner-Api-Key': 'wrong-secret'
    }
  });

  assert.throws(() => requireApiKey(request, env), /Unauthorized/);
});

test('hmacValid verifies a signed payload using the expected secret', async () => {
  const secret = 'webhook-secret';
  const payload = JSON.stringify({ productionId: 'prod_123', status: 'complete' });
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const digest = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload)));
  const signature = [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('');

  assert.equal(await hmacValid(secret, payload, signature), true);
  assert.equal(await hmacValid(secret, payload, 'deadbeef'), false);
});
