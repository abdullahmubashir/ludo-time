/* ========== DATABASE ==========
   One SQLite file holds everything: who signed up, and the profile each of them
   carries between devices. SQLite ships inside Node itself, so there is nothing to
   install and nothing to run alongside the game - the file simply appears on first
   start and grows from there. */

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

// Render hands us a writable disk through DATA_DIR; on a laptop we just sit beside the code
const DB_PATH = process.env.DB_PATH || join(process.env.DATA_DIR || '.', 'ludotime.db');

mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new DatabaseSync(DB_PATH);

// WAL lets a reader carry on while someone else is writing, which is what a busy
// evening of matches looks like
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    username  TEXT    NOT NULL COLLATE NOCASE UNIQUE,
    salt      TEXT    NOT NULL,
    hash      TEXT    NOT NULL,
    created   INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS profiles (
    user_id   INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    data      TEXT    NOT NULL,
    updated   INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS tokens (
    token     TEXT    PRIMARY KEY,
    user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created   INTEGER NOT NULL,
    seen      INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS tokens_user ON tokens(user_id);
`);

const q = {
  userByName:   db.prepare('SELECT * FROM users WHERE username = ?'),
  userById:     db.prepare('SELECT * FROM users WHERE id = ?'),
  addUser:      db.prepare('INSERT INTO users (username, salt, hash, created) VALUES (?, ?, ?, ?)'),

  getProfile:   db.prepare('SELECT data FROM profiles WHERE user_id = ?'),
  putProfile:   db.prepare(`INSERT INTO profiles (user_id, data, updated) VALUES (?, ?, ?)
                            ON CONFLICT(user_id) DO UPDATE SET data = excluded.data,
                                                              updated = excluded.updated`),

  addToken:     db.prepare('INSERT INTO tokens (token, user_id, created, seen) VALUES (?, ?, ?, ?)'),
  getToken:     db.prepare('SELECT * FROM tokens WHERE token = ?'),
  touchToken:   db.prepare('UPDATE tokens SET seen = ? WHERE token = ?'),
  dropToken:    db.prepare('DELETE FROM tokens WHERE token = ?'),
  dropStale:    db.prepare('DELETE FROM tokens WHERE seen < ?')
};

export function findUser(username){ return q.userByName.get(username) || null; }
export function findUserById(id){ return q.userById.get(id) || null; }

export function createUser(username, salt, hash){
  const info = q.addUser.run(username, salt, hash, Date.now());
  return Number(info.lastInsertRowid);
}

export function loadProfile(userId){
  const row = q.getProfile.get(userId);
  if(!row) return null;
  try{ return JSON.parse(row.data); }
  catch(e){ return null; }              // a corrupt row should not lock anyone out
}

export function saveProfile(userId, profile){
  q.putProfile.run(userId, JSON.stringify(profile), Date.now());
}

export function createToken(token, userId){
  const now = Date.now();
  q.addToken.run(token, userId, now, now);
}

// a token stays alive as long as it keeps being used; ninety idle days and it is gone
const TOKEN_LIFE = 90 * 24 * 60 * 60 * 1000;

export function useToken(token){
  const row = q.getToken.get(token);
  if(!row) return null;
  const now = Date.now();
  if(now - row.seen > TOKEN_LIFE){ q.dropToken.run(token); return null; }
  q.touchToken.run(now, token);
  return findUserById(row.user_id);
}

export function killToken(token){ q.dropToken.run(token); }

export function sweepTokens(){ q.dropStale.run(Date.now() - TOKEN_LIFE); }

export const dbPath = DB_PATH;
