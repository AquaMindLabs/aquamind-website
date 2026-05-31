const fs = require('node:fs');
const path = require('node:path');

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
    process.env[key] = trimmed.slice(equalsIndex + 1).trim().replace(/^['"]|['"]$/g, '');
  });
}

function toSafeString(value) {
  return String(value ?? '').trim();
}

function parseHostname(value) {
  const match = toSafeString(value).toLowerCase().match(/^https?:\/\/([^/:?#]+)/);
  return match?.[1] ?? '';
}

function isLocalOrPrivateUrl(value) {
  const host = parseHostname(value);
  if (!host) {
    return false;
  }
  return (
    host === 'localhost' ||
    host === '0.0.0.0' ||
    host.startsWith('127.') ||
    host.startsWith('10.') ||
    host.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  );
}

function fail(message, details = '') {
  console.error(`AI release config audit failed: ${message}`);
  if (details) {
    console.error(details);
  }
  process.exitCode = 1;
}

loadEnvFile();

const backendUrl = toSafeString(process.env.EXPO_PUBLIC_AI_BACKEND_URL);
const providerName = toSafeString(process.env.AI_PROVIDER_NAME).toLowerCase();
const openAiKey = toSafeString(process.env.OPENAI_API_KEY);
const firebaseProjectId = toSafeString(
  process.env.FIREBASE_PROJECT_ID ||
    process.env.GCLOUD_PROJECT ||
    process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID
);

let ok = true;

if (!backendUrl) {
  ok = false;
  fail('EXPO_PUBLIC_AI_BACKEND_URL is missing.');
} else if (!backendUrl.startsWith('https://')) {
  ok = false;
  fail('EXPO_PUBLIC_AI_BACKEND_URL must use HTTPS for production.', backendUrl);
} else if (isLocalOrPrivateUrl(backendUrl)) {
  ok = false;
  fail('EXPO_PUBLIC_AI_BACKEND_URL cannot point to localhost or a private LAN IP.', backendUrl);
}

if (providerName !== 'openai') {
  ok = false;
  fail('AI_PROVIDER_NAME must be openai for production AI.', providerName || '(empty)');
}

if (!openAiKey) {
  ok = false;
  fail('OPENAI_API_KEY is missing on backend/server environment.');
}

if (!firebaseProjectId) {
  ok = false;
  fail('Firebase project id is missing.');
}

if (ok) {
  console.log('AI release config audit passed.');
  console.log(`backendUrl=${backendUrl}`);
  console.log(`provider=${providerName}`);
  console.log(`firebaseProjectId=${firebaseProjectId}`);
}
