/* Criminal Runaway
 * Top-down escape game. Grab all the cash, then reach the getaway car
 * without getting caught by the police.
 */
(() => {
  'use strict';

  // ---------------------------------------------------------------- constants
  const TILE = 32, COLS = 25, ROWS = 18;
  const MAP_W = COLS * TILE, MAP_H = ROWS * TILE, HUD_H = 44;
  const START_TX = 1, START_TY = ROWS - 2;
  const EXIT_TX = COLS - 2, EXIT_TY = 1;
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const WALK = 125, SPRINT = 190;
  const BEST_KEY = 'criminalRunaway.best';
  const STATE = { TITLE: 'title', PLAY: 'play', PAUSE: 'pause', LEVEL: 'level', OVER: 'over' };
  const FONT = '"Courier New", monospace';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const sprintBtn = document.getElementById('sprint');
  canvas.width = MAP_W;
  canvas.height = MAP_H + HUD_H;

  // -------------------------------------------------------------------- state
  let state = STATE.TITLE;
  let level = 1, score = 0, lives = 3, best = loadBest();
  let grid = null, dist = null, playerTileIdx = -1;
  let player = null, cops = [], cash = [], exit = null, startPos = null;
  let collected = 0, levelTime = 0, levelBonus = 0;
  let invuln = 0, freeze = 0, time = 0, toast = null;

  const keys = new Set();
  let sprintHeld = false;
  const touch = { active: false, id: null, ox: 0, oy: 0, x: 0, y: 0, dx: 0, dy: 0 };

  // ---------------------------------------------------------------- utilities
  const rand = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const idx = (x, y) => y * COLS + x;
  const inBounds = (x, y) => x >= 0 && y >= 0 && x < COLS && y < ROWS;
  const isWall = (tx, ty) => !inBounds(tx, ty) || grid[ty][tx] === 1;
  const tileCenter = (tx, ty) => ({ x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 });
  const tileIdxOf = (x, y) => idx((x / TILE) | 0, (y / TILE) | 0);

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function loadBest() {
    try { return parseInt(localStorage.getItem(BEST_KEY), 10) || 0; } catch (e) { return 0; }
  }
  function saveBest() {
    if (score > best) {
      best = score;
      try { localStorage.setItem(BEST_KEY, String(best)); } catch (e) { /* ignore */ }
    }
  }

  // -------------------------------------------------------------------- audio
  let audioCtx = null, muted = false;
  function beep(freq, dur = 0.1, type = 'square', vol = 0.04, endFreq = freq) {
    if (muted) return;
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const t = audioCtx.currentTime;
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t);
      o.frequency.linearRampToValueAtTime(endFreq, t + dur);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g);
      g.connect(audioCtx.destination);
      o.start(t);
      o.stop(t + dur);
    } catch (e) { /* audio unavailable */ }
  }

  // ------------------------------------------------------------ level creation
  function bfs(g, sx, sy) {
    const d = new Int16Array(COLS * ROWS).fill(-1);
    const q = [idx(sx, sy)];
    d[q[0]] = 0;
    for (let h = 0; h < q.length; h++) {
      const c = q[h], cx = c % COLS, cy = (c / COLS) | 0;
      for (const [dx, dy] of DIRS) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS || g[ny][nx] === 1) continue;
        const ni = idx(nx, ny);
        if (d[ni] !== -1) continue;
        d[ni] = d[c] + 1;
        q.push(ni);
      }
    }
    return d;
  }

  function clearRect(g, x1, y1, x2, y2) {
    for (let y = y1; y <= y2; y++) for (let x = x1; x <= x2; x++) g[y][x] = 0;
  }

  function emptyGrid() {
    const g = Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
    for (let x = 0; x < COLS; x++) { g[0][x] = 1; g[ROWS - 1][x] = 1; }
    for (let y = 0; y < ROWS; y++) { g[y][0] = 1; g[y][COLS - 1] = 1; }
    return g;
  }

  function generateGrid(lv) {
    const interior = (COLS - 2) * (ROWS - 2);
    for (let attempt = 0; attempt < 300; attempt++) {
      const g = emptyGrid();
      const blocks = 16 + Math.min(lv * 2, 10);
      for (let i = 0; i < blocks; i++) {
        const w = rand(2, 4), h = rand(2, 3);
        const x = rand(2, COLS - w - 2), y = rand(2, ROWS - h - 2);
        for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) g[yy][xx] = 1;
      }
      clearRect(g, 1, ROWS - 4, 3, ROWS - 2);        // area around the start
      clearRect(g, COLS - 4, 1, COLS - 2, 3);        // area around the getaway car
      const d = bfs(g, START_TX, START_TY);
      if (d[idx(EXIT_TX, EXIT_TY)] < 0) continue;
      let open = 0;
      for (let y = 1; y < ROWS - 1; y++) {
        for (let x = 1; x < COLS - 1; x++) {
          if (g[y][x] !== 0) continue;
          if (d[idx(x, y)] < 0) g[y][x] = 1; else open++;   // seal off unreachable pockets
        }
      }
      if (open < interior * 0.5) continue;
      return g;
    }
    // Fallback: a simple arena with a few fixed blocks
    const g = emptyGrid();
    for (const [x, y] of [[6, 5], [7, 5], [12, 9], [13, 9], [18, 4], [18, 5], [8, 12], [9, 12]]) g[y][x] = 1;
    return g;
  }

  function makeCop(tx, ty) {
    const c = tileCenter(tx, ty);
    return { x: c.x, y: c.y, r: 10, tx0: tx, ty0: ty, tgt: null, prev: null, alert: 0, flash: Math.random() * 6 };
  }

  function setupLevel() {
    grid = generateGrid(level);
    const d0 = bfs(grid, START_TX, START_TY);
    const open = [];
    for (let y = 1; y < ROWS - 1; y++) {
      for (let x = 1; x < COLS - 1; x++) {
        if (grid[y][x] === 0 && d0[idx(x, y)] >= 0) open.push({ x, y, d: d0[idx(x, y)] });
      }
    }

    startPos = tileCenter(START_TX, START_TY);
    exit = Object.assign({ tx: EXIT_TX, ty: EXIT_TY }, tileCenter(EXIT_TX, EXIT_TY));

    // Cash bags
    const nCash = Math.min(3 + level, 10);
    cash = [];
    const cashCand = shuffle(open.filter(t => t.d >= 6 && !(t.x >= COLS - 5 && t.y <= 4)));
    for (const t of cashCand) {
      if (cash.length >= nCash) break;
      if (cash.every(c => Math.hypot(c.tx - t.x, c.ty - t.y) >= 4)) {
        cash.push(Object.assign({ tx: t.x, ty: t.y, taken: false, phase: Math.random() * 6 }, tileCenter(t.x, t.y)));
      }
    }

    // Cops start far away from the player
    const nCops = Math.min(2 + Math.ceil(level * 0.8), 8);
    cops = [];
    for (const minD of [14, 8, 4]) {
      const cand = shuffle(open.filter(t => t.d >= minD));
      for (const t of cand) {
        if (cops.length >= nCops) break;
        if (cops.every(c => Math.hypot(c.tx0 - t.x, c.ty0 - t.y) >= 5)) cops.push(makeCop(t.x, t.y));
      }
      if (cops.length >= nCops) break;
    }

    player = { x: startPos.x, y: startPos.y, r: 9, stamina: 100, exhausted: false, sprinting: false };
    collected = 0;
    levelTime = 0;
    invuln = 1;
    freeze = 1;
    toast = null;
    playerTileIdx = -1;
  }

  function resetPositions() {
    player.x = startPos.x;
    player.y = startPos.y;
    player.stamina = 100;
    player.exhausted = false;
    for (const c of cops) {
      const p = tileCenter(c.tx0, c.ty0);
      c.x = p.x; c.y = p.y; c.tgt = null; c.prev = null; c.alert = 0;
    }
    playerTileIdx = -1;
  }

  // ------------------------------------------------------------------ control
  function startGame() {
    level = 1; score = 0; lives = 3;
    setupLevel();
    state = STATE.PLAY;
    beep(520, 0.12); setTimeout(() => beep(780, 0.15), 120);
  }

  function nextLevel() {
    level++;
    setupLevel();
    state = STATE.PLAY;
  }

  function advance() {
    if (state === STATE.TITLE || state === STATE.OVER) startGame();
    else if (state === STATE.LEVEL) nextLevel();
    else if (state === STATE.PAUSE) state = STATE.PLAY;
  }

  function togglePause() {
    if (state === STATE.PLAY) state = STATE.PAUSE;
    else if (state === STATE.PAUSE) state = STATE.PLAY;
  }

  function showToast(text, secs = 1.6) { toast = { text, t: secs }; }

  function inputVector() {
    let x = 0, y = 0;
    if (keys.has('ArrowLeft') || keys.has('KeyA')) x -= 1;
    if (keys.has('ArrowRight') || keys.has('KeyD')) x += 1;
    if (keys.has('ArrowUp') || keys.has('KeyW')) y -= 1;
    if (keys.has('ArrowDown') || keys.has('KeyS')) y += 1;
    if (touch.active) { x += touch.dx; y += touch.dy; }
    const m = Math.hypot(x, y);
    if (m > 1) { x /= m; y /= m; }
    return { x, y };
  }

  // ---------------------------------------------------------------- movement
  function collides(e) {
    const r = e.r;
    return isWall(((e.x - r) / TILE) | 0, ((e.y - r) / TILE) | 0) ||
           isWall(((e.x + r) / TILE) | 0, ((e.y - r) / TILE) | 0) ||
           isWall(((e.x - r) / TILE) | 0, ((e.y + r) / TILE) | 0) ||
           isWall(((e.x + r) / TILE) | 0, ((e.y + r) / TILE) | 0);
  }

  // Gently slide the player toward the middle of a corridor so corners don't snag.
  function nudge(e, axis, amt) {
    const c = Math.floor(e[axis] / TILE) * TILE + TILE / 2;
    const diff = c - e[axis];
    if (Math.abs(diff) < 0.01 || Math.abs(diff) > 12) return;
    const old = e[axis];
    e[axis] += Math.sign(diff) * Math.min(Math.abs(diff), amt);
    if (collides(e)) e[axis] = old;
  }

  function moveEntity(e, dx, dy) {
    if (dx) {
      e.x += dx;
      if (collides(e)) { e.x -= dx; if (!dy) nudge(e, 'y', Math.abs(dx)); }
    }
    if (dy) {
      e.y += dy;
      if (collides(e)) { e.y -= dy; if (!dx) nudge(e, 'x', Math.abs(dy)); }
    }
  }

  function updatePlayer(dt) {
    const p = player;
    const v = inputVector();
    const moving = v.x !== 0 || v.y !== 0;
    const wantSprint = moving && (keys.has('ShiftLeft') || keys.has('ShiftRight') || keys.has('Space') || sprintHeld);
    let sprinting = false;
    if (wantSprint && !p.exhausted && p.stamina > 0) {
      sprinting = true;
      p.stamina = Math.max(0, p.stamina - 38 * dt);
      if (p.stamina <= 0) p.exhausted = true;
    } else {
      p.stamina = Math.min(100, p.stamina + (moving ? 14 : 26) * dt);
      if (p.exhausted && p.stamina >= 30) p.exhausted = false;
    }
    p.sprinting = sprinting;
    const sp = sprinting ? SPRINT : WALK;
    moveEntity(p, v.x * sp * dt, v.y * sp * dt);
  }

  function copChaseSpeed() { return Math.min(100 + level * 7, 175); }

  function pickTarget(c, tx, ty, chasing) {
    const here = dist[idx(tx, ty)];
    if (chasing && here === 0) return { x: player.x, y: player.y };
    let opts = [];
    for (const [dx, dy] of DIRS) {
      const nx = tx + dx, ny = ty + dy;
      if (isWall(nx, ny)) continue;
      opts.push({ nx, ny, d: dist[idx(nx, ny)] });
    }
    if (!opts.length) return null;
    let pick;
    if (chasing) {
      opts = opts.filter(o => o.d >= 0);
      if (!opts.length) return null;
      const min = Math.min(...opts.map(o => o.d));
      const best = opts.filter(o => o.d === min);
      pick = best[Math.floor(Math.random() * best.length)];
    } else {
      const forward = opts.filter(o => !(c.prev && o.nx === c.prev.x && o.ny === c.prev.y));
      const pool = forward.length ? forward : opts;
      pick = pool[Math.floor(Math.random() * pool.length)];
    }
    c.prev = { x: tx, y: ty };
    return tileCenter(pick.nx, pick.ny);
  }

  function updateCop(c, dt) {
    const tx = (c.x / TILE) | 0, ty = (c.y / TILE) | 0;
    const d = dist[idx(tx, ty)];
    const sight = player.sprinting ? 11 : 7;      // running makes noise
    if (d >= 0 && d <= sight) c.alert = 3;
    else if (c.alert > 0) c.alert -= dt;

    const chasing = c.alert > 0;
    const speed = chasing ? copChaseSpeed() : copChaseSpeed() * 0.55;
    if (!c.tgt) c.tgt = pickTarget(c, tx, ty, chasing);
    if (!c.tgt) return;

    const dx = c.tgt.x - c.x, dy = c.tgt.y - c.y;
    const dd = Math.hypot(dx, dy);
    const step = speed * dt;
    if (dd <= step) { c.x = c.tgt.x; c.y = c.tgt.y; c.tgt = null; }
    else { c.x += (dx / dd) * step; c.y += (dy / dd) * step; }
  }

  function caught() {
    lives--;
    beep(300, 0.45, 'sawtooth', 0.06, 80);
    if (lives <= 0) {
      saveBest();
      state = STATE.OVER;
    } else {
      resetPositions();
      invuln = 2;
      freeze = 1.2;
      showToast('BUSTED! ' + lives + (lives === 1 ? ' life left' : ' lives left'), 2);
    }
  }

  function levelComplete() {
    levelBonus = 500 + Math.max(0, Math.round(70 - levelTime)) * 10;
    score += levelBonus;
    saveBest();
    state = STATE.LEVEL;
    beep(523, 0.12); setTimeout(() => beep(659, 0.12), 130); setTimeout(() => beep(784, 0.25), 260);
  }

  // ------------------------------------------------------------------- update
  function update(dt) {
    time += dt;
    if (state !== STATE.PLAY) return;

    levelTime += dt;
    if (invuln > 0) invuln -= dt;
    if (freeze > 0) freeze -= dt;
    if (toast) { toast.t -= dt; if (toast.t <= 0) toast = null; }

    updatePlayer(dt);

    const pt = tileIdxOf(player.x, player.y);
    if (pt !== playerTileIdx) {
      playerTileIdx = pt;
      dist = bfs(grid, pt % COLS, (pt / COLS) | 0);
    }

    if (freeze <= 0) for (const c of cops) updateCop(c, dt);

    for (const b of cash) {
      if (!b.taken && Math.hypot(b.x - player.x, b.y - player.y) < 18) {
        b.taken = true;
        collected++;
        score += 100;
        beep(660, 0.08); setTimeout(() => beep(990, 0.1), 70);
        showToast(collected >= cash.length ? 'All cash grabbed! Get to the car!' : '+$100', 1.4);
      }
    }

    if (invuln <= 0) {
      for (const c of cops) {
        if (Math.hypot(c.x - player.x, c.y - player.y) < c.r + player.r - 3) { caught(); return; }
      }
    }

    if (Math.hypot(exit.x - player.x, exit.y - player.y) < 20) {
      if (collected >= cash.length) levelComplete();
      else if (!toast) showToast('Grab all the cash first!', 1.4);
    }
  }

  // --------------------------------------------------------------------- draw
  function drawWall(x, y) {
    const h = (x * 73856093 ^ y * 19349663) >>> 0;
    const palettes = [['#5b6478', '#3a4151'], ['#6a5a63', '#453a42'], ['#4f6a6e', '#34484b']];
    const pal = palettes[h % 3];
    const px = x * TILE, py = y * TILE;
    ctx.fillStyle = pal[1];
    ctx.fillRect(px, py, TILE, TILE);
    ctx.fillStyle = pal[0];
    ctx.fillRect(px, py, TILE, TILE - 7);
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fillRect(px + 4, py + 4, TILE - 8, TILE - 15);
  }

  function drawExit() {
    const unlocked = collected >= cash.length;
    const x = exit.x, y = exit.y;
    if (unlocked) {
      const pulse = 0.5 + 0.5 * Math.sin(time * 6);
      ctx.fillStyle = 'rgba(255,210,63,' + (0.15 + 0.2 * pulse) + ')';
      ctx.beginPath(); ctx.arc(x, y, 22 + 6 * pulse, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(x - 13, y - 5, 30, 18);
    ctx.fillStyle = unlocked ? '#ffd23f' : '#6b7280';
    ctx.fillRect(x - 14, y - 8, 28, 16);
    ctx.fillStyle = '#1b1e26';
    ctx.fillRect(x + 1, y - 6, 9, 12);            // windshield
    ctx.fillRect(x - 12, y - 10, 7, 3);           // wheels
    ctx.fillRect(x - 12, y + 7, 7, 3);
    ctx.fillRect(x + 5, y - 10, 7, 3);
    ctx.fillRect(x + 5, y + 7, 7, 3);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 9px ' + FONT;
    ctx.textAlign = 'center';
    ctx.fillText(unlocked ? 'GO!' : 'EXIT', x, y - 15);
  }

  function drawCash(b) {
    const bob = Math.sin(time * 3 + b.phase) * 2;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(b.x, b.y + 9, 8, 3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#3ddc84';
    ctx.fillRect(b.x - 7, b.y - 8 + bob, 14, 16);
    ctx.fillStyle = '#1f9d57';
    ctx.fillRect(b.x - 5, b.y - 10 + bob, 10, 3);
    ctx.fillStyle = '#0d4d2a';
    ctx.font = 'bold 12px ' + FONT;
    ctx.textAlign = 'center';
    ctx.fillText('$', b.x, b.y + 4 + bob);
  }

  function drawCop(c) {
    const chasing = c.alert > 0;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(c.x, c.y + 7, 10, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2b5fd9';
    ctx.beginPath(); ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#0f2a73'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#142a6b';
    ctx.beginPath(); ctx.arc(c.x, c.y, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = Math.sin(time * 10 + c.flash) > 0 ? '#ff3b3b' : '#3b7bff';
    ctx.beginPath(); ctx.arc(c.x, c.y, 3, 0, Math.PI * 2); ctx.fill();
    if (chasing) {
      ctx.fillStyle = '#ff3b3b';
      ctx.font = 'bold 14px ' + FONT;
      ctx.textAlign = 'center';
      ctx.fillText('!', c.x, c.y - 14);
    }
  }

  function drawPlayer() {
    const p = player;
    ctx.globalAlpha = (invuln > 0 && Math.floor(time * 10) % 2 === 0) ? 0.4 : 1;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(p.x, p.y + 7, 9, 4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ff8a1f';
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#fff3e0'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#c25a00';
    ctx.fillRect(p.x - 8, p.y + 1, 16, 2);        // prison stripes
    ctx.fillRect(p.x - 7, p.y + 5, 14, 2);
    ctx.fillStyle = '#111';
    ctx.fillRect(p.x - 5, p.y - 6, 10, 4);        // mask
    if (p.sprinting) {
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 4, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawWorld() {
    ctx.fillStyle = '#262a33';
    ctx.fillRect(0, 0, MAP_W, MAP_H);
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (grid[y][x] === 1) drawWall(x, y);
        else if ((x + y) % 2 === 0) { ctx.fillStyle = '#2a2e38'; ctx.fillRect(x * TILE, y * TILE, TILE, TILE); }
      }
    }
    drawExit();
    for (const b of cash) if (!b.taken) drawCash(b);
    for (const c of cops) drawCop(c);
    drawPlayer();

    // Night-time vignette around the player
    const g = ctx.createRadialGradient(player.x, player.y, 170, player.x, player.y, 440);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, MAP_W, MAP_H);

    if (toast) {
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      ctx.fillRect(MAP_W / 2 - 160, MAP_H - 46, 320, 28);
      ctx.fillStyle = '#ffd23f';
      ctx.font = 'bold 15px ' + FONT;
      ctx.textAlign = 'center';
      ctx.fillText(toast.text, MAP_W / 2, MAP_H - 27);
    }
  }

  function drawHUD() {
    ctx.fillStyle = '#14171d';
    ctx.fillRect(0, 0, MAP_W, HUD_H);
    ctx.fillStyle = '#2a2f3b';
    ctx.fillRect(0, HUD_H - 2, MAP_W, 2);
    ctx.textAlign = 'left';
    ctx.font = 'bold 16px ' + FONT;
    ctx.fillStyle = '#cfd6e4';
    ctx.fillText('LEVEL ' + level, 14, 28);
    ctx.fillStyle = '#3ddc84';
    ctx.fillText('CASH ' + collected + '/' + cash.length, 124, 28);
    ctx.fillStyle = '#ffd23f';
    ctx.fillText('SCORE ' + score, 262, 28);
    ctx.fillStyle = '#ff4d5e';
    ctx.fillText('♥'.repeat(Math.max(lives, 0)), 420, 28);

    ctx.fillStyle = '#8a94a8';
    ctx.font = 'bold 12px ' + FONT;
    ctx.fillText('SPRINT', 560, 27);
    ctx.fillStyle = '#2a2f3b';
    ctx.fillRect(626, 16, 150, 14);
    if (player) {
      ctx.fillStyle = player.exhausted ? '#ff4d5e' : '#ff8a1f';
      ctx.fillRect(628, 18, 146 * (player.stamina / 100), 10);
    }
  }

  function drawJoystick() {
    if (!touch.active) return;
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(touch.ox, touch.oy, 44, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(touch.ox + touch.dx * 44, touch.oy + touch.dy * 44, 18, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  }

  function overlay(title, color, lines, prompt) {
    ctx.fillStyle = 'rgba(8,10,14,0.84)';
    ctx.fillRect(0, HUD_H, MAP_W, MAP_H);
    ctx.textAlign = 'center';
    ctx.fillStyle = color;
    ctx.font = 'bold 54px ' + FONT;
    ctx.fillText(title, MAP_W / 2, HUD_H + 150);
    ctx.fillStyle = '#d7deea';
    ctx.font = '18px ' + FONT;
    lines.forEach((l, i) => ctx.fillText(l, MAP_W / 2, HUD_H + 215 + i * 30));
    if (prompt && Math.floor(time * 2) % 2 === 0) {
      ctx.fillStyle = '#ffd23f';
      ctx.font = 'bold 20px ' + FONT;
      ctx.fillText(prompt, MAP_W / 2, HUD_H + MAP_H - 70);
    }
  }

  function draw() {
    ctx.fillStyle = '#0d0f14';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (grid) {
      ctx.save();
      ctx.translate(0, HUD_H);
      drawWorld();
      ctx.restore();
    }
    drawHUD();

    if (state === STATE.PLAY) drawJoystick();
    else if (state === STATE.TITLE) {
      overlay('CRIMINAL RUNAWAY', '#ff8a1f', [
        'You just robbed the bank. The cops are everywhere.',
        'Grab ALL the cash, then reach the getaway car.',
        '',
        'Move: Arrow keys / WASD     Sprint: Shift or Space',
        'Pause: P     Mute: M     Touch: drag to move',
        '',
        'BEST SCORE: ' + best
      ], 'Press ENTER or tap to start');
    } else if (state === STATE.PAUSE) {
      overlay('PAUSED', '#ffd23f', ['Take a breather.'], 'Press P, ENTER or tap to resume');
    } else if (state === STATE.LEVEL) {
      overlay('ESCAPED!', '#3ddc84', [
        'Level ' + level + ' cleared in ' + levelTime.toFixed(1) + 's',
        'Escape bonus: +' + levelBonus,
        'Score: ' + score + '     Best: ' + Math.max(best, score),
        'Next level: more cops, faster cops.'
      ], 'Press ENTER or tap to continue');
    } else if (state === STATE.OVER) {
      overlay('BUSTED!', '#ff4d5e', [
        'The police got you on level ' + level + '.',
        'Final score: ' + score,
        'Best score: ' + best
      ], 'Press ENTER or tap to try again');
    }
  }

  // -------------------------------------------------------------------- input
  window.addEventListener('keydown', e => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].indexOf(e.code) !== -1) e.preventDefault();
    keys.add(e.code);
    if (e.repeat) return;
    if (e.code === 'Enter') advance();
    else if (e.code === 'KeyP' || e.code === 'Escape') togglePause();
    else if (e.code === 'KeyM') { muted = !muted; if (state === STATE.PLAY) showToast(muted ? 'Sound off' : 'Sound on', 1); }
  });
  window.addEventListener('keyup', e => keys.delete(e.code));
  window.addEventListener('blur', () => { keys.clear(); sprintHeld = false; });
  document.addEventListener('visibilitychange', () => { if (document.hidden && state === STATE.PLAY) state = STATE.PAUSE; });

  function canvasPoint(e) {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) * canvas.width / r.width, y: (e.clientY - r.top) * canvas.height / r.height };
  }

  canvas.addEventListener('pointerdown', e => {
    if (state !== STATE.PLAY) { advance(); return; }
    if (e.pointerType !== 'touch' || touch.active) return;
    const p = canvasPoint(e);
    touch.active = true; touch.id = e.pointerId;
    touch.ox = p.x; touch.oy = p.y; touch.dx = 0; touch.dy = 0;
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  });
  canvas.addEventListener('pointermove', e => {
    if (!touch.active || e.pointerId !== touch.id) return;
    const p = canvasPoint(e);
    const dx = p.x - touch.ox, dy = p.y - touch.oy;
    const m = Math.hypot(dx, dy);
    if (m < 8) { touch.dx = 0; touch.dy = 0; return; }
    const k = Math.min(m, 44) / 44;
    touch.dx = (dx / m) * k; touch.dy = (dy / m) * k;
  });
  const endTouch = e => {
    if (touch.active && e.pointerId === touch.id) { touch.active = false; touch.dx = 0; touch.dy = 0; }
  };
  canvas.addEventListener('pointerup', endTouch);
  canvas.addEventListener('pointercancel', endTouch);

  if (sprintBtn) {
    sprintBtn.addEventListener('pointerdown', e => { e.preventDefault(); sprintHeld = true; });
    const release = () => { sprintHeld = false; };
    sprintBtn.addEventListener('pointerup', release);
    sprintBtn.addEventListener('pointerleave', release);
    sprintBtn.addEventListener('pointercancel', release);
  }

  // --------------------------------------------------------------------- loop
  setupLevel();            // gives the title screen a map to show behind it
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    update(dt);
    draw();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
