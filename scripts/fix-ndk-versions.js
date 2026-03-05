#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Update op-sqlite NDK version to match the project's NDK version (27.2.12479018)
const opSqliteGradlePropsPath = path.join(
  __dirname,
  '../node_modules/@op-engineering/op-sqlite/android/gradle.properties'
);

if (fs.existsSync(opSqliteGradlePropsPath)) {
  let content = fs.readFileSync(opSqliteGradlePropsPath, 'utf8');
  
  // Replace ANY NDK version with the correct r27c version (27.2.12479018)
  // This catches various version formats that might be in the file
  content = content.replace(
    /OPSQLite_ndkVersion=[\d.]+/,
    'OPSQLite_ndkVersion=27.2.12479018'
  );
  
  // Also ensure android.ndkVersion is set correctly in case there are multiple NDK configs
  content = content.replace(
    /android\.ndkVersion=[\d.]+/,
    'android.ndkVersion=27.2.12479018'
  );
  
  // If android.ndkVersion is not already set, add it
  if (!content.includes('android.ndkVersion=')) {
    content += '\nandroid.ndkVersion=27.2.12479018';
  }
  
  fs.writeFileSync(opSqliteGradlePropsPath, content, 'utf8');
  console.log('✓ Fixed op-sqlite NDK version to 27.2.12479018');
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
  
  // Also ensure ndkVersion in build.gradle ext block is correct
  if (content.includes('ndkVersion')) {
    content = content.replace(
      /ndkVersion\s*=\s*['"][\d.]+['"]/g,
      'ndkVersion = "27.2.12479018"'
    );
    fs.writeFileSync(opSqliteBuildGradlePath, content, 'utf8');
    console.log('✓ Fixed op-sqlite build.gradle NDK version');
  }
} else {
  console.warn('⚠ op-sqlite build.gradle not found, skipping Groovy fix');
}
