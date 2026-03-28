# Aegis Vault Android v4.0.2

Release date: 2026-03-26

This release focuses on security hardening, release discipline, encrypted settings persistence, and synchronization readiness for real-world Android deployments.

> Focus: stronger release hygiene, safer transport defaults, hardened local security behavior, and production-oriented sync improvements.

## Highlights

- Production-oriented Android release signing flow tightened
- HTTPS-only Cloud Sync validation enforced
- Certificate pin format validation added for Cloud Sync
- `FLAG_SECURE` enabled to reduce screenshot and screen-recording exposure
- Encrypted settings persistence consolidated and hardened
- Relay synchronization flow stabilized and validated on a real device
- Security Center, advanced search, and broader test coverage added

## Security and Infrastructure Improvements

### Release Build Hardening

- Release signing variables are resolved from Gradle properties or environment variables:
  - `RELEASE_STORE_FILE`
  - `RELEASE_STORE_PASSWORD`
  - `RELEASE_KEY_ALIAS`
  - `RELEASE_KEY_PASSWORD`
- Release configuration is aligned for distribution builds with explicit signing expectations
- Debug signing fallback is disabled by default for normal release workflows and can only be enabled intentionally for local-only testing

### Network and Cloud Sync Security

- Cloud Sync now rejects non-HTTPS endpoints
- Certificate pin input is validated in `sha256/<base64>` format
- Native Android secure bridge is used for pin-sensitive upload and download operations
- Cleartext traffic remains restricted by Android network security configuration

### Runtime Privacy Protection

- `FLAG_SECURE` is enabled in `MainActivity` to reduce risks from screenshots, screen capture, and recent-app previews
- Sensitive logging was reduced in security-sensitive flows

## Product Improvements in v4.0.2

- `SecureAppSettings` introduced for centralized encrypted app settings persistence
- `SecurityCenterService` added for proactive risk analysis and vault health scoring
- `SearchService` added for faster and smarter vault search behavior
- Relay-based synchronization settings and sync manager flow added and hardened
- English and Turkish localization expanded for the new surfaces

## Verification Status

- Signed release APK built successfully
- Real-device installation completed successfully
- Relay synchronization validated on device
- Lint issues cleaned
- Targeted Jest suites added and passing for:
  - settings persistence
  - sync crypto
  - sync device state
  - search
  - security center
  - passkey binding

## Distribution Notes

- This release is intended for signed distribution builds
- APK binaries should be published as GitHub Release assets, not committed into the repository
- Update compatibility depends on continuing to use the same signing key as prior public builds

## Known Notes

- Some third-party Gradle and Android Gradle Plugin deprecation warnings may still appear during build output
- Wider device-matrix validation is still recommended before broad production rollout
- Cloud Sync and relay sync should be validated against the target deployment environment before large-scale distribution

## Quick Summary

**v4.0.2 is a security- and reliability-focused release** that improves release readiness, transport security, settings persistence, and synchronization foundations while also expanding testing and product maturity.

## Support

If you encounter issues or have suggestions:

- Email: `admin@aegisvault.xyz`
- GitHub Issues: <https://github.com/hafgit99/AegisVaultAndroid_V.4.0.0/issues>
