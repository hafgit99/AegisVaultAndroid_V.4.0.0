# Security Architecture

Date: 2026-03-15

## Executive Summary

Aegis Vault is a local-first Android vault application. Secrets remain on-device by default, the vault database is encrypted with SQLCipher, biometric unlock acts as a gate before a stable unlock secret is processed with Argon2id, and encrypted backup/export uses AES-256-GCM with Argon2id-derived keys.

## Security Objectives

- Keep vault data offline-first and device-local by default
- Minimize plaintext exposure in storage, clipboard, logs, and exports
- Require strong modern KDFs for new encrypted backups
- Provide safe recovery and import paths without silent downgrade
- Expose security posture through audit logs, integrity status, password health reporting, and local crash monitoring

## Core Components

### Vault Storage

- Primary store: SQLCipher-backed local database
- Attachments: encrypted and linked to vault items
- Trash and password history: retained locally with explicit lifecycle handling

### Key Management

- Android Keystore generates device-bound key material
- Biometric unlock derives a stable biometric-gated secret using Argon2id
- Device salt is stored separately from the database
- Release exports require Argon2id and AES-256-GCM

### Authentication and Access Control

- Biometric unlock with device credentials fallback
- Auto-lock timer and background lock behavior
- Brute-force lockout state persisted locally
- Device integrity policy can warn or block based on configured trust posture

### Backup and Recovery

- Encrypted export/import uses AES-256-GCM
- Legacy PBKDF2 imports are supported for migration only
- New encrypted export blocks if Argon2id is unavailable
- Recovery flows use secure randomness, integrity hashing, and corrected file handling

### Passkey and WebAuthn

- Native Android Credential Manager integration
- Passkey creation and verification can be initiated on-device
- RP ID, credential ID, and user handle are normalized and validated before save
- Offline builds currently operate as a local helper flow unless a relying-party server provides the WebAuthn challenge

### Monitoring and Audit

- Security audit log records sensitive operational events
- Password health report scores reused, weak, similar, and incomplete secrets
- Crash monitoring stores recent crash and non-fatal error reports locally on-device
- Release log policy suppresses noisy console output while keeping fatal/non-fatal diagnostics locally available

## Data Flow Summary

### Unlock Flow

1. App checks brute-force state
2. App checks device integrity signals
3. App requests biometric/device verification
4. Android Keystore material + device salt feed Argon2id to produce a biometric-gated unlock secret
5. Unlock secret + device salt feed Argon2id to open SQLCipher database
6. Security audit event is recorded

### Encrypted Export Flow

1. User chooses encrypted export
2. App derives export key with Argon2id
3. Vault payload is encrypted with AES-256-GCM
4. Export metadata stores KDF parameters and cipher fields
5. Audit event is recorded

### Passkey Flow

1. User prepares passkey entry metadata
2. App validates RP ID and identifiers
3. App uses a server-provided challenge when available, otherwise falls back to a local helper challenge for offline mode
4. Native Credential Manager create/get flow is invoked
5. Result is normalized and saved into the vault entry

## Threat Model Notes

### Addressed

- Offline database theft without unlock key
- Weak new backup encryption due to silent KDF downgrade
- Sensitive plaintext leaks through default backup paths
- Recovery misuse caused by incorrect file path/content handling
- Basic credential hygiene risks through password health analysis

### Residual Risks

- Rooted or compromised devices can still weaken runtime guarantees
- Clipboard remains a system-level exposure during copy windows
- Local crash monitoring is diagnostic only and does not provide fleet analytics
- Legacy imports remain a migration surface and require continued regression testing
- Passkey helper mode is not equivalent to a full relying-party validated WebAuthn server deployment

## Operational Controls

- Release-signed builds only for public distribution
- `npm test -- --runInBand` and `npx tsc --noEmit` required before release
- Device matrix validation required for backup, recovery, passkey, and autofill flows
- Security architecture and release readiness docs updated alongside security-sensitive changes

## Recommended Next Steps

- Add native crash report export/share flow for support diagnostics
- Extend password health reporting with breach intelligence if privacy posture allows
- Continue expanding device matrix evidence collection per release
