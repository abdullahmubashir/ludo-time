/* ========== LUDO TIME SERVER ==========
   Serves the game and keeps everyone's profile. The game itself is still the same three
   files it always was; this only adds the part a browser cannot do on its own - somewhere
   for coins and levels to live that is not one particular phone.

   Run it with:  node server/server.js
   Then open:    http://localhost:8777                                                  */

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { hashPassword, checkPassword, newToken, checkCredentials } from './auth.js';
import { findUser, createUser, loadProfile, saveProfile,
         createToken, useToken, killToken, sweepTokens, dbPath } from './db.js';
import { createRoom, joinRoom, leaveRoom, attachStream, startGame,
         pushState, sendIntent, relaySignal, setVoice, sweepRooms, roomCount } from './rooms.js';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(HERE, '..');               // the game's own folder, one level up
const PORT = Number(process.env.PORT) || 8777;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css' : 'text/css; charset=utf-8',
  '.js'  : 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg' : 'image/svg+xml',
  '.png' : 'image/png',
  '.ico' : 'image/x-icon'
};

/* ---------- small helpers ---------- */

/* A copy of the game opened straight off the disk counts as coming from nowhere, and a
   browser will not let nowhere talk to us unless we say it may. Saying so is what lets a
   downloaded copy sign in. There are no cookies here - a caller has to hold a token that
   only ever lived in their own browser storage - so opening the door costs nothing that
   was not already reachable from any machine on the internet. */
const CORS = {
  'access-control-allow-origin' : '*',
  'access-control-allow-headers': 'content-type, authorization',
  'access-control-allow-methods': 'GET, POST, PUT, OPTIONS',
  'access-control-max-age'      : '86400'
};

function send(res, status, body, type='application/json; charset=utf-8'){
  const data = typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store', ...CORS });
  res.end(data);
}

const fail = (res, status, error) => send(res, status, { error });

// refuses anything oversized rather than reading it into memory first
function readJson(req, limit = 64 * 1024){
  return new Promise((ok, no) => {
    let size = 0;
    const parts = [];
    req.on('data', c => {
      size += c.length;
      if(size > limit){ no(new Error('too big')); req.destroy(); return; }
      parts.push(c);
    });
    req.on('end', () => {
      if(!parts.length) return ok({});
      try{ ok(JSON.parse(Buffer.concat(parts).toString('utf8'))); }
      catch(e){ no(new Error('bad json')); }
    });
    req.on('error', no);
  });
}

function bearer(req){
  const h = req.headers.authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : null;
}

// the caller's account, or null when the token is missing, unknown or long expired
function whoIs(req){
  const t = bearer(req);
  return t ? useToken(t) : null;
}

/* ---------- keeping guessers out ----------
   Six tries a minute per address is plenty for someone who knows their own password,
   and slow enough that working through a list is not worth anyone's evening. */

const attempts = new Map();
const WINDOW = 60 * 1000, MAX_TRIES = 6;

function tooManyTries(ip){
  const now = Date.now();
  const hits = (attempts.get(ip) || []).filter(t => now - t < WINDOW);
  hits.push(now);
  attempts.set(ip, hits);
  return hits.length > MAX_TRIES;
}

setInterval(() => {
  const cutoff = Date.now() - WINDOW;
  for(const [ip, hits] of attempts){
    const live = hits.filter(t => t > cutoff);
    if(live.length) attempts.set(ip, live); else attempts.delete(ip);
  }
  sweepTokens();
  sweepRooms();
}, 5 * 60 * 1000).unref();

const addressOf = req =>
  (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
  req.socket.remoteAddress || 'unknown';

/* ---------- what a stored profile may look like ----------
   The client owns the shape, so we do not police every field - but it has to be a plain
   object of a sane size, or a bad build could park anything at all in the database. */

function usableProfile(p){
  if(!p || typeof p !== 'object' || Array.isArray(p)) return false;
  return JSON.stringify(p).length <= 8 * 1024;
}

/* ---------- routes ---------- */

async function register(req, res){
  const ip = addressOf(req);
  if(tooManyTries(ip)) return fail(res, 429, 'Too many tries — wait a minute.');

  const { username, password } = await readJson(req);
  const bad = checkCredentials(username, password);
  if(bad) return fail(res, 400, bad);

  if(findUser(username)) return fail(res, 409, 'That name is taken — pick another.');

  const { salt, hash } = await hashPassword(password);
  const id = createUser(username, salt, hash);

  const token = newToken();
  createToken(token, id);
  send(res, 201, { token, username, profile: null });
}

async function login(req, res){
  const ip = addressOf(req);
  if(tooManyTries(ip)) return fail(res, 429, 'Too many tries — wait a minute.');

  const { username, password } = await readJson(req);
  if(typeof username !== 'string' || typeof password !== 'string')
    return fail(res, 400, 'Send a username and a password.');

  const user = findUser(username);
  // the same answer either way, so nobody can fish for which names exist
  const ok = user && await checkPassword(password, user.salt, user.hash);
  if(!ok) return fail(res, 401, 'Wrong name or password.');

  const token = newToken();
  createToken(token, user.id);
  send(res, 200, { token, username: user.username, profile: loadProfile(user.id) });
}

function logout(req, res){
  const t = bearer(req);
  if(t) killToken(t);
  send(res, 200, { ok: true });
}

function getProfile(req, res){
  const user = whoIs(req);
  if(!user) return fail(res, 401, 'Sign in again.');
  send(res, 200, { username: user.username, profile: loadProfile(user.id) });
}

async function putProfile(req, res){
  const user = whoIs(req);
  if(!user) return fail(res, 401, 'Sign in again.');

  const { profile } = await readJson(req);
  if(!usableProfile(profile)) return fail(res, 400, 'That profile does not look right.');

  saveProfile(user.id, profile);
  send(res, 200, { ok: true });
}

/* ---------- the game's own files ----------
   Sitting in this folder next to the game are things no visitor may have: the database
   carries everyone's password hashes, and the server's own source is nobody's business.
   Staying inside the folder is not enough on its own - the file has to be one the game
   actually needs. */

function isPrivate(rel){
  const p = rel.replace(/\\/g, '/').toLowerCase();
  if(p.startsWith('server/') || p.startsWith('node_modules/')) return true;
  if(p.startsWith('.') || p.includes('/.')) return true;        // .git, .gitignore, .claude
  if(/\.(db|db-wal|db-shm)$/.test(p)) return true;
  if(p === 'package.json' || p === 'package-lock.json') return true;
  return false;
}

async function serveStatic(req, res, pathname){
  let rel = decodeURIComponent(pathname).replace(/^\/+/, '');
  if(rel === '') rel = 'index.html';

  const full = resolve(ROOT, rel);
  // resolve() flattens any ../ before we look, so a crafted path cannot climb out
  if(full !== ROOT && !full.startsWith(ROOT + sep)) return fail(res, 403, 'No.');

  // and an allow-list of file kinds, so anything unexpected dropped in here stays put
  if(isPrivate(rel) || !TYPES[extname(full).toLowerCase()]) return fail(res, 404, 'Not found.');

  try{
    const info = await stat(full);
    if(!info.isFile()) return fail(res, 404, 'Not found.');
    const body = await readFile(full);
    res.writeHead(200, {
      'content-type': TYPES[extname(full).toLowerCase()] || 'application/octet-stream',
      // no-store, not no-cache: without a validator to check against, browsers were
      // serving yesterday's script beside today's stylesheet and the two disagreed
      'cache-control': 'no-store, must-revalidate'
    });
    res.end(body);
  }catch(e){
    fail(res, 404, 'Not found.');
  }
}

/* ---------- putting it together ---------- */

const server = createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');

  try{
    if(pathname.startsWith('/api/')){
      // the browser asks permission before the real call; answer it and stop there
      if(req.method === 'OPTIONS'){ res.writeHead(204, CORS); return res.end(); }

      if(req.method === 'POST' && pathname === '/api/register') return await register(req, res);
      if(req.method === 'POST' && pathname === '/api/login')    return await login(req, res);
      if(req.method === 'POST' && pathname === '/api/logout')   return logout(req, res);
      if(req.method === 'GET'  && pathname === '/api/profile')  return getProfile(req, res);
      if(req.method === 'PUT'  && pathname === '/api/profile')  return await putProfile(req, res);
      if(req.method === 'GET'  && pathname === '/api/health')   return send(res, 200, { ok: true, rooms: roomCount() });

      /* ---- private rooms ---- */
      if(pathname === '/api/room/stream' && req.method === 'GET'){
        const { searchParams } = new URL(req.url, 'http://localhost');
        const ok = attachStream({ code: searchParams.get('code'),
                                  playerId: searchParams.get('playerId'), res });
        if(!ok) return fail(res, 404, 'That room or seat is gone.');
        return;                                   // the line stays open from here on
      }
      if(req.method === 'POST' && pathname.startsWith('/api/room/')){
        const body = await readJson(req);
        const what = pathname.slice('/api/room/'.length);
        const run = {
          create: () => createRoom(body),
          join  : () => joinRoom(body),
          leave : () => leaveRoom(body),
          start : () => startGame(body),
          state : () => pushState(body),
          intent: () => sendIntent(body),
          signal: () => relaySignal(body),
          voice : () => setVoice(body)
        }[what];
        if(!run) return fail(res, 404, 'No such endpoint.');
        const out = run();
        return out && out.error ? fail(res, 400, out.error) : send(res, 200, out);
      }

      return fail(res, 404, 'No such endpoint.');
    }

    if(req.method === 'GET' || req.method === 'HEAD') return await serveStatic(req, res, pathname);
    fail(res, 405, 'Method not allowed.');

  }catch(err){
    if(/too big|bad json/.test(err.message)) return fail(res, 400, 'That request made no sense.');
    console.error('unhandled:', err);
    if(!res.headersSent) fail(res, 500, 'Something broke on our side.');
  }
});

server.listen(PORT, () => {
  console.log(`Ludo Time server on http://localhost:${PORT}`);
  console.log(`serving  ${ROOT}`);
  console.log(`database ${dbPath}`);
});
