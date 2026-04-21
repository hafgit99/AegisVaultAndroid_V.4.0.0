# Aegis Android User Guide (Short)

## Initial Setup
1. Open the app and set a strong master password.
2. Enable device biometrics if biometric unlock is desired.
3. Review lockout, clipboard clear, and audit settings.

## Vault Security
1. Use a unique high-entropy master password.
2. Keep brute-force lockout settings at secure defaults.
3. Use `Panic Wipe` for immediate local vault/data trace cleanup.

## Relay Sync
1. Enter the same `Relay URL` and `Session ID` on all devices.
2. Keep vault unlocked during sync.
3. For self-hosted relay, run `Check Relay Health` before syncing.

## Wear OS
1. Only favorite records are sent to watch.
2. Payload is encrypted and integrity-protected (HMAC).
3. Invalid or tampered payloads are rejected.

## Language and Theme
- App supports Turkish and English.
- Light and dark mode are both supported.

## Accessibility
- Critical actions include screen-reader labels.
- Large text and high-contrast usage are supported via device accessibility settings.

## Backup
1. Prefer encrypted export.
2. Store backup files in a secure location.
3. Verify import results and audit log entries.
