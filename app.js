/* ========== BOARD GEOMETRY (works for 4 or 6 arms) ========== */
function buildGeom(N){
  const armR0 = N===4 ? 2 : 3;
  const total = N===4 ? 15 : 20;
  const C = total/2;
  const step = 360/N;
  const yardR    = N===4 ? 6.364 : 7.9;   // 4-arm yard sits dead centre of its 6x6 quadrant
  const yardSize = N===4 ? 6.0   : 3.6;
  const rad = d => d*Math.PI/180;

  const P = (a,r,off)=>{
    const t = rad(180 + a*step);
    return {
      x: C + Math.cos(t)*r - Math.sin(t)*off,
      y: C + Math.sin(t)*r + Math.cos(t)*off,
      rot: 180 + a*step
    };
  };

  const track=[], homes=[], yards=[], start=[], entry=[];
  for(let a=0;a<N;a++){
    const b = track.length;
    for(let i=0;i<6;i++) track.push(P(a, armR0+i, -1));   // outward lane
    track.push(P(a, armR0+5, 0));                          // arm tip
    for(let i=5;i>=0;i--) track.push(P(a, armR0+i, 1));    // inward lane
    start.push(b+8); entry.push(b+6);
    homes.push([4,3,2,1,0].map(i=>P(a, armR0+i, 0)));

    // yard sits in the wedge between arm a and arm a+1
    const wa = rad(180 + a*step + step/2);
    const yc = { x: C + Math.cos(wa)*yardR, y: C + Math.sin(wa)*yardR };
    const rot = 180 + a*step + step/2 + 45;
    const rr = rad(rot), cs = Math.cos(rr), sn = Math.sin(rr), k = yardSize*0.208;
    yards.push({
      cx: yc.x, cy: yc.y, rot,
      slots: [[-k,-k],[k,-k],[-k,k],[k,k]].map(([u,v])=>({
        x: yc.x + u*cs - v*sn,
        y: yc.y + u*sn + v*cs
      }))
    });
  }

  const TN = track.length;                 // 52 or 78
  const safe = new Set();
  start.forEach(s=>{ safe.add(s); safe.add((s+8)%TN); });

  return {
    N, total, C, track, homes, yards, start, entry, safe, TN,
    yardSize,
    slotSize: yardSize*0.175,
    HOME0: TN-1,          // first home-lane position
    LAST : TN+4,          // centre
    hubR : armR0-0.5
  };
}

/* ========== CONSTANTS ========== */
const CVAR = ['--p0','--p1','--p2','--p3','--p4','--p5'];
const CNAME = ['Red','Green','Yellow','Blue','Purple','Orange'];
const AVATAR = ['🦊','🐢','🐤','🐬','🐼','🦁'];
const SEATS = { 2:[0,2], 3:[0,1,2], 4:[0,1,2,3], 5:[0,1,2,3,4], 6:[0,1,2,3,4,5] };

let G = null, S = null;
let sound = true, tilt = false, busy = false;
const el = id => document.getElementById(id);
const board = el('board');
const wait = ms => new Promise(r=>setTimeout(r,ms));

/* ========== SOUND ========== */
let AC=null;
function beep(f,dur,type,vol){
  if(!sound) return;
  try{
    AC = AC || new (window.AudioContext||window.webkitAudioContext)();
    const o=AC.createOscillator(), g=AC.createGain();
    o.type=type||'triangle'; o.frequency.value=f;
    g.gain.setValueAtTime(vol||.14,AC.currentTime);
    g.gain.exponentialRampToValueAtTime(.001,AC.currentTime+dur);
    o.connect(g);g.connect(AC.destination);o.start();o.stop(AC.currentTime+dur);
  }catch(e){}
}
const sfx = {
  roll(){ for(let i=0;i<7;i++) setTimeout(()=>beep(150+Math.random()*260,.05,'square',.085), i*85); },
  land(){ beep(240,.09,'square',.16); setTimeout(()=>beep(170,.13,'triangle',.12),55); },
  step(){ beep(680,.06,'sine',.08); },
  cut(){ beep(230,.22,'sawtooth',.16); setTimeout(()=>beep(150,.28,'sawtooth',.14),90); },
  home(){ [660,880,1180].forEach((f,i)=>setTimeout(()=>beep(f,.16,'triangle',.13),i*95)); },
  win(){ [523,659,784,1046,1318].forEach((f,i)=>setTimeout(()=>beep(f,.28,'triangle',.15),i*130)); }
};

/* ========== DRAW BOARD ========== */
function at(n,p,size,rot){
  const U = 100/G.total;
  n.style.left = (p.x*U) + '%';
  n.style.top  = (p.y*U) + '%';
  n.style.width  = (size*U)+'%';
  n.style.height = (size*U)+'%';
  n.style.marginLeft = (-size*U/2)+'%';
  n.style.marginTop  = (-size*U/2)+'%';
  if(rot!==undefined) n.style.transform = `rotate(${rot}deg)`;
}

function drawBoard(){
  board.innerHTML='';

  if(G.N===6){
    const f=document.createElement('div'); f.className='hexframe'; board.appendChild(f);
  }
  const plate=document.createElement('div');
  plate.className = 'plate ' + (G.N===6 ? 'hex' : 'sq');
  board.appendChild(plate);

  // yards: solid colour block with a white inner square
  G.yards.forEach((y,a)=>{
    const d=document.createElement('div'); d.className='yardbox';
    d.style.background=`var(${CVAR[a]})`;
    d.dataset.a=a;
    at(d,{x:y.cx,y:y.cy},G.yardSize,y.rot);
    d.innerHTML='<i></i>';
    board.appendChild(d);
  });

  // the four resting spots inside each yard
  G.yards.forEach((y,a)=>y.slots.forEach(sl=>{
    const s=document.createElement('div'); s.className='slot';
    s.style.background=`var(${CVAR[a]})`;
    at(s,sl,G.slotSize);
    board.appendChild(s);
  }));

  // home lanes: flat player colour
  G.homes.forEach((lane,a)=>lane.forEach(p=>{
    const d=document.createElement('div'); d.className='cell';
    d.style.background=`var(${CVAR[a]})`;
    d.style.borderColor='rgba(255,255,255,.55)';
    at(d,p,1,p.rot); board.appendChild(d);
  }));

  // track
  G.track.forEach((p,idx)=>{
    const d=document.createElement('div'); d.className='cell';
    const owner = G.start.indexOf(idx);
    if(owner>-1) d.style.background=`var(${CVAR[owner]})`;
    else if(G.safe.has(idx)) d.innerHTML='<span class="mk">\u2606</span>';
    at(d,p,1,p.rot); board.appendChild(d);
  });

  // entry arrows pointing into each home lane
  G.entry.forEach((idx,a)=>{
    const p=G.track[idx];
    const w=document.createElement('div'); w.className='arw';
    w.style.background=`var(${CVAR[a]})`;
    at(w,p,0.62,p.rot+180);
    board.appendChild(w);
  });

  // centre
  const hub=document.createElement('div'); hub.className='hub';
  at(hub,{x:G.C,y:G.C}, G.hubR*2);
  if(G.N===4){
    [['polygon(0 0,50% 50%,0 100%)',0],['polygon(0 0,100% 0,50% 50%)',1],
     ['polygon(100% 0,100% 100%,50% 50%)',2],['polygon(0 100%,100% 100%,50% 50%)',3]]
      .forEach(([cl,a])=>{
        const t=document.createElement('div'); t.className='tri';
        t.style.clipPath=cl; t.style.background=`var(${CVAR[a]})`;
        hub.appendChild(t);
      });
  } else {
    const stops=[];
    for(let a=0;a<6;a++) stops.push(`var(${CVAR[a]}) 0 ${(a+1)*60}deg`);
    const t=document.createElement('div'); t.className='tri';
    t.style.background=`conic-gradient(from 240deg, ${stops.join(',')})`;
    t.style.clipPath='polygon(50% 0%,93.3% 25%,93.3% 75%,50% 100%,6.7% 75%,6.7% 25%)';
    hub.appendChild(t);
  }
  board.appendChild(hub);
}


/* the board must stay square inside whatever space the screen leaves */
function fitBoard(){
  const stage = document.querySelector('.board-stage');
  if(!stage || !board) return;
  const side = Math.floor(Math.min(stage.clientWidth, stage.clientHeight));
  if(side < 40) return;
  board.style.width  = side + 'px';
  board.style.height = side + 'px';
}


/* the goti: a round head ringed in white, a tapering neck and a dark base */
const GOTI_SVG = `
<svg viewBox="0 0 40 54" xmlns="http://www.w3.org/2000/svg">
  <ellipse cx="20" cy="50.5" rx="11" ry="3.2" fill="rgba(0,0,0,.32)"/>
  <g class="pawn">
    <ellipse cx="20" cy="47.4" rx="9.6" ry="3.9" fill="var(--tcd)"/>
    <ellipse cx="20" cy="45.9" rx="9.6" ry="3.9" fill="var(--tc)"
             stroke="rgba(0,0,0,.14)" stroke-width=".8"/>
    <path d="M13.4 30 L26.6 30 Q25.2 40.5 23.4 45 L16.6 45 Q14.8 40.5 13.4 30 Z" fill="var(--tc)"/>
    <path d="M20 30 L26.6 30 Q25.2 40.5 23.4 45 L20 45 Z" fill="var(--tcd)" opacity=".34"/>
    <circle cx="20" cy="18.6" r="15.4" fill="#ffffff" stroke="rgba(0,0,0,.16)" stroke-width="1"/>
    <circle cx="20" cy="18.6" r="12.9" fill="var(--tc)"/>
    <path d="M8.6 22.6 A12.9 12.9 0 0 0 31.4 22.6" fill="none"
          stroke="var(--tcd)" stroke-width="4.4" opacity=".42"/>
    <ellipse cx="15.4" cy="12.6" rx="5" ry="3.4" fill="#ffffff" opacity=".7"
             transform="rotate(-28 15.4 12.6)"/>
    <ellipse cx="24.4" cy="24.2" rx="2.6" ry="1.7" fill="#ffffff" opacity=".26"
             transform="rotate(-28 24.4 24.2)"/>
  </g>
</svg>`;

/* ========== POSITIONS ========== */
function cellFor(pid,pos,ti){
  if(pos === -1) return G.yards[pid].slots[S.tok===2 ? [0,3][ti] : ti];
  if(pos <= G.HOME0-1) return G.track[(G.start[pid]+pos) % G.TN];
  if(pos <= G.LAST-1)  return G.homes[pid][pos-G.HOME0];
  return {x:G.C, y:G.C};
}

function createTokens(){
  board.querySelectorAll('.token').forEach(t=>t.remove());
  S.players.forEach(pl=>pl.tokens.forEach((_,ti)=>{
    const t=document.createElement('div');
    t.className='token'; t.dataset.p=pl.id; t.dataset.t=ti;
    t.style.setProperty('--tc',  `var(${CVAR[pl.id]})`);
    t.style.setProperty('--tcl', `var(${CVAR[pl.id]}l)`);
    t.style.setProperty('--tcd', `var(${CVAR[pl.id]}d)`);
    t.innerHTML = GOTI_SVG;
    t.onclick=()=>onTokenTap(pl.id,ti);
    board.appendChild(t);
  }));
}

function hop(pid,ti){
  const n=board.querySelector(`.token[data-p="${pid}"][data-t="${ti}"] .pawn`);
  if(!n) return;
  n.classList.remove('hop'); void n.offsetWidth; n.classList.add('hop');
}

function clearTargets(){ board.querySelectorAll('.target').forEach(t=>t.remove()); }

function showTargets(p,moves){
  clearTargets();
  moves.forEach(ti=>{
    const np = p.tokens[ti]===-1 ? 0 : p.tokens[ti]+S.dice;
    const c = cellFor(p.id,np,ti);
    const d = document.createElement('div');
    d.className='target';
    d.style.borderColor=`var(${CVAR[p.id]}l)`;
    at(d,c,1.15);
    board.appendChild(d);
  });
}

function renderTokens(){
  const W = board.clientWidth || 1;
  const unit = W / G.total;
  const occ = {};
  S.players.forEach(pl=>pl.tokens.forEach((pos,ti)=>{
    const c = cellFor(pl.id,pos,ti);
    const key = c.x.toFixed(2)+'_'+c.y.toFixed(2);
    (occ[key] = occ[key] || []).push({pl,ti,c});
  }));

  Object.values(occ).forEach(list=>{
    const many = list.length>1;
    const w = (many?0.70:0.84) * unit, h = w*1.35;
    list.forEach((o,k)=>{
      const ang = (k/list.length)*Math.PI*2 - Math.PI/2;
      const off = many ? 0.3*unit : 0;
      const cx = o.c.x*unit + Math.cos(ang)*off;
      const cy = o.c.y*unit + Math.sin(ang)*off;
      const n = board.querySelector(`.token[data-p="${o.pl.id}"][data-t="${o.ti}"]`);
      if(!n) return;
      n.style.width=w+'px'; n.style.height=h+'px';
      n.style.zIndex = 20 + Math.round(cy/W*100);
      n.style.transform = `translate(${cx-w/2}px,${cy-h*0.86}px) translateZ(7px) rotateX(${tilt?-16:0}deg)`;
    });
  });

  S.players.forEach((pl,i)=>{
    pl.done = pl.tokens.filter(p=>p===G.LAST).length;
    const e=el('sc'+i); if(e) e.textContent = pl.done+'/'+S.tok;
  });
}

/* ========== GAME SETUP ========== */
function tokenCount(count,len){
  if(len==='quick') return 2;
  return count>=5 ? 3 : 4;       // the hex lap is longer, so five/six players run 3 tokens
}

function newGame(count,mode,myName,len,names){
  G = buildGeom(count>=5 ? 6 : 4);
  const seats = SEATS[count];
  const tok = tokenCount(count,len);
  S = {
    turnAt:0, dice:0, rolled:false, sixes:0, over:false, ranks:0, tok,
    players: seats.map((p,i)=>({
      id:p,
      name: names ? (names[i] || 'Player '+(i+1))
                  : (i===0 ? myName : (mode==='cpu' ? CNAME[p]+' Bot' : 'Player '+(i+1))),
      cpu: mode==='cpu' && i>0,
      tokens:new Array(tok).fill(-1), done:0, rank:0
    }))
  };
  show('game');
  drawBoard(); buildPlayerCards(); createTokens();
  fitBoard();
  requestAnimationFrame(()=>{ fitBoard(); renderTokens(); });
  setTimeout(startTurn,600);
}

function buildPlayerCards(){
  const wrap=el('players');
  wrap.style.gridTemplateColumns = `repeat(${S.players.length>4?3:S.players.length}, 1fr)`;
  wrap.innerHTML='';
  S.players.forEach((pl,i)=>{
    const d=document.createElement('div');
    d.className='pcard'; d.id='pc'+i;
    d.innerHTML=`<div class="dot" style="background:linear-gradient(150deg,var(${CVAR[pl.id]}l),var(${CVAR[pl.id]}d))"></div>
      <div class="nm">${AVATAR[pl.id]} ${esc(pl.name)}</div>
      <div class="sc" id="sc${i}">0/${S.tok}</div>
      <div class="timer" id="tm${i}"></div>`;
    wrap.appendChild(d);
  });
}
const esc = s => String(s).replace(/[<>&]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;'}[c]));

/* ========== TURN FLOW ========== */
const cur = () => S.players[S.turnAt];

// every seat that is not the computer belongs to somebody sitting right here
function myTurn(){
  if(!S || S.over) return false;
  return !cur().cpu;
}

function startTurn(){
  if(S.over) return;
  S.rolled=false; S.dice=0;
  updateTurnUI(); highlight([]);
  el('rollBtn').disabled = !myTurn();
  document.querySelector('.dice-stage').classList.toggle('ready', myTurn());
  startTimer();
  if(cur().cpu) setTimeout(rollDice,750);
}

function updateTurnUI(msg){
  const p=cur();
  S.players.forEach((_,i)=>el('pc'+i).classList.toggle('turn', i===S.turnAt));
  board.querySelectorAll('.yardbox').forEach(y=>y.classList.toggle('lit', +y.dataset.a===p.id));
  el('turnWho').textContent = p.cpu ? p.name+' is playing' : p.name+"'s turn";
  el('turnWho').style.color = `var(${CVAR[p.id]}l)`;
  el('turnHint').textContent = msg || (p.cpu ? 'Thinking…' : 'Tap ROLL');
}

let timerId=null;
function startTimer(){
  clearInterval(timerId);
  S.players.forEach((_,i)=>{const b=el('tm'+i); if(b) b.style.width='0%';});
  if(cur().cpu) return;
  const bar=el('tm'+S.turnAt); let t=0; const LIMIT=18000;
  timerId=setInterval(()=>{
    t+=100; bar.style.width=(t/LIMIT*100)+'%';
    if(t>=LIMIT){ clearInterval(timerId); autoPlay(); }
  },100);
}
function stopTimer(){ clearInterval(timerId); const b=el('tm'+S.turnAt); if(b) b.style.width='0%'; }

function autoPlay(){
  if(busy||S.over) return;
  if(!S.rolled) rollDice();
  else { const m=legalMoves(cur(),S.dice); if(m.length) doMove(cur(),m[0]); }
}

/* base rotation that brings each face to the front, plus a small tilt so
   two neighbouring faces stay visible — that's what makes it read as a real cube */
/* a real die has opposite faces summing to 7, so the pips sit like this:
   front 1 / back 6, right 3 / left 4, top 5 / bottom 2 */
const FACE_PIPS = {1:1, 2:6, 3:3, 4:4, 5:5, 6:2};   // cube side -> pip count
const FACE_BASE = {1:[0,0], 6:[0,-180], 3:[0,-90], 4:[0,90], 5:[-90,0], 2:[90,0]};
const TILT = [-6, 8];    // almost dead-on: the number faces the player
let diceX = TILT[0], diceY = TILT[1], diceZ = 0;

function showFace(v,animate){
  const d = el('dice');
  const [bx,by] = FACE_BASE[v];
  if(animate){
    // always tumble forward from wherever the cube is now, several full turns per axis.
    // the Z spin is whole turns only, so it never changes which face ends up in front.
    const spinX = 360*(3+Math.floor(Math.random()*3));
    const spinY = 360*(4+Math.floor(Math.random()*3));
    diceZ += 360*(1+Math.floor(Math.random()*2));
    diceX = Math.ceil((diceX - TILT[0])/360)*360 + spinX + bx + TILT[0];
    diceY = Math.ceil((diceY - TILT[1])/360)*360 + spinY + by + TILT[1];
    d.style.transition = 'transform 1.25s cubic-bezier(.17,.72,.14,1)';
  } else {
    diceX = bx + TILT[0]; diceY = by + TILT[1]; diceZ = 0;
    d.style.transition = 'none';
  }
  d.style.transform = `rotateX(${diceX}deg) rotateY(${diceY}deg) rotateZ(${diceZ}deg)`;
}

function rollDice(){
  if(S && S.over) return;
  if(busy||S.rolled) return;
  busy=true; stopTimer(); el('rollBtn').disabled=true;
  const st=document.querySelector('.dice-stage');
  st.classList.remove('ready');
  st.classList.remove('throw'); void st.offsetWidth; st.classList.add('throw');
  const v=1+Math.floor(Math.random()*6);
  showFace(v,true);
  sfx.roll();
  setTimeout(()=>sfx.land(), 980);
  setTimeout(()=>{
    st.classList.remove('throw');
    S.dice=v; S.rolled=true; busy=false; afterRoll(v);
  },1250);
}

function afterRoll(v){
  const p=cur();
  S.sixes = v===6 ? S.sixes+1 : 0;
  if(S.sixes===3){
    updateTurnUI('Three sixes — turn passes');
    beep(200,.3,'sawtooth',.14); S.sixes=0;
    setTimeout(nextTurn,900); return;
  }
  const moves=legalMoves(p,v);
  if(!moves.length){
    updateTurnUI(v===6?'No move available':'No move — next player');
    setTimeout(()=>{ v===6 ? sameSeat() : nextTurn(); },850);
    return;
  }
  if(p.cpu){ updateTurnUI('Rolled '+v); setTimeout(()=>doMove(p,pickCPU(p,moves,v)),620); return; }
  if(moves.length===1){ updateTurnUI('Rolled '+v); setTimeout(()=>doMove(p,moves[0]),380); return; }
  updateTurnUI('Rolled '+v+' — pick a token');
  highlight(moves.map(m=>[p.id,m]));
  showTargets(p,moves);
  startTimer();
}

function sameSeat(){
  S.rolled=false; S.dice=0;
  el('rollBtn').disabled = !myTurn();
  document.querySelector('.dice-stage').classList.toggle('ready', myTurn());
  updateTurnUI(cur().cpu?'Thinking…':'Roll again');
  startTimer();
  if(cur().cpu) setTimeout(rollDice,650);
}

// two of the same colour on one square form a wall nobody else may pass
function blockAt(idx,exceptPid){
  const n={};
  S.players.forEach(op=>{
    if(op.id===exceptPid) return;
    op.tokens.forEach(pos=>{
      if(pos>=0 && pos<=G.HOME0-1 && (G.start[op.id]+pos)%G.TN===idx) n[op.id]=(n[op.id]||0)+1;
    });
  });
  return Object.values(n).some(c=>c>=2);
}

function pathClear(p,from,v){
  const startPos = from===-1 ? 0 : from+1;
  const endPos   = from===-1 ? 0 : from+v;
  for(let np=startPos; np<=endPos; np++){
    if(np>G.HOME0-1) break;                       // home lane can't be blocked
    if(blockAt((G.start[p.id]+np)%G.TN, p.id)) return false;
  }
  return true;
}

function legalMoves(p,v){
  const out=[];
  p.tokens.forEach((pos,i)=>{
    if(pos===-1){ if(v===6 && pathClear(p,-1,v)) out.push(i); return; }
    if(pos===G.LAST) return;
    if(pos+v<=G.LAST && pathClear(p,pos,v)) out.push(i);
  });
  return out;
}

function highlight(list){
  board.querySelectorAll('.token').forEach(t=>t.classList.remove('can'));
  if(!list.length) clearTargets();
  list.forEach(([pid,ti])=>{
    const n=board.querySelector(`.token[data-p="${pid}"][data-t="${ti}"]`);
    if(n) n.classList.add('can');
  });
}

function onTokenTap(pid,ti){
  if(!S || S.over) return;
  const p=cur();
  if(p.id!==pid || !S.rolled || !myTurn()) return;
  if(!legalMoves(p,S.dice).includes(ti)) return;
  if(busy) return;
  doMove(p,ti);
}

async function doMove(p,ti){
  busy=true; stopTimer(); highlight([]); clearTargets();
  document.querySelector('.dice-stage').classList.remove('ready');
  const v=S.dice, from=p.tokens[ti];
  let extra = v===6;

  if(from===-1){
    p.tokens[ti]=0; renderTokens(); hop(p.id,ti); sfx.step(); await wait(240);
  } else {
    for(let s=1;s<=v;s++){
      p.tokens[ti]=from+s;
      renderTokens(); hop(p.id,ti); sfx.step();
      await wait(140);
    }
    const np=p.tokens[ti];
    if(np <= G.HOME0-1){
      const idx=(G.start[p.id]+np) % G.TN;
      if(!G.safe.has(idx)){
        const hitNodes=[];
        S.players.forEach(op=>{
          if(op.id===p.id) return;
          op.tokens.forEach((opos,oi)=>{
            if(opos>=0 && opos<=G.HOME0-1 && (G.start[op.id]+opos)%G.TN===idx){
              op.tokens[oi]=-1;
              const n=board.querySelector(`.token[data-p="${op.id}"][data-t="${oi}"]`);
              if(n){ n.classList.add('fly'); hitNodes.push(n); }
            }
          });
        });
        if(hitNodes.length){
          sfx.cut(); extra=true; updateTurnUI('Captured!');
          renderTokens(); await wait(560);
          hitNodes.forEach(n=>n.classList.remove('fly'));
        }
      }
    }
    if(np===G.LAST){ sfx.home(); extra=true; updateTurnUI('Token home!'); await wait(360); }
  }

  renderTokens();

  // did this player just bring everybody home?
  if(p.tokens.every(t=>t===G.LAST)){
    p.rank = ++S.ranks;
    const left = S.players.filter(x=>!x.rank);
    const meDone = S.players[0].rank;
    if(meDone || left.length<=1){
      if(left.length===1) left[0].rank = ++S.ranks;
      paintCards();
      return finish();
    }
    toast(`${p.name} finished — place #${p.rank}`);
    paintCards();
    busy=false; S.sixes=0; nextTurn(); return;
  }

  busy=false;
  if(extra) sameSeat(); else { S.sixes=0; nextTurn(); }
}

function paintCards(){
  S.players.forEach((pl,i)=>{
    const c=el('pc'+i); if(!c) return;
    c.classList.toggle('done', !!pl.rank);
    let r=c.querySelector('.rank');
    if(pl.rank){
      if(!r){ r=document.createElement('div'); r.className='rank'; c.appendChild(r); }
      r.textContent='#'+pl.rank;
    } else if(r) r.remove();
  });
}

function nextTurn(){
  S.sixes=0;
  let n=S.turnAt, guard=0;
  do{ n=(n+1)%S.players.length; guard++; } while(S.players[n].rank && guard<12);
  S.turnAt=n; startTurn();
}

/* ========== CPU ========== */
function pickCPU(p,moves,v){
  let best=moves[0], top=-1e9;
  moves.forEach(ti=>{
    const pos=p.tokens[ti];
    const np = pos===-1 ? 0 : pos+v;
    let sc = 0;
    if(pos===-1) sc+=55;
    if(np===G.LAST) sc+=130;
    else if(np>G.HOME0-1) sc+=50+np*0.4;
    else{
      const cell=(G.start[p.id]+np)%G.TN;
      S.players.forEach(op=>{
        if(op.id===p.id) return;
        op.tokens.forEach(opos=>{
          if(opos>=0 && opos<=G.HOME0-1 && (G.start[op.id]+opos)%G.TN===cell && !G.safe.has(cell)) sc+=95;
        });
      });
      if(G.safe.has(cell)) sc+=22;
      else S.players.forEach(op=>{
        if(op.id===p.id) return;
        op.tokens.forEach(opos=>{
          if(opos<0||opos>G.HOME0-1) return;
          const gap=(cell-(G.start[op.id]+opos)%G.TN+G.TN)%G.TN;
          if(gap>=1&&gap<=6) sc-=26;
        });
      });
      sc += np*0.3;
    }
    if(sc>top){ top=sc; best=ti; }
  });
  return best;
}

/* ========== END ========== */
const ORD=['','1st','2nd','3rd','4th','5th','6th'];

async function finish(){
  S.over=true; busy=false; stopTimer(); highlight([]); clearTargets();
  const me = S.players[0];
  const won = me.rank===1;
  if(won) confetti();
  sfx.win();

  el('resEmoji').textContent = won ? '🏆' : me.rank===2 ? '🥈' : me.rank===3 ? '🥉' : '🎲';
  el('resName').textContent  = won ? 'You win!' : me.rank ? `You finished ${ORD[me.rank]}` : 'Game over';

  const got = await reward(won);
  el('resSub').textContent = won
    ? `+${got} coins and +60 XP`
    : `+${got} coins for playing`;

  const rows = [...S.players].sort((a,b)=>(a.rank||99)-(b.rank||99));
  el('resList').innerHTML = rows.map(pl=>`
    <div class="strow ${pl.rank===1?'gold':''}">
      <div class="rk">${pl.rank?'#'+pl.rank:'–'}</div>
      <div class="sd" style="background:var(${CVAR[pl.id]})"></div>
      <div class="sn">${esc(pl.name)}${pl===me?' (you)':''}</div>
      <div class="st">${pl.tokens.filter(t=>t===G.LAST).length}/${S.tok} home</div>
    </div>`).join('');

  setTimeout(()=>el('resultModal').classList.add('show'),700);
}

function confetti(){
  const box=document.createElement('div'); box.className='confetti';
  const cols=['#e23b3b','#1fa14a','#f2b616','#2c72d8','#9b4fd8','#f2712c','#fff'];
  for(let i=0;i<70;i++){
    const c=document.createElement('div'); c.className='cf';
    c.style.left=Math.random()*100+'%';
    c.style.top=(-15-Math.random()*40)+'px';
    c.style.background=cols[i%cols.length];
    c.style.animationDuration=(2.2+Math.random()*1.8)+'s';
    c.style.animationDelay=(Math.random()*.7)+'s';
    box.appendChild(c);
  }
  document.body.appendChild(box);
  setTimeout(()=>box.remove(),5200);
}

/* ========== ACCOUNT ========== */
const AVAS=['🦊','🐢','🐤','🐬','🐼','🦁','🐸','🐙','🐝','🦉','🐳','🦄'];
const KEY='ludotime:profile';
let PROFILE=null, memStore={}, pendingProvider='guest', pickedAva=AVAS[0];

// tries real browser storage first, then the sandbox store, then memory
const store={
  async get(k){
    try{ const v=localStorage.getItem(k); if(v!==null) return JSON.parse(v); }catch(e){}
    try{ const r=await window.storage.get(k); if(r) return JSON.parse(r.value); }catch(e){}
    return memStore[k]||null;
  },
  async set(k,v){
    const j=JSON.stringify(v);
    try{ localStorage.setItem(k,j); return; }catch(e){}
    try{ await window.storage.set(k,j); return; }catch(e){}
    memStore[k]=v;
  },
  async del(k){
    try{ localStorage.removeItem(k); }catch(e){}
    try{ await window.storage.delete(k); }catch(e){}
    delete memStore[k];
  }
};
const show = id => document.querySelectorAll('.screen').forEach(s=>s.classList.toggle('active',s.id===id));
function toast(msg){
  document.querySelectorAll('.toast').forEach(t=>t.remove());
  const t=document.createElement('div'); t.className='toast'; t.textContent=msg;
  document.body.appendChild(t); setTimeout(()=>t.remove(),2800);
}
const levelOf = xp => 1+Math.floor(xp/120);

/* The browser's own confirm box wears the page address like a warning label and freezes
   everything behind it — a strange thing to walk into in the middle of a match. This one
   is part of the game, so leaving a match feels like leaving a match. */
function ask(title, text, yes='Yes', no='Cancel', emoji='🎲'){
  return new Promise(done=>{
    el('askEmoji').textContent = emoji;
    el('askTitle').textContent = title;
    el('askText').textContent  = text || '';
    el('askYes').textContent   = yes;
    el('askNo').textContent    = no;

    const box = el('askModal');
    const answer = said => {
      box.classList.remove('show');
      el('askYes').onclick = el('askNo').onclick = null;
      document.removeEventListener('keydown', onKey);
      done(said);
    };
    // Escape means no, the same as it does everywhere else
    const onKey = e => { if(e.key==='Escape') answer(false); };

    el('askYes').onclick = ()=>answer(true);
    el('askNo').onclick  = ()=>answer(false);
    document.addEventListener('keydown', onKey);
    box.classList.add('show');
  });
}

function paintProfile(){
  if(!PROFILE) return;
  el('profPic').textContent=PROFILE.avatar;
  el('profName').textContent=PROFILE.name;
  // how they got here: Google, a username on the server, or nobody at all
  const how = PROFILE.provider==='google' ? 'Google' : TOKEN ? 'Account' : 'Guest';
  el('profLv').textContent=`Level ${levelOf(PROFILE.xp)} \u00b7 ${PROFILE.won}W / ${PROFILE.played} \u00b7 ${how}`;

  el('profXp').style.width=((PROFILE.xp%120)/120*100)+'%';
  el('profCoins').textContent=PROFILE.coins;
  el('linkGoogleBtn').style.display = PROFILE.provider==='google' ? 'none' : '';
  // only a guest is offered an account; a signed-in player already has one
  el('acctLinkBtn').style.display   = (TOKEN || !onWeb) ? 'none' : '';
}
async function saveProfile(){ await store.set(KEY,PROFILE); paintProfile(); syncUp(); }

(function buildAvatars(){
  const g=el('avaGrid');
  AVAS.forEach((a,i)=>{
    const b=document.createElement('button');
    b.className='ava'+(i===0?' on':''); b.textContent=a;
    b.onclick=()=>{ g.querySelectorAll('.ava').forEach(x=>x.classList.remove('on')); b.classList.add('on'); pickedAva=a; };
    g.appendChild(b);
  });
})();

/* ========== ACCOUNT ON THE SERVER ==========
   All of this is optional. A signed-in player finds their coins and level waiting on any
   phone; a guest carries on exactly as before, saving to this device alone. Opened
   straight off the disk there is no server to reach, and the buttons say so rather than
   spinning forever. */

const TOKEN_KEY = 'ludotime:token';
const onWeb = location.protocol==='http:' || location.protocol==='https:';
let TOKEN = null, acctMode = 'login';

async function api(path, method='GET', body){
  if(!onWeb) throw new Error('Open the game from a web address to use an account.');
  const headers = {};
  if(body)  headers['content-type'] = 'application/json';
  if(TOKEN) headers.authorization   = 'Bearer '+TOKEN;

  let res;
  try{ res = await fetch(path, {method, headers, body: body ? JSON.stringify(body) : undefined}); }
  catch(e){ throw new Error('Could not reach the server.'); }

  const data = await res.json().catch(()=>({}));
  if(res.status===401 && TOKEN){ TOKEN=null; store.del(TOKEN_KEY); }
  if(!res.ok) throw new Error(data.error || 'Something went wrong.');
  return data;
}

// pushing is fire-and-forget: a save lost to a dropped signal rides along with the next one
function syncUp(){
  if(!TOKEN || !PROFILE) return;
  api('/api/profile','PUT',{profile:PROFILE}).catch(()=>{});
}

const acctSay = msg => el('acctMsg').textContent = msg;

function paintAccount(){
  const making = acctMode==='register';
  el('acctTitleA').textContent  = making ? 'NEW' : 'YOUR';
  el('acctTitleB').textContent  = making ? 'PLAYER' : 'ACCOUNT';
  el('acctGoBtn').textContent   = making ? 'CREATE ACCOUNT' : 'SIGN IN';
  el('acctSwapBtn').textContent = making ? 'I already have an account' : 'Create an account instead';
  el('acctPass').autocomplete   = making ? 'new-password' : 'current-password';
  acctSay(making ? 'Pick a name and password you will remember — there is no email to reset them with.'
                 : 'Your coins and level follow this account onto any phone.');
}

function openAccount(mode='login'){
  acctMode=mode; paintAccount();
  el('acctName').value=''; el('acctPass').value='';
  show('account'); setTimeout(()=>el('acctName').focus(),120);
}

const needsWeb = () => {
  if(onWeb) return false;
  toast('Accounts need the game on a web address, not a file.');
  return true;
};

el('acctBtn').onclick      = ()=>{ if(!needsWeb()) openAccount('login'); };
// a guest who never signed in can still put what they have somewhere safe
el('acctLinkBtn').onclick  = ()=>{ if(!needsWeb()) openAccount('register'); };

// Opened straight off the disk both of these lead nowhere, and a button that answers a tap
// with a message that fades reads as a broken button. Say it on the face instead.
if(!onWeb){
  for(const [id, why] of [['googleBtn','Google needs the game online'],
                          ['acctBtn'  ,'Accounts need the game online']]){
    const b = el(id);
    b.style.opacity = '.4';
    b.querySelector('.lbl').textContent = why;
  }
}
el('acctBackBtn').onclick  = ()=>show('auth');
el('acctSwapBtn').onclick  = ()=>{ acctMode = acctMode==='register' ? 'login' : 'register'; paintAccount(); };
el('acctPass').onkeydown   = e=>{ if(e.key==='Enter') el('acctGoBtn').click(); };
el('acctName').onkeydown   = e=>{ if(e.key==='Enter') el('acctPass').focus(); };

el('acctGoBtn').onclick = async()=>{
  const username = el('acctName').value.trim();
  const password = el('acctPass').value;
  const btn = el('acctGoBtn'), was = btn.textContent;

  btn.disabled = true; btn.textContent = 'Please wait…';
  try{
    const r = await api(acctMode==='register' ? '/api/register' : '/api/login', 'POST', {username, password});
    TOKEN = r.token;
    await store.set(TOKEN_KEY, TOKEN);

    if(r.profile){                       // this account has been played before
      PROFILE = r.profile;
      await store.set(KEY, PROFILE);
      applyProfileSettings(); paintProfile(); show('home');
      toast('Welcome back, '+PROFILE.name);
    }else if(PROFILE){                   // guest progress on this device joins the new account
      await saveProfile();
      applyProfileSettings(); show('home');
      toast('Signed in — this device’s progress came with you');
    }else{                               // brand new, so pick a name and a face
      pendingProvider='account'; googleAccount=null;
      openSetup(false);
      el('setupName').value = username.slice(0,12);
    }
  }catch(e){
    acctSay(e.message);
  }finally{
    btn.disabled = false; btn.textContent = was;
  }
};

/* ========== GOOGLE SIGN-IN ==========
   Paste the OAuth client ID from the Google Cloud console between the quotes. Google
   only answers pages served over http://localhost or https:// whose origin is listed as
   an authorised JavaScript origin — a page opened straight off the disk (file://) is
   turned away, so the button says so instead of pretending to work. */
const GOOGLE_CLIENT_ID = '';

let googleAccount = null, googleBusy = false;

function googleBlocker(){
  if(!GOOGLE_CLIENT_ID) return 'Google sign-in is not set up yet — see the README. Play as guest meanwhile.';
  if(location.protocol!=='http:' && location.protocol!=='https:')
    return 'Google needs the game on a web address, not a file opened from the disk.';
  if(!(window.google && google.accounts && google.accounts.oauth2))
    return 'Could not reach Google — check the connection, or play as guest.';
  return null;
}

// opens Google's account chooser and hands back the picked account, or throws
function googleSignIn(){
  return new Promise((resolve,reject)=>{
    google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: 'openid email profile',
      callback: async r=>{
        if(r.error){ reject(new Error(r.error)); return; }
        try{
          const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo',
            { headers:{ Authorization:'Bearer '+r.access_token } });
          if(!res.ok) throw new Error('userinfo '+res.status);
          resolve(await res.json());
        }catch(e){ reject(e); }
      },
      error_callback: e=>reject(new Error(e && e.type ? e.type : 'cancelled'))
    }).requestAccessToken({ prompt:'select_account' });
  });
}

// keeps the button honest while the popup is open
async function withGoogleButton(btn, run){
  if(googleBusy) return;
  const blocked = googleBlocker();
  if(blocked){ toast(blocked); return; }
  const lbl = btn.querySelector('.lbl') || btn, was = lbl.textContent;
  googleBusy = true; btn.disabled = true; lbl.textContent = 'Waiting for Google…';
  try{ await run(); }
  catch(e){
    toast(/cancel|closed|denied/i.test(e.message) ? 'Sign-in cancelled'
                                                  : 'Google sign-in failed — try again, or play as guest');
  }
  finally{ googleBusy = false; btn.disabled = false; lbl.textContent = was; }
}

el('guestBtn').onclick=()=>{ pendingProvider='guest'; googleAccount=null; openSetup(false); };
el('googleBtn').onclick=()=>withGoogleButton(el('googleBtn'), async()=>{
  const acc = await googleSignIn();
  googleAccount = acc;
  pendingProvider = 'google';
  openSetup(false);
  // the name box starts on the Google first name, so most players just tap save
  el('setupName').value = (acc.given_name || acc.name || '').trim().slice(0,12);
});
function openSetup(prefill){
  el('setupName').value = prefill ? PROFILE.name : '';
  if(prefill){
    pickedAva=PROFILE.avatar;
    el('avaGrid').querySelectorAll('.ava').forEach(b=>b.classList.toggle('on', b.textContent===PROFILE.avatar));
  }
  show('setup'); setTimeout(()=>el('setupName').focus(),120);
}
el('saveProfBtn').onclick=async()=>{
  const n=el('setupName').value.trim().slice(0,12);
  if(n.length<2){ toast('Enter a name with at least 2 characters'); return; }
  if(PROFILE){ PROFILE.name=n; PROFILE.avatar=pickedAva; }
  else PROFILE={name:n,avatar:pickedAva,provider:pendingProvider,coins:500,xp:0,played:0,won:0,
    theme:'classic',owned:['classic'],music:'mellow',vol:70,since:Date.now(),
    email: googleAccount ? googleAccount.email : null,
    googleId: googleAccount ? googleAccount.sub : null};
  await saveProfile(); applyProfileSettings(); show('home');
};
el('editProfBtn').onclick=()=>openSetup(true);
el('linkGoogleBtn').onclick=()=>withGoogleButton(el('linkGoogleBtn'), async()=>{
  const acc = await googleSignIn();
  googleAccount = acc;
  PROFILE.provider = 'google';
  PROFILE.email    = acc.email || null;
  PROFILE.googleId = acc.sub   || null;
  await saveProfile();
  toast('Linked as ' + (acc.email || acc.name));
});
el('signOutBtn').onclick=async()=>{
  const signedIn = !!TOKEN;
  const okay = await ask('Sign out?',
    signedIn ? 'Your coins and level stay safe — sign back in any time to pick them up.'
             : 'You are playing as a guest, so the coins and level on this device go with it.',
    'Sign out', 'Stay', signedIn ? '👋' : '⚠️');
  if(!okay) return;
  if(signedIn){
    syncUp();                                   // one last push before we let go of the token
    api('/api/logout','POST').catch(()=>{});
    TOKEN=null; await store.del(TOKEN_KEY);
  }
  await store.del(KEY); PROFILE=null; memStore={}; googleAccount=null; show('auth');
};
async function reward(won){
  if(!PROFILE) return won?120:25;
  PROFILE.played++; PROFILE.coins += won?120:25; PROFILE.xp += won?60:20;
  if(won) PROFILE.won++;
  await saveProfile();
  return won?120:25;
}

/* ========== THEMES ========== */
const THEMES = [
  { id:'classic', name:'Classic Felt', price:0, swatch:'#0e4d3f', chip:'#fbf6e9',
    v:{'--g0':'rgba(210,31,38,.52)','--g1':'rgba(13,143,66,.52)','--g2':'rgba(232,169,0,.44)','--g3':'rgba(15,99,196,.54)','--base1':'#122a3e','--base2':'#050a12',
       '--plate1':'#fdfaf0','--board-cream':'#fbf6e9','--plate2':'#efe6cf',
       '--frame-1':'#3a2a1c','--frame-2':'#5c4227','--line':'#d9cfb4',
       '--cell':'#ffffff','--mark':'#8fa0ad','--line':'#a3b0ba','--edge':'#2d4a3e','--gold':'#f5c451'} },

  { id:'velvet', name:'Royal Velvet', price:600, swatch:'#4a1d5e', chip:'#f7efdc',
    v:{'--g0':'rgba(214,44,96,.52)','--g1':'rgba(120,60,200,.52)','--g2':'rgba(232,183,66,.42)','--g3':'rgba(70,54,180,.5)','--base1':'#241033','--base2':'#0e0518',
       '--plate1':'#fdf6e6','--board-cream':'#f7efdc','--plate2':'#e9dcc0',
       '--frame-1':'#6b5210','--frame-2':'#c9a227','--line':'#d8c9a5',
       '--cell':'#fffaf2','--mark':'#a8977a','--line':'#c9bda6','--edge':'#4a2d5e','--gold':'#ffd979'} },

  { id:'beach', name:'Sunset Beach', price:900, swatch:'#1fb2c9', chip:'#fff6e4',
    v:{'--g0':'rgba(255,120,80,.5)','--g1':'rgba(30,190,170,.5)','--g2':'rgba(255,190,80,.5)','--g3':'rgba(40,140,210,.52)','--base1':'#0d3d52','--base2':'#04212e',
       '--plate1':'#fffaef','--board-cream':'#fff2dc','--plate2':'#f4e2c0',
       '--frame-1':'#8c5a25','--frame-2':'#d9a05b','--line':'#e3cca0',
       '--cell':'#fffdf7','--mark':'#bda37f','--line':'#d3c3a6','--edge':'#8c5a25','--gold':'#ffca5e'} },

  { id:'neon', name:'Midnight Neon', price:1200, swatch:'#0d1020', chip:'#232840',
    v:{'--g0':'rgba(255,40,120,.42)','--g1':'rgba(40,240,180,.38)','--g2':'rgba(240,220,60,.3)','--g3':'rgba(45,225,255,.42)','--base1':'#0a0d1a','--base2':'#03040a',
       '--plate1':'#1e2438','--board-cream':'#191e30','--plate2':'#131728',
       '--frame-1':'#0a4a63','--frame-2':'#2de1ff','--line':'#39456b',
       '--cell':'#1c2238','--mark':'#6f80ad','--line':'#3d4a70','--edge':'#2de1ff','--gold':'#2de1ff'} },

  { id:'forest', name:'Emerald Forest', price:1500, swatch:'#1e7a4a', chip:'#f4f7e8',
    v:{'--g0':'rgba(190,70,50,.44)','--g1':'rgba(40,180,90,.55)','--g2':'rgba(210,190,70,.42)','--g3':'rgba(30,120,110,.48)','--base1':'#0c3324','--base2':'#04180f',
       '--plate1':'#f9fbee','--board-cream':'#f2f6e4','--plate2':'#e3e9cd',
       '--frame-1':'#33240f','--frame-2':'#6b4a2a','--line':'#c8d3ac',
       '--cell':'#fdfff5','--mark':'#9aa87a','--line':'#c2ceaa','--edge':'#1d4a2c','--gold':'#ffd166'} },

  { id:'marble', name:'Marble Gold', price:2000, swatch:'#2b2a27', chip:'#ffffff',
    v:{'--g0':'rgba(190,60,60,.34)','--g1':'rgba(60,150,90,.32)','--g2':'rgba(226,189,82,.44)','--g3':'rgba(70,110,180,.34)','--base1':'#2a2823','--base2':'#100f0d',
       '--plate1':'#ffffff','--board-cream':'#f6f4ef','--plate2':'#e6e1d6',
       '--frame-1':'#7a5f10','--frame-2':'#e2bd52','--line':'#d5cec0',
       '--cell':'#ffffff','--mark':'#b0a794','--line':'#cec7b8','--edge':'#7a5f10','--gold':'#e2bd52'} }
];

function applyTheme(id){
  const t = THEMES.find(x=>x.id===id) || THEMES[0];
  Object.entries(t.v).forEach(([k,val])=>document.documentElement.style.setProperty(k,val));
}

function renderShop(){
  const g=el('shopGrid'); g.innerHTML='';
  el('shopCoins').textContent = PROFILE.coins;
  THEMES.forEach(t=>{
    const owned = PROFILE.owned.includes(t.id);
    const active = PROFILE.theme===t.id;
    const b=document.createElement('button');
    b.className='tcard'+(active?' on':'');
    b.innerHTML=`
      <div class="prev" style="background:
          radial-gradient(70% 80% at 12% 10%, ${t.v['--g0']}, transparent 72%),
          radial-gradient(70% 80% at 88% 10%, ${t.v['--g1']}, transparent 72%),
          radial-gradient(70% 80% at 88% 90%, ${t.v['--g2']}, transparent 72%),
          radial-gradient(70% 80% at 12% 90%, ${t.v['--g3']}, transparent 72%),
          linear-gradient(150deg, ${t.v['--base1']}, ${t.v['--base2']})">
        <b style="background:${t.chip};box-shadow:0 0 0 3px ${t.v['--frame-2']}"></b>
      </div>
      <div class="meta">
        <div class="tn">${t.name}</div>
        <div class="tp ${owned?'own':''}">${active?'Selected':owned?'Owned · tap to use':'🪙 '+t.price}</div>
      </div>`;
    b.onclick=()=>buyOrUse(t);
    g.appendChild(b);
  });
}

async function buyOrUse(t){
  if(!PROFILE.owned.includes(t.id)){
    if(PROFILE.coins < t.price){ toast(`Need ${t.price - PROFILE.coins} more coins — watch an ad to earn some`); return; }
    PROFILE.coins -= t.price;
    PROFILE.owned.push(t.id);
    toast(`${t.name} unlocked`);
    beep(880,.18,'triangle',.14);
  }
  PROFILE.theme = t.id;
  applyTheme(t.id);
  await saveProfile();
  renderShop();
}

/* ========== MUSIC ========== */
const music = {
  ctx:null, gain:null, timer:null, step:0, style:'off', vol:0.7, noise:null,

  ensure(){
    if(this.ctx) return;
    this.ctx = AC = AC || new (window.AudioContext||window.webkitAudioContext)();
    this.gain = this.ctx.createGain();
    this.gain.gain.value = this.vol*0.95;
    const lim = this.ctx.createDynamicsCompressor();
    lim.threshold.value = -8; lim.knee.value = 6; lim.ratio.value = 12;
    lim.attack.value = 0.004; lim.release.value = 0.18;
    this.gain.connect(lim); lim.connect(this.ctx.destination);
    const len = this.ctx.sampleRate*1;
    this.noise = this.ctx.createBuffer(1,len,this.ctx.sampleRate);
    const d=this.noise.getChannelData(0);
    for(let i=0;i<len;i++) d[i]=Math.random()*2-1;
  },

  setVolume(v){ this.vol=v; if(this.gain) this.gain.gain.value=v*0.95; },

  play(style){
    this.stop();
    this.style=style;
    if(style==='off') return;
    this.ensure();
    if(this.ctx.state==='suspended') this.ctx.resume();
    this.step=0;
    const bpm = style==='phonk'?140 : style==='bhangra'?104 : 72;
    const stepMs = 60000/bpm/4;
    this.timer = setInterval(()=>{ this.tick(this.step++); }, stepMs);
  },

  stop(){ clearInterval(this.timer); this.timer=null; },

  tone(freq,dur,type,vol,slideTo){
    const c=this.ctx, t=c.currentTime;
    const o=c.createOscillator(), g=c.createGain();
    o.type=type; o.frequency.setValueAtTime(freq,t);
    if(slideTo) o.frequency.exponentialRampToValueAtTime(slideTo,t+dur);
    g.gain.setValueAtTime(0,t);
    g.gain.linearRampToValueAtTime(vol,t+0.012);
    g.gain.exponentialRampToValueAtTime(0.0008,t+dur);
    o.connect(g); g.connect(this.gain); o.start(t); o.stop(t+dur+0.02);
  },

  hit(dur,vol,hz,q){
    const c=this.ctx, t=c.currentTime;
    const s=c.createBufferSource(); s.buffer=this.noise;
    const f=c.createBiquadFilter(); f.type='bandpass'; f.frequency.value=hz; f.Q.value=q||1;
    const g=c.createGain();
    g.gain.setValueAtTime(vol,t);
    g.gain.exponentialRampToValueAtTime(0.0008,t+dur);
    s.connect(f); f.connect(g); g.connect(this.gain); s.start(t); s.stop(t+dur);
  },

  tick(n){
    const s=n%64, bar=Math.floor(n/16)%4;
    if(this.style==='mellow'){
      // slow minor-seventh pads with a sparse bell melody
      const roots=[220,196,174.61,164.81];           // A3 G3 F3 E3
      const r=roots[bar];
      if(s%16===0){
        [1,1.2,1.5,1.78].forEach((m,i)=>setTimeout(()=>this.tone(r*m,3.4,'sine',0.07),i*40));
        this.tone(r/2,3.6,'triangle',0.06);
      }
      const mel=[0,null,3,null,null,7,null,null,5,null,null,null,3,null,null,null];
      const st=mel[s%16];
      if(st!==null && st!==undefined && Math.random()>0.35)
        this.tone(r*2*Math.pow(2,st/12),1.5,'sine',0.055);
    }

    if(this.style==='phonk'){
      // half-time trap: 808 slides, cowbell hook, tight hats
      if(s%16===0||s%16===9) this.tone(70,0.5,'sine',0.32,40);          // kick
      if(s%16===8||s%16===14) this.hit(0.14,0.16,2600,1.2);             // snare-ish
      if(s%2===0) this.hit(0.035,0.075,8200,2.4);                       // hat
      if(s%16===4||s%16===12) this.hit(0.02,0.05,11000,3);              // open-ish
      const bass=[55,55,49,41.2][bar];
      if(s%16===0) this.tone(bass,1.5,'sine',0.3,bass*0.72);            // 808 slide
      const bell=[0,null,null,7,null,10,null,null,7,null,null,3,null,null,null,null];
      const b=bell[s%16];
      if(b!==null&&b!==undefined) this.tone(523.25*Math.pow(2,b/12),0.28,'square',0.075);
    }

    if(this.style==='bhangra'){
      // dhol-style groove with a plucked tumbi-like riff
      if(s%8===0) this.tone(88,0.28,'sine',0.26,58);                    // dhol bass
      if([3,6,11,14].includes(s%16)) this.hit(0.09,0.2,1900,1.6);       // tak
      if(s%4===2) this.hit(0.05,0.1,5200,2);                            // chimta
      const riff=[0,7,0,5,0,7,10,7,0,7,0,5,3,0,null,null];
      const k=riff[s%16];
      if(k!==null&&k!==undefined) this.tone(293.66*Math.pow(2,k/12),0.22,'sawtooth',0.075);
      if(s%16===0) this.tone(146.83,1.2,'triangle',0.08);
    }
  }
};

function setMusic(style){
  PROFILE.music = style;
  document.querySelectorAll('#segMusic button').forEach(b=>b.classList.toggle('on', b.dataset.v===style));
  el('musicHint').textContent = style==='off'
    ? 'Music is off. Sound effects stay on their own switch.'
    : 'Original loop generated live in the app — nothing streamed, nothing licensed.';
  music.play(style);
  saveProfile();
}

// leaving the app should leave silence behind: stop the loop and halt the audio
// clock, so nothing keeps ringing once the tab is hidden or closed
let musicWasPlaying = false;
function silenceAudio(){
  musicWasPlaying = !!music.timer;
  music.stop();
  if(AC && AC.state==='running') AC.suspend();
}
function restoreAudio(){
  if(AC && AC.state==='suspended') AC.resume();
  if(musicWasPlaying && PROFILE && PROFILE.music && PROFILE.music!=='off') music.play(PROFILE.music);
  musicWasPlaying = false;
}
document.addEventListener('visibilitychange', ()=>{
  if(document.hidden) silenceAudio(); else restoreAudio();
});
window.addEventListener('pagehide', silenceAudio);


/* ========== FULLSCREEN ========== */
const ICON_EXPAND = `<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2.4' stroke-linecap='round'><path d='M3 9V4h5'/><path d='M21 9V4h-5'/><path d='M3 15v5h5'/><path d='M21 15v5h-5'/></svg>`;
const ICON_SHRINK = `<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2.4' stroke-linecap='round'><path d='M8 4v5H3'/><path d='M16 4v5h5'/><path d='M8 20v-5H3'/><path d='M16 20v-5h5'/></svg>`;
const fsSupported = !!(document.documentElement.requestFullscreen ||
                       document.documentElement.webkitRequestFullscreen);
const inFullscreen = () => !!(document.fullscreenElement || document.webkitFullscreenElement);

function paintFullscreen(){
  const on = inFullscreen();
  [el('fsBtn'), el('fsBtn2')].forEach(b=>{
    if(!b) return;
    const label = b.querySelector('span');
    b.innerHTML = (on ? ICON_SHRINK : ICON_EXPAND) + (label ? label.outerHTML : '');
    if(label) b.querySelector('span').textContent = on ? 'Exit' : 'Full';
    b.title = on ? 'Leave fullscreen' : 'Fullscreen';
  });
}

async function toggleFullscreen(){
  if(!fsSupported){ toast('This browser will not let a page go fullscreen'); return; }
  try{
    if(!inFullscreen()){
      const r = document.documentElement;
      await (r.requestFullscreen ? r.requestFullscreen({navigationUI:'hide'})
                                 : r.webkitRequestFullscreen());
    } else {
      await (document.exitFullscreen ? document.exitFullscreen()
                                     : document.webkitExitFullscreen());
    }
  }catch(e){ toast('Fullscreen was blocked \u2014 try tapping the button again'); }
}

[el('fsBtn'), el('fsBtn2')].forEach(b=>{ if(b) b.onclick = toggleFullscreen; });
['fullscreenchange','webkitfullscreenchange'].forEach(ev=>
  document.addEventListener(ev, ()=>{ paintFullscreen(); setTimeout(relayout,120); }));
document.addEventListener('keydown', e=>{
  if(e.key === 'f' && !/input|textarea/i.test(e.target.tagName)) toggleFullscreen();
});
if(!fsSupported){ [el('fsBtn'), el('fsBtn2')].forEach(b=>{ if(b) b.style.display='none'; }); }
paintFullscreen();


/* ========== SHOP + MUSIC WIRING ========== */
el('shopBtn').onclick=()=>{ renderShop(); el('shopModal').classList.add('show'); };
el('musicBtn').onclick=()=>el('musicModal').classList.add('show');
el('musicBtn2').onclick=()=>el('musicModal').classList.add('show');
el('adCoinsBtn').onclick=async()=>{
  toast('Rewarded ad plays here in the Android build');
  PROFILE.coins += 100; await saveProfile(); renderShop();
  beep(760,.16,'triangle',.13);
};
document.querySelectorAll('#segMusic button').forEach(b=>b.onclick=()=>setMusic(b.dataset.v));
document.querySelectorAll('#segSfx button').forEach(b=>b.onclick=()=>{
  document.querySelectorAll('#segSfx button').forEach(x=>x.classList.remove('on'));
  b.classList.add('on'); sound = b.dataset.v==='on';
  el('soundBtn').textContent = sound?'🔊':'🔇';
  el('soundBtn').classList.toggle('off',!sound);
});
el('volRange').oninput = e => {
  music.setVolume(e.target.value/100);
  if(PROFILE){ PROFILE.vol=+e.target.value; saveProfile(); }
};

let cfgCount=4, cfgMode='cpu', cfgLen='full';

// measured from thousands of simulated matches
const RUNTIME = {'2-4':'~5 min','2-2':'~2 min','3-4':'~9 min','3-2':'~4 min',
                 '4-4':'~16 min','4-2':'~5 min','5-3':'~24 min','5-2':'~11 min','6-3':'~30 min','6-2':'~14 min'};
function paintHint(){
  const others=cfgCount-1;
  const who = cfgMode==='cpu'
    ? `You + ${others} computer${others>1?'s':''}`
    : `${cfgCount} players on one device`;
  const tok = tokenCount(cfgCount,cfgLen);
  const mins = RUNTIME[cfgCount+'-'+tok] || '';
  el('modeHint').textContent =
    `${who} \u00b7 ${cfgCount>=5?'hexagonal board':'classic cross board'} \u00b7 ${tok} tokens each \u00b7 ${mins}`;
}
function setLen(v){
  cfgLen=v;
  document.querySelectorAll('#segLen button').forEach(x=>x.classList.toggle('on',x.dataset.v===v));
  paintHint();
}
document.querySelectorAll('#segLen button').forEach(b=>b.onclick=()=>setLen(b.dataset.v));
document.querySelectorAll('#segCount button').forEach(b=>b.onclick=()=>{
  document.querySelectorAll('#segCount button').forEach(x=>x.classList.remove('on'));
  b.classList.add('on'); cfgCount=+b.dataset.v;
  if(cfgCount===6 && cfgLen==='full'){ setLen('quick');
    toast('Six players run Quick by default \u2014 a full hex lap takes about half an hour'); }
  paintHint();
});

function openMatch(mode){
  cfgMode=mode;
  el('matchTitle').textContent = mode==='cpu' ? 'VS COMPUTER' : 'PASS & PLAY';
  paintHint();
  show('match');
}
el('cpuBtn').onclick=()=>openMatch('cpu');
el('passBtn').onclick=()=>openMatch('pass');
el('backHomeBtn').onclick=()=>show('home');
el('moreCoinsBtn').onclick=()=>{ renderShop(); el('shopModal').classList.add('show'); };
el('profChip').onclick=()=>openSetup(true);

// title letters, each with its own bounce
(function buildLogo(){
  const host=el('bigLogo'); if(!host) return;
  host.innerHTML='';
  'LUDO TIME'.split('').forEach((ch,i)=>{
    if(ch===' '){ const g=document.createElement('span'); g.className='gap'; host.appendChild(g); return; }
    const b=document.createElement('b');
    b.textContent=ch;
    b.style.animationDelay=(i*0.09)+'s';
    host.appendChild(b);
  });
})();

el('playBtn').onclick=()=>newGame(cfgCount,cfgMode,PROFILE.name,cfgLen);
el('howBtn').onclick=()=>el('howModal').classList.add('show');
el('rulesBtn').onclick=()=>el('howModal').classList.add('show');
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>b.closest('.overlay').classList.remove('show'));
el('rollBtn').onclick=rollDice;
document.querySelector('.dice-stage').onclick=rollDice;
el('soundBtn').onclick=()=>{ sound=!sound; el('soundBtn').textContent=sound?'🔊':'🔇'; el('soundBtn').classList.toggle('off',!sound); };
el('tiltBtn').onclick=()=>{ tilt=!tilt; board.style.setProperty('--tilt',tilt?'16deg':'0deg'); renderTokens(); };
el('quitBtn').onclick=async()=>{
  if(await ask('Leave this game?','The match ends here and nobody wins it.','Leave','Keep playing','🚪'))
    toMenu();
};
el('againBtn').onclick=()=>{
  el('resultModal').classList.remove('show');
  newGame(cfgCount,cfgMode,PROFILE.name,cfgLen);
};
el('homeBtn').onclick=()=>{ el('resultModal').classList.remove('show'); toMenu(); };
function toMenu(){
  stopTimer(); if(S) S.over=true; busy=false;
  paintProfile(); show('home');
}

(function buildDice(){
  const layout={1:[4],2:[0,8],3:[0,4,8],4:[0,2,6,8],5:[0,2,4,6,8],6:[0,2,3,5,6,8]};
  const d=el('dice');
  for(let f=1;f<=6;f++){
    const face=document.createElement('div'); face.className='face f'+f;
    const pips=layout[FACE_PIPS[f]];
    for(let i=0;i<9;i++){
      const s=document.createElement('span');
      s.style.display='grid'; s.style.placeItems='center';
      if(pips.includes(i)) s.appendChild(document.createElement('i'));
      face.appendChild(s);
    }
    d.appendChild(face);
  }
  showFace(1);
})();

function relayout(){ fitBoard(); if(S && !S.over) renderTokens(); }
window.addEventListener('resize', relayout);
window.addEventListener('orientationchange', ()=>setTimeout(relayout,250));

function applyProfileSettings(){
  if(!PROFILE) return;
  PROFILE.theme = PROFILE.theme || 'classic';
  PROFILE.owned = PROFILE.owned || ['classic'];
  PROFILE.music = PROFILE.music || 'mellow';
  PROFILE.vol   = PROFILE.vol == null ? 70 : PROFILE.vol;
  applyTheme(PROFILE.theme);
  music.setVolume(PROFILE.vol/100);
  el('volRange').value = PROFILE.vol;
  document.querySelectorAll('#segMusic button').forEach(b=>b.classList.toggle('on', b.dataset.v===PROFILE.music));
}

// browsers only allow audio after a gesture, so start the loop on first tap
let musicArmed=false;
function armMusic(){
  if(musicArmed||!PROFILE) return;
  musicArmed=true;
  if(PROFILE.music && PROFILE.music!=='off') music.play(PROFILE.music);
}
document.addEventListener('pointerdown', armMusic, {once:false});

(async function boot(){
  TOKEN   = await store.get(TOKEN_KEY);
  PROFILE = await store.get(KEY);

  // the server holds the truth for a signed-in player; if it cannot be reached we play on
  // with whatever this device remembers and push again at the next save
  if(TOKEN){
    try{
      const r = await api('/api/profile');
      if(r.profile){ PROFILE = r.profile; await store.set(KEY, PROFILE); }
      else if(PROFILE) syncUp();
    }catch(e){}
  }

  if(PROFILE){ applyProfileSettings(); paintProfile(); show('home'); }
  else { applyTheme('classic'); show('auth'); }
})();
