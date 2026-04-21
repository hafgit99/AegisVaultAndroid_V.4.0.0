# Aegis Android API Reference

## Relay Server Endpoints

### `GET /health`
- Purpose: Liveness/readiness check for custom self-hosted relay servers.
- Success response: `200 OK`
- Used by: Sync settings "Check Relay Health" action.

### `POST /v1/sync/session/create`
- Purpose: Creates (or reuses) a relay session identifier for multi-device sync.
- Request body (optional):
```json
{
  "sessionId": "custom-session-id"
}
```
- Success response:
```json
{
  "ok": true,
  "created": true,
  "sessionId": "generated-or-requested-id",
  "pushEndpoint": "/v1/sync/push",
  "pullEndpoint": "/v1/sync/pull/generated-or-requested-id"
}
```

### `POST /integrity/verify`
- Purpose: Server-side verification for Android Play Integrity token.
- Request body:
```json
{
  "token": "play_integrity_token"
}
```
- Success response:
```json
{
  "ok": true,
  "verdict": {
    "appRecognitionVerdict": "PLAY_RECOGNIZED",
    "deviceRecognitionVerdict": ["MEETS_DEVICE_INTEGRITY"]
  }
}
```
- Failure response:
```json
{
  "ok": false,
  "reason": "integrity_verification_failed"
}
```

## App Security Modules (TypeScript)

### `SecurityModule`
- `factoryReset()`: Wipes local vault data, settings, and security traces.
- `panicWipe()`: Immediately locks vault and performs secure wipe flow.

### `SyncManager`
- `push(rootSecret, items, db)`: Pushes encrypted delta/full payload to relay.
- `pullAndMerge(rootSecret, items, db)`: Pulls encrypted payload and merges locally.
- Delta sync now tracks content hash in addition to timestamps to reduce clock-skew issues.

### `SyncCryptoService`
- Validates nonce and integrity metadata during sync packet processing.
- Rejects mismatched nonce payloads.

## Wear Sync Security

### `WearSyncCrypto`
- Encrypts watch payload (favorites only).
- Adds message authentication (HMAC) to prevent tampering.
- Companion/watch side must verify HMAC before decrypting.

## Notes
- All relay payloads are end-to-end encrypted.
- Do not log secrets, key material, or decrypted vault content in production.
