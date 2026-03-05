#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const NDK_VERSION = '27.2.12479018';

// Update package.json op-sqlite config with NDK version
const packageJsonPath = path.join(__dirname, '../package.json');
if (fs.existsSync(packageJsonPath)) {
  let packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  
  if (packageJson['op-sqlite']) {
    packageJson['op-sqlite'].ndkVersion = NDK_VERSION;
    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n', 'utf8');
    console.log(`✓ Updated package.json op-sqlite config with NDK version ${NDK_VERSION}`);
  }
}

// Update op-sqlite NDK version to match the project's NDK version
const opSqliteGradlePropsPath = path.join(
  __dirname,
  '../node_modules/@op-engineering/op-sqlite/android/gradle.properties'
);

if (fs.existsSync(opSqliteGradlePropsPath)) {
  let content = fs.readFileSync(opSqliteGradlePropsPath, 'utf8');
  
  // Replace ANY NDK version with the correct r27c version
  // This catches various version formats that might be in the file
  content = content.replace(
    /OPSQLite_ndkVersion=[\d.]+/,
    `OPSQLite_ndkVersion=${NDK_VERSION}`
  );
  
  // Also ensure android.ndkVersion is set correctly in case there are multiple NDK configs
  content = content.replace(
    /android\.ndkVersion=[\d.]+/,
    `android.ndkVersion=${NDK_VERSION}`
  );
  
  // If android.ndkVersion is not already set, add it
  if (!content.includes('android.ndkVersion=')) {
    content += `\nandroid.ndkVersion=${NDK_VERSION}`;
  }
  
  fs.writeFileSync(opSqliteGradlePropsPath, content, 'utf8');
  console.log(`✓ Fixed op-sqlite gradle.properties NDK version to ${NDK_VERSION}`);
} else {
  console.warn('⚠ op-sqlite gradle.properties not found, skipping NDK version fix');
}

// Fix Groovy JsonSlurper import issue in op-sqlite build.gradle
const opSqliteBuildGradlePath = path.join(
  __dirname,
  '../node_modules/@op-engineering/op-sqlite/android/build.gradle'
);

if (fs.existsSync(opSqliteBuildGradlePath)) {
  let content = fs.readFileSync(opSqliteBuildGradlePath, 'utf8');
  
  // Add groovy-json to buildscript if not already present
  if (!content.includes('groovy-json')) {
    content = content.replace(
      /dependencies \{\n\s*classpath\("com\.android\.tools\.build:gradle/,
      'dependencies {\n  classpath("org.codehaus.groovy:groovy-json:3.0.9")\n  classpath("com.android.tools.build:gradle'
    );
    
    fs.writeFileSync(opSqliteBuildGradlePath, content, 'utf8');
    console.log('✓ Fixed op-sqlite Groovy JsonSlurper dependency');
  }
  
  // Ensure android { ndkVersion } is explicitly set
  // This is critical for CMake to match the NDK version
  if (!content.includes('ndkVersion')) {
    // Add ndkVersion right after "android {"
    content = content.replace(
      /android \{\s*namespace/,
      `android {\n  ndkVersion "${NDK_VERSION}"\n  namespace`
    );
    fs.writeFileSync(opSqliteBuildGradlePath, content, 'utf8');
    console.log(`✓ Added explicit android.ndkVersion to op-sqlite build.gradle: ${NDK_VERSION}`);
  } else {
    // Update existing ndkVersion
    content = content.replace(
      /ndkVersion\s*=*\s*['"][\d.]+['"]/g,
      `ndkVersion "${NDK_VERSION}"`
    );
    fs.writeFileSync(opSqliteBuildGradlePath, content, 'utf8');
    console.log(`✓ Updated explicit android.ndkVersion in op-sqlite build.gradle: ${NDK_VERSION}`);
  }
} else {
  console.warn('⚠ op-sqlite build.gradle not found, skipping gradle updates');
}
