const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const nodeModulesDir = path.join(rootDir, 'node_modules');
const targetNames = new Set(['build.gradle', 'build.gradle.kts']);
const reactNativeGradlePluginDir = path.join(
  nodeModulesDir,
  '@react-native',
  'gradle-plugin',
);

function walk(dir, collector) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(entryPath, collector);
      continue;
    }

    const isAndroidGradleFile = entryPath.includes(
      `${path.sep}android${path.sep}`,
    );
    const isReactNativeGradlePluginFile = entryPath.startsWith(
      reactNativeGradlePluginDir,
    );

    if (
      targetNames.has(entry.name) &&
      (isAndroidGradleFile || isReactNativeGradlePluginFile)
    ) {
      collector.push(entryPath);
    }
  }
}

function patchGradleRepoCalls(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  let patched = source.replace(/\bjcenter\s*\(\s*\)/g, 'mavenCentral()');
  patched = patched.replace(
    /JavaLanguageVersion\.of\(\s*17\s*\)/g,
    'JavaLanguageVersion.of(21)',
  );
  patched = patched.replace(/jvmToolchain\(\s*17\s*\)/g, 'jvmToolchain(21)');

  if (patched !== source) {
    fs.writeFileSync(filePath, patched, 'utf8');
    return true;
  }

  return false;
}

function main() {
  if (!fs.existsSync(nodeModulesDir)) {
    console.log('postinstall patch skipped: node_modules not found');
    return;
  }

  const gradleFiles = [];
  walk(nodeModulesDir, gradleFiles);

  let patchedCount = 0;
  for (const gradleFile of gradleFiles) {
    if (patchGradleRepoCalls(gradleFile)) {
      patchedCount += 1;
    }
  }

  console.log(`postinstall patch complete: ${patchedCount} file(s) updated`);
}

main();
