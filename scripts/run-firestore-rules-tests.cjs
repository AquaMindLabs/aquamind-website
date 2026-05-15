const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..');
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

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
