const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Buffer } = require('buffer');
const { URL } = require('url');

const PORT = Number(process.env.AEGIS_RELAY_PORT || 3000);
const HOST = process.env.AEGIS_RELAY_HOST || '127.0.0.1';
const DATA_FILE = path.join(__dirname, 'relay-data.json');
const MAX_ENVELOPES_PER_SESSION = 500;
const MAX_NONCES_PER_SESSION = 400;
const TOKEN_MAX_AGE_MS = 5 * 60 * 1000;

function loadStore() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      return { sessions: {}, attestationNonces: {} };
    }
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    if (!parsed.sessions || typeof parsed.sessions !== 'object') parsed.sessions = {};
    if (!parsed.attestationNonces || typeof parsed.attestationNonces !== 'object') {
      parsed.attestationNonces = {};
    }
    return parsed;
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
      env.version === '1.0' &&
      typeof env.sessionId === 'string' &&
      env.sessionId.length > 0 &&
      typeof env.deviceId === 'string' &&
      typeof env.sequenceNumber === 'number' &&
      typeof env.payload === 'string' &&
      typeof env.iv === 'string' &&
      typeof env.hmac === 'string',
  );
}

function loadServiceAccount() {
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    return JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  }

  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    const filePath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  }

  if (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY) {
    return {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY,
    };
  }

  return null;
}

function b64url(input) {
  const raw = Buffer.isBuffer(input) ? input : Buffer.from(String(input), 'utf8');
  return raw
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(new RegExp('=+$'), '');
}

function buildJwtAssertion(serviceAccount, scope) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: serviceAccount.client_email,
    scope,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };

  const unsigned = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const privateKey = String(serviceAccount.private_key || '').replace(/\\n/g, '\n');
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(unsigned);
  signer.end();
  const signature = signer.sign(privateKey);
  return `${unsigned}.${b64url(signature)}`;
}

async function getGoogleAccessToken() {
  const sa = loadServiceAccount();
  if (!sa?.client_email || !sa?.private_key) {
    throw new Error('Google service account credentials are missing on relay server');
  }

  const assertion = buildJwtAssertion(
    sa,
    'https://www.googleapis.com/auth/playintegrity',
  );

  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion,
  }).toString();

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OAuth token request failed: ${response.status} ${text}`);
  }

  const json = await response.json();
  if (!json?.access_token) {
    throw new Error('OAuth token response missing access_token');
  }
  return json.access_token;
}

async function decodeIntegrityToken(integrityToken, packageName) {
  const accessToken = await getGoogleAccessToken();
  const response = await fetch(
    `https://playintegrity.googleapis.com/v1/${encodeURIComponent(packageName)}:decodeIntegrityToken`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ integrity_token: integrityToken }),
    },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Play Integrity decode failed: ${response.status} ${text}`);
  }

  const decoded = await response.json();
  return decoded?.tokenPayloadExternal || null;
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

function trackNonce(store, sessionId, nonce) {
  const current = Array.isArray(store.attestationNonces[sessionId])
    ? store.attestationNonces[sessionId]
    : [];
  if (current.includes(nonce)) {
    return false;
  }
  current.push(nonce);
  store.attestationNonces[sessionId] = current.slice(-MAX_NONCES_PER_SESSION);
  return true;
}

function createSessionId() {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
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
      integrityConfigured: Boolean(loadServiceAccount()),
    });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/v1/integrity/verify') {
    try {
      const body = await readJson(req);
      const sessionId = typeof body.sessionId === 'string' ? body.sessionId : '';
      const nonce = typeof body.nonce === 'string' ? body.nonce : '';
      const integrityToken = typeof body.integrityToken === 'string' ? body.integrityToken : '';
      const packageName = typeof body.packageName === 'string' ? body.packageName : '';

      if (!sessionId || !nonce || !integrityToken || !packageName) {
        sendJson(res, 400, { allow: false, reason: 'missing_required_fields' });
        return;
      }

      if (!trackNonce(store, sessionId, nonce)) {
        sendJson(res, 409, { allow: false, reason: 'nonce_replay_detected' });
        return;
      }

      const decodedPayload = await decodeIntegrityToken(integrityToken, packageName);
      const verdict = evaluateIntegrityPayload(decodedPayload, nonce, packageName);
      if (!verdict.allow) {
        sendJson(res, 403, { allow: false, reason: verdict.reason });
        return;
      }

      saveStore(store);
      sendJson(res, 200, {
        allow: true,
        reason: 'verified',
        at: new Date().toISOString(),
        details: verdict.details,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'integrity_verification_failed';
      sendJson(res, 500, { allow: false, reason: message });
    }
    return;
  }

  if (req.method === 'POST' && url.pathname === '/v1/sync/session/create') {
    try {
      const body = await readJson(req);
      const requestedSessionId =
        typeof body.sessionId === 'string' ? body.sessionId.trim() : '';
      const sessionId = requestedSessionId || createSessionId();

      if (!/^[a-zA-Z0-9._:-]{8,128}$/.test(sessionId)) {
        sendJson(res, 400, { ok: false, error: 'invalid_session_id_format' });
        return;
      }

      const alreadyExists = Array.isArray(store.sessions[sessionId]);
      if (!alreadyExists) {
        store.sessions[sessionId] = [];
        saveStore(store);
      }

      sendJson(res, 200, {
        ok: true,
        created: !alreadyExists,
        sessionId,
        pushEndpoint: '/v1/sync/push',
        pullEndpoint: `/v1/sync/pull/${encodeURIComponent(sessionId)}`,
      });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: error instanceof Error ? error.message : 'bad_request' });
    }
    return;
  }

  if (req.method === 'POST' && url.pathname === '/v1/sync/push') {
    try {
      const envelope = await readJson(req);
      if (!isValidEnvelope(envelope)) {
        sendJson(res, 400, { error: 'Invalid envelope' });
        return;
      }

      const sessionId = envelope.sessionId;
      const current = store.sessions[sessionId] || [];
      const withoutDuplicate = current.filter(
        existing =>
          !(
            existing.deviceId === envelope.deviceId &&
            existing.sequenceNumber === envelope.sequenceNumber
          ),
      );

      withoutDuplicate.push({
        ...envelope,
        receivedAt: new Date().toISOString(),
      });
      withoutDuplicate.sort((a, b) => a.sequenceNumber - b.sequenceNumber);
      store.sessions[sessionId] = withoutDuplicate.slice(-MAX_ENVELOPES_PER_SESSION);
      saveStore(store);

      sendJson(res, 200, {
        ok: true,
        stored: store.sessions[sessionId].length,
        sequenceNumber: envelope.sequenceNumber,
      });
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : 'Bad request' });
    }
    return;
  }

  const pullMatch = req.method === 'GET' && url.pathname.match(/^\/v1\/sync\/pull\/([^/]+)$/);
  if (pullMatch) {
    const sessionId = decodeURIComponent(pullMatch[1]);
    const after = Number(url.searchParams.get('after') || '0');
    const envelopes = (store.sessions[sessionId] || []).filter(
      envelope => envelope.sequenceNumber > after,
    );
    sendJson(res, 200, envelopes);
    return;
  }

  sendJson(res, 404, { error: 'Not found' });
});

if (require.main === module) {
  server.listen(PORT, HOST, () => {
    console.log(`[Aegis Relay] Listening on http://${HOST}:${PORT}`);
    console.log(`[Aegis Relay] Data file: ${DATA_FILE}`);
  });
}

module.exports = {
  evaluateIntegrityPayload,
  loadServiceAccount,
};
