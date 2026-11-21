/* Boss Rush
 * Top-down 2D. You wake up in a cave. Fight five bosses in a row, picking an upgrade between each.
 */
(() => {
  'use strict';

  const W = 960, H = 640, TAU = Math.PI * 2, FONT = '"Courier New", monospace';
  const canvas = document.getElementById('game'), ctx = canvas.getContext('2d');
  const BEST_KEY = 'bossRush.best';
  const S = { TITLE: 0, HUB: 1, FIGHT: 2, UPGRADE: 3, WIN: 4, OVER: 5 };
  const ARENA = { x: W / 2, y: H / 2 + 14, r: 270 };
  const HUB_BOX = { x1: 70, y1: 150, x2: 890, y2: 560 };
  const rnd = (a, b) => a + Math.random() * (b - a), pick = a => a[Math.floor(Math.random() * a.length)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const angTo = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);
  const angDiff = (a, b) => { let d = (a - b) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };

  // ------------------------------------------------------------------ state
  let state = S.TITLE, paused = false, muted = false, time = 0, shake = 0, bossIdx = 0, runTime = 0, toast = null, best = loadBest();
  let fightIdx = 0, player, boss, minions, pBul, eBul, hazards, parts, pillars, offered = [], introT = 0, deadT = 0, overTitle = '';
  const keys = new Set(), mouse = { x: W / 2, y: H / 2, down: false };

  function loadBest() { try { return parseInt(localStorage.getItem(BEST_KEY), 10) || 0; } catch (e) { return 0; } }
  function saveBest(n) { if (n > best) { best = n; try { localStorage.setItem(BEST_KEY, String(n)); } catch (e) { /* ignore */ } } }

  // ------------------------------------------------------------------ audio
  let actx = null;
  function blip(f, d, type, v, slide) {
    if (muted) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      const o = actx.createOscillator(), g = actx.createGain(); o.type = type || 'square'; o.frequency.value = f;
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f * slide), actx.currentTime + d);
      g.gain.value = v || 0.05; g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + d); o.connect(g); g.connect(actx.destination); o.start(); o.stop(actx.currentTime + d);
    } catch (e) { /* audio blocked */ }
  }

  // ------------------------------------------------------------------ player
  function newPlayer() {
    return { x: 150, y: 400, r: 12, hp: 5, maxHp: 5, speed: 215, dmg: 1, fireDelay: 0.26, fireT: 0, shots: 1, dashCd: 1.3, dashT: 0, dashCdT: 0, dashDir: { x: 1, y: 0 }, inv: 0, face: 0, slow: 0, step: 0 };
  }
  const UPGRADES = [
    { id: 'heart', name: 'Extra Heart', desc: '+1 max heart and heal 1', apply: p => { p.maxHp++; p.hp = Math.min(p.maxHp, p.hp + 1); } },
    { id: 'dmg', name: 'Heavy Shots', desc: '+35% shot damage', apply: p => { p.dmg *= 1.35; } },
    { id: 'rate', name: 'Rapid Fire', desc: 'Shoot 20% faster', apply: p => { p.fireDelay *= 0.8; } },
    { id: 'speed', name: 'Swift Boots', desc: '+12% move speed', apply: p => { p.speed *= 1.12; } },
    { id: 'dash', name: 'Quick Dash', desc: 'Dash recharges 25% faster', apply: p => { p.dashCd *= 0.75; } },
    { id: 'multi', name: 'Split Shot', desc: 'One more bullet per shot (max 3)', apply: p => { p.shots = Math.min(3, p.shots + 1); }, ok: p => p.shots < 3 },
    { id: 'heal', name: 'Campfire Stew', desc: 'Heal all hearts', apply: p => { p.hp = p.maxHp; } }
  ];

  const admin = { open: false, ok: false, god: false, infDash: false, freeze: false, onehit: false, speedMul: 1 };
  const UPGRADES2 = [
    { id: 'u_heart', name: 'Phoenix Heart', desc: '+2 max hearts and heal 2', apply: p => { p.maxHp += 2; p.hp = Math.min(p.maxHp, p.hp + 2); } },
    { id: 'u_dmg', name: 'Hellfire Rounds', desc: '+60% shot damage', apply: p => { p.dmg *= 1.6; } },
    { id: 'u_rate', name: 'Demon Loader', desc: 'Shoot 35% faster', apply: p => { p.fireDelay *= 0.65; } },
    { id: 'u_speed', name: 'Ember Boots', desc: '+20% move speed', apply: p => { p.speed *= 1.2; } },
    { id: 'u_dash', name: 'Shadow Step', desc: 'Dash recharges 40% faster', apply: p => { p.dashCd *= 0.6; } },
    { id: 'u_multi', name: 'Triple Barrel', desc: '+2 bullets per shot (max 5)', apply: p => { p.shots = Math.min(5, p.shots + 2); }, ok: p => p.shots < 5 },
    { id: 'u_pierce', name: 'Piercing Flames', desc: 'Bullets pass through enemies', apply: p => { p.pierce = true; }, ok: p => !p.pierce },
    { id: 'u_armor', name: 'Magma Armor', desc: 'Heal fully and +1 max heart', apply: p => { p.maxHp++; p.hp = p.maxHp; } }
  ];
  const UPGRADES3 = [
    { id: 'a_heart', name: 'Toxic Resilience', desc: '+2 max hearts and heal 2', apply: p => { p.maxHp += 2; p.hp = Math.min(p.maxHp, p.hp + 2); } },
    { id: 'a_dmg', name: 'Corrosive Rounds', desc: '+80% shot damage', apply: p => { p.dmg *= 1.8; } },
    { id: 'a_rate', name: 'Plague Loader', desc: 'Shoot 40% faster', apply: p => { p.fireDelay *= 0.6; } },
    { id: 'a_speed', name: 'Slime Boots', desc: '+22% move speed', apply: p => { p.speed *= 1.22; } },
    { id: 'a_dash', name: 'Phase Slip', desc: 'Dash recharges 45% faster', apply: p => { p.dashCd *= 0.55; } },
    { id: 'a_multi', name: 'Spore Barrage', desc: '+2 bullets per shot (max 7)', apply: p => { p.shots = Math.min(7, p.shots + 2); }, ok: p => p.shots < 7 },
    { id: 'a_pierce', name: 'Piercing Acid', desc: 'Bullets pass through enemies', apply: p => { p.pierce = true; }, ok: p => !p.pierce },
    { id: 'a_armor', name: 'Hazmat Suit', desc: 'Heal fully and +2 max hearts', apply: p => { p.maxHp += 2; p.hp = p.maxHp; } },
    { id: 'a_inv', name: 'Antidote', desc: 'Stay invincible 0.5s longer after being hit', apply: p => { p.invDur = (p.invDur || 1.15) + 0.5; }, ok: p => (p.invDur || 1.15) < 2.2 }
  ];
  function hurt(n, from) {
    if (admin.god && !bossMode) return;
    if (player.inv > 0 || player.dashT > 0 || state !== S.FIGHT && state !== S.HUB) return;
    player.hp -= n; player.inv = player.invDur || 1.15; shake = 10; blip(120, 0.25, 'sawtooth', 0.09, 0.5); burst(player.x, player.y, 10, '#ff5a4d', 160);
    if (player.hp <= 0) { player.hp = 0; die(); }
  }
  function die() { if (bossMode) { endBossMode(true); return; } state = S.OVER; deadT = 0; overTitle = ['YOU FELL IN THE CAVE', 'YOU BURNED IN THE UNDERWORLD', 'YOU DISSOLVED IN THE ACID'][realmOf(fightIdx)]; blip(90, 0.8, 'sawtooth', 0.1, 0.4); }

  // ------------------------------------------------------------------ helpers
  function burst(x, y, n, color, sp) { for (let i = 0; i < n; i++) { const a = rnd(0, TAU), v = rnd(0.3, 1) * sp; parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rnd(0.3, 0.7), max: 0.7, c: color, r: rnd(2, 4) }); } }
  function ebul(x, y, a, sp, r, o) { if (eBul.length > 170) eBul.splice(0, 20); eBul.push(Object.assign({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: r || 7, life: 6, c: '#ff7a3d' }, o)); }
  function fan(x, y, a, n, spread, sp, r, o) { for (let i = 0; i < n; i++) ebul(x, y, a + (n === 1 ? 0 : (i / (n - 1) - 0.5) * spread), sp, r, o); }
  function ring(x, y, n, off, sp, r, o, gap) { for (let i = 0; i < n; i++) { if (gap && i < gap) continue; ebul(x, y, off + i * TAU / n, sp, r, o); } }
  function zone(x, y, r, delay, dur, o) { hazards.push(Object.assign({ k: 'zone', x, y, r, delay, dur, t: 0, hit: false, dmg: 1, c: '#ff4d3d' }, o)); }
  function wave(x, y, sp, maxR, o) { hazards.push(Object.assign({ k: 'wave', x, y, r: 10, sp, maxR, hit: false, w: 16 }, o)); }
  function beam(x, y, a, rot, delay, dur) { hazards.push({ k: 'beam', x, y, a, rot, delay, dur, t: 0, len: 700 }); }
  function toastMsg(t, d) { toast = { t, d: d || 1.8, life: d || 1.8 }; }
  function inArena(o, pad) { const d = Math.hypot(o.x - ARENA.x, o.y - ARENA.y), m = ARENA.r - (pad || o.r); if (d > m) { o.x = ARENA.x + (o.x - ARENA.x) / d * m; o.y = ARENA.y + (o.y - ARENA.y) / d * m; return true; } return false; }
  function toward(o, tx, ty, sp, dt) { const a = Math.atan2(ty - o.y, tx - o.x); o.x += Math.cos(a) * sp * dt; o.y += Math.sin(a) * sp * dt; }

  // ------------------------------------------------------------------ bosses
  let slamHinted = false;
  const BOSSES = [mkGolem, mkBat, mkSlime, mkSpider, mkWyrm, mkHound, mkWitch, mkTitan, mkDemon, mkDragon, mkScorpion, mkHydra, mkAcidWraith, mkLeviathan, mkOvermind];
  function base(name, hp, r) { return { name, hp, max: hp, r, x: ARENA.x, y: ARENA.y - 130, flash: 0, st: 1.5, state: 'idle', n: 0, t: 0, ph: 1, z: 0 }; }

  function mkGolem() {
    const b = base('ROCK GOLEM', 80, 46);
    b.update = function (dt) {
      const ph = this.hp / this.max < 0.5 ? 2 : 1; if (ph !== this.ph) { this.ph = ph; toastMsg('The golem cracks and rages!'); shake = 12; }
      this.st -= dt;
      if (this.state === 'idle') {
        toward(this, player.x, player.y, ph === 2 ? 75 : 55, dt);
        if (this.st <= 0) { const o = ['slam', 'throw']; if (ph === 2) o.push('charge'); this.state = pick(o); this.n = 0; this.st = this.state === 'slam' ? 1.25 : this.state === 'throw' ? 0.6 : 0.8; if (this.state === 'slam') { zone(this.x, this.y, 105, 1.2, 0.15, {}); if (!slamHinted) { slamHinted = true; toastMsg('Dash through the shockwave, or hide behind a pillar!', 2.8); } } if (this.state === 'charge') this.ca = angTo(this, player); }
      } else if (this.state === 'slam') {
        if (this.st <= 0) { wave(this.x, this.y, 175, 440, { w: 30, c: '#ffb27a' }); shake = 14; blip(70, 0.3, 'sawtooth', 0.1, 0.5); this.state = 'idle'; this.st = ph === 2 ? 1.1 : 1.6; }
      } else if (this.state === 'throw') {
        if (this.st <= 0) { ring(this.x, this.y, ph === 2 ? 12 : 8, this.n * 0.4, 170, 9, { c: '#9a8f86' }); blip(200, 0.15, 'square', 0.05); this.n++; this.st = 0.5; if (this.n >= 3) { this.state = 'idle'; this.st = 1.2; } }
      } else if (this.state === 'charge') {
        if (this.st > 0) { this.tel = this.ca; } else { this.tel = null; this.x += Math.cos(this.ca) * 480 * dt; this.y += Math.sin(this.ca) * 480 * dt; if (inArena(this) || this.st < -0.75) { this.state = 'idle'; this.st = 1.3; shake = 8; } }
      }
      inArena(this);
    };
    b.draw = function () {
      const x = this.x, y = this.y, f = this.flash > 0;
      if (this.tel !== null && this.tel !== undefined && this.state === 'charge' && this.st > 0) { ctx.strokeStyle = 'rgba(255,80,60,.55)'; ctx.lineWidth = 30; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(this.tel) * 520, y + Math.sin(this.tel) * 520); ctx.stroke(); }
      if (this.state === 'slam') { ctx.strokeStyle = 'rgba(255,178,122,.35)'; ctx.lineWidth = 2; ctx.setLineDash([10, 10]); ctx.beginPath(); ctx.arc(x, y, 440, 0, TAU); ctx.stroke(); ctx.setLineDash([]); }
      ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(x, y + 44, 52, 16, 0, 0, TAU); ctx.fill();
      for (const sx of [-1, 1]) { ctx.fillStyle = f ? '#fff' : '#6d655e'; ctx.beginPath(); ctx.arc(x + sx * 58, y + 8 + Math.sin(time * 3 + sx) * 3, 20, 0, TAU); ctx.fill(); ctx.fillStyle = f ? '#fff' : '#58514b'; ctx.beginPath(); ctx.arc(x + sx * 34, y + 2, 22, 0, TAU); ctx.fill(); }
      ctx.fillStyle = f ? '#fff' : '#85796f'; ctx.beginPath(); ctx.arc(x, y, 46, 0, TAU); ctx.fill();
      ctx.fillStyle = f ? '#fff' : '#9c9086'; ctx.beginPath(); ctx.arc(x - 12, y - 14, 22, 0, TAU); ctx.fill();
      ctx.fillStyle = f ? '#fff' : '#6d655e'; ctx.beginPath(); ctx.arc(x + 16, y + 14, 15, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x - 30, y + 10); ctx.lineTo(x - 10, y + 26); ctx.lineTo(x + 4, y + 12); ctx.stroke();
      const eye = this.ph === 2 ? '#ff5a3d' : '#ffd23f'; ctx.fillStyle = eye; ctx.shadowColor = eye; ctx.shadowBlur = 14;
      ctx.beginPath(); ctx.arc(x - 14, y - 8, 6, 0, TAU); ctx.arc(x + 12, y - 8, 6, 0, TAU); ctx.fill(); ctx.shadowBlur = 0;
    };
    return b;
  }

  function mkBat() {
    const b = base('BAT QUEEN', 85, 30); b.ang = 0; b.cx = ARENA.x; b.cy = ARENA.y - 120; b.x = b.cx; b.y = b.cy;
    b.update = function (dt) {
      const ph = this.hp / this.max < 0.5 ? 2 : 1; if (ph !== this.ph) { this.ph = ph; toastMsg('The queen shrieks!'); shake = 10; }
      this.st -= dt;
      if (this.state === 'idle') {
        this.ang += dt * (ph === 2 ? 1.3 : 0.9); const tx = ARENA.x + Math.cos(this.ang) * 170, ty = ARENA.y - 40 + Math.sin(this.ang * 1.3) * 130; toward(this, tx, ty, 190, dt);
        if (this.st <= 0) { const o = ['fan', 'fan', 'swoop', 'summon']; if (ph === 2) o.push('ring'); this.state = pick(o); this.n = 0; this.st = 0.6;
          if (this.state === 'summon' && minions.length >= 4) this.state = 'fan';
          if (this.state === 'swoop') { this.tx = ARENA.x * 2 - player.x; this.ty = ARENA.y * 2 - player.y; this.ca = Math.atan2(player.y - this.y, player.x - this.x); this.st = 0.8; } }
      } else if (this.state === 'fan') {
        if (this.st <= 0) { fan(this.x, this.y, angTo(this, player), ph === 2 ? 7 : 5, 1.1, 230, 7, { c: '#c77dff' }); blip(500, 0.1, 'triangle', 0.05); this.n++; this.st = 0.35; if (this.n >= (ph === 2 ? 3 : 2)) { this.state = 'idle'; this.st = 1.2; } }
      } else if (this.state === 'ring') {
        if (this.st <= 0) { ring(this.x, this.y, 14, this.n * 0.2, 190, 7, { c: '#c77dff' }); this.n++; this.st = 0.4; if (this.n >= 3) { this.state = 'idle'; this.st = 1.3; } }
      } else if (this.state === 'summon') {
        if (this.st <= 0) { for (let i = 0; i < 3; i++) minions.push(mkBatMinion(this.x + rnd(-30, 30), this.y + rnd(-20, 20))); burst(this.x, this.y, 12, '#c77dff', 120); this.state = 'idle'; this.st = 1.8; }
      } else if (this.state === 'swoop') {
        if (this.st > 0) { this.tel = this.ca; } else { this.tel = null; const a = this.ca; this.x += Math.cos(a) * 560 * dt; this.y += Math.sin(a) * 560 * dt; if (this.st < -0.9 || inArena(this)) { this.state = 'idle'; this.st = 1.0; } }
      }
      inArena(this);
    };
    b.draw = function () {
      const x = this.x, y = this.y, f = this.flash > 0, flap = Math.sin(time * 14) * 0.5;
      if (this.tel !== null && this.tel !== undefined && this.state === 'swoop' && this.st > 0) { ctx.strokeStyle = 'rgba(199,125,255,.5)'; ctx.lineWidth = 24; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(this.tel) * 560, y + Math.sin(this.tel) * 560); ctx.stroke(); }
      ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(x, y + 40, 26, 8, 0, 0, TAU); ctx.fill();
      for (const sx of [-1, 1]) { ctx.fillStyle = f ? '#fff' : '#5b2a8a'; ctx.beginPath(); ctx.moveTo(x, y - 6); ctx.quadraticCurveTo(x + sx * 60, y - 50 - flap * 40, x + sx * 92, y + 6 + flap * 20); ctx.lineTo(x + sx * 70, y + 12); ctx.lineTo(x + sx * 50, y + 6); ctx.lineTo(x + sx * 30, y + 22); ctx.lineTo(x, y + 14); ctx.closePath(); ctx.fill(); }
      ctx.fillStyle = f ? '#fff' : '#7a3fb0'; ctx.beginPath(); ctx.arc(x, y, 24, 0, TAU); ctx.fill();
      ctx.fillStyle = f ? '#fff' : '#7a3fb0'; for (const sx of [-1, 1]) { ctx.beginPath(); ctx.moveTo(x + sx * 8, y - 18); ctx.lineTo(x + sx * 18, y - 40); ctx.lineTo(x + sx * 20, y - 14); ctx.fill(); }
      ctx.fillStyle = '#ffd23f'; ctx.fillRect(x - 12, y - 32, 24, 6); ctx.fillRect(x - 12, y - 38, 5, 6); ctx.fillRect(x - 2, y - 40, 5, 8); ctx.fillRect(x + 7, y - 38, 5, 6);
      ctx.fillStyle = '#ff4d6d'; ctx.beginPath(); ctx.arc(x - 8, y - 4, 4, 0, TAU); ctx.arc(x + 8, y - 4, 4, 0, TAU); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.fillRect(x - 5, y + 6, 3, 6); ctx.fillRect(x + 2, y + 6, 3, 6);
    };
    return b;
  }
  function mkBatMinion(x, y) {
    return { x, y, r: 11, hp: 2, max: 2, flash: 0, w: rnd(0, 6), name: 'bat', update(dt) { this.w += dt * 6; const a = angTo(this, player) + Math.sin(this.w) * 0.9; this.x += Math.cos(a) * 125 * dt; this.y += Math.sin(a) * 125 * dt; inArena(this); },
      draw() { const f = this.flash > 0, fl = Math.sin(time * 18 + this.w) * 6; ctx.fillStyle = f ? '#fff' : '#4a2a6a'; ctx.beginPath(); ctx.moveTo(this.x, this.y); ctx.lineTo(this.x - 18, this.y - 8 + fl); ctx.lineTo(this.x - 10, this.y + 6); ctx.lineTo(this.x + 10, this.y + 6); ctx.lineTo(this.x + 18, this.y - 8 + fl); ctx.closePath(); ctx.fill(); ctx.fillStyle = f ? '#fff' : '#6a3a9a'; ctx.beginPath(); ctx.arc(this.x, this.y, 7, 0, TAU); ctx.fill(); ctx.fillStyle = '#ff4d6d'; ctx.fillRect(this.x - 4, this.y - 2, 2, 2); ctx.fillRect(this.x + 2, this.y - 2, 2, 2); } };
  }

  function mkSlime() {
    const b = base('SLIME KING', 110, 44); b.splits = 0;
    b.update = function (dt) {
      const ph = this.hp / this.max;
      if (this.splits === 0 && ph < 0.66 || this.splits === 1 && ph < 0.33) { this.splits++; for (let i = 0; i < 2; i++) minions.push(mkMiniSlime(this.x + (i ? 40 : -40), this.y)); toastMsg('The slime king splits!'); burst(this.x, this.y, 20, '#6bdc6b', 200); }
      this.st -= dt;
      if (this.state === 'idle') { this.z = 0; if (this.st <= 0) { this.state = 'hop'; this.st = 0.75; this.hx = player.x; this.hy = player.y; } }
      else if (this.state === 'hop') {
        const u = 1 - this.st / 0.75; this.z = Math.sin(clamp(u, 0, 1) * Math.PI) * 70; toward(this, this.hx, this.hy, 215 + (1 - ph) * 80, dt); inArena(this);
        if (this.st <= 0) { this.z = 0; shake = 9; blip(90, 0.2, 'sawtooth', 0.09, 0.6); ring(this.x, this.y, 8 + this.splits * 2, rnd(0, 1), 165, 8, { c: '#6bdc6b' }); wave(this.x, this.y, 210, 150, { w: 14, c: '#6bdc6b' }); this.state = 'idle'; this.st = 0.75 - this.splits * 0.1; }
      }
    };
    b.draw = function () {
      const x = this.x, y = this.y - this.z, f = this.flash > 0, sq = 1 + (this.state === 'idle' ? Math.sin(time * 4) * 0.05 : this.z > 0 ? -0.1 : 0);
      ctx.fillStyle = 'rgba(0,0,0,' + (0.35 - this.z / 300) + ')'; ctx.beginPath(); ctx.ellipse(this.x, this.y + 36, 46 - this.z * 0.2, 14, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = f ? '#fff' : '#3fae4a'; ctx.beginPath(); ctx.ellipse(x, y + 8, 50 * sq, 40 / sq, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = f ? '#fff' : '#62d36b'; ctx.beginPath(); ctx.ellipse(x - 8, y - 2, 34 * sq, 26 / sq, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.45)'; ctx.beginPath(); ctx.ellipse(x - 20, y - 14, 9, 5, -0.5, 0, TAU); ctx.fill();
      ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(x - 14, y + 4, 5, 0, TAU); ctx.arc(x + 14, y + 4, 5, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.moveTo(x - 24, y - 30); ctx.lineTo(x - 24, y - 50); ctx.lineTo(x - 12, y - 38); ctx.lineTo(x, y - 54); ctx.lineTo(x + 12, y - 38); ctx.lineTo(x + 24, y - 50); ctx.lineTo(x + 24, y - 30); ctx.closePath(); ctx.fill();
    };
    return b;
  }
  function mkMiniSlime(x, y) {
    return { x, y, r: 18, hp: 9, max: 9, flash: 0, name: 'slime', st: rnd(0.2, 0.8), z: 0, state: 'idle', update(dt) { this.st -= dt; if (this.state === 'idle') { this.z = 0; if (this.st <= 0) { this.state = 'hop'; this.st = 0.6; this.hx = player.x; this.hy = player.y; } } else { this.z = Math.sin((1 - this.st / 0.6) * Math.PI) * 40; toward(this, this.hx, this.hy, 170, dt); if (this.st <= 0) { this.state = 'idle'; this.st = rnd(0.6, 1.1); this.z = 0; } } inArena(this); },
      draw() { const x = this.x, y = this.y - this.z, f = this.flash > 0; ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(this.x, this.y + 14, 18, 6, 0, 0, TAU); ctx.fill(); ctx.fillStyle = f ? '#fff' : '#3fae4a'; ctx.beginPath(); ctx.ellipse(x, y + 3, 20, 16, 0, 0, TAU); ctx.fill(); ctx.fillStyle = f ? '#fff' : '#62d36b'; ctx.beginPath(); ctx.ellipse(x - 3, y - 1, 13, 10, 0, 0, TAU); ctx.fill(); ctx.fillStyle = '#111'; ctx.fillRect(x - 7, y, 3, 4); ctx.fillRect(x + 4, y, 3, 4); } };
  }

  function mkSpider() {
    const b = base('SPIDER MATRIARCH', 120, 34); b.ang = -1.57;
    b.update = function (dt) {
      const ph = this.hp / this.max < 0.5 ? 2 : 1; if (ph !== this.ph) { this.ph = ph; toastMsg('The matriarch is furious!'); shake = 10; }
      this.st -= dt;
      if (this.state === 'idle') {
        const pa = angTo(ARENA, player); this.ang += angDiff(pa + Math.PI * 0.6, this.ang) * dt * 0.9; toward(this, ARENA.x + Math.cos(this.ang) * 190, ARENA.y + Math.sin(this.ang) * 190, 130, dt);
        if (this.st <= 0) { const o = ['web', 'web', 'spawn', 'leap']; if (ph === 2) o.push('leap', 'web'); this.state = pick(o); this.n = 0; this.st = 0.55;
          if (this.state === 'spawn' && minions.length >= 5) this.state = 'web';
          if (this.state === 'leap') { this.lx = player.x; this.ly = player.y; this.fx = this.x; this.fy = this.y; this.st = 0.95; zone(this.lx, this.ly, 78, 0.95, 0.2, { c: '#ff4d3d' }); } }
      } else if (this.state === 'web') {
        if (this.st <= 0) { fan(this.x, this.y, angTo(this, player), ph === 2 ? 5 : 3, 0.7, 260, 9, { c: '#e8f0ff', web: true, life: 0.9 + Math.random() * 0.2 }); blip(380, 0.12, 'triangle', 0.05); this.n++; this.st = 0.45; if (this.n >= 2) { this.state = 'idle'; this.st = 1.0; } }
      } else if (this.state === 'spawn') {
        if (this.st <= 0) { for (let i = 0; i < 2; i++) minions.push(mkSpiderling(this.x + rnd(-20, 20), this.y + rnd(-20, 20))); burst(this.x, this.y, 10, '#8a8aa0', 100); this.state = 'idle'; this.st = 1.1; }
      } else if (this.state === 'leap') {
        const u = clamp(1 - this.st / 0.95, 0, 1); this.x = this.fx + (this.lx - this.fx) * u; this.y = this.fy + (this.ly - this.fy) * u; this.z = Math.sin(u * Math.PI) * 60;
        if (this.st <= 0) { this.z = 0; shake = 10; ring(this.x, this.y, 10, 0, 170, 7, { c: '#e8f0ff' }); this.state = 'idle'; this.st = 1.2; }
      }
      inArena(this);
    };
    b.draw = function () {
      const x = this.x, y = this.y - this.z, f = this.flash > 0;
      ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(this.x, this.y + 30, 40, 11, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = f ? '#fff' : '#2a2530'; ctx.lineWidth = 5; ctx.lineCap = 'round';
      for (let i = 0; i < 8; i++) { const side = i < 4 ? -1 : 1, k = i % 4, a = (k - 1.5) * 0.55, wig = Math.sin(time * 9 + i) * 5; const ex = x + side * (50 + Math.cos(a) * 18), ey = y + (k - 1.5) * 24 + wig; ctx.beginPath(); ctx.moveTo(x + side * 14, y + (k - 1.5) * 8); ctx.lineTo(x + side * 38, y + (k - 1.5) * 18 - 22); ctx.lineTo(ex, ey); ctx.stroke(); }
      ctx.fillStyle = f ? '#fff' : '#3a3342'; ctx.beginPath(); ctx.ellipse(x, y + 10, 24, 30, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = f ? '#fff' : '#4a4256'; ctx.beginPath(); ctx.arc(x, y - 16, 17, 0, TAU); ctx.fill();
      ctx.fillStyle = '#c0283c'; ctx.beginPath(); ctx.moveTo(x - 6, y + 4); ctx.lineTo(x, y + 22); ctx.lineTo(x + 6, y + 4); ctx.fill();
      ctx.fillStyle = '#ff3d52'; ctx.shadowColor = '#ff3d52'; ctx.shadowBlur = 10; for (const [ox, oy, rr] of [[-7, -20, 3.5], [7, -20, 3.5], [-12, -14, 2.5], [12, -14, 2.5], [-3, -25, 2], [3, -25, 2]]) { ctx.beginPath(); ctx.arc(x + ox, y + oy, rr, 0, TAU); ctx.fill(); } ctx.shadowBlur = 0;
    };
    return b;
  }
  function mkSpiderling(x, y) {
    return { x, y, r: 10, hp: 2, max: 2, flash: 0, name: 'spiderling', update(dt) { toward(this, player.x, player.y, 150, dt); inArena(this); },
      draw() { const f = this.flash > 0; ctx.strokeStyle = f ? '#fff' : '#2a2530'; ctx.lineWidth = 2; for (let i = 0; i < 6; i++) { const s = i < 3 ? -1 : 1, k = i % 3, w = Math.sin(time * 16 + i) * 3; ctx.beginPath(); ctx.moveTo(this.x, this.y); ctx.lineTo(this.x + s * 14, this.y + (k - 1) * 8 + w); ctx.stroke(); } ctx.fillStyle = f ? '#fff' : '#3a3342'; ctx.beginPath(); ctx.arc(this.x, this.y, 8, 0, TAU); ctx.fill(); ctx.fillStyle = '#ff3d52'; ctx.fillRect(this.x - 4, this.y - 4, 2, 2); ctx.fillRect(this.x + 2, this.y - 4, 2, 2); } };
  }

  function mkWyrm() {
    const b = base('CRYSTAL WYRM', 200, 40); b.hd = Math.PI / 2; b.spin = 0; b.fireT = 0; b.rainT = 2; b.trail = []; b.burstT = 3; b.beamT = 4; b.ringT = 3; b.wp = { x: ARENA.x, y: ARENA.y }; b.wpT = 0; b.charge = 0; b.chargeT = 6; b.segs = [];
    b.update = function (dt) {
      const f = this.hp / this.max, ph = f > 0.66 ? 1 : f > 0.33 ? 2 : 3;
      if (ph !== this.ph) { this.ph = ph; toastMsg(ph === 2 ? 'PHASE 2: the crystals awaken' : 'PHASE 3: the wyrm is enraged'); shake = 14; hazards.length = 0; eBul.length = 0; burst(this.x, this.y, 30, '#7fe3ff', 260); }
      // ---- real movement: steer along smooth curves between waypoints, and charge at you in later phases
      this.wpT -= dt;
      if (this.charge > 0) { this.charge -= dt; this.wp = { x: player.x, y: player.y }; }
      else if (this.wpT <= 0 || Math.hypot(this.wp.x - this.x, this.wp.y - this.y) < 50) { const a = rnd(0, TAU), d = rnd(60, ARENA.r - 90); this.wp = { x: ARENA.x + Math.cos(a) * d, y: ARENA.y + Math.sin(a) * d }; this.wpT = rnd(2, 3.5); }
      if (ph >= 2 && this.charge <= 0) { this.chargeT -= dt; if (this.chargeT <= 0) { this.charge = 1.4; this.chargeT = ph === 3 ? 5 : 7; blip(110, 0.3, 'sawtooth', 0.07); } }
      const want = Math.atan2(this.wp.y - this.y, this.wp.x - this.x), turn = (this.charge > 0 ? 3.2 : 2.0) * dt;
      this.hd += clamp(angDiff(want, this.hd), -turn, turn);
      const sp = (this.charge > 0 ? 420 : 170 + ph * 25); this.x += Math.cos(this.hd) * sp * dt; this.y += Math.sin(this.hd) * sp * dt;
      if (inArena(this, this.r + 30)) { const c = Math.atan2(ARENA.y - this.y, ARENA.x - this.x); this.hd += clamp(angDiff(c, this.hd), -4 * dt, 4 * dt); this.wp = { x: ARENA.x, y: ARENA.y }; this.charge = 0; }
      // body trail by distance, so the serpent follows the head like a real snake
      const last = this.trail[0]; if (!last || Math.hypot(last.x - this.x, last.y - this.y) >= 6) { this.trail.unshift({ x: this.x, y: this.y }); if (this.trail.length > 90) this.trail.pop(); }
      this.segs = []; for (let i = 1; i <= 8; i++) { const t = this.trail[i * 6]; if (t) this.segs.push({ x: t.x, y: t.y, r: 30 - i * 2 }); }
      for (const s of this.segs) if (Math.hypot(player.x - s.x, player.y - s.y) < s.r + player.r - 8) hurt(1);
      // ---- attacks
      this.spin += dt * (ph === 3 ? 1.5 : 0.9); this.fireT -= dt;
      if (this.fireT <= 0) { const arms = ph === 3 ? 4 : ph === 1 ? 3 : 2; for (let i = 0; i < arms; i++) ebul(this.x, this.y, this.spin + i * TAU / arms, ph === 3 ? 165 : 140, 7, { c: '#7fe3ff', life: 4 }); this.fireT = ph === 3 ? 0.16 : 0.2; }
      this.burstT -= dt; if (this.burstT <= 0) { fan(this.x, this.y, angTo(this, player), ph === 3 ? 7 : 5, 0.9, 250, 8, { c: '#ff9dd2' }); blip(300, 0.12, 'sawtooth', 0.05); this.burstT = ph === 3 ? 2.2 : 3.2; }
      if (ph >= 2) { this.rainT -= dt; if (this.rainT <= 0) { zone(player.x + rnd(-30, 30), player.y + rnd(-30, 30), 48, 0.85, 0.15, { c: '#7fe3ff' }); this.rainT = ph === 3 ? 0.6 : 0.9; } }
      if (ph >= 2) { this.beamT -= dt; if (this.beamT <= 0) { const a = rnd(0, TAU), d = Math.random() < 0.5 ? 1 : -1; beam(this.x, this.y, a, 0.5 * d, 1.0, 2.6); if (ph === 3) beam(this.x, this.y, a + Math.PI, 0.5 * d, 1.0, 2.6); this.beamT = ph === 3 ? 7 : 8; } }
      if (ph === 3) { this.ringT -= dt; if (this.ringT <= 0) { ring(this.x, this.y, 20, rnd(0, TAU), 150, 8, { c: '#ff9dd2' }, 3); this.ringT = 2.8; } }
    };
    b.draw = function () {
      const x = this.x, y = this.y, f = this.flash > 0;
      if (this.charge > 0) { ctx.strokeStyle = 'rgba(127,227,255,.35)'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(this.hd) * 200, y + Math.sin(this.hd) * 200); ctx.stroke(); }
      for (let i = this.segs.length - 1; i >= 0; i--) { const s = this.segs[i]; ctx.fillStyle = f ? '#fff' : (i % 2 ? '#2a6f8a' : '#3a8fae'); ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, TAU); ctx.fill(); ctx.fillStyle = f ? '#fff' : '#9deaff'; ctx.beginPath(); ctx.moveTo(s.x - 6, s.y - s.r + 4); ctx.lineTo(s.x, s.y - s.r - 14); ctx.lineTo(s.x + 6, s.y - s.r + 4); ctx.fill(); }
      ctx.save(); ctx.translate(x, y); ctx.rotate(this.hd);
      ctx.fillStyle = f ? '#fff' : '#4aa0c0'; ctx.beginPath(); ctx.ellipse(0, 0, 40, 32, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = f ? '#fff' : '#7fd0ea'; ctx.beginPath(); ctx.moveTo(-14, -26); ctx.lineTo(-30, -52); ctx.lineTo(-4, -30); ctx.moveTo(-14, 26); ctx.lineTo(-30, 52); ctx.lineTo(-4, 30); ctx.fill();
      ctx.fillStyle = f ? '#fff' : '#9deaff'; ctx.beginPath(); ctx.moveTo(22, -14); ctx.lineTo(52, -30); ctx.lineTo(34, -6); ctx.moveTo(22, 14); ctx.lineTo(52, 30); ctx.lineTo(34, 6); ctx.fill();
      ctx.fillStyle = '#ff4d8f'; ctx.beginPath(); ctx.arc(14, -12, 5, 0, TAU); ctx.arc(14, 12, 5, 0, TAU); ctx.fill(); ctx.restore();
    };
    return b;
  }

  // ------------------------------------------------------------------ underworld bosses (bosses 6-10, all tougher)
  const fire = (x, y, r, dur) => hazards.push({ k: 'fire', x, y, r, t: 0, dur });
  const flame = (x, y, s, t) => { const fl = 1 + Math.sin(time * 13 + t) * 0.15; ctx.fillStyle = '#ff6a1a'; ctx.beginPath(); ctx.moveTo(x - 7 * s, y); ctx.quadraticCurveTo(x - 4 * s, y - 14 * s * fl, x, y - 24 * s * fl); ctx.quadraticCurveTo(x + 4 * s, y - 12 * s * fl, x + 7 * s, y); ctx.fill(); ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.moveTo(x - 3.5 * s, y); ctx.quadraticCurveTo(x, y - 12 * s * fl, x + 3.5 * s, y); ctx.fill(); };
  const meteor = (x, y, delay, r) => zone(x, y, r || 55, delay, 0.15, { c: '#ff8a1a', onEnd: z => { fire(z.x, z.y, (r || 55) * 0.8, 3.5); shake = 6; } });
  function mkImp(x, y) {
    return { x, y, r: 11, hp: 3, max: 3, flash: 0, name: 'imp', w: rnd(0, 6), sh: rnd(0.5, 1.5), update(dt) { this.w += dt * 3; const d = dist(this, player), a = angTo(this, player); const k = d > 230 ? 1 : d < 150 ? -1 : 0; this.x += (Math.cos(a) * k + Math.cos(a + 1.57) * Math.sin(this.w) * 0.8) * 110 * dt; this.y += (Math.sin(a) * k + Math.sin(a + 1.57) * Math.sin(this.w) * 0.8) * 110 * dt; inArena(this); this.sh -= dt; if (this.sh <= 0) { ebul(this.x, this.y, a, 215, 7, { c: '#ff8a1a' }); this.sh = rnd(1.5, 2.2); } },
      draw() { const f = this.flash > 0; ctx.fillStyle = f ? '#fff' : '#c0283c'; ctx.beginPath(); ctx.arc(this.x, this.y, 10, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.moveTo(this.x - 8, this.y - 6); ctx.lineTo(this.x - 12, this.y - 17); ctx.lineTo(this.x - 3, this.y - 9); ctx.moveTo(this.x + 8, this.y - 6); ctx.lineTo(this.x + 12, this.y - 17); ctx.lineTo(this.x + 3, this.y - 9); ctx.fill(); ctx.fillStyle = '#ffd23f'; ctx.fillRect(this.x - 5, this.y - 3, 3, 3); ctx.fillRect(this.x + 2, this.y - 3, 3, 3); } };
  }

  function mkHound() {
    const b = base('HELLHOUND', 190, 40); b.ang = 0; b.tel = null;
    b.update = function (dt) {
      const ph = this.hp / this.max < 0.5 ? 2 : 1; if (ph !== this.ph) { this.ph = ph; toastMsg('The hellhound howls!'); shake = 12; ring(this.x, this.y, 16, 0, 200, 8, { c: '#ff8a1a' }); }
      this.st -= dt;
      if (this.state === 'idle') {
        this.ang += dt * 1.4; toward(this, player.x + Math.cos(this.ang) * 210, player.y + Math.sin(this.ang) * 210, 230, dt);
        if (this.st <= 0) { const o = ['lunge', 'lunge', 'breath', 'howl']; this.state = pick(o); this.n = 0; if (this.state === 'lunge') { this.ca = angTo(this, player); this.st = 0.55; } else this.st = 0.6; }
      } else if (this.state === 'lunge') {
        if (this.st > 0) { this.tel = this.ca = angTo(this, player); }
        else { this.tel = null; this.x += Math.cos(this.ca) * 720 * dt; this.y += Math.sin(this.ca) * 720 * dt; if (Math.random() < 0.9) fire(this.x, this.y, 22, 3.2); if (this.st < -0.45 || inArena(this)) { this.n++; if (this.n < (ph === 2 ? 3 : 2)) { this.st = 0.5; this.ca = angTo(this, player); } else { this.state = 'idle'; this.st = 1.0; } } }
      } else if (this.state === 'breath') {
        if (this.st <= 0) { fan(this.x, this.y, angTo(this, player), ph === 2 ? 9 : 7, 1.2, 250, 8, { c: '#ff8a1a' }); blip(150, 0.15, 'sawtooth', 0.05); this.n++; this.st = 0.4; if (this.n >= 3) { this.state = 'idle'; this.st = 1.0; } }
      } else if (this.state === 'howl') {
        if (this.st <= 0) { ring(this.x, this.y, 18, rnd(0, 1), 190, 8, { c: '#ff8a1a' }); for (let i = 0; i < 3; i++) meteor(player.x + rnd(-120, 120), player.y + rnd(-120, 120), 0.8 + i * 0.2, 50); this.state = 'idle'; this.st = 1.2; }
      }
      inArena(this);
    };
    b.draw = function () {
      const x = this.x, y = this.y, f = this.flash > 0, a = angTo(this, player);
      if (this.tel !== null && this.state === 'lunge' && this.st > 0) { ctx.strokeStyle = 'rgba(255,90,40,.5)'; ctx.lineWidth = 34; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(this.tel) * 560, y + Math.sin(this.tel) * 560); ctx.stroke(); }
      ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(x, y + 38, 50, 14, 0, 0, TAU); ctx.fill();
      ctx.save(); ctx.translate(x, y); ctx.rotate(a);
      ctx.fillStyle = f ? '#fff' : '#3a1411'; ctx.beginPath(); ctx.ellipse(-8, 0, 46, 30, 0, 0, TAU); ctx.fill();
      for (let i = 0; i < 5; i++) flame(-30 + i * 14, -22 - (i % 2) * 4, 0.9, i);
      for (const hy of [-20, 0, 20]) { ctx.fillStyle = f ? '#fff' : '#5a1c16'; ctx.beginPath(); ctx.ellipse(34, hy, 18, 13, 0, 0, TAU); ctx.fill(); ctx.fillStyle = f ? '#fff' : '#3a1411'; ctx.beginPath(); ctx.moveTo(28, hy - 10); ctx.lineTo(22, hy - 19); ctx.lineTo(36, hy - 11); ctx.fill(); ctx.fillStyle = '#ffd23f'; ctx.shadowColor = '#ff6a1a'; ctx.shadowBlur = 8; ctx.beginPath(); ctx.arc(40, hy - 4, 3, 0, TAU); ctx.arc(40, hy + 4, 3, 0, TAU); ctx.fill(); ctx.shadowBlur = 0; ctx.fillStyle = '#fff'; ctx.fillRect(46, hy - 2, 4, 2); }
      ctx.restore();
    };
    return b;
  }

  function mkWitch() {
    const b = base('ASH WITCH', 210, 28); b.ang = 0;
    b.update = function (dt) {
      const ph = this.hp / this.max < 0.5 ? 2 : 1; if (ph !== this.ph) { this.ph = ph; toastMsg('The witch screams in rage!'); shake = 10; }
      this.st -= dt; this.ang += dt;
      if (this.state === 'idle') {
        toward(this, ARENA.x + Math.cos(this.ang * 0.8) * 150, ARENA.y - 70 + Math.sin(this.ang * 1.1) * 90, 130, dt);
        if (this.st <= 0) { const o = ['volley', 'meteors', 'blink', 'summon']; if (ph === 2) o.push('meteors', 'volley'); this.state = pick(o); this.n = 0; this.st = 0.5; if (this.state === 'summon' && minions.length >= 4) this.state = 'volley'; }
      } else if (this.state === 'volley') {
        if (this.st <= 0) { const a = angTo(this, player); for (let i = -1; i <= 1; i++) ebul(this.x, this.y, a + i * 0.5, 170, 9, { c: '#ff9a3a', home: ph === 2 ? 1.9 : 1.4, life: 4.2 }); if (ph === 2) fan(this.x, this.y, a, 5, 1.0, 230, 7, { c: '#ffd23f' }); this.n++; this.st = 0.8; blip(260, 0.12, 'sawtooth', 0.05); if (this.n >= 2) { this.state = 'idle'; this.st = 1.2; } }
      } else if (this.state === 'meteors') {
        if (this.st <= 0) { const cnt = ph === 2 ? 8 : 6; for (let i = 0; i < cnt; i++) meteor(player.x + (i ? rnd(-170, 170) : 0), player.y + (i ? rnd(-170, 170) : 0), 0.85 + i * 0.22, 52); this.state = 'idle'; this.st = 2.2; }
      } else if (this.state === 'blink') {
        if (this.st <= 0) { burst(this.x, this.y, 16, '#c77dff', 200); const a = rnd(0, TAU); this.x = ARENA.x + Math.cos(a) * 190; this.y = ARENA.y + Math.sin(a) * 190; burst(this.x, this.y, 16, '#c77dff', 200); ring(this.x, this.y, ph === 2 ? 16 : 12, rnd(0, 1), 200, 7, { c: '#c77dff' }); this.state = 'idle'; this.st = 0.9; }
      } else if (this.state === 'summon') {
        if (this.st <= 0) { for (let i = 0; i < 2; i++) minions.push(mkImp(this.x + rnd(-30, 30), this.y + rnd(-30, 30))); burst(this.x, this.y, 12, '#ff6a1a', 150); this.state = 'idle'; this.st = 1.6; }
      }
      inArena(this);
    };
    b.draw = function () {
      const x = this.x, y = this.y + Math.sin(time * 3) * 4, f = this.flash > 0;
      ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(this.x, this.y + 44, 24, 7, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = f ? '#fff' : '#3a2150'; ctx.beginPath(); ctx.moveTo(x, y - 30); ctx.lineTo(x + 28, y + 36); ctx.quadraticCurveTo(x, y + 28, x - 28, y + 36); ctx.closePath(); ctx.fill();
      ctx.fillStyle = f ? '#fff' : '#52307a'; ctx.beginPath(); ctx.moveTo(x - 10, y - 4); ctx.lineTo(x + 10, y - 4); ctx.lineTo(x + 14, y + 30); ctx.lineTo(x - 14, y + 30); ctx.fill();
      ctx.fillStyle = f ? '#fff' : '#e0b89a'; ctx.beginPath(); ctx.arc(x, y - 18, 10, 0, TAU); ctx.fill();
      ctx.fillStyle = f ? '#fff' : '#2a1640'; ctx.beginPath(); ctx.moveTo(x - 22, y - 22); ctx.lineTo(x + 22, y - 22); ctx.lineTo(x + 4, y - 58); ctx.closePath(); ctx.fill(); ctx.fillRect(x - 22, y - 25, 44, 5);
      ctx.fillStyle = '#ff4d3d'; ctx.beginPath(); ctx.arc(x - 4, y - 18, 2, 0, TAU); ctx.arc(x + 4, y - 18, 2, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#6a4a2a'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(x + 30, y + 40); ctx.lineTo(x + 30, y - 24); ctx.stroke(); flame(x + 30, y - 24, 1.1, 3);
    };
    return b;
  }

  function mkTitan() {
    const b = base('OBSIDIAN TITAN', 290, 54);
    b.update = function (dt) {
      const ph = this.hp / this.max < 0.5 ? 2 : 1; if (ph !== this.ph) { this.ph = ph; toastMsg('Magma floods the titan!'); shake = 14; }
      this.st -= dt;
      if (this.state === 'idle') {
        toward(this, player.x, player.y, ph === 2 ? 70 : 55, dt);
        if (this.st <= 0) { this.state = pick(['smash', 'smash', 'quake', 'throw']); this.n = 0; this.st = this.state === 'smash' ? 1.2 : 0.7; if (this.state === 'smash') zone(this.x, this.y, 110, 1.2, 0.15, {}); }
      } else if (this.state === 'smash') {
        if (this.st <= 0) { wave(this.x, this.y, 190, 460, { w: 28, c: '#ffb27a' }); wave(this.x, this.y, 190, 460, { w: 28, c: '#ff6a1a', delay: ph === 2 ? 0.65 : 0.8 }); shake = 16; blip(60, 0.4, 'sawtooth', 0.1, 0.5); this.state = 'idle'; this.st = ph === 2 ? 1.3 : 1.8; }
      } else if (this.state === 'quake') {
        if (this.st <= 0) { const cnt = ph === 2 ? 10 : 7; for (let i = 0; i < cnt; i++) { const a = rnd(0, TAU), d = rnd(0, ARENA.r - 50); meteor(ARENA.x + Math.cos(a) * d, ARENA.y + Math.sin(a) * d, 0.9 + i * 0.12, 48); } meteor(player.x, player.y, 1.0, 48); this.state = 'idle'; this.st = 2.0; }
      } else if (this.state === 'throw') {
        if (this.st <= 0) { ring(this.x, this.y, ph === 2 ? 14 : 10, this.n * 0.3, 175, 10, { c: '#7a6a60' }); if (ph === 2) fan(this.x, this.y, angTo(this, player), 3, 0.4, 260, 9, { c: '#ff6a1a' }); this.n++; this.st = 0.5; if (this.n >= 3) { this.state = 'idle'; this.st = 1.2; } }
      }
      inArena(this);
    };
    b.draw = function () {
      const x = this.x, y = this.y, f = this.flash > 0;
      if (this.state === 'smash') { ctx.strokeStyle = 'rgba(255,178,122,.3)'; ctx.lineWidth = 2; ctx.setLineDash([10, 10]); ctx.beginPath(); ctx.arc(x, y, 460, 0, TAU); ctx.stroke(); ctx.setLineDash([]); }
      ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.beginPath(); ctx.ellipse(x, y + 52, 62, 18, 0, 0, TAU); ctx.fill();
      for (const sx of [-1, 1]) { ctx.fillStyle = f ? '#fff' : '#201614'; ctx.beginPath(); ctx.arc(x + sx * 66, y + 10 + Math.sin(time * 3 + sx) * 4, 24, 0, TAU); ctx.fill(); ctx.fillStyle = f ? '#fff' : '#2c1e1a'; ctx.beginPath(); ctx.arc(x + sx * 40, y, 24, 0, TAU); ctx.fill(); ctx.fillStyle = '#ff6a1a'; ctx.beginPath(); ctx.arc(x + sx * 68, y + 10, 8, 0, TAU); ctx.fill(); }
      ctx.fillStyle = f ? '#fff' : '#2c1e1a'; ctx.beginPath(); ctx.arc(x, y, 54, 0, TAU); ctx.fill();
      ctx.fillStyle = f ? '#fff' : '#3a2822'; ctx.beginPath(); ctx.arc(x - 12, y - 16, 28, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#ff6a1a'; ctx.shadowColor = '#ff6a1a'; ctx.shadowBlur = 12; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x - 30, y + 14); ctx.lineTo(x - 8, y + 30); ctx.lineTo(x + 6, y + 10); ctx.lineTo(x + 30, y + 24); ctx.moveTo(x + 20, y - 30); ctx.lineTo(x + 12, y - 8); ctx.stroke();
      ctx.fillStyle = this.ph === 2 ? '#ff3d3d' : '#ffb347'; ctx.beginPath(); ctx.arc(x - 16, y - 10, 7, 0, TAU); ctx.arc(x + 12, y - 10, 7, 0, TAU); ctx.fill(); ctx.shadowBlur = 0;
    };
    return b;
  }

  function mkDemon() {
    const b = base('DEMON LORD', 320, 38); b.ang = 0; b.sw = 0;
    b.update = function (dt) {
      const ph = this.hp / this.max < 0.5 ? 2 : 1; if (ph !== this.ph) { this.ph = ph; toastMsg('The demon lord draws a second blade!'); shake = 14; }
      this.st -= dt;
      if (this.state === 'idle') {
        toward(this, player.x, player.y, ph === 2 ? 120 : 95, dt);
        if (this.st <= 0) { this.state = pick(['sweep', 'sweep', 'dash', 'ring', 'pillars']); this.n = 0; this.st = 0.7; if (this.state === 'dash') this.ca = angTo(this, player); }
      } else if (this.state === 'sweep') {
        if (this.n === 0 && this.st <= 0) { const d = Math.random() < 0.5 ? 1 : -1; beam(this.x, this.y, angTo(this, player) - d * 0.8, d * (ph === 2 ? 2.2 : 1.8), 0.6, 2.6); hazards[hazards.length - 1].len = 250; if (ph === 2) { beam(this.x, this.y, angTo(this, player) - d * 0.8 + Math.PI, d * 2.2, 0.6, 2.6); hazards[hazards.length - 1].len = 250; } this.n = 1; this.st = 3.4; blip(200, 0.3, 'sawtooth', 0.06); }
        else if (this.n === 1 && this.st <= 0) { this.state = 'idle'; this.st = 0.9; }
        else if (this.n === 1) { for (const h of hazards) if (h.k === 'beam') { h.x = this.x; h.y = this.y; } }
      } else if (this.state === 'dash') {
        if (this.st > 0) this.ca = angTo(this, player); else { this.x += Math.cos(this.ca) * 640 * dt; this.y += Math.sin(this.ca) * 640 * dt; if (this.st < -0.35 || inArena(this)) { this.n++; fan(this.x, this.y, this.ca, 5, 0.9, 240, 8, { c: '#ff3d3d' }); if (this.n < (ph === 2 ? 3 : 2)) this.st = 0.45; else { this.state = 'idle'; this.st = 1.1; } } }
      } else if (this.state === 'ring') {
        if (this.st <= 0) { ring(this.x, this.y, 20, this.n * 0.17, 175, 8, { c: '#ff3d3d' }, 4); this.n++; this.st = 0.38; if (this.n >= (ph === 2 ? 5 : 4)) { this.state = 'idle'; this.st = 1.1; } }
      } else if (this.state === 'pillars') {
        if (this.st <= 0) { for (let i = 0; i < (ph === 2 ? 4 : 3); i++) meteor(player.x + rnd(-60, 60), player.y + rnd(-60, 60), 0.7 + i * 0.35, 46); this.state = 'idle'; this.st = 1.6; }
      }
      inArena(this);
    };
    b.draw = function () {
      const x = this.x, y = this.y, f = this.flash > 0, a = angTo(this, player);
      if (this.state === 'dash' && this.st > 0) { ctx.strokeStyle = 'rgba(255,60,50,.5)'; ctx.lineWidth = 30; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(this.ca) * 520, y + Math.sin(this.ca) * 520); ctx.stroke(); }
      ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(x, y + 40, 36, 11, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = f ? '#fff' : '#2a0e12'; ctx.beginPath(); ctx.moveTo(x - 30, y - 10); ctx.lineTo(x + 30, y - 10); ctx.lineTo(x + 46, y + 44); ctx.lineTo(x - 46, y + 44); ctx.closePath(); ctx.fill();
      ctx.fillStyle = f ? '#fff' : '#b5232f'; ctx.beginPath(); ctx.ellipse(x, y, 28, 32, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = f ? '#fff' : '#d23a3a'; ctx.beginPath(); ctx.arc(x, y - 26, 17, 0, TAU); ctx.fill();
      ctx.fillStyle = f ? '#fff' : '#1c0a0c'; ctx.beginPath(); ctx.moveTo(x - 14, y - 36); ctx.lineTo(x - 28, y - 62); ctx.lineTo(x - 6, y - 40); ctx.moveTo(x + 14, y - 36); ctx.lineTo(x + 28, y - 62); ctx.lineTo(x + 6, y - 40); ctx.fill();
      ctx.fillStyle = '#ffd23f'; ctx.shadowColor = '#ffd23f'; ctx.shadowBlur = 10; ctx.beginPath(); ctx.arc(x - 6, y - 28, 3.5, 0, TAU); ctx.arc(x + 6, y - 28, 3.5, 0, TAU); ctx.fill(); ctx.shadowBlur = 0;
      ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.fillStyle = '#6a6f78'; ctx.fillRect(14, -3, 46, 6); ctx.fillStyle = '#ff6a1a'; ctx.shadowColor = '#ff6a1a'; ctx.shadowBlur = 12; ctx.fillRect(18, -1.5, 40, 3); ctx.shadowBlur = 0; ctx.fillStyle = '#c9a227'; ctx.fillRect(10, -7, 4, 14); ctx.restore();
    };
    return b;
  }

  function mkDragon() {
    const b = base('INFERNAL DRAGON', 1000, 52); b.face = Math.PI / 2; b.air = 0; b.stun = 0; b.wing = 0; b.cone = null; b.tx = 0; b.ty = 0;
    const flying = d => d.air > 0.3;
    b.update = function (dt) {
      const f = this.hp / this.max, ph = f > 0.7 ? 1 : f > 0.42 ? 2 : f > 0.2 ? 3 : 4;
      if (ph !== this.ph) { this.ph = ph; toastMsg(ph === 2 ? 'The dragon takes to the sky!' : ph === 3 ? 'The dragon is ENRAGED!' : 'LAST STAND! The dragon burns with fury!', 2.2); shake = 18; hazards.length = 0; eBul.length = 0; burst(this.x, this.y, 40, '#ff8a1a', 300); this.state = 'idle'; this.st = 1.1; this.air = 0; this.stun = 0; this.cone = null; this.mouth = false; ring(this.x, this.y, 20, 0, 210, 9, { c: '#ff8a1a' }); }
      if (this.stun > 0) { this.stun -= dt; return; }
      this.st -= dt; this.wing += dt;
      const toP = angTo(this, player), rest = k => k * [0, 0.8, 0.6, 0.45, 0.32][ph], spd = [0, 62, 88, 112, 138][ph];
      if (['idle', 'stomp', 'tail', 'fireballs', 'gust', 'cyclone'].includes(this.state)) this.face += clamp(angDiff(toP, this.face), -2.6 * dt, 2.6 * dt);
      if (this.state === 'idle') {
        if (dist(this, player) > 120) { toward(this, player.x, player.y, spd, dt); if (ph >= 3) { this.ft = (this.ft || 0) - dt; if (this.ft <= 0) { this.ft = 0.55; fire(this.x - Math.cos(this.face) * 40, this.y - Math.sin(this.face) * 40, 26, 2.6); } } }
        if (this.st <= 0) {
          const o = ['breath', 'tail', 'fireballs', 'stomp']; if (ph >= 2) o.push('fly', 'gust'); if (ph >= 3) o.push('eruption', 'cyclone', 'breath', 'fly'); if (ph === 4) o.push('eruption', 'cyclone', 'fly');
          let nx = pick(o); if (nx === this.last) nx = pick(o); this.last = nx; this.state = nx; this.n = 0; this.bt = 0;
          if (nx === 'stomp') { this.st = ph >= 3 ? 0.8 : 1.0; zone(this.x, this.y, 140, this.st, 0.15, {}); }
          else if (nx === 'tail') { this.st = ph >= 3 ? 0.65 : 0.8; zone(this.x, this.y, 190, this.st, 0.4, { c: '#ff5a3d' }); }
          else if (nx === 'breath') { this.st = 0.8; this.face = toP; const d = Math.random() < 0.5 ? 1 : -1, rot = d * [0, 0.85, 0.95, 1.1, 1.25][ph], dur = [0, 1.8, 2.0, 2.4, 2.7][ph]; this.cone = { k: 'cone', own: this, x: this.x, y: this.y, a: this.face - d * 0.7, rot, delay: 0.8, dur, t: 0, r: 390, half: 0.3 }; hazards.push(this.cone); if (ph >= 3) hazards.push({ k: 'cone', own: this, x: this.x, y: this.y, a: this.face - d * 0.7 + Math.PI, rot, delay: 0.8, dur, t: 0, r: 390, half: 0.26 }); }
          else if (nx === 'fly') { this.st = 0.8; }
          else if (nx === 'eruption') { this.st = 0.6; }
          else if (nx === 'cyclone') { this.st = 3.2; this.cy = rnd(0, TAU); this.ct = 0; }
          else this.st = 0.5;
        }
      } else if (this.state === 'stomp') {
        if (this.st <= 0) { wave(this.x, this.y, 200, 440, { w: 28, c: '#ffb27a' }); if (ph >= 2) wave(this.x, this.y, 200, 440, { w: 26, c: '#ff6a1a', delay: 0.5 }); if (ph >= 4) ring(this.x, this.y, 16, 0, 200, 9, { c: '#ff8a1a' }); shake = 14; blip(60, 0.4, 'sawtooth', 0.1, 0.5); this.state = 'idle'; this.st = rest(1.6); }
      } else if (this.state === 'tail') {
        if (this.st <= 0) { ring(this.x, this.y, ph >= 2 ? 14 : 10, 0.3, 210, 8, { c: '#ff5a3d' }); if (ph >= 3) zone(this.x, this.y, 270, 0.7, 0.3, { c: '#ff5a3d' }); this.state = 'idle'; this.st = rest(1.4); }
      } else if (this.state === 'breath') {
        if (this.cone) { this.face = this.cone.a; this.mouth = true; this.bt -= dt; if (ph >= 3 && this.bt <= 0 && this.cone.t > this.cone.delay) { this.bt = ph === 4 ? 0.4 : 0.55; ebul(this.x, this.y, toP, 230, 8, { c: '#ffd23f', home: 1.2, life: 3 }); } }
        if (this.st <= -(this.cone ? this.cone.dur : 0) - 0.1 || (this.cone && this.cone.dead)) { this.cone = null; this.mouth = false; this.state = 'idle'; this.st = rest(1.3); }
      } else if (this.state === 'fireballs') {
        if (this.st <= 0) { const a = angTo(this, player); fan(this.x, this.y, a, 5 + ph * 2, 1.25, 245 + ph * 10, 8, { c: '#ffd23f' }); for (let i = -1; i <= 1; i += 2) ebul(this.x, this.y, a + i * 0.45, 175, 9, { c: '#ff9a3a', home: 1.1 + ph * 0.25, life: 4 }); blip(220, 0.12, 'sawtooth', 0.05); this.n++; this.st = 0.5 - ph * 0.04; if (this.n >= 2 + ph) { this.state = 'idle'; this.st = rest(1.3); } }
      } else if (this.state === 'gust') {
        if (this.st <= 0) { ring(this.x, this.y, 18, this.n * 0.35, 135 + ph * 8, 12, { c: '#ff8a1a' }, 4); this.n++; this.st = 0.62; blip(100, 0.2, 'triangle', 0.06); if (this.n >= 3 + (ph >= 3 ? 1 : 0)) { this.state = 'idle'; this.st = rest(1.3); } }
      } else if (this.state === 'cyclone') {
        toward(this, player.x, player.y, 60, dt); this.ct -= dt; this.cy += dt * 2.3;
        if (this.ct <= 0) { this.ct = 0.1; const arms = ph === 4 ? 4 : 3; for (let i = 0; i < arms; i++) ebul(this.x, this.y, this.cy + i * TAU / arms, 215, 7, { c: '#ff8a1a', life: 3.2 }); }
        if (this.st <= 0) { this.state = 'idle'; this.st = rest(1.4); }
      } else if (this.state === 'fly') {
        this.air = clamp(this.air + dt * 1.3, 0, 1);
        if (this.st <= 0) { this.state = 'hover'; this.st = [0, 0, 2.4, 2.8, 3.2][ph]; this.n = 0; this.mt = 0; }
      } else if (this.state === 'hover') {
        this.mt -= dt; if (this.mt <= 0) { meteor(player.x + rnd(-140, 140), player.y + rnd(-140, 140), 0.85, 54); if (this.n % 2 === 0) meteor(player.x, player.y, 0.85, 52); if (ph >= 3 && this.n % 3 === 0) fan(this.x, this.y, toP, 5, 0.9, 230, 8, { c: '#ffd23f' }); this.n++; this.mt = [0, 0, 0.36, 0.28, 0.2][ph]; }
        toward(this, player.x, player.y, 100, dt);
        if (this.st <= 0) { this.state = 'dive'; this.st = ph >= 3 ? 0.85 : 1.0; this.dv = this.st; this.tx = player.x; this.ty = player.y; this.fx = this.x; this.fy = this.y; zone(this.tx, this.ty, 110, this.st, 0.2, { c: '#ff3d3d' }); }
      } else if (this.state === 'dive') {
        const u = clamp(1 - this.st / this.dv, 0, 1); this.x = this.fx + (this.tx - this.fx) * u * u; this.y = this.fy + (this.ty - this.fy) * u * u; this.air = clamp(1 - u * u * 1.1, 0, 1);
        if (this.st <= 0) { this.air = 0; this.x = this.tx; this.y = this.ty; shake = 22; blip(50, 0.5, 'sawtooth', 0.12, 0.4); wave(this.x, this.y, 240, 450, { w: 30, c: '#ffb27a' }); if (ph >= 3) wave(this.x, this.y, 240, 450, { w: 26, c: '#ff6a1a', delay: 0.45 }); ring(this.x, this.y, ph >= 3 ? 20 : 14, 0, 195, 9, { c: '#ff8a1a' }); fire(this.x, this.y, 52, 4); if (ph === 4) for (let i = 0; i < 5; i++) meteor(player.x + rnd(-150, 150), player.y + rnd(-150, 150), 0.8 + i * 0.1, 50); this.state = 'idle'; this.st = rest(1.3); this.stun = [0, 0, 1.5, 1.1, 0.8][ph]; toastMsg('The dragon is stunned - hit it!', 1.2); }
      } else if (this.state === 'eruption') {
        if (this.st <= 0) { const a = toP; for (let i = 1; i <= 8; i++) meteor(this.x + Math.cos(a) * i * 75, this.y + Math.sin(a) * i * 75, 0.5 + i * 0.1, 48); for (let k = -1; k <= 1; k += 2) for (let i = 2; i <= 6; i += 2) meteor(this.x + Math.cos(a + k * 0.5) * i * 75, this.y + Math.sin(a + k * 0.5) * i * 75, 0.7 + i * 0.1, 44); if (ph >= 3) for (let i = 0; i < 6; i++) meteor(player.x + Math.cos(i * 1.047) * 130, player.y + Math.sin(i * 1.047) * 130, 1.0, 44); this.state = 'idle'; this.st = rest(2.4); }
      }
      inArena(this);
    };
    b.draw = function () {
      const air = this.air, x = this.x, y = this.y - air * 80, sc = 1 + air * 0.3, f = this.flash > 0, flap = Math.sin(this.wing * (air > 0.1 ? 11 : 3.2));
      ctx.fillStyle = 'rgba(0,0,0,' + (0.4 - air * 0.18) + ')'; ctx.beginPath(); ctx.ellipse(this.x, this.y + 44, (90 - air * 24), (26 - air * 8), 0, 0, TAU); ctx.fill();
      ctx.save(); ctx.translate(x, y); ctx.scale(sc, sc); ctx.rotate(this.face);
      const dark = f ? '#fff' : '#5a140e', mid = f ? '#fff' : '#a3321f', lite = f ? '#fff' : '#d9743a';
      // tail with spikes
      ctx.strokeStyle = dark; ctx.lineWidth = 22; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-30, 0); let tx = -30, ty = 0; const tp = []; for (let i = 1; i <= 7; i++) { tx = -30 - i * 17; ty = Math.sin(time * 3 - i * 0.7) * 9 * (i / 4); ctx.lineTo(tx, ty); tp.push([tx, ty]); } ctx.stroke();
      ctx.lineWidth = 10; ctx.strokeStyle = mid; ctx.beginPath(); ctx.moveTo(-30, 0); for (const [px, py] of tp) ctx.lineTo(px, py); ctx.stroke();
      ctx.fillStyle = lite; ctx.beginPath(); ctx.moveTo(tx - 6, ty - 10); ctx.lineTo(tx - 34, ty); ctx.lineTo(tx - 6, ty + 10); ctx.fill();
      // wings
      for (const sy of [-1, 1]) {
        const tipY = sy * (96 + flap * 22 + air * 14), tipX = -34 - flap * 8;
        ctx.fillStyle = dark; ctx.beginPath(); ctx.moveTo(-4, sy * 20); ctx.lineTo(-18, tipY * 0.7); ctx.lineTo(tipX, tipY); ctx.lineTo(-50, sy * 62); ctx.lineTo(-62, tipY * 0.6); ctx.lineTo(-58, sy * 28); ctx.closePath(); ctx.fill();
        ctx.fillStyle = f ? '#fff' : 'rgba(217,116,58,.55)'; ctx.beginPath(); ctx.moveTo(-6, sy * 22); ctx.lineTo(tipX + 4, tipY - sy * 4); ctx.lineTo(-48, sy * 60); ctx.lineTo(-56, sy * 30); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#2a0a06'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-4, sy * 20); ctx.lineTo(tipX, tipY); ctx.moveTo(-8, sy * 24); ctx.lineTo(-50, sy * 62); ctx.stroke();
      }
      // legs
      ctx.fillStyle = dark; for (const [lx, ly] of [[16, -30], [16, 30], [-20, -32], [-20, 32]]) { ctx.beginPath(); ctx.ellipse(lx, ly, 14, 9, 0, 0, TAU); ctx.fill(); ctx.fillStyle = '#ffe9c0'; for (let c = -1; c <= 1; c++) { ctx.beginPath(); ctx.moveTo(lx + 12, ly + c * 4); ctx.lineTo(lx + 22, ly + c * 5); ctx.lineTo(lx + 12, ly + c * 4 + 2); ctx.fill(); } ctx.fillStyle = dark; }
      // body, belly, back spikes
      ctx.fillStyle = mid; ctx.beginPath(); ctx.ellipse(0, 0, 52, 34, 0, 0, TAU); ctx.fill(); ctx.fillStyle = lite; ctx.beginPath(); ctx.ellipse(6, 0, 36, 18, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = dark; for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.moveTo(30 - i * 14, -5); ctx.lineTo(24 - i * 14, 0); ctx.lineTo(30 - i * 14, 5); ctx.closePath(); ctx.fill(); }
      // neck and head
      ctx.fillStyle = mid; ctx.beginPath(); ctx.ellipse(48, 0, 22, 17, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = mid; ctx.beginPath(); ctx.ellipse(72, 0, 26, 19, 0, 0, TAU); ctx.fill(); ctx.fillStyle = dark; ctx.beginPath(); ctx.moveTo(90, -7); ctx.lineTo(112, -4); ctx.lineTo(112, 4); ctx.lineTo(90, 7); ctx.fill();
      ctx.fillStyle = '#ffe9c0'; ctx.beginPath(); ctx.moveTo(66, -16); ctx.lineTo(44, -34); ctx.lineTo(74, -22); ctx.moveTo(66, 16); ctx.lineTo(44, 34); ctx.lineTo(74, 22); ctx.fill();
      ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.arc(78, -9, 4.5, 0, TAU); ctx.arc(78, 9, 4.5, 0, TAU); ctx.fill();
      if (this.mouth) { ctx.fillStyle = '#ffb347'; ctx.beginPath(); ctx.ellipse(108, 0, 12, 7, 0, 0, TAU); ctx.fill(); }
      if (this.stun > 0) { ctx.fillStyle = '#fff'; ctx.font = 'bold 20px ' + FONT; ctx.textAlign = 'center'; ctx.save(); ctx.rotate(-this.face); ctx.fillText('* * *', 0, -70 + Math.sin(time * 8) * 4); ctx.restore(); }
      ctx.restore();
    };
    return b;
  }


  // ------------------------------------------------------------------ acid realm bosses (bosses 11-15, toughest of all)
  const AC = '#9dff3a', AC2 = '#d8ff7a', ACD = '#1f4a14';
  const pool = (x, y, r, dur) => hazards.push({ k: 'fire', acid: true, x, y, r, t: 0, dur });
  const glob = (x, y, delay, r) => zone(x, y, r || 52, delay, 0.15, { c: AC, tc: 'rgba(157,255,58,.16)', onEnd: z => { pool(z.x, z.y, (r || 52) * 0.8, 3.5); shake = 4; } });
  const acidZone = (x, y, r, delay, dur) => zone(x, y, r, delay, dur, { c: AC, tc: 'rgba(157,255,58,.16)' });
  const AB = o => Object.assign({ c: AC }, o);
  const addBeam = (x, y, a, rot, delay, dur, len) => { beam(x, y, a, rot, delay, dur); hazards[hazards.length - 1].len = len; };
  const followBeams = o => { for (const h of hazards) if (h.k === 'beam') { h.x = o.x; h.y = o.y; } };

  function mkAcidling(x, y) {
    return { x, y, r: 11, hp: 4, max: 4, flash: 0, name: 'acidling', w: rnd(0, 6), sh: rnd(0.8, 1.6),
      update(dt) { this.w += dt * 3; const d = dist(this, player), a = angTo(this, player), k = d > 200 ? 1 : d < 120 ? -1 : 0; this.x += (Math.cos(a) * k + Math.cos(a + 1.57) * Math.sin(this.w) * 0.9) * 120 * dt; this.y += (Math.sin(a) * k + Math.sin(a + 1.57) * Math.sin(this.w) * 0.9) * 120 * dt; inArena(this); this.sh -= dt; if (this.sh <= 0) { ebul(this.x, this.y, a, 200, 7, AB()); this.sh = rnd(1.4, 2.0); } },
      draw() { const f = this.flash > 0, wob = Math.sin(time * 8 + this.w) * 1.5; ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(this.x, this.y + 11, 11, 4, 0, 0, TAU); ctx.fill(); ctx.fillStyle = f ? '#fff' : '#3f8a24'; ctx.beginPath(); ctx.ellipse(this.x, this.y, 12 + wob, 11 - wob, 0, 0, TAU); ctx.fill(); ctx.fillStyle = f ? '#fff' : '#7fd13a'; ctx.beginPath(); ctx.ellipse(this.x - 3, this.y - 3, 6, 4, 0, 0, TAU); ctx.fill(); ctx.fillStyle = '#ffe94a'; ctx.fillRect(this.x - 5, this.y - 1, 3, 3); ctx.fillRect(this.x + 2, this.y - 1, 3, 3); } };
  }

  function mkScorpion() {
    const b = base('ACID SCORPION', 380, 42); b.face = Math.PI / 2; b.ca = 0;
    b.update = function (dt) {
      const ph = this.hp / this.max < 0.5 ? 2 : 1; if (ph !== this.ph) { this.ph = ph; toastMsg('The scorpion\'s shell cracks - it is furious!'); shake = 12; ring(this.x, this.y, 16, 0, 200, 8, AB()); }
      this.st -= dt; const toP = angTo(this, player);
      if (['idle', 'sting', 'smash', 'rain'].includes(this.state)) this.face += clamp(angDiff(toP, this.face), -3 * dt, 3 * dt);
      if (this.state === 'idle') {
        const d = dist(this, player); if (d > 150) toward(this, player.x, player.y, 120 + ph * 30, dt); else if (d < 100) toward(this, player.x, player.y, -90, dt);
        if (this.st <= 0) { this.state = pick(['sting', 'sting', 'charge', 'smash', 'rain']); this.n = 0; this.st = 0.5;
          if (this.state === 'charge') { this.st = 0.7; this.ca = toP; }
          else if (this.state === 'smash') { this.st = 0.9; this.sx = this.x + Math.cos(this.face) * 95; this.sy = this.y + Math.sin(this.face) * 95; acidZone(this.sx, this.sy, 100, 0.9, 0.2); if (ph === 2) { this.sx2 = this.x + Math.cos(this.face + 0.9) * 110; this.sy2 = this.y + Math.sin(this.face + 0.9) * 110; acidZone(this.sx2, this.sy2, 80, 0.9, 0.2); } } }
      } else if (this.state === 'sting') {
        if (this.st <= 0) { fan(this.x, this.y, toP, ph === 2 ? 7 : 5, 0.9, 215, 8, AB()); glob(player.x, player.y, 0.9, 54); blip(240, 0.1, 'sawtooth', 0.05); this.n++; this.st = 0.55; if (this.n >= (ph === 2 ? 4 : 3)) { this.state = 'idle'; this.st = 1.1; } }
      } else if (this.state === 'smash') {
        if (this.st <= 0) { wave(this.sx, this.sy, 220, 300, { w: 24, c: AC }); ring(this.sx, this.sy, 10, 0, 190, 8, AB()); shake = 10; if (ph === 2) { wave(this.sx2, this.sy2, 220, 260, { w: 22, c: AC }); } this.state = 'idle'; this.st = 1.2; }
      } else if (this.state === 'charge') {
        if (this.st > 0) this.ca = toP; else { this.x += Math.cos(this.ca) * 650 * dt; this.y += Math.sin(this.ca) * 650 * dt; this.pt = (this.pt || 0) + dt; if (this.pt > 0.09) { this.pt = 0; pool(this.x, this.y, 24, 2.6); }
          if (this.st < -0.55 || inArena(this)) { this.n++; if (this.n < (ph === 2 ? 3 : 2)) { this.st = 0.45; this.ca = angTo(this, player); } else { this.state = 'idle'; this.st = 1.1; } } }
      } else if (this.state === 'rain') {
        if (this.st <= 0) { const cnt = ph === 2 ? 10 : 7; for (let i = 0; i < cnt; i++) glob(player.x + (i ? rnd(-190, 190) : 0), player.y + (i ? rnd(-190, 190) : 0), 0.8 + i * 0.12, 54); this.state = 'idle'; this.st = 1.8; }
      }
      inArena(this);
    };
    b.draw = function () {
      const x = this.x, y = this.y, f = this.flash > 0, dk = f ? '#fff' : '#1f4a14', md = f ? '#fff' : '#3f8a24', lt = f ? '#fff' : '#7fd13a';
      if (this.state === 'charge' && this.st > 0) { ctx.strokeStyle = 'rgba(157,255,58,.45)'; ctx.lineWidth = 34; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(this.ca) * 540, y + Math.sin(this.ca) * 540); ctx.stroke(); }
      ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(x, y + 36, 54, 14, 0, 0, TAU); ctx.fill();
      ctx.save(); ctx.translate(x, y); ctx.rotate(this.face); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.strokeStyle = dk; ctx.lineWidth = 5; for (let i = 0; i < 4; i++) for (const s of [-1, 1]) { const w = Math.sin(time * 9 + i * 1.3 + (s > 0 ? 1.5 : 0)) * 6; ctx.beginPath(); ctx.moveTo(10 - i * 14, s * 16); ctx.lineTo(16 - i * 14 + w, s * 36); ctx.lineTo(8 - i * 14 + w, s * 48); ctx.stroke(); }
      const tp = []; for (let i = 0; i <= 7; i++) { const u = i / 7; tp.push([-30 - Math.sin(u * 2.6) * 42 + u * 38, Math.sin(time * 3 + u * 3) * 6]); }
      for (const [lw, col] of [[14, dk], [7, md]]) { ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath(); tp.forEach((q, i) => i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])); ctx.stroke(); }
      const sp = tp[7]; ctx.fillStyle = AC; ctx.beginPath(); ctx.moveTo(sp[0] + 3, sp[1] - 7); ctx.lineTo(sp[0] + 26, sp[1]); ctx.lineTo(sp[0] + 3, sp[1] + 7); ctx.fill();
      ctx.fillStyle = dk; ctx.beginPath(); ctx.ellipse(0, 0, 40, 30, 0, 0, TAU); ctx.fill(); ctx.fillStyle = md; ctx.beginPath(); ctx.ellipse(2, 0, 34, 24, 0, 0, TAU); ctx.fill(); ctx.fillStyle = lt; ctx.beginPath(); ctx.ellipse(8, 0, 18, 12, 0, 0, TAU); ctx.fill();
      for (const s of [-1, 1]) { ctx.strokeStyle = md; ctx.lineWidth = 9; ctx.beginPath(); ctx.moveTo(30, s * 14); ctx.lineTo(56, s * 26); ctx.stroke(); ctx.fillStyle = dk; ctx.beginPath(); ctx.moveTo(52, s * 20); ctx.lineTo(86, s * 12); ctx.lineTo(66, s * 28); ctx.fill(); ctx.beginPath(); ctx.moveTo(52, s * 32); ctx.lineTo(86, s * 42); ctx.lineTo(66, s * 26); ctx.fill(); }
      ctx.fillStyle = '#ffe94a'; ctx.beginPath(); ctx.arc(34, -8, 3.5, 0, TAU); ctx.arc(34, 8, 3.5, 0, TAU); ctx.fill();
      ctx.restore();
    };
    return b;
  }

  function mkHydra() {
    const b = base('VENOM HYDRA', 430, 40); b.rot = 0; b.hd = [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }]; b.open = [0, 0, 0];
    b.update = function (dt) {
      const ph = this.hp / this.max < 0.5 ? 2 : 1; if (ph !== this.ph) { this.ph = ph; toastMsg('Two more heads burst out!'); shake = 12; ring(this.x, this.y, 18, 0, 190, 8, AB()); }
      this.st -= dt; this.rot += dt * (this.state === 'sweep' ? 0.1 : 0.7);
      for (let i = 0; i < 3; i++) { const a = this.rot + i * TAU / 3; this.hd[i].x = this.x + Math.cos(a) * (80 + Math.sin(time * 2 + i) * 8); this.hd[i].y = this.y + Math.sin(a) * (80 + Math.sin(time * 2 + i) * 8); this.open[i] = Math.max(0, this.open[i] - dt); }
      if (this.state === 'idle') {
        if (dist(this, player) > 100) toward(this, player.x, player.y, 55 + ph * 18, dt);
        if (this.st <= 0) { this.state = pick(['spit', 'spit', 'sweep', 'slam', 'pools']); this.n = 0; this.st = 0.5; if (this.state === 'slam') { this.st = 0.9; acidZone(this.x, this.y, 155, 0.9, 0.2); } }
      } else if (this.state === 'spit') {
        if (this.st <= 0) { const i = this.n % 3, h = this.hd[i]; fan(h.x, h.y, angTo(h, player), ph === 2 ? 7 : 5, 0.9, 215, 8, AB()); this.open[i] = 0.3; if (ph === 2) { const h2 = this.hd[(i + 1) % 3]; ebul(h2.x, h2.y, angTo(h2, player), 170, 9, AB({ c: AC2, home: 1.5, life: 4 })); this.open[(i + 1) % 3] = 0.3; } blip(230, 0.1, 'sawtooth', 0.05); this.n++; this.st = 0.42; if (this.n >= (ph === 2 ? 9 : 6)) { this.state = 'idle'; this.st = 1.2; } }
      } else if (this.state === 'sweep') {
        if (this.n === 0 && this.st <= 0) { const d = Math.random() < 0.5 ? 1 : -1, a0 = rnd(0, TAU), arms = ph === 2 ? 3 : 2; for (let i = 0; i < arms; i++) addBeam(this.x, this.y, a0 + i * TAU / arms, d * (ph === 2 ? 0.95 : 0.8), 0.7, 3.0, 340); this.n = 1; this.st = 3.8; blip(200, 0.3, 'sawtooth', 0.06); }
        else if (this.n === 1 && this.st <= 0) { this.state = 'idle'; this.st = 1.0; }
        else if (this.n === 1) followBeams(this);
      } else if (this.state === 'slam') {
        if (this.st <= 0) { wave(this.x, this.y, 210, 440, { w: 28, c: AC }); for (const h of this.hd) pool(h.x, h.y, 34, 3.5); if (ph === 2) ring(this.x, this.y, 16, 0, 170, 9, AB()); shake = 12; blip(60, 0.4, 'sawtooth', 0.1, 0.5); this.state = 'idle'; this.st = 1.3; }
      } else if (this.state === 'pools') {
        if (this.st <= 0) { for (let i = 0; i < 3; i++) for (let k = 0; k < (ph === 2 ? 2 : 1); k++) glob(player.x + (i || k ? rnd(-130, 130) : 0), player.y + (i || k ? rnd(-130, 130) : 0), 0.8 + i * 0.22 + k * 0.4, 56); for (const h of this.hd) fan(h.x, h.y, angTo(h, player), 3, 0.5, 210, 8, AB()); this.state = 'idle'; this.st = 1.7; }
      }
      inArena(this);
    };
    b.draw = function () {
      const x = this.x, y = this.y, f = this.flash > 0, dk = f ? '#fff' : '#1f4a14', md = f ? '#fff' : '#3f8a24', lt = f ? '#fff' : '#7fd13a';
      ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(x, y + 40, 60, 16, 0, 0, TAU); ctx.fill();
      ctx.lineCap = 'round'; this.hd.forEach((h, i) => { ctx.strokeStyle = dk; ctx.lineWidth = 20; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(h.x, h.y); ctx.stroke(); ctx.strokeStyle = md; ctx.lineWidth = 11; ctx.stroke(); });
      ctx.fillStyle = dk; ctx.beginPath(); ctx.arc(x, y, 42, 0, TAU); ctx.fill(); ctx.fillStyle = md; ctx.beginPath(); ctx.arc(x - 3, y - 4, 35, 0, TAU); ctx.fill(); ctx.fillStyle = lt; for (let i = 0; i < 7; i++) { ctx.beginPath(); ctx.arc(x + Math.cos(i * 0.9) * 20, y + Math.sin(i * 1.3) * 18, 4, 0, TAU); ctx.fill(); }
      this.hd.forEach((h, i) => { const a = angTo(h, player), op = this.open[i] > 0 ? 0.55 : 0.12; ctx.save(); ctx.translate(h.x, h.y); ctx.rotate(a); ctx.fillStyle = dk; ctx.beginPath(); ctx.ellipse(0, 0, 22, 16, 0, 0, TAU); ctx.fill(); ctx.fillStyle = md; ctx.beginPath(); ctx.ellipse(-2, 0, 18, 12, 0, 0, TAU); ctx.fill();
        for (const s of [-1, 1]) { ctx.fillStyle = dk; ctx.beginPath(); ctx.moveTo(10, s * 3); ctx.lineTo(34, s * (4 + op * 20)); ctx.lineTo(10, s * 11); ctx.fill(); ctx.fillStyle = '#f4ffd0'; ctx.beginPath(); ctx.moveTo(18, s * (4 + op * 8)); ctx.lineTo(24, s * (8 + op * 14)); ctx.lineTo(26, s * (4 + op * 8)); ctx.fill(); ctx.fillStyle = '#ffe94a'; ctx.beginPath(); ctx.arc(4, s * 8, 3.2, 0, TAU); ctx.fill(); }
        if (this.open[i] > 0) { ctx.fillStyle = AC; ctx.beginPath(); ctx.arc(30, 0, 6, 0, TAU); ctx.fill(); } ctx.restore(); });
    };
    return b;
  }

  function mkAcidWraith() {
    const b = base('TOXIC WRAITH', 400, 30); b.ang = 0; b.ca = 0;
    b.update = function (dt) {
      const ph = this.hp / this.max < 0.5 ? 2 : 1; if (ph !== this.ph) { this.ph = ph; toastMsg('The wraith dissolves into a toxic cloud!'); shake = 10; ring(this.x, this.y, 20, 0, 190, 8, AB()); }
      this.st -= dt; this.ang += dt; const toP = angTo(this, player);
      if (this.state === 'idle') {
        toward(this, player.x + Math.cos(this.ang * 0.9) * 230, player.y + Math.sin(this.ang * 0.9) * 230, 110 + ph * 30, dt); inArena(this);
        if (this.st <= 0) { const o = ['volley', 'blink', 'nova', 'summon', 'trail']; if (ph === 2) o.push('blink', 'nova', 'trail'); this.state = pick(o); this.n = 0; this.st = 0.5; if (this.state === 'summon' && minions.length >= 4) this.state = 'volley'; if (this.state === 'trail') { this.st = 0.6; this.ca = toP; } }
      } else if (this.state === 'volley') {
        if (this.st <= 0) { for (let i = -1; i <= 1; i++) ebul(this.x, this.y, toP + i * 0.5, 170, 9, AB({ c: AC2, home: ph === 2 ? 1.9 : 1.4, life: 4.2 })); if (ph === 2) fan(this.x, this.y, toP, 5, 1.0, 225, 7, AB()); this.n++; this.st = 0.75; blip(260, 0.12, 'sawtooth', 0.05); if (this.n >= (ph === 2 ? 3 : 2)) { this.state = 'idle'; this.st = 1.1; } }
      } else if (this.state === 'blink') {
        if (this.st <= 0) { burst(this.x, this.y, 16, AC, 200); glob(this.x, this.y, 0.6, 56); let a, k = 0; do { a = rnd(0, TAU); this.x = ARENA.x + Math.cos(a) * 200; this.y = ARENA.y + Math.sin(a) * 200; k++; } while (dist(this, player) < 150 && k < 10); burst(this.x, this.y, 16, AC, 200); ring(this.x, this.y, ph === 2 ? 18 : 12, rnd(0, 1), 195, 7, AB()); glob(player.x, player.y, 0.9, 54); this.n++; if (this.n < (ph === 2 ? 2 : 1)) this.st = 0.55; else { this.state = 'idle'; this.st = 0.9; } }
      } else if (this.state === 'nova') {
        if (this.st <= 0) { ring(this.x, this.y, 22, toP + this.n * 0.4, 150, 9, AB(), 5); this.n++; this.st = 0.5; blip(110, 0.2, 'triangle', 0.06); if (this.n >= (ph === 2 ? 4 : 3)) { this.state = 'idle'; this.st = 1.2; } }
      } else if (this.state === 'summon') {
        if (this.st <= 0) { for (let i = 0; i < (ph === 2 ? 3 : 2); i++) minions.push(mkAcidling(this.x + rnd(-30, 30), this.y + rnd(-30, 30))); burst(this.x, this.y, 12, AC, 150); this.state = 'idle'; this.st = 1.5; }
      } else if (this.state === 'trail') {
        if (this.st > 0) this.ca = toP; else { this.x += Math.cos(this.ca) * 430 * dt; this.y += Math.sin(this.ca) * 430 * dt; this.pt = (this.pt || 0) + dt; if (this.pt > 0.1) { this.pt = 0; pool(this.x, this.y, 26, 3); } if (this.st < -0.7 || inArena(this)) { this.state = 'idle'; this.st = 1.0; fan(this.x, this.y, angTo(this, player), 7, 1.1, 220, 8, AB()); } }
      }
      inArena(this);
    };
    b.draw = function () {
      const x = this.x, y = this.y + Math.sin(time * 3) * 4, f = this.flash > 0;
      if (this.state === 'trail' && this.st > 0) { ctx.strokeStyle = 'rgba(157,255,58,.4)'; ctx.lineWidth = 28; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(this.ca) * 520, y + Math.sin(this.ca) * 520); ctx.stroke(); }
      ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(this.x, this.y + 44, 22, 6, 0, 0, TAU); ctx.fill();
      ctx.globalAlpha = 0.85; ctx.fillStyle = f ? '#fff' : '#17361a'; ctx.beginPath(); ctx.moveTo(x, y - 34); ctx.quadraticCurveTo(x + 34, y - 4, x + 30, y + 40); for (let i = 0; i < 5; i++) ctx.lineTo(x + 30 - (i + 0.5) * 12 - 0, y + 40 + (i % 2 ? -6 : 8) + Math.sin(time * 6 + i) * 3); ctx.lineTo(x - 30, y + 40); ctx.quadraticCurveTo(x - 34, y - 4, x, y - 34); ctx.fill();
      ctx.fillStyle = f ? '#fff' : '#2c6b2a'; ctx.beginPath(); ctx.moveTo(x, y - 28); ctx.quadraticCurveTo(x + 20, y - 2, x + 16, y + 30); ctx.lineTo(x - 16, y + 30); ctx.quadraticCurveTo(x - 20, y - 2, x, y - 28); ctx.fill(); ctx.globalAlpha = 1;
      ctx.fillStyle = '#050f06'; ctx.beginPath(); ctx.ellipse(x, y - 12, 12, 14, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = AC; ctx.beginPath(); ctx.arc(x - 5, y - 13, 3.2, 0, TAU); ctx.arc(x + 5, y - 13, 3.2, 0, TAU); ctx.fill();
      for (let i = 0; i < 3; i++) { const a = time * 2 + i * 2.1; ctx.fillStyle = 'rgba(157,255,58,.6)'; ctx.beginPath(); ctx.arc(x + Math.cos(a) * 36, y + Math.sin(a) * 22 + 6, 4, 0, TAU); ctx.fill(); }
    };
    return b;
  }

  function mkLeviathan() {
    const b = base('BILE LEVIATHAN', 470, 44); b.air = 0; b.tr = []; b.face = Math.PI / 2; b.tx = 0; b.ty = 0;
    b.update = function (dt) {
      const ph = this.hp / this.max < 0.5 ? 2 : 1; if (ph !== this.ph) { this.ph = ph; toastMsg('The leviathan thrashes - it burrows faster!'); shake = 12; ring(this.x, this.y, 16, 0, 190, 8, AB()); }
      this.st -= dt; const toP = angTo(this, player), l = this.tr[0];
      if (!l || Math.hypot(l.x - this.x, l.y - this.y) > 9) { this.tr.unshift({ x: this.x, y: this.y }); if (this.tr.length > 30) this.tr.pop(); }
      if (this.state === 'idle' || this.state === 'spit' || this.state === 'rain') this.face += clamp(angDiff(toP, this.face), -2.5 * dt, 2.5 * dt);
      if (this.state === 'idle') {
        if (dist(this, player) > 120) toward(this, player.x, player.y, 85 + ph * 20, dt);
        if (this.st <= 0) { this.state = pick(ph === 2 ? ['spit', 'rain', 'burrow', 'burrow', 'burrow'] : ['spit', 'spit', 'rain', 'burrow', 'burrow']); this.n = 0; this.st = 0.5; }
      } else if (this.state === 'spit') {
        if (this.st <= 0) { fan(this.x, this.y, toP, 7, 1.2, 225, 9, AB()); for (let i = -1; i <= 1; i += 2) ebul(this.x, this.y, toP + i * 0.5, 170, 9, AB({ c: AC2, home: 1.3, life: 4 })); blip(180, 0.12, 'sawtooth', 0.05); this.n++; this.st = 0.6; if (this.n >= (ph === 2 ? 4 : 3)) { this.state = 'idle'; this.st = 1.1; } }
      } else if (this.state === 'rain') {
        if (this.st <= 0) { const cnt = ph === 2 ? 10 : 7; for (let i = 0; i < cnt; i++) glob(player.x + (i ? rnd(-180, 180) : 0), player.y + (i ? rnd(-180, 180) : 0), 0.8 + i * 0.13, 54); this.state = 'idle'; this.st = 1.7; }
      } else if (this.state === 'burrow') {
        this.air = clamp(this.air + dt * 3, 0, 1); if (this.st <= 0) { this.state = 'track'; this.st = this.n ? 0.9 : 1.4; burst(this.x, this.y, 14, '#4a7a2a', 160); }
      } else if (this.state === 'track') {
        toward(this, player.x, player.y, 230, dt); this.face = toP; inArena(this); if (Math.random() < 0.5) parts.push({ x: this.x + rnd(-14, 14), y: this.y + rnd(-8, 8), vx: rnd(-30, 30), vy: rnd(-40, -10), life: 0.5, max: 0.5, c: '#4a7a2a', r: 4 });
        if (this.st <= 0) { this.state = 'erupt'; this.st = 0.9; this.tx = player.x; this.ty = player.y; acidZone(this.tx, this.ty, 120, 0.9, 0.2); }
      } else if (this.state === 'erupt') {
        if (this.st <= 0) { this.x = this.tx; this.y = this.ty; this.tr.length = 0; this.air = 0; shake = 20; blip(50, 0.5, 'sawtooth', 0.12, 0.4); wave(this.x, this.y, 235, 440, { w: 30, c: AC }); ring(this.x, this.y, ph === 2 ? 18 : 12, 0, 190, 9, AB()); pool(this.x, this.y, 50, 4); this.n++; if (ph === 2 && this.n < 2) { this.state = 'burrow'; this.st = 0.55; this.air = 0; } else { this.state = 'idle'; this.st = 1.4; } }
      }
      inArena(this);
    };
    b.draw = function () {
      const x = this.x, y = this.y, f = this.flash > 0;
      if (this.air > 0.3) { ctx.globalAlpha = 0.55; ctx.fillStyle = '#2a4a1a'; for (let i = 0; i < 7; i++) { const a = time * 5 + i * 0.9; ctx.beginPath(); ctx.arc(x + Math.cos(a) * 22, y + Math.sin(a) * 14, 8 + (i % 3) * 3, 0, TAU); ctx.fill(); } ctx.globalAlpha = 1; ctx.strokeStyle = 'rgba(157,255,58,.5)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(x, y, 38 + Math.sin(time * 10) * 4, 22, 0, 0, TAU); ctx.stroke(); return; }
      ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(x, y + 40, 56, 15, 0, 0, TAU); ctx.fill();
      for (let i = 13; i >= 1; i--) { const q = this.tr[i * 2]; if (!q) continue; const r = 40 - i * 1.9; ctx.fillStyle = f ? '#fff' : i % 2 ? '#2f6a1c' : '#3f8a24'; ctx.beginPath(); ctx.arc(q.x, q.y, r, 0, TAU); ctx.fill(); ctx.fillStyle = f ? '#fff' : '#6fc032'; ctx.beginPath(); ctx.arc(q.x - r * 0.25, q.y - r * 0.3, r * 0.4, 0, TAU); ctx.fill(); }
      ctx.save(); ctx.translate(x, y); ctx.rotate(this.face);
      ctx.fillStyle = f ? '#fff' : '#2f6a1c'; ctx.beginPath(); ctx.arc(0, 0, 44, 0, TAU); ctx.fill(); ctx.fillStyle = f ? '#fff' : '#3f8a24'; ctx.beginPath(); ctx.arc(-6, -4, 36, 0, TAU); ctx.fill();
      ctx.fillStyle = '#240a2c'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 38, -0.95, 0.95); ctx.closePath(); ctx.fill(); ctx.fillStyle = AC; ctx.beginPath(); ctx.arc(26, 0, 7 + Math.sin(time * 8) * 1.5, 0, TAU); ctx.fill();
      ctx.fillStyle = '#f4ffd0'; for (let i = 0; i < 9; i++) { const a = -0.9 + i * 0.225; ctx.beginPath(); ctx.moveTo(Math.cos(a - 0.08) * 40, Math.sin(a - 0.08) * 40); ctx.lineTo(Math.cos(a) * 26, Math.sin(a) * 26); ctx.lineTo(Math.cos(a + 0.08) * 40, Math.sin(a + 0.08) * 40); ctx.fill(); }
      ctx.fillStyle = '#ffe94a'; ctx.beginPath(); ctx.arc(-10, -26, 4, 0, TAU); ctx.arc(-10, 26, 4, 0, TAU); ctx.fill(); ctx.restore();
    };
    return b;
  }

  function mkOvermind() {
    const b = base('ACID OVERMIND', 1300, 58); b.cy = 0; b.ct = 0;
    b.update = function (dt) {
      const f = this.hp / this.max, ph = f > 0.66 ? 1 : f > 0.33 ? 2 : 3;
      if (ph !== this.ph) { this.ph = ph; toastMsg(ph === 2 ? 'The Overmind swells with toxins!' : 'MELTDOWN! The Overmind goes critical!', 2.2); shake = 18; hazards.length = 0; eBul.length = 0; burst(this.x, this.y, 40, AC, 300); this.state = 'idle'; this.st = 1.2; ring(this.x, this.y, 24, 0, 200, 9, AB()); }
      this.st -= dt; const toP = angTo(this, player), rest = k => k * [0, 1, 0.75, 0.55][ph];
      if (this.state === 'idle') {
        const d = dist(this, player); if (d > 200) toward(this, player.x, player.y, 40 + ph * 18, dt); else if (d < 140) toward(this, player.x, player.y, -50, dt);
        if (this.st <= 0) { const o = ['spiral', 'rain', 'nova', 'spawn']; if (ph >= 2) o.push('tendrils', 'slam', 'orbs', 'spiral'); if (ph === 3) o.push('meltdown', 'tendrils', 'slam', 'meltdown'); let nx = pick(o); if (nx === this.last) nx = pick(o); this.last = nx; if (nx === 'spawn' && minions.length >= 4) nx = 'nova'; this.state = nx; this.n = 0; this.cy = rnd(0, TAU); this.ct = 0; this.st = 0.5;
          if (nx === 'spiral') this.st = 2.8; else if (nx === 'meltdown') this.st = 4.0; else if (nx === 'slam') { this.st = 0.95; acidZone(this.x, this.y, 215, 0.95, 0.2); } else if (nx === 'tendrils') this.st = 0.6; }
      } else if (this.state === 'spiral') {
        this.ct -= dt; this.cy += dt * 2.0; if (this.ct <= 0) { this.ct = 0.09; const arms = ph + 1; for (let i = 0; i < arms; i++) ebul(this.x, this.y, this.cy + i * TAU / arms, 200, 8, AB({ life: 3.4 })); }
        if (this.st <= 0) { this.state = 'idle'; this.st = rest(1.5); }
      } else if (this.state === 'rain') {
        if (this.st <= 0) { const cnt = 8 + ph * 3; for (let i = 0; i < cnt; i++) { const a = rnd(0, TAU), d = rnd(0, ARENA.r - 50); glob(ARENA.x + Math.cos(a) * d, ARENA.y + Math.sin(a) * d, 0.9 + i * 0.1, 52); } glob(player.x, player.y, 0.9, 52); glob(player.x + rnd(-80, 80), player.y + rnd(-80, 80), 1.3, 52); this.state = 'idle'; this.st = rest(2.2); }
      } else if (this.state === 'nova') {
        if (this.st <= 0) { ring(this.x, this.y, 26, toP + this.n * 0.5, 150, 10, AB(), 5); this.n++; this.st = 0.55; blip(110, 0.2, 'triangle', 0.06); if (this.n >= 2 + ph) { this.state = 'idle'; this.st = rest(1.4); } }
      } else if (this.state === 'spawn') {
        if (this.st <= 0) { for (let i = 0; i < 3; i++) minions.push(mkAcidling(this.x + rnd(-50, 50), this.y + rnd(-50, 50))); ring(this.x, this.y, 16, 0, 170, 8, AB()); burst(this.x, this.y, 16, AC, 160); this.state = 'idle'; this.st = rest(1.6); }
      } else if (this.state === 'tendrils') {
        if (this.n === 0 && this.st <= 0) { const arms = ph === 3 ? 5 : 4, d = Math.random() < 0.5 ? 1 : -1, a0 = rnd(0, TAU); for (let i = 0; i < arms; i++) addBeam(this.x, this.y, a0 + i * TAU / arms, d * 0.75, 0.7, 3.2, 350); this.n = 1; this.st = 4.0; blip(200, 0.3, 'sawtooth', 0.06); }
        else if (this.n === 1 && this.st <= 0) { this.state = 'idle'; this.st = rest(1.3); }
        else if (this.n === 1) followBeams(this);
      } else if (this.state === 'slam') {
        if (this.st <= 0) { wave(this.x, this.y, 215, 460, { w: 30, c: AC }); if (ph === 3) wave(this.x, this.y, 215, 460, { w: 26, c: AC2, delay: 0.5 }); for (let i = 0; i < 6; i++) pool(this.x + Math.cos(i * 1.047) * 165, this.y + Math.sin(i * 1.047) * 165, 36, 3.5); shake = 16; blip(55, 0.45, 'sawtooth', 0.1, 0.5); this.state = 'idle'; this.st = rest(1.5); }
      } else if (this.state === 'orbs') {
        if (this.st <= 0) { for (let i = 0; i < 6; i++) ebul(this.x, this.y, i * TAU / 6 + this.n * 0.5, 125, 10, AB({ c: AC2, home: 1.6, life: 5 })); this.n++; this.st = 0.8; if (this.n >= 2) { this.state = 'idle'; this.st = rest(1.6); } }
      } else if (this.state === 'meltdown') {
        toward(this, player.x, player.y, 60, dt); this.ct -= dt; this.cy += dt * 2.6; this.mt = (this.mt || 0) - dt;
        if (this.ct <= 0) { this.ct = 0.12; for (let i = 0; i < 2; i++) ebul(this.x, this.y, this.cy + i * Math.PI, 205, 8, AB({ life: 3 })); }
        if (this.mt <= 0) { this.mt = 0.45; glob(player.x + rnd(-110, 110), player.y + rnd(-110, 110), 0.8, 52); }
        if (this.st <= 0) { this.state = 'idle'; this.st = rest(1.6); }
      }
      inArena(this);
    };
    b.draw = function () {
      const x = this.x, y = this.y + Math.sin(time * 2) * 5, f = this.flash > 0, p3 = this.ph === 3;
      const core = f ? '#fff' : p3 ? '#5a1f88' : '#1f5a18', mid = f ? '#fff' : p3 ? '#8a3bc4' : '#3f9a2a', lt = f ? '#fff' : p3 ? '#c78cf2' : '#8fe050';
      ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(this.x, this.y + 58, 74, 18, 0, 0, TAU); ctx.fill();
      ctx.lineCap = 'round'; for (let i = 0; i < 8; i++) { const a = i * TAU / 8 + time * 0.4, w1 = Math.sin(time * 2 + i) * 0.5, w2 = Math.sin(time * 3 + i) * 0.4; ctx.strokeStyle = core; ctx.lineWidth = 15; ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + Math.cos(a + w1) * 62, y + Math.sin(a + w1) * 62, x + Math.cos(a + w2) * 98, y + Math.sin(a + w2) * 98); ctx.stroke(); ctx.lineWidth = 7; ctx.strokeStyle = mid; ctx.stroke(); }
      ctx.fillStyle = core; ctx.beginPath(); ctx.arc(x, y, 62, 0, TAU); ctx.fill(); ctx.fillStyle = mid; ctx.beginPath(); ctx.arc(x - 5, y - 8, 52, 0, TAU); ctx.fill(); ctx.globalAlpha = 0.5; ctx.fillStyle = lt; ctx.beginPath(); ctx.arc(x - 16, y - 20, 26, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
      for (let i = 0; i < 6; i++) { const bx = x + Math.cos(i * 1.7 + time * 0.5) * 36, by = y + 14 + Math.sin(i * 2.3 + time * 0.7) * 22; ctx.strokeStyle = lt; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(bx, by, 5 + (i % 3) * 2, 0, TAU); ctx.stroke(); }
      const a = angTo(this, player); ctx.fillStyle = '#f4ffd0'; ctx.beginPath(); ctx.ellipse(x, y - 4, 22, 18, 0, 0, TAU); ctx.fill(); ctx.fillStyle = p3 ? '#ff3dc8' : '#ffe94a'; ctx.beginPath(); ctx.arc(x + Math.cos(a) * 6, y - 4 + Math.sin(a) * 5, 11, 0, TAU); ctx.fill(); ctx.fillStyle = '#0a1a08'; ctx.beginPath(); ctx.arc(x + Math.cos(a) * 9, y - 4 + Math.sin(a) * 7, 5, 0, TAU); ctx.fill();
      for (const s of [-1, 1]) { ctx.fillStyle = '#f4ffd0'; ctx.beginPath(); ctx.arc(x + s * 38, y - 18, 8, 0, TAU); ctx.fill(); ctx.fillStyle = '#0a1a08'; ctx.beginPath(); ctx.arc(x + s * 38 + Math.cos(a) * 3, y - 18 + Math.sin(a) * 3, 4, 0, TAU); ctx.fill(); }
      for (let i = 0; i < 3; i++) { const o = time * 1.5 + i * TAU / 3; ctx.fillStyle = AC2; ctx.beginPath(); ctx.arc(x + Math.cos(o) * 88, y + Math.sin(o) * 88 * 0.8, 8, 0, TAU); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x + Math.cos(o) * 88 - 2, y + Math.sin(o) * 70 - 2, 3, 0, TAU); ctx.fill(); }
    };
    return b;
  }

  // ------------------------------------------------------------------ admin mode: YOU are the boss, the hero is an AI that dodges well
  let bossMode = false;
  function mkOverlord() {
    const b = base('YOU: THE OVERLORD', 420, 34); b.x = ARENA.x; b.y = ARENA.y - 120; b.cd = { fire: 0, q: 0, e: 0, r: 0, f: 0, d: 0 }; b.dashT = 0; b.dv = { x: 0, y: 1 }; b.ang = 0;
    b.update = function (dt) {
      for (const k in this.cd) this.cd[k] = Math.max(0, this.cd[k] - dt);
      let dx = 0, dy = 0; if (keys.has('KeyA') || keys.has('ArrowLeft')) dx--; if (keys.has('KeyD') || keys.has('ArrowRight')) dx++; if (keys.has('KeyW') || keys.has('ArrowUp')) dy--; if (keys.has('KeyS') || keys.has('ArrowDown')) dy++;
      const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l; let sp = 200;
      if (this.dashT > 0) { this.dashT -= dt; sp = 620; dx = this.dv.x; dy = this.dv.y; if (Math.random() < 0.7) parts.push({ x: this.x, y: this.y, vx: 0, vy: 0, life: 0.3, max: 0.3, c: '#ff4dc8', r: 9 }); }
      else if ((keys.has('Space') || keys.has('ShiftLeft')) && this.cd.d <= 0 && (dx || dy)) { this.dashT = 0.2; this.cd.d = 1.6; this.dv = { x: dx, y: dy }; }
      this.x += dx * sp * dt; this.y += dy * sp * dt; inArena(this); this.ang = Math.atan2(mouse.y - this.y, mouse.x - this.x);
      if (mouse.down && this.cd.fire <= 0) { fan(this.x, this.y, this.ang, 3, 0.3, 360, 8, { c: '#ff5acd' }); this.cd.fire = 0.24; blip(180, 0.08, 'sawtooth', 0.04); }
      if (keys.has('KeyQ') && this.cd.q <= 0) { ring(this.x, this.y, 20, rnd(0, 1), 230, 8, { c: '#ff5acd' }); this.cd.q = 3; blip(120, 0.25, 'sawtooth', 0.07); }
      if (keys.has('KeyE') && this.cd.e <= 0) { wave(this.x, this.y, 260, 480, { w: 26, c: '#ff5acd' }); this.cd.e = 5; shake = 8; blip(70, 0.3, 'sawtooth', 0.08); }
      if (keys.has('KeyR') && this.cd.r <= 0) { for (let i = 0; i < 3; i++) meteor(player.x + (i ? rnd(-90, 90) : 0), player.y + (i ? rnd(-90, 90) : 0), 0.7 + i * 0.25, 52); this.cd.r = 5; }
      if (keys.has('KeyF') && this.cd.f <= 0 && minions.length < 4) { for (let i = 0; i < 2; i++) minions.push(mkImp(this.x + rnd(-30, 30), this.y + rnd(-30, 30))); this.cd.f = 10; burst(this.x, this.y, 14, '#ff5acd', 160); }
    };
    b.draw = function () {
      const x = this.x, y = this.y, f = this.flash > 0;
      ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(x, y + 38, 38, 11, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = f ? '#fff' : '#2a1238'; ctx.beginPath(); ctx.moveTo(x - 28, y - 12); ctx.lineTo(x + 28, y - 12); ctx.lineTo(x + 44, y + 42); ctx.lineTo(x - 44, y + 42); ctx.closePath(); ctx.fill();
      ctx.fillStyle = f ? '#fff' : '#4a2268'; ctx.beginPath(); ctx.ellipse(x, y, 28, 32, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = f ? '#fff' : '#6a3a8c'; ctx.beginPath(); ctx.arc(x, y - 26, 17, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.moveTo(x - 16, y - 38); ctx.lineTo(x - 14, y - 54); ctx.lineTo(x - 6, y - 44); ctx.lineTo(x, y - 58); ctx.lineTo(x + 6, y - 44); ctx.lineTo(x + 14, y - 54); ctx.lineTo(x + 16, y - 38); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ff4dc8'; ctx.shadowColor = '#ff4dc8'; ctx.shadowBlur = 12; ctx.beginPath(); ctx.arc(x - 6, y - 28, 3.5, 0, TAU); ctx.arc(x + 6, y - 28, 3.5, 0, TAU); ctx.fill(); ctx.shadowBlur = 0;
      ctx.save(); ctx.translate(x, y); ctx.rotate(this.ang); ctx.fillStyle = '#ff4dc8'; ctx.fillRect(18, -4, 24, 8); ctx.restore();
    };
    return b;
  }
  function newHero() { const p = newPlayer(); Object.assign(p, { hp: 18, maxHp: 18, speed: 260, shots: 2, fireDelay: 0.12, dashCd: 0.85, dmg: 1.3, invDur: 0.8 }); return p; }
  function startBossMode() {
    bossMode = true; state = S.FIGHT; resetWorld(); pillars = mkPillars('arena'); player = newHero(); player.x = ARENA.x; player.y = ARENA.y + ARENA.r - 60; player.inv = 1;
    boss = mkOverlord(); introT = 0; runTime = 0; ai.dir = { x: 0, y: 0 }; toastMsg('You are the boss! Kill the hero.', 3.5);
  }
  function endBossMode(win) { state = S.OVER; deadT = 0; overTitle = win ? 'THE HERO HAS FALLEN!' : 'YOU WERE SLAIN'; blip(win ? 600 : 90, 0.8, win ? 'square' : 'sawtooth', 0.1, win ? 2 : 0.4); }
  const ai = { dir: { x: 0, y: 0 }, prev: null, dashCheck: 0 };
  function heroAI(dt) {                                   // a very good dodger: scores 17 moves against everything that will hit in the next half second
    const p = player; p.inv = Math.max(0, p.inv - dt); p.dashCdT = Math.max(0, p.dashCdT - dt); p.slow = Math.max(0, p.slow - dt);
    const bs = boss, bv = ai.prev ? { x: (bs.x - ai.prev.x) / Math.max(dt, 0.001), y: (bs.y - ai.prev.y) / Math.max(dt, 0.001) } : { x: 0, y: 0 }; ai.prev = { x: bs.x, y: bs.y };
    const spd = p.speed * (p.slow > 0 ? 0.5 : 1), HZ = [0.08, 0.16, 0.24, 0.32, 0.42, 0.55];
    const danger = (cx, cy, vx, vy) => {                  // cost of standing at (cx,cy) while moving with velocity (vx,vy)
      let c = 0; const R = p.r + 6;
      for (const b of eBul) for (let i = 0; i < HZ.length; i++) { const t = HZ[i], bx = b.x + b.vx * t, by = b.y + b.vy * t, px = cx + vx * t, py = cy + vy * t, d = Math.hypot(bx - px, by - py), lim = b.r + R; if (d < lim) c += 9 * (1 - d / lim) + 2; }
      for (const h of hazards) {
        if (h.k === 'zone') { if (h.t < h.delay + h.dur && Math.hypot(cx - h.x, cy - h.y) < h.r + 18) c += h.t > h.delay - 0.5 ? 12 : 5; }
        else if (h.k === 'fire') { if (Math.hypot(cx - h.x, cy - h.y) < h.r + 14) c += 8; }
        else if (h.k === 'wave') { if (h.delay > 0) continue; for (const t of [0.15, 0.3, 0.45]) { const dd = Math.hypot(cx - h.x, cy - h.y), rr = h.r + h.sp * t; if (Math.abs(dd - rr) < h.w / 2 + 16) c += 7; } }
        else if (h.k === 'beam') { const a = h.a + h.rot * (h.t > h.delay ? 0.2 : 0), dx = cx - h.x, dy = cy - h.y, along = dx * Math.cos(a) + dy * Math.sin(a), perp = Math.abs(-dx * Math.sin(a) + dy * Math.cos(a)); if (along > 0 && along < h.len && perp < 50) c += 10; }
      }
      for (const m of minions) { const d = Math.hypot(cx - m.x, cy - m.y); if (d < 60) c += 5 * (1 - d / 60); }
      const bd = Math.hypot(cx - bs.x, cy - bs.y); if (bd < bs.r + 70) c += 8; c += Math.abs(bd - 250) * 0.006;
      const ed = ARENA.r - Math.hypot(cx - ARENA.x, cy - ARENA.y); if (ed < 70) c += (70 - ed) * 0.15;
      for (const s of pillars) { const d = Math.hypot(cx - s.x, cy - s.y); if (d < s.r + p.r + 4) c += 20; }
      return c;
    };
    let best = null, bestC = 1e9, stayC = danger(p.x, p.y, 0, 0);
    for (let i = 0; i < 16; i++) { const a = i * TAU / 16, dx = Math.cos(a), dy = Math.sin(a), c = danger(p.x + dx * spd * 0.2, p.y + dy * spd * 0.2, dx * spd, dy * spd) + (ai.dir.x * dx + ai.dir.y * dy < 0 ? 0.3 : 0) + (Math.random() * 0.2); if (c < bestC) { bestC = c; best = { x: dx, y: dy }; } }
    let dx = 0, dy = 0; if (best && (bestC < stayC - 0.15 || stayC > 0.4)) { dx = best.x; dy = best.y; ai.dir = best; }
    let sp = spd;
    if (p.dashT > 0) { p.dashT -= dt; sp = 640; dx = p.dashDir.x; dy = p.dashDir.y; if (Math.random() < 0.8) parts.push({ x: p.x, y: p.y, vx: 0, vy: 0, life: 0.25, max: 0.25, c: '#9deaff', r: 6 }); }
    else if (p.dashCdT <= 0 && stayC > 6 && bestC < stayC - 5 && (dx || dy)) { p.dashT = 0.17; p.dashCdT = p.dashCd; p.dashDir = { x: dx, y: dy }; }
    p.x += dx * sp * dt; p.y += dy * sp * dt;
    for (const s of pillars) { const d = Math.hypot(p.x - s.x, p.y - s.y), m = s.r + p.r; if (d < m) { p.x = s.x + (p.x - s.x) / d * m; p.y = s.y + (p.y - s.y) / d * m; } }
    inArena(p, p.r + 6);
    // aim with lead and fire
    const tt = Math.hypot(bs.x - p.x, bs.y - p.y) / 560, ax = bs.x + bv.x * tt * 0.9 - p.x, ay = bs.y + bv.y * tt * 0.9 - p.y; p.face = Math.atan2(ay, ax); p.fireT -= dt;
    if (p.fireT <= 0) { p.fireT = p.fireDelay; for (let i = 0; i < p.shots; i++) { const a = p.face + (i - (p.shots - 1) / 2) * 0.07; pBul.push({ x: p.x + Math.cos(a) * 16, y: p.y + Math.sin(a) * 16, vx: Math.cos(a) * 560, vy: Math.sin(a) * 560, r: 5, life: 0.9, dmg: p.dmg, hits: [] }); } }
  }

  // ------------------------------------------------------------------ flow
  function resetWorld() { minions = []; pBul = []; eBul = []; hazards = []; parts = []; boss = null; shake = 0; }
  function mkPillars(kind) {
    if (kind === 'arena') { return [[-140, -110], [140, -110], [-140, 130], [140, 130]].map(([dx, dy]) => ({ x: ARENA.x + dx, y: ARENA.y + dy, r: 24 })); }
    return [{ x: 330, y: 250, r: 26 }, { x: 560, y: 470, r: 30 }, { x: 740, y: 230, r: 22 }];
  }
  function newRun() { bossMode = false; player = newPlayer(); bossIdx = 0; runTime = 0; resetWorld(); enterHub(true); }
  function enterHub(first) {
    bossMode = false;
    state = S.HUB; resetWorld(); pillars = mkPillars('hub');
    if (first) { player.x = 140; player.y = 400; } else { player.x = 150; player.y = 380; player.hp = Math.min(player.maxHp, player.hp + 2); }
    player.inv = 0.5; player.dashT = 0; hub.t = 0;
    toastMsg(first ? 'You wake up deep in a cave...' : bossIdx === 5 ? 'The LAVA PORTAL has opened! The underworld awaits...' : bossIdx === 10 ? 'The ACID PORTAL has opened! One last realm awaits...' : 'You rest by the fire. Next: ' + BOSS_NAMES[bossIdx], first ? 3 : bossIdx === 5 || bossIdx === 10 ? 4 : 2.4);
    if (bossIdx === 5 || bossIdx === 10) shake = 14;
  }
  const BOSS_NAMES = ['Rock Golem', 'Bat Queen', 'Slime King', 'Spider Matriarch', 'Crystal Wyrm', 'Hellhound', 'Ash Witch', 'Obsidian Titan', 'Demon Lord', 'Infernal Dragon', 'Acid Scorpion', 'Venom Hydra', 'Toxic Wraith', 'Bile Leviathan', 'Acid Overmind'];
  const hub = { t: 0, portal: { x: 850, y: 355, r: 40 }, fire: { x: 470, y: 360 } };
  function startFight() {
    bossMode = false;
    toast = null;
    fightIdx = bossIdx; state = S.FIGHT; resetWorld(); pillars = mkPillars('arena'); boss = BOSSES[bossIdx](); introT = 2.2;
    player.x = ARENA.x; player.y = ARENA.y + ARENA.r - 50; player.inv = 1; player.dashT = 0;
    blip(120, 0.6, 'sawtooth', 0.08, 0.6);
  }
  function bossDefeated() {
    burst(boss.x, boss.y, 50, '#ffd23f', 320); shake = 18; blip(300, 0.8, 'sawtooth', 0.1, 0.2);
    eBul.length = 0; hazards.length = 0; for (const m of minions) burst(m.x, m.y, 8, '#fff', 120); minions.length = 0;
    bossIdx++; saveBest(bossIdx); boss.dead = true; deadT = 0; state = S.FIGHT; boss.dying = true;
  }
  function offerUpgrades() { const pool = (bossIdx >= 11 ? UPGRADES3 : bossIdx >= 6 ? UPGRADES2 : UPGRADES).filter(u => !u.ok || u.ok(player)); offered = []; while (offered.length < 3 && pool.length) offered.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]); state = S.UPGRADE; }
  function chooseUpgrade(i) { const u = offered[i]; if (!u) return; u.apply(player); blip(660, 0.15, 'square', 0.06); blip(990, 0.2, 'square', 0.05); if (bossIdx >= BOSSES.length) { state = S.WIN; saveBest(bossIdx); } else enterHub(false); }

  // ------------------------------------------------------------------ update
  function movePlayer(dt) {
    const p = player; let dx = 0, dy = 0;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) dx--; if (keys.has('KeyD') || keys.has('ArrowRight')) dx++; if (keys.has('KeyW') || keys.has('ArrowUp')) dy--; if (keys.has('KeyS') || keys.has('ArrowDown')) dy++;
    const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
    p.inv = Math.max(0, p.inv - dt); p.dashCdT = Math.max(0, p.dashCdT - dt); p.slow = Math.max(0, p.slow - dt);
    let sp = p.speed * admin.speedMul * (p.slow > 0 && !admin.god ? 0.5 : 1);
    if (p.dashT > 0) { p.dashT -= dt; sp = 640; dx = p.dashDir.x; dy = p.dashDir.y; if (Math.random() < 0.8) parts.push({ x: p.x, y: p.y, vx: 0, vy: 0, life: 0.25, max: 0.25, c: '#9deaff', r: 6 }); }
    else if ((keys.has('Space') || keys.has('ShiftLeft') || keys.has('ShiftRight')) && p.dashCdT <= 0 && (dx || dy)) { p.dashT = 0.17; p.dashCdT = admin.infDash ? 0 : p.dashCd; p.dashDir = { x: dx, y: dy }; blip(300, 0.15, 'triangle', 0.05, 2); }
    if (dx || dy) p.step += dt * 12;
    p.x += dx * sp * dt; p.y += dy * sp * dt;
    for (const s of pillars) { const d = Math.hypot(p.x - s.x, p.y - s.y), m = s.r + p.r; if (d < m) { p.x = s.x + (p.x - s.x) / d * m; p.y = s.y + (p.y - s.y) / d * m; } }
    if (state === S.FIGHT || state === S.UPGRADE) inArena(p, p.r + 6); else { p.x = clamp(p.x, HUB_BOX.x1 + p.r, HUB_BOX.x2 - p.r); p.y = clamp(p.y, HUB_BOX.y1 + p.r, HUB_BOX.y2 - p.r); }
    // aim
    let ax = mouse.x - p.x, ay = mouse.y - p.y, aiming = mouse.down;
    const kx = (keys.has('KeyL') ? 1 : 0) - (keys.has('KeyJ') ? 1 : 0), ky = (keys.has('KeyK') ? 1 : 0) - (keys.has('KeyI') ? 1 : 0);
    if (kx || ky) { ax = kx; ay = ky; aiming = true; }
    p.face = Math.atan2(ay, ax);
    p.fireT -= dt;
    if (aiming && p.fireT <= 0 && !(state === S.FIGHT && boss && boss.dying)) {
      const ul = p.ultra; p.fireT = ul ? 0.035 : p.fireDelay; const n = ul ? Math.max(3, p.shots) : p.shots;
      for (let i = 0; i < n; i++) { const a = p.face + (n === 1 ? 0 : (i - (n - 1) / 2) * (ul ? 0.09 : 0.16)); pBul.push({ x: p.x + Math.cos(a) * 16, y: p.y + Math.sin(a) * 16, vx: Math.cos(a) * (ul ? 900 : 560), vy: Math.sin(a) * (ul ? 900 : 560), r: ul ? 8 : 5, life: 0.9, dmg: admin.onehit ? 99999 : ul ? 30 : p.dmg, pierce: !!ul || !!p.pierce, hits: [], c: ul ? '#7fffd4' : p.pierce ? '#ffb347' : null }); }
      blip(520 + Math.random() * 60, 0.06, 'square', 0.025, 0.6);
    }
  }

  function hitCircle(a, b, extra) { return Math.hypot(a.x - b.x, a.y - b.y) < a.r + b.r + (extra || 0); }

  function shielded(h) {                                 // a pillar between the shockwave's centre and you blocks it
    const dx = player.x - h.x, dy = player.y - h.y, L2 = dx * dx + dy * dy || 1;
    for (const p of pillars) { const t = clamp(((p.x - h.x) * dx + (p.y - h.y) * dy) / L2, 0, 1); if (t < 1 && Math.hypot(h.x + dx * t - p.x, h.y + dy * t - p.y) < p.r + 4) return true; }
    return false;
  }
  function updateFight(dt) {
    if (introT > 0) { introT -= dt; if (!bossMode) movePlayer(dt); return; }
    runTime += dt; if (bossMode) heroAI(dt); else movePlayer(dt);
    if (!admin.freeze || bossMode) { if (boss && !boss.dying) boss.update(dt); for (const m of minions) m.update(dt); }
    // player bullets
    for (const b of pBul) {
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      if (Math.hypot(b.x - ARENA.x, b.y - ARENA.y) > ARENA.r) b.life = 0;
      for (const s of pillars) if (Math.hypot(b.x - s.x, b.y - s.y) < s.r + b.r) { b.life = 0; burst(b.x, b.y, 3, '#aaa', 60); }
      if (b.life <= 0) continue;
      for (const m of minions) if (m.hp > 0 && !(b.hits && b.hits.includes(m)) && hitCircle(b, m)) { m.hp -= (b.dmg || player.dmg); m.flash = 0.08; if (b.pierce) b.hits.push(m); else b.life = 0; burst(b.x, b.y, 4, '#fff', 100); if (m.hp <= 0) { burst(m.x, m.y, 10, '#fff', 150); blip(200, 0.1, 'square', 0.04, 0.5); } if (!b.pierce) break; }
      if (b.life > 0 && boss && !boss.dying && !(b.hits && b.hits.includes(boss)) && !(boss.air > 0.3) && hitCircle(b, boss, -4)) { boss.hp -= (b.dmg || player.dmg) * (boss.stun > 0 ? 1.5 : 1); boss.flash = 0.07; if (b.pierce) b.hits.push(boss); else b.life = 0; burst(b.x, b.y, 3, '#ffd23f', 110); blip(160, 0.05, 'square', 0.03); if (boss.hp <= 0) { boss.hp = 0; if (bossMode) endBossMode(false); else bossDefeated(); } }
    }
    pBul = pBul.filter(b => b.life > 0); minions = minions.filter(m => m.hp > 0);
    if (boss) boss.flash = Math.max(0, boss.flash - dt); for (const m of minions) m.flash = Math.max(0, m.flash - dt);
    // enemy bullets
    for (const b of eBul) {
      if (b.home) { const cur = Math.atan2(b.vy, b.vx), sp = Math.hypot(b.vx, b.vy), na = cur + clamp(angDiff(Math.atan2(player.y - b.y, player.x - b.x), cur), -b.home * dt, b.home * dt); b.vx = Math.cos(na) * sp; b.vy = Math.sin(na) * sp; }
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      if (b.life <= 0 && b.web) zone(b.x, b.y, 52, 0, 6, { k: 'web', c: '#e8f0ff' });
      if (Math.hypot(b.x - ARENA.x, b.y - ARENA.y) > ARENA.r + 20) { if (b.web) zone(b.x, b.y, 52, 0, 6, { k: 'web', c: '#e8f0ff' }); b.life = 0; }
      for (const s of pillars) if (Math.hypot(b.x - s.x, b.y - s.y) < s.r + b.r) { b.life = 0; if (b.web) zone(b.x, b.y, 52, 0, 6, { k: 'web', c: '#e8f0ff' }); }
      if (b.life > 0 && hitCircle(b, player, -3)) { if (player.inv <= 0 && player.dashT <= 0) { hurt(1); b.life = 0; } }
    }
    eBul = eBul.filter(b => b.life > 0);
    // hazards
    for (const h of hazards) {
      if (h.k === 'zone') { h.t += dt; if (h.t >= h.delay && h.t < h.delay + h.dur && !h.hit && Math.hypot(player.x - h.x, player.y - h.y) < h.r + player.r * 0.5) { if (player.inv <= 0 && player.dashT <= 0) { hurt(h.dmg); h.hit = true; } } if (h.t >= h.delay + h.dur) { h.dead = true; if (h.onEnd && !h.done) { h.done = true; h.onEnd(h); } } }
      else if (h.k === 'cone') {
        h.t += dt; if (h.t > h.delay) h.a += h.rot * dt; h.x = h.own.x + Math.cos(h.a) * 40; h.y = h.own.y + Math.sin(h.a) * 40;
        if (h.t > h.delay + h.dur || h.own.hp <= 0 || h.own.state !== 'breath') h.dead = true;
        if (h.t > h.delay) { const dx = player.x - h.x, dy = player.y - h.y, d = Math.hypot(dx, dy); if (d < h.r + player.r && Math.abs(angDiff(Math.atan2(dy, dx), h.a)) < h.half + player.r / Math.max(d, 1) && !shielded(h)) hurt(1); }
      }
      else if (h.k === 'fire') { h.t += dt; if (h.t > h.dur) h.dead = true; if (Math.hypot(player.x - h.x, player.y - h.y) < h.r + player.r * 0.3) hurt(1); }
      else if (h.k === 'web') { h.t += dt; if (Math.hypot(player.x - h.x, player.y - h.y) < h.r) player.slow = 0.25; if (h.t > h.dur) h.dead = true; }
      else if (h.k === 'wave') { if (h.delay > 0) { h.delay -= dt; continue; } h.r += h.sp * dt; if (h.r > h.maxR) h.dead = true; const d = Math.hypot(player.x - h.x, player.y - h.y); if (!h.hit && Math.abs(d - h.r) < h.w / 2 + player.r * 0.3 && player.inv <= 0 && player.dashT <= 0 && !shielded(h)) { hurt(1); h.hit = true; } }
      else if (h.k === 'beam') {
        h.t += dt; if (h.t > h.delay) h.a += h.rot * dt; else h.a += 0;
        if (h.t > h.delay + h.dur) h.dead = true;
        if (h.t > h.delay) { const dx = player.x - h.x, dy = player.y - h.y, along = dx * Math.cos(h.a) + dy * Math.sin(h.a), perp = Math.abs(-dx * Math.sin(h.a) + dy * Math.cos(h.a)); if (along > 0 && along < h.len && perp < 14 + player.r * 0.5) hurt(1); }
      }
    }
    hazards = hazards.filter(h => !h.dead);
    // contact damage
    if (boss && !boss.dying && !(boss.air > 0.3) && hitCircle(player, boss, -10)) hurt(1);
    for (const m of minions) if (hitCircle(player, m, -2) && (m.z || 0) < 5) hurt(1);
    if (state === S.FIGHT && boss && boss.dying) { deadT += dt; if (Math.random() < 0.6) burst(boss.x + rnd(-40, 40), boss.y + rnd(-40, 40), 4, pick(['#ffd23f', '#ff7a3d', '#fff']), 200); if (deadT > 2.2) { boss = null; offerUpgrades(); } }
  }

  function updateHub(dt) {
    movePlayer(dt); hub.t += dt;
    if (dist(player, hub.portal) < hub.portal.r + 8) startFight();
    for (const b of pBul) { b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt; for (const s of pillars) if (Math.hypot(b.x - s.x, b.y - s.y) < s.r + b.r) b.life = 0; if (b.x < HUB_BOX.x1 || b.x > HUB_BOX.x2 || b.y < HUB_BOX.y1 || b.y > HUB_BOX.y2) b.life = 0; }
    pBul = pBul.filter(b => b.life > 0);
  }

  function update(dt) {
    time += dt; if (toast) { toast.life -= dt; if (toast.life <= 0) toast = null; }
    shake = Math.max(0, shake - dt * 30);
    for (const p of parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.94; p.vy *= 0.94; p.life -= dt; } parts = parts.filter(p => p.life > 0);
    if (paused || admin.open) return;
    if (state === S.HUB) updateHub(dt);
    else if (state === S.FIGHT) updateFight(dt);
    else if (state === S.OVER) deadT += dt;
    else if (state === S.UPGRADE) { player.inv = 99; }
  }

  // ------------------------------------------------------------------ drawing
  function noiseDots(g, n, cols, w, h, rmax) { for (let i = 0; i < n; i++) { g.fillStyle = pick(cols); g.beginPath(); g.arc(Math.random() * w, Math.random() * h, 1 + Math.random() * rmax, 0, TAU); g.fill(); } }
  const PALS = [
    { bg: '#120f0e', n1: ['#1c1714', '#0d0b0a', '#241d19'], rock: '#2d2722', sh: '#000', shb: 30, n2: ['#352e28', '#27211d', '#3d352e', '#221c18'], crack: null, spike: ['#3a322b', '#2c2621', '#463d34'], gem: ['#7fe3ff', '#c77dff', '#ff9dd2'] },
    { bg: '#0f0504', n1: ['#1f0b08', '#0a0302', '#2a100b'], rock: '#3a1812', sh: '#ff4a10', shb: 36, n2: ['#44201a', '#2f130f', '#512620', '#26100c'], crack: ['rgba(255,110,30,.55)', '#ff6a1a'], spike: ['#3a1a14', '#2a120e', '#4a2018'], gem: ['#ff6a1a', '#ffb347', '#ff3d3d'] },
    { bg: '#040d06', n1: ['#0a1c0d', '#030a04', '#102a14'], rock: '#16301a', sh: '#5dff2a', shb: 36, n2: ['#1c4222', '#12301a', '#235228', '#0e2412'], crack: ['rgba(140,255,60,.55)', '#7dff3a'], spike: ['#173a1c', '#0f2a14', '#1f4a24'], gem: ['#9dff3a', '#e6ff5a', '#3affb0'] }
  ];
  function makeBG(kind, realm) {
    const under = realm > 0, P = PALS[realm | 0];
    const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
    g.fillStyle = P.bg; g.fillRect(0, 0, W, H); noiseDots(g, 900, P.n1, W, H, 7);
    g.save(); g.beginPath();
    if (kind === 'arena') { for (let i = 0; i <= 90; i++) { const a = i / 90 * TAU, r = ARENA.r + 10 + Math.sin(a * 7) * 7 + Math.sin(a * 13 + 1) * 5; const x = ARENA.x + Math.cos(a) * r, y = ARENA.y + Math.sin(a) * r; if (i === 0) g.moveTo(x, y); else g.lineTo(x, y); } }
    else { const b = HUB_BOX; for (let i = 0; i <= 80; i++) { const t = i / 80, a = t * TAU; let x = (b.x1 + b.x2) / 2 + Math.cos(a) * 1.06 * (b.x2 - b.x1) / 2 * 1.0, y = (b.y1 + b.y2) / 2 + Math.sin(a) * 1.1 * (b.y2 - b.y1) / 2; const n = Math.sin(a * 9) * 7 + Math.sin(a * 5 + 2) * 6; x += Math.cos(a) * n; y += Math.sin(a) * n; x = clamp(x, 30, W - 30); y = clamp(y, 110, H - 30); if (i === 0) g.moveTo(x, y); else g.lineTo(x, y); } }
    g.closePath(); g.shadowColor = P.sh; g.shadowBlur = P.shb; g.fillStyle = P.rock; g.fill(); g.shadowBlur = 0; g.clip();
    noiseDots(g, 1600, P.n2, W, H, 4);
    if (under) { g.strokeStyle = P.crack[0]; g.shadowColor = P.crack[1]; g.shadowBlur = 10; g.lineWidth = 2.5; for (let i = 0; i < 16; i++) { let x = Math.random() * W, y = Math.random() * H; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 5; k++) { x += rnd(-34, 34); y += rnd(-34, 34); g.lineTo(x, y); } g.stroke(); } g.shadowBlur = 0; }
    g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 2; for (let i = 0; i < 26; i++) { let x = Math.random() * W, y = Math.random() * H; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 4; k++) { x += rnd(-40, 40); y += rnd(-40, 40); g.lineTo(x, y); } g.stroke(); }
    if (kind === 'arena') { g.strokeStyle = 'rgba(160,140,120,.14)'; g.lineWidth = 3; for (const rr of [70, 140, 210]) { g.beginPath(); g.arc(ARENA.x, ARENA.y, rr, 0, TAU); g.stroke(); } }
    g.restore();
    // stalagmites and crystals in the walls
    const rim = kind === 'arena' ? i => { const a = i / 40 * TAU; return [ARENA.x + Math.cos(a) * (ARENA.r + 14), ARENA.y + Math.sin(a) * (ARENA.r + 14), a + Math.PI]; } : i => { const t = i / 40; const x = 40 + t * (W - 80), top = i % 2 === 0; return [x, top ? 140 : 575, top ? Math.PI / 2 : -Math.PI / 2]; };
    for (let i = 0; i < 40; i++) {
      const [x, y, a] = rim(i), len = rnd(14, 34), w = rnd(7, 13); g.fillStyle = pick(P.spike);
      g.beginPath(); g.moveTo(x - Math.sin(a) * w, y + Math.cos(a) * w); g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len); g.lineTo(x + Math.sin(a) * w, y - Math.cos(a) * w); g.closePath(); g.fill();
    }
    const cols = P.gem; g.lineJoin = 'round';
    for (let i = 0; i < 9; i++) { const [x, y] = rim(Math.floor(Math.random() * 40)), c1 = pick(cols); g.shadowColor = c1; g.shadowBlur = 16; g.fillStyle = c1; g.beginPath(); const k = rnd(10, 18); g.moveTo(x, y - k); g.lineTo(x + 6, y); g.lineTo(x, y + 6); g.lineTo(x - 6, y); g.closePath(); g.fill(); }
    g.shadowBlur = 0; return c;
  }
  let bgHub, bgArena, bgHubU, bgArenaU, bgHubA, bgArenaA;
  const realmOf = i => i >= 10 ? 2 : i >= 5 ? 1 : 0, hubRealm = () => bossIdx >= 11 ? 2 : bossIdx >= 6 ? 1 : 0, portalRealm = () => realmOf(bossIdx), arenaRealm = () => bossMode ? 1 : realmOf(fightIdx);

  const lights = () => state === S.HUB ? [{ x: 150, y: 190, r: 150, c: 1 }, { x: 470, y: 360, r: 230, c: 1 }, { x: 830, y: 540, r: 140, c: 1 }, { x: hub.portal.x, y: hub.portal.y, r: 170, c: 0 }] : [{ x: ARENA.x - 220, y: ARENA.y - 180, r: 120, c: 1 }, { x: ARENA.x + 220, y: ARENA.y - 180, r: 120, c: 1 }, { x: ARENA.x - 220, y: ARENA.y + 190, r: 120, c: 1 }, { x: ARENA.x + 220, y: ARENA.y + 190, r: 120, c: 1 }];

  function drawTorch(x, y) {
    const fl = 1 + Math.sin(time * 11 + x) * 0.1 + Math.sin(time * 17 + y) * 0.07;
    ctx.fillStyle = '#5a3f28'; ctx.fillRect(x - 3, y, 6, 22);
    const g = ctx.createRadialGradient(x, y - 4, 0, x, y - 4, 34 * fl); g.addColorStop(0, 'rgba(255,200,90,.55)'); g.addColorStop(1, 'rgba(255,120,30,0)'); ctx.fillStyle = g; ctx.fillRect(x - 40, y - 44, 80, 80);
    ctx.fillStyle = '#ffb347'; ctx.beginPath(); ctx.ellipse(x, y - 4, 6 * fl, 11 * fl, 0, 0, TAU); ctx.fill(); ctx.fillStyle = '#fff1a8'; ctx.beginPath(); ctx.ellipse(x, y - 1, 3 * fl, 6 * fl, 0, 0, TAU); ctx.fill();
  }
  function drawPillar(s) { ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(s.x + 4, s.y + s.r * 0.7, s.r * 1.1, s.r * 0.5, 0, 0, TAU); ctx.fill(); ctx.fillStyle = '#4a4038'; ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, TAU); ctx.fill(); ctx.fillStyle = '#5e5348'; ctx.beginPath(); ctx.arc(s.x - 3, s.y - 4, s.r * 0.78, 0, TAU); ctx.fill(); ctx.fillStyle = '#74685b'; ctx.beginPath(); ctx.arc(s.x - 5, s.y - 7, s.r * 0.42, 0, TAU); ctx.fill(); }

  function drawPlayer() {
    const p = player, blink = p.inv > 0 && p.inv < 50 && Math.floor(time * 20) % 2 === 0; if (blink) return;
    const bob = Math.sin(p.step) * 2;
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(p.x, p.y + 12, 13, 5, 0, 0, TAU); ctx.fill();
    ctx.save(); ctx.translate(p.x, p.y + bob * 0.4);
    ctx.fillStyle = '#3a6fb0'; ctx.beginPath(); ctx.ellipse(0, 3, 11, 12, 0, 0, TAU); ctx.fill(); ctx.fillStyle = '#2a4f80'; ctx.fillRect(-11, 4, 22, 4);
    ctx.save(); ctx.rotate(p.face); ctx.fillStyle = '#8a8f98'; ctx.fillRect(6, -3, 15, 6); ctx.fillStyle = '#5a5f68'; ctx.fillRect(18, -4, 5, 8); ctx.fillStyle = '#e6b88a'; ctx.beginPath(); ctx.arc(7, 4, 4, 0, TAU); ctx.fill(); ctx.restore();
    ctx.fillStyle = '#e6b88a'; ctx.beginPath(); ctx.arc(0, -6, 8, 0, TAU); ctx.fill();
    ctx.fillStyle = '#e0a526'; ctx.beginPath(); ctx.arc(0, -8, 9, Math.PI, 0); ctx.fill(); ctx.fillRect(-9, -9, 18, 3);
    ctx.fillStyle = '#fff6b0'; ctx.shadowColor = '#fff6b0'; ctx.shadowBlur = 10; ctx.beginPath(); ctx.arc(Math.cos(p.face) * 6, -10 + Math.sin(p.face) * 3, 3, 0, TAU); ctx.fill(); ctx.shadowBlur = 0;
    ctx.restore();
  }

  function drawHub() {
    ctx.drawImage([bgHub, bgHubU, bgHubA][hubRealm()], 0, 0);
    drawTorch(150, 170); drawTorch(830, 528);
    // fire
    const f = hub.fire, fl = 1 + Math.sin(time * 12) * 0.12;
    ctx.fillStyle = '#4a4038'; for (let i = 0; i < 8; i++) { ctx.beginPath(); ctx.arc(f.x + Math.cos(i * 0.785) * 26, f.y + 10 + Math.sin(i * 0.785) * 12, 7, 0, TAU); ctx.fill(); }
    ctx.fillStyle = '#5a3f28'; ctx.fillRect(f.x - 20, f.y + 6, 40, 7);
    ctx.fillStyle = '#ff7a1a'; ctx.beginPath(); ctx.moveTo(f.x - 16, f.y + 8); ctx.quadraticCurveTo(f.x - 8, f.y - 30 * fl, f.x, f.y - 44 * fl); ctx.quadraticCurveTo(f.x + 8, f.y - 24 * fl, f.x + 16, f.y + 8); ctx.fill();
    ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.moveTo(f.x - 8, f.y + 8); ctx.quadraticCurveTo(f.x - 3, f.y - 14 * fl, f.x, f.y - 24 * fl); ctx.quadraticCurveTo(f.x + 4, f.y - 12 * fl, f.x + 8, f.y + 8); ctx.fill();
    // portal
    const p = hub.portal; ctx.save(); ctx.translate(p.x, p.y); const pr = portalRealm(); ctx.shadowColor = ['#c77dff', '#ff6a1a', '#9dff3a'][pr]; ctx.shadowBlur = 30;
    for (let i = 0; i < 4; i++) { ctx.strokeStyle = [['#7fe3ff', '#c77dff', '#ff9dd2', '#fff'], ['#ffd23f', '#ff7a1a', '#ff3d3d', '#fff'], ['#d8ff7a', '#9dff3a', '#3affb0', '#fff']][pr][i]; ctx.lineWidth = 4; ctx.beginPath(); ctx.ellipse(0, 0, 22 + i * 7 + Math.sin(time * 3 + i) * 3, 40 + i * 6, time * (i % 2 ? 1 : -1) * 0.6, 0, TAU * 0.78); ctx.stroke(); }
    ctx.fillStyle = ['rgba(30,10,60,.85)', 'rgba(80,12,0,.9)', 'rgba(8,50,10,.9)'][pr]; ctx.beginPath(); ctx.ellipse(0, 0, 24, 40, 0, 0, TAU); ctx.fill(); ctx.restore();
    ctx.fillStyle = '#ffe9a8'; ctx.font = 'bold 14px ' + FONT; ctx.textAlign = 'center'; ctx.fillText((pr === 2 ? 'ACID REALM ' + (bossIdx - 9) : pr === 1 ? 'UNDERWORLD ' + (bossIdx - 4) : 'BOSS ' + (bossIdx + 1)) + ': ' + BOSS_NAMES[bossIdx].toUpperCase(), p.x - 20, p.y - 70); ctx.fillText(['enter the portal', 'enter the lava portal', 'enter the acid portal'][pr], p.x - 20, p.y - 54);
    for (const s of pillars) drawPillar(s);
    drawBullets(); drawPlayer();
  }

  const spriteCache = {};
  function glowSprite(color, r) {                         // pre-rendered glowing bullet: far cheaper than shadowBlur every frame
    const key = color + r; if (spriteCache[key]) return spriteCache[key];
    const sz = Math.ceil(r * 5), c = document.createElement('canvas'); c.width = c.height = sz; const g = c.getContext('2d'), m = sz / 2;
    const gr = g.createRadialGradient(m, m, r * 0.5, m, m, m); gr.addColorStop(0, color); gr.addColorStop(0.35, color); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.globalAlpha = 0.45; g.fillStyle = gr; g.fillRect(0, 0, sz, sz); g.globalAlpha = 1;
    g.fillStyle = color; g.beginPath(); g.arc(m, m, r, 0, TAU); g.fill(); g.fillStyle = 'rgba(255,255,255,.75)'; g.beginPath(); g.arc(m, m, r * 0.45, 0, TAU); g.fill();
    return (spriteCache[key] = c);
  }
  let cutSprite = null, bigCut = null;
  function drawBullets() {
    for (const b of pBul) { const sp = glowSprite(b.c || '#fff3a0', b.r); ctx.drawImage(sp, b.x - sp.width / 2, b.y - sp.height / 2); }
    for (const b of eBul) { const sp = glowSprite(b.c, b.r); ctx.drawImage(sp, b.x - sp.width / 2, b.y - sp.height / 2); }
  }
  function drawBulletsOld() {
    ctx.shadowBlur = 8; for (const b of pBul) { ctx.fillStyle = b.c || '#fff3a0'; ctx.shadowColor = b.c || '#ffd23f'; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.fill(); } ctx.shadowBlur = 0;
    for (const b of eBul) { ctx.shadowColor = b.c; ctx.shadowBlur = 10; ctx.fillStyle = b.c; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 0.45, 0, TAU); ctx.fill(); } ctx.shadowBlur = 0;
  }

  function drawHazards() {
    for (const h of hazards) {
      if (h.k === 'zone') { const on = h.t >= h.delay; ctx.fillStyle = on ? h.c.replace(')', ',.55)').replace('rgb', 'rgba') : (h.tc || 'rgba(255,60,50,.14)'); if (on) ctx.fillStyle = h.c; ctx.globalAlpha = on ? 0.6 : 0.5; ctx.beginPath(); ctx.arc(h.x, h.y, on ? h.r : h.r * (h.t / Math.max(0.01, h.delay)), 0, TAU); ctx.fill(); ctx.globalAlpha = 1; ctx.strokeStyle = h.c; ctx.lineWidth = 2; ctx.setLineDash([8, 6]); ctx.beginPath(); ctx.arc(h.x, h.y, h.r, 0, TAU); ctx.stroke(); ctx.setLineDash([]); }
      else if (h.k === 'cone') { const on = h.t > h.delay; ctx.save(); ctx.translate(h.x, h.y); ctx.rotate(h.a); ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, h.r, -h.half, h.half); ctx.closePath(); if (on) { const g = ctx.createLinearGradient(0, 0, h.r, 0); g.addColorStop(0, 'rgba(255,245,160,.95)'); g.addColorStop(0.5, 'rgba(255,120,30,.8)'); g.addColorStop(1, 'rgba(200,40,10,.25)'); ctx.fillStyle = g; ctx.fill(); } else { ctx.fillStyle = 'rgba(255,80,40,.12)'; ctx.fill(); ctx.strokeStyle = 'rgba(255,80,40,.6)'; ctx.lineWidth = 2; ctx.setLineDash([8, 6]); ctx.stroke(); ctx.setLineDash([]); } ctx.restore(); }
      else if (h.k === 'fire') { const fl = 1 + Math.sin(time * 14 + h.x) * 0.08, al = clamp((h.dur - h.t) / 0.6, 0, 1); ctx.globalAlpha = al; const g = ctx.createRadialGradient(h.x, h.y, 2, h.x, h.y, h.r * fl); g.addColorStop(0, h.acid ? '#e8ffa0' : '#ffe08a'); g.addColorStop(0.5, h.acid ? '#6fd22a' : '#ff7a1a'); g.addColorStop(1, h.acid ? 'rgba(20,110,20,.3)' : 'rgba(200,40,10,.25)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(h.x, h.y, h.r * fl, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; }
      else if (h.k === 'web') { ctx.fillStyle = 'rgba(232,240,255,.22)'; ctx.beginPath(); ctx.arc(h.x, h.y, h.r, 0, TAU); ctx.fill(); ctx.strokeStyle = 'rgba(232,240,255,.7)'; ctx.lineWidth = 1.5; for (let i = 0; i < 8; i++) { ctx.beginPath(); ctx.moveTo(h.x, h.y); ctx.lineTo(h.x + Math.cos(i * 0.785) * h.r, h.y + Math.sin(i * 0.785) * h.r); ctx.stroke(); } for (const rr of [0.35, 0.7, 1]) { ctx.beginPath(); ctx.arc(h.x, h.y, h.r * rr, 0, TAU); ctx.stroke(); } }
      else if (h.k === 'wave') { if (h.delay > 0) continue; ctx.strokeStyle = h.c || '#ffb27a'; ctx.lineWidth = h.w; ctx.globalAlpha = 0.7 * (1 - h.r / h.maxR * 0.6); ctx.beginPath(); ctx.arc(h.x, h.y, h.r, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1; }
      else if (h.k === 'beam') { const on = h.t > h.delay; ctx.save(); ctx.translate(h.x, h.y); ctx.rotate(h.a); const R = arenaRealm(), bc = R === 2 ? '#9dff3a' : R === 1 ? '#ff7a1a' : '#7fe3ff'; if (on) { ctx.globalAlpha = 0.25; ctx.fillStyle = bc; ctx.fillRect(0, -16, h.len, 32); ctx.globalAlpha = 1; ctx.fillRect(0, -9, h.len, 18); ctx.fillStyle = '#fff'; ctx.fillRect(0, -3, h.len, 6); } else { ctx.fillStyle = R === 2 ? 'rgba(157,255,58,.4)' : R === 1 ? 'rgba(255,122,26,.4)' : 'rgba(127,227,255,.35)'; ctx.fillRect(0, -2, h.len, 4); } ctx.restore(); }
    }
  }

  function drawHUD() {
    // hearts
    for (let i = 0; i < player.maxHp; i++) { const x = 24 + i * 30, y = 28; ctx.fillStyle = i < player.hp ? '#ff4d6d' : '#3a2a2e'; ctx.beginPath(); ctx.moveTo(x, y + 6); ctx.bezierCurveTo(x - 14, y - 8, x - 8, y - 16, x, y - 6); ctx.bezierCurveTo(x + 8, y - 16, x + 14, y - 8, x, y + 6); ctx.fill(); ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5; ctx.stroke(); }
    // dash
    ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(24, 50, 100, 8); ctx.fillStyle = player.dashCdT <= 0 ? '#9deaff' : '#4a7080'; ctx.fillRect(24, 50, 100 * (1 - player.dashCdT / player.dashCd), 8);
    ctx.fillStyle = '#d9cfc4'; ctx.font = '11px ' + FONT; ctx.textAlign = 'left'; ctx.fillText('DASH', 130, 58);
    ctx.textAlign = 'right'; ctx.fillText('BOSS ' + Math.min(bossIdx + (boss ? 1 : 0), BOSSES.length) + '/' + BOSSES.length + '   BEST ' + best + '   ' + fmtTime(runTime), W - 16, 22);
    if (bossMode && boss && boss.cd) { const items = [['CLICK', 'shoot', boss.cd.fire, 0.24], ['Q', 'ring', boss.cd.q, 3], ['E', 'wave', boss.cd.e, 5], ['R', 'meteors', boss.cd.r, 5], ['F', 'imps', boss.cd.f, 10], ['SPACE', 'dash', boss.cd.d, 1.6]]; items.forEach(([k, n, c, m], i) => { const x = W / 2 - 3 * 78 + i * 78, y = H - 46; ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(x, y, 72, 34); ctx.fillStyle = c <= 0 ? '#ff5acd' : '#5a2a50'; ctx.fillRect(x, y + 28, 72 * (1 - c / m), 6); ctx.fillStyle = '#fff'; ctx.font = 'bold 12px ' + FONT; ctx.textAlign = 'center'; ctx.fillText(k + ' ' + n, x + 36, y + 18); }); }
    if (state === S.FIGHT && boss) { const bw = 520, bx = (W - bw) / 2; ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(bx - 3, 12, bw + 6, 20); ctx.fillStyle = boss.dying ? '#555' : '#c0283c'; ctx.fillRect(bx, 15, bw * clamp(boss.hp / boss.max, 0, 1), 14); ctx.fillStyle = '#fff'; ctx.font = 'bold 13px ' + FONT; ctx.textAlign = 'center'; ctx.fillText(boss.name, W / 2, 46); }
    if (toast) { ctx.globalAlpha = clamp(toast.life / 0.4, 0, 1); ctx.fillStyle = '#ffe9a8'; ctx.font = 'bold 22px ' + FONT; ctx.textAlign = 'center'; ctx.shadowColor = '#000'; ctx.shadowBlur = 6; ctx.fillText(toast.t, W / 2, 96); ctx.shadowBlur = 0; ctx.globalAlpha = 1; }
  }
  const fmtTime = t => Math.floor(t / 60) + ':' + String(Math.floor(t % 60)).padStart(2, '0');

  function drawFight() {
    ctx.drawImage([bgArena, bgArenaU, bgArenaA][arenaRealm()], 0, 0);
    drawHazards();
    for (const s of pillars) drawPillar(s);
    for (const m of minions) m.draw();
    if (boss) boss.draw();
    drawBullets(); drawPlayer();
    if (introT > 0) { ctx.globalAlpha = clamp(introT, 0, 1); ctx.fillStyle = '#000'; ctx.fillRect(0, H / 2 - 50, W, 100); ctx.fillStyle = '#ffe9a8'; ctx.font = 'bold 40px ' + FONT; ctx.textAlign = 'center'; ctx.fillText(boss.name, W / 2, H / 2 + 14); ctx.globalAlpha = 1; }
  }

  function overlay(title, sub, lines, color) {
    ctx.fillStyle = 'rgba(0,0,0,.72)'; ctx.fillRect(0, 0, W, H); ctx.textAlign = 'center'; ctx.fillStyle = color || '#ffe9a8'; ctx.font = 'bold 44px ' + FONT; ctx.fillText(title, W / 2, 230); ctx.fillStyle = '#d9cfc4'; ctx.font = '18px ' + FONT; ctx.fillText(sub, W / 2, 275);
    ctx.font = '16px ' + FONT; (lines || []).forEach((l, i) => ctx.fillText(l, W / 2, 330 + i * 26));
  }

  function drawDark() {
    dark.globalCompositeOperation = 'source-over'; const RR = state === S.HUB ? hubRealm() : state === S.TITLE ? 0 : arenaRealm(); dark.fillStyle = RR === 2 ? 'rgba(2,16,5,.55)' : RR === 1 ? 'rgba(22,3,0,.55)' : state === S.HUB || state === S.TITLE ? 'rgba(4,3,10,.62)' : 'rgba(4,3,10,.58)'; dark.fillRect(0, 0, W, H);
    dark.globalCompositeOperation = 'destination-out';
    if (!bigCut) { bigCut = document.createElement('canvas'); bigCut.width = bigCut.height = 256; const g = bigCut.getContext('2d'), gr = g.createRadialGradient(128, 128, 12, 128, 128, 128); gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 256, 256); }
    const cut = (x, y, r, a) => { dark.globalAlpha = a; dark.drawImage(bigCut, x - r, y - r, r * 2, r * 2); dark.globalAlpha = 1; };
    cut(player.x, player.y, 330, 1);
    for (const l of lights()) cut(l.x, l.y, l.r * 1.25 * (1 + Math.sin(time * 9 + l.x) * 0.04), 0.9);
    if (boss && !boss.dying) cut(boss.x, boss.y, 160, 0.55);
    if (!cutSprite) { cutSprite = document.createElement('canvas'); cutSprite.width = cutSprite.height = 76; const g = cutSprite.getContext('2d'), gr = g.createRadialGradient(38, 38, 4, 38, 38, 38); gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 76, 76); }
    dark.globalAlpha = 0.35; for (let i = 0; i < eBul.length; i += eBul.length > 90 ? 2 : 1) { const b = eBul[i]; dark.drawImage(cutSprite, b.x - 38, b.y - 38); } dark.globalAlpha = 1;
    for (const h of hazards) if (h.k === 'beam') cut(h.x + Math.cos(h.a) * 200, h.y + Math.sin(h.a) * 200, 220, 0.3);
    ctx.drawImage(darkC, 0, 0);
  }

  const darkC = document.createElement('canvas'); darkC.width = W; darkC.height = H; const dark = darkC.getContext('2d');

  function draw() {
    ctx.save(); ctx.clearRect(0, 0, W, H);
    if (shake > 0) ctx.translate(rnd(-shake, shake) * 0.4, rnd(-shake, shake) * 0.4);
    if (state === S.TITLE) {
      ctx.drawImage(bgHub, 0, 0); drawTorch(150, 170); drawTorch(830, 528); ctx.restore();
      player.x = 300; player.y = 400; drawDark();
      overlay('BOSS RUSH', 'You wake up in a cave. Fifteen bosses stand between you and freedom.', ['WASD / arrows: move   Mouse: aim and shoot', 'Space / Shift: dash (you cannot be hit while dashing)', 'Beat the cave bosses to open the lava portal, then the underworld to open the acid portal.', '', 'Click or press Enter to start' + (best ? '     Best: ' + best + '/' + BOSSES.length + ' bosses' : '')]);
      return;
    }
    if (state === S.HUB) drawHub(); else drawFight();
    ctx.restore();
    if (state !== S.UPGRADE && state !== S.WIN) drawDark(); else drawDark();
    drawHUD();
    if (state === S.UPGRADE) {
      overlay('BOSS DEFEATED', 'Choose an upgrade', []);
      offered.forEach((u, i) => { const x = 140 + i * 260, y = 320; ctx.fillStyle = 'rgba(40,32,26,.95)'; ctx.fillRect(x, y, 220, 170); ctx.strokeStyle = '#ffb347'; ctx.lineWidth = 3; ctx.strokeRect(x, y, 220, 170); ctx.fillStyle = '#ffe9a8'; ctx.font = 'bold 18px ' + FONT; ctx.textAlign = 'center'; ctx.fillText('[' + (i + 1) + '] ' + u.name, x + 110, y + 40); ctx.fillStyle = '#d9cfc4'; ctx.font = '14px ' + FONT; wrap(u.desc, x + 110, y + 80, 190, 20); });
    } else if (state === S.WIN) {
      overlay('YOU CONQUERED THE ACID REALM!', 'All fifteen bosses are down. You are free.', ['Time: ' + fmtTime(runTime), '', 'Press Enter to play again'], '#9dff9d');
    } else if (state === S.OVER) {
      if (bossMode) overlay(overTitle, 'Boss mode (admin)', ['Press R to play again', 'Press N to leave boss mode'], overTitle.startsWith('THE HERO') ? '#9dff9d' : '#ff6b7a'); else overlay(overTitle, boss ? 'Defeated by ' + boss.name : '', ['Press R to retry this boss (upgrades kept)', 'Press N for a brand new run']);
    }
    if (paused) overlay('PAUSED', 'Press P to resume', []);
  }
  function wrap(text, x, y, maxW, lh) { const words = text.split(' '); let line = ''; for (const w of words) { const t = line ? line + ' ' + w : w; if (ctx.measureText(t).width > maxW && line) { ctx.fillText(line, x, y); line = w; y += lh; } else line = t; } ctx.fillText(line, x, y); }

  // ------------------------------------------------------------------ input
  function toCanvas(e) { const r = canvas.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H }; }
  canvas.addEventListener('mousemove', e => { const p = toCanvas(e); mouse.x = p.x; mouse.y = p.y; });
  canvas.addEventListener('mousedown', e => {
    const p = toCanvas(e); mouse.x = p.x; mouse.y = p.y; mouse.down = true; blip(1, 0.01, 'sine', 0.0001);
    if (state === S.TITLE) { newRun(); return; }
    if (state === S.UPGRADE) offered.forEach((u, i) => { const x = 140 + i * 260; if (p.x > x && p.x < x + 220 && p.y > 320 && p.y < 490) chooseUpgrade(i); });
    if (state === S.WIN) newRun();
  });
  window.addEventListener('mouseup', () => { mouse.down = false; });
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  window.addEventListener('blur', () => { keys.clear(); mouse.down = false; });
  window.addEventListener('keydown', e => {
    if (e.target && e.target.tagName === 'INPUT') return;
    if (admin.open) return;
    keys.add(e.code); if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    if (e.repeat) return;
    if (e.code === 'KeyM') muted = !muted;
    if (e.code === 'KeyP' && (state === S.HUB || state === S.FIGHT)) paused = !paused;
    if (state === S.TITLE && (e.code === 'Enter' || e.code === 'Space')) newRun();
    else if (state === S.UPGRADE && ['Digit1', 'Digit2', 'Digit3'].includes(e.code)) chooseUpgrade(+e.code.slice(5) - 1);
    else if (state === S.WIN && e.code === 'Enter') newRun();
    else if (state === S.OVER) { if (bossMode) { if (e.code === 'KeyR') startBossMode(); if (e.code === 'KeyN') { bossMode = false; newRun(); } } else { if (e.code === 'KeyR') { player.hp = player.maxHp; player.inv = 1; startFight(); } if (e.code === 'KeyN') newRun(); } }
  });
  window.addEventListener('keyup', e => keys.delete(e.code));


  // ------------------------------------------------------------------ admin panel (password gated)
  const ADMIN_PASSWORD = 'thisgameisgoated';
  (function initAdmin() {
    const btn = document.createElement('button'); btn.id = 'adminBtn'; btn.textContent = 'ADMIN'; btn.title = 'Admin';
    const box = document.createElement('div'); box.id = 'adminBox'; document.body.append(btn, box);
    const say = t => { const m = box.querySelector('.msg'); if (m) m.textContent = t; };
    const close = () => { admin.open = false; box.className = ''; keys.clear(); mouse.down = false; btn.blur(); };
    const open = () => { admin.open = true; keys.clear(); mouse.down = false; render(); box.className = 'show'; const i = box.querySelector('input'); if (i) i.focus(); };
    const row = (label, fn, on) => { const b = document.createElement('button'); b.className = 'ab' + (on ? ' on' : ''); b.textContent = label; b.onclick = () => { fn(); render(); }; return b; };
    const need = () => { if (!player) newPlayer(); };
    function render() {
      box.innerHTML = '<div class="adminCard"><button class="x">&times;</button><h2>ADMIN</h2></div>'; const card = box.firstChild; card.querySelector('.x').onclick = close;
      if (!admin.ok) {
        card.insertAdjacentHTML('beforeend', '<p>Enter the admin password</p><input type="password" autocomplete="off" placeholder="password"><button class="ab go">Unlock</button><p class="msg"></p>');
        const inp = card.querySelector('input'), go = () => { if (inp.value === ADMIN_PASSWORD) { admin.ok = true; render(); } else { say('Wrong password'); inp.value = ''; } };
        card.querySelector('.go').onclick = go; inp.addEventListener('keydown', e => { if (e.key === 'Enter') go(); if (e.key === 'Escape') close(); }); return;
      }
      const sec = t => { const h = document.createElement('h3'); h.textContent = t; card.appendChild(h); const d = document.createElement('div'); d.className = 'grid'; card.appendChild(d); return d; };
      let g = sec('Weapons');
      g.append(row(player.ultra ? 'Ultra Gun: ON' : 'Get Ultra Gun', () => { player.ultra = !player.ultra; toastMsg(player.ultra ? 'ULTRA GUN equipped' : 'Ultra gun off'); }, player.ultra), row(admin.onehit ? 'One-hit kills: ON' : 'One-hit kills', () => { admin.onehit = !admin.onehit; }, admin.onehit));
      g = sec('Free upgrades');
      for (const u of UPGRADES) g.append(row(u.name, () => { u.apply(player); toastMsg('Free upgrade: ' + u.name); }));
      g = sec('Free underworld upgrades');
      for (const u of UPGRADES2) g.append(row(u.name, () => { u.apply(player); toastMsg('Free upgrade: ' + u.name); }));
      g = sec('Free acid upgrades');
      for (const u of UPGRADES3) g.append(row(u.name, () => { u.apply(player); toastMsg('Free upgrade: ' + u.name); }));
      g.append(row('ALL upgrades x3', () => { for (let k = 0; k < 3; k++) for (const u of UPGRADES.concat(UPGRADES2, UPGRADES3)) u.apply(player); player.hp = player.maxHp; }));
      g = sec('Broken stuff');
      g.append(row(admin.god ? 'God mode: ON' : 'God mode', () => { admin.god = !admin.god; }, admin.god), row(admin.infDash ? 'Infinite dash: ON' : 'Infinite dash', () => { admin.infDash = !admin.infDash; }, admin.infDash),
        row(admin.speedMul > 1 ? 'Super speed: ON' : 'Super speed', () => { admin.speedMul = admin.speedMul > 1 ? 1 : 2; }, admin.speedMul > 1), row(admin.freeze ? 'Freeze bosses: ON' : 'Freeze bosses', () => { admin.freeze = !admin.freeze; }, admin.freeze),
        row('Full heal', () => { player.hp = player.maxHp; }), row('+5 max hearts', () => { player.maxHp += 5; player.hp = player.maxHp; }), row('Clear enemy bullets', () => { eBul.length = 0; hazards.length = 0; }));
      g = sec('Bosses');
      g.append(row('Kill current boss', () => { if (state === S.FIGHT && boss && !boss.dying) { boss.hp = 0; bossDefeated(); close(); } }));
      BOSS_NAMES.forEach((n, i) => g.append(row('Fight: ' + n, () => { bossIdx = i; startFight(); close(); })));
      g.append(row('Back to the cave', () => { enterHub(false); close(); }));
      g = sec('Fun');
      g.append(row('PLAY AS THE BOSS (kill the hero)', () => { startBossMode(); close(); }));
      card.insertAdjacentHTML('beforeend', '<p class="msg">Changes apply instantly. Close this panel to keep playing.</p>');
    }
    btn.onclick = () => { if (admin.open) close(); else open(); };
    window.addEventListener('keydown', e => { if (admin.open && e.key === 'Escape') close(); });
  })();

  // ------------------------------------------------------------------ loop
  player = newPlayer(); pBul = []; eBul = []; hazards = []; parts = []; minions = []; pillars = []; bgHub = makeBG('hub'); bgArena = makeBG('arena'); bgHubU = makeBG('hub', 1); bgArenaU = makeBG('arena', 1); bgHubA = makeBG('hub', 2); bgArenaA = makeBG('arena', 2);
  let last = performance.now();
  function frame(now) { const dt = Math.min(0.05, (now - last) / 1000); last = now; update(dt); draw(); requestAnimationFrame(frame); }
  requestAnimationFrame(frame);

  if (location.hash === '#debug') window.__br = { st: () => ({ state, bossIdx, hp: player.hp, boss: boss && { hp: boss.hp, st: boss.state } }), player: () => player, boss: () => boss, step: dt => update(dt), startBoss: i => { if (!player) player = newPlayer(); bossIdx = i; startFight(); }, enterHub, newRun, keys, mouse, hazards: () => hazards, minions: () => minions, offered: () => offered, choose: chooseUpgrade, begin: () => { introT = 0; } };
})();
