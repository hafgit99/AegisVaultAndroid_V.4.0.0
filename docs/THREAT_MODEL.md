# Aegis Vault Android - Threat Model

## Scope and Security Goals

This threat model covers local vault storage, biometric unlock flows, encrypted backup/export, and optional cloud sync.

Primary security goals:

- Preserve confidentiality of vault secrets at rest and in transit.
- Detect and slow down offline brute-force attempts.
- Prevent silent downgrade to weaker cryptographic behavior.
- Keep user-visible trust boundaries clear during backup/import/sync.

Out of scope:

- Compromise of Android OS root trust chain itself.
- Physical hardware extraction by nation-state-level lab adversaries.
- Third-party server trust beyond encrypted payload storage.

## System Context and Data Flow

High-level data flow:

1. User unlocks vault through biometric prompt.
2. App derives deterministic SQLCipher key using Argon2id and device salt.
3. Vault data is read/written in encrypted SQLite.
4. Optional export creates AES-256-GCM encrypted `.aegis` backup.
5. Optional cloud sync uploads/downloads encrypted `.aegis` payload via HTTPS + certificate pinning.

Data classes:

- `Master secret material`: derived key and key derivation inputs.
- `Vault secret data`: usernames, passwords, notes, TOTP seeds, card/wifi data.
- `Metadata`: settings, counters, timestamps.
- `Operational telemetry`: local lockout and security-state files.

## Assets

Critical assets:

- Vault encryption keys and derived backup keys.
- Vault item secrets and attachment data.
- Biometric key material linkage to Android Keystore.
- Encrypted backup payloads and KDF metadata.

Sensitive supporting assets:

- Device salt file.
- Brute-force lockout state.
- Cloud sync endpoint credentials/tokens.

## Trust Boundaries

Main boundaries:

- App process boundary (trusted code path) vs external apps.
- Android Keystore hardware-backed material vs app-managed files.
- Local filesystem sandbox vs exported backup files.
- Network boundary between app and cloud sync endpoint.

Boundary assumptions:

- App sandbox is effective on non-rooted, non-tampered devices.
- TLS and certificate pinning are correctly enforced by native sync module.
- User chooses a non-trivial backup password.

## Threat Actors and Capabilities

- Opportunistic thief: obtains phone, attempts quick access or backup extraction.
- Malware app (no root): tries clipboard/UI abuse, file harvesting, overlay abuse.
- Advanced attacker (device file access): obtains app files and performs offline cracking.
- Network attacker: attempts MITM, endpoint impersonation, replay.

## Attack Surface

- Vault unlock and biometric prompt flow.
- Database open path and key derivation operations.
- Backup export/import and parsing pipeline.
- Cloud upload/download transport path.
- UI disclosure points (clipboard, shoulder surfing, app switching).

## Key Threats and Mitigations

### T1 - Offline brute-force on backup payload

Threat:

- Attacker steals `.aegis` backup and performs GPU/ASIC cracking.

Mitigations:

- AES-256-GCM encrypted payload.
- Argon2id KDF for backup key derivation (`memory=32768`, `iterations=4`, `parallelism=2`).
- Backward-compatible import for older PBKDF2 backups without weakening new exports.

Residual risk:

- Weak user-chosen backup passwords remain crackable.

### T2 - Vault unlock brute-force and repeated failures

Threat:

- Repeated unlock attempts by attacker with temporary device access.

Mitigations:

- Exponential lockout after failed unlock attempts.
- Deterministic Argon2id derivation tied to device salt.
- Failure state persisted in app storage.

Residual risk:

- Rooted devices may tamper with lockout state unless integrity controls are active.

### T3 - Biometric flow abuse or key mismatch

Threat:

- Attempt to bypass biometric gate or desynchronize key material.

Mitigations:

- Biometric prompt gate before derivation.
- Android Keystore-backed key pair bootstrap and reset path.
- Salted Argon2id derivation to fixed-length SQLCipher key.

Residual risk:

- Compromised TEE/secure hardware is out of normal mobile threat model.

### T4 - Network MITM during cloud sync

Threat:

- Adversary intercepts traffic and serves malicious endpoint certificate.

Mitigations:

- HTTPS-only cloud endpoints.
- Certificate pin validation in native bridge.
- End-to-end encrypted payload remains opaque to transport layer.

Residual risk:

- Wrong pin/token configuration by user can still break trust guarantees.

### T5 - Password hygiene weaknesses inside vault

Threat:

- Reused, weak, similar, or empty secrets increase breach impact.

Mitigations:

- Vault-level password health report with score and prioritized actions.
- Detection for weak patterns, reuse, similarity mutations, empty/incomplete records.

Residual risk:

- User may ignore recommendations.

## Security Assumptions

- Device is not rooted or bootloader-compromised.
- App binary is not maliciously repackaged.
- OS provides valid biometric and keystore services.
- User keeps backup password private and sufficiently strong.

## Root/Malware Assumptions and Limits

- Rooted devices are treated as degraded trust environments.
- Malware with accessibility/overlay abuse can still influence user actions.
- App-level crypto protects data at rest but cannot fully protect against active code execution within compromised process context.

## Priority Follow-ups

1. Add root/integrity signals and harden policy for degraded devices.
2. Add security event log for unlock/export/import/sync critical actions.
3. Extend health checks with optional breach intelligence (k-anonymity checks) as policy-controlled feature.
