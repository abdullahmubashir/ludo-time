/* ========== PASSWORDS AND TOKENS ==========
   Passwords are never stored, only a scrypt hash of them with a salt of their own, so
   a stolen database still hands nobody a way in. Everything here comes out of Node's
   own crypto module - no packages, nothing to keep patched. */

import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);

const KEYLEN = 64;

export async function hashPassword(password){
  const salt = randomBytes(16).toString('hex');
  const hash = await scryptAsync(password, salt, KEYLEN);
  return { salt, hash: hash.toString('hex') };
}

export async function checkPassword(password, salt, expected){
  const hash = await scryptAsync(password, salt, KEYLEN);
  const want = Buffer.from(expected, 'hex');
  // lengths must match before the constant-time compare will look at them at all
  if(want.length !== hash.length) return false;
  return timingSafeEqual(hash, want);
}

export function newToken(){ return randomBytes(32).toString('hex'); }

/* ---------- what we will accept ---------- */

const NAME_RE = /^[a-zA-Z0-9_]{3,16}$/;

// returns an explanation when something is wrong, or null when the pair is fine
export function checkCredentials(username, password){
  if(typeof username !== 'string' || typeof password !== 'string')
    return 'Send a username and a password.';
  if(!NAME_RE.test(username))
    return 'Usernames are 3 to 16 characters: letters, numbers and underscore.';
  if(password.length < 6)
    return 'Passwords need at least 6 characters.';
  if(password.length > 200)
    return 'That password is too long.';
  return null;
}
