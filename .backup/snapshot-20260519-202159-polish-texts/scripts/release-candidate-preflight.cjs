#!/usr/bin/env node

const { execSync } = require('node:child_process');

function run(command) {
  return execSync(command, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function parsePorcelain(content) {
  return content
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map((line) => {
      const status = line.slice(0, 2);
      const path = line.slice(3).trim();
      return { status, path };
    });
}

function isNoisyPath(path) {
  return (
    path === 'firestore-debug.log' ||
    path.startsWith('release-smoke-artifacts/')
  );
}

function isDocsOnlyPath(path) {
  return path.startsWith('docs/');
}

function isRuntimePath(path) {
  return (
    path.startsWith('app/') ||
    path.startsWith('features/') ||
    path.startsWith('shared/') ||
    path === 'package.json' ||
    path === 'package-lock.json' ||
    path === 'app.json' ||
    path === 'firebase.json' ||
    path === 'storage.rules'
  );
}

function formatList(items) {
  if (items.length === 0) {
    return '- brak';
  }
  return items.map((item) => `- ${item}`).join('\n');
}

function main() {
  const raw = run('git status --porcelain');
  const changes = parsePorcelain(raw);
  const paths = changes.map((entry) => entry.path);

  const noisy = paths.filter(isNoisyPath);
  const docsOnly = paths.filter(isDocsOnlyPath);
  const runtime = paths.filter(isRuntimePath);
  const other = paths.filter(
    (path) =>
      !isNoisyPath(path) && !isDocsOnlyPath(path) && !isRuntimePath(path)
  );

  const hasP0AuthFixFiles =
    paths.includes('features/aquarium/context/TankContext.tsx') &&
    paths.includes('features/aquarium/subscription/billingService.ts');
  const hasGateArtifacts =
    paths.includes('scripts/release-smoke-gate.cjs') &&
    paths.includes('docs/release-smoke-result.md');

  const lines = [
    '# Release Candidate Preflight',
    '',
    `- total changed paths: ${paths.length}`,
    `- runtime-impact paths: ${runtime.length}`,
    `- docs-only paths: ${docsOnly.length}`,
    `- noisy/generated paths: ${noisy.length}`,
    `- other paths: ${other.length}`,
    `- p0-auth-fix-files-present: ${hasP0AuthFixFiles ? 'yes' : 'no'}`,
    `- smoke-gate-evidence-present: ${hasGateArtifacts ? 'yes' : 'no'}`,
    '',
    '## Runtime-impact paths',
    formatList(runtime),
    '',
    '## Docs-only paths',
    formatList(docsOnly),
    '',
    '## Noisy/generated paths',
    formatList(noisy),
    '',
    '## Other paths',
    formatList(other),
    '',
    '## Suggested next step',
    noisy.length > 0
      ? '- Przed cieciem release branch odfiltruj noisy/generated paths (artefakty i logi).'
      : '- Noisy/generated paths nie wykryte.',
    runtime.length > 0
      ? '- Przygotuj osobny commit tylko z runtime-impact paths.'
      : '- Brak runtime-impact paths.',
    '- Zachowaj smoke-gate i release-smoke-result jako artefakt decyzyjny.',
  ];

  process.stdout.write(`${lines.join('\n')}\n`);
}

main();
