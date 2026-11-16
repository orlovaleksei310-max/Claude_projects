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

  const hemi = new THREE.HemisphereLight(0xdfefff, 0x6b6558, 1.0);
  scene.add(hemi);
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
  const walkables = [];   // solid blocks you can stand on / climb (stairs, landings): {minX,maxX,minZ,maxZ,top}
  function groundAt(x, z, y) {          // height of the floor under (x,z) for something whose feet are at y
    let g = 0;
    for (const w of walkables) {
      if (x < w.minX || x > w.maxX || z < w.minZ || z > w.maxZ) continue;
      if (w.top <= y + 0.55 && w.top > g) g = w.top;
    }
    return g;
  }
  function blockedBySolid(p, y) {       // a block that is taller than a step blocks you from the side
    const ey = Math.max(y, groundAt(p.x, p.z, y));      // you step up onto whatever you are walking onto
    for (const w of walkables) {
      if (w.thin) continue;
      if (p.x > w.minX - 0.15 && p.x < w.maxX + 0.15 && p.z > w.minZ - 0.15 && p.z < w.maxZ + 0.15 && ey < w.top - 0.55) return true;
    }
    return false;
  }

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

  // ------------------------------------------------------------ heist locations
  // Every job uses the same plot and door; only the building, its props, staff and loot change.
  const LOCS = {
    bank: {
      id: 'bank', name: 'National Bank', place: 'bank', staff: 'teller', tag: 'Classic job. Marble, a vault and one nervous teller.',
      sign: 'NATIONAL BANK', signBg: '#0f3d2a', signFg: '#f2d36b', signFont: 'Georgia, serif',
      floor: ['#e9e4d8', '#b9b2a4'], npc: { shirt: 0xf1f1f1, vest: 0x8a1c2b, tie: 0x2a2a2a, pants: 0x2b2b33, hair: 0x4a3322 },
      loot: [['money', -8, 1.2, -21], ['money', -4, 1.2, -21], ['money', 0, 1.2, -21], ['gold', 7.8, 1.0, -27.5], ['gold', 9.4, 1.0, -27.5]]
    },
    power: {
      id: 'power', name: 'Power Plant', place: 'power plant', staff: 'operator', tag: 'Reconnect the wires at the control panel, take the power cells and cores, then run the laser corridor out the back. Jump the lasers!',
      sign: 'CITY POWER PLANT', signBg: '#12202e', signFg: '#ffd23f', signFont: 'Impact, Arial Black, sans-serif',
      wall: 0x6d7279, roof: 0x3a3f46, trim: 0xffd23f, floor: ['#4b5057', '#3e4349'], counter: 0x2f353d,
      npc: { shirt: 0xdcdcdc, vest: 0xe8742a, pants: 0x2f3640, cap: 0xffd23f },
      vault: true, wires: true, backDoor: true, corridor: true,
      loot: [['cell', 7.6, 1.0, -27.5], ['cell', 8.6, 1.0, -27.5], ['cell', 9.6, 1.0, -27.5], ['core', 6.4, 0.02, -27.2], ['core', 10.4, 0.02, -27.2]]
    },
    factory: {
      id: 'factory', name: 'The Factory', place: 'factory', staff: 'foreman', tag: 'Guards on patrol. Take the staff door at the back, climb the stairs, pick the lock, grab the goods and escape out the back door.',
      sign: 'ACME FACTORY', signBg: '#3a1c14', signFg: '#ffb347', signFont: 'Impact, Arial Black, sans-serif',
      wall: 0x8a4a3a, roof: 0x44302a, trim: 0xf2c94c, floor: ['#5d5a55', '#4d4a46'], counter: 0x4a4540,
      npc: { shirt: 0x3b5d9a, pants: 0x34507f, cap: 0xc0392b },
      guards: true, backDoor: true,
      loot: [['parts', 4.6, 4.4, -28.5], ['parts', 6.1, 4.4, -28.5], ['parts', 7.6, 4.4, -28.5], ['proto', 5.3, 4.4, -27.3], ['proto', 7.0, 4.4, -27.3]]
    },
    jewel: {
      id: 'jewel', name: 'The Crown Jewel', place: 'museum', staff: 'curator', tag: 'Hack the terminal (the FBI arrives right after), run the laser hallway, spin the vault open, take the Crown Jewel, climb to the roof and fly out.',
      sign: 'ROYAL MUSEUM', signBg: '#1a1230', signFg: '#ffd84a', signFont: 'Georgia, serif',
      wall: 0xe9e4d8, roof: 0x6b6f7a, trim: 0xd4af37, floor: ['#ece8de', '#bdb7aa'], counter: 0x4a3520,
      npc: { shirt: 0xf4f1ea, vest: 0x5b1a2e, pants: 0x23202b, tie: 0x5b1a2e },
      vault: true, hack: true, hallway: true, heli: true, waves: true, fbiFirst: true, machinePos: { x: 7.6, z: -26.2 },
      loot: [['crown', 7.6, 1.25, -27.6], ['gem', 6.8, 1.25, -27.6], ['gem', 8.4, 1.25, -27.6]]
    },
    casino: {
      id: 'casino', name: 'Golden Casino', place: 'casino', staff: 'dealer', tag: 'A black room full of gamblers. Crack the jackpot machine, but if the shooting starts the cops come in 10 seconds, then the FBI, wave after wave.',
      sign: 'GOLDEN CASINO', signBg: '#2a0f3d', signFg: '#ffd84a', signFont: 'Georgia, serif',
      wall: 0x0b0b0f, roof: 0x050507, trim: 0xffd84a, floor: ['#17171d', '#0d0d11'], counter: 0x15110d, crowd: true, waves: true,
      npc: { shirt: 0xf4f4f4, vest: 0x111111, tie: 0xb0122a, pants: 0x111111, hair: 0x2a1c12 },
      vault: true,       // the loot is locked inside the jackpot machine until you crack its code
      loot: [['chips', 6.4, 0.02, -26.8], ['chips', 7.4, 0.02, -26.8], ['chips', 8.4, 0.02, -26.8], ['bigchips', 9.4, 0.02, -26.8], ['bigchips', 10.4, 0.02, -26.8]]
    }
  };
  const SYMBOLS = ['🍒', '🍋', '🔔', '⭐', '7️⃣', '💎'];
  let LOC = LOCS.bank;
  try {
    const sv = JSON.parse(localStorage.getItem('bankheist-save-v1'));
    if (sv && LOCS[sv.next]) LOC = LOCS[sv.next];
  } catch (err) { /* storage can be blocked */ }


  // Props that make each job site look different (all inside the same footprint, behind or beside the counter)
  function buildProps(id) {
    const add = m => { scene.add(m); return m; };
    const glow = c => new THREE.MeshBasicMaterial({ color: c });
    const cyl = (rt, rb, h, m, x, y, z, o = {}) => {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, o.seg || 24), m);
      c.position.set(x, y, z); c.castShadow = c.receiveShadow = true; add(c);
      if (o.aim !== false) aimables.push(c);
      if (o.cam) camSolids.push(c);
      return c;
    };
    const light = (col, i, x, y, z) => { const l = new THREE.PointLight(col, i, 0, 2); l.position.set(x, y, z); scene.add(l); };
    const trimStrip = () => mat(0xf2c94c, { metalness: 0.3, roughness: 0.5 });

    if (id === 'power') {
      // reactor tower with glowing rings
      cyl(2.0, 2.2, 6.5, mat(0x3a444f, { metalness: 0.6, roughness: 0.4 }), -6.5, 3.25, -27, { cam: true });
      colliders.push({ minX: -8.7, maxX: -4.3, minZ: -29.2, maxZ: -24.8 });
      for (const y of [1.6, 3.2, 4.8]) {
        const r = new THREE.Mesh(new THREE.TorusGeometry(2.1, 0.09, 8, 36), glow(0x39e1ff));
        r.rotation.x = Math.PI / 2; r.position.set(-6.5, y, -27); add(r);
      }
      light(0x39e1ff, 45, -6.5, 3.5, -24.2);
      // transformers and control cabinets
      addBox(1.3, 2.6, 2.4, mat(0x56606b), -10.7, 1.3, -26.5, { block: true, cam: true });
      addBox(1.3, 2.6, 2.4, mat(0x56606b), 10.7, 1.3, -18.5, { block: true, cam: true });
      for (const x of [-7, 7]) {
        addBox(2.4, 1.9, 0.8, mat(0x3a4048), x, 0.95, -16.5, { block: true });
        addBox(2.0, 0.7, 0.05, glow(0x5dff9a), x, 1.35, -16.08, { aim: false });
      }
      addBox(20, 0.03, 0.4, mat(0xffd23f), 0, 0.045, -15.6, { cast: false, aim: false });   // hazard stripe
      for (const z of [-24, -19]) {                                                           // ceiling pipes
        const p = cyl(0.3, 0.3, 22, mat(0x8a929c, { metalness: 0.6, roughness: 0.4 }), 0, 8.8, z, { aim: false });
        p.rotation.z = Math.PI / 2;
      }

      // ---- the wire panel (back right): reconnect the wires to unlock the goods
      addBox(2.8, 2.8, 0.7, mat(0x2a2f36, { metalness: 0.5, roughness: 0.5 }), 8.6, 1.4, -29.05, { block: true, cam: true });
      addBox(2.2, 1.3, 0.04, glow(0x39e1ff), 8.6, 1.9, -28.68, { aim: false });
      const wireCols = [0xff3b3b, 0x3b8bff, 0xffd23f, 0x4dff7a, 0xc77bff];
      wireCols.forEach((c, i) => addBox(0.07, 0.5, 0.05, glow(c), 7.8 + i * 0.4, 0.75, -28.66, { aim: false }));
      const panelLamp = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.06), glow(0xff2a2a));
      panelLamp.position.set(8.6, 2.75, -28.68); add(panelLamp);
      LOC.lamp = panelLamp;
      light(0x39e1ff, 25, 8.6, 2.6, -26.8);
      // ---- the laser corridor behind the back door
      const lWall = mat(0x23272d, { metalness: 0.5, roughness: 0.6 });
      for (const sx of [-1.7, 1.7]) {
        addBox(0.3, 4, 14.4, lWall, sx, 2, -37.2, { block: true, cam: true });
        for (const z of [-31, -34, -37, -40, -43]) addBox(0.12, 0.12, 0.5, glow(0xff2a2a), sx - Math.sign(sx) * 0.16, 3.8, z, { aim: false });
      }
      addBox(3.4, 0.1, 14.4, mat(0x1a1d22, { metalness: 0.6, roughness: 0.5 }), 0, -0.02, -37.2, { cast: false });
      LOC.lasers = [];
      for (const z of [-32.4, -35.4, -38.4, -41.4]) {
        const beam = new THREE.Mesh(new THREE.BoxGeometry(3.1, 0.07, 0.07), glow(0xff2a2a));
        beam.position.set(0, 0.55, z); add(beam);
        for (const sx of [-1.5, 1.5]) addBox(0.2, 0.5, 0.2, steel, sx, 0.4, z, { aim: false });
        light(0xff2020, 8, 0, 1.2, z);
        LOC.lasers.push({ z, mesh: beam, cd: 0 });
      }
      const exitTexP = canvasTex(256, 96, (c, w, h) => {
        c.fillStyle = '#0c2a18'; c.fillRect(0, 0, w, h); c.fillStyle = '#5dff9a';
        c.font = 'bold 56px Arial'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('EXIT', w / 2, h / 2 + 3);
      });
      for (const [z, ry] of [[-29.35, 0], [-30.03, Math.PI]]) {
        const ex = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.68), new THREE.MeshBasicMaterial({ map: exitTexP }));
        ex.position.set(0, 4.3, z); ex.rotation.y = ry; add(ex);
      }
      const warnTex = canvasTex(256, 96, (c, w, h) => {
        c.fillStyle = '#2a0808'; c.fillRect(0, 0, w, h); c.fillStyle = '#ff5a5a';
        c.font = 'bold 34px Arial'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('LASERS: JUMP!', w / 2, h / 2 + 3);
      });
      const warn = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.9), new THREE.MeshBasicMaterial({ map: warnTex }));
      warn.position.set(0, 3.2, -29.33); add(warn);
      addBox(14, 0.1, 6, mat(0x1a1d22), 0, -0.04, -45.5, { cast: false });
      light(0xff4040, 30, 0, 3, -36);
    } else if (id === 'factory') {
      // conveyor belt along the back wall with boxes on it
      addBox(7, 0.7, 1.2, mat(0x2a2a2e), -6.5, 0.35, -28.4, { block: true, cam: true });
      addBox(6.6, 0.06, 0.9, mat(0x111114), -6.5, 0.72, -28.4, { aim: false });
      for (let x = -9.5; x <= -3.5; x += 1.1) addBox(0.08, 0.08, 1.0, mat(0xf2c94c), x, 0.77, -28.4, { aim: false, cast: false });
      for (const [x, c] of [[-8, 0x9a6b3a], [-5, 0xb38049]]) addBox(0.8, 0.7, 0.8, mat(c), x, 1.1, -28.4);
      // a big press
      for (const x of [-9, -5]) addBox(0.7, 6, 0.7, mat(0xc0392b), x, 3, -25.5, { block: true, cam: true });
      addBox(5.6, 0.9, 1.1, mat(0xc0392b), -7, 6.3, -25.5, { cam: true });
      cyl(0.45, 0.45, 2.6, mat(0x8a929c, { metalness: 0.7, roughness: 0.35 }), -7, 4.6, -25.5);
      addBox(3.2, 0.9, 1.4, mat(0x44474d), -7, 0.45, -25.5, { block: true });
      // barrels and stacked crates
      for (const [x, z] of [[10.6, -17.5], [10.6, -19.2], [-10.6, -17]]) cyl(0.42, 0.42, 1.0, mat(0xe8742a), x, 0.5, z, { cam: true }) && colliders.push({ minX: x - 0.45, maxX: x + 0.45, minZ: z - 0.45, maxZ: z + 0.45 });
      for (const x of [-7, 7]) {
        addBox(1.6, 1.0, 1.4, mat(0x9a6b3a), x, 0.5, -16.5, { block: true });
        addBox(1.2, 0.9, 1.1, mat(0xb38049), x + 0.1, 1.45, -16.5);
      }
      for (const x of [-4, 4]) cyl(0.12, 0.12, 22, mat(0xd4af37, { metalness: 0.5, roughness: 0.4 }), 0, 8.9, -22 + x * 0.3, { aim: false }).rotation.z = Math.PI / 2;

      // ---- the back stairwell: staff door -> stairs -> locked vault door -> the goods, then out the back door
      const wallF = mat(0x8a4a3a, { roughness: 0.9 }), concF = mat(0x8c8c88, { roughness: 0.9 }), stepF = mat(0xb9b5ad, { roughness: 0.8 });
      const solid = (w, h, d, m, x, y, z, top) => { const b = addBox(w, h, d, m, x, y, z, { cam: true }); walkables.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, top }); return b; };
      addBox(0.3, 10, 4.8, wallF, 3.0, 5, -27.0, { block: true, cam: true });            // west wall of the stairwell
      addBox(6.4, 10, 0.3, wallF, 8.2, 5, -24.6, { block: true, cam: true });            // partition (the doorway is at x 3.15 - 5.0)
      addBox(1.85, 6.0, 0.3, wallF, 4.1, 7.0, -24.6, { cam: true });                     // lintel over the staff door
      addBox(6.55, 10, 0.3, wallF, 6.425, 5, -26.6, { block: true, cam: true });         // wall between stairs and vault
      addBox(0.3, 10, 0.8, wallF, 9.7, 5, -29.0, { block: true, cam: true });            // vault east wall, either side of the door
      addBox(0.3, 10, 0.6, wallF, 9.7, 5, -26.9, { block: true, cam: true });
      addBox(0.3, 3.0, 1.4, wallF, 9.7, 8.5, -27.9, { cam: true });
      for (let i = 0; i < 10; i++) {                                                      // ten steps, 0.44 high each
        const top = (i + 1) * 0.44;
        solid(0.45, top, 1.7, stepF, 5.2 + 0.45 * i + 0.225, top / 2, -25.6, top);
      }
      solid(1.7, 4.4, 4.8, concF, 10.55, 2.2, -27.0, 4.4);                                // landing at the top
      solid(6.55, 4.4, 2.8, concF, 6.425, 2.2, -28.0, 4.4);                              // the vault floor
      addBox(6.3, 0.02, 2.6, mat(0x45494f, { metalness: 0.5, roughness: 0.5 }), 6.425, 4.41, -28.0, { aim: false, cast: false });
      for (const x of [3.5, 9.4]) addBox(0.1, 2.2, 0.5, steel, x, 5.5, -29.1, { aim: false });   // shelving along the vault wall
      addBox(6.0, 0.1, 0.5, steel, 6.4, 5.2, -29.1, { aim: false });
      addBox(6.0, 0.1, 0.5, steel, 6.4, 6.4, -29.1, { aim: false });
      // the (open) staff door and its sign
      addBox(0.08, 2.8, 0.95, mat(0x6b4423), 5.04, 1.4, -24.12, { aim: false });
      const staffTex = canvasTex(256, 96, (c, w, h) => {
        c.fillStyle = '#1a1a1d'; c.fillRect(0, 0, w, h); c.strokeStyle = '#ffd23f'; c.lineWidth = 6; c.strokeRect(5, 5, w - 10, h - 10);
        c.fillStyle = '#ffd23f'; c.font = 'bold 42px Arial'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('STAFF ONLY', w / 2, h / 2 + 3);
      });
      const staffSign = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.64), new THREE.MeshBasicMaterial({ map: staffTex }));
      staffSign.position.set(4.1, 3.3, -24.42); add(staffSign);
      // the locked door at the top of the stairs
      const lockPivot = new THREE.Group(); lockPivot.position.set(9.7, 4.4, -28.6); add(lockPivot);
      const lockDoor = new THREE.Mesh(new THREE.BoxGeometry(0.14, 2.6, 1.4), mat(0x6b7480, { metalness: 0.7, roughness: 0.35 }));
      lockDoor.position.set(0, 1.3, 0.7); lockDoor.castShadow = true; lockPivot.add(lockDoor);
      const lockLamp = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.22, 0.22), glow(0xff2a2a));
      lockLamp.position.set(0.1, 1.3, 1.15); lockPivot.add(lockLamp);
      const lockCol = { minX: 9.55, maxX: 9.85, minZ: -28.6, maxZ: -27.2 };
      colliders.push(lockCol);
      LOC.lock = { pivot: lockPivot, lamp: lockLamp, col: lockCol, open: false, t: 0, swing: 0 };
      light(0xffd9a0, 16, 7.5, 3.2, -25.2); light(0xffb36b, 14, 10.5, 6.8, -26.4); light(0xfff2cc, 22, 6.4, 8.2, -28.0);
      // the back door out
      const exitTex = canvasTex(256, 96, (c, w, h) => {
        c.fillStyle = '#0c2a18'; c.fillRect(0, 0, w, h); c.fillStyle = '#5dff9a';
        c.font = 'bold 56px Arial'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('EXIT', w / 2, h / 2 + 3);
      });
      for (const [z, ry] of [[-29.35, 0], [-30.03, Math.PI]]) {
        const ex = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.68), new THREE.MeshBasicMaterial({ map: exitTex }));
        ex.position.set(0, 4.3, z); ex.rotation.y = ry; add(ex);
      }
      addBox(0.2, 3.6, 0.7, trimStrip(), -1.3, 1.8, -29.7, { aim: false });
      addBox(0.2, 3.6, 0.7, trimStrip(), 1.3, 1.8, -29.7, { aim: false });
      // the back lot
      addBox(44, 0.1, 17, mat(0x7a776f, { roughness: 0.95 }), 0, -0.04, -38.5, { cast: false });
      addBox(3.2, 1.5, 1.5, mat(0x2f6b3d), -10, 0.75, -33, { block: true, cam: true });         // dumpster
      addBox(3.4, 0.2, 0.2, mat(0x1c3f25), -10, 1.55, -33, { aim: false });
      for (const [x, z] of [[9, -33], [11, -34.5]]) addBox(1.4, 0.9, 1.4, mat(0x9a6b3a), x, 0.45, z, { block: true });
      light(0xfff2cc, 40, 0, 6, -35);
    } else if (id === 'jewel') {
      const dark = mat(0x23202b, { metalness: 0.4, roughness: 0.6 }), marble = mat(0xf6f3ec, { roughness: 0.3 });
      const goldM = mat(0xd4af37, { metalness: 0.8, roughness: 0.3 });
      // curator's desk and the red carpet
      addBox(2.4, 1.0, 1.0, mat(0x4a3520), -4, 0.5, -21.3, { block: true, cam: true });
      addBox(2.5, 0.08, 1.1, goldM, -4, 1.02, -21.3, { aim: false });
      const carpet = new THREE.Mesh(new THREE.PlaneGeometry(3, 9), mat(0x7a1f2b, { roughness: 0.95 }));
      carpet.rotation.x = -Math.PI / 2; carpet.position.set(0, 0.035, -19.4); scene.add(carpet);
      // display cases with gems
      for (const [x, z, col] of [[-6.5, -17.3, 0x39e1ff], [6.5, -17.3, 0xff6fb5], [9.6, -18.8, 0xb6ff6b], [-8.4, -23.2, 0xc77bff]]) {
        addBox(1.2, 0.9, 1.2, marble, x, 0.45, z, { block: true, cam: true });
        addBox(1.0, 0.75, 1.0, mat(0xbfe8ff, { transparent: true, opacity: 0.25, metalness: 0.9, roughness: 0.05 }), x, 1.28, z, { aim: false });
        const g = new THREE.Mesh(new THREE.OctahedronGeometry(0.2), new THREE.MeshBasicMaterial({ color: col }));
        g.position.set(x, 1.3, z); scene.add(g);
      }
      // paintings
      [[-11.33, 3.6, -17], [-11.33, 3.6, -23], [11.33, 3.6, -17.5]].forEach(([x, y, z], i) => {
        const ry = x < 0 ? Math.PI / 2 : -Math.PI / 2;
        const fr = addBox(0.08, 1.9, 2.6, goldM, x + (x < 0 ? 0.02 : -0.02), y, z, { aim: false });
        const pic = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 1.6), new THREE.MeshBasicMaterial({ color: [0x3a5a8a, 0x8a4a3a, 0x4a7a5a][i] }));
        pic.position.set(x + (x < 0 ? 0.07 : -0.07), y, z); pic.rotation.y = ry; scene.add(pic);
      });
      // the security terminal on the west wall
      addBox(1.0, 0.8, 1.8, dark, -10.9, 0.4, -19.8, { block: true, cam: true });
      addBox(0.15, 0.8, 1.1, dark, -11.1, 1.2, -19.8, { aim: false });
      const scr = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.65), new THREE.MeshBasicMaterial({ color: 0x39e1ff }));
      scr.position.set(-11.0, 1.2, -19.8); scr.rotation.y = Math.PI / 2; scene.add(scr);
      LOC.hackScreen = scr;
      addBox(0.35, 0.04, 0.7, mat(0x111), -10.55, 0.82, -19.8, { aim: false });
      light(0x39e1ff, 14, -9.6, 2.2, -19.8);
      // partition between gallery and hall, with the security shutter at the west end
      addBox(14.15, 10, 0.3, wallM, -2.225, 5, -25.9, { block: true, cam: true });
      addBox(2.1, 5.4, 0.3, wallM, -10.35, 7.3, -25.9, { cam: true });
      const hd = addBox(2.1, 4.6, 0.2, mat(0x5a6270, { metalness: 0.8, roughness: 0.35 }), -10.35, 2.3, -25.9, { cam: true });
      const hdCol = { minX: -11.4, maxX: -9.3, minZ: -26.05, maxZ: -25.75 }; colliders.push(hdCol);
      LOC.hallDoor = { mesh: hd, col: hdCol, t: 0, open: false };
      addBox(0.3, 10, 5.1, wallM, 4.85, 5, -23.55, { block: true, cam: true });
      addBox(6.55, 10, 0.3, wallM, 8.125, 5, -21.0, { block: true, cam: true });
      addBox(0.3, 5.7, 3.3, wallM, 4.85, 7.15, -27.75, { cam: true });
      // the dark laser hall: x -11.4 .. 4.85, z -29.4 .. -26.05
      addBox(16.25, 10, 0.05, dark, -3.3, 5, -29.35, { aim: false });
      addBox(14.2, 10, 0.05, dark, -2.2, 5, -26.1, { aim: false });
      addBox(16.25, 0.2, 3.5, dark, -3.3, 4.2, -27.7, { cam: true });
      addBox(16.25, 0.03, 3.3, mat(0x14121a, { metalness: 0.6, roughness: 0.4 }), -3.3, 0.04, -27.7, { aim: false, cast: false });
      light(0xff4040, 22, -7, 3, -27.7); light(0xff4040, 22, -0.5, 3, -27.7); light(0xff4040, 18, 3.5, 3, -27.7);
      LOC.lasers = [];
      for (const [x, kind, off] of [[-7.4, 'low', 0], [-4.8, 'blink', 0], [-2.2, 'low', 0], [0.4, 'blink', 1.4], [3.0, 'low', 0]]) {
        const meshes = [];
        const ys = kind === 'low' ? [0.55] : [0.3, 0.8, 1.3, 1.8];
        for (const y of ys) {
          const b = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 3.2), glow(0xff2a2a));
          b.position.set(x, y, -27.7); scene.add(b); meshes.push(b);
        }
        for (const z of [-26.25, -29.2]) addBox(0.2, kind === 'low' ? 0.5 : 2.1, 0.2, steel, x, kind === 'low' ? 0.4 : 1.05, z, { aim: false });
        LOC.lasers.push({ axis: 'x', x, kind, off, meshes, cd: 0 });
      }
      // the vault chamber: vault door on the back wall, the crown in a locked case
      const vdoor = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.3, 0.6, 32), mat(0x8a9099, { metalness: 0.8, roughness: 0.35 }));
      vdoor.rotation.x = Math.PI / 2; vdoor.position.set(7.6, 3.1, -29.1); vdoor.castShadow = true; scene.add(vdoor);
      const wheel = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.12, 10, 28), goldM); wheel.position.set(7.6, 3.1, -28.7); scene.add(wheel);
      for (let i = 0; i < 3; i++) { const sp = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.12, 0.12), goldM); sp.position.set(7.6, 3.1, -28.7); sp.rotation.z = i * Math.PI / 3; scene.add(sp); }
      const cyl2 = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.05, 0.9, 24), marble); cyl2.position.set(7.6, 0.45, -27.6); scene.add(cyl2); aimables.push(cyl2);
      colliders.push({ minX: 6.6, maxX: 8.6, minZ: -28.6, maxZ: -26.6 });
      const glass = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.8, 1.6), new THREE.MeshStandardMaterial({ color: 0xbfe8ff, transparent: true, opacity: 0.35, metalness: 0.9, roughness: 0.05 }));
      glass.position.set(7.6, 1.3, -27.6); scene.add(glass); LOC.glass = glass;
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.06), glow(0xff2a2a)); lamp.position.set(7.6, 1.0, -26.7); scene.add(lamp); LOC.lamp = lamp;
      LOC.code = SYMBOLS.map((_, i) => i).sort(() => Math.random() - 0.5).slice(0, 3);
      light(0xffd9a0, 30, 8, 6, -25); light(0xffe08a, 20, 7.6, 2.8, -27);
      // ladder up to the roof hatch (east wall of the chamber)
      for (const z of [-22.55, -21.85]) addBox(0.08, 10.8, 0.08, steel, 11.25, 5.4, z, { aim: false });
      for (let y = 0.4; y < 10.7; y += 0.4) addBox(0.06, 0.06, 0.8, steel, 11.25, y, -22.2, { aim: false });
      light(0xfff2cc, 25, 10.4, 8, -22.2);
    } else if (id === 'casino') {
      // slot machines along the back wall
      const cols = [0xff3b6b, 0x39e1ff, 0xffd23f, 0x5dff9a, 0xb67bff];
      cols.forEach((c, i) => {
        const x = -10 + i * 1.45;
        addBox(1.25, 2.3, 0.95, mat(0x2a1538), x, 1.15, -28.8, { block: true, cam: true });
        addBox(0.9, 0.7, 0.04, glow(c), x, 1.6, -28.3, { aim: false });
        addBox(1.25, 0.25, 0.97, mat(0xffd84a, { metalness: 0.6, roughness: 0.4 }), x, 2.4, -28.8, { aim: false });
        light(c, 6, x, 1.8, -27.6);
      });
      // the secret code: three clue notes (one per reel) hidden at random spots, different every visit
      const flat = -Math.PI / 2, spots = [
        [-8.5, 3.6, -29.35, 0, 0], [-5.5, 3.6, -29.35, 0, 0],            // back wall, above the slot machines
        [-11.35, 2.4, -25.5, Math.PI / 2, 0], [-11.35, 2.4, -18.5, Math.PI / 2, 0],   // left wall
        [11.35, 2.4, -23.5, -Math.PI / 2, 0], [11.35, 2.4, -18.5, -Math.PI / 2, 0],   // right wall
        [-6, 2.4, -14.55, Math.PI, 0], [6.5, 2.4, -14.55, Math.PI, 0],   // inside of the front wall
        [-9, 1.16, -21, 0, flat], [1.5, 1.16, -21, 0, flat],             // on the dealer's counter
        [-7, 1.0, -15.9, 0, flat], [7, 1.0, -15.9, 0, flat]              // on the roulette tables
      ].sort(() => Math.random() - 0.5).slice(0, 3);
      LOC.code = SYMBOLS.map((_, i) => i).sort(() => Math.random() - 0.5).slice(0, 3);
      LOC.clues = spots.map((sp, reel) => ({ reel, spot: sp.slice(0, 3) }));
      spots.forEach((sp, reel) => {
        const tex = canvasTex(256, 320, (c, w, h) => {
          c.fillStyle = '#fff6c9'; c.fillRect(0, 0, w, h);
          c.strokeStyle = '#c0152b'; c.lineWidth = 8; c.strokeRect(6, 6, w - 12, h - 12);
          c.fillStyle = '#c0152b'; c.font = 'bold 34px Arial'; c.textAlign = 'center'; c.textBaseline = 'middle';
          c.fillText('REEL ' + (reel + 1), w / 2, 46);
          c.fillStyle = '#222'; c.font = '150px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
          c.fillText(SYMBOLS[LOC.code[reel]], w / 2, h / 2 + 42);
        });
        const note = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.9), new THREE.MeshBasicMaterial({ map: tex }));
        note.position.set(sp[0], sp[1], sp[2]); note.rotation.set(sp[4], sp[3], 0, 'YXZ');
        scene.add(note);
      });

      // the jackpot machine (locked until you crack the code)
      addBox(2.8, 3.6, 1.3, mat(0x3a1250, { metalness: 0.3, roughness: 0.5 }), 8.6, 1.8, -29.0, { block: true, cam: true });
      addBox(3.0, 0.35, 1.35, mat(0xffd84a, { metalness: 0.7, roughness: 0.35 }), 8.6, 3.75, -29.0, { aim: false });
      addBox(1.9, 0.9, 0.05, glow(0xff3b6b), 8.6, 3.0, -28.32, { aim: false });
      for (let i = 0; i < 3; i++) addBox(0.5, 0.65, 0.06, glow(0xfff2cc), 7.95 + i * 0.65, 3.0, -28.28, { aim: false });
      const mDoor = addBox(2.0, 1.5, 0.12, mat(0x8a929c, { metalness: 0.7, roughness: 0.3 }), 8.6, 1.0, -28.32, { aim: false });
      const lamp = addBox(0.3, 0.3, 0.1, glow(0xff2a2a), 8.6, 1.95, -28.27, { aim: false });
      LOC.door = mDoor; LOC.lamp = lamp;
      light(0xffd84a, 14, 8.6, 3.2, -27);
      // roulette tables where the lobby benches would be
      for (const x of [-7, 7]) {
        cyl(1.35, 1.35, 0.9, mat(0x1c1a22), x, 0.45, -16.5, { cam: true });
        cyl(1.3, 1.3, 0.06, mat(0x0f6b3a), x, 0.93, -16.5);
        cyl(0.55, 0.55, 0.08, mat(0x7a4a22), x, 1.0, -16.5, { aim: false });
        colliders.push({ minX: x - 1.4, maxX: x + 1.4, minZ: -17.9, maxZ: -15.1 });
      }
      // a black room lit by neon
      const neonPink = new THREE.MeshBasicMaterial({ color: 0xff3fa4 }), neonCyan = new THREE.MeshBasicMaterial({ color: 0x39e1ff });
      for (const [y, m] of [[0.3, neonPink], [8.7, neonCyan]]) {
        addBox(0.08, 0.08, 14.6, m, -11.3, y, -22, { cast: false, aim: false });
        addBox(0.08, 0.08, 14.6, m, 11.3, y, -22, { cast: false, aim: false });
        addBox(22.6, 0.08, 0.08, m, 0, y, -29.3, { cast: false, aim: false });
        addBox(22.6, 0.08, 0.08, m, 0, y, -14.7, { cast: false, aim: false });
      }
      light(0xff3fa4, 45, -9, 6, -17); light(0x39e1ff, 45, 9, 6, -17); light(0xb67bff, 40, 0, 6, -26);
      // chandelier
      const ch = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.1, 8, 32), mat(0xffd84a, { metalness: 0.8, roughness: 0.3 }));
      ch.rotation.x = Math.PI / 2; ch.position.set(0, 8.4, -21); add(ch);
      for (let i = 0; i < 8; i++) {
        const a = i / 8 * Math.PI * 2, b = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), glow(0xfff2cc));
        b.position.set(Math.cos(a) * 1.6, 8.4, -21 + Math.sin(a) * 1.6); add(b);
      }
      light(0xffd9a0, 40, 0, 8, -21);
      addBox(4, 0.02, 3, mat(0xffd84a), 0, 0.045, -14.9, { cast: false, aim: false });
    }
  }

  // ---- The job site
  const T = 0.6;
  const wallM = LOC.wall ? mat(LOC.wall, { roughness: 0.9 }) : stone;
  const trimM = LOC.trim ? mat(LOC.trim, { metalness: 0.3, roughness: 0.5 }) : gold;
  const roofM2 = LOC.roof ? mat(LOC.roof) : darkStone;
  if (LOC.backDoor) {                                                         // back wall with an exit door in the middle
    addBox(10.8, 10, T, wallM, -6.6, 5, -29.7, { block: true, cam: true });
    addBox(10.8, 10, T, wallM, 6.6, 5, -29.7, { block: true, cam: true });
    addBox(2.4, 6.4, T, wallM, 0, 6.8, -29.7, { cam: true });
  } else addBox(24, 10, T, wallM, 0, 5, -29.7, { block: true, cam: true });   // back wall
  addBox(T, 10, 16, wallM, -11.7, 5, -22, { block: true, cam: true });        // left wall
  addBox(T, 10, 16, wallM, 11.7, 5, -22, { block: true, cam: true });         // right wall
  addBox(10, 10, T, wallM, -7, 5, -14.3, { block: true, cam: true });         // front, left of door
  addBox(10, 10, T, wallM, 7, 5, -14.3, { block: true, cam: true });          // front, right of door
  addBox(4, 5.5, T, wallM, 0, 7.25, -14.3, { cam: true });                    // lintel over the door
  if (LOC.heli) {                                                             // roof with a hatch (for the ladder) and a flat top you can walk on
    addBox(22.9, 0.8, 19, roofM2, -1.55, 10.4, -21.25, { cam: true });
    addBox(3.1, 0.8, 7.75, roofM2, 11.45, 10.4, -26.875, { cam: true });
    addBox(3.1, 0.8, 9.65, roofM2, 11.45, 10.4, -16.575, { cam: true });
    addBox(1.7, 0.8, 1.6, roofM2, 12.15, 10.4, -22.2, { cam: true });
    for (const w of [[-13, 9.9, -30.75, -11.75], [9.9, 13, -30.75, -23], [9.9, 13, -21.4, -11.75], [11.3, 13, -23, -21.4]])
      walkables.push({ minX: w[0], maxX: w[1], minZ: w[2], maxZ: w[3], top: 10.8, thin: true });
    const par = mat(0xb9b5ad);
    addBox(26, 1.0, 0.3, par, 0, 11.3, -30.6, { aim: false }); addBox(0.3, 1.0, 19, par, -12.85, 11.3, -21.25, { aim: false });
    addBox(0.3, 1.0, 19, par, 12.85, 11.3, -21.25, { aim: false }); addBox(26, 1.0, 0.3, par, 0, 11.3, -11.9, { aim: false });
    const pad = new THREE.Mesh(new THREE.RingGeometry(2.6, 2.9, 40), new THREE.MeshBasicMaterial({ color: 0xffd23f, side: THREE.DoubleSide }));
    pad.rotation.x = -Math.PI / 2; pad.position.set(-3, 10.83, -21); scene.add(pad);
  } else addBox(26, 0.8, 19, roofM2, 0, 10.4, -21.25, { cam: true });             // roof
  addBox(24, 0.4, 0.2, trimM, 0, 9.4, -13.88, { aim: false });                 // gold trim
  for (const x of [-10.5, -7, -3.6, 3.6, 7, 10.5]) {                          // columns
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.55, 10, 20), wallM);
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
  for (const x of [-2, 2]) addBox(0.2, 4.5, 0.7, trimM, x, 2.25, -14.3, { aim: false });   // door frame

  const signTex = canvasTex(1024, 200, (c, w, h) => {
    c.fillStyle = LOC.signBg; c.fillRect(0, 0, w, h);
    c.strokeStyle = LOC.id === 'bank' ? '#d4af37' : LOC.signFg; c.lineWidth = 10; c.strokeRect(8, 8, w - 16, h - 16);
    c.fillStyle = LOC.signFg; c.font = 'bold ' + (LOC.sign.length > 14 ? 92 : 108) + 'px ' + LOC.signFont;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(LOC.sign, w / 2, h / 2 + 6);
  });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(9, 1.76), new THREE.MeshBasicMaterial({ map: signTex }));
  sign.position.set(0, 7.3, -13.97);
  scene.add(sign);

  // Interior
  const floorTex = canvasTex(128, 128, (c, w, h) => {
    c.fillStyle = LOC.floor[0]; c.fillRect(0, 0, w, h);
    c.fillStyle = LOC.floor[1]; c.fillRect(0, 0, w / 2, h / 2); c.fillRect(w / 2, h / 2, w / 2, h / 2);
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

  if (!LOC.hallway) {
  addBox(14, 1.1, 1.2, LOC.counter ? mat(LOC.counter) : wood, -3, 0.55, -21, { block: true, cam: true });       // teller counter
  addBox(14.4, 0.1, 1.5, mat(0x2b2b2b, { roughness: 0.3 }), -3, 1.15, -21, { aim: true });
  }
  if (LOC.id === 'bank') {
    addBox(3.2, 0.5, 0.8, mat(0x5a3b22), -7, 0.25, -16.5, { block: true });     // lobby benches
    addBox(3.2, 0.5, 0.8, mat(0x5a3b22), 7, 0.25, -16.5, { block: true });
  }

  if (LOC.id === 'bank') {
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
  } else buildProps(LOC.id);
  if (LOC.id !== 'casino' && LOC.id !== 'factory') addBox(3, 1.0, 1.2, steel, 8.6, 0.5, -27.5, { block: true });               // table holding the gold

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

  function addHeli(x, y, z) {
    const g = new THREE.Group(); g.position.set(x, y, z);
    const body = mat(0x1d2c47, { metalness: 0.5, roughness: 0.35 }), white = mat(0xf2f2f2), glassM = mat(0x7fc8ff, { metalness: 0.8, roughness: 0.1, transparent: true, opacity: 0.75 }), steelM = mat(0x777b82, { metalness: 0.7, roughness: 0.4 });
    const bx = (w, h, d, m, px, py, pz) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(px, py, pz); b.castShadow = true; g.add(b); return b; };
    bx(2.8, 1.3, 1.6, body, 0, 1.3, 0); bx(1.0, 1.0, 1.4, glassM, 1.6, 1.2, 0); bx(2.82, 0.15, 1.62, white, 0, 1.1, 0);
    bx(3.6, 0.3, 0.3, body, -3.0, 1.6, 0); bx(0.15, 0.9, 0.5, body, -4.7, 2.0, 0);
    for (const sz of [-0.75, 0.75]) { bx(3.2, 0.08, 0.1, steelM, 0.2, 0.25, sz); bx(0.08, 0.7, 0.08, steelM, -0.6, 0.6, sz); bx(0.08, 0.7, 0.08, steelM, 1.0, 0.6, sz); }
    bx(0.2, 0.5, 0.2, steelM, 0, 2.1, 0);
    const rotor = new THREE.Group(); rotor.position.set(0, 2.4, 0); g.add(rotor);
    for (const r of [0, Math.PI / 2]) { const bl = new THREE.Mesh(new THREE.BoxGeometry(7, 0.05, 0.3), steelM); bl.rotation.y = r; rotor.add(bl); }
    const tail = new THREE.Group(); tail.position.set(-4.75, 2.0, 0.3); g.add(tail);
    tail.add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.3, 0.12), steelM));
    g.userData.rotor = rotor; g.userData.tail = tail;
    scene.add(g);
    return g;
  }
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
    return g;
  }
  const getawayCar = LOC.heli ? addHeli(-3, 10.8, -21) : LOC.corridor ? addCar(0, -47.4, 0x111114) : LOC.backDoor ? addCar(-1, -33.4, 0x111114) : addCar(-12, -2.5, 0x111114);   // the getaway car (behind the building at the factory)
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
    gold:   { name: 'Gold Bar',  icon: '🥇', value: 10000, half: 0.1 },
    cell:    { name: 'Power Cell',    icon: '🔋', value: 4000,  half: 0.22 },
    core:    { name: 'Fusion Core',   icon: '⚛️', value: 12000, half: 0.22 },
    parts:   { name: 'Parts Crate',   icon: '📦', value: 3000,  half: 0.22 },
    proto:   { name: 'Prototype',     icon: '⚙️', value: 10000, half: 0.2 },
    chips:   { name: 'Chip Stack',    icon: '🎰', value: 6000,  half: 0.2 },
    bigchips: { name: 'Black Chips',  icon: '♠️', value: 15000, half: 0.22 },
    knife:   { name: 'Knife',    icon: '🔪', value: 0, half: 0 },
    shotgun: { name: 'Shotgun',  icon: '💥', value: 0, half: 0 },
    sniper:  { name: 'Sniper',   icon: '🎯', value: 0, half: 0 },
    rifle:   { name: 'Assault Rifle', icon: '🔥', value: 0, half: 0 },
    crown:   { name: 'Crown Jewel',   icon: '👑', value: 40000,  half: 0.3 },
    gem:     { name: 'Diamond',       icon: '💎', value: 10000,  half: 0.2 }
  };

  // Weapons. The pistol does 5 damage; the black-market guns are bought at the HQ.
  const WEAPONS = {
    pistol:  { name: 'Pistol',        price: 0,      dmg: 5,  pellets: 1, spread: 0,     size: 12, reserve: 60,  cd: 0.2,  auto: false, reload: 1.3, fov: 52, dist: 2.5, snd: 1.0, mz: -0.36, kick: 0.012 },
    shotgun: { name: 'Shotgun',       price: 25000,  dmg: 6,  pellets: 8, spread: 0.055, size: 6,  reserve: 30,  cd: 0.85, auto: false, reload: 2.0, fov: 50, dist: 2.5, snd: 1.6, mz: -0.84, kick: 0.05 },
    sniper:  { name: 'Sniper',        price: 100000, dmg: 25, headDmg: 100, pellets: 1, spread: 0,     size: 5,  reserve: 20,  cd: 1.3,  auto: false, reload: 2.4, fov: 18, dist: 2.0, snd: 1.8, mz: -1.08, kick: 0.07 },
    knife:   { name: 'Knife',         price: 125000,  dmg: 100, pellets: 1, spread: 0,     size: 0,  reserve: 0,   cd: 0.5,  auto: false, reload: 0,   fov: 58, dist: 2.8, snd: 0.5, mz: -0.3,  kick: 0.0,  melee: true, range: 2.6 },
    rifle:   { name: 'Assault Rifle', price: 175000, dmg: 12, pellets: 1, spread: 0.009, size: 30, reserve: 150, cd: 0.1,  auto: true,  reload: 1.9, fov: 50, dist: 2.5, snd: 0.8, mz: -0.8,  kick: 0.016 }
  };
  const SHOP_WEAPONS = ['knife', 'shotgun', 'sniper', 'rifle'];

  // Progress that survives between heists (cash and the guns you own)
  const SAVE_KEY = 'bankheist-save-v1';
  const STASH_SIZE = 10;
  const HOODIES = { grey: { name: 'Original', hex: 0x2d2f36 }, red: { name: 'Red', hex: 0xd32f2f }, blue: { name: 'Blue', hex: 0x2f6fe0 }, yellow: { name: 'Yellow', hex: 0xf2c211 }, pink: { name: 'Pink', hex: 0xff6fb5 }, purple: { name: 'Purple', hex: 0x8e44d0 }, green: { name: 'Green', hex: 0x2fb84f } };
  const HOODIE_PRICE = 30000;
  let save = { cash: 0, owned: ['pistol'], carry: ['pistol'], stash: new Array(STASH_SIZE).fill(null), heists: 0, next: 'bank', go: false, picks: 0, hoodie: 'grey', wardrobe: [], done: {}, v: 2 };
  try {
    const s0 = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (s0 && typeof s0.cash === 'number') {
      const old = !(s0.v >= 2);           // older saves did not list the pistol: it was always carried
      let owned = (s0.owned || []).filter(t => WEAPONS[t]);
      let carry = (s0.carry || []).filter(t => WEAPONS[t]);
      if (old) { owned = ['pistol'].concat(owned); carry = ['pistol'].concat(carry); }
      owned = owned.filter((t, i) => owned.indexOf(t) === i);
      carry = carry.filter((t, i) => owned.includes(t) && carry.indexOf(t) === i).slice(0, 4);
      let st = (Array.isArray(s0.stash) ? s0.stash : []).filter(t => WEAPONS[t] && owned.includes(t) && !carry.includes(t));
      owned.forEach(t => { if (!carry.includes(t) && !st.includes(t)) st.push(t); });          // anything owned but not carried is stored
      st = st.slice(0, STASH_SIZE);
      save = { cash: s0.cash, owned, carry, stash: st.concat(new Array(STASH_SIZE - st.length).fill(null)), heists: s0.heists || 0, next: LOCS[s0.next] ? s0.next : 'bank', go: !!s0.go, picks: Math.max(0, s0.picks | 0), hoodie: HOODIES[s0.hoodie] ? s0.hoodie : 'grey', wardrobe: Array.isArray(s0.wardrobe) ? s0.wardrobe.filter(k => HOODIES[k]) : [], done: Object.assign({}, s0.done), v: 2 };
    }
  } catch (err) { /* storage can be blocked */ }
  function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (err) { /* ignore */ } }
  const money$ = n => '$' + n.toLocaleString('en-US');
  const PICK_PRICE = 5000;

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
    else if (type === 'crown') {
      const gm = mat(0xffc82c, { metalness: 0.9, roughness: 0.25, emissive: 0x4a3400 });
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.22, 0.2, 16, 1, true), new THREE.MeshStandardMaterial({ color: 0xffc82c, metalness: 0.9, roughness: 0.25, emissive: 0x4a3400, side: THREE.DoubleSide }));
      g.add(band);
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * Math.PI * 2;
        const sp = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.2, 6), gm);
        sp.position.set(Math.cos(a) * 0.25, 0.2, Math.sin(a) * 0.25); g.add(sp);
        const ball = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), new THREE.MeshBasicMaterial({ color: i % 2 ? 0xff4d6d : 0x39e1ff }));
        ball.position.set(Math.cos(a) * 0.25, 0.32, Math.sin(a) * 0.25); g.add(ball);
      }
      const ruby = new THREE.Mesh(new THREE.OctahedronGeometry(0.07), new THREE.MeshBasicMaterial({ color: 0xff2a55 }));
      ruby.position.set(0, 0.02, 0.26); g.add(ruby);
    } else if (type === 'gem') {
      const d = new THREE.Mesh(new THREE.OctahedronGeometry(0.2), new THREE.MeshStandardMaterial({ color: 0xbff4ff, emissive: 0x2a8aa8, metalness: 0.2, roughness: 0.05 }));
      d.scale.y = 1.3; g.add(d);
    }
    else if (type === 'cell') {
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.44, 16), mat(0x2b3138, { metalness: 0.6, roughness: 0.4 }));
      g.add(body);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.178, 0.178, 0.16, 16), new THREE.MeshBasicMaterial({ color: 0x39e1ff }));
      g.add(band);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.07, 12), mat(0xcfd6e4, { metalness: 0.8, roughness: 0.3 }));
      cap.position.y = 0.25; g.add(cap);
    } else if (type === 'core') {
      const orb = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 12), new THREE.MeshBasicMaterial({ color: 0x7dffb0 }));
      g.add(orb);
      const frame = mat(0x8a929c, { metalness: 0.8, roughness: 0.3 });
      for (let i = 0; i < 3; i++) {
        const r = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.025, 6, 20), frame);
        r.rotation.set(i * Math.PI / 3, i * Math.PI / 2.5, 0); g.add(r);
      }
    } else if (type === 'parts') {
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.34, 0.34), mat(0xa87a46, { roughness: 0.9 }));
      g.add(box);
      for (const x of [-0.12, 0.12]) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.36, 0.36), mat(0x8a929c, { metalness: 0.6 })); b.position.x = x; g.add(b); }
      const gear = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.05, 10), mat(0xf2c94c, { metalness: 0.6 }));
      gear.rotation.x = Math.PI / 2; gear.position.set(0, 0.04, 0.19); g.add(gear);
    } else if (type === 'proto') {
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.14, 0.26), mat(0x2b3138, { metalness: 0.6, roughness: 0.4 }));
      g.add(base);
      const core = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), new THREE.MeshBasicMaterial({ color: 0xff8a2a }));
      core.position.y = 0.17; g.add(core);
      const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.22, 6), mat(0xcfd6e4));
      ant.position.set(0.1, 0.3, 0); g.add(ant);
    } else if (type === 'chips' || type === 'bigchips') {
      const big = type === 'bigchips';
      const cols = big ? [0x111114, 0xffd84a, 0x111114, 0xffd84a, 0x111114] : [0xc0152b, 0xf4f4f4, 0xc0152b, 0xf4f4f4];
      cols.forEach((c, i) => {
        const d = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.07, 20), mat(c, { roughness: 0.5 }));
        d.position.y = (i - (cols.length - 1) / 2) * 0.075; g.add(d);
      });
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
  if (!LOC.vault) for (const [type, x, y, z] of LOC.loot) spawnItem(type, x, y, z);

  // Inventory
  const slots = [null, null, null, null];
  save.carry.forEach((t, i) => { slots[i] = { type: t }; });
  let selected = Math.max(0, slots.findIndex(Boolean));
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
  function sndShot(v = 1) {
    if (muted || !audio()) return;
    const t = actx.currentTime;
    const src = actx.createBufferSource(); src.buffer = noiseBuf;
    const f = actx.createBiquadFilter(); f.type = 'lowpass';
    f.frequency.setValueAtTime(5000, t); f.frequency.exponentialRampToValueAtTime(300, t + 0.2);
    const g = actx.createGain();
    g.gain.setValueAtTime(0.9 * v, t); g.gain.exponentialRampToValueAtTime(0.01, t + 0.25);
    src.connect(f); f.connect(g); g.connect(actx.destination); src.start(t);
    const o = actx.createOscillator(); const og = actx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
    og.gain.setValueAtTime(0.7 * v, t); og.gain.exponentialRampToValueAtTime(0.01, t + 0.14);
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
    const skin = mat(0xe0b48f), hoodie = mat(HOODIES[save.hoodie].hex), jeans = mat(0x1d2a44), black = mat(0x0c0c0e), shoe = mat(0x15151a);

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
    const guns = {};
    for (const t of Object.keys(WEAPONS)) { guns[t] = makeWeaponModel(t); guns[t].visible = t === 'pistol'; gun.add(guns[t]); }
    const muzzle = new THREE.Object3D(); muzzle.position.set(0, WEAPONS.pistol.mz, -0.01); gun.add(muzzle);

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
    return { group: g, hoodie, legs, armL, armR, head, torso, gun, guns, muzzle, flash, flashLight, heldMoney, heldGold };
  }

  // A gun model built along the -Y axis (so it points forward when the arm is raised); +Z side is the underside.
  function makeWeaponModel(type) {
    const g = new THREE.Group();
    const metal = mat(0x30343b, { metalness: 0.6, roughness: 0.4 });
    const dark = mat(0x1c1c1f, { metalness: 0.3, roughness: 0.6 });
    const woodM = mat(0x7a4a22, { roughness: 0.7 });
    const part = (w, h, d, m, x, y, z) => { const p = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); p.position.set(x, y, z); g.add(p); return p; };
    if (type === 'pistol') {
      part(0.05, 0.3, 0.07, metal, 0, -0.17, -0.01);
      part(0.05, 0.08, 0.09, dark, 0, -0.04, 0.07);
    } else if (type === 'knife') {
      part(0.03, 0.32, 0.075, mat(0xdfe5ee, { metalness: 0.9, roughness: 0.2 }), 0, -0.2, 0);   // blade
      part(0.035, 0.05, 0.09, mat(0x8a929c, { metalness: 0.7, roughness: 0.3 }), 0, -0.035, 0); // guard
      part(0.045, 0.14, 0.05, mat(0x2a1a10, { roughness: 0.8 }), 0, 0.04, 0);                  // handle
    } else if (type === 'shotgun') {
      part(0.05, 0.78, 0.05, metal, 0, -0.45, -0.02);        // barrel
      part(0.045, 0.6, 0.04, metal, 0, -0.4, 0.035);          // magazine tube
      part(0.07, 0.22, 0.07, woodM, 0, -0.36, 0.03);          // pump
      part(0.06, 0.3, 0.09, woodM, 0, 0.06, 0.02);            // stock
      part(0.06, 0.16, 0.07, dark, 0, -0.12, 0.0);            // receiver
    } else if (type === 'sniper') {
      part(0.035, 1.0, 0.035, metal, 0, -0.6, -0.01);         // long barrel
      part(0.075, 0.5, 0.09, dark, 0, -0.15, 0.0);            // body
      part(0.06, 0.34, 0.09, woodM, 0, 0.2, 0.02);            // stock
      part(0.055, 0.26, 0.055, metal, 0, -0.18, -0.09);       // scope
      part(0.07, 0.04, 0.07, dark, 0, -0.07, -0.09);
      part(0.07, 0.04, 0.07, dark, 0, -0.29, -0.09);
      part(0.025, 0.2, 0.025, metal, 0, -0.42, 0.04);         // bipod
    } else {
      part(0.07, 0.5, 0.09, dark, 0, -0.2, 0.0);              // receiver
      part(0.035, 0.34, 0.035, metal, 0, -0.62, -0.01);       // barrel
      part(0.05, 0.2, 0.06, mat(0x2a2d33), 0, -0.22, 0.12);   // magazine
      part(0.05, 0.08, 0.07, dark, 0, -0.06, 0.07);           // grip
      part(0.06, 0.28, 0.08, dark, 0, 0.14, 0.0);             // stock
      part(0.03, 0.05, 0.05, metal, 0, -0.1, -0.07);          // sight
    }
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    return g;
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

  let activeW = 'pistol';
  const ammoStore = {};
  for (const t of Object.keys(WEAPONS)) ammoStore[t] = { mag: WEAPONS[t].size, reserve: WEAPONS[t].reserve };
  function curWeapon() { const s = slots[selected]; return s && WEAPONS[s.type] ? s.type : null; }
  function holdingGun() { return !!curWeapon(); }
  function setHeld(t) {
    for (const k in model.guns) model.guns[k].visible = k === t;
    model.muzzle.position.y = WEAPONS[t].mz;
  }
  // Switching weapons: keep each gun's own ammo
  function syncWeapon() {
    const t = curWeapon() || activeW;
    if (t === activeW) return;
    ammoStore[activeW].mag = gun.mag; ammoStore[activeW].reserve = gun.reserve;
    activeW = t;
    gun.size = WEAPONS[t].size; gun.mag = ammoStore[t].mag; gun.reserve = ammoStore[t].reserve;
    gun.reload = 0; gun.cooldown = 0.25;
    setHeld(t);
  }

  function startReload() {
    if (!holdingGun() || gun.reload > 0 || gun.mag >= gun.size || gun.reserve <= 0) return;
    gun.reload = WEAPONS[activeW].reload;
    tone(220, 0.05, 'square', 0.05); tone(330, 0.05, 'square', 0.05, 0.55);
  }

  // one bullet (or one shotgun pellet) from the crosshair
  function fireBullet(w, spread, state) {
    camera.updateMatrixWorld();
    raycaster.setFromCamera({ x: (Math.random() - 0.5) * 2 * spread, y: (Math.random() - 0.5) * 2 * spread }, camera);
    raycaster.far = 150;
    const first = raycaster.intersectObjects(aimables, false)[0];
    const aimPoint = first ? first.point.clone() : raycaster.ray.at(120, new THREE.Vector3());

    // ray from the gun to that point (so cover between the gun and the target still blocks the shot)
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
    if (!hit) return;

    const n = hit.face ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld) : UP.clone();
    const tgt = hit.object.userData.target;
    const cop = hit.object.userData.cop;
    if (cop) {
      const headshot = w.headDmg && hit.point.y - cop.pos.y > 1.45;      // the sniper does far more to the head
      if (headshot) toast('HEADSHOT!', 0.8);
      damageCop(cop, hit.point, n, headshot ? w.headDmg : w.dmg);
    } else if (hit.object.userData.gambler) {
      damageGambler(hit.object.userData.gambler, hit.point, n, w.dmg);
    } else if (hit.object.userData.civilian) {
      if (!state.warned) { state.warned = true; toast('Hold your fire! The ' + LOC.staff + ' is unarmed.'); }
      alertTeller('shot');
    } else if (tgt) {
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

  // knife: a short-range swing at whatever is under the crosshair
  function stab(w) {
    gun.cooldown = w.cd; gun.kick = 1; gun.fired = 0.6;
    tone(320, 0.07, 'sawtooth', 0.04); tone(220, 0.07, 'sawtooth', 0.03, 0.04);
    camera.updateMatrixWorld();
    raycaster.setFromCamera({ x: 0, y: 0 }, camera);
    raycaster.far = 150;
    const first = raycaster.intersectObjects(aimables, false)[0];
    const target = first ? first.point.clone() : raycaster.ray.at(60, new THREE.Vector3());
    const origin = new THREE.Vector3(player.pos.x, player.pos.y + 1.2, player.pos.z);
    const dir = target.sub(origin).normalize();
    raycaster.set(origin, dir);
    raycaster.far = w.range;
    const hit = raycaster.intersectObjects(aimables, false)[0];
    if (!hit) return;
    const n = hit.face ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld) : UP.clone();
    const cop = hit.object.userData.cop;
    if (cop) damageCop(cop, hit.point, n, w.dmg);
    else if (hit.object.userData.gambler) damageGambler(hit.object.userData.gambler, hit.point, n, w.dmg);
    else if (hit.object.userData.civilian) { toast('Hold off! The ' + LOC.staff + ' is unarmed.'); alertTeller('shot'); }
    else addSparks(hit.point, n);
  }

  function shoot() {
    if (phase !== 'play' && phase !== 'hq') return;
    if (!holdingGun() || gun.reload > 0 || gun.cooldown > 0) return;
    const w = WEAPONS[activeW];
    if (w.melee) { stab(w); return; }
    if (gun.mag <= 0) {
      if (gun.reserve > 0) startReload(); else { tone(150, 0.05, 'square', 0.04); toast('Out of ammo!'); }
      return;
    }
    gun.mag--;
    gun.cooldown = w.cd;
    gun.kick = 1;
    gun.flash = 0.06;
    gun.fired = 0.8;
    sndShot(w.snd);
    if (phase === 'play' && insideBank(player.pos.x, player.pos.z)) alertTeller('shot');   // gunfire inside the bank sets off the alarm

    const state = { warned: false };
    for (let i = 0; i < w.pellets; i++) fireBullet(w, w.spread, state);
    pitch = clamp(pitch + w.kick, -0.9, 0.9);   // kick the camera a little
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
    if (phase === 'hq') { objEl.textContent = 'Safe at the HQ. Buy guns at the pedestals (E), manage them at the storage unit, then step onto the green circle to pick your next heist.'; return; }
    if (phase !== 'play') return;
    const carrying = lootValue() > 0;
    const full = slots.every(Boolean);
    let t;
    const locked = LOC.vault && !machine.open;
    if (LOC.lock) {
      const left = cops.some(c => c.guard && !c.dead);
      if (!LOC.lock.open) t = alarm.on && !alarm.policeHere ? 'Alarm! Go through the staff door at the back right, up the stairs and pick the lock before the police arrive!' : 'Take the staff door at the back right, climb the stairs and pick the lock at the top. Guards patrol the floor' + (left ? ': take them out.' : '.');
      else if (alarm.policeHere) t = carrying ? 'The police are here! Run out the back door to the getaway car!' : 'The police are here! Grab the goods in the vault, then out the back door.';
      else t = carrying ? 'Grab more if you dare, then escape through the back door (marked EXIT) to the getaway car.' : 'The vault is open. Grab the goods, then escape through the back door.';
      objEl.textContent = t; return;
    }
    if (LOC.hack) {
      if (!hack.done) t = alarm.on && !alarm.policeHere ? 'Alarm! Hack the security terminal on the west wall (E) before the police arrive!' : 'Hack the security terminal on the west wall (E) to open the hall shutter.';
      else if (!machine.open) t = (alarm.policeHere ? 'The FBI is here! ' : 'The FBI is on its way! ') + 'Run the laser hall (jump the low beams, slip through when the flashing ones are off), then spin the vault dial (E).';
      else if (!carrying) t = 'The case is open. Grab the Crown Jewel!';
      else t = player.pos.y > 9 ? 'Get in the helicopter (E)!' : (alarm.policeHere ? 'The police are here! ' : '') + 'Climb the ladder on the east wall (press E next to it) to the roof and board the helicopter.';
      objEl.textContent = t; return;
    }
    if (LOC.corridor) {
      if (!machine.open) t = alarm.on && !alarm.policeHere ? 'Alarm! Reconnect the wires at the control panel (back right, E) before the police arrive!' : 'Reconnect the wires at the control panel at the back right (E) to unlock the power cells and cores.';
      else if (alarm.policeHere) t = carrying ? 'The police are here! Run the laser corridor out the back door!' : 'The police are here! Grab the goods, then out the back door.';
      else t = carrying ? 'Take it all, then run the laser corridor out the back door. Jump over the lasers (Space)!' : 'The panel is open. Grab the goods, then run the laser corridor out the back.';
      objEl.textContent = t; return;
    }
    if (locked && !alarm.policeHere) t = alarm.on ? 'Find the 3 clue notes, then crack the jackpot machine at the back right (E) before the police arrive!' : 'Search the casino for 3 hidden clue notes (one per reel), then crack the jackpot machine at the back right (E). Watch the dealer.';
    else if (!alarm.on) t = 'Go into the ' + LOC.place + ' and point your gun at the ' + LOC.staff + ' (hold right click).';
    else if (alarm.policeHere) t = carrying ? 'The police are here! Get to the getaway car!' : 'The police are here! Grab money and reach the getaway car, or fight them off.';
    else if (worldItems.length === 0) t = 'The ' + LOC.place + ' is empty. Get to the getaway car outside!';
    else if (full) t = 'Inventory full! Get to the getaway car (or drop something with Q).';
    else t = carrying ? 'Grab more if you dare, then get to the getaway car outside.' : 'Grab the money, then get to the getaway car outside.';
    objEl.textContent = t;
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
    onLootTaken();
  }

  function dropSelected() {
    const s = slots[selected];
    if (!s) return;
    if (WEAPONS[s.type]) { toast(phase === 'hq' ? 'Use E at the gun pedestal to stash a weapon' : "You can't drop your weapons"); return; }
    const p = new THREE.Vector3(player.pos.x - Math.sin(player.faceYaw) * 1.0, 0, player.pos.z - Math.cos(player.faceYaw) * 1.0);
    resolveCollisions(p, 0.3);
    spawnItem(s.type, p.x, player.pos.y + (insideBank(p.x, p.z) ? 0.02 : 0), p.z);
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
    if (Math.abs(p.x) < 500) {          // the HQ room is far away from the heist area and has its own walls
      p.x = clamp(p.x, -BOUND, BOUND);
      p.z = clamp(p.z, -BOUND, BOUND);
    }
  }

  function angleLerp(a, b, t) {
    let d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    return a + d * t;
  }

  // ------------------------------------------------------------------ input
  const keys = {};
  let mouseDown = false;
  let locked = false, forced = false;
  const isActive = () => locked || forced;

  document.addEventListener('keydown', e => {
    if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    keys[e.code] = true;
    if (puzzle.open && isActive()) { if (!e.repeat) (puzzle.kind === 'wires' ? wireKey : puzzle.kind === 'hack' ? hackKey : puzzle.kind === 'vault' ? vaultKey : puzzleKey)(e); return; }
    if (e.repeat || !isActive()) return;
    if (e.code === 'Digit1') selectSlot(0);
    else if (e.code === 'Digit2') selectSlot(1);
    else if (e.code === 'Digit3') selectSlot(2);
    else if (e.code === 'Digit4') selectSlot(3);
    else if (e.code === 'KeyE') interact();
    else if (e.code === 'KeyQ') dropSelected();
    else if (e.code === 'KeyR') startReload();
    else if (e.code === 'KeyM') { muted = !muted; toast(muted ? 'Sound off' : 'Sound on'); }
  });
  document.addEventListener('keyup', e => { keys[e.code] = false; });
  window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; aiming = false; mouseDown = false; });

  document.addEventListener('mousemove', e => {
    if (!isActive() || puzzle.open) return;
    const sens = aiming ? 0.0016 * Math.min(1, camera.fov / 52) : 0.0022;
    yaw -= e.movementX * sens;
    pitch = clamp(pitch - e.movementY * sens, -0.85, 0.9);
  });
  document.addEventListener('mousedown', e => {
    if (!isActive()) return;
    if (puzzle.open) return;
    if (e.button === 0) { mouseDown = true; shoot(); }
    else if (e.button === 2) aiming = true;
  });
  document.addEventListener('mouseup', e => { if (e.button === 2) aiming = false; if (e.button === 0) mouseDown = false; });
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
    overlay.classList.toggle('hidden', locked || phase === 'won' || phase === 'lost' || phase === 'choosing' || phase === 'leaving' || phase === 'storage');
    if (!locked) { aiming = false; mouseDown = false; overlayMsg.textContent = started ? 'Paused. Click to resume' : 'Click to play'; }
    else started = true;
  });
  document.addEventListener('pointerlockerror', () => {
    overlayMsg.textContent = 'Your browser blocked mouse capture. Click again.';
  });
  let started = false;

  // ================================================================ the heist
  // The teller, the bank alarm, the police and the getaway car.
  const hpEl = document.getElementById('hp');
  const hpFill = document.getElementById('hp-fill');
  const hpText = document.getElementById('hp-text');
  const alarmEl = document.getElementById('alarm');
  const alarmSub = document.getElementById('alarm-sub');
  const glowEl = document.getElementById('alarm-glow');
  const damageEl = document.getElementById('damage');
  const hitEl = document.getElementById('hitmarker');
  const endEl = document.getElementById('endscreen');
  const endTitle = document.getElementById('end-title');
  const endLines = document.getElementById('end-lines');

  const PLAYER_HP = 100;
  const COP_HP = 50;            // police have 50 HP
  const PISTOL_DMG = 5;         // your pistol does 5 damage per hit
  const COP_DMG = 6;            // damage of a police bullet that hits you
  const POLICE_DELAY = 30;      // seconds from the alarm until the police arrive
  const POLICE_DRIVE = 4;       // the last seconds of that delay are the cars driving in

  let phase = 'play';           // play | escaping | won | lost
  let hp = PLAYER_HP, lastHurt = -99, kills = 0, playTime = 0;
  const RUSH_DELAY = 10;        // casino: after you kill a gambler the police arrive within 10 seconds
  const alarm = { on: false, t: 0, delay: POLICE_DELAY, dispatched: false, policeHere: false };

  function pulse(el, cls) { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }
  function renderHp() {
    const v = Math.max(0, Math.ceil(hp));
    hpFill.style.width = v + '%';
    hpText.textContent = v;
    hpEl.classList.toggle('low', v <= 30);
  }

  // What blocks a line of sight (walls, columns, cars). Computed before any people exist.
  const losBlockers = aimables.filter(m => m !== road && m !== floor && !m.userData.target);
  const losRay = new THREE.Raycaster();
  const _los = new THREE.Vector3();
  function hasLOS(from, to) {
    _los.copy(to).sub(from);
    const d = _los.length();
    if (d < 0.01) return true;
    losRay.set(from, _los.divideScalar(d));
    losRay.far = d - 0.2;
    return losRay.intersectObjects(losBlockers, false).length === 0;
  }

  // ---- people (teller and police share one blocky model)
  function buildNPC(o) {
    const g = new THREE.Group();
    g.rotation.order = 'YXZ';
    const skin = mat(o.skin || 0xe0b48f), shirt = mat(o.shirt), pants = mat(o.pants), shoe = mat(0x15151a), dark = mat(0x0c0c0e);

    const legs = [-1, 1].map(s => {
      const piv = new THREE.Group(); piv.position.set(s * 0.14, 0.88, 0);
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.8, 0.26), pants); leg.position.y = -0.4; piv.add(leg);
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.1, 0.36), shoe); foot.position.set(0, -0.83, -0.04); piv.add(foot);
      g.add(piv); return piv;
    });

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.72, 0.3), shirt);
    torso.position.y = 1.22; g.add(torso);
    if (o.vest) { const v = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.5, 0.32), mat(o.vest)); v.position.y = 1.3; g.add(v); }
    if (o.tie) { const t = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.38, 0.02), mat(o.tie)); t.position.set(0, 1.28, -0.17); g.add(t); }
    if (o.backText) {
      const tx = canvasTex(128, 64, (c, w, h) => {
        c.fillStyle = '#101216'; c.fillRect(0, 0, w, h); c.fillStyle = '#ffd23f';
        c.font = 'bold 48px Arial'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(o.backText, w / 2, h / 2 + 3);
      });
      const bt = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.23), new THREE.MeshBasicMaterial({ map: tx }));
      bt.position.set(0, 1.3, 0.161); g.add(bt);
    }
    if (o.badge) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.1, 0.02), mat(0xd4af37, { metalness: 0.8, roughness: 0.35 }));
      b.position.set(0.15, 1.38, -0.16); g.add(b);
    }

    const head = new THREE.Group(); head.position.y = 1.62; g.add(head);
    const face = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.32, 0.32), skin); face.position.y = 0.18; head.add(face);
    if (o.cap) {
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.11, 0.36), mat(o.cap)); cap.position.y = 0.37; head.add(cap);
      const brim = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.03, 0.16), mat(o.cap)); brim.position.set(0, 0.32, -0.24); head.add(brim);
    } else {
      const hair = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.12, 0.35), mat(o.hair || 0x3a2a1c)); hair.position.y = 0.36; head.add(hair);
    }
    if (o.shades) { const sh = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.07, 0.02), dark); sh.position.set(0, 0.2, -0.17); head.add(sh); }
    for (const ex of [-0.07, 0.07]) {
      const eye = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.035, 0.01), dark);
      eye.position.set(ex, 0.19, -0.166); head.add(eye);
    }

    const arms = [-1, 1].map(s => {
      const piv = new THREE.Group(); piv.position.set(s * 0.37, 1.52, 0);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.62, 0.17), shirt); arm.position.y = -0.31; piv.add(arm);
      const hand = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.12), skin); hand.position.y = -0.68; piv.add(hand);
      g.add(piv); return piv;
    });
    const armL = arms[0], armR = arms[1];

    let pistol = null, muzzle = null;
    if (o.gun) {
      pistol = new THREE.Group(); pistol.position.set(0, -0.68, 0); armR.add(pistol);
      const gm = mat(0x30343b, { metalness: 0.6, roughness: 0.4 });
      const slide = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.3, 0.07), gm); slide.position.set(0, -0.17, -0.01); pistol.add(slide);
      const grip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.08, 0.09), mat(0x1c1c1f)); grip.position.set(0, -0.04, 0.07); pistol.add(grip);
      muzzle = new THREE.Object3D(); muzzle.position.set(0, -0.36, -0.01); pistol.add(muzzle);
    }

    // Invisible box that bullets can hit
    const hitbox = new THREE.Mesh(new THREE.BoxGeometry(0.75, 1.85, 0.55), new THREE.MeshBasicMaterial());
    hitbox.position.y = 0.92; hitbox.visible = false; g.add(hitbox);

    g.traverse(m => { if (m.isMesh && m !== hitbox) m.castShadow = true; });
    return { group: g, legs, armL, armR, head, torso, pistol, muzzle, hitbox };
  }

  // ---- the teller, working behind the counter
  const tellerNPC = buildNPC(LOC.npc);
  tellerNPC.group.position.set(-4, 0, -22.3);
  tellerNPC.group.rotation.y = Math.PI;                         // faces the lobby
  scene.add(tellerNPC.group);
  colliders.push({ minX: -4.4, maxX: -3.6, minZ: -22.7, maxZ: -21.9 });
  tellerNPC.hitbox.userData.civilian = true;
  aimables.push(tellerNPC.hitbox);
  const teller = { m: tellerNPC, pos: new THREE.Vector3(-4, 0, -22.3), state: 'working', up: 0, headYaw: 0 };

  function tellerEye() { return new THREE.Vector3(teller.pos.x, 1.6, teller.pos.z); }
  function playerEye() { return new THREE.Vector3(player.pos.x, player.pos.y + 1.5, player.pos.z); }

  // Holding your gun out at the teller (or firing inside the bank, or stealing in front of them) sets off the alarm.
  function alertTeller(reason) {
    if (teller.state !== 'working' || phase !== 'play') return;
    teller.state = 'hands';
    alarm.on = true; alarm.t = 0;
    alarmSnd = makeSiren('alarm');
    toast(reason === 'guard' ? 'A guard spotted you! The alarm is on!' : reason === 'machine' ? 'The ' + (LOC.wires ? 'control panel' : LOC.hack ? 'security system' : 'jackpot machine') + ' trips the alarm!' : reason === 'theft' ? 'The ' + LOC.staff + ' hits the silent alarm!' : 'Hands up! The ' + LOC.staff + ' hits the alarm!', 2.4);
    tone(880, 0.12, 'square', 0.06);
    updateObjective();
  }

  function checkTellerFear() {
    if (teller.state !== 'working') return;
    if (!(holdingGun() && (aiming || gun.fired > 0))) return;      // gun must be held out
    const dx = teller.pos.x - player.pos.x, dz = teller.pos.z - player.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 18) return;
    const dot = (-Math.sin(yaw) * dx - Math.cos(yaw) * dz) / dist;  // is the gun pointing their way?
    if (dot < 0.5) return;
    if (!hasLOS(tellerEye(), playerEye())) return;
    alertTeller('gun');
  }

  function onLootTaken() {
    if (teller.state === 'working' && hasLOS(tellerEye(), playerEye())) alertTeller('theft');
  }

  function updateTeller(dt) {
    const m = teller.m;
    teller.up += ((teller.state === 'working' ? 0 : 1) - teller.up) * Math.min(1, 9 * dt);
    const type = Math.sin(time * 9) * 0.06;
    const shake = teller.up > 0.6 ? Math.sin(time * 38) * 0.025 : 0;
    m.armR.rotation.x = 1.2 + type + (2.85 + shake - 1.2 - type) * teller.up;
    m.armL.rotation.x = 1.2 - type + (2.85 - shake - 1.2 + type) * teller.up;
    m.armR.rotation.z = 0.32 * teller.up;
    m.armL.rotation.z = -0.32 * teller.up;
    m.torso.position.y = 1.22 + Math.sin(time * 1.6) * 0.008;

    // look at the player when they are in the bank
    const dx = player.pos.x - teller.pos.x, dz = player.pos.z - teller.pos.z;
    let d = Math.atan2(-dx, -dz) - Math.PI;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    const want = Math.hypot(dx, dz) < 20 ? clamp(d, -1.1, 1.1) : 0;
    teller.headYaw += (want - teller.headYaw) * Math.min(1, 5 * dt);
    m.head.rotation.y = teller.headYaw;
  }

  // ---- the casino crowd: lots of gamblers you can shoot
  const gamblers = [];
  let civKills = 0;
  function flashGroup(g, on) {
    g.traverse(m => { if (m.isMesh && m.material.emissive) m.material.emissive.setHex(on ? 0xff2020 : 0x000000); });
  }
  function buildCrowd() {
    const shirts = [0xc0392b, 0x2980b9, 0x27ae60, 0x8e44ad, 0xf39c12, 0x16a085, 0xd35400, 0x7f8c8d, 0xe84393, 0xecf0f1];
    const pantsC = [0x1f2a44, 0x2d2d33, 0x3b2f2f, 0x1c3b3b, 0x40382a];
    const hairC = [0x2a1c12, 0x6b4a2b, 0xc9b26b, 0x111111, 0x8a8a8a, 0x5a2a1a];
    const skins = [0xe0b48f, 0xc99a76, 0x9c6b4a, 0x6f4a35, 0xf0c8a8];
    const pick = a => a[Math.floor(Math.random() * a.length)];
    const spots = [];
    for (let i = 0; i < 5; i++) spots.push({ x: -10 + i * 1.45, z: -27.15, yaw: 0, kind: 'slot' });          // slot machine players
    for (const cx of [-7, 7]) for (const th of [-1.05, 0, 1.05]) {                                              // roulette players
      const px = cx + Math.sin(th) * 1.95, pz = -16.5 + Math.cos(th) * 1.95;
      spots.push({ x: px, z: pz, yaw: Math.atan2(-(cx - px), -(-16.5 - pz)), kind: 'table' });
    }
    for (const [x, z, yaw] of [[-8.2, -18.9, 0.6], [4.6, -18.4, -0.5], [-2.4, -17.2, 3.4], [8.8, -20.5, -1.4]]) spots.push({ x, z, yaw, kind: 'watch' });
    for (const sp of spots) {
      const npc = buildNPC({ shirt: pick(shirts), pants: pick(pantsC), hair: pick(hairC), skin: pick(skins), vest: Math.random() < 0.3 ? pick(shirts) : 0 });
      npc.group.position.set(sp.x, 0, sp.z); npc.group.rotation.y = sp.yaw;
      scene.add(npc.group);
      const col = { minX: sp.x - 0.4, maxX: sp.x + 0.4, minZ: sp.z - 0.4, maxZ: sp.z + 0.4 };
      colliders.push(col);
      const gb = { m: npc, pos: new THREE.Vector3(sp.x, 0, sp.z), yaw: sp.yaw, kind: sp.kind, hp: 10, dead: false, deadT: 0, flash: 0, seed: Math.random() * 10, col, up: 0 };
      npc.hitbox.userData.gambler = gb;
      aimables.push(npc.hitbox);
      gamblers.push(gb);
    }
  }
  if (LOC.crowd) buildCrowd();

  function damageGambler(gb, point, normal, dmg) {
    if (gb.dead) return;
    gb.hp -= dmg;
    gb.flash = 0.12; flashGroup(gb.m.group, true);
    addSparks(point, normal);
    pulse(hitEl, 'show');
    if (gb.hp <= 0) {
      gb.dead = true; gb.deadT = 0; civKills++;
      const i = aimables.indexOf(gb.m.hitbox); if (i >= 0) aimables.splice(i, 1);
      const k = colliders.indexOf(gb.col); if (k >= 0) colliders.splice(k, 1);
      tone(160, 0.3, 'sawtooth', 0.06);
      toast('You shot a gambler! The police are coming!', 2.2);
      rushPolice();
    } else tone(700, 0.05, 'triangle', 0.05);
  }

  function updateCrowd(dt) {
    const panic = alarm.on;
    for (let i = gamblers.length - 1; i >= 0; i--) {
      const gb = gamblers[i], m = gb.m;
      if (gb.flash > 0) { gb.flash -= dt; if (gb.flash <= 0) flashGroup(m.group, false); }
      if (gb.dead) {
        gb.deadT += dt;
        m.group.rotation.x = Math.min(Math.PI / 2, gb.deadT * 4.5);
        if (gb.deadT > 20) { scene.remove(m.group); gamblers.splice(i, 1); }
        continue;
      }
      gb.up += ((panic ? 1 : 0) - gb.up) * Math.min(1, 8 * dt);
      const t = time + gb.seed;
      let r = 0.9, l = 0.9;
      if (gb.kind === 'slot') { r = 1.0 + Math.max(0, Math.sin(t * 1.3)) * 0.8; l = 0.5; }
      else if (gb.kind === 'table') { r = 1.1 + Math.sin(t * 1.7) * 0.25; l = 1.0 + Math.sin(t * 1.3) * 0.2; }
      else { r = 0.5 + Math.sin(t * 0.9) * 0.1; l = 0.2; }
      const shake = gb.up > 0.6 ? Math.sin(time * 38 + gb.seed) * 0.03 : 0;
      m.armR.rotation.x = r + (2.85 + shake - r) * gb.up;
      m.armL.rotation.x = l + (2.85 - shake - l) * gb.up;
      m.armR.rotation.z = 0.3 * gb.up; m.armL.rotation.z = -0.3 * gb.up;
      m.torso.position.y = 1.22 + Math.sin(t * 1.4) * 0.008;
      if (panic) {                                  // look at the robber
        const dx = player.pos.x - gb.pos.x, dz = player.pos.z - gb.pos.z;
        m.group.rotation.y = angleLerp(m.group.rotation.y, Math.atan2(-dx, -dz), 1 - Math.exp(-4 * dt));
      }
    }
  }

  // Someone got hurt: the alarm goes off and the police arrive in 10 seconds
  function rushPolice(delay) {
    if (phase !== 'play') return;
    const RD = delay === undefined ? RUSH_DELAY : delay;
    if (!alarm.on) {
      alarm.on = true; alarm.t = 0;
      alarmSnd = makeSiren('alarm');
      teller.state = 'hands';
    }
    if (!alarm.policeHere && alarm.delay - alarm.t > RD) alarm.delay = alarm.t + RD;
    updateObjective();
  }

  // ---- police and FBI
  function buildPoliceCar(kind) {
    const fbi = kind === 'fbi';
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.7, 1.9), mat(fbi ? 0x14161b : 0xf4f4f6, { metalness: 0.4, roughness: 0.4 }));
    body.position.y = 0.65; body.castShadow = true; g.add(body);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(4.42, 0.2, 1.92), mat(fbi ? 0xffd23f : 0x14284b)); stripe.position.y = 0.6; g.add(stripe);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.65, 1.7), mat(fbi ? 0x0b0d11 : 0x1a2330, { metalness: 0.6, roughness: 0.2 }));
    cabin.position.set(-0.2, 1.3, 0); cabin.castShadow = true; g.add(cabin);
    for (const [wx, wz] of [[1.4, 0.95], [1.4, -0.95], [-1.4, 0.95], [-1.4, -0.95]]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.3, 16), mat(0x111111));
      w.rotation.x = Math.PI / 2; w.position.set(wx, 0.38, wz); g.add(w);
    }
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.14, 0.7), new THREE.MeshBasicMaterial({ color: 0x401010 }));
    red.position.set(-0.2, 1.7, -0.42); g.add(red);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.14, 0.7), new THREE.MeshBasicMaterial({ color: 0x102040 }));
    blue.position.set(-0.2, 1.7, 0.42); g.add(blue);
    if (fbi) {
      const tx = canvasTex(256, 96, (c, w, h) => {
        c.fillStyle = '#14161b'; c.fillRect(0, 0, w, h); c.fillStyle = '#ffd23f';
        c.font = 'bold 72px Arial'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('FBI', w / 2, h / 2 + 4);
      });
      for (const side of [1, -1]) {
        const pl = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.5), new THREE.MeshBasicMaterial({ map: tx }));
        pl.position.set(0.2, 0.78, side * 0.96); pl.rotation.y = side > 0 ? 0 : Math.PI; g.add(pl);
      }
    }
    return { g, body, cabin, red, blue };
  }

  // Pre-built and parked far away so nothing has to compile when they arrive. The casino has more cars: 3 police
  // cars for the first wave, then FBI cars (up to 6 at a time) for every wave after that.
  const fleet = { police: [], fbi: [] };
  function poolCar(kind, i, light) {
    const pc = buildPoliceCar(kind);
    pc.kind = kind; pc.active = false;
    pc.g.position.set((i % 2 ? 1 : -1) * 300, 0, 8);
    if (light) {
      pc.light = new THREE.PointLight(0xff2020, 0, 22, 2);
      pc.light.position.set(0, 2.6, 0);
      pc.g.add(pc.light);
    }
    scene.add(pc.g);
    fleet[kind].push(pc);
  }
  for (let i = 0; i < (LOC.waves ? 3 : 2); i++) poolCar('police', i, true);
  if (LOC.waves) for (let i = 0; i < 6; i++) poolCar('fbi', i, false);
  const allCars = fleet.police.concat(fleet.fbi);
  const PARK_SLOTS = [[-22, 8], [22, 8], [-22, 15.5], [22, 15.5], [-31, 8], [31, 8], [-31, 15.5], [31, 15.5]];

  const cops = [];
  function makeBar() {
    const g = new THREE.Group(); g.position.y = 2.2;
    const bg = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x151515, depthWrite: false })); bg.scale.set(0.8, 0.1, 1);
    const fg = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xff3b30, depthWrite: false })); fg.scale.set(0.76, 0.07, 1);
    g.add(bg, fg);
    return { g, fg };
  }

  // Wave 1 = police (50 HP). Every later wave (casino only) = FBI, tougher each time.
  function waveStats(n0) {
    const n = LOC.fbiFirst ? n0 + 1 : n0;                  // the museum job brings the FBI from the very first wave
    if (n === 1) return { kind: 'police', cars: LOC.waves ? 3 : 2, hp: COP_HP, dmg: COP_DMG, acc: 1, speed: 3.8, cd: 1.3, cdVar: 1.1 };
    const k = n - 2;
    return { kind: 'fbi', cars: Math.min(6, 3 + k), hp: 150, dmg: Math.min(16, 8 + 2 * k), acc: 1.2 + 0.08 * Math.min(k, 5), speed: 4.3, cd: 0.9, cdVar: 0.8 };
  }

  function spawnCop(x, z, st) {
    const fbi = st.kind === 'fbi';
    const npc = buildNPC(fbi
      ? { shirt: 0x15161b, pants: 0x15161b, tie: 0x8a1c2b, badge: true, gun: true, shades: true, backText: 'FBI', hair: 0x111111 }
      : { shirt: 0x24407a, pants: 0x151c2e, cap: 0x101a33, badge: true, gun: true });
    npc.group.position.set(x, 0, z);
    scene.add(npc.group);
    const bar = makeBar();
    npc.group.add(bar.g);
    const c = {
      m: npc, pos: new THREE.Vector3(x, 0, z), hp: st.hp, maxHp: st.hp, dmg: st.dmg, acc: st.acc, speed: st.speed, cdBase: st.cd, cdVar: st.cdVar, kind: st.kind,
      dead: false, deadT: 0, cd: 1 + Math.random() * 1.2, losT: 0, los: false, aim: 0, walk: Math.random() * 6,
      flash: 0, faceYaw: 0, moveYaw: 0, bar
    };
    npc.hitbox.userData.cop = c;
    aimables.push(npc.hitbox);
    cops.push(c);
  }

  // ---- factory guards: they patrol until they spot you (or hear the alarm), then they hunt you down
  function spawnGuard(x, y, z, route, yaw) {
    const npc = buildNPC({ shirt: 0x2e4a3a, pants: 0x1d2a22, cap: 0x16211b, vest: 0x1a1a1a, badge: true, gun: true, hair: 0x2a1c12 });
    npc.group.position.set(x, y, z); npc.group.rotation.y = yaw || 0;
    scene.add(npc.group);
    const bar = makeBar();
    npc.group.add(bar.g);
    const c = {
      m: npc, pos: new THREE.Vector3(x, y, z), hp: 100, maxHp: 100, dmg: 5, acc: 1, speed: 3.6, cdBase: 1.1, cdVar: 1.0, kind: 'guard',
      dead: false, deadT: 0, cd: 1 + Math.random() * 1.2, losT: 0, los: false, aim: 0, walk: Math.random() * 6,
      flash: 0, faceYaw: yaw || 0, moveYaw: yaw || 0, bar, guard: true, active: false, route: route || null, ri: 0, wait: 0
    };
    npc.hitbox.userData.cop = c;
    aimables.push(npc.hitbox);
    cops.push(c);
  }
  if (LOC.guards) {
    spawnGuard(-9, 0, -18.3, [[-9, -18.3], [-1, -18.3]], -Math.PI / 2);
    spawnGuard(9, 0, -18.3, [[9, -18.3], [2, -18.3]], Math.PI / 2);
    spawnGuard(-2.4, 0, -23.5, [[-2.4, -23.5], [1.9, -23.5], [1.9, -27.3], [-2.4, -27.3]], 0);
    spawnGuard(10.6, 4.4, -25.9, null, Math.PI / 2);       // waiting at the top of the stairs
    spawnGuard(7.2, 4.4, -28.0, null, Math.PI / 2);        // and one inside the vault
  }

  const wave = { n: 0, cars: [], parked: [], driving: false, driveT: 0, arrivedAt: 0, clearT: 0, warned: false, stats: null };

  function parkWaveCar(e) {
    const pc = e.pc, x = e.slot[0], z = e.slot[1];
    pc.g.position.set(x, 0, z);
    const col = { minX: x - 2.2, maxX: x + 2.2, minZ: z - 0.95, maxZ: z + 0.95 };
    colliders.push(col);
    camSolids.push(pc.body); aimables.push(pc.body, pc.cabin); losBlockers.push(pc.body, pc.cabin);
    wave.parked.push({ pc, col });
    spawnCop(x - 1.2, z - 2.0, wave.stats);
    spawnCop(x + 1.2, z - 2.0, wave.stats);
  }

  // cars of the earlier wave leave so their parking spots are free again
  function freeFleet() {
    const drop = (arr, v) => { const i = arr.indexOf(v); if (i >= 0) arr.splice(i, 1); };
    for (const e of wave.parked) {
      drop(colliders, e.col); drop(camSolids, e.pc.body); drop(aimables, e.pc.body); drop(aimables, e.pc.cabin);
      drop(losBlockers, e.pc.body); drop(losBlockers, e.pc.cabin);
      e.pc.active = false; e.pc.g.position.set((e.pc.g.position.x < 0 ? -1 : 1) * 300, 0, 8);
    }
    wave.parked.length = 0;
  }

  function dispatchWave() {
    freeFleet();
    wave.n++;
    wave.stats = waveStats(wave.n);
    const pool = fleet[wave.stats.kind];
    wave.cars = [];
    for (let i = 0; i < Math.min(wave.stats.cars, pool.length); i++) {
      const slot = PARK_SLOTS[i], side = slot[0] < 0 ? -1 : 1, pc = pool[i];
      pc.active = true;
      pc.g.position.set(side * 70, 0, slot[1]);
      pc.g.rotation.y = side < 0 ? 0 : Math.PI;
      wave.cars.push({ pc, slot, side });
    }
    wave.driving = true; wave.driveT = 0; wave.warned = false;
    alarm.dispatched = true;
    if (!policeSnd) policeSnd = makeSiren('police');
    toast(wave.stats.kind === 'police' ? 'Sirens! The police are on their way!' : 'FBI! Wave ' + (LOC.fbiFirst ? wave.n : wave.n - 1) + ' is on its way!', 2.4);
    tone(500, 0.15, 'sawtooth', 0.05);
  }

  function updatePolice(dt) {
    if (!alarm.on) return;
    if (wave.n === 0 && alarm.t >= alarm.delay - POLICE_DRIVE) dispatchWave();
    if (wave.driving) {
      wave.driveT += dt;
      const p = clamp(wave.driveT / POLICE_DRIVE, 0, 1), e = 1 - (1 - p) * (1 - p);
      for (const c of wave.cars) c.pc.g.position.x = c.side * 70 + (c.slot[0] - c.side * 70) * e;
      if (p >= 1) {
        wave.driving = false; wave.arrivedAt = time; wave.clearT = 0;
        for (const c of wave.cars) parkWaveCar(c);
        alarm.policeHere = true;
        toast(wave.stats.kind === 'police' ? 'The police have arrived!' : 'The FBI has arrived!', 2.4);
        tone(300, 0.2, 'sawtooth', 0.06);
        updateObjective();
      }
    }
    // casino: the law keeps coming until you are dead (or gone)
    if (LOC.waves && wave.n > 0 && !wave.driving) {
      const alive = cops.filter(c => !c.dead).length;
      if (alive === 0) {
        wave.clearT += dt;
        if (!wave.warned) { wave.warned = true; toast('All units down... but more are coming!', 2.2); }
        if (wave.clearT >= 6) dispatchWave();
      } else wave.clearT = 0;
      if (wave.n > 0 && time - wave.arrivedAt > 50 && !wave.driving) dispatchWave();      // reinforcements if you hold out
    }
  }

  const WP_OUT = { x: 0, z: -10.2 }, WP_IN = { x: 0, z: -17 }, WP_DOOR = { x: 0, z: -12.8 };
  const inStairs = (x, z) => x > 3.0 && x < 11.4 && z < -24.6 && z > -29.4;
  function copTarget(c) {                 // route through the bank door when the player is inside
    if (LOC.backDoor) {
      if (inStairs(player.pos.x, player.pos.z) && !inStairs(c.pos.x, c.pos.z) && insideBank(c.pos.x, c.pos.z))   // through the staff door
        return (c.pos.z > -23.9 || Math.abs(c.pos.x - 4.1) > 0.8) && c.pos.z > -24.4 ? { x: 4.1, z: -23.3 } : { x: 4.1, z: -25.4 };
      if (!c.guard && player.pos.z < -30.8 && c.pos.z > -30.5 && !insideBank(c.pos.x, c.pos.z))                // around the building to the back lot
        { if (Math.abs(c.pos.x) < 14.5 && c.pos.z > -31) return { x: (c.pos.x < 0 ? -1 : 1) * 15.5, z: c.pos.z };
          if (LOC.corridor) return c.pos.z > -44.3 ? { x: c.pos.x, z: -45.4 } : Math.abs(c.pos.x) > 1 ? { x: 0, z: -45.4 } : { x: player.pos.x, z: player.pos.z };
          return { x: player.pos.x, z: player.pos.z }; }
    }
    const pIn = insideBank(player.pos.x, player.pos.z), cIn = insideBank(c.pos.x, c.pos.z);
    if (pIn && !cIn) return (c.pos.z > -11.5 && Math.abs(c.pos.x) > 1.3) ? WP_OUT : WP_IN;
    if (!pIn && cIn) return c.pos.z < -13.8 ? WP_DOOR : WP_OUT;
    return player.pos;
  }

  function flashCop(c, on) {
    c.m.group.traverse(m => { if (m.isMesh && m.material.emissive) m.material.emissive.setHex(on ? 0xff2020 : 0x000000); });
  }

  function damageCop(c, point, normal, dmg) {
    if (c.dead) return;
    if (c.guard && !c.active) { c.active = true; alertTeller('guard'); }
    c.hp = Math.max(0, c.hp - (dmg || PISTOL_DMG));
    c.flash = 0.12; flashCop(c, true);
    c.bar.fg.scale.x = Math.max(0.001, 0.76 * c.hp / c.maxHp);
    addSparks(point, normal);
    pulse(hitEl, 'show');
    tone(900, 0.05, 'triangle', 0.06);
    if (c.hp <= 0) {
      c.dead = true; c.deadT = 0; kills++;
      c.bar.g.visible = false;
      const i = aimables.indexOf(c.m.hitbox);
      if (i >= 0) aimables.splice(i, 1);
      tone(200, 0.25, 'sawtooth', 0.05);
      const alive = cops.filter(k => !k.dead).length;
      toast(c.guard ? 'Guard down!' : alive === 0 ? 'All officers down! Get to the getaway car.' : 'Officer down!', 1.8);
    }
  }

  function hurt(d) {
    if (phase !== 'play') return;
    hp = clamp(hp - d, 0, PLAYER_HP);
    if (d > 0) { lastHurt = time; pulse(damageEl, 'flash'); tone(120, 0.12, 'sawtooth', 0.07); }
    renderHp();
    if (hp <= 0) endGame(false);
  }

  function copShoot(c, dist) {
    c.aim = 0.35;
    c.m.group.updateMatrixWorld(true);
    const from = c.m.muzzle.getWorldPosition(new THREE.Vector3());
    const to = new THREE.Vector3(player.pos.x, player.pos.y + 1.2, player.pos.z);
    const hitIt = Math.random() < clamp((0.6 - dist * 0.017) * c.acc, 0.18, 0.62);
    if (!hitIt) to.add(new THREE.Vector3((Math.random() - 0.5) * 3, (Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 3));
    addTracer(from, to);
    if (dist < 45) sndShot(0.35);
    if (hitIt) hurt(c.dmg);
  }

  let arrestT = 0, arrested = false;
  function updateCops(dt) {
    if (!arrested) arrestT = Math.max(0, arrestT - dt * 2); arrested = false;
    for (let ci = cops.length - 1; ci >= 0; ci--) {
      const c = cops[ci];
      const g = c.m.group;
      if (c.flash > 0) { c.flash -= dt; if (c.flash <= 0) flashCop(c, false); }
      if (c.dead) {
        c.deadT += dt;
        g.rotation.x = Math.min(Math.PI / 2, c.deadT * 4.5);       // falls over backwards
        if (c.deadT > 8) { scene.remove(g); cops.splice(ci, 1); }
        continue;
      }
      if (phase !== 'play') continue;

      const dx = player.pos.x - c.pos.x, dz = player.pos.z - c.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 1.7 && Math.abs(player.pos.y - (c.pos.y || 0)) < 2 && !player.climb) {   // an officer got too close: arrest
        arrestT += dt; if (arrestT > 0.9) { endGame(false, 'arrest'); return; }
        if (arrestT - dt <= 0) toast('Officer: "Freeze! You are under arrest!"', 1.2);
        arrested = true;
      }
      c.losT -= dt;
      if (c.losT <= 0) {
        c.losT = 0.2;
        c.los = dist < 40 && hasLOS(new THREE.Vector3(c.pos.x, c.pos.y + 1.5, c.pos.z), new THREE.Vector3(player.pos.x, player.pos.y + 1.3, player.pos.z));
      }
      if (walkables.length) c.pos.y = groundAt(c.pos.x, c.pos.z, c.pos.y);
      if (c.guard && !c.active) {
        const seen = c.los && (dist < 4.5 || (dist < 14 && Math.abs(((Math.atan2(-dx, -dz) - c.faceYaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI) < 1.15));
        if (seen || alarm.on) { c.active = true; if (!alarm.on) alertTeller('guard'); }
        else {                                                         // patrol
          let moving = false;
          if (c.route) {
            if (c.wait > 0) c.wait -= dt;
            else {
              const w = c.route[c.ri], tx = w[0] - c.pos.x, tz = w[1] - c.pos.z, td = Math.hypot(tx, tz);
              if (td < 0.15) { c.ri = (c.ri + 1) % c.route.length; c.wait = 1.0 + Math.random(); }
              else { const sp = Math.min(1.6 * dt, td); c.pos.x += tx / td * sp; c.pos.z += tz / td * sp; c.faceYaw = angleLerp(c.faceYaw, Math.atan2(-tx, -tz), 1 - Math.exp(-6 * dt)); moving = true; }
            }
          }
          c.walk += dt * (moving ? 4 : 0);
          const swing = moving ? Math.sin(c.walk) * 0.5 : 0;
          c.m.legs[0].rotation.x = swing; c.m.legs[1].rotation.x = -swing;
          c.m.armR.rotation.x += (0.2 - c.m.armR.rotation.x) * Math.min(1, 8 * dt);
          c.m.armL.rotation.x += (-swing - c.m.armL.rotation.x) * Math.min(1, 8 * dt);
          g.position.copy(c.pos); g.rotation.y = c.faceYaw;
          continue;
        }
      }

      let moving = false;
      if (!(c.los && dist < 11)) {                                   // close in until they can shoot comfortably
        const t = copTarget(c);
        const tx = t.x - c.pos.x, tz = t.z - c.pos.z, td = Math.hypot(tx, tz);
        if (td > 0.05) {
          const sp = Math.min(c.speed * dt, td);
          c.pos.x += (tx / td) * sp; c.pos.z += (tz / td) * sp;
          c.moveYaw = Math.atan2(-tx, -tz);
          moving = true;
        }
        resolveCollisions(c.pos, 0.4);
      }
      for (const o of cops) {                                        // do not stack on top of each other
        if (o === c || o.dead) continue;
        const ox = c.pos.x - o.pos.x, oz = c.pos.z - o.pos.z, od = Math.hypot(ox, oz);
        if (od > 0.001 && od < 0.9) { c.pos.x += (ox / od) * (0.9 - od) * 0.5; c.pos.z += (oz / od) * (0.9 - od) * 0.5; }
      }

      const aimYaw = Math.atan2(-dx, -dz);
      c.faceYaw = angleLerp(c.faceYaw, (c.los && dist < 30) ? aimYaw : (moving ? c.moveYaw : c.faceYaw), 1 - Math.exp(-10 * dt));

      c.cd -= dt;
      if (c.cd <= 0 && c.los && dist < 28) { copShoot(c, dist); c.cd = c.cdBase + Math.random() * c.cdVar; }
      if (c.aim > 0) c.aim -= dt;

      c.walk += dt * (moving ? 7 : 0);
      const swing = moving ? Math.sin(c.walk) * 0.8 : 0;
      const raised = c.los && dist < 30;
      c.m.legs[0].rotation.x = swing; c.m.legs[1].rotation.x = -swing;
      const rk = Math.min(1, 12 * dt);
      c.m.armR.rotation.x += ((raised ? 1.45 : 0.8) + (c.aim > 0 ? 0.15 : 0) - c.m.armR.rotation.x) * rk;
      c.m.armL.rotation.x += ((raised ? 1.35 : -swing * 0.6) - c.m.armL.rotation.x) * rk;
      g.position.copy(c.pos);
      g.rotation.y = c.faceYaw;
    }
  }

  // ---- sirens
  let alarmSnd = null, policeSnd = null;
  function makeSiren(kind) {
    if (!audio()) return null;
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = kind === 'alarm' ? 'square' : 'sawtooth';
    g.gain.value = 0;
    o.connect(g); g.connect(actx.destination); o.start();
    return { o, g, kind };
  }
  function tickSiren(s) {
    if (!s) return;
    const f = s.kind === 'alarm' ? ((Math.floor(time * 3) % 2) ? 980 : 740) : 600 + 400 * Math.abs(Math.sin(time * 1.8));
    s.o.frequency.setTargetAtTime(f, actx.currentTime, 0.015);
    s.g.gain.value = muted ? 0 : (s.kind === 'alarm' ? 0.03 : 0.025);
  }
  function stopSirens() {
    for (const s of [alarmSnd, policeSnd]) { try { if (s) s.o.stop(); } catch (err) { /* ignore */ } }
    alarmSnd = policeSnd = null;
  }

  // ---- alarm lights on the bank front
  const bulbMats = [];
  for (const x of [-5.3, 5.3]) {
    const m = new THREE.MeshBasicMaterial({ color: 0x3a0d0d });
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.36, 14, 10), m);
    b.position.set(x, 8.6, -13.65);
    scene.add(b);
    bulbMats.push(m);
  }
  const alarmLight = new THREE.PointLight(0xff2020, 0, 45, 2);
  alarmLight.position.set(0, 7.5, -11);
  scene.add(alarmLight);

  // ---- the lock on the vault door (factory): pick it with a lockpick from the HQ shop
  const LOCK_TIME = 3.2;
  function nearLock() { const k = LOC.lock; return !!k && !k.open && player.pos.y > 3.6 && Math.hypot(player.pos.x - 10.4, player.pos.z + 27.9) < 1.9; }
  function startPick() {
    const k = LOC.lock;
    if (save.picks < 1) { toast('Locked! You need a lockpick (buy them at the HQ).'); tone(150, 0.1, 'square', 0.05); return; }
    if (k.t > 0) return;
    k.t = LOCK_TIME;
    tone(500, 0.05, 'square', 0.04);
  }
  function updateLock(dt) {
    const k = LOC.lock;
    if (!k) return;
    if (k.t > 0) {
      if (phase !== 'play' || !nearLock()) { k.t = 0; }
      else {
        k.t -= dt;
        if (Math.floor(k.t * 6) !== Math.floor((k.t + dt) * 6)) tone(900 + Math.random() * 300, 0.03, 'square', 0.03);
        if (k.t <= 0) {
          k.t = 0; k.open = true; save.picks = Math.max(0, save.picks - 1); persist(); renderCash();
          const i = colliders.indexOf(k.col); if (i >= 0) colliders.splice(i, 1);
          k.lamp.material.color.setHex(0x39ff7a);
          toast('Click! The lock is picked.', 2);
          tone(660, 0.1, 'square', 0.05); tone(990, 0.15, 'square', 0.05, 0.1);
          updateObjective();
        }
      }
    }
    if (k.open && k.swing < 1) { k.swing = Math.min(1, k.swing + dt / 0.6); k.pivot.rotation.y = -Math.PI / 2 * k.swing; }
  }

  // ---- the getaway car
  const marker = new THREE.Group();
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.8, 4), new THREE.MeshBasicMaterial({ color: 0x5dff9a }));
  cone.rotation.x = Math.PI; cone.position.y = 3.2; marker.add(cone);
  const ring = new THREE.Mesh(new THREE.RingGeometry(2.7, 3.0, 40), new THREE.MeshBasicMaterial({ color: 0x5dff9a, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05; marker.add(ring);
  getawayCar.add(marker);

  const escape = { t: 0 };
  const LADDER = { x: 10.9, z: -22.2 };
  const nearLadder = () => LOC.heli && Math.hypot(player.pos.x - LADDER.x, player.pos.z - LADDER.z) < 2.4 && !player.climb;
  function nearCar() { return Math.hypot(getawayCar.position.x - player.pos.x, getawayCar.position.z - player.pos.z) < 3.6 && (!LOC.heli || player.pos.y > 9); }

  function enterCar() {
    if (phase !== 'play') return;
    if (lootValue() <= 0) { toast('Grab some money first!'); return; }
    phase = 'escaping'; escape.t = 0;
    gun.reload = 0;
    toast('Go go go!', 2);
    tone(440, 0.1, 'square', 0.05); tone(660, 0.15, 'square', 0.05, 0.1);
  }

  function updateEscape(dt) {
    escape.t += dt;
    if (LOC.heli) {                                                   // lift off
      getawayCar.position.y += Math.min(14, 1 + escape.t * 5) * dt;
      getawayCar.position.x += Math.max(0, escape.t - 0.8) * 4 * dt;
      player.pos.set(getawayCar.position.x, getawayCar.position.y, getawayCar.position.z);
    } else {
      getawayCar.position.x += Math.min(16, 2 + escape.t * 7) * dt;   // floor it
      player.pos.set(getawayCar.position.x, 0, getawayCar.position.z);
    }
    player.vel.set(0, 0, 0);
    if (escape.t > (LOC.heli ? 3.2 : 2.2) && !escape.faded) { escape.faded = true; pulse(fadeEl, 'fadeout'); }
    if (escape.t > (LOC.heli ? 4.0 : 2.9)) arriveHQ();
  }

  function interact() {
    if (phase === 'hq') { hqInteract(); return; }
    if (phase !== 'play') return;
    if (LOC.vault && !machine.open && !nearestItem() && nearMachine()) { if (LOC.wires) openWires(); else if (LOC.hack) openVault(); else openPuzzle(); return; }
    if (LOC.lock && !LOC.lock.open && nearLock()) { startPick(); return; }
    if (LOC.hack && !hack.done && nearTerminal()) { openHack(); return; }
    if (nearLadder() && !nearestItem()) { if (player.pos.y < 2) { player.climb = true; player.climbDir = 1; player.pos.set(LADDER.x, 0.05, LADDER.z); } else if (player.pos.y > 9) { player.climb = true; player.climbDir = -1; player.pos.set(LADDER.x, 10.6, LADDER.z); } return; }
    if (!nearestItem() && nearCar()) { enterCar(); return; }
    tryPickup();
  }

  function endGame(won, why) {
    if (phase === 'won' || phase === 'lost') return;
    const carried = lootValue();
    phase = won ? 'won' : 'lost';
    stopSirens();
    endTitle.textContent = won ? 'YOU GOT AWAY!' : why === 'arrest' ? 'ARRESTED!' : 'BUSTED!';
    endTitle.className = won ? 'win' : 'lose';
    const lines = [];
    if (won) {
      lines.push('You escaped with <b>$' + carried.toLocaleString('en-US') + '</b>');
      lines.push(alarm.policeHere ? 'The police showed up, but you made it out anyway.' : 'Clean getaway: you left before the police arrived.');
    } else {
      if (why === 'arrest') lines.push((wave.stats && wave.stats.kind === 'fbi' ? 'The FBI' : 'The police') + ' caught you and threw you in <b>jail</b>.');
      else lines.push(wave.stats && wave.stats.kind === 'fbi' ? 'The FBI took you down.' : 'The police took you down.');
      lines.push('You lost <b>$' + carried.toLocaleString('en-US') + '</b> of loot.' + (why === 'arrest' ? ' Do not let them get close!' : ''));
    }
    lines.push('Officers taken down: ' + kills);
    if (LOC.crowd) lines.push('Waves survived: ' + Math.max(0, wave.n - (alarm.policeHere ? 1 : 0)) + ' &nbsp;·&nbsp; Gamblers shot: ' + civKills);
    lines.push('Time: ' + Math.round(playTime) + 's');
    endLines.innerHTML = lines.join('<br>');
    endEl.classList.remove('hidden');
    overlay.classList.add('hidden');
    try { document.exitPointerLock(); } catch (err) { /* ignore */ }
  }
  endEl.addEventListener('click', () => location.reload());

  function updateHeist(dt) {
    if (phase === 'hq') { updateHQ(dt); return; }
    if (phase === 'won' || phase === 'lost' || phase === 'leaving') return;
    if (phase === 'play') {
      playTime += dt;
      checkTellerFear();
      if (alarm.on) alarm.t += dt;
      updatePolice(dt);
      updateLock(dt);
      if (LOC.heli) { const sp = phase === 'escaping' ? 32 : 5; getawayCar.userData.rotor.rotation.y += sp * dt; getawayCar.userData.tail.rotation.z += sp * dt; }
      updateLasers(dt);
      if (hp < PLAYER_HP && time - lastHurt > 6) { hp = Math.min(PLAYER_HP, hp + 2.5 * dt); renderHp(); }
    }
    updateTeller(dt);
    updateCrowd(dt);
    updateMachine(dt);
    updateCops(dt);

    // alarm lights and police lights
    const strobe = Math.floor(time * 3) % 2 === 0;
    for (const bm of bulbMats) bm.color.setHex(alarm.on ? (strobe ? 0xff3030 : 0x601010) : 0x3a0d0d);
    alarmLight.intensity = alarm.on && strobe ? 450 : 0;
    const flip = Math.floor(time * 6) % 2 === 0;
    for (const pc of allCars) {
      pc.red.material.color.setHex(pc.active ? (flip ? 0xff2a2a : 0x401010) : 0x401010);
      pc.blue.material.color.setHex(pc.active ? (flip ? 0x102040 : 0x3a7bff) : 0x102040);
      if (pc.light) { pc.light.color.setHex(flip ? 0xff2020 : 0x2a50ff); pc.light.intensity = pc.active ? 260 : 0; }
    }
    tickSiren(alarmSnd); tickSiren(policeSnd);
    cone.position.y = 3.2 + Math.sin(time * 3) * 0.2;
    cone.rotation.y += dt * 2;

    // alarm banner
    alarmEl.classList.toggle('on', alarm.on);
    glowEl.classList.toggle('on', alarm.on);
    if (alarm.on) {
      const alive = cops.filter(c => !c.dead).length;
      const fbiNow = wave.stats && wave.stats.kind === 'fbi';
      if (!alarm.policeHere) alarmSub.textContent = 'Police arrive in ' + Math.max(0, Math.ceil(alarm.delay - alarm.t)) + 's';
      else if (wave.driving && fbiNow) alarmSub.textContent = 'FBI INCOMING!';
      else if (alive === 0) alarmSub.textContent = LOC.waves ? 'ALL DOWN - more are coming! Get out!' : 'ALL OFFICERS DOWN - get out!';
      else alarmSub.textContent = (fbiNow ? 'FBI ON SITE: ' + alive + ' agent' : 'POLICE ON SITE: ' + alive + ' officer') + (alive === 1 ? '' : 's') + ' left';
    }
  }

  // ---- the casino puzzle: crack the jackpot machine's 3-symbol code
  const machine = { open: false, wrong: 0, code: null, doorT: 0 };
  const puzzle = { open: false, guess: [0, 1, 2], cursor: 0, rows: [] };
  const puzzleEl = document.getElementById('puzzle');
  const puzzleReels = document.getElementById('puzzle-reels');
  const puzzleRows = document.getElementById('puzzle-rows');
  const puzzleInfo = document.getElementById('puzzle-info');
  function nearMachine() { const mp = LOC.machinePos || { x: 8.6, z: -27.2 }; return Math.hypot(player.pos.x - mp.x, player.pos.z - mp.z) < 2.7 && player.pos.y < 2; }
  function renderPuzzle() {
    puzzleReels.innerHTML = puzzle.guess.map((g, i) => '<div class="reel' + (i === puzzle.cursor ? ' sel' : '') + '"><span class="up">&#9650;</span><span class="sym">' + SYMBOLS[g] + '</span><span class="dn">&#9660;</span></div>').join('');
    puzzleRows.innerHTML = puzzle.rows.map(r => '<div class="row"><span>' + r.g.map(x => SYMBOLS[x]).join(' ') + '</span><span class="fb">' + '&#9679;'.repeat(r.exact) + '<i>' + '&#9675;'.repeat(r.near) + '</i>' + (r.exact + r.near === 0 ? '&ndash;' : '') + '</span></div>').join('');
    puzzleInfo.textContent = machine.wrong >= 3 ? 'The alarm is ringing! Hurry!' : 'Wrong tries: ' + machine.wrong + ' / 3 (the third one trips the alarm)';
  }
  function openPuzzle() {
    if (puzzle.open || machine.open || phase !== 'play') return;
    if (!machine.code) machine.code = LOC.code;          // the code is the one hidden around the room
    puzzle.open = true; puzzle.kind = 'guess'; aiming = false; mouseDown = false;
    if (LOC.id === 'jewel') { puzzleEl.querySelector('h2').textContent = 'VAULT LOCK'; puzzleEl.querySelector('.tag').innerHTML = 'No clues here: work the code out from the feedback.<br>&#9679; = right symbol, right place &nbsp; &#9675; = right symbol, wrong place'; }
    puzzleEl.classList.remove('hidden');
    renderPuzzle();
  }
  // ---- the museum vault: spin the dial, switch direction the moment the light flashes (4 right switches)
  const vault = { angle: 0, dir: 1, targets: [], step: 0, litUntil: 0, wrong: 0, last: 0, timer: 0, msg: '' };
  const vaultEl = document.getElementById('vault');
  const vaultDial = document.getElementById('vault-dial');
  const vaultLamp = document.getElementById('vault-lamp');
  const vaultSteps = document.getElementById('vault-steps');
  const vaultInfo = document.getElementById('vault-info');
  const angDiff = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
  const vaultReq = i => (i % 2 === 0 ? 1 : -1);             // the direction you must be spinning when the light flashes
  function renderVault() {
    vaultDial.style.transform = 'rotate(' + vault.angle + 'deg)';
    const lit = performance.now() < vault.litUntil;
    vaultLamp.classList.toggle('on', lit);
    vaultSteps.innerHTML = [0, 1, 2, 3].map(i => '<i class="' + (i < vault.step ? 'ok' : '') + '"></i>').join('');
    vaultInfo.textContent = vault.msg || ('Spinning ' + (vault.dir > 0 ? 'right' : 'left') + '. Switch direction when the light flashes!  Misses: ' + vault.wrong);
  }
  function vaultTick() {
    const now = performance.now(), dt = Math.min(0.1, (now - vault.last) / 1000); vault.last = now;
    vault.angle = (vault.angle + vault.dir * 115 * dt + 360) % 360;
    if (vault.dir === vaultReq(vault.step) && angDiff(vault.angle, vault.targets[vault.step]) < 12) vault.litUntil = now + 450;
    renderVault();
  }
  function openVault() {
    if (puzzle.open || machine.open || phase !== 'play') return;
    if (!vault.targets.length) {
      let t = [];
      while (t.length < 4) { const a = Math.floor(Math.random() * 360); if (t.every(x => angDiff(x, a) > 50)) t.push(a); }
      vault.targets = t; vault.angle = (t[0] + 180) % 360;
    }
    puzzle.open = true; puzzle.kind = 'vault'; aiming = false; mouseDown = false;
    vaultEl.classList.remove('hidden');
    vault.last = performance.now(); vault.msg = '';
    clearInterval(vault.timer); vault.timer = setInterval(() => { if (puzzle.open && puzzle.kind === 'vault') vaultTick(); else clearInterval(vault.timer); }, 30);
    renderVault();
  }
  function vaultKey(e) {
    if (e.code === 'Escape' || e.code === 'KeyE') { closePuzzle(); return; }
    const nd = (e.code === 'ArrowRight' || e.code === 'KeyD') ? 1 : (e.code === 'ArrowLeft' || e.code === 'KeyA') ? -1 : 0;
    if (!nd || nd === vault.dir) return;
    const lit = performance.now() < vault.litUntil;
    vault.dir = nd;
    if (lit && nd === -vaultReq(vault.step)) {                    // switched exactly on the flash
      vault.step++; vault.litUntil = 0; vault.msg = '';
      tone(700 + vault.step * 120, 0.08, 'square', 0.05);
      if (vault.step >= 4) {
        closePuzzle(); machine.open = true;
        for (const [type, x, y, z] of LOC.loot) spawnItem(type, x, y, z);
        tone(660, 0.1, 'square', 0.06); tone(880, 0.1, 'square', 0.06, 0.1); tone(1320, 0.25, 'square', 0.06, 0.2);
        toast('CLICK-CLUNK! The vault case opens. Grab the Crown Jewel!', 2.8);
        updateObjective();
        return;
      }
    } else {                                                        // switched at the wrong moment
      vault.wrong++; vault.step = 0; vault.msg = 'Wrong moment! The lock resets.';
      tone(160, 0.2, 'sawtooth', 0.06);
      setTimeout(() => { vault.msg = ''; }, 1500);
    }
    renderVault();
  }
  // ---- the museum terminal: memorise the intercepted key, then type it
  const hack = { done: false, code: [], input: [], until: 0, wrong: 0, timer: 0 };
  const hackEl = document.getElementById('hack');
  const hackCode = document.getElementById('hack-code');
  const hackInfo = document.getElementById('hack-info');
  const hackBar = document.getElementById('hack-bar').firstElementChild;
  function nearTerminal() { return LOC.hack && Math.hypot(player.pos.x + 10.3, player.pos.z + 19.8) < 2.4; }
  function newHackCode() { hack.code = Array.from({ length: 6 }, () => Math.floor(Math.random() * 10)); hack.input = []; hack.until = performance.now() + 4500; }
  function renderHack() {
    const showing = performance.now() < hack.until;
    hackCode.textContent = showing ? hack.code.join(' ') : hack.code.map((_, i) => i < hack.input.length ? hack.input[i] : '_').join(' ');
    hackBar.style.width = showing ? Math.max(0, (hack.until - performance.now()) / 45) + '%' : '0%';
    hackInfo.textContent = showing ? 'Memorise the key...' : 'Type the key. Wrong tries: ' + hack.wrong + ' / 3 (the third trips the alarm)';
  }
  function openHack() {
    if (puzzle.open || hack.done || phase !== 'play') return;
    newHackCode();
    puzzle.open = true; puzzle.kind = 'hack'; aiming = false; mouseDown = false;
    hackEl.classList.remove('hidden');
    renderHack();
    clearInterval(hack.timer); hack.timer = setInterval(() => { if (puzzle.open && puzzle.kind === 'hack') renderHack(); else clearInterval(hack.timer); }, 100);
  }
  function hackKey(e) {
    if (e.code === 'Escape' || e.code === 'KeyE') { closePuzzle(); return; }
    if (performance.now() < hack.until) return;
    if (e.code === 'Backspace') hack.input.pop();
    const m = /^(Digit|Numpad)([0-9])$/.exec(e.code);
    if (m && hack.input.length < 6) {
      hack.input.push(+m[2]); tone(500 + hack.input.length * 40, 0.03, 'square', 0.03);
      if (hack.input.length === 6) {
        if (hack.input.every((d, i) => d === hack.code[i])) {
          hack.done = true; closePuzzle();
          LOC.hallDoor.open = true; const i = colliders.indexOf(LOC.hallDoor.col); if (i >= 0) colliders.splice(i, 1);
          tone(660, 0.1, 'square', 0.06); tone(880, 0.1, 'square', 0.06, 0.1); tone(1320, 0.25, 'square', 0.06, 0.2);
          toast('ACCESS GRANTED... but the hack tripped a silent alarm! The FBI is coming!', 3);
          rushPolice(0);
          updateObjective();
          return;
        }
        hack.wrong++; tone(160, 0.2, 'sawtooth', 0.06); toast('ACCESS DENIED. New key!', 1.5);
        if (hack.wrong === 3) alertTeller('machine');
        newHackCode();
      }
    }
    renderHack();
  }
  // ---- the power plant puzzle: connect each wire to the terminal of the same colour
  const WIRE_COLS = ['#ff3b3b', '#3b8bff', '#ffd23f', '#4dff7a', '#c77bff'];
  const wires = { order: [0, 1, 2, 3, 4], done: [false, false, false, false, false], sel: -1, wrong: 0 };
  const wiresEl = document.getElementById('wires');
  const wiresBoard = document.getElementById('wires-board');
  const wiresInfo = document.getElementById('wires-info');
  function renderWires() {
    const Y = i => 34 + i * 50;
    let svg = '', left = '', right = '';
    for (let i = 0; i < 5; i++) {
      const ri = wires.order.indexOf(i);
      if (wires.done[i]) svg += '<line x1="70" y1="' + Y(i) + '" x2="350" y2="' + Y(ri) + '" stroke="' + WIRE_COLS[i] + '" stroke-width="8" stroke-linecap="round"/>';
      left += '<div class="wt ' + (wires.sel === i ? 'sel' : '') + (wires.done[i] ? ' done' : '') + '" style="top:' + (Y(i) - 18) + 'px;left:20px;background:' + WIRE_COLS[i] + '">' + (i + 1) + '</div>';
      const col = wires.order[i];
      right += '<div class="wt ' + (wires.done[col] ? 'done' : '') + '" style="top:' + (Y(i) - 18) + 'px;left:352px;background:' + WIRE_COLS[col] + '">' + (i + 1) + '</div>';
    }
    wiresBoard.innerHTML = '<svg width="420" height="270">' + svg + '</svg>' + left + right;
    wiresInfo.textContent = wires.wrong >= 3 ? 'The alarm is ringing! Hurry!' : (wires.sel >= 0 ? 'Now press the number of the matching terminal on the right.' : 'Press a number on the left to pick up a wire.') + '  Shocks: ' + wires.wrong + ' / 3 (the third trips the alarm)';
  }
  function openWires() {
    if (puzzle.open || machine.open || phase !== 'play') return;
    if (!wires.shuffled) { wires.shuffled = true; wires.order.sort(() => Math.random() - 0.5); }
    puzzle.open = true; puzzle.kind = 'wires'; aiming = false; mouseDown = false;
    wiresEl.classList.remove('hidden');
    renderWires();
  }
  function wireKey(e) {
    if (e.code === 'Escape' || e.code === 'KeyE') { closePuzzle(); return; }
    if (e.code === 'Backspace') wires.sel = -1;
    const m = /^(Digit|Numpad)([1-5])$/.exec(e.code);
    if (m) {
      const n = +m[2] - 1;
      if (wires.sel < 0) { if (!wires.done[n]) { wires.sel = n; tone(520, 0.04, 'square', 0.04); } }
      else if (wires.order[n] === wires.sel) {
        wires.done[wires.sel] = true; wires.sel = -1;
        tone(760, 0.08, 'square', 0.05);
        if (wires.done.every(Boolean)) {
          closePuzzle(); machine.open = true;
          for (const [type, x, y, z] of LOC.loot) spawnItem(type, x, y, z);
          tone(660, 0.1, 'square', 0.06); tone(880, 0.1, 'square', 0.06, 0.1); tone(1320, 0.25, 'square', 0.06, 0.2);
          toast('Power restored! Grab the cells, then run the laser corridor!', 2.8);
          updateObjective();
          return;
        }
      } else {
        wires.sel = -1; wires.wrong++;
        tone(160, 0.2, 'sawtooth', 0.06); hurt(10); toast('ZAP! Wrong terminal (-10 HP)', 1.4);
        if (wires.wrong === 3) alertTeller('machine');
      }
    }
    renderWires();
  }
  // ---- lasers in the corridor: touching one costs 50 HP, jump over them
  function updateLasers(dt) {
    if (!LOC.lasers) return;
    for (const L of LOC.lasers) {
      L.cd = Math.max(0, L.cd - dt);
      const blink = L.kind === 'blink';
      const on = blink ? ((time + (L.off || 0)) % 2.8) < 1.5 : true;
      for (const m of (L.meshes || [L.mesh])) { m.visible = on; m.material.color.setHex(L.cd > 0 ? 0xffffff : 0xff2a2a); }
      if (phase !== 'play' || L.cd > 0 || !on) continue;
      let hit;
      if (L.axis === 'x') hit = Math.abs(player.pos.x - L.x) < 0.3 && player.pos.z < -26.0 && player.pos.z > -29.4 && player.pos.y < (blink ? 2.0 : 0.6);
      else hit = Math.abs(player.pos.x) < 1.65 && Math.abs(player.pos.z - L.z) < 0.3 && player.pos.y < 0.6;
      if (hit) {
        L.cd = 1.3;
        hurt(50); toast(blink ? 'LASER! -50 HP. Wait for the flashing beams to switch off.' : 'LASER! -50 HP. Jump over them!', 1.6);
        tone(1100, 0.15, 'sawtooth', 0.07);
      }
    }
  }
  function closePuzzle() { puzzle.open = false; puzzleEl.classList.add('hidden'); wiresEl.classList.add('hidden'); hackEl.classList.add('hidden'); vaultEl.classList.add('hidden'); }
  function puzzleKey(e) {
    if (e.code === 'Escape' || e.code === 'KeyE') { closePuzzle(); return; }
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') puzzle.cursor = (puzzle.cursor + 2) % 3;
    else if (e.code === 'ArrowRight' || e.code === 'KeyD') puzzle.cursor = (puzzle.cursor + 1) % 3;
    else if (e.code === 'ArrowUp' || e.code === 'KeyW') { puzzle.guess[puzzle.cursor] = (puzzle.guess[puzzle.cursor] + 1) % SYMBOLS.length; tone(520, 0.03, 'square', 0.03); }
    else if (e.code === 'ArrowDown' || e.code === 'KeyS') { puzzle.guess[puzzle.cursor] = (puzzle.guess[puzzle.cursor] + SYMBOLS.length - 1) % SYMBOLS.length; tone(460, 0.03, 'square', 0.03); }
    else if (e.code === 'Enter' || e.code === 'NumpadEnter') submitGuess();
    renderPuzzle();
  }
  function submitGuess() {
    const g = puzzle.guess.slice(), c = machine.code;
    let exact = 0, near = 0;
    g.forEach((x, i) => { if (x === c[i]) exact++; else if (c.includes(x)) near++; });
    if (exact === 3) {
      closePuzzle();
      machine.open = true;
      for (const [type, x, y, z] of LOC.loot) spawnItem(type, x, y, z);
      tone(660, 0.1, 'square', 0.06); tone(880, 0.1, 'square', 0.06, 0.1); tone(1320, 0.25, 'square', 0.06, 0.2);
      toast('JACKPOT! The machine pops open. Grab the chips and run!', 2.6);
      updateObjective();
      return;
    }
    puzzle.rows.push({ g, exact, near });
    machine.wrong++;
    tone(160, 0.2, 'sawtooth', 0.06);
    if (machine.wrong === 3) alertTeller('machine');
    renderPuzzle();
  }
  function updateMachine(dt) {
    if (!LOC.vault) return;
    if (LOC.hackScreen) LOC.hackScreen.material.color.setHex(hack.done ? 0x5dff9a : 0x39e1ff);
    if (machine.open && machine.doorT < 1 && LOC.door) { machine.doorT = Math.min(1, machine.doorT + dt * 1.6); LOC.door.position.x = 8.6 + machine.doorT * 1.6; }
    if (LOC.lamp) LOC.lamp.material.color.setHex(machine.open ? 0x5dff9a : 0xff2a2a);
    if (LOC.glass) LOC.glass.visible = !machine.open;
    if (LOC.hallDoor && LOC.hallDoor.open && LOC.hallDoor.t < 1) { LOC.hallDoor.t = Math.min(1, LOC.hallDoor.t + dt * 0.8); LOC.hallDoor.mesh.position.y = 2.3 + LOC.hallDoor.t * 4.4; }
    if (puzzle.open && (phase !== 'play' || (puzzle.kind === 'hack' ? !nearTerminal() : !nearMachine()))) closePuzzle();
  }

  // ================================================================ the HQ
  // After a getaway you teleport to the headquarters: a hideout with an illegal gun shop.
  const HX = 1000;                       // the room sits far away from the heist area
  const SHOP_Z = -6.8;                   // pedestals along the back wall
  const PED_X = [HX - 9.5, HX - 6, HX - 2.5, HX + 1];
  const EXIT_POS = { x: HX + 9, z: 7 };
  const STORAGE_POS = { x: HX + 10.4, z: -1.0 };
  const hqSpin = [];
  const hqSigns = [];
  const hq = { sold: 0 };

  (function buildHQ() {
    const wallM = mat(0x3b3744), trimM = mat(0x17151c), woodM = mat(0x5b3a1e), crateM = mat(0x5a4630);
    const floorTexHQ = canvasTex(128, 128, (c, w, h) => {
      c.fillStyle = '#2a2830'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#23212a'; c.fillRect(0, 0, w / 2, h / 2); c.fillRect(w / 2, h / 2, w / 2, h / 2);
    });
    floorTexHQ.wrapS = floorTexHQ.wrapT = THREE.RepeatWrapping; floorTexHQ.repeat.set(12, 8);
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(24, 16), new THREE.MeshStandardMaterial({ map: floorTexHQ, roughness: 0.45 }));
    fl.rotation.x = -Math.PI / 2; fl.position.set(HX, 0.01, 0); fl.receiveShadow = true; scene.add(fl); aimables.push(fl);

    const o = { block: true, cam: true };
    addBox(24.8, 4.6, 0.6, wallM, HX, 2.3, -8.3, o);            // back wall
    addBox(24.8, 4.6, 0.6, wallM, HX, 2.3, 8.3, o);             // front wall
    addBox(0.6, 4.6, 17.2, wallM, HX - 12.3, 2.3, 0, o);        // side walls
    addBox(0.6, 4.6, 17.2, wallM, HX + 12.3, 2.3, 0, o);
    addBox(24.8, 0.3, 17.2, trimM, HX, 4.75, 0, { cam: true });  // ceiling
    addBox(24, 0.25, 0.1, trimM, HX, 0.12, -7.95, { aim: false });   // skirting
    const rug = new THREE.Mesh(new THREE.PlaneGeometry(9, 5), mat(0x6a1620, { roughness: 0.95 }));
    rug.rotation.x = -Math.PI / 2; rug.position.set(HX - 2, 0.03, 1.8); scene.add(rug);

    // lights
    [[HX - 8, -3.5, 0xffd9a0], [HX, -3.5, 0xffd9a0], [HX - 6, 3.5, 0xb67bff], [HX + 6, 3.5, 0x6fd6ff], [HX + 7, -4, 0xffb070]].forEach(([x, z, col]) => {
      const l = new THREE.PointLight(col, 40, 0, 2); l.position.set(x, 3.9, z); scene.add(l);
      addBox(0.9, 0.08, 0.3, new THREE.MeshBasicMaterial({ color: col }), x, 4.55, z, { cast: false, aim: false });
    });

    // dressing room on the left wall: mirror, clothes rack and a sign
    addBox(0.12, 2.3, 1.9, mat(0x9fc4d6, { metalness: 0.9, roughness: 0.08 }), HX - 11.92, 1.4, 0.2, { aim: false });
    addBox(0.16, 2.5, 0.1, woodM, HX - 11.9, 1.4, -0.8, { aim: false }); addBox(0.16, 2.5, 0.1, woodM, HX - 11.9, 1.4, 1.2, { aim: false });
    addBox(0.16, 0.1, 2.1, woodM, HX - 11.9, 2.65, 0.2, { aim: false }); addBox(0.16, 0.1, 2.1, woodM, HX - 11.9, 0.15, 0.2, { aim: false });
    addBox(0.08, 0.08, 4.6, mat(0x777b82, { metalness: 0.7, roughness: 0.4 }), HX - 10.4, 2.3, 0.2, { aim: false });
    [0xd32f2f, 0x2f6fe0, 0xf2c211, 0xff6fb5, 0x8e44d0, 0x2fb84f].forEach((c, i) => {
      addBox(0.28, 0.75, 0.7, mat(c), HX - 10.4, 1.88, -1.75 + i * 0.75 + 0.2, { aim: false });
    });
    const rugD = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 5), mat(0x2b2f4a, { roughness: 0.95 }));
    rugD.rotation.x = -Math.PI / 2; rugD.position.set(HX - 10, 0.03, 0.2); scene.add(rugD);
    const dTex = canvasTex(512, 128, (c, w, h) => {
      c.fillStyle = '#0c0a12'; c.fillRect(0, 0, w, h); c.strokeStyle = '#c77bff'; c.lineWidth = 6; c.strokeRect(6, 6, w - 12, h - 12);
      c.fillStyle = '#e7c2ff'; c.font = 'bold 50px "Segoe UI", Arial'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('DRESSING ROOM', w / 2, h / 2 + 3);
    });
    const dSign = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.8), new THREE.MeshBasicMaterial({ map: dTex }));
    dSign.position.set(HX - 11.96, 3.65, 0.2); dSign.rotation.y = Math.PI / 2; scene.add(dSign);
    { const l = new THREE.PointLight(0xe0b0ff, 18, 0, 2); l.position.set(HX - 9.5, 3.4, 0.2); scene.add(l); }

    // neon title
    const neon = canvasTex(1024, 160, (c, w, h) => {
      c.fillStyle = '#0c0a12'; c.fillRect(0, 0, w, h);
      c.shadowColor = '#ff3fa4'; c.shadowBlur = 24; c.fillStyle = '#ff7cc6';
      c.font = 'bold 84px "Segoe UI", Arial'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('THE HQ  ·  BLACK MARKET', w / 2, h / 2 + 4);
    });
    const neonM = new THREE.Mesh(new THREE.PlaneGeometry(11, 1.72), new THREE.MeshBasicMaterial({ map: neon }));
    neonM.position.set(HX, 4.05, -7.93); scene.add(neonM);

    // weapon pedestals with a spinning gun and a price sign
    SHOP_WEAPONS.forEach((t, i) => {
      const px = PED_X[i];
      addBox(2.2, 0.9, 1.3, mat(0x24222b, { roughness: 0.5 }), px, 0.45, SHOP_Z, o);
      addBox(2.3, 0.06, 1.4, mat(0xd4af37, { metalness: 0.8, roughness: 0.35 }), px, 0.93, SHOP_Z, { aim: false });
      const spin = new THREE.Group(); spin.position.set(px, 1.45, SHOP_Z);
      const gm = makeWeaponModel(t); gm.rotation.z = Math.PI / 2; gm.scale.setScalar(t === 'sniper' ? 1.3 : t === 'knife' ? 1.9 : 1.9);
      if (t === 'knife') { gm.rotation.z = Math.PI; gm.position.y = 0.0; }
      gm.position.x = t === 'sniper' ? -0.15 : 0;
      spin.add(gm); scene.add(spin); hqSpin.push(spin);
      const cv = document.createElement('canvas'); cv.width = 512; cv.height = 256;
      const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
      const sg = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.3), new THREE.MeshBasicMaterial({ map: tex }));
      sg.position.set(px, 2.75, -7.93); scene.add(sg);
      hqSigns.push({ type: t, cv, tex });
    });

    // the dealer's counter and the dealer
    addBox(3.4, 1.1, 1.2, woodM, HX + 6.5, 0.55, -6.0, o);
    addBox(3.5, 0.08, 1.3, mat(0x22201a), HX + 6.5, 1.12, -6.0, { aim: false });
    const dealer = buildNPC({ shirt: 0x5a1a1a, vest: 0x1a1a1f, pants: 0x222228, cap: 0x101012, skin: 0xc99a76 });
    dealer.group.position.set(HX + 6.5, 0, -7.2); dealer.group.rotation.y = Math.PI;
    scene.add(dealer.group); hq.dealer = dealer;
    colliders.push({ minX: HX + 6.1, maxX: HX + 6.9, minZ: -7.6, maxZ: -6.8 });
    for (const dx of [-0.9, 0, 0.9]) {
      const m = makeItemMesh(dx === 0 ? 'gold' : 'money'); m.position.set(HX + 6.5 + dx, 1.12 + (dx === 0 ? 0.12 : 0.3), -6.0); scene.add(m);
    }

    const pickTex = canvasTex(512, 160, (c, w, h) => {
      c.fillStyle = '#14120f'; c.fillRect(0, 0, w, h); c.strokeStyle = '#d4af37'; c.lineWidth = 6; c.strokeRect(6, 6, w - 12, h - 12);
      c.fillStyle = '#ffd23f'; c.font = 'bold 54px "Segoe UI", Arial'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('\u{1F511} LOCKPICKS', w / 2, 58);
      c.fillStyle = '#fff'; c.font = '40px "Segoe UI", Arial'; c.fillText('$5,000 each (E)', w / 2, 112);
    });
    const pickSign = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 0.88), new THREE.MeshBasicMaterial({ map: pickTex }));
    pickSign.position.set(HX + 6.5, 2.85, -7.93); scene.add(pickSign);

    // crates and barrels for the hideout look
    [[-10.6, 6.8, 1.3], [-9.2, 6.9, 1.0], [-10.8, 5.4, 0.9]].forEach(([x, z, sz]) => {
      addBox(sz, sz, sz, crateM, HX + x, sz / 2, z, o);
    });

    // the storage unit: ten gun lockers on the right wall
    addBox(0.9, 2.5, 5.2, mat(0x4b525c, { metalness: 0.5, roughness: 0.45 }), HX + 11.45, 1.25, -1.0, o);
    for (let r = 0; r < 5; r++) for (let c = 0; c < 2; c++) {
      addBox(0.06, 0.8, 0.95, mat(0x2d333b, { metalness: 0.4 }), HX + 10.97, 0.5 + c * 1.1, -2.8 + r * 1.1 - 0.0, { aim: false });
      addBox(0.04, 0.1, 0.3, new THREE.MeshBasicMaterial({ color: 0x5dff9a }), HX + 10.93, 0.55 + c * 1.1, -2.8 + r * 1.1, { aim: false, cast: false });
    }
    const stTex = canvasTex(512, 128, (c, w, h) => {
      c.fillStyle = '#0c1a12'; c.fillRect(0, 0, w, h); c.fillStyle = '#5dff9a';
      c.font = 'bold 56px "Segoe UI", Arial'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('GUN STORAGE', w / 2, h / 2 + 3);
    });
    const stSign = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.85), new THREE.MeshBasicMaterial({ map: stTex }));
    stSign.position.set(HX + 10.98, 3.3, -1.0); stSign.rotation.y = -Math.PI / 2; scene.add(stSign);

    // the exit door
    addBox(2.6, 3.4, 0.2, mat(0x0f2a18), EXIT_POS.x, 1.7, 7.88, { aim: false });
    const door = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 3.0), new THREE.MeshBasicMaterial({ color: 0x2fd37a }));
    door.position.set(EXIT_POS.x, 1.55, 7.76); door.rotation.y = Math.PI; scene.add(door);
    const exitTex = canvasTex(512, 128, (c, w, h) => {
      c.fillStyle = '#0c1a12'; c.fillRect(0, 0, w, h); c.fillStyle = '#5dff9a';
      c.font = 'bold 52px "Segoe UI", Arial'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('NEXT HEIST ➜', w / 2, h / 2 + 3);
    });
    const exitSign = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.8), new THREE.MeshBasicMaterial({ map: exitTex }));
    exitSign.position.set(EXIT_POS.x, 3.85, 7.76); exitSign.rotation.y = Math.PI; scene.add(exitSign);
    const exitRing = new THREE.Mesh(new THREE.RingGeometry(1.4, 1.65, 32), new THREE.MeshBasicMaterial({ color: 0x5dff9a, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false }));
    exitRing.rotation.x = -Math.PI / 2; exitRing.position.set(EXIT_POS.x, 0.05, EXIT_POS.z - 0.6); scene.add(exitRing);
    hq.exitRing = exitRing;
  })();

  function drawSigns() {
    for (const sgn of hqSigns) {
      const w = WEAPONS[sgn.type], c = sgn.cv.getContext('2d');
      const owned = ownedGun(sgn.type), carried = slots.some(s => s && s.type === sgn.type);
      c.fillStyle = '#100e16'; c.fillRect(0, 0, 512, 256);
      c.strokeStyle = owned ? '#5dff9a' : '#d4af37'; c.lineWidth = 8; c.strokeRect(6, 6, 500, 244);
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillStyle = '#fff'; c.font = 'bold 54px "Segoe UI", Arial'; c.fillText(w.name.toUpperCase(), 256, 62);
      c.fillStyle = owned ? '#5dff9a' : '#ffd23f'; c.font = 'bold 66px "Segoe UI", Arial';
      c.fillText(owned ? (carried ? 'CARRYING' : 'IN STORAGE') : money$(w.price), 256, 138);
      c.fillStyle = '#aab3c5'; c.font = '30px "Segoe UI", Arial';
      const dmg = w.pellets > 1 ? w.pellets + ' x ' + w.dmg : String(w.dmg);
      c.fillText('DMG ' + dmg + '  ·  ' + (w.melee ? 'MELEE' : w.size + ' RND') + (w.auto ? '  ·  AUTO' : ''), 256, 205);
      sgn.tex.needsUpdate = true;
    }
  }
  drawSigns();

  const fadeEl = document.getElementById('fade');
  const cashEl = document.getElementById('cash');
  const scopeEl = document.getElementById('scope');
  function renderCash() {
    cashEl.textContent = 'CASH ' + money$(save.cash) + (save.picks > 0 ? '   \u{1F511} x' + save.picks : '');
    lootEl.style.display = phase === 'hq' ? 'none' : '';
  }
  renderCash();

  function setHqLook(on) {
    scene.background.setHex(on ? 0x0a0a10 : SKY);
    scene.fog.color.setHex(on ? 0x0a0a10 : SKY);
    scene.fog.near = on ? 40 : 70; scene.fog.far = on ? 120 : 210;
    hemi.intensity = on ? 0.9 : 1.0;
    sun.visible = !on;
  }

  function saveCarry() {
    save.carry = slots.filter(s => s && WEAPONS[s.type]).map(s => s.type);
    persist();
  }

  // the getaway worked: sell the loot and teleport to the HQ
  function arriveHQ(fresh) {          // fresh = the game was just opened (no heist was played)
    if (phase === 'hq') return;
    hq.sold = fresh ? 0 : lootValue();
    for (let i = 0; i < slots.length; i++) if (slots[i] && ITEM_TYPES[slots[i].type].value > 0) slots[i] = null;
    selected = Math.max(0, slots.findIndex(Boolean));
    save.cash += hq.sold;
    if (!fresh) { save.heists++; save.done[LOC.id] = true; }
    saveCarry();
    phase = 'hq';
    stopSirens();
    alarm.on = false;
    alarmEl.classList.remove('on'); glowEl.classList.remove('on');
    hp = PLAYER_HP; renderHp();
    player.pos.set(HX - 3, 0, 4.8); player.vel.set(0, 0, 0); player.vy = 0; player.faceYaw = 0;
    yaw = 0; pitch = 0.12; aiming = false;
    gun.reload = 0;
    setHqLook(true);
    renderInventory(); renderCash(); drawSigns(); updateObjective();
    fadeEl.classList.remove('fadeout');
    pulse(fadeEl, 'fadein');
    toast(fresh ? 'Welcome back to the HQ.' : 'Welcome to the HQ. Loot sold for ' + money$(hq.sold) + '!');
    tone(660, 0.1, 'square', 0.05); tone(880, 0.1, 'square', 0.05, 0.1); tone(1320, 0.2, 'square', 0.05, 0.2);
  }

  function ownedGun(t) { return save.owned.includes(t); }
  function hqSpot() {
    if (phase !== 'hq') return null;
    let best = null, bd = 2.9;
    SHOP_WEAPONS.forEach((t, i) => {
      const d = Math.hypot(player.pos.x - PED_X[i], player.pos.z - SHOP_Z);
      if (d < bd) { bd = d; best = { kind: 'weapon', type: t }; }
    });
    if (!best && Math.hypot(player.pos.x - (HX + 6.5), player.pos.z + 6.0) < 2.8) best = { kind: 'pick' };
    if (!best && player.pos.x < HX - 8.2 && player.pos.z > -3.2 && player.pos.z < 3.8) best = { kind: 'dress' };
    if (!best && player.pos.x > HX + 8 && player.pos.z > -4.6 && player.pos.z < 2.6) best = { kind: 'storage' };
    if (!best && Math.hypot(player.pos.x - EXIT_POS.x, player.pos.z - EXIT_POS.z) < 3.4) best = { kind: 'exit' };
    return best;
  }

  function hqPrompt(sp) {
    if (sp.kind === 'exit') return 'Step onto the green circle to choose your next heist';
    if (sp.kind === 'pick') return '<b>E</b> &nbsp;Buy a lockpick &ndash; ' + money$(PICK_PRICE) + ' (one use, you have ' + save.picks + ')' + (save.cash < PICK_PRICE ? ' <span style="color:#ff6b6b">(need ' + money$(PICK_PRICE - save.cash) + ' more)</span>' : '');
    if (sp.kind === 'dress') return '<b>E</b> &nbsp;Dressing room: change your hoodie colour (' + money$(HOODIE_PRICE) + ' each)';
    if (sp.kind === 'storage') return '<b>E</b> &nbsp;Open the gun storage (' + save.stash.filter(Boolean).length + ' / ' + STASH_SIZE + ' stored)';
    const w = WEAPONS[sp.type];
    if (!save.owned.includes(sp.type)) {
      const need = w.price - save.cash;
      return '<b>E</b> &nbsp;Buy ' + w.name + ' &ndash; ' + money$(w.price) + (need > 0 ? ' <span style="color:#ff6b6b">(need ' + money$(need) + ' more)</span>' : '');
    }
    return 'You already own the ' + w.name + ' (' + (slots.some(s => s && s.type === sp.type) ? 'carrying it' : 'in storage') + ')';
  }

  function hqInteract() {
    const sp = hqSpot();
    if (!sp) return;
    if (sp.kind === 'exit') { openChoose(); return; }
    if (sp.kind === 'storage') { openStorage(); return; }
    if (sp.kind === 'dress') { openDress(); return; }
    if (sp.kind === 'pick') {
      if (save.cash < PICK_PRICE) { toast('Not enough cash! A lockpick costs ' + money$(PICK_PRICE) + '.'); tone(150, 0.15, 'square', 0.05); return; }
      save.cash -= PICK_PRICE; save.picks++;
      tone(880, 0.08, 'square', 0.05); tone(1320, 0.12, 'square', 0.05, 0.08);
      toast('Bought a lockpick! You have ' + save.picks + '.');
      saveCarry(); renderCash();
      return;
    }
    const t = sp.type, w = WEAPONS[t];
    if (save.owned.includes(t)) { toast('You already own the ' + w.name + '. Move it at the gun storage.'); return; }
    if (save.cash < w.price) { toast('Not enough cash! You need ' + money$(w.price - save.cash) + ' more.'); tone(150, 0.15, 'square', 0.05); return; }
    const free = slots.findIndex(s => !s);
    const room = save.stash.indexOf(null);
    if (free < 0 && room < 0) { toast('No room: inventory and storage are both full.'); return; }
    save.cash -= w.price; save.owned.push(t);
    tone(880, 0.08, 'square', 0.05); tone(1320, 0.12, 'square', 0.05, 0.08);
    if (free >= 0) { slots[free] = { type: t }; selected = free; toast('Bought the ' + w.name + ' for ' + money$(w.price) + '!'); }
    else { save.stash[room] = t; toast('Bought the ' + w.name + '! Inventory full, so it went into your storage.'); }
    saveCarry();
    renderInventory(); renderCash(); drawSigns();
  }

  // ---- the dressing room: buy and wear hoodie colours
  const dressEl = document.getElementById('dress');
  const dressGrid = document.getElementById('dress-grid');
  const dressMsg = document.getElementById('dress-msg');
  function applyHoodie() { model.hoodie.color.setHex(HOODIES[save.hoodie].hex); }
  function renderDress(msg) {
    dressGrid.innerHTML = Object.keys(HOODIES).map(k => {
      const h = HOODIES[k], own = k === 'grey' || save.wardrobe.includes(k), cur = save.hoodie === k;
      return '<button type="button" class="sw' + (cur ? ' cur' : '') + '" data-hoodie="' + k + '"><i style="background:#' + h.hex.toString(16).padStart(6, '0') + '"></i><b>' + h.name + '</b><span>' + (cur ? 'wearing' : own ? 'owned - wear' : money$(HOODIE_PRICE)) + '</span></button>';
    }).join('');
    dressMsg.textContent = msg || 'Cash: ' + money$(save.cash) + '. A new colour costs ' + money$(HOODIE_PRICE) + ' and is yours for good.';
  }
  function openDress() {
    if (phase !== 'hq') return;
    phase = 'storage';
    storageOpenedAt = performance.now();
    renderDress();
    dressEl.classList.remove('hidden');
    aiming = false; mouseDown = false;
    try { document.exitPointerLock(); } catch (err) { /* ignore */ }
  }
  function dressPick(k) {
    if (phase !== 'storage' || !HOODIES[k]) return;
    if (k !== 'grey' && !save.wardrobe.includes(k)) {
      if (save.cash < HOODIE_PRICE) { renderDress('Not enough cash! The ' + HOODIES[k].name.toLowerCase() + ' hoodie costs ' + money$(HOODIE_PRICE) + '.'); tone(150, 0.15, 'square', 0.05); return; }
      save.cash -= HOODIE_PRICE; save.wardrobe.push(k);
      tone(880, 0.08, 'square', 0.05); tone(1320, 0.12, 'square', 0.05, 0.08);
    }
    save.hoodie = k; applyHoodie(); persist(); renderCash();
    renderDress('You are now wearing the ' + HOODIES[k].name.toLowerCase() + ' hoodie.');
  }
  dressEl.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.id === 'dress-close') closeStorage();
    else if (b.dataset.hoodie) dressPick(b.dataset.hoodie);
  });
  applyHoodie();

  // ---- the gun storage unit: ten slots for guns you are not carrying
  const storageEl = document.getElementById('storage');
  const storageCarry = document.getElementById('storage-carry');
  const storageGrid = document.getElementById('storage-grid');
  const storageMsg = document.getElementById('storage-msg');
  const gunBtn = (t, attr, i) => '<button type="button" class="gun' + (t ? '' : ' empty') + '" ' + attr + '="' + i + '">' + (t ? '<span class="ic">' + ITEM_TYPES[t].icon + '</span><span class="nm">' + ITEM_TYPES[t].name + '</span>' : '') + '</button>';
  function renderStorage(msg) {
    storageCarry.innerHTML = slots.map((sl, i) => {
      return gunBtn(sl && WEAPONS[sl.type] ? sl.type : (sl ? sl.type : null), 'data-carry', i);
    }).join('');
    storageGrid.innerHTML = save.stash.map((t, i) => gunBtn(t, 'data-stash', i)).join('');
    storageMsg.textContent = msg || 'Click a gun to move it. Guns you carry take up inventory slots.';
  }
  let storageOpenedAt = 0;
  function openStorage() {
    if (phase !== 'hq') return;
    phase = 'storage';
    storageOpenedAt = performance.now();
    renderStorage();
    storageEl.classList.remove('hidden');
    aiming = false; mouseDown = false;
    try { document.exitPointerLock(); } catch (err) { /* ignore */ }
  }
  function closeStorage() {
    if (phase !== 'storage') return;
    phase = 'hq';
    storageEl.classList.add('hidden'); dressEl.classList.add('hidden');
    saveCarry(); renderInventory(); drawSigns();
    try { renderer.domElement.requestPointerLock(); } catch (err) { /* ignore */ }
  }
  function storageClick(kind, i) {
    if (phase !== 'storage') return;
    if (kind === 'carry') {
      const sl = slots[i];
      if (!sl) return;
      if (!WEAPONS[sl.type]) { renderStorage('You can only store guns.'); return; }
      const room = save.stash.indexOf(null);
      if (room < 0) { renderStorage('The storage is full (10 / 10).'); return; }
      save.stash[room] = sl.type; slots[i] = null;
      if (selected === i) selected = Math.max(0, slots.findIndex(Boolean));
      renderStorage('Stored the ' + WEAPONS[sl.type].name + '.');
    } else {
      const t = save.stash[i];
      if (!t) return;
      const free = slots.findIndex(x => !x);
      if (free < 0) { renderStorage('Your inventory is full. Store a gun first.'); return; }
      slots[free] = { type: t }; save.stash[i] = null;
      renderStorage('Took the ' + WEAPONS[t].name + ' (slot ' + (free + 1) + ').');
    }
    tone(700, 0.05, 'square', 0.04);
    saveCarry(); renderInventory(); drawSigns();
  }
  storageEl.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.id === 'storage-close') closeStorage();
    else if (b.dataset.carry !== undefined) storageClick('carry', +b.dataset.carry);
    else if (b.dataset.stash !== undefined) storageClick('stash', +b.dataset.stash);
  });
  document.addEventListener('keydown', e => {
    if (phase === 'storage' && !e.repeat && (e.code === 'Escape' || (e.code === 'KeyE' && performance.now() - storageOpenedAt > 300))) closeStorage();
  });

  // ---- choose the next job
  const chooseEl = document.getElementById('choose');
  const chooseList = document.getElementById('choose-list');
  const chooseBack = document.getElementById('choose-back');
  function jobOptions() {
    const ids = ['power', 'factory', 'casino'];
    if (save.heists >= 2) ids.push('bank');          // once you are a veteran the bank is back on the list
    ids.push('jewel');
    return ids;
  }
  function openChoose() {
    if (phase !== 'hq') return;
    phase = 'choosing';
    chooseList.innerHTML = '';
    jobOptions().forEach((id, i) => {
      const L = LOCS[id];
      const total = L.loot.reduce((sum, l) => sum + ITEM_TYPES[l[0]].value, 0);
      const b = document.createElement('button');
      b.className = 'job' + (id === 'jewel' && jewelLeft().length ? ' locked' : ''); b.dataset.id = id;
      b.innerHTML = '<span class="k">' + (i + 1) + '</span><span class="n">' + L.name + '</span><span class="t">' + L.tag + '</span><span class="v">Loot on site: ' + money$(total) + (id === 'jewel' && jewelLeft().length ? ' &nbsp;&middot;&nbsp; <b style="color:#ff6b6b">LOCKED: still to do: ' + jewelLeft().map(k => LOCS[k].name).join(', ') + '</b>' : '') + (id === 'factory' ? ' &nbsp;&middot;&nbsp; <b style="color:' + (save.picks > 0 ? '#5dff9a' : '#ff6b6b') + '">needs a lockpick (you have ' + save.picks + ')</b>' : '') + '</span>';
      b.addEventListener('click', () => pickJob(id));
      chooseList.appendChild(b);
    });
    chooseEl.classList.remove('hidden');
    aiming = false; mouseDown = false;
    try { document.exitPointerLock(); } catch (err) { /* ignore */ }
  }
  function closeChoose() {
    if (phase !== 'choosing') return;
    phase = 'hq';
    hq.ringLock = true;
    chooseEl.classList.add('hidden');
    try { renderer.domElement.requestPointerLock(); } catch (err) { /* ignore */ }
  }
  const jewelLeft = () => ['bank', 'power', 'factory', 'casino'].filter(k => !save.done[k]);
  function pickJob(id) {
    if (phase !== 'choosing' || !LOCS[id]) return;
    if (id === 'jewel' && jewelLeft().length) { toast('Locked! Finish the Bank, Power Plant, Factory and Casino first.'); tone(150, 0.15, 'square', 0.05); return; }
    if (id === 'factory' && save.picks < 1) { toast('The Factory needs a lockpick! Buy one at the dealer (' + money$(PICK_PRICE) + ').'); tone(150, 0.15, 'square', 0.05); return; }
    phase = 'leaving';
    save.next = id; save.go = true;      // the next page load starts this heist
    saveCarry();
    chooseEl.classList.add('hidden');
    pulse(fadeEl, 'fadeout');
    toast('Off to the ' + LOCS[id].name + '...');
    setTimeout(() => location.reload(), 750);
  }
  chooseBack.addEventListener('click', closeChoose);
  document.addEventListener('keydown', e => {
    if (phase !== 'choosing' || e.repeat) return;
    const ids = jobOptions();
    const m = /^Digit([1-9])$/.exec(e.code);
    if (m && ids[+m[1] - 1]) pickJob(ids[+m[1] - 1]);
    else if (e.code === 'Escape' || e.code === 'KeyE') closeChoose();
  });

  function updateHQ(dt) {
    alarmEl.classList.remove('on'); glowEl.classList.remove('on');
    hqSpin.forEach((g, i) => { g.rotation.y += dt * 0.8; g.position.y = 1.45 + Math.sin(time * 1.6 + i) * 0.05; });
    const d = hq.dealer;
    if (d) {
      const want = Math.atan2(-(player.pos.x - d.group.position.x), -(player.pos.z - d.group.position.z));
      const rel = ((want - Math.PI + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      d.head.rotation.y = clamp(rel, -0.9, 0.9);
      d.torso.position.y = 1.22 + Math.sin(time * 1.5) * 0.008;
    }
    hq.exitRing.material.opacity = 0.35 + 0.25 * Math.sin(time * 3);
    // stepping onto the green circle opens the job list (after Back, step off and on again to reopen it)
    const onRing = Math.hypot(player.pos.x - EXIT_POS.x, player.pos.z - (EXIT_POS.z - 0.6)) < 1.6;
    if (onRing && !hq.ringLock) openChoose();
    if (!onRing) hq.ringLock = false;
    scopeEl.classList.remove('on');
  }

  renderHp();

  // ----------------------------------------------------------------- update
  function updatePlayer(dt) {
    const ctl = (phase === 'play' && !puzzle.open) || phase === 'hq';
    const ix = ctl ? (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0) : 0;
    const iz = ctl ? (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0) : 0;
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

    if (ctl && keys.Space && player.onGround) { player.vy = 6.8; player.onGround = false; }

    if (player.climb) {                                               // on the ladder: W up, S down
      player.vel.set(0, 0, 0); player.vy = 0; player.onGround = false;
      const goal = player.climbDir || 1;                              // climbs by itself toward the top (or bottom); the opposite key reverses
      const kUp = ctl && (keys.KeyW || keys.ArrowUp), kDn = ctl && (keys.KeyS || keys.ArrowDown);
      player.pos.y += (kUp ? 1 : kDn ? -1 : goal) * 3.2 * dt;
      player.pos.x = LADDER.x; player.pos.z = LADDER.z;
      if (player.pos.y <= 0) { player.pos.y = 0; player.climb = false; player.pos.x = LADDER.x - 1.1; }
      else if (player.pos.y >= 10.8) { player.climb = false; player.pos.set(9.2, 10.8, LADDER.z); player.onGround = true; toast('On the roof! Get to the helicopter.', 2); }
    } else {
    const ox = player.pos.x, oz = player.pos.z, prevY = player.pos.y;
    player.pos.x += player.vel.x * dt; resolveCollisions(player.pos, player.radius);
    if (walkables.length && blockedBySolid(player.pos, prevY)) player.pos.x = ox;
    player.pos.z += player.vel.z * dt; resolveCollisions(player.pos, player.radius);
    if (walkables.length && blockedBySolid(player.pos, prevY)) player.pos.z = oz;

    const gy = walkables.length ? groundAt(player.pos.x, player.pos.z, prevY) : 0;
    if (player.onGround && player.vy <= 0 && prevY - gy <= 0.5) player.pos.y = gy;      // walk down stairs without falling
    player.vy -= 20 * dt;
    player.pos.y += player.vy * dt;
    if (player.pos.y <= gy) { player.pos.y = gy; player.vy = 0; player.onGround = true; } else player.onGround = false;
    }
    if (player.pos.y > 9) { player.pos.x = clamp(player.pos.x, -12.6, 12.6); player.pos.z = clamp(player.pos.z, -30.3, -12.3); }   // roof edge

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
      rArm += gun.kick * (WEAPONS[activeW].melee ? 0.9 : 0.22);
    }
    if (model.heldMoney.visible || model.heldGold.visible) lArm = 0.9;
    model.armR.rotation.x = rArm;
    model.armL.rotation.x = lArm;

    crossEl.classList.toggle('moving', sp > 1 || !player.onGround);
  }

  function updateCamera(dt) {
    const k = Math.min(1, 10 * dt);
    const wz = holdingGun() ? WEAPONS[activeW] : WEAPONS.pistol;
    camDist += ((aiming ? wz.dist : 3.8) - camDist) * k;
    camShoulder += ((aiming ? 0.75 : 0.6) - camShoulder) * k;
    camera.fov += ((aiming ? wz.fov : 65) - camera.fov) * k;
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
    model.group.visible = d > 0.9 && phase !== 'escaping';
    if (window.__bhFree) { camera.position.set(...window.__bhFree.p); camera.lookAt(...window.__bhFree.t); model.group.visible = false; }   // debug only

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

    syncWeapon();
    if (mouseDown && WEAPONS[activeW].auto) shoot();
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

    updateHeist(dt);
    if (phase === 'escaping') updateEscape(dt); else updatePlayer(dt);
    updateCamera(dt);

    // HUD
    const showAmmo = holdingGun() && !WEAPONS[activeW].melee;
    ammoEl.classList.toggle('dim', !showAmmo);
    crossEl.classList.toggle('hidden', !holdingGun() && !aiming);
    ammoMagEl.textContent = gun.mag;
    ammoResEl.textContent = ' / ' + gun.reserve;
    reloadEl.classList.toggle('show', gun.reload > 0);
    scopeEl.classList.toggle('on', aiming && showAmmo && activeW === 'sniper' && camera.fov < 40);

    const it = nearestItem();
    let p = '';
    if (it) p = '<b>E</b> &nbsp;Pick up ' + ITEM_TYPES[it.type].name + ' ($' + ITEM_TYPES[it.type].value.toLocaleString('en-US') + ')';
    if (phase === 'hq') { const sp = hqSpot(); if (sp) p = hqPrompt(sp); }
    if (!it && phase === 'play' && LOC.vault && !machine.open && !puzzle.open && nearMachine()) p = '<b>E</b> &nbsp;' + (LOC.wires ? 'Reconnect the wires' : LOC.hack ? 'Spin the vault dial' : 'Crack the jackpot machine');
    if (phase === 'play' && LOC.lock && !LOC.lock.open && nearLock()) p = LOC.lock.t > 0 ? 'Picking the lock... ' + Math.round((1 - LOC.lock.t / LOCK_TIME) * 100) + '%' : (save.picks > 0 ? '<b>E</b> &nbsp;Pick the lock (uses 1 lockpick, you have ' + save.picks + ')' : 'Locked! You need a lockpick (buy them at the HQ)');
    if (!it && phase === 'play' && LOC.hack && !hack.done && !puzzle.open && nearTerminal()) p = '<b>E</b> &nbsp;Hack the security terminal';
    if (!it && phase === 'play' && nearLadder()) p = '<b>E</b> &nbsp;' + (player.pos.y > 9 ? 'Climb down the ladder' : 'Climb the ladder to the roof (W up, S down)');
    if (!it && phase === 'play' && nearCar()) p = '<b>E</b> &nbsp;' + (lootValue() > 0 ? (LOC.heli ? 'Get in the helicopter and escape!' : 'Get in the getaway car and escape!') : (LOC.heli ? 'Helicopter (grab the loot first)' : 'Getaway car (grab some money first)'));
    if (p !== lastPrompt) {
      lastPrompt = p;
      promptEl.innerHTML = p;
      promptEl.classList.toggle('show', !!p);
    }
  }

  // ------------------------------------------------------------------- loop
  renderInventory();
  updateObjective();
  if (LOC.id !== 'bank') {
    document.querySelector('#overlay .tag').textContent = 'Today\'s job: ' + LOC.name + '. Hold up the ' + LOC.staff + ', grab the loot and escape in the getaway car. The police show up 30 seconds after the alarm goes off.';
  }
  if (LOC.id === 'jewel') {
    document.querySelector('#overlay .tag').textContent = 'Today\'s job: The Crown Jewel. Hack the terminal (the FBI comes right after!), run the laser hall, spin the vault dial, take the crown, climb the ladder to the roof and fly out.';
  }
  if (LOC.id === 'factory') {
    document.querySelector('#overlay .tag').textContent = 'Today\'s job: The Factory. Take the staff door at the back, climb the stairs, pick the lock (1 lockpick), grab the goods and escape out the back door. Guards patrol the factory.';
  }
  gun.mag = gun.size;
  setHeld('pistol');

  // Optional test hooks: open the page with #debug in the URL
  if (location.hash === '#debug') {
    window.__bh = {
      activate(v) { forced = v; overlay.classList.toggle('hidden', v); },
      key(code, v) { keys[code] = v; },
      look(y, p) { yaw = y; pitch = p; },
      teleport(x, z, y) { player.pos.set(x, y || 0, z); player.vy = 0; },
      get cols() { return colliders.filter(c => c.minZ < -24 && c.maxZ > -30 && c.maxX > 2 && c.minX < 12).map(c => [c.minX, c.maxX, c.minZ, c.maxZ].map(v => +v.toFixed(2))); }, lootGive(t) { const f = slots.findIndex(x => !x); if (f >= 0) { slots[f] = { type: t }; renderInventory(); } }, openVault, vaultKey, vault, openHack, hackKey, hack, get done() { return save.done; }, get climbing() { return player.climb; }, openWires, wireKey, wires, get lasers() { return LOC.lasers && LOC.lasers.map(l => l.z); }, stepLasers(s) { for (let i = 0; i < s * 20; i++) updateLasers(0.05); }, stepLock(s) { for (let i = 0; i < s * 20; i++) updateLock(0.05); }, get lock() { return LOC.lock && { open: LOC.lock.open, t: LOC.lock.t }; }, get picks() { return save.picks; }, givePicks(n) { save.picks += n; renderCash(); }, get guards() { return cops.filter(c => c.guard).map(c => ({ hp: c.hp, dead: c.dead, active: c.active, pos: [c.pos.x, c.pos.y, c.pos.z] })); }, py() { return player.pos.y; },
      aim(v) { aiming = v; },
      openStorage, openDress, dressPick, get hoodie() { return save.hoodie; }, storageClick, closeStorage, get stash() { return save.stash.slice(); },
      openPuzzle, puzzleKey, machine, puzzle, get clues() { return LOC.clues; }, get code() { return LOC.code; },
      arriveHQ, hqInteract, openChoose, pickJob, get loc() { return LOC.id; }, hqSpot, save, give(t) { save.cash += t; renderCash(); },
      shoot, tryPickup, dropSelected, selectSlot, startReload, interact, hurt,
      alert() { alertTeller('gun'); },
      skipAlarm(s) { alarm.t += s; }, stepPolice(s) { for (let i = 0; i < s * 20; i++) { time += 0.05; alarm.t += 0.05; updatePolice(0.05); } },
      rush() { rushPolice(); }, killCops() { for (const c of cops) if (!c.dead) damageCop(c, c.pos.clone().setY(1), UP, 9999); }, get gamblers() { return gamblers.map(g => ({ hp: g.hp, dead: g.dead, pos: [g.pos.x, g.pos.z] })); }, get wave() { return { n: wave.n, driving: wave.driving, kind: wave.stats && wave.stats.kind, cars: wave.cars.length, delay: alarm.delay, t: alarm.t }; },
      copsInfo() { return cops.map(c => ({ hp: c.hp, dead: c.dead, pos: [+c.pos.x.toFixed(1), +c.pos.z.toFixed(1)], los: c.los })); },
      get info() {
        return { pos: player.pos.toArray(), slots: slots.map(s => s && s.type), selected, activeW, cash: save.cash, owned: save.owned.slice(), mag: gun.mag, reserve: gun.reserve, hits, items: worldItems.length, decals: decals.length, loot: lootValue(), camera: camera.position.toArray(), phase, hp: Math.round(hp), alarm: { on: alarm.on, t: +alarm.t.toFixed(1), here: alarm.policeHere }, teller: teller.state, cops: cops.filter(c => !c.dead).length, kills };
      }
    };
  }

  // After your first finished heist the game always opens at the HQ; only picking a job there starts the next heist.
  if (save.go) { save.go = false; persist(); }
  else if (save.heists >= 1) {
    arriveHQ(true);
    document.querySelector('#overlay .tag').textContent = 'Welcome back to the HQ. Buy guns, manage your storage, then step onto the green circle to pick your next heist.';
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
