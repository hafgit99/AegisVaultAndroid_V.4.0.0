const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const childProcess = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const outDir = path.join(rootDir, 'release-artifacts');

function readJson(filePath, fallback = {}) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function safeGit(args) {
  try {
    return childProcess
      .execFileSync('git', args, { cwd: rootDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
      .trim();
  } catch {
    return '';
  }
}

function listReleaseArtifacts() {
  const candidates = [
    path.join(rootDir, 'android', 'app', 'build', 'outputs', 'apk', 'release'),
    path.join(rootDir, 'android', 'app', 'build', 'outputs', 'bundle', 'release'),
  ];
  return candidates
    .filter(dir => fs.existsSync(dir))
    .flatMap(dir =>
      fs.readdirSync(dir)
        .filter(name => /\.(apk|aab)$/i.test(name))
        .map(name => path.join(dir, name)),
    )
    .map(filePath => ({
      name: path.basename(filePath),
      path: path.relative(rootDir, filePath).replace(/\\/g, '/'),
      sha256: sha256File(filePath),
      bytes: fs.statSync(filePath).size,
    }));
}

function buildSbom() {
  const pkg = readJson(path.join(rootDir, 'package.json'));
  const lock = readJson(path.join(rootDir, 'package-lock.json'));
  const packages = lock.packages || {};
  const components = Object.entries(packages)
    .filter(([name]) => name.startsWith('node_modules/'))
    .map(([name, meta]) => ({
      type: 'library',
      name: name.replace('node_modules/', ''),
      version: meta.version || 'unknown',
      purl: meta.version ? `pkg:npm/${name.replace('node_modules/', '')}@${meta.version}` : undefined,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    bomFormat: 'CycloneDX',
    specVersion: '1.5',
    serialNumber: `urn:uuid:${crypto.randomUUID()}`,
    version: 1,
    metadata: {
      timestamp: new Date().toISOString(),
      component: {
        type: 'application',
        name: pkg.name || 'AegisAndroid',
        version: pkg.version || '0.0.0',
      },
    },
    components,
  };
}

function buildProvenance(sbomFileName) {
  const pkg = readJson(path.join(rootDir, 'package.json'));
  const lockPath = path.join(rootDir, 'package-lock.json');
  const gradlePath = path.join(rootDir, 'android', 'app', 'build.gradle');
  const artifacts = listReleaseArtifacts();

  return {
    schemaVersion: 'https://aegis-vault.dev/provenance/android-release/v1',
    generatedAt: new Date().toISOString(),
    subject: {
      name: pkg.name || 'AegisAndroid',
      version: pkg.version || '0.0.0',
      packageName: 'com.aegisandroid',
    },
    source: {
      repository: safeGit(['config', '--get', 'remote.origin.url']),
      commit: safeGit(['rev-parse', 'HEAD']),
      branch: safeGit(['rev-parse', '--abbrev-ref', 'HEAD']),
      dirty: safeGit(['status', '--porcelain']).length > 0,
    },
    build: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      commands: [
        'npm ci',
        'npm run lint',
        'npx tsc --noEmit',
        'cd android && ./gradlew assembleRelease',
      ],
    },
    materials: [
      fs.existsSync(lockPath) ? {
        path: 'package-lock.json',
        sha256: sha256File(lockPath),
      } : null,
      fs.existsSync(gradlePath) ? {
        path: 'android/app/build.gradle',
        sha256: sha256File(gradlePath),
      } : null,
    ].filter(Boolean),
    artifacts,
    sbom: {
      path: `release-artifacts/${sbomFileName}`,
    },
  };
}

function writeJson(fileName, value) {
  fs.mkdirSync(outDir, { recursive: true });
  const filePath = path.join(outDir, fileName);
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  return filePath;
}

function main() {
  const sbomName = 'aegis-android-sbom.cdx.json';
  const provenanceName = 'aegis-android-provenance.json';
  const sbomPath = writeJson(sbomName, buildSbom());
  const provenancePath = writeJson(provenanceName, buildProvenance(sbomName));
  console.log(`SBOM: ${path.relative(rootDir, sbomPath)}`);
  console.log(`Provenance: ${path.relative(rootDir, provenancePath)}`);
}

if (require.main === module) {
  main();
}

module.exports = {
  buildProvenance,
  buildSbom,
  listReleaseArtifacts,
};
