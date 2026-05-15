const http = require('node:http');
const { initializeApp, applicationDefault, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const {
  DEFAULT_PLAN_VERSION,
  buildProductTierMapFromEnv,
  createFirestoreSubscriptionSyncStore,
  isWebhookAuthorized,
  processRevenueCatWebhookEvent,
} = require('./subscription-webhook-sync.cjs');

function resolveProjectId() {
  return String(
    process.env.FIREBASE_PROJECT_ID ||
      process.env.GCLOUD_PROJECT ||
      process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ||
      ''
  ).trim();
}

function ensureAdminFirestore() {
  if (getApps().length === 0) {
    const projectId = resolveProjectId();
    initializeApp({
      credential: applicationDefault(),
      ...(projectId ? { projectId } : {}),
    });
  }
  return getFirestore();
}

function readJsonBody(req, maxBytes = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;

    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new Error('payload_too_large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8').trim();
      if (!raw) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('invalid_json'));
      }
    });

    req.on('error', reject);
  });
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function shouldHandlePath(url, expectedPath) {
  const incoming = String(url ?? '').split('?')[0] || '/';
  return incoming === expectedPath;
}

async function startServer() {
  const port = Number(process.env.SUBSCRIPTION_WEBHOOK_PORT || 8787);
  const webhookPath = String(process.env.SUBSCRIPTION_WEBHOOK_PATH || '/webhooks/revenuecat').trim() || '/webhooks/revenuecat';
  const webhookSecret = String(process.env.SUBSCRIPTION_WEBHOOK_SECRET || '').trim();
  const planVersion = Number(process.env.SUBSCRIPTION_PLAN_VERSION || DEFAULT_PLAN_VERSION);
  const db = ensureAdminFirestore();
  const store = createFirestoreSubscriptionSyncStore(db);
  const productTierMap = buildProductTierMapFromEnv();

  const server = http.createServer(async (req, res) => {
    if (!shouldHandlePath(req.url, webhookPath)) {
      sendJson(res, 404, { ok: false, status: 'not_found' });
      return;
    }

    if (req.method !== 'POST') {
      sendJson(res, 405, { ok: false, status: 'method_not_allowed' });
      return;
    }

    if (!isWebhookAuthorized(req.headers, webhookSecret)) {
      sendJson(res, 401, { ok: false, status: 'unauthorized' });
      return;
    }

    try {
      const payload = await readJsonBody(req);
      const result = await processRevenueCatWebhookEvent({
        payload,
        store,
        productTierMap,
        planVersion,
        nowMs: Date.now,
        logger: console,
      });

      if (!result.ok && result.status === 'invalid') {
        sendJson(res, 400, result);
        return;
      }

      sendJson(res, 200, result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message === 'invalid_json') {
        sendJson(res, 400, {
          ok: false,
          status: 'invalid_json',
        });
        return;
      }
      if (message === 'payload_too_large') {
        sendJson(res, 413, {
          ok: false,
          status: 'payload_too_large',
        });
        return;
      }

      console.error('subscription_webhook_http_failed', {
        errorMessage: message,
      });
      sendJson(res, 500, {
        ok: false,
        status: 'internal_error',
      });
    }
  });

  server.listen(port, () => {
    console.log(
      `Subscription webhook server listening on http://0.0.0.0:${port}${webhookPath}`
    );
  });
}

startServer().catch((error) => {
  console.error('subscription_webhook_server_start_failed', {
    errorMessage: error instanceof Error ? error.message : String(error),
  });
  process.exitCode = 1;
});
