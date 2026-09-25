export interface Env {
  DB: D1Database;
  MEDIA: R2Bucket;
  RENDER_QUEUE: Queue<RenderMessage>;
  PRODUCTION_ROOM: DurableObjectNamespace;
  ASSETS: Fetcher;
  OWNER_API_KEY?: string;
  RENDER_API_URL?: string;
  RENDER_API_TOKEN?: string;
  WEBHOOK_SECRET?: string;
  APP_NAME: string;
  APP_VERSION: string;
  ALLOWED_ORIGINS: string;
  MAX_UPLOAD_MB: string;
  MAX_VIDEO_SECONDS: string;
}

export type ProductionStatus =
  | 'DRAFT' | 'QUEUED' | 'DISPATCHING' | 'PROCESSING'
  | 'VERIFYING_ARTIFACT' | 'COMPLETE' | 'FAILED' | 'CANCELLED' | 'BLOCKED_PROVIDER';

export interface RenderMessage {
  type: 'render';
  jobId: string;
  productionId: string;
  projectId: string;
  prompt: string;
  provider: string;
  idempotencyKey: string;
}

export interface ProviderCallback {
  eventId: string;
  productionId: string;
  status: 'processing' | 'complete' | 'failed';
  artifactKey?: string;
  contentType?: string;
  error?: string;
}

export const AGENT_CATALOG = Array.from({ length: 50 }, (_, index) => ({
  id: `agent-${String(index + 1).padStart(2, '0')}`,
  name: `GITA Production Agent ${index + 1}`,
  domain: ['strategy','story','script','research','director','scene','visual','camera','audio','voice','music','subtitle','localization','continuity','safety','quality','cost','schedule','render','delivery'][index % 20],
  kpi: ['accuracy','quality','latency','cost','continuity'][index % 5],
  status: 'policy-controlled'
}));
