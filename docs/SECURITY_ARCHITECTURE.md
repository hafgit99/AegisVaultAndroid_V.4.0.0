# Aegis Vault Android - Security Architecture

## Overview

The architecture follows a local-first, encrypted-by-default model:

- Local vault uses SQLCipher and a deterministic Argon2id-derived key.
- Backup/export uses AES-256-GCM with Argon2id-derived key material.
- Cloud sync transfers only encrypted `.aegis` payloads.

## Cryptographic Building Blocks

- `KDF (vault unlock)`: Argon2id (`memory=32768`, `iterations=4`, `parallelism=2`, `hashLength=32`).
- `KDF (backup export)`: Argon2id (same baseline parameters).
- `Cipher (backup payload)`: AES-256-GCM.
- `Salt`: 32-byte random value per encryption context.
- `IV/Nonce`: 12-byte random value for GCM.

Legacy compatibility:

- Import path supports PBKDF2-SHA256 metadata for old backups.
- Export path always emits Argon2id metadata to prevent future downgrade drift.

## Key Derivation Model

### Vault key path

1. App obtains/generates per-install device salt (`aegis_device_salt.bin`).
2. Biometric flow produces deterministic key material anchored to Android Keystore public key.
3. Argon2id derives fixed 32-byte key used by SQLCipher.
4. Derived key buffers are zeroed in memory after use.

### Backup key path

1. User provides backup password at export/import time.
2. Export creates random backup salt.
3. Argon2id derives 32-byte AES key.
4. AES-256-GCM encrypts serialized vault items.
5. Export stores KDF metadata (`kdf`, `memory`, `iterations`, `parallelism`, `hashLength`) in backup header.

## Data-at-Rest Design

- Primary secrets are stored in encrypted SQLite (SQLCipher open with derived key).
- Attachments and item fields are inside vault DB and therefore covered by DB encryption.
- Security state files (salt, brute-force counters, key material references) are in app private storage.

## Backup and Recovery Architecture

Encrypted backup format includes:

- `algorithm`: `AES-256-GCM`
- `kdf`: `Argon2id`
- KDF parameters and random `salt`
- `iv` and `authTag`
- `data` (ciphertext)

Import behavior:

- Rejects invalid/unexpected envelope shape.
- Supports Argon2id and legacy PBKDF2 metadata decryption routes.
- Parses decrypted JSON and rehydrates vault entries.

## Cloud Sync Security

Cloud sync module:

- Requires HTTPS endpoint.
- Enforces certificate pin format and validation via native bridge.
- Upload/download uses temporary local encrypted file that is deleted after operation.

Trust model:

- Cloud endpoint is treated as untrusted encrypted blob storage.
- Server compromise should not reveal plaintext vault data without backup password.

## Biometric Flow

- User presence is verified via biometric prompt.
- Android Keystore-backed key material is used as deterministic derivation input.
- If key material is missing/corrupt, reset and rebootstrap flow exists.

## Device Attack Surface and Controls

Implemented controls:

- Exponential lockout after repeated failures.
- In-memory key material zeroing after key usage.
- TLS + pinning requirement for cloud sync.
- Local password-health analytics to reduce credential-risk blast radius.

Planned controls:

- Root/integrity/tamper signals.
- Audit trail for critical security actions.
- Policy mode for strict handling on degraded devices.

## Password Health Engine

Vault-level health report includes:

- Weak secret detection.
- Reused secret detection.
- Similar mutation detection.
- Empty/incomplete entry detection.
- Aggregated score (`0-100`), risk level, issue list, and action recommendations.

Operational goal:

- Convert passive storage into active risk reduction guidance.

## Operational Security Considerations

- Keep Argon2id parameters configurable only via code release policy, not runtime user tweaks.
- Monitor performance impacts on low-end devices before increasing memory cost.
- Preserve strict backward compatibility for import while keeping export on strongest defaults.

## Verification Checklist

- Exported backup metadata reports `kdf: Argon2id`.
- New backups decrypt correctly on same and different devices using password.
- Legacy PBKDF2 backups still import successfully.
- Password health report returns deterministic counts and non-empty action list.
- Cloud sync still functions with temporary encrypted backup lifecycle.
