# Device Matrix Test Plan

Date: 2026-03-15

## Purpose

This matrix standardizes backup, recovery, passkey, autofill, and crash-monitoring validation across a broader Android device set before wider rollout.

## Coverage Goals

- Android 9 to Android 15
- At least one Samsung, Xiaomi/MIUI, Pixel, and one near-stock Android device
- At least one low-memory device
- At least one device with biometrics disabled
- At least one device with work profile or secondary user if available

## Priority Matrix

| Tier | Android | Vendor | Focus |
| --- | --- | --- | --- |
| P0 | 14 / 15 | Pixel | Passkey, Credential Manager, release stability |
| P0 | 13 / 14 | Samsung One UI | Autofill, biometric unlock, backup/restore |
| P0 | 13 / 14 | Xiaomi / MIUI | Backgrounding, file picker, modal flows |
| P1 | 11 / 12 | Near-stock / Motorola / Nokia | Vault unlock, backup import/export |
| P1 | 10 | Samsung / Xiaomi | Legacy device compatibility |
| P2 | 9 | Any | Minimum supported baseline sanity |

## Mandatory Test Scenarios

### Core Security

1. Fresh install
2. First biometric unlock
3. Auto-lock after backgrounding
4. Clipboard clear timeout
5. Integrity warning rendering

### Backup / Restore

1. Encrypted export
2. Encrypted import on same device
3. Import wrong password and confirm graceful error
4. Import corrupted file and confirm no crash
5. Plaintext export warning flow

### Recovery

1. Initiate recovery
2. Verify recovery code
3. Create recovery backup
4. Restore from recovery backup
5. Verify expired or invalid recovery token handling

### Passkey

1. Create passkey on device
2. Verify passkey on device
3. Reopen entry and confirm stored credential metadata
4. Attempt passkey flow without prerequisites
5. Cancel native passkey sheet and confirm graceful recovery

### Autofill

1. Enable autofill service
2. Fill login in browser
3. Fill login in third-party app
4. Confirm locked vault blocks fill

### Crash Monitoring

1. Trigger handled error path and confirm local crash report capture
2. Reopen app and confirm reports persist
3. Clear reports from settings

## Required Evidence

- Device model and Android version
- Build version and signing type
- Pass / fail result per scenario
- Screenshot or short note for failures
- `adb logcat` excerpt for crash or native failure

## Exit Criteria

- All P0 devices pass mandatory scenarios
- No fatal crash in backup, recovery, unlock, or passkey flows
- No data loss report during import, restore, or recovery
- Crash monitoring writes and clears reports correctly

## Workspace

The repo now includes a lightweight validation workspace for collecting real-device evidence:

- [Turkish Validation Workspace](docs/validation/README_TR.md)
- [Device Matrix CSV](docs/validation/cihaz-matrisi.csv)
