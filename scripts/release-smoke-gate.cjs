#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

function getArg(flag, fallback = null) {
  const args = process.argv.slice(2);
  const index = args.indexOf(flag);
  if (index === -1) return fallback;
  return args[index + 1] ?? fallback;
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function safeRead(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return fs.readFileSync(filePath, 'utf8');
}

function extractChecklistIds(content) {
  const ids = new Set();
  const regex = /\[(SMK-[A-Z0-9-]+)\]/g;
  let match = regex.exec(content);
  while (match) {
    ids.add(match[1]);
    match = regex.exec(content);
  }
  return [...ids];
}

function extractResultStatuses(content) {
  const statuses = new Map();
  const lineRegex = /^\s*-\s*\[([ xX])\]\s*\[(SMK-[A-Z0-9-]+)\]\s*(.*)$/gm;
  let match = lineRegex.exec(content);
  while (match) {
    const checked = String(match[1]).toLowerCase() === 'x';
    statuses.set(match[2], {
      checked,
      line: match[0],
      note: String(match[3] ?? '').trim(),
    });
    match = lineRegex.exec(content);
  }
  return statuses;
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function main() {
  const checklistPath = path.resolve(
    process.cwd(),
    getArg('--checklist', 'docs/release-smoke-checklist.md')
  );
  const resultPath = path.resolve(
    process.cwd(),
    getArg('--result', 'docs/release-smoke-result.md')
  );
  const outDir = path.resolve(
    process.cwd(),
    getArg('--outDir', 'release-smoke-artifacts')
  );
  const releaseTag = getArg('--release', process.env.RELEASE_TAG || 'unknown-release');
  const qaOwner = getArg('--owner', process.env.QA_OWNER || 'unknown-owner');

  ensureDir(outDir);

  const checklistContent = safeRead(checklistPath);
  const resultContent = safeRead(resultPath);

  if (!checklistContent) {
    const summary = {
      ok: false,
      reason: `Checklist file not found: ${checklistPath}`,
      releaseTag,
      qaOwner,
      generatedAt: new Date().toISOString(),
    };
    writeJson(path.join(outDir, 'smoke-gate-summary.json'), summary);
    console.error(summary.reason);
    process.exit(1);
  }

  if (!resultContent) {
    const summary = {
      ok: false,
      reason: `Result file not found: ${resultPath}`,
      releaseTag,
      qaOwner,
      generatedAt: new Date().toISOString(),
    };
    writeJson(path.join(outDir, 'smoke-gate-summary.json'), summary);
    console.error(summary.reason);
    process.exit(1);
  }

  const requiredIds = extractChecklistIds(checklistContent).sort();
  const resultStatuses = extractResultStatuses(resultContent);

  const missingInResult = requiredIds.filter((id) => !resultStatuses.has(id));
  const unchecked = requiredIds.filter((id) => {
    const item = resultStatuses.get(id);
    return !item || !item.checked;
  });

  const summary = {
    ok: missingInResult.length === 0 && unchecked.length === 0,
    releaseTag,
    qaOwner,
    checklistPath: path.relative(process.cwd(), checklistPath),
    resultPath: path.relative(process.cwd(), resultPath),
    requiredChecks: requiredIds.length,
    checkedPass: requiredIds.length - unchecked.length,
    missingInResult,
    unchecked,
    generatedAt: new Date().toISOString(),
  };

  const markdownLines = [
    '# Release Smoke Gate Summary',
    '',
    `- Release: ${releaseTag}`,
    `- QA Owner: ${qaOwner}`,
    `- Checklist: ${summary.checklistPath}`,
    `- Result: ${summary.resultPath}`,
    `- Required checks: ${summary.requiredChecks}`,
    `- Passed checks: ${summary.checkedPass}`,
    `- Status: ${summary.ok ? 'PASS' : 'FAIL'}`,
    '',
  ];

  if (missingInResult.length > 0) {
    markdownLines.push('## Missing In Result');
    missingInResult.forEach((id) => markdownLines.push(`- ${id}`));
    markdownLines.push('');
  }

  if (unchecked.length > 0) {
    markdownLines.push('## Unchecked / Failed');
    unchecked.forEach((id) => {
      const item = resultStatuses.get(id);
      markdownLines.push(`- ${id}${item?.note ? `: ${item.note}` : ''}`);
    });
    markdownLines.push('');
  }

  writeJson(path.join(outDir, 'smoke-gate-summary.json'), summary);
  fs.writeFileSync(
    path.join(outDir, 'smoke-gate-summary.md'),
    `${markdownLines.join('\n')}\n`,
    'utf8'
  );

  fs.copyFileSync(checklistPath, path.join(outDir, 'release-smoke-checklist.md'));
  fs.copyFileSync(resultPath, path.join(outDir, 'release-smoke-result.md'));

  if (!summary.ok) {
    console.error('Release smoke gate failed.');
    if (missingInResult.length > 0) {
      console.error(`Missing entries: ${missingInResult.join(', ')}`);
    }
    if (unchecked.length > 0) {
      console.error(`Unchecked entries: ${unchecked.join(', ')}`);
    }
    process.exit(1);
  }

  console.log('Release smoke gate passed.');
}

main();
