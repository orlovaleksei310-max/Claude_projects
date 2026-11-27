/* Boss Rush
 * Top-down 2D. You wake up in a cave. Fight five bosses in a row, picking an upgrade between each.
 */
(() => {
  'use strict';

  const W = 960, H = 640, TAU = Math.PI * 2, FONT = '"Courier New", monospace';
  const canvas = document.getElementById('game'); let ctx = canvas.getContext('2d'); const mainCtx = ctx;
  const BEST_KEY = 'bossRush.best';
  const S = { TITLE: 0, HUB: 1, FIGHT: 2, UPGRADE: 3, WIN: 4, OVER: 5, STORY: 6 };
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


  // ------------------------------------------------------------------ music: every boss (and camp/title) has its own generated theme
  const SCALES = { minor: [0, 2, 3, 5, 7, 8, 10], phrygian: [0, 1, 3, 5, 7, 8, 10], harm: [0, 2, 3, 5, 7, 8, 11], dorian: [0, 2, 3, 5, 7, 9, 10], loc: [0, 1, 3, 5, 6, 8, 10], pent: [0, 3, 5, 7, 10], lyd: [0, 2, 4, 6, 7, 9, 11], whole: [0, 2, 4, 6, 8, 10], dim: [0, 2, 3, 5, 6, 8, 9, 11], major: [0, 2, 4, 5, 7, 9, 11] };
  // id: [root midi, scale, bpm, lead wave, bass wave, bass style, drums, chord progression (scale degrees), lead density, arpeggio, loudness]
  const THEMES = {
    title: [45, 'minor', 84, 'triangle', 'sine', 'half', 'none', [0, 5, 3, 4], 0.4, 1, 1],
    hub0: [43, 'dorian', 76, 'triangle', 'sine', 'half', 'none', [0, 3, 0, 4], 0.3, 1, 0.9],
    hub1: [41, 'phrygian', 72, 'triangle', 'sine', 'half', 'none', [0, 1, 0, 5], 0.3, 1, 0.9],
    hub2: [46, 'pent', 70, 'sine', 'sine', 'half', 'none', [0, 2, 3, 1], 0.3, 1, 0.9],
    hub3: [50, 'lyd', 68, 'sine', 'triangle', 'half', 'none', [0, 4, 2, 5], 0.3, 1, 0.9],
    boss25: [50, 'major', 172, 'square', 'sawtooth', 'gallop', 'break', [0, 4, 5, 3], 0.8, 1, 1.05],
    boss26: [38, 'dorian', 138, 'sawtooth', 'sawtooth', 'pulse', 'four', [0, 5, 3, 4], 0.7, 1, 1.1],
    boss27: [43, 'lyd', 120, 'sawtooth', 'triangle', 'off', 'break', [0, 2, 4, 1], 0.65, 1, 1.1],
    boss28: [52, 'major', 144, 'sawtooth', 'sawtooth', 'gallop', 'four', [0, 3, 4, 1], 0.8, 1, 1.1],
    boss29: [36, 'harm', 156, 'sawtooth', 'sawtooth', 'gallop', 'four', [0, 5, 3, 4], 0.9, 1, 1.15],
    hub5: [48, 'major', 72, 'sine', 'triangle', 'half', 'none', [0, 3, 4, 0], 0.3, 1, 0.95],
    hub4: [31, 'phrygian', 66, 'sine', 'triangle', 'half', 'none', [0, 1, 0, 3], 0.3, 1, 0.9],
    win: [48, 'major', 110, 'square', 'triangle', 'pulse', 'half', [0, 3, 4, 0], 0.6, 1, 1],
    boss0: [38, 'minor', 88, 'square', 'triangle', 'pulse', 'half', [0, 0, 5, 4], 0.4, 0, 1],
    boss1: [45, 'phrygian', 152, 'sawtooth', 'square', 'gallop', 'four', [0, 1, 0, 3], 0.7, 1, 1],
    boss2: [43, 'dorian', 108, 'triangle', 'sine', 'off', 'break', [0, 3, 5, 3], 0.6, 0, 1.1],
    boss3: [40, 'harm', 136, 'square', 'sawtooth', 'gallop', 'break', [0, 5, 1, 4], 0.65, 1, 1],
    boss4: [47, 'lyd', 124, 'sawtooth', 'triangle', 'pulse', 'four', [0, 2, 4, 1], 0.6, 1, 1],
    boss5: [36, 'phrygian', 164, 'sawtooth', 'sawtooth', 'gallop', 'four', [0, 1, 0, 6], 0.75, 1, 1],
    boss6: [41, 'whole', 96, 'triangle', 'sine', 'half', 'half', [0, 2, 4, 1], 0.5, 1, 1.1],
    boss7: [33, 'minor', 76, 'sawtooth', 'square', 'pulse', 'half', [0, 0, 3, 1], 0.35, 0, 1],
    boss8: [40, 'dim', 140, 'square', 'sawtooth', 'gallop', 'four', [0, 2, 4, 5], 0.7, 1, 1],
    boss9: [38, 'harm', 150, 'sawtooth', 'sawtooth', 'gallop', 'four', [0, 5, 3, 4], 0.8, 1, 1],
    boss10: [44, 'phrygian', 128, 'square', 'triangle', 'off', 'break', [0, 1, 5, 1], 0.6, 1, 1],
    boss11: [39, 'loc', 118, 'sawtooth', 'sine', 'pulse', 'half', [0, 1, 4, 1], 0.55, 0, 1],
    boss12: [46, 'pent', 92, 'triangle', 'sine', 'half', 'half', [0, 3, 2, 4], 0.45, 1, 1.1],
    boss13: [34, 'minor', 100, 'sawtooth', 'triangle', 'pulse', 'break', [0, 3, 0, 5], 0.5, 0, 1],
    boss14: [42, 'dim', 156, 'sawtooth', 'square', 'gallop', 'four', [0, 3, 1, 5], 0.8, 1, 1],
    boss15: [52, 'lyd', 84, 'triangle', 'sine', 'half', 'half', [0, 4, 2, 5], 0.4, 1, 1.1],
    boss16: [45, 'dorian', 168, 'square', 'sawtooth', 'gallop', 'break', [0, 4, 5, 3], 0.7, 1, 1],
    boss17: [48, 'major', 112, 'triangle', 'triangle', 'off', 'break', [0, 3, 4, 0], 0.6, 0, 1.1],
    boss18: [50, 'pent', 130, 'sine', 'triangle', 'pulse', 'four', [0, 2, 4, 2], 0.55, 1, 1.1],
    boss19: [41, 'harm', 146, 'sawtooth', 'sawtooth', 'gallop', 'four', [0, 6, 5, 3], 0.85, 1, 1],
    boss20: [43, 'phrygian', 160, 'sawtooth', 'sawtooth', 'gallop', 'break', [0, 1, 6, 1], 0.75, 1, 1.05],
    boss21: [38, 'minor', 126, 'square', 'sawtooth', 'pulse', 'four', [0, 5, 3, 6], 0.65, 1, 1.05],
    boss22: [40, 'harm', 112, 'sawtooth', 'sine', 'off', 'break', [0, 5, 1, 3], 0.6, 1, 1.05],
    boss23: [35, 'dim', 142, 'sawtooth', 'sawtooth', 'gallop', 'four', [0, 3, 6, 2], 0.7, 1, 1.05],
    boss24: [33, 'phrygian', 152, 'sawtooth', 'sawtooth', 'gallop', 'four', [0, 1, 5, 3], 0.9, 1, 1.1],
    boss99: [36, 'phrygian', 150, 'square', 'sawtooth', 'gallop', 'four', [0, 1, 3, 1], 0.7, 1, 1]
  };
  const BASS_STEPS = { pulse: [0, 4, 8, 12], gallop: [0, 2, 3, 6, 8, 10, 11, 14], off: [2, 6, 10, 14], half: [0, 8] };
  const DRUMS = { four: { k: [0, 4, 8, 12], s: [4, 12], h: [2, 6, 10, 14] }, half: { k: [0, 8], s: [8], h: [4, 12] }, break: { k: [0, 6, 10], s: [4, 12], h: [0, 2, 4, 6, 8, 10, 12, 14, 15] }, none: { k: [], s: [], h: [] } };
  const mus = { id: null, cfg: null, gain: null, step: 0, next: 0, timer: null, noise: null, melody: null };
  function rngFor(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function musicInit() {
    try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === 'suspended') actx.resume(); } catch (e) { return false; }
    if (!mus.master) { mus.master = actx.createGain(); mus.master.connect(actx.destination); const n = actx.sampleRate; mus.noise = actx.createBuffer(1, n, actx.sampleRate); const d = mus.noise.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; mus.timer = setInterval(musicTick, 40); }
    return true;
  }
  function makeMelody(id, cfg) {
    const sc = SCALES[cfg[1]], L = sc.length, r = rngFor(id.split('').reduce((a, c) => a * 31 + c.charCodeAt(0), 7)), prog = cfg[7], dens = cfg[8];
    const bar = () => { const a = []; for (let s = 0; s < 16; s++) a.push(r() < dens * (s % 4 === 0 ? 1.25 : s % 2 ? 0.45 : 0.8) ? [0, 2, 4, 1, 3, 5, 7, 4][Math.floor(r() * 8)] : null); return a; };
    const up = x => x.map(n => n === null ? null : n + 1), A = bar(), B = bar(), C = bar(), D = bar();
    return { sc, L, bars: [A, B, A, up(B), C, D, C, up(D)], prog };
  }
  const deg = (m, d) => { const o = Math.floor(d / m.L); return m.sc[((d % m.L) + m.L) % m.L] + 12 * o; };
  function mnote(f, t, dur, type, vol, dest, att, det) { const o = actx.createOscillator(), g = actx.createGain(); o.type = type; o.frequency.value = f; if (det) o.detune.value = det; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + (att || 0.012)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.03); }
  function mdrum(kind, t, dest, v, pitch) {
    if (kind === 'k' || kind === 't') { const o = actx.createOscillator(), g = actx.createGain(), p0 = kind === 'k' ? 150 : pitch; o.frequency.setValueAtTime(p0, t); o.frequency.exponentialRampToValueAtTime(kind === 'k' ? 40 : p0 * 0.5, t + (kind === 'k' ? 0.12 : 0.2)); g.gain.setValueAtTime((kind === 'k' ? 0.2 : 0.13) * v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + (kind === 'k' ? 0.16 : 0.26)); o.connect(g); g.connect(dest); o.start(t); o.stop(t + 0.3); return; }
    const s = actx.createBufferSource(), g = actx.createGain(), f = actx.createBiquadFilter(); s.buffer = mus.noise; f.type = 'highpass'; f.frequency.value = kind === 'h' ? 7000 : kind === 'c' ? 4500 : 1500; const vol = kind === 's' ? 0.09 : kind === 'c' ? 0.07 : 0.03, dd = kind === 's' ? 0.12 : kind === 'c' ? 0.9 : 0.04; g.gain.setValueAtTime(vol * v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dd); s.connect(f); f.connect(g); g.connect(dest); s.start(t); s.stop(t + dd + 0.05);
  }
  function musicStep(st, t) {
    const cfg = mus.cfg, m = mus.melody, dest = mus.gain, ld = mus.lead, v = cfg[10], bar = Math.floor(st / 16) % 8, s = st % 16, root = cfg[0], cd = m.prog[bar % 4], sp = 60 / cfg[2] / 4, hard = boss && boss.ph >= 2 && mus.id.startsWith('boss') ? 1 : 0, sec2 = bar >= 4, hz = n => 440 * Math.pow(2, (n - 69) / 12);
    const bs = BASS_STEPS[cfg[5]]; if (bs.includes(s)) { mnote(hz(root + deg(m, cd)), t, sp * (cfg[5] === 'half' ? 7 : 1.7), cfg[4], 0.075 * v, dest); if (cfg[5] !== 'half') mnote(hz(root - 12 + deg(m, cd)), t, sp * 1.7, 'sine', 0.06 * v, dest); }
    if (s === 0) for (const k of [0, 2, 4]) mnote(hz(root + 12 + deg(m, cd + k)), t, sp * 15, 'triangle', 0.02 * v, dest, 0.4);
    const ln = m.bars[bar][s];
    if (ln !== null && ln !== undefined) { const f = hz(root + 24 + (sec2 ? 12 : 0) + deg(m, cd + ln)), d = sp * (s % 4 === 0 ? 2.6 : 1.4); mnote(f, t, d, cfg[3], 0.03 * v, ld, 0.012, -9); mnote(f, t, d, cfg[3], 0.03 * v, ld, 0.012, 9); if (sec2 || hard) mnote(hz(root + 24 + (sec2 ? 12 : 0) + deg(m, cd + ln + 2)), t, d, 'triangle', 0.02 * v, ld); }
    if (cfg[9] && (s % 2 === 0 || hard)) mnote(hz(root + 12 + deg(m, cd + [0, 2, 4, 2][(s >> 1) % 4])), t, sp * 1.2, 'square', 0.014 * v, dest);
    const dr = DRUMS[cfg[6]]; if (dr.k.includes(s)) mdrum('k', t, dest, v); if (dr.s.includes(s)) mdrum('s', t, dest, v); if (dr.h.includes(s) || (hard && s % 2 === 1)) mdrum('h', t, dest, v);
    if (cfg[6] !== 'none') { if (s === 0 && bar % 4 === 0) mdrum('c', t, dest, v); if (bar % 4 === 3 && s >= 12) mdrum('t', t, dest, v, [190, 150, 120, 90][s - 12]); if (hard && s === 10) mdrum('k', t, dest, v); }
  }
  function musicTick() {
    if (!actx || !mus.master) return;
    mus.master.gain.value = (muted || paused || admin.open) ? 0 : 0.85;
    if (!mus.cfg) return; const sp = 60 / mus.cfg[2] / 4;
    if (mus.next < actx.currentTime - 0.3) mus.next = actx.currentTime + 0.05;
    while (mus.next < actx.currentTime + 0.18) { musicStep(mus.step, mus.next); mus.next += sp; mus.step++; }
  }
  function setTrack(id) {
    if (id === mus.id) return; mus.id = id;
    if (!musicInit()) return;
    if (mus.gain) { const g = mus.gain; g.gain.setTargetAtTime(0.0001, actx.currentTime, 0.12); setTimeout(() => { try { g.disconnect(); } catch (e) { /* ignore */ } }, 900); mus.gain = null; }
    mus.cfg = THEMES[id] || null; if (!mus.cfg) return;
    mus.melody = makeMelody(id, mus.cfg); mus.gain = actx.createGain(); mus.gain.gain.value = 1; mus.gain.connect(mus.master);
    mus.lead = actx.createGain(); mus.lead.connect(mus.gain); const dl = actx.createDelay(1), fb = actx.createGain(), wet = actx.createGain(); dl.delayTime.value = Math.min(0.95, 60 / mus.cfg[2] * 0.75); fb.gain.value = 0.38; wet.gain.value = 0.45; mus.lead.connect(dl); dl.connect(fb); fb.connect(dl); dl.connect(wet); wet.connect(mus.gain);
    mus.step = 0; mus.next = actx.currentTime + 0.1;
  }
  function wantTrack() {
    if (state === S.TITLE) return 'title';
    if (state === S.STORY) return storyKind === 'end' || storyKind === 'end2' ? 'win' : storyKind === 'p2' ? (storyI < 2 ? 'hub5' : 'boss54') : storyI < 2 ? 'hub5' : 'boss29';
    if (state === S.HUB) return 'hub' + hubRealm();
    if (state === S.UPGRADE) return 'hub' + realmOf(fightIdx);
    if (state === S.WIN) return 'win';
    if (state === S.FIGHT && boss && !boss.dying) return bossMode ? 'boss99' : 'boss' + fightIdx;
    return 'none';
  }
  function fanfare() { if (muted || !musicInit()) return; const t = actx.currentTime + 0.05; [0, 4, 7, 12, 16, 19, 24].forEach((n, i) => { mnote(440 * Math.pow(2, (60 + n - 69) / 12), t + i * 0.11, 0.5, 'square', 0.05, mus.master); mnote(440 * Math.pow(2, (48 + n - 69) / 12), t + i * 0.11, 0.5, 'triangle', 0.06, mus.master); }); }
  ['keydown', 'pointerdown'].forEach(ev => window.addEventListener(ev, () => { try { if (actx && actx.state === 'suspended') actx.resume(); } catch (e) { /* ignore */ } }));

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

  const maxedStats = () => { const t = { dmg: 1, fireDelay: 0.26, shots: 1, pierce: false }; for (const U of [UPGRADES, UPGRADES2, UPGRADES3, UPGRADES4, UPGRADES5, UPGRADES6, UPGRADES7]) for (const u of U) if (u.id !== 'heal' && /dmg|fireDelay|shots|pierce/.test(String(u.apply))) { try { u.apply(t); } catch (e) { } } t.fireDelay = Math.max(0.04, t.fireDelay); t.shots = 17; return t; };
  function toggleMaxedGun() { if (player.maxed) { Object.assign(player, player._gun); player.maxed = false; toastMsg('Maxed out gun off'); } else { player._gun = { dmg: player.dmg, fireDelay: player.fireDelay, shots: player.shots, pierce: player.pierce }; const t = maxedStats(); player.dmg = t.dmg; player.fireDelay = t.fireDelay; player.shots = t.shots; player.pierce = true; player.maxed = true; toastMsg('MAXED OUT GUN equipped - every gun upgrade!'); } }
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
  const UPGRADES4 = [
    { id: 'd_heart', name: 'Lucid Heart', desc: '+3 max hearts and heal 3', apply: p => { p.maxHp += 3; p.hp = Math.min(p.maxHp, p.hp + 3); } },
    { id: 'd_dmg', name: 'Nightmare Fuel', desc: '+100% shot damage', apply: p => { p.dmg *= 2; } },
    { id: 'd_dmg2', name: 'Waking Strike', desc: '+60% damage and +15% fire rate', apply: p => { p.dmg *= 1.6; p.fireDelay *= 0.85; } },
    { id: 'd_rate', name: 'Insomnia', desc: 'Shoot 45% faster', apply: p => { p.fireDelay *= 0.55; } },
    { id: 'd_speed', name: 'Sleepwalker', desc: '+25% move speed', apply: p => { p.speed *= 1.25; } },
    { id: 'd_dash', name: 'Dream Step', desc: 'Dash recharges 50% faster', apply: p => { p.dashCd *= 0.5; } },
    { id: 'd_multi', name: 'Star Shower', desc: '+2 bullets per shot (max 9)', apply: p => { p.shots = Math.min(9, p.shots + 2); }, ok: p => p.shots < 9 },
    { id: 'd_pillow', name: 'Pillow Fort', desc: 'Heal fully and +1 max heart', apply: p => { p.maxHp += 1; p.hp = p.maxHp; } },
    { id: 'd_lull', name: 'Lullaby', desc: 'Stay invincible 0.6s longer after being hit', apply: p => { p.invDur = (p.invDur || 1.15) + 0.6; }, ok: p => (p.invDur || 1.15) < 3 }
  ];
  const UPGRADES5 = [
    { id: 's_heart', name: 'Shadow Veil', desc: '+3 max hearts and heal 3', apply: p => { p.maxHp += 3; p.hp = Math.min(p.maxHp, p.hp + 3); } },
    { id: 's_dmg', name: 'Umbral Edge', desc: '+120% shot damage', apply: p => { p.dmg *= 2.2; } },
    { id: 's_soul', name: 'Soul Reaper', desc: '+70% damage and +20% fire rate', apply: p => { p.dmg *= 1.7; p.fireDelay *= 0.8; } },
    { id: 's_rate', name: 'Dark Tempo', desc: 'Shoot 50% faster', apply: p => { p.fireDelay *= 0.5; } },
    { id: 's_speed', name: 'Shade Step', desc: '+28% move speed', apply: p => { p.speed *= 1.28; } },
    { id: 's_dash', name: 'Void Dash', desc: 'Dash recharges 55% faster', apply: p => { p.dashCd *= 0.45; } },
    { id: 's_multi', name: 'Night Volley', desc: '+2 bullets per shot (max 11)', apply: p => { p.shots = Math.min(11, p.shots + 2); }, ok: p => p.shots < 11 },
    { id: 's_heal', name: 'Eclipse Heart', desc: 'Heal fully and +2 max hearts', apply: p => { p.maxHp += 2; p.hp = p.maxHp; } },
    { id: 's_inv', name: 'Cloak of Night', desc: 'Stay invincible 0.7s longer after being hit', apply: p => { p.invDur = (p.invDur || 1.15) + 0.7; }, ok: p => (p.invDur || 1.15) < 3.6 }
  ];
  const UPGRADES6 = [
    { id: 'g_heart', name: 'Blessing of Hestia', desc: '+3 max hearts and heal 3', apply: p => { p.maxHp += 3; p.hp = Math.min(p.maxHp, p.hp + 3); } },
    { id: 'g_dmg', name: 'Divine Wrath', desc: '+140% shot damage', apply: p => { p.dmg *= 2.4; } },
    { id: 'g_titan', name: "Titan's Might", desc: '+100% damage and +25% fire rate', apply: p => { p.dmg *= 2; p.fireDelay *= 0.75; } },
    { id: 'g_rate', name: "Hermes' Tempo", desc: 'Shoot 55% faster', apply: p => { p.fireDelay *= 0.45; } },
    { id: 'g_speed', name: 'Winged Sandals', desc: '+30% move speed', apply: p => { p.speed *= 1.3; } },
    { id: 'g_dash', name: 'Godstep', desc: 'Dash recharges 60% faster', apply: p => { p.dashCd *= 0.4; } },
    { id: 'g_multi', name: "Heaven's Volley", desc: '+2 bullets per shot (max 13)', apply: p => { p.shots = Math.min(13, p.shots + 2); }, ok: p => p.shots < 13 },
    { id: 'g_heal', name: 'Ambrosia', desc: 'Heal fully and +3 max hearts', apply: p => { p.maxHp += 3; p.hp = p.maxHp; } },
    { id: 'g_inv', name: 'Aegis', desc: 'Stay invincible 0.8s longer after being hit', apply: p => { p.invDur = (p.invDur || 1.15) + 0.8; }, ok: p => (p.invDur || 1.15) < 4.4 }
  ];
  function hurt(n, from) {
    if (admin.god && !bossMode) return;
    if (player.inv > 0 || player.dashT > 0 || state !== S.FIGHT && state !== S.HUB) return;
    player.hp -= n; player.inv = player.invDur || 1.15; shake = 10; blip(120, 0.25, 'sawtooth', 0.09, 0.5); burst(player.x, player.y, 10, '#ff5a4d', 160);
    if (player.hp <= 0) { player.hp = 0; die(); }
  }
  function die() { if (bossMode) { endBossMode(true); return; } state = S.OVER; deadT = 0; overTitle = ['YOU FELL IN THE CAVE', 'YOU BURNED IN THE UNDERWORLD', 'YOU DISSOLVED IN THE ACID', 'YOU WERE LOST IN A NIGHTMARE', 'YOU WERE SWALLOWED BY SHADOW', 'YOU WERE STRUCK DOWN BY THE GODS'].concat(P2R.map(p => p.die))[realmOf(fightIdx)]; blip(90, 0.8, 'sawtooth', 0.1, 0.4); }

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
  const BOSSES = [mkGolem, mkBat, mkSlime, mkSpider, mkWyrm, mkHound, mkWitch, mkTitan, mkDemon, mkDragon, mkScorpion, mkHydra, mkAcidWraith, mkLeviathan, mkOvermind, mkSandman, mkNightmare, mkPlush, mkMoth, mkDreamEater, mkStalker, mkKnight, mkReaper, mkBlackSun, mkShadowKing, mkHermes, mkAres, mkPoseidon, mkApollo, mkZeus];
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
    const b = base('CRYSTAL WYRM', 150, 40); b.hd = Math.PI / 2; b.spin = 0; b.fireT = 0; b.rainT = 2; b.trail = []; b.burstT = 3; b.beamT = 4; b.ringT = 3; b.wp = { x: ARENA.x, y: ARENA.y }; b.wpT = 0; b.charge = 0; b.chargeT = 9; b.segs = [];
    b.update = function (dt) {
      const f = this.hp / this.max, ph = f > 0.66 ? 1 : f > 0.33 ? 2 : 3;
      if (ph !== this.ph) { this.ph = ph; toastMsg(ph === 2 ? 'PHASE 2: the crystals awaken' : 'PHASE 3: the wyrm is enraged'); shake = 14; hazards.length = 0; eBul.length = 0; burst(this.x, this.y, 30, '#7fe3ff', 260); }
      // ---- real movement: steer along smooth curves between waypoints, and charge at you in later phases
      this.wpT -= dt;
      if (this.charge > 0) { this.charge -= dt; this.wp = { x: player.x, y: player.y }; }
      else if (this.wpT <= 0 || Math.hypot(this.wp.x - this.x, this.wp.y - this.y) < 50) { const a = rnd(0, TAU), d = rnd(60, ARENA.r - 90); this.wp = { x: ARENA.x + Math.cos(a) * d, y: ARENA.y + Math.sin(a) * d }; this.wpT = rnd(2, 3.5); }
      if (ph >= 2 && this.charge <= 0) { this.chargeT -= dt; if (this.chargeT <= 0) { this.charge = 1.6; this.chargeT = ph === 3 ? 8 : 11; blip(110, 0.3, 'sawtooth', 0.07); } }
      const want = Math.atan2(this.wp.y - this.y, this.wp.x - this.x), turn = (this.charge > 0 ? 2.6 : 1.7) * dt;
      this.hd += clamp(angDiff(want, this.hd), -turn, turn);
      const sp = (this.charge > 0 ? 330 : 120 + ph * 15); this.x += Math.cos(this.hd) * sp * dt; this.y += Math.sin(this.hd) * sp * dt;
      if (inArena(this, this.r + 30)) { const c = Math.atan2(ARENA.y - this.y, ARENA.x - this.x); this.hd += clamp(angDiff(c, this.hd), -4 * dt, 4 * dt); this.wp = { x: ARENA.x, y: ARENA.y }; this.charge = 0; }
      // body trail by distance, so the serpent follows the head like a real snake
      const last = this.trail[0]; if (!last || Math.hypot(last.x - this.x, last.y - this.y) >= 6) { this.trail.unshift({ x: this.x, y: this.y }); if (this.trail.length > 90) this.trail.pop(); }
      this.segs = []; for (let i = 1; i <= 8; i++) { const t = this.trail[i * 6]; if (t) this.segs.push({ x: t.x, y: t.y, r: 30 - i * 2 }); }
      for (const s of this.segs) if (Math.hypot(player.x - s.x, player.y - s.y) < s.r + player.r - 14) hurt(1);
      // ---- attacks
      this.spin += dt * (ph === 3 ? 1.1 : 0.7); this.fireT -= dt;
      if (this.fireT <= 0) { const arms = ph === 3 ? 3 : 2; for (let i = 0; i < arms; i++) ebul(this.x, this.y, this.spin + i * TAU / arms, ph === 3 ? 140 : 120, 7, { c: '#7fe3ff', life: 3.5 }); this.fireT = ph === 3 ? 0.28 : 0.34; }
      this.burstT -= dt; if (this.burstT <= 0) { fan(this.x, this.y, angTo(this, player), ph === 3 ? 5 : 3, 0.9, 230, 8, { c: '#ff9dd2' }); blip(300, 0.12, 'sawtooth', 0.05); this.burstT = ph === 3 ? 3.4 : 4.2; }
      if (ph >= 2) { this.rainT -= dt; if (this.rainT <= 0) { zone(player.x + rnd(-30, 30), player.y + rnd(-30, 30), 48, 1.0, 0.15, { c: '#7fe3ff' }); this.rainT = ph === 3 ? 1.1 : 1.5; } }
      if (ph >= 2) { this.beamT -= dt; if (this.beamT <= 0) { const a = rnd(0, TAU), d = Math.random() < 0.5 ? 1 : -1; beam(this.x, this.y, a, 0.5 * d, 1.0, 2.6);  this.beamT = ph === 3 ? 10 : 12; } }
      if (ph === 3) { this.ringT -= dt; if (this.ringT <= 0) { ring(this.x, this.y, 16, rnd(0, TAU), 130, 8, { c: '#ff9dd2' }, 4); this.ringT = 4.5; } }
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
    const b = base('HELLHOUND', 130, 40); b.ang = 0; b.tel = null;
    b.update = function (dt) {
      const ph = this.hp / this.max < 0.5 ? 2 : 1; if (ph !== this.ph) { this.ph = ph; toastMsg('The hellhound howls!'); shake = 12; ring(this.x, this.y, 16, 0, 200, 8, { c: '#ff8a1a' }); }
      this.st -= dt;
      if (this.state === 'idle') {
        this.ang += dt * 1.4; toward(this, player.x + Math.cos(this.ang) * 210, player.y + Math.sin(this.ang) * 230, 165, dt);
        if (this.st <= 0) { const o = ['lunge', 'breath', 'howl', 'breath']; this.state = pick(o); this.n = 0; if (this.state === 'lunge') { this.ca = angTo(this, player); this.st = 0.85; } else this.st = 0.8; }
      } else if (this.state === 'lunge') {
        if (this.st > 0) { this.tel = this.ca = angTo(this, player); }
        else { this.tel = null; this.x += Math.cos(this.ca) * 560 * dt; this.y += Math.sin(this.ca) * 560 * dt; if (Math.random() < 0.4) fire(this.x, this.y, 20, 2.2); if (this.st < -0.4 || inArena(this)) { this.n++; if (this.n < (ph === 2 ? 2 : 1)) { this.st = 0.7; this.ca = angTo(this, player); } else { this.state = 'idle'; this.st = 1.8; } } }
      } else if (this.state === 'breath') {
        if (this.st <= 0) { fan(this.x, this.y, angTo(this, player), ph === 2 ? 7 : 5, 1.1, 210, 8, { c: '#ff8a1a' }); blip(150, 0.15, 'sawtooth', 0.05); this.n++; this.st = 0.6; if (this.n >= 2) { this.state = 'idle'; this.st = 1.8; } }
      } else if (this.state === 'howl') {
        if (this.st <= 0) { ring(this.x, this.y, 14, rnd(0, 1), 160, 8, { c: '#ff8a1a' }); for (let i = 0; i < 2; i++) meteor(player.x + rnd(-120, 120), player.y + rnd(-120, 120), 1.1 + i * 0.3, 50); this.state = 'idle'; this.st = 1.8; }
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
    const b = base('INFERNAL DRAGON', 800, 52); b.face = Math.PI / 2; b.air = 0; b.stun = 0; b.wing = 0; b.cone = null; b.tx = 0; b.ty = 0;
    const flying = d => d.air > 0.3;
    b.update = function (dt) {
      const f = this.hp / this.max, ph = f > 0.7 ? 1 : f > 0.42 ? 2 : f > 0.2 ? 3 : 4;
      if (ph !== this.ph) { this.ph = ph; toastMsg(ph === 2 ? 'The dragon takes to the sky!' : ph === 3 ? 'The dragon is ENRAGED!' : 'LAST STAND! The dragon burns with fury!', 2.2); shake = 18; hazards.length = 0; eBul.length = 0; burst(this.x, this.y, 40, '#ff8a1a', 300); this.state = 'idle'; this.st = 1.1; this.air = 0; this.stun = 0; this.cone = null; this.mouth = false; ring(this.x, this.y, 20, 0, 210, 9, { c: '#ff8a1a' }); }
      if (this.stun > 0) { this.stun -= dt; return; }
      this.st -= dt; this.wing += dt;
      const toP = angTo(this, player), rest = k => k * [0, 1.0, 0.85, 0.7, 0.55][ph], spd = [0, 55, 72, 90, 105][ph];
      if (['idle', 'stomp', 'tail', 'fireballs', 'gust', 'cyclone'].includes(this.state)) this.face += clamp(angDiff(toP, this.face), -2.6 * dt, 2.6 * dt);
      if (this.state === 'idle') {
        if (dist(this, player) > 120) { toward(this, player.x, player.y, spd, dt); if (ph >= 3) { this.ft = (this.ft || 0) - dt; if (this.ft <= 0) { this.ft = 0.9; fire(this.x - Math.cos(this.face) * 40, this.y - Math.sin(this.face) * 40, 22, 2.0); } } }
        if (this.st <= 0) {
          const o = ['breath', 'tail', 'fireballs', 'stomp']; if (ph >= 2) o.push('fly', 'gust'); if (ph >= 3) o.push('eruption', 'cyclone', 'breath'); if (ph === 4) o.push('fly');
          let nx = pick(o); if (nx === this.last) nx = pick(o); this.last = nx; this.state = nx; this.n = 0; this.bt = 0;
          if (nx === 'stomp') { this.st = ph >= 3 ? 1.0 : 1.2; zone(this.x, this.y, 140, this.st, 0.15, {}); }
          else if (nx === 'tail') { this.st = ph >= 3 ? 0.85 : 1.0; zone(this.x, this.y, 190, this.st, 0.4, { c: '#ff5a3d' }); }
          else if (nx === 'breath') { this.st = 0.8; this.face = toP; const d = Math.random() < 0.5 ? 1 : -1, rot = d * [0, 0.75, 0.8, 0.9, 1.0][ph], dur = [0, 1.8, 1.9, 2.1, 2.3][ph]; this.cone = { k: 'cone', own: this, x: this.x, y: this.y, a: this.face - d * 0.7, rot, delay: 0.8, dur, t: 0, r: 390, half: 0.3 }; hazards.push(this.cone); if (ph === 4) hazards.push({ k: 'cone', own: this, x: this.x, y: this.y, a: this.face - d * 0.7 + Math.PI, rot, delay: 0.8, dur, t: 0, r: 390, half: 0.26 }); }
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
        if (this.cone) { this.face = this.cone.a; this.mouth = true; this.bt -= dt; if (ph >= 3 && this.bt <= 0 && this.cone.t > this.cone.delay) { this.bt = ph === 4 ? 0.7 : 0.9; ebul(this.x, this.y, toP, 230, 8, { c: '#ffd23f', home: 1.2, life: 3 }); } }
        if (this.st <= -(this.cone ? this.cone.dur : 0) - 0.1 || (this.cone && this.cone.dead)) { this.cone = null; this.mouth = false; this.state = 'idle'; this.st = rest(1.3); }
      } else if (this.state === 'fireballs') {
        if (this.st <= 0) { const a = angTo(this, player); fan(this.x, this.y, a, 4 + ph, 1.25, 215 + ph * 8, 8, { c: '#ffd23f' }); if (ph >= 2) for (let i = -1; i <= 1; i += 2) ebul(this.x, this.y, a + i * 0.45, 160, 9, { c: '#ff9a3a', home: 0.9, life: 3.5 }); blip(220, 0.12, 'sawtooth', 0.05); this.n++; this.st = 0.65 - ph * 0.04; if (this.n >= 1 + ph) { this.state = 'idle'; this.st = rest(1.3); } }
      } else if (this.state === 'gust') {
        if (this.st <= 0) { ring(this.x, this.y, 16, this.n * 0.35, 120 + ph * 6, 12, { c: '#ff8a1a' }, 4); this.n++; this.st = 0.8; blip(100, 0.2, 'triangle', 0.06); if (this.n >= 3) { this.state = 'idle'; this.st = rest(1.3); } }
      } else if (this.state === 'cyclone') {
        toward(this, player.x, player.y, 60, dt); this.ct -= dt; this.cy += dt * 2.3;
        if (this.ct <= 0) { this.ct = 0.14; const arms = ph === 4 ? 3 : 2; for (let i = 0; i < arms; i++) ebul(this.x, this.y, this.cy + i * TAU / arms, 190, 7, { c: '#ff8a1a', life: 3.2 }); }
        if (this.st <= 0) { this.state = 'idle'; this.st = rest(1.4); }
      } else if (this.state === 'fly') {
        this.air = clamp(this.air + dt * 1.3, 0, 1);
        if (this.st <= 0) { this.state = 'hover'; this.st = [0, 0, 2.2, 2.4, 2.6][ph]; this.n = 0; this.mt = 0; }
      } else if (this.state === 'hover') {
        this.mt -= dt; if (this.mt <= 0) { meteor(player.x + rnd(-140, 140), player.y + rnd(-140, 140), 0.85, 54); if (this.n % 2 === 0) meteor(player.x, player.y, 0.85, 52); if (ph >= 3 && this.n % 3 === 0) fan(this.x, this.y, toP, 5, 0.9, 230, 8, { c: '#ffd23f' }); this.n++; this.mt = [0, 0, 0.5, 0.42, 0.34][ph]; }
        toward(this, player.x, player.y, 100, dt);
        if (this.st <= 0) { this.state = 'dive'; this.st = ph >= 3 ? 1.1 : 1.25; this.dv = this.st; this.tx = player.x; this.ty = player.y; this.fx = this.x; this.fy = this.y; zone(this.tx, this.ty, 110, this.st, 0.2, { c: '#ff3d3d' }); }
      } else if (this.state === 'dive') {
        const u = clamp(1 - this.st / this.dv, 0, 1); this.x = this.fx + (this.tx - this.fx) * u * u; this.y = this.fy + (this.ty - this.fy) * u * u; this.air = clamp(1 - u * u * 1.1, 0, 1);
        if (this.st <= 0) { this.air = 0; this.x = this.tx; this.y = this.ty; shake = 22; blip(50, 0.5, 'sawtooth', 0.12, 0.4); wave(this.x, this.y, 240, 450, { w: 30, c: '#ffb27a' }); if (ph >= 3) wave(this.x, this.y, 240, 450, { w: 26, c: '#ff6a1a', delay: 0.6 }); ring(this.x, this.y, ph >= 3 ? 16 : 12, 0, 195, 9, { c: '#ff8a1a' }); fire(this.x, this.y, 52, 4); if (ph === 4) for (let i = 0; i < 3; i++) meteor(player.x + rnd(-150, 150), player.y + rnd(-150, 150), 1.0 + i * 0.2, 50); this.state = 'idle'; this.st = rest(1.3); this.stun = [0, 0, 2.2, 1.9, 1.6][ph]; toastMsg('The dragon is stunned - hit it!', 1.2); }
      } else if (this.state === 'eruption') {
        if (this.st <= 0) { const a = toP; for (let i = 1; i <= 7; i++) meteor(this.x + Math.cos(a) * i * 75, this.y + Math.sin(a) * i * 75, 0.7 + i * 0.1, 48); for (let k = -1; k <= 1; k += 2) for (let i = 2; i <= 6; i += 2) meteor(this.x + Math.cos(a + k * 0.5) * i * 75, this.y + Math.sin(a + k * 0.5) * i * 75, 0.7 + i * 0.1, 44); if (ph >= 3) for (let i = 0; i < 4; i++) meteor(player.x + Math.cos(i * 1.57) * 130, player.y + Math.sin(i * 1.57) * 130, 1.2, 44); this.state = 'idle'; this.st = rest(2.4); }
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
      this.st -= dt; this.digCd = Math.max(0, (this.digCd || 0) - dt); const toP = angTo(this, player), l = this.tr[0];
      if (!l || Math.hypot(l.x - this.x, l.y - this.y) > 9) { this.tr.unshift({ x: this.x, y: this.y }); if (this.tr.length > 30) this.tr.pop(); }
      if (this.state === 'idle' || this.state === 'spit' || this.state === 'rain') this.face += clamp(angDiff(toP, this.face), -2.5 * dt, 2.5 * dt);
      if (this.state === 'idle') {
        if (dist(this, player) > 120) toward(this, player.x, player.y, 85 + ph * 20, dt);
        if (this.st <= 0) { this.state = this.digCd > 0 ? pick(['spit', 'spit', 'rain']) : pick(['burrow', 'burrow', 'spit', 'rain']); this.n = 0; this.st = this.state === 'rain' || this.state === 'spit' ? 0.5 : 0.5; }
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
        if (this.st <= 0) { this.x = this.tx; this.y = this.ty; this.tr.length = 0; this.air = 0; shake = 20; blip(50, 0.5, 'sawtooth', 0.12, 0.4); wave(this.x, this.y, 235, 440, { w: 30, c: AC }); ring(this.x, this.y, ph === 2 ? 18 : 12, 0, 190, 9, AB()); pool(this.x, this.y, 50, 4); this.n++; if (ph === 2 && this.n < 2) { this.state = 'burrow'; this.st = 0.55; this.air = 0; } else { this.state = 'idle'; this.st = 1.4; this.digCd = ph === 2 ? 9 : 11; } }
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

  // ------------------------------------------------------------------ dreamland bosses (bosses 16-20)
  const DR1 = '#ff9dd2', DR2 = '#c77dff', DR3 = '#7fe3ff', DR4 = '#ffe9a8';
  const dpool = (x, y, r, dur) => hazards.push({ k: 'fire', dream: true, x, y, r, t: 0, dur });
  const star = (x, y, delay, r) => zone(x, y, r || 54, delay, 0.15, { c: DR2, tc: 'rgba(199,125,255,.16)', onEnd: z => { dpool(z.x, z.y, (r || 54) * 0.75, 3); shake = 4; } });
  const dzone = (x, y, r, delay, dur) => zone(x, y, r, delay, dur, { c: DR2, tc: 'rgba(199,125,255,.16)' });
  const DB = o => Object.assign({ c: DR1 }, o);
  const arenaPt = (a, d) => ({ x: ARENA.x + Math.cos(a) * d, y: ARENA.y + Math.sin(a) * d });

  function mkSandman() {
    const b = base('THE SANDMAN', 420, 34); b.ang = 0; b.spin = 0;
    b.update = function (dt) {
      const ph = this.hp / this.max < 0.5 ? 2 : 1; if (ph !== this.ph) { this.ph = ph; toastMsg('The Sandman whips up a sandstorm!'); shake = 12; ring(this.x, this.y, 20, 0, 190, 8, DB()); }
      this.st -= dt; this.ang += dt; const toP = angTo(this, player);
      if (this.state === 'idle') {
        toward(this, player.x + Math.cos(this.ang * 0.7) * 240, player.y + Math.sin(this.ang * 0.7) * 240, 95 + ph * 25, dt);
        if (this.st <= 0) { this.state = pick(ph === 2 ? ['dust', 'nap', 'lullaby', 'storm', 'storm'] : ['dust', 'dust', 'nap', 'lullaby']); this.n = 0; this.st = 0.5; if (this.state === 'lullaby') this.st = 2.6; if (this.state === 'storm') this.st = 0.6; }
      } else if (this.state === 'dust') {
        if (this.st <= 0) { fan(this.x, this.y, toP, ph === 2 ? 9 : 7, 1.3, 170, 9, DB({ c: DR4 })); ring(this.x, this.y, 14, this.n * 0.3, 120, 8, DB({ c: DR3 }), 3); this.n++; this.st = 0.7; blip(180, 0.15, 'triangle', 0.05); if (this.n >= (ph === 2 ? 4 : 3)) { this.state = 'idle'; this.st = 1.2; } }
      } else if (this.state === 'nap') {
        if (this.st <= 0) { for (let i = 0; i < (ph === 2 ? 8 : 6); i++) star(player.x + (i ? rnd(-170, 170) : 0), player.y + (i ? rnd(-170, 170) : 0), 0.9 + i * 0.14, 62); this.state = 'idle'; this.st = 1.8; }
      } else if (this.state === 'lullaby') {
        this.spin += dt * 1.8; this.n -= dt; if (this.n <= 0) { this.n = 0.1; for (let i = 0; i < 2; i++) ebul(this.x, this.y, this.spin + i * Math.PI, 150, 8, DB({ c: i ? DR3 : DR1, life: 4 })); }
        if (this.st <= 0) { this.state = 'idle'; this.st = 1.3; }
      } else if (this.state === 'storm') {
        if (this.st <= 0 && !this.bm) { const d = Math.random() < 0.5 ? 1 : -1, a0 = rnd(0, TAU); for (let i = 0; i < 2; i++) addBeam(this.x, this.y, a0 + i * Math.PI, d * 0.8, 0.7, 2.8, 330); this.bm = true; this.st = 3.6; }
        else if (this.bm && this.st <= 0) { this.bm = false; this.state = 'idle'; this.st = 1.2; } else if (this.bm) followBeams(this);
      }
      inArena(this);
    };
    b.draw = function () {
      const x = this.x, y = this.y + Math.sin(time * 2.5) * 4, f = this.flash > 0;
      ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(this.x, this.y + 46, 30, 8, 0, 0, TAU); ctx.fill();
      for (let i = 0; i < 7; i++) { const a = time * 2 + i * 0.9; ctx.fillStyle = 'rgba(255,233,168,.5)'; ctx.beginPath(); ctx.arc(x + Math.cos(a) * (40 + i * 3), y + 10 + Math.sin(a) * 18, 3, 0, TAU); ctx.fill(); }
      ctx.fillStyle = f ? '#fff' : '#1d1a4a'; ctx.beginPath(); ctx.moveTo(x, y - 20); ctx.lineTo(x + 34, y + 44); ctx.lineTo(x - 34, y + 44); ctx.closePath(); ctx.fill(); ctx.fillStyle = f ? '#fff' : '#2c2870'; ctx.beginPath(); ctx.moveTo(x, y - 14); ctx.lineTo(x + 20, y + 40); ctx.lineTo(x - 20, y + 40); ctx.closePath(); ctx.fill();
      ctx.fillStyle = DR4; for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc(x + Math.sin(i * 2.1) * 14, y + 8 + i * 6, 1.8, 0, TAU); ctx.fill(); }
      ctx.fillStyle = f ? '#fff' : '#f2e6ff'; ctx.beginPath(); ctx.arc(x, y - 22, 15, 0, TAU); ctx.fill(); ctx.strokeStyle = '#1d1a4a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x - 5, y - 23, 3, 0.2, Math.PI - 0.2); ctx.arc(x + 5, y - 23, 3, 0.2, Math.PI - 0.2); ctx.stroke();
      ctx.fillStyle = f ? '#fff' : '#3a3490'; ctx.beginPath(); ctx.moveTo(x - 16, y - 28); ctx.quadraticCurveTo(x, y - 62, x + 30, y - 40); ctx.lineTo(x + 16, y - 28); ctx.fill(); ctx.fillStyle = DR4; ctx.beginPath(); ctx.arc(x + 30, y - 40, 5, 0, TAU); ctx.fill();
    };
    return b;
  }

  function mkNightmare() {
    const b = base('NIGHTMARE STALLION', 460, 40); b.face = Math.PI / 2; b.ca = 0;
    b.update = function (dt) {
      const ph = this.hp / this.max < 0.5 ? 2 : 1; if (ph !== this.ph) { this.ph = ph; toastMsg('The stallion rears up in terror!'); shake = 12; ring(this.x, this.y, 18, 0, 190, 8, DB({ c: DR2 })); }
      this.st -= dt; const toP = angTo(this, player);
      if (this.state !== 'charge') this.face += clamp(angDiff(toP, this.face), -3 * dt, 3 * dt);
      if (this.state === 'idle') {
        const d = dist(this, player); if (d > 190) toward(this, player.x, player.y, 140 + ph * 30, dt); else if (d < 120) toward(this, player.x, player.y, -100, dt);
        if (this.st <= 0) { this.state = pick(['charge', 'charge', 'stomp', 'neigh']); this.n = 0; this.st = 0.5; if (this.state === 'charge') { this.st = 0.75; this.ca = toP; } else if (this.state === 'stomp') { this.st = 0.9; dzone(this.x, this.y, 150, 0.9, 0.2); } }
      } else if (this.state === 'charge') {
        if (this.st > 0) { this.ca = toP; this.face = this.ca; } else { this.face = this.ca; this.x += Math.cos(this.ca) * 680 * dt; this.y += Math.sin(this.ca) * 680 * dt; this.pt = (this.pt || 0) + dt; if (this.pt > 0.08) { this.pt = 0; dpool(this.x, this.y, 22, 2.6); }
          if (this.st < -0.6 || inArena(this)) { fan(this.x, this.y, angTo(this, player), ph === 2 ? 7 : 5, 1.0, 220, 8, DB({ c: DR2 })); this.n++; if (this.n < (ph === 2 ? 3 : 2)) { this.st = 0.5; } else { this.state = 'idle'; this.st = 1.2; } } }
      } else if (this.state === 'stomp') {
        if (this.st <= 0) { wave(this.x, this.y, 220, 430, { w: 26, c: DR2 }); if (ph === 2) wave(this.x, this.y, 220, 430, { w: 24, c: DR1, delay: 0.45 }); shake = 12; blip(70, 0.35, 'sawtooth', 0.1, 0.4); this.state = 'idle'; this.st = 1.2; }
      } else if (this.state === 'neigh') {
        if (this.st <= 0) { ring(this.x, this.y, 24, toP + this.n * 0.5, 160, 9, DB({ c: DR2 }), 5); this.n++; this.st = 0.55; if (this.n >= (ph === 2 ? 4 : 3)) { this.state = 'idle'; this.st = 1.3; } }
      }
      inArena(this);
    };
    b.draw = function () {
      const x = this.x, y = this.y, f = this.flash > 0, run = this.state === 'charge' && this.st <= 0;
      if (this.state === 'charge' && this.st > 0) { ctx.strokeStyle = 'rgba(199,125,255,.4)'; ctx.lineWidth = 38; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(this.ca) * 560, y + Math.sin(this.ca) * 560); ctx.stroke(); }
      ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(x, y + 34, 56, 13, 0, 0, TAU); ctx.fill();
      ctx.save(); ctx.translate(x, y); ctx.rotate(this.face); ctx.lineCap = 'round';
      ctx.strokeStyle = f ? '#fff' : '#120c26'; ctx.lineWidth = 8; for (const [lx, s] of [[24, -1], [24, 1], [-24, -1], [-24, 1]]) { const w = Math.sin(time * (run ? 22 : 7) + lx + s * 1.6) * (run ? 16 : 6); ctx.beginPath(); ctx.moveTo(lx, s * 10); ctx.lineTo(lx + w, s * 30); ctx.stroke(); }
      ctx.fillStyle = f ? '#fff' : '#241a3a'; ctx.beginPath(); ctx.ellipse(0, 0, 48, 22, 0, 0, TAU); ctx.fill(); ctx.fillStyle = f ? '#fff' : '#33264f'; ctx.beginPath(); ctx.ellipse(4, -3, 40, 15, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = f ? '#fff' : '#241a3a'; ctx.beginPath(); ctx.moveTo(34, -10); ctx.lineTo(62, -8); ctx.lineTo(64, 8); ctx.lineTo(34, 12); ctx.fill(); ctx.beginPath(); ctx.ellipse(66, 0, 16, 10, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ff3d6e'; ctx.beginPath(); ctx.arc(66, -5, 3, 0, TAU); ctx.arc(66, 5, 3, 0, TAU); ctx.fill();
      for (let i = 0; i < 8; i++) { const t = i / 7, fl = Math.sin(time * 9 + i) * 5; ctx.fillStyle = i % 2 ? DR2 : DR1; ctx.beginPath(); ctx.moveTo(30 - t * 56, -16); ctx.lineTo(24 - t * 56 + fl, -34 - fl); ctx.lineTo(18 - t * 56, -14); ctx.fill(); }
      for (let i = 0; i < 5; i++) { const fl = Math.sin(time * 10 + i) * 6; ctx.fillStyle = i % 2 ? DR3 : DR2; ctx.beginPath(); ctx.moveTo(-44, 0); ctx.lineTo(-70 - i * 6, (i - 2) * 9 + fl); ctx.lineTo(-48, (i - 2) * 4 + 4); ctx.fill(); }
      ctx.restore();
    };
    return b;
  }

  function mkPlush() {
    const b = base('PLUSH TERROR', 480, 44); b.face = Math.PI / 2; b.ca = 0; b.bn = 0; b.rt = 0;
    b.update = function (dt) {
      const ph = this.hp / this.max < 0.5 ? 2 : 1; if (ph !== this.ph) { this.ph = ph; toastMsg('The seams burst - the plush is raging!'); shake = 14; ring(this.x, this.y, 22, 0, 190, 8, DB({ c: '#fff3e0' })); }
      this.st -= dt; const toP = angTo(this, player);
      if (this.state !== 'roll') this.face += clamp(angDiff(toP, this.face), -3 * dt, 3 * dt);
      if (this.state === 'idle') {
        if (dist(this, player) > 140) toward(this, player.x, player.y, 90 + ph * 30, dt);
        if (this.st <= 0) { const o = ['pound', 'roll', 'stuffing', 'thread', 'pound']; if (ph === 2) o.push('tantrum', 'roll', 'thread'); this.state = pick(o); this.n = 0; this.st = 0.5;
          if (this.state === 'pound') { this.st = 0.9; dzone(this.x, this.y, 155, 0.9, 0.2); } else if (this.state === 'roll') { this.st = 0.8; this.ca = toP; this.bn = 0; this.rt = 0; } else if (this.state === 'thread') this.st = 0.6;
          else if (this.state === 'tantrum') { this.st = 2.2; for (let i = 0; i < 5; i++) zone(player.x + (i ? rnd(-150, 150) : 0), player.y + (i ? rnd(-150, 150) : 0), 105, 0.8 + i * 0.3, 0.2, { c: DR1, tc: 'rgba(255,157,210,.16)', onEnd: z => { wave(z.x, z.y, 140, 380, { w: 22, c: DR1 }); shake = 6; } }); } }
      } else if (this.state === 'pound') {
        if (this.st <= 0) { wave(this.x, this.y, 225, 430, { w: 28, c: '#ffd9a8' }); if (ph === 2) wave(this.x, this.y, 225, 430, { w: 24, c: DR1, delay: 0.45 }); ring(this.x, this.y, 12, 0, 170, 9, DB({ c: '#fff3e0' })); shake = 14; blip(65, 0.4, 'sawtooth', 0.1, 0.4); this.state = 'idle'; this.st = 1.3; }
      } else if (this.state === 'roll') {
        if (this.st > 0) { this.ca = toP; } else { this.rt += dt * 14; this.x += Math.cos(this.ca) * 480 * dt; this.y += Math.sin(this.ca) * 480 * dt; this.pt = (this.pt || 0) + dt; if (this.pt > 0.1) { this.pt = 0; dpool(this.x, this.y, 22, 2.4); }
          if (inArena(this, this.r + 6)) { this.bn++; const c = Math.atan2(ARENA.y - this.y, ARENA.x - this.x); this.ca = c + rnd(-0.5, 0.5); ring(this.x, this.y, 8, 0, 160, 8, DB({ c: '#fff3e0' })); }
          if (this.bn >= (ph === 2 ? 3 : 2) || this.st < -2.6) { this.state = 'idle'; this.st = 1.4; } }
      } else if (this.state === 'stuffing') {
        if (this.st <= 0) { fan(this.x, this.y, toP, ph === 2 ? 11 : 9, 1.6, 185, 9, DB({ c: '#fff3e0' })); if (ph === 2) ring(this.x, this.y, 12, this.n * 0.3, 130, 8, DB({ c: DR1 })); blip(200, 0.12, 'triangle', 0.05); this.n++; this.st = 0.55; if (this.n >= (ph === 2 ? 5 : 4)) { this.state = 'idle'; this.st = 1.2; } }
      } else if (this.state === 'thread') {
        if (this.st <= 0 && !this.bm) { const arms = ph === 2 ? 4 : 3, d = Math.random() < 0.5 ? 1 : -1, a0 = rnd(0, TAU); for (let i = 0; i < arms; i++) addBeam(this.x, this.y, a0 + i * TAU / arms, d * 0.85, 0.7, 2.8, 320); this.bm = true; this.st = 3.6; }
        else if (this.bm && this.st <= 0) { this.bm = false; this.state = 'idle'; this.st = 1.2; } else if (this.bm) followBeams(this);
      } else if (this.state === 'tantrum') {
        if (this.st <= 0) { this.state = 'idle'; this.st = 1.4; }
      }
      inArena(this);
    };
    b.draw = function () {
      const x = this.x, y = this.y, f = this.flash > 0, ph2 = this.ph === 2, rolling = this.state === 'roll' && this.st <= 0;
      const fur = f ? '#fff' : '#9a6240', lt = f ? '#fff' : '#d2a373', dk = f ? '#fff' : '#6a3f26';
      if (this.state === 'roll' && this.st > 0) { ctx.strokeStyle = 'rgba(255,157,210,.4)'; ctx.lineWidth = 40; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(this.ca) * 540, y + Math.sin(this.ca) * 540); ctx.stroke(); }
      ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(x, y + 46, 52, 13, 0, 0, TAU); ctx.fill();
      ctx.save(); ctx.translate(x, y); if (rolling) ctx.rotate(this.rt);
      for (const s of [-1, 1]) { ctx.fillStyle = fur; ctx.beginPath(); ctx.arc(s * 42, 22, 17, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.arc(s * 46, -8 + Math.sin(time * 3 + s) * 3, 15, 0, TAU); ctx.fill(); ctx.fillStyle = lt; ctx.beginPath(); ctx.arc(s * 46, -8 + Math.sin(time * 3 + s) * 3, 7, 0, TAU); ctx.fill(); }
      ctx.fillStyle = fur; ctx.beginPath(); ctx.ellipse(0, 6, 40, 38, 0, 0, TAU); ctx.fill(); ctx.fillStyle = lt; ctx.beginPath(); ctx.ellipse(0, 12, 24, 24, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#3a2216'; ctx.lineWidth = 2; ctx.setLineDash([5, 4]); ctx.beginPath(); ctx.moveTo(-6, -12); ctx.quadraticCurveTo(10, 10, 4, 34); ctx.stroke(); ctx.setLineDash([]);
      if (ph2) { ctx.fillStyle = '#fff8ee'; for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc(2 + Math.sin(i * 2) * 8 + Math.sin(time * 4 + i) * 2, 8 + i * 5, 5, 0, TAU); ctx.fill(); } }
      for (const s of [-1, 1]) { ctx.fillStyle = fur; ctx.beginPath(); ctx.arc(s * 30, -40, 15, 0, TAU); ctx.fill(); ctx.fillStyle = f ? '#fff' : '#e8a0b8'; ctx.beginPath(); ctx.arc(s * 30, -40, 8, 0, TAU); ctx.fill(); }
      ctx.fillStyle = fur; ctx.beginPath(); ctx.arc(0, -26, 34, 0, TAU); ctx.fill(); ctx.fillStyle = lt; ctx.beginPath(); ctx.ellipse(0, -16, 17, 13, 0, 0, TAU); ctx.fill(); ctx.fillStyle = '#2a1618'; ctx.beginPath(); ctx.ellipse(0, -22, 6, 4.5, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#2a1618'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(0, -18); ctx.lineTo(0, -12); ctx.moveTo(-14, -8); ctx.quadraticCurveTo(-7, -14, 0, -10); ctx.quadraticCurveTo(7, -14, 14, -8); ctx.stroke(); for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(i * 5, -12); ctx.lineTo(i * 5, -7); ctx.stroke(); }
      const eye = ph2 ? '#ff3d6e' : '#1a1020'; ctx.fillStyle = eye; ctx.beginPath(); ctx.arc(-13, -34, 6.5, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.arc(13, -34 + (ph2 ? 9 : 0), 6.5, 0, TAU); ctx.fill(); if (ph2) { ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(13, -42); ctx.lineTo(13, -34); ctx.stroke(); }
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; for (const [ex, ey] of [[-13, -34], [13, -34 + (ph2 ? 9 : 0)]]) { ctx.beginPath(); ctx.moveTo(ex - 3, ey - 3); ctx.lineTo(ex + 3, ey + 3); ctx.moveTo(ex + 3, ey - 3); ctx.lineTo(ex - 3, ey + 3); ctx.stroke(); }
      ctx.restore();
    };
    return b;
  }

  function mkMoth() {
    const b = base('LUNAR MOTH', 500, 38); b.ang = 0; b.face = Math.PI / 2; b.ca = 0; b.flap = 0;
    b.update = function (dt) {
      const ph = this.hp / this.max < 0.5 ? 2 : 1; if (ph !== this.ph) { this.ph = ph; toastMsg('The moth glows with moonlight!'); shake = 12; ring(this.x, this.y, 22, 0, 190, 8, DB({ c: DR3 })); }
      this.st -= dt; this.ang += dt; this.flap += dt * (this.state === 'swoop' ? 18 : 9); const toP = angTo(this, player);
      if (this.state !== 'swoop') this.face += clamp(angDiff(toP, this.face), -3 * dt, 3 * dt);
      if (this.state === 'idle') {
        toward(this, ARENA.x + Math.cos(this.ang * 0.8) * 190, ARENA.y + Math.sin(this.ang * 0.8) * 150, 120 + ph * 30, dt);
        if (this.st <= 0) { this.state = pick(ph === 2 ? ['swoop', 'scales', 'moonbeam', 'dustrain', 'swoop'] : ['swoop', 'scales', 'moonbeam', 'dustrain']); this.n = 0; this.st = 0.5; if (this.state === 'swoop') { this.st = 0.7; this.ca = toP; } else if (this.state === 'moonbeam') this.st = 0.6; }
      } else if (this.state === 'swoop') {
        if (this.st > 0) { this.ca = toP; this.face = this.ca; } else { this.face = this.ca; this.x += Math.cos(this.ca) * 560 * dt; this.y += Math.sin(this.ca) * 560 * dt; this.pt = (this.pt || 0) + dt; if (this.pt > 0.12) { this.pt = 0; ring(this.x, this.y, 6, rnd(0, 1), 110, 7, DB({ c: DR3, life: 3 })); }
          if (this.st < -0.65 || inArena(this)) { this.n++; if (this.n < (ph === 2 ? 3 : 2)) this.st = 0.45; else { this.state = 'idle'; this.st = 1.2; } } }
      } else if (this.state === 'scales') {
        if (this.st <= 0) { ring(this.x, this.y, 20, this.n * 0.4, 130, 9, DB({ c: DR3 }), 4); ring(this.x, this.y, 12, this.n * 0.7, 190, 7, DB({ c: DR4 })); this.n++; this.st = 0.6; if (this.n >= (ph === 2 ? 4 : 3)) { this.state = 'idle'; this.st = 1.3; } }
      } else if (this.state === 'moonbeam') {
        if (this.st <= 0 && !this.bm) { const d = Math.random() < 0.5 ? 1 : -1, a0 = rnd(0, TAU), arms = ph === 2 ? 4 : 3; for (let i = 0; i < arms; i++) addBeam(this.x, this.y, a0 + i * TAU / arms, d * 0.75, 0.7, 2.8, 340); this.bm = true; this.st = 3.6; }
        else if (this.bm && this.st <= 0) { this.bm = false; this.state = 'idle'; this.st = 1.2; } else if (this.bm) followBeams(this);
      } else if (this.state === 'dustrain') {
        if (this.st <= 0) { for (let i = 0; i < (ph === 2 ? 10 : 7); i++) { const p = arenaPt(rnd(0, TAU), rnd(0, ARENA.r - 50)); star(p.x, p.y, 0.9 + i * 0.1, 52); } star(player.x, player.y, 0.9, 52); this.state = 'idle'; this.st = 1.9; }
      }
      inArena(this);
    };
    b.draw = function () {
      const x = this.x, y = this.y, f = this.flash > 0, fl = Math.sin(this.flap);
      if (this.state === 'swoop' && this.st > 0) { ctx.strokeStyle = 'rgba(127,227,255,.4)'; ctx.lineWidth = 32; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(this.ca) * 540, y + Math.sin(this.ca) * 540); ctx.stroke(); }
      ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(x, y + 44, 40, 10, 0, 0, TAU); ctx.fill();
      ctx.save(); ctx.translate(x, y); ctx.rotate(this.face);
      for (const s of [-1, 1]) { const sc = 0.55 + Math.abs(fl) * 0.45; ctx.save(); ctx.scale(1, s * sc); ctx.fillStyle = f ? '#fff' : '#c9e8ff'; ctx.beginPath(); ctx.moveTo(8, 4); ctx.quadraticCurveTo(-10, 70, -56, 52); ctx.quadraticCurveTo(-40, 14, 8, 4); ctx.fill(); ctx.fillStyle = f ? '#fff' : '#9fd0ff'; ctx.beginPath(); ctx.moveTo(16, 4); ctx.quadraticCurveTo(30, 52, 4, 66); ctx.quadraticCurveTo(0, 30, 16, 4); ctx.fill(); ctx.fillStyle = DR2; ctx.beginPath(); ctx.arc(-18, 32, 9, 0, TAU); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(-18, 32, 4, 0, TAU); ctx.fill(); ctx.restore(); }
      ctx.fillStyle = f ? '#fff' : '#f4efff'; ctx.beginPath(); ctx.ellipse(0, 0, 26, 12, 0, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.arc(28, 0, 9, 0, TAU); ctx.fill(); ctx.fillStyle = '#c0284c'; ctx.beginPath(); ctx.arc(32, -4, 2.5, 0, TAU); ctx.arc(32, 4, 2.5, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#f4efff'; ctx.lineWidth = 2; for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(32, s * 4); ctx.quadraticCurveTo(48, s * 12, 54, s * 20); ctx.stroke(); }
      ctx.restore();
    };
    return b;
  }

  function mkDreamEater() {
    const b = base('DREAM EATER', 1500, 56); b.cy = 0; b.ct = 0; b.ph4 = [];
    b.update = function (dt) {
      const f = this.hp / this.max, ph = f > 0.66 ? 1 : f > 0.33 ? 2 : 3;
      if (ph !== this.ph) { this.ph = ph; toastMsg(ph === 2 ? 'The Dream Eater devours the sky!' : 'NIGHTMARE! The Dream Eater tears the dream apart!', 2.2); shake = 18; hazards.length = 0; eBul.length = 0; burst(this.x, this.y, 40, DR1, 300); this.state = 'idle'; this.st = 1.2; this.bm = false; ring(this.x, this.y, 26, 0, 200, 9, DB({ c: DR2 })); }
      this.st -= dt; const toP = angTo(this, player), rest = k => k * [0, 1, 0.75, 0.55][ph];
      for (const q of this.ph4) { q.t -= dt; if (q.t <= 0 && !q.done) { q.done = true; fan(q.x, q.y, angTo(q, player), 5 + ph, 0.8, 230, 8, DB({ c: DR3 })); } } this.ph4 = this.ph4.filter(q => q.t > -0.3);
      if (this.state === 'idle') {
        const d = dist(this, player); if (d > 210) toward(this, player.x, player.y, 40 + ph * 18, dt); else if (d < 140) toward(this, player.x, player.y, -50, dt);
        if (this.st <= 0) { const o = ['spiral', 'rain', 'nova', 'phantoms']; if (ph >= 2) o.push('tendrils', 'devour', 'orbs', 'spiral'); if (ph === 3) o.push('tear', 'tendrils', 'devour', 'tear'); let nx = pick(o); if (nx === this.last) nx = pick(o); this.last = nx; this.state = nx; this.n = 0; this.cy = rnd(0, TAU); this.ct = 0; this.st = 0.5;
          if (nx === 'spiral') this.st = 2.8; else if (nx === 'tear') this.st = 4.0; else if (nx === 'devour') { this.st = 0.95; dzone(this.x, this.y, 220, 0.95, 0.2); } else if (nx === 'tendrils') this.st = 0.6; else if (nx === 'phantoms') { for (let i = 0; i < 3 + ph; i++) { const p = arenaPt(rnd(0, TAU), ARENA.r - 40); this.ph4.push({ x: p.x, y: p.y, t: 1.0 + i * 0.15, done: false, life: 1 }); } this.st = 1.8; } }
      } else if (this.state === 'spiral') {
        this.ct -= dt; this.cy += dt * 2.0; if (this.ct <= 0) { this.ct = 0.09; const arms = ph + 1; for (let i = 0; i < arms; i++) ebul(this.x, this.y, this.cy + i * TAU / arms, 195, 8, DB({ c: i % 2 ? DR3 : DR1, life: 3.4 })); }
        if (this.st <= 0) { this.state = 'idle'; this.st = rest(1.5); }
      } else if (this.state === 'rain') {
        if (this.st <= 0) { const cnt = 8 + ph * 3; for (let i = 0; i < cnt; i++) { const p = arenaPt(rnd(0, TAU), rnd(0, ARENA.r - 50)); star(p.x, p.y, 0.9 + i * 0.1, 52); } star(player.x, player.y, 0.9, 52); star(player.x + rnd(-80, 80), player.y + rnd(-80, 80), 1.3, 52); this.state = 'idle'; this.st = rest(2.2); }
      } else if (this.state === 'nova') {
        if (this.st <= 0) { ring(this.x, this.y, 26, toP + this.n * 0.5, 150, 10, DB({ c: DR2 }), 5); this.n++; this.st = 0.55; blip(110, 0.2, 'triangle', 0.06); if (this.n >= 2 + ph) { this.state = 'idle'; this.st = rest(1.4); } }
      } else if (this.state === 'phantoms') {
        if (this.st <= 0) { this.state = 'idle'; this.st = rest(1.2); }
      } else if (this.state === 'tendrils') {
        if (this.st <= 0 && !this.bm) { const arms = ph === 3 ? 5 : 4, d = Math.random() < 0.5 ? 1 : -1, a0 = rnd(0, TAU); for (let i = 0; i < arms; i++) addBeam(this.x, this.y, a0 + i * TAU / arms, d * 0.75, 0.7, 3.2, 350); this.bm = true; this.st = 4.0; blip(200, 0.3, 'sawtooth', 0.06); }
        else if (this.bm && this.st <= 0) { this.bm = false; this.state = 'idle'; this.st = rest(1.3); } else if (this.bm) followBeams(this);
      } else if (this.state === 'devour') {
        if (this.st <= 0) { wave(this.x, this.y, 220, 460, { w: 30, c: DR2 }); if (ph === 3) wave(this.x, this.y, 220, 460, { w: 26, c: DR1, delay: 0.5 }); for (let i = 0; i < 6; i++) dpool(this.x + Math.cos(i * 1.047) * 165, this.y + Math.sin(i * 1.047) * 165, 36, 3.5); shake = 16; blip(55, 0.45, 'sawtooth', 0.1, 0.5); this.state = 'idle'; this.st = rest(1.5); }
      } else if (this.state === 'orbs') {
        if (this.st <= 0) { for (let i = 0; i < 6; i++) ebul(this.x, this.y, i * TAU / 6 + this.n * 0.5, 125, 10, DB({ c: DR4, home: 1.6, life: 5 })); this.n++; this.st = 0.8; if (this.n >= 2) { this.state = 'idle'; this.st = rest(1.6); } }
      } else if (this.state === 'tear') {
        toward(this, player.x, player.y, 60, dt); this.ct -= dt; this.cy += dt * 2.6; this.mt = (this.mt || 0) - dt;
        if (this.ct <= 0) { this.ct = 0.12; for (let i = 0; i < 2; i++) ebul(this.x, this.y, this.cy + i * Math.PI, 205, 8, DB({ c: i ? DR3 : DR1, life: 3 })); }
        if (this.mt <= 0) { this.mt = 0.45; star(player.x + rnd(-110, 110), player.y + rnd(-110, 110), 0.8, 52); }
        if (this.st <= 0) { this.state = 'idle'; this.st = rest(1.6); }
      }
      inArena(this);
    };
    b.draw = function () {
      const x = this.x, y = this.y + Math.sin(time * 2) * 5, f = this.flash > 0, p3 = this.ph === 3, a = angTo(this, player);
      for (const q of this.ph4) { const al = clamp(1 - Math.abs(q.t) * 0.9, 0.2, 0.9); ctx.globalAlpha = al * 0.7; ctx.fillStyle = DR3; ctx.beginPath(); ctx.arc(q.x, q.y, 22, 0, TAU); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(q.x - 6, q.y - 4, 3, 0, TAU); ctx.arc(q.x + 6, q.y - 4, 3, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; }
      ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(this.x, this.y + 70, 80, 16, 0, 0, TAU); ctx.fill();
      // void cloak with ragged hem
      ctx.fillStyle = f ? '#fff' : p3 ? '#2a0838' : '#14093a'; ctx.beginPath(); ctx.moveTo(x - 36, y - 20); ctx.quadraticCurveTo(x - 110, y + 20, x - 96, y + 72); for (let i = 0; i <= 12; i++) ctx.lineTo(x - 96 + i * 16, y + 72 + (i % 2 ? 16 : -4) + Math.sin(time * 3 + i) * 5); ctx.quadraticCurveTo(x + 110, y + 20, x + 36, y - 20); ctx.closePath(); ctx.fill();
      ctx.fillStyle = f ? '#fff' : p3 ? '#4a1258' : '#241468'; ctx.beginPath(); ctx.moveTo(x - 30, y - 10); ctx.quadraticCurveTo(x - 76, y + 24, x - 62, y + 66); ctx.lineTo(x + 62, y + 66); ctx.quadraticCurveTo(x + 76, y + 24, x + 30, y - 10); ctx.closePath(); ctx.fill();
      ctx.fillStyle = DR4; for (let i = 0; i < 14; i++) { ctx.globalAlpha = 0.4 + 0.5 * Math.abs(Math.sin(time * 2 + i)); ctx.beginPath(); ctx.arc(x + Math.sin(i * 3.1) * 56, y + 16 + (i * 29 % 70) - 10, 1.6, 0, TAU); ctx.fill(); } ctx.globalAlpha = 1;
      // floating hands
      for (let i = 0; i < 4; i++) { const hx = x + (i < 2 ? -1 : 1) * (96 + (i % 2) * 22), hy = y + 6 + (i % 2) * 40 + Math.sin(time * 2 + i * 1.7) * 8, s = i < 2 ? -1 : 1; ctx.fillStyle = f ? '#fff' : '#efe2ff'; ctx.beginPath(); ctx.ellipse(hx, hy, 13, 11, 0, 0, TAU); ctx.fill(); ctx.strokeStyle = f ? '#fff' : '#efe2ff'; ctx.lineWidth = 4; ctx.lineCap = 'round'; for (let k = -2; k <= 1; k++) { ctx.beginPath(); ctx.moveTo(hx + s * 6, hy + k * 4.5 + 2); ctx.lineTo(hx + s * 22, hy + k * 6 + Math.sin(time * 3 + k + i) * 3); ctx.stroke(); } }
      // crown of star spikes
      ctx.fillStyle = p3 ? '#ff9dd2' : DR4; for (let i = -3; i <= 3; i++) { const hh = 34 - Math.abs(i) * 6; ctx.beginPath(); ctx.moveTo(x + i * 13 - 6, y - 52); ctx.lineTo(x + i * 13, y - 52 - hh + Math.sin(time * 4 + i) * 2); ctx.lineTo(x + i * 13 + 6, y - 52); ctx.fill(); }
      // mask
      ctx.fillStyle = f ? '#fff' : '#f4eaff'; ctx.beginPath(); ctx.ellipse(x, y - 14, 46, 56, 0, 0, TAU); ctx.fill(); ctx.fillStyle = f ? '#fff' : '#d9c8f5'; ctx.beginPath(); ctx.ellipse(x + 10, y - 8, 34, 48, 0.1, 0, TAU); ctx.fill(); ctx.fillStyle = f ? '#fff' : '#f4eaff'; ctx.beginPath(); ctx.ellipse(x - 3, y - 16, 40, 50, 0, 0, TAU); ctx.fill();
      for (const s of [-1, 1]) { ctx.fillStyle = '#0a0420'; ctx.beginPath(); ctx.ellipse(x + s * 18, y - 24, 11, 15, s * 0.25, 0, TAU); ctx.fill(); ctx.fillStyle = p3 ? '#ff3d8a' : DR3; ctx.beginPath(); ctx.arc(x + s * 18 + Math.cos(a) * 4, y - 24 + Math.sin(a) * 6, 5.5, 0, TAU); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x + s * 18 + Math.cos(a) * 4 - 1.5, y - 25 + Math.sin(a) * 6, 1.6, 0, TAU); ctx.fill(); }
      ctx.fillStyle = p3 ? '#ff9dd2' : DR2; ctx.beginPath(); for (let i = 0; i < 8; i++) { const r = i % 2 ? 4 : 9, ang = i * Math.PI / 4 - Math.PI / 2; ctx.lineTo(x + Math.cos(ang) * r, y - 48 + Math.sin(ang) * r); } ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#0a0420'; ctx.beginPath(); ctx.moveTo(x - 26, y + 8); ctx.quadraticCurveTo(x, y + 44 + Math.sin(time * 3) * 3, x + 26, y + 8); ctx.quadraticCurveTo(x, y + 18, x - 26, y + 8); ctx.fill(); ctx.fillStyle = '#fdf6ff'; for (let i = -3; i <= 3; i++) { const tx = x + i * 7; ctx.beginPath(); ctx.moveTo(tx - 3, y + 12 + Math.abs(i) * 1.2); ctx.lineTo(tx, y + 22 + Math.abs(i) * 0.8 - 2); ctx.lineTo(tx + 3, y + 12 + Math.abs(i) * 1.2); ctx.fill(); }
      if (p3) { ctx.strokeStyle = '#ff3d8a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x - 6, y - 70); ctx.lineTo(x - 14, y - 40); ctx.lineTo(x - 4, y - 22); ctx.lineTo(x - 18, y + 4); ctx.moveTo(x + 22, y - 62); ctx.lineTo(x + 12, y - 34); ctx.lineTo(x + 26, y - 14); ctx.stroke(); }
      for (let i = 0; i < 3; i++) { const o = time * 1.4 + i * TAU / 3; ctx.fillStyle = DR4; ctx.beginPath(); ctx.arc(x + Math.cos(o) * 120, y + 10 + Math.sin(o) * 50, 7, 0, TAU); ctx.fill(); }
    };
    return b;
  }

  // ------------------------------------------------------------------ shadow realm bosses (bosses 21-25)
  const SH1 = '#d0d4ff', SH2 = '#ff2d55', SH3 = '#8a8aff', SH4 = '#2a2a3a';
  const spool = (x, y, r, dur) => hazards.push({ k: 'fire', shadow: true, x, y, r, t: 0, dur });
  const sglob = (x, y, delay, r) => zone(x, y, r || 54, delay, 0.15, { c: SH2, tc: 'rgba(255,45,85,.15)', onEnd: z => { spool(z.x, z.y, (r || 54) * 0.75, 3); shake = 4; } });
  const szone = (x, y, r, delay, dur) => zone(x, y, r, delay, dur, { c: SH2, tc: 'rgba(255,45,85,.15)' });
  const SB = o => Object.assign({ c: SH2 }, o);
  const shadowEyes = (x, y, s, col) => { ctx.fillStyle = col || SH2; ctx.beginPath(); ctx.ellipse(x - s, y, s * 0.55, s * 0.28, -0.3, 0, TAU); ctx.ellipse(x + s, y, s * 0.55, s * 0.28, 0.3, 0, TAU); ctx.fill(); };

  function mkStalker() {
    const b = base('SHADE STALKER', 400, 30); b.ang = 0; b.cl = []; b.ca = 0;
    b.update = function (dt) {
      const ph = this.hp / this.max < 0.5 ? 2 : 1; if (ph !== this.ph) { this.ph = ph; toastMsg('The stalker splits into the shadows!'); shake = 12; ring(this.x, this.y, 20, 0, 190, 8, SB()); }
      this.st -= dt; this.ang += dt; const toP = angTo(this, player);
      for (const q of this.cl) { q.t -= dt; if (q.t <= 0 && !q.done) { q.done = true; fan(q.x, q.y, angTo(q, player), 5 + ph, 0.8, 230, 8, SB({ c: SH3 })); } } this.cl = this.cl.filter(q => q.t > -0.3);
      if (this.state === 'idle') {
        toward(this, player.x + Math.cos(this.ang * 1.1) * 220, player.y + Math.sin(this.ang * 1.1) * 220, 130 + ph * 35, dt);
        if (this.st <= 0) { const o = ['daggers', 'ambush', 'clones', 'dash']; if (ph === 2) o.push('ambush', 'clones', 'dash'); this.state = pick(o); this.n = 0; this.st = 0.5; if (this.state === 'dash') { this.st = 0.7; this.ca = toP; } if (this.state === 'clones') { for (let i = 0; i < 2 + ph; i++) { const a = rnd(0, TAU); this.cl.push({ x: ARENA.x + Math.cos(a) * 200, y: ARENA.y + Math.sin(a) * 200, t: 1.0 + i * 0.2, done: false }); } this.st = 1.8; } }
      } else if (this.state === 'daggers') {
        if (this.st <= 0) { fan(this.x, this.y, toP, ph === 2 ? 7 : 5, 1.0, 235, 7, SB({ c: SH1 })); ebul(this.x, this.y, toP + 0.4 * (this.n % 2 ? 1 : -1), 170, 9, SB({ home: 1.4, life: 4 })); blip(520, 0.08, 'square', 0.04); this.n++; this.st = 0.45; if (this.n >= (ph === 2 ? 5 : 4)) { this.state = 'idle'; this.st = 1.1; } }
      } else if (this.state === 'ambush') {
        if (this.st <= 0 && this.n === 0) { burst(this.x, this.y, 14, SH3, 180); const a = toP + Math.PI + rnd(-0.6, 0.6); this.x = player.x + Math.cos(a) * 130; this.y = player.y + Math.sin(a) * 130; inArena(this); burst(this.x, this.y, 14, SH3, 180); szone(this.x, this.y, 115, 0.7, 0.2); this.n = 1; this.st = 0.7; }
        else if (this.n === 1 && this.st <= 0) { ring(this.x, this.y, 14, rnd(0, 1), 190, 8, SB()); fan(this.x, this.y, angTo(this, player), 9, 1.6, 230, 8, SB({ c: SH1 })); shake = 8; this.state = 'idle'; this.st = 1.2; }
      } else if (this.state === 'dash') {
        if (this.st > 0) this.ca = toP; else { this.x += Math.cos(this.ca) * 620 * dt; this.y += Math.sin(this.ca) * 620 * dt; this.pt = (this.pt || 0) + dt; if (this.pt > 0.09) { this.pt = 0; spool(this.x, this.y, 20, 2.4); } if (this.st < -0.55 || inArena(this)) { this.state = 'idle'; this.st = 1.1; fan(this.x, this.y, angTo(this, player), 7, 1.2, 220, 8, SB()); } }
      } else if (this.state === 'clones') { if (this.st <= 0) { this.state = 'idle'; this.st = 0.8; } }
      inArena(this);
    };
    b.draw = function () {
      const x = this.x, y = this.y + Math.sin(time * 3) * 3, f = this.flash > 0;
      for (const q of this.cl) { ctx.globalAlpha = clamp(1 - Math.abs(q.t) * 0.8, 0.2, 0.8); ctx.fillStyle = SH4; ctx.beginPath(); ctx.arc(q.x, q.y, 20, 0, TAU); ctx.fill(); shadowEyes(q.x, q.y - 2, 6); ctx.globalAlpha = 1; }
      if (this.state === 'dash' && this.st > 0) { ctx.strokeStyle = 'rgba(255,45,85,.4)'; ctx.lineWidth = 26; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(this.ca) * 520, y + Math.sin(this.ca) * 520); ctx.stroke(); }
      ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(this.x, this.y + 40, 24, 7, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = f ? '#fff' : '#0c0c14'; ctx.beginPath(); ctx.moveTo(x, y - 30); ctx.quadraticCurveTo(x + 32, y - 6, x + 26, y + 38); for (let i = 0; i < 5; i++) ctx.lineTo(x + 22 - i * 11, y + 38 + (i % 2 ? 8 : -2) + Math.sin(time * 6 + i) * 3); ctx.quadraticCurveTo(x - 32, y - 6, x, y - 30); ctx.fill();
      ctx.fillStyle = f ? '#fff' : '#1a1a2a'; ctx.beginPath(); ctx.ellipse(x, y - 16, 16, 18, 0, 0, TAU); ctx.fill(); shadowEyes(x, y - 16, 6);
      ctx.strokeStyle = SH1; ctx.lineWidth = 3; ctx.lineCap = 'round'; for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(x + s * 24, y + 6); ctx.lineTo(x + s * 44, y - 10 + Math.sin(time * 5 + s) * 4); ctx.stroke(); }
    };
    return b;
  }

  function mkKnight() {
    const b = base('UMBRAL KNIGHT', 450, 40); b.face = Math.PI / 2; b.ca = 0;
    b.update = function (dt) {
      const ph = this.hp / this.max < 0.5 ? 2 : 1; if (ph !== this.ph) { this.ph = ph; toastMsg('The knight\'s armor cracks - red light pours out!'); shake = 12; ring(this.x, this.y, 20, 0, 190, 8, SB()); }
      this.st -= dt; const toP = angTo(this, player);
      if (this.state !== 'charge' && this.state !== 'whirl') this.face += clamp(angDiff(toP, this.face), -2.8 * dt, 2.8 * dt);
      if (this.state === 'idle') {
        if (dist(this, player) > 120) toward(this, player.x, player.y, 100 + ph * 30, dt);
        if (this.st <= 0) { const o = ['slash', 'charge', 'bash', 'sweep', 'blades']; if (ph === 2) o.push('whirl', 'charge', 'blades'); this.state = pick(o); this.n = 0; this.st = 0.5;
          if (this.state === 'slash') { this.st = 0.85; this.sx = this.x + Math.cos(this.face) * 100; this.sy = this.y + Math.sin(this.face) * 100; szone(this.sx, this.sy, 125, 0.85, 0.2); }
          else if (this.state === 'charge') { this.st = 0.8; this.ca = toP; } else if (this.state === 'bash') { this.st = 0.9; szone(this.x, this.y, 170, 0.9, 0.2); } else if (this.state === 'sweep') this.st = 0.6; else if (this.state === 'whirl') this.st = 2.6; }
      } else if (this.state === 'slash') {
        if (this.st <= 0) { wave(this.sx, this.sy, 200, 330, { w: 24, c: SH1 }); fan(this.sx, this.sy, this.face, 7, 1.2, 220, 8, SB()); shake = 10; this.state = 'idle'; this.st = 1.1; }
      } else if (this.state === 'charge') {
        if (this.st > 0) { this.ca = toP; this.face = this.ca; } else { this.face = this.ca; this.x += Math.cos(this.ca) * 580 * dt; this.y += Math.sin(this.ca) * 580 * dt; if (this.st < -0.6 || inArena(this)) { wave(this.x, this.y, 200, 400, { w: 26, c: SH2 }); ring(this.x, this.y, 12, 0, 180, 8, SB()); shake = 12; this.n++; if (this.n < (ph === 2 ? 2 : 1)) { this.st = 0.6; } else { this.state = 'idle'; this.st = 1.3; } } }
      } else if (this.state === 'bash') {
        if (this.st <= 0) { wave(this.x, this.y, 220, 440, { w: 28, c: SH1 }); if (ph === 2) wave(this.x, this.y, 220, 440, { w: 24, c: SH2, delay: 0.45 }); shake = 12; this.state = 'idle'; this.st = 1.2; }
      } else if (this.state === 'sweep') {
        if (this.st <= 0 && !this.bm) { const d = Math.random() < 0.5 ? 1 : -1, a0 = this.face - d * 0.9, arms = ph === 2 ? 2 : 1; for (let i = 0; i < arms; i++) addBeam(this.x, this.y, a0 + i * Math.PI, d * 1.05, 0.6, 2.2, 360); this.bm = true; this.st = 3.0; }
        else if (this.bm && this.st <= 0) { this.bm = false; this.state = 'idle'; this.st = 1.2; } else if (this.bm) followBeams(this);
      } else if (this.state === 'blades') {
        if (this.st <= 0) { const a = toP; for (let i = 1; i <= 7; i++) sglob(this.x + Math.cos(a) * i * 80, this.y + Math.sin(a) * i * 80, 0.5 + i * 0.12, 46); if (ph === 2) for (const k of [-0.5, 0.5]) for (let i = 2; i <= 6; i += 2) sglob(this.x + Math.cos(a + k) * i * 80, this.y + Math.sin(a + k) * i * 80, 0.8 + i * 0.1, 44); this.state = 'idle'; this.st = 2.0; }
      } else if (this.state === 'whirl') {
        this.face += dt * 7; this.n -= dt; toward(this, player.x, player.y, 55, dt); if (this.n <= 0) { this.n = 0.1; for (let i = 0; i < 2; i++) ebul(this.x, this.y, this.face + i * Math.PI, 200, 7, SB({ c: SH1, life: 3 })); }
        if (this.st <= 0) { this.state = 'idle'; this.st = 1.4; }
      }
      inArena(this);
    };
    b.draw = function () {
      const x = this.x, y = this.y, f = this.flash > 0;
      if (this.state === 'charge' && this.st > 0) { ctx.strokeStyle = 'rgba(255,45,85,.4)'; ctx.lineWidth = 40; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(this.ca) * 540, y + Math.sin(this.ca) * 540); ctx.stroke(); }
      ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(x, y + 40, 50, 13, 0, 0, TAU); ctx.fill();
      ctx.save(); ctx.translate(x, y); ctx.rotate(this.face); ctx.lineCap = 'round';
      ctx.strokeStyle = f ? '#fff' : '#9a9ac0'; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(10, 26); ctx.lineTo(84, 26); ctx.stroke(); ctx.strokeStyle = SH2; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(18, 26); ctx.lineTo(82, 26); ctx.stroke(); ctx.fillStyle = '#4a4a62'; ctx.fillRect(8, 16, 6, 20);
      ctx.fillStyle = f ? '#fff' : '#1c1c2c'; ctx.beginPath(); ctx.ellipse(0, 0, 36, 32, 0, 0, TAU); ctx.fill(); ctx.fillStyle = f ? '#fff' : '#2e2e46'; ctx.beginPath(); ctx.ellipse(2, 0, 30, 26, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = f ? '#fff' : '#3a3a58'; ctx.beginPath(); ctx.ellipse(18, -26, 20, 14, 0.4, 0, TAU); ctx.fill(); ctx.fillStyle = '#10101a'; ctx.beginPath(); ctx.arc(18, -26, 9, 0, TAU); ctx.fill();
      ctx.fillStyle = f ? '#fff' : '#3a3a58'; ctx.beginPath(); ctx.arc(2, 0, 20, 0, TAU); ctx.fill(); ctx.fillStyle = '#0a0a12'; ctx.fillRect(6, -3, 14, 6); ctx.fillStyle = SH2; ctx.fillRect(10, -1.5, 8, 3);
      ctx.fillStyle = SH2; ctx.beginPath(); ctx.moveTo(-6, -4); ctx.lineTo(-26, -10 + Math.sin(time * 6) * 3); ctx.lineTo(-6, 6); ctx.fill();
      if (this.ph === 2) { ctx.strokeStyle = SH2; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-10, -20); ctx.lineTo(-4, -4); ctx.lineTo(-14, 10); ctx.stroke(); }
      ctx.restore();
    };
    return b;
  }

  function mkReaper() {
    const b = base('NIGHT REAPER', 480, 34); b.ang = 0;
    b.update = function (dt) {
      const ph = this.hp / this.max < 0.5 ? 2 : 1; if (ph !== this.ph) { this.ph = ph; toastMsg('The Reaper begins the harvest!'); shake = 12; ring(this.x, this.y, 22, 0, 190, 8, SB()); }
      this.st -= dt; this.ang += dt; const toP = angTo(this, player);
      if (this.state === 'idle') {
        toward(this, ARENA.x + Math.cos(this.ang * 0.7) * 200, ARENA.y + Math.sin(this.ang * 0.7) * 160, 100 + ph * 25, dt);
        if (this.st <= 0) { const o = ['scythe', 'souls', 'harvest', 'blink', 'wail']; if (ph === 2) o.push('scythe', 'harvest', 'souls'); this.state = pick(o); this.n = 0; this.st = 0.5; if (this.state === 'scythe') this.st = 0.6; }
      } else if (this.state === 'scythe') {
        if (this.st <= 0 && !this.bm) { const d = Math.random() < 0.5 ? 1 : -1, a0 = rnd(0, TAU), arms = ph === 2 ? 3 : 2; for (let i = 0; i < arms; i++) addBeam(this.x, this.y, a0 + i * TAU / arms, d * 0.85, 0.7, 3.0, 340); this.bm = true; this.st = 3.8; blip(200, 0.3, 'sawtooth', 0.06); }
        else if (this.bm && this.st <= 0) { this.bm = false; this.state = 'idle'; this.st = 1.2; } else if (this.bm) followBeams(this);
      } else if (this.state === 'souls') {
        if (this.st <= 0) { const k = ph === 2 ? 6 : 4; for (let i = 0; i < k; i++) ebul(this.x, this.y, toP + (i - (k - 1) / 2) * 0.5, 130, 10, SB({ c: SH1, home: 1.6, life: 5 })); this.n++; this.st = 0.9; if (this.n >= 2) { this.state = 'idle'; this.st = 1.4; } }
      } else if (this.state === 'harvest') {
        if (this.st <= 0) { const k = ph === 2 ? 8 : 6; for (let i = 0; i < k; i++) { const a = i * TAU / k + rnd(0, 0.4); sglob(player.x + Math.cos(a) * 135, player.y + Math.sin(a) * 135, 0.8 + i * 0.14, 54); } sglob(player.x, player.y, 0.8 + k * 0.14, 58); this.state = 'idle'; this.st = 2.0; }
      } else if (this.state === 'blink') {
        if (this.st <= 0) { burst(this.x, this.y, 14, SH3, 180); const a = rnd(0, TAU); this.x = ARENA.x + Math.cos(a) * 190; this.y = ARENA.y + Math.sin(a) * 190; burst(this.x, this.y, 14, SH3, 180); ring(this.x, this.y, ph === 2 ? 20 : 14, rnd(0, 1), 190, 8, SB()); szone(this.x, this.y, 100, 0.7, 0.2); this.n++; if (this.n < (ph === 2 ? 2 : 1)) this.st = 0.6; else { this.state = 'idle'; this.st = 1.1; } }
      } else if (this.state === 'wail') {
        if (this.st <= 0) { ring(this.x, this.y, 22, toP + this.n * 0.45, 150, 9, SB({ c: SH3 }), 5); this.n++; this.st = 0.5; if (this.n >= (ph === 2 ? 4 : 3)) { this.state = 'idle'; this.st = 1.3; } }
      }
      inArena(this);
    };
    b.draw = function () {
      const x = this.x, y = this.y + Math.sin(time * 2.4) * 5, f = this.flash > 0;
      ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(this.x, this.y + 48, 26, 7, 0, 0, TAU); ctx.fill();
      const sa = -0.5 + Math.sin(time * 1.5) * 0.08; ctx.save(); ctx.translate(x + 40, y); ctx.rotate(sa); ctx.strokeStyle = '#5a4a3a'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(0, 50); ctx.lineTo(0, -52); ctx.stroke(); ctx.fillStyle = f ? '#fff' : SH1; ctx.beginPath(); ctx.moveTo(0, -52); ctx.quadraticCurveTo(-40, -62, -52, -28); ctx.quadraticCurveTo(-30, -48, 0, -42); ctx.fill(); ctx.restore();
      ctx.fillStyle = f ? '#fff' : '#0a0a12'; ctx.beginPath(); ctx.moveTo(x, y - 32); ctx.quadraticCurveTo(x + 38, y - 4, x + 30, y + 46); for (let i = 0; i < 6; i++) ctx.lineTo(x + 26 - i * 10, y + 46 + (i % 2 ? 10 : -4) + Math.sin(time * 5 + i) * 3); ctx.quadraticCurveTo(x - 38, y - 4, x, y - 32); ctx.fill();
      ctx.fillStyle = f ? '#fff' : '#161622'; ctx.beginPath(); ctx.ellipse(x, y - 18, 17, 19, 0, 0, TAU); ctx.fill(); ctx.fillStyle = '#e8e8f4'; ctx.beginPath(); ctx.ellipse(x, y - 16, 10, 12, 0, 0, TAU); ctx.fill(); shadowEyes(x, y - 18, 4);
      ctx.fillStyle = '#0a0a12'; ctx.fillRect(x - 5, y - 8, 10, 4); ctx.fillStyle = '#e8e8f4'; for (let i = -2; i <= 2; i++) ctx.fillRect(x + i * 2 - 0.5, y - 8, 1, 4);
    };
    return b;
  }

  function mkBlackSun() {
    const b = base('BLACK SUN', 520, 50); b.cy = 0; b.ct = 0; b.rot = 0;
    b.update = function (dt) {
      const ph = this.hp / this.max < 0.5 ? 2 : 1; if (ph !== this.ph) { this.ph = ph; toastMsg('The sun goes totally dark!'); shake = 14; ring(this.x, this.y, 24, 0, 190, 8, SB()); }
      this.st -= dt; this.rot += dt * 0.6; const toP = angTo(this, player);
      if (this.state === 'idle') {
        const d = dist(this, player); if (d > 230) toward(this, player.x, player.y, 45 + ph * 15, dt); else if (d < 150) toward(this, player.x, player.y, -50, dt);
        if (this.st <= 0) { const o = ['pulse', 'flare', 'collapse', 'corona', 'orbs']; if (ph === 2) o.push('eclipse', 'collapse', 'flare'); this.state = pick(o); this.n = 0; this.cy = rnd(0, TAU); this.ct = 0; this.st = 0.5; if (this.state === 'corona') this.st = 2.8; else if (this.state === 'flare') this.st = 0.6; else if (this.state === 'collapse') { this.st = 1.2; this.cx = player.x; this.cz = player.y; szone(this.cx, this.cz, 150, 1.2, 0.2); } }
      } else if (this.state === 'pulse') {
        if (this.st <= 0) { ring(this.x, this.y, 22, this.n * 0.3, 150 + this.n * 20, 9, SB({ c: this.n % 2 ? SH3 : SH2 }), 4); this.n++; this.st = 0.5; blip(100, 0.2, 'triangle', 0.06); if (this.n >= (ph === 2 ? 5 : 4)) { this.state = 'idle'; this.st = 1.3; } }
      } else if (this.state === 'flare') {
        if (this.st <= 0 && !this.bm) { const d = Math.random() < 0.5 ? 1 : -1, a0 = rnd(0, TAU), arms = ph === 2 ? 5 : 4; for (let i = 0; i < arms; i++) addBeam(this.x, this.y, a0 + i * TAU / arms, d * 0.7, 0.7, 3.0, 340); this.bm = true; this.st = 3.8; blip(200, 0.3, 'sawtooth', 0.06); }
        else if (this.bm && this.st <= 0) { this.bm = false; this.state = 'idle'; this.st = 1.3; } else if (this.bm) followBeams(this);
      } else if (this.state === 'collapse') {
        if (this.st <= 0) { wave(this.cx, this.cz, 160, 400, { w: 26, c: SH1 }); ring(this.cx, this.cz, 14, 0, 170, 8, SB()); for (let i = 0; i < 4; i++) spool(this.cx + Math.cos(i * 1.57) * 100, this.cz + Math.sin(i * 1.57) * 100, 32, 3); shake = 12; this.state = 'idle'; this.st = 1.4; }
      } else if (this.state === 'corona') {
        this.ct -= dt; this.cy += dt * 1.9; if (this.ct <= 0) { this.ct = 0.1; const arms = ph === 2 ? 4 : 3; for (let i = 0; i < arms; i++) ebul(this.x, this.y, this.cy + i * TAU / arms, 190, 8, SB({ c: i % 2 ? SH3 : SH2, life: 3.4 })); }
        if (this.st <= 0) { this.state = 'idle'; this.st = 1.4; }
      } else if (this.state === 'orbs') {
        if (this.st <= 0) { for (let i = 0; i < 6; i++) ebul(this.x, this.y, i * TAU / 6 + this.n * 0.5, 125, 10, SB({ c: SH1, home: 1.5, life: 5 })); this.n++; this.st = 0.8; if (this.n >= 2) { this.state = 'idle'; this.st = 1.5; } }
      } else if (this.state === 'eclipse') {
        if (this.st <= 0) { ring(this.x, this.y, 30, toP + this.n * 0.5, 140, 10, SB({ c: SH2 }), 6); wave(this.x, this.y, 200, 430, { w: 24, c: SH1, delay: 0.3 }); this.n++; this.st = 0.7; if (this.n >= 3) { this.state = 'idle'; this.st = 1.5; } }
      }
      inArena(this);
    };
    b.draw = function () {
      const x = this.x, y = this.y + Math.sin(time * 1.8) * 4, f = this.flash > 0;
      ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(this.x, this.y + 62, 62, 14, 0, 0, TAU); ctx.fill();
      for (let i = 0; i < 16; i++) { const a = this.rot + i * TAU / 16, l = 22 + (i % 2) * 14 + Math.sin(time * 4 + i) * 4; ctx.fillStyle = i % 2 ? SH2 : SH1; ctx.beginPath(); ctx.moveTo(x + Math.cos(a - 0.1) * 54, y + Math.sin(a - 0.1) * 54); ctx.lineTo(x + Math.cos(a) * (54 + l), y + Math.sin(a) * (54 + l)); ctx.lineTo(x + Math.cos(a + 0.1) * 54, y + Math.sin(a + 0.1) * 54); ctx.fill(); }
      ctx.fillStyle = f ? '#fff' : SH2; ctx.beginPath(); ctx.arc(x, y, 56, 0, TAU); ctx.fill(); ctx.fillStyle = f ? '#fff' : SH1; ctx.beginPath(); ctx.arc(x, y, 52, 0, TAU); ctx.fill(); ctx.fillStyle = f ? '#fff' : '#050508'; ctx.beginPath(); ctx.arc(x, y, 47, 0, TAU); ctx.fill();
      const a = angTo(this, player); ctx.fillStyle = '#14141e'; ctx.beginPath(); ctx.arc(x - 8, y - 8, 36, 0, TAU); ctx.fill(); ctx.fillStyle = SH2; ctx.beginPath(); ctx.ellipse(x, y, 20, 12, 0, 0, TAU); ctx.fill(); ctx.fillStyle = '#050508'; ctx.beginPath(); ctx.ellipse(x + Math.cos(a) * 5, y + Math.sin(a) * 3, 6, 10, 0, 0, TAU); ctx.fill();
    };
    return b;
  }

  function mkShadowKing() {
    const b = base('THE SHADOW KING', 1400, 54); b.cy = 0; b.ct = 0; b.cl = [];
    b.update = function (dt) {
      const f = this.hp / this.max, ph = f > 0.66 ? 1 : f > 0.33 ? 2 : 3;
      if (ph !== this.ph) { this.ph = ph; toastMsg(ph === 2 ? 'The Shadow King rises from his throne of darkness!' : 'THE VOID CONSUMES ALL! The Shadow King unleashes everything!', 2.4); shake = 20; hazards.length = 0; eBul.length = 0; burst(this.x, this.y, 40, SH2, 300); this.state = 'idle'; this.st = 1.2; this.bm = false; ring(this.x, this.y, 26, 0, 200, 9, SB()); }
      this.st -= dt; const toP = angTo(this, player), rest = k => k * [0, 1, 0.75, 0.55][ph];
      for (const q of this.cl) { q.t -= dt; if (q.t <= 0 && !q.done) { q.done = true; fan(q.x, q.y, angTo(q, player), 5 + ph, 0.8, 235, 8, SB({ c: SH3 })); } } this.cl = this.cl.filter(q => q.t > -0.3);
      if (this.state === 'idle') {
        const d = dist(this, player); if (d > 210) toward(this, player.x, player.y, 40 + ph * 18, dt); else if (d < 140) toward(this, player.x, player.y, -50, dt);
        if (this.st <= 0) { const o = ['spiral', 'legion', 'abyss', 'decree']; if (ph >= 2) o.push('rift', 'crush', 'blades', 'spiral'); if (ph === 3) o.push('oblivion', 'rift', 'crush', 'oblivion'); let nx = pick(o); if (nx === this.last) nx = pick(o); this.last = nx; this.state = nx; this.n = 0; this.cy = rnd(0, TAU); this.ct = 0; this.st = 0.5;
          if (nx === 'spiral') this.st = 2.8; else if (nx === 'oblivion') this.st = 4.2; else if (nx === 'crush') { this.st = 0.95; szone(this.x, this.y, 225, 0.95, 0.2); } else if (nx === 'rift') this.st = 0.6;
          else if (nx === 'legion') { for (let i = 0; i < 3 + ph; i++) { const a = rnd(0, TAU); this.cl.push({ x: ARENA.x + Math.cos(a) * (ARENA.r - 40), y: ARENA.y + Math.sin(a) * (ARENA.r - 40), t: 1.0 + i * 0.15, done: false }); } this.st = 1.8; } }
      } else if (this.state === 'spiral') {
        this.ct -= dt; this.cy += dt * 2.0; if (this.ct <= 0) { this.ct = 0.09; const arms = ph + 1; for (let i = 0; i < arms; i++) ebul(this.x, this.y, this.cy + i * TAU / arms, 195, 8, SB({ c: i % 2 ? SH3 : SH2, life: 3.4 })); }
        if (this.st <= 0) { this.state = 'idle'; this.st = rest(1.5); }
      } else if (this.state === 'legion') { if (this.st <= 0) { this.state = 'idle'; this.st = rest(1.2); }
      } else if (this.state === 'abyss') {
        if (this.st <= 0) { const cnt = 8 + ph * 3; for (let i = 0; i < cnt; i++) { const a = rnd(0, TAU), d = rnd(0, ARENA.r - 50); sglob(ARENA.x + Math.cos(a) * d, ARENA.y + Math.sin(a) * d, 0.9 + i * 0.1, 52); } sglob(player.x, player.y, 0.9, 52); sglob(player.x + rnd(-80, 80), player.y + rnd(-80, 80), 1.3, 52); this.state = 'idle'; this.st = rest(2.2); }
      } else if (this.state === 'decree') {
        if (this.st <= 0) { ring(this.x, this.y, 26, toP + this.n * 0.5, 150, 10, SB({ c: this.n % 2 ? SH3 : SH2 }), 5); this.n++; this.st = 0.55; blip(110, 0.2, 'triangle', 0.06); if (this.n >= 2 + ph) { this.state = 'idle'; this.st = rest(1.4); } }
      } else if (this.state === 'rift') {
        if (this.st <= 0 && !this.bm) { const arms = ph === 3 ? 5 : 4, d = Math.random() < 0.5 ? 1 : -1, a0 = rnd(0, TAU); for (let i = 0; i < arms; i++) addBeam(this.x, this.y, a0 + i * TAU / arms, d * 0.75, 0.7, 3.2, 350); this.bm = true; this.st = 4.0; blip(200, 0.3, 'sawtooth', 0.06); }
        else if (this.bm && this.st <= 0) { this.bm = false; this.state = 'idle'; this.st = rest(1.3); } else if (this.bm) followBeams(this);
      } else if (this.state === 'crush') {
        if (this.st <= 0) { wave(this.x, this.y, 225, 460, { w: 30, c: SH1 }); if (ph === 3) wave(this.x, this.y, 225, 460, { w: 26, c: SH2, delay: 0.5 }); for (let i = 0; i < 6; i++) spool(this.x + Math.cos(i * 1.047) * 165, this.y + Math.sin(i * 1.047) * 165, 36, 3.5); shake = 16; blip(55, 0.45, 'sawtooth', 0.1, 0.5); this.state = 'idle'; this.st = rest(1.5); }
      } else if (this.state === 'blades') {
        if (this.st <= 0) { for (const k of [0, 2.094, -2.094]) for (let i = 1; i <= 6; i++) sglob(this.x + Math.cos(toP + k) * i * 80, this.y + Math.sin(toP + k) * i * 80, 0.6 + i * 0.13, 46); this.state = 'idle'; this.st = rest(2.2); }
      } else if (this.state === 'oblivion') {
        toward(this, player.x, player.y, 55, dt); this.ct -= dt; this.cy += dt * 2.6; this.mt = (this.mt || 0) - dt;
        if (this.ct <= 0) { this.ct = 0.12; for (let i = 0; i < 2; i++) ebul(this.x, this.y, this.cy + i * Math.PI, 205, 8, SB({ c: i ? SH3 : SH2, life: 3 })); }
        if (this.mt <= 0) { this.mt = 0.45; sglob(player.x + rnd(-110, 110), player.y + rnd(-110, 110), 0.8, 52); }
        if (this.st <= 0) { this.state = 'idle'; this.st = rest(1.6); }
      }
      inArena(this);
    };
    b.draw = function () {
      const x = this.x, y = this.y + Math.sin(time * 2) * 5, f = this.flash > 0, p3 = this.ph === 3, hot = p3 ? '#ff2d55' : '#8a8aff';
      for (const q of this.cl) { ctx.globalAlpha = clamp(1 - Math.abs(q.t) * 0.8, 0.2, 0.8); ctx.fillStyle = SH4; ctx.beginPath(); ctx.arc(q.x, q.y, 24, 0, TAU); ctx.fill(); shadowEyes(q.x, q.y - 2, 7); ctx.globalAlpha = 1; }
      ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(this.x, this.y + 74, 80, 16, 0, 0, TAU); ctx.fill();
      // writhing mass of shadow tendrils
      ctx.lineCap = 'round'; for (let i = 0; i < 11; i++) { const bx = x - 70 + i * 14, w = Math.sin(time * 2.2 + i * 0.9) * 16, len = 78 + (i % 3) * 14; ctx.strokeStyle = f ? '#fff' : '#07070d'; ctx.lineWidth = 22; ctx.beginPath(); ctx.moveTo(bx, y); ctx.quadraticCurveTo(bx + w, y + len * 0.6, bx - w * 0.6 + (i - 5) * 5, y + len); ctx.stroke(); ctx.strokeStyle = f ? '#fff' : '#161626'; ctx.lineWidth = 9; ctx.stroke(); }
      ctx.fillStyle = f ? '#fff' : '#07070d'; ctx.beginPath(); ctx.ellipse(x, y, 74, 60, 0, 0, TAU); ctx.fill(); ctx.fillStyle = f ? '#fff' : '#12121e'; ctx.beginPath(); ctx.ellipse(x - 4, y - 4, 62, 48, 0, 0, TAU); ctx.fill();
      // cracked glowing core
      const pulse = 0.8 + Math.sin(time * 5) * 0.2; ctx.fillStyle = p3 ? 'rgba(255,45,85,.35)' : 'rgba(138,138,255,.3)'; ctx.beginPath(); ctx.arc(x, y + 12, 30 * pulse + 8, 0, TAU); ctx.fill(); ctx.fillStyle = f ? '#fff' : hot; ctx.beginPath(); ctx.arc(x, y + 12, 17 * pulse, 0, TAU); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x - 3, y + 8, 5 * pulse, 0, TAU); ctx.fill();
      ctx.strokeStyle = hot; ctx.lineWidth = 2; for (let i = 0; i < 6; i++) { const a = i * 1.05 + 0.3; ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * 20, y + 12 + Math.sin(a) * 20); ctx.lineTo(x + Math.cos(a + 0.2) * 34, y + 12 + Math.sin(a + 0.2) * 34); ctx.lineTo(x + Math.cos(a - 0.1) * 48, y + 12 + Math.sin(a - 0.1) * 40); ctx.stroke(); }
      // stag skull head with antlers
      const hy = y - 52; ctx.strokeStyle = f ? '#fff' : '#2a2a3c'; ctx.lineWidth = 6; for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(x + s * 14, hy - 12); ctx.quadraticCurveTo(x + s * 44, hy - 30, x + s * 40, hy - 70); ctx.stroke(); for (const [t, l] of [[0.35, 26], [0.6, 22], [0.85, 16]]) { const px = x + s * (14 + 28 * t + 8 * Math.sin(t * 3)), py = hy - 12 - 58 * t; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + s * l, py - l * 0.8); ctx.stroke(); } }
      if (p3) { ctx.strokeStyle = '#ff2d55'; ctx.lineWidth = 2; for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(x + s * 14, hy - 12); ctx.quadraticCurveTo(x + s * 44, hy - 30, x + s * 40, hy - 70); ctx.stroke(); } }
      ctx.fillStyle = f ? '#fff' : '#e8e4da'; ctx.beginPath(); ctx.ellipse(x, hy, 24, 28, 0, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.moveTo(x - 13, hy + 14); ctx.lineTo(x - 9, hy + 42); ctx.lineTo(x + 9, hy + 42); ctx.lineTo(x + 13, hy + 14); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#07070d'; ctx.beginPath(); ctx.ellipse(x - 10, hy - 4, 7.5, 10, 0.2, 0, TAU); ctx.ellipse(x + 10, hy - 4, 7.5, 10, -0.2, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.moveTo(x - 2, hy + 12); ctx.lineTo(x, hy + 20); ctx.lineTo(x + 2, hy + 12); ctx.fill();
      ctx.fillStyle = p3 ? '#fff' : SH2; ctx.beginPath(); ctx.arc(x - 10, hy - 3, 3.6 + Math.sin(time * 8) * 0.8, 0, TAU); ctx.arc(x + 10, hy - 3, 3.6 + Math.sin(time * 8) * 0.8, 0, TAU); ctx.fill();
      ctx.fillStyle = '#07070d'; for (let i = -3; i <= 3; i++) ctx.fillRect(x + i * 3.2 - 0.6, hy + 30, 1.2, 10);
      // halo of floating swords
      for (let i = 0; i < 8; i++) { const a = time * (p3 ? 1.5 : 0.8) + i * TAU / 8, sx = x + Math.cos(a) * 112, sy = y - 10 + Math.sin(a) * 78; ctx.save(); ctx.translate(sx, sy); ctx.rotate(a + Math.PI / 2); ctx.fillStyle = f ? '#fff' : '#b9bde0'; ctx.beginPath(); ctx.moveTo(0, -22); ctx.lineTo(4, 8); ctx.lineTo(-4, 8); ctx.closePath(); ctx.fill(); ctx.fillStyle = hot; ctx.fillRect(-7, 8, 14, 3); ctx.fillStyle = '#4a4a62'; ctx.fillRect(-2, 11, 4, 9); ctx.restore(); }
    };
    return b;
  }

  // ------------------------------------------------------------------ land of the gods bosses (bosses 26-30)
  const GD1 = '#ffe9a8', GD2 = '#fff7d0', GD3 = '#7fd0ff', GD4 = '#ffd23f';
  const gpool = (x, y, r, dur) => hazards.push({ k: 'fire', holy: true, x, y, r, t: 0, dur });
  const gstrike = (x, y, delay, r) => zone(x, y, r || 50, delay, 0.12, { c: GD4, tc: 'rgba(255,230,120,.17)', onEnd: z => { gpool(z.x, z.y, (r || 50) * 0.6, 1.6); shake = 5; blip(140, 0.15, 'sawtooth', 0.05); } });
  const gzone = (x, y, r, delay, dur) => zone(x, y, r, delay, dur, { c: GD4, tc: 'rgba(255,230,120,.17)' });
  const GB = o => Object.assign({ c: GD4 }, o);
  const godLegs = (x, y, col) => { ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(x - 12, y + 34, 8, 12, 0, 0, TAU); ctx.ellipse(x + 12, y + 34, 8, 12, 0, 0, TAU); ctx.fill(); };

  // ---- epic upgrade for the four lesser gods: scaled-up body, glowing aura, and a themed layer behind and in front
  const glow = (x, y, r, c, a) => { const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, c.replace('A', a)); g.addColorStop(1, c.replace('A', 0)); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); };
  const EPIC = {
    hermes: {
      s: 1.45,
      pre(b) {
        const x = b.x, y = b.y, T = time; (b.tr = b.tr || []).unshift([x, y]); if (b.tr.length > 7) b.tr.pop();
        if (b.state === 'dash' && b.st > 0) { ctx.strokeStyle = 'rgba(255,230,120,.4)'; ctx.lineWidth = 24; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(b.ca) * 520, y + Math.sin(b.ca) * 520); ctx.stroke(); }
        for (let i = b.tr.length - 1; i >= 2; i--) { ctx.globalAlpha = 0.28 * (1 - i / 8); ctx.fillStyle = '#fff2b0'; ctx.beginPath(); ctx.ellipse(b.tr[i][0], b.tr[i][1], 26, 34, 0, 0, TAU); ctx.fill(); } ctx.globalAlpha = 1;
        glow(x, y, 120, 'rgba(255,225,120,A)', 0.55);
        for (const sd of [-1, 1]) for (let k = 0; k < 6; k++) { const fl = Math.sin(T * 12 + k * 0.5 + (sd > 0 ? 1 : 0)) * 0.12, a = -2.35 + k * 0.28 + fl, L = 80 - k * 4; ctx.save(); ctx.translate(x + sd * 14, y - 4); ctx.scale(sd, 1); ctx.rotate(a + Math.PI * 0); ctx.fillStyle = k % 2 ? '#fff7d0' : '#ffe9a8'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(L * 0.5, -9, L, 0); ctx.quadraticCurveTo(L * 0.5, 8, 0, 0); ctx.fill(); ctx.restore(); }
      },
      post(b) { const x = b.x, y = b.y, T = time; for (let i = 0; i < 6; i++) { const a = T * 2.2 + i * TAU / 6, px = x + Math.cos(a) * 62, py = y - 6 + Math.sin(a) * 46; ctx.save(); ctx.translate(px, py); ctx.rotate(a + 1.57); ctx.fillStyle = 'rgba(255,247,208,.9)'; ctx.beginPath(); ctx.ellipse(0, 0, 3.4, 9, 0, 0, TAU); ctx.fill(); ctx.restore(); } glow(x, y - 44, 26, 'rgba(255,240,170,A)', 0.8); }
    },
    ares: {
      s: 1.3,
      pre(b) {
        const x = b.x, y = b.y, T = time;
        if (b.state === 'rush' && b.st > 0) { ctx.strokeStyle = 'rgba(255,90,61,.4)'; ctx.lineWidth = 40; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(b.ca) * 540, y + Math.sin(b.ca) * 540); ctx.stroke(); }
        glow(x, y, 130, 'rgba(255,70,30,A)', 0.5);
        for (let i = 0; i < 12; i++) { const a = i * TAU / 12 + T * 0.6, fx = x + Math.cos(a) * 52, fy = y + 14 + Math.sin(a) * 30, h = 26 + Math.sin(T * 9 + i * 2) * 10; ctx.fillStyle = i % 2 ? 'rgba(255,140,40,.7)' : 'rgba(255,60,30,.7)'; ctx.beginPath(); ctx.moveTo(fx - 8, fy); ctx.quadraticCurveTo(fx - 2, fy - h * 0.6, fx + Math.sin(T * 7 + i) * 6, fy - h); ctx.quadraticCurveTo(fx + 2, fy - h * 0.5, fx + 8, fy); ctx.fill(); }
        ctx.save(); ctx.translate(x, y); ctx.rotate(b.face); ctx.fillStyle = '#7a1420'; ctx.beginPath(); ctx.moveTo(-8, -26); for (let i = 0; i <= 6; i++) ctx.lineTo(-30 - i * 12, -34 + i * 3 + Math.sin(T * 5 + i) * 8); for (let i = 6; i >= 0; i--) ctx.lineTo(-30 - i * 12 + (i === 6 ? 6 : 0), 34 - i * 3 + Math.sin(T * 5 + i + 2) * 8); ctx.lineTo(-8, 26); ctx.closePath(); ctx.fill(); ctx.strokeStyle = '#b02a3a'; ctx.lineWidth = 3; ctx.stroke(); ctx.restore();
      },
      post(b) { const x = b.x, y = b.y, T = time; ctx.save(); ctx.translate(x, y); ctx.rotate(b.face); for (const sd of [-1, 1]) { ctx.fillStyle = '#e8c050'; ctx.beginPath(); ctx.moveTo(-6, sd * 28); ctx.lineTo(-2, sd * 46); ctx.lineTo(8, sd * 30); ctx.fill(); ctx.fillStyle = '#ff2a2a'; ctx.beginPath(); ctx.arc(12, sd * 4, 2.2, 0, TAU); ctx.fill(); } ctx.fillStyle = '#c8d0e0'; ctx.beginPath(); ctx.moveTo(14, -6); ctx.lineTo(26, 0); ctx.lineTo(14, 6); ctx.fill(); ctx.restore(); for (let i = 0; i < 8; i++) { const u = (T * 0.8 + i * 0.125) % 1; ctx.fillStyle = 'rgba(255,' + (120 + i * 12) + ',40,' + (1 - u) + ')'; ctx.fillRect(x + Math.sin(i * 7 + T) * 50, y + 20 - u * 90, 3, 3); } }
    },
    poseidon: {
      s: 1.35,
      pre(b) {
        const x = b.x, y = b.y, T = time; glow(x, y + 10, 140, 'rgba(70,170,255,A)', 0.45);
        ctx.strokeStyle = 'rgba(160,225,255,.55)'; ctx.lineWidth = 3; for (let r = 0; r < 3; r++) { ctx.beginPath(); ctx.ellipse(x, y + 52, 70 + r * 22 + Math.sin(T * 2 + r) * 4, 17 + r * 5, 0, T * (r % 2 ? -1 : 1) * 0.8, T * (r % 2 ? -1 : 1) * 0.8 + 4.4); ctx.stroke(); }
        for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + (i - 2) * 0.5, w = Math.sin(T * 3 + i) * 5; ctx.fillStyle = i % 2 ? '#3a96d8' : '#5ab8e8'; ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * 20, y - 30 + Math.sin(a) * 20); ctx.quadraticCurveTo(x + Math.cos(a) * 70 + w, y - 30 + Math.sin(a) * 70, x + Math.cos(a) * 58 + 16, y - 30 + Math.sin(a) * 58 + 14); ctx.quadraticCurveTo(x + Math.cos(a) * 52, y - 30 + Math.sin(a) * 60, x + Math.cos(a) * 20 + 8, y - 22 + Math.sin(a) * 20); ctx.fill(); }
      },
      post(b) { const x = b.x, y = b.y, T = time; for (let i = 0; i < 7; i++) { const a = T * 1.6 + i * TAU / 7, px = x + Math.cos(a) * 78, py = y + 4 + Math.sin(a) * 52; ctx.fillStyle = 'rgba(190,235,255,.75)'; ctx.beginPath(); ctx.arc(px, py, 5 + (i % 3), 0, TAU); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.beginPath(); ctx.arc(px - 1.5, py - 1.5, 2, 0, TAU); ctx.fill(); } const tx = x + 62 * 1.35 - 62 * 1.35 * 0 + (62 * 0.35); glow(tx, y - 78, 34, 'rgba(120,220,255,A)', 0.7); }
    },
    apollo: {
      s: 1.35,
      pre(b) {
        const x = b.x, y = b.y, T = time;
        if (b.state === 'chariot' && b.st > 0) { ctx.strokeStyle = 'rgba(255,230,120,.45)'; ctx.lineWidth = 34; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(b.ca) * 540, y + Math.sin(b.ca) * 540); ctx.stroke(); }
        glow(x, y - 16, 150, 'rgba(255,220,90,A)', 0.6); glow(x, y - 16, 80, 'rgba(255,255,220,A)', 0.55);
        for (let i = 0; i < 24; i++) { const a = -b.rot * 0.6 + i * TAU / 24, l = 70 + (i % 3) * 26 + Math.sin(T * 4 + i) * 8; ctx.fillStyle = i % 2 ? 'rgba(255,210,63,.55)' : 'rgba(255,245,190,.6)'; ctx.beginPath(); ctx.moveTo(x + Math.cos(a - 0.07) * 54, y - 16 + Math.sin(a - 0.07) * 54); ctx.lineTo(x + Math.cos(a) * (54 + l), y - 16 + Math.sin(a) * (54 + l)); ctx.lineTo(x + Math.cos(a + 0.07) * 54, y - 16 + Math.sin(a + 0.07) * 54); ctx.fill(); }
        ctx.strokeStyle = 'rgba(255,240,170,.6)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y - 16, 62, 0, TAU); ctx.stroke();
      },
      post(b) { const x = b.x, y = b.y, T = time; ctx.strokeStyle = '#3aa060'; ctx.lineWidth = 2; for (let i = 0; i < 10; i++) { const a = Math.PI * 1.1 + i * 0.087; ctx.fillStyle = '#4ac070'; ctx.beginPath(); ctx.ellipse(x + Math.cos(a) * 22, y - 36 + Math.sin(a) * 22 * 1.0, 5, 2.4, a + 1.5, 0, TAU); ctx.fill(); } for (let i = 0; i < 5; i++) { const a = T * 1.8 + i * TAU / 5, px = x + Math.cos(a) * 68, py = y - 12 + Math.sin(a) * 50; ctx.save(); ctx.translate(px, py); ctx.rotate(a + 1.57); ctx.fillStyle = '#fff6c0'; ctx.fillRect(-1, -12, 2, 20); ctx.beginPath(); ctx.moveTo(0, -16); ctx.lineTo(4, -9); ctx.lineTo(-4, -9); ctx.fill(); ctx.restore(); } }
    }
  };
  function epic(b, kind) {
    const E = EPIC[kind], orig = b.draw;
    b.draw = function () {
      E.pre(this); const st = this.st; if (this.state === 'dash' || this.state === 'rush' || this.state === 'chariot') this.st = Math.min(st, 0);
      ctx.save(); ctx.translate(this.x, this.y); ctx.scale(E.s, E.s); ctx.translate(-this.x, -this.y); orig.call(this); ctx.restore(); this.st = st; E.post(this);
    };
    return b;
  }

  function mkHermes() {
    const b = base('HERMES', 520, 30); b.ang = 0; b.ca = 0;
    b.update = function (dt) {
      const ph = this.hp / this.max < 0.5 ? 2 : 1; if (ph !== this.ph) { this.ph = ph; toastMsg('Hermes accelerates beyond sight!'); shake = 12; ring(this.x, this.y, 20, 0, 200, 8, GB()); }
      this.st -= dt; this.ang += dt; const toP = angTo(this, player);
      if (this.state === 'idle') {
        toward(this, player.x + Math.cos(this.ang * 1.3) * 230, player.y + Math.sin(this.ang * 1.3) * 230, 190 + ph * 40, dt);
        if (this.st <= 0) { const o = ['dash', 'feathers', 'gale', 'snakes', 'dash']; if (ph === 2) o.push('dash', 'gale'); this.state = pick(o); this.n = 0; this.st = 0.5; if (this.state === 'dash') { this.st = 0.5; this.ca = toP; } }
      } else if (this.state === 'dash') {
        if (this.st > 0) this.ca = toP; else { this.x += Math.cos(this.ca) * 800 * dt; this.y += Math.sin(this.ca) * 800 * dt; this.pt = (this.pt || 0) + dt; if (this.pt > 0.07) { this.pt = 0; gpool(this.x, this.y, 18, 1.8); }
          if (this.st < -0.4 || inArena(this)) { ring(this.x, this.y, 8, rnd(0, 1), 190, 7, GB({ c: GD2 })); this.n++; if (this.n < (ph === 2 ? 4 : 3)) { this.st = 0.4; this.ca = angTo(this, player); } else { this.state = 'idle'; this.st = 1.1; } } }
      } else if (this.state === 'feathers') {
        if (this.st <= 0) { fan(this.x, this.y, toP, ph === 2 ? 9 : 7, 1.3, 240, 7, GB({ c: GD2 })); blip(600, 0.07, 'triangle', 0.04); this.n++; this.st = 0.38; if (this.n >= (ph === 2 ? 5 : 4)) { this.state = 'idle'; this.st = 1.1; } }
      } else if (this.state === 'gale') {
        if (this.st <= 0) { ring(this.x, this.y, 22, this.n * 0.4, 160, 8, GB({ c: GD3 }), 5); if (this.n === 0) for (let i = 0; i < (ph === 2 ? 6 : 4); i++) gstrike(player.x + (i ? rnd(-150, 150) : 0), player.y + (i ? rnd(-150, 150) : 0), 0.8 + i * 0.15, 48); this.n++; this.st = 0.55; if (this.n >= 3) { this.state = 'idle'; this.st = 1.4; } }
      } else if (this.state === 'snakes') {
        if (this.st <= 0) { for (let i = -1; i <= 1; i += 2) ebul(this.x, this.y, toP + i * 0.6, 150, 9, GB({ c: GD1, home: 1.7, life: 4.5 })); if (ph === 2) ebul(this.x, this.y, toP, 150, 9, GB({ c: GD1, home: 1.7, life: 4.5 })); this.n++; this.st = 0.7; if (this.n >= 3) { this.state = 'idle'; this.st = 1.3; } }
      }
      inArena(this);
    };
    b.draw = function () {
      const x = this.x, y = this.y + Math.sin(time * 5) * 3, f = this.flash > 0, fl = Math.sin(time * 14);
      if (this.state === 'dash' && this.st > 0) { ctx.strokeStyle = 'rgba(255,230,120,.4)'; ctx.lineWidth = 24; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(this.ca) * 520, y + Math.sin(this.ca) * 520); ctx.stroke(); }
      ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(this.x, this.y + 44, 24, 7, 0, 0, TAU); ctx.fill();
      for (const s of [-1, 1]) { ctx.fillStyle = f ? '#fff' : GD2; ctx.beginPath(); ctx.moveTo(x + s * 14, y - 4); ctx.quadraticCurveTo(x + s * 60, y - 36 - fl * 8, x + s * 70, y + 6 + fl * 6); ctx.quadraticCurveTo(x + s * 44, y + 2, x + s * 14, y + 10); ctx.fill(); ctx.strokeStyle = GD1; ctx.lineWidth = 2; for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(x + s * 16, y + i * 2); ctx.lineTo(x + s * (50 + i * 6), y - 14 + i * 7 + fl * 4); ctx.stroke(); } }
      godLegs(x, y, f ? '#fff' : '#e8c890'); ctx.fillStyle = f ? '#fff' : '#f4f0e0'; ctx.beginPath(); ctx.moveTo(x - 13, y - 12); ctx.lineTo(x + 13, y - 12); ctx.lineTo(x + 17, y + 26); ctx.lineTo(x - 17, y + 26); ctx.closePath(); ctx.fill(); ctx.fillStyle = GD4; ctx.fillRect(x - 15, y + 8, 30, 4);
      ctx.fillStyle = f ? '#fff' : '#f0c8a0'; ctx.beginPath(); ctx.arc(x, y - 22, 13, 0, TAU); ctx.fill(); ctx.fillStyle = f ? '#fff' : GD4; ctx.beginPath(); ctx.arc(x, y - 26, 14, Math.PI, 0); ctx.fill(); for (const s of [-1, 1]) { ctx.fillStyle = GD2; ctx.beginPath(); ctx.moveTo(x + s * 12, y - 28); ctx.lineTo(x + s * 30, y - 38 - fl * 3); ctx.lineTo(x + s * 22, y - 26); ctx.fill(); }
      ctx.strokeStyle = '#a0763a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x + 30, y + 30); ctx.lineTo(x + 30, y - 30); ctx.stroke(); ctx.strokeStyle = GD4; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x + 30, y - 22, 6, 0, TAU); ctx.stroke();
    };
    return epic(b, 'hermes');
  }

  function mkAres() {
    const b = base('ARES', 560, 42); b.face = Math.PI / 2; b.ca = 0;
    b.update = function (dt) {
      const ph = this.hp / this.max < 0.5 ? 2 : 1; if (ph !== this.ph) { this.ph = ph; toastMsg('Ares roars - his bloodlust is unleashed!'); shake = 14; ring(this.x, this.y, 22, 0, 200, 8, GB({ c: '#ff5a3d' })); }
      this.st -= dt; const toP = angTo(this, player);
      if (this.state !== 'rush' && this.state !== 'whirl') this.face += clamp(angDiff(toP, this.face), -2.8 * dt, 2.8 * dt);
      if (this.state === 'idle') {
        if (dist(this, player) > 130) toward(this, player.x, player.y, 105 + ph * 30, dt);
        if (this.st <= 0) { const o = ['spear', 'rush', 'warcry', 'spears', 'spear']; if (ph === 2) o.push('whirl', 'rush', 'spears'); this.state = pick(o); this.n = 0; this.st = 0.5; if (this.state === 'rush') { this.st = 0.8; this.ca = toP; } else if (this.state === 'warcry') { this.st = 0.8; gzone(this.x, this.y, 180, 0.8, 0.2); } else if (this.state === 'whirl') this.st = 2.6; }
      } else if (this.state === 'spear') {
        if (this.st <= 0) { const a = this.face; for (let i = 1; i <= 7; i++) gstrike(this.x + Math.cos(a) * i * 75, this.y + Math.sin(a) * i * 75, 0.4 + i * 0.1, 40); if (ph === 2) for (const k of [-0.35, 0.35]) for (let i = 2; i <= 6; i += 2) gstrike(this.x + Math.cos(a + k) * i * 75, this.y + Math.sin(a + k) * i * 75, 0.7 + i * 0.1, 38); this.state = 'idle'; this.st = 1.8; }
      } else if (this.state === 'rush') {
        if (this.st > 0) { this.ca = toP; this.face = this.ca; } else { this.face = this.ca; this.x += Math.cos(this.ca) * 600 * dt; this.y += Math.sin(this.ca) * 600 * dt; if (this.st < -0.6 || inArena(this)) { wave(this.x, this.y, 200, 400, { w: 26, c: '#ff5a3d' }); fan(this.x, this.y, angTo(this, player), 7, 1.2, 220, 8, GB({ c: '#ff9a3a' })); shake = 12; this.n++; if (this.n < (ph === 2 ? 2 : 1)) this.st = 0.6; else { this.state = 'idle'; this.st = 1.3; } } }
      } else if (this.state === 'warcry') {
        if (this.st <= 0) { wave(this.x, this.y, 220, 440, { w: 28, c: GD4 }); ring(this.x, this.y, 18, 0, 170, 9, GB({ c: '#ff5a3d' })); if (ph === 2) wave(this.x, this.y, 220, 440, { w: 24, c: '#ff5a3d', delay: 0.45 }); shake = 12; this.state = 'idle'; this.st = 1.3; }
      } else if (this.state === 'spears') {
        if (this.st <= 0) { for (let i = 0; i < (ph === 2 ? 11 : 8); i++) gstrike(player.x + (i ? rnd(-170, 170) : 0), player.y + (i ? rnd(-170, 170) : 0), 0.7 + i * 0.1, 44); this.state = 'idle'; this.st = 2.0; }
      } else if (this.state === 'whirl') {
        this.face += dt * 6.5; this.n -= dt; toward(this, player.x, player.y, 55, dt); if (this.n <= 0) { this.n = 0.1; for (let i = 0; i < 3; i++) ebul(this.x, this.y, this.face + i * TAU / 3, 200, 7, GB({ c: '#ff9a3a', life: 3 })); }
        if (this.st <= 0) { this.state = 'idle'; this.st = 1.4; }
      }
      inArena(this);
    };
    b.draw = function () {
      const x = this.x, y = this.y, f = this.flash > 0;
      if (this.state === 'rush' && this.st > 0) { ctx.strokeStyle = 'rgba(255,90,61,.4)'; ctx.lineWidth = 40; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(this.ca) * 540, y + Math.sin(this.ca) * 540); ctx.stroke(); }
      ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(x, y + 42, 50, 12, 0, 0, TAU); ctx.fill();
      ctx.save(); ctx.translate(x, y); ctx.rotate(this.face); ctx.lineCap = 'round';
      ctx.strokeStyle = '#8a6a3a'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(-10, 26); ctx.lineTo(96, 26); ctx.stroke(); ctx.fillStyle = f ? '#fff' : '#d8dce8'; ctx.beginPath(); ctx.moveTo(96, 20); ctx.lineTo(120, 26); ctx.lineTo(96, 32); ctx.fill();
      ctx.fillStyle = f ? '#fff' : '#b04030'; ctx.beginPath(); ctx.ellipse(0, 0, 38, 32, 0, 0, TAU); ctx.fill(); ctx.fillStyle = f ? '#fff' : '#d8a060'; ctx.beginPath(); ctx.ellipse(2, 0, 30, 24, 0, 0, TAU); ctx.fill(); ctx.fillStyle = GD4; ctx.fillRect(-4, -20, 8, 40);
      ctx.fillStyle = f ? '#fff' : '#a07a3a'; ctx.beginPath(); ctx.arc(26, -24, 22, 0, TAU); ctx.fill(); ctx.strokeStyle = GD1; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(26, -24, 15, 0, TAU); ctx.arc(26, -24, 8, 0, TAU); ctx.stroke();
      ctx.fillStyle = f ? '#fff' : '#c8c8d8'; ctx.beginPath(); ctx.arc(2, 0, 20, 0, TAU); ctx.fill(); ctx.fillStyle = '#10101a'; ctx.fillRect(8, -4, 12, 8); ctx.fillStyle = '#ff3d3d'; for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.ellipse(-6 - i * 4, -2 + Math.sin(time * 6 + i) * 2, 6, 4, 0, 0, TAU); ctx.fill(); }
      ctx.restore();
    };
    return epic(b, 'ares');
  }

  function mkPoseidon() {
    const b = base('POSEIDON', 600, 44); b.ang = 0;
    b.update = function (dt) {
      const ph = this.hp / this.max < 0.5 ? 2 : 1; if (ph !== this.ph) { this.ph = ph; toastMsg('The sea rises at Poseidon\'s command!'); shake = 14; ring(this.x, this.y, 24, 0, 190, 8, GB({ c: GD3 })); }
      this.st -= dt; this.ang += dt; const toP = angTo(this, player);
      if (this.state === 'idle') {
        toward(this, ARENA.x + Math.cos(this.ang * 0.5) * 150, ARENA.y + Math.sin(this.ang * 0.5) * 110, 70 + ph * 20, dt);
        if (this.st <= 0) { const o = ['tide', 'trident', 'whirl', 'bubbles', 'geyser']; if (ph === 2) o.push('tsunami', 'trident', 'geyser'); this.state = pick(o); this.n = 0; this.st = 0.5; if (this.state === 'trident') this.st = 0.6; else if (this.state === 'tsunami') { this.st = 0.9; gzone(this.x, this.y, 200, 0.9, 0.2); } }
      } else if (this.state === 'tide') {
        if (this.st <= 0) { wave(this.x, this.y, 220, 380, { w: 30, c: GD3, delay: this.n * 0.55 }); this.n++; if (this.n >= (ph === 2 ? 4 : 3)) { this.state = 'idle'; this.st = 2.8; } else this.st = 0.01; }
      } else if (this.state === 'trident') {
        if (this.st <= 0 && !this.bm) { const d = Math.random() < 0.5 ? 1 : -1, a0 = toP; for (let k = -1; k <= 1; k++) addBeam(this.x, this.y, a0 + k * 0.45, d * 0.35 * (k === 0 ? 1 : -1) , 0.7, 3.0, 360); this.bm = true; this.st = 3.8; blip(200, 0.3, 'sawtooth', 0.06); }
        else if (this.bm && this.st <= 0) { this.bm = false; this.state = 'idle'; this.st = 1.3; } else if (this.bm) followBeams(this);
      } else if (this.state === 'whirl') {
        if (this.st <= 0) { const k = ph === 2 ? 8 : 6; for (let i = 0; i < k; i++) { const a = i * TAU / k; gstrike(player.x + Math.cos(a) * 140, player.y + Math.sin(a) * 140, 0.8 + i * 0.12, 54); } gstrike(player.x, player.y, 0.8 + k * 0.12, 58); this.state = 'idle'; this.st = 2.0; }
      } else if (this.state === 'bubbles') {
        if (this.st <= 0) { for (let i = 0; i < 5; i++) ebul(this.x, this.y, toP + (i - 2) * 0.5, 120, 11, GB({ c: GD3, home: 1.5, life: 5 })); this.n++; this.st = 0.9; if (this.n >= (ph === 2 ? 3 : 2)) { this.state = 'idle'; this.st = 1.4; } }
      } else if (this.state === 'geyser') {
        if (this.st <= 0) { for (let i = 0; i < (ph === 2 ? 12 : 9); i++) { const a = rnd(0, TAU), d = rnd(0, ARENA.r - 50); gstrike(ARENA.x + Math.cos(a) * d, ARENA.y + Math.sin(a) * d, 0.8 + i * 0.1, 50); } gstrike(player.x, player.y, 0.9, 50); this.state = 'idle'; this.st = 2.0; }
      } else if (this.state === 'tsunami') {
        if (this.st <= 0) { wave(this.x, this.y, 240, 450, { w: 32, c: GD3 }); wave(this.x, this.y, 240, 450, { w: 28, c: GD2, delay: 0.55 }); ring(this.x, this.y, 20, toP, 150, 9, GB({ c: GD3 }), 5); shake = 16; this.state = 'idle'; this.st = 2.2; }
      }
      inArena(this);
    };
    b.draw = function () {
      const x = this.x, y = this.y, f = this.flash > 0;
      ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(x, y + 52, 62, 14, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = f ? '#fff' : '#2a7fb8'; ctx.beginPath(); ctx.moveTo(x - 44, y - 14); for (let i = 0; i <= 8; i++) ctx.lineTo(x - 56 + i * 14, y + 56 + Math.sin(time * 4 + i) * 6 + (i % 2) * 6); ctx.lineTo(x + 44, y - 14); ctx.closePath(); ctx.fill(); ctx.fillStyle = f ? '#fff' : '#5ab8e8'; ctx.beginPath(); ctx.moveTo(x - 28, y - 6); for (let i = 0; i <= 6; i++) ctx.lineTo(x - 36 + i * 12, y + 46 + Math.sin(time * 5 + i) * 5); ctx.lineTo(x + 28, y - 6); ctx.closePath(); ctx.fill();
      ctx.fillStyle = f ? '#fff' : '#e8c8a0'; ctx.beginPath(); ctx.arc(x, y - 26, 19, 0, TAU); ctx.fill(); ctx.fillStyle = f ? '#fff' : '#d8f0ff'; ctx.beginPath(); ctx.moveTo(x - 18, y - 22); ctx.quadraticCurveTo(x, y + 18 + Math.sin(time * 3) * 4, x + 18, y - 22); ctx.quadraticCurveTo(x, y - 10, x - 18, y - 22); ctx.fill(); ctx.fillStyle = '#10304a'; ctx.beginPath(); ctx.arc(x - 7, y - 30, 2.5, 0, TAU); ctx.arc(x + 7, y - 30, 2.5, 0, TAU); ctx.fill();
      ctx.fillStyle = GD4; for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(x + i * 7 - 3, y - 42); ctx.lineTo(x + i * 7, y - 54 - (2 - Math.abs(i)) * 3); ctx.lineTo(x + i * 7 + 3, y - 42); ctx.fill(); }
      const tx = x + 62; ctx.strokeStyle = '#c8a050'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(tx, y + 50); ctx.lineTo(tx, y - 54); ctx.stroke(); ctx.strokeStyle = f ? '#fff' : GD4; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(tx - 14, y - 40); ctx.lineTo(tx - 14, y - 64); ctx.moveTo(tx + 14, y - 40); ctx.lineTo(tx + 14, y - 64); ctx.moveTo(tx, y - 54); ctx.lineTo(tx, y - 70); ctx.moveTo(tx - 14, y - 40); ctx.quadraticCurveTo(tx, y - 30, tx + 14, y - 40); ctx.stroke();
    };
    return epic(b, 'poseidon');
  }

  function mkApollo() {
    const b = base('APOLLO', 640, 40); b.ang = 0; b.ca = 0; b.rot = 0;
    b.update = function (dt) {
      const ph = this.hp / this.max < 0.5 ? 2 : 1; if (ph !== this.ph) { this.ph = ph; toastMsg('Apollo blazes brighter than the sun!'); shake = 14; ring(this.x, this.y, 24, 0, 200, 8, GB({ c: GD2 })); }
      this.st -= dt; this.ang += dt; this.rot += dt * 0.8; const toP = angTo(this, player);
      if (this.state === 'idle') {
        toward(this, player.x + Math.cos(this.ang * 0.8) * 230, player.y + Math.sin(this.ang * 0.8) * 230, 110 + ph * 30, dt);
        if (this.st <= 0) { const o = ['arrows', 'sunbeam', 'flare', 'chariot', 'dawn']; if (ph === 2) o.push('arrows', 'sunbeam', 'chariot'); this.state = pick(o); this.n = 0; this.st = 0.5; if (this.state === 'chariot') { this.st = 0.8; this.ca = toP; } else if (this.state === 'sunbeam') this.st = 0.6; }
      } else if (this.state === 'arrows') {
        if (this.st <= 0) { fan(this.x, this.y, toP, ph === 2 ? 5 : 3, 0.35, 300, 7, GB({ c: GD2 })); blip(700, 0.06, 'triangle', 0.04); this.n++; this.st = 0.22; if (this.n >= (ph === 2 ? 10 : 8)) { this.state = 'idle'; this.st = 1.3; } }
      } else if (this.state === 'sunbeam') {
        if (this.st <= 0 && !this.bm) { const d = Math.random() < 0.5 ? 1 : -1, a0 = rnd(0, TAU), arms = ph === 2 ? 4 : 3; for (let i = 0; i < arms; i++) addBeam(this.x, this.y, a0 + i * TAU / arms, d * 0.8, 0.7, 3.0, 340); this.bm = true; this.st = 3.8; blip(200, 0.3, 'sawtooth', 0.06); }
        else if (this.bm && this.st <= 0) { this.bm = false; this.state = 'idle'; this.st = 1.3; } else if (this.bm) followBeams(this);
      } else if (this.state === 'flare') {
        if (this.st <= 0) { for (const k of (ph === 2 ? [-0.6, 0, 0.6] : [0])) for (let i = 1; i <= 6; i++) gstrike(this.x + Math.cos(toP + k) * i * 80, this.y + Math.sin(toP + k) * i * 80, 0.5 + i * 0.12, 46); this.state = 'idle'; this.st = 2.0; }
      } else if (this.state === 'chariot') {
        if (this.st > 0) this.ca = toP; else { this.x += Math.cos(this.ca) * 620 * dt; this.y += Math.sin(this.ca) * 620 * dt; this.pt = (this.pt || 0) + dt; if (this.pt > 0.09) { this.pt = 0; gpool(this.x, this.y, 22, 2.2); } if (this.st < -0.7 || inArena(this)) { this.n++; if (this.n < (ph === 2 ? 3 : 2)) { this.st = 0.5; this.ca = angTo(this, player); } else { this.state = 'idle'; this.st = 1.3; } } }
      } else if (this.state === 'dawn') {
        if (this.st <= 0) { ring(this.x, this.y, 28, toP + this.n * 0.5, 145, 9, GB({ c: this.n % 2 ? GD2 : GD4 }), 6); if (this.n === 1) wave(this.x, this.y, 210, 420, { w: 24, c: GD1 }); this.n++; this.st = 0.55; if (this.n >= (ph === 2 ? 4 : 3)) { this.state = 'idle'; this.st = 1.4; } }
      }
      inArena(this);
    };
    b.draw = function () {
      const x = this.x, y = this.y + Math.sin(time * 2.5) * 3, f = this.flash > 0;
      if (this.state === 'chariot' && this.st > 0) { ctx.strokeStyle = 'rgba(255,230,120,.45)'; ctx.lineWidth = 34; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(this.ca) * 540, y + Math.sin(this.ca) * 540); ctx.stroke(); }
      ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(this.x, this.y + 46, 28, 8, 0, 0, TAU); ctx.fill();
      for (let i = 0; i < 14; i++) { const a = this.rot + i * TAU / 14, l = 20 + (i % 2) * 12; ctx.fillStyle = i % 2 ? GD4 : GD2; ctx.beginPath(); ctx.moveTo(x + Math.cos(a - 0.09) * 46, y - 14 + Math.sin(a - 0.09) * 46); ctx.lineTo(x + Math.cos(a) * (46 + l), y - 14 + Math.sin(a) * (46 + l)); ctx.lineTo(x + Math.cos(a + 0.09) * 46, y - 14 + Math.sin(a + 0.09) * 46); ctx.fill(); }
      ctx.fillStyle = 'rgba(255,240,170,.35)'; ctx.beginPath(); ctx.arc(x, y - 14, 44, 0, TAU); ctx.fill();
      godLegs(x, y, f ? '#fff' : '#e8c890'); ctx.fillStyle = f ? '#fff' : '#fff8e0'; ctx.beginPath(); ctx.moveTo(x - 17, y - 10); ctx.lineTo(x + 17, y - 10); ctx.lineTo(x + 22, y + 30); ctx.lineTo(x - 22, y + 30); ctx.closePath(); ctx.fill(); ctx.fillStyle = GD4; ctx.fillRect(x - 18, y + 6, 36, 5);
      ctx.fillStyle = f ? '#fff' : '#f0c8a0'; ctx.beginPath(); ctx.arc(x, y - 24, 14, 0, TAU); ctx.fill(); ctx.fillStyle = f ? '#fff' : '#f0c040'; ctx.beginPath(); ctx.arc(x, y - 28, 15, Math.PI, 0); ctx.fill(); ctx.beginPath(); ctx.ellipse(x - 14, y - 22, 4, 12, 0.2, 0, TAU); ctx.ellipse(x + 14, y - 22, 4, 12, -0.2, 0, TAU); ctx.fill();
      ctx.fillStyle = '#5a7ab8'; ctx.beginPath(); ctx.arc(x - 5, y - 24, 2, 0, TAU); ctx.arc(x + 5, y - 24, 2, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#a07a2a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x - 36, y + 4, 26, -1.2, 1.2); ctx.stroke(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x - 36 + Math.cos(-1.2) * 26, y + 4 + Math.sin(-1.2) * 26); ctx.lineTo(x - 36 + Math.cos(1.2) * 26, y + 4 + Math.sin(1.2) * 26); ctx.stroke();
    };
    return epic(b, 'apollo');
  }

  function mkZeus() {
    // ZEUS: a colossal, stationary storm king. He never walks: his giant hands do the fighting, and an
    // aegis of lightning pylons shields him until you tear them down.
    const b = base('ZEUS', 1600, 64); b.x = ARENA.x; b.y = ARENA.y - 160; b.ct = 0; b.cy = 0; b.aegis = false; b.pylons = []; b.stun = 0; b.vt = 0; b.rounds = 0; b.eye = 0;
    b.hands = [{ x: b.x - 150, y: b.y + 70, hx: b.x - 150, hy: b.y + 70, s: 0 }, { x: b.x + 150, y: b.y + 70, hx: b.x + 150, hy: b.y + 70, s: 0 }];
    const hand = (o, i) => o.hands[i];
    const moveHand = (h, x, y, k, dt) => { h.x += (x - h.x) * Math.min(1, k * dt); h.y += (y - h.y) * Math.min(1, k * dt); };
    const raise = o => {
      const n = 2 + o.ph, ph = o.ph; o.pylons = []; o.aegis = true; o.stun = 0; o.rounds++;
      const a0 = rnd(0, TAU);
      for (let i = 0; i < n; i++) { const a = a0 + i * TAU / n; o.pylons.push({ x: ARENA.x + Math.cos(a) * 185, y: ARENA.y + Math.sin(a) * 185 + 10, r: 22, hp: Math.round(o.max * (0.017 + 0.004 * ph)), max: 0, flash: 0, t: rnd(0, 2), cd: rnd(1.5, 3) }); }
      for (const p of o.pylons) p.max = p.hp;
      toastMsg('Zeus raises the Aegis - shatter the pylons!', 2.2); shake = 10; burst(o.x, o.y, 30, GD4, 260);
    };
    b.init = false;
    b.update = function (dt) {
      const f = this.hp / this.max, ph = f > 0.66 ? 1 : f > 0.33 ? 2 : 3;
      this.y = ARENA.y - 160 + Math.sin(time * 1.3) * 5; this.eye = Math.max(0, this.eye - dt);
      if (!this.init) { this.init = true; this.ph = 1; this.st = 1.8; raise(this); }
      if (ph !== this.ph) { this.ph = ph; toastMsg(ph === 2 ? 'Zeus summons the storm!' : 'ZEUS UNLEASHES HIS FULL WRATH!', 2.4); shake = 20; hazards.length = 0; eBul.length = 0; burst(this.x, this.y, 40, GD4, 300); this.state = 'idle'; this.st = 1.4; this.bm = false; ring(this.x, this.y, 26, 0, 200, 9, GB()); raise(this); }
      // pylons: shoot at the player, die when shot
      for (const p of this.pylons) { p.t += dt; p.flash = Math.max(0, p.flash - dt); if (p.hp <= 0) continue; p.cd -= dt; if (p.cd <= 0 && !this.stun) { p.cd = 3.6 - ph * 0.4 + rnd(0, 1.2); gstrike(player.x + rnd(-40, 40), player.y + rnd(-40, 40), 0.9, 44); ebul(p.x, p.y, Math.atan2(player.y - p.y, player.x - p.x), 150, 8, GB({ c: GD3, life: 4 })); } }
      if (this.aegis && this.pylons.every(p => p.hp <= 0)) { this.aegis = false; this.stun = 7 + ph; this.state = 'idle'; this.st = 99; this.bm = false; hazards.length = 0; eBul.length = 0; burst(this.x, this.y, 50, '#fff', 300); shake = 16; toastMsg('The Aegis shatters! Zeus is exposed - HIT HIM!', 2); blip(80, 0.6, 'sawtooth', 0.1, 0.4); }
      if (this.stun > 0) {
        this.stun -= dt; for (let i = 0; i < 2; i++) moveHand(this.hands[i], this.x + (i ? 120 : -120), this.y + 150, 3, dt);
        if (this.stun <= 0) { this.st = 1.0; raise(this); }
        inArena(this); return;
      }
      this.st -= dt; const toP = angTo(this, player), rest = k => k * [0, 1, 0.78, 0.6][ph] * (this.aegis ? 1 : 1);
      const H = this.hands;
      if (this.state === 'idle') {
        for (let i = 0; i < 2; i++) moveHand(H[i], this.x + (i ? 160 : -160) + Math.sin(time * 1.8 + i * 2) * 14, this.y + 80 + Math.cos(time * 2 + i) * 10, 4, dt);
        if (this.st <= 0) {
          const o = ['slam', 'slam', 'sweep', 'bolts', 'clap']; if (ph >= 2) o.push('grid', 'gaze', 'storm', 'slam'); if (ph === 3) o.push('tempest', 'grid', 'wrath', 'gaze');
          let nx = pick(o); if (nx === this.last) nx = pick(o); this.last = nx; this.state = nx; this.n = 0; this.ct = 0; this.st = 0.4; this.cy = rnd(0, TAU); this.hi = Math.random() < 0.5 ? 0 : 1;
          if (nx === 'clap') this.st = 1.1; else if (nx === 'gaze') this.st = 0.8; else if (nx === 'wrath') this.st = 5.0; else if (nx === 'tempest') this.st = 5.5; else if (nx === 'grid') this.st = 0.5;
        }
      } else if (this.state === 'slam') {
        const h = H[this.n % 2];
        if (this.ct === 0) { this.tx = clamp(player.x + player.vx * 0.25 || player.x, ARENA.x - 220, ARENA.x + 220); this.ty = player.y; this.ct = 1; gzone(this.tx, this.ty, 78, 0.85, 0.2); this.st = 0.85; }
        moveHand(h, this.tx, this.ty - (this.st > 0.1 ? 60 : 0), 8, dt);
        if (this.st <= 0) { gpool(this.tx, this.ty, 50, 2); wave(this.tx, this.ty, 230, 210, { w: 22, c: GD4 }); shake = 12; blip(60, 0.3, 'sawtooth', 0.1); h.x = this.tx; h.y = this.ty; this.n++; this.ct = 0; this.st = 0.3; if (this.n >= 2 + ph) { this.state = 'idle'; this.st = rest(1.6); } }
      } else if (this.state === 'sweep') {
        const h = H[this.hi], dir = this.hi ? -1 : 1, y0 = clamp(player.y, ARENA.y - 150, ARENA.y + 180);
        if (this.n === 0) { this.n = 1; this.sy = y0; this.sx = ARENA.x - dir * 260; for (let i = 0; i <= 10; i++) gstrike(ARENA.x - dir * 250 + dir * i * 50, y0, 0.7 + i * 0.09, 44); if (ph >= 2) for (let i = 0; i <= 10; i++) gstrike(ARENA.x - dir * 250 + dir * i * 50, y0 + (i % 2 ? 60 : -60), 0.9 + i * 0.09, 38); this.st = 2.2; }
        const prog = clamp((2.2 - this.st - 0.7) / 0.95, 0, 1); moveHand(h, ARENA.x - dir * 250 + dir * 500 * prog, this.sy - 10, 14, dt);
        if (this.st <= 0) { this.state = 'idle'; this.st = rest(1.5); }
      } else if (this.state === 'clap') {
        moveHand(H[0], this.st > 0 ? ARENA.x - 250 : this.x - 30, this.st > 0 ? this.y + 90 : ARENA.y + 20, 9, dt); moveHand(H[1], this.st > 0 ? ARENA.x + 250 : this.x + 30, this.st > 0 ? this.y + 90 : ARENA.y + 20, 9, dt);
        if (this.st <= 0 && this.n === 0) { this.n = 1; const cy = ARENA.y + 10; wave(ARENA.x - 255, cy, 250, 560, { w: 34, c: GD4 }); wave(ARENA.x + 255, cy, 250, 560, { w: 34, c: GD4 }); if (ph >= 2) { wave(ARENA.x - 255, cy, 250, 560, { w: 28, c: GD2, delay: 0.55 }); wave(ARENA.x + 255, cy, 250, 560, { w: 28, c: GD2, delay: 0.55 }); } shake = 14; blip(65, 0.4, 'sawtooth', 0.1); this.st = 1.3; }
        else if (this.n === 1 && this.st <= 0) { this.state = 'idle'; this.st = rest(1.5); }
      } else if (this.state === 'bolts') {
        if (this.st <= 0) { gstrike(player.x + rnd(-30, 30), player.y + rnd(-30, 30), 0.55, 52); this.n++; this.st = 0.28; this.eye = 0.2; blip(300, 0.05, 'square', 0.04); if (this.n >= 4 + ph * 2) { this.state = 'idle'; this.st = rest(1.6); } }
      } else if (this.state === 'grid') {
        // lightning lattice: beams link the arena's anchor points, safe pockets in between
        if (this.n === 0 && this.st <= 0) { this.n = 1; const R = 215, k = ph === 3 ? 6 : 5, a0 = rnd(0, TAU); const pts = []; for (let i = 0; i < k; i++) pts.push([ARENA.x + Math.cos(a0 + i * TAU / k) * R, ARENA.y + 10 + Math.sin(a0 + i * TAU / k) * R]);
          for (let i = 0; i < k; i++) { const p = pts[i], q = pts[(i + 2) % k], ang = Math.atan2(q[1] - p[1], q[0] - p[0]); addBeam(p[0], p[1], ang, 0, 1.1, 1.8, Math.hypot(q[0] - p[0], q[1] - p[1])); }
          this.gp = pts; blip(200, 0.3, 'sawtooth', 0.06); this.st = 3.3; }
        else if (this.n === 1 && this.st <= 0) { this.gp = null; this.state = 'idle'; this.st = rest(1.6); }
      } else if (this.state === 'gaze') {
        moveHand(H[0], this.x - 70, this.y + 100, 5, dt); moveHand(H[1], this.x + 70, this.y + 100, 5, dt); this.eye = 0.2;
        if (this.st <= 0 && !this.bm) { for (const s of [-1, 1]) addBeam(this.x + s * 16, this.y - 8, Math.PI / 2 + s * 0.5, -s * 0.5 * (ph === 3 ? 1.4 : 1), 0.8, 3.0, 460); this.bm = true; this.st = 3.8; blip(200, 0.3, 'sawtooth', 0.06); }
        else if (this.bm && this.st <= 0) { this.bm = false; this.state = 'idle'; this.st = rest(1.3); } else if (this.bm) { for (const h of hazards) if (h.k === 'beam') { h.x = this.x + (h.rot < 0 ? 16 : -16); h.y = this.y - 8; } }
      } else if (this.state === 'storm') {
        if (this.st <= 0) { const cnt = 10 + ph * 3; for (let i = 0; i < cnt; i++) { const a = rnd(0, TAU), d = rnd(0, ARENA.r - 50); gstrike(ARENA.x + Math.cos(a) * d, ARENA.y + Math.sin(a) * d, 0.9 + i * 0.09, 50); } gstrike(player.x, player.y, 0.9, 50); this.state = 'idle'; this.st = rest(2.2); }
      } else if (this.state === 'tempest') {
        this.ct -= dt; this.cy += dt * 1.7;
        if (this.ct <= 0) { this.ct = 0.2; for (let i = 0; i < 5; i++) ebul(this.x, this.y + 30, this.cy + i * TAU / 5, 150, 8, GB({ c: i % 2 ? GD2 : GD3, life: 4.5 })); }
        this.mt = (this.mt || 0) - dt; if (this.mt <= 0) { this.mt = 1.6; this.hi = (this.hi + 1) % 2; const h = H[this.hi]; gzone(player.x, player.y, 74, 0.85, 0.2); const px = player.x, py = player.y; h.x = px; h.y = py - 40; this.sx = px; this.sy = py; this.slamT = 0.85; }
        if (this.slamT > 0) { this.slamT -= dt; if (this.slamT <= 0) { gpool(this.sx, this.sy, 48, 2); wave(this.sx, this.sy, 230, 200, { w: 20, c: GD4 }); shake = 8; } }
        if (this.st <= 0) { this.state = 'idle'; this.st = rest(1.8); }
      } else if (this.state === 'wrath') {
        moveHand(H[0], this.x - 90, this.y + 20, 5, dt); moveHand(H[1], this.x + 90, this.y + 20, 5, dt); this.eye = 0.2;
        this.ct -= dt; this.mt = (this.mt || 0) - dt;
        if (this.ct <= 0) { this.ct = 0.5; fan(this.x, this.y + 20, toP, 5, 0.38, 210, 8, GB({ c: GD4, life: 3.4 })); }
        if (this.mt <= 0) { this.mt = 0.38; gstrike(player.x + rnd(-110, 110), player.y + rnd(-110, 110), 0.7, 50); }
        if (this.st <= 0) { this.state = 'idle'; this.st = rest(1.8); }
      }
      inArena(this);
    };
    b.draw = function () {
      const x = this.x, y = this.y, f = this.flash > 0, p3 = this.ph === 3, T = time;
      // storm cloud throne
      ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.beginPath(); ctx.ellipse(x, y + 210, 90, 16, 0, 0, TAU); ctx.fill();
      for (let i = 0; i < 9; i++) { const cx = x - 120 + i * 30, cy = y + 52 + Math.sin(T * 1.2 + i) * 5 + Math.abs(i - 4) * 4; ctx.fillStyle = f ? '#fff' : (i % 2 ? '#3a4466' : '#4a5580'); ctx.beginPath(); ctx.arc(cx, cy, 34 - Math.abs(i - 4) * 2, 0, TAU); ctx.fill(); }
      for (let i = 0; i < 7; i++) { const cx = x - 90 + i * 30, cy = y + 28 + Math.sin(T * 1.5 + i * 1.3) * 4; ctx.fillStyle = f ? '#fff' : (i % 2 ? '#56608a' : '#6a76a8'); ctx.beginPath(); ctx.arc(cx, cy, 30, 0, TAU); ctx.fill(); }
      // aegis halo
      if (this.aegis) { ctx.strokeStyle = 'rgba(127,208,255,' + (0.45 + Math.sin(T * 6) * 0.15) + ')'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(x, y - 6, 92 + Math.sin(T * 4) * 3, 0, TAU); ctx.stroke(); ctx.fillStyle = 'rgba(127,208,255,.12)'; ctx.fill(); for (const p of this.pylons) if (p.hp > 0) { ctx.strokeStyle = 'rgba(127,208,255,.5)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, y); let px = x, py = y; for (let k = 1; k <= 6; k++) { px = x + (p.x - x) * k / 6 + rnd(-8, 8); py = y + (p.y - y) * k / 6 + rnd(-8, 8); ctx.lineTo(px, py); } ctx.lineTo(p.x, p.y); ctx.stroke(); } }
      // robe and shoulders
      ctx.fillStyle = f ? '#fff' : '#e8e4f4'; ctx.beginPath(); ctx.moveTo(x - 70, y + 40); ctx.quadraticCurveTo(x - 76, y - 26, x - 34, y - 34); ctx.lineTo(x + 34, y - 34); ctx.quadraticCurveTo(x + 76, y - 26, x + 70, y + 40); ctx.closePath(); ctx.fill();
      ctx.fillStyle = f ? '#fff' : '#3a6ab8'; ctx.globalAlpha = 0.55; ctx.beginPath(); ctx.moveTo(x - 60, y + 30); ctx.quadraticCurveTo(x - 40, y - 20, x - 10, y - 30); ctx.lineTo(x + 6, y + 40); ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
      ctx.fillStyle = f ? '#fff' : GD4; ctx.beginPath(); ctx.moveTo(x - 66, y + 4); ctx.lineTo(x + 66, y + 4); ctx.lineTo(x + 68, y + 14); ctx.lineTo(x - 68, y + 14); ctx.fill(); ctx.fillStyle = '#7fd0ff'; ctx.beginPath(); ctx.arc(x, y + 9, 7, 0, TAU); ctx.fill();
      // head: huge bearded face with stern brow
      ctx.fillStyle = f ? '#fff' : '#f0c8a0'; ctx.beginPath(); ctx.ellipse(x, y - 48, 31, 35, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = f ? '#fff' : '#f6f6ff'; ctx.beginPath(); ctx.ellipse(x, y - 70, 39, 28, 0, Math.PI, TAU); ctx.fill(); for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(x + s * 34, y - 52, 11, 30, s * 0.15, 0, TAU); ctx.fill(); }
      ctx.beginPath(); ctx.moveTo(x - 29, y - 40); ctx.quadraticCurveTo(x - 36, y + 22, x, y + 38); ctx.quadraticCurveTo(x + 36, y + 22, x + 29, y - 40); ctx.quadraticCurveTo(x, y - 24, x - 29, y - 40); ctx.fill();
      ctx.strokeStyle = f ? '#fff' : '#d4d4e4'; ctx.lineWidth = 2; for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(x + i * 8, y - 18); ctx.quadraticCurveTo(x + i * 10, y + 6, x + i * 6, y + 26); ctx.stroke(); }
      const eyeC = this.eye > 0 || p3 ? '#ffe9a8' : '#7fd0ff', eg = this.eye > 0 ? 9 : 5; ctx.fillStyle = eyeC; ctx.shadowColor = eyeC; ctx.shadowBlur = 0; ctx.beginPath(); ctx.ellipse(x - 12, y - 52, 8, eg * 0.7, 0, 0, TAU); ctx.ellipse(x + 12, y - 52, 8, eg * 0.7, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#6a6a84'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(x - 24, y - 64); ctx.lineTo(x - 3, y - 54); ctx.moveTo(x + 24, y - 64); ctx.lineTo(x + 3, y - 54); ctx.stroke();
      // laurel crown + crackling halo
      ctx.strokeStyle = GD4; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y - 70, 38, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke(); ctx.fillStyle = '#3aa060'; for (let i = 0; i < 9; i++) { const a = Math.PI * 1.07 + i * 0.1; ctx.beginPath(); ctx.ellipse(x + Math.cos(a) * 38, y - 70 + Math.sin(a) * 38, 6, 3, a + 1.5, 0, TAU); ctx.fill(); }
      ctx.strokeStyle = p3 ? '#fff' : '#bfe8ff'; ctx.lineWidth = 2; for (let i = 0; i < (p3 ? 8 : 4); i++) { const a = rnd(Math.PI * 0.9, Math.PI * 2.1), r0 = 52 + rnd(0, 18); ctx.beginPath(); let px = x + Math.cos(a) * r0, py = y - 50 + Math.sin(a) * r0; ctx.moveTo(px, py); for (let k = 0; k < 4; k++) { px += Math.cos(a) * 11 + rnd(-8, 8); py += Math.sin(a) * 11 + rnd(-8, 8); ctx.lineTo(px, py); } ctx.stroke(); }
      if (this.stun > 0) { ctx.fillStyle = '#fff'; ctx.font = 'bold 22px ' + FONT; ctx.textAlign = 'center'; ctx.fillText('* * *', x, y - 120 + Math.sin(T * 8) * 4); }
      // lattice anchors
      if (this.gp) for (const p of this.gp) { ctx.fillStyle = GD4; ctx.beginPath(); ctx.arc(p[0], p[1], 9 + Math.sin(T * 12) * 2, 0, TAU); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(p[0], p[1], 4, 0, TAU); ctx.fill(); }
      // pylons
      for (const p of this.pylons) { if (p.hp <= 0) { ctx.fillStyle = '#2a2a3a'; ctx.beginPath(); ctx.arc(p.x, p.y + 6, 14, 0, TAU); ctx.fill(); continue; } const pf = p.flash > 0; ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(p.x, p.y + 26, 22, 7, 0, 0, TAU); ctx.fill(); ctx.fillStyle = pf ? '#fff' : '#8a90b0'; ctx.fillRect(p.x - 10, p.y - 6, 20, 32); ctx.fillStyle = pf ? '#fff' : '#b0b6d4'; ctx.beginPath(); ctx.moveTo(p.x - 12, p.y - 6); ctx.lineTo(p.x, p.y - 34); ctx.lineTo(p.x + 12, p.y - 6); ctx.fill(); ctx.fillStyle = GD3; ctx.beginPath(); ctx.arc(p.x, p.y - 38, 8 + Math.sin(p.t * 6) * 2, 0, TAU); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(p.x, p.y - 38, 3, 0, TAU); ctx.fill(); ctx.fillStyle = '#000'; ctx.fillRect(p.x - 18, p.y + 32, 36, 5); ctx.fillStyle = '#7fd0ff'; ctx.fillRect(p.x - 17, p.y + 33, 34 * p.hp / p.max, 3); }
      // giant hands
      for (let i = 0; i < 2; i++) { const h = this.hands[i], s = i ? 1 : -1, fl = f; ctx.save(); ctx.translate(h.x, h.y); ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(0, 50, 36, 10, 0, 0, TAU); ctx.fill(); ctx.fillStyle = fl ? '#fff' : '#f0c8a0'; ctx.beginPath(); ctx.ellipse(0, 0, 36, 32, 0, 0, TAU); ctx.fill(); for (let k = -2; k <= 1; k++) { ctx.beginPath(); ctx.ellipse(k * 14 + 7, -28, 7, 15, k * 0.1, 0, TAU); ctx.fill(); } ctx.beginPath(); ctx.ellipse(s * -36, -4, 8, 16, s * 0.6, 0, TAU); ctx.fill(); ctx.strokeStyle = '#d0a070'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 6, 18, 0.2, 2.9); ctx.stroke(); ctx.strokeStyle = GD4; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(0, 30, 26, 0.1, 3.0); ctx.stroke(); ctx.restore(); }
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
  function newHero() { const p = newPlayer(); Object.assign(p, { hp: 8, maxHp: 8, speed: 205, shots: 1, fireDelay: 0.2, dashCd: 2.2, dmg: 1.1, invDur: 0.8 }); return p; }
  function startBossMode() {
    bossMode = true; state = S.FIGHT; resetWorld(); pillars = mkPillars('arena'); player = newHero(); player.x = ARENA.x; player.y = ARENA.y + ARENA.r - 60; player.inv = 1;
    boss = mkOverlord(); introT = 0; runTime = 0; ai.dir = { x: 0, y: 0 }; toastMsg('You are the boss! Kill the hero.', 3.5);
  }
  function endBossMode(win) { state = S.OVER; deadT = 0; overTitle = win ? 'THE HERO HAS FALLEN!' : 'YOU WERE SLAIN'; blip(win ? 600 : 90, 0.8, win ? 'square' : 'sawtooth', 0.1, win ? 2 : 0.4); }
  const ai = { dir: { x: 0, y: 0 }, prev: null, dashCheck: 0 };
  function heroAI(dt) {                                   // a mediocre dodger: scores 16 moves against everything that will hit in the next half second
    const p = player; p.inv = Math.max(0, p.inv - dt); p.dashCdT = Math.max(0, p.dashCdT - dt); p.slow = Math.max(0, p.slow - dt);
    const bs = boss, bv = ai.prev ? { x: (bs.x - ai.prev.x) / Math.max(dt, 0.001), y: (bs.y - ai.prev.y) / Math.max(dt, 0.001) } : { x: 0, y: 0 }; ai.prev = { x: bs.x, y: bs.y };
    const spd = p.speed * (p.slow > 0 ? 0.5 : 1), HZ = [0.08, 0.16, 0.24];
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
    for (let i = 0; i < 16; i++) { const a = i * TAU / 16, dx = Math.cos(a), dy = Math.sin(a), c = danger(p.x + dx * spd * 0.2, p.y + dy * spd * 0.2, dx * spd, dy * spd) + (ai.dir.x * dx + ai.dir.y * dy < 0 ? 0.3 : 0) + (Math.random() * 1.2); if (c < bestC) { bestC = c; best = { x: dx, y: dy }; } }
    ai.rt = (ai.rt || 0) - dt; if (ai.rt <= 0) { ai.rt = 0.22; ai.pick = (best && (bestC < stayC - 0.15 || stayC > 0.4)) ? best : null; if (Math.random() < 0.12) ai.pick = null; } let dx = 0, dy = 0; if (ai.pick) { dx = ai.pick.x; dy = ai.pick.y; ai.dir = ai.pick; }
    let sp = spd;
    if (p.dashT > 0) { p.dashT -= dt; sp = 640; dx = p.dashDir.x; dy = p.dashDir.y; if (Math.random() < 0.8) parts.push({ x: p.x, y: p.y, vx: 0, vy: 0, life: 0.25, max: 0.25, c: '#9deaff', r: 6 }); }
    else if (p.dashCdT <= 0 && stayC > 9 && bestC < stayC - 6 && (dx || dy) && Math.random() < 0.35) { p.dashT = 0.17; p.dashCdT = p.dashCd; p.dashDir = { x: dx, y: dy }; }
    p.x += dx * sp * dt; p.y += dy * sp * dt;
    for (const s of pillars) { const d = Math.hypot(p.x - s.x, p.y - s.y), m = s.r + p.r; if (d < m) { p.x = s.x + (p.x - s.x) / d * m; p.y = s.y + (p.y - s.y) / d * m; } }
    inArena(p, p.r + 6);
    // aim with lead and fire
    const tt = Math.hypot(bs.x - p.x, bs.y - p.y) / 560, ax = bs.x + bv.x * tt * 0.4 - p.x, ay = bs.y + bv.y * tt * 0.4 - p.y; p.face = Math.atan2(ay, ax) + Math.sin(time * 1.7) * 0.12; p.fireT -= dt;
    if (p.fireT <= 0) { p.fireT = p.fireDelay; for (let i = 0; i < p.shots; i++) { const a = p.face + (i - (p.shots - 1) / 2) * 0.07; pBul.push({ x: p.x + Math.cos(a) * 16, y: p.y + Math.sin(a) * 16, vx: Math.cos(a) * 560, vy: Math.sin(a) * 560, r: 5, life: 0.9, dmg: p.dmg, hits: [] }); } }
  }

  // ------------------------------------------------------------------ flow
  function resetWorld() { minions = []; pBul = []; eBul = []; hazards = []; parts = []; boss = null; shake = 0; }
  function mkPillars(kind) {
    if (kind === 'arena') { return [[-140, -110], [140, -110], [-140, 130], [140, 130]].map(([dx, dy]) => ({ x: ARENA.x + dx, y: ARENA.y + dy, r: 24 })); }
    return [{ x: 330, y: 250, r: 26 }, { x: 560, y: 470, r: 30 }, { x: 740, y: 230, r: 22 }];
  }
  // ---- save slots: three separate games, progress is saved automatically every time you reach the camp
  const SLOT_KEY = 'bossRush.slots';
  let slots = loadSlots(), slot = -1, eraseArm = -1;
  function loadSlots() { try { const a = JSON.parse(localStorage.getItem(SLOT_KEY)); if (Array.isArray(a)) return [0, 1, 2].map(i => a[i] || null); } catch (e) { /* ignore */ } return [null, null, null]; }
  function writeSlots() { try { localStorage.setItem(SLOT_KEY, JSON.stringify(slots)); } catch (e) { /* ignore */ } }
  function saveSlot() { if (slot < 0 || bossMode) return; slots[slot] = { idx: bossIdx, p: player, t: runTime }; writeSlots(); }
  function pickSlot(i, erase) {
    if (erase) { if (eraseArm === i) { slots[i] = null; writeSlots(); eraseArm = -1; } else eraseArm = i; return; }
    eraseArm = -1; slot = i; const sv = slots[i];
    if (sv && sv.idx < BOSSES.length) { bossMode = false; player = Object.assign(newPlayer(), sv.p); bossIdx = sv.idx; runTime = sv.t || 0; resetWorld(); if (bossIdx === 30) startStory('p2'); else enterHub(false); } else startStory();
  }
  function toTitle(clearSlot) { if (clearSlot && slot >= 0) { slots[slot] = null; writeSlots(); } bossMode = false; slot = -1; eraseArm = -1; boss = null; resetWorld(); player = newPlayer(); state = S.TITLE; }
  function newRun() { bossMode = false; player = newPlayer(); bossIdx = 0; runTime = 0; resetWorld(); enterHub(true); }
  function enterHub(first) {
    bossMode = false;
    state = S.HUB; resetWorld(); pillars = mkPillars('hub');
    if (first) { player.x = 140; player.y = 400; } else { player.x = 150; player.y = 380; player.hp = Math.min(player.maxHp, player.hp + 2); }
    player.inv = 0.5; player.dashT = 0; hub.t = 0;
    toastMsg(first ? 'You wake up deep in a cave...' : bossIdx === 5 ? 'The LAVA PORTAL has opened! The underworld awaits...' : bossIdx === 10 ? 'The ACID PORTAL has opened! Another realm awaits...' : bossIdx === 15 ? 'The DREAMLAND PORTAL has opened! Sweet dreams...' : bossIdx === 20 ? 'The SHADOW PORTAL has opened! The final darkness awaits...' : bossIdx === 25 ? 'A GOLDEN PORTAL has opened! The Land of the Gods awaits...' : bossIdx === 30 ? 'A COSMIC PORTAL has opened! Part Two: Intergalactic Journey...' : bossIdx === 35 || bossIdx === 40 || bossIdx === 45 || bossIdx === 50 ? 'A new planet awaits through the portal...' : bossIdx === 54 ? 'The WORLD EATER awaits! This is the final battle!' : 'You rest by the fire. Next: ' + BOSS_NAMES[bossIdx], first ? 3 : bossIdx === 5 || bossIdx === 10 || bossIdx === 15 || bossIdx === 20 || bossIdx === 25 ? 4 : 2.4);
    if (bossIdx === 5 || bossIdx === 10 || bossIdx === 15 || bossIdx === 20 || bossIdx === 25) shake = 14;
    saveSlot();
  }
  const BOSS_NAMES = ['Rock Golem', 'Bat Queen', 'Slime King', 'Spider Matriarch', 'Crystal Wyrm', 'Hellhound', 'Ash Witch', 'Obsidian Titan', 'Demon Lord', 'Infernal Dragon', 'Acid Scorpion', 'Venom Hydra', 'Toxic Wraith', 'Bile Leviathan', 'Acid Overmind', 'The Sandman', 'Nightmare Stallion', 'Plush Terror', 'Lunar Moth', 'Dream Eater', 'Shade Stalker', 'Umbral Knight', 'Night Reaper', 'Black Sun', 'The Shadow King', 'Hermes', 'Ares', 'Poseidon', 'Apollo', 'Zeus'];
  const hub = { t: 0, portal: { x: 850, y: 355, r: 40 }, fire: { x: 470, y: 360 } };
  function startFight() {
    bossMode = false;
    toast = null;
    fightIdx = bossIdx; state = S.FIGHT; resetWorld(); pillars = mkPillars('arena'); boss = BOSSES[bossIdx](); { const hm = HM[realmOf(bossIdx)] * (bossIdx >= 17 && bossIdx <= 19 ? 1.6 : bossIdx >= 23 && bossIdx <= 29 ? 32 : bossIdx >= 47 ? 32000 : bossIdx >= 41 ? 3200 : bossIdx >= 31 ? 160 : bossIdx >= 30 ? 8 : 1); boss.hp = boss.max = Math.round(boss.hp * hm); } introT = 2.2;
    player.x = ARENA.x; player.y = ARENA.y + ARENA.r - 50; player.inv = 1; player.dashT = 0;
    blip(120, 0.6, 'sawtooth', 0.08, 0.6);
  }
  const DEFEAT_LINES = [
    'The Rock Golem has crumbled to dust. The cave stops shaking.',
    'The Bat Queen has fallen. The cave is quiet at last.',
    'The Slime King has melted away. The cave floor is clean again.',
    'The Spider Matriarch has been defeated. The webs fade and the cave can breathe.',
    'The Crystal Wyrm has been defeated. The cave is now peaceful.',
    'The Hellhound has been put down. The fires of the underworld burn lower.',
    'The Ash Witch is gone. Her curses scatter like cinders.',
    'The Obsidian Titan has shattered. The underworld falls silent.',
    'The Demon Lord has been banished. His throne lies empty.',
    'The Infernal Dragon has fallen. The underworld is finally at peace.',
    'The Acid Scorpion has been defeated. Its venom stops dripping.',
    'The Venom Hydra has been slain. Its many heads rest at last.',
    'The Toxic Wraith has faded away. The green mist clears.',
    'The Bile Leviathan has sunk beneath the ground. The acid stops churning.',
    'The Acid Overmind has dissolved. The acid realm is safe again.',
    'The Sandman has been defeated. His dust settles and the dream drifts on gently.',
    'The Nightmare Stallion has vanished into the dark. The nightmares fade.',
    'The Plush Terror has gone limp. It is only a teddy bear again.',
    'The Lunar Moth has fluttered away. The moon shines calmly.',
    'The Dream Eater has been defeated. The dream is over. You may finally wake up.',
    'The Shade Stalker has dissolved. The shadows no longer whisper.',
    'The Umbral Knight has fallen. His dark armor lies empty.',
    'The Night Reaper has been defeated. No more souls will be harvested.',
    'The Black Sun has gone out. Light slips back into the world.',
    'The Shadow King has been defeated. The darkness is broken and the light returns.',
    'Hermes has been caught at last. The winds fall still.',
    'Ares has fallen. The battlefield goes quiet.',
    'Poseidon has been defeated. The seas grow calm.',
    'Apollo has been defeated. The sun sets gently over Olympus.',
    'Zeus has been defeated. The Land of the Gods is at peace, and you are a legend.'
  ];
  function bossDefeated() {
    burst(boss.x, boss.y, 50, '#ffd23f', 320); shake = 18; blip(300, 0.8, 'sawtooth', 0.1, 0.2);
    eBul.length = 0; hazards.length = 0; for (const m of minions) burst(m.x, m.y, 8, '#fff', 120); minions.length = 0;
    bossIdx++; saveBest(bossIdx); boss.dead = true; deadT = 0; state = S.FIGHT; boss.dying = true; boss.air = 0; boss.line = DEFEAT_LINES[fightIdx] || 'The boss has been defeated.'; boss.deadEnd = 1.6 + boss.line.length / 38 + 2.2; boss.side = Math.random() < 0.5 ? -1 : 1; fanfare(); blip(420, 1.8, 'sawtooth', 0.08, 0.12);
  }
  function offerUpgrades() { if (bossIdx === 30) { startStory('end'); return; } if (bossIdx >= BOSSES.length) { startStory('end2'); return; } const pool = (bossIdx >= 31 ? UPGRADES7 : bossIdx >= 26 ? UPGRADES6 : bossIdx >= 21 ? UPGRADES5 : bossIdx >= 16 ? UPGRADES4 : bossIdx >= 11 ? UPGRADES3 : bossIdx >= 6 ? UPGRADES2 : UPGRADES).concat(player.laser ? LASER_UPG : []).filter(u => !u.ok || u.ok(player)); offered = []; while (offered.length < 3 && pool.length) offered.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]); state = S.UPGRADE; }
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
    lzCheck(p); p.laser = p.laserReady && !!p.laserOn;
    if (p.laserReady && !p._lt) { p._lt = true; toastMsg('Laser gun available! Click GET LASER GUN at the top of the screen.', 3.5); } if (!p.laserReady) p._lt = false;
    p.beams = null; if (introT > 0) aiming = false;
    if (p.laser && !p.ultra) { if (aiming && !(state === S.FIGHT && boss && boss.dying)) fireLaser(p, dt); return; }
    if (aiming && p.fireT <= 0 && !(state === S.FIGHT && boss && boss.dying)) {
      const ul = p.ultra; p.fireT = ul ? 0.035 : p.fireDelay; const n = ul ? Math.max(3, p.shots) : p.shots;
      for (let i = 0; i < n; i++) { const a = p.face + (n === 1 ? 0 : (i - (n - 1) / 2) * (ul ? 0.09 : 0.16)); pBul.push({ x: p.x + Math.cos(a) * 16, y: p.y + Math.sin(a) * 16, vx: Math.cos(a) * (ul ? 900 : 560), vy: Math.sin(a) * (ul ? 900 : 560), r: ul ? 8 : 5, life: 0.9, dmg: admin.onehit ? 99999 : ul ? 30 : p.dmg, pierce: !!ul || !!p.pierce, hits: [], c: ul ? '#7fffd4' : p.maxed ? '#ff7ad9' : p.pierce ? '#ffb347' : null }); }
      blip(520 + Math.random() * 60, 0.06, 'square', 0.025, 0.6);
    }
  }

  function lzCheck(p) {                                  // laser gun: super maxed gun, or automatically from Part Two on
    p.laserReady = !bossMode && !!(p.maxed || p.shots >= 17 || bossIdx >= 30);
    if (p.laserReady && bossIdx >= 30) { if (!p._lzAuto) toastMsg('PART TWO: LASER GUN equipped for good!', 3.5); p._lzAuto = true; p.laserOn = true; }
  }
  function fireLaser(p, dt) {
    const nb = 1 + 2 * (p.lb || 0), lw = p.lw || 1, dps = p.dmg * p.shots / Math.max(0.04, p.fireDelay) * 0.36 * (p.ld || 1);
    p.beams = [];
    for (let k = 0; k < nb; k++) {
      const off = (k - (nb - 1) / 2) * 0.13, a = p.face + off, cx = Math.cos(a), cy = Math.sin(a), ox = p.x + cx * 14, oy = p.y + cy * 14;
      let L = 1100; { const bx = ox - ARENA.x, by = oy - ARENA.y, bb = bx * cx + by * cy, cc = bx * bx + by * by - ARENA.r * ARENA.r, dd = bb * bb - cc; if (dd > 0) L = Math.min(L, -bb + Math.sqrt(dd)); }
      for (const s of pillars) { const dx = s.x - ox, dy = s.y - oy, t = dx * cx + dy * cy, pr = Math.abs(-dx * cy + dy * cx); if (t > 0 && pr < s.r) L = Math.min(L, t - Math.sqrt(s.r * s.r - pr * pr)); }
      L = Math.max(0, L); p.beams.push({ x: ox, y: oy, a, L });
      const dist = o => { const dx = o.x - ox, dy = o.y - oy, t = clamp(dx * cx + dy * cy, 0, L); return Math.hypot(dx - cx * t, dy - cy * t); };
      const per = dps * dt * (nb > 1 ? 0.7 : 1), wid = 7 * lw;
      for (const m of minions) if (m.hp > 0 && dist(m) < m.r + wid) { m.hp -= per; m.flash = 0.08; if (m.hp <= 0) { burst(m.x, m.y, 10, '#fff', 150); blip(200, 0.1, 'square', 0.04, 0.5); } }
      if (boss && boss.pylons) for (const q of boss.pylons) if (q.hp > 0 && dist(q) < q.r + wid) { q.hp -= per; q.flash = 0.08; if (q.hp <= 0) { burst(q.x, q.y, 24, '#7fd0ff', 220); blip(120, 0.3, 'sawtooth', 0.08); shake = 8; } }
      if (boss && !boss.dying && !(boss.air > 0.3) && dist(boss) < boss.r + wid - 4) {
        const fb = { vx: cx, vy: cy, x: ox, y: oy };
        if (boss.reflect && boss.reflect(fb)) { if (Math.random() < 0.3) burst(boss.x, boss.y, 2, '#bfe8ff', 120); continue; }
        boss.hp -= per * (boss.stun > 0 ? 1.5 : 1) * (boss.aegis ? 0.12 : 1) * (boss.dmgMul ? boss.dmgMul(fb) : 1); boss.flash = 0.07;
        if (Math.random() < 0.5) burst(ox + cx * Math.min(L, Math.hypot(boss.x - ox, boss.y - oy)), oy + cy * Math.min(L, Math.hypot(boss.x - ox, boss.y - oy)), 1, '#ffd23f', 110);
        if (boss.hp <= 0) { boss.hp = 0; if (bossMode) endBossMode(false); else bossDefeated(); }
      }
    }
    if (Math.random() < dt * 14) blip(300 + Math.random() * 80, 0.05, 'sawtooth', 0.02, 0.6);
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
      if (b.life > 0 && boss && boss.pylons) for (const p of boss.pylons) if (p.hp > 0 && !(b.hits && b.hits.includes(p)) && hitCircle(b, p)) { p.hp -= (b.dmg || player.dmg); p.flash = 0.08; if (b.pierce) b.hits.push(p); else b.life = 0; burst(b.x, b.y, 4, '#7fd0ff', 100); blip(300, 0.04, 'square', 0.03); if (p.hp <= 0) { burst(p.x, p.y, 24, '#7fd0ff', 220); blip(120, 0.3, 'sawtooth', 0.08); shake = 8; } if (!b.pierce) break; }
      if (b.life > 0 && boss && boss.reflect && !boss.dying && !(boss.air > 0.3) && hitCircle(b, boss, 6) && boss.reflect(b)) { eBul.push({ x: b.x, y: b.y, vx: -b.vx * 0.6, vy: -b.vy * 0.6, r: 7, life: 3, c: '#bfe8ff' }); b.life = 0; burst(b.x, b.y, 4, '#bfe8ff', 120); blip(900, 0.04, 'sine', 0.03); continue; }
      if (b.life > 0 && boss && !boss.dying && !(b.hits && b.hits.includes(boss)) && !(boss.air > 0.3) && hitCircle(b, boss, -4)) { boss.hp -= (b.dmg || player.dmg) * (boss.stun > 0 ? 1.5 : 1) * (boss.aegis ? 0.12 : 1) * (boss.dmgMul ? boss.dmgMul(b) : 1); boss.flash = 0.07; if (b.pierce) b.hits.push(boss); else b.life = 0; burst(b.x, b.y, 3, '#ffd23f', 110); blip(160, 0.05, 'square', 0.03); if (boss.hp <= 0) { boss.hp = 0; if (bossMode) endBossMode(false); else bossDefeated(); } }
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
    if (state === S.FIGHT && boss && boss.dying) { deadT += dt; deathFx(dt); if (deadT < 1.8 && Math.random() < 0.3) burst(boss.x + rnd(-40, 40), boss.y + rnd(-40, 40), 4, pick(['#ffd23f', '#ff7a3d', '#fff']), 200); boss.flash = deadT < 1.2 && Math.floor(deadT * 14) % 2 ? 0.05 : 0; if (deadT < 2.2 && Math.random() < 0.3) burst(boss.x + rnd(-30, 30), boss.y + 30, 2, '#cfc6bd', 90); if (deadT > boss.deadEnd) { boss = null; offerUpgrades(); } }
  }

  function updateHub(dt) {
    movePlayer(dt); hub.t += dt;
    if (dist(player, hub.portal) < hub.portal.r + 8) startFight();
    for (const b of pBul) { b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt; for (const s of pillars) if (Math.hypot(b.x - s.x, b.y - s.y) < s.r + b.r) b.life = 0; if (b.x < HUB_BOX.x1 || b.x > HUB_BOX.x2 || b.y < HUB_BOX.y1 || b.y > HUB_BOX.y2) b.life = 0; }
    pBul = pBul.filter(b => b.life > 0);
  }

  function update(dt) {
    if (!bossMode && player && player.maxHp > 13) player.maxHp = 13; if (player && player.hp > player.maxHp) player.hp = player.maxHp; 
    time += dt; if (toast) { toast.life -= dt; if (toast.life <= 0) toast = null; }
    shake = Math.max(0, shake - dt * 30); setTrack(wantTrack());
    for (const p of parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.94; p.vy *= 0.94; p.life -= dt; } parts = parts.filter(p => p.life > 0);
    if (paused || admin.open) return;
    if (state === S.HUB) updateHub(dt);
    else if (state === S.FIGHT) updateFight(dt);
    else if (state === S.OVER) deadT += dt;
    else if (state === S.STORY) { storyT += dt; if (storyT >= STORY[storyI].d) nextStory(); }
    else if (state === S.UPGRADE) { player.inv = 99; }
  }

  // ------------------------------------------------------------------ drawing
  function noiseDots(g, n, cols, w, h, rmax) { for (let i = 0; i < n; i++) { g.fillStyle = pick(cols); g.beginPath(); g.arc(Math.random() * w, Math.random() * h, 1 + Math.random() * rmax, 0, TAU); g.fill(); } }
  const PALS = [
    { bg: '#120f0e', n1: ['#1c1714', '#0d0b0a', '#241d19'], rock: '#2d2722', sh: '#000', shb: 30, n2: ['#352e28', '#27211d', '#3d352e', '#221c18'], crack: null, spike: ['#3a322b', '#2c2621', '#463d34'], gem: ['#7fe3ff', '#c77dff', '#ff9dd2'] },
    { bg: '#0f0504', n1: ['#1f0b08', '#0a0302', '#2a100b'], rock: '#3a1812', sh: '#ff4a10', shb: 36, n2: ['#44201a', '#2f130f', '#512620', '#26100c'], crack: ['rgba(255,110,30,.55)', '#ff6a1a'], spike: ['#3a1a14', '#2a120e', '#4a2018'], gem: ['#ff6a1a', '#ffb347', '#ff3d3d'] },
    { bg: '#040d06', n1: ['#0a1c0d', '#030a04', '#102a14'], rock: '#16301a', sh: '#5dff2a', shb: 36, n2: ['#1c4222', '#12301a', '#235228', '#0e2412'], crack: ['rgba(140,255,60,.55)', '#7dff3a'], spike: ['#173a1c', '#0f2a14', '#1f4a24'], gem: ['#9dff3a', '#e6ff5a', '#3affb0'] },
    { bg: '#0b0720', n1: ['#140c33', '#07041a', '#1c1245'], rock: '#2a1d5c', sh: '#c77dff', shb: 36, n2: ['#33246e', '#221552', '#40307f', '#1a1040'], crack: ['rgba(255,157,210,.55)', '#ff9dd2'], spike: ['#2f2266', '#201550', '#3d2e80'], gem: ['#ff9dd2', '#7fe3ff', '#ffe9a8'] },
    { bg: '#040407', n1: ['#0a0a12', '#020204', '#12121c'], rock: '#14141e', sh: '#ff2d55', shb: 30, n2: ['#1c1c28', '#10101a', '#242434', '#0c0c14'], crack: ['rgba(255,45,85,.5)', '#ff2d55'], spike: ['#181824', '#0e0e16', '#222232'], gem: ['#ff2d55', '#d0d4ff', '#8a8aff'] },
    { bg: '#141a30', n1: ['#1c2442', '#0e1328', '#26305a'], rock: '#4a4f6c', sh: '#ffd23f', shb: 34, n2: ['#565c7c', '#40456a', '#626888', '#363a5a'], crack: ['rgba(255,214,90,.5)', '#ffd23f'], spike: ['#e8e0c8', '#cfc7b0', '#f4eedc'], gem: ['#ffd23f', '#7fd0ff', '#fff7d0'] }
  ];
  function makeBG(kind, realm) {
    const under = realm > 0, P = PALS[realm | 0];
    const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
    g.fillStyle = P.bg; g.fillRect(0, 0, W, H); noiseDots(g, 900, P.n1, W, H, 7);
    if (P.stars) { for (let i = 0; i < 360; i++) { g.fillStyle = 'rgba(255,255,255,' + rnd(0.2, 0.95) + ')'; const sz = rnd(1, 2.6); g.fillRect(Math.random() * W, Math.random() * H, sz, sz); } for (let k = 0; k < 3; k++) { const gx = Math.random() * W, gy = Math.random() * H, gr = g.createRadialGradient(gx, gy, 0, gx, gy, 220); gr.addColorStop(0, P.sh + '33'); gr.addColorStop(1, P.sh + '00'); g.fillStyle = gr; g.fillRect(0, 0, W, H); } }
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
  let bgHub, bgArena, bgHubU, bgArenaU, bgHubA, bgArenaA, bgHubD, bgArenaD, bgHubS, bgArenaS, bgHubG, bgArenaG;
  const realmOf = i => i >= 54 ? 11 : i >= 30 ? 6 + Math.floor((i - 30) / 5) : i >= 25 ? 5 : i >= 20 ? 4 : i >= 15 ? 3 : i >= 10 ? 2 : i >= 5 ? 1 : 0, hubRealm = () => realmOf(Math.max(0, bossIdx - 1)), portalRealm = () => realmOf(bossIdx), arenaRealm = () => bossMode ? 1 : realmOf(fightIdx);

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
    ctx.drawImage(bgOf('hub', hubRealm()), 0, 0);
    drawTorch(150, 170); drawTorch(830, 528);
    // fire
    const f = hub.fire, fl = 1 + Math.sin(time * 12) * 0.12;
    ctx.fillStyle = '#4a4038'; for (let i = 0; i < 8; i++) { ctx.beginPath(); ctx.arc(f.x + Math.cos(i * 0.785) * 26, f.y + 10 + Math.sin(i * 0.785) * 12, 7, 0, TAU); ctx.fill(); }
    ctx.fillStyle = '#5a3f28'; ctx.fillRect(f.x - 20, f.y + 6, 40, 7);
    ctx.fillStyle = '#ff7a1a'; ctx.beginPath(); ctx.moveTo(f.x - 16, f.y + 8); ctx.quadraticCurveTo(f.x - 8, f.y - 30 * fl, f.x, f.y - 44 * fl); ctx.quadraticCurveTo(f.x + 8, f.y - 24 * fl, f.x + 16, f.y + 8); ctx.fill();
    ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.moveTo(f.x - 8, f.y + 8); ctx.quadraticCurveTo(f.x - 3, f.y - 14 * fl, f.x, f.y - 24 * fl); ctx.quadraticCurveTo(f.x + 4, f.y - 12 * fl, f.x + 8, f.y + 8); ctx.fill();
    // portal
    const p = hub.portal; ctx.save(); ctx.translate(p.x, p.y); const pr = portalRealm(); ctx.shadowColor = PORT_SH[pr]; ctx.shadowBlur = 30;
    for (let i = 0; i < 4; i++) { ctx.strokeStyle = PORT_RING[pr][i]; ctx.lineWidth = 4; ctx.beginPath(); ctx.ellipse(0, 0, 22 + i * 7 + Math.sin(time * 3 + i) * 3, 40 + i * 6, time * (i % 2 ? 1 : -1) * 0.6, 0, TAU * 0.78); ctx.stroke(); }
    ctx.fillStyle = PORT_FILL[pr]; ctx.beginPath(); ctx.ellipse(0, 0, 24, 40, 0, 0, TAU); ctx.fill(); ctx.restore();
    ctx.fillStyle = '#ffe9a8'; ctx.font = 'bold 14px ' + FONT; ctx.textAlign = 'center'; ctx.fillText(portalLabel(pr) + ': ' + BOSS_NAMES[bossIdx].toUpperCase(), p.x - 20, p.y - 70); ctx.fillText(PORT_HINT[pr], p.x - 20, p.y - 54);
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
    if (player && player.beams) for (const bm of player.beams) { const ex = bm.x + Math.cos(bm.a) * bm.L, ey = bm.y + Math.sin(bm.a) * bm.L, w = 7 * (player.lw || 1); ctx.save(); ctx.lineCap = 'round'; ctx.globalAlpha = 0.28; ctx.strokeStyle = '#ff7ad9'; ctx.lineWidth = w * 3.4; ctx.beginPath(); ctx.moveTo(bm.x, bm.y); ctx.lineTo(ex, ey); ctx.stroke(); ctx.globalAlpha = 0.8; ctx.strokeStyle = '#ffd0f0'; ctx.lineWidth = w * 1.6 + Math.sin(time * 40) * 1.2; ctx.stroke(); ctx.globalAlpha = 1; ctx.strokeStyle = '#fff'; ctx.lineWidth = w * 0.6; ctx.beginPath(); ctx.moveTo(bm.x, bm.y); ctx.lineTo(ex, ey); ctx.stroke(); ctx.restore(); glowRing(ex, ey, 18 + w, 'rgba(255,208,240,A)', 0.8); }
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
      else if (h.k === 'fire') { const fl = 1 + Math.sin(time * 14 + h.x) * 0.08, al = clamp((h.dur - h.t) / 0.6, 0, 1); ctx.globalAlpha = al; const g = ctx.createRadialGradient(h.x, h.y, 2, h.x, h.y, h.r * fl); g.addColorStop(0, h.holy ? '#ffffff' : h.shadow ? '#ffd0d8' : h.dream ? '#ffe6f6' : h.acid ? '#e8ffa0' : '#ffe08a'); g.addColorStop(0.5, h.holy ? '#ffd23f' : h.shadow ? '#c0183c' : h.dream ? '#b36bff' : h.acid ? '#6fd22a' : '#ff7a1a'); g.addColorStop(1, h.holy ? 'rgba(255,190,40,.3)' : h.shadow ? 'rgba(20,0,10,.5)' : h.dream ? 'rgba(90,40,160,.3)' : h.acid ? 'rgba(20,110,20,.3)' : 'rgba(200,40,10,.25)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(h.x, h.y, h.r * fl, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; }
      else if (h.k === 'web') { ctx.fillStyle = 'rgba(232,240,255,.22)'; ctx.beginPath(); ctx.arc(h.x, h.y, h.r, 0, TAU); ctx.fill(); ctx.strokeStyle = 'rgba(232,240,255,.7)'; ctx.lineWidth = 1.5; for (let i = 0; i < 8; i++) { ctx.beginPath(); ctx.moveTo(h.x, h.y); ctx.lineTo(h.x + Math.cos(i * 0.785) * h.r, h.y + Math.sin(i * 0.785) * h.r); ctx.stroke(); } for (const rr of [0.35, 0.7, 1]) { ctx.beginPath(); ctx.arc(h.x, h.y, h.r * rr, 0, TAU); ctx.stroke(); } }
      else if (h.k === 'wave') { if (h.delay > 0) continue; ctx.strokeStyle = h.c || '#ffb27a'; ctx.lineWidth = h.w; ctx.globalAlpha = 0.7 * (1 - h.r / h.maxR * 0.6); ctx.beginPath(); ctx.arc(h.x, h.y, h.r, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1; }
      else if (h.k === 'beam') { const on = h.t > h.delay; ctx.save(); ctx.translate(h.x, h.y); ctx.rotate(h.a); const R = arenaRealm(), bc = R >= 6 ? P2R[R - 6].acc : R === 5 ? '#ffd23f' : R === 4 ? '#ff2d55' : R === 3 ? '#c77dff' : R === 2 ? '#9dff3a' : R === 1 ? '#ff7a1a' : '#7fe3ff'; if (on) { ctx.globalAlpha = 0.25; ctx.fillStyle = bc; ctx.fillRect(0, -16, h.len, 32); ctx.globalAlpha = 1; ctx.fillRect(0, -9, h.len, 18); ctx.fillStyle = '#fff'; ctx.fillRect(0, -3, h.len, 6); } else { ctx.fillStyle = R >= 6 ? hexA(P2R[R - 6].acc).replace('A', '.4') : R === 5 ? 'rgba(255,210,63,.4)' : R === 4 ? 'rgba(255,45,85,.4)' : R === 3 ? 'rgba(199,125,255,.4)' : R === 2 ? 'rgba(157,255,58,.4)' : R === 1 ? 'rgba(255,122,26,.4)' : 'rgba(127,227,255,.35)'; ctx.fillRect(0, -2, h.len, 4); } ctx.restore(); }
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
    if (state === S.FIGHT && boss) { const bw = 600, bx = (W - bw) / 2, by = H - 30; ctx.fillStyle = 'rgba(0,0,0,.7)'; ctx.fillRect(bx - 3, by - 3, bw + 6, 24); ctx.fillStyle = boss.dying ? '#555' : '#c0283c'; ctx.fillRect(bx, by, bw * clamp(boss.hp / boss.max, 0, 1), 18); ctx.fillStyle = '#fff'; ctx.font = 'bold 13px ' + FONT; ctx.textAlign = 'center'; ctx.shadowColor = '#000'; ctx.shadowBlur = 4; ctx.fillText(boss.name, W / 2, by + 14); ctx.textAlign = 'right'; ctx.font = 'bold 12px ' + FONT; ctx.fillText(Math.max(0, Math.ceil(boss.hp)).toLocaleString() + ' / ' + Math.ceil(boss.max).toLocaleString(), bx + bw - 8, by + 14); ctx.textAlign = 'center'; ctx.shadowBlur = 0; }
    if (toast) { ctx.globalAlpha = clamp(toast.life / 0.4, 0, 1); ctx.fillStyle = '#ffe9a8'; ctx.font = 'bold 22px ' + FONT; ctx.textAlign = 'center'; ctx.shadowColor = '#000'; ctx.shadowBlur = 6; ctx.fillText(toast.t, W / 2, 96); ctx.shadowBlur = 0; ctx.globalAlpha = 1; }
  }
  const fmtTime = t => Math.floor(t / 60) + ':' + String(Math.floor(t % 60)).padStart(2, '0');

  // how each boss dies: [animation, particle colour]
  const DEATH = [['crumble', '#8a7a6a'], ['swarm', '#2a2236'], ['melt', '#6fd22a'], ['flip', '#6a5a4a'], ['shatter', '#7fe3ff'], ['burn', '#ff7a1a'], ['smoke', '#b07dff'], ['crumble', '#3a2a30'], ['implode', '#ff3d3d'], ['topple', '#ff9a3a'],
    ['flip', '#9dff3a'], ['melt', '#9dff3a'], ['smoke', '#9dff3a'], ['sink', '#4a7a2a'], ['explode', '#9dff3a'], ['smoke', '#ffe9a8'], ['topple', '#c77dff'], ['deflate', '#fff3e0'], ['ascend', '#c9e8ff'], ['shatter', '#ff9dd2'], ['smoke', '#8a8aff'], ['crumble', '#ff2d55'], ['smoke', '#d0d4ff'], ['explode', '#ff2d55'], ['shatter', '#ff2d55'], ['implode', '#ffd23f'], ['topple', '#ff5a3d'], ['melt', '#7fd0ff'], ['explode', '#ffd23f'], ['ascend', '#fff7d0']];
  // ================================================================== PART TWO: INTERGALACTIC JOURNEY (bosses 30-54)
  // Data-driven space bosses: a body shape + decoration + colour set + an attack list with parameters.
  const bcA = o => ({ c: o.def.c[2] }), bcB = o => ({ c: o.def.c[3] });
  const zoneCol = o => ({ c: o.def.c[2], tc: hexA(o.def.c[2]).replace('A', '.16') });
  const ATK = {
    ring(o, dt, P, ph) { const c = o.cur; c.t -= dt; if (c.t <= 0) { c.t = P.gap || 0.55; ring(o.x, o.y, (P.n || 14) + (ph - 1) * 2, c.n * 0.4, (P.sp || 170) + ph * 8, 8, c.n % 2 ? bcB(o) : bcA(o)); c.n++; blip(220 + c.n * 20, 0.06, 'square', 0.04); } return c.n >= (P.times || 4); },
    fan(o, dt, P, ph) { const c = o.cur; c.t -= dt; if (c.t <= 0) { c.t = P.gap || 0.55; fan(o.x, o.y, angTo(o, player), (P.n || 5) + (ph - 1), P.spread || 0.9, (P.sp || 200) + ph * 8, 8, Object.assign(bcA(o), P.home ? { home: P.home } : {})); c.n++; blip(300, 0.05, 'sawtooth', 0.04); } return c.n >= (P.times || 4); },
    spiral(o, dt, P, ph) { const c = o.cur; c.e = (c.e || 0) + dt; c.t -= dt; if (c.t <= 0) { c.t = P.rate || 0.09; c.a = (c.a || 0) + (P.turn || 0.5) * (P.dir || 1); const arms = (P.arms || 3) + (ph > 2 ? 1 : 0); for (let i = 0; i < arms; i++) ebul(o.x, o.y, c.a + i * TAU / arms, (P.sp || 150) + ph * 6, 7, i % 2 ? bcB(o) : bcA(o)); } return c.e > (P.dur || 3); },
    rain(o, dt, P, ph) { const c = o.cur; c.t -= dt; if (c.t <= 0) { c.t = P.gap || 0.85; const n = (P.count || 6) + ph; for (let i = 0; i < n; i++) { const a = rnd(0, TAU), d = Math.sqrt(Math.random()) * (ARENA.r - 40); zone(ARENA.x + Math.cos(a) * d, ARENA.y + Math.sin(a) * d, P.r || 46, 0.9, 0.25, Object.assign(zoneCol(o), { onEnd: z => ring(z.x, z.y, 6, rnd(0, 1), 140, 6, bcB(o)) })); } zone(player.x, player.y, P.r || 46, 0.9, 0.25, zoneCol(o)); c.n++; } return c.n >= (P.times || 3); },
    laser(o, dt, P, ph) { const c = o.cur; o.noMove = true; c.e = (c.e || 0) + dt; if (!c.f) { c.f = 1; const N = (P.n || 2) + (ph > 2 ? 1 : 0), a0 = angTo(o, player); for (let i = 0; i < N; i++) addBeam(o.x, o.y, a0 + i * TAU / N, (P.rot || 0.55) * (i % 2 ? -1 : 1) * (1 + (ph - 1) * 0.2), 0.9, 2.6, 560); blip(150, 0.4, 'sawtooth', 0.06); } return c.e > 4; },
    charge(o, dt, P, ph) { const c = o.cur; o.noMove = true; if (c.s === undefined) { c.s = 0; c.ct = 0.75; c.ca = angTo(o, player); c.k2 = 0; } if (c.s === 0) { c.ct -= dt; c.ca = angTo(o, player); if (c.ct <= 0) { c.s = 1; c.ct = 0.5; blip(110, 0.3, 'sawtooth', 0.08); } } else { c.ct -= dt; const sp = (P.speed || 620); o.x += Math.cos(c.ca) * sp * dt; o.y += Math.sin(c.ca) * sp * dt; c.tt = (c.tt || 0) - dt; if (c.tt <= 0) { c.tt = 0.1; zone(o.x, o.y, 22, 0.05, 0.9, zoneCol(o)); } if (c.ct <= 0 || inArena(o)) { c.k2++; if (c.k2 >= (P.times || 2) + (ph > 1 ? 1 : 0)) return true; c.s = 0; c.ct = 0.5; } } return false; },
    mines(o, dt, P, ph) { const c = o.cur; c.t -= dt; if (c.t <= 0) { if (c.n >= (P.times || 3)) return true; c.t = 1.4; const n = (P.count || 5) + ph; for (let i = 0; i < n; i++) { const a = i * TAU / n + rnd(0, 1), d = rnd(60, 190); zone(clamp(player.x + Math.cos(a) * d, ARENA.x - 240, ARENA.x + 240), clamp(player.y + Math.sin(a) * d, ARENA.y - 240, ARENA.y + 240), 44, 1.1, 0.25, Object.assign(zoneCol(o), { onEnd: z => ring(z.x, z.y, 8, rnd(0, 1), 160, 6, bcB(o)) })); } c.n++; } return false; },
    pulse(o, dt, P, ph) { const c = o.cur; c.t -= dt; if (c.t <= 0) { c.t = P.gap || 0.95; wave(o.x, o.y, 250, 520, { w: 20, c: o.def.c[2] }); ring(o.x, o.y, 10 + ph * 2, rnd(0, 1), 120, 7, bcB(o)); shake = 6; c.n++; blip(90, 0.25, 'sawtooth', 0.07); } return c.n >= (P.times || 3); },
    homing(o, dt, P, ph) { const c = o.cur; c.e = (c.e || 0) + dt; if (!c.f) { c.f = 1; const n = (P.n || 4) + ph - 1; for (let i = 0; i < n; i++) ebul(o.x, o.y, i * TAU / n + rnd(0, 1), 120, 9, Object.assign(bcB(o), { home: 1.5, life: 6.5 })); blip(400, 0.2, 'sine', 0.05); } return c.e > (P.wait || 2.4); },
    summon(o, dt, P, ph) { const c = o.cur; c.e = (c.e || 0) + dt; if (!c.f) { c.f = 1; if (minions.length < 5) for (let i = 0; i < (P.n || 2); i++) minions.push(mkDrone(o.x + rnd(-40, 40), o.y + rnd(-30, 30), o.def.c)); burst(o.x, o.y, 14, o.def.c[2], 140); } return c.e > 0.7; },
    blink(o, dt, P, ph) { const c = o.cur; o.noMove = true; c.t -= dt; if (c.t <= 0) { if (c.n >= (P.times || 3) + (ph > 1 ? 1 : 0)) return true; burst(o.x, o.y, 14, o.def.c[2], 160); const a = rnd(0, TAU), d = rnd(50, 170); o.x = ARENA.x + Math.cos(a) * d; o.y = ARENA.y + Math.sin(a) * d; burst(o.x, o.y, 14, '#fff', 160); fan(o.x, o.y, angTo(o, player), 7 + ph, 1.2, 190, 8, bcA(o)); c.n++; c.t = P.gap || 0.9; blip(500, 0.1, 'triangle', 0.06); } return false; },
    wall(o, dt, P, ph) { const c = o.cur; c.t -= dt; if (c.t <= 0) { if (c.n >= (P.times || 3)) return true; c.t = P.gap || 1.35; const vert = c.n % 2 === 0, R = ARENA.r * 0.95; if (vert) { const g = clamp(player.x + rnd(-70, 70), ARENA.x - 190, ARENA.x + 190); for (let i = -9; i <= 9; i++) { const x = ARENA.x + i * 27; if (Math.abs(x - g) < 52) continue; ebul(x, ARENA.y - R, Math.PI / 2, 170 + ph * 8, 8, bcA(o)); } } else { const g = clamp(player.y + rnd(-70, 70), ARENA.y - 190, ARENA.y + 190), s = c.n % 4 === 1 ? 1 : -1; for (let i = -9; i <= 9; i++) { const y = ARENA.y + i * 27; if (Math.abs(y - g) < 52) continue; ebul(ARENA.x - s * R, y, s > 0 ? 0 : Math.PI, 170 + ph * 8, 8, bcB(o)); } } c.n++; blip(180, 0.1, 'square', 0.05); } return false; },
    pull(o, dt, P, ph) { const c = o.cur; c.e = (c.e || 0) + dt; c.t -= dt; const a = angTo(player, o); if (c.e > 0.5) { player.x += Math.cos(a) * (P.f || 85) * dt; player.y += Math.sin(a) * (P.f || 85) * dt; inArena(player); } if (c.t <= 0) { c.t = 0.45; ring(o.x, o.y, 9 + ph * 2, c.e * 2, 125, 8, c.n++ % 2 ? bcB(o) : bcA(o)); } return c.e > (P.dur || 3.2); }
  };
  function mkDrone(x, y, c) {
    return { x, y, r: 11, hp: 6, max: 6, flash: 0, name: 'drone', w: rnd(0, 6), sh: rnd(1, 1.8),
      update(dt) { this.w += dt * 2.5; const d = dist(this, player), a = angTo(this, player), k = d > 190 ? 1 : d < 110 ? -1 : 0; this.x += (Math.cos(a) * k + Math.cos(a + 1.57) * Math.sin(this.w) * 0.8) * 115 * dt; this.y += (Math.sin(a) * k + Math.sin(a + 1.57) * Math.sin(this.w) * 0.8) * 115 * dt; inArena(this); this.sh -= dt; if (this.sh <= 0) { ebul(this.x, this.y, a, 190, 7, { c: c[2] }); this.sh = rnd(1.4, 2); } },
      draw() { const f = this.flash > 0; ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(this.x, this.y + 12, 11, 4, 0, 0, TAU); ctx.fill(); ctx.fillStyle = f ? '#fff' : c[0]; ctx.beginPath(); ctx.arc(this.x, this.y, 11, 0, TAU); ctx.fill(); ctx.fillStyle = f ? '#fff' : c[1]; ctx.fillRect(this.x - 15, this.y - 2, 30, 4); ctx.fillStyle = c[3]; ctx.beginPath(); ctx.arc(this.x, this.y, 4, 0, TAU); ctx.fill(); }
    };
  }
  function p2move(o, dt) {
    const d = o.def, sp = d.spd || 90, m = d.move; if (o.noMove) return; const k = o.cur ? 0.5 : 1;
    if (m === 'hover') { const dd = dist(o, player); if (dd > 240) toward(o, player.x, player.y, sp * k, dt); else if (dd < 170) toward(o, player.x, player.y, -sp * k, dt); o.x += Math.cos(o.hover * 1.3) * 26 * dt; }
    else if (m === 'chase') { if (dist(o, player) > d.r + 90) toward(o, player.x, player.y, sp * k, dt); }
    else if (m === 'orbit') { o.oa = (o.oa || rnd(0, TAU)) + dt * 0.5 * k; toward(o, ARENA.x + Math.cos(o.oa) * 150, ARENA.y + Math.sin(o.oa) * 130, 140 * k, dt); }
    else if (m === 'sway') { toward(o, ARENA.x + Math.sin(o.hover * 0.7) * 170, ARENA.y - 150 + Math.sin(o.hover * 1.1) * 20, 120 * k, dt); }
  }
  function mkP2(def) {
    const b = base(def.name.toUpperCase(), def.hp, def.r); b.def = def; b.cur = null; b.hover = rnd(0, 6); b.face = Math.PI / 2; b.last = ''; if (def.dmg) b.dmgMul = bb => def.dmg(b, bb); if (def.reflect) b.reflect = bb => def.reflect(b, bb); if (def.init) def.init(b);
    b.update = function (dt) {
      const f = this.hp / this.max, ph = f > 0.66 ? 1 : f > 0.33 ? 2 : 3; this.hover += dt; this.noMove = false;
      if (ph !== this.ph) { this.ph = ph; toastMsg(def.rage[ph - 2] || 'It grows stronger!', 2.2); shake = 14; ring(this.x, this.y, 18, 0, 200, 8, bcA(this)); this.cur = null; this.air = 0; this.st = 0.9; }
      if (def.tick) def.tick(this, dt, ph);
      this.st -= dt;
      if (this.cur) { if (ATK[this.cur.k](this, dt, this.cur.P, ph)) { this.cur = null; this.st = def.rest * [0, 1, 0.82, 0.68][ph]; } }
      else if (this.st <= 0) { const list = def.atk.filter(a => (a.ph || 1) <= ph && a.k !== this.last), a = pick(list.length ? list : def.atk); this.last = a.k; this.cur = { k: a.k, P: a, t: 0.45, n: 0, e: 0 }; }
      p2move(this, dt); if (!(this.air > 0.3)) inArena(this);
    };
    b.draw = function () { drawP2(this); };
    return b;
  }
  function drawP2(o) {
    const d = o.def, c = d.c, f = o.flash > 0, T = time, x = o.x, y = o.y + Math.sin(T * 2 + o.hover) * 3, r = o.r, body = f ? '#fff' : c[0], body2 = f ? '#fff' : c[1], eye = c[3], acc = c[2], P3 = o.ph === 3;
    ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.beginPath(); ctx.ellipse(x, o.y + r * 1.2, r * 1.1, r * 0.28, 0, 0, TAU); ctx.fill();
    glowRing(x, y, r * 2.1, hexA(acc), P3 ? 0.4 + Math.sin(T * 8) * 0.1 : 0.2);
    if (o.cur && o.cur.k === 'charge' && o.cur.s === 0) { ctx.strokeStyle = hexA(acc).replace('A', '.4'); ctx.lineWidth = r * 0.8; ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.lineTo(o.x + Math.cos(o.cur.ca) * 500, o.y + Math.sin(o.cur.ca) * 500); ctx.stroke(); }
    if (d.draw) { d.draw(o, { x, y, r, T, f, b0: body, b1: body2, ac: acc, ey: eye }); return; }
    const dc = d.deco;
    if (dc === 'wings') for (const s of [-1, 1]) { ctx.fillStyle = body2; ctx.beginPath(); ctx.moveTo(x + s * r * 0.5, y - r * 0.3); ctx.lineTo(x + s * r * 2.1, y - r * 0.9 + Math.sin(T * 5) * 6); ctx.lineTo(x + s * r * 1.7, y + r * 0.3); ctx.lineTo(x + s * r * 0.5, y + r * 0.3); ctx.fill(); ctx.strokeStyle = acc; ctx.lineWidth = 2; ctx.stroke(); }
    if (dc === 'flame') { for (let i = 0; i < 3; i++) { ctx.fillStyle = i ? 'rgba(255,230,140,.8)' : hexA(acc).replace('A', '.7'); ctx.beginPath(); ctx.moveTo(x - r * (0.5 - i * 0.15), y + r * 0.8); ctx.lineTo(x, y + r * (1.5 + Math.sin(T * 14 + i) * 0.3 - i * 0.3)); ctx.lineTo(x + r * (0.5 - i * 0.15), y + r * 0.8); ctx.fill(); } }
    const SH = {
      robot() { ctx.fillStyle = body2; ctx.fillRect(x - r * 0.95, y - r * 0.25, r * 1.9, r * 1.05); ctx.fillStyle = body; ctx.fillRect(x - r * 0.6, y - r * 1.05, r * 1.2, r * 0.9); ctx.fillStyle = f ? '#fff' : '#10141c'; ctx.fillRect(x - r * 0.46, y - r * 0.82, r * 0.92, r * 0.3); ctx.fillStyle = eye; ctx.fillRect(x - r * 0.4 + ((T * 30) % (r * 0.7)), y - r * 0.78, r * 0.2, r * 0.22); ctx.fillStyle = acc; ctx.fillRect(x - r * 0.12, y - r * 0.1, r * 0.24, r * 0.5); ctx.strokeStyle = body2; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x, y - r * 1.05); ctx.lineTo(x, y - r * 1.4); ctx.stroke(); ctx.fillStyle = acc; ctx.beginPath(); ctx.arc(x, y - r * 1.42, 4, 0, TAU); ctx.fill(); for (const s of [-1, 1]) { ctx.fillStyle = body; ctx.beginPath(); ctx.arc(x + s * r * 1.05, y + r * 0.1, r * 0.32, 0, TAU); ctx.fill(); ctx.fillStyle = acc; ctx.fillRect(x + s * r * 1.05 - 3, y + r * 0.1, 6, r * 0.6); } },
      ufo() { ctx.fillStyle = hexA(acc).replace('A', '.18'); ctx.beginPath(); ctx.moveTo(x - r * 0.5, y + r * 0.4); ctx.lineTo(x + r * 0.5, y + r * 0.4); ctx.lineTo(x + r * 1.1, y + r * 1.9); ctx.lineTo(x - r * 1.1, y + r * 1.9); ctx.fill(); ctx.fillStyle = f ? '#fff' : hexA(eye).replace('A', '.65'); ctx.beginPath(); ctx.ellipse(x, y - r * 0.15, r * 0.6, r * 0.65, 0, Math.PI, TAU); ctx.fill(); ctx.fillStyle = body; ctx.beginPath(); ctx.ellipse(x, y, r * 1.45, r * 0.5, 0, 0, TAU); ctx.fill(); ctx.fillStyle = body2; ctx.beginPath(); ctx.ellipse(x, y + r * 0.12, r * 1.2, r * 0.3, 0, 0, Math.PI); ctx.fill(); for (let i = 0; i < 7; i++) { ctx.fillStyle = (Math.floor(T * 6) + i) % 2 ? acc : '#fff'; ctx.beginPath(); ctx.arc(x - r * 1.1 + i * r * 0.37, y + r * 0.05, 3.2, 0, TAU); ctx.fill(); } ctx.fillStyle = eye; ctx.beginPath(); ctx.ellipse(x, y - r * 0.4, r * 0.18, r * 0.24, 0, 0, TAU); ctx.fill(); },
      alien() { for (let i = 0; i < 5; i++) { const bx = x + (i - 2) * r * 0.32, w = Math.sin(T * 4 + i) * r * 0.2; ctx.strokeStyle = body2; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(bx, y + r * 0.7); ctx.quadraticCurveTo(bx + w, y + r * 1.2, bx - w, y + r * 1.6); ctx.stroke(); } ctx.fillStyle = body; ctx.beginPath(); ctx.ellipse(x, y, r * 0.9, r * 1.1, 0, 0, TAU); ctx.fill(); ctx.fillStyle = body2; ctx.beginPath(); ctx.ellipse(x, y - r * 0.55, r * 0.6, r * 0.35, 0, 0, TAU); ctx.fill(); for (const s of [-1, 1]) { ctx.fillStyle = '#07060c'; ctx.beginPath(); ctx.ellipse(x + s * r * 0.38, y - r * 0.05, r * 0.3, r * 0.42, s * 0.5, 0, TAU); ctx.fill(); ctx.fillStyle = eye; ctx.beginPath(); ctx.ellipse(x + s * r * 0.38, y - r * 0.02, r * 0.09, r * 0.2, s * 0.5, 0, TAU); ctx.fill(); } ctx.strokeStyle = '#07060c'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y + r * 0.45, r * 0.22, 0.2, Math.PI - 0.2); ctx.stroke(); },
      crystal() { const n = 8; for (const [rr, col] of [[1.35, body2], [0.95, body]]) { ctx.fillStyle = col; ctx.beginPath(); for (let i = 0; i < n * 2; i++) { const a = i * Math.PI / n + T * 0.15 * (rr > 1 ? 1 : -1), q = i % 2 ? rr * 0.55 : rr; ctx[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * r * q, y + Math.sin(a) * r * q); } ctx.fill(); } glowRing(x, y, r * 0.7, hexA(eye), 0.9); ctx.fillStyle = eye; ctx.beginPath(); ctx.arc(x, y, r * 0.2, 0, TAU); ctx.fill(); for (let i = 0; i < 5; i++) { const a = T * 1.4 + i * TAU / 5; ctx.fillStyle = acc; ctx.save(); ctx.translate(x + Math.cos(a) * r * 1.7, y + Math.sin(a) * r * 1.2); ctx.rotate(a); ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(5, 0); ctx.lineTo(0, 9); ctx.lineTo(-5, 0); ctx.fill(); ctx.restore(); } },
      insect() { for (let i = 0; i < 3; i++) for (const s of [-1, 1]) { const w = Math.sin(T * 9 + i * 2 + (s > 0 ? 1 : 0)) * 6; ctx.strokeStyle = body2; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(x + s * r * 0.3, y + (i - 1) * r * 0.35); ctx.lineTo(x + s * r * 1.15, y + (i - 1) * r * 0.45 + w); ctx.lineTo(x + s * r * 1.45, y + (i - 1) * r * 0.9 + w); ctx.stroke(); } for (const s of [-1, 1]) { ctx.fillStyle = hexA(acc).replace('A', '.35'); ctx.beginPath(); ctx.ellipse(x + s * r * 0.8, y - r * 0.5, r * 0.55, r * 1.0, s * 0.5 + Math.sin(T * 24) * 0.12, 0, TAU); ctx.fill(); } ctx.fillStyle = body2; ctx.beginPath(); ctx.ellipse(x, y - r * 0.75, r * 0.55, r * 0.85, 0, 0, TAU); ctx.fill(); ctx.fillStyle = body; ctx.beginPath(); ctx.ellipse(x, y, r * 0.65, r * 0.55, 0, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.ellipse(x, y + r * 0.6, r * 0.42, r * 0.38, 0, 0, TAU); ctx.fill(); for (const s of [-1, 1]) { ctx.fillStyle = eye; ctx.beginPath(); ctx.arc(x + s * r * 0.2, y + r * 0.55, r * 0.11, 0, TAU); ctx.fill(); ctx.strokeStyle = acc; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x + s * r * 0.15, y + r * 0.9); ctx.lineTo(x + s * r * 0.38, y + r * 1.1); ctx.stroke(); } },
      jelly() { for (let i = 0; i < 7; i++) { const bx = x + (i - 3) * r * 0.26, w = Math.sin(T * 3 + i * 0.9) * r * 0.25; ctx.strokeStyle = hexA(acc).replace('A', '.7'); ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(bx, y + r * 0.2); ctx.quadraticCurveTo(bx + w, y + r * 0.9, bx - w, y + r * 1.7 + (i % 2) * r * 0.3); ctx.stroke(); } ctx.fillStyle = f ? '#fff' : hexA(c[0]).replace('A', '.9'); ctx.beginPath(); ctx.ellipse(x, y, r * 1.1, r * 0.95, 0, Math.PI, TAU); ctx.lineTo(x + r * 1.1, y + r * 0.2); for (let i = 6; i >= 0; i--) ctx.lineTo(x - r * 1.1 + i * r * 0.37, y + r * 0.2 + (i % 2 ? r * 0.15 : 0)); ctx.fill(); for (let i = 0; i < 5; i++) { ctx.fillStyle = (Math.floor(T * 3) + i) % 2 ? acc : eye; ctx.beginPath(); ctx.arc(x + (i - 2) * r * 0.36, y - r * 0.35 + Math.abs(i - 2) * r * 0.12, r * 0.1, 0, TAU); ctx.fill(); } },
      orb() { const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 2, x, y, r * 1.1); g.addColorStop(0, f ? '#fff' : body); g.addColorStop(1, f ? '#fff' : body2); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 1.05, 0, TAU); ctx.fill(); ctx.save(); ctx.beginPath(); ctx.arc(x, y, r * 1.05, 0, TAU); ctx.clip(); ctx.fillStyle = 'rgba(0,0,0,.16)'; for (let i = -2; i <= 2; i++) ctx.fillRect(x - r * 1.1, y + i * r * 0.38 + Math.sin(T + i) * 3, r * 2.2, r * 0.16); ctx.restore(); ctx.strokeStyle = acc; ctx.lineWidth = 4; ctx.beginPath(); ctx.ellipse(x, y, r * 1.6, r * 0.38, -0.3, 0, TAU); ctx.stroke(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x + Math.cos(T * 1.5) * r * 1.6, y + Math.sin(T * 1.5) * r * 0.5 - 6, 5, 0, TAU); ctx.fill(); if (dc === 'eye') { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(x, y, r * 0.55, r * 0.38, 0, 0, TAU); ctx.fill(); ctx.fillStyle = eye; ctx.beginPath(); ctx.arc(x + Math.cos(angTo(o, player)) * r * 0.16, y + Math.sin(angTo(o, player)) * r * 0.12, r * 0.2, 0, TAU); ctx.fill(); ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(x + Math.cos(angTo(o, player)) * r * 0.2, y + Math.sin(angTo(o, player)) * r * 0.14, r * 0.09, 0, TAU); ctx.fill(); } },
      skull() { ctx.fillStyle = body2; ctx.fillRect(x - r * 0.5, y + r * 0.35, r, r * 0.5); ctx.fillStyle = body; ctx.beginPath(); ctx.ellipse(x, y - r * 0.1, r * 0.95, r * 0.9, 0, 0, TAU); ctx.fill(); for (const s of [-1, 1]) { ctx.fillStyle = '#07060c'; ctx.beginPath(); ctx.ellipse(x + s * r * 0.38, y - r * 0.1, r * 0.26, r * 0.3, 0, 0, TAU); ctx.fill(); ctx.fillStyle = eye; ctx.beginPath(); ctx.arc(x + s * r * 0.38, y - r * 0.08, r * 0.1 + Math.sin(T * 6) * 1.5, 0, TAU); ctx.fill(); } ctx.fillStyle = '#07060c'; ctx.beginPath(); ctx.moveTo(x, y + r * 0.1); ctx.lineTo(x - r * 0.1, y + r * 0.3); ctx.lineTo(x + r * 0.1, y + r * 0.3); ctx.fill(); ctx.strokeStyle = '#07060c'; ctx.lineWidth = 2; for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(x + i * r * 0.2, y + r * 0.45); ctx.lineTo(x + i * r * 0.2, y + r * 0.82); ctx.stroke(); } }
    };
    (SH[d.shape] || SH.robot)();
    if (dc === 'halo') { ctx.strokeStyle = acc; ctx.lineWidth = 4; ctx.beginPath(); ctx.ellipse(x, y - r * 1.35, r * 0.75, r * 0.2, 0, 0, TAU); ctx.stroke(); }
    if (dc === 'crown') { ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.moveTo(x - r * 0.7, y - r * 1.0); for (let i = 0; i < 5; i++) { ctx.lineTo(x - r * 0.7 + i * r * 0.35 + r * 0.17, y - r * 1.55); ctx.lineTo(x - r * 0.7 + (i + 1) * r * 0.35, y - r * 1.0); } ctx.fill(); }
    if (dc === 'horns') for (const s of [-1, 1]) { ctx.fillStyle = '#e8e0d0'; ctx.beginPath(); ctx.moveTo(x + s * r * 0.5, y - r * 0.8); ctx.quadraticCurveTo(x + s * r * 1.3, y - r * 0.9, x + s * r * 1.1, y - r * 1.6); ctx.quadraticCurveTo(x + s * r * 0.9, y - r * 1.0, x + s * r * 0.3, y - r * 0.6); ctx.fill(); }
    if (dc === 'cannons') for (const s of [-1, 1]) { ctx.fillStyle = '#2a2e3c'; ctx.fillRect(x + s * r * 1.55 - 6, y - r * 0.6, 12, r * 1.1); ctx.fillStyle = acc; ctx.fillRect(x + s * r * 1.55 - 3, y + r * 0.4, 6, 8); }
    if (dc === 'orbiters') for (let i = 0; i < 3; i++) { const a = T * 2 + i * TAU / 3; ctx.fillStyle = acc; ctx.beginPath(); ctx.arc(x + Math.cos(a) * r * 1.6, y + Math.sin(a) * r * 0.9, 7, 0, TAU); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x + Math.cos(a) * r * 1.6 - 2, y + Math.sin(a) * r * 0.9 - 2, 2.5, 0, TAU); ctx.fill(); }
    if (dc === 'antenna') for (const s of [-1, 1]) { ctx.strokeStyle = body2; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x + s * r * 0.3, y - r * 1.0); ctx.quadraticCurveTo(x + s * r * 0.9, y - r * 1.6, x + s * r * 0.6, y - r * 2.0); ctx.stroke(); ctx.fillStyle = acc; ctx.beginPath(); ctx.arc(x + s * r * 0.6, y - r * 2.0, 5, 0, TAU); ctx.fill(); }
    if (o.cur && o.cur.n === 0 && o.cur.t > 0 && o.cur.e < 0.45 && !o.cur.f && o.cur.k !== 'charge') glowRing(x, y, r * 1.5, 'rgba(255,255,255,A)', 0.35);
  }
  const A = (k, o) => Object.assign({ k }, o);
  const segDist = (px, py, ax, ay, bx, by) => { const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1, t = clamp(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1); return Math.hypot(px - (ax + dx * t), py - (ay + dy * t)); };
  const RB = ['#ff4a6a', '#ffb347', '#fff27a', '#4aff8a', '#4ac8ff', '#b07aff'];
  // ---- extra minions
  function mkFighter(lane, dir, c) {
    return { x: ARENA.x - dir * 330, y: lane, r: 12, hp: 5, max: 5, flash: 0, name: 'fighter', dir, sh: rnd(0.4, 1),
      update(dt) { this.x += this.dir * 250 * dt; this.sh -= dt; if (this.sh <= 0) { ebul(this.x, this.y, angTo(this, player), 230, 6, { c: c[2] }); this.sh = 1.2; } if (Math.abs(this.x - ARENA.x) > 350) { this.dir *= -1; this.y = ARENA.y + rnd(-170, 170); } },
      draw() { const f = this.flash > 0; ctx.save(); ctx.translate(this.x, this.y); ctx.scale(this.dir, 1); ctx.fillStyle = f ? '#fff' : c[0]; ctx.beginPath(); ctx.moveTo(16, 0); ctx.lineTo(-10, -11); ctx.lineTo(-5, 0); ctx.lineTo(-10, 11); ctx.fill(); ctx.fillStyle = c[2]; ctx.fillRect(-12, -3, 5, 6); ctx.fillStyle = c[3]; ctx.beginPath(); ctx.arc(4, 0, 3, 0, TAU); ctx.fill(); ctx.restore(); } };
  }
  function mkCloud(x, y, c) {
    return { x, y, r: 20, hp: 10, max: 10, flash: 0, name: 'cloud', w: rnd(0, 6), sh: rnd(1, 2),
      update(dt) { this.w += dt; this.x += Math.cos(this.w * 0.7) * 40 * dt; this.y += Math.sin(this.w * 0.9) * 30 * dt; inArena(this); this.sh -= dt; if (this.sh <= 0) { this.sh = 2.4; zone(player.x, player.y, 36, 0.8, 0.2, { c: c[2], tc: hexA(c[2]).replace('A', '.16'), onEnd: z => ring(z.x, z.y, 6, rnd(0, 1), 150, 6, { c: c[3] }) }); } },
      draw() { const f = this.flash > 0; ctx.fillStyle = f ? '#fff' : '#5a6490'; for (const [dx, dy, r] of [[-14, 4, 12], [0, -4, 16], [14, 4, 12], [0, 8, 14]]) { ctx.beginPath(); ctx.arc(this.x + dx, this.y + dy, r, 0, TAU); ctx.fill(); } ctx.strokeStyle = c[3]; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(this.x - 3, this.y + 10); ctx.lineTo(this.x + 3, this.y + 20); ctx.lineTo(this.x - 2, this.y + 20); ctx.lineTo(this.x + 4, this.y + 30); ctx.stroke(); } };
  }
  function mkDecoy(x, y, o) {
    return { x, y, r: 26, hp: 8, max: 8, flash: 0, name: 'decoy', w: rnd(0, 6), sh: rnd(1.5, 2.5),
      update(dt) { this.w += dt; this.x += Math.cos(this.w) * 30 * dt; this.y += Math.sin(this.w * 1.3) * 24 * dt; inArena(this); this.sh -= dt; if (this.sh <= 0) { this.sh = 2.4; fan(this.x, this.y, angTo(this, player), 3, 0.5, 190, 7, bcA(o)); } },
      draw() { drawSeer(this.x, this.y, 40, o.def.c, this.flash > 0, 0.6, this); } };
  }
  // ---- extra attacks
  Object.assign(ATK, {
    gatling(o, dt, P, ph) { const c = o.cur; c.e += dt; c.t -= dt; if (c.t <= 0) { c.t = 0.085; ebul(o.x, o.y, angTo(o, player) + rnd(-0.12, 0.12), 270, 6, bcA(o)); } return c.e > 1.8 + ph * 0.3; },
    salvo(o, dt, P, ph) { const c = o.cur, N = 6 + ph * 2; c.t -= dt; if (c.t <= 0 && c.n < N) { c.t = 0.18; const s = c.n % 2 ? 1 : -1; ebul(o.x + s * o.r * 1.4, o.y - 6, -Math.PI / 2 + s * 0.6, 160, 8, Object.assign(bcB(o), { home: 1.1, life: 5.5 })); c.n++; blip(180, 0.1, 'sawtooth', 0.05); } return c.n >= N; },
    burrow(o, dt, P, ph) { const c = o.cur; o.noMove = true; if (c.s === undefined) { c.s = 0; c.ct = 0.6; c.k2 = 0; } c.ct -= dt;
      if (c.s === 0) { o.air = 1; if (c.ct <= 0) { c.s = 1; c.ct = 1.1; c.lx = clamp(player.x, ARENA.x - 220, ARENA.x + 220); c.ly = clamp(player.y, ARENA.y - 220, ARENA.y + 220); zone(c.lx, c.ly, 72, 1.0, 0.3, Object.assign(zoneCol(o), { onEnd: z => { ring(z.x, z.y, 12, rnd(0, 1), 170, 7, bcA(o)); wave(z.x, z.y, 240, 300, { w: 20, c: o.def.c[2] }); } })); } }
      else if (c.s === 1) { o.x = c.lx; o.y = c.ly; if (c.ct <= 0) { o.air = 0; shake = 8; burst(o.x, o.y, 22, o.def.c[2], 200); c.s = 2; c.ct = 0.9; } }
      else if (c.ct <= 0) { c.k2++; if (c.k2 >= (P.times || 2) + (ph > 1 ? 1 : 0)) return true; c.s = 0; c.ct = 0.6; }
      return false; },
    dustspit(o, dt, P, ph) { const c = o.cur; c.t -= dt; if (c.t <= 0) { c.t = 0.5; fan(o.x, o.y, angTo(o, player), 9 + ph, 1.5, 170, 7, bcB(o)); c.n++; } return c.n >= 3; },
    launch(o, dt, P, ph) { const c = o.cur; c.e += dt; if (!c.f) { c.f = 1; if (minions.length < 6) for (let i = 0; i < 2 + ph; i++) minions.push(mkFighter(ARENA.y - 140 + i * 90 + rnd(-20, 20), i % 2 ? 1 : -1, o.def.c)); burst(o.x, o.y + 20, 14, o.def.c[2], 140); blip(260, 0.2, 'triangle', 0.06); } return c.e > 0.8; },
    bombrun(o, dt, P, ph) { const c = o.cur; c.t -= dt; if (c.t <= 0) { if (c.n >= 2 + (ph > 1 ? 1 : 0)) return true; c.t = 1.9; const y = clamp(player.y, ARENA.y - 200, ARENA.y + 200), dir = c.n % 2 ? -1 : 1; for (let i = 0; i < 11; i++) zone(ARENA.x - dir * 250 + dir * i * 50, y, 38, 0.8 + i * 0.1, 0.25, zoneCol(o)); c.n++; } return false; },
    wells(o, dt, P, ph) { const c = o.cur; c.e += dt; if (!c.f) { c.f = 1; o.wells = o.wells || []; for (let i = 0; i < 2; i++) { const a = rnd(0, TAU); o.wells.push({ x: ARENA.x + Math.cos(a) * 140, y: ARENA.y + Math.sin(a) * 140, t: 0 }); } blip(70, 0.5, 'sine', 0.08); } return c.e > 1.2; },
    implode(o, dt, P, ph) { const c = o.cur; c.t -= dt; if (c.t <= 0) { if (c.n >= 2 + (ph > 1 ? 1 : 0)) return true; c.t = 1.1; const g = rnd(0, TAU); for (let i = 0; i < 30; i++) { const a = i * TAU / 30; if (Math.abs(angDiff(a, g)) < 0.28) continue; ebul(ARENA.x + Math.cos(a) * 270, ARENA.y + Math.sin(a) * 270, a + Math.PI, 125 + ph * 8, 8, c.n % 2 ? bcB(o) : bcA(o)); } c.n++; } return false; },
    fist(o, dt, P, ph) { const c = o.cur; c.t -= dt; const h = o.hands[c.n % 2]; if (c.s === 1) { h.x += (c.tx - h.x) * Math.min(1, 9 * dt); h.y += (c.ty - 50 - h.y) * Math.min(1, 9 * dt); if (c.t <= 0) { wave(c.tx, c.ty, 230, 220, { w: 22, c: o.def.c[2] }); zone(c.tx, c.ty, 46, 0.05, 1.8, zoneCol(o)); h.y = c.ty; shake = 12; c.n++; c.s = 0; c.t = 0.35; } } else if (c.t <= 0) { if (c.n >= 2 + ph) return true; c.s = 1; c.tx = clamp(player.x, ARENA.x - 220, ARENA.x + 220); c.ty = clamp(player.y, ARENA.y - 200, ARENA.y + 200); zone(c.tx, c.ty, 80, 0.85, 0.2, zoneCol(o)); c.t = 0.85; } o.fisting = true; return false; },
    moonbeam(o, dt, P, ph) { const c = o.cur; o.noMove = true; c.e += dt; if (!c.f && c.e > 0.6) { c.f = 1; const a0 = angTo(o, player); for (let i = -1; i <= 1; i++) addBeam(o.x, o.y, a0 + i * 0.42, i * 0.12 + 0.1, 1.0, 2.0, 620); blip(120, 0.5, 'sawtooth', 0.07); } return c.e > 4; },
    segfire(o, dt, P, ph) { const c = o.cur; c.t -= dt; if (c.t <= 0) { c.t = 0.55; for (let k = 2 + (c.n % 3); k < 14; k += 3) { const s = o.seg && o.seg[k]; if (s) ebul(s.x, s.y, angTo(s, player), 190, 6, bcA(o)); } c.n++; blip(250, 0.05, 'square', 0.04); } return c.n >= 6; },
    surge(o, dt, P, ph) { const c = o.cur; c.e += dt; o.boost = 1; return c.e > 2; },
    quickdraw(o, dt, P, ph) { const c = o.cur, N = 3 + ph; o.noMove = true; c.e += dt; if (c.e < 0.9) c.a = angTo(o, player); else { c.t2 = (c.t2 || 0) - dt; if (c.t2 <= 0 && c.n < N) { c.t2 = 0.11; ebul(o.x, o.y, c.a, 540, 6, bcB(o)); c.n++; blip(420, 0.04, 'square', 0.05); } } return c.n >= N && c.e > 1.6; },
    grenades(o, dt, P, ph) { const c = o.cur; c.t -= dt; if (c.t <= 0) { c.t = 0.35; const a = rnd(0, TAU), d = rnd(0, 150); zone(clamp(player.x + Math.cos(a) * d, ARENA.x - 240, ARENA.x + 240), clamp(player.y + Math.sin(a) * d, ARENA.y - 240, ARENA.y + 240), 58, 1.2, 0.25, Object.assign(zoneCol(o), { onEnd: z => ring(z.x, z.y, 10, rnd(0, 1), 150, 6, bcB(o)) })); c.n++; } return c.n >= 4 + ph; },
    strafe(o, dt, P, ph) { const c = o.cur; o.noMove = true; c.e += dt; c.sa = (c.sa || rnd(0, TAU)) + dt * 1.6; toward(o, player.x + Math.cos(c.sa) * 210, player.y + Math.sin(c.sa) * 210, 230, dt); inArena(o); c.t -= dt; if (c.t <= 0) { c.t = 0.32; ebul(o.x, o.y, angTo(o, player), 300, 6, bcA(o)); } return c.e > 3; },
    illusion(o, dt, P, ph) { const c = o.cur; c.e += dt; if (!c.f) { c.f = 1; for (const m of minions.filter(m => m.name === 'decoy')) { m.hp = 0; burst(m.x, m.y, 8, '#fff', 100); } minions = minions.filter(m => m.hp > 0); burst(o.x, o.y, 14, o.def.c[2], 150); const spots = []; for (let i = 0; i < 4; i++) { const a = rnd(0, TAU), d = rnd(60, 170); spots.push([ARENA.x + Math.cos(a) * d, ARENA.y + Math.sin(a) * d]); } o.x = spots[0][0]; o.y = spots[0][1]; for (let i = 1; i < 4; i++) minions.push(mkDecoy(spots[i][0], spots[i][1], o)); blip(500, 0.3, 'triangle', 0.06); } return c.e > 0.8; },
    eruption(o, dt, P, ph) { const c = o.cur; c.t -= dt; if (c.t <= 0) { if (c.n >= 2) return true; c.t = 2.0; const a0 = rnd(0, TAU), N = 5 + ph; for (let k = 0; k < N; k++) for (let j = 0; j < 5; j++) { const a = a0 + k * TAU / N; zone(o.x + Math.cos(a) * (70 + j * 46), o.y + Math.sin(a) * (70 + j * 46), 32, 0.9 + j * 0.13, 0.25, zoneCol(o)); } c.n++; shake = 6; } return false; },
    rampage(o, dt, P, ph) { const c = o.cur; o.noMove = true; if (c.s === undefined) { c.s = 0; c.ct = 0.85; c.hd = angTo(o, player); c.b = 0; } if (c.s === 0) { c.ct -= dt; c.hd = angTo(o, player); if (c.ct <= 0) c.s = 1; } else { o.x += Math.cos(c.hd) * 370 * dt; o.y += Math.sin(c.hd) * 370 * dt; c.tt = (c.tt || 0) - dt; if (c.tt <= 0) { c.tt = 0.1; zone(o.x, o.y, 20, 0.05, 0.7, zoneCol(o)); if (Math.random() < 0.3) ebul(o.x, o.y, rnd(0, TAU), 160, 6, bcB(o)); } const d = Math.hypot(o.x - ARENA.x, o.y - ARENA.y), lim = ARENA.r - o.r * 0.7; if (d > lim) { const nx = (o.x - ARENA.x) / d, ny = (o.y - ARENA.y) / d, vx = Math.cos(c.hd), vy = Math.sin(c.hd), dot = vx * nx + vy * ny; c.hd = Math.atan2(vy - 2 * dot * ny, vx - 2 * dot * nx) + rnd(-0.15, 0.15); o.x = ARENA.x + nx * lim; o.y = ARENA.y + ny * lim; c.b++; shake = 6; blip(100, 0.15, 'square', 0.07); if (c.b >= 4 + ph) return true; } } return false; },
    volley(o, dt, P, ph) { const c = o.cur; c.t -= dt; if (c.t <= 0) { c.t = 0.6; fan(o.x, o.y, angTo(o, player), 9 + ph * 2, 1.9, 190, 7, c.n % 2 ? bcB(o) : bcA(o)); c.n++; } return c.n >= 4; },
    chainnet(o, dt, P, ph) { const c = o.cur; c.e += dt; if (!c.f) { c.f = 1; o.nets = o.nets || []; for (let k = 0; k < 1 + (ph > 1 ? 1 : 0); k++) { const a0 = rnd(0, TAU), R = rnd(110, 190), pts = []; for (let i = 0; i < 3; i++) pts.push([ARENA.x + Math.cos(a0 + i * TAU / 3) * R, ARENA.y + 10 + Math.sin(a0 + i * TAU / 3) * R]); o.nets.push({ pts, t: 0 }); } blip(300, 0.3, 'sawtooth', 0.05); } return c.e > 1.2; },
    zapfan(o, dt, P, ph) { const c = o.cur; c.t -= dt; if (c.t <= 0) { c.t = 0.4; fan(o.x, o.y, angTo(o, player), 7 + ph, 1.1, 310, 6, bcB(o)); c.n++; } return c.n >= 4; },
    swoop(o, dt, P, ph) { const c = o.cur; o.noMove = true; if (c.s === undefined) { c.s = 0; c.ct = 0.9; c.k2 = 0; } c.ct -= dt;
      if (c.s === 0) { if (!c.f) { c.f = 1; o.air = 1; const a = rnd(0, TAU), px = clamp(player.x, ARENA.x - 150, ARENA.x + 150), py = clamp(player.y, ARENA.y - 150, ARENA.y + 150); c.p0 = [px - Math.cos(a) * 430, py - Math.sin(a) * 430]; c.p1 = [px + Math.cos(a) * 430, py + Math.sin(a) * 430]; for (let i = 0; i < 14; i++) { const u = i / 13; zone(c.p0[0] + (c.p1[0] - c.p0[0]) * u, c.p0[1] + (c.p1[1] - c.p0[1]) * u, 36, 1.0 + u * 0.5, 0.25, zoneCol(o)); } } o.x = c.p0[0]; o.y = c.p0[1]; if (c.ct <= 0) { c.s = 1; c.ct = 0.55; blip(300, 0.4, 'sawtooth', 0.06); } }
      else if (c.s === 1) { const u = 1 - clamp(c.ct / 0.55, 0, 1); o.x = c.p0[0] + (c.p1[0] - c.p0[0]) * u; o.y = c.p0[1] + (c.p1[1] - c.p0[1]) * u; if (c.ct <= 0) { c.s = 2; c.ct = 0.4; } }
      else if (c.ct <= 0) { c.k2++; c.f = 0; if (c.k2 >= (P.times || 2) + (ph > 1 ? 1 : 0)) { o.air = 0; o.x = ARENA.x + rnd(-100, 100); o.y = ARENA.y - 130; return true; } c.s = 0; c.ct = 0.9; }
      return false; },
    twisters(o, dt, P, ph) { const c = o.cur; c.e += dt; if (!c.f) { c.f = 1; o.tw = o.tw || []; for (let i = 0; i < 1 + ph; i++) { const a = rnd(0, TAU); o.tw.push({ x: ARENA.x + Math.cos(a) * 230, y: ARENA.y + Math.sin(a) * 230, t: 0 }); } blip(100, 0.5, 'sine', 0.07); } return c.e > 1; },
    cyclone(o, dt, P, ph) { const c = o.cur; c.e += dt; c.t -= dt; if (c.t <= 0) { c.t = 0.07; c.a = (c.a || 0) + 0.3; for (let i = 0; i < 4 + ph; i++) ebul(o.x, o.y, c.a + i * TAU / (4 + ph), 150, 7, i % 2 ? bcB(o) : bcA(o)); } return c.e > 5; },
    eyewall(o, dt, P, ph) { const c = o.cur; c.t -= dt; if (c.t <= 0) { if (c.n >= 2 + (ph > 1 ? 1 : 0)) return true; c.t = 1.4; const g = angTo(ARENA, player) + rnd(-0.4, 0.4); for (let i = 0; i < 40; i++) { const a = i * TAU / 40; if (Math.abs(angDiff(a, g)) < 0.32) continue; ebul(ARENA.x + Math.cos(a) * 255, ARENA.y + Math.sin(a) * 255, a + Math.PI, 115, 8, bcB(o)); } c.n++; } return false; },
    thunderclouds(o, dt, P, ph) { const c = o.cur; c.e += dt; if (!c.f) { c.f = 1; if (minions.filter(m => m.name === 'cloud').length < 3) for (let i = 0; i < 2; i++) minions.push(mkCloud(o.x + rnd(-120, 120), o.y + rnd(0, 120), o.def.c)); burst(o.x, o.y, 14, o.def.c[3], 140); } return c.e > 0.8; },
    judgement(o, dt, P, ph) { const c = o.cur; c.t -= dt; if (c.t <= 0) { if (c.n >= 2 + (ph > 1 ? 1 : 0)) return true; c.t = 1.5; const vert = c.n % 2 === 0, base0 = vert ? clamp(player.x, ARENA.x - 150, ARENA.x + 150) : clamp(player.y, ARENA.y - 150, ARENA.y + 150); for (let l = -1; l <= 1; l++) for (let i = -5; i <= 5; i++) { const q = base0 + l * 120; zone(vert ? q : ARENA.x + i * 46, vert ? ARENA.y + i * 46 : q, 30, 0.9 + (i + 5) * 0.06, 0.25, zoneCol(o)); } c.n++; blip(200, 0.2, 'sawtooth', 0.06); } return false; },
    throw(o, dt, P, ph) { const c = o.cur; c.t -= dt; if (c.t <= 0 && c.n < 4) { c.t = 0.4; const s = o.sh.find(s => s.s === 0); if (s) { s.s = 1; s.t = 0; s.ang = angTo(s, player); c.n++; blip(350, 0.08, 'triangle', 0.05); } } return c.n >= 4 && c.t < -0.5; },
    rainbow(o, dt, P, ph) { const c = o.cur; c.e += dt; c.t -= dt; if (c.t <= 0) { c.t = 0.09; c.a = (c.a || 0) + 0.45; for (let i = 0; i < 6; i++) ebul(o.x, o.y, c.a + i * TAU / 6, 160, 7, { c: RB[(i + Math.floor(c.e * 4)) % 6] }); } return c.e > 3.4; },
    shatter(o, dt, P, ph) { const c = o.cur; c.t -= dt; if (c.t <= 0) { c.t = 0.6; ring(o.x, o.y, 26 + ph * 2, c.n * 0.2, 120, 6, bcB(o)); fan(o.x, o.y, angTo(o, player), 5, 0.5, 260, 7, bcA(o)); c.n++; } return c.n >= 4; },
    spikes(o, dt, P, ph) { const c = o.cur; c.t -= dt; if (c.t <= 0) { if (c.n >= 2 + (ph > 1 ? 1 : 0)) return true; c.t = 1.5; const a0 = angTo(o, player); for (let j = -1; j <= 1; j++) for (let k = 0; k < 8; k++) zone(o.x + Math.cos(a0 + j * 0.34) * (70 + k * 52), o.y + Math.sin(a0 + j * 0.34) * (70 + k * 52), 28, 0.9 + k * 0.07, 0.25, zoneCol(o)); c.n++; blip(90, 0.2, 'sawtooth', 0.06); } return false; },
    boulders(o, dt, P, ph) { const c = o.cur; c.t -= dt; if (c.t <= 0) { if (c.n >= 4 + ph) return true; c.t = 0.4; const a = rnd(0, TAU), d = c.n === 0 ? 0 : rnd(40, 170); zone(clamp(player.x + Math.cos(a) * d, ARENA.x - 230, ARENA.x + 230), clamp(player.y + Math.sin(a) * d, ARENA.y - 230, ARENA.y + 230), 62, 1.2, 0.25, Object.assign(zoneCol(o), { onEnd: z => { ring(z.x, z.y, 8, rnd(0, 1), 140, 7, bcB(o)); shake = 5; } })); c.n++; } return false; },
    groundpound(o, dt, P, ph) { const c = o.cur; c.t -= dt; if (c.t <= 0) { c.t = 0.9; wave(o.x, o.y, 270, 560, { w: 24, c: o.def.c[2] }); ring(o.x, o.y, 16 + ph * 2, rnd(0, 1), 140, 8, bcA(o)); shake = 12; c.n++; blip(60, 0.4, 'sawtooth', 0.09); } return c.n >= 3; },
    railgun(o, dt, P, ph) { const c = o.cur; o.noMove = true; c.e += dt; if (c.e < 0.35) c.a = angTo(o, player); if (!c.f && c.e >= 0.35) { c.f = 1; addBeam(o.x, o.y, c.a, 0, 0.85, 0.25, 780); blip(800, 0.3, 'sine', 0.05); } if (c.e > 1.7) { c.n++; if (c.n >= (P.times || 2) + (ph > 1 ? 1 : 0)) return true; c.e = 0; c.f = 0; } return false; },
    tiles(o, dt, P, ph) { const c = o.cur; c.t -= dt; if (c.t <= 0) { if (c.n >= 3 + (ph > 1 ? 1 : 0)) return true; c.t = 1.25; const pat = c.n % 3, par = Math.floor(c.n / 3) % 2, rr = Math.floor(rnd(0, 4)); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { const on = pat === 0 ? (i + j) % 2 === par : pat === 1 ? j === rr || j === (rr + 2) % 4 : i === rr || i === (rr + 2) % 4; if (on) zone(ARENA.x - 180 + i * 120, ARENA.y - 170 + j * 120, 56, 1.0, 0.3, zoneCol(o)); } c.n++; blip(600, 0.05, 'square', 0.05); } return false; },
    cogs(o, dt, P, ph) { const c = o.cur; c.e += dt; c.t -= dt; if (c.t <= 0) { c.t = 0.42; c.g = (c.g || 0) + 0.6; ring(o.x, o.y, 22, c.g, c.n % 2 ? 125 : 165, 7, c.n % 2 ? bcB(o) : bcA(o), 4); c.n++; } return c.e > 4.5; },
    orbital(o, dt, P, ph) { const c = o.cur; c.t -= dt; if (c.t <= 0) { if (c.n >= 3 + ph) return true; c.t = 0.75; addBeam(clamp(player.x, ARENA.x - 230, ARENA.x + 230), ARENA.y - 320, Math.PI / 2, 0, 0.9, 0.35, 660); if (ph > 1 && c.n % 2) addBeam(ARENA.x - 300, clamp(player.y, ARENA.y - 200, ARENA.y + 200), 0, 0, 0.9, 0.35, 640); c.n++; blip(900, 0.1, 'sine', 0.04); } return false; }
  });
  // ---- hand-drawn bodies for every Part Two boss
  function drawSeer(x, y, r, c, f, al, o) {
    const T = time, b0 = f ? '#fff' : c[0], b1 = f ? '#fff' : c[1]; ctx.save(); ctx.globalAlpha = al; ctx.fillStyle = b1; ctx.beginPath(); ctx.moveTo(x - r * 0.9, y + r * 1.2); ctx.quadraticCurveTo(x - r * 0.7, y - r * 0.1, x, y - r * 0.3); ctx.quadraticCurveTo(x + r * 0.7, y - r * 0.1, x + r * 0.9, y + r * 1.2); for (let i = 5; i >= 0; i--) ctx.lineTo(x - r * 0.9 + i * r * 0.36, y + r * 1.2 + (i % 2 ? 8 : 0) + Math.sin(T * 4 + i) * 3); ctx.fill();
    ctx.fillStyle = b0; ctx.beginPath(); ctx.ellipse(x, y - r * 0.55, r * 0.62, r * 0.72, 0, 0, TAU); ctx.fill(); ctx.fillStyle = '#10080a'; ctx.beginPath(); ctx.ellipse(x - r * 0.26, y - r * 0.5, r * 0.15, r * 0.1, 0.2, 0, TAU); ctx.ellipse(x + r * 0.26, y - r * 0.5, r * 0.15, r * 0.1, -0.2, 0, TAU); ctx.fill();
    const g = ctx.createRadialGradient(x, y - r * 0.92, 1, x, y - r * 0.92, r * 0.26); g.addColorStop(0, '#fff'); g.addColorStop(0.5, c[3]); g.addColorStop(1, c[2]); ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, y - r * 0.92, r * 0.17, r * 0.24, 0, 0, TAU); ctx.fill();
    for (const s of [-1, 1]) { const hx = x + s * r * 1.15, hy = y + Math.sin(T * 2 + s) * 6; ctx.fillStyle = b0; ctx.beginPath(); ctx.arc(hx, hy, r * 0.22, 0, TAU); ctx.fill(); glowRing(hx, hy - r * 0.35, r * 0.4, hexA(c[2]), 0.7); }
    for (let i = 0; i < 4; i++) { const a = T * 1.2 + i * 1.57; ctx.fillStyle = c[3]; ctx.save(); ctx.translate(x + Math.cos(a) * r * 1.5, y - r * 0.4 + Math.sin(a) * r * 0.5); ctx.rotate(a); ctx.fillRect(-4, -4, 8, 8); ctx.restore(); } ctx.restore();
  }
  const DRAW = {
    sentinel(o, g) { const { x, y, r, f, b0, b1, ac, ey } = g, a = o.face || Math.PI / 2; ctx.fillStyle = b1; ctx.fillRect(x - r * 1.1, y + r * 0.2, r * 2.2, r * 0.7); ctx.fillStyle = '#1a2030'; for (let i = 0; i < 5; i++) ctx.fillRect(x - r + i * r * 0.44, y + r * 0.72, r * 0.3, r * 0.22); ctx.fillStyle = b0; ctx.beginPath(); ctx.arc(x, y, r * 0.8, Math.PI, 0); ctx.lineTo(x + r * 0.8, y + r * 0.3); ctx.lineTo(x - r * 0.8, y + r * 0.3); ctx.fill(); ctx.save(); ctx.translate(x, y - r * 0.2); ctx.rotate(a); ctx.fillStyle = b1; ctx.fillRect(0, -r * 0.16, r * 1.5, r * 0.32); ctx.fillStyle = ac; ctx.fillRect(r * 1.4, -r * 0.2, r * 0.14, r * 0.4); ctx.strokeStyle = f ? '#fff' : '#e8f2ff'; ctx.lineWidth = r * 0.22; ctx.beginPath(); ctx.arc(0, 0, r * 1.15, -0.85, 0.85); ctx.stroke(); ctx.strokeStyle = ac; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, r * 1.28, -0.85, 0.85); ctx.stroke(); ctx.restore(); ctx.fillStyle = ey; ctx.beginPath(); ctx.arc(x, y - r * 0.2, r * 0.14, 0, TAU); ctx.fill(); },
    burrower(o, g) { const { x, y, r, T, f, b0, b1, ac, ey } = g; if (o.air > 0.3) { ctx.fillStyle = b1; for (let i = 0; i < 12; i++) { const a = T * 4 + i * 0.52, d = r * (0.5 + (i % 3) * 0.3); ctx.beginPath(); ctx.arc(x + Math.cos(a) * d, o.y + r * 0.7 + Math.sin(a) * d * 0.35, 5 + i % 4, 0, TAU); ctx.fill(); } ctx.fillStyle = b0; ctx.beginPath(); ctx.ellipse(x, o.y + r * 0.7, r * 0.9, r * 0.3, 0, 0, TAU); ctx.fill(); return; }
      for (const s of [-1, 1]) { ctx.fillStyle = b1; ctx.beginPath(); ctx.moveTo(x + s * r * 0.7, y); ctx.lineTo(x + s * r * 1.6, y - r * 0.5); ctx.lineTo(x + s * r * 1.5, y + r * 0.2); ctx.lineTo(x + s * r * 1.9, y + r * 0.3); ctx.lineTo(x + s * r * 0.9, y + r * 0.5); ctx.fill(); }
      ctx.fillStyle = b0; ctx.beginPath(); ctx.ellipse(x, y, r * 0.95, r * 0.8, 0, 0, TAU); ctx.fill(); ctx.fillStyle = b1; for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(x - r * 0.5 + i * r * 0.33, y - r * 0.3, r * 0.16, 0, TAU); ctx.fill(); }
      ctx.save(); ctx.translate(x, y + r * 0.55); ctx.rotate(T * 14); ctx.fillStyle = ac; ctx.beginPath(); ctx.moveTo(0, r * 0.55); ctx.lineTo(-r * 0.24, -r * 0.1); ctx.lineTo(r * 0.24, -r * 0.1); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(-r * 0.2 + i * r * 0.1, -r * 0.05 + i * 8); ctx.lineTo(r * 0.2 - i * r * 0.1, -r * 0.05 + i * 8); ctx.stroke(); } ctx.restore();
      for (const s of [-1, 1]) { ctx.fillStyle = ey; ctx.beginPath(); ctx.arc(x + s * r * 0.3, y - r * 0.05, r * 0.13, 0, TAU); ctx.fill(); } },
    mothership(o, g) { const { x, y, r, T, f, b0, b1, ac, ey } = g, open = o.cur && o.cur.k === 'launch' ? 1 : 0; ctx.fillStyle = hexA(ac).replace('A', '.12'); ctx.beginPath(); ctx.moveTo(x - r * 0.7, y + r * 0.5); ctx.lineTo(x + r * 0.7, y + r * 0.5); ctx.lineTo(x + r * 1.6, y + r * 2.4); ctx.lineTo(x - r * 1.6, y + r * 2.4); ctx.fill();
      ctx.fillStyle = f ? '#fff' : hexA(ey).replace('A', '.6'); ctx.beginPath(); ctx.ellipse(x, y - r * 0.25, r * 0.7, r * 0.7, 0, Math.PI, TAU); ctx.fill(); ctx.fillStyle = b1; ctx.beginPath(); ctx.ellipse(x, y + r * 0.15, r * 2.1, r * 0.62, 0, 0, TAU); ctx.fill(); ctx.fillStyle = b0; ctx.beginPath(); ctx.ellipse(x, y, r * 2.0, r * 0.52, 0, Math.PI, TAU); ctx.fill(); ctx.beginPath(); ctx.ellipse(x, y, r * 2.0, r * 0.4, 0, 0, Math.PI); ctx.fill();
      for (let i = 0; i < 11; i++) { ctx.fillStyle = (Math.floor(T * 5) + i) % 3 ? ac : '#fff'; ctx.beginPath(); ctx.arc(x - r * 1.7 + i * r * 0.34, y + r * 0.02 + Math.abs(i - 5) * 1.5, 3.2, 0, TAU); ctx.fill(); }
      ctx.fillStyle = open ? '#fff7c0' : '#10141c'; ctx.fillRect(x - r * 0.45, y + r * 0.42, r * 0.9, r * 0.18); ctx.fillStyle = ey; ctx.beginPath(); ctx.arc(x, y - r * 0.3, r * 0.17, 0, TAU); ctx.fill(); },
    warden(o, g) { const { x, y, r, T, f, b0, b1, ac, ey } = g; for (const w of (o.wells || [])) { const fl = w.t > 3, col = fl ? '#ffe27a' : '#b09aff'; glowRing(w.x, w.y, 110, hexA(col), 0.35); ctx.fillStyle = '#05010c'; ctx.beginPath(); ctx.arc(w.x, w.y, 26, 0, TAU); ctx.fill(); ctx.strokeStyle = col; ctx.lineWidth = 2; for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.arc(w.x, w.y, 40 + k * 22 - ((T * (fl ? -40 : 40)) % 22 + 22) % 22, 0, TAU); ctx.stroke(); } }
      for (let k = 0; k < 3; k++) { ctx.strokeStyle = hexA(ac).replace('A', '.7'); ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(x, y, r * (1.2 + k * 0.35), r * (0.35 + k * 0.1), T * 0.5 * (k % 2 ? -1 : 1) + k, 0, TAU); ctx.stroke(); const a = T * (1.2 + k * 0.4) + k * 2; ctx.fillStyle = b1; ctx.beginPath(); ctx.arc(x + Math.cos(a) * r * (1.2 + k * 0.35), y + Math.sin(a) * r * (0.35 + k * 0.1), 6 + k, 0, TAU); ctx.fill(); }
      ctx.fillStyle = b1; ctx.beginPath(); ctx.moveTo(x - r * 0.9, y + r * 1.2); ctx.quadraticCurveTo(x, y - r * 0.8, x + r * 0.9, y + r * 1.2); ctx.fill(); ctx.fillStyle = b0; ctx.beginPath(); ctx.arc(x, y - r * 0.35, r * 0.62, 0, TAU); ctx.fill(); ctx.fillStyle = '#07040f'; ctx.beginPath(); ctx.arc(x, y - r * 0.32, r * 0.46, 0, TAU); ctx.fill(); ctx.fillStyle = ey; ctx.beginPath(); ctx.arc(x + Math.cos(angTo(o, player)) * 4, y - r * 0.32 + Math.sin(angTo(o, player)) * 4, r * 0.17, 0, TAU); ctx.fill(); },
    overlord(o, g) { const { x, y, r, T, f, b0, b1, ac, ey } = g; for (let i = 0; i < 2; i++) { const h = o.hands[i], s = i ? 1 : -1; ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(h.x, h.y + 40, 30, 8, 0, 0, TAU); ctx.fill(); ctx.fillStyle = b1; ctx.beginPath(); ctx.arc(h.x, h.y, 30, 0, TAU); ctx.fill(); ctx.fillStyle = b0; for (let k = -1; k <= 1; k++) ctx.fillRect(h.x - 22 + k * 15, h.y - 44, 12, 28); ctx.fillRect(h.x + s * -34, h.y - 4, 12, 24); ctx.strokeStyle = ac; ctx.lineWidth = 3; ctx.strokeRect(h.x - 30, h.y + 8, 60, 14); }
      ctx.strokeStyle = hexA(ac).replace('A', '.5'); ctx.lineWidth = 6; ctx.beginPath(); ctx.ellipse(x, y - r * 1.2, r * 0.9, r * 0.22, 0, 0, TAU); ctx.stroke(); ctx.fillStyle = b1; ctx.fillRect(x - r * 0.9, y - r * 0.2, r * 1.8, r * 1.1); ctx.fillStyle = b0; ctx.beginPath(); ctx.arc(x, y - r * 0.5, r * 0.95, Math.PI, 0); ctx.lineTo(x + r * 0.95, y + r * 0.2); ctx.lineTo(x - r * 0.95, y + r * 0.2); ctx.fill(); ctx.fillStyle = '#10141c'; ctx.fillRect(x - r * 0.7, y - r * 0.6, r * 1.4, r * 0.34); ctx.fillStyle = ey; const sc = (T * 40) % (r * 1.2); ctx.fillRect(x - r * 0.62 + sc, y - r * 0.56, r * 0.18, r * 0.26); if (o.cur && o.cur.k === 'moonbeam' && o.cur.e < 0.6) glowRing(x, y + r * 0.3, 60 * (o.cur.e / 0.6 + 0.3), 'rgba(255,255,255,A)', 0.8); },
    serpent(o, g) { const { x, y, r, T, f, b0, b1, ac, ey } = g, S = o.seg || []; for (let k = S.length - 1; k >= 1; k--) { const s = S[k], rr = Math.max(6, r * 0.78 - k * 1.5); ctx.fillStyle = k % 2 ? b1 : b0; ctx.beginPath(); ctx.arc(s.x, s.y, rr, 0, TAU); ctx.fill(); ctx.fillStyle = ac; ctx.beginPath(); ctx.arc(s.x, s.y, rr * 0.3, 0, TAU); ctx.fill(); }
      ctx.save(); ctx.translate(x, y); ctx.rotate(o.hd || 0); ctx.fillStyle = b0; ctx.beginPath(); ctx.moveTo(r * 1.1, 0); ctx.lineTo(r * 0.2, -r * 0.72); ctx.lineTo(-r * 0.6, -r * 0.5); ctx.lineTo(-r * 0.6, r * 0.5); ctx.lineTo(r * 0.2, r * 0.72); ctx.fill(); ctx.fillStyle = '#2a0a06'; ctx.beginPath(); ctx.moveTo(r * 1.1, 0); ctx.lineTo(r * 0.4, -r * 0.18); ctx.lineTo(r * 0.4, r * 0.18); ctx.fill(); ctx.fillStyle = '#fff'; for (let i = 0; i < 3; i++) { ctx.fillRect(r * (0.5 + i * 0.18), -r * 0.2, 4, 7); ctx.fillRect(r * (0.5 + i * 0.18), r * 0.13, 4, 7); } ctx.fillStyle = ey; ctx.beginPath(); ctx.arc(r * 0.1, -r * 0.32, r * 0.12, 0, TAU); ctx.arc(r * 0.1, r * 0.32, r * 0.12, 0, TAU); ctx.fill(); ctx.restore(); },
    marauder(o, g) { const { x, y, r, T, f, b0, b1, ac, ey } = g, a = angTo(o, player); ctx.fillStyle = b1; ctx.fillRect(x - r * 0.45, y + r * 0.3, r * 0.3, r * 0.9); ctx.fillRect(x + r * 0.15, y + r * 0.3, r * 0.3, r * 0.9); ctx.fillStyle = b0; ctx.beginPath(); ctx.moveTo(x - r * 0.8, y - r * 0.3); ctx.lineTo(x + r * 0.8, y - r * 0.3); ctx.lineTo(x + r * 0.95, y + r * 0.8); ctx.lineTo(x - r * 0.95, y + r * 0.8); ctx.fill(); ctx.fillStyle = ac; ctx.fillRect(x - r * 0.9, y + r * 0.5, r * 1.8, r * 0.12);
      ctx.fillStyle = b1; ctx.fillRect(x - r * 0.35, y - r * 0.85, r * 0.7, r * 0.55); ctx.fillStyle = '#10141c'; ctx.fillRect(x - r * 0.28, y - r * 0.7, r * 0.56, r * 0.14); ctx.fillStyle = ey; ctx.fillRect(x - r * 0.2 + Math.sin(T * 3) * r * 0.1, y - r * 0.68, r * 0.14, r * 0.1);
      ctx.fillStyle = '#3a2418'; ctx.beginPath(); ctx.ellipse(x, y - r * 0.88, r * 0.85, r * 0.14, 0, 0, TAU); ctx.fill(); ctx.fillRect(x - r * 0.35, y - r * 1.25, r * 0.7, r * 0.4);
      ctx.save(); ctx.translate(x, y + r * 0.1); ctx.rotate(a); ctx.fillStyle = '#2a2e3c'; ctx.fillRect(0, -3, r * 1.7, 6); ctx.fillStyle = ac; ctx.fillRect(r * 1.6, -4, 5, 8); ctx.restore(); if (o.cur && o.cur.k === 'quickdraw' && o.cur.e < 0.9) { ctx.strokeStyle = 'rgba(255,60,60,' + (0.2 + o.cur.e * 0.7) + ')'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, y + r * 0.1); ctx.lineTo(x + Math.cos(o.cur.a) * 700, y + r * 0.1 + Math.sin(o.cur.a) * 700); ctx.stroke(); } },
    seer(o, g) { drawSeer(g.x, g.y, g.r, o.def.c, g.f, 1, o); },
    magma(o, g) { const { x, y, r, T, f, b0, b1, ac, ey } = g, op = o.shell || 0; glowRing(x, y, r * (1.6 + op * 0.8), hexA(ac), 0.35 + op * 0.4); const gr = ctx.createRadialGradient(x - r * 0.2, y - r * 0.2, 2, x, y, r * (0.8 + op * 0.2)); gr.addColorStop(0, '#fff'); gr.addColorStop(0.4, ey); gr.addColorStop(1, b0); ctx.fillStyle = f ? '#fff' : gr; ctx.beginPath(); ctx.arc(x, y, r * 0.85, 0, TAU); ctx.fill();
      for (let k = 0; k < 6; k++) { const a = k * TAU / 6 + T * 0.2, d = r * (0.62 + op * 0.55); ctx.save(); ctx.translate(x + Math.cos(a) * d, y + Math.sin(a) * d); ctx.rotate(a); ctx.fillStyle = f ? '#fff' : '#3a1208'; ctx.beginPath(); ctx.moveTo(-r * 0.22, -r * 0.34); ctx.lineTo(r * 0.3, -r * 0.3); ctx.lineTo(r * 0.3, r * 0.3); ctx.lineTo(-r * 0.22, r * 0.34); ctx.fill(); ctx.strokeStyle = ac; ctx.lineWidth = 2; ctx.stroke(); ctx.restore(); } },
    scrap(o, g) { const { x, y, r, T, f, b0, b1, ac, ey } = g, sp = o.cur && o.cur.k === 'rampage' && o.cur.s === 1 ? 12 : 2; ctx.save(); ctx.translate(x, y); ctx.rotate(T * sp); ctx.fillStyle = f ? '#fff' : b1; for (let i = 0; i < 16; i++) { const a = i * TAU / 16; ctx.beginPath(); ctx.moveTo(Math.cos(a - 0.14) * r * 1.0, Math.sin(a - 0.14) * r * 1.0); ctx.lineTo(Math.cos(a) * r * 1.38, Math.sin(a) * r * 1.38); ctx.lineTo(Math.cos(a + 0.14) * r * 1.0, Math.sin(a + 0.14) * r * 1.0); ctx.fill(); } ctx.fillStyle = f ? '#fff' : '#5a4a42'; ctx.beginPath(); ctx.arc(0, 0, r * 1.05, 0, TAU); ctx.fill(); ctx.strokeStyle = ac; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, r * 0.9, 0, TAU); ctx.stroke(); for (let i = 0; i < 8; i++) { ctx.fillStyle = '#2a2220'; ctx.beginPath(); ctx.arc(Math.cos(i * 0.785) * r * 0.75, Math.sin(i * 0.785) * r * 0.75, 4, 0, TAU); ctx.fill(); } ctx.restore();
      ctx.fillStyle = b0; ctx.beginPath(); ctx.ellipse(x, y - r * 0.05, r * 0.5, r * 0.55, 0, 0, TAU); ctx.fill(); ctx.fillRect(x - r * 0.28, y + r * 0.3, r * 0.56, r * 0.25); ctx.fillStyle = '#10080a'; ctx.beginPath(); ctx.arc(x - r * 0.2, y - r * 0.1, r * 0.14, 0, TAU); ctx.arc(x + r * 0.2, y - r * 0.1, r * 0.14, 0, TAU); ctx.fill(); ctx.fillStyle = ey; ctx.beginPath(); ctx.arc(x - r * 0.2, y - r * 0.1, r * 0.06, 0, TAU); ctx.arc(x + r * 0.2, y - r * 0.1, r * 0.06, 0, TAU); ctx.fill(); },
    jelly(o, g) { const { x, y, r, T, f, b0, b1, ac, ey } = g; for (const n of (o.nets || [])) { const P = n.pts; for (let i = 0; i < 3; i++) { const a = P[i], b = P[(i + 1) % 3]; if (n.t < 1) { ctx.strokeStyle = hexA(ac).replace('A', '.35'); ctx.lineWidth = 2; ctx.setLineDash([8, 8]); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); ctx.setLineDash([]); } else { ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(a[0], a[1]); for (let k = 1; k < 8; k++) ctx.lineTo(a[0] + (b[0] - a[0]) * k / 8 + rnd(-8, 8), a[1] + (b[1] - a[1]) * k / 8 + rnd(-8, 8)); ctx.lineTo(b[0], b[1]); ctx.stroke(); ctx.strokeStyle = hexA(ac).replace('A', '.5'); ctx.lineWidth = 10; ctx.stroke(); } } for (const q of P) { glowRing(q[0], q[1], 26, hexA(ac), 0.8); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(q[0], q[1], 7, 0, TAU); ctx.fill(); } }
      for (let i = 0; i < 8; i++) { const bx = x + (i - 3.5) * r * 0.22, w = Math.sin(T * 3 + i) * r * 0.2; ctx.strokeStyle = hexA(ac).replace('A', '.6'); ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(bx, y + r * 0.2); ctx.quadraticCurveTo(bx + w, y + r * 1.0, bx - w, y + r * 1.9); ctx.stroke(); } ctx.fillStyle = f ? '#fff' : hexA(b0).replace('A', '.8'); ctx.beginPath(); ctx.ellipse(x, y, r * 1.05, r * 0.9, 0, Math.PI, TAU); ctx.quadraticCurveTo(x + r * 0.5, y + r * 0.5, x, y + r * 0.2); ctx.quadraticCurveTo(x - r * 0.5, y + r * 0.5, x - r * 1.05, y); ctx.fill(); ctx.strokeStyle = ey; ctx.lineWidth = 2; ctx.beginPath(); let px = x - r * 0.6, py = y - r * 0.2; ctx.moveTo(px, py); for (let k = 0; k < 6; k++) { px += r * 0.2; py = y - r * 0.2 + rnd(-10, 10); ctx.lineTo(px, py); } ctx.stroke(); },
    roc(o, g) { const { x, y, r, T, f, b0, b1, ac, ey } = g, s = o.air > 0.3 ? 1.5 : 1, fl = Math.sin(T * (o.air > 0.3 ? 14 : 7)) * 0.45, a = o.cur && o.cur.k === 'swoop' && o.cur.p0 ? Math.atan2(o.cur.p1[1] - o.cur.p0[1], o.cur.p1[0] - o.cur.p0[0]) + Math.PI / 2 : 0; ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.scale(s, s);
      for (const sd of [-1, 1]) { ctx.save(); ctx.scale(sd, 1); ctx.rotate(fl); ctx.fillStyle = b1; ctx.beginPath(); ctx.moveTo(r * 0.2, -r * 0.1); ctx.quadraticCurveTo(r * 1.4, -r * 0.9, r * 2.2, -r * 0.2); for (let k = 0; k < 5; k++) ctx.lineTo(r * (2.1 - k * 0.38), r * (0.1 + k * 0.1)); ctx.lineTo(r * 0.2, r * 0.3); ctx.fill(); ctx.strokeStyle = ac; ctx.lineWidth = 2; ctx.stroke(); ctx.restore(); }
      ctx.fillStyle = b0; ctx.beginPath(); ctx.ellipse(0, 0, r * 0.45, r * 0.8, 0, 0, TAU); ctx.fill(); ctx.fillStyle = b1; ctx.beginPath(); ctx.moveTo(-r * 0.3, r * 0.6); ctx.lineTo(0, r * 1.5); ctx.lineTo(r * 0.3, r * 0.6); ctx.fill(); ctx.fillStyle = b0; ctx.beginPath(); ctx.arc(0, -r * 0.8, r * 0.3, 0, TAU); ctx.fill(); ctx.fillStyle = '#ffb347'; ctx.beginPath(); ctx.moveTo(-r * 0.12, -r * 1.0); ctx.lineTo(0, -r * 1.5); ctx.lineTo(r * 0.12, -r * 1.0); ctx.fill(); ctx.fillStyle = ey; ctx.beginPath(); ctx.arc(-r * 0.12, -r * 0.85, 3, 0, TAU); ctx.arc(r * 0.12, -r * 0.85, 3, 0, TAU); ctx.fill(); ctx.restore(); },
    cloudknight(o, g) { const { x, y, r, T, f, b0, b1, ac, ey } = g; for (const w of (o.tw || [])) { for (let k = 0; k < 8; k++) { const u = k / 7, rr = 10 + u * 36, ox = Math.sin(T * 6 + k) * 6 * u; ctx.fillStyle = hexA(ac).replace('A', 0.35 - u * 0.15); ctx.beginPath(); ctx.ellipse(w.x + ox, w.y + 30 - u * 70, rr, rr * 0.3, 0, 0, TAU); ctx.fill(); } }
      ctx.globalAlpha = 0.75 + Math.sin(T * 3) * 0.2; ctx.fillStyle = f ? '#fff' : b1; for (const [dx, dy, rr] of [[-0.75, 0.3, 0.45], [0.75, 0.3, 0.45], [0, 0.65, 0.6], [-0.4, 0.9, 0.4], [0.4, 0.9, 0.4]]) { ctx.beginPath(); ctx.arc(x + dx * r, y + dy * r, rr * r, 0, TAU); ctx.fill(); } ctx.fillStyle = f ? '#fff' : b0; ctx.beginPath(); ctx.arc(x, y - r * 0.1, r * 0.7, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.moveTo(x - r * 0.65, y - r * 0.5); ctx.lineTo(x, y - r * 1.3); ctx.lineTo(x + r * 0.65, y - r * 0.5); ctx.fill(); ctx.globalAlpha = 1; ctx.fillStyle = '#10141c'; ctx.fillRect(x - r * 0.45, y - r * 0.28, r * 0.9, r * 0.2); ctx.fillStyle = ey; ctx.fillRect(x - r * 0.35, y - r * 0.25, r * 0.7, r * 0.1);
      ctx.strokeStyle = '#ddd'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(x + r * 1.2, y - r * 0.8); ctx.lineTo(x + r * 1.2, y + r * 1.2); ctx.stroke(); ctx.strokeStyle = ac; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x + r * 1.2, y - r * 0.8); for (let k = 1; k < 5; k++) ctx.lineTo(x + r * 1.2 + rnd(-10, 10), y - r * 0.8 - k * 9); ctx.stroke(); },
    tempest(o, g) { const { x, y, r, T, f, b0, b1, ac, ey } = g; for (let arm = 0; arm < 3; arm++) for (let k = 0; k < 30; k++) { const a = arm * TAU / 3 + k * 0.17 + T * 0.8, d = r * 0.5 + k * r * 0.07; ctx.fillStyle = k % 2 ? hexA(b1).replace('A', '.5') : hexA(b0).replace('A', '.45'); ctx.beginPath(); ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.8, r * 0.28 - k * 0.003 * r, 0, TAU); ctx.fill(); }
      ctx.fillStyle = f ? '#fff' : '#f4fbff'; ctx.beginPath(); ctx.ellipse(x, y, r * 0.7, r * 0.5, 0, 0, TAU); ctx.fill(); const pa = angTo(o, player); ctx.fillStyle = ey; ctx.beginPath(); ctx.arc(x + Math.cos(pa) * r * 0.16, y + Math.sin(pa) * r * 0.12, r * 0.3, 0, TAU); ctx.fill(); ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(x + Math.cos(pa) * r * 0.22, y + Math.sin(pa) * r * 0.16, r * 0.13, 0, TAU); ctx.fill(); },
    queen(o, g) { const { x, y, r, T, f, b0, b1, ac, ey } = g; ctx.fillStyle = f ? '#fff' : b1; for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc(x - r * 1.0 + i * r * 0.4, y + r * 0.95 + Math.sin(T * 2 + i) * 4 + Math.abs(i - 2.5) * 3, r * 0.5, 0, TAU); ctx.fill(); } ctx.beginPath(); ctx.moveTo(x - r * 0.5, y - r * 0.2); ctx.lineTo(x + r * 0.5, y - r * 0.2); ctx.lineTo(x + r * 1.0, y + r * 1.0); ctx.lineTo(x - r * 1.0, y + r * 1.0); ctx.fill(); ctx.fillStyle = f ? '#fff' : b0; ctx.beginPath(); ctx.moveTo(x - r * 0.4, y - r * 0.2); ctx.lineTo(x + r * 0.4, y - r * 0.2); ctx.lineTo(x + r * 0.3, y + r * 0.5); ctx.lineTo(x - r * 0.3, y + r * 0.5); ctx.fill();
      for (let i = 0; i < 4; i++) { ctx.strokeStyle = hexA(ac).replace('A', '.7'); ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(x + (i % 2 ? 1 : -1) * r * 0.35, y - r * 0.8); ctx.quadraticCurveTo(x + (i % 2 ? 1 : -1) * (r * 0.9 + i * 8), y - r * 0.2 + Math.sin(T * 3 + i) * 8, x + (i % 2 ? 1 : -1) * (r * 0.7 + i * 12), y + r * 0.5); ctx.stroke(); } ctx.fillStyle = '#e8d8c8'; ctx.beginPath(); ctx.ellipse(x, y - r * 0.6, r * 0.38, r * 0.45, 0, 0, TAU); ctx.fill(); ctx.fillStyle = ey; ctx.fillRect(x - r * 0.2, y - r * 0.62, r * 0.14, 4); ctx.fillRect(x + r * 0.06, y - r * 0.62, r * 0.14, 4);
      ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.moveTo(x - r * 0.45, y - r * 0.95); for (let i = 0; i < 5; i++) { ctx.lineTo(x - r * 0.45 + i * r * 0.225 + r * 0.11, y - r * 1.6 - (i % 2) * 8); ctx.lineTo(x - r * 0.45 + (i + 1) * r * 0.225, y - r * 0.95); } ctx.fill(); ctx.strokeStyle = '#ddd'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x + r * 1.1, y - r * 0.6); ctx.lineTo(x + r * 1.1, y + r * 0.9); ctx.stroke(); glowRing(x + r * 1.1, y - r * 0.7, 30, hexA(ac), 0.9); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x + r * 1.1, y - r * 0.7, 8, 0, TAU); ctx.fill(); },
    golem(o, g) { const { x, y, r, T, f, b0, b1, ac, ey } = g; for (const s of o.sh || []) { ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(T * 5 + s.a); ctx.fillStyle = ac; ctx.beginPath(); ctx.moveTo(0, -12); ctx.lineTo(7, 0); ctx.lineTo(0, 12); ctx.lineTo(-7, 0); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(3, 0); ctx.lineTo(0, 6); ctx.lineTo(-3, 0); ctx.fill(); ctx.restore(); }
      for (const s of [-1, 1]) { ctx.fillStyle = b1; ctx.beginPath(); ctx.moveTo(x + s * r * 0.7, y - r * 0.3); ctx.lineTo(x + s * r * 1.3, y + r * 0.2); ctx.lineTo(x + s * r * 1.1, y + r * 1.0); ctx.lineTo(x + s * r * 0.8, y + r * 0.3); ctx.fill(); ctx.fillStyle = ac; ctx.beginPath(); ctx.moveTo(x + s * r * 1.1, y + r * 1.0); ctx.lineTo(x + s * r * 1.3, y + r * 1.5); ctx.lineTo(x + s * r * 0.95, y + r * 1.1); ctx.fill(); }
      ctx.fillStyle = b0; ctx.beginPath(); ctx.moveTo(x - r * 0.7, y - r * 0.4); ctx.lineTo(x + r * 0.7, y - r * 0.4); ctx.lineTo(x + r * 0.5, y + r * 1.0); ctx.lineTo(x - r * 0.5, y + r * 1.0); ctx.fill(); ctx.fillStyle = b1; ctx.beginPath(); ctx.moveTo(x - r * 0.3, y - r * 0.4); ctx.lineTo(x, y + r * 0.8); ctx.lineTo(x + r * 0.3, y - r * 0.4); ctx.fill(); ctx.fillStyle = b0; ctx.beginPath(); ctx.moveTo(x, y - r * 1.2); ctx.lineTo(x + r * 0.4, y - r * 0.6); ctx.lineTo(x, y - r * 0.35); ctx.lineTo(x - r * 0.4, y - r * 0.6); ctx.fill(); ctx.fillStyle = ey; ctx.fillRect(x - r * 0.2, y - r * 0.7, r * 0.14, r * 0.1); ctx.fillRect(x + r * 0.06, y - r * 0.7, r * 0.14, r * 0.1); },
    dancer(o, g) { const { x, y, r, T, f, b0, b1, ac, ey } = g, R = o.rib || []; for (let k = 0; k < 3; k++) { ctx.strokeStyle = RB[(k * 2 + Math.floor(T * 2)) % 6]; ctx.lineWidth = 5 - k; ctx.beginPath(); for (let i = 0; i < R.length; i += 2) { const p = R[i]; const px = p[0] + Math.sin(T * 6 + i + k * 2) * 6, py = p[1] + Math.cos(T * 6 + i + k) * 6; if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); } ctx.stroke(); }
      ctx.fillStyle = f ? '#fff' : b1; ctx.beginPath(); ctx.moveTo(x - r * 0.9, y + r * 0.5); for (let i = 0; i <= 8; i++) ctx.lineTo(x - r * 0.9 + i * r * 0.225, y + r * 0.5 + (i % 2 ? r * 0.2 : 0) + Math.sin(T * 6 + i) * 3); ctx.lineTo(x + r * 0.2, y - r * 0.1); ctx.lineTo(x - r * 0.2, y - r * 0.1); ctx.fill(); ctx.fillStyle = b0; ctx.beginPath(); ctx.moveTo(x - r * 0.25, y - r * 0.2); ctx.lineTo(x + r * 0.25, y - r * 0.2); ctx.lineTo(x + r * 0.15, y + r * 0.6); ctx.lineTo(x - r * 0.15, y + r * 0.6); ctx.fill(); ctx.beginPath(); ctx.arc(x, y - r * 0.5, r * 0.3, 0, TAU); ctx.fill(); ctx.strokeStyle = b0; ctx.lineWidth = 4; const sw = Math.sin(T * 4) * r * 0.3; ctx.beginPath(); ctx.moveTo(x - r * 0.2, y - r * 0.1); ctx.lineTo(x - r * 1.0, y - r * 0.6 + sw); ctx.moveTo(x + r * 0.2, y - r * 0.1); ctx.lineTo(x + r * 1.0, y - r * 0.6 - sw); ctx.stroke(); ctx.fillStyle = ey; ctx.beginPath(); ctx.arc(x - r * 0.1, y - r * 0.5, 2.5, 0, TAU); ctx.arc(x + r * 0.1, y - r * 0.5, 2.5, 0, TAU); ctx.fill(); },
    mirror(o, g) { const { x, y, r, T, f, b0, b1, ac, ey } = g, up = o.up; ctx.fillStyle = f ? '#fff' : '#9a8aa8'; ctx.beginPath(); ctx.ellipse(x, y, r * 0.95, r * 1.35, 0, 0, TAU); ctx.fill(); const gr = ctx.createLinearGradient(x - r, y - r, x + r, y + r); gr.addColorStop(0, up ? '#e8f4ff' : '#4a5a78'); gr.addColorStop(0.5, up ? '#9ad0ff' : '#2a3450'); gr.addColorStop(1, up ? '#e8f4ff' : '#4a5a78'); ctx.fillStyle = f ? '#fff' : gr; ctx.beginPath(); ctx.ellipse(x, y, r * 0.78, r * 1.18, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = up ? 'rgba(255,255,255,.35)' : 'rgba(10,6,20,.55)'; ctx.beginPath(); ctx.ellipse(x, y + r * 0.1, r * 0.32, r * 0.5, 0, 0, TAU); ctx.fill(); ctx.fillStyle = ey; ctx.beginPath(); ctx.arc(x - r * 0.14, y - r * 0.05, 4, 0, TAU); ctx.arc(x + r * 0.14, y - r * 0.05, 4, 0, TAU); ctx.fill();
      if (up) { const sh = ((T * 1.2) % 1); ctx.save(); ctx.beginPath(); ctx.ellipse(x, y, r * 0.78, r * 1.18, 0, 0, TAU); ctx.clip(); ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.save(); ctx.translate(x - r * 1.2 + sh * r * 2.4, y); ctx.rotate(0.5); ctx.fillRect(-6, -r * 1.6, 14, r * 3.2); ctx.restore(); ctx.restore(); } else { ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x - r * 0.3, y - r * 0.9); ctx.lineTo(x, y - r * 0.2); ctx.lineTo(x + r * 0.4, y - r * 0.6); ctx.moveTo(x, y - r * 0.2); ctx.lineTo(x - r * 0.2, y + r * 0.7); ctx.stroke(); }
      ctx.strokeStyle = ac; ctx.lineWidth = 4; ctx.beginPath(); ctx.ellipse(x, y, r * 0.95, r * 1.35, 0, 0, TAU); ctx.stroke(); for (let i = 0; i < 6; i++) { const a = i * TAU / 6 + T * 0.4; ctx.fillStyle = ac; ctx.beginPath(); ctx.arc(x + Math.cos(a) * r * 0.95, y + Math.sin(a) * r * 1.35, 5, 0, TAU); ctx.fill(); } },
    titan(o, g) { const { x, y, r, T, f, b0, b1, ac, ey } = g; for (const s of [-1, 1]) { ctx.fillStyle = b1; ctx.fillRect(x + s * r * 0.95 - r * 0.28, y - r * 0.2, r * 0.56, r * 1.4); ctx.fillStyle = b0; ctx.beginPath(); ctx.moveTo(x + s * r * 0.67 - r * 0.45, y + r * 1.2); ctx.lineTo(x + s * r * 0.95, y + r * 1.8); ctx.lineTo(x + s * r * 1.25 + r * 0.2, y + r * 1.2); ctx.fill(); }
      ctx.fillStyle = b0; ctx.beginPath(); ctx.moveTo(x - r * 0.95, y - r * 0.3); ctx.lineTo(x - r * 0.5, y - r * 0.95); ctx.lineTo(x + r * 0.5, y - r * 0.95); ctx.lineTo(x + r * 0.95, y - r * 0.3); ctx.lineTo(x + r * 0.7, y + r * 1.0); ctx.lineTo(x - r * 0.7, y + r * 1.0); ctx.fill(); ctx.fillStyle = b1; ctx.beginPath(); ctx.moveTo(x - r * 0.4, y - r * 0.3); ctx.lineTo(x, y + r * 0.9); ctx.lineTo(x + r * 0.4, y - r * 0.3); ctx.fill();
      for (let i = 0; i < 6; i++) { const cx = x - r * 0.75 + i * r * 0.3, ch = r * (0.3 + (i % 3) * 0.2); ctx.fillStyle = i % 2 ? ac : '#fff'; ctx.beginPath(); ctx.moveTo(cx - 8, y - r * 0.95); ctx.lineTo(cx, y - r * 0.95 - ch); ctx.lineTo(cx + 8, y - r * 0.95); ctx.fill(); }
      ctx.fillStyle = b1; ctx.fillRect(x - r * 0.3, y - r * 0.7, r * 0.6, r * 0.4); ctx.fillStyle = ey; ctx.fillRect(x - r * 0.2, y - r * 0.58, r * 0.14, r * 0.1); ctx.fillRect(x + r * 0.06, y - r * 0.58, r * 0.14, r * 0.1); },
    empress(o, g) { const { x, y, r, T, f, b0, b1, ac, ey } = g; ctx.fillStyle = f ? '#fff' : b1; ctx.beginPath(); ctx.moveTo(x - r * 0.4, y - r * 0.2); ctx.lineTo(x + r * 0.4, y - r * 0.2); ctx.lineTo(x + r * 1.3, y + r * 1.3); ctx.lineTo(x - r * 1.3, y + r * 1.3); ctx.fill(); ctx.fillStyle = f ? '#fff' : b0; for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.moveTo(x - r * 0.35 + i * r * 0.18, y - r * 0.2); ctx.lineTo(x - r * 1.0 + i * r * 0.5, y + r * 1.3); ctx.lineTo(x - r * 0.6 + i * r * 0.5, y + r * 1.3); ctx.fill(); }
      ctx.fillStyle = '#f8e8f8'; ctx.beginPath(); ctx.ellipse(x, y - r * 0.55, r * 0.32, r * 0.4, 0, 0, TAU); ctx.fill(); ctx.fillStyle = ey; ctx.fillRect(x - r * 0.18, y - r * 0.6, r * 0.12, 4); ctx.fillRect(x + r * 0.06, y - r * 0.6, r * 0.12, 4); for (let i = 0; i < 5; i++) { const ch = r * (0.5 + (i === 2 ? 0.4 : (i % 2) * -0.1)); ctx.fillStyle = RB[i]; ctx.beginPath(); ctx.moveTo(x - r * 0.4 + i * r * 0.2, y - r * 0.85); ctx.lineTo(x - r * 0.3 + i * r * 0.2, y - r * 0.85 - ch); ctx.lineTo(x - r * 0.2 + i * r * 0.2, y - r * 0.85); ctx.fill(); }
      for (const gm of (o.gems || [])) { glowRing(gm.x, gm.y, 24, hexA(gm.c), 0.8); ctx.fillStyle = gm.c; ctx.save(); ctx.translate(gm.x, gm.y); ctx.rotate(T * 3); ctx.beginPath(); ctx.moveTo(0, -11); ctx.lineTo(8, 0); ctx.lineTo(0, 11); ctx.lineTo(-8, 0); ctx.fill(); ctx.restore(); } },
    drone(o, g) { const { x, y, r, T, f, b0, b1, ac, ey } = g; if (o.cur && o.cur.k === 'railgun' && o.cur.e < 0.85) { ctx.strokeStyle = 'rgba(255,60,60,' + (o.cur.e < 0.35 ? 0.35 : 0.9) + ')'; ctx.lineWidth = o.cur.e < 0.35 ? 1 : 3; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(o.cur.a) * 780, y + Math.sin(o.cur.a) * 780); ctx.stroke(); }
      for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4, ax = x + Math.cos(a) * r * 1.2, ay = y + Math.sin(a) * r * 0.8; ctx.strokeStyle = b1; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(ax, ay); ctx.stroke(); ctx.fillStyle = hexA(ac).replace('A', '.4'); ctx.beginPath(); ctx.ellipse(ax, ay - 4, r * 0.55, 5 + Math.abs(Math.sin(T * 40 + i)) * 4, 0, 0, TAU); ctx.fill(); }
      ctx.fillStyle = f ? '#fff' : b0; ctx.beginPath(); ctx.arc(x, y, r * 0.65, 0, TAU); ctx.fill(); ctx.fillStyle = b1; ctx.beginPath(); ctx.arc(x, y, r * 0.5, 0, TAU); ctx.fill(); ctx.fillStyle = '#ff2a2a'; ctx.beginPath(); ctx.arc(x + Math.cos(angTo(o, player)) * 3, y + Math.sin(angTo(o, player)) * 3, r * 0.26, 0, TAU); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x - 2, y - 2, 3, 0, TAU); ctx.fill(); },
    knight(o, g) { const { x, y, r, T, f, b0, b1, ac, ey } = g, S = ['..HHHH..', '.HHHHHH.', '.HVVVVH.', '.HHEEHH.', 'SBBBBBBS', 'SBBCCBBS', 'S.BBBB.S', '..BBBB..', '..BLLB..', '..LL.LL.', '..LL.LL.', '.LLL.LLL'], u = r * 0.2, gl = Math.sin(T * 9) > 0.8; S.forEach((row, j) => { const off = (gl && j % 3 === Math.floor(T * 7) % 3) ? rnd(-10, 10) : 0; for (let i = 0; i < 8; i++) { const ch = row[i]; if (ch === '.') continue; ctx.fillStyle = f ? '#fff' : ch === 'H' ? b0 : ch === 'V' ? '#10141c' : ch === 'E' ? ey : ch === 'C' ? ac : ch === 'S' ? b1 : ch === 'L' ? b1 : b0; ctx.fillRect(x - u * 4 + i * u + off, y - u * 6.5 + j * u, u + 0.5, u + 0.5); } });
      if (gl) { ctx.fillStyle = hexA(ac).replace('A', '.5'); ctx.fillRect(x - r, y + rnd(-r, r), r * 2, 4); } ctx.strokeStyle = ac; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(x + u * 5, y - u * 2); ctx.lineTo(x + u * 5, y + u * 5); ctx.stroke(); },
    core(o, g) { const { x, y, r, T, f, b0, b1, ac, ey } = g; for (const [rr, n, dir, col] of [[1.35, 24, 1, b1], [1.0, 16, -1, b0]]) { ctx.fillStyle = f ? '#fff' : col; for (let i = 0; i < n; i++) { const a = i * TAU / n + T * 0.8 * dir; ctx.save(); ctx.translate(x + Math.cos(a) * r * rr, y + Math.sin(a) * r * rr); ctx.rotate(a); ctx.fillRect(-6, -7, 12, 14); ctx.restore(); } ctx.strokeStyle = col; ctx.lineWidth = 10; ctx.beginPath(); ctx.arc(x, y, r * rr, 0, TAU); ctx.stroke(); }
      glowRing(x, y, r * 0.8, hexA(ac), 0.9); ctx.fillStyle = '#10241a'; ctx.beginPath(); ctx.arc(x, y, r * 0.55, 0, TAU); ctx.fill(); ctx.fillStyle = ey; ctx.beginPath(); ctx.arc(x + Math.cos(angTo(o, player)) * 4, y + Math.sin(angTo(o, player)) * 4, r * 0.28, 0, TAU); ctx.fill(); ctx.fillStyle = ac; ctx.beginPath(); ctx.arc(x, y, r * 0.1, 0, TAU); ctx.fill(); },
    prime(o, g) { const { x, y, r, T, f, b0, b1, ac, ey } = g; for (const s of (o.sat || [])) { ctx.fillStyle = b1; ctx.beginPath(); ctx.arc(s.x, s.y, 11, 0, TAU); ctx.fill(); ctx.strokeStyle = ac; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(s.x, s.y, 17, 0.5, 2.6); ctx.stroke(); ctx.fillStyle = ey; ctx.beginPath(); ctx.arc(s.x, s.y, 4, 0, TAU); ctx.fill(); }
      ctx.fillStyle = b1; ctx.beginPath(); ctx.moveTo(x - r * 1.3, y - r * 0.3); ctx.lineTo(x + r * 1.3, y - r * 0.3); ctx.lineTo(x + r * 0.8, y + r * 1.2); ctx.lineTo(x - r * 0.8, y + r * 1.2); ctx.fill(); ctx.fillStyle = b0; ctx.beginPath(); ctx.moveTo(x - r * 0.8, y - r * 0.3); ctx.lineTo(x + r * 0.8, y - r * 0.3); ctx.lineTo(x + r * 0.5, y + r * 1.0); ctx.lineTo(x - r * 0.5, y + r * 1.0); ctx.fill(); glowRing(x, y + r * 0.3, r * 0.55, hexA(ac), 0.9); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y + r * 0.3, r * 0.14, 0, TAU); ctx.fill(); for (const s of [-1, 1]) { ctx.fillStyle = b0; ctx.beginPath(); ctx.ellipse(x + s * r * 1.35, y - r * 0.5, r * 0.45, r * 0.18, s * 0.6, 0, TAU); ctx.fill(); ctx.strokeStyle = ac; ctx.lineWidth = 2; ctx.stroke(); }
      ctx.fillStyle = f ? '#fff' : b0; ctx.fillRect(x - r * 0.45, y - r * 1.1, r * 0.9, r * 0.8); ctx.fillStyle = '#10141c'; ctx.fillRect(x - r * 0.35, y - r * 0.9, r * 0.7, r * 0.22); ctx.fillStyle = ey; ctx.fillRect(x - r * 0.3 + Math.sin(T * 3) * r * 0.25, y - r * 0.86, r * 0.18, r * 0.14); ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.moveTo(x - r * 0.45, y - r * 1.1); for (let i = 0; i < 4; i++) { ctx.lineTo(x - r * 0.45 + i * r * 0.225 + r * 0.11, y - r * 1.5); ctx.lineTo(x - r * 0.45 + (i + 1) * r * 0.225, y - r * 1.1); } ctx.fill(); if (o.cur && o.cur.k === 'orbital') { ctx.strokeStyle = 'rgba(255,60,60,.6)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(player.x, player.y, 30 + Math.sin(T * 12) * 4, 0, TAU); ctx.moveTo(player.x - 40, player.y); ctx.lineTo(player.x + 40, player.y); ctx.moveTo(player.x, player.y - 40); ctx.lineTo(player.x, player.y + 40); ctx.stroke(); } }
  };
  const P2DEFS = [
    // ---- planet 1: LUNA STATION (30-34)
    { name: 'Lunar Sentinel', hp: 520, r: 40, draw: DRAW.sentinel, c: ['#b8c4d8', '#7a889c', '#9fd8ff', '#fff27a'], move: 'orbit', rest: 1.2, atk: [A('gatling', {}), A('salvo', {}), A('rain', {}), A('laser', { ph: 2 }), A('gatling', { ph: 3 })], rage: ['The Sentinel powers up its cannons!', 'SENTINEL OVERLOAD!'], dl: 'The Lunar Sentinel has powered down. The moon station falls silent.', dt: ['shatter', '#9fd8ff'],
      tick(o) { o.face = angTo(o, player); }, dmg(o, b) { const bd = Math.atan2(b.vy, b.vx); return Math.abs(angDiff(bd, o.face + Math.PI)) < 0.95 ? 0.15 : 1.25; } },
    { name: 'Moon Burrower', hp: 540, r: 42, draw: DRAW.burrower, c: ['#9a8a7a', '#6a5a4a', '#ffb070', '#ff5a3a'], move: 'chase', spd: 95, rest: 1.1, atk: [A('burrow', {}), A('dustspit', {}), A('burrow', { ph: 2 }), A('mines', { ph: 2 }), A('ring', { ph: 3 })], rage: ['The Burrower tunnels faster!', 'THE MOON QUAKES!'], dl: 'The Moon Burrower has collapsed into its own tunnel.', dt: ['sink', '#9a8a7a'] },
    { name: 'Mothership Alpha', hp: 580, r: 44, draw: DRAW.mothership, c: ['#9aa6b8', '#5e6a80', '#5affd8', '#a8fff0'], move: 'sway', rest: 1.2, atk: [A('launch', {}), A('bombrun', {}), A('spiral', {}), A('launch', { ph: 2 }), A('laser', { ph: 3 })], rage: ['The Mothership launches its fleet!', 'ALL SHIPS, ATTACK!'], dl: 'Mothership Alpha has crashed. Its fleet scatters into the dark.', dt: ['explode', '#5affd8'] },
    { name: 'Gravity Warden', hp: 600, r: 40, draw: DRAW.warden, c: ['#6a5acd', '#3a2e8a', '#b09aff', '#ffe27a'], move: 'hover', spd: 70, rest: 1.2, atk: [A('wells', {}), A('implode', {}), A('homing', {}), A('wells', { ph: 2 }), A('pulse', { ph: 2 })], rage: ['The Warden bends gravity itself!', 'GRAVITY COLLAPSE!'], dl: 'The Gravity Warden has collapsed. The moon feels light again.', dt: ['implode', '#b09aff'],
      tick(o, dt) { if (!o.wells) return; for (const w of o.wells) { w.t += dt; const d = Math.hypot(w.x - player.x, w.y - player.y); if (d < 260 && d > 8) { const k = (1 - d / 260) * 130 * (w.t > 3 ? -1 : 1) * dt; player.x += (w.x - player.x) / d * k; player.y += (w.y - player.y) / d * k; } } o.wells = o.wells.filter(w => w.t < 5.5); inArena(player); } },
    { name: 'Lunar Overlord', hp: 900, r: 50, draw: DRAW.overlord, c: ['#e8eef8', '#8a98b0', '#9fd8ff', '#ff5a5a'], move: 'sway', rest: 1.0, atk: [A('fist', {}), A('moonbeam', {}), A('rain', {}), A('fist', { ph: 2 }), A('summon', { ph: 2 }), A('moonbeam', { ph: 3 })], rage: ['The Overlord raises its fists!', 'THE OVERLORD UNLEASHES EVERYTHING!'], dl: 'The Lunar Overlord is down. The moon is free. Next stop: the red planet.', dt: ['ascend', '#9fd8ff'],
      init(o) { o.hands = [{ x: o.x - 140, y: o.y + 90 }, { x: o.x + 140, y: o.y + 90 }]; }, tick(o, dt) { if (!o.fisting) o.hands.forEach((h, i) => { h.x += (o.x + (i ? 150 : -150) - h.x) * Math.min(1, 5 * dt); h.y += (o.y + 90 + Math.sin(time * 2 + i) * 8 - h.y) * Math.min(1, 5 * dt); }); o.fisting = false; } },
    // ---- planet 2: RUSTWORLD (35-39)
    { name: 'Dune Serpent', hp: 560, r: 38, draw: DRAW.serpent, c: ['#c0703a', '#8a4a22', '#ff8a5a', '#ffe27a'], move: 'none', rest: 1.0, atk: [A('segfire', {}), A('surge', {}), A('rain', { ph: 2 }), A('segfire', { ph: 2 }), A('spiral', { ph: 3 })], rage: ['The Serpent thrashes through the sand!', 'THE DUNES ERUPT!'], dl: 'The Dune Serpent has collapsed into the sand.', dt: ['sink', '#c0703a'],
      init(o) { o.trail = []; o.seg = []; o.hd = rnd(0, TAU); }, tick(o, dt, ph) { const sp = (150 + ph * 12) * (o.boost ? 1.9 : 1); o.boost = 0; const to = angTo(o, player), dc = Math.hypot(o.x - ARENA.x, o.y - ARENA.y); o.hd += clamp(angDiff(dc > ARENA.r - 70 ? angTo(o, ARENA) : to, o.hd), -1.5 * dt, 1.5 * dt); o.x += Math.cos(o.hd) * sp * dt; o.y += Math.sin(o.hd) * sp * dt; const L = o.trail[0]; if (!L || Math.hypot(L.x - o.x, L.y - o.y) > 9) { o.trail.unshift({ x: o.x, y: o.y }); if (o.trail.length > 90) o.trail.pop(); } o.seg = []; for (let k = 0; k < 14; k++) { const t = o.trail[k * 5 + 3]; if (t) o.seg.push(t); } for (let k = 1; k < o.seg.length; k++) if (Math.hypot(o.seg[k].x - player.x, o.seg[k].y - player.y) < Math.max(6, o.r * 0.78 - k * 1.5) + 8) hurt(1); } },
    { name: 'Iron Marauder', hp: 600, r: 44, draw: DRAW.marauder, c: ['#7a3a3a', '#4a2020', '#ff6a3a', '#ffd23f'], move: 'hover', spd: 85, rest: 1.1, atk: [A('quickdraw', {}), A('grenades', {}), A('strafe', {}), A('quickdraw', { ph: 2 }), A('mines', { ph: 2 })], rage: ['The Marauder reaches for a second gun!', 'NO MORE MR. NICE ROBOT!'], dl: 'The Iron Marauder has fallen. Its guns rust in the sand.', dt: ['topple', '#7a3a3a'] },
    { name: 'Martian Seer', hp: 620, r: 40, draw: DRAW.seer, c: ['#d87a4a', '#8a3a1a', '#ffb070', '#7aff9a'], move: 'orbit', rest: 1.1, atk: [A('illusion', {}), A('homing', {}), A('mines', {}), A('pulse', { ph: 2 }), A('illusion', { ph: 2 }), A('blink', { ph: 3 })], rage: ['The Seer sees all your moves!', 'THE SEER SEES ALL!'], dl: 'The Martian Seer has been silenced. The visions fade.', dt: ['smoke', '#ffb070'] },
    { name: 'Magma Core', hp: 650, r: 46, draw: DRAW.magma, c: ['#ff5a1a', '#8a1a0a', '#ffd23f', '#fff0a0'], move: 'none', rest: 1.1, atk: [A('eruption', {}), A('rain', {}), A('ring', {}), A('spiral', { ph: 2 }), A('eruption', { ph: 3 })], rage: ['The core burns white hot!', 'THE CORE ERUPTS!'], dl: 'The Magma Core has cooled. The ground stops shaking.', dt: ['burn', '#ff5a1a'],
      init(o) { o.x = ARENA.x; o.y = ARENA.y - 60; o.sc = 0; o.shell = 0; }, tick(o, dt) { o.sc += dt; const open = (o.sc % 7.5) > 5; if (open && !o.wasOpen) { ring(o.x, o.y, 18, 0, 170, 8, bcA(o)); toastMsg('The shell opens! Shoot the core!', 1.4); } o.wasOpen = open; o.open = open; o.shell += ((open ? 1 : 0) - o.shell) * Math.min(1, 6 * dt); o.y = ARENA.y - 60 + Math.sin(time * 1.2) * 6; }, dmg(o) { return o.open ? 1.9 : 0.16; } },
    { name: 'Scrap Tyrant', hp: 950, r: 52, draw: DRAW.scrap, c: ['#d8c0a0', '#8a6a4a', '#ff3a1a', '#ffd23f'], move: 'chase', spd: 70, rest: 1.0, atk: [A('rampage', {}), A('volley', {}), A('rain', {}), A('summon', { ph: 2 }), A('rampage', { ph: 2 }), A('laser', { ph: 3 })], rage: ['The Tyrant revs its blades!', 'THE TYRANT GRINDS EVERYTHING!'], dl: 'The Scrap Tyrant has ground to a halt. The red planet is free.', dt: ['crumble', '#d8c0a0'] },
    // ---- planet 3: STORMCLOUD GIANT (40-44)
    { name: 'Storm Jelly', hp: 640, r: 44, draw: DRAW.jelly, c: ['#5affd8', '#2a9a8a', '#a8fff0', '#fff27a'], move: 'sway', rest: 1.1, atk: [A('chainnet', {}), A('zapfan', {}), A('rain', {}), A('chainnet', { ph: 2 }), A('homing', { ph: 2 })], rage: ['The jelly crackles with static!', 'STATIC STORM!'], dl: 'The Storm Jelly has deflated and drifts away into the clouds.', dt: ['deflate', '#5affd8'],
      tick(o, dt) { if (!o.nets) return; for (const n of o.nets) { n.t += dt; if (n.t > 1) for (let i = 0; i < 3; i++) { const a = n.pts[i], b = n.pts[(i + 1) % 3]; if (segDist(player.x, player.y, a[0], a[1], b[0], b[1]) < 13) hurt(1); } } o.nets = o.nets.filter(n => n.t < 4.4); } },
    { name: 'Thunder Roc', hp: 660, r: 46, draw: DRAW.roc, c: ['#e8d84a', '#8a7a1a', '#fff27a', '#7aeaff'], move: 'orbit', rest: 1.1, atk: [A('swoop', {}), A('zapfan', {}), A('pull', { f: -130 }), A('swoop', { ph: 2 }), A('spiral', { ph: 3 })], rage: ['The Roc beats its wings of thunder!', 'THUNDERSTORM!'], dl: 'The Thunder Roc has fallen from the storm.', dt: ['flip', '#e8d84a'] },
    { name: 'Cloud Sentinel', hp: 680, r: 44, draw: DRAW.cloudknight, c: ['#f0f4ff', '#a8b4d0', '#7affd2', '#7aaaff'], move: 'hover', spd: 80, rest: 1.1, atk: [A('twisters', {}), A('pulse', {}), A('fan', {}), A('twisters', { ph: 2 }), A('laser', { ph: 2 })], rage: ['The Sentinel calls the winds!', 'THE WINDS OBEY!'], dl: 'The Cloud Sentinel has dissolved into mist.', dt: ['smoke', '#f0f4ff'],
      tick(o, dt) { if (!o.tw) return; for (const w of o.tw) { w.t += dt; const a = angTo(w, player); w.x += Math.cos(a) * 80 * dt; w.y += Math.sin(a) * 80 * dt; if (Math.hypot(w.x - player.x, w.y - player.y) < 36) hurt(1); } o.tw = o.tw.filter(w => w.t < 7); } },
    { name: 'Tempest Eye', hp: 720, r: 48, draw: DRAW.tempest, c: ['#3a8aaa', '#1a4a6a', '#7affd2', '#ffe27a'], move: 'none', rest: 1.1, atk: [A('cyclone', {}), A('eyewall', {}), A('laser', {}), A('homing', { ph: 2 }), A('cyclone', { ph: 3 })], rage: ['The Eye of the storm opens wide!', 'THE EYE SEES YOU!'], dl: 'The Tempest Eye has closed. The storm finally calms.', dt: ['implode', '#7affd2'], init(o) { o.x = ARENA.x; o.y = ARENA.y - 40; } },
    { name: 'Stormcloud Queen', hp: 1000, r: 52, draw: DRAW.queen, c: ['#9a7aff', '#4a2a9a', '#7affd2', '#fff27a'], move: 'hover', spd: 80, rest: 1.0, atk: [A('thunderclouds', {}), A('judgement', {}), A('fan', { n: 7 }), A('thunderclouds', { ph: 2 }), A('blink', { ph: 2 }), A('laser', { ph: 3 })], rage: ['The Queen summons a hurricane!', 'THE QUEEN COMMANDS THE TEMPEST!'], dl: 'The Stormcloud Queen has fallen. The giant planet is free.', dt: ['ascend', '#9a7aff'] },
    // ---- planet 4: PRISM WORLD (45-49)
    { name: 'Shard Golem', hp: 700, r: 48, draw: DRAW.golem, c: ['#ff9ae0', '#c04aa0', '#ff7ad9', '#ffffff'], move: 'chase', spd: 80, rest: 1.1, atk: [A('throw', {}), A('rain', {}), A('throw', { ph: 2 }), A('fan', { n: 7 }), A('mines', { ph: 2 })], rage: ['The Golem sheds sharp crystals!', 'SHATTER STORM!'], dl: 'The Shard Golem has shattered into glittering dust.', dt: ['shatter', '#ff9ae0'],
      init(o) { o.sh = [0, 1, 2, 3].map(i => ({ a: i * TAU / 4, s: 0, x: o.x, y: o.y, t: 0 })); }, tick(o, dt) { o.sh.forEach((s, i) => { if (s.s === 0) { s.a += dt * 1.6; s.x = o.x + Math.cos(s.a) * 76; s.y = o.y + Math.sin(s.a) * 60; } else if (s.s === 1) { s.t += dt; s.x += Math.cos(s.ang) * 360 * dt; s.y += Math.sin(s.ang) * 360 * dt; if (s.t > 0.75) s.s = 2; } else { const a = angTo(s, o); s.x += Math.cos(a) * 330 * dt; s.y += Math.sin(a) * 330 * dt; if (Math.hypot(s.x - o.x, s.y - o.y) < 40) s.s = 0; } if (s.s && Math.hypot(s.x - player.x, s.y - player.y) < 16) hurt(1); }); } },
    { name: 'Prism Dancer', hp: 720, r: 40, draw: DRAW.dancer, c: ['#ffd0f0', '#d070b0', '#ff7ad9', '#7aeaff'], move: 'orbit', rest: 1.0, atk: [A('rainbow', {}), A('laser', { n: 6, rot: 0.25 }), A('charge', {}), A('rainbow', { ph: 2 }), A('blink', { ph: 2 })], rage: ['The Dancer spins faster!', 'THE DANCE OF LIGHT!'], dl: 'The Prism Dancer has stopped dancing. The light fades.', dt: ['smoke', '#ffd0f0'],
      init(o) { o.rib = []; o.tz = 0; }, tick(o, dt) { o.rib.unshift([o.x, o.y]); if (o.rib.length > 26) o.rib.pop(); o.tz -= dt; if (o.tz <= 0 && hazards.length < 40) { o.tz = 0.4; zone(o.x, o.y, 28, 1.1, 0.3, zoneCol(o)); } } },
    { name: 'Mirror Wraith', hp: 740, r: 42, draw: DRAW.mirror, c: ['#d8e0f0', '#8a94b0', '#7aeaff', '#ff7ad9'], move: 'hover', spd: 80, rest: 1.1, atk: [A('shatter', {}), A('laser', {}), A('homing', {}), A('pulse', {}), A('blink', { ph: 2 })], rage: ['The Wraith multiplies in the mirrors!', 'A HUNDRED REFLECTIONS!'], dl: 'The Mirror Wraith has cracked. Every reflection goes dark.', dt: ['shatter', '#d8e0f0'],
      init(o) { o.mt = 0; o.up = true; }, tick(o, dt) { o.mt += dt; const up = (o.mt % 7) < 4.5; if (up !== o.up) toastMsg(up ? 'The mirror is up! Your shots bounce back!' : 'The mirror is down! Hit it now!', 1.4); o.up = up; }, reflect(o) { return o.up; }, dmg(o) { return o.up ? 1 : 1.5; } },
    { name: 'Geode Titan', hp: 780, r: 52, draw: DRAW.titan, c: ['#9a6aff', '#5a2ac0', '#c8a0ff', '#ffe27a'], move: 'chase', spd: 60, rest: 1.1, atk: [A('spikes', {}), A('boulders', {}), A('groundpound', {}), A('spikes', { ph: 2 }), A('rain', { ph: 2 }), A('spiral', { ph: 3 })], rage: ['The Titan awakens its core!', 'TITAN QUAKE!'], dl: 'The Geode Titan has split open. Its glow goes out.', dt: ['crumble', '#9a6aff'] },
    { name: 'Prism Empress', hp: 1050, r: 52, draw: DRAW.empress, c: ['#fff0ff', '#e080e0', '#ff7ad9', '#7aeaff'], move: 'hover', spd: 80, rest: 1.0, atk: [A('laser', { n: 3, rot: 0.4 }), A('rain', {}), A('homing', {}), A('laser', { n: 4, rot: 0.3, ph: 2 }), A('pull', { ph: 3 }), A('rainbow', { ph: 3 })], rage: ['The Empress splits the light!', 'THE EMPRESS BURNS BRIGHT!'], dl: 'The Prism Empress has shattered. The crystal world is free.', dt: ['explode', '#ff7ad9'],
      init(o) { o.gems = [{ a: 0, c: '#ff4a6a', t: 0.5 }, { a: 2.09, c: '#4aff8a', t: 1.1 }, { a: 4.19, c: '#4a8aff', t: 1.7 }]; }, tick(o, dt, ph) { for (const g of o.gems) { g.a += dt * (1 + ph * 0.4); g.x = o.x + Math.cos(g.a) * 100; g.y = o.y - 10 + Math.sin(g.a) * 54; g.t -= dt; if (g.t <= 0) { g.t = 2.2 - ph * 0.3; fan(g.x, g.y, angTo(g, player), ph > 2 ? 3 : 1, 0.3, 230, 7, { c: g.c }); } } } },
    // ---- planet 5: HYPERION GRID (50-53)
    { name: 'Rogue Drone', hp: 760, r: 30, draw: DRAW.drone, c: ['#2a3a3a', '#101a1a', '#39ff88', '#a8ffd0'], move: 'orbit', rest: 0.9, atk: [A('railgun', {}), A('fan', { n: 6 }), A('railgun', { ph: 2 }), A('summon', { ph: 2 }), A('spiral', { ph: 3 })], rage: ['The Drone overclocks!', 'DRONE OVERDRIVE!'], dl: 'The Rogue Drone has been wiped from the grid.', dt: ['explode', '#39ff88'] },
    { name: 'Glitch Knight', hp: 800, r: 44, draw: DRAW.knight, c: ['#c04aff', '#4a1a8a', '#39ff88', '#ff3a8a'], move: 'hover', spd: 100, rest: 1.0, atk: [A('tiles', {}), A('blink', {}), A('charge', {}), A('tiles', { ph: 2 }), A('wall', { ph: 2 })], rage: ['The Knight starts to glitch!', 'FATAL ERROR!'], dl: 'The Glitch Knight has crashed. Its code unravels.', dt: ['shatter', '#c04aff'] },
    { name: 'Overclock Core', hp: 840, r: 48, draw: DRAW.core, c: ['#1a5a3a', '#0a2a1a', '#39ff88', '#ffffff'], move: 'none', rest: 1.0, atk: [A('cogs', {}), A('spiral', { dir: -1 }), A('cogs', { ph: 2 }), A('pulse', {}), A('homing', { ph: 2 }), A('laser', { ph: 3 })], rage: ['The Core runs hot!', 'CORE MELTDOWN!'], dl: 'The Overclock Core has melted down. The grid goes dark.', dt: ['burn', '#39ff88'], init(o) { o.x = ARENA.x; o.y = ARENA.y - 70; } },
    { name: 'Hyperion Prime', hp: 1150, r: 54, draw: DRAW.prime, c: ['#2a4a3a', '#10241a', '#39ff88', '#ffd23f'], move: 'hover', spd: 85, rest: 0.95, atk: [A('orbital', {}), A('wall', {}), A('tiles', {}), A('cogs', { ph: 2 }), A('summon', { ph: 2 }), A('railgun', { ph: 2 }), A('orbital', { ph: 3 }), A('blink', { ph: 3 })], rage: ['Hyperion Prime unlocks its full power!', 'PRIME PROTOCOL: DESTROY!'], dl: 'Hyperion Prime has been deleted. Only the World Eater remains.', dt: ['topple', '#39ff88'],
      init(o) { o.sat = [{ a: 0, t: 1 }, { a: Math.PI, t: 1.6 }]; }, tick(o, dt, ph) { for (const s of o.sat) { s.a += dt * 1.4; s.x = o.x + Math.cos(s.a) * 120; s.y = o.y - 20 + Math.sin(s.a) * 70; s.t -= dt; if (s.t <= 0) { s.t = 2.0 - ph * 0.2; ebul(s.x, s.y, angTo(s, player), 250, 6, bcB(o)); } } } }
  ];
  // ---- the final boss of Part Two
  ATK.jaws = (o, dt, P, ph) => { const c = o.cur; c.t -= dt; if (c.t <= 0) { if (c.n >= 3) return true; c.t = 1.25; const g = clamp(player.x + rnd(-90, 90), ARENA.x - 200, ARENA.x + 200), y0 = [190, 125, 60][c.n]; for (const s of [-1, 1]) for (let i = -5; i <= 5; i++) { const x = ARENA.x + i * 52; if (Math.abs(x - g) < 62) continue; zone(x, ARENA.y + s * y0 + 8, 40, 0.95, 0.3, zoneCol(o)); } c.n++; shake = 6; blip(70, 0.3, 'sawtooth', 0.08); } return false; };
  ATK.planets = (o, dt, P, ph) => { const c = o.cur; c.e = (c.e || 0) + dt; if (!c.f) { c.f = 1; const n = 2 + Math.min(ph, 3); for (let i = 0; i < n; i++) ebul(o.x, o.y + 50, Math.PI / 2 + (i - (n - 1) / 2) * 0.45, 105, 26, { c: i % 2 ? '#9a7aff' : '#ff8a5a', life: 8 }); blip(70, 0.5, 'sawtooth', 0.08); } return c.e > 2.4; };
  ATK.tentacles = (o, dt, P, ph) => { const c = o.cur; c.e = (c.e || 0) + dt; if (!c.f) { c.f = 1; const N = 3 + (ph > 2 ? 1 : 0), a0 = rnd(0, TAU); for (let i = 0; i < N; i++) { const a = a0 + i * TAU / N; addBeam(ARENA.x + Math.cos(a) * ARENA.r * 0.95, ARENA.y + Math.sin(a) * ARENA.r * 0.95, a + Math.PI + (i % 2 ? 0.5 : -0.5), (i % 2 ? -1 : 1) * 0.5, 1.0, 2.8, 640); } blip(140, 0.4, 'sawtooth', 0.06); } return c.e > 4.4; };
  ATK.scream = (o, dt, P, ph) => { const c = o.cur; c.t -= dt; if (c.t <= 0) { c.t = 0.85; wave(o.x, o.y, 260, 560, { w: 24, c: '#ff3a8a' }); ring(o.x, o.y, 20 + ph * 2, c.n * 0.3, 150, 8, c.n % 2 ? bcB(o) : bcA(o)); shake = 8; c.n++; blip(60, 0.4, 'sawtooth', 0.09); } return c.n >= 3; };
  const WE_DEF = { name: 'The World Eater', hp: 2600, r: 72, c: ['#2a0a30', '#12041a', '#ff3a8a', '#ffe27a'], rest: 1.0, atk: [A('jaws', {}), A('planets', {}), A('tentacles', {}), A('scream', {}), A('rain', { r: 58, count: 8 }), A('spiral', { arms: 4 }), A('homing', { n: 5 }), A('wall', { ph: 2 }), A('pull', { ph: 2, f: 100 }), A('laser', { ph: 3, n: 3 }), A('summon', { ph: 3 }), A('mines', { ph: 3, count: 7 })], rage: ['The World Eater roars. Planets crumble in its jaws!', 'THE VOID OPENS WIDE!', 'THE WORLD EATER IS STARVING!'] };
  function mkWorldEater() {
    const b = base('THE WORLD EATER', WE_DEF.hp, WE_DEF.r); b.def = WE_DEF; b.y = ARENA.y - 140; b.cur = null; b.last = ''; b.hover = 0;
    b.update = function (dt) {
      const f = this.hp / this.max, ph = f > 0.75 ? 1 : f > 0.5 ? 2 : f > 0.25 ? 3 : 4; this.hover += dt; this.noMove = true; this.y = ARENA.y - 140 + Math.sin(this.hover * 1.1) * 6; this.x = ARENA.x + Math.sin(this.hover * 0.5) * 30;
      if (ph !== this.ph) { this.ph = ph; toastMsg(WE_DEF.rage[ph - 2] || 'It grows stronger!', 2.6); shake = 22; ring(this.x, this.y, 24, 0, 220, 9, bcA(this)); this.cur = null; this.st = 1.0; hazards.length = 0; }
      this.st -= dt;
      if (this.cur) { if (ATK[this.cur.k](this, dt, this.cur.P, ph)) { this.cur = null; this.st = WE_DEF.rest * [0, 1, 0.85, 0.7, 0.55][ph]; } }
      else if (this.st <= 0) { const list = WE_DEF.atk.filter(a => (a.ph || 1) <= ph && a.k !== this.last), a = pick(list); this.last = a.k; this.cur = { k: a.k, P: a, t: 0.5, n: 0, e: 0 }; }
    };
    b.draw = function () {
      const x = this.x, y = this.y, r = this.r, T = time, f = this.flash > 0, open = this.cur && (this.cur.k === 'pull' || this.cur.k === 'jaws' || this.cur.k === 'scream') ? 1.2 : 1, ph = this.ph;
      glowRing(x, y, r * 3.2, 'rgba(255,58,138,A)', 0.25 + ph * 0.06);
      for (let i = 0; i < 7; i++) { const a = 0, w = Math.sin(T * 1.6 + i) * 22; for (const s of [-1, 1]) { ctx.strokeStyle = f ? '#fff' : '#1a0620'; ctx.lineWidth = 16 - i; ctx.beginPath(); ctx.moveTo(x + s * r * 0.9, y + r * 0.2); ctx.bezierCurveTo(x + s * (r * 1.8 + w), y - r * 0.2 + i * 10, x + s * (r * 2.1 - w), y + r * 0.9 + i * 14, x + s * (r * 2.6 + w), y + r * 1.0 + i * 24); ctx.stroke(); } }
      const g = ctx.createRadialGradient(x, y - r * 0.2, r * 0.2, x, y, r * 1.7); g.addColorStop(0, f ? '#fff' : '#3a1448'); g.addColorStop(1, f ? '#fff' : '#0c0212'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 1.55, 0, TAU); ctx.fill();
      for (let i = 0; i < 9; i++) { const a = Math.PI * 1.08 + i * Math.PI * 0.105, ex = x + Math.cos(a) * r * 1.3, ey = y + Math.sin(a) * r * 1.2, bl = Math.sin(T * 2 + i * 1.7) > 0.92 ? 0.2 : 1; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(ex, ey, 9, 9 * bl, 0, 0, TAU); ctx.fill(); ctx.fillStyle = i % 2 ? '#ff3a8a' : '#ffe27a'; ctx.beginPath(); ctx.arc(ex + Math.cos(angTo(this, player)) * 2, ey + Math.sin(angTo(this, player)) * 2, 4 * bl, 0, TAU); ctx.fill(); }
      const mr = r * 1.05 * open; ctx.fillStyle = '#05010a'; ctx.beginPath(); ctx.arc(x, y + r * 0.15, mr, 0, TAU); ctx.fill();
      for (let ring_ = 0; ring_ < 3; ring_++) { const rr = mr * (1 - ring_ * 0.2), n = 14 + ring_ * 4, dir = ring_ % 2 ? -1 : 1; ctx.fillStyle = ring_ === 0 ? '#e8e0d0' : ring_ === 1 ? '#c0b8a8' : '#9a9080'; for (let i = 0; i < n; i++) { const a = i * TAU / n + T * 0.5 * dir; ctx.beginPath(); ctx.moveTo(x + Math.cos(a - 0.1) * rr, y + r * 0.15 + Math.sin(a - 0.1) * rr); ctx.lineTo(x + Math.cos(a) * rr * 0.72, y + r * 0.15 + Math.sin(a) * rr * 0.72); ctx.lineTo(x + Math.cos(a + 0.1) * rr, y + r * 0.15 + Math.sin(a + 0.1) * rr); ctx.fill(); } }
      const vg = ctx.createRadialGradient(x, y + r * 0.15, 2, x, y + r * 0.15, mr * 0.5); vg.addColorStop(0, '#000'); vg.addColorStop(0.6, 'rgba(120,20,90,.8)'); vg.addColorStop(1, 'rgba(255,58,138,.0)'); ctx.fillStyle = vg; ctx.beginPath(); ctx.arc(x, y + r * 0.15, mr * 0.55, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(255,58,138,.6)'; ctx.lineWidth = 2; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(x, y + r * 0.15, mr * 0.45, T * 3 + i * 2.1, T * 3 + i * 2.1 + 1.2); ctx.stroke(); }
      if (this.cur && this.cur.n === 0 && this.cur.t > 0 && this.cur.e < 0.45 && !this.cur.f) glowRing(x, y, r * 2, 'rgba(255,255,255,A)', 0.3);
    };
    return b;
  }
  // ---- registration: planets, palettes, music, upgrades, portal tables
  const P2R = [
    { n: 'LUNA STATION', acc: '#9fd8ff', ring: ['#9fd8ff', '#ffffff', '#7fb0ff', '#fff'], fill: 'rgba(8,16,40,.9)', die: 'YOU WERE LOST ON THE MOON' },
    { n: 'RUSTWORLD', acc: '#ff8a5a', ring: ['#ff8a5a', '#ffd23f', '#ff5a3a', '#fff'], fill: 'rgba(60,16,6,.9)', die: 'YOU WERE BURIED IN THE RUST' },
    { n: 'STORMCLOUD GIANT', acc: '#7affd2', ring: ['#7affd2', '#fff27a', '#7aaaff', '#fff'], fill: 'rgba(6,40,44,.9)', die: 'YOU WERE SWEPT AWAY BY THE STORM' },
    { n: 'PRISM WORLD', acc: '#ff7ad9', ring: ['#ff7ad9', '#7aeaff', '#fff0ff', '#fff'], fill: 'rgba(44,10,52,.9)', die: 'YOU WERE SHATTERED INTO LIGHT' },
    { n: 'HYPERION GRID', acc: '#39ff88', ring: ['#39ff88', '#a8ffd0', '#ffd23f', '#fff'], fill: 'rgba(4,30,16,.9)', die: 'YOU WERE DELETED FROM THE GRID' },
    { n: 'THE WORLD EATER', acc: '#ff3a8a', ring: ['#ff3a8a', '#ffe27a', '#9a7aff', '#fff'], fill: 'rgba(30,4,30,.92)', die: 'YOU WERE DEVOURED BY THE WORLD EATER' }
  ];
  const REALM_START = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 54];
  const mkPal = (bg, rock, sh, n1, n2, spike, gem) => ({ bg, n1, rock, sh, shb: 34, n2, crack: [hexA(sh).replace('A', '.45'), sh], spike, gem, stars: true });
  PALS.push(
    mkPal('#05070f', '#3a4458', '#9fd8ff', ['#0b1020', '#04060c', '#121a30'], ['#4a566c', '#323c50', '#5a6680', '#2a3244'], ['#6a768c', '#4a566c', '#8a96ac'], ['#9fd8ff', '#ffffff', '#7fb0ff']),
    mkPal('#120704', '#6a3220', '#ff8a5a', ['#1c0c08', '#0a0402', '#2a120c'], ['#7a3c28', '#5a2818', '#8a4630', '#4a2014'], ['#8a4a30', '#6a3420', '#a05a3a'], ['#ff8a5a', '#ffd23f', '#ff5a3a']),
    mkPal('#07161c', '#2a5a6a', '#7affd2', ['#0c222c', '#040e12', '#123040'], ['#346a7a', '#244e5c', '#3e7a8c', '#1c404c'], ['#4a8a9a', '#346a7a', '#6aaaba'], ['#7affd2', '#fff27a', '#7aaaff']),
    mkPal('#12081c', '#5a2a7a', '#ff7ad9', ['#1c0c2c', '#0a0414', '#281040'], ['#6a3a8a', '#4a2068', '#7a4a9c', '#3a1858'], ['#ff9ae0', '#c070c0', '#ffc0f0'], ['#ff7ad9', '#7aeaff', '#fff0ff']),
    mkPal('#020a06', '#0e2a1c', '#39ff88', ['#04140c', '#010604', '#08201a'], ['#143a28', '#0c2a1c', '#1c4a34', '#08200f'], ['#39ff88', '#1a8a4a', '#a8ffd0'], ['#39ff88', '#a8ffd0', '#ffd23f']),
    mkPal('#0a0210', '#2a0a30', '#ff3a8a', ['#14041c', '#05010a', '#200630'], ['#3a1042', '#280830', '#4a1a56', '#200628'], ['#ff3a8a', '#9a1a5a', '#ffe27a'], ['#ff3a8a', '#ffe27a', '#9a7aff'])
  );
  for (const d of P2DEFS) { BOSSES.push(() => mkP2(d)); BOSS_NAMES.push(d.name); DEFEAT_LINES.push(d.dl); DEATH.push(d.dt); }
  BOSSES.push(mkWorldEater); BOSS_NAMES.push('The World Eater'); DEFEAT_LINES.push('The World Eater has been destroyed. Every world it swallowed is free, and the galaxy is saved.'); DEATH.push(['implode', '#ff3a8a']);
  const UPGRADES7 = [
    { id: 'c_heart', name: 'Nano Medkit', desc: '+3 max hearts and heal 3', apply: p => { p.maxHp += 3; p.hp = Math.min(p.maxHp, p.hp + 3); } },
    { id: 'c_dmg', name: 'Plasma Rounds', desc: '+160% shot damage', apply: p => { p.dmg *= 2.6; } },
    { id: 'c_dmg2', name: 'Antimatter Core', desc: '+110% damage and +25% fire rate', apply: p => { p.dmg *= 2.1; p.fireDelay *= 0.75; } },
    { id: 'c_rate', name: 'Overclocked Barrel', desc: 'Shoot 55% faster', apply: p => { p.fireDelay *= 0.45; } },
    { id: 'c_speed', name: 'Ion Boots', desc: '+30% move speed', apply: p => { p.speed *= 1.3; } },
    { id: 'c_dash', name: 'Warp Drive', desc: 'Dash recharges 60% faster', apply: p => { p.dashCd *= 0.4; } },
    { id: 'c_multi', name: 'Cluster Cannon', desc: '+2 bullets per shot (max 17)', apply: p => { p.shots = Math.min(17, p.shots + 2); }, ok: p => p.shots < 17 },
    { id: 'c_heal', name: 'Cryo Pod', desc: 'Heal fully and +3 max hearts', apply: p => { p.maxHp += 3; p.hp = p.maxHp; } },
    { id: 'c_inv', name: 'Deflector Shield', desc: 'Stay invincible 0.8s longer after being hit', apply: p => { p.invDur = (p.invDur || 1.15) + 0.8; }, ok: p => (p.invDur || 1.15) < 5.2 }
  ];
  const LASER_UPG = [
    { id: 'l_wide', name: 'Wide Beam', desc: 'LASER: +40% beam width', apply: p => { p.lw = (p.lw || 1) * 1.4; }, ok: p => p.laser && (p.lw || 1) < 3 },
    { id: 'l_focus', name: 'Focus Lens', desc: 'LASER: +60% laser damage', apply: p => { p.ld = (p.ld || 1) * 1.6; }, ok: p => p.laser },
    { id: 'l_twin', name: 'Twin Beams', desc: 'LASER: two more side beams (max 2 pairs)', apply: p => { p.lb = Math.min(2, (p.lb || 0) + 1); }, ok: p => p.laser && (p.lb || 0) < 2 },
    { id: 'l_over', name: 'Overcharge', desc: 'LASER: +30% damage and +20% width', apply: p => { p.ld = (p.ld || 1) * 1.3; p.lw = (p.lw || 1) * 1.2; }, ok: p => p.laser && (p.lw || 1) < 3 }
  ];
  const HM = [1, 2.4, 3.2, 12, 36, 45, 54, 63, 72, 81, 90, 117];
  const PORT_SH = ['#c77dff', '#ff6a1a', '#9dff3a', '#ff9dd2', '#ff2d55', '#ffd23f'].concat(P2R.map(p => p.acc));
  const PORT_RING = [['#7fe3ff', '#c77dff', '#ff9dd2', '#fff'], ['#ffd23f', '#ff7a1a', '#ff3d3d', '#fff'], ['#d8ff7a', '#9dff3a', '#3affb0', '#fff'], ['#ff9dd2', '#c77dff', '#7fe3ff', '#fff'], ['#ff2d55', '#8a8aff', '#d0d4ff', '#fff'], ['#ffd23f', '#fff7d0', '#7fd0ff', '#fff']].concat(P2R.map(p => p.ring));
  const PORT_FILL = ['rgba(30,10,60,.85)', 'rgba(80,12,0,.9)', 'rgba(8,50,10,.9)', 'rgba(40,12,70,.9)', 'rgba(20,4,14,.92)', 'rgba(60,44,8,.9)'].concat(P2R.map(p => p.fill));
  const PORT_HINT = ['enter the portal', 'enter the lava portal', 'enter the acid portal', 'enter the dream portal', 'enter the shadow portal', 'enter the golden portal', 'enter the cosmic portal', 'enter the rift', 'enter the storm portal', 'enter the prism portal', 'enter the grid portal', 'enter the void'];
  const portalLabel = pr => pr >= 11 ? 'THE FINAL BATTLE' : pr >= 6 ? P2R[pr - 6].n + ' ' + (bossIdx - REALM_START[pr] + 1) : pr === 5 ? 'LAND OF THE GODS ' + (bossIdx - 24) : pr === 4 ? 'SHADOW REALM ' + (bossIdx - 19) : pr === 3 ? 'DREAMLAND ' + (bossIdx - 14) : pr === 2 ? 'ACID REALM ' + (bossIdx - 9) : pr === 1 ? 'UNDERWORLD ' + (bossIdx - 4) : 'BOSS ' + (bossIdx + 1);
  const bgCache = {}; function bgOf(k, r) { const key = k + r; return bgCache[key] || (bgCache[key] = makeBG(k, r)); }
  (function () {
    const sc = ['minor', 'phrygian', 'dorian', 'lyd', 'harm', 'pent'], pr = [[0, 5, 3, 4], [0, 3, 4, 1], [0, 2, 4, 5], [0, 1, 5, 3], [0, 4, 2, 5]], lw = ['square', 'sawtooth', 'triangle'], bw = ['sawtooth', 'triangle', 'square'], bs = ['gallop', 'pulse', 'half', 'gallop'], dr = ['four', 'break', 'four'];
    for (let i = 30; i < 54; i++) THEMES['boss' + i] = [34 + (i * 5) % 16, sc[i % 6], 126 + (i * 7) % 50, lw[i % 3], bw[(i + 1) % 3], bs[i % 4], dr[i % 3], pr[i % 5], 0.65 + (i % 4) * 0.07, 1, 1.1];
    THEMES.boss54 = [33, 'phrygian', 170, 'sawtooth', 'sawtooth', 'gallop', 'four', [0, 1, 5, 4], 0.95, 1, 1.2];
    ['dorian', 'pent', 'lyd', 'major', 'minor', 'phrygian'].forEach((s, k) => { THEMES['hub' + (6 + k)] = [40 + k * 2, s, 64 + k * 2, 'sine', 'triangle', 'half', 'none', [0, 3, 4, 0], 0.3, 1, 0.95]; });
  })();
  let offC = null, offX = null;
  function deathFx(dt) {
    const [T, col] = DEATH[fightIdx] || ['topple', '#fff'], t = deadT, b = boss, bx = b.x, by = b.y;
    const spark = (n, vx, vy, r, life, ox, oy) => { for (let i = 0; i < n; i++) parts.push({ x: bx + rnd(-ox, ox), y: by + rnd(-oy, oy), vx: rnd(-vx, vx), vy: vy + rnd(-vx, vx) * 0.3, life: life * rnd(0.6, 1), max: life, c: col, r: rnd(r * 0.6, r) }); };
    if (t < 1.9) {
      if (T === 'crumble') { if (Math.random() < 0.7) spark(2, 90, 60, 7, 0.9, 44, 30); }
      else if (T === 'swarm') { if (Math.random() < 0.8) for (let i = 0; i < 2; i++) parts.push({ x: bx, y: by, vx: rnd(-230, 230), vy: rnd(-280, -50), life: 1.3, max: 1.3, c: col, r: 4 }); }
      else if (T === 'melt') { if (Math.random() < 0.7) spark(2, 50, 70, 6, 0.9, 40, 10); }
      else if (T === 'burn') { if (Math.random() < 0.8) spark(3, 50, -120, 5, 1.0, 40, 30); }
      else if (T === 'smoke') { if (Math.random() < 0.6) spark(2, 30, -60, 9, 1.2, 30, 30); }
      else if (T === 'implode') { if (Math.random() < 0.8) { const a = rnd(0, TAU); parts.push({ x: bx + Math.cos(a) * 110, y: by + Math.sin(a) * 110, vx: -Math.cos(a) * 160, vy: -Math.sin(a) * 160, life: 0.6, max: 0.6, c: col, r: 4 }); } }
      else if (T === 'topple') { if (Math.random() < 0.5) burst(bx + rnd(-40, 40), by + rnd(-30, 30), 6, pick([col, '#ffd23f', '#fff']), 220); if (t > 1.3 && !b.fx1) { b.fx1 = 1; shake = 22; burst(bx, by + 40, 30, '#cfc6bd', 260); } }
      else if (T === 'sink') { if (Math.random() < 0.8) spark(2, 120, 20, 6, 0.7, 50, 6); }
      else if (T === 'deflate') { if (Math.random() < 0.6) spark(2, 80, -40, 8, 0.9, 30, 20); }
      else if (T === 'ascend') { if (Math.random() < 0.9) spark(2, 40, -110, 4, 1.2, 50, 30); }
      else if (T === 'flip') { if (Math.random() < 0.5) spark(2, 90, 20, 5, 0.7, 40, 30); }
    }
    if (T === 'shatter') { if (t < 1.1 && Math.random() < 0.6) spark(2, 140, 0, 4, 0.5, 30, 30); if (t >= 1.1 && !b.fx1) { b.fx1 = 1; shake = 22; burst(bx, by, 70, col, 380); burst(bx, by, 30, '#fff', 300); blip(900, 0.5, 'triangle', 0.08, 0.2); } }
    if (T === 'explode') { if (t < 1.2 && Math.random() < 0.6) spark(2, 160, 0, 5, 0.4, 40, 40); if (t >= 1.2 && !b.fx1) { b.fx1 = 1; shake = 28; burst(bx, by, 90, col, 420); burst(bx, by, 30, '#fff', 340); for (let i = 0; i < 24; i++) parts.push({ x: bx, y: by, vx: Math.cos(i / 24 * TAU) * 330, vy: Math.sin(i / 24 * TAU) * 330, life: 0.9, max: 0.9, c: '#e8ffa0', r: 5 }); blip(80, 0.6, 'sawtooth', 0.12, 0.4); } }
    if (T === 'implode' && t >= 1.9 && !b.fx1) { b.fx1 = 1; shake = 14; burst(bx, by, 40, col, 300); }
    if (T === 'crumble' && t >= 1.9 && !b.fx1) { b.fx1 = 1; shake = 16; burst(bx, by + 20, 30, col, 240); }
  }
  function drawDying() {
    const [T] = DEATH[fightIdx] || ['topple'], t = deadT, u = clamp((t - 0.25) / 1.9, 0, 1), e = u * u, sd = boss.side;
    let a = 1, sx = 1, sy = 1, rot = 0, dy = 0, dx = 0, clipY = null, vis = true;
    const fade = (from, to) => 1 - clamp((u - from) / (to - from), 0, 1);
    if (t < 0.9 && T !== 'sink') { dx = rnd(-3, 3); dy = rnd(-2, 2); }
    switch (T) {
      case 'crumble': sy = 1 - 0.65 * e; sx = 1 + 0.2 * e; a = fade(0.65, 1); break;
      case 'swarm': a = fade(0.1, 0.6); sx = sy = 1 + 0.25 * u; break;
      case 'melt': sy = 1 - 0.85 * e; sx = 1 + 0.6 * e; a = fade(0.7, 1); break;
      case 'flip': rot = sd * Math.PI * Math.min(1, u * 1.6); sx = sy = 1 - 0.3 * e; a = fade(0.75, 1); break;
      case 'shatter': if (t >= 1.1) vis = false; else { dx = rnd(-6, 6); dy = rnd(-6, 6); } break;
      case 'burn': a = fade(0.1, 1); sy = 1 - 0.3 * u; dy += 15 * u; break;
      case 'smoke': a = fade(0.1, 0.95); dy -= 55 * u; sx = sy = 1 + 0.35 * u; rot = sd * u * 0.4; break;
      case 'implode': sx = sy = 1 - 0.95 * e; rot = sd * e * 9; if (t >= 1.9) vis = false; break;
      case 'topple': rot = sd * e * 1.45; sx = sy = 1 - 0.4 * e; dy += e * 45; break;
      case 'sink': clipY = boss.y + 38; dy = 110 * e; a = fade(0.8, 1); break;
      case 'explode': if (t >= 1.2) vis = false; else { sx = sy = 1 + 0.45 * (t / 1.2); dx = rnd(-5, 5); dy = rnd(-5, 5); } break;
      case 'deflate': sy = 1 - 0.7 * e; sx = 1 + 0.25 * e; rot = sd * 0.25 * e; a = fade(0.8, 1); break;
      case 'ascend': dy = -110 * e; a = fade(0.2, 1); sx = sy = 1 - 0.25 * e; break;
    }
    if (!vis || a <= 0.01) return;
    const main = mainCtx; let off = null;
    if (a < 0.99) { if (!offC) { offC = document.createElement('canvas'); offC.width = W; offC.height = H; offX = offC.getContext('2d'); } offX.clearRect(0, 0, W, H); ctx = offX; off = offX; }
    ctx.save(); if (clipY !== null) { ctx.beginPath(); ctx.rect(0, 0, W, clipY); ctx.clip(); }
    const py = boss.y + 30; ctx.translate(boss.x + dx, py + dy); ctx.rotate(rot); ctx.scale(sx, sy); ctx.translate(-boss.x, -py); boss.draw(); ctx.restore();
    ctx.globalAlpha = 1; ctx = main;
    if (off) { main.globalAlpha = a; main.drawImage(offC, 0, 0); main.globalAlpha = 1; }
  }
  function wrapText(t, maxW) { const out = []; let cur = ''; for (const w of t.split(' ')) { const nx = cur ? cur + ' ' + w : w; if (ctx.measureText(nx).width > maxW && cur) { out.push(cur); cur = w; } else cur = nx; } if (cur) out.push(cur); return out; }
  function drawSpeech() {
    if (deadT < 1.4 || !boss.line) return; const n = boss.line.length, shown = Math.min(n, Math.floor(Math.max(0, deadT - 1.6) * 38)), bx = 70, bw = W - 140, by = H - 150, bh = 112, col = ['#ffb347', '#ff6a1a', '#9dff3a', '#ff9dd2', '#ff2d55', '#ffd23f'].concat(P2R.map(p => p.acc))[realmOf(fightIdx)];
    ctx.save(); ctx.globalAlpha = clamp((deadT - 1.4) * 3, 0, 1); ctx.fillStyle = 'rgba(8,6,14,.9)'; ctx.fillRect(bx, by, bw, bh); ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.strokeRect(bx, by, bw, bh);
    ctx.textAlign = 'left'; ctx.fillStyle = col; ctx.font = 'bold 15px ' + FONT; ctx.fillText(BOSS_NAMES[fightIdx].toUpperCase() + ' DEFEATED', bx + 18, by + 26);
    ctx.fillStyle = '#fff3d6'; ctx.font = '20px ' + FONT; const lines = wrapText(boss.line, bw - 36); let c = 0; lines.forEach((l, i) => { const k = clamp(shown - c, 0, l.length); ctx.fillText(l.slice(0, k), bx + 18, by + 58 + i * 26); c += l.length + 1; });
    if (shown >= n) { ctx.fillStyle = '#9b8f84'; ctx.font = '13px ' + FONT; ctx.textAlign = 'right'; ctx.fillText('Space to continue', bx + bw - 14, by + bh - 10); } ctx.restore();
  }
  function drawFight() {
    ctx.drawImage(bgOf('arena', arenaRealm()), 0, 0);
    drawHazards();
    for (const s of pillars) drawPillar(s);
    for (const m of minions) m.draw();
    if (boss && boss.dying) drawDying();
    else if (boss) boss.draw();
    drawBullets(); drawPlayer();
    if (introT > 0) { ctx.globalAlpha = clamp(introT, 0, 1); ctx.fillStyle = '#000'; ctx.fillRect(0, H / 2 - 50, W, 100); ctx.fillStyle = '#ffe9a8'; ctx.font = 'bold 40px ' + FONT; ctx.textAlign = 'center'; ctx.fillText(boss.name, W / 2, H / 2 + 14); ctx.globalAlpha = 1; }
  }

  const SLOT_X = 130, SLOT_Y = 330;
  function overlay(title, sub, lines, color) {
    ctx.fillStyle = 'rgba(0,0,0,.72)'; ctx.fillRect(0, 0, W, H); ctx.textAlign = 'center'; ctx.fillStyle = color || '#ffe9a8'; ctx.font = 'bold 44px ' + FONT; ctx.fillText(title, W / 2, 230); ctx.fillStyle = '#d9cfc4'; ctx.font = '18px ' + FONT; ctx.fillText(sub, W / 2, 275);
    ctx.font = '16px ' + FONT; (lines || []).forEach((l, i) => ctx.fillText(l, W / 2, 330 + i * 26));
  }

  function drawDark() {
    dark.setTransform(0.5, 0, 0, 0.5, 0, 0); dark.globalCompositeOperation = 'source-over'; dark.globalAlpha = 1; const RR = state === S.HUB ? hubRealm() : state === S.TITLE ? 0 : arenaRealm(); dark.fillStyle = RR >= 6 ? 'rgba(2,3,14,.5)' : RR === 5 ? 'rgba(8,12,30,.3)' : RR === 4 ? 'rgba(0,0,4,.66)' : RR === 3 ? 'rgba(8,3,26,.5)' : RR === 2 ? 'rgba(2,16,5,.55)' : RR === 1 ? 'rgba(22,3,0,.55)' : state === S.HUB || state === S.TITLE ? 'rgba(4,3,10,.62)' : 'rgba(4,3,10,.58)'; dark.fillRect(0, 0, W, H);
    dark.globalCompositeOperation = 'destination-out';
    if (!bigCut) { bigCut = document.createElement('canvas'); bigCut.width = bigCut.height = 256; const g = bigCut.getContext('2d'), gr = g.createRadialGradient(128, 128, 12, 128, 128, 128); gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 256, 256); }
    const cut = (x, y, r, a) => { dark.globalAlpha = a; dark.drawImage(bigCut, x - r, y - r, r * 2, r * 2); dark.globalAlpha = 1; };
    cut(player.x, player.y, 330, 1);
    for (const l of lights()) cut(l.x, l.y, l.r * 1.25 * (1 + Math.sin(time * 9 + l.x) * 0.04), 0.9);
    if (boss && !boss.dying) cut(boss.x, boss.y, 160, 0.55);
    if (!cutSprite) { cutSprite = document.createElement('canvas'); cutSprite.width = cutSprite.height = 76; const g = cutSprite.getContext('2d'), gr = g.createRadialGradient(38, 38, 4, 38, 38, 38); gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 76, 76); }
    dark.globalAlpha = 0.35; for (let i = 0; i < eBul.length; i += eBul.length > 90 ? 2 : 1) { const b = eBul[i]; dark.drawImage(cutSprite, b.x - 38, b.y - 38); } dark.globalAlpha = 1;
    for (const h of hazards) if (h.k === 'beam') cut(h.x + Math.cos(h.a) * 200, h.y + Math.sin(h.a) * 200, 220, 0.3);
    ctx.drawImage(darkC, 0, 0, W, H);
  }

  const darkC = document.createElement('canvas'); darkC.width = W / 2; darkC.height = H / 2; const dark = darkC.getContext('2d');   // half-res darkness layer (it is soft anyway) = much cheaper

  // ------------------------------------------------------------------ intro cutscene (plays when you start a new game)
  const STORY_INTRO = [
    { d: 7, t: 'Long ago, the realms lived in peace beneath the watch of the gods.' },
    { d: 7, t: 'But Zeus, king of the gods, grew hungry for power. He wanted every realm for himself.' },
    { d: 7, t: 'He hurled down his thunder, and the world began to burn.' },
    { d: 9, t: 'One by one the realms fell: the Caves, the Underworld, the Acid Swamps, Dreamland, the Shadow Realm.' },
    { d: 7, t: 'He set mighty guardians to hold every realm. Thirty monsters, all sworn to him.' },
    { d: 7, t: 'Heroes rose to stop him. Every one of them fell.' },
    { d: 7, t: 'Now only you remain. You are the last hope of the world.' },
    { d: 9, t: 'Fight through every realm. Climb to the Land of the Gods. Find Zeus, and defeat him.' },
    { d: 6, t: 'The final battle awaits.' }
  ];
  const STORY_END = [
    { d: 8, t: 'With one last blow, the thunder king fell, and his storm fell silent.' },
    { d: 8, t: 'His power shattered, and the dark clouds that smothered the world began to part.' },
    { d: 9, t: 'One by one the realms were freed: the Caves, the Underworld, the Acid Swamps, Dreamland, the Shadow Realm and the Land of the Gods.' },
    { d: 7, t: 'The fires went out. The villages were rebuilt, and the people cheered.' },
    { d: 7, t: 'And they all knew whose courage had saved them.' },
    { d: 7, t: 'The legend of the last hero will be told forever.' }
  ];
  const STORY_P2 = [
    { d: 7, t: 'The world was saved. The storm was gone, and the sky was calm at last.' },
    { d: 7, t: 'But far beyond the sky, something ancient was awake.' },
    { d: 8, t: 'The World Eater. It devours entire planets, and no world has ever escaped its hunger.' },
    { d: 8, t: 'It had already swallowed a thousand worlds. Now it turned its hungry eyes toward yours.' },
    { d: 10, t: 'Its servants guard five planets. Twenty-four guardians stand between you and the beast.' },
    { d: 8, t: 'No one else is left. Only you can cross the stars and stop the World Eater.' },
    { d: 7, t: 'Defeat all 24 guardians, then face the World Eater.' }
  ];
  const STORY_END2 = [
    { d: 8, t: 'With a final roar, the World Eater burst apart, and every world it had swallowed came flying back.' },
    { d: 8, t: 'The planets returned to the sky, and the stars shone brighter than ever.' },
    { d: 8, t: 'Across the galaxy, every world knew whose courage had saved them.' }
  ];
  let STORY = STORY_INTRO, storyKind = 'intro', win2 = false, storyE = null;
  let storyI = 0, storyT = 0, storyZ = null;
  function startStory(kind) { storyKind = kind || 'intro'; STORY = { intro: STORY_INTRO, end: STORY_END, p2: STORY_P2, end2: STORY_END2 }[storyKind]; state = S.STORY; storyI = 0; storyT = 0; storyZ = mkZeus(); storyZ.ph = 3; storyE = mkWorldEater(); }
  function finishStory() { if (storyKind === 'end') { win2 = false; state = S.WIN; saveBest(bossIdx); saveSlot(); } else if (storyKind === 'end2') { win2 = true; state = S.WIN; saveBest(bossIdx); } else if (storyKind === 'p2') { resetWorld(); enterHub(false); } else newRun(); }
  function nextStory() { storyI++; storyT = 0; if (storyI >= STORY.length) finishStory(); }
  function drawStory() {
    const sc = STORY[storyI], t = storyT, u = clamp(t / sc.d, 0, 1), i = { intro: 0, end: 20, p2: 40, end2: 60 }[storyKind] + storyI, T = time;
    ctx.save(); ctx.clearRect(0, 0, W, H);
    const sky = (a, b) => { const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, a); g.addColorStop(1, b); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); };
    const stars = (n, al) => { ctx.fillStyle = 'rgba(255,255,255,' + al + ')'; for (let k = 0; k < n; k++) ctx.fillRect((Math.sin(k * 91.7) * 0.5 + 0.5) * W, (Math.sin(k * 47.3 + 2) * 0.5 + 0.5) * H * 0.6, 2, 2); };
    const cloud = (x, y, s, c) => { ctx.fillStyle = c; for (const [dx, dy, r] of [[0, 0, 30], [34, -10, 38], [72, 0, 30], [36, 10, 32]]) { ctx.beginPath(); ctx.arc(x + dx * s, y + dy * s, r * s, 0, TAU); ctx.fill(); } };
    const bolt = (x, y0, y1, seed) => { ctx.lineJoin = 'round'; ctx.beginPath(); let px = x, py = y0, k = 0; ctx.moveTo(px, py); while (py < y1) { py += 24 + ((seed * 7 + k * 13) % 17); px += Math.sin(seed * 3.1 + k * 2.3) * 28; ctx.lineTo(px, py); k++; } ctx.strokeStyle = 'rgba(255,230,120,.55)'; ctx.lineWidth = 12; ctx.stroke(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.stroke(); };
    const zeus = (cx, cy, k, al) => { ctx.save(); ctx.globalAlpha = al || 1; ctx.translate(cx, cy); ctx.scale(k, k); ctx.translate(-storyZ.x, -storyZ.y); storyZ.draw(); ctx.restore(); };
    const flame = (x, y, s) => { for (let k = 0; k < 3; k++) { const h = (26 + Math.sin(T * 9 + x + k * 2) * 9) * s; ctx.fillStyle = k === 0 ? 'rgba(255,70,30,.9)' : k === 1 ? 'rgba(255,150,40,.9)' : 'rgba(255,230,120,.9)'; ctx.beginPath(); ctx.moveTo(x - (10 - k * 3) * s, y); ctx.quadraticCurveTo(x - 4 * s, y - h * 0.6, x + Math.sin(T * 6 + x) * 4, y - h * (1 - k * 0.22)); ctx.quadraticCurveTo(x + 4 * s, y - h * 0.5, x + (10 - k * 3) * s, y); ctx.fill(); } };
    const house = (x, y, s, c) => { ctx.fillStyle = c; ctx.fillRect(x - 18 * s, y - 20 * s, 36 * s, 20 * s); ctx.beginPath(); ctx.moveTo(x - 24 * s, y - 20 * s); ctx.lineTo(x, y - 40 * s); ctx.lineTo(x + 24 * s, y - 20 * s); ctx.fill(); };
    const space = () => { sky('#02020a', '#0a0620'); stars(150, 0.85); };
    const planet = (x, y, r, c1, c2, ring) => { const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r); g.addColorStop(0, c1); g.addColorStop(1, c2); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); if (ring) { ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(x, y, r * 1.6, r * 0.36, -0.3, 0, TAU); ctx.stroke(); } };
    const eat = (cx, cy, k, al) => { ctx.save(); ctx.globalAlpha = al; ctx.translate(cx, cy); ctx.scale(k, k); ctx.translate(-storyE.x, -storyE.y); storyE.draw(); ctx.restore(); };
    const hero = (x, y, s, r) => { ctx.save(); ctx.translate(x, y); ctx.scale(s, s); ctx.rotate((1 - r) * -1.5); ctx.fillStyle = '#1d3f86'; ctx.beginPath(); ctx.moveTo(-14, -26); ctx.lineTo(14, -26); ctx.lineTo(20, 0); ctx.lineTo(-20, 0); ctx.fill(); ctx.fillStyle = '#2a5fb8'; ctx.beginPath(); ctx.ellipse(0, -22, 12, 14, 0, 0, TAU); ctx.fill(); ctx.fillStyle = '#f0c8a0'; ctx.beginPath(); ctx.arc(0, -42, 11, 0, TAU); ctx.fill(); ctx.fillStyle = '#ffb347'; ctx.beginPath(); ctx.arc(0, -46, 11, Math.PI, 0); ctx.fill(); ctx.fillStyle = '#1b1b2a'; ctx.fillRect(-5, -42, 3, 3); ctx.fillRect(3, -42, 3, 3); ctx.restore(); };
    ctx.save(); const zm = 1 + u * 0.05; ctx.translate(W / 2, H / 2); ctx.scale(zm, zm); ctx.translate(-W / 2, -H / 2);
    if (i === 0) {
      sky('#6ec6ff', '#ffeab0'); const sx = 760, sy = 130; ctx.fillStyle = 'rgba(255,240,150,.35)'; ctx.beginPath(); ctx.arc(sx, sy, 90, 0, TAU); ctx.fill(); ctx.fillStyle = '#fff3a0'; ctx.beginPath(); ctx.arc(sx, sy, 52, 0, TAU); ctx.fill();
      for (let k = 0; k < 3; k++) cloud(((T * 14 + k * 340) % 1200) - 150, 90 + k * 70, 1.1 - k * 0.2, 'rgba(255,255,255,.85)');
      ctx.fillStyle = '#9aa8c0'; ctx.beginPath(); ctx.moveTo(250, 430); ctx.lineTo(480, 150); ctx.lineTo(710, 430); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(430, 205); ctx.lineTo(480, 150); ctx.lineTo(530, 205); ctx.lineTo(500, 195); ctx.lineTo(480, 215); ctx.lineTo(460, 195); ctx.fill();
      ctx.fillStyle = '#f4f0e0'; ctx.fillRect(448, 126, 64, 6); for (let k = 0; k < 5; k++) ctx.fillRect(452 + k * 13, 108, 5, 18); ctx.beginPath(); ctx.moveTo(444, 108); ctx.lineTo(480, 92); ctx.lineTo(516, 108); ctx.fill();
      ctx.fillStyle = '#5fae4a'; ctx.beginPath(); ctx.moveTo(0, 470); ctx.quadraticCurveTo(250, 380, 520, 460); ctx.quadraticCurveTo(780, 400, 960, 450); ctx.lineTo(960, 640); ctx.lineTo(0, 640); ctx.fill(); ctx.fillStyle = '#4a9a3c'; ctx.beginPath(); ctx.moveTo(0, 540); ctx.quadraticCurveTo(300, 470, 600, 540); ctx.quadraticCurveTo(800, 570, 960, 520); ctx.lineTo(960, 640); ctx.lineTo(0, 640); ctx.fill();
      for (const [x, y, s] of [[160, 520, 1], [250, 540, 1.2], [700, 510, 1], [800, 535, 1.3], [880, 505, 0.9]]) house(x, y, s, '#e8d8b0'), ctx.fillStyle = '#c0452c', ctx.beginPath(), ctx.moveTo(x - 26 * s, y - 20 * s), ctx.lineTo(x, y - 42 * s), ctx.lineTo(x + 26 * s, y - 20 * s), ctx.fill();
      ctx.strokeStyle = '#2a3a4a'; ctx.lineWidth = 2; for (let k = 0; k < 4; k++) { const bx = ((T * 60 + k * 260) % 1100) - 100, by = 200 + k * 30 + Math.sin(T * 3 + k) * 10, w = Math.sin(T * 10 + k) * 5; ctx.beginPath(); ctx.moveTo(bx - 10, by + w); ctx.lineTo(bx, by); ctx.lineTo(bx + 10, by + w); ctx.stroke(); }
    } else if (i === 1) {
      sky('#6ec6ff', '#ffeab0'); ctx.fillStyle = 'rgba(30,6,50,' + (0.15 + u * 0.75) + ')'; ctx.fillRect(0, 0, W, H); stars(40, u * 0.8);
      for (let k = 0; k < 6; k++) cloud(k * 190 - 60 + Math.sin(T * 0.5 + k) * 20, 470 - u * 40 + (k % 2) * 40, 1.7, 'rgba(70,60,110,' + (0.5 + u * 0.4) + ')');
      glowRing(480, 290, 190 + u * 30, 'rgba(160,100,255,A)', 0.25 + u * 0.35); zeus(480, 300, 1.45 + u * 0.25, Math.min(1, t / 1.4));
      if (u > 0.5 && Math.sin(T * 7) > 0.8) { ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(0, 0, W, H); }
    } else if (i === 2) {
      sky('#0d0618', '#3a0f2a'); for (let k = 0; k < 7; k++) cloud(k * 170 - 80 + Math.sin(T * 0.4 + k) * 24, 60 + (k % 3) * 40, 1.8, 'rgba(30,20,50,.95)'); zeus(480, 190, 1.2, 0.5);
      ctx.fillStyle = '#0a0610'; ctx.fillRect(0, 520, W, 120); for (let k = 0; k < 9; k++) { const x = 60 + k * 105, s = 1 + (k % 3) * 0.3; house(x, 540, s, '#150c18'); if ((k * 5 + 3) % 4 !== 0) { flame(x - 6 * s, 516 * 1, s * 1.1); flame(x + 8 * s, 530, s * 0.9); } }
      const ph = (t * 1.1) % 1; if (ph < 0.3) { const sd = Math.floor(t * 1.1); bolt(120 + ((sd * 217) % 720), 80, 520, sd + 1); ctx.fillStyle = 'rgba(255,255,255,' + (0.3 - ph) * 0.7 + ')'; ctx.fillRect(0, 0, W, H); }
    } else if (i === 3) {
      sky('#07050d', '#1a1020'); stars(60, 0.7); zeus(480, 120, 1.0, 0.45);
      const R = [['CAVES', '#c8b090'], ['UNDERWORLD', '#ff6a1a'], ['ACID', '#9dff3a'], ['DREAMLAND', '#c77dff'], ['SHADOW', '#6a6ab0'], ['GODS', '#ffd23f']];
      for (let k = 0; k < 6; k++) { const x = 100 + k * 152, y = 400 + Math.sin(k * 1.1) * 40, tt = t - (0.9 + k * 1.2), fallen = tt > 0, c = R[k][1];
        glowRing(x, y, 80, fallen ? 'rgba(120,20,30,A)' : c.length === 7 ? hexA(c) : 'rgba(255,255,255,A)', fallen ? 0.35 : 0.6);
        ctx.fillStyle = fallen ? '#2a2630' : c; ctx.beginPath(); ctx.arc(x, y, 44, 0, TAU); ctx.fill(); if (!fallen) { ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.beginPath(); ctx.arc(x + 12, y + 10, 34, 0, TAU); ctx.fill(); }
        if (fallen) { ctx.strokeStyle = '#8a1a2a'; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(x - 30, y - 30); ctx.lineTo(x + 30, y + 30); ctx.moveTo(x + 30, y - 30); ctx.lineTo(x - 30, y + 30); ctx.stroke(); ctx.strokeStyle = '#555'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, 50, 0, TAU); ctx.stroke(); }
        if (tt > 0 && tt < 0.35) { bolt(x, 0, y, k + 4); ctx.fillStyle = 'rgba(255,255,255,' + (0.35 - tt) + ')'; ctx.fillRect(0, 0, W, H); }
        ctx.fillStyle = fallen ? '#7a6a78' : '#fff'; ctx.font = 'bold 12px ' + FONT; ctx.textAlign = 'center'; ctx.fillText(R[k][0], x, y + 72); }
    } else if (i === 4) {
      sky('#1a0508', '#5a1418'); stars(25, 0.4); zeus(480, 230, 1.75, 0.9); const cnt = Math.floor(clamp(t / 4.5, 0, 1) * 30);
      for (let k = 0; k < cnt; k++) { const row = Math.floor(k / 10), col = k % 10, x = 78 + col * 89 + (row % 2) * 30, y = 440 + row * 62, s = 0.8 + row * 0.18, c = ['#7fe3ff', '#ff6a1a', '#9dff3a', '#c77dff', '#ff2d55', '#ffd23f'][Math.floor(k / 5)]; ctx.fillStyle = '#050308'; ctx.beginPath(); ctx.ellipse(x, y, 24 * s, 30 * s, 0, 0, TAU); ctx.fill(); ctx.fillStyle = c; ctx.fillRect(x - 11 * s, y - 8 * s, 7 * s, 5 * s); ctx.fillRect(x + 4 * s, y - 8 * s, 7 * s, 5 * s); }
    } else if (i === 5) {
      sky('#2a0a14', '#7a2418'); ctx.fillStyle = '#120808'; ctx.beginPath(); ctx.moveTo(0, 500); ctx.quadraticCurveTo(480, 440, 960, 500); ctx.lineTo(960, 640); ctx.lineTo(0, 640); ctx.fill();
      for (let k = 0; k < 9; k++) { const x = 70 + k * 98, y = 520 + Math.sin(k * 2.1) * 14, a = Math.sin(k * 3.7) * 0.35; ctx.save(); ctx.translate(x, y); ctx.rotate(a); if (k % 3 === 0) { ctx.fillStyle = '#8a6a3a'; ctx.beginPath(); ctx.arc(0, -40, 26, 0, TAU); ctx.fill(); ctx.strokeStyle = '#5a3a1a'; ctx.lineWidth = 3; ctx.stroke(); } else { ctx.fillStyle = '#c8ccd8'; ctx.beginPath(); ctx.moveTo(0, -92); ctx.lineTo(7, -20); ctx.lineTo(-7, -20); ctx.fill(); ctx.fillStyle = '#7a5a2a'; ctx.fillRect(-16, -22, 32, 6); ctx.fillRect(-3, -16, 6, 30); } ctx.restore(); }
      for (let k = 0; k < 14; k++) { const v = (T * 0.25 + k * 0.071) % 1; ctx.fillStyle = 'rgba(60,40,40,' + (0.5 - v * 0.5) + ')'; ctx.beginPath(); ctx.arc(60 + k * 66 + Math.sin(T + k) * 14, 500 - v * 300, 18 + v * 30, 0, TAU); ctx.fill(); }
      ctx.save(); ctx.translate(480, 160); ctx.rotate(Math.sin(T * 1.2) * 0.04); ctx.fillStyle = '#8a1a2a'; ctx.beginPath(); ctx.moveTo(-34, 0); ctx.lineTo(34, 0); ctx.lineTo(34, 120); ctx.lineTo(10, 100); ctx.lineTo(-6, 130); ctx.lineTo(-34, 105); ctx.fill(); ctx.fillStyle = '#c8b0a0'; ctx.fillRect(-4, -20, 8, 24); ctx.restore();
    } else if (i === 6) {
      ctx.fillStyle = '#05050a'; ctx.fillRect(0, 0, W, H); const fl = 0.8 + Math.sin(T * 11) * 0.1 + Math.sin(T * 7) * 0.08; glowRing(160, 300, 260 * fl, 'rgba(255,150,50,A)', 0.55); glowRing(480, 430, 220, 'rgba(120,160,255,A)', 0.18 + u * 0.3);
      ctx.fillStyle = '#16131a'; ctx.beginPath(); ctx.moveTo(0, 470); ctx.lineTo(960, 470); ctx.lineTo(960, 640); ctx.lineTo(0, 640); ctx.fill(); ctx.fillStyle = '#2a2230'; for (let k = 0; k < 12; k++) { ctx.beginPath(); ctx.moveTo(k * 90, 0); ctx.lineTo(k * 90 + 40, 70 + (k % 3) * 40); ctx.lineTo(k * 90 + 80, 0); ctx.fill(); }
      ctx.fillStyle = '#6a4a2a'; ctx.fillRect(154, 320, 12, 100); flame(160, 322, 1.5); hero(480, 490, 2.4, clamp((t - 1) / 3.5, 0, 1));
      if (t > 4.5) { ctx.fillStyle = 'rgba(255,255,255,' + clamp((t - 4.5) / 2, 0, 0.5) + ')'; ctx.fillRect(0, 0, W, 6); }
    } else if (i === 7) {
      sky('#0a0a1c', '#3a2a40'); stars(50, 0.8); const P = [[90, 490], [270, 450], [140, 380], [380, 350], [250, 250], [520, 215]], C = ['#c8b090', '#ff6a1a', '#9dff3a', '#c77dff', '#6a6ab0', '#ffd23f'];
      ctx.strokeStyle = 'rgba(255,230,160,.35)'; ctx.lineWidth = 8; ctx.setLineDash([14, 10]); ctx.beginPath(); ctx.moveTo(P[0][0], P[0][1]); for (let k = 1; k < 6; k++) ctx.lineTo(P[k][0], P[k][1]); ctx.lineTo(720, 150); ctx.stroke(); ctx.setLineDash([]);
      const prog = clamp(t / 7, 0, 1) * 5.5; for (let k = 0; k < 6; k++) { const on = prog >= k - 0.05; glowRing(P[k][0], P[k][1], on ? 70 : 40, hexA(C[k]), on ? 0.6 : 0.15); ctx.strokeStyle = on ? C[k] : '#444'; ctx.lineWidth = 6; ctx.beginPath(); ctx.ellipse(P[k][0], P[k][1], 22, 32, 0, 0, TAU); ctx.stroke(); }
      ctx.fillStyle = '#f4f0e0'; ctx.fillRect(690, 90, 60, 60); ctx.beginPath(); ctx.moveTo(682, 90); ctx.lineTo(720, 62); ctx.lineTo(758, 90); ctx.fill(); glowRing(720, 100, 120, 'rgba(255,210,63,A)', 0.4 + Math.sin(T * 3) * 0.1); if (prog > 5) { ctx.fillStyle = '#7fd0ff'; ctx.fillRect(708, 100, 8, 5); ctx.fillRect(724, 100, 8, 5); }
      const k0 = Math.min(4, Math.floor(prog)), f = prog - k0, Q = k0 < 5 ? [P[k0][0] + (P[k0 + 1][0] - P[k0][0]) * f, P[k0][1] + (P[k0 + 1][1] - P[k0][1]) * f] : P[5]; hero(Q[0], Q[1] + 16, 0.9, 1);
    } else if (i === 8) {
      sky('#000', '#120820'); const gl = Math.sin(T * 8) > 0.85; zeus(480, 300, 2.1 + u * 0.2, 1); if (gl) { ctx.fillStyle = 'rgba(255,255,255,.15)'; ctx.fillRect(0, 0, W, H); } if (Math.sin(T * 3) > 0.7) bolt(100 + (Math.floor(T * 3) * 233) % 760, 0, 500, Math.floor(T * 3));
      if (t > 1.6) { ctx.globalAlpha = clamp((t - 1.6) / 1.2, 0, 1); ctx.fillStyle = '#ffd23f'; ctx.font = 'bold 76px ' + FONT; ctx.textAlign = 'center'; ctx.fillText('BOSS RUSH', W / 2, 150); ctx.globalAlpha = 1; }
    } else if (i === 20) {
      sky('#07040e', '#1a0a24'); const sh = clamp((t - 2.5) / 3.5, 0, 1); glowRing(480, 300, 120 + sh * 520, 'rgba(255,240,170,A)', 0.15 + sh * 0.6); zeus(480 + Math.sin(T * 40) * (1 - sh) * 4, 300, 1.8, 1 - sh * 0.9);
      ctx.strokeStyle = 'rgba(255,255,255,' + clamp(t / 3, 0, 1) + ')'; ctx.lineWidth = 3; for (let k = 0; k < 10; k++) { const a = k * 0.63 + 0.3, r0 = 20 + k * 3, r1 = 60 + clamp(t / 4, 0, 1) * 170 + (k % 3) * 20; ctx.beginPath(); ctx.moveTo(480 + Math.cos(a) * r0, 290 + Math.sin(a) * r0); ctx.lineTo(480 + Math.cos(a + 0.15) * (r0 + r1) / 2, 290 + Math.sin(a + 0.15) * (r0 + r1) / 2); ctx.lineTo(480 + Math.cos(a) * r1, 290 + Math.sin(a) * r1); ctx.stroke(); }
      hero(480, 600, 1.7, 1); if (t > 5 && t < 5.6) { ctx.fillStyle = 'rgba(255,255,255,' + (1 - (t - 5) / 0.6) * 0.9 + ')'; ctx.fillRect(0, 0, W, H); }
    } else if (i === 21) {
      sky('#2a1a4a', '#ffb070'); ctx.fillStyle = 'rgba(10,6,30,' + (1 - clamp(t / 5, 0, 1)) * 0.85 + ')'; ctx.fillRect(0, 0, W, H); glowRing(480, 470, 380, 'rgba(255,220,130,A)', clamp(t / 5, 0, 0.8));
      for (let k = 0; k < 8; k++) { const dir = k % 2 ? 1 : -1; cloud(480 + dir * (40 + t * (30 + k * 12)) + (k - 4) * 60, 150 + (k % 4) * 80 - t * 6, 1.6, 'rgba(60,50,90,' + (0.9 - clamp(t / 7, 0, 0.7)) + ')'); }
      ctx.save(); ctx.translate(480, 360 + t * 8); ctx.rotate(Math.sin(t) * 0.05 + t * 0.12); ctx.fillStyle = '#ffd23f'; ctx.globalAlpha = Math.max(0, 1 - t / 6); ctx.beginPath(); ctx.moveTo(-60, 20); ctx.lineTo(-40, -30); ctx.lineTo(-20, 0); ctx.lineTo(0, -40); ctx.lineTo(20, 0); ctx.lineTo(40, -30); ctx.lineTo(60, 20); ctx.fill(); ctx.restore(); ctx.globalAlpha = 1;
      ctx.fillStyle = '#16101c'; ctx.beginPath(); ctx.moveTo(0, 520); ctx.quadraticCurveTo(480, 470, 960, 520); ctx.lineTo(960, 640); ctx.lineTo(0, 640); ctx.fill();
    } else if (i === 22) {
      sky('#ffcf90', '#ffefc0'); stars(0, 0); const R = ['#c8b090', '#ff6a1a', '#9dff3a', '#c77dff', '#6a6ab0', '#ffd23f'], NM = ['CAVES', 'UNDERWORLD', 'ACID', 'DREAMLAND', 'SHADOW', 'GODS'];
      for (let k = 0; k < 6; k++) { const x = 100 + k * 152, y = 330 + Math.sin(k * 1.1) * 40, tt = t - (0.6 + k * 1.1), free = tt > 0; glowRing(x, y, free ? 95 : 60, free ? hexA(R[k]) : 'rgba(80,20,30,A)', free ? 0.6 : 0.3); ctx.fillStyle = free ? R[k] : '#2a2630'; ctx.beginPath(); ctx.arc(x, y, 44, 0, TAU); ctx.fill(); if (free) { ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.beginPath(); ctx.arc(x + 12, y + 10, 34, 0, TAU); ctx.fill(); } else { ctx.strokeStyle = '#8a1a2a'; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(x - 30, y - 30); ctx.lineTo(x + 30, y + 30); ctx.moveTo(x + 30, y - 30); ctx.lineTo(x - 30, y + 30); ctx.stroke(); }
        if (free && tt < 1.2) { ctx.strokeStyle = 'rgba(255,255,255,' + (1 - tt / 1.2) + ')'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(x, y, 44 + tt * 90, 0, TAU); ctx.stroke(); for (let q = 0; q < 8; q++) { const a = q * 0.785; ctx.fillStyle = 'rgba(255,255,255,' + (1 - tt / 1.2) + ')'; ctx.fillRect(x + Math.cos(a) * (50 + tt * 70), y + Math.sin(a) * (50 + tt * 70), 5, 5); } }
        ctx.fillStyle = free ? '#5a3a1a' : '#7a6a78'; ctx.font = 'bold 12px ' + FONT; ctx.textAlign = 'center'; ctx.fillText(NM[k], x, y + 72); }
    } else if (i === 23) {
      sky('#ffb070', '#ffe8b0'); ctx.fillStyle = '#fff3a0'; ctx.beginPath(); ctx.arc(480, 300, 64, 0, TAU); ctx.fill(); glowRing(480, 300, 200, 'rgba(255,230,140,A)', 0.5);
      ctx.fillStyle = '#6aa84a'; ctx.beginPath(); ctx.moveTo(0, 400); ctx.quadraticCurveTo(300, 340, 600, 400); ctx.quadraticCurveTo(800, 430, 960, 380); ctx.lineTo(960, 640); ctx.lineTo(0, 640); ctx.fill();
      for (let k = 0; k < 6; k++) { const x = 80 + k * 160, y = 470 + (k % 2) * 20; house(x, y, 1.4, '#f0e0b8'); ctx.fillStyle = '#c0452c'; ctx.beginPath(); ctx.moveTo(x - 34, y - 28); ctx.lineTo(x, y - 58); ctx.lineTo(x + 34, y - 28); ctx.fill(); ctx.fillStyle = '#ffd23f'; ctx.fillRect(x + 20, y - 80, 3, 24); ctx.fillRect(x + 23, y - 80, 14, 9); }
      for (let k = 0; k < 14; k++) { const x = 40 + k * 66 + Math.sin(k * 5) * 12, y = 560 + (k % 3) * 16, j = Math.abs(Math.sin(T * 5 + k)) * 14; ctx.fillStyle = ['#c0452c', '#2a5fb8', '#3aa060', '#e8c050'][k % 4]; ctx.fillRect(x - 6, y - 26 - j, 12, 20); ctx.fillStyle = '#f0c8a0'; ctx.beginPath(); ctx.arc(x, y - 34 - j, 7, 0, TAU); ctx.fill(); ctx.strokeStyle = '#f0c8a0'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x - 6, y - 22 - j); ctx.lineTo(x - 14, y - 44 - j - Math.sin(T * 8 + k) * 4); ctx.moveTo(x + 6, y - 22 - j); ctx.lineTo(x + 14, y - 44 - j + Math.sin(T * 8 + k) * 4); ctx.stroke(); }
      for (let k = 0; k < 18; k++) { const v = (T * 0.3 + k * 0.057) % 1; ctx.fillStyle = ['#ff7ad9', '#ffd23f', '#7fd0ff', '#9dff3a'][k % 4]; ctx.fillRect(40 + k * 50 + Math.sin(T * 3 + k) * 20, 100 + v * 380, 6, 6); }
    } else if (i === 24) {
      sky('#ff9a4a', '#ffe9a0'); glowRing(480, 250, 340, 'rgba(255,240,170,A)', 0.8); ctx.fillStyle = '#fff6c0'; ctx.beginPath(); ctx.arc(480, 250, 80, 0, TAU); ctx.fill();
      for (let k = 0; k < 20; k++) { const a = k * TAU / 20 + T * 0.1; ctx.fillStyle = 'rgba(255,240,170,.35)'; ctx.beginPath(); ctx.moveTo(480, 250); ctx.lineTo(480 + Math.cos(a - 0.05) * 900, 250 + Math.sin(a - 0.05) * 900); ctx.lineTo(480 + Math.cos(a + 0.05) * 900, 250 + Math.sin(a + 0.05) * 900); ctx.fill(); }
      ctx.fillStyle = '#4a3a50'; ctx.beginPath(); ctx.moveTo(0, 640); ctx.lineTo(260, 470); ctx.lineTo(420, 430); ctx.lineTo(480, 410); ctx.lineTo(540, 430); ctx.lineTo(700, 480); ctx.lineTo(960, 640); ctx.fill();
      ctx.save(); ctx.translate(480, 412); ctx.scale(2.3, 2.3); ctx.fillStyle = '#10101c'; ctx.beginPath(); ctx.moveTo(-14, -26); ctx.lineTo(14, -26); ctx.lineTo(20, 0); ctx.lineTo(-20, 0); ctx.fill(); ctx.beginPath(); ctx.arc(0, -42, 11, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.moveTo(-14, -26); ctx.lineTo(-34 + Math.sin(T * 2) * 2, -22); ctx.lineTo(-34, -30); ctx.lineTo(-14, -34); ctx.fill(); ctx.strokeStyle = '#10101c'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(14, -30); ctx.lineTo(30, -58); ctx.stroke(); ctx.fillStyle = '#ffd23f'; ctx.fillRect(26, -72, 8, 18); ctx.restore();
      ctx.strokeStyle = '#2a1a2a'; ctx.lineWidth = 2; for (let k = 0; k < 5; k++) { const bx = ((T * 50 + k * 220) % 1100) - 100, by = 130 + k * 24 + Math.sin(T * 3 + k) * 8, w = Math.sin(T * 9 + k) * 5; ctx.beginPath(); ctx.moveTo(bx - 10, by + w); ctx.lineTo(bx, by); ctx.lineTo(bx + 10, by + w); ctx.stroke(); }
    } else if (i === 25) {
      sky('#05030c', '#150a24'); stars(90, 0.9); glowRing(480, 280, 260, 'rgba(255,210,63,A)', 0.25 + Math.sin(T * 2) * 0.05);
      ctx.fillStyle = '#ffd23f'; ctx.font = 'bold 64px ' + FONT; ctx.textAlign = 'center'; ctx.globalAlpha = clamp(t / 1.5, 0, 1); ctx.fillText('YOU SAVED', W / 2, 250); ctx.fillText('THE WORLD', W / 2, 330); ctx.font = 'bold 26px ' + FONT; ctx.fillStyle = '#ffe9c0'; ctx.globalAlpha = clamp((t - 2.5) / 1.5, 0, 1); ctx.fillText('~ THE END ~', W / 2, 400); ctx.globalAlpha = 1;
      for (let k = 0; k < 20; k++) { const v = (T * 0.2 + k * 0.05) % 1; ctx.fillStyle = 'rgba(255,215,90,' + (1 - v) + ')'; ctx.fillRect((Math.sin(k * 71) * 0.5 + 0.5) * W, 520 - v * 480, 3, 3); }
    } else if (i === 40) {
      const u2 = clamp((t - 2) / 5, 0, 1); sky('#ff9a5a', '#ffe8b0'); ctx.fillStyle = 'rgba(30,6,60,' + u2 * 0.75 + ')'; ctx.fillRect(0, 0, W, H); stars(70, u2 * 0.9);
      ctx.fillStyle = '#2a3a2a'; ctx.beginPath(); ctx.moveTo(0, 470); ctx.quadraticCurveTo(300, 420, 600, 480); ctx.quadraticCurveTo(800, 510, 960, 470); ctx.lineTo(960, 640); ctx.lineTo(0, 640); ctx.fill(); hero(300, 520, 1.9, 1);
      if (u2 > 0) { glowRing(660, 220, 60 + u2 * 160, 'rgba(180,90,255,A)', 0.65); ctx.fillStyle = '#12041f'; ctx.beginPath(); ctx.ellipse(660, 220, 20 + u2 * 62, 34 + u2 * 100, 0, 0, TAU); ctx.fill(); for (let k = 0; k < 4; k++) { ctx.strokeStyle = ['#c77dff', '#7fd0ff', '#ff9dd2', '#fff'][k]; ctx.lineWidth = 4; ctx.beginPath(); ctx.ellipse(660, 220, (24 + u2 * 70) * (1 - k * 0.15), (40 + u2 * 112) * (1 - k * 0.15), T * (k % 2 ? 1 : -1) * 0.6, 0, TAU * 0.78); ctx.stroke(); } }
    } else if (i === 41) {
      space(); glowRing(200, 200, 260, 'rgba(120,60,200,A)', 0.25); glowRing(780, 400, 300, 'rgba(200,40,120,A)', 0.18);
      for (let k = 0; k < 7; k++) { const ex = (Math.sin(k * 57.3) * 0.5 + 0.5) * 800 + 80, ey = (Math.sin(k * 23.1 + 1) * 0.5 + 0.5) * 380 + 60, a = clamp(u * 3 - k * 0.3, 0, 1) * (Math.sin(T * 2 + k) > 0.9 ? 0.2 : 1); ctx.fillStyle = 'rgba(255,58,138,' + a + ')'; ctx.beginPath(); ctx.arc(ex, ey, 4, 0, TAU); ctx.arc(ex + 16, ey, 4, 0, TAU); ctx.fill(); }
      ctx.fillStyle = 'rgba(0,0,0,.92)'; ctx.beginPath(); ctx.ellipse(-300 + u * 1500, 300, 420, 180, 0, 0, TAU); ctx.fill();
    } else if (i === 42) {
      space(); glowRing(330, 300, 300, 'rgba(255,58,138,A)', 0.2); const pr = 80 * (1 - u * 0.92); eat(330, 270, 1.1, 1); planet(740 - u * 260, 300 - u * 10, Math.max(4, pr), '#5ac8ff', '#1a4a8a');
      for (let k = 0; k < 34; k++) { const v = (u * 1.4 + k * 0.03) % 1, px = 740 - u * 260 - v * (410 - u * 260), py = 300 - v * 30 + Math.sin(k * 9 + T * 4) * 20 * (1 - v); ctx.fillStyle = ['#5ac8ff', '#2a6aaa', '#fff'][k % 3]; ctx.fillRect(px, py, 5, 5); }
    } else if (i === 43) {
      space(); for (let k = 0; k < 10; k++) { ctx.strokeStyle = 'rgba(120,100,160,.35)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(80 + k * 90, 120 + (k % 3) * 120, 16 + (k % 4) * 6, 0, TAU); ctx.stroke(); }
      glowRing(790, 330, 150, 'rgba(90,255,200,A)', 0.35); planet(790, 330, 72, '#5aff9a', '#1a6aaa', true); ctx.fillStyle = '#fff'; ctx.font = 'bold 12px ' + FONT; ctx.textAlign = 'center'; ctx.fillText('YOUR WORLD', 790, 430);
      eat(120 + u * 160, 310, 0.8 + u * 0.55, 1);
    } else if (i === 44) {
      space(); const NMs = ['MOON', 'RUSTWORLD', 'STORMCLOUD', 'PRISM', 'HYPERION'], CS = [['#e0e8f4', '#6a7a94'], ['#e0703a', '#7a2a14'], ['#7affd2', '#2a6a7a'], ['#ff9ae0', '#8a3aa0'], ['#39ff88', '#0a3a2a']], CNT = [5, 5, 5, 5, 4];
      for (let k = 0; k < 5; k++) { const x = 100 + k * 190, y = 300 + Math.sin(k * 1.7) * 60, vis = clamp(u * 6 - k, 0, 1); ctx.globalAlpha = 0.3 + 0.7 * vis; planet(x, y, 48, CS[k][0], CS[k][1], k === 2 || k === 3); for (let q = 0; q < Math.round(CNT[k] * vis); q++) { const a = T * 0.8 + q * TAU / CNT[k]; ctx.fillStyle = '#05030a'; ctx.beginPath(); ctx.arc(x + Math.cos(a) * 78, y + Math.sin(a) * 46, 9, 0, TAU); ctx.fill(); ctx.fillStyle = '#ff3a8a'; ctx.fillRect(x + Math.cos(a) * 78 - 5, y + Math.sin(a) * 46 - 2, 3, 3); ctx.fillRect(x + Math.cos(a) * 78 + 2, y + Math.sin(a) * 46 - 2, 3, 3); } ctx.fillStyle = '#fff'; ctx.font = 'bold 12px ' + FONT; ctx.textAlign = 'center'; ctx.fillText(NMs[k], x, y + 100); ctx.globalAlpha = 1; }
      ctx.fillStyle = '#ffe9c0'; ctx.font = 'bold 22px ' + FONT; ctx.textAlign = 'center'; ctx.fillText(Math.min(24, Math.floor(u * 40)) + ' GUARDIANS', W / 2, 140);
    } else if (i === 45) {
      space(); ctx.fillStyle = '#1a1424'; ctx.beginPath(); ctx.moveTo(0, 450); ctx.lineTo(960, 450); ctx.lineTo(960, 640); ctx.lineTo(0, 640); ctx.fill(); glowRing(720, 350, 200, 'rgba(180,90,255,A)', 0.6); ctx.fillStyle = '#12041f'; ctx.beginPath(); ctx.ellipse(720, 350, 52, 96, 0, 0, TAU); ctx.fill();
      for (let k = 0; k < 4; k++) { ctx.strokeStyle = ['#c77dff', '#7fd0ff', '#ff9dd2', '#fff'][k]; ctx.lineWidth = 5; ctx.beginPath(); ctx.ellipse(720, 350, (56 + k * 8) * 1, (100 + k * 8), T * (k % 2 ? 1 : -1) * 0.7, 0, TAU * 0.78); ctx.stroke(); }
      const hu = clamp((u - 0.15) / 0.75, 0, 1), hs = hu > 0.85 ? 1.9 - (hu - 0.85) * 10 : 1.9; ctx.globalAlpha = hu > 0.85 ? 1 - (hu - 0.85) / 0.15 : 1; hero(180 + hu * 520, 450, Math.max(0.2, hs), 1); ctx.globalAlpha = 1; if (u > 0.92) { ctx.fillStyle = 'rgba(255,255,255,' + (u - 0.92) / 0.08 + ')'; ctx.fillRect(0, 0, W, H); }
    } else if (i === 46) {
      sky('#000', '#0a0420'); const cx = W / 2, cy = 280; for (let k = 0; k < 140; k++) { const a = k * 2.399, v = ((T * 0.9 + k * 0.0371) % 1), r0 = v * v * 720, r1 = r0 + 14 + v * 150; ctx.strokeStyle = ['rgba(255,255,255,', 'rgba(150,200,255,', 'rgba(255,150,220,'][k % 3] + Math.min(1, v * 1.6) + ')'; ctx.lineWidth = 1 + v * 2; ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); ctx.stroke(); }
      glowRing(cx, cy, 160, 'rgba(255,255,255,A)', 0.5); ctx.textAlign = 'center'; ctx.globalAlpha = clamp(t / 1.2, 0, 1); ctx.fillStyle = '#7fe8ff'; ctx.font = 'bold 34px ' + FONT; ctx.fillText('PART TWO', W / 2, 220); ctx.fillStyle = '#ffd23f'; ctx.font = 'bold 54px ' + FONT; ctx.fillText('INTERGALACTIC', W / 2, 290); ctx.fillText('JOURNEY', W / 2, 350); ctx.globalAlpha = 1;
    } else if (i === 60) {
      space(); const bu = clamp(u * 1.6, 0, 1); eat(480 + Math.sin(T * 50) * (1 - bu) * 4, 290, 1.3 * (1 - bu * 0.6), 1 - bu); glowRing(480, 290, 100 + u * 520, 'rgba(255,240,200,A)', clamp(1 - u * 0.9, 0, 0.9));
      const PC = ['#e0e8f4', '#e0703a', '#7affd2', '#ff9ae0', '#39ff88', '#5ac8ff', '#ffd23f', '#c77dff', '#ff7a7a', '#9affff', '#ffb347', '#a8ff7a']; for (let k = 0; k < 12; k++) { const a = k * TAU / 12 + 0.3, d = clamp(u * 1.3 - 0.1, 0, 1), dd = d * (260 + (k % 3) * 120); planet(480 + Math.cos(a) * dd, 290 + Math.sin(a) * dd * 0.75, 8 + d * (14 + (k % 4) * 7), PC[k], '#10101a'); }
    } else if (i === 61) {
      space(); stars(160, 0.6 + Math.sin(T * 3) * 0.3); const CS2 = [['#e0e8f4', '#6a7a94'], ['#e0703a', '#7a2a14'], ['#7affd2', '#2a6a7a'], ['#ff9ae0', '#8a3aa0'], ['#39ff88', '#0a3a2a']]; for (let k = 0; k < 5; k++) { glowRing(110 + k * 185, 200 + Math.sin(k * 1.9) * 50, 90, 'rgba(255,255,255,A)', 0.12); planet(110 + k * 185, 200 + Math.sin(k * 1.9) * 50, 40, CS2[k][0], CS2[k][1], k === 2 || k === 3); }
      glowRing(480, 560, 300, 'rgba(255,220,130,A)', 0.3); ctx.fillStyle = '#0a0812'; ctx.beginPath(); ctx.moveTo(0, 600); ctx.quadraticCurveTo(480, 520, 960, 600); ctx.lineTo(960, 640); ctx.lineTo(0, 640); ctx.fill(); hero(480, 540, 1.8, 1);
    } else if (i === 62) {
      sky('#05030c', '#2a1440'); stars(130, 0.9); glowRing(480, 290, 300, 'rgba(255,210,63,A)', 0.3 + Math.sin(T * 2) * 0.05); ctx.textAlign = 'center'; ctx.fillStyle = '#ffd23f'; ctx.font = 'bold 56px ' + FONT; ctx.globalAlpha = clamp(t / 1.5, 0, 1); ctx.fillText('YOU SAVED', W / 2, 240); ctx.fillText('THE UNIVERSE', W / 2, 310); ctx.font = 'bold 26px ' + FONT; ctx.fillStyle = '#ffe9c0'; ctx.globalAlpha = clamp((t - 2.5) / 1.5, 0, 1); ctx.fillText('~ THE END ~', W / 2, 380); ctx.globalAlpha = 1;
    }
    ctx.restore();
    // caption
    ctx.fillStyle = 'rgba(0,0,0,.72)'; ctx.fillRect(0, 528, W, 112); const n = Math.floor(clamp((t - 0.5) * 34, 0, sc.t.length)), txt = sc.t.slice(0, n); ctx.font = 'bold 21px ' + FONT; ctx.textAlign = 'center'; ctx.fillStyle = '#ffe9c0';
    const words = txt.split(' '), lines = []; let cur = ''; for (const w of words) { if (ctx.measureText(cur + ' ' + w).width > 840 && cur) { lines.push(cur); cur = w; } else cur = cur ? cur + ' ' + w : w; } lines.push(cur); lines.forEach((l, k) => ctx.fillText(l, W / 2, 568 + k * 28));
    ctx.font = '13px ' + FONT; ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.textAlign = 'right'; ctx.fillText('Space / click: next    Esc: skip story', W - 16, 24); ctx.textAlign = 'left'; for (let k = 0; k < STORY.length; k++) { ctx.fillStyle = k <= storyI ? '#ffd23f' : 'rgba(255,255,255,.25)'; ctx.fillRect(16 + k * 18, 16, 12, 5); }
    const fade = Math.max(1 - t / 0.6, (t - (sc.d - 0.6)) / 0.6, 0); if (fade > 0) { ctx.fillStyle = 'rgba(0,0,0,' + clamp(fade, 0, 1) + ')'; ctx.fillRect(0, 0, W, H); }
    ctx.restore();
  }
  function glowRing(x, y, r, c, a) { const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, c.replace('A', a)); g.addColorStop(1, c.replace('A', 0)); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); }
  function hexA(h) { const n = parseInt(h.slice(1), 16); return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',A)'; }

  function draw() {
    if (state === S.STORY) { drawStory(); return; }
    ctx.save(); ctx.clearRect(0, 0, W, H);
    if (shake > 0) ctx.translate(rnd(-shake, shake) * 0.4, rnd(-shake, shake) * 0.4);
    if (state === S.TITLE) {
      ctx.drawImage(bgHub, 0, 0); drawTorch(150, 170); drawTorch(830, 528); ctx.restore();
      player.x = 300; player.y = 400; drawDark();
      overlay('BOSS RUSH', 'You wake up in a cave. Thirty bosses stand between you and freedom.', []);
      for (let i = 0; i < 3; i++) { const x = SLOT_X + i * 240, y = SLOT_Y, sv = slots[i]; ctx.fillStyle = 'rgba(40,32,26,.95)'; ctx.fillRect(x, y, 220, 120); ctx.strokeStyle = eraseArm === i ? '#ff6b7a' : '#ffb347'; ctx.lineWidth = 3; ctx.strokeRect(x, y, 220, 120); ctx.textAlign = 'center'; ctx.fillStyle = '#ffe9a8'; ctx.font = 'bold 18px ' + FONT; ctx.fillText('[' + (i + 1) + '] SAVE ' + (i + 1), x + 110, y + 30); ctx.fillStyle = '#d9cfc4'; ctx.font = '14px ' + FONT;
        if (eraseArm === i) { ctx.fillStyle = '#ff6b7a'; ctx.fillText('Erase this save?', x + 110, y + 66); ctx.fillText('Shift+click again', x + 110, y + 88); }
        else if (sv) { ctx.fillText('Bosses beaten: ' + sv.idx + '/' + BOSSES.length, x + 110, y + 62); ctx.fillText('Next: ' + BOSS_NAMES[sv.idx], x + 110, y + 84); ctx.fillText('Time ' + fmtTime(sv.t || 0), x + 110, y + 104); }
        else { ctx.fillText('Empty', x + 110, y + 66); ctx.fillText('Click for new game', x + 110, y + 90); } }
      ctx.textAlign = 'center'; ctx.fillStyle = '#d9cfc4'; ctx.font = '15px ' + FONT; ctx.fillText('Click a save (or press 1 / 2 / 3). Progress saves automatically at camp.', W / 2, 500); ctx.fillText('Shift+click (or Shift+1/2/3) twice erases a save.', W / 2, 524); ctx.fillText('WASD move - mouse aim/shoot - Space/Shift dash' + (best ? '     Best: ' + best + '/' + BOSSES.length : ''), W / 2, 556);
      return;
    }
    if (state === S.HUB) drawHub(); else drawFight();
    ctx.restore();
    if (state !== S.UPGRADE && state !== S.WIN) drawDark(); else drawDark();
    drawHUD(); if (state === S.FIGHT && boss && boss.dying) drawSpeech();
    if (state === S.UPGRADE) {
      overlay('BOSS DEFEATED', 'Choose an upgrade', []);
      offered.forEach((u, i) => { const x = 140 + i * 260, y = 320; ctx.fillStyle = 'rgba(40,32,26,.95)'; ctx.fillRect(x, y, 220, 170); ctx.strokeStyle = '#ffb347'; ctx.lineWidth = 3; ctx.strokeRect(x, y, 220, 170); ctx.fillStyle = '#ffe9a8'; ctx.font = 'bold 18px ' + FONT; ctx.textAlign = 'center'; ctx.fillText('[' + (i + 1) + '] ' + u.name, x + 110, y + 40); ctx.fillStyle = '#d9cfc4'; ctx.font = '14px ' + FONT; wrap(u.desc, x + 110, y + 80, 190, 20); });
    } else if (state === S.WIN) {
      if (win2) overlay('YOU SAVED THE UNIVERSE!', 'The World Eater is no more. All 55 bosses are down.', ['Time: ' + fmtTime(runTime), '', 'Press Enter to play again'], '#9dff9d'); else overlay('YOU SAVED THE WORLD!', 'Zeus has fallen... but a cosmic portal has torn open in the sky.', ['Time: ' + fmtTime(runTime), '', 'Press Enter: enter the portal (Part Two)', 'Press T: back to the title (progress is saved)'], '#9dff9d');
    } else if (state === S.OVER) {
      if (bossMode) overlay(overTitle, 'Boss mode (admin)', ['Press R to play again', 'Press N to leave boss mode'], overTitle.startsWith('THE HERO') ? '#9dff9d' : '#ff6b7a'); else overlay(overTitle, boss ? 'Defeated by ' + boss.name : '', ['Press R to retry this boss (upgrades kept)', 'Press N for the save screen']);
    }
    if (paused) overlay('PAUSED', 'Press P to resume', []);
  }
  function wrap(text, x, y, maxW, lh) { const words = text.split(' '); let line = ''; for (const w of words) { const t = line ? line + ' ' + w : w; if (ctx.measureText(t).width > maxW && line) { ctx.fillText(line, x, y); line = w; y += lh; } else line = t; } ctx.fillText(line, x, y); }

  // ------------------------------------------------------------------ input
  function toCanvas(e) { const r = canvas.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H }; }
  canvas.addEventListener('mousemove', e => { const p = toCanvas(e); mouse.x = p.x; mouse.y = p.y; });
  canvas.addEventListener('mousedown', e => {
    const p = toCanvas(e); mouse.x = p.x; mouse.y = p.y; mouse.down = true; blip(1, 0.01, 'sine', 0.0001);
    if (state === S.STORY) { nextStory(); return; }
    if (state === S.TITLE) { for (let i = 0; i < 3; i++) if (p.x > SLOT_X + i * 240 && p.x < SLOT_X + i * 240 + 220 && p.y > SLOT_Y && p.y < SLOT_Y + 120) pickSlot(i, e.shiftKey); return; }
    if (state === S.UPGRADE) offered.forEach((u, i) => { const x = 140 + i * 260; if (p.x > x && p.x < x + 220 && p.y > 320 && p.y < 490) chooseUpgrade(i); });
    if (state === S.WIN) { if (win2) toTitle(true); else startStory('p2'); return; }
  });
  window.addEventListener('mouseup', () => { mouse.down = false; });
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  window.addEventListener('blur', () => { keys.clear(); mouse.down = false; });
  window.addEventListener('keydown', e => {
    if (e.target && e.target.tagName === 'INPUT') return;
    if (admin.open) return;
    if (state === S.STORY) { if (e.code === 'Escape' || e.code === 'KeyS') finishStory(); else if (e.code === 'Space' || e.code === 'Enter' || e.code === 'ArrowRight') { nextStory(); e.preventDefault(); } return; }
    if ((e.code === 'Space' || e.code === 'Enter') && state === S.FIGHT && boss && boss.dying && deadT > 1.7) { const full = 1.6 + boss.line.length / 38; deadT = deadT < full ? full : Math.max(deadT, boss.deadEnd); }
    keys.add(e.code); if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    if (e.repeat) return;
    if (e.code === 'KeyM') muted = !muted;
    if (e.code === 'KeyP' && (state === S.HUB || state === S.FIGHT)) paused = !paused;
    if (state === S.TITLE) { if (['Digit1', 'Digit2', 'Digit3'].includes(e.code)) pickSlot(+e.code.slice(5) - 1, e.shiftKey); else if (e.code === 'Enter' || e.code === 'Space') { const k = slots.findIndex(x => x); pickSlot(k < 0 ? 0 : k); } }
    else if (state === S.UPGRADE && ['Digit1', 'Digit2', 'Digit3'].includes(e.code)) chooseUpgrade(+e.code.slice(5) - 1);
    else if (state === S.WIN) { if (e.code === 'Enter') { if (win2) toTitle(true); else startStory('p2'); } else if (e.code === 'KeyT' && !win2) toTitle(false); }
    else if (state === S.OVER) { if (bossMode) { if (e.code === 'KeyR') startBossMode(); if (e.code === 'KeyN') { toTitle(false); } } else { if (e.code === 'KeyR') { player.hp = player.maxHp; player.inv = 1; startFight(); } if (e.code === 'KeyN') toTitle(false); } }
  });
  window.addEventListener('keyup', e => keys.delete(e.code));


  // ------------------------------------------------------------------ admin panel (password gated)
  const ADMIN_PASSWORD = 'thisgameisgoated';
  (function initAdmin() {
    const lbtn = document.createElement('button'); lbtn.id = 'laserBtn'; document.body.append(lbtn);
    lbtn.addEventListener('click', () => { if (player && player.laserReady && bossIdx < 30) { player.laserOn = !player.laserOn; toastMsg(player.laserOn ? 'LASER GUN equipped!' : 'Normal gun equipped'); } lbtn.blur(); });
    let lbState = '';
    setInterval(() => { if (player) lzCheck(player); const ok = !!(player && player.laserReady && bossIdx < 30 && (state === S.FIGHT || state === S.HUB || state === S.UPGRADE)), t = ok ? (player.laserOn ? 'LASER GUN: ON (click to switch back)' : 'GET LASER GUN') : ''; if (t !== lbState) { lbState = t; lbtn.style.display = ok ? 'block' : 'none'; lbtn.textContent = t; lbtn.className = ok && player.laserOn ? 'on' : ''; } }, 100);
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
      g.append(row(player.maxed ? 'Maxed Out Gun: ON' : 'Maxed Out Gun', toggleMaxedGun, player.maxed), row(player.ultra ? 'Ultra Gun: ON' : 'Get Ultra Gun', () => { player.ultra = !player.ultra; toastMsg(player.ultra ? 'ULTRA GUN equipped' : 'Ultra gun off'); }, player.ultra), row(admin.onehit ? 'One-hit kills: ON' : 'One-hit kills', () => { admin.onehit = !admin.onehit; }, admin.onehit));
      g = sec('Free upgrades');
      for (const u of UPGRADES) g.append(row(u.name, () => { u.apply(player); toastMsg('Free upgrade: ' + u.name); }));
      g = sec('Free underworld upgrades');
      for (const u of UPGRADES2) g.append(row(u.name, () => { u.apply(player); toastMsg('Free upgrade: ' + u.name); }));
      g = sec('Free acid upgrades');
      for (const u of UPGRADES3) g.append(row(u.name, () => { u.apply(player); toastMsg('Free upgrade: ' + u.name); }));
      g = sec('Free god upgrades');
      for (const u of UPGRADES6) g.append(row(u.name, () => { u.apply(player); toastMsg('Free upgrade: ' + u.name); }));
      g = sec('Free space upgrades');
      for (const u of LASER_UPG) g.append(row(u.name + ' (laser)', () => { u.apply(player); toastMsg('Free upgrade: ' + u.name); }));
      for (const u of UPGRADES7) g.append(row(u.name, () => { u.apply(player); toastMsg('Free upgrade: ' + u.name); }));
      g = sec('Free shadow upgrades');
      for (const u of UPGRADES5) g.append(row(u.name, () => { u.apply(player); toastMsg('Free upgrade: ' + u.name); }));
      g = sec('Free dreamland upgrades');
      for (const u of UPGRADES4) g.append(row(u.name, () => { u.apply(player); toastMsg('Free upgrade: ' + u.name); }));
      g.append(row('ALL upgrades x3', () => { for (let k = 0; k < 3; k++) for (const u of UPGRADES.concat(UPGRADES2, UPGRADES3, UPGRADES4, UPGRADES5, UPGRADES6, UPGRADES7)) u.apply(player); player.hp = player.maxHp; }));
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
  player = newPlayer(); pBul = []; eBul = []; hazards = []; parts = []; minions = []; pillars = []; bgHub = makeBG('hub'); bgArena = makeBG('arena'); bgHubU = makeBG('hub', 1); bgArenaU = makeBG('arena', 1); bgHubA = makeBG('hub', 2); bgArenaA = makeBG('arena', 2); bgHubD = makeBG('hub', 3); bgArenaD = makeBG('arena', 3); bgHubS = makeBG('hub', 4); bgArenaS = makeBG('arena', 4); bgHubG = makeBG('hub', 5); bgArenaG = makeBG('arena', 5);
  let last = performance.now();
  function frame(now) { const dt = Math.min(0.05, (now - last) / 1000); last = now; update(dt); draw(); requestAnimationFrame(frame); }
  requestAnimationFrame(frame);

  if (location.hash === '#debug') window.__br = { music: () => ({ id: mus.id, step: mus.step, ctx: actx && actx.state }), slots: () => slots, pick: pickSlot, title: toTitle, st: () => ({ state, bossIdx, hp: player.hp, boss: boss && { hp: boss.hp, st: boss.state } }), player: () => player, boss: () => boss, step: dt => update(dt), startBoss: i => { if (!player) player = newPlayer(); bossIdx = i; startFight(); }, enterHub, newRun, keys, mouse, hazards: () => hazards, minions: () => minions, offered: () => offered, choose: chooseUpgrade, begin: () => { introT = 0; } };
})();
