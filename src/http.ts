import type { Env } from './types';

export function cors(env: Env, request: Request): Headers {
  const headers = new Headers({
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Idempotency-Key, X-Webhook-Signature',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  });
  const origin = request.headers.get('Origin');
  const allowed = env.ALLOWED_ORIGINS.split(',').map((x) => x.trim());
  if (origin && (allowed.includes(origin) || allowed.includes('*'))) headers.set('Access-Control-Allow-Origin', origin);
  return headers;
}

export function json(env: Env, request: Request, data: unknown, status = 200): Response {
  const headers = cors(env, request);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('Cache-Control', 'no-store');
  return new Response(JSON.stringify(data), { status, headers });
}

export function requireApiKey(request: Request, env: Env): void {
  const expected = env.OWNER_API_KEY;
  const supplied = request.headers.get('X-Owner-Api-Key') ?? request.headers.get('Authorization')?.replace(/^Bearer\s+/, '');
  if (!expected || !supplied || supplied.length !== expected.length) throw new Error('Unauthorized');
  let different = 0;
  for (let i = 0; i < expected.length; i++) different |= expected.charCodeAt(i) ^ supplied.charCodeAt(i);
  if (different !== 0) throw new Error('Unauthorized');
}

export async function hmacValid(secret: string, payload: string, signature: string | null): Promise<boolean> {
  if (!signature) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const bytes = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload)));
  const expected = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return expected.length === signature.length && expected.split('').every((c, i) => c === signature[i]);
}

export function id(): string { return crypto.randomUUID(); }
export function now(): string { return new Date().toISOString(); }
