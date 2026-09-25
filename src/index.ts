import type { Env, RenderMessage, ProviderCallback } from './types';
import { cors, id, json, now, requireApiKey, hmacValid } from './http';

export class ProductionRoom {
  constructor(private state: DurableObjectState, private env: Env) {}

  async fetch(): Promise<Response> {
    const current = await this.state.storage.get<{ status: string }>('state') ?? { status: 'ready' };
    return Response.json({ ok: true, state: current.status, updatedAt: now() });
  }
}

async function audit(env: Env, entityType: string, entityId: string, action: string, details: unknown): Promise<void> {
  await env.DB.prepare('INSERT INTO audit_logs (id, entity_type, entity_id, action, actor, details) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(id(), entityType, entityId, action, 'system', JSON.stringify(details)).run();
}

async function createProduction(request: Request, env: Env): Promise<Response> {
  requireApiKey(request, env);

  const body = await request.json() as {
    projectId?: string;
    seriesId?: string;
    episodeId?: string;
    title?: string;
    prompt?: string;
    provider?: string;
  };

  if (!body.projectId || !body.title || !body.prompt) {
    return json(env, request, { ok: false, error: 'projectId, title and prompt are required' }, 400);
  }

  const project = await env.DB.prepare('SELECT id FROM projects WHERE id = ? AND status = \'ACTIVE\'').bind(body.projectId).first();
  if (!project) {
    return json(env, request, { ok: false, error: 'Project not found' }, 404);
  }

  const productionId = id();
  const jobId = id();
  const message: RenderMessage = {
    type: 'render',
    jobId,
    productionId,
    projectId: body.projectId,
    prompt: body.prompt,
    provider: body.provider ?? 'external-renderer',
    idempotencyKey: request.headers.get('Idempotency-Key') ?? jobId
  };

  await env.DB.batch([
    env.DB.prepare('INSERT INTO productions (id, project_id, series_id, episode_id, title, prompt, status, provider) VALUES (?, ?, ?, ?, ?, ?, \'QUEUED\', ?)')
      .bind(productionId, body.projectId, body.seriesId ?? null, body.episodeId ?? null, body.title, body.prompt, body.provider ?? 'external-renderer'),
    env.DB.prepare('INSERT INTO render_jobs (id, production_id, payload) VALUES (?, ?, ?)')
      .bind(jobId, productionId, JSON.stringify(message)),
    env.DB.prepare('INSERT INTO production_events (id, production_id, event_type, details) VALUES (?, ?, ?, ?)')
      .bind(id(), productionId, 'QUEUED', '{}')
  ]);

  await env.RENDER_QUEUE.send(message);
  await audit(env, 'production', productionId, 'queued', { jobId });

  return json(env, request, { ok: true, productionId, jobId, status: 'QUEUED' }, 201);
}

async function callback(request: Request, env: Env): Promise<Response> {
  const raw = await request.text();
  if (!env.WEBHOOK_SECRET || !(await hmacValid(env.WEBHOOK_SECRET, raw, request.headers.get('X-Webhook-Signature')))) {
    return json(env, request, { ok: false, error: 'Invalid signature' }, 401);
  }

  const data = JSON.parse(raw) as ProviderCallback;
  if (!data.eventId || !data.productionId) {
    return json(env, request, { ok: false, error: 'Invalid callback' }, 400);
  }

  const production = await env.DB.prepare('SELECT id, status FROM productions WHERE id = ?').bind(data.productionId).first<{ id: string; status: string }>();
  if (!production) {
    return json(env, request, { ok: false, error: 'Production not found' }, 404);
  }

  if (data.status === 'failed') {
    await env.DB.prepare('UPDATE productions SET status = \'FAILED\', updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(data.productionId).run();
    await audit(env, 'production', data.productionId, 'failed', { error: data.error ?? 'provider failure' });
    return json(env, request, { ok: true, status: 'FAILED' });
  }

  if (data.status !== 'complete' || !data.artifactKey) {
    return json(env, request, { ok: true, status: 'PROCESSING' });
  }

  const object = await env.MEDIA.head(data.artifactKey);
  if (!object || object.size <= 0) {
    await env.DB.prepare('UPDATE productions SET status = \'VERIFYING_ARTIFACT\', updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(data.productionId).run();
    return json(env, request, { ok: false, error: 'Artifact is not available in R2' }, 409);
  }

  await env.DB.batch([
    env.DB.prepare('UPDATE productions SET status = \'COMPLETE\', artifact_key = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(data.artifactKey, data.productionId),
    env.DB.prepare('INSERT INTO artifacts (id, production_id, object_key, content_type, size_bytes, verified_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)').bind(id(), data.productionId, data.artifactKey, data.contentType ?? 'application/octet-stream', object.size),
    env.DB.prepare('INSERT INTO production_events (id, production_id, event_type, details) VALUES (?, ?, ?, ?)').bind(id(), data.productionId, 'COMPLETE', JSON.stringify({ artifactKey: data.artifactKey }))
  ]);

  await audit(env, 'production', data.productionId, 'complete', { artifactKey: data.artifactKey });
  return json(env, request, { ok: true, status: 'COMPLETE', artifactKey: data.artifactKey });
}

async function consume(batch: MessageBatch<RenderMessage>, env: Env): Promise<void> {
  for (const message of batch.messages) {
    const item = message.body;
    const row = await env.DB.prepare('SELECT status FROM render_jobs WHERE id = ?').bind(item.jobId).first<{ status: string }>();
    if (!row || row.status === 'COMPLETE') {
      message.ack();
      continue;
    }

    await env.DB.prepare('UPDATE render_jobs SET status = \'DISPATCHING\', attempts = attempts + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(item.jobId).run();

    if (!env.RENDER_API_URL || !env.RENDER_API_TOKEN) {
      await env.DB.prepare('UPDATE productions SET status = \'BLOCKED_PROVIDER\', updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(item.productionId).run();
      message.ack();
      continue;
    }

    const response = await fetch(env.RENDER_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.RENDER_API_TOKEN}`
      },
      body: JSON.stringify({
        productionId: item.productionId,
        projectId: item.projectId,
        prompt: item.prompt,
        provider: item.provider,
        idempotencyKey: item.idempotencyKey,
        jobId: item.jobId
      })
    });

    if (!response.ok) {
      throw new Error(`Render provider returned ${response.status}`);
    }

    await env.DB.batch([
      env.DB.prepare('UPDATE render_jobs SET status = \'PROCESSING\', updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(item.jobId),
      env.DB.prepare('UPDATE productions SET status = \'PROCESSING\', updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(item.productionId)
    ]);

    message.ack();
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors(env, request) });
    }

    try {
      if (url.pathname === '/health') {
        return json(env, request, { ok: true, app: env.APP_NAME, version: env.APP_VERSION, time: now() });
      }
      if (url.pathname === '/api/v1/agents') {
        requireApiKey(request, env);
        return json(env, request, { ok: true, agents: (await import('./types')).AGENT_CATALOG });
      }
      if (url.pathname === '/api/v1/productions' && request.method === 'POST') {
        return createProduction(request, env);
      }
      if (url.pathname === '/api/v1/provider/callback' && request.method === 'POST') {
        return callback(request, env);
      }
      if (url.pathname === '/api/v1/productions' && request.method === 'GET') {
        requireApiKey(request, env);
        const result = await env.DB.prepare('SELECT * FROM productions ORDER BY created_at DESC').all();
        return json(env, request, { ok: true, productions: result.results });
      }
      if (url.pathname === '/api/v1/projects' && request.method === 'POST') {
        requireApiKey(request, env);
        const body = await request.json() as { name?: string; owner?: string };
        if (!body.name) {
          return json(env, request, { ok: false, error: 'name is required' }, 400);
        }

        const projectId = id();
        await env.DB.prepare('INSERT INTO projects (id, name, owner, status) VALUES (?, ?, ?, \'ACTIVE\')')
          .bind(projectId, body.name, body.owner ?? 'owner').run();

        return json(env, request, { ok: true, project: { id: projectId, name: body.name, owner: body.owner ?? 'owner', status: 'ACTIVE' } }, 201);
      }
      if (url.pathname.startsWith('/room/')) {
        const room = env.PRODUCTION_ROOM.get(env.PRODUCTION_ROOM.idFromName(url.pathname.slice(6) || 'default'));
        return room.fetch(request);
      }

      return env.ASSETS.fetch(request);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Internal error';
      return json(env, request, { ok: false, error: message }, message === 'Unauthorized' ? 401 : 500);
    }
  },

  async queue(batch: MessageBatch<RenderMessage>, env: Env): Promise<void> {
    await consume(batch, env);
  }
};
