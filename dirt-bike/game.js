// Dirt Bike Ride: third-person 3D dirt bike on an endless winding road (Three.js r159, no build step).
(() => {
  'use strict';
  const $ = id => document.getElementById(id);

  // ---------- renderer / scene ----------
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  $('game').appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const SKY = 0x8cc2ef;
  scene.background = new THREE.Color(SKY);
  scene.fog = new THREE.Fog(SKY, 90, 330);
  const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 500);
  scene.add(new THREE.HemisphereLight(0xdfeeff, 0x8a7a55, 0.95));
  const sun = new THREE.DirectionalLight(0xfff1d0, 0.9); sun.position.set(40, 80, 30); scene.add(sun);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04;
  Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 10, far: 200 }); scene.add(sun.target);
  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
  });

  const mat = (c, o) => new THREE.MeshLambertMaterial(Object.assign({ color: c }, o));
  const std = (c, o) => new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.6, metalness: 0.2 }, o));

  // ---------- the road: a winding centre line stored every 2 m ----------
  const STEP = 2, ROAD_W = 9;
  const HARD_DIST = 6000;                                 // distance at which the game is at full difficulty
  const hardness = s => Math.min(1, Math.max(0, s) / HARD_DIST);
  const levelOf = s => 1 + Math.min(11, Math.floor(Math.max(0, s) / 500));
  const curvature = s => (0.011 * Math.sin(s * 0.0049) + 0.007 * Math.sin(s * 0.0131 + 1.3) + 0.003 * Math.sin(s * 0.031 + 0.4)) * (1 + 0.9 * hardness(s));   // sharper bends later
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
    const m = new THREE.Mesh(g, mat(color, { side: THREE.DoubleSide })); m.frustumCulled = false; m.receiveShadow = true; m.userData = { offsets, y };
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
    g.fillStyle = '#e6e6e6'; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 1800; i++) { g.fillStyle = ['#d4d4d4', '#f2f2f2', '#c8c8c8', '#fafafa'][i % 4]; g.fillRect(Math.random() * 256, Math.random() * 256, 2 + Math.random() * 5, 2 + Math.random() * 5); }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(40, 40); return t;
  })();
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(700, 700), new THREE.MeshLambertMaterial({ map: gtex }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);

  // ---------- minimap: the road ahead, heading-up ----------
  const mapC = $('map'), mctx = mapC.getContext('2d'), MAP_R = 90, MAP_SZ = 200;
  mapC.width = mapC.height = MAP_SZ * 2; mapC.style.width = mapC.style.height = MAP_SZ + 'px';
  function drawMap(bikeW) {
    const c = mctx, S = MAP_SZ * 2, k = S / 2 / MAP_R * 1.0, th = roadAt(st.s).th, sn = Math.sin(th), cs = Math.cos(th), cx = S / 2, cy = S * 0.58;
    const P = (x, z) => { const dx = x - bikeW.x, dz = z - bikeW.z; return [cx + (dx * cs + dz * sn) * k, cy - (dx * sn - dz * cs) * k]; };
    c.clearRect(0, 0, S, S);
    c.save(); c.beginPath(); c.arc(S / 2, S / 2, S / 2 - 3, 0, 6.2832); c.clip();
    c.fillStyle = 'rgba(14, 22, 36, 0.62)'; c.fillRect(0, 0, S, S);
    const line = (from, to, w, col) => {
      c.beginPath(); let first = true;
      for (let q = from; q <= to; q += 4) { const r = roadAt(q), p = P(r.x, r.z); if (first) { c.moveTo(p[0], p[1]); first = false; } else c.lineTo(p[0], p[1]); }
      c.lineWidth = w; c.strokeStyle = col; c.lineCap = 'round'; c.lineJoin = 'round'; c.stroke();
    };
    const a = Math.max(0, st.s - MAP_R * 1.5), b = st.s + MAP_R * 1.4;
    line(a, b, 15, '#e9edf3'); line(a, b, 11, '#4a505c');
    c.setLineDash([8, 10]); line(a, b, 1.6, '#ffd23f'); c.setLineDash([]);
    for (const r of ramps) { if (r.s < a || r.s > b) continue; const p = worldPos(r.s + r.len / 2, r.d), q = P(p.x, p.z); c.fillStyle = '#3ddc84'; c.fillRect(q[0] - 4, q[1] - 4, 8, 8); }
    for (const o of obstacles) { if (o.s < a || o.s > b) continue; const p = worldPos(o.s, o.d), q = P(p.x, p.z); c.fillStyle = o.kind === 'crash' ? '#ff5252' : o.kind === 'ice' ? '#7fd8ff' : '#b5834a'; c.beginPath(); c.arc(q[0], q[1], 3.2, 0, 6.2832); c.fill(); }
    c.restore();
    c.beginPath(); c.arc(S / 2, S / 2, S / 2 - 3, 0, 6.2832); c.lineWidth = 3; c.strokeStyle = 'rgba(255,255,255,.6)'; c.stroke();
    const bw = P(bikeW.x, bikeW.z); c.save(); c.translate(bw[0], bw[1]); c.rotate(st.yaw); c.fillStyle = '#' + colorHex().toString(16).padStart(6, '0'); c.strokeStyle = '#fff'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(0, -11); c.lineTo(8, 8); c.lineTo(0, 4); c.lineTo(-8, 8); c.closePath(); c.fill(); c.stroke(); c.restore();
  }

  // ---------- towns: now and then in forest, desert and snow; riding in stops you at the bike shop ----------
  const TOWN_PERIOD = 450, TOWN_HALF = 36, townCache = new Map();
  function townAt(k) {
    if (townCache.has(k)) return townCache.get(k);
    let res = null;
    if (k >= 1) {
      const r = rng(k * 977 + 5);
      if (r() < 0.6) {
        const ts = k * TOWN_PERIOD + 150 + r() * 150, b0 = biomeIdAt(biomeIdxOfS(ts - 45)), b1 = biomeIdAt(biomeIdxOfS(ts + 45));
        if (b0 === b1 && (b0 === 'forest' || b0 === 'desert' || b0 === 'snow')) res = ts;
      }
    }
    townCache.set(k, res); return res;
  }
  const townNear = s => { const t = townAt(Math.floor(Math.max(0, s) / TOWN_PERIOD)); return t !== null && Math.abs(s - t) < TOWN_HALF ? t : null; };
  const signTex = txt => {
    const c = document.createElement('canvas'); c.width = 512; c.height = 128; const g = c.getContext('2d');
    g.fillStyle = '#243447'; g.fillRect(0, 0, 512, 128); g.strokeStyle = '#ffd23f'; g.lineWidth = 8; g.strokeRect(6, 6, 500, 116);
    g.fillStyle = '#fff'; g.font = 'bold 64px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(txt, 256, 68);
    const t = new THREE.CanvasTexture(c); t.anisotropy = 4; return t;
  };
  const townG = { house: new THREE.BoxGeometry(6, 3.6, 6), roof: new THREE.ConeGeometry(4.9, 2.2, 4), door: new THREE.BoxGeometry(1, 2, 0.1), shop: new THREE.BoxGeometry(8, 4.6, 11), shopRoof: new THREE.BoxGeometry(9, 0.5, 12), pole: new THREE.CylinderGeometry(0.2, 0.2, 7, 8), board: new THREE.BoxGeometry(ROAD_W + 4, 1.8, 0.3), sign: new THREE.PlaneGeometry(ROAD_W + 3.4, 1.5), shopSign: new THREE.PlaneGeometry(8, 2) };
  const townM = { walls: [mat(0xe8d9b8), mat(0xd9a77c), mat(0xb9c9d6), mat(0xe6c9c9), mat(0xcfd8b4)], roofRed: mat(0x9b3d2e), roofSnow: mat(0xf4f8fc), door: mat(0x5a3a22), shop: mat(0xf2f2f2), shopRoof: mat(0xd94a3a), pole: mat(0x4a4f58), board: mat(0x243447), townSign: new THREE.MeshBasicMaterial({ map: signTex('TOWN AHEAD') }), shopSign: new THREE.MeshBasicMaterial({ map: signTex('BIKE SHOP') }) };
  function addTown(group, r, s0, ts, bid) {
    const roofM = bid === 'snow' ? townM.roofSnow : townM.roofRed;
    for (const side of [-1, 1]) for (const off of [7, 22]) {
      const s = s0 + off + r() * 3; if (Math.abs(s - ts) < 10 && side === 1) continue;
      const w = worldPos(s, side * (ROAD_W / 2 + 9 + r() * 3));
      const h = new THREE.Mesh(townG.house, townM.walls[Math.floor(r() * 5)]); h.position.set(w.x, 1.8, w.z); h.rotation.y = -w.th; group.add(h);
      const rf = new THREE.Mesh(townG.roof, roofM); rf.position.set(w.x, 4.7, w.z); rf.rotation.y = -w.th + Math.PI / 4; group.add(rf);
    }
    if (ts >= s0 && ts < s0 + CELL) {                      // the bike shop, right beside the stopping point (local x = across the road, z = along it)
      const w = worldPos(ts, ROAD_W / 2 + 11);
      const b = new THREE.Mesh(townG.shop, townM.shop); b.position.set(w.x, 2.3, w.z); b.rotation.y = -w.th; group.add(b);
      const rf = new THREE.Mesh(townG.shopRoof, townM.shopRoof); rf.position.set(w.x, 4.85, w.z); rf.rotation.y = -w.th; group.add(rf);
      const q = worldPos(ts, ROAD_W / 2 + 6.9), sg = new THREE.Mesh(townG.shopSign, townM.shopSign); sg.position.set(q.x, 3.4, q.z); sg.rotation.y = -q.th - Math.PI / 2; group.add(sg);
    }
    const gs = ts - 33;
    if (gs >= s0 && gs < s0 + CELL) {                      // a sign over the road as you enter
      for (const side of [-1, 1]) { const w = worldPos(gs, side * (ROAD_W / 2 + 1.4)); const p = new THREE.Mesh(townG.pole, townM.pole); p.position.set(w.x, 3.5, w.z); group.add(p); }
      const w = worldPos(gs, 0), bd = new THREE.Mesh(townG.board, townM.board); bd.position.set(w.x, 6.6, w.z); bd.rotation.y = -w.th; group.add(bd);
      const sg = new THREE.Mesh(townG.sign, townM.townSign); sg.rotation.y = -w.th; sg.position.set(w.x - Math.sin(w.th) * 0.17, 6.6, w.z + Math.cos(w.th) * 0.17); group.add(sg);
    }
  }

  // ---------- scenery and obstacles, generated per 30 m cell from a seeded random ----------
  const CELL = 30;
  const rng = seed => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const geo = {
    trunk: new THREE.CylinderGeometry(0.25, 0.35, 2.2, 10), cone: new THREE.ConeGeometry(1.6, 4.2, 12),
    rock: new THREE.DodecahedronGeometry(0.85, 0), log: new THREE.CylinderGeometry(0.42, 0.42, 5.2, 8),
    bush: new THREE.SphereGeometry(0.9, 14, 10), cactus: new THREE.CylinderGeometry(0.3, 0.3, 2.6, 6)
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
  // ---------- biomes: every 1000 m the scenery changes, and no biome repeats ----------
  const BIOMES = {
    grass:  { name: 'GRASSLAND', hint: 'Rocks and logs',       sky: 0x8cc2ef, ground: 0x86a95a, shoulder: 0xc9aa78, road: 0x6b6f7a, fogN: 90, fogF: 330 },
    forest: { name: 'FOREST', hint: 'Stumps, fallen trees and slow mud',          sky: 0x86b3a4, ground: 0x4f7c3d, shoulder: 0x8a6e4a, road: 0x585c66, fogN: 55, fogF: 250 },
    desert: { name: 'DESERT', hint: 'Cacti and rolling tumbleweeds',          sky: 0xf1dba8, ground: 0xdfba78, shoulder: 0xeed3a0, road: 0x7a756d, fogN: 100, fogF: 340 },
    snow:   { name: 'SNOWY MOUNTAINS', hint: 'Slippery ice and snowmen', sky: 0xc6dbed, ground: 0xf2f6fb, shoulder: 0xd7e1ec, road: 0x4b5059, fogN: 45, fogF: 220 },
    city:   { name: 'CITY', hint: 'Stopped cars, barriers and crates',            sky: 0xa9bcd2, ground: 0x777c85, shoulder: 0x9ea2aa, road: 0x3c3f46, fogN: 80, fogF: 300 }
  };
  const BIOME_IDS = Object.keys(BIOMES);
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const order = ['grass'];                                // the first 1000 m are grassland
  let bag = shuffle(BIOME_IDS.filter(b => b !== 'grass'));
  function biomeIdAt(i) {                                 // a shuffled bag: all five biomes before any comes back
    while (order.length <= i) {
      if (!bag.length) { bag = shuffle([...BIOME_IDS]); if (bag[bag.length - 1] === order[order.length - 1]) { const t = bag[0]; bag[0] = bag[bag.length - 1]; bag[bag.length - 1] = t; } }
      order.push(bag.pop());
    }
    return order[i];
  }
  const BIOME_LEN = 1000, BLEND = 160;
  const biomeIdxOfS = s => Math.floor(Math.max(0, s) / BIOME_LEN);
  const mix = (a, b, t) => new THREE.Color(a).lerp(new THREE.Color(b), t);
  function paletteAt(s) {                                 // colours blend over the last 160 m before a border
    const i = biomeIdxOfS(s), a = BIOMES[biomeIdAt(i)], b = BIOMES[biomeIdAt(i + 1)];
    const t = Math.max(0, Math.min(1, (s - ((i + 1) * BIOME_LEN - BLEND)) / BLEND));
    return { a: biomeIdAt(i), b: biomeIdAt(i + 1), t, sky: mix(a.sky, b.sky, t), ground: mix(a.ground, b.ground, t), shoulder: mix(a.shoulder, b.shoulder, t), road: mix(a.road, b.road, t), fogN: a.fogN + (b.fogN - a.fogN) * t, fogF: a.fogF + (b.fogF - a.fogF) * t };
  }

  const bGeo = {
    canopy: new THREE.SphereGeometry(1.9, 14, 10), cone2: new THREE.ConeGeometry(1.2, 3.2, 12), cactus: new THREE.CylinderGeometry(0.32, 0.36, 3.0, 8), arm: new THREE.CylinderGeometry(0.2, 0.2, 1.0, 6),
    mesa: new THREE.BoxGeometry(1, 1, 1), mound: new THREE.SphereGeometry(1, 8, 5), lampPole: new THREE.CylinderGeometry(0.1, 0.12, 7, 6), lampHead: new THREE.BoxGeometry(0.9, 0.18, 0.4),
    crate: new THREE.BoxGeometry(1.2, 1.2, 1.2), barrier: new THREE.BoxGeometry(4.8, 0.9, 0.6), stripe: new THREE.BoxGeometry(0.5, 0.92, 0.62)
  };
  const bMat = {
    leaf: mat(0x4f9a45), leaf2: mat(0x62ad4e), cactus: mat(0x3f8a4a), mesa: mat(0xb9703b), sandRock: mat(0xc58a52), dry: mat(0x9a8452), snowCone: mat(0xffffff), snowTrunk: mat(0x4a3a2a), snowRock: mat(0xcfd6dc), snowLog: mat(0xdde7ee), snowMound: mat(0xffffff),
    lamp: mat(0x2c2f36), lampLight: new THREE.MeshBasicMaterial({ color: 0xfff1b0 }), crate: mat(0xb07a3a), barrier: mat(0xe9e9e9), barStripe: mat(0xd94a3a), deadLog: mat(0x8a7458)
  };
  const winTex = (cols, rows) => {                        // lit windows on a concrete wall
    const c = document.createElement('canvas'); c.width = 128; c.height = 256; const g = c.getContext('2d');
    g.fillStyle = '#8b919b'; g.fillRect(0, 0, 128, 256);
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) { g.fillStyle = Math.random() < 0.35 ? '#ffe9a8' : '#2d3a4d'; g.fillRect(8 + x * (112 / cols) + 2, 8 + y * (240 / rows) + 3, 112 / cols - 8, 240 / rows - 9); }
    const t = new THREE.CanvasTexture(c); return t;
  };
  const buildings = [[8, 14], [9, 24], [10, 36]].map(([w, h], i) => ({ geo: new THREE.BoxGeometry(w, h, w), h, mats: [0xffffff, 0xe8d8c8, 0xc8d8e8].map(col => new THREE.MeshLambertMaterial({ color: col, map: winTex(4, 6 + i * 4) })) }));

  const oGeo = {
    stump: new THREE.CylinderGeometry(0.55, 0.65, 0.7, 9), fallen: new THREE.CylinderGeometry(0.6, 0.6, 6.2, 9), disc: new THREE.CircleGeometry(2.3, 20), tumble: new THREE.IcosahedronGeometry(0.62, 0),
    ball: new THREE.SphereGeometry(0.5, 10, 8), carBody: new THREE.BoxGeometry(4.2, 0.75, 2.0), carCab: new THREE.BoxGeometry(2.1, 0.7, 1.7), carWheel: new THREE.CylinderGeometry(0.38, 0.38, 0.3, 10), carrot: new THREE.ConeGeometry(0.1, 0.5, 6)
  };
  const oMat = {
    fallen: mat(0x5a4328), mud: new THREE.MeshLambertMaterial({ color: 0x4f3622 }), ice: new THREE.MeshLambertMaterial({ color: 0x9fe0ff, transparent: true, opacity: 0.85 }), tumble: mat(0xa88a55), snowman: mat(0xffffff), carrot: mat(0xff7a1a), coal: mat(0x111111),
    cars: [0xd23a3a, 0x2f6fd0, 0xe0c13a, 0x3aa86a].map(c => mat(c)), glass: mat(0x1b2733), tire: mat(0x151515)
  };
  function makeObstacle(bid, r, s, d, w) {
    const y = Math.PI / 2 - w.th;                          // turns local x along the road
    const place = (m, h) => { m.position.set(w.x, h, w.z); return m; };
    const pick = r();
    if (bid === 'grass') {
      if (pick < 0.6) { const m = place(new THREE.Mesh(geo.rock, mats.rock), 0.55); m.scale.setScalar(0.8 + r() * 0.5); m.rotation.set(r() * 3, r() * 3, 0); return { mesh: m, obs: { s, d, rs: 0.8, rd: 0.8, kind: 'crash' } }; }
      const m = place(new THREE.Mesh(geo.log, mats.log), 0.42); m.rotation.z = Math.PI / 2; m.rotation.y = -w.th; return { mesh: m, obs: { s, d, rs: 0.5, rd: 2.4, kind: 'crash' } };
    }
    if (bid === 'forest') {
      if (pick < 0.35) { const m = place(new THREE.Mesh(oGeo.stump, mats.trunk), 0.35); return { mesh: m, obs: { s, d, rs: 0.7, rd: 0.7, kind: 'crash' } }; }
      if (pick < 0.65) { const m = place(new THREE.Mesh(oGeo.fallen, oMat.fallen), 0.6); m.rotation.z = Math.PI / 2; m.rotation.y = -w.th; return { mesh: m, obs: { s, d, rs: 0.65, rd: 3.1, kind: 'crash' } }; }
      const m = place(new THREE.Mesh(oGeo.disc, oMat.mud), 0.06); m.rotation.x = -Math.PI / 2; m.scale.set(1.1, 1.3, 1);
      return { mesh: m, obs: { s, d, rs: 2.5, rd: 2.3, kind: 'mud' } };
    }
    if (bid === 'desert') {
      if (pick < 0.5) {
        const g = new THREE.Group(); g.position.set(w.x, 0, w.z);
        const c = new THREE.Mesh(bGeo.cactus, bMat.cactus); c.position.y = 1.5; g.add(c);
        for (const sx of [-1, 1]) { const a = new THREE.Mesh(bGeo.arm, bMat.cactus); a.position.set(sx * 0.55, 1.9, 0); a.rotation.z = sx * 0.25; g.add(a); }
        return { mesh: g, obs: { s, d, rs: 0.6, rd: 0.7, kind: 'crash' } };
      }
      const m = place(new THREE.Mesh(oGeo.tumble, oMat.tumble), 0.62);                 // a tumbleweed rolling across the road
      const v = (r() < 0.5 ? -1 : 1) * (2.2 + r() * 1.8) * (1 + hardness(s));
      const o = { s, d: Math.max(-ROAD_W / 2 + 0.6, Math.min(ROAD_W / 2 - 0.6, d)), rs: 0.65, rd: 0.65, kind: 'crash', v };
      o.mesh = m; return { mesh: m, obs: o };
    }
    if (bid === 'snow') {
      if (pick < 0.45) { const m = place(new THREE.Mesh(oGeo.disc, oMat.ice), 0.06); m.rotation.x = -Math.PI / 2; m.scale.set(1.2, 1.3, 1); return { mesh: m, obs: { s, d, rs: 2.8, rd: 2.7, kind: 'ice' } }; }
      if (pick < 0.8) {
        const g = new THREE.Group(); g.position.set(w.x, 0, w.z);
        const b1 = new THREE.Mesh(oGeo.ball, oMat.snowman); b1.position.y = 0.5; b1.scale.setScalar(1.3); g.add(b1);
        const b2 = new THREE.Mesh(oGeo.ball, oMat.snowman); b2.position.y = 1.35; b2.scale.setScalar(0.95); g.add(b2);
        const b3 = new THREE.Mesh(oGeo.ball, oMat.snowman); b3.position.y = 2.0; b3.scale.setScalar(0.65); g.add(b3);
        const nose = new THREE.Mesh(oGeo.carrot, oMat.carrot); nose.position.set(0, 2.0, 0.4); nose.rotation.x = Math.PI / 2; g.add(nose);
        return { mesh: g, obs: { s, d, rs: 0.75, rd: 0.75, kind: 'crash' } };
      }
      const m = place(new THREE.Mesh(geo.rock, bMat.snowRock), 0.6); m.scale.setScalar(1.0 + r() * 0.5); m.rotation.set(r() * 3, r() * 3, 0); return { mesh: m, obs: { s, d, rs: 0.9, rd: 0.9, kind: 'crash' } };
    }
    // city
    if (pick < 0.35) {                                     // a stopped car blocks part of the road
      const g = new THREE.Group(); g.position.set(w.x, 0, w.z); g.rotation.y = y;
      const body = new THREE.Mesh(oGeo.carBody, oMat.cars[Math.floor(r() * 4)]); body.position.y = 0.6; g.add(body);
      const cab = new THREE.Mesh(oGeo.carCab, oMat.glass); cab.position.set(-0.2, 1.2, 0); g.add(cab);
      for (const x of [-1.4, 1.4]) for (const z of [-0.95, 0.95]) { const wh = new THREE.Mesh(oGeo.carWheel, oMat.tire); wh.rotation.x = Math.PI / 2; wh.position.set(x, 0.38, z); g.add(wh); }
      return { mesh: g, obs: { s, d, rs: 2.2, rd: 1.15, kind: 'crash' } };
    }
    if (pick < 0.7) { const m = new THREE.Mesh(bGeo.barrier, bMat.barrier); m.rotation.y = -w.th; m.position.set(w.x, 0.45, w.z); for (const x of [-1.6, 0, 1.6]) { const st2 = new THREE.Mesh(bGeo.stripe, bMat.barStripe); st2.position.x = x; m.add(st2); } return { mesh: m, obs: { s, d, rs: 0.5, rd: 2.4, kind: 'crash' } }; }
    const m = place(new THREE.Mesh(bGeo.crate, bMat.crate), 0.6); m.rotation.y = r() * 3; return { mesh: m, obs: { s, d, rs: 0.7, rd: 0.7, kind: 'crash' } };
  }

  function buildCell(k) {
    const r = rng(k * 7919 + 13), group = new THREE.Group(), list = { ramps: [], obs: [] };
    const s0 = k * CELL, bid = biomeIdAt(biomeIdxOfS(s0 + CELL / 2));
    const at = (dmin, dspan) => { const side = r() < 0.5 ? -1 : 1, d = side * (ROAD_W / 2 + dmin + r() * dspan), s = s0 + r() * CELL; return worldPos(s, d); };
    const put = (geom, m, w, y, sc) => { const o = new THREE.Mesh(geom, m); o.position.set(w.x, y, w.z); if (sc) o.scale.setScalar(sc); group.add(o); return o; };
    const pine = (w, sc, lower, upper, trunk) => { put(geo.trunk, trunk, w, 1.1 * sc, sc); put(geo.cone, lower, w, 4.2 * sc, sc); put(bGeo.cone2, upper, w, 6.4 * sc, sc * 0.9); };
    const tsHere = townNear(s0 + CELL / 2), inTown = tsHere !== null;
    if (inTown) addTown(group, r, s0, tsHere, bid);
    else if (bid === 'grass') {
      for (let i = 0; i < 4; i++) { const w = at(5, 40), sc = 0.8 + r() * 0.9; put(geo.trunk, mats.trunk, w, 1.1 * sc, sc); put(bGeo.canopy, r() < 0.5 ? bMat.leaf : bMat.leaf2, w, 3.6 * sc, sc); }
      for (let i = 0; i < 4; i++) { const w = at(4, 40), b = put(geo.bush, mats.bush, w, 0.5); b.scale.set(1 + r(), 0.8, 1 + r()); }
      for (let i = 0; i < 2; i++) { const w = at(5, 40), m = put(geo.rock, mats.rock, w, 0.5, 0.8 + r() * 2); m.rotation.set(r() * 3, r() * 3, 0); }
    } else if (bid === 'forest') {
      for (let i = 0; i < 16; i++) { const w = at(3.5, 38), sc = 0.9 + r() * 1.3; pine(w, sc, r() < 0.5 ? mats.cone : mats.cone2, mats.cone, mats.trunk); }
      for (let i = 0; i < 3; i++) { const w = at(4, 30), b = put(geo.bush, mats.bush, w, 0.5); b.scale.set(1 + r(), 0.8, 1 + r()); }
    } else if (bid === 'desert') {
      for (let i = 0; i < 4; i++) {
        const w = at(5, 38), sc = 0.8 + r() * 0.8; put(bGeo.cactus, bMat.cactus, w, 1.5 * sc, sc);
        for (const sx of [-1, 1]) { const a = put(bGeo.arm, bMat.cactus, { x: w.x + sx * 0.55 * sc, z: w.z }, (1.9 + r() * 0.5) * sc, sc); a.rotation.z = sx * 0.25; }
      }
      for (let i = 0; i < 3; i++) { const w = at(6, 40), m = put(geo.rock, bMat.sandRock, w, 0.5, 1 + r() * 2.2); m.rotation.set(r() * 3, r() * 3, 0); }
      for (let i = 0; i < 3; i++) { const w = at(4, 35), b = put(geo.bush, bMat.dry, w, 0.35); b.scale.set(0.8 + r() * 0.6, 0.45, 0.8 + r() * 0.6); }
      if (r() < 0.5) { const w = at(24, 30), hh = 7 + r() * 9, m = put(bGeo.mesa, bMat.mesa, w, hh / 2); m.scale.set(8 + r() * 8, hh, 8 + r() * 8); m.rotation.y = r() * 3; }
    } else if (bid === 'snow') {
      for (let i = 0; i < 7; i++) { const w = at(5, 40), sc = 0.9 + r() * 1.1; pine(w, sc, bMat.snowCone, bMat.snowCone, bMat.snowTrunk); }
      for (let i = 0; i < 3; i++) { const w = at(5, 40), m = put(geo.rock, bMat.snowRock, w, 0.5, 0.9 + r() * 2); m.rotation.set(r() * 3, r() * 3, 0); }
      for (let i = 0; i < 3; i++) { const w = at(4, 38), m = put(bGeo.mound, bMat.snowMound, w, 0.1); m.scale.set(1.5 + r() * 2.5, 0.7 + r() * 0.6, 1.5 + r() * 2.5); }
    } else {                                              // city
      for (const side of [-1, 1]) for (let i = 0; i < 3; i++) {
        const b = buildings[Math.floor(r() * 3)], s = s0 + 5 + i * 10, w = worldPos(s, side * (ROAD_W / 2 + 8 + b.geo.parameters.width / 2 + r() * 5));
        const m = new THREE.Mesh(b.geo, b.mats[Math.floor(r() * 3)]); m.position.set(w.x, b.h / 2, w.z); m.rotation.y = -w.th; group.add(m);
      }
      for (const side of [-1, 1]) {
        const w = worldPos(s0 + 15, side * (ROAD_W / 2 + 3.4));
        put(bGeo.lampPole, bMat.lamp, w, 3.5);
        const hd = put(bGeo.lampHead, bMat.lampLight, { x: w.x - side * Math.cos(w.th) * 0.5, z: w.z - side * Math.sin(w.th) * 0.5 }, 7.0); hd.rotation.y = -w.th;
      }
    }
    if (k >= 4 && !inTown) {                              // nothing on the first 120 m
      const roll = r(), df = hardness(s0), rampP = 0.2 - 0.07 * df, obsP = rampP + 0.55 + 0.3 * df;
      if (roll < rampP) {                                  // a ramp
        const d = (r() - 0.5) * 4, s = s0 + 6 + r() * 10, w = worldPos(s, d), m = new THREE.Mesh(rampGeo, mat(0xc99a5b));
        m.position.set(w.x, 0, w.z); m.rotation.y = Math.PI / 2 - w.th; group.add(m);
        const edge = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, 4.6), mat(0xffffff)); edge.rotation.y = Math.PI / 2 - w.th;
        const ax = Math.sin(w.th) * 7, az = -Math.cos(w.th) * 7; edge.position.set(w.x + ax, 1.72, w.z + az); group.add(edge);
        list.ramps.push({ s, d, len: 7, w: 4.6, h: 1.7 });
      } else if (roll < obsP) {                            // obstacles: every biome has its own kinds, and more of them the further you go
        const n = 1 + (r() < 0.35 + 0.4 * df ? 1 : 0) + (r() < 0.6 * df ? 1 : 0) + (df > 0.6 && r() < 0.3 ? 1 : 0);
        for (let i = 0; i < n; i++) {
          const d = (r() - 0.5) * (ROAD_W - 1.5), s = s0 + 4 + r() * 22, w = worldPos(s, d);
          const o = makeObstacle(bid, r, s, d, w);
          group.add(o.mesh); list.obs.push(o.obs);
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
  const M = {
    orange: std(0xff6a13, { roughness: 0.35 }), white: std(0xf4f4f4, { roughness: 0.4, emissive: 0x303030 }), black: std(0x17181c, { roughness: 0.6 }), grey: std(0x3a3d45, { roughness: 0.5, metalness: 0.4 }),
    silver: std(0xc9ccd4, { roughness: 0.25, metalness: 0.85 }), gold: std(0xd9a93a, { roughness: 0.3, metalness: 0.8 }), tire: std(0x202226, { roughness: 0.9 }),
    jersey: std(0x1f5fd6, { roughness: 0.7 }), jerseyAcc: std(0xf4f4f4, { roughness: 0.7 }), pants: std(0x23262e, { roughness: 0.7 }), skin: std(0xe2b48a, { roughness: 0.8 }), visor: std(0x0e1830, { roughness: 0.15, metalness: 0.6 }), red: new THREE.MeshBasicMaterial({ color: 0xff3030 })
  };
  const Y = new THREE.Vector3(0, 1, 0);
  const limb = (a, b, r, m, parent) => {                  // a rounded tube between two points
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), dir = B.clone().sub(A), len = dir.length();
    const o = new THREE.Mesh(new THREE.CapsuleGeometry(r, Math.max(0.001, len - 2 * r), 4, 10), m);
    o.position.copy(A).add(B).multiplyScalar(0.5); o.quaternion.setFromUnitVectors(Y, dir.normalize()); (parent || body).add(o); return o;
  };
  const tube = (a, b, r, m, parent) => {                  // a plain cylinder between two points
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), dir = B.clone().sub(A), len = dir.length();
    const o = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 12), m);
    o.position.copy(A).add(B).multiplyScalar(0.5); o.quaternion.setFromUnitVectors(Y, dir.normalize()); (parent || body).add(o); return o;
  };
  const put = (geom, m, x, y, z, rx = 0, ry = 0, rz = 0, parent) => { const o = new THREE.Mesh(geom, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); (parent || body).add(o); return o; };
  function wheel(z) {
    const spin = new THREE.Group(); spin.position.set(0, 0.46, z);
    const tireG = new THREE.TorusGeometry(0.385, 0.085, 14, 32); tireG.rotateY(Math.PI / 2);
    spin.add(new THREE.Mesh(tireG, M.tire));
    for (let k = 0; k < 14; k++) { const a = k / 14 * Math.PI * 2; put(new THREE.BoxGeometry(0.19, 0.05, 0.08), M.tire, 0, Math.cos(a) * 0.47, Math.sin(a) * 0.47, a, 0, 0, spin); }   // knobbies
    const rimG = new THREE.TorusGeometry(0.3, 0.025, 8, 28); rimG.rotateY(Math.PI / 2); spin.add(new THREE.Mesh(rimG, M.silver));
    const hubG = new THREE.CylinderGeometry(0.075, 0.075, 0.2, 14); hubG.rotateZ(Math.PI / 2); spin.add(new THREE.Mesh(hubG, M.gold));
    for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI; const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.6, 5), M.silver); sp.rotation.x = a; spin.add(sp); }
    body.add(spin); wheels.push(spin);
  }
  wheel(-0.95); wheel(0.9);
  // frame, engine and plastics
  limb([0, 1.3, -0.6], [0, 0.78, 0.5], 0.05, M.grey);                                         // main spine
  limb([0, 0.95, -0.55], [0, 0.55, 0.3], 0.045, M.grey);                                      // down tube
  put(new THREE.BoxGeometry(0.3, 0.36, 0.5), M.grey, 0, 0.68, 0.0);                           // engine block
  put(new THREE.CylinderGeometry(0.17, 0.17, 0.44, 16), M.silver, 0, 0.78, -0.1, 0, 0, Math.PI / 2);   // cylinder head
  for (const sx of [-1, 1]) put(new THREE.CylinderGeometry(0.13, 0.13, 0.05, 16), M.gold, sx * 0.19, 0.62, 0.15, 0, 0, Math.PI / 2);   // engine covers
  const tank = put(new THREE.CapsuleGeometry(0.17, 0.42, 6, 14), M.orange, 0, 1.18, -0.2, Math.PI / 2 + 0.18); tank.scale.set(1, 1, 0.88);   // tank
  const seat = put(new THREE.CapsuleGeometry(0.15, 0.78, 6, 14), M.black, 0, 1.17, 0.55, Math.PI / 2 - 0.08); seat.scale.set(1, 1, 0.45);   // seat
  put(new THREE.BoxGeometry(0.28, 0.05, 0.95), M.orange, 0, 1.0, 1.1, 0.18);                  // rear fender
  put(new THREE.BoxGeometry(0.12, 0.06, 0.04), M.red, 0, 1.0, 1.58);                          // tail light
  for (const sx of [-1, 1]) put(new THREE.BoxGeometry(0.04, 0.34, 0.5), M.white, sx * 0.19, 0.96, 0.55);   // side panels
  // front end
  for (const sx of [-1, 1]) {
    tube([sx * 0.12, 0.46, -0.95], [sx * 0.12, 0.92, -0.78], 0.04, M.silver);                // fork lower
    tube([sx * 0.12, 0.92, -0.78], [sx * 0.12, 1.36, -0.6], 0.05, M.gold);                   // fork upper
  }
  put(new THREE.BoxGeometry(0.26, 0.04, 0.72), M.orange, 0, 0.98, -1.05, -0.12);               // front fender
  put(new THREE.BoxGeometry(0.34, 0.32, 0.04), M.white, 0, 1.45, -0.8, -0.35);                 // number plate
  tube([-0.45, 1.5, -0.62], [0.45, 1.5, -0.62], 0.022, M.black);                               // handlebar
  for (const sx of [-1, 1]) tube([sx * 0.38, 1.5, -0.62], [sx * 0.5, 1.5, -0.62], 0.032, M.grey);   // grips
  put(new THREE.BoxGeometry(0.16, 0.05, 0.06), M.black, 0, 1.4, -0.64);                        // clamp
  // swing arm, shock and exhaust
  for (const sx of [-1, 1]) limb([sx * 0.12, 0.7, 0.4], [sx * 0.12, 0.46, 0.9], 0.04, M.silver);
  limb([0, 1.0, 0.68], [0, 0.66, 0.52], 0.04, M.gold);                                         // rear shock
  limb([0.2, 0.6, -0.15], [0.23, 0.72, 0.4], 0.04, M.silver);                                  // exhaust pipe
  const can = put(new THREE.CylinderGeometry(0.075, 0.075, 0.6, 14), M.silver, 0.24, 0.8, 0.78, Math.PI / 2); can.rotation.x = Math.PI / 2 - 0.12;   // silencer
  put(new THREE.CylinderGeometry(0.06, 0.06, 0.03, 12), M.black, 0.245, 0.835, 1.09, Math.PI / 2 - 0.12);
  for (const sx of [-1, 1]) put(new THREE.BoxGeometry(0.1, 0.03, 0.14), M.grey, sx * 0.28, 0.5, 0.24);   // foot pegs
  // the rider
  const rider = new THREE.Group(); body.add(rider);
  limb([0, 1.38, 0.42], [0, 1.98, -0.02], 0.2, M.jersey, rider);                               // torso
  limb([0, 1.74, 0.15], [0, 1.82, 0.0], 0.215, M.jerseyAcc, rider).scale.set(1, 1, 0.6);       // white chest stripe
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.2, 18, 14), M.white); helmet.position.set(0, 2.25, -0.17); helmet.scale.set(1, 1.02, 1.12); rider.add(helmet);
  const chin = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.07, 0.09), M.white); chin.position.set(0, 2.13, -0.33); rider.add(chin);
  const visorM = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.09, 0.06), M.visor); visorM.position.set(0, 2.26, -0.3); rider.add(visorM);
  const peak = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.025, 0.2), M.orange); peak.position.set(0, 2.38, -0.36); peak.rotation.x = -0.25; rider.add(peak);
  for (const sx of [-1, 1]) {
    limb([sx * 0.22, 1.9, -0.06], [sx * 0.3, 1.72, -0.34], 0.07, M.jersey, rider);              // upper arm
    limb([sx * 0.3, 1.72, -0.34], [sx * 0.44, 1.52, -0.62], 0.06, M.jersey, rider);             // forearm
    const glove = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), M.black); glove.position.set(sx * 0.44, 1.5, -0.62); rider.add(glove);
    limb([sx * 0.17, 1.38, 0.38], [sx * 0.24, 1.2, -0.06], 0.095, M.pants, rider);              // thigh
    limb([sx * 0.24, 1.2, -0.06], [sx * 0.27, 0.66, 0.2], 0.08, M.pants, rider);                // shin
    limb([sx * 0.27, 0.7, 0.2], [sx * 0.29, 0.56, 0.02], 0.075, M.black, rider);                // boot
    const knee = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), M.white); knee.position.set(sx * 0.25, 1.2, -0.07); knee.scale.set(0.8, 1, 1); rider.add(knee);   // knee guard
  }
  bike.traverse(o => { if (o.isMesh) o.castShadow = true; });
  scene.add(bike);
  const snow = (() => {
    const g = new THREE.BufferGeometry(), a = new Float32Array(260 * 3);
    for (let i = 0; i < 260; i++) { a[i * 3] = (Math.random() - 0.5) * 50; a[i * 3 + 1] = Math.random() * 25; a[i * 3 + 2] = (Math.random() - 0.5) * 50; }
    g.setAttribute('position', new THREE.BufferAttribute(a, 3));
    const p = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 0.3, transparent: true, opacity: 0 })); p.frustumCulled = false; p.visible = false; scene.add(p); return p;
  })();
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
  const st = { pts: 0, wheelie: false, wp: 0, wTime: 0, s: 0, d: 0, y: 0, vy: 0, speed: 0, yaw: 0, lat: 0, air: false, airT: 0, flip: 0, flipping: false, crash: 0, nitro: 100, best: 0, started: false, over: 0, roll: 0, shake: 0, camYaw: 0 };
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
    resetGarage();
    $('dead').classList.remove('show');
    $('shop').classList.remove('show');
    Object.assign(st, { shop: false, lastTown: null, dead: false, offT: 0, pts: 0, ptsAcc: 0, level: 0, wheelie: false, wp: 0, wTime: 0, dist: 0, bonus: 0, s: 0, d: 0, y: 0, vy: 0, speed: 0, yaw: 0, lat: 0, air: false, airT: 0, flip: 0, flipping: false, crash: 0, nitro: 100, roll: 0, over: 0 });
    st.camYaw = 0; toast('GO!', 1);
  }
  window.addEventListener('keydown', e => {
    keys[e.code] = true;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    if (st.shop) { if (e.code === 'Enter' || e.code === 'Escape') closeShop(); return; }
    if (!st.started) { if (e.code === 'Enter' || e.code === 'Space') begin(); return; }
    if (e.code === 'KeyR') restart();
    if (e.code === 'KeyM') { muted = !muted; toast(muted ? 'ENGINE MUTED' : 'ENGINE ON', 1); }
    if (e.code === 'KeyE' && !e.repeat && st.air && !st.flipping && !st.trick && st.crash <= 0) { startTrick(); }
    if (e.code === 'KeyE' && !e.repeat && !st.air && st.crash <= 0) { if (st.wheelie) endWheelie(); else if (st.nitro < 8) toast('NOT ENOUGH NITRO', 0.8); else { st.wheelie = true; st.wTime = 0; toast('WHEELIE!', 0.8); blip(300, 0.1, 'square', 0.04); } }
    if (e.code === 'Space' && st.air && !st.flipping && !st.trick && st.crash <= 0) { if (st.nitro < 20) toast('NOT ENOUGH NITRO', 0.8); else { st.nitro -= 20; st.flipping = true; st.flip = 0; } }
  });
  window.addEventListener('keyup', e => { keys[e.code] = false; });
  window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

  // ---------- physics ----------
  function groundHeight(s, d) {                           // ramp surface under the bike
    for (const r of ramps) if (Math.abs(d - r.d) < r.w / 2 + 0.15 && s >= r.s && s <= r.s + r.len) return r.h * (s - r.s) / r.len;
    return 0;
  }
  function endWheelie() {
    if (!st.wheelie) return;
    st.wheelie = false;
    if (st.wTime >= 1.5) toast('WHEELIE ' + Math.round(st.wTime * 25) + ' pts', 1.2);
  }
  const OFF_LIMIT = 10, TAU = Math.PI * 2;
  // ---------- bike shop: repaint the bike for 4000 points a colour ----------
  const COLORS = [{ n: 'Orange', h: 0xff6a13 }, { n: 'Red', h: 0xe02424 }, { n: 'Blue', h: 0x1f78e0 }, { n: 'Green', h: 0x22a84a }, { n: 'Purple', h: 0x8a3ee0 }, { n: 'Pink', h: 0xff5fa8 }, { n: 'Yellow', h: 0xffd21f }, { n: 'White', h: 0xf2f2f2 }, { n: 'Black', h: 0x2a2c33 }];
  const COLOR_PRICE = 4000;
  let garage = { owned: ['Orange'], cur: 'Orange' };
  const colorHex = () => (COLORS.find(c => c.n === garage.cur) || COLORS[0]).h;
  function applyColor() { M.orange.color.setHex(colorHex()); }
  function resetGarage() { garage = { owned: ['Orange'], cur: 'Orange' }; applyColor(); }   // skins last one round only
  function renderShop() {
    $('shoppts').textContent = Math.floor(st.pts);
    const box = $('swatches'); box.innerHTML = '';
    for (const c of COLORS) {
      const owned = garage.owned.includes(c.n), cur = garage.cur === c.n, b = document.createElement('button');
      b.className = 'sw' + (cur ? ' cur' : '');
      b.innerHTML = '<i style="background:#' + c.h.toString(16).padStart(6, '0') + '"></i><span>' + c.n + '</span><em>' + (cur ? 'EQUIPPED' : owned ? 'OWNED' : COLOR_PRICE + ' pts') + '</em>';
      b.onclick = () => {
        if (!owned) { if (st.pts < COLOR_PRICE) { $('shopmsg').textContent = 'Not enough points: ' + c.n + ' costs ' + COLOR_PRICE; blip(150, 0.2, 'sawtooth', 0.06); return; } st.pts -= COLOR_PRICE; garage.owned.push(c.n); $('shopmsg').textContent = 'Bought ' + c.n + '!'; }
        else $('shopmsg').textContent = 'Equipped ' + c.n;
        garage.cur = c.n; applyColor(); blip(700, 0.1, 'square', 0.05); renderShop();
      };
      box.appendChild(b);
    }
  }
  function openShop() { st.shop = true; st.speed = 0; st.wheelie = false; $('shopmsg').textContent = ''; renderShop(); $('shop').classList.add('show'); toast('', 0.01); }
  function closeShop() { st.shop = false; $('shop').classList.remove('show'); st.speed = 6; }
  $('shopgo').onclick = closeShop; applyColor();
  const TRICKS = [{ n: 'TABLETOP', base: 300, dur: 0.8 }, { n: 'SUPERMAN', base: 400, dur: 0.9 }, { n: '360 SPIN', base: 600, dur: 0.95 }, { n: 'WHIP', base: 350, dur: 0.7 }, { n: 'NAC NAC', base: 450, dur: 0.85 }];
  function startTrick() { const t = TRICKS[Math.floor(Math.random() * TRICKS.length)]; st.trick = { n: t.n, base: t.base, dur: t.dur, t: 0 }; blip(500, 0.08, 'square', 0.04); }
  const ease = u => u * u * (3 - 2 * u), env = u => Math.sin(Math.PI * Math.min(1, u));
  function poseTrick() {                                  // animates the bike and rider for the current air trick
    const k = st.trick, u = k ? k.t / k.dur : 0, e = k ? env(u) : 0;
    let ry = 0, rz = 0, rrx = 0, rpy = 0, rpz = 0;
    if (k) {
      if (k.n === 'TABLETOP') rz = 1.35 * e;
      else if (k.n === 'SUPERMAN') { rrx = 1.25 * e; rpz = 0.55 * e; rpy = -0.15 * e; }
      else if (k.n === '360 SPIN') ry = TAU * ease(Math.min(1, u));
      else if (k.n === 'WHIP') { rz = 0.9 * e; ry = 0.7 * e; }
      else if (k.n === 'NAC NAC') { rrx = 0.35 * e; rpz = 0.1 * e; rz = 0.25 * e; }
    }
    body.rotation.y = ry; body.rotation.z = rz;
    rider.position.set(0, rpy, rpz); if (k) rider.rotation.x = -0.1 + rrx;
  }
  function landTrick() {                                  // grade the trick when the wheels touch down
    const k = st.trick; if (!k) return;
    if (k.t >= k.dur) {
      const m = 0.6 + Math.min(1.4, (st.peak || 0) / 3), n = Math.round(k.base * m / 10) * 10;
      const grade = m < 0.95 ? 'OK' : m < 1.35 ? 'NICE' : m < 1.75 ? 'SICK' : 'INSANE';
      st.pts += n; toast(grade + ' ' + k.n + ' +' + n + ' pts', 1.8); blip(880, 0.12); blip(1100, 0.15, 'square', 0.05);
    } else toast('TRICK CUT SHORT: no points', 1.2);
    st.trick = null;
  }
  function crash(why) {
    if (st.crash > 0) return;
    st.wheelie = false;
    st.crash = 1.5; st.speed = 0; st.flipping = false; st.trick = null; st.flip = 0; st.vy = Math.max(0, st.vy);
    toast(why, 1.4); flash(0.6); st.shake = 0.6; blip(110, 0.4, 'sawtooth', 0.09);
  }
  function step(dt) {
    if (st.dead || st.shop) { st.speed = 0; return; }
    { const ts = townNear(st.s); if (ts !== null && st.s >= ts && st.s < ts + 12 && st.lastTown !== ts && !st.air && st.crash <= 0) { st.lastTown = ts; openShop(); return; } }
    const up = keys.KeyW || keys.ArrowUp, down = keys.KeyS || keys.ArrowDown;
    const steer = ((keys.KeyD || keys.ArrowRight) ? 1 : 0) - ((keys.KeyA || keys.ArrowLeft) ? 1 : 0);
    const boosting = !!keys.ShiftLeft || !!keys.ShiftRight;
    if (st.crash > 0) {
      st.crash -= dt; st.roll = Math.min(1.45, st.roll + dt * 4); st.speed = 0;
      if (st.crash <= 0) { st.roll = 0; st.d = Math.max(-2, Math.min(2, st.d)); st.yaw = 0; st.lat = 0; st.y = 0; st.vy = 0; st.air = false; }
      return;
    }
    if (st.wheelie && (down || st.air || st.speed < 4)) endWheelie();
    if (st.wheelie) { st.wTime += dt; st.nitro = Math.max(0, st.nitro - 15 * dt); st.pts += 25 * dt; if (st.nitro <= 0) { endWheelie(); toast('OUT OF NITRO', 0.8); } }
    const offOn = Math.abs(st.d) > ROAD_W / 2 + 0.2;
    if (offOn && st.crash <= 0) {
      st.offT = (st.offT || 0) + dt;
      if (st.offT >= OFF_LIMIT) {
        st.dead = true; st.speed = 0; st.wheelie = false; st.flipping = false; st.offT = OFF_LIMIT;
        $('dead').innerHTML = 'YOU DIED<small>Off the road for too long. Press R to restart</small>'; $('dead').classList.add('show'); flash(0.7); blip(90, 0.8, 'sawtooth', 0.1);
        return;
      }
    } else st.offT = Math.max(0, (st.offT || 0) - dt * 2);
    const offroad = Math.abs(st.d) > ROAD_W / 2 + 0.2, rough = Math.abs(st.d) > ROAD_W / 2 + 3.2;
    const hd = hardness(st.s);                                 // later levels are faster
    let top = (MAX_SPEED + 7 * hd) * (rough ? 0.62 : offroad ? 0.85 : 1) * (st.wheelie ? 0.92 : 1), acc = up ? 15 : 0;
    if (boosting && st.nitro > 0 && up) { top = (NITRO_SPEED + 8 * hd) * (rough ? 0.7 : 1); acc += 14; st.nitro = Math.max(0, st.nitro - 34 * dt); }
    else if (!st.wheelie) st.nitro = Math.min(100, st.nitro + 7 * dt);
    if (acc && st.speed < top) st.speed = Math.min(top, st.speed + acc * (1 - st.speed / (top + 8)) * dt * 1.6);
    if (st.speed > top) st.speed = Math.max(top, st.speed - 12 * dt);
    if (!up) st.speed = Math.max(0, st.speed - (down ? 0 : 0) - 3.2 * dt);
    if (down) st.speed = Math.max(0, st.speed - 30 * dt);
    if (st.air) st.speed = Math.max(0, st.speed - 0.4 * dt);
    // steering: the bike yaws toward the stick direction and slides across the road
    const grip = st.air ? 0.25 : (st.slip > 0 ? 0.22 : 1), targetYaw = steer * 0.5 * Math.min(1, 0.3 + st.speed / 14) * grip * (st.wheelie ? 0.7 : 1);
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
        st.air = true; st.airT = 0; st.peak = 0; st.trick = null; st.vy = Math.max(4, st.speed * 0.28); st.y = prev; st.flip = 0; st.flipping = false;
      }
    }
    if (st.air) {
      st.airT += dt; st.vy -= 14 * dt; st.y += st.vy * dt;
      if (st.flipping) st.flip += dt * 8;
      if (st.trick) st.trick.t += dt;
      st.peak = Math.max(st.peak || 0, st.y);
      if (st.y <= gh) {
        st.y = gh; st.air = false;
        if (st.flipping) {
          if (st.flip >= TAU - 0.9) { const n = Math.max(1, Math.round(st.flip / TAU)); st.pts += 500 * n; toast((n > 1 ? n + 'x ' : '') + 'FLIP! +' + 500 * n + ' pts', 1.6); blip(880, 0.15); blip(1320, 0.2, 'square', 0.05); }
          else if (st.flip > 0.9) crash('BAD LANDING!');
        } else if (st.airT > 0.5) { st.pts += Math.round(st.airT * 40); toast('AIR TIME +' + Math.round(st.airT * 40) + ' pts', 1.2); }
        landTrick();
        st.flip = 0; st.flipping = false; st.vy = 0; st.shake = Math.max(st.shake, 0.25);
      }
    }
    // obstacles
    st.slip = Math.max(0, (st.slip || 0) - dt); st.hazT = Math.max(0, (st.hazT || 0) - dt);
    if (!st.air || st.y < 0.5) for (const o of obstacles) {
      if (Math.abs(st.s - o.s) < o.rs + 0.35 && Math.abs(st.d - o.d) < o.rd + 0.3 && st.y < 0.7) {
        if (o.kind === 'mud') { if (st.speed > 12) st.speed = Math.max(12, st.speed - 70 * dt); st.shake = Math.max(st.shake, 0.15); if (st.hazT <= 0) { toast('MUD! You are slowing down', 1.2); st.hazT = 2; } }
        else if (o.kind === 'ice') { st.slip = 0.5; if (st.hazT <= 0) { toast('ICE! Steering is slippery', 1.2); st.hazT = 2; } }
        else { crash(o.v ? 'HIT A TUMBLEWEED!' : 'CRASH!'); break; }
      }
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
    st.wp += ((st.wheelie ? 1 : 0) - st.wp) * Math.min(1, 6 * dt);
    const wa = 0.62 * st.wp; pitch += wa;
    body.rotation.x += (pitch - body.rotation.x) * Math.min(1, st.flipping ? 1 : 12 * dt);
    if (st.flipping) body.rotation.x = -st.flip;
    poseTrick();
    const offY = 0.46 * (1 - Math.cos(wa)) + 0.9 * Math.sin(wa), offZ = 0.9 - (0.46 * Math.sin(wa) + 0.9 * Math.cos(wa)); body.position.z = offZ;
    body.position.y = offY + Math.sin(time * 38) * 0.015 * Math.min(1, st.speed / 10) * (st.air ? 0 : 1) * (Math.abs(st.d) > ROAD_W / 2 + 0.2 ? 3 : 1);
    for (const g of wheels) g.rotation.x += st.speed * dt / 0.46;
    if (!st.trick) rider.rotation.x = st.crash > 0 ? 0.2 : -Math.min(0.1, st.speed / 300);
    blob.visible = false; sun.target.position.set(w.x, 0, w.z); sun.position.set(w.x + 40, 80, w.z + 30);
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
    for (const o of obstacles) if (o.v) {                  // tumbleweeds roll across the road
      o.d += o.v * dt; if (Math.abs(o.d) > ROAD_W / 2 - 0.4) { o.d = Math.sign(o.d) * (ROAD_W / 2 - 0.4); o.v = -o.v; }
      const p = worldPos(o.s, o.d); o.mesh.position.x = p.x; o.mesh.position.z = p.z; o.mesh.rotation.z -= o.v * dt * 1.6; o.mesh.rotation.x += st.speed * dt * 0.05;
    }
    // biome colours, falling snow and the biome banner
    const pal = paletteAt(st.s);
    scene.background.copy(pal.sky); scene.fog.color.copy(pal.sky); scene.fog.near = pal.fogN; scene.fog.far = pal.fogF;
    ground.material.color.copy(pal.ground); shoulder.material.color.copy(pal.shoulder); asphalt.material.color.copy(pal.road);
    const snowW = (pal.a === 'snow' ? 1 - pal.t : 0) + (pal.b === 'snow' ? pal.t : 0);
    snow.visible = snowW > 0.02; snow.material.opacity = 0.9 * snowW;
    if (snow.visible) { const p = snow.geometry.attributes.position; for (let i = 0; i < p.count; i++) { let y = p.getY(i) - (3 + (i % 5)) * dt; if (y < 0) y += 25; p.setY(i, y); p.setX(i, p.getX(i) + Math.sin(time + i) * dt * 0.8); } p.needsUpdate = true; snow.position.set(w.x, 0, w.z); }
    const lv = levelOf(st.s);
    if (lv !== st.level) { if (st.level && lv > st.level) { toast('LEVEL ' + lv + (lv === 12 ? ' (MAX)' : '') + ': it gets harder!', 1.8); blip(520, 0.1); blip(780, 0.14, 'square', 0.05); } st.level = lv; $('level').textContent = 'LEVEL ' + lv; }
    const bi = biomeIdxOfS(st.s);
    if (bi !== st.biomeIdx) {
      const first = st.biomeIdx === undefined; st.biomeIdx = bi;
      const nm = BIOMES[biomeIdAt(bi)].name, hint = BIOMES[biomeIdAt(bi)].hint; $('biome').textContent = nm;
      if (!first) { const b = $('banner'); b.innerHTML = nm + '<small>Watch out for: ' + hint + '</small>'; b.classList.add('show'); setTimeout(() => b.classList.remove('show'), 2400); blip(660, 0.12); blip(990, 0.18, 'square', 0.05); }
    }
    // chase camera
    st.camYaw += (th + (st.camOff || 0) - st.camYaw) * Math.min(1, 3.2 * dt);
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
    drawMap(w);
    { const wn = $('offwarn'); if (!st.dead && st.offT > 0.01 && Math.abs(st.d) > ROAD_W / 2 + 0.2) { wn.textContent = 'GET BACK ON THE ROAD: ' + Math.max(0, OFF_LIMIT - st.offT).toFixed(1) + 's'; wn.classList.add('show'); } else wn.classList.remove('show'); }
    $('ptsv').textContent = Math.floor(st.pts);
    $('nitrobar').style.width = st.nitro + '%';
    if (toastT > 0) { toastT -= dt; if (toastT <= 0) $('toast').classList.remove('show'); }
    flash(Math.max(0, parseFloat($('flash').style.opacity || 0) - dt * 2));
    renderer.render(scene, camera);
  }
  window.addEventListener('beforeunload', () => { try { localStorage.setItem('dirtbike-best', String(st.best)); } catch (e) { /* ignore */ } });
  extend(400); updateRoad(0); updateCells(0);
  if (location.hash === '#debug') window.__db = { order, biomeIdAt, st, keys, step, begin, crash, obstacles: () => obstacles, ramps: () => ramps, worldPos, restart, townAt, openShop, garage: () => garage };
  frame();
})();
