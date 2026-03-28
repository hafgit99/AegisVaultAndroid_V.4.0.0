<p align="center">
  <img src="android/app/src/main/res/mipmap-xxhdpi/ic_launcher.jpg" width="128" alt="Aegis Vault logo">
</p>

<h1 align="center">Aegis Vault Android</h1>

<p align="center">
  <strong>Offline-first password vault and security toolkit for Android.</strong><br>
  Built with React Native, hardened for privacy, and focused on real-device security.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-4.0.2-1f6feb?style=for-the-badge&logo=android" alt="Version 4.0.2">
  <img src="https://img.shields.io/badge/react%20native-0.84-61dafb?style=for-the-badge&logo=react" alt="React Native 0.84">
  <img src="https://img.shields.io/badge/license-MIT-f2c94c?style=for-the-badge" alt="MIT license">
  <img src="https://img.shields.io/badge/security-AES--256%20%7C%20Argon2id-1b8a5a?style=for-the-badge" alt="AES-256 and Argon2id">
</p>

## Overview

**Aegis Vault Android** is an Android password manager focused on local security, encrypted storage, and privacy-first workflows. The application is designed for users who want strong vault protection without depending on a cloud-first architecture.

The project combines encrypted local persistence, biometric access, TOTP, breach checks, passkey groundwork, offline sharing concepts, and relay-based sync in a single Android application.

## Current Status

- Active version: `4.0.2`
- Product state: release-capable Android build with signed APK validation and real-device testing
- Languages: English and Turkish
- Release posture: suitable for controlled rollout, with wider multi-device validation still recommended

Supporting references:

- [Release Readiness Report](docs/RELEASE_READINESS.md)
- [Release Notes 4.0.2](docs/RELEASE_NOTES_4.0.2.md)

## Core Capabilities

- Local encrypted vault with AES-256-GCM protected data flows
- Argon2id-based key derivation for sensitive export and recovery paths
- Biometric unlock support for fast local access
- Built-in TOTP support for two-factor authentication workflows
- Password health and breach exposure checks
- Security center and local-first risk triage flows
- Device integrity heuristics for root, emulator, test-keys, and ADB-related risk signals
- Relay-based synchronization settings with persistent encrypted app settings
- Offline-first family and team space concepts
- English and Turkish localization

## Security and Architecture

Project security documentation is maintained in-repo:

- [Security Architecture](docs/SECURITY_ARCHITECTURE.md)
- [Threat Model](docs/THREAT_MODEL.md)
- [Device Matrix Test Plan](docs/DEVICE_MATRIX_TEST_PLAN.md)
- [Turkish Device Validation Guide](docs/CIHAZ_MATRISI_VE_SAHA_DOGRULAMA_TR.md)
- [Validation Workspace](docs/validation/README_TR.md)
- [Passkey WebAuthn ADR (TR)](docs/PASSKEY_WEBAUTHN_ADR_TR.md)
- [Passkey Backend Checklist (TR)](docs/PASSKEY_BACKEND_IMPLEMENTATION_CHECKLIST_TR.md)

## Screenshots

| Login | Vault | Security Center |
| :---: | :---: | :-------------: |
| ![Login Experience](docs/screenshots/mobile-login.png) | ![Secure Vault](docs/screenshots/mobile-vault.png) | ![Security Center](docs/screenshots/mobile-security.png) |

## Tech Stack

- React Native `0.84`
- TypeScript
- Hermes
- `react-native-quick-crypto`
- `@op-engineering/op-sqlite` with SQLCipher
- Native Android integrations for biometrics and device security signals

## Getting Started

### Prerequisites

- Node.js LTS
- Android Studio / Android SDK
- ADB
- React Native environment configured for Android

### Install

```bash
git clone https://github.com/hafgit99/AegisVaultAndroid_V.4.0.0.git
cd AegisVaultAndroid_V.4.0.0
npm install
```

### Run on Android

```bash
npx react-native run-android --mode release
```

## Release Build

Release builds expect signing credentials to be present. Set these environment variables before building:

```bash
export RELEASE_STORE_FILE=/absolute/path/to/your-release.keystore
export RELEASE_STORE_PASSWORD=your_store_password
export RELEASE_KEY_ALIAS=your_key_alias
export RELEASE_KEY_PASSWORD=your_key_password
```

Windows PowerShell:

```powershell
$env:RELEASE_STORE_FILE="C:\keys\aegis-release.jks"
$env:RELEASE_STORE_PASSWORD="your_store_password"
$env:RELEASE_KEY_ALIAS="your_key_alias"
$env:RELEASE_KEY_PASSWORD="your_key_password"
```

Build command:

```bash
cd android
./gradlew assembleRelease
```

For local-only testing, debug signing fallback can be temporarily enabled with:

```text
-PallowDebugReleaseSigning=true
```

## F-Droid Notes

- Metadata file: `com.aegisandroid.yml`
- Expected APK output: `android/app/build/outputs/apk/release/app-release.apk`
- CI package installation is separated between `sudo:` and `prebuild:` stages in metadata

Example:

```yaml
sudo:
  - apt-get update
  - apt-get install -y npm openjdk-17-jdk-headless
prebuild:
  - npm ci
```

## Sync and Relay Notes

The project includes relay-based synchronization settings for advanced use cases.

- Relay URL and session ID are persisted securely
- Single-device testing validates push/pull connectivity and encrypted payload generation
- True device-to-device validation should be completed with a second phone or emulator

## Quality Signals

- Real-device signed APK installation validated
- Relay synchronization flow validated on device
- Lint clean
- Targeted Jest suites passing for settings persistence, sync crypto, and device sync state

## Roadmap Focus

- Broader two-device and device-matrix validation
- Continued passkey production hardening
- More release documentation and field validation evidence
- Further UI and text polish for wider public release

## License

Distributed under the MIT License. See [LICENSE](LICENSE).

<p align="center">
  Maintained by <a href="https://github.com/hafgit99"><strong>hafgit99</strong></a>
</p>
