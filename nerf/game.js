// NERF: Spin & Splat - top-down 2D foam-blaster paintball. Spin the wheel for a blaster, then play a round against AI opponents.
(() => {
  'use strict';
  const cv = document.getElementById('game'), ctx = cv.getContext('2d');
  const W = 960, H = 640, TAU = Math.PI * 2, FONT = '"Courier New", monospace';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), rnd = (a, b) => a + Math.random() * (b - a), pick = a => a[Math.floor(Math.random() * a.length)];
  const angDiff = (a, b) => { let d = (a - b) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
  const ARENA = { x: 20, y: 20, w: W - 40, h: H - 40 };
  const WIN_ROUNDS = 3;

  // ------------------------------------------------------------------ audio
  let actx = null, muted = false;
  function blip(f, d, type, v, slide) {
    if (muted) return; try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)(); const o = actx.createOscillator(), g = actx.createGain(), t = actx.currentTime;
      o.type = type || 'square'; o.frequency.setValueAtTime(f, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f * slide), t + d);
      g.gain.setValueAtTime(v || 0.04, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d); o.connect(g); g.connect(actx.destination); o.start(t); o.stop(t + d);
    } catch (e) { /* audio unavailable */ }
  }

  // ------------------------------------------------------------------ blasters (the wheel)
  // delay = seconds between shots, dmg out of 3 hit points, n = pellets, mag/reload = ammo and reload time
  const GUNS = [
    { name: 'Foam Blaster', col: '#ffb347', blurb: 'Balanced all-rounder', delay: 0.26, speed: 640, spread: 0.03, n: 1, dmg: 1, mag: 12, reload: 1.3, life: 1.1, pref: 230 },
    { name: 'Scatter Shot', col: '#ff5a5a', blurb: 'Five pellets, deadly up close', delay: 0.8, speed: 560, spread: 0.34, n: 5, dmg: 0.62, mag: 6, reload: 1.9, life: 0.5, pref: 110 },
    { name: 'Rapid Fire', col: '#7affd2', blurb: 'Hose them down', delay: 0.075, speed: 620, spread: 0.13, n: 1, dmg: 0.3, mag: 45, reload: 2.1, life: 0.9, pref: 190 },
    { name: 'Sniper Dart', col: '#9fd8ff', blurb: 'Slow, long range, 2 damage', delay: 1.1, speed: 1200, spread: 0, n: 1, dmg: 2, mag: 4, reload: 2.2, life: 1.4, pref: 400, big: true },
    { name: 'Burst Rifle', col: '#c77dff', blurb: 'Three-round bursts', delay: 0.5, speed: 680, spread: 0.04, n: 1, dmg: 0.75, mag: 18, reload: 1.6, life: 1.1, burst: 3, pref: 260 },
    { name: 'Splat Launcher', col: '#ff7ad9', blurb: 'Lobbed paint bomb, splash damage', delay: 0.95, speed: 380, spread: 0, n: 1, dmg: 1.6, mag: 3, reload: 2.4, life: 1.3, splash: 78, lob: true, pref: 280, big: true },
    { name: 'Ricochet Gun', col: '#ffe27a', blurb: 'Bounces off walls three times', delay: 0.4, speed: 720, spread: 0.02, n: 1, dmg: 0.85, mag: 10, reload: 1.5, life: 2.2, bounce: 3, pref: 240 },
    { name: 'Seeker Darts', col: '#5aff7a', blurb: 'Steers toward enemies', delay: 0.55, speed: 430, spread: 0.05, n: 1, dmg: 0.8, mag: 8, reload: 1.8, life: 1.7, home: 3.4, pref: 250 }
  ];
  GUNS.forEach(g => { g.range = g.speed * g.life; });

  // ------------------------------------------------------------------ houses: rooms, walls with doorways, furniture
  const WT = 16, DW = 84;                                // wall thickness, doorway width
  function houseMap(name, def) {
    const r = [], doors = [];
    const hw = (y, x0, x1, gaps) => { let x = x0; for (const g of gaps.concat([x1 + DW])) { const gx0 = g - DW / 2; if (gx0 > x) r.push({ x, y: y - WT / 2, w: Math.min(gx0, x1) - x, h: WT, wall: true }); x = g + DW / 2; if (g <= x1) doors.push({ x: g, y }); } };
    const vw = (x, y0, y1, gaps) => { let y = y0; for (const g of gaps.concat([y1 + DW])) { const gy0 = g - DW / 2; if (gy0 > y) r.push({ x: x - WT / 2, y, w: WT, h: Math.min(gy0, y1) - y, wall: true }); y = g + DW / 2; if (g <= y1) doors.push({ x, y: g }); } };
    def.h.forEach(a => hw(a[0], a[1], a[2], a[3])); def.v.forEach(a => vw(a[0], a[1], a[2], a[3]));
    def.f.forEach(a => r.push({ x: a[0], y: a[1], w: a[2], h: a[3], f: true }));
    return { name, r, doors, rooms: def.rooms };
  }
  const MAPS = [
    houseMap('Long Halls', {   // a long central corridor with uneven rooms off it, open halls at both ends
      v: [[150, 20, 250, [135]], [150, 340, 620, [480]], [810, 20, 250, [135]], [810, 340, 620, [480]], [380, 20, 250, []], [600, 20, 250, []], [400, 340, 620, []], [650, 340, 620, []]],
      h: [[250, 150, 810, [260, 480, 700]], [340, 150, 810, [220, 560, 740]]],
      rooms: [[20, 20, 130, 600, '#555b66'], [810, 20, 130, 600, '#555b66'], [150, 20, 230, 230, '#6b4a2e'], [380, 20, 220, 230, '#3d5a6b'], [600, 20, 210, 230, '#6b3d5a'], [150, 340, 250, 280, '#4a6b3d'], [400, 340, 250, 280, '#7a6b3a'], [650, 340, 160, 280, '#3a4a7a']],
      f: [[190, 70, 100, 44], [420, 150, 60, 60], [660, 60, 80, 70], [190, 480, 100, 50], [450, 520, 120, 44], [690, 440, 60, 90], [20, 150, 40, 50], [20, 430, 40, 50], [900, 150, 40, 50], [900, 430, 40, 50]] }),
    houseMap('Zigzag', {       // a winding route: top strip, a middle band and two rooms below
      v: [[640, 20, 210, []], [320, 430, 620, []], [600, 430, 620, []]],
      h: [[210, 20, 640, [100, 330]], [430, 320, 940, [450, 800]]],
      rooms: [[20, 20, 620, 190, '#6b4a2e'], [640, 20, 300, 410, '#3d5a6b'], [20, 210, 920, 220, '#555b66'], [20, 430, 300, 190, '#4a6b3d'], [320, 430, 280, 190, '#7a6b3a'], [600, 430, 340, 190, '#6b3d5a']],
      f: [[200, 80, 80, 50], [450, 60, 50, 90], [760, 100, 90, 50], [800, 250, 60, 90], [180, 270, 70, 70], [540, 290, 60, 60], [90, 520, 100, 44], [400, 510, 90, 50], [700, 500, 120, 44]] }),
    houseMap('Crossroads', {   // four closets of different sizes around an open centre
      v: [[360, 20, 250, [130]], [600, 20, 200, []], [300, 400, 620, [520]], [660, 440, 620, []]],
      h: [[250, 20, 360, [200]], [200, 600, 940, [760]], [400, 20, 300, [150]], [440, 660, 940, [800]]],
      rooms: [[20, 20, 340, 230, '#6b4a2e'], [600, 20, 340, 180, '#6b3d5a'], [20, 400, 280, 220, '#4a6b3d'], [660, 440, 280, 180, '#3a4a7a']],
      f: [[90, 90, 100, 50], [740, 90, 100, 44], [80, 480, 90, 60], [740, 520, 120, 44], [440, 160, 80, 80], [440, 420, 80, 80], [220, 300, 60, 60], [680, 300, 60, 60]] }),
    houseMap('Apartment', {    // a corridor with uneven rooms above and below
      v: [[200, 20, 270, []], [470, 20, 270, []], [760, 20, 270, []], [300, 370, 620, []], [560, 370, 620, []], [700, 370, 620, []]],
      h: [[270, 20, 940, [110, 330, 610, 850]], [370, 20, 940, [160, 430, 630, 820]]],
      rooms: [[20, 20, 180, 250, '#6b4a2e'], [200, 20, 270, 250, '#3d5a6b'], [470, 20, 290, 250, '#6b3d5a'], [760, 20, 180, 250, '#4a6b3d'], [20, 270, 920, 100, '#555b66'], [20, 370, 280, 250, '#7a6b3a'], [300, 370, 260, 250, '#3a4a7a'], [560, 370, 140, 250, '#6b4a2e'], [700, 370, 240, 250, '#3d5a6b']],
      f: [[40, 120, 70, 50], [260, 150, 100, 50], [520, 60, 50, 90], [820, 130, 80, 50], [150, 520, 100, 60], [350, 450, 60, 90], [590, 520, 60, 50], [800, 440, 80, 80]] })
  ];
  const BOTNAMES = ['Red Rex', 'Green Gus', 'Yellow Yuki'], PCOL = ['#3a8dff', '#ff4a4a', '#3ad65a', '#ffd23f'];
  const DIFF = [{ name: 'EASY', err: 0.3, turn: 4, speed: 150, react: 0.35 }, { name: 'NORMAL', err: 0.15, turn: 7, speed: 175, react: 0.2 }, { name: 'HARD', err: 0.06, turn: 12, speed: 195, react: 0.08 }];

  // ------------------------------------------------------------------ state
  const S = { MENU: 0, WHEEL: 1, INTRO: 2, FIGHT: 3, ROUNDEND: 4, MATCHEND: 5, ONLINE: 6, LOBBY: 7 };
  let state = S.MENU, stateT = 0, time = 0;
  let opts = { bots: 3, diff: 1 };
  let myIdx = 0, nav = null, ents = [], bullets = [], parts = [], rects = [], feed = [], map = null, roundNo = 0, winner = null, shake = 0;
  const keys = new Set(), mouse = { x: W / 2, y: H / 2, down: false };
  const paintC = document.createElement('canvas'); paintC.width = W; paintC.height = H; const paint = paintC.getContext('2d');
  let wheel = { rot: 0, spin: 0, dur: 0, from: 0, to: 0, res: -1, lastSeg: 0, bots: [] };
  let buttons = [];

  const player = () => ents[myIdx];
  const alive = () => ents.filter(e => e.alive);

  function mkEnt(i, name, isBot) {
    return { i, name, col: PCOL[i], isBot, x: 0, y: 0, vx: 0, vy: 0, r: 14, hp: 3, alive: true, gun: GUNS[0], ammo: 0, rel: 0, fireT: 0, burstLeft: 0, burstT: 0, face: 0, aimX: 0, aimY: 0, stains: [], dashT: 0, dashCd: 0, wins: 0, flash: 0, remote: null, inp: { mx: 0, my: 0, ax: 480, ay: 320, f: 0 }, wres: -1, spunAt: 0, rw: null, ai: { sd: 1, sdT: 1, err: 0, errT: 0, stuck: 0, lx: 0, ly: 0, react: 0 } };
  }

  function newMatch() {
    ents = [mkEnt(0, 'You', false)];
    for (let i = 1; i <= opts.bots; i++) ents.push(mkEnt(i, BOTNAMES[i - 1], true));
    roundNo = 0; startWheel();
  }

  function startWheel() {
    roundNo++; state = S.WHEEL; stateT = 0; wheel.res = -1; wheel.spin = 0; wheel.bots = []; wheel.wait = false; wheel.age = 0; feed = []; for (const e of ents) e.wres = -1;
    for (const e of ents) e.gun = GUNS[0];
  }

  function spinWheel(forced) {
    if (wheel.spin > 0 || wheel.res >= 0) return;
    if (net.role === 'client' && forced === undefined) { netSend({ t: 'spin' }); wheel.wait = true; return; }
    wheel.wait = false; const seg = TAU / GUNS.length, r = forced !== undefined ? forced : Math.floor(Math.random() * GUNS.length);
    if (net.role !== 'client') { player().wres = r; player().spunAt = time; }
    wheel.res = r; wheel.from = wheel.rot; wheel.to = wheel.rot + TAU * 5 + (((-Math.PI / 2 - (r + 0.5) * seg - wheel.rot + rnd(-seg * 0.35, seg * 0.35)) % TAU) + TAU) % TAU; wheel.spin = 4.2; wheel.dur = 4.2; wheel.lastSeg = -1;
    blip(300, 0.1, 'triangle', 0.05);
  }

  function wheelTick(dt) {
    if (wheel.spin > 0) {
      wheel.spin -= dt; const k = 1 - clamp(wheel.spin / wheel.dur, 0, 1), e = 1 - Math.pow(1 - k, 3.2); wheel.rot = wheel.from + (wheel.to - wheel.from) * e;
      const seg = Math.floor((((-Math.PI / 2 - wheel.rot) % TAU) + TAU) % TAU / (TAU / GUNS.length)); if (seg !== wheel.lastSeg) { wheel.lastSeg = seg; blip(500 + (seg % 3) * 60, 0.03, 'triangle', 0.03); }
      if (wheel.spin <= 0) { wheel.rot = wheel.to; stateT = 0; blip(660, 0.25, 'triangle', 0.07, 1.5); }
    }
  }
  function startRound() {
    state = S.INTRO; stateT = 0; map = pick(MAPS); rects = map.r.map(a => Object.assign({}, a));
    bullets = []; parts = []; paint.clearRect(0, 0, W, H);
    const sp = [[70, 80], [890, 80], [70, 560], [890, 560]].sort(() => Math.random() - 0.5);
    ents.forEach((e, i) => {
      e.x = sp[i][0]; e.y = sp[i][1]; e.vx = e.vy = 0; e.hp = 3; e.alive = true; e.stains = []; e.rel = 0; e.fireT = 0.4; e.burstLeft = 0; e.dashT = 0; e.dashCd = 0; e.flash = 0;
      e.face = Math.atan2(H / 2 - e.y, W / 2 - e.x); e.gun = e.isBot ? pick(GUNS) : GUNS[e.wres >= 0 ? e.wres : 0]; e.rw = null; e.ammo = e.gun.mag; e.ai.react = 0; e.ai.sd = Math.random() < 0.5 ? 1 : -1;
    });
    buildNav(); net.rc++;
    for (const e of ents) if (e.isBot) { const a = e.ai; a.mode = Math.random() < 0.6 ? 'camp' : 'rush'; a.modeT = rnd(9, 17); a.flow = null; a.lastHp = 3; a.spot = null; if (a.mode === 'camp') a.spot = pickSpot(e); }
  }

  const net = { role: 'off', peer: null, host: null, clients: [], code: '', pub: false, status: '', names: [], fill: true, rc: 0, locked: false, lobbyT: 0, snapT: 0, inT: 0, pending: null, ev: { sp: [], hs: [], fd: [] } };
  let nameStr = ''; try { nameStr = localStorage.getItem('nerfName') || ''; } catch (e) { /* no storage */ }
  let codeStr = '', focusF = null;

  // ------------------------------------------------------------------ geometry
  function rectPush(e, r) {
    const cx = clamp(e.x, r.x, r.x + r.w), cy = clamp(e.y, r.y, r.y + r.h), dx = e.x - cx, dy = e.y - cy, d = Math.hypot(dx, dy);
    if (d < e.r) {
      if (d > 0.001) { e.x = cx + dx / d * e.r; e.y = cy + dy / d * e.r; }
      else { const l = e.x - r.x, rr = r.x + r.w - e.x, t = e.y - r.y, b = r.y + r.h - e.y, m = Math.min(l, rr, t, b); if (m === l) e.x = r.x - e.r; else if (m === rr) e.x = r.x + r.w + e.r; else if (m === t) e.y = r.y - e.r; else e.y = r.y + r.h + e.r; }
      return true;
    }
    return false;
  }
  const inRect = (x, y, r, pad) => x > r.x - pad && x < r.x + r.w + pad && y > r.y - pad && y < r.y + r.h + pad;
  function los(ax, ay, bx, by) {
    const d = Math.hypot(bx - ax, by - ay), n = Math.ceil(d / 14);
    for (let i = 1; i < n; i++) { const x = ax + (bx - ax) * i / n, y = ay + (by - ay) * i / n; for (const r of rects) if (inRect(x, y, r, 2)) return false; }
    return true;
  }

  // ------------------------------------------------------------------ paint & particles
  function splat() { /* no paint is left on the floor or walls any more */ }
  function splatOld(x, y, r, col, a) { if (net.role === 'host') net.ev.sp.push([Math.round(x), Math.round(y), Math.round(r), PCOL.indexOf(col), a || 0.85]); drawSplat(x, y, r, col, a); }
  function drawSplat(x, y, r, col, a) {
    paint.globalAlpha = a || 0.85; paint.fillStyle = col; paint.beginPath(); paint.arc(x, y, r, 0, TAU); paint.fill();
    const n = 5 + Math.floor(r / 4);
    for (let i = 0; i < n; i++) { const an = rnd(0, TAU), d = r * rnd(0.8, 1.9); paint.beginPath(); paint.arc(x + Math.cos(an) * d, y + Math.sin(an) * d, r * rnd(0.12, 0.34), 0, TAU); paint.fill(); }
    paint.globalAlpha = 1;
  }
  function spark(x, y, col, n, sp) { for (let i = 0; i < n; i++) { const a = rnd(0, TAU), s = rnd(0.3, 1) * (sp || 160); parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rnd(0.25, 0.5), c: col, r: rnd(1.5, 3.5) }); } }

  // ------------------------------------------------------------------ shooting
  function canShoot(e) { return e.alive && e.rel <= 0 && e.ammo > 0 && e.fireT <= 0 && e.burstLeft <= 0; }
  function shotOnce(e) {
    const g = e.gun; let fuse = g.life;
    if (g.lob) { const d = Math.hypot(e.aimX - e.x, e.aimY - e.y); fuse = clamp((d - 20) / g.speed, 0.15, g.life); }
    for (let k = 0; k < g.n; k++) {
      const a = e.face + (g.n > 1 ? (k - (g.n - 1) / 2) * (g.spread * 2 / (g.n - 1)) + rnd(-0.04, 0.04) : rnd(-g.spread, g.spread));
      bullets.push({ x: e.x + Math.cos(e.face) * 22, y: e.y + Math.sin(e.face) * 22, vx: Math.cos(a) * g.speed, vy: Math.sin(a) * g.speed, r: g.big ? 6 : g.n > 1 ? 3.5 : 4.5, life: fuse, dmg: g.dmg, own: e, col: e.col, gc: g.col, bounce: g.bounce || 0, home: g.home || 0, splash: g.splash || 0, lob: !!g.lob, h: 0, t: 0 });
    }
    e.ammo--; blip(g.lob ? 140 : 420 + Math.random() * 60, 0.07, g.lob ? 'sawtooth' : 'square', 0.03, 0.5);
    if (e.ammo <= 0) e.rel = g.reload;
  }
  function tryFire(e) {
    if (!canShoot(e)) return false; const g = e.gun;
    shotOnce(e); e.fireT = g.delay; if (g.burst) { e.burstLeft = g.burst - 1; e.burstT = 0.07; }
    e.vx -= Math.cos(e.face) * 20; e.vy -= Math.sin(e.face) * 20; return true;
  }
  function damage(e, d, by, bx, by2) {
    if (!e.alive) return;
    e.hp -= d; e.flash = 0.12; shake = Math.max(shake, 4);
    const a = Math.atan2(by2 - e.y, bx - e.x); const st = { a, d: rnd(0.1, 0.8), r: rnd(3, 7), col: by.col }; e.stains.push(st); if (e.stains.length > 16) e.stains.shift(); if (net.role === 'host') net.ev.hs.push([e.i, +a.toFixed(2), +st.d.toFixed(2), +st.r.toFixed(1), by.i]);
    spark(bx, by2, by.col, 8, 190); splat(bx, by2, 7 + d * 5, by.col, 0.8); blip(180, 0.1, 'sawtooth', 0.05, 0.6);
    if (e.hp <= 0) {
      e.alive = false; by.kills = (by.kills || 0) + 1; splat(e.x, e.y, 34, by.col, 0.9); spark(e.x, e.y, by.col, 26, 260); shake = 9; blip(110, 0.3, 'sawtooth', 0.07, 0.4);
      feed.unshift({ t: 4, s: by.name + ' splatted ' + e.name, c: by.col }); if (feed.length > 4) feed.pop(); if (net.role === 'host') net.ev.fd.push([by.i, e.i]);
    }
  }
  function explode(b) {
    splat(b.x, b.y, 38, b.col, 0.9); spark(b.x, b.y, b.col, 24, 280); shake = Math.max(shake, 6); blip(90, 0.35, 'sawtooth', 0.07, 0.4);
    for (const e of ents) if (e.alive && e.i !== b.own.i && Math.hypot(e.x - b.x, e.y - b.y) < b.splash + e.r) damage(e, b.dmg * (1 - Math.hypot(e.x - b.x, e.y - b.y) / (b.splash + e.r) * 0.45), b.own, b.x, b.y);
  }

  // ------------------------------------------------------------------ navigation (grid flow fields so bots can walk through doorways)
  const NC = 20, NX = W / NC, NY = H / NC;
  function buildNav() {
    nav = { free: new Uint8Array(NX * NY) };
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
      const x = i * NC + NC / 2, y = j * NC + NC / 2; let ok = x > ARENA.x + 16 && x < ARENA.x + ARENA.w - 16 && y > ARENA.y + 16 && y < ARENA.y + ARENA.h - 16;
      if (ok) for (const r of rects) { const cx = clamp(x, r.x, r.x + r.w), cy = clamp(y, r.y, r.y + r.h); if (Math.hypot(x - cx, y - cy) < 17) { ok = false; break; } }
      nav.free[j * NX + i] = ok ? 1 : 0;
    }
  }
  const cellOf = (x, y) => clamp(Math.floor(y / NC), 0, NY - 1) * NX + clamp(Math.floor(x / NC), 0, NX - 1);
  function nearFree(c) { if (nav.free[c]) return c; for (let k = 1; k < 6; k++) for (let dj = -k; dj <= k; dj++) for (let di = -k; di <= k; di++) { const i = (c % NX) + di, j = Math.floor(c / NX) + dj; if (i >= 0 && j >= 0 && i < NX && j < NY && nav.free[j * NX + i]) return j * NX + i; } return c; }
  function flowTo(tx, ty) {
    const d = new Int16Array(NX * NY).fill(9999), start = nearFree(cellOf(tx, ty)), q = [start]; d[start] = 0;
    for (let h = 0; h < q.length; h++) {
      const c = q[h], ci = c % NX, cj = Math.floor(c / NX);
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue; const i = ci + di, j = cj + dj; if (i < 0 || j < 0 || i >= NX || j >= NY) continue; const n = j * NX + i; if (!nav.free[n] || d[n] <= d[c] + 1) continue;
        if (di && dj && (!nav.free[cj * NX + i] || !nav.free[j * NX + ci])) continue; d[n] = d[c] + 1; q.push(n);
      }
    }
    return d;
  }
  function navDir(e, tx, ty) {                            // unit vector toward the next cell on the way to (tx,ty)
    const a = e.ai, key = cellOf(tx, ty);
    if (!a.flow || a.flow.key !== key || a.flow.age > 0.6) a.flow = { key, d: flowTo(tx, ty), age: 0 };
    const c = cellOf(e.x, e.y), ci = c % NX, cj = Math.floor(c / NX), d = a.flow.d; let best = c, bv = d[c];
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const i = ci + di, j = cj + dj; if (i < 0 || j < 0 || i >= NX || j >= NY) continue; const n = j * NX + i; if (d[n] < bv && (!(di && dj) || (nav.free[cj * NX + i] && nav.free[j * NX + ci]))) { bv = d[n]; best = n; } }
    if (best === c) { const dx = tx - e.x, dy = ty - e.y, m = Math.hypot(dx, dy) || 1; return [dx / m, dy / m]; }
    const px = (best % NX) * NC + NC / 2, py = Math.floor(best / NX) * NC + NC / 2, dx = px - e.x, dy = py - e.y, m = Math.hypot(dx, dy) || 1; return [dx / m, dy / m];
  }
  // a camping spot: a spot against a wall with a clear view of a doorway
  function pickSpot(e) {
    const taken = ents.filter(o => o !== e && o.ai.spot).map(o => o.ai.spot), reach = flowTo(e.x, e.y);
    for (let t = 0; t < 120; t++) {
      const dr = pick(map.doors), a = rnd(0, TAU), dd = rnd(130, 330), x = dr.x + Math.cos(a) * dd, y = dr.y + Math.sin(a) * dd;
      if (x < 40 || x > W - 40 || y < 40 || y > H - 40 || !nav.free[cellOf(x, y)] || reach[cellOf(x, y)] >= 9999 || !los(x, y, dr.x, dr.y)) continue;
      let near = false; for (const r of rects) { const cx = clamp(x, r.x, r.x + r.w), cy = clamp(y, r.y, r.y + r.h); if (Math.hypot(x - cx, y - cy) < 38) { near = true; break; } }
      if (!near || taken.some(s => Math.hypot(s.x - x, s.y - y) < 150)) continue;
      return { x, y, ax: dr.x, ay: dr.y };
    }
    return { x: W / 2, y: H / 2, ax: W / 2, ay: H / 2 - 100 };
  }
  function warnRush(e, v) { if (v && !v.isBot && v.alive && !(v.rw && v.rw.t > 0.2)) { v.rw = { t: 2.2, e }; if (v === player()) { blip(980, 0.12, 'square', 0.06); setTimeout(() => blip(780, 0.16, 'square', 0.06), 130); } } }
  function setRush(e, tgt) { e.ai.mode = 'rush'; e.ai.flow = null; warnRush(e, tgt); }

  // ------------------------------------------------------------------ AI
  function botThink(e, dt) {
    const D = DIFF[opts.diff], ai = e.ai; let tgt = null, bd = 1e9;
    for (const o of ents) if (o.alive && o !== e) { const d = Math.hypot(o.x - e.x, o.y - e.y) * (los(e.x, e.y, o.x, o.y) ? 1 : 1.6); if (d < bd) { bd = d; tgt = o; } }
    ai.sdT -= dt; if (ai.sdT <= 0) { ai.sd = -ai.sd; ai.sdT = rnd(0.7, 2.2); }
    ai.errT -= dt; if (ai.errT <= 0) { ai.err = rnd(-1, 1) * D.err; ai.errT = rnd(0.25, 0.6); }
    if (ai.react > 0) ai.react -= dt; if (ai.flow) ai.flow.age += dt;
    if (e.hp < ai.lastHp - 0.01 && ai.mode === 'camp' && Math.random() < 0.5) setRush(e, tgt); ai.lastHp = e.hp;
    ai.modeT -= dt; if (ai.modeT <= 0 && ai.mode === 'camp') { if (Math.random() < 0.55) setRush(e, tgt); else { ai.spot = pickSpot(e); ai.flow = null; ai.modeT = rnd(9, 17); } }
    let mx = 0, my = 0, hold = false, spd = D.speed;
    const vis = tgt && los(e.x, e.y, tgt.x, tgt.y), d = tgt ? Math.hypot(tgt.x - e.x, tgt.y - e.y) : 0;
    if (ai.mode === 'camp') {
      const sp = ai.spot; if (Math.hypot(sp.x - e.x, sp.y - e.y) > 14) [mx, my] = navDir(e, sp.x, sp.y); else hold = true;
    } else if (tgt && vis && d < 270) {                   // close enough to fight: strafe around the target
      const ux = (tgt.x - e.x) / d, uy = (tgt.y - e.y) / d, pref = e.gun.pref, k = d > pref + 40 ? 1 : d < pref - 50 ? -1 : 0; mx = ux * k + -uy * ai.sd * 0.85; my = uy * k + ux * ai.sd * 0.85;
    } else if (tgt) { [mx, my] = navDir(e, tgt.x, tgt.y); spd *= 1.28; }   // rush: run straight at them
    if (!hold) for (const b of bullets) if (b.own !== e && !b.lob && Math.hypot(b.x - e.x, b.y - e.y) < 130) { const bs = Math.hypot(b.vx, b.vy), dot = (b.vx * (e.x - b.x) + b.vy * (e.y - b.y)) / (bs * (Math.hypot(b.x - e.x, b.y - e.y) || 1)); if (dot > 0.92 && Math.random() < dt * 4) { mx += -b.vy / bs * ai.sd * 1.5; my += b.vx / bs * ai.sd * 1.5; if (e.dashCd <= 0 && opts.diff > 0 && Math.random() < 0.4) { e.dashT = 0.16; e.dashCd = 2.2; } } }
    let want = e.face;
    if (tgt && vis) {
      const lead = e.gun.lob ? 0 : clamp(d / e.gun.speed, 0, 1.2) * (0.5 + opts.diff * 0.35), ax = tgt.x + tgt.vx * lead, ay = tgt.y + tgt.vy * lead; e.aimX = ax; e.aimY = ay; want = Math.atan2(ay - e.y, ax - e.x) + ai.err;
      if (ai.react <= 0 && !ai.saw) { ai.saw = true; ai.react = D.react; }
    } else { ai.saw = false; if (hold) want = Math.atan2(ai.spot.ay - e.y, ai.spot.ax - e.x); else if (mx || my) want = Math.atan2(my, mx); }
    e.face += clamp(angDiff(want, e.face), -D.turn * dt, D.turn * dt);
    if (tgt && vis && ai.react <= 0 && d < e.gun.range * 0.95 && Math.abs(angDiff(want, e.face)) < 0.1 + 0.2 / (d / 100 + 1)) tryFire(e);
    if (!vis && e.ammo < e.gun.mag * 0.4 && e.rel <= 0) e.rel = e.gun.reload * 0.7;
    ai.stuck += dt; if (ai.stuck > 0.6) { if (!hold && Math.hypot(e.x - ai.lx, e.y - ai.ly) < 6) { ai.sd = -ai.sd; ai.flow = null; mx += rnd(-1, 1); my += rnd(-1, 1); } ai.lx = e.x; ai.ly = e.y; ai.stuck = 0; }
    const m = Math.hypot(mx, my) || 1, sp = (hold ? 0 : spd) * (e.dashT > 0 ? 3 : 1); e.vx += ((mx / m) * sp - e.vx) * Math.min(1, 9 * dt); e.vy += ((my / m) * sp - e.vy) * Math.min(1, 9 * dt);
  }

  // ------------------------------------------------------------------ input
  function localInput() {
    return { mx: (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0), my: (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0), ax: mouse.x, ay: mouse.y, f: mouse.down && state === S.FIGHT ? 1 : 0 };
  }
  function doReload(p) { if (p.alive && p.rel <= 0 && p.ammo < p.gun.mag) p.rel = p.gun.reload; }
  function doDash(p) { if (!p.alive || p.dashCd > 0) return; p.dashT = 0.16; p.dashCd = 1.6; const m = Math.hypot(p.vx, p.vy); if (m < 10) { p.vx = Math.cos(p.face) * 100; p.vy = Math.sin(p.face) * 100; } if (p === player()) blip(260, 0.12, 'sawtooth', 0.04, 2); }

  // ------------------------------------------------------------------ update
  function updateEnt(e, dt) {
    e.fireT -= dt; e.flash = Math.max(0, e.flash - dt); e.dashCd -= dt; e.dashT -= dt;
    if (e.rel > 0) { e.rel -= dt; if (e.rel <= 0) e.ammo = e.gun.mag; }
    if (e.burstLeft > 0 && e.ammo > 0) { e.burstT -= dt; if (e.burstT <= 0) { shotOnce(e); e.burstLeft--; e.burstT = 0.07; } } else e.burstLeft = 0;
    if (!e.isBot) {
      const c = e.remote ? e.inp : localInput();
      const m = Math.hypot(c.mx, c.my) || 1, sp = 205 * (e.dashT > 0 ? 3 : 1); e.vx += (c.mx / m * sp - e.vx) * Math.min(1, 12 * dt); e.vy += (c.my / m * sp - e.vy) * Math.min(1, 12 * dt);
      e.aimX = c.ax; e.aimY = c.ay; e.face = Math.atan2(c.ay - e.y, c.ax - e.x);
      if (c.f) tryFire(e);
    } else botThink(e, dt);
    e.x += e.vx * dt; e.y += e.vy * dt;
    e.x = clamp(e.x, ARENA.x + e.r, ARENA.x + ARENA.w - e.r); e.y = clamp(e.y, ARENA.y + e.r, ARENA.y + ARENA.h - e.r);
    for (const r of rects) rectPush(e, r);
    for (const o of ents) if (o !== e && o.alive) { const d = Math.hypot(o.x - e.x, o.y - e.y); if (d < e.r + o.r && d > 0.01) { const p = (e.r + o.r - d) / 2; e.x += (e.x - o.x) / d * p; e.y += (e.y - o.y) / d * p; } }
  }

  function updateBullets(dt) {
    for (const b of bullets) {
      b.t += dt; b.life -= dt;
      if (b.home) { let t = null, bd = 260; for (const e of ents) if (e.alive && e !== b.own) { const d = Math.hypot(e.x - b.x, e.y - b.y); if (d < bd && los(b.x, b.y, e.x, e.y)) { bd = d; t = e; } } if (t) { const cur = Math.atan2(b.vy, b.vx), sp = Math.hypot(b.vx, b.vy), na = cur + clamp(angDiff(Math.atan2(t.y - b.y, t.x - b.x), cur), -b.home * dt, b.home * dt); b.vx = Math.cos(na) * sp; b.vy = Math.sin(na) * sp; } }
      const px = b.x, py = b.y; b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.lob) { b.h = Math.sin(clamp(b.t / (b.t + b.life + 0.0001), 0, 1) * Math.PI) * 26; if (b.life <= 0) { explode(b); b.dead = true; continue; } }
      else {
        let hit = false;
        if (b.x < ARENA.x || b.x > ARENA.x + ARENA.w || b.y < ARENA.y || b.y > ARENA.y + ARENA.h) { if (b.bounce > 0) { b.bounce--; if (b.x < ARENA.x || b.x > ARENA.x + ARENA.w) b.vx = -b.vx; else b.vy = -b.vy; b.x = px; b.y = py; spark(b.x, b.y, b.col, 3, 80); } else hit = true; }
        else for (const r of rects) if (inRect(b.x, b.y, r, b.r * 0.5)) { if (b.bounce > 0) { b.bounce--; if (px <= r.x - 1 || px >= r.x + r.w + 1) b.vx = -b.vx; else b.vy = -b.vy; b.x = px; b.y = py; spark(b.x, b.y, b.col, 3, 80); blip(700, 0.04, 'sine', 0.025); } else hit = true; break; }
        if (hit) { splat(b.x, b.y, b.r * 2.2 + (b.big ? 3 : 0), b.col, 0.75); spark(b.x, b.y, b.col, 5, 120); b.dead = true; continue; }
        if (b.life <= 0) { splat(b.x, b.y, 4, b.col, 0.6); b.dead = true; continue; }
      }
      for (const e of ents) if (e.alive && e !== b.own && Math.hypot(e.x - b.x, e.y - b.y) < e.r + b.r) {
        if (b.splash) explode(b); else damage(e, b.dmg, b.own, b.x, b.y); b.dead = true; break;
      }
    }
    bullets = bullets.filter(b => !b.dead);
  }

  function update(dt) {
    time += dt; stateT += dt; shake = Math.max(0, shake - dt * 30);
    for (const e of ents) if (e.rw) { e.rw.t -= dt; if ((e.rw.e && !e.rw.e.alive) || state !== S.FIGHT) e.rw = null; }
    for (const f of feed) f.t -= dt; feed = feed.filter(f => f.t > 0);
    for (const p of parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.93; p.vy *= 0.93; p.life -= dt; } parts = parts.filter(p => p.life > 0);
    if (state === S.WHEEL) {
      wheelTick(dt);
      if (net.role === 'off') { if (wheel.res >= 0 && wheel.spin <= 0 && stateT > 2.2) startRound(); }
      else if (net.role === 'host') {
        wheel.age += dt; const hs = ents.filter(e => !e.isBot);
        if (wheel.age > 14) for (const e of hs) if (e.wres < 0) { const r = Math.floor(Math.random() * GUNS.length); if (e === player()) spinWheel(r); else { e.wres = r; e.spunAt = time; if (e.remote && e.remote.open) e.remote.send({ t: 'wres', r }); } }
        if (hs.every(e => e.wres >= 0) && time - Math.max(...hs.map(e => e.spunAt)) > 4.8) startRound();
      }
    } else if (state === S.INTRO) {
      for (const e of ents) if (e.alive) { e.vx *= 0.8; e.vy *= 0.8; if (e === player() && net.role !== 'client') { e.aimX = mouse.x; e.aimY = mouse.y; e.face = Math.atan2(mouse.y - e.y, mouse.x - e.x); } }
      if (stateT > 3) { state = S.FIGHT; stateT = 0; blip(880, 0.3, 'square', 0.06); setTimeout(() => { if (state !== S.FIGHT) return; for (const b of ents) if (b.isBot && b.alive && b.ai.mode === 'rush') { let t = null, bd = 1e9; for (const o of ents) if (o.alive && o !== b) { const d = Math.hypot(o.x - b.x, o.y - b.y); if (d < bd) { bd = d; t = o; } } warnRush(b, t); } }, 900); }
    } else if (state === S.FIGHT) {
      for (const e of ents) if (e.alive) updateEnt(e, dt);
      updateBullets(dt);
      const al = alive(); if (al.length <= 1) { winner = al[0] || null; if (winner) winner.wins++; state = S.ROUNDEND; stateT = 0; blip(winner === player() ? 784 : 200, 0.5, 'triangle', 0.07); }
    } else if (state === S.ROUNDEND) {
      updateBullets(dt); for (const e of ents) if (e.alive) { e.vx *= 0.9; e.vy *= 0.9; }
      if (stateT > 3) { if (ents.some(e => e.wins >= WIN_ROUNDS)) { state = S.MATCHEND; stateT = 0; } else startWheel(); }
    }
  }

  // ------------------------------------------------------------------ drawing
  function drawField() {
    ctx.fillStyle = '#0e1f15'; ctx.fillRect(0, 0, W, H);
    if (map && state !== S.MENU && state !== S.ONLINE && state !== S.LOBBY) {
      ctx.fillStyle = '#555b66'; ctx.fillRect(ARENA.x, ARENA.y, ARENA.w, ARENA.h); ctx.fillStyle = 'rgba(0,0,0,.12)'; for (let x = ARENA.x; x < ARENA.x + ARENA.w; x += 40) for (let y = ARENA.y; y < ARENA.y + ARENA.h; y += 40) if (((x - ARENA.x) / 40 + (y - ARENA.y) / 40) % 2 === 0) ctx.fillRect(x, y, 40, 40);
      for (const r of map.rooms) { ctx.fillStyle = r[4]; ctx.fillRect(r[0], r[1], r[2], r[3]); ctx.fillStyle = 'rgba(0,0,0,.13)'; for (let x = r[0]; x < r[0] + r[2]; x += 40) for (let y = r[1]; y < r[1] + r[3]; y += 40) if (((x - r[0]) / 40 + (y - r[1]) / 40) % 2 === 0) ctx.fillRect(x, y, Math.min(40, r[0] + r[2] - x), Math.min(40, r[1] + r[3] - y)); }
      ctx.strokeStyle = 'rgba(255,255,255,.16)'; ctx.lineWidth = 3; for (const d of map.doors) { ctx.beginPath(); if (rects.some(q => q.wall && Math.abs(q.y + q.h / 2 - d.y) < 2 && q.w > q.h)) { ctx.moveTo(d.x - DW / 2, d.y); ctx.lineTo(d.x + DW / 2, d.y); } else { ctx.moveTo(d.x, d.y - DW / 2); ctx.lineTo(d.x, d.y + DW / 2); } ctx.setLineDash([6, 6]); ctx.stroke(); ctx.setLineDash([]); }
    } else { ctx.fillStyle = '#16301f'; ctx.fillRect(ARENA.x, ARENA.y, ARENA.w, ARENA.h); ctx.fillStyle = '#1b3a26'; for (let i = 0; i < 12; i++) ctx.fillRect(ARENA.x + i * 80 + 40, ARENA.y, 40, ARENA.h); }
    ctx.fillStyle = '#0e1f15'; ctx.fillRect(0, 0, W, ARENA.y); ctx.fillRect(0, H - ARENA.y, W, ARENA.y); ctx.fillRect(0, 0, ARENA.x, H); ctx.fillRect(W - ARENA.x, 0, ARENA.x, H);
    ctx.strokeStyle = '#e8dcc8'; ctx.lineWidth = 6; ctx.strokeRect(ARENA.x, ARENA.y, ARENA.w, ARENA.h);
  }
  function drawRects() {
    const cols = ['#ff8a3a', '#3ac8ff', '#ffd23f', '#c77dff'];
    rects.forEach((r, i) => {
      ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(r.x + 4, r.y + 6, r.w, r.h);
      if (r.wall) { ctx.fillStyle = '#efe6d4'; ctx.fillRect(r.x, r.y, r.w, r.h); ctx.strokeStyle = '#6a5a48'; ctx.lineWidth = 2; ctx.strokeRect(r.x, r.y, r.w, r.h); return; }
      const g = ctx.createLinearGradient(r.x, r.y, r.x, r.y + r.h); g.addColorStop(0, cols[i % 4]); g.addColorStop(1, '#222'); ctx.fillStyle = g;
      const rr = Math.min(10, r.w / 2, r.h / 2); ctx.beginPath(); ctx.roundRect(r.x, r.y, r.w, r.h, rr); ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.22)'; ctx.beginPath(); ctx.roundRect(r.x + 4, r.y + 3, r.w - 8, Math.min(8, r.h / 3), 4); ctx.fill();
    });
  }
  function drawEnt(e) {
    if (!e.alive) return;
    ctx.save(); ctx.translate(e.x, e.y);
    ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(2, 6, e.r, e.r * 0.7, 0, 0, TAU); ctx.fill();
    ctx.rotate(e.face);
    ctx.fillStyle = '#333'; ctx.fillRect(6, -4, 24, 8); ctx.fillStyle = e.gun.col; ctx.fillRect(22, -5, 10, 10); if (e.gun.big) ctx.fillRect(16, -7, 8, 14);
    ctx.fillStyle = e.flash > 0 ? '#fff' : e.col; ctx.beginPath(); ctx.arc(0, 0, e.r, 0, TAU); ctx.fill();
    ctx.save(); ctx.beginPath(); ctx.arc(0, 0, e.r, 0, TAU); ctx.clip(); ctx.rotate(-e.face); for (const s of e.stains) { ctx.fillStyle = s.col; ctx.beginPath(); ctx.arc(Math.cos(s.a) * e.r * s.d, Math.sin(s.a) * e.r * s.d, s.r, 0, TAU); ctx.fill(); } ctx.restore();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#111'; ctx.beginPath(); ctx.roundRect(2, -9, 11, 18, 4); ctx.fill(); ctx.fillStyle = '#9fe8ff'; ctx.fillRect(6, -7, 5, 14);
    ctx.restore();
    ctx.font = 'bold 11px ' + FONT; ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.fillText(e.name, e.x, e.y - e.r - 10);
    for (let i = 0; i < 3; i++) { ctx.fillStyle = e.hp > i + 0.5 ? '#ff4a6a' : e.hp > i ? '#a02a3a' : '#2a2a2a'; ctx.fillRect(e.x - 14 + i * 10, e.y - e.r - 7, 8, 4); }
    if (e.rel > 0) { ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(e.x - 14, e.y + e.r + 5, 28, 4); ctx.fillStyle = '#ffd23f'; ctx.fillRect(e.x - 14, e.y + e.r + 5, 28 * (1 - e.rel / e.gun.reload), 4); }
  }
  function drawBullets() {
    for (const b of bullets) {
      ctx.save();
      if (b.lob) { ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(b.x, b.y, 9, 5, 0, 0, TAU); ctx.fill(); ctx.translate(0, -b.h); }
      const a = Math.atan2(b.vy, b.vx); ctx.strokeStyle = b.col; ctx.globalAlpha = 0.35; ctx.lineWidth = b.r * 1.6; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(b.x - Math.cos(a) * 16, b.y - Math.sin(a) * 16); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.globalAlpha = 1;
      ctx.fillStyle = b.col; ctx.beginPath(); ctx.arc(b.x, b.y, b.r + (b.lob ? 3 : 0), 0, TAU); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(b.x - 1, b.y - 1, b.r * 0.4, 0, TAU); ctx.fill();
      ctx.restore();
    }
    for (const p of parts) { ctx.globalAlpha = clamp(p.life * 3, 0, 1); ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill(); } ctx.globalAlpha = 1;
  }
  function label(t, x, y, size, col, al) { ctx.font = 'bold ' + size + 'px ' + FONT; ctx.textAlign = al || 'center'; ctx.fillStyle = col || '#fff'; ctx.fillText(t, x, y); }
  function button(t, x, y, w, h, fn, col) {
    buttons.push({ x, y, w, h, fn }); const hov = mouse.x > x && mouse.x < x + w && mouse.y > y && mouse.y < y + h;
    ctx.fillStyle = hov ? '#fff' : col || '#ffb347'; ctx.beginPath(); ctx.roundRect(x, y, w, h, 10); ctx.fill(); label(t, x + w / 2, y + h / 2 + 7, 20, '#1a1208');
  }

  function drawHUD() {
    const p = player();
    ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(28, 28, 230, 56); label('HP', 38, 50, 14, '#fff', 'left');
    for (let i = 0; i < 3; i++) { ctx.fillStyle = p.hp > i + 0.5 ? '#ff4a6a' : p.hp > i ? '#a02a3a' : '#333'; ctx.beginPath(); ctx.roundRect(66 + i * 34, 36, 28, 18, 5); ctx.fill(); }
    label(p.gun.name, 38, 76, 14, p.gun.col, 'left'); label(p.rel > 0 ? 'RELOADING' : p.ammo + ' / ' + p.gun.mag, 250, 76, 14, p.rel > 0 ? '#ffd23f' : '#fff', 'right');
    ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(W - 258, 28, 230, 18 + ents.length * 20); label('ROUND ' + roundNo + '  (first to ' + WIN_ROUNDS + ')', W - 143, 43, 12, '#ddd');
    ents.forEach((e, i) => { ctx.fillStyle = e.col; ctx.beginPath(); ctx.arc(W - 244, 60 + i * 20, 6, 0, TAU); ctx.fill(); label(e.name + (e.alive ? '' : '  (out)'), W - 232, 64 + i * 20, 13, e.alive ? '#fff' : '#777', 'left'); label('★'.repeat(e.wins), W - 40, 64 + i * 20, 13, '#ffd23f', 'right'); });
    feed.forEach((f, i) => label(f.s, W / 2, 46 + i * 18, 14, f.c));
    label('Dash: ' + (p.dashCd > 0 ? (p.dashCd).toFixed(1) + 's' : 'READY'), 38, H - 30, 12, p.dashCd > 0 ? '#999' : '#7affd2', 'left');
  }

  function drawWheel() {
    drawField(); ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(0, 0, W, H);
    label('ROUND ' + roundNo, W / 2, 46, 30, '#ffd23f'); label('Spin the wheel for your blaster!', W / 2, 74, 16, '#cfe');
    const cx = 330, cy = 340, R = 220, seg = TAU / GUNS.length;
    ctx.save(); ctx.translate(cx, cy);
    ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(0, 0, R + 12, 0, TAU); ctx.fill();
    GUNS.forEach((g, i) => {
      const a0 = wheel.rot + i * seg; ctx.fillStyle = g.col; ctx.globalAlpha = 0.9; ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, R, a0, a0 + seg); ctx.fill(); ctx.globalAlpha = 1; ctx.strokeStyle = '#111'; ctx.lineWidth = 3; ctx.stroke();
      ctx.save(); ctx.rotate(a0 + seg / 2); ctx.fillStyle = '#111'; ctx.font = 'bold 15px ' + FONT; ctx.textAlign = 'right'; ctx.fillText(g.name, R - 14, 5); ctx.restore();
    });
    ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(0, 0, 34, 0, TAU); ctx.fill(); ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 4; ctx.stroke(); label('NERF', 0, 6, 14, '#ffd23f');
    ctx.restore();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(cx - 16, cy - R - 26); ctx.lineTo(cx + 16, cy - R - 26); ctx.lineTo(cx, cy - R + 8); ctx.fill(); ctx.strokeStyle = '#111'; ctx.lineWidth = 3; ctx.stroke();
    if (wheel.res < 0 && wheel.wait) label('Spinning...', 760, 340, 22, '#ffd23f');
    else if (wheel.res < 0) button('SPIN!', 650, 300, 220, 64, () => spinWheel(), '#ffd23f'), label('or press Space', 760, 395, 14, '#aaa');
    else if (wheel.spin <= 0) {
      const g = GUNS[wheel.res]; ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.beginPath(); ctx.roundRect(620, 170, 300, 300, 14); ctx.fill();
      label('YOU GOT', 770, 204, 16, '#ccc'); label(g.name.toUpperCase(), 770, 244, 24, g.col); label(g.blurb, 770, 272, 13, '#ddd');
      const rows = [['Damage', (g.dmg * g.n).toFixed(1) + (g.n > 1 ? ' (x' + g.n + ' pellets)' : '') + (g.splash ? ' splash' : '')], ['Fire rate', (1 / g.delay).toFixed(1) + '/s'], ['Magazine', g.mag], ['Reload', g.reload + 's'], ['Range', Math.round(g.range / 10) * 10]];
      rows.forEach((r, i) => { label(r[0], 650, 316 + i * 26, 15, '#9bb', 'left'); label(String(r[1]), 890, 316 + i * 26, 15, '#fff', 'right'); });
      label(net.role === 'off' ? 'Get ready...' : 'Waiting for the other players...', 770, 458, 14, '#ffd23f');
    }
  }

  function drawMenu() {
    drawField(); ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 14; i++) { const a = time * 0.4 + i, x = W / 2 + Math.cos(a * 1.3) * 330, y = 150 + Math.sin(a * 1.7) * 60; ctx.fillStyle = PCOL[i % 4]; ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.arc(x, y, 14 + (i % 3) * 8, 0, TAU); ctx.fill(); } ctx.globalAlpha = 1;
    label('NERF', W / 2, 150, 90, '#ffb347'); label('SPIN & SPLAT', W / 2, 200, 34, '#fff');
    label('Spin the wheel for a blaster, then fight room to room. Camp a doorway or rush!', W / 2, 238, 16, '#cfe');
    button('PLAY vs BOTS', W / 2 - 150, 262, 300, 56, newMatch, '#ffd23f');
    button('PLAY ONLINE', W / 2 - 150, 330, 300, 56, () => { state = S.ONLINE; net.status = ''; }, '#7affd2');
    button('Opponents: ' + opts.bots, W / 2 - 160, 410, 320, 46, () => { opts.bots = opts.bots % 3 + 1; }, '#9fd8ff');
    button('Difficulty: ' + DIFF[opts.diff].name, W / 2 - 160, 464, 320, 46, () => { opts.diff = (opts.diff + 1) % 3; }, '#ff9ae0');
    label('First to ' + WIN_ROUNDS + ' round wins takes the match. 3 hits and you are splatted.', W / 2, 546, 14, '#bcd');
    label('WASD move · mouse aim + click shoot · R reload · Space/Shift dash', W / 2, 572, 14, '#bcd');
  }

  function field(x, y, w, h, text, key, ph) {
    buttons.push({ x, y, w, h, fn: () => { focusF = key; } }); const on = focusF === key;
    ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.beginPath(); ctx.roundRect(x, y, w, h, 8); ctx.fill(); ctx.strokeStyle = on ? '#ffd23f' : '#6a8a7a'; ctx.lineWidth = on ? 3 : 2; ctx.stroke();
    label((text || ph) + (on && Math.floor(time * 2) % 2 ? '|' : ''), x + 14, y + h / 2 + 7, 20, text ? '#fff' : '#789', 'left');
  }
  function drawOnline() {
    drawField(); ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(0, 0, W, H);
    label('PLAY ONLINE', W / 2, 90, 44, '#7affd2'); label('Play with people around the world, or with friends.', W / 2, 124, 15, '#cfe');
    label('USERNAME', W / 2 - 160, 172, 13, '#9bb', 'left'); field(W / 2 - 160, 180, 320, 44, nameStr, 'name', 'type a username');
    button('QUICK MATCH (anyone)', W / 2 - 170, 250, 340, 52, quickMatch, '#ffd23f');
    button('CREATE FRIENDS ROOM', W / 2 - 170, 314, 340, 52, () => createRoom(0), '#9fd8ff');
    label('JOIN A FRIEND', W / 2 - 160, 398, 13, '#9bb', 'left'); field(W / 2 - 160, 406, 200, 44, codeStr, 'code', 'ROOM CODE'); button('JOIN', W / 2 + 56, 406, 104, 44, joinCode, '#ff9ae0');
    button('BACK', W / 2 - 80, 540, 160, 42, () => { state = S.MENU; net.status = ''; }, '#ccc');
    if (net.status) label(net.status, W / 2, 490, 15, '#ffd23f');
    label('Free peer-to-peer connection. Empty slots are filled with bots.', W / 2, 616, 12, '#789');
  }
  function drawLobby() {
    drawField(); ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(0, 0, W, H); const host = net.role === 'host'; const names = host ? roster() : net.names;
    label(net.pub ? 'PUBLIC MATCH' : 'FRIENDS ROOM', W / 2, 84, 40, '#7affd2');
    if (net.code) { label('ROOM CODE', W / 2, 130, 14, '#9bb'); label(net.code, W / 2, 178, 52, '#ffd23f'); label('Friends: PLAY ONLINE > JOIN A FRIEND > type this code', W / 2, 204, 13, '#cfe'); }
    else label('Looking for players around the world...', W / 2, 140, 16, '#cfe');
    for (let i = 0; i < 4; i++) { const y = 236 + i * 58, nm = names[i]; ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.beginPath(); ctx.roundRect(W / 2 - 200, y, 400, 48, 10); ctx.fill(); ctx.fillStyle = PCOL[i]; ctx.beginPath(); ctx.arc(W / 2 - 170, y + 24, 12, 0, TAU); ctx.fill(); label(nm || (net.fill || !host ? 'waiting... (a bot fills in)' : 'waiting...'), W / 2 - 145, y + 31, 20, nm ? '#fff' : '#678', 'left'); if (nm && i === myIdx) label('you', W / 2 + 185, y + 31, 14, '#ffd23f', 'right'); if (i === 0 && nm) label('host', W / 2 + 185, y + 31, 14, '#7affd2', 'right'); }
    if (host) {
      button('START MATCH', W / 2 - 330, 500, 300, 54, startOnlineMatch, '#ffd23f'); button('Bots fill empty slots: ' + (net.fill ? 'ON' : 'OFF'), W / 2 + 30, 500, 300, 54, () => { net.fill = !net.fill; }, '#9fd8ff');
      if (net.pub) label('Starts automatically in ' + Math.max(0, Math.ceil((names.length >= 2 ? 8 : 20) - net.lobbyT)) + 's', W / 2, 580, 14, '#ffd23f');
    } else label('Waiting for the host to start...', W / 2, 530, 18, '#ffd23f');
    button('LEAVE', W / 2 - 70, 590, 140, 40, () => leaveOnline(''), '#ccc');
  }

  function drawFight() {
    ctx.save(); if (shake > 0) ctx.translate(rnd(-shake, shake) * 0.5, rnd(-shake, shake) * 0.5);
    drawField(); drawRects(); ctx.drawImage(paintC, 0, 0); for (const e of ents) drawEnt(e); drawBullets();
    if (state === S.FIGHT || state === S.INTRO) { const p = player(); if (p.alive) { ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(mouse.x, mouse.y, 10, 0, TAU); ctx.moveTo(mouse.x - 15, mouse.y); ctx.lineTo(mouse.x - 5, mouse.y); ctx.moveTo(mouse.x + 5, mouse.y); ctx.lineTo(mouse.x + 15, mouse.y); ctx.moveTo(mouse.x, mouse.y - 15); ctx.lineTo(mouse.x, mouse.y - 5); ctx.moveTo(mouse.x, mouse.y + 5); ctx.lineTo(mouse.x, mouse.y + 15); ctx.stroke(); } }
    ctx.restore();
    drawHUD();
    if (state === S.INTRO) { const n = Math.ceil(3 - stateT); label(map.name.toUpperCase(), W / 2, 130, 28, '#ffd23f'); label(n > 0 ? String(n) : 'GO!', W / 2, 330, 110, '#fff'); label('Bots: ' + ents.slice(1).map(e => e.name.split(' ')[0] + ' ' + e.gun.name).join(' · '), W / 2, 590, 13, '#ddd'); }
    if (player().rw && player().rw.t > 0 && player().alive) {
      const p = player(), rw = p.rw, a = rw.e ? Math.atan2(rw.e.y - p.y, rw.e.x - p.x) : rw.ang, k = Math.min(1, rw.t * 2), pulse = 0.65 + Math.sin(time * 22) * 0.35;
      const gr = ctx.createRadialGradient(W / 2, H / 2, 230, W / 2, H / 2, 520); gr.addColorStop(0, 'rgba(255,40,40,0)'); gr.addColorStop(1, 'rgba(255,40,40,' + 0.45 * k * pulse + ')'); ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = k; label('RUSH!', W / 2, 150, 84, '#ff3a3a'); label((rw.name || (rw.e && rw.e.name) || 'Someone') + ' is rushing you', W / 2, 180, 16, '#fff');
      ctx.save(); ctx.translate(p.x + Math.cos(a) * 46, p.y + Math.sin(a) * 46); ctx.rotate(a); ctx.fillStyle = '#ff3a3a'; ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(-8, -10); ctx.lineTo(-8, 10); ctx.fill(); ctx.restore(); ctx.globalAlpha = 1;
    }
    if (state === S.FIGHT && !player().alive) label('You are out! Watching the round...', W / 2, 600, 16, '#ffd23f');
    if (state === S.ROUNDEND) { ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(0, H / 2 - 60, W, 120); label(winner ? (winner === player() ? 'YOU WIN THE ROUND!' : winner.name + ' wins the round') : 'DRAW', W / 2, H / 2 + 12, 44, winner === player() ? '#7affd2' : '#ff9a9a'); }
  }

  function drawMatchEnd() {
    drawFight(); ctx.fillStyle = 'rgba(0,0,0,.75)'; ctx.fillRect(0, 0, W, H);
    const w = ents.reduce((a, b) => (b.wins > a.wins ? b : a), ents[0]);
    label(w !== player() ? w.name.toUpperCase() + ' WINS THE MATCH' : 'YOU WIN THE MATCH!', W / 2, 220, 44, w !== player() ? '#ff9a9a' : '#ffd23f');
    ents.forEach((e, i) => label(e.name + '   ' + '★'.repeat(e.wins) + '   splats: ' + (e.kills || 0), W / 2, 290 + i * 30, 20, e.col));
    if (net.role === 'off') { button('PLAY AGAIN', W / 2 - 330, 460, 300, 58, newMatch, '#ffd23f'); button('MENU', W / 2 + 30, 460, 300, 58, () => { state = S.MENU; }, '#9fd8ff'); }
    else { if (net.role === 'host') button('PLAY AGAIN', W / 2 - 330, 460, 300, 58, startOnlineMatch, '#ffd23f'); else label('Waiting for the host...', W / 2 - 180, 497, 18, '#ffd23f'); button('LEAVE', W / 2 + 30, 460, 300, 58, () => leaveOnline(''), '#9fd8ff'); }
  }

  function draw() {
    buttons = [];
    if (state === S.MENU) drawMenu(); else if (state === S.ONLINE) drawOnline(); else if (state === S.LOBBY) drawLobby(); else if (state === S.WHEEL) drawWheel(); else if (state === S.MATCHEND) drawMatchEnd(); else drawFight();
  }

  // ------------------------------------------------------------------ online (peer-to-peer via PeerJS; the host runs the game)
  const sanitize = t => String(t || '').replace(/[^A-Za-z0-9 _-]/g, '').trim().slice(0, 12);
  function netSend(m) { if (net.host && net.host.open) net.host.send(m); }
  function bcast(m) { for (const c of net.clients) if (c.conn.open) c.conn.send(m); }
  function peerOK() { if (typeof Peer === 'undefined') { net.status = 'Online play could not load (peerjs.min.js missing).'; return false; } return true; }
  function checkName() { nameStr = sanitize(nameStr); if (nameStr.length < 2) { net.status = 'Pick a username first (2-12 letters or numbers).'; focusF = 'name'; return false; } try { localStorage.setItem('nerfName', nameStr); } catch (e) { /* no storage */ } return true; }
  function closePeer() { try { if (net.peer) net.peer.destroy(); } catch (e) { /* already closed */ } net.peer = null; net.host = null; net.clients = []; net.pending = null; net.locked = false; }
  function leaveOnline(msg) { if (net.role === 'host') bcast({ t: 'bye' }); closePeer(); net.role = 'off'; net.pub = false; net.code = ''; net.status = msg || ''; ents = []; myIdx = 0; bullets = []; paint.clearRect(0, 0, W, H); state = S.ONLINE; }
  function startHost(id, ok, fail) {
    let fin = false; const p = new Peer(id);
    const end = (f, a) => { if (fin) return; fin = true; f(a); };
    p.on('open', () => end(() => { net.peer = p; net.role = 'host'; net.clients = []; net.locked = false; p.on('connection', hostConn); p.on('error', e => { net.status = 'Connection problem: ' + (e.type || e); }); ok(); }));
    p.on('error', e => end(() => { try { p.destroy(); } catch (x) { /* ignore */ } fail(e.type || 'error'); }));
    setTimeout(() => end(() => { try { p.destroy(); } catch (x) { /* ignore */ } fail('timeout'); }), 9000);
  }
  function joinRoom(id, ok, fail) {
    let fin = false; const p = new Peer();
    const end = (f, a) => { if (fin) return; fin = true; net.pending = null; f(a); };
    net.pending = { ok: () => end(ok), fail: why => end(() => { try { p.destroy(); } catch (x) { /* ignore */ } if (net.role === 'client') { net.role = 'off'; net.host = null; } fail(why); }) };
    p.on('open', () => {
      const c = p.connect(id, { reliable: true });
      c.on('open', () => { net.peer = p; net.host = c; net.role = 'client'; c.send({ t: 'hello', name: nameStr }); });
      c.on('data', clientMsg);
      c.on('close', () => { if (net.role === 'client' && net.host === c) leaveOnline('Disconnected from the host.'); });
      c.on('error', () => net.pending && net.pending.fail('conn'));
    });
    p.on('error', e => net.pending && net.pending.fail(e.type || 'error'));
    setTimeout(() => net.pending && net.pending.fail('timeout'), 9000);
  }
  function quickMatch() { if (!checkName() || !peerOK()) return; net.pub = true; net.code = ''; tryPublic(1); }
  function tryPublic(n) {
    if (n > 10) { net.status = 'Could not find a room. Try again.'; return; }
    net.status = 'Looking for a room (' + n + ')...';
    startHost('spinsplat-pub-' + n, enterLobby, why => {
      if (why === 'unavailable-id') joinRoom('spinsplat-pub-' + n, () => { }, () => tryPublic(n + 1));
      else net.status = 'Could not reach the online service (' + why + '). Check your connection.';
    });
  }
  function createRoom(tries) {
    if (!checkName() || !peerOK()) return; net.pub = false; const code = Array.from({ length: 5 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join(''); net.status = 'Creating room...';
    startHost('spinsplat-priv-' + code, () => { net.code = code; enterLobby(); }, why => { if (why === 'unavailable-id' && (tries || 0) < 5) createRoom((tries || 0) + 1); else net.status = 'Could not create a room (' + why + ').'; });
  }
  function joinCode() {
    if (!checkName() || !peerOK()) return; const c = codeStr.toUpperCase().replace(/[^A-Z0-9]/g, ''); if (c.length !== 5) { net.status = 'Room codes are 5 letters/numbers.'; focusF = 'code'; return; }
    net.status = 'Joining ' + c + '...'; net.pub = false; net.code = c; joinRoom('spinsplat-priv-' + c, () => { }, why => { net.code = ''; net.status = why === 'full' ? 'That room is full or already playing.' : 'Room not found.'; });
  }
  function enterLobby() { state = S.LOBBY; net.lobbyT = 0; net.names = [nameStr]; net.locked = false; net.status = ''; }
  const uniqueName = n => { let b = n || 'Guest', k = 1, name = b; const used = () => [nameStr].concat(net.clients.map(c => c.name)); while (used().includes(name)) name = b.slice(0, 10) + (++k); return name; };
  const roster = () => [nameStr].concat(net.clients.map(c => c.name));
  function hostConn(c) {
    c.on('data', m => hostMsg(c, m)); c.on('close', () => hostDrop(c));
  }
  function hostMsg(c, m) {
    if (!m || typeof m !== 'object') return; const cl = net.clients.find(x => x.conn === c);
    if (m.t === 'hello') {
      if (cl) return; if (net.locked || net.clients.length >= 3 || state !== S.LOBBY) { c.send({ t: 'full' }); setTimeout(() => { try { c.close(); } catch (e) { /* ignore */ } }, 400); return; }
      const n = { conn: c, name: uniqueName(sanitize(m.name)), e: null }; net.clients.push(n); net.lobbyT = 0; c.send({ t: 'w', idx: net.clients.length, names: roster(), code: net.code }); bcast({ t: 'r', names: roster() });
    } else if (!cl || !cl.e) return;
    else if (m.t === 'in') cl.e.inp = { mx: clamp(+m.mx || 0, -1, 1), my: clamp(+m.my || 0, -1, 1), ax: clamp(+m.ax || 0, 0, W), ay: clamp(+m.ay || 0, 0, H), f: m.f ? 1 : 0 };
    else if (m.t === 'dash') { if (state === S.FIGHT) doDash(cl.e); } else if (m.t === 'rel') { if (state === S.FIGHT) doReload(cl.e); }
    else if (m.t === 'spin') { if (state === S.WHEEL && cl.e.wres < 0) { const r = Math.floor(Math.random() * GUNS.length); cl.e.wres = r; cl.e.spunAt = time; c.send({ t: 'wres', r }); } }
  }
  function hostDrop(c) {
    const k = net.clients.findIndex(x => x.conn === c); if (k < 0) return; const cl = net.clients[k]; net.clients.splice(k, 1);
    if (cl.e) { cl.e.isBot = true; cl.e.remote = null; cl.e.name = cl.e.name + ' (bot)'; cl.e.ai.mode = 'rush'; cl.e.ai.flow = null; if (!cl.e.gun) cl.e.gun = GUNS[0]; feed.unshift({ t: 4, s: cl.e.name + ' left - a bot took over', c: '#ccc' }); } else bcast({ t: 'r', names: roster() });
  }
  function startOnlineMatch() {
    net.locked = true; const names = roster(); ents = names.map((n, i) => mkEnt(i, n, false));
    net.clients.forEach((cl, i) => { cl.e = ents[i + 1]; ents[i + 1].remote = cl.conn; });
    while (ents.length < 4 && net.fill) { const i = ents.length; ents.push(mkEnt(i, BOTNAMES[i - names.length] || 'Bot ' + i, true)); }
    myIdx = 0; roundNo = 0; winner = null; const all = ents.map(e => e.name);
    net.clients.forEach((cl, i) => cl.conn.send({ t: 'go', names: all, nh: names.length, you: i + 1 })); startWheel();
  }
  function buildSnap() {
    const sn = { t: 's', st: state, sT: +stateT.toFixed(2), mp: MAPS.indexOf(map), rn: roundNo, rc: net.rc, w: winner ? winner.i : -1,
      e: ents.map(e => [Math.round(e.x), Math.round(e.y), +e.face.toFixed(2), +e.hp.toFixed(2), e.alive ? 1 : 0, GUNS.indexOf(e.gun), e.ammo, +Math.max(0, e.rel).toFixed(2), e.wins, +e.flash.toFixed(2), +Math.max(0, e.dashCd).toFixed(1), e.kills || 0]),
      b: bullets.map(b => [Math.round(b.x), Math.round(b.y), Math.round(b.vx), Math.round(b.vy), b.r, b.own.i, b.lob ? 1 : 0, Math.round(b.h)]), sp: net.ev.sp, hs: net.ev.hs, fd: net.ev.fd };
    net.ev = { sp: [], hs: [], fd: [] }; return sn;
  }
  function hostNet(dt) {
    if (state === S.LOBBY) {
      net.lobbyT += dt; const n = 1 + net.clients.length;
      if (net.pub && (n >= 4 || net.lobbyT > (n >= 2 ? 8 : 20))) startOnlineMatch();
      return;
    }
    net.snapT += dt; if (net.snapT < 0.05) return; net.snapT = 0; const sn = buildSnap();
    for (const cl of net.clients) if (cl.conn.open && cl.e) { const rw = cl.e.rw; sn.rw = rw && rw.t > 0 && rw.e ? [+rw.t.toFixed(2), +Math.atan2(rw.e.y - cl.e.y, rw.e.x - cl.e.x).toFixed(2), rw.e.name] : null; cl.conn.send(sn); }
  }
  function clientMsg(m) {
    if (!m || typeof m !== 'object') return;
    if (m.t === 'w') { myIdx = m.idx; net.names = m.names; net.code = m.code || net.code; state = S.LOBBY; net.status = ''; if (net.pending) net.pending.ok(); }
    else if (m.t === 'full') { if (net.pending) net.pending.fail('full'); }
    else if (m.t === 'r') net.names = m.names;
    else if (m.t === 'bye') leaveOnline('The host closed the room.');
    else if (m.t === 'go') {
      ents = m.names.map((n, i) => { const e = mkEnt(i, n, i >= m.nh); e.tx = e.x = 480; e.ty = e.y = 320; return e; }); myIdx = m.you; roundNo = 0; winner = null; bullets = []; parts = []; feed = []; paint.clearRect(0, 0, W, H);
      state = S.WHEEL; wheel.res = -1; wheel.spin = 0; wheel.wait = false;
    } else if (m.t === 'wres') spinWheel(m.r);
    else if (m.t === 's') applySnap(m);
  }
  function applySnap(m) {
    if (!ents.length) return; const was = state;
    if (m.st === S.WHEEL && was !== S.WHEEL) { wheel.res = -1; wheel.spin = 0; wheel.wait = false; }
    state = m.st; stateT = m.sT; roundNo = m.rn;
    if (m.mp >= 0 && MAPS[m.mp] !== map) { map = MAPS[m.mp]; rects = map.r.map(a => Object.assign({}, a)); }
    if (m.rc !== net.rc) { net.rc = m.rc; paint.clearRect(0, 0, W, H); bullets = []; for (const e of ents) e.stains = []; }
    m.e.forEach((a, i) => {
      const e = ents[i]; if (!e) return; const first = !e.seen; e.seen = true; e.tx = a[0]; e.ty = a[1]; if (first || a[4] !== (e.alive ? 1 : 0) || Math.hypot(e.x - e.tx, e.y - e.ty) > 120) { e.x = e.tx; e.y = e.ty; }
      if (i !== myIdx || state !== S.FIGHT) e.face = a[2]; const hpOld = e.hp; e.hp = a[3]; e.alive = !!a[4]; e.gun = GUNS[a[5]] || GUNS[0]; e.ammo = a[6]; e.rel = a[7]; e.wins = a[8]; e.flash = a[9]; e.dashCd = a[10]; e.kills = a[11];
      if (i === myIdx && e.hp < hpOld - 0.01) { shake = Math.max(shake, 4); blip(180, 0.1, 'sawtooth', 0.05, 0.6); }
    });
    winner = m.w >= 0 ? ents[m.w] : null;
    bullets = m.b.map(b => ({ x: b[0], y: b[1], vx: b[2], vy: b[3], r: b[4], col: PCOL[b[5]], lob: !!b[6], h: b[7], t: 0, life: 1 }));
    for (const a of m.sp) drawSplat(a[0], a[1], a[2], PCOL[a[3]] || '#fff', a[4]);
    for (const a of m.hs) { const e = ents[a[0]]; if (e) { e.stains.push({ a: a[1], d: a[2], r: a[3], col: PCOL[a[4]] }); if (e.stains.length > 16) e.stains.shift(); } }
    for (const a of m.fd) if (ents[a[0]] && ents[a[1]]) { feed.unshift({ t: 4, s: ents[a[0]].name + ' splatted ' + ents[a[1]].name, c: PCOL[a[0]] }); if (feed.length > 4) feed.pop(); }
    const me = player(); if (me) { if (m.rw && !(me.rw && me.rw.t > 0.3)) { me.rw = { t: m.rw[0], ang: m.rw[1], name: m.rw[2] }; blip(980, 0.12, 'square', 0.06); setTimeout(() => blip(780, 0.16, 'square', 0.06), 130); } else if (!m.rw && me.rw && me.rw.t <= 0) me.rw = null; }
  }
  function clientUpdate(dt) {
    time += dt; shake = Math.max(0, shake - dt * 30);
    for (const f of feed) f.t -= dt; feed = feed.filter(f => f.t > 0);
    for (const p of parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.93; p.vy *= 0.93; p.life -= dt; } parts = parts.filter(p => p.life > 0);
    if (state === S.WHEEL) wheelTick(dt); else stateT += dt;
    for (const e of ents) { if (e.tx !== undefined) { const k = Math.min(1, 16 * dt); e.x += (e.tx - e.x) * k; e.y += (e.ty - e.y) * k; } if (e.rw) { e.rw.t -= dt; if (e.rw.t <= 0) e.rw = null; } }
    for (const b of bullets) { b.x += b.vx * dt; b.y += b.vy * dt; }
    net.inT += dt; if (net.inT > 0.033 && (state === S.FIGHT || state === S.INTRO)) { net.inT = 0; const c = localInput(); const me = player(); if (me) { me.face = Math.atan2(c.ay - me.y, c.ax - me.x); } netSend({ t: 'in', mx: c.mx, my: c.my, ax: Math.round(c.ax), ay: Math.round(c.ay), f: c.f }); }
  }

  // ------------------------------------------------------------------ input & loop
  function mpos(ev) { const r = cv.getBoundingClientRect(); mouse.x = (ev.clientX - r.left) / r.width * W; mouse.y = (ev.clientY - r.top) / r.height * H; }
  cv.addEventListener('mousemove', mpos);
  cv.addEventListener('mousedown', ev => { mpos(ev); mouse.down = true; for (const b of buttons) if (mouse.x > b.x && mouse.x < b.x + b.w && mouse.y > b.y && mouse.y < b.y + b.h) { b.fn(); mouse.down = false; blip(520, 0.06, 'triangle', 0.04); return; } });
  window.addEventListener('mouseup', () => { mouse.down = false; });
  cv.addEventListener('contextmenu', ev => ev.preventDefault());
  window.addEventListener('keydown', ev => {
    if (state === S.ONLINE && focusF) {
      if (ev.key === 'Backspace') { if (focusF === 'name') nameStr = nameStr.slice(0, -1); else codeStr = codeStr.slice(0, -1); ev.preventDefault(); }
      else if (ev.key === 'Enter') { if (focusF === 'code') joinCode(); else quickMatch(); }
      else if (ev.key === 'Escape') focusF = null;
      else if (ev.key.length === 1) { if (focusF === 'name' && /[A-Za-z0-9 _-]/.test(ev.key) && nameStr.length < 12) nameStr += ev.key; else if (focusF === 'code' && /[A-Za-z0-9]/.test(ev.key) && codeStr.length < 5) codeStr += ev.key.toUpperCase(); ev.preventDefault(); }
      return;
    }
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(ev.code)) ev.preventDefault();
    keys.add(ev.code);
    if (ev.code === 'KeyM') muted = !muted;
    if (state === S.WHEEL && (ev.code === 'Space' || ev.code === 'Enter')) spinWheel();
    else if (state === S.MENU && ev.code === 'Enter') newMatch();
    else if (state === S.FIGHT) { const p = player(); if (ev.code === 'KeyR') { if (net.role === 'client') netSend({ t: 'rel' }); else doReload(p); } if (ev.code === 'Space' || ev.code === 'ShiftLeft' || ev.code === 'ShiftRight') { if (net.role === 'client') netSend({ t: 'dash' }); else doDash(p); } }
    else if (state === S.MATCHEND && ev.code === 'Enter') newMatch();
  });
  window.addEventListener('keyup', ev => keys.delete(ev.code));
  window.addEventListener('blur', () => { keys.clear(); mouse.down = false; });

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.033, (now - last) / 1000); last = now;
    if (net.role === 'client') clientUpdate(dt); else { const steps = net.role === 'off' && state === S.FIGHT && ents[0] && !ents[0].alive ? 3 : 1; for (let i = 0; i < steps; i++) update(dt); if (net.role === 'host') hostNet(dt); }
    draw(); requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  if (location.hash === '#debug') window.__nerf = { net, hostStart: startOnlineMatch, setName: n => { nameStr = n; }, quick: quickMatch, create: createRoom, join: c => { codeStr = c; joinCode(); }, me: () => myIdx, checkMaps: () => MAPS.map(m => { map = m; rects = m.r.map(a => Object.assign({}, a)); buildNav(); const d = flowTo(70, 80); let free = 0, reach = 0; nav.free.forEach((f, i) => { if (f) { free++; if (d[i] < 9999) reach++; } }); return [m.name, [[890, 80], [70, 560], [890, 560]].map(p => d[cellOf(p[0], p[1])]), free, reach, m.doors.length, [[70, 80], [890, 80], [70, 560], [890, 560]].map(p => nav.free[cellOf(p[0], p[1])])]; }), step: dt => update(dt), st: () => ({ state, roundNo, wins: ents.map(e => e.wins), hp: ents.map(e => e.hp), alive: ents.map(e => e.alive), guns: ents.map(e => e.gun.name), map: map && map.name, rush: ents[myIdx] && ents[myIdx].rw && ents[myIdx].rw.t, modes: ents.map(e => e.ai.mode) }), ents: () => ents, newMatch, spin: spinWheel, wheel: () => wheel, opts, mouse, keys, S, setBot: () => { ents[0].isBot = true; }, bullets: () => bullets };
})();
