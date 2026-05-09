# Aegis Vault Android 5.0.0 Release Notes

Release line: `5.0.x`

## Summary

Aegis Vault Android 5.0.0 is the desktop-compatibility and release-trust release. It aligns Android vault data with the Aegis desktop v5 canonical schema, improves encrypted migration/export workflows, adds bridge pairing metadata, expands Security Center analysis, and introduces SBOM/provenance generation for release auditing.

## Highlights

- Desktop v5 canonical vault export/import support.
- Encrypted backup envelope carrying canonical v5 data.
- Crypto wallet and document record compatibility.
- Desktop/browser pairing workspace with short-lived bridge metadata.
- Relay sync protocol metadata and conflict summary fields.
- Local Watchtower-style Security Center checks for weak and reused passwords.
- Release provenance and CycloneDX SBOM generation.
- Continued Turkish/English and dark-mode compatible UI hardening.

## Security and Privacy

- Vault data remains local-first and encrypted at rest.
- Backup and sync payloads are encrypted before export or transport.
- Relay sync remains a transport layer and should not require plaintext vault access.
- Audit log behavior was refined to avoid noisy repeated unlock entries.
- Release metadata can be generated with `npm run release:provenance`.

## Compatibility

| Area | Value |
| --- | --- |
| Android app version | `5.0.0` |
| Version code | `500` |
| Canonical schema | `5.0.0` |
| Canonical kind | `aegis-vault-canonical` |
| Desktop marker | `desktop-v5-canonical` |
| Package name | `com.aegisandroid` |

## Validation Commands

Recommended pre-release checks:

```bash
npm run lint
npx tsc --noEmit
npm test
npm run release:provenance
```

Targeted v5 compatibility checks:

```bash
npx jest --no-coverage --runInBand --testTimeout=30000 --runTestsByPath __tests__/CanonicalVaultSchema.test.ts __tests__/BackupModule.test.ts
npx jest --no-coverage --runInBand --testTimeout=30000 --runTestsByPath __tests__/SyncEnvelope.test.ts __tests__/RelayProtocol.test.ts __tests__/BrowserPairingService.test.ts
```

## Known Release Gates

Before wide production rollout, validate the following on real devices:

- Biometric unlock and fallback behavior.
- Autofill setup and autofill field detection.
- Encrypted backup export/import round trip.
- Desktop v5 canonical export/import round trip.
- Relay sync with HTTPS and certificate pinning.
- Passkey create/auth readiness against a staging relying-party backend.
- Turkish/English UI and dark mode on primary screens.

## Upgrade Notes

- Existing Android records remain supported.
- Canonical v5 export is intended for desktop compatibility and migration workflows.
- Plaintext exports should be treated as sensitive and stored only in trusted locations.
- Signing credentials and keystores must stay outside the repository.
