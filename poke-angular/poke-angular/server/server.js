/**
 * Poke relay server.
 *
 * Two jobs:
 *   1. Keep a roster of who is online (WebSocket).
 *   2. Route a poke from one person to another, and host the shared GIF library.
 *
 * Run:  npm install && npm start
 * Default port 8787. Override with PORT=9000 npm start
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 8787;
const GIF_DIR = path.join(__dirname, 'gifs');
const MAX_GIF_BYTES = 6 * 1024 * 1024; // 6 MB

fs.mkdirSync(GIF_DIR, { recursive: true });

/* ------------------------------------------------------------------ helpers */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Filename',
};

function json(res, code, body) {
  const payload = JSON.stringify(body);
  res.writeHead(code, {
    ...CORS,
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

function safeName(name) {
  return String(name || '').replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 60);
}

// A real GIF starts with GIF87a or GIF89a. Cheap but effective gatekeeping.
function looksLikeGif(buf) {
  return buf.length > 6 && buf.slice(0, 6).toString('ascii').startsWith('GIF8');
}

/* --------------------------------------------------------------- http routes */

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS);
    return res.end();
  }

  if (url.pathname === '/health') {
    return json(res, 200, { ok: true, online: roster().length });
  }

  // List the shared library so everyone on the team sees the same GIFs.
  if (req.method === 'GET' && url.pathname === '/gifs') {
    const files = fs
      .readdirSync(GIF_DIR)
      .filter((f) => f.endsWith('.gif'))
      .map((f) => ({
        url: `/gifs/${f}`,
        name: f.replace(/^[a-f0-9]{8}-/, '').replace(/\.gif$/, ''),
        added: fs.statSync(path.join(GIF_DIR, f)).mtimeMs,
      }))
      .sort((a, b) => b.added - a.added);
    return json(res, 200, { gifs: files });
  }

  // Upload. Body is the raw GIF; original filename comes in as a header.
  if (req.method === 'POST' && url.pathname === '/gifs') {
    const chunks = [];
    let size = 0;
    let aborted = false;

    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_GIF_BYTES) {
        aborted = true;
        json(res, 413, { error: 'That GIF is over 6 MB. Pick a smaller one.' });
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      if (aborted) return;
      const buf = Buffer.concat(chunks);
      if (!looksLikeGif(buf)) {
        return json(res, 415, { error: 'That file is not a GIF.' });
      }
      const label = safeName(req.headers['x-filename']).replace(/\.gif$/i, '') || 'poke';
      const file = `${crypto.randomBytes(4).toString('hex')}-${label}.gif`;
      fs.writeFileSync(path.join(GIF_DIR, file), buf);
      broadcast({ type: 'library-changed' });
      return json(res, 201, { url: `/gifs/${file}`, name: label });
    });
    return;
  }

  // Serve a stored GIF.
  if (req.method === 'GET' && url.pathname.startsWith('/gifs/')) {
    const file = safeName(url.pathname.slice('/gifs/'.length));
    const full = path.join(GIF_DIR, file);
    if (!file || !full.startsWith(GIF_DIR) || !fs.existsSync(full)) {
      return json(res, 404, { error: 'No GIF by that name.' });
    }
    const buf = fs.readFileSync(full);
    res.writeHead(200, {
      ...CORS,
      'Content-Type': 'image/gif',
      'Content-Length': buf.length,
      'Cache-Control': 'public, max-age=604800',
    });
    return res.end(buf);
  }

  return json(res, 404, { error: 'Nothing here.' });
});

/* ---------------------------------------------------------------- websocket */

const wss = new WebSocketServer({ server });

/** id -> { socket, name, alive } */
const people = new Map();

function roster() {
  return [...people.entries()].map(([id, p]) => ({ id, name: p.name }));
}

function send(socket, msg) {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(msg));
}

function broadcast(msg) {
  for (const p of people.values()) send(p.socket, msg);
}

function pushRoster() {
  broadcast({ type: 'roster', people: roster() });
}

wss.on('connection', (socket) => {
  socket.isAlive = true;
  socket.on('pong', () => {
    socket.isAlive = true;
  });

  socket.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (msg.type === 'hello') {
      const id = String(msg.id || '').slice(0, 64);
      const name = String(msg.name || 'Someone').slice(0, 40);
      if (!id) return;

      // Same person reconnecting (or on a second machine): drop the stale socket.
      const existing = people.get(id);
      if (existing && existing.socket !== socket) existing.socket.terminate();

      socket.userId = id;
      people.set(id, { socket, name });
      send(socket, { type: 'welcome', id, name });
      pushRoster();
      return;
    }

    if (msg.type === 'ping') {
      return send(socket, { type: 'pong' });
    }

    if (msg.type === 'poke') {
      const from = people.get(socket.userId);
      const target = people.get(msg.to);
      if (!from) return;
      if (!target) {
        return send(socket, { type: 'poke-failed', to: msg.to, reason: 'offline' });
      }
      send(target.socket, {
        type: 'poke',
        fromId: socket.userId,
        fromName: from.name,
        gif: msg.gif || null,
        note: String(msg.note || '').slice(0, 120),
        at: Date.now(),
      });
      send(socket, { type: 'poke-sent', to: msg.to, toName: target.name });
      return;
    }

    // "On my way" / "Give me 5" going back to whoever poked.
    if (msg.type === 'reply') {
      const from = people.get(socket.userId);
      const target = people.get(msg.to);
      if (!from || !target) return;
      send(target.socket, {
        type: 'reply',
        fromId: socket.userId,
        fromName: from.name,
        text: String(msg.text || '').slice(0, 60),
        at: Date.now(),
      });
    }
  });

  socket.on('close', () => {
    const current = people.get(socket.userId);
    if (current && current.socket === socket) {
      people.delete(socket.userId);
      pushRoster();
    }
  });
});

// Drop connections that stopped answering.
setInterval(() => {
  for (const client of wss.clients) {
    if (client.isAlive === false) {
      client.terminate();
      continue;
    }
    client.isAlive = false;
    client.ping();
  }
}, 30000);

server.listen(PORT, () => {
  console.log(`Poke relay listening on http://localhost:${PORT}`);
  console.log(`Teammates on your network connect to http://<your-lan-ip>:${PORT}`);
});
