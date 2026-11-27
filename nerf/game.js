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

  // ------------------------------------------------------------------ arenas: [x, y, w, h] bunkers
  const MAPS = [
    { name: 'Bunker Yard', col: ['#ff8a3a', '#ffd23f'], r: [[430, 270, 100, 100], [200, 140, 70, 70], [690, 140, 70, 70], [200, 430, 70, 70], [690, 430, 70, 70], [330, 70, 14, 130], [616, 70, 14, 130], [330, 440, 14, 130], [616, 440, 14, 130]] },
    { name: 'Crossfire', col: ['#3ac8ff', '#7affd2'], r: [[300, 190, 360, 26], [300, 424, 360, 26], [120, 300, 110, 40], [730, 300, 110, 40], [455, 300, 50, 40]] },
    { name: 'Pillar Park', col: ['#c77dff', '#ff7ad9'], r: [[190, 110, 56, 56], [452, 110, 56, 56], [714, 110, 56, 56], [190, 292, 56, 56], [452, 292, 56, 56], [714, 292, 56, 56], [190, 474, 56, 56], [452, 474, 56, 56], [714, 474, 56, 56]] },
    { name: 'The Maze', col: ['#5aff7a', '#ffe27a'], r: [[160, 100, 240, 24], [560, 100, 240, 24], [160, 516, 240, 24], [560, 516, 240, 24], [120, 200, 24, 240], [816, 200, 24, 240], [400, 260, 160, 24], [400, 356, 160, 24]] }
  ];
  const BOTNAMES = ['Red Rex', 'Green Gus', 'Yellow Yuki'], PCOL = ['#3a8dff', '#ff4a4a', '#3ad65a', '#ffd23f'];
  const DIFF = [{ name: 'EASY', err: 0.3, turn: 4, speed: 150, react: 0.35 }, { name: 'NORMAL', err: 0.15, turn: 7, speed: 175, react: 0.2 }, { name: 'HARD', err: 0.06, turn: 12, speed: 195, react: 0.08 }];

  // ------------------------------------------------------------------ state
  const S = { MENU: 0, WHEEL: 1, INTRO: 2, FIGHT: 3, ROUNDEND: 4, MATCHEND: 5 };
  let state = S.MENU, stateT = 0, time = 0;
  let opts = { bots: 3, diff: 1 };
  let ents = [], bullets = [], parts = [], rects = [], feed = [], map = null, roundNo = 0, banner = '', winner = null, shake = 0;
  const keys = new Set(), mouse = { x: W / 2, y: H / 2, down: false };
  const paintC = document.createElement('canvas'); paintC.width = W; paintC.height = H; const paint = paintC.getContext('2d');
  let wheel = { rot: 0, spin: 0, dur: 0, from: 0, to: 0, res: -1, lastSeg: 0, bots: [] };
  let buttons = [];

  const player = () => ents[0];
  const alive = () => ents.filter(e => e.alive);

  function mkEnt(i, name, isBot) {
    return { i, name, col: PCOL[i], isBot, x: 0, y: 0, vx: 0, vy: 0, r: 14, hp: 3, alive: true, gun: GUNS[0], ammo: 0, rel: 0, fireT: 0, burstLeft: 0, burstT: 0, face: 0, aimX: 0, aimY: 0, stains: [], dashT: 0, dashCd: 0, wins: 0, flash: 0, ai: { sd: 1, sdT: 1, err: 0, errT: 0, stuck: 0, lx: 0, ly: 0, react: 0 } };
  }

  function newMatch() {
    ents = [mkEnt(0, 'You', false)];
    for (let i = 1; i <= opts.bots; i++) ents.push(mkEnt(i, BOTNAMES[i - 1], true));
    roundNo = 0; startWheel();
  }

  function startWheel() {
    roundNo++; state = S.WHEEL; stateT = 0; wheel.res = -1; wheel.spin = 0; wheel.bots = []; feed = [];
    for (const e of ents) e.gun = GUNS[0];
  }

  function spinWheel() {
    if (wheel.spin > 0 || wheel.res >= 0) return;
    const seg = TAU / GUNS.length, r = Math.floor(Math.random() * GUNS.length);
    wheel.res = r; wheel.from = wheel.rot; wheel.to = wheel.rot + TAU * 5 + (((-Math.PI / 2 - (r + 0.5) * seg - wheel.rot + rnd(-seg * 0.35, seg * 0.35)) % TAU) + TAU) % TAU; wheel.spin = 4.2; wheel.dur = 4.2; wheel.lastSeg = -1;
    blip(300, 0.1, 'triangle', 0.05);
  }

  function startRound() {
    state = S.INTRO; stateT = 0; map = pick(MAPS); rects = map.r.map(a => ({ x: a[0], y: a[1], w: a[2], h: a[3] }));
    bullets = []; parts = []; paint.clearRect(0, 0, W, H);
    const sp = [[70, 70], [890, 70], [70, 570], [890, 570]].sort(() => Math.random() - 0.5);
    ents.forEach((e, i) => {
      e.x = sp[i][0]; e.y = sp[i][1]; e.vx = e.vy = 0; e.hp = 3; e.alive = true; e.stains = []; e.rel = 0; e.fireT = 0.4; e.burstLeft = 0; e.dashT = 0; e.dashCd = 0; e.flash = 0;
      e.face = Math.atan2(H / 2 - e.y, W / 2 - e.x); if (e.isBot || i > 0) { e.gun = i === 0 ? e.gun : pick(GUNS); } e.ammo = e.gun.mag; e.ai.react = 0; e.ai.sd = Math.random() < 0.5 ? 1 : -1;
    });
    ents[0].gun = GUNS[wheel.res]; ents[0].ammo = ents[0].gun.mag;
    wheel.bots = ents.slice(1).map(e => e.gun);
  }

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
  function splat(x, y, r, col, a) {
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
    const a = Math.atan2(by2 - e.y, bx - e.x); e.stains.push({ a, d: rnd(0.1, 0.8), r: rnd(3, 7), col: by.col }); if (e.stains.length > 16) e.stains.shift();
    spark(bx, by2, by.col, 8, 190); splat(bx, by2, 7 + d * 5, by.col, 0.8); blip(180, 0.1, 'sawtooth', 0.05, 0.6);
    if (e.hp <= 0) {
      e.alive = false; by.kills = (by.kills || 0) + 1; splat(e.x, e.y, 34, by.col, 0.9); spark(e.x, e.y, by.col, 26, 260); shake = 9; blip(110, 0.3, 'sawtooth', 0.07, 0.4);
      feed.unshift({ t: 4, s: by.name + ' splatted ' + e.name, c: by.col }); if (feed.length > 4) feed.pop();
    }
  }
  function explode(b) {
    splat(b.x, b.y, 38, b.col, 0.9); spark(b.x, b.y, b.col, 24, 280); shake = Math.max(shake, 6); blip(90, 0.35, 'sawtooth', 0.07, 0.4);
    for (const e of ents) if (e.alive && e.i !== b.own.i && Math.hypot(e.x - b.x, e.y - b.y) < b.splash + e.r) damage(e, b.dmg * (1 - Math.hypot(e.x - b.x, e.y - b.y) / (b.splash + e.r) * 0.45), b.own, b.x, b.y);
  }

  // ------------------------------------------------------------------ AI
  function botThink(e, dt) {
    const D = DIFF[opts.diff], ai = e.ai; let tgt = null, bd = 1e9;
    for (const o of ents) if (o.alive && o !== e) { const d = Math.hypot(o.x - e.x, o.y - e.y) * (los(e.x, e.y, o.x, o.y) ? 1 : 1.6); if (d < bd) { bd = d; tgt = o; } }
    let mx = 0, my = 0;
    ai.sdT -= dt; if (ai.sdT <= 0) { ai.sd = -ai.sd; ai.sdT = rnd(0.7, 2.2); }
    ai.errT -= dt; if (ai.errT <= 0) { ai.err = rnd(-1, 1) * D.err; ai.errT = rnd(0.25, 0.6); }
    if (ai.react > 0) ai.react -= dt;
    if (tgt) {
      const dx = tgt.x - e.x, dy = tgt.y - e.y, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d, vis = los(e.x, e.y, tgt.x, tgt.y), pref = e.gun.pref;
      if (!vis) { mx = ux + -uy * ai.sd * 0.5; my = uy + ux * ai.sd * 0.5; }
      else { const k = d > pref + 40 ? 1 : d < pref - 50 ? -1 : 0; mx = ux * k + -uy * ai.sd * 0.85; my = uy * k + ux * ai.sd * 0.85; }
      for (const b of bullets) if (b.own !== e && !b.lob && Math.hypot(b.x - e.x, b.y - e.y) < 130) { const bs = Math.hypot(b.vx, b.vy), dot = (b.vx * (e.x - b.x) + b.vy * (e.y - b.y)) / (bs * (Math.hypot(b.x - e.x, b.y - e.y) || 1)); if (dot > 0.92 && Math.random() < dt * 4) { ai.sd = -ai.sd; ai.sdT = rnd(0.5, 1.2); if (e.dashCd <= 0 && opts.diff > 0 && Math.random() < 0.4) { e.dashT = 0.16; e.dashCd = 2.2; } } }
      const lead = e.gun.lob ? 0 : clamp(d / e.gun.speed, 0, 1.2) * (0.5 + opts.diff * 0.35), ax = tgt.x + tgt.vx * lead, ay = tgt.y + tgt.vy * lead;
      e.aimX = ax; e.aimY = ay;
      const want = Math.atan2(ay - e.y, ax - e.x) + ai.err, df = angDiff(want, e.face);
      e.face += clamp(df, -D.turn * dt, D.turn * dt);
      if (vis && ai.react <= 0 && d < e.gun.range * 0.95 && Math.abs(angDiff(want, e.face)) < 0.1 + 0.2 / (d / 100 + 1)) tryFire(e);
      if (!vis && e.ammo < e.gun.mag * 0.4 && e.rel <= 0) e.rel = e.gun.reload * 0.7;
      if (ai.react <= 0 && !vis) ai.react = 0;
      if (vis && ai.react <= 0 && !ai.saw) { ai.saw = true; ai.react = D.react; } if (!vis) ai.saw = false;
    }
    ai.stuck += dt; if (ai.stuck > 0.5) { if (Math.hypot(e.x - ai.lx, e.y - ai.ly) < 6) { ai.sd = -ai.sd; ai.sdT = rnd(0.8, 1.6); mx += rnd(-1, 1); my += rnd(-1, 1); e.stuckK = 0.6; } ai.lx = e.x; ai.ly = e.y; ai.stuck = 0; }
    const m = Math.hypot(mx, my) || 1, sp = D.speed * (e.dashT > 0 ? 3 : 1); e.vx += ((mx / m) * sp - e.vx) * Math.min(1, 9 * dt); e.vy += ((my / m) * sp - e.vy) * Math.min(1, 9 * dt);
  }

  // ------------------------------------------------------------------ update
  function updateEnt(e, dt) {
    e.fireT -= dt; e.flash = Math.max(0, e.flash - dt); e.dashCd -= dt; e.dashT -= dt;
    if (e.rel > 0) { e.rel -= dt; if (e.rel <= 0) e.ammo = e.gun.mag; }
    if (e.burstLeft > 0 && e.ammo > 0) { e.burstT -= dt; if (e.burstT <= 0) { shotOnce(e); e.burstLeft--; e.burstT = 0.07; } } else e.burstLeft = 0;
    if (!e.isBot) {
      let dx = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0), dy = (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0);
      const m = Math.hypot(dx, dy) || 1, sp = 205 * (e.dashT > 0 ? 3 : 1); e.vx += (dx / m * sp - e.vx) * Math.min(1, 12 * dt); e.vy += (dy / m * sp - e.vy) * Math.min(1, 12 * dt);
      e.aimX = mouse.x; e.aimY = mouse.y; e.face = Math.atan2(mouse.y - e.y, mouse.x - e.x);
      if (mouse.down) tryFire(e);
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
    for (const f of feed) f.t -= dt; feed = feed.filter(f => f.t > 0);
    for (const p of parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.93; p.vy *= 0.93; p.life -= dt; } parts = parts.filter(p => p.life > 0);
    if (state === S.WHEEL) {
      if (wheel.spin > 0) {
        wheel.spin -= dt; const k = 1 - clamp(wheel.spin / wheel.dur, 0, 1), e = 1 - Math.pow(1 - k, 3.2); wheel.rot = wheel.from + (wheel.to - wheel.from) * e;
        const seg = Math.floor((((-Math.PI / 2 - wheel.rot) % TAU) + TAU) % TAU / (TAU / GUNS.length)); if (seg !== wheel.lastSeg) { wheel.lastSeg = seg; blip(500 + (seg % 3) * 60, 0.03, 'triangle', 0.03); }
        if (wheel.spin <= 0) { wheel.rot = wheel.to; stateT = 0; blip(660, 0.25, 'triangle', 0.07, 1.5); }
      } else if (wheel.res >= 0 && stateT > 2.2) startRound();
    } else if (state === S.INTRO) {
      for (const e of ents) if (e.alive) { e.vx *= 0.8; e.vy *= 0.8; if (!e.isBot) { e.aimX = mouse.x; e.aimY = mouse.y; e.face = Math.atan2(mouse.y - e.y, mouse.x - e.x); } }
      if (stateT > 3) { state = S.FIGHT; stateT = 0; blip(880, 0.3, 'square', 0.06); }
    } else if (state === S.FIGHT) {
      for (const e of ents) if (e.alive) updateEnt(e, dt);
      updateBullets(dt);
      const al = alive(); if (al.length <= 1) { winner = al[0] || null; if (winner) winner.wins++; state = S.ROUNDEND; stateT = 0; banner = winner ? (winner.isBot ? winner.name + ' wins the round' : 'YOU WIN THE ROUND!') : 'DRAW'; blip(winner && !winner.isBot ? 784 : 200, 0.5, 'triangle', 0.07); }
    } else if (state === S.ROUNDEND) {
      updateBullets(dt); for (const e of ents) if (e.alive) { e.vx *= 0.9; e.vy *= 0.9; }
      if (stateT > 3) { if (ents.some(e => e.wins >= WIN_ROUNDS)) { state = S.MATCHEND; stateT = 0; } else startWheel(); }
    }
  }

  // ------------------------------------------------------------------ drawing
  function drawField() {
    ctx.fillStyle = '#16301f'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#1b3a26'; for (let i = 0; i < 12; i++) ctx.fillRect(ARENA.x + i * 80 + 40, ARENA.y, 40, ARENA.h);
    ctx.strokeStyle = 'rgba(255,255,255,.16)'; ctx.lineWidth = 3; ctx.strokeRect(ARENA.x + 6, ARENA.y + 6, ARENA.w - 12, ARENA.h - 12); ctx.beginPath(); ctx.moveTo(W / 2, ARENA.y + 6); ctx.lineTo(W / 2, ARENA.y + ARENA.h - 6); ctx.stroke(); ctx.beginPath(); ctx.arc(W / 2, H / 2, 70, 0, TAU); ctx.stroke();
    ctx.fillStyle = '#0e1f15'; ctx.fillRect(0, 0, W, ARENA.y); ctx.fillRect(0, H - ARENA.y, W, ARENA.y); ctx.fillRect(0, 0, ARENA.x, H); ctx.fillRect(W - ARENA.x, 0, ARENA.x, H);
    ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 4; ctx.strokeRect(ARENA.x, ARENA.y, ARENA.w, ARENA.h);
  }
  function drawRects() {
    const cols = map ? map.col : ['#ff8a3a', '#ffd23f'];
    rects.forEach((r, i) => {
      ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(r.x + 5, r.y + 7, r.w, r.h);
      const g = ctx.createLinearGradient(r.x, r.y, r.x, r.y + r.h); g.addColorStop(0, cols[i % 2]); g.addColorStop(1, '#222'); ctx.fillStyle = g;
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
    if (wheel.res < 0) button('SPIN!', 650, 300, 220, 64, spinWheel, '#ffd23f'), label('or press Space', 760, 395, 14, '#aaa');
    else if (wheel.spin <= 0) {
      const g = GUNS[wheel.res]; ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.beginPath(); ctx.roundRect(620, 170, 300, 300, 14); ctx.fill();
      label('YOU GOT', 770, 204, 16, '#ccc'); label(g.name.toUpperCase(), 770, 244, 24, g.col); label(g.blurb, 770, 272, 13, '#ddd');
      const rows = [['Damage', (g.dmg * g.n).toFixed(1) + (g.n > 1 ? ' (x' + g.n + ' pellets)' : '') + (g.splash ? ' splash' : '')], ['Fire rate', (1 / g.delay).toFixed(1) + '/s'], ['Magazine', g.mag], ['Reload', g.reload + 's'], ['Range', Math.round(g.range / 10) * 10]];
      rows.forEach((r, i) => { label(r[0], 650, 316 + i * 26, 15, '#9bb', 'left'); label(String(r[1]), 890, 316 + i * 26, 15, '#fff', 'right'); });
      label('Get ready...', 770, 458, 14, '#ffd23f');
    }
  }

  function drawMenu() {
    drawField(); ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 14; i++) { const a = time * 0.4 + i, x = W / 2 + Math.cos(a * 1.3) * 330, y = 150 + Math.sin(a * 1.7) * 60; ctx.fillStyle = PCOL[i % 4]; ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.arc(x, y, 14 + (i % 3) * 8, 0, TAU); ctx.fill(); } ctx.globalAlpha = 1;
    label('NERF', W / 2, 150, 90, '#ffb347'); label('SPIN & SPLAT', W / 2, 200, 34, '#fff');
    label('Spin the wheel for a blaster, then fight a paintball round!', W / 2, 238, 16, '#cfe');
    button('PLAY', W / 2 - 120, 280, 240, 64, newMatch, '#ffd23f');
    button('Opponents: ' + opts.bots, W / 2 - 160, 370, 320, 46, () => { opts.bots = opts.bots % 3 + 1; }, '#9fd8ff');
    button('Difficulty: ' + DIFF[opts.diff].name, W / 2 - 160, 428, 320, 46, () => { opts.diff = (opts.diff + 1) % 3; }, '#ff9ae0');
    label('First to ' + WIN_ROUNDS + ' round wins takes the match. 3 hits and you are splatted.', W / 2, 520, 14, '#bcd');
    label('WASD move · mouse aim + click shoot · R reload · Space/Shift dash', W / 2, 548, 14, '#bcd');
  }

  function drawFight() {
    ctx.save(); if (shake > 0) ctx.translate(rnd(-shake, shake) * 0.5, rnd(-shake, shake) * 0.5);
    drawField(); drawRects(); ctx.drawImage(paintC, 0, 0); for (const e of ents) drawEnt(e); drawBullets();
    if (state === S.FIGHT || state === S.INTRO) { const p = player(); if (p.alive) { ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(mouse.x, mouse.y, 10, 0, TAU); ctx.moveTo(mouse.x - 15, mouse.y); ctx.lineTo(mouse.x - 5, mouse.y); ctx.moveTo(mouse.x + 5, mouse.y); ctx.lineTo(mouse.x + 15, mouse.y); ctx.moveTo(mouse.x, mouse.y - 15); ctx.lineTo(mouse.x, mouse.y - 5); ctx.moveTo(mouse.x, mouse.y + 5); ctx.lineTo(mouse.x, mouse.y + 15); ctx.stroke(); } }
    ctx.restore();
    drawHUD();
    if (state === S.INTRO) { const n = Math.ceil(3 - stateT); label(map.name.toUpperCase(), W / 2, 130, 28, '#ffd23f'); label(n > 0 ? String(n) : 'GO!', W / 2, 330, 110, '#fff'); label('Bots: ' + ents.slice(1).map(e => e.name.split(' ')[0] + ' ' + e.gun.name).join(' · '), W / 2, 590, 13, '#ddd'); }
    if (state === S.FIGHT && !player().alive) label('You are out! Watching the round...', W / 2, 600, 16, '#ffd23f');
    if (state === S.ROUNDEND) { ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(0, H / 2 - 60, W, 120); label(banner, W / 2, H / 2 + 12, 44, winner && !winner.isBot ? '#7affd2' : '#ff9a9a'); }
  }

  function drawMatchEnd() {
    drawFight(); ctx.fillStyle = 'rgba(0,0,0,.75)'; ctx.fillRect(0, 0, W, H);
    const w = ents.reduce((a, b) => (b.wins > a.wins ? b : a), ents[0]);
    label(w.isBot ? w.name.toUpperCase() + ' WINS THE MATCH' : 'YOU WIN THE MATCH!', W / 2, 220, 44, w.isBot ? '#ff9a9a' : '#ffd23f');
    ents.forEach((e, i) => label(e.name + '   ' + '★'.repeat(e.wins) + '   splats: ' + (e.kills || 0), W / 2, 290 + i * 30, 20, e.col));
    button('PLAY AGAIN', W / 2 - 330, 460, 300, 58, newMatch, '#ffd23f'); button('MENU', W / 2 + 30, 460, 300, 58, () => { state = S.MENU; }, '#9fd8ff');
  }

  function draw() {
    buttons = [];
    if (state === S.MENU) drawMenu(); else if (state === S.WHEEL) drawWheel(); else if (state === S.MATCHEND) drawMatchEnd(); else drawFight();
  }

  // ------------------------------------------------------------------ input & loop
  function mpos(ev) { const r = cv.getBoundingClientRect(); mouse.x = (ev.clientX - r.left) / r.width * W; mouse.y = (ev.clientY - r.top) / r.height * H; }
  cv.addEventListener('mousemove', mpos);
  cv.addEventListener('mousedown', ev => { mpos(ev); mouse.down = true; for (const b of buttons) if (mouse.x > b.x && mouse.x < b.x + b.w && mouse.y > b.y && mouse.y < b.y + b.h) { b.fn(); mouse.down = false; blip(520, 0.06, 'triangle', 0.04); return; } });
  window.addEventListener('mouseup', () => { mouse.down = false; });
  cv.addEventListener('contextmenu', ev => ev.preventDefault());
  window.addEventListener('keydown', ev => {
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(ev.code)) ev.preventDefault();
    keys.add(ev.code);
    if (ev.code === 'KeyM') muted = !muted;
    if (state === S.WHEEL && (ev.code === 'Space' || ev.code === 'Enter')) spinWheel();
    else if (state === S.MENU && ev.code === 'Enter') newMatch();
    else if (state === S.FIGHT) { const p = player(); if (ev.code === 'KeyR' && p.alive && p.rel <= 0 && p.ammo < p.gun.mag) p.rel = p.gun.reload; if ((ev.code === 'Space' || ev.code === 'ShiftLeft' || ev.code === 'ShiftRight') && p.alive && p.dashCd <= 0) { p.dashT = 0.16; p.dashCd = 1.6; const m = Math.hypot(p.vx, p.vy); if (m < 10) { p.vx = Math.cos(p.face) * 100; p.vy = Math.sin(p.face) * 100; } blip(260, 0.12, 'sawtooth', 0.04, 2); } }
    else if (state === S.MATCHEND && ev.code === 'Enter') newMatch();
  });
  window.addEventListener('keyup', ev => keys.delete(ev.code));
  window.addEventListener('blur', () => { keys.clear(); mouse.down = false; });

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.033, (now - last) / 1000); last = now;
    const steps = state === S.FIGHT && ents[0] && !ents[0].alive ? 3 : 1; for (let i = 0; i < steps; i++) update(dt);
    draw(); requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  if (location.hash === '#debug') window.__nerf = { step: dt => update(dt), st: () => ({ state, roundNo, wins: ents.map(e => e.wins), hp: ents.map(e => e.hp), alive: ents.map(e => e.alive), guns: ents.map(e => e.gun.name), map: map && map.name }), ents: () => ents, newMatch, spin: spinWheel, wheel: () => wheel, opts, mouse, keys, S, setBot: () => { ents[0].isBot = true; }, bullets: () => bullets };
})();
