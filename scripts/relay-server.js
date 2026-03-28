const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = Number(process.env.AEGIS_RELAY_PORT || 3000);
const HOST = process.env.AEGIS_RELAY_HOST || '127.0.0.1';
const DATA_FILE = path.join(__dirname, 'relay-data.json');
const MAX_ENVELOPES_PER_SESSION = 500;

function loadStore() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      return { sessions: {} };
    }
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return { sessions: {} };
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

server.listen(PORT, HOST, () => {
  console.log(`[Aegis Relay] Listening on http://${HOST}:${PORT}`);
  console.log(`[Aegis Relay] Data file: ${DATA_FILE}`);
});
