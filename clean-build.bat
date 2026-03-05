@echo off
REM Professional Build Cleanup Script for AegisAndroid (Windows)
REM Purpose: Clean all cached build artifacts and prepare for fresh build

setlocal enabledelayedexpansion

echo.
echo ==========================================
echo AegisAndroid Build Cleanup and Repair
echo ==========================================
echo.

REM Step 1: Clean Gradle cache
echo Step 1: Cleaning Gradle cache...
if exist "android\.gradle" rmdir /s /q "android\.gradle" >nul 2>&1
if exist "android\app\build" rmdir /s /q "android\app\build" >nul 2>&1
if exist "android\build" rmdir /s /q "android\build" >nul 2>&1
echo [OK] Gradle cache cleaned
echo.

REM Step 2: Clean NDK/CMake cache
echo Step 2: Cleaning NDK/CMake build artifacts...
if exist "android\app\.cxx" rmdir /s /q "android\app\.cxx" >nul 2>&1
if exist "node_modules\@op-engineering\op-sqlite\android\.cxx" rmdir /s /q "node_modules\@op-engineering\op-sqlite\android\.cxx" >nul 2>&1
echo [OK] NDK/CMake cache cleaned
echo.

REM Step 3: Update package.json and fix NDK versions
echo Step 3: Running NDK version fix script...
node scripts/fix-ndk-versions.js
echo.

REM Step 4: Summary and next steps
echo ==========================================
echo [OK] Build environment cleaned successfully
echo ==========================================
echo.
echo Next steps:
echo 1. For F-Droid builds (requires Linux/WSL):
echo    fdroid build -v com.aegisandroid:11
echo.
echo 2. For local Android Studio builds:
echo    cd android
echo    gradlew clean
echo    gradlew assembleRelease
echo.
echo Important notes:
echo - NDK version is configured to r27c (27.2.12479018)
echo - Package.json has been updated with NDK version
echo - Gradle will re-download necessary dependencies
echo - Ensure you have at least 20GB free disk space
echo.

pause
