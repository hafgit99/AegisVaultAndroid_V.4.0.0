const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const nodeModulesDir = path.join(rootDir, 'node_modules');
const targetNames = new Set(['build.gradle', 'build.gradle.kts']);

function walk(dir, collector) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(entryPath, collector);
      continue;
    }

    if (
      targetNames.has(entry.name) &&
      entryPath.includes(`${path.sep}android${path.sep}`)
    ) {
      collector.push(entryPath);
    }
  }
}

function patchGradleRepoCalls(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  const patched = source.replace(/\bjcenter\s*\(\s*\)/g, 'mavenCentral()');

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
