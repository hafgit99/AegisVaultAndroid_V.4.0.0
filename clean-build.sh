#!/bin/bash

# Professional Build Cleanup Script for AegisAndroid
# Purpose: Clean all cached build artifacts and prepare for fresh build

echo "=========================================="
echo "AegisAndroid Build Cleanup & Repair"
echo "=========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Step 1: Clean Gradle cache
echo "Step 1: Cleaning Gradle cache..."
rm -rf android/.gradle
rm -rf android/app/build
rm -rf android/build
echo -e "${GREEN}✓ Gradle cache cleaned${NC}"
echo ""

# Step 2: Clean NDK/CMake cache
echo "Step 2: Cleaning NDK/CMake build artifacts..."
rm -rf android/app/.cxx
rm -rf node_modules/@op-engineering/op-sqlite/android/.cxx
echo -e "${GREEN}✓ NDK/CMake cache cleaned${NC}"
echo ""

# Step 3: Update package.json and fix NDK versions
echo "Step 3: Running NDK version fix script..."
node scripts/fix-ndk-versions.js
echo ""

# Step 4: Summary and next steps
echo "=========================================="
echo -e "${GREEN}✓ Build environment cleaned successfully${NC}"
echo "=========================================="
echo ""
echo "Next steps:"
echo "1. For F-Droid builds on Linux:"
echo "   fdroid build -v com.aegisandroid:11"
echo ""
echo "2. For local Android Studio builds:"
echo "   cd android && ./gradlew clean && ./gradlew assembleRelease"
echo ""
echo "Important notes:"
echo "- NDK version is now configured to r27c (27.2.12479018)"
echo "- Gradle will re-download necessary dependencies"
echo "- Ensure you have sufficient disk space for the build"
echo ""
