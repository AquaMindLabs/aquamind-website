const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { execSync } = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..');
const firestoreDebugLogPath = path.resolve(repoRoot, 'firestore-debug.log');
const localFirebaseRoot = path.resolve(
  repoRoot,
  process.env.FIREBASE_TEST_CONFIG_DIR || '.firebase-test-local'
);
const xdgConfigDir = path.resolve(localFirebaseRoot, 'xdg-config');

[
  localFirebaseRoot,
  xdgConfigDir,
].forEach((dir) => {
  fs.mkdirSync(dir, { recursive: true });
});

const env = {
  ...process.env,
  XDG_CONFIG_HOME: xdgConfigDir,
};

const firebaseBin = path.resolve(
  repoRoot,
  'node_modules',
  'firebase-tools',
  'lib',
  'bin',
  'firebase.js'
);

const args = [
  firebaseBin,
  'emulators:exec',
  '--only',
  'firestore',
  '--project',
  'demo-aquarium-mobile',
  'node --test tests/firestore.rules.test.cjs',
];

const child = spawn(process.execPath, args, {
  cwd: repoRoot,
  env,
  stdio: 'inherit',
});

function isTrackedByGit(filePathRelativeToRepo) {
  try {
    execSync(`git ls-files --error-unmatch "${filePathRelativeToRepo}"`, {
      cwd: repoRoot,
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

child.on('exit', (code, signal) => {
  const keepFirestoreDebugLog = process.env.KEEP_FIRESTORE_DEBUG_LOG === '1';
  const firestoreDebugLogIsTracked = isTrackedByGit('firestore-debug.log');
  if (
    !keepFirestoreDebugLog &&
    !firestoreDebugLogIsTracked &&
    fs.existsSync(firestoreDebugLogPath)
  ) {
    try {
      fs.rmSync(firestoreDebugLogPath, { force: true });
    } catch {
      // Ignore cleanup errors; test result remains source of truth.
    }
  }

  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
