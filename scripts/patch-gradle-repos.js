const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const nodeModulesDir = path.join(rootDir, 'node_modules');
const targetNames = new Set([
  'AndroidManifest.xml',
  'build.gradle',
  'build.gradle.kts',
  'gradle.properties',
]);
const reactNativeGradlePluginDir = path.join(
  nodeModulesDir,
  '@react-native',
  'gradle-plugin',
);
const androidNamespaceFixes = new Map([
  [
    path.join('react-native-fs', 'android'),
    { namespace: 'com.rnfs', manifestPackage: 'com.rnfs' },
  ],
  [
    path.join('react-native-biometrics', 'android'),
    { namespace: 'com.rnbiometrics', manifestPackage: 'com.rnbiometrics' },
  ],
  [
    path.join('react-native-argon2', 'android'),
    { namespace: 'com.poowf.argon2', manifestPackage: 'com.poowf.argon2' },
  ],
]);

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

    const isOpSqliteGradleProperties =
      entry.name === 'gradle.properties' &&
      entryPath.endsWith(
        path.join('@op-engineering', 'op-sqlite', 'android', 'gradle.properties'),
      );

    if (
      targetNames.has(entry.name) &&
      (isAndroidGradleFile ||
        isReactNativeGradlePluginFile ||
        isOpSqliteGradleProperties)
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

  // Remove buildscript blocks from library build.gradle files
  // These often contain ancient AGP versions that conflict with modern Gradle
  if (filePath.endsWith('build.gradle') || filePath.endsWith('build.gradle.kts')) {
    // Safer regex that ONLY removes the buildscript block itself
    patched = patched.replace(/buildscript\s*\{[\s\S]*?\}\s*/g, '');
    
    // Fix for MavenPlugin issue in old libraries
    patched = patched.replace(/apply\s+plugin:\s+['"]maven['"]/g, "apply plugin: 'maven-publish'");
    
    // Fix for Nitro modules AGP 9.0.0 issue
    if (filePath.includes('react-native-nitro-modules')) {
        patched = patched.replace(/classpath\s+['"]com\.android\.tools\.build:gradle:9\.0\.0['"]/g, 'classpath "com.android.tools.build:gradle:8.10.0"');
    }

    for (const [modulePath, fix] of androidNamespaceFixes.entries()) {
      if (
        filePath.includes(modulePath) &&
        patched.includes('android {') &&
        !patched.includes('namespace ')
      ) {
        patched = patched.replace(
          /android\s*\{/,
          `android {\n    namespace "${fix.namespace}"`,
        );
      }
    }

    // Clean up previously injected helpers to avoid duplicates and allow updates
    const helpers = [
        /def safeExtGet\(prop, fallback\) \{[\s\S]*?\}\n\n/g,
        /def getExtOrDefault\(name, defaultValue = null\) \{[\s\S]*?\}\n\n/g,
        /def getExtOrDefault\(name\) \{[\s\S]*?\}\n\n/g,
        /def getExtOrIntegerDefault\(name, defaultValue = 0\) \{[\s\S]*?\}\n\n/g,
        /def getExtOrIntegerDefault\(name\) \{[\s\S]*?\}\n\n/g,
        /def isNewArchitectureEnabled\(\) \{[\s\S]*?\}\n\n/g,
        /def reactNativeArchitectures\(\) \{[\s\S]*?\}\n\n/g,
        /def resolveBuildType\(\) \{[\s\S]*?\}\n\n/g
    ];
    helpers.forEach(h => { patched = patched.replace(h, ''); });

    // Inject missing helpers if they are used but not defined
    if (patched.includes('safeExtGet') && !patched.includes('def safeExtGet')) {
        patched = "def safeExtGet(prop, fallback) {\n    rootProject.ext.has(prop) ? rootProject.ext.get(prop) : fallback\n}\n\n" + patched;
    }
    if (patched.includes('getExtOrDefault') && !patched.includes('def getExtOrDefault')) {
        patched = "def getExtOrDefault(name, defaultValue = null) {\n    return rootProject.ext.has(name) ? rootProject.ext.get(name) : (project.properties[name] ?: defaultValue)\n}\n\n" + patched;
    }
    if (patched.includes('getExtOrIntegerDefault') && !patched.includes('def getExtOrIntegerDefault')) {
        patched = "def getExtOrIntegerDefault(name, defaultValue = 0) {\n    return rootProject.ext.has(name) ? rootProject.ext.get(name) : (project.properties[name] ? (project.properties[name]).toInteger() : defaultValue)\n}\n\n" + patched;
    }


    if (patched.includes('isNewArchitectureEnabled') && !patched.includes('def isNewArchitectureEnabled')) {
        patched = "def isNewArchitectureEnabled() {\n    return rootProject.hasProperty(\"newArchEnabled\") && rootProject.getProperty(\"newArchEnabled\") == \"true\"\n}\n\n" + patched;
    }
    if (patched.includes('reactNativeArchitectures') && !patched.includes('def reactNativeArchitectures')) {
        patched = "def reactNativeArchitectures() {\n    def value = rootProject.getProperties().get(\"reactNativeArchitectures\")\n    return value ? value.split(\",\") : [\"armeabi-v7a\", \"x86\", \"x86_64\", \"arm64-v8a\"]\n}\n\n" + patched;
    }
    if (patched.includes('resolveBuildType') && !patched.includes('def resolveBuildType')) {
        patched = "def resolveBuildType() {\n    return project.gradle.startParameter.taskNames.any { it.contains(\"Release\") } ? \"release\" : \"debug\"\n}\n\n" + patched;
    }


  }

  if (
    filePath.endsWith(
      path.join('@op-engineering', 'op-sqlite', 'android', 'gradle.properties'),
    )
  ) {
    patched = patched.replace(
      /^OPSQLite_ndkVersion=.*$/m,
      'OPSQLite_ndkVersion=27.2.12479018',
    );
  }

  if (filePath.includes('react-native-svg') && filePath.endsWith('build.gradle')) {
    if (!patched.includes('apply plugin: "com.facebook.react"')) {
        patched = patched.replace('apply plugin: \'com.android.library\'', 'apply plugin: \'com.android.library\'\n\nif (isNewArchitectureEnabled()) {\n    apply plugin: "com.facebook.react"\n}');
    }
  }

  if (patched !== source) {
    fs.writeFileSync(filePath, patched, 'utf8');
    return true;
  }

  return false;
}

function patchManifestPackage(filePath) {
  if (!filePath.endsWith(path.join('src', 'main', 'AndroidManifest.xml'))) {
    return false;
  }

  const source = fs.readFileSync(filePath, 'utf8');
  let patched = source;
  for (const [modulePath, fix] of androidNamespaceFixes.entries()) {
    if (filePath.includes(modulePath)) {
      patched = patched.replace(
        new RegExp(`\\s+package=["']${fix.manifestPackage.replace(/\./g, '\\.')}["']`),
        '',
      );
    }
  }

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

  const manifestFiles = [];
  walk(nodeModulesDir, manifestFiles);
  for (const manifestFile of manifestFiles) {
    if (patchManifestPackage(manifestFile)) {
      patchedCount += 1;
    }
  }

  console.log(`postinstall patch complete: ${patchedCount} file(s) updated`);
}

main();
