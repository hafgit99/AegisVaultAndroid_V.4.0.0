# Aegis Vault Android 5.1.0 Release Notes

Release line: `5.1.x`

## Summary

Aegis Vault Android 5.1.0 is the **Security Hardening** release. This version introduces critical cryptographic improvements, including master key domain separation (HKDF-Expand), constant-time equality checks to prevent timing attacks, and an upgrade to Argon2id for device secret verification. It also resolves a significant stability issue in the native cryptographic bridge for Hermes/New Architecture.

## Highlights

- **HKDF-Expand Master Key Separation**: Implemented domain separation for derived keys to ensure that the master key used for database encryption, backup envelopes, and sync payloads remain cryptographically isolated.
- **Constant-Time Verification**: All security-sensitive comparisons now use constant-time logic to mitigate side-channel timing attacks.
- **Argon2id Device Secret Upgrade**: Transitioned from Argon2i to Argon2id for device secret verification, providing enhanced protection against side-channel and brute-force attacks.
- **WebAuthn Attestation Support**: Added hardware-backed attestation verification for passkey registration workflows.
- **Cryptographic Bridge Stability**: Fixed a "this-context" loss issue in the `Argon2Fn` wrapper that caused failures in the native bridge on Hermes/New Architecture.
- **Improved Security Center Diagnostics**: Expanded the Security Center to include audit logging for hardening status and breach intelligence signals.

## Security and Privacy

- **Zero-Knowledge Integrity**: Vault secrets remain local and are never transmitted in plaintext.
- **Transport Security**: Sync and backup payloads continue to use AES-256-GCM authenticated encryption.
- **Enhanced Brute-Force Resistance**: The Argon2id upgrade increases the cost of offline attacks on device-bound secrets.

## Compatibility

| Area | Value |
| --- | --- |
| Android app version | `5.1.0` |
| Version code | `510` |
| Canonical schema | `5.0.0` |
| Minimum Android | 8.0 (API 26) |
| Package name | `com.aegisandroid` |

## Validation Commands

Recommended security and stability checks:

```bash
npm run lint
npx tsc --noEmit
npm test
npm run release:provenance
```

Targeted security hardening tests:

```bash
npx jest --no-coverage --runInBand --testTimeout=30000 --runTestsByPath __tests__/SecurityModule.test.ts __tests__/CryptoService.test.ts
```

## Known Release Gates

- Validate biometric unlock persistence after the Argon2id upgrade.
- Verify encrypted backup export/import round-trip with the new bridge fix.
- Confirm WebAuthn attestation success on production-grade authenticators.

## Upgrade Notes

- This update includes a background migration for device secret verification material.
- Existing v5.0.0 backups remain fully compatible.
- Users on rooted devices should review the "Security Hardening" policy settings in the app.
