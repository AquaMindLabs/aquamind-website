const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { initializeApp, applicationDefault, getApps } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');
const {
  AI_DIAGNOSTIC_CODES,
  createAiRequestHandlers,
  createFirestoreAiDataStore,
  createOpenAiResponsesProvider,
  createRuleBasedAiProvider,
} = require('./ai-backend-core.cjs');

const AI_BACKEND_RUNTIME_VERSION = 'ai-backend-provider-fallback-v9';

function loadEnvFile() {
  const envPath = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) {
    return;
  }

  const raw = fs.readFileSync(envPath, 'utf8');
  raw.split(/\r?\n/).forEach((line) => {
    const trimmed = String(line ?? '').trim();
    if (!trimmed || trimmed.startsWith('#')) {
      return;
    }

    const equalsIndex = trimmed.indexOf('=');
    if (equalsIndex <= 0) {
      return;
    }

    const key = trimmed.slice(0, equalsIndex).trim();
    if (!key || Object.prototype.hasOwnProperty.call(process.env, key)) {
      return;
    }

    const value = trimmed.slice(equalsIndex + 1).trim();
    process.env[key] = value.replace(/^['"]|['"]$/g, '');
  });
}

loadEnvFile();

function resolveProjectId() {
  return String(
    process.env.FIREBASE_PROJECT_ID ||
      process.env.GCLOUD_PROJECT ||
      process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ||
      ''
  ).trim();
}

function ensureAdminServices() {
  if (getApps().length === 0) {
    const projectId = resolveProjectId();
    initializeApp({
      credential: applicationDefault(),
      ...(projectId ? { projectId } : {}),
    });
  }

  return {
    auth: getAuth(),
    db: getFirestore(),
  };
}

function readJsonBody(req, maxBytes = 4 * 1024 * 1024) {
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

function sendNoContent(res, statusCode = 204) {
  res.writeHead(statusCode);
  res.end();
}

function pathOnly(url) {
  return String(url ?? '').split('?')[0] || '/';
}

function resolveAiProviderConfig() {
  const providerName = String(process.env.AI_PROVIDER_NAME || 'rule_based')
    .trim()
    .toLowerCase();
  if (providerName === 'openai') {
    return {
      providerName: 'openai',
      provider: createOpenAiResponsesProvider({
        apiKey: process.env.OPENAI_API_KEY,
        model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
        baseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
        maxOutputTokens: Number(process.env.OPENAI_MAX_OUTPUT_TOKENS || 2400),
      }),
    };
  }

  return {
    providerName: 'rule_based',
    provider: createRuleBasedAiProvider(),
  };
}

function createAiHttpServer({
  authVerifier,
  dataStore,
  aiProvider,
  logger = console,
  providerTimeoutMs = Number(process.env.AI_PROVIDER_TIMEOUT_MS || 45000),
  providerName = process.env.AI_PROVIDER_NAME || 'rule_based',
} = {}) {
  const handlers = createAiRequestHandlers({
    authVerifier,
    dataStore,
    aiProvider,
    logger,
    providerTimeoutMs,
    providerName,
  });

  return http.createServer(async (req, res) => {
    const route = pathOnly(req.url);
    const method = String(req.method ?? '').toUpperCase();

    if (method === 'GET' && (route === '/healthz' || route === '/health')) {
      sendJson(res, 200, {
        ok: true,
        provider: providerName,
        version: AI_BACKEND_RUNTIME_VERSION,
      });
      return;
    }

    if (method === 'OPTIONS') {
      sendNoContent(res);
      return;
    }

    if (method !== 'POST') {
      sendJson(res, 405, {
        ok: false,
        diagnosticCode: AI_DIAGNOSTIC_CODES.VALIDATION,
        message: 'Metoda HTTP nie jest obslugiwana.',
      });
      return;
    }

    if (route !== '/ai/chat' && route !== '/ai/vision/analyze') {
      sendJson(res, 404, {
        ok: false,
        diagnosticCode: AI_DIAGNOSTIC_CODES.VALIDATION,
        message: 'Nie znaleziono endpointu.',
      });
      return;
    }

    let payload = {};
    try {
      payload = await readJsonBody(req);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message === 'invalid_json') {
        sendJson(res, 400, {
          ok: false,
          diagnosticCode: AI_DIAGNOSTIC_CODES.VALIDATION,
          message: 'Nieprawidlowy JSON.',
        });
        return;
      }
      if (message === 'payload_too_large') {
        sendJson(res, 413, {
          ok: false,
          diagnosticCode: AI_DIAGNOSTIC_CODES.VALIDATION,
          message: 'Zbyt duzy payload.',
        });
        return;
      }

      sendJson(res, 500, {
        ok: false,
        diagnosticCode: AI_DIAGNOSTIC_CODES.INTERNAL,
        message: 'Blad odczytu requestu.',
      });
      return;
    }

    const handlerPayload = {
      headers: req.headers ?? {},
      payload,
    };

    const result =
      route === '/ai/chat'
        ? await handlers.handleChat(handlerPayload)
        : await handlers.handleVision(handlerPayload);

    sendJson(res, result.httpStatus, result.body);
  });
}

async function startServer() {
  const port = Number(process.env.PORT || process.env.AI_BACKEND_PORT || 8790);
  const { auth, db } = ensureAdminServices();

  const authVerifier = {
    async verifyIdToken(token) {
      return auth.verifyIdToken(token);
    },
  };
  const dataStore = createFirestoreAiDataStore(db, { projectId: resolveProjectId() });
  const { provider, providerName } = resolveAiProviderConfig();

  const server = createAiHttpServer({
    authVerifier,
    dataStore,
    aiProvider: provider,
    logger: console,
    providerTimeoutMs: Number(process.env.AI_PROVIDER_TIMEOUT_MS || 45000),
    providerName,
  });

  server.listen(port, () => {
    console.log(
      `AI backend server listening on http://0.0.0.0:${port} (provider=${providerName}, version=${AI_BACKEND_RUNTIME_VERSION})`
    );
  });
}

if (require.main === module) {
  startServer().catch((error) => {
    console.error('ai_backend_server_start_failed', {
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    process.exitCode = 1;
  });
}

module.exports = {
  createAiHttpServer,
  startServer,
};
