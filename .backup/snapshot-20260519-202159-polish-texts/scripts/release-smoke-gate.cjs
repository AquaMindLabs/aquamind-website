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
    const note = String(match[3] ?? '').trim();
    const normalizedNote = note.toLowerCase();
    const explicitBlocked =
      normalizedNote.includes('blocked') || normalizedNote.includes('zablok');
    const explicitFail =
      normalizedNote.includes('fail') || normalizedNote.includes('blad');
    const explicitPass = normalizedNote.includes('pass');
    const status = checked
      ? 'pass'
      : explicitBlocked
        ? 'blocked'
        : explicitFail
          ? 'fail'
          : explicitPass
            ? 'pass'
            : 'unchecked';
    const signatureMatches = [...note.matchAll(/\b[A-Z]{2,}-[A-Z]+-\d+\b/g)].map(
      (entry) => entry[0]
    );
    statuses.set(match[2], {
      checked,
      line: match[0],
      note,
      status,
      signatures: [...new Set(signatureMatches)],
    });
    match = lineRegex.exec(content);
  }
  return statuses;
}

function splitChecksByDomain(ids) {
  const ai = [];
  const core = [];
  ids.forEach((id) => {
    if (String(id).startsWith('SMK-AI-')) {
      ai.push(id);
    } else {
      core.push(id);
    }
  });
  return { core, ai };
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
  const manualApprovalRaw = getArg('--manualApproval', process.env.MANUAL_APPROVAL || '');
  const manualApprovalRequired = manualApprovalRaw !== '';
  const manualApproval = String(manualApprovalRaw).trim().toLowerCase();
  const manualApprovalAccepted = manualApproval === 'yes';

  ensureDir(outDir);

  const checklistContent = safeRead(checklistPath);
  const resultContent = safeRead(resultPath);

  if (!checklistContent) {
    const summary = {
      ok: false,
      reason: `Checklist file not found: ${checklistPath}`,
      releaseTag,
      qaOwner,
      manualApproval: manualApproval || 'not_provided',
      manualApprovalRequired,
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
      manualApproval: manualApproval || 'not_provided',
      manualApprovalRequired,
      generatedAt: new Date().toISOString(),
    };
    writeJson(path.join(outDir, 'smoke-gate-summary.json'), summary);
    console.error(summary.reason);
    process.exit(1);
  }

  const requiredIds = extractChecklistIds(checklistContent).sort();
  const resultStatuses = extractResultStatuses(resultContent);
  const checkDomains = splitChecksByDomain(requiredIds);

  const missingInResult = requiredIds.filter((id) => !resultStatuses.has(id));
  const unchecked = requiredIds.filter((id) => {
    const item = resultStatuses.get(id);
    return !item || !item.checked;
  });
  const blocked = requiredIds.filter((id) => {
    const item = resultStatuses.get(id);
    return item?.status === 'blocked';
  });
  const failed = requiredIds.filter((id) => {
    const item = resultStatuses.get(id);
    return item?.status === 'fail';
  });
  const uncheckedOnly = requiredIds.filter((id) => {
    const item = resultStatuses.get(id);
    return item?.status === 'unchecked';
  });
  const blockedSignatures = [
    ...new Set(
      blocked.flatMap((id) => {
        const item = resultStatuses.get(id);
        return Array.isArray(item?.signatures) ? item.signatures : [];
      })
    ),
  ];
  const missingCore = checkDomains.core.filter((id) => !resultStatuses.has(id));
  const uncheckedCore = checkDomains.core.filter((id) => {
    const item = resultStatuses.get(id);
    return !item || !item.checked;
  });
  const blockedCore = checkDomains.core.filter((id) => {
    const item = resultStatuses.get(id);
    return item?.status === 'blocked';
  });
  const failedCore = checkDomains.core.filter((id) => {
    const item = resultStatuses.get(id);
    return item?.status === 'fail';
  });
  const missingAi = checkDomains.ai.filter((id) => !resultStatuses.has(id));
  const uncheckedAi = checkDomains.ai.filter((id) => {
    const item = resultStatuses.get(id);
    return !item || !item.checked;
  });
  const blockedAi = checkDomains.ai.filter((id) => {
    const item = resultStatuses.get(id);
    return item?.status === 'blocked';
  });
  const failedAi = checkDomains.ai.filter((id) => {
    const item = resultStatuses.get(id);
    return item?.status === 'fail';
  });

  const allChecksPassed = missingInResult.length === 0 && unchecked.length === 0;
  const coreChecksPassed = missingCore.length === 0 && uncheckedCore.length === 0;
  const aiChecksPresent = checkDomains.ai.length > 0;
  const aiChecksPassed =
    aiChecksPresent && missingAi.length === 0 && uncheckedAi.length === 0;
  const manualGatePassed = !manualApprovalRequired || manualApprovalAccepted;

  const summary = {
    ok: allChecksPassed && coreChecksPassed && aiChecksPassed && manualGatePassed,
    releaseTag,
    qaOwner,
    manualApproval: manualApproval || 'not_provided',
    manualApprovalRequired,
    manualApprovalAccepted,
    checklistPath: path.relative(process.cwd(), checklistPath),
    resultPath: path.relative(process.cwd(), resultPath),
    requiredChecks: requiredIds.length,
    checkedPass: requiredIds.length - unchecked.length,
    coreChecks: checkDomains.core.length,
    aiChecks: checkDomains.ai.length,
    coreCheckedPass: checkDomains.core.length - uncheckedCore.length,
    aiCheckedPass: checkDomains.ai.length - uncheckedAi.length,
    missingInResult,
    unchecked,
    blocked,
    failed,
    uncheckedOnly,
    blockedSignatures,
    missingCore,
    uncheckedCore,
    blockedCore,
    failedCore,
    missingAi,
    uncheckedAi,
    blockedAi,
    failedAi,
    allChecksPassed,
    coreChecksPassed,
    aiChecksPassed,
    aiChecksPresent,
    manualGatePassed,
    generatedAt: new Date().toISOString(),
  };

  const markdownLines = [
    '# Release Smoke Gate Summary',
    '',
    `- Release: ${releaseTag}`,
    `- QA Owner: ${qaOwner}`,
    `- Checklist: ${summary.checklistPath}`,
    `- Result: ${summary.resultPath}`,
    `- Manual approval required: ${summary.manualApprovalRequired ? 'yes' : 'no'}`,
    `- Manual approval value: ${summary.manualApproval}`,
    `- Required checks: ${summary.requiredChecks}`,
    `- Passed checks: ${summary.checkedPass}`,
    `- Blocked checks: ${summary.blocked.length}`,
    `- Failed checks: ${summary.failed.length}`,
    `- Unchecked checks: ${summary.uncheckedOnly.length}`,
    `- Core checks: ${summary.coreCheckedPass}/${summary.coreChecks} (${summary.coreChecksPassed ? 'PASS' : 'FAIL'})`,
    `- AI checks: ${summary.aiCheckedPass}/${summary.aiChecks} (${summary.aiChecksPassed ? 'PASS' : 'FAIL'})`,
    `- Status: ${summary.ok ? 'PASS' : 'FAIL'}`,
    '',
  ];

  if (missingInResult.length > 0) {
    markdownLines.push('## Missing In Result');
    missingInResult.forEach((id) => markdownLines.push(`- ${id}`));
    markdownLines.push('');
  }

  if (blocked.length > 0) {
    markdownLines.push('## Blocked');
    blocked.forEach((id) => {
      const item = resultStatuses.get(id);
      markdownLines.push(`- ${id}${item?.note ? `: ${item.note}` : ''}`);
    });
    markdownLines.push('');
  }

  if (failed.length > 0) {
    markdownLines.push('## Failed');
    failed.forEach((id) => {
      const item = resultStatuses.get(id);
      markdownLines.push(`- ${id}${item?.note ? `: ${item.note}` : ''}`);
    });
    markdownLines.push('');
  }

  if (uncheckedOnly.length > 0) {
    markdownLines.push('## Unchecked');
    uncheckedOnly.forEach((id) => {
      const item = resultStatuses.get(id);
      markdownLines.push(`- ${id}${item?.note ? `: ${item.note}` : ''}`);
    });
    markdownLines.push('');
  }

  if (blockedSignatures.length > 0) {
    markdownLines.push('## Blocking Signatures');
    blockedSignatures.forEach((signatureId) =>
      markdownLines.push(`- ${signatureId}`)
    );
    markdownLines.push('');
  }

  markdownLines.push('## Gate Breakdown');
  markdownLines.push(`- Core PASS/FAIL: ${summary.coreChecksPassed ? 'PASS' : 'FAIL'}`);
  markdownLines.push(`- AI PASS/FAIL: ${summary.aiChecksPassed ? 'PASS' : 'FAIL'}`);
  markdownLines.push(`- Manual approval PASS/FAIL: ${summary.manualGatePassed ? 'PASS' : 'FAIL'}`);
  markdownLines.push(`- Final PASS/FAIL: ${summary.ok ? 'PASS' : 'FAIL'}`);
  markdownLines.push('');

  if (!manualGatePassed) {
    markdownLines.push('## Manual Approval');
    markdownLines.push("- manual_approval must be set to `yes`.");
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
    if (!summary.coreChecksPassed) {
      console.error('Core checks not fully passed.');
    }
    if (!summary.aiChecksPassed) {
      console.error('AI checks not fully passed.');
    }
    if (!manualGatePassed) {
      console.error("Manual approval not confirmed. Set manual_approval to 'yes'.");
    }
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
