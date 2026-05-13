const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

const PORT = Number(process.env.AEGIS_RELAY_PORT || 3000);
const HOST = process.env.AEGIS_RELAY_HOST || '127.0.0.1';
const DATA_FILE = path.join(__dirname, 'relay-data.json');
const TOKEN_MAX_AGE_MS = 5 * 60 * 1000;
const SUPPORTED_SYNC_VERSIONS = new Set(['1.0', '1.1']);

function loadStore() {
  try {
    if (!fs.existsSync(DATA_FILE)) return { sessions: {}, attestationNonces: {} };
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    return {
      sessions: parsed.sessions && typeof parsed.sessions === 'object' ? parsed.sessions : {},
      attestationNonces:
        parsed.attestationNonces && typeof parsed.attestationNonces === 'object'
          ? parsed.attestationNonces
          : {},
    };
  } catch {
    return { sessions: {}, attestationNonces: {} };
  }
}

function saveStore(store) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2), 'utf8');
}

function sendJson(res, statusCode, body) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(JSON.stringify(body));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => {
      raw += chunk.toString('utf8');
      if (raw.length > 1024 * 1024) {
        reject(new Error('Payload too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

function isValidEnvelope(env) {
  return Boolean(
    env &&
      typeof env === 'object' &&
      SUPPORTED_SYNC_VERSIONS.has(env.version) &&
      typeof env.sessionId === 'string' &&
      env.sessionId.length > 0 &&
      typeof env.deviceId === 'string' &&
      typeof env.sequenceNumber === 'number' &&
      typeof env.payload === 'string' &&
      typeof env.iv === 'string' &&
      typeof env.hmac === 'string',
  );
}

function isValidProtocolMetadata(env) {
  if (env.version === '1.0') return true;
  return Boolean(
    env.protocol &&
      env.protocol.schemaVersion === '1.1' &&
      env.protocol.minSupportedVersion === '1.0' &&
      Array.isArray(env.protocol.compatibility) &&
      env.metadata &&
      env.metadata.conflictPolicy === 'last_write_wins',
  );
}

function evaluateIntegrityPayload(payload, expectedNonce, expectedPackageName) {
  if (!payload || typeof payload !== 'object') {
    return { allow: false, reason: 'missing_token_payload' };
  }

  const requestDetails = payload.requestDetails || {};
  const appIntegrity = payload.appIntegrity || {};
  const deviceIntegrity = payload.deviceIntegrity || {};
  const verdicts = Array.isArray(deviceIntegrity.deviceRecognitionVerdict)
    ? deviceIntegrity.deviceRecognitionVerdict
    : [];

  if (requestDetails.nonce !== expectedNonce) {
    return { allow: false, reason: 'nonce_mismatch' };
  }
  if (requestDetails.requestPackageName !== expectedPackageName) {
    return { allow: false, reason: 'package_mismatch' };
  }

  const requestTs = Number(requestDetails.timestampMillis || 0);
  if (!requestTs || Math.abs(Date.now() - requestTs) > TOKEN_MAX_AGE_MS) {
    return { allow: false, reason: 'token_expired_or_clock_skew' };
  }

  if (appIntegrity.appRecognitionVerdict !== 'PLAY_RECOGNIZED') {
    return { allow: false, reason: 'app_not_play_recognized' };
  }

  const hasDeviceIntegrity =
    verdicts.includes('MEETS_DEVICE_INTEGRITY') ||
    verdicts.includes('MEETS_STRONG_INTEGRITY') ||
    verdicts.includes('MEETS_BASIC_INTEGRITY');
  if (!hasDeviceIntegrity) {
    return { allow: false, reason: 'device_integrity_not_met' };
  }

  return {
    allow: true,
    reason: 'verified',
    details: {
      appRecognitionVerdict: appIntegrity.appRecognitionVerdict,
      deviceRecognitionVerdict: verdicts,
      timestampMillis: requestTs,
    },
  };
}

function createSessionId() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `${Date.now().toString(36)}-${crypto.randomBytes(6).toString('hex')}`;
}

const store = loadStore();

const server = http.createServer(async (req, res) => {
  if (!req.url) {
    sendJson(res, 400, { error: 'Missing URL' });
    return;
  }
  if (req.method === 'OPTIONS') {
    sendJson(res, 200, { ok: true });
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (req.method === 'GET' && url.pathname === '/health') {
    sendJson(res, 200, {
      ok: true,
      host: HOST,
      port: PORT,
      sessions: Object.keys(store.sessions).length,
    });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/v1/sync/session/create') {
    const body = await readJson(req).catch(() => ({}));
    const requested = typeof body.sessionId === 'string' ? body.sessionId.trim() : '';
    const sessionId = requested || createSessionId();
    if (!/^[a-zA-Z0-9._:-]{8,128}$/.test(sessionId)) {
      sendJson(res, 400, { ok: false, error: 'invalid_session_id_format' });
      return;
    }
    const created = !Array.isArray(store.sessions[sessionId]);
    if (created) {
      store.sessions[sessionId] = [];
      saveStore(store);
    }
    sendJson(res, 200, { ok: true, created, sessionId });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/v1/sync/push') {
    const envelope = await readJson(req).catch(() => null);
    if (!isValidEnvelope(envelope)) {
      sendJson(res, 400, { error: 'Invalid envelope' });
      return;
    }
    if (!isValidProtocolMetadata(envelope)) {
      sendJson(res, 426, { error: 'Unsupported sync protocol metadata' });
      return;
    }
    const current = store.sessions[envelope.sessionId] || [];
    store.sessions[envelope.sessionId] = [
      ...current.filter(
        existing =>
          existing.deviceId !== envelope.deviceId ||
          existing.sequenceNumber !== envelope.sequenceNumber,
      ),
      { ...envelope, receivedAt: new Date().toISOString() },
    ].sort((a, b) => a.sequenceNumber - b.sequenceNumber);
    saveStore(store);
    sendJson(res, 200, { ok: true, stored: store.sessions[envelope.sessionId].length });
    return;
  }

  const pullMatch = req.method === 'GET' && url.pathname.match(/^\/v1\/sync\/pull\/([^/]+)$/);
  if (pullMatch) {
    const sessionId = decodeURIComponent(pullMatch[1]);
    const after = Number(url.searchParams.get('after') || '0');
    sendJson(
      res,
      200,
      (store.sessions[sessionId] || []).filter(envelope => envelope.sequenceNumber > after),
    );
    return;
  }

  sendJson(res, 404, { error: 'Not found' });
});

if (require.main === module) {
  server.listen(PORT, HOST, () => {
    console.log(`[Aegis Relay] Listening on http://${HOST}:${PORT}`);
  });
}

module.exports = {
  evaluateIntegrityPayload,
  isValidEnvelope,
  isValidProtocolMetadata,
};
