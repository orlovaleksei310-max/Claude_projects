// Dirt Bike Ride: third-person 3D dirt bike on an endless winding road (Three.js r159, no build step).
(() => {
  'use strict';
  const $ = id => document.getElementById(id);

  // ---------- renderer / scene ----------
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  $('game').appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const SKY = 0x8cc2ef;
  scene.background = new THREE.Color(SKY);
  scene.fog = new THREE.Fog(SKY, 90, 330);
  const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 500);
  scene.add(new THREE.HemisphereLight(0xdfeeff, 0x8a7a55, 0.95));
  const sun = new THREE.DirectionalLight(0xfff1d0, 0.9); sun.position.set(40, 80, 30); scene.add(sun);
  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
  });

  const mat = (c, o) => new THREE.MeshLambertMaterial(Object.assign({ color: c }, o));
  const std = (c, o) => new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.6, metalness: 0.2 }, o));

  // ---------- the road: a winding centre line stored every 2 m ----------
  const STEP = 2, ROAD_W = 9;
  const curvature = s => 0.011 * Math.sin(s * 0.0049) + 0.007 * Math.sin(s * 0.0131 + 1.3) + 0.003 * Math.sin(s * 0.031 + 0.4);
  const pts = [{ x: 0, z: 0, th: 0 }];
  function extend(toS) {
    while (pts.length * STEP <= toS + STEP) {
      const i = pts.length, p = pts[i - 1], s = (i - 1) * STEP;
      const th = p.th + curvature(s) * STEP;
      pts.push({ x: p.x + Math.sin(th) * STEP, z: p.z - Math.cos(th) * STEP, th });
    }
  }
  function roadAt(s) {                                    // position + heading of the centre line at distance s
    if (s < 0) s = 0;
    extend(s + STEP * 3);
    const f = s / STEP, i = Math.floor(f), t = f - i, a = pts[i], b = pts[i + 1];
    return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, th: a.th + (b.th - a.th) * t };
  }
  const worldPos = (s, d) => { const r = roadAt(s); return { x: r.x + Math.cos(r.th) * d, z: r.z + Math.sin(r.th) * d, th: r.th }; };

  // road ribbons (rebuilt around the bike every frame): asphalt, shoulders, dashed centre line
  const SEGS = 150, SEG_LEN = 3;
  function ribbon(color, offsets, y) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SEGS * 2 * 3), 3));
    const idx = [];
    for (let i = 0; i < SEGS - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    g.setIndex(idx);
    const nrm = new Float32Array(SEGS * 2 * 3); for (let i = 0; i < SEGS * 2; i++) nrm[i * 3 + 1] = 1;
    g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    const m = new THREE.Mesh(g, mat(color, { side: THREE.DoubleSide })); m.frustumCulled = false; m.userData = { offsets, y };
    scene.add(m); return m;
  }
  const shoulder = ribbon(0xcaa675, [-ROAD_W / 2 - 3, ROAD_W / 2 + 3], 0.01);
  const asphalt = ribbon(0x6b6f7a, [-ROAD_W / 2, ROAD_W / 2], 0.03);
  const edgeL = ribbon(0xf2f2f2, [-ROAD_W / 2 + 0.25, -ROAD_W / 2 + 0.55], 0.05);
  const edgeR = ribbon(0xf2f2f2, [ROAD_W / 2 - 0.55, ROAD_W / 2 - 0.25], 0.05);
  const dashes = [];
  for (let i = 0; i < 36; i++) { const m = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 3), mat(0xffd23f)); m.rotation.x = -Math.PI / 2; m.position.y = 0.05; scene.add(m); dashes.push(m); }
  function updateRoad(s0) {
    const start = Math.floor((s0 - 30) / SEG_LEN) * SEG_LEN;
    for (const m of [shoulder, asphalt, edgeL, edgeR]) {
      const pos = m.geometry.attributes.position, [o1, o2] = m.userData.offsets;
      for (let i = 0; i < SEGS; i++) {
        const w1 = worldPos(Math.max(0, start + i * SEG_LEN), o1), w2 = worldPos(Math.max(0, start + i * SEG_LEN), o2);
        pos.setXYZ(i * 2, w1.x, m.userData.y, w1.z); pos.setXYZ(i * 2 + 1, w2.x, m.userData.y, w2.z);
      }
      pos.needsUpdate = true;
    }
    const first = Math.ceil((s0 - 20) / 9) * 9;
    dashes.forEach((m, i) => {
      const w = worldPos(first + i * 9 + 1.5, 0);
      m.position.x = w.x; m.position.z = w.z; m.rotation.z = w.th;   // plane lies flat: z rotation = heading
    });
  }

  // ground that follows the bike (texture slides so you feel the speed)
  const gtex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
    g.fillStyle = '#7d9a52'; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 1800; i++) { g.fillStyle = ['#6f8c47', '#8aa85d', '#9a8a5a', '#74904b'][i % 4]; g.fillRect(Math.random() * 256, Math.random() * 256, 2 + Math.random() * 5, 2 + Math.random() * 5); }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(40, 40); return t;
  })();
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(700, 700), new THREE.MeshLambertMaterial({ map: gtex }));
  ground.rotation.x = -Math.PI / 2; scene.add(ground);

  // ---------- scenery and obstacles, generated per 30 m cell from a seeded random ----------
  const CELL = 30;
  const rng = seed => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const geo = {
    trunk: new THREE.CylinderGeometry(0.25, 0.35, 2.2, 6), cone: new THREE.ConeGeometry(1.6, 4.2, 7),
    rock: new THREE.DodecahedronGeometry(0.85, 0), log: new THREE.CylinderGeometry(0.42, 0.42, 5.2, 8),
    bush: new THREE.SphereGeometry(0.9, 7, 6), cactus: new THREE.CylinderGeometry(0.3, 0.3, 2.6, 6)
  };
  const mats = { trunk: mat(0x6b4a2b), cone: mat(0x2f6b3a), cone2: mat(0x3d7d3f), rock: mat(0x8d8f94), log: mat(0x7a5230), bush: mat(0x4d7a3a) };
  let ramps = [];                                        // active ramps (for the physics)
  let obstacles = [];                                    // active obstacles
  const cells = new Map();
  function ramp(len, w, h) {
    const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.lineTo(len, 0); sh.lineTo(len, h); sh.lineTo(0, 0);
    const g = new THREE.ExtrudeGeometry(sh, { depth: w, bevelEnabled: false }); g.translate(0, 0, -w / 2); return g;
  }
  const rampGeo = ramp(7, 4.6, 1.7);
  function buildCell(k) {
    const r = rng(k * 7919 + 13), group = new THREE.Group(), list = { ramps: [], obs: [] };
    const s0 = k * CELL;
    for (let i = 0; i < 9; i++) {                         // trees, bushes and rocks along both sides
      const side = r() < 0.5 ? -1 : 1, d = side * (ROAD_W / 2 + 5 + r() * 38), s = s0 + r() * CELL, w = worldPos(s, d);
      const kind = r();
      if (kind < 0.62) {
        const sc = 0.8 + r() * 1.1, t = new THREE.Mesh(geo.trunk, mats.trunk), c = new THREE.Mesh(geo.cone, r() < 0.5 ? mats.cone : mats.cone2);
        t.position.set(w.x, 1.1 * sc, w.z); t.scale.setScalar(sc); c.position.set(w.x, (2.2 + 2.0) * sc, w.z); c.scale.setScalar(sc);
        group.add(t, c);
      } else if (kind < 0.82) {
        const b = new THREE.Mesh(geo.bush, mats.bush); b.position.set(w.x, 0.5, w.z); b.scale.set(1 + r(), 0.8, 1 + r()); group.add(b);
      } else {
        const m = new THREE.Mesh(geo.rock, mats.rock); m.position.set(w.x, 0.5, w.z); m.scale.setScalar(0.8 + r() * 2.2); m.rotation.set(r() * 3, r() * 3, 0); group.add(m);
      }
    }
    if (k >= 4) {                                         // nothing on the first 120 m
      const roll = r();
      if (roll < 0.2) {                                    // a ramp
        const d = (r() - 0.5) * 4, s = s0 + 6 + r() * 10, w = worldPos(s, d), m = new THREE.Mesh(rampGeo, mat(0xc99a5b));
        m.position.set(w.x, 0, w.z); m.rotation.y = Math.PI / 2 - w.th; group.add(m);
        const edge = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, 4.6), mat(0xffffff)); edge.position.set(w.x, 1.72, w.z); edge.rotation.y = Math.PI / 2 - w.th;
        const ax = Math.sin(w.th) * 7, az = -Math.cos(w.th) * 7; edge.position.set(w.x + ax, 1.72, w.z + az); group.add(edge);
        list.ramps.push({ s, d, len: 7, w: 4.6, h: 1.7 });
      } else if (roll < 0.75) {                            // rocks / logs on the road
        const n = 1 + (r() < 0.35 ? 1 : 0);
        for (let i = 0; i < n; i++) {
          const d = (r() - 0.5) * (ROAD_W - 1.5), s = s0 + 4 + r() * 22, w = worldPos(s, d), log = r() < 0.4;
          const m = new THREE.Mesh(log ? geo.log : geo.rock, log ? mats.log : mats.rock);
          if (log) { m.rotation.z = Math.PI / 2; m.rotation.y = -w.th; m.position.set(w.x, 0.42, w.z); }
          else { m.position.set(w.x, 0.55, w.z); m.scale.setScalar(0.8 + r() * 0.5); m.rotation.set(r() * 3, r() * 3, 0); }
          group.add(m);
          list.obs.push({ s, d, rs: log ? 0.5 : 0.8, rd: log ? 2.4 : 0.8 });
        }
      }
    }
    scene.add(group); return { group, list };
  }
  function updateCells(s0) {
    const lo = Math.floor((s0 - 40) / CELL), hi = Math.floor((s0 + 300) / CELL);
    for (const [k, c] of cells) if (k < lo || k > hi) { scene.remove(c.group); cells.delete(k); }
    for (let k = Math.max(0, lo); k <= hi; k++) if (!cells.has(k)) cells.set(k, buildCell(k));
    ramps = []; obstacles = [];
    for (const c of cells.values()) { ramps.push(...c.list.ramps); obstacles.push(...c.list.obs); }
  }

  // ---------- the bike and the rider ----------
  const bike = new THREE.Group(), lean = new THREE.Group(), body = new THREE.Group();
  bike.add(lean); lean.add(body);
  const wheels = [];
  function wheel(z) {
    const g = new THREE.Group();
    const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.2, 18), std(0x1c1c1f, { roughness: 0.95 }));
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.22, 10), std(0xb8b8c0, { metalness: 0.7 }));
    const knob = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.06, 0.12), mat(0x111111)); knob.position.y = 0.48;
    g.add(tire, hub, knob); g.rotation.z = Math.PI / 2; g.position.set(0, 0.46, z);
    const holder = new THREE.Group(); holder.add(g); wheels.push(g); return holder;
  }
  const front = wheel(-0.95), rear = wheel(0.9);
  body.add(front, rear);
  const orange = std(0xff6a13, { roughness: 0.4 }), dark = std(0x2a2a30), metal = std(0xb8b8c0, { metalness: 0.8, roughness: 0.3 });
  const add = (geom, m, x, y, z, rx = 0) => { const o = new THREE.Mesh(geom, m); o.position.set(x, y, z); o.rotation.x = rx; body.add(o); return o; };
  add(new THREE.BoxGeometry(0.26, 0.4, 1.2), dark, 0, 0.78, 0.15);                 // engine block
  add(new THREE.BoxGeometry(0.3, 0.3, 0.7), orange, 0, 1.1, -0.2);                  // tank
  add(new THREE.BoxGeometry(0.3, 0.14, 0.85), dark, 0, 1.2, 0.5);                   // seat
  add(new THREE.BoxGeometry(0.26, 0.1, 0.9), orange, 0, 0.98, 1.05, 0.25);          // rear fender
  add(new THREE.CylinderGeometry(0.035, 0.035, 1.25, 6), metal, 0.1, 0.95, -0.85, -0.38);   // fork
  add(new THREE.CylinderGeometry(0.035, 0.035, 1.25, 6), metal, -0.1, 0.95, -0.85, -0.38);
  add(new THREE.BoxGeometry(0.3, 0.07, 0.5), orange, 0, 1.15, -1.18, -0.1);         // front fender
  const bar = add(new THREE.CylinderGeometry(0.03, 0.03, 0.85, 6), dark, 0, 1.5, -0.62); bar.rotation.z = Math.PI / 2;
  add(new THREE.CylinderGeometry(0.05, 0.05, 0.9, 6), metal, 0.18, 0.5, 0.75, Math.PI / 2 - 0.05).rotation.z = 0;   // exhaust
  add(new THREE.BoxGeometry(0.1, 0.06, 0.8), dark, 0, 0.8, 0.5, -0.2);               // swing arm
  const skin = mat(0xe3b58c), jersey = mat(0x1d6fe0), pants = mat(0x222a3a), helm = mat(0xf2f2f2);
  const rider = new THREE.Group(); body.add(rider);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.62, 0.3), jersey); torso.position.set(0, 1.9, 0.0); torso.rotation.x = -0.45; rider.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), helm); head.position.set(0, 2.32, -0.2); rider.add(head);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.1, 0.12), mat(0x111b33)); visor.position.set(0, 2.3, -0.38); rider.add(visor);
  for (const sx of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.75), jersey); arm.position.set(sx * 0.3, 1.78, -0.42); arm.rotation.x = 0.3; rider.add(arm);
    const glove = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.14), mat(0x111111)); glove.position.set(sx * 0.4, 1.58, -0.68); rider.add(glove);
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.7, 0.2), pants); leg.position.set(sx * 0.28, 1.3, 0.2); leg.rotation.x = 0.45; rider.add(leg);
    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.34), mat(0x111111)); boot.position.set(sx * 0.3, 0.88, 0.18); rider.add(boot);
  }
  scene.add(bike);
  const blob = new THREE.Mesh(new THREE.CircleGeometry(0.9, 16), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35 }));
  blob.rotation.x = -Math.PI / 2; scene.add(blob);

  // dust puffs
  const dust = [];
  for (let i = 0; i < 36; i++) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), new THREE.MeshBasicMaterial({ color: 0xc8b48a, transparent: true, opacity: 0 })); m.visible = false; scene.add(m); dust.push({ m, life: 0, v: new THREE.Vector3() }); }
  let dustI = 0;
  function puff(x, y, z, vx, vy, vz) {
    const d = dust[dustI++ % dust.length]; d.life = 0.7; d.m.visible = true; d.m.position.set(x, y, z); d.v.set(vx, vy, vz); d.m.scale.setScalar(0.6);
  }

  // ---------- state ----------
  const MAX_SPEED = 34, NITRO_SPEED = 50;
  const st = { s: 0, d: 0, y: 0, vy: 0, speed: 0, yaw: 0, lat: 0, air: false, airT: 0, flip: 0, flipping: false, crash: 0, nitro: 100, best: 0, started: false, over: 0, roll: 0, shake: 0, camYaw: 0 };
  try { st.best = parseInt(localStorage.getItem('dirtbike-best') || '0', 10) || 0; } catch (e) { /* storage blocked */ }
  const keys = {};
  let muted = false;

  // ---------- audio ----------
  let actx = null, eng = null, engGain = null;
  function startAudio() {
    if (actx) return;
    try {
      actx = new (window.AudioContext || window.webkitAudioContext)();
      eng = actx.createOscillator(); eng.type = 'sawtooth'; engGain = actx.createGain(); engGain.gain.value = 0;
      const lp = actx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700;
      eng.connect(lp); lp.connect(engGain); engGain.connect(actx.destination); eng.start();
    } catch (e) { actx = null; }
  }
  function blip(f, d, type, v) {
    if (!actx || muted) return;
    const o = actx.createOscillator(), g = actx.createGain(); o.type = type || 'square'; o.frequency.value = f; g.gain.value = v || 0.05;
    g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + d); o.connect(g); g.connect(actx.destination); o.start(); o.stop(actx.currentTime + d);
  }

  // ---------- UI ----------
  let toastT = 0;
  function toast(t, d) { const el = $('toast'); el.textContent = t; el.classList.add('show'); toastT = d || 1.4; }
  const flash = (a) => { $('flash').style.opacity = a; };
  $('bestv').textContent = st.best;

  function begin() { startAudio(); if (actx && actx.state === 'suspended') actx.resume(); st.started = true; $('start').classList.add('hidden'); }
  $('start').addEventListener('click', begin);
  function restart() {
    Object.assign(st, { dist: 0, bonus: 0, s: 0, d: 0, y: 0, vy: 0, speed: 0, yaw: 0, lat: 0, air: false, airT: 0, flip: 0, flipping: false, crash: 0, nitro: 100, roll: 0, over: 0 });
    st.camYaw = 0; toast('GO!', 1);
  }
  window.addEventListener('keydown', e => {
    keys[e.code] = true;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    if (!st.started) { if (e.code === 'Enter' || e.code === 'Space') begin(); return; }
    if (e.code === 'KeyR') restart();
    if (e.code === 'KeyM') { muted = !muted; toast(muted ? 'ENGINE MUTED' : 'ENGINE ON', 1); }
    if (e.code === 'Space' && st.air && !st.flipping && st.crash <= 0) { st.flipping = true; st.flip = 0; }
  });
  window.addEventListener('keyup', e => { keys[e.code] = false; });
  window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

  // ---------- physics ----------
  function groundHeight(s, d) {                           // ramp surface under the bike
    for (const r of ramps) if (Math.abs(d - r.d) < r.w / 2 + 0.15 && s >= r.s && s <= r.s + r.len) return r.h * (s - r.s) / r.len;
    return 0;
  }
  function crash(why) {
    if (st.crash > 0) return;
    st.crash = 1.5; st.speed = 0; st.flipping = false; st.flip = 0; st.vy = Math.max(0, st.vy);
    toast(why, 1.4); flash(0.6); st.shake = 0.6; blip(110, 0.4, 'sawtooth', 0.09);
  }
  function step(dt) {
    const up = keys.KeyW || keys.ArrowUp, down = keys.KeyS || keys.ArrowDown;
    const steer = ((keys.KeyD || keys.ArrowRight) ? 1 : 0) - ((keys.KeyA || keys.ArrowLeft) ? 1 : 0);
    const boosting = !!keys.ShiftLeft || !!keys.ShiftRight;
    if (st.crash > 0) {
      st.crash -= dt; st.roll = Math.min(1.45, st.roll + dt * 4); st.speed = 0;
      if (st.crash <= 0) { st.roll = 0; st.d = Math.max(-2, Math.min(2, st.d)); st.yaw = 0; st.lat = 0; st.y = 0; st.vy = 0; st.air = false; }
      return;
    }
    const offroad = Math.abs(st.d) > ROAD_W / 2 + 0.2, rough = Math.abs(st.d) > ROAD_W / 2 + 3.2;
    let top = MAX_SPEED * (rough ? 0.62 : offroad ? 0.85 : 1), acc = up ? 15 : 0;
    if (boosting && st.nitro > 0 && up) { top = NITRO_SPEED * (rough ? 0.7 : 1); acc += 14; st.nitro = Math.max(0, st.nitro - 34 * dt); }
    else st.nitro = Math.min(100, st.nitro + 7 * dt);
    if (acc && st.speed < top) st.speed = Math.min(top, st.speed + acc * (1 - st.speed / (top + 8)) * dt * 1.6);
    if (st.speed > top) st.speed = Math.max(top, st.speed - 12 * dt);
    if (!up) st.speed = Math.max(0, st.speed - (down ? 0 : 0) - 3.2 * dt);
    if (down) st.speed = Math.max(0, st.speed - 30 * dt);
    if (st.air) st.speed = Math.max(0, st.speed - 0.4 * dt);
    // steering: the bike yaws toward the stick direction and slides across the road
    const grip = st.air ? 0.25 : 1, targetYaw = steer * 0.5 * Math.min(1, 0.3 + st.speed / 14) * grip;
    st.yaw += (targetYaw - st.yaw) * Math.min(1, 5.5 * dt);
    const curv = curvature(st.s);
    if (!st.air) st.lat += (-curv * st.speed * st.speed * 0.22 - st.lat * 1.8) * dt;   // the bend pushes you to the outside
    st.s += st.speed * Math.cos(st.yaw) * dt;
    st.d += (st.speed * Math.sin(st.yaw) + st.lat) * dt;
    const wall = ROAD_W / 2 + 22;
    if (Math.abs(st.d) > wall) { st.d = Math.sign(st.d) * wall; st.speed *= 1 - 1.5 * dt; st.lat = 0; if (st.speed > 12) { toast('Stay on the track!', 1); } }
    // vertical: ramps launch you into the air
    const gh = groundHeight(st.s, st.d);
    const TAU = Math.PI * 2;
    if (!st.air) {
      const prev = st.y;
      st.y = gh;
      if (prev > 1.0 && gh < prev - 0.3 && st.speed > 6) {          // flew off the end of a ramp
        st.air = true; st.airT = 0; st.vy = Math.max(4, st.speed * 0.28); st.y = prev; st.flip = 0; st.flipping = false;
      }
    }
    if (st.air) {
      st.airT += dt; st.vy -= 14 * dt; st.y += st.vy * dt;
      if (st.flipping) st.flip += dt * 8;
      if (st.y <= gh) {
        st.y = gh; st.air = false;
        if (st.flipping) {
          if (st.flip >= TAU - 0.9) { const n = Math.max(1, Math.round(st.flip / TAU)); addScore(100 * n); toast((n > 1 ? n + 'x ' : '') + 'FLIP! +' + 100 * n + ' m', 1.6); blip(880, 0.15); blip(1320, 0.2, 'square', 0.05); }
          else if (st.flip > 0.9) crash('BAD LANDING!');
        } else if (st.airT > 0.5) { addScore(Math.round(st.airT * 20)); toast('AIR TIME +' + Math.round(st.airT * 20) + ' m', 1.2); }
        st.flip = 0; st.flipping = false; st.vy = 0; st.shake = Math.max(st.shake, 0.25);
      }
    }
    // obstacles
    if (!st.air || st.y < 0.5) for (const o of obstacles) {
      if (Math.abs(st.s - o.s) < o.rs + 0.35 && Math.abs(st.d - o.d) < o.rd + 0.3 && st.y < 0.7) { crash('CRASH!'); break; }
    }
    st.shake = Math.max(0, st.shake - dt * 2);
    if (st.s > st.dist) st.dist = st.s;
  }
  st.dist = 0; st.bonus = 0;
  function addScore(n) { st.bonus += n; }
  const total = () => Math.floor(st.dist + st.bonus);

  // ---------- frame update ----------
  const clock = new THREE.Clock();
  let time = 0;
  function frame() {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, clock.getDelta()); time += dt;
    if (st.started) step(dt);
    const w = worldPos(st.s, st.d), th = w.th + st.yaw;
    // bike transform
    const steer = ((keys.KeyD || keys.ArrowRight) ? 1 : 0) - ((keys.KeyA || keys.ArrowLeft) ? 1 : 0);
    bike.position.set(w.x, st.y, w.z); bike.rotation.y = -th;
    const targetLean = st.crash > 0 ? st.roll : -steer * 0.38 * Math.min(1, st.speed / 12);
    lean.rotation.z += (targetLean - lean.rotation.z) * Math.min(1, 8 * dt);
    let pitch = 0;
    if (!st.crash) { if (st.air) pitch = st.flipping ? -st.flip : Math.max(-0.35, Math.min(0.35, -st.vy * 0.03)); else { const gh2 = groundHeight(st.s + 1, st.d) - groundHeight(st.s - 1, st.d); pitch = Math.atan2(gh2, 2); } }
    body.rotation.x += (pitch - body.rotation.x) * Math.min(1, st.flipping ? 1 : 12 * dt);
    if (st.flipping) body.rotation.x = -st.flip;
    body.position.y = Math.sin(time * 38) * 0.015 * Math.min(1, st.speed / 10) * (st.air ? 0 : 1) * (Math.abs(st.d) > ROAD_W / 2 + 0.2 ? 3 : 1);
    for (const g of wheels) g.rotation.x += st.speed * dt / 0.46;
    rider.rotation.x = st.crash > 0 ? 0.2 : -Math.min(0.3, st.speed / 120);
    blob.position.set(w.x, 0.07, w.z); blob.scale.setScalar(Math.max(0.4, 1 - st.y * 0.2));
    // ground + road follow the bike
    ground.position.set(w.x, 0, w.z); gtex.offset.set(w.x / 17.5, -w.z / 17.5);
    ground.position.y = -0.02;
    updateRoad(st.s); updateCells(st.s);
    // dust
    if (st.started && st.crash <= 0 && !st.air && st.speed > 3 && (Math.abs(st.d) > ROAD_W / 2 + 0.2 || Math.random() < 0.15)) {
      const bx = w.x - Math.sin(th) * 1.0, bz = w.z + Math.cos(th) * 1.0;
      puff(bx, 0.2, bz, (Math.random() - 0.5) * 1.5, 0.8 + Math.random(), (Math.random() - 0.5) * 1.5);
    }
    for (const d of dust) { if (d.life <= 0) { d.m.visible = false; continue; } d.life -= dt; d.m.position.addScaledVector(d.v, dt); d.m.scale.addScalar(dt * 2.5); d.m.material.opacity = Math.max(0, d.life * 0.6); }
    // chase camera
    st.camYaw += (th - st.camYaw) * Math.min(1, 3.2 * dt);
    const back = 5.8 + st.speed * 0.03, height = 2.5 + st.y * 0.5;
    const cx = w.x - Math.sin(st.camYaw) * back, cz = w.z + Math.cos(st.camYaw) * back;
    const sh = st.shake * 0.25 + (Math.abs(st.d) > ROAD_W / 2 + 3.2 ? 0.03 : 0);
    camera.position.set(cx + (Math.random() - 0.5) * sh, height + st.y * 0.4 + (Math.random() - 0.5) * sh, cz + (Math.random() - 0.5) * sh);
    camera.lookAt(w.x + Math.sin(st.camYaw) * 6, 1.3 + st.y * 0.6, w.z - Math.cos(st.camYaw) * 6);
    const fov = 62 + Math.min(22, st.speed * 0.45); if (Math.abs(camera.fov - fov) > 0.1) { camera.fov += (fov - camera.fov) * Math.min(1, 4 * dt); camera.updateProjectionMatrix(); }
    // engine sound
    if (engGain && actx) { const f = 55 + st.speed * 3.2 + (keys.KeyW || keys.ArrowUp ? 18 : 0); eng.frequency.setTargetAtTime(f, actx.currentTime, 0.05); engGain.gain.setTargetAtTime(muted || !st.started ? 0 : 0.035 + st.speed * 0.0008, actx.currentTime, 0.08); }
    // HUD
    const score = total();
    $('distv').textContent = score;
    if (score > st.best) { st.best = score; $('bestv').textContent = st.best; if (Math.floor(time * 2) % 20 === 0) try { localStorage.setItem('dirtbike-best', String(st.best)); } catch (e) { /* ignore */ } }
    $('speed').textContent = Math.round(st.speed * 3.6);
    $('nitrobar').style.width = st.nitro + '%';
    if (toastT > 0) { toastT -= dt; if (toastT <= 0) $('toast').classList.remove('show'); }
    flash(Math.max(0, parseFloat($('flash').style.opacity || 0) - dt * 2));
    renderer.render(scene, camera);
  }
  window.addEventListener('beforeunload', () => { try { localStorage.setItem('dirtbike-best', String(st.best)); } catch (e) { /* ignore */ } });
  extend(400); updateRoad(0); updateCells(0);
  if (location.hash === '#debug') window.__db = { st, keys, step, begin, crash, obstacles: () => obstacles, ramps: () => ramps, worldPos, restart };
  frame();
})();
