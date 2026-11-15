/* Bank Heist
 * Third-person 3D game (Three.js). You are a robber who spawns outside the
 * National Bank with a pistol and a 4-slot inventory.
 */
(() => {
  'use strict';

  if (typeof THREE === 'undefined') {
    document.body.innerHTML = '<p style="color:#fff;padding:24px;font-family:sans-serif">Could not load lib/three.min.js</p>';
    return;
  }

  // ------------------------------------------------------------------ setup
  const container = document.getElementById('game');
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  const SKY = 0x9fd0f5;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SKY);
  scene.fog = new THREE.Fog(SKY, 70, 210);

  const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 500);
  scene.add(camera);

  scene.add(new THREE.HemisphereLight(0xdfefff, 0x6b6558, 1.0));
  const sun = new THREE.DirectionalLight(0xfff1d6, 2.6);
  sun.position.set(30, 50, 20);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 140 });
  sun.shadow.bias = -0.0004;
  scene.add(sun);
  scene.add(sun.target);

  for (const [x, z] of [[-6, -18], [6, -18], [0, -26]]) {   // warm lights inside the bank
    const l = new THREE.PointLight(0xffe2b0, 60, 0, 2);
    l.position.set(x, 7.5, z);
    scene.add(l);
  }

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // ---------------------------------------------------------------- helpers
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const mat = (color, o) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.85, metalness: 0 }, o));

  function canvasTex(w, h, fn) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    fn(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }

  const colliders = [];   // {minX,maxX,minZ,maxZ} – block the player
  const camSolids = [];   // meshes that stop the camera
  const aimables = [];    // meshes bullets can hit

  function addBox(w, h, d, material, x, y, z, o = {}) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    m.position.set(x, y, z);
    m.castShadow = o.cast !== false;
    m.receiveShadow = true;
    (o.parent || scene).add(m);
    if (o.block) colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
    if (o.cam) camSolids.push(m);
    if (o.aim !== false && !o.parent) aimables.push(m);
    return m;
  }

  // ------------------------------------------------------------------ world
  const concrete = mat(0xb9b6ae);
  const stone = mat(0xd9d2c3);
  const darkStone = mat(0x8c857a);
  const gold = mat(0xd4af37, { metalness: 0.8, roughness: 0.35 });
  const wood = mat(0x6b4423);
  const steel = mat(0x7d838c, { metalness: 0.6, roughness: 0.4 });

  // Ground
  const road = new THREE.Mesh(new THREE.PlaneGeometry(500, 500), mat(0x34373d, { roughness: 0.95 }));
  road.rotation.x = -Math.PI / 2;
  road.position.y = -0.08;
  road.receiveShadow = true;
  scene.add(road);
  aimables.push(road);

  addBox(64, 0.1, 40, concrete, 0, -0.05, -8, { cast: false });           // plaza
  addBox(30, 0.04, 6, mat(0xd8d3c6), 0, 0.01, -11, { cast: false });       // marble apron
  addBox(4, 0.02, 3.2, mat(0x8e1f2b), 0, 0.04, -12.3, { cast: false, aim: false });  // red carpet
  for (let x = -60; x <= 60; x += 6) {                                     // road dashes
    addBox(3, 0.02, 0.25, mat(0xe8c31c), x, -0.06, 24, { cast: false, aim: false });
  }

  // ---- The bank
  const T = 0.6;
  addBox(24, 10, T, stone, 0, 5, -29.7, { block: true, cam: true });          // back wall
  addBox(T, 10, 16, stone, -11.7, 5, -22, { block: true, cam: true });        // left wall
  addBox(T, 10, 16, stone, 11.7, 5, -22, { block: true, cam: true });         // right wall
  addBox(10, 10, T, stone, -7, 5, -14.3, { block: true, cam: true });         // front, left of door
  addBox(10, 10, T, stone, 7, 5, -14.3, { block: true, cam: true });          // front, right of door
  addBox(4, 5.5, T, stone, 0, 7.25, -14.3, { cam: true });                    // lintel over the door
  addBox(26, 0.8, 19, darkStone, 0, 10.4, -21.25, { cam: true });             // roof
  addBox(24, 0.4, 0.2, gold, 0, 9.4, -13.88, { aim: false });                 // gold trim
  for (const x of [-10.5, -7, -3.6, 3.6, 7, 10.5]) {                          // columns
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.55, 10, 20), stone);
    col.position.set(x, 5, -12.6);
    col.castShadow = col.receiveShadow = true;
    scene.add(col);
    aimables.push(col);
    colliders.push({ minX: x - 0.5, maxX: x + 0.5, minZ: -13.1, maxZ: -12.1 });
  }
  for (const x of [-8.75, -5.3, 5.3, 8.75]) {                                  // front windows
    addBox(2.4, 3.4, 0.1, mat(0xf2efe8), x, 3.4, -13.95, { aim: false });
    addBox(2.1, 3.1, 0.12, mat(0x1d3b5c, { metalness: 0.5, roughness: 0.2 }), x, 3.4, -13.9, { aim: false });
  }
  for (const x of [-2, 2]) addBox(0.2, 4.5, 0.7, gold, x, 2.25, -14.3, { aim: false });   // door frame

  const signTex = canvasTex(1024, 200, (c, w, h) => {
    c.fillStyle = '#0f3d2a'; c.fillRect(0, 0, w, h);
    c.strokeStyle = '#d4af37'; c.lineWidth = 10; c.strokeRect(8, 8, w - 16, h - 16);
    c.fillStyle = '#f2d36b'; c.font = 'bold 108px Georgia, serif';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('NATIONAL BANK', w / 2, h / 2 + 6);
  });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(9, 1.76), new THREE.MeshBasicMaterial({ map: signTex }));
  sign.position.set(0, 7.3, -13.97);
  scene.add(sign);

  // Interior
  const floorTex = canvasTex(128, 128, (c, w, h) => {
    c.fillStyle = '#e9e4d8'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#b9b2a4'; c.fillRect(0, 0, w / 2, h / 2); c.fillRect(w / 2, h / 2, w / 2, h / 2);
  });
  floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
  floorTex.repeat.set(12, 8);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(23.4, 15.4), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.35 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0.02, -22);
  floor.receiveShadow = true;
  scene.add(floor);
  aimables.push(floor);

  for (const [x, z] of [[-6, -18], [6, -18], [0, -26]]) {                      // ceiling light panels
    addBox(2.4, 0.1, 1.2, new THREE.MeshBasicMaterial({ color: 0xfff2cc }), x, 9.95, z, { cast: false, aim: false });
  }

  addBox(14, 1.1, 1.2, wood, -3, 0.55, -21, { block: true, cam: true });       // teller counter
  addBox(14.4, 0.1, 1.5, mat(0x2b2b2b, { roughness: 0.3 }), -3, 1.15, -21, { aim: true });
  addBox(3.2, 0.5, 0.8, mat(0x5a3b22), -7, 0.25, -16.5, { block: true });     // lobby benches
  addBox(3.2, 0.5, 0.8, mat(0x5a3b22), 7, 0.25, -16.5, { block: true });

  const vault = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 0.6, 32), mat(0x8a9099, { metalness: 0.8, roughness: 0.35 }));
  vault.rotation.x = Math.PI / 2;
  vault.position.set(7, 3, -29.1);
  vault.castShadow = true;
  scene.add(vault);
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.12, 10, 28), gold);
  wheel.position.set(7, 3, -28.7);
  scene.add(wheel);
  for (let i = 0; i < 3; i++) {
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.12, 0.12), gold);
    spoke.position.set(7, 3, -28.7);
    spoke.rotation.z = (i * Math.PI) / 3;
    scene.add(spoke);
  }
  addBox(3, 1.0, 1.2, steel, 8.6, 0.5, -27.5, { block: true });               // table holding the gold

  // Neighbouring buildings and skyline
  function windowTex(wallColor, rx, ry) {
    const t = canvasTex(64, 64, (c, w, h) => {
      c.fillStyle = wallColor; c.fillRect(0, 0, w, h);
      c.fillStyle = '#2b4a6b'; c.fillRect(14, 12, 36, 34);
      c.fillStyle = 'rgba(255,255,255,0.25)'; c.fillRect(14, 12, 36, 8);
      c.fillStyle = 'rgba(0,0,0,0.18)'; c.fillRect(0, h - 6, w, 6);
    });
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(rx, ry);
    return t;
  }
  function addBuilding(w, h, d, wallColor, x, z) {
    const side = new THREE.MeshStandardMaterial({ map: windowTex(wallColor, Math.round(d / 3.2), Math.round(h / 3.2)), roughness: 0.9 });
    const front = new THREE.MeshStandardMaterial({ map: windowTex(wallColor, Math.round(w / 3.2), Math.round(h / 3.2)), roughness: 0.9 });
    const roofM = mat(0x555a63);
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [side, side, roofM, roofM, front, front]);
    m.position.set(x, h / 2, z);
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
    colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
    camSolids.push(m);
    aimables.push(m);
  }
  addBuilding(16, 20, 18, '#8a7f78', -22, -23);
  addBuilding(16, 15, 18, '#6f7f8f', 22, -23);

  for (let i = 0; i < 46; i++) {                                               // distant skyline
    const a = (i / 46) * Math.PI * 2 + Math.random() * 0.1;
    const r = 95 + Math.random() * 55;
    const w = 12 + Math.random() * 18, h = 25 + Math.random() * 55, d = 12 + Math.random() * 18;
    const shade = 0x5d6470 + Math.floor(Math.random() * 0x1a) * 0x010101;
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(shade));
    m.position.set(Math.cos(a) * r, h / 2, Math.sin(a) * r);
    scene.add(m);
  }

  // Props
  function addLamp(x, z) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 5.5, 10), steel);
    pole.position.set(x, 2.75, z); pole.castShadow = true; scene.add(pole);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.1, 0.1), steel);
    arm.position.set(x, 5.5, z + 0.45); arm.rotation.y = Math.PI / 2; scene.add(arm);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.25, 12, 8), new THREE.MeshBasicMaterial({ color: 0xfff1b8 }));
    bulb.position.set(x, 5.4, z + 0.95); scene.add(bulb);
    colliders.push({ minX: x - 0.25, maxX: x + 0.25, minZ: z - 0.25, maxZ: z + 0.25 });
  }
  addLamp(-20, 3); addLamp(20, 3); addLamp(-20, -8); addLamp(26, -10);

  function addTree(x, z) {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.32, 3, 10), mat(0x6b4a2b));
    trunk.position.set(x, 1.5, z); trunk.castShadow = true; scene.add(trunk);
    const leaves = new THREE.Mesh(new THREE.IcosahedronGeometry(2.1, 1), mat(0x2f7d3a, { flatShading: true }));
    leaves.position.set(x, 4.4, z); leaves.castShadow = true; scene.add(leaves);
    const leaves2 = new THREE.Mesh(new THREE.IcosahedronGeometry(1.5, 1), mat(0x3a9347, { flatShading: true }));
    leaves2.position.set(x + 0.9, 5.4, z + 0.3); leaves2.castShadow = true; scene.add(leaves2);
    colliders.push({ minX: x - 0.4, maxX: x + 0.4, minZ: z - 0.4, maxZ: z + 0.4 });
  }
  addTree(-25, -4); addTree(27, -4); addTree(-26, 7);

  function addBench(x, z) {
    addBox(2.6, 0.12, 0.7, wood, x, 0.5, z, { aim: false });
    addBox(2.6, 0.6, 0.1, wood, x, 0.9, z - 0.3, { aim: false });
    addBox(0.12, 0.5, 0.6, steel, x - 1.1, 0.25, z, { aim: false });
    addBox(0.12, 0.5, 0.6, steel, x + 1.1, 0.25, z, { aim: false });
    colliders.push({ minX: x - 1.3, maxX: x + 1.3, minZ: z - 0.4, maxZ: z + 0.4 });
  }
  addBench(-14, -7); addBench(14, -8.5);

  function addCar(x, z, color) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    const body = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.7, 1.9), mat(color, { metalness: 0.5, roughness: 0.35 }));
    body.position.y = 0.65; body.castShadow = true; g.add(body);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.65, 1.7), mat(0x1a2330, { metalness: 0.6, roughness: 0.2 }));
    cabin.position.set(-0.2, 1.3, 0); cabin.castShadow = true; g.add(cabin);
    for (const [wx, wz] of [[1.4, 0.95], [1.4, -0.95], [-1.4, 0.95], [-1.4, -0.95]]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.3, 16), mat(0x111111));
      w.rotation.x = Math.PI / 2; w.position.set(wx, 0.38, wz); g.add(w);
    }
    for (const lz of [-0.6, 0.6]) {
      const l = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.18, 0.3), new THREE.MeshBasicMaterial({ color: 0xfff1b8 }));
      l.position.set(2.2, 0.75, lz); g.add(l);
    }
    scene.add(g);
    camSolids.push(body); aimables.push(body, cabin);
    colliders.push({ minX: x - 2.2, maxX: x + 2.2, minZ: z - 0.95, maxZ: z + 0.95 });
  }
  addCar(-12, 17, 0x111114);   // the getaway car
  addCar(16, 19, 0xb3202a);

  // Shooting-range targets
  const targetTex = canvasTex(256, 256, (c, w) => {
    const cols = ['#ffffff', '#d62828', '#ffffff', '#d62828', '#ffffff', '#111111'];
    cols.forEach((col, i) => { c.fillStyle = col; c.beginPath(); c.arc(w / 2, w / 2, (w / 2) * (1 - i / 6) - 1, 0, Math.PI * 2); c.fill(); });
  });
  const targets = [];
  for (const x of [9, 13, 17, 21]) {
    const g = new THREE.Group();
    g.position.set(x, 0, -5);
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.12, 0.5), steel);
    base.position.y = 0.06; g.add(base);
    const board = new THREE.Group();
    board.position.y = 0.1; g.add(board);
    const pole = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.2, 0.05), steel);
    pole.position.set(0, 0.6, -0.05); board.add(pole);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.5, 32), new THREE.MeshStandardMaterial({ map: targetTex, side: THREE.DoubleSide, roughness: 0.7 }));
    disc.position.set(0, 1.3, 0); disc.castShadow = true; board.add(disc);
    scene.add(g);
    const t = { group: g, board, down: false, timer: 0 };
    disc.userData.target = t; pole.userData.target = t;
    aimables.push(disc, pole);
    targets.push(t);
  }

  // Bounds
  const BOUND = 46;

  // ------------------------------------------------------------ items / UI
  const ITEM_TYPES = {
    pistol: { name: 'Pistol',    icon: '🔫', value: 0,     half: 0 },
    money:  { name: 'Money Bag', icon: '💰', value: 2500,  half: 0.28 },
    gold:   { name: 'Gold Bar',  icon: '🥇', value: 10000, half: 0.1 }
  };

  const dollarTex = canvasTex(64, 64, (c, w, h) => {
    c.fillStyle = '#1f6b3a'; c.beginPath(); c.arc(w / 2, h / 2, 28, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#fff'; c.font = 'bold 40px Arial'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('$', w / 2, h / 2 + 2);
  });

  function makeItemMesh(type) {
    const g = new THREE.Group();
    if (type === 'money') {
      const burlap = mat(0xb89b5a, { roughness: 0.95 });
      const sack = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 12), burlap);
      sack.scale.set(1, 0.85, 0.9); g.add(sack);
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, 0.14, 12), burlap);
      neck.position.y = 0.26; g.add(neck);
      const tie = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.025, 6, 12), mat(0x7a2f2f));
      tie.rotation.x = Math.PI / 2; tie.position.y = 0.31; g.add(tie);
      const lm = new THREE.MeshBasicMaterial({ map: dollarTex, transparent: true });
      const front = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.28), lm);
      front.position.set(0, 0, 0.27); g.add(front);
      const back = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.28), lm);
      back.position.set(0, 0, -0.27); back.rotation.y = Math.PI; g.add(back);
    } else if (type === 'gold') {
      const gm = mat(0xffc82c, { metalness: 0.9, roughness: 0.28, emissive: 0x3a2a00 });
      g.add(new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.14, 0.22), gm));
      const top = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.06, 0.16), gm);
      top.position.y = 0.09; g.add(top);
    }
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    return g;
  }

  const worldItems = [];
  const ringGeo = new THREE.RingGeometry(0.34, 0.44, 24);
  function spawnItem(type, x, groundY, z) {
    const mesh = makeItemMesh(type);
    const baseY = groundY + ITEM_TYPES[type].half + 0.05;
    mesh.position.set(x, baseY, z);
    scene.add(mesh);
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, groundY + 0.03, z);
    scene.add(ring);
    worldItems.push({ type, mesh, ring, baseY, phase: Math.random() * 6 });
  }

  // Money bags on the teller counter, gold bars on the vault table
  for (const x of [-8, -4, 0]) spawnItem('money', x, 1.2, -21);
  for (const x of [7.8, 9.4]) spawnItem('gold', x, 1.0, -27.5);

  // Inventory
  const slots = [{ type: 'pistol' }, null, null, null];
  let selected = 0;
  const slotEls = Array.from(document.querySelectorAll('#inventory .slot'));
  const lootEl = document.getElementById('loot');
  const objEl = document.getElementById('objective');
  const rangeEl = document.getElementById('range');
  const promptEl = document.getElementById('prompt');
  const toastEl = document.getElementById('toast');
  const ammoEl = document.getElementById('ammo');
  const ammoMagEl = document.getElementById('ammo-mag');
  const ammoResEl = document.getElementById('ammo-res');
  const reloadEl = document.getElementById('reload');
  const crossEl = document.getElementById('crosshair');
  const overlay = document.getElementById('overlay');
  const overlayMsg = document.getElementById('overlay-msg');

  function lootValue() {
    return slots.reduce((sum, s) => sum + (s ? ITEM_TYPES[s.type].value : 0), 0);
  }

  function renderInventory() {
    slotEls.forEach((el, i) => {
      const s = slots[i];
      el.classList.toggle('selected', i === selected);
      el.classList.toggle('empty', !s);
      el.querySelector('.icon').textContent = s ? ITEM_TYPES[s.type].icon : '';
      el.querySelector('.name').textContent = s ? ITEM_TYPES[s.type].name : '';
    });
    lootEl.textContent = 'LOOT $' + lootValue().toLocaleString('en-US');
  }

  let toastTimer = null;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1900);
  }

  // ------------------------------------------------------------------ audio
  let actx = null, noiseBuf = null, muted = false;
  function audio() {
    if (!actx) {
      try {
        actx = new (window.AudioContext || window.webkitAudioContext)();
        const len = Math.floor(actx.sampleRate * 0.3);
        noiseBuf = actx.createBuffer(1, len, actx.sampleRate);
        const d = noiseBuf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
      } catch (e) { actx = null; }
    }
    return actx;
  }
  function sndShot() {
    if (muted || !audio()) return;
    const t = actx.currentTime;
    const src = actx.createBufferSource(); src.buffer = noiseBuf;
    const f = actx.createBiquadFilter(); f.type = 'lowpass';
    f.frequency.setValueAtTime(5000, t); f.frequency.exponentialRampToValueAtTime(300, t + 0.2);
    const g = actx.createGain();
    g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.01, t + 0.25);
    src.connect(f); f.connect(g); g.connect(actx.destination); src.start(t);
    const o = actx.createOscillator(); const og = actx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
    og.gain.setValueAtTime(0.7, t); og.gain.exponentialRampToValueAtTime(0.01, t + 0.14);
    o.connect(og); og.connect(actx.destination); o.start(t); o.stop(t + 0.15);
  }
  function tone(freq, dur, type, vol, delay) {
    if (muted || !audio()) return;
    const t = actx.currentTime + (delay || 0);
    const o = actx.createOscillator(); const g = actx.createGain();
    o.type = type || 'square'; o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(vol || 0.05, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(actx.destination); o.start(t); o.stop(t + dur);
  }

  // ------------------------------------------------------------ the player
  function buildPlayer() {
    const g = new THREE.Group();
    const skin = mat(0xe0b48f), hoodie = mat(0x2d2f36), jeans = mat(0x1d2a44), black = mat(0x0c0c0e), shoe = mat(0x15151a);

    const legs = [-1, 1].map(s => {
      const piv = new THREE.Group(); piv.position.set(s * 0.14, 0.88, 0);
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.8, 0.26), jeans); leg.position.y = -0.4; piv.add(leg);
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.1, 0.36), shoe); foot.position.set(0, -0.83, -0.04); piv.add(foot);
      g.add(piv); return piv;
    });

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.72, 0.3), hoodie);
    torso.position.y = 1.22; g.add(torso);
    const bag = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.18), mat(0x4a4f3a));   // backpack
    bag.position.set(0, 1.25, 0.24); g.add(bag);

    const head = new THREE.Group(); head.position.y = 1.62; g.add(head);
    const face = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.32, 0.32), skin); face.position.y = 0.18; head.add(face);
    const beanie = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.13, 0.35), black); beanie.position.y = 0.32; head.add(beanie);
    const mask = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.13, 0.35), black); mask.position.y = 0.06; head.add(mask);
    for (const ex of [-0.07, 0.07]) {
      const eye = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.035, 0.01), black);
      eye.position.set(ex, 0.19, -0.166); head.add(eye);
    }

    const arms = [-1, 1].map(s => {
      const piv = new THREE.Group(); piv.position.set(s * 0.37, 1.52, 0);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.62, 0.17), hoodie); arm.position.y = -0.31; piv.add(arm);
      const hand = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.12), skin); hand.position.y = -0.68; piv.add(hand);
      g.add(piv); return piv;
    });
    const armL = arms[0], armR = arms[1];

    // Pistol (built along the arm's -Y axis so it points forward when the arm is raised)
    const gun = new THREE.Group(); gun.position.set(0, -0.68, 0); armR.add(gun);
    const gunMat = mat(0x30343b, { metalness: 0.6, roughness: 0.4 });
    const slide = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.3, 0.07), gunMat); slide.position.set(0, -0.17, -0.01); gun.add(slide);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.08, 0.09), mat(0x1c1c1f)); grip.position.set(0, -0.04, 0.07); gun.add(grip);
    const muzzle = new THREE.Object3D(); muzzle.position.set(0, -0.36, -0.01); gun.add(muzzle);

    const flashMap = canvasTex(64, 64, (c, w, h) => {
      const gr = c.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2);
      gr.addColorStop(0, 'rgba(255,255,220,1)'); gr.addColorStop(0.4, 'rgba(255,190,70,0.8)'); gr.addColorStop(1, 'rgba(255,120,0,0)');
      c.fillStyle = gr; c.fillRect(0, 0, w, h);
    });
    const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashMap, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    flash.scale.set(0.6, 0.6, 0.6); flash.visible = false; muzzle.add(flash);
    const flashLight = new THREE.PointLight(0xffc266, 0, 14, 2); muzzle.add(flashLight);

    // Items carried in the left hand
    const heldMoney = makeItemMesh('money'); heldMoney.scale.setScalar(0.55); heldMoney.position.set(0, -0.82, -0.06); heldMoney.visible = false; armL.add(heldMoney);
    const heldGold = makeItemMesh('gold'); heldGold.scale.setScalar(0.8); heldGold.position.set(0, -0.78, -0.04); heldGold.visible = false; armL.add(heldGold);

    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    scene.add(g);
    return { group: g, legs, armL, armR, head, torso, gun, muzzle, flash, flashLight, heldMoney, heldGold };
  }

  const model = buildPlayer();
  const player = {
    pos: new THREE.Vector3(-6, 0, -9.5),
    vel: new THREE.Vector3(),
    vy: 0, onGround: true,
    radius: 0.4,
    faceYaw: 0,
    walkPhase: 0
  };
  let yaw = 0, pitch = 0.12;       // camera orientation (yaw 0 looks toward the bank)
  let aiming = false, camDist = 3.8, camShoulder = 0.6;

  // --------------------------------------------------------------- weapon
  const gun = { mag: 12, size: 12, reserve: 60, cooldown: 0, reload: 0, kick: 0, flash: 0, fired: 0 };
  let hits = 0;
  const raycaster = new THREE.Raycaster();
  const camRay = new THREE.Raycaster();
  const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3();
  const UP = new THREE.Vector3(0, 1, 0);

  const decals = [];
  const decalGeo = new THREE.CircleGeometry(0.05, 8);
  const decalMat = new THREE.MeshBasicMaterial({ color: 0x0a0a0a, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  function addDecal(point, normal) {
    const d = new THREE.Mesh(decalGeo, decalMat);
    d.position.copy(point).addScaledVector(normal, 0.012);
    d.lookAt(v1.copy(point).add(normal));
    scene.add(d);
    decals.push(d);
    if (decals.length > 50) scene.remove(decals.shift());
  }

  const sparks = [];
  const sparkGeo = new THREE.BoxGeometry(0.05, 0.05, 0.05);
  const sparkMat = new THREE.MeshBasicMaterial({ color: 0xffb347 });
  function addSparks(point, normal) {
    for (let i = 0; i < 7; i++) {
      const m = new THREE.Mesh(sparkGeo, sparkMat);
      m.position.copy(point);
      const vel = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.2, Math.random() - 0.5).multiplyScalar(2.5).addScaledVector(normal, 2.5);
      scene.add(m);
      sparks.push({ m, vel, life: 0.35 });
    }
  }

  const tracers = [];
  const tracerGeo = new THREE.CylinderGeometry(0.012, 0.012, 1, 6);
  function addTracer(a, b) {
    const len = a.distanceTo(b);
    if (len < 0.2) return;
    const m = new THREE.Mesh(tracerGeo, new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.9 }));
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.scale.set(1, len, 1);
    m.quaternion.setFromUnitVectors(UP, v1.copy(b).sub(a).normalize());
    scene.add(m);
    tracers.push({ m, life: 0.07 });
  }

  function holdingGun() { return !!(slots[selected] && slots[selected].type === 'pistol'); }

  function startReload() {
    if (!holdingGun() || gun.reload > 0 || gun.mag >= gun.size || gun.reserve <= 0) return;
    gun.reload = 1.3;
    tone(220, 0.05, 'square', 0.05); tone(330, 0.05, 'square', 0.05, 0.55);
  }

  function shoot() {
    if (!holdingGun() || gun.reload > 0 || gun.cooldown > 0) return;
    if (gun.mag <= 0) {
      if (gun.reserve > 0) startReload(); else { tone(150, 0.05, 'square', 0.04); toast('Out of ammo!'); }
      return;
    }
    gun.mag--;
    gun.cooldown = 0.2;
    gun.kick = 1;
    gun.flash = 0.06;
    gun.fired = 0.8;
    sndShot();

    // 1) ray from the camera through the crosshair
    camera.updateMatrixWorld();
    raycaster.setFromCamera({ x: 0, y: 0 }, camera);
    raycaster.far = 150;
    const first = raycaster.intersectObjects(aimables, false)[0];
    const aimPoint = first ? first.point.clone() : raycaster.ray.at(120, new THREE.Vector3());

    // 2) ray from the gun to that point (so cover between the gun and the target still blocks the shot)
    const from = model.muzzle.getWorldPosition(new THREE.Vector3());
    const dir = aimPoint.clone().sub(from);
    const dist = dir.length();
    dir.normalize();
    raycaster.set(from, dir);
    raycaster.far = dist + 0.5;
    let hit = raycaster.intersectObjects(aimables, false)[0];
    if (!hit && first) hit = first;
    const end = hit ? hit.point.clone() : aimPoint;
    addTracer(from, end);

    // kick the camera a little
    pitch = clamp(pitch + 0.012, -0.9, 0.9);

    if (hit) {
      const n = hit.face ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld) : UP.clone();
      const tgt = hit.object.userData.target;
      if (tgt) {
        if (!tgt.down) {
          tgt.down = true; tgt.timer = 3;
          hits++;
          rangeEl.textContent = 'Targets hit: ' + hits;
          tone(1100, 0.12, 'triangle', 0.08);
        }
        addSparks(hit.point, n);
      } else {
        addDecal(hit.point, n);
        addSparks(hit.point, n);
      }
    }
  }

  // ------------------------------------------------------------ interaction
  function nearestItem() {
    let best = null, bestD = 2.4;
    for (const it of worldItems) {
      const dx = it.mesh.position.x - player.pos.x, dz = it.mesh.position.z - player.pos.z;
      const dy = Math.abs(it.mesh.position.y - (player.pos.y + 1.0));
      const d = Math.hypot(dx, dz);
      if (d < bestD && dy < 2.2) { best = it; bestD = d; }
    }
    return best;
  }

  function updateObjective() {
    const left = worldItems.length;
    const full = slots.every(Boolean);
    if (left === 0) objEl.textContent = 'You cleaned the place out. Nice work.';
    else if (full) objEl.textContent = 'Inventory full. Drop something with Q to carry more.';
    else objEl.textContent = left + ' loot item' + (left === 1 ? '' : 's') + ' left in the bank.';
  }

  function tryPickup() {
    const it = nearestItem();
    if (!it) return;
    const free = slots.findIndex(s => !s);
    if (free < 0) { toast('Inventory full! Drop something with Q'); return; }
    slots[free] = { type: it.type };
    scene.remove(it.mesh); scene.remove(it.ring);
    worldItems.splice(worldItems.indexOf(it), 1);
    tone(660, 0.08, 'square', 0.05); tone(990, 0.1, 'square', 0.05, 0.07);
    toast('Picked up ' + ITEM_TYPES[it.type].name + ' ($' + ITEM_TYPES[it.type].value.toLocaleString('en-US') + ')');
    renderInventory();
    updateObjective();
  }

  function dropSelected() {
    const s = slots[selected];
    if (!s) return;
    if (s.type === 'pistol') { toast("You can't drop your pistol"); return; }
    const p = new THREE.Vector3(player.pos.x - Math.sin(player.faceYaw) * 1.0, 0, player.pos.z - Math.cos(player.faceYaw) * 1.0);
    resolveCollisions(p, 0.3);
    spawnItem(s.type, p.x, insideBank(p.x, p.z) ? 0.02 : 0, p.z);
    slots[selected] = null;
    toast('Dropped ' + ITEM_TYPES[s.type].name);
    renderInventory();
    updateObjective();
  }

  function insideBank(x, z) { return x > -11.4 && x < 11.4 && z > -29.4 && z < -14.6; }

  function selectSlot(i) {
    selected = clamp(i, 0, 3);
    renderInventory();
  }

  // ---------------------------------------------------------------- physics
  function resolveCollisions(p, r) {
    for (const c of colliders) {
      const cx = clamp(p.x, c.minX, c.maxX), cz = clamp(p.z, c.minZ, c.maxZ);
      const dx = p.x - cx, dz = p.z - cz, d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2), push = r - d;
        p.x += (dx / d) * push; p.z += (dz / d) * push;
      } else {
        const l = p.x - c.minX, rr = c.maxX - p.x, t = p.z - c.minZ, b = c.maxZ - p.z;
        const m = Math.min(l, rr, t, b);
        if (m === l) p.x = c.minX - r; else if (m === rr) p.x = c.maxX + r;
        else if (m === t) p.z = c.minZ - r; else p.z = c.maxZ + r;
      }
    }
    p.x = clamp(p.x, -BOUND, BOUND);
    p.z = clamp(p.z, -BOUND, BOUND);
  }

  function angleLerp(a, b, t) {
    let d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    return a + d * t;
  }

  // ------------------------------------------------------------------ input
  const keys = {};
  let locked = false, forced = false;
  const isActive = () => locked || forced;

  document.addEventListener('keydown', e => {
    if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    keys[e.code] = true;
    if (e.repeat || !isActive()) return;
    if (e.code === 'Digit1') selectSlot(0);
    else if (e.code === 'Digit2') selectSlot(1);
    else if (e.code === 'Digit3') selectSlot(2);
    else if (e.code === 'Digit4') selectSlot(3);
    else if (e.code === 'KeyE') tryPickup();
    else if (e.code === 'KeyQ') dropSelected();
    else if (e.code === 'KeyR') startReload();
    else if (e.code === 'KeyM') { muted = !muted; toast(muted ? 'Sound off' : 'Sound on'); }
  });
  document.addEventListener('keyup', e => { keys[e.code] = false; });
  window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; aiming = false; });

  document.addEventListener('mousemove', e => {
    if (!isActive()) return;
    const sens = aiming ? 0.0016 : 0.0022;
    yaw -= e.movementX * sens;
    pitch = clamp(pitch - e.movementY * sens, -0.85, 0.9);
  });
  document.addEventListener('mousedown', e => {
    if (!isActive()) return;
    if (e.button === 0) shoot();
    else if (e.button === 2) aiming = true;
  });
  document.addEventListener('mouseup', e => { if (e.button === 2) aiming = false; });
  document.addEventListener('contextmenu', e => e.preventDefault());
  document.addEventListener('wheel', e => {
    if (!isActive()) return;
    selectSlot((selected + (e.deltaY > 0 ? 1 : 3)) % 4);
  }, { passive: true });

  overlay.addEventListener('click', () => {
    audio();
    try { renderer.domElement.requestPointerLock(); } catch (err) { /* ignore */ }
  });
  document.addEventListener('pointerlockchange', () => {
    locked = document.pointerLockElement === renderer.domElement;
    overlay.classList.toggle('hidden', locked);
    if (!locked) { aiming = false; overlayMsg.textContent = started ? 'Paused. Click to resume' : 'Click to play'; }
    else started = true;
  });
  document.addEventListener('pointerlockerror', () => {
    overlayMsg.textContent = 'Your browser blocked mouse capture. Click again.';
  });
  let started = false;

  // ----------------------------------------------------------------- update
  function updatePlayer(dt) {
    const ix = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
    const iz = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0);
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    const rx = Math.cos(yaw), rz = -Math.sin(yaw);
    let wx = fx * iz + rx * ix, wz = fz * iz + rz * ix;
    const wl = Math.hypot(wx, wz);
    if (wl > 1) { wx /= wl; wz /= wl; }

    const sprint = (keys.ShiftLeft || keys.ShiftRight) && iz > 0 && !aiming;
    const speed = aiming ? 2.6 : sprint ? 7.0 : 4.4;
    const k = Math.min(1, 12 * dt);
    player.vel.x += (wx * speed - player.vel.x) * k;
    player.vel.z += (wz * speed - player.vel.z) * k;

    if (keys.Space && player.onGround) { player.vy = 6.8; player.onGround = false; }
    player.vy -= 20 * dt;
    player.pos.y += player.vy * dt;
    if (player.pos.y <= 0) { player.pos.y = 0; player.vy = 0; player.onGround = true; }

    player.pos.x += player.vel.x * dt; resolveCollisions(player.pos, player.radius);
    player.pos.z += player.vel.z * dt; resolveCollisions(player.pos, player.radius);

    const sp = Math.hypot(player.vel.x, player.vel.z);
    const moving = sp > 0.4;
    const poseAim = holdingGun() && (aiming || gun.fired > 0);
    if (poseAim) player.faceYaw = angleLerp(player.faceYaw, yaw, 1 - Math.exp(-18 * dt));
    else if (moving) player.faceYaw = angleLerp(player.faceYaw, Math.atan2(-player.vel.x, -player.vel.z), 1 - Math.exp(-12 * dt));

    // animation
    player.walkPhase += dt * (4 + sp * 1.5);
    const amt = Math.min(1, sp / 4.4);
    const swing = Math.sin(player.walkPhase) * 0.85 * amt;
    model.group.position.copy(player.pos);
    model.group.rotation.y = player.faceYaw;
    model.legs[0].rotation.x = swing;
    model.legs[1].rotation.x = -swing;
    model.torso.position.y = 1.22 + Math.abs(Math.sin(player.walkPhase)) * 0.03 * amt;
    model.head.position.y = 1.62 + Math.abs(Math.sin(player.walkPhase)) * 0.03 * amt;

    const gunOn = holdingGun();
    model.gun.visible = gunOn;
    const sel = slots[selected];
    model.heldMoney.visible = !!sel && sel.type === 'money';
    model.heldGold.visible = !!sel && sel.type === 'gold';

    let rArm = -swing, lArm = swing;
    if (gunOn) {
      if (gun.reload > 0) { rArm = 0.7; lArm = 0.75; }
      else if (poseAim) { rArm = 1.45 + clamp(pitch, -0.6, 0.9) * 0.9; lArm = rArm - 0.1; }
      else { rArm = 0.8 + 0.03 * Math.sin(time * 2); lArm = swing * 0.6; }
      rArm += gun.kick * 0.22;
    }
    if (model.heldMoney.visible || model.heldGold.visible) lArm = 0.9;
    model.armR.rotation.x = rArm;
    model.armL.rotation.x = lArm;

    crossEl.classList.toggle('moving', sp > 1 || !player.onGround);
  }

  function updateCamera(dt) {
    const k = Math.min(1, 10 * dt);
    camDist += ((aiming ? 2.5 : 3.8) - camDist) * k;
    camShoulder += ((aiming ? 0.75 : 0.6) - camShoulder) * k;
    camera.fov += ((aiming ? 52 : 65) - camera.fov) * k;
    camera.updateProjectionMatrix();

    const cp = Math.cos(pitch);
    const dir = v1.set(-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp);
    const right = v2.set(Math.cos(yaw), 0, -Math.sin(yaw));
    const pivot = v3.set(player.pos.x, player.pos.y + 1.55, player.pos.z).addScaledVector(right, camShoulder);

    // pull the camera in if something is between the player and where it wants to be
    const back = dir.clone().negate();
    camRay.set(pivot, back);
    camRay.far = camDist;
    const h = camRay.intersectObjects(camSolids, false)[0];
    const d = h ? Math.max(0.45, h.distance - 0.25) : camDist;

    camera.position.copy(pivot).addScaledVector(dir, -d);
    if (camera.position.y < 0.25) camera.position.y = 0.25;
    camera.lookAt(pivot.clone().addScaledVector(dir, 10));
    model.group.visible = d > 0.9;

    sun.position.set(player.pos.x + 30, 50, player.pos.z + 20);
    sun.target.position.copy(player.pos);
  }

  let time = 0;
  let lastPrompt = '';
  function update(dt) {
    time += dt;

    // targets
    for (const t of targets) {
      if (t.down) {
        t.timer -= dt;
        t.board.rotation.x += (-1.45 - t.board.rotation.x) * Math.min(1, 14 * dt);
        if (t.timer <= 0) t.down = false;
      } else {
        t.board.rotation.x += (0 - t.board.rotation.x) * Math.min(1, 6 * dt);
      }
    }
    // floating loot
    for (const it of worldItems) {
      it.mesh.position.y = it.baseY + Math.sin(time * 2.2 + it.phase) * 0.05;
      it.mesh.rotation.y += dt * 1.2;
      it.ring.material.opacity = 0.35 + 0.25 * Math.sin(time * 3 + it.phase);
    }
    // effects
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      s.life -= dt; s.vel.y -= 9 * dt; s.m.position.addScaledVector(s.vel, dt);
      if (s.life <= 0) { scene.remove(s.m); sparks.splice(i, 1); }
    }
    for (let i = tracers.length - 1; i >= 0; i--) {
      const t = tracers[i];
      t.life -= dt; t.m.material.opacity = Math.max(0, t.life / 0.07) * 0.9;
      if (t.life <= 0) { scene.remove(t.m); t.m.material.dispose(); tracers.splice(i, 1); }
    }

    if (!isActive()) return;

    // weapon timers
    if (gun.cooldown > 0) gun.cooldown -= dt;
    if (gun.fired > 0) gun.fired -= dt;
    gun.kick = Math.max(0, gun.kick - dt * 7);
    if (gun.reload > 0) {
      gun.reload -= dt;
      if (gun.reload <= 0) {
        const take = Math.min(gun.size - gun.mag, gun.reserve);
        gun.mag += take; gun.reserve -= take;
      }
    }
    if (gun.flash > 0) {
      gun.flash -= dt;
      model.flash.visible = true; model.flashLight.intensity = 40;
    } else { model.flash.visible = false; model.flashLight.intensity = 0; }

    updatePlayer(dt);
    updateCamera(dt);

    // HUD
    const showAmmo = holdingGun();
    ammoEl.classList.toggle('dim', !showAmmo);
    crossEl.classList.toggle('hidden', !showAmmo && !aiming);
    ammoMagEl.textContent = gun.mag;
    ammoResEl.textContent = ' / ' + gun.reserve;
    reloadEl.classList.toggle('show', gun.reload > 0);

    const it = nearestItem();
    let p = '';
    if (it) p = '<b>E</b> &nbsp;Pick up ' + ITEM_TYPES[it.type].name + ' ($' + ITEM_TYPES[it.type].value.toLocaleString('en-US') + ')';
    if (p !== lastPrompt) {
      lastPrompt = p;
      promptEl.innerHTML = p;
      promptEl.classList.toggle('show', !!p);
    }
  }

  // ------------------------------------------------------------------- loop
  renderInventory();
  updateObjective();
  gun.mag = gun.size;

  // Optional test hooks: open the page with #debug in the URL
  if (location.hash === '#debug') {
    window.__bh = {
      activate(v) { forced = v; overlay.classList.toggle('hidden', v); },
      key(code, v) { keys[code] = v; },
      look(y, p) { yaw = y; pitch = p; },
      teleport(x, z) { player.pos.set(x, 0, z); },
      aim(v) { aiming = v; },
      shoot, tryPickup, dropSelected, selectSlot, startReload,
      get info() {
        return { pos: player.pos.toArray(), slots: slots.map(s => s && s.type), selected, mag: gun.mag, reserve: gun.reserve, hits, items: worldItems.length, decals: decals.length, loot: lootValue(), camera: camera.position.toArray() };
      }
    };
  }

  const clock = new THREE.Clock();
  function frame() {
    const dt = Math.min(0.05, clock.getDelta());
    update(dt);
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  frame();
})();
