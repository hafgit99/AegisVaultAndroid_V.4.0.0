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
  
  // Replace NDK version to match the project's requirements (r27c = 27.2.12479018)
  content = content.replace(
    /OPSQLite_ndkVersion=27\.1\.12297006/,
    'OPSQLite_ndkVersion=27.2.12479018'
  );
  
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
} else {
  console.warn('⚠ op-sqlite build.gradle not found, skipping Groovy fix');
}
