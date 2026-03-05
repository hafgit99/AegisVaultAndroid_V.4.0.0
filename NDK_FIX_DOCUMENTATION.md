# AegisAndroid NDK Version Fix

## Problem

The F-Droid build was failing with the following error:

```
[CXX1104] NDK from ndk.dir at /opt/android-sdk/ndk/27.2.12479018 had version [27.2.12479018] 
which disagrees with android.ndkVersion [27.0.12077973]
```

### Root Cause

The op-sqlite library (v15.2.5) had an NDK version configuration mismatch:
- **Installed NDK**: r27c (27.2.12479018)
- **Configured in op-sqlite**: r27.0 (27.0.12077973)

This mismatch prevented the Android build system from properly configuring the C++ compilation toolchain for the op-sqlite library.

## Solution

### Files Modified

1. **package.json**
   - Added `"ndkVersion": "27.2.12479018"` to the `op-sqlite` configuration
   - This ensures the NDK version is explicitly specified in the project configuration

2. **scripts/fix-ndk-versions.js**
   - Enhanced to update package.json with the correct NDK version
   - Ensures consistency across all configuration sources
   - Runs as postinstall hook to maintain synchronization

### How the Fix Works

1. **NPM Postinstall Hook**: When `npm install` or `npm ci` runs, it automatically executes `fix-ndk-versions.js`
2. **Configuration Synchronization**: The script updates:
   - `package.json` op-sqlite.ndkVersion
   - `node_modules/@op-engineering/op-sqlite/android/gradle.properties`
   - `node_modules/@op-engineering/op-sqlite/android/build.gradle`
3. **Cache Cleanup**: Old build artifacts cached with incorrect NDK versions are invalidated

## Steps to Apply the Fix

### For Linux/WSL (F-Droid Build)

```bash
# 1. Run the cleanup script
bash clean-build.sh

# 2. Build with F-Droid
fdroid build -v com.aegisandroid:11
```

### For Windows

```cmd
# 1. Run the cleanup script
clean-build.bat

# 2. Build with Android Studio or gradlew
cd android
gradlew clean
gradlew assembleRelease
```

### Manual Fix (If scripts don't work)

```bash
# 1. Clean all caches
rm -rf node_modules/.cache
rm -rf android/.gradle
rm -rf android/app/build
rm -rf android/app/.cxx
rm -rf node_modules/@op-engineering/op-sqlite/android/.cxx

# 2. Reinstall dependencies (triggers fix-ndk-versions.js)
npm ci

# 3. Build
fdroid build -v com.aegisandroid:11
```

## Technical Details

### NDK Version Mapping

- **r27c** = 27.2.12479018 (Latest stable)
- **r27.0** = 27.0.12077973 (Older version, causing the issue)

The project is configured to use r27c as specified in [com.aegisandroid.yml](../com.aegisandroid.yml):
```yaml
ndk: r27c
```

### Gradle Configuration

The op-sqlite library reads NDK configuration from:
1. `gradle.properties` (primary)
2. `package.json` op-sqlite config (secondary)
3. Local environment variables (tertiary)

All three are now synchronized to use NDK 27.2.12479018.

### Cache Invalidation

Gradle maintains separate caches for different NDK versions. When the NDK version changes:
- The `.cxx` directory must be deleted - it contains compiled native code
- The `.gradle` directory may need cleaning - it contains downloaded dependencies and metadata
- These are automatically cleaned by the `clean-build.sh` and `clean-build.bat` scripts

## Verification

To verify the fix is working:

1. Check package.json was updated:
   ```bash
   grep -A 2 '"op-sqlite"' package.json
   ```
   Should show:
   ```json
   "op-sqlite": {
     "sqlcipher": true,
     "ndkVersion": "27.2.12479018"
   }
   ```

2. Check gradle.properties was updated:
   ```bash
   grep ndkVersion node_modules/@op-engineering/op-sqlite/android/gradle.properties
   ```
   Should show:
   ```
   OPSQLite_ndkVersion=27.2.12479018
   android.ndkVersion=27.2.12479018
   ```

3. Build should succeed without NDK version mismatch errors

## Future Prevention

To prevent this issue in the future:

1. **Always specify NDK version** in package.json for native modules
2. **Update periodically**: Check for op-sqlite updates that may include native code changes
3. **Document NDK version**: Keep NDK version documented in the project alongside the package.json configuration
4. **CI/CD verification**: Add a build step that verifies NDK version consistency before building

## References

- [Android NDK Documentation](https://developer.android.com/ndk)
- [op-sqlite GitHub](https://github.com/OP-Engineering/op-sqlite)
- [Gradle Android Plugin Documentation](https://developer.android.com/build/releases/gradle-plugin)
