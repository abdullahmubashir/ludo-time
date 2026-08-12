/* ========== PRIVATE ROOMS ==========
   A room is a four-letter code, a handful of seats, and one player who owns it. Everything
   lives in memory: a room that empties is a room that never existed, and nothing here is
   worth surviving a restart.

   Players hear about changes down a stream the browser holds open (EventSource), and speak
   back over ordinary POSTs. A game of ludo happens a move at a time with a person thinking
   in between, so there is nothing here a stream and a form cannot carry - and neither of
   them needs a package installed to work. */

import { randomBytes } from 'node:crypto';

/* letters that survive being read aloud down a phone: no O/0, no I/1 */
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LEN   = 4;
const MAX_SEATS  = 6;
const IDLE_DEATH = 30 * 60 * 1000;   // a room nobody has touched for half an hour

const rooms = new Map();

const now = () => Date.now();
const newId = () => randomBytes(9).toString('hex');

function makeCode(){
  for(;;){
    let c = '';
    for(let i=0;i<CODE_LEN;i++) c += CODE_CHARS[randomBytes(1)[0] % CODE_CHARS.length];
    if(!rooms.has(c)) return c;
  }
}

/* what a player is allowed to know about the room they are sitting in */
function publicView(room){
  return {
    code : room.code,
    host : room.hostId,
    state: room.state,
    len  : room.len,
    seats: room.seats.map(s => ({ id:s.id, name:s.name, avatar:s.avatar, here:s.here }))
  };
}

function touch(room){ room.seen = now(); }

/* ---------- speaking to the people in a room ---------- */

function post(seat, event, data){
  if(!seat.stream) return;
  try{
    seat.stream.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }catch(e){
    seat.stream = null;                       // the far end hung up mid-sentence
  }
}

function tellEveryone(room, event, data, exceptId){
  for(const s of room.seats) if(s.id !== exceptId) post(s, event, data);
}

const tellSeats = room => tellEveryone(room, 'seats', publicView(room));

/* ---------- coming and going ---------- */

export function createRoom({ name, avatar, len }){
  const code = makeCode();
  const id   = newId();
  const room = {
    code, hostId:id, state:'lobby', len: len === 'quick' ? 'quick' : 'full',
    seats: [{ id, name, avatar, here:false, stream:null }],
    game: null, seen: now()
  };
  rooms.set(code, room);
  return { playerId:id, room:publicView(room) };
}

export function joinRoom({ code, name, avatar }){
  const room = rooms.get(String(code || '').toUpperCase());
  if(!room) return { error:'No room with that code.' };
  if(room.state !== 'lobby') return { error:'That match has already started.' };
  if(room.seats.length >= MAX_SEATS) return { error:'That room is full.' };

  const id = newId();
  room.seats.push({ id, name, avatar, here:false, stream:null });
  touch(room);
  tellSeats(room);
  return { playerId:id, room:publicView(room) };
}

export function leaveRoom({ code, playerId }){
  const room = rooms.get(code);
  if(!room) return { ok:true };

  room.seats = room.seats.filter(s => s.id !== playerId);
  if(!room.seats.length){ rooms.delete(code); return { ok:true }; }

  // the room outlives its founder: the next one in becomes the host
  if(room.hostId === playerId) room.hostId = room.seats[0].id;
  touch(room);
  tellEveryone(room, 'left', { id:playerId });
  tellSeats(room);
  return { ok:true };
}

/* ---------- the open line ---------- */

export function attachStream({ code, playerId, res }){
  const room = rooms.get(code);
  if(!room) return false;
  const seat = room.seats.find(s => s.id === playerId);
  if(!seat) return false;

  res.writeHead(200, {
    'content-type'                : 'text/event-stream; charset=utf-8',
    'cache-control'               : 'no-cache, no-transform',
    'connection'                  : 'keep-alive',
    'x-accel-buffering'           : 'no',            // tell a proxy not to hold it back
    'access-control-allow-origin' : '*'
  });

  seat.stream = res;
  seat.here   = true;
  touch(room);

  post(seat, 'hello', { you:playerId, ...publicView(room) });
  if(room.game) post(seat, 'state', room.game);
  tellSeats(room);

  // a comment every twenty seconds, so nothing between here and there decides we are done
  const beat = setInterval(() => { try{ res.write(': .\n\n'); }catch(e){} }, 20000);

  res.on('close', () => {
    clearInterval(beat);
    seat.stream = null;
    seat.here   = false;
    // the seat is kept: a dropped signal on the bus should not cost anyone their game
    tellSeats(room);
  });
  return true;
}

/* ---------- playing ---------- */

export function startGame({ code, playerId, count, len }){
  const room = rooms.get(code);
  if(!room) return { error:'That room is gone.' };
  if(room.hostId !== playerId) return { error:'Only the host can start.' };
  if(room.seats.length < 2) return { error:'Two players at least.' };

  room.state = 'playing';
  room.len   = len === 'quick' ? 'quick' : 'full';
  touch(room);

  const deal = {
    count: count || room.seats.length,
    len  : room.len,
    seats: room.seats.map(s => ({ id:s.id, name:s.name, avatar:s.avatar }))
  };
  tellEveryone(room, 'start', deal);
  post(room.seats.find(s => s.id === playerId) || {}, 'start', deal);
  return { ok:true, deal };
}

/* The host's copy runs the rules and says what happened; everyone else draws it. Moving the
   rules onto the server proper is the next job - until then this at least keeps one story. */
export function pushState({ code, playerId, state }){
  const room = rooms.get(code);
  if(!room) return { error:'That room is gone.' };
  if(room.hostId !== playerId) return { error:'Not yours to say.' };
  room.game = state;
  touch(room);
  tellEveryone(room, 'state', state, playerId);
  return { ok:true };
}

export function sendIntent({ code, playerId, intent }){
  const room = rooms.get(code);
  if(!room) return { error:'That room is gone.' };
  const host = room.seats.find(s => s.id === room.hostId);
  if(host) post(host, 'intent', { from:playerId, intent });
  touch(room);
  return { ok:true };
}

/* ---------- voice ----------
   The server never carries anyone's voice. It passes the notes two browsers need to find
   each other, and then they talk directly. */
export function relaySignal({ code, playerId, to, data }){
  const room = rooms.get(code);
  if(!room) return { error:'That room is gone.' };
  const target = room.seats.find(s => s.id === to);
  if(target) post(target, 'signal', { from:playerId, data });
  touch(room);
  return { ok:true };
}

export function setVoice({ code, playerId, on }){
  const room = rooms.get(code);
  if(!room) return { error:'That room is gone.' };
  const seat = room.seats.find(s => s.id === playerId);
  if(seat) seat.voice = !!on;
  tellEveryone(room, 'voice', { id:playerId, on:!!on }, playerId);
  return { ok:true };
}

/* ---------- housekeeping ---------- */

export function sweepRooms(){
  const cutoff = now() - IDLE_DEATH;
  for(const [code, room] of rooms)
    if(room.seen < cutoff) rooms.delete(code);
}

export const roomCount = () => rooms.size;
