const fs = require('fs');
const path = require('path');

const targetPath = path.join(
  __dirname,
  '..',
  'node_modules',
  'expo-keep-awake',
  'src',
  'index.ts'
);

const searchSnippet = `    activateKeepAwakeAsync(tagOrDefault).then(() => {
      if (isMounted && ExpoKeepAwake.addListenerForTag && options?.listener) {
        addListener(tagOrDefault, options.listener);
      }
    });`;

const replacementSnippet = `    activateKeepAwakeAsync(tagOrDefault)
      .then(() => {
        if (isMounted && ExpoKeepAwake.addListenerForTag && options?.listener) {
          addListener(tagOrDefault, options.listener);
        }
      })
      .catch(() => {});`;

try {
  if (!fs.existsSync(targetPath)) {
    console.log('[patch-expo-keep-awake] Skip: module not found.');
    process.exit(0);
  }

  const source = fs.readFileSync(targetPath, 'utf8');
  if (source.includes('activateKeepAwakeAsync(tagOrDefault)\n      .then(() => {')) {
    console.log('[patch-expo-keep-awake] Already patched.');
    process.exit(0);
  }

  if (!source.includes(searchSnippet)) {
    console.warn('[patch-expo-keep-awake] Pattern not found, skip.');
    process.exit(0);
  }

  const patched = source.replace(searchSnippet, replacementSnippet);
  fs.writeFileSync(targetPath, patched, 'utf8');
  console.log('[patch-expo-keep-awake] Patch applied.');
} catch (error) {
  console.warn('[patch-expo-keep-awake] Failed:', error?.message || error);
  process.exit(0);
}
