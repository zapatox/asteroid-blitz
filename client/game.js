// Asteroid Blitz — Client Three.js
import * as THREE from 'three';

const WS_URL = location.hostname === 'localhost'
  ? `ws://${location.host}`
  : `wss://${location.host}`;
const WORLD = 800;
const HALF = WORLD / 2;
const SERVER_TICK = 50;

// ─── Settings (persistés en localStorage) ────────────────────────────────────

const settings = {
  sound: localStorage.getItem('ab_sound') !== 'off',
  layout: localStorage.getItem('ab_layout') || 'wasd',
  sfxVol: parseFloat(localStorage.getItem('ab_sfxVol') ?? '0.7'),
  musicVol: parseFloat(localStorage.getItem('ab_musicVol') ?? '0.3'),
};

function saveSetting(key, val) {
  settings[key] = val;
  localStorage.setItem('ab_' + key, String(val));
}

// Master gain nodes (créés à la demande)
let sfxGain = null;
function getSfxGain() {
  const ctx = getAudio();
  if (!sfxGain) { sfxGain = ctx.createGain(); sfxGain.connect(ctx.destination); }
  sfxGain.gain.value = settings.sfxVol;
  return sfxGain;
}

// ─── Son (Web Audio API procédural) ───────────────────────────────────────────

let audioCtx = null;

function getAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function playSound(type) {
  if (!settings.sound || settings.sfxVol <= 0) return;
  try {
    const ctx = getAudio();
    const now = ctx.currentTime;
    const master = getSfxGain();
    const g = ctx.createGain();
    g.connect(master);

    if (type === 'shoot') {
      const osc = ctx.createOscillator();
      osc.connect(g);
      osc.frequency.setValueAtTime(900, now);
      osc.frequency.exponentialRampToValueAtTime(150, now + 0.08);
      g.gain.setValueAtTime(0.18, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
      osc.start(now); osc.stop(now + 0.08);

    } else if (type === 'explode') {
      const buf = ctx.createBuffer(1, ctx.sampleRate * 0.4, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass'; filter.frequency.value = 400;
      src.connect(filter); filter.connect(g);
      g.gain.setValueAtTime(0.25, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
      src.start(now);

    } else if (type === 'pickup') {
      [440, 550, 660].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const lg = ctx.createGain();
        osc.connect(lg); lg.connect(master);
        osc.frequency.value = freq;
        const t = now + i * 0.07;
        lg.gain.setValueAtTime(0.15, t);
        lg.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
        osc.start(t); osc.stop(t + 0.12);
      });

    } else if (type === 'hit') {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.connect(g);
      osc.frequency.setValueAtTime(120, now);
      osc.frequency.exponentialRampToValueAtTime(40, now + 0.15);
      g.gain.setValueAtTime(0.3, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      osc.start(now); osc.stop(now + 0.15);
    }
  } catch (e) { /* silent fail */ }
}

// ─── Musique 8-bit procédurale (multi-sections, variations) ──────────────────

// ─── Musique MP3 (menu + game) ───────────────────────────────────────────────

const menuMusic = new Audio('menu.mp3');
const gameMusic = new Audio('game.mp3');
menuMusic.loop = true;
gameMusic.loop = true;
menuMusic.volume = settings.musicVol;
gameMusic.volume = settings.musicVol;

let currentMusic = null;

function playMusic(track) {
  if (!settings.sound) return;
  if (currentMusic === track && !track.paused) return;
  stopMusic();
  track.volume = settings.musicVol;
  track.currentTime = 0;
  track.play().catch(() => {});
  currentMusic = track;
}

function startMusic() { playMusic(gameMusic); }
function startMenuMusic() { playMusic(menuMusic); }

function stopMusic() {
  if (currentMusic) {
    currentMusic.pause();
    currentMusic.currentTime = 0;
    currentMusic = null;
  }
}

function updateMusicVolume() {
  menuMusic.volume = settings.musicVol;
  gameMusic.volume = settings.musicVol;
}

// ─── Renderer & Caméra ───────────────────────────────────────────────────────

const canvas = document.getElementById('canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const scene = new THREE.Scene();
window._dbgScene = scene; // debug
scene.background = new THREE.Color(0x050510);
scene.fog = new THREE.FogExp2(0x050510, 0.0008);

function getOrthoSize() {
  const aspect = window.innerWidth / window.innerHeight;
  const h = HALF + 70; // marge visible hors arène pour la transition wrap
  return { w: h * aspect, h };
}

let { w: orthoW, h: orthoH } = getOrthoSize();
const camera = new THREE.OrthographicCamera(-orthoW, orthoW, orthoH, -orthoH, 0.1, 2000);
camera.position.set(0, -40, 600);
camera.lookAt(0, 0, 0);

function onResize() {
  renderer.setSize(window.innerWidth, window.innerHeight);
  const s = getOrthoSize();
  camera.left = -s.w; camera.right = s.w;
  camera.top = s.h; camera.bottom = -s.h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', onResize);
onResize();

// ─── Lumières ────────────────────────────────────────────────────────────────

// Lumières — suffisamment intenses pour rendre les astéroïdes visibles
scene.add(new THREE.AmbientLight(0x334455, 3.2));         // ambiant froid plus fort
const dirLight = new THREE.DirectionalLight(0x99bbdd, 2.0); // lumière principale froide
dirLight.position.set(1, 0.8, 3);
scene.add(dirLight);
const dirLight2 = new THREE.DirectionalLight(0x556677, 1.0); // contre-jour
dirLight2.position.set(-1, -0.5, 2);
scene.add(dirLight2);

// ─── Fond étoilé ─────────────────────────────────────────────────────────────

{
  const count = 2000;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    pos[i * 3]     = (Math.random() - 0.5) * 2000;
    pos[i * 3 + 1] = (Math.random() - 0.5) * 2000;
    pos[i * 3 + 2] = -80 - Math.random() * 100;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  scene.add(new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 1.2, sizeAttenuation: false })));
}

// ─── Grille arène ────────────────────────────────────────────────────────────

const gridHelper = new THREE.GridHelper(WORLD, 32, 0x112244, 0x0a1530);
gridHelper.rotation.x = Math.PI / 2;
scene.add(gridHelper);

// ── Bordures électriques ─────────────────────────────────────────────────────
const BORDER_ARC_SEGMENTS = 40; // réduit de 80 pour perf
const borderArcs = [];

function createBorderArc(x1, y1, x2, y2) {
  const positions = new Float32Array(BORDER_ARC_SEGMENTS * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.LineBasicMaterial({
    color: 0x4488ff, transparent: true, opacity: 0.8,
    blending: THREE.AdditiveBlending,
  });
  const line = new THREE.Line(geo, mat);
  line.userData = { x1, y1, x2, y2 };
  scene.add(line);
  // Glow layer
  const mat2 = new THREE.LineBasicMaterial({
    color: 0x88ccff, transparent: true, opacity: 0.3,
    blending: THREE.AdditiveBlending,
  });
  const line2 = new THREE.Line(geo.clone(), mat2);
  scene.add(line2);
  borderArcs.push({ line, line2, x1, y1, x2, y2 });
}

createBorderArc(-HALF, -HALF, HALF, -HALF); // bottom
createBorderArc(HALF, -HALF, HALF, HALF);   // right
createBorderArc(HALF, HALF, -HALF, HALF);   // top
createBorderArc(-HALF, HALF, -HALF, -HALF); // left

let borderFrame = 0;
function updateBorderArcs() {
  borderFrame++;
  if (borderFrame % 2 !== 0) return; // update every other frame
  const t = Date.now() * 0.001;
  for (const arc of borderArcs) {
    const pos = arc.line.geometry.attributes.position.array;
    const pos2 = arc.line2.geometry.attributes.position.array;
    for (let i = 0; i < BORDER_ARC_SEGMENTS; i++) {
      const frac = i / (BORDER_ARC_SEGMENTS - 1);
      const bx = arc.x1 + (arc.x2 - arc.x1) * frac;
      const by = arc.y1 + (arc.y2 - arc.y1) * frac;
      // Direction perpendiculaire au segment
      const nx = -(arc.y2 - arc.y1), ny = (arc.x2 - arc.x1);
      const len = Math.sqrt(nx * nx + ny * ny) || 1;
      // Bruit d'arc électrique : multiple fréquences
      const noise = Math.sin(frac * 31 + t * 12) * 4
                  + Math.sin(frac * 67 + t * 23) * 2.5
                  + Math.sin(frac * 137 + t * 41) * 1.5;
      const ox = (nx / len) * noise;
      const oy = (ny / len) * noise;
      pos[i * 3] = bx + ox;
      pos[i * 3 + 1] = by + oy;
      pos[i * 3 + 2] = 1;
      // Glow: offset légèrement différent
      const noise2 = Math.sin(frac * 29 + t * 15 + 1) * 5
                   + Math.sin(frac * 73 + t * 19) * 3;
      pos2[i * 3] = bx + (nx / len) * noise2;
      pos2[i * 3 + 1] = by + (ny / len) * noise2;
      pos2[i * 3 + 2] = 1;
    }
    arc.line.geometry.attributes.position.needsUpdate = true;
    arc.line2.geometry.attributes.position.needsUpdate = true;
    // Pulse d'intensité
    const pulse = 0.6 + Math.sin(t * 3) * 0.2 + Math.sin(t * 7.3) * 0.1;
    arc.line.material.opacity = pulse;
    arc.line2.material.opacity = pulse * 0.4;
  }
}

let borderZapIntensity = 0;
function triggerBorderZapFlash() {
  borderZapIntensity = 1;
}

// ─── Géométries partagées ────────────────────────────────────────────────────

// Vaisseau 3D : construit en géométrie procédurale (BufferGeometry)
// Vue du dessus pointe vers +Y, avec du volume en Z
function buildShipGeometry() {
  const g = new THREE.BufferGeometry();
  // Vertices: fuselage + ailes angulaires + cockpit bump
  //  y = avant/arrière, x = gauche/droite, z = hauteur
  const v = [
    // Fuselage central (pointu devant, large derrière)
    [ 0,  14,  1],  // 0  nez (pointe)
    [-2,   6,  2],  // 1  fuselage haut gauche
    [ 2,   6,  2],  // 2  fuselage haut droit
    [-3,  -2,  2.5],// 3  fuselage mid gauche
    [ 3,  -2,  2.5],// 4  fuselage mid droit
    [-2,  -8,  2],  // 5  fuselage arrière gauche
    [ 2,  -8,  2],  // 6  fuselage arrière droit
    [ 0, -10,  1],  // 7  queue

    // Ventre (même xy, z négatif)
    [ 0,  14, -0.5],// 8  nez bas
    [-2,   6, -1],  // 9
    [ 2,   6, -1],  // 10
    [-3,  -2, -1],  // 11
    [ 3,  -2, -1],  // 12
    [-2,  -8, -1],  // 13
    [ 2,  -8, -1],  // 14
    [ 0, -10, -0.5],// 15

    // Aile gauche (plate, angulaire)
    [-3,  -2,  1],  // 16  attache aile gauche
    [-10, -6,  0.5],// 17  bout aile gauche avant
    [-11, -10, 0.3],// 18  extrémité aile gauche
    [-5,  -8,  0.8],// 19  retour aile gauche

    // Aile droite (symétrique)
    [ 3,  -2,  1],  // 20
    [10,  -6,  0.5],// 21
    [11, -10,  0.3],// 22
    [ 5,  -8,  0.8],// 23

    // Cockpit (bosse vitrée)
    [ 0,   4,  3.5],// 24  sommet cockpit
    [-1.5, 2,  3],  // 25
    [ 1.5, 2,  3],  // 26
    [ 0,   7,  2.5],// 27  avant cockpit

    // Réacteurs (tubes arrière)
    [-1.5,-9,  1.5],// 28
    [ 1.5,-9,  1.5],// 29
    [-1.5,-11, 0.8],// 30
    [ 1.5,-11, 0.8],// 31
  ];

  const faces = [
    // Fuselage dessus
    [0,1,2], [1,3,4], [1,4,2], [3,5,6], [3,6,4], [5,7,6],
    // Fuselage dessous
    [8,10,9], [9,10,12], [9,12,11], [11,12,14], [11,14,13], [13,14,15],
    // Côtés gauche
    [0,8,9], [0,9,1], [1,9,11], [1,11,3], [3,11,13], [3,13,5], [5,13,15], [5,15,7],
    // Côtés droit
    [0,2,10], [0,10,8], [2,4,12], [2,12,10], [4,6,14], [4,14,12], [6,7,15], [6,15,14],
    // Aile gauche (dessus + dessous)
    [16,17,19], [17,18,19],
    [16,19,17], // dessous (inversé pour double-side)
    // Aile droite
    [20,23,21], [21,23,22],
    [20,21,23],
    // Cockpit
    [27,25,24], [27,24,26], [25,1,24], [26,24,2], [1,2,24],
    // Réacteurs
    [28,30,31], [28,31,29],
  ];

  const positions = [];
  const normals = [];
  for (const [a, b, c] of faces) {
    const va = v[a], vb = v[b], vc = v[c];
    positions.push(...va, ...vb, ...vc);
    // Flat normal
    const ux = vb[0]-va[0], uy = vb[1]-va[1], uz = vb[2]-va[2];
    const wx = vc[0]-va[0], wy = vc[1]-va[1], wz = vc[2]-va[2];
    let nx = uy*wz - uz*wy, ny = uz*wx - ux*wz, nz = ux*wy - uy*wx;
    const len = Math.sqrt(nx*nx + ny*ny + nz*nz) || 1;
    nx /= len; ny /= len; nz /= len;
    normals.push(nx,ny,nz, nx,ny,nz, nx,ny,nz);
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  return g;
}
const SHIP_GEO = buildShipGeometry();

// detail=1 pour les grands (plus de facettes → look rocheux), detail=0 pour les petits
const astGeos = {
  32: new THREE.IcosahedronGeometry(32, 1),
  20: new THREE.IcosahedronGeometry(20, 1),
  10: new THREE.IcosahedronGeometry(10, 0),
};

// Constantes wrap visuel
const GHOST_MARGIN = 130; // distance au bord pour afficher le fantôme (unités)
const GHOST_FADE   = 60;  // zone de fondu en/hors arène
const SMOOTH_AST   = 0.30; // lerp par frame vers position serveur

// ─── Helpers ─────────────────────────────────────────────────────────────────

function hexToInt(hex) { return parseInt(hex.replace('#', ''), 16); }
function lerp(a, b, t) { return a + (b - a) * t; }
function lerpAngle(a, b, t) {
  const diff = ((b - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  return a + diff * t;
}
// FIX wrapping : évite d'interpoler à travers le bord de la carte
function lerpWrap(a, b, t) {
  let d = b - a;
  if (d > HALF)  d -= WORLD;
  if (d < -HALF) d += WORLD;
  return a + d * t;
}

// ─── État client ─────────────────────────────────────────────────────────────

let myId = null;
let myColor = '#00ffff';
let prevSnapshot = null;
let currSnapshot = null;
let lastSnapshotTime = 0;

const playerMeshes  = new Map();
const asteroidMeshes = new Map();
const pickupMeshes  = new Map();

// ─── Vaisseaux ───────────────────────────────────────────────────────────────

function getOrCreatePlayer(snap) {
  if (playerMeshes.has(snap.id)) return playerMeshes.get(snap.id);

  const color = hexToInt(snap.color);
  const group = new THREE.Group();

  // Corps du vaisseau (3D)
  const mat = new THREE.MeshPhongMaterial({
    color, emissive: color, emissiveIntensity: 0.25,
    shininess: 100, flatShading: true, side: THREE.DoubleSide,
  });
  const body = new THREE.Mesh(SHIP_GEO, mat);
  group.add(body);

  // Contour lumineux (edges glow)
  const edgeGeo = new THREE.EdgesGeometry(SHIP_GEO, 25);
  const edgeMat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending });
  const edges = new THREE.LineSegments(edgeGeo, edgeMat);
  group.add(edges);

  // Cockpit vitre (bleu/blanc brillant)
  const cockpitGeo = new THREE.SphereGeometry(2, 6, 4, 0, Math.PI * 2, 0, Math.PI / 2);
  const cockpitMat = new THREE.MeshPhongMaterial({
    color: 0x88ccff, emissive: 0x4488ff, emissiveIntensity: 0.6,
    transparent: true, opacity: 0.7, shininess: 200,
  });
  const cockpit = new THREE.Mesh(cockpitGeo, cockpitMat);
  cockpit.position.set(0, 4, 2.5);
  cockpit.scale.set(1, 1.5, 1);
  group.add(cockpit);

  // Flamme moteur — cône pointant vers -Y (arrière du vaisseau)
  const flameMat = new THREE.MeshBasicMaterial({
    color: 0xff6600, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const flame = new THREE.Mesh(new THREE.ConeGeometry(3.5, 18, 7), flameMat);
  flame.rotation.z = Math.PI;
  flame.position.set(0, -15, 0);
  group.add(flame);
  // Cœur intérieur (plus chaud, plus court)
  const flame2Mat = new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const flame2 = new THREE.Mesh(new THREE.ConeGeometry(1.6, 9, 6), flame2Mat);
  flame2.rotation.z = Math.PI;
  flame2.position.set(0, -11, 0);
  group.add(flame2);
  group.userData.flame  = flame;
  group.userData.flame2 = flame2;

  const light = new THREE.PointLight(color, 1.8, 120);
  group.add(light);

  // Trail
  const TRAIL_LEN = 24;
  const trailPositions = new Float32Array(TRAIL_LEN * 3);
  const trailColors    = new Float32Array(TRAIL_LEN * 3);
  const trailGeo = new THREE.BufferGeometry();
  trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
  trailGeo.setAttribute('color',    new THREE.BufferAttribute(trailColors, 3));
  const trailLine = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.6 }));
  scene.add(trailLine);

  // Bouclier respawn
  const shield = new THREE.Mesh(
    new THREE.RingGeometry(12, 15, 24),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, side: THREE.DoubleSide })
  );
  group.add(shield);

  scene.add(group);

  const r = ((color >> 16) & 255) / 255;
  const g = ((color >> 8)  & 255) / 255;
  const b = (color         & 255) / 255;

  const obj = { group, trailLine, trailPositions, trailColors, TRAIL_LEN, shield, r, g, b, prevPositions: [],
    deathAnim: null, spawnAnim: null, prevRespawnTimer: 0 };
  playerMeshes.set(snap.id, obj);
  return obj;
}

function updatePlayerMesh(snap, alpha) {
  const obj = getOrCreatePlayer(snap);
  const { group, shield } = obj;

  // ── Animation de mort ────────────────────────────────────────────────────────
  if (obj.deathAnim) {
    const t = Math.min(1, (Date.now() - obj.deathAnim.startTime) / 500);
    group.visible = true;
    group.position.set(obj.deathAnim.x, obj.deathAnim.y, 0);
    group.rotation.z += 0.12; // rotation rapide en mourant
    group.scale.setScalar(Math.max(0, 1 - t));
    // Fade tous les enfants
    for (const c of group.children) {
      if (c.material) { c.material.opacity = Math.max(0, 1.2 - t * 2); }
    }
    // Trail s'efface
    for (let i = 0; i < obj.TRAIL_LEN; i++) {
      obj.trailColors[i * 3] = obj.trailColors[i * 3 + 1] = obj.trailColors[i * 3 + 2] = 0;
    }
    obj.trailLine.geometry.attributes.color.needsUpdate = true;
    if (t >= 1) { obj.deathAnim = null; group.scale.setScalar(1); }
    return;
  }

  let x = snap.x, y = snap.y, angle = snap.angle;

  if (prevSnapshot && alpha < 1) {
    const prev = prevSnapshot.players.find(p => p.id === snap.id);
    if (prev) {
      x = lerpWrap(prev.x, snap.x, alpha);
      y = lerpWrap(prev.y, snap.y, alpha);
      angle = lerpAngle(prev.angle, snap.angle, alpha);
    }
  }

  // Cacher complètement pendant le respawn (avant le retour à la vie)
  const isRespawning = snap.alive && snap.respawnTimer > 0;
  group.visible = snap.alive && !isRespawning;
  group.position.set(x, y, 0);
  group.rotation.z = angle - Math.PI / 2;

  // ── Animation de réapparition ────────────────────────────────────────────────
  const wasRespawning = obj.prevRespawnTimer > 0;
  obj.prevRespawnTimer = snap.respawnTimer;
  if (wasRespawning && snap.respawnTimer === 0 && snap.alive) {
    obj.spawnAnim = { startTime: Date.now() };
    group.visible = true;
  }
  if (obj.spawnAnim) {
    const t = Math.min(1, (Date.now() - obj.spawnAnim.startTime) / 450);
    group.visible = true;
    // Pulse : grandit puis se stabilise
    const s = t < 0.5 ? t * 2.4 : (2.4 - (t - 0.5) * 2.8);
    group.scale.setScalar(Math.max(0.1, s));
    if (t >= 1) { obj.spawnAnim = null; group.scale.setScalar(1); }
  } else if (!isRespawning) {
    group.scale.setScalar(1);
  }

  // ── Flamme moteur ────────────────────────────────────────────────────────────
  const flame  = group.userData.flame;
  const flame2 = group.userData.flame2;
  if (flame) {
    const now = Date.now() * 0.012;
    if (snap.thrust) {
      const flicker = 0.85 + Math.sin(now * 3.1) * 0.15;
      const flicker2 = 0.8 + Math.sin(now * 5.7 + 1.2) * 0.2;
      const mult = snap.boosted ? 1.35 : 1.0;
      flame.scale.set(flicker * mult, (0.9 + Math.sin(now * 4.4) * 0.15) * mult, flicker * mult);
      flame.material.opacity  = 0.75 + Math.sin(now * 2.8) * 0.15;
      flame.material.color.setHex(snap.boosted ? 0x00ccff : 0xff5500);
      flame2.scale.set(flicker2 * mult, (0.85 + Math.sin(now * 6) * 0.15) * mult, flicker2 * mult);
      flame2.material.opacity = snap.boosted ? 0.85 + Math.sin(now * 4) * 0.15 : 0.6 + Math.sin(now * 4) * 0.2;
      flame2.material.color.setHex(snap.boosted ? 0x88eeff : 0xffffff);
    } else {
      flame.material.opacity  = 0;
      flame2.material.opacity = 0;
    }
  }

  // ── Bouclier respawn ─────────────────────────────────────────────────────────
  if (snap.respawnTimer > 0) {
    const t = Date.now() * 0.006;
    shield.material.opacity = 0.3 + Math.sin(t) * 0.2;
    shield.rotation.z = t;
  } else {
    shield.material.opacity = 0;
  }

  // ── Intangible (fantôme) ────────────────────────────────────────────────────
  const bodyMat = group.children[0]?.material;
  if (bodyMat) {
    // Keep transparent always true to avoid shader recompilation
    if (!bodyMat.transparent) bodyMat.transparent = true;
    bodyMat.opacity = snap.intangible > 0
      ? 0.25 + Math.sin(Date.now() * 0.01) * 0.15
      : 1;
  }

  // ── Drone (orbite) ────────────────────────────────────────────────────────
  if (!obj.droneMesh && snap.drone > 0) {
    const dg = new THREE.Group();
    const dShape = new THREE.Shape();
    dShape.moveTo(0, 6); dShape.lineTo(-4, -3); dShape.lineTo(0, -1); dShape.lineTo(4, -3); dShape.lineTo(0, 6);
    const dGeo = new THREE.ShapeGeometry(dShape);
    const dMat = new THREE.MeshBasicMaterial({ color: 0xbb44ff, transparent: true, opacity: 0.8, side: THREE.DoubleSide });
    dg.add(new THREE.Mesh(dGeo, dMat));
    const dLight = new THREE.PointLight(0xbb44ff, 1, 40);
    dg.add(dLight);
    scene.add(dg);
    obj.droneMesh = dg;
  }
  if (obj.droneMesh) {
    if (snap.drone > 0) {
      obj.droneMesh.visible = true;
      const da = snap.droneAngle || 0;
      obj.droneMesh.position.set(x + Math.cos(da) * 30, y + Math.sin(da) * 30, 0);
      obj.droneMesh.rotation.z = da - Math.PI / 2;
    } else {
      obj.droneMesh.visible = false;
    }
  }

  // ── Gravity Well vortex ──────────────────────────────────────────────────────
  if (!obj.gravwellMesh && snap.gravwell > 0) {
    const gg = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(20 + i * 15, 1.5, 6, 32),
        new THREE.MeshBasicMaterial({ color: 0x8844ff, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending })
      );
      gg.add(ring);
    }
    const gl = new THREE.PointLight(0x8844ff, 3, 200);
    gg.add(gl);
    scene.add(gg);
    obj.gravwellMesh = gg;
  }
  if (obj.gravwellMesh) {
    if (snap.gravwell > 0) {
      obj.gravwellMesh.visible = true;
      obj.gravwellMesh.position.set(snap.gravwellX, snap.gravwellY, 0);
      const t = Date.now() * 0.003;
      obj.gravwellMesh.children.forEach((r, i) => {
        r.rotation.z = t * (1 + i * 0.5) * (i % 2 ? 1 : -1);
        if (r.material) r.material.opacity = 0.2 + Math.sin(t + i) * 0.15;
      });
    } else {
      scene.remove(obj.gravwellMesh);
      disposeGroup(obj.gravwellMesh);
      obj.gravwellMesh = null;
    }
  }

  // ── Dash cooldown indicator ─────────────────────────────────────────────────
  if (snap.dashCooldown > 0 && snap.id === myId) {
    // Could add a visual cooldown ring — for now just the HUD handles it
  }

  // ── Trail ────────────────────────────────────────────────────────────────────
  if (!isRespawning) obj.prevPositions.push({ x, y });
  if (obj.prevPositions.length > obj.TRAIL_LEN) obj.prevPositions.shift();

  const len = obj.prevPositions.length;
  for (let i = 0; i < obj.TRAIL_LEN; i++) {
    const idx = len - 1 - i;
    const px = idx >= 0 ? obj.prevPositions[idx].x : x;
    const py = idx >= 0 ? obj.prevPositions[idx].y : y;
    obj.trailPositions[i * 3]     = px;
    obj.trailPositions[i * 3 + 1] = py;
    obj.trailPositions[i * 3 + 2] = 0;
    const fade = (snap.alive && !isRespawning) ? (1 - i / obj.TRAIL_LEN) * 0.5 : 0;
    obj.trailColors[i * 3]     = obj.r * fade;
    obj.trailColors[i * 3 + 1] = obj.g * fade;
    obj.trailColors[i * 3 + 2] = obj.b * fade;
  }
  obj.trailLine.geometry.attributes.position.needsUpdate = true;
  obj.trailLine.geometry.attributes.color.needsUpdate    = true;
}

function removePlayer(id) {
  const obj = playerMeshes.get(id);
  if (!obj) return;
  scene.remove(obj.group);
  disposeGroup(obj.group);
  scene.remove(obj.trailLine);
  obj.trailLine.geometry.dispose();
  obj.trailLine.material.dispose();
  if (obj.droneMesh) { scene.remove(obj.droneMesh); disposeGroup(obj.droneMesh); }
  playerMeshes.delete(id);
}

// ─── Astéroïdes ───────────────────────────────────────────────────────────────

// Couleurs arcade par taille : plus vibrant
const AST_COLORS = { 32: 0x6688bb, 20: 0x88aacc, 10: 0xaaccdd };
const AST_EMISSIVE = { 32: 0x112244, 20: 0x1a3355, 10: 0x224466 };

// Pre-compiled base materials per size (avoids shader recompilation)
const baseMoonMats = {};
for (const size of [10, 20, 32]) {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.7, metalness: 0.15, flatShading: true });
  m.color.setHex(AST_COLORS[size] || 0x88aacc);
  m.emissive.setHex(AST_EMISSIVE[size] || 0x112244);
  m.emissiveIntensity = 1.2;
  baseMoonMats[size] = m;
}
function makeMoonMat(size) {
  return baseMoonMats[size].clone();
}

// Cache EdgesGeometry per asteroid geo to avoid recomputing
const edgeGeoCache = new Map();
function getEdgeGeo(geo) {
  if (edgeGeoCache.has(geo)) return edgeGeoCache.get(geo);
  const eg = new THREE.EdgesGeometry(geo, 20);
  edgeGeoCache.set(geo, eg);
  return eg;
}

function createAsteroidEdges(geo, color) {
  const edges = getEdgeGeo(geo); // shared, don't dispose
  const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({
    color, transparent: true, opacity: 0.5,
    blending: THREE.AdditiveBlending,
  }));
  return line;
}

function getOrCreateAsteroid(snap) {
  if (asteroidMeshes.has(snap.id)) return asteroidMeshes.get(snap.id);
  const closest = [10, 20, 32].reduce((a, b) =>
    Math.abs(b - snap.radius) < Math.abs(a - snap.radius) ? b : a);
  const geo = astGeos[closest] || astGeos[20];

  const mat = makeMoonMat(closest);
  mat.color.setHex(AST_COLORS[closest] || 0x88aacc);
  mat.emissive.setHex(AST_EMISSIVE[closest] || 0x112244);
  mat.emissiveIntensity = 1.2;

  const group = new THREE.Group();
  const mesh = new THREE.Mesh(geo, mat);
  group.add(mesh);

  // Contour lumineux arcade
  const edgeColor = closest === 32 ? 0x4466aa : closest === 20 ? 0x5588bb : 0x66aacc;
  const edges = createAsteroidEdges(geo, edgeColor);
  group.add(edges);

  const rotOff = { x: Math.random() * Math.PI * 2, y: Math.random() * Math.PI * 2 };
  group.userData.rotOffset = rotOff;
  group.userData.innerMesh = mesh;
  group.userData.edges = edges;
  scene.add(group);

  // Copies fantômes (1 seule pour perf, couvre 95% des cas de wrapping)
  const ghosts = [];
  for (let i = 0; i < 1; i++) {
    const gMat = mat.clone();
    gMat.transparent = true;
    const gGroup = new THREE.Group();
    const gMesh = new THREE.Mesh(geo, gMat);
    gGroup.add(gMesh);
    const gEdges = createAsteroidEdges(geo, edgeColor);
    gGroup.add(gEdges);
    gGroup.userData.rotOffset = rotOff;
    gGroup.userData.innerMesh = gMesh;
    gGroup.userData.edges = gEdges;
    gGroup.visible = false;
    scene.add(gGroup);
    ghosts.push(gGroup);
  }

  // Astéroïdes à loot : edges colorées + halo externe + glow fort
  if (snap.lootColor) {
    const lc = hexToInt(snap.lootColor);
    edges.material.color.setHex(lc);
    edges.material.opacity = 1.0;

    // Halo externe (edges agrandies pour un double contour lumineux)
    const outerEdges = createAsteroidEdges(geo, lc);
    outerEdges.scale.setScalar(1.15);
    outerEdges.material.opacity = 0.6;
    group.add(outerEdges);
    group.userData.outerEdges = outerEdges;

    // Glow light fort
    const lootLight = new THREE.PointLight(lc, 4, 120);
    group.add(lootLight);
    group.userData.lootLight = lootLight;
    group.userData.lootColor = lc;

    // Inner mesh teinte rareté
    mat.emissive.setHex(lc);
    mat.emissiveIntensity = 0.4;

    // Appliquer aussi aux ghosts
    for (const g of ghosts) {
      g.userData.edges.material.color.setHex(lc);
      g.userData.edges.material.opacity = 1.0;
      const gOuter = createAsteroidEdges(geo, lc);
      gOuter.scale.setScalar(1.15);
      gOuter.material.opacity = 0.6;
      g.add(gOuter);
      g.userData.outerEdges = gOuter;
      g.userData.innerMesh.material.emissive.setHex(lc);
      g.userData.innerMesh.material.emissiveIntensity = 0.4;
    }
  }

  const obj = { mesh: group, ghosts, dispX: snap.x, dispY: snap.y, hasLoot: !!snap.lootColor };
  asteroidMeshes.set(snap.id, obj);
  return obj;
}

function updateAsteroidMesh(snap) {
  const obj = getOrCreateAsteroid(snap);
  const { mesh, ghosts } = obj;

  // ── Smooth-follow avec correction de wrap ─────────────────────────────────
  // Remplace l'interpolation alpha : pas de saut au changement de snapshot
  let dx = snap.x - obj.dispX;
  let dy = snap.y - obj.dispY;
  if (dx >  HALF) dx -= WORLD;   // chemin court via le bord droit
  if (dx < -HALF) dx += WORLD;
  if (dy >  HALF) dy -= WORLD;
  if (dy < -HALF) dy += WORLD;
  obj.dispX += dx * SMOOTH_AST;
  obj.dispY += dy * SMOOTH_AST;
  // Wrap-clip : évite la dérive au-delà de la zone de fondu → transition invisible
  if (obj.dispX >  HALF + GHOST_FADE) obj.dispX -= WORLD;
  if (obj.dispX < -(HALF + GHOST_FADE)) obj.dispX += WORLD;
  if (obj.dispY >  HALF + GHOST_FADE) obj.dispY -= WORLD;
  if (obj.dispY < -(HALF + GHOST_FADE)) obj.dispY += WORLD;

  const x = obj.dispX, y = obj.dispY;
  const rz = snap.angle + mesh.userData.rotOffset.x;
  const rx = mesh.userData.rotOffset.y * 0.3;
  const innerMat = mesh.userData.innerMesh.material;

  mesh.position.set(x, y, 0);
  mesh.rotation.z = rz;
  mesh.rotation.x = rx;

  // Pulse arcade sur les contours
  const arcT = Date.now() * 0.003;
  const edgePulse = 0.35 + Math.sin(arcT + x * 0.01) * 0.15;
  mesh.userData.edges.material.opacity = edgePulse;

  // Astéroïde à loot : edges + halo pulsent + glow + scale breathing
  if (obj.hasLoot && mesh.userData.lootColor) {
    const t = Date.now();
    const lootPulse = 0.6 + Math.sin(t * 0.005) * 0.4;
    const outerPulse = 0.3 + Math.sin(t * 0.004 + 1) * 0.3;
    const scaleBreathe = 1.12 + Math.sin(t * 0.003) * 0.06;
    mesh.userData.edges.material.opacity = lootPulse;
    if (mesh.userData.outerEdges) {
      mesh.userData.outerEdges.material.opacity = outerPulse;
      mesh.userData.outerEdges.scale.setScalar(scaleBreathe);
    }
    if (mesh.userData.lootLight) mesh.userData.lootLight.intensity = 3 + Math.sin(t * 0.004) * 2;
    innerMat.emissiveIntensity = 0.3 + Math.sin(t * 0.005) * 0.2;
    for (const g of ghosts) if (g.visible) {
      g.userData.edges.material.opacity = lootPulse;
      if (g.userData.outerEdges) {
        g.userData.outerEdges.material.opacity = outerPulse;
        g.userData.outerEdges.scale.setScalar(scaleBreathe);
      }
    }
  }

  // ── Opacité main : fondu en sortant de l'arène ────────────────────────────
  const exitDist = Math.max(0, Math.max(Math.abs(x), Math.abs(y)) - HALF);
  const mainOp   = Math.max(0, 1 - exitDist / GHOST_FADE);
  innerMat.transparent = mainOp < 0.999;
  innerMat.opacity     = mainOp;

  // ── Copies fantômes ───────────────────────────────────────────────────────
  const ghostDefs = [];
  if (x >  HALF - GHOST_MARGIN) ghostDefs.push([-WORLD, 0]);
  if (x < -HALF + GHOST_MARGIN) ghostDefs.push([ WORLD, 0]);
  if (y >  HALF - GHOST_MARGIN) ghostDefs.push([0, -WORLD]);
  if (y < -HALF + GHOST_MARGIN) ghostDefs.push([0,  WORLD]);
  if (ghostDefs.length >= 2 &&
      Math.abs(ghostDefs[0][0]) > 0 && Math.abs(ghostDefs[1][1]) > 0) {
    ghostDefs.push([ghostDefs[0][0], ghostDefs[1][1]]);
  }

  for (let i = 0; i < ghosts.length; i++) {
    const g = ghosts[i];
    if (i < ghostDefs.length) {
      const [gox, goy] = ghostDefs[i];
      const gx = x + gox, gy = y + goy;
      g.position.set(gx, gy, 0);
      g.rotation.z = rz;
      g.rotation.x = rx;
      g.visible = true;
      const insideDist = Math.min(HALF - Math.abs(gx), HALF - Math.abs(gy));
      const ghostOp = Math.max(0, Math.min(1, insideDist / GHOST_FADE));
      g.userData.innerMesh.material.opacity = ghostOp;
      g.userData.edges.material.opacity = edgePulse * ghostOp;
    } else {
      g.visible = false;
    }
  }

  // ── Teinte déflexion (main + ghosts actifs) ───────────────────────────────
  if (snap.deflectedBy) {
    const d = currSnapshot?.players.find(p => p.id === snap.deflectedBy);
    if (d) {
      const c = hexToInt(d.color);
      innerMat.emissive.setHex(c);
      innerMat.emissiveIntensity = 0.6;
      mesh.userData.edges.material.color.setHex(c);
      for (const g of ghosts) if (g.visible) { g.userData.innerMesh.material.emissive.setHex(c); g.userData.innerMesh.material.emissiveIntensity = 0.6; g.userData.edges.material.color.setHex(c); }
    }
  } else {
    const closest = [10, 20, 32].reduce((a, b) => Math.abs(b - snap.radius) < Math.abs(a - snap.radius) ? b : a);
    innerMat.emissive.setHex(AST_EMISSIVE[closest] || 0x112244);
    innerMat.emissiveIntensity = 1.2;
    if (obj.hasLoot && mesh.userData.lootColor) {
      // Loot asteroid: keep rarity colors (edges + emissive tint)
      innerMat.emissive.setHex(mesh.userData.lootColor);
      mesh.userData.edges.material.color.setHex(mesh.userData.lootColor);
      for (const g of ghosts) if (g.visible) { g.userData.innerMesh.material.emissive.setHex(mesh.userData.lootColor); g.userData.edges.material.color.setHex(mesh.userData.lootColor); }
    } else {
      const edgeColor = closest === 32 ? 0x4466aa : closest === 20 ? 0x5588bb : 0x66aacc;
      mesh.userData.edges.material.color.setHex(edgeColor);
      for (const g of ghosts) if (g.visible) { g.userData.innerMesh.material.emissive.setHex(AST_EMISSIVE[closest] || 0x112244); g.userData.innerMesh.material.emissiveIntensity = 1.2; g.userData.edges.material.color.setHex(edgeColor); }
    }
  }
}

// Track shared geometries that must not be disposed
const _sharedGeos = new Set([...Object.values(astGeos), SHIP_GEO]);
function isSharedGeo(geo) {
  if (_sharedGeos.has(geo)) return true;
  for (const eg of edgeGeoCache.values()) if (eg === geo) return true;
  return false;
}

function disposeGroup(group) {
  group.traverse(child => {
    // Sprites partagent une géométrie globale — ne jamais la disposer
    if (child.isSprite) { if (child.material) child.material.dispose(); return; }
    if (child.geometry && !isSharedGeo(child.geometry)) child.geometry.dispose();
    if (child.material) {
      if (child.material.map) child.material.map.dispose();
      child.material.dispose();
    }
  });
}

function removeAsteroid(id) {
  const obj = asteroidMeshes.get(id);
  if (!obj) return;
  scene.remove(obj.mesh);
  disposeGroup(obj.mesh);
  for (const g of obj.ghosts) { scene.remove(g); disposeGroup(g); }
  asteroidMeshes.delete(id);
}

// ─── Pickups ─────────────────────────────────────────────────────────────────

const PICKUP_COLORS = {
  crystal: 0x00ffff, shield: 0x00ff88, boost: 0xff8800, rapid: 0xff00ff,
  laser: 0x4488ff, missile: 0xff2266, trishot: 0x4488ff,
  drone: 0xbb44ff, nuke: 0xffaa00, magnet: 0xffaa00, intangible: 0xffaa00,
  minigun: 0xff4444, gravwell: 0x8844ff, extralife: 0xff44ff,
};
const PICKUP_LABELS = {
  crystal: '💎+30', shield: '🛡 HP+1', boost: '⚡ BOOST', rapid: '🔥 RAPID',
  laser: '⚡ LASER', missile: '🚀 MISSILE', trishot: '🔱 TRISHOT',
  drone: '🤖 DRONE', nuke: '💥 NUKE!', magnet: '🧲 MAGNET', intangible: '👻 GHOST',
  minigun: '🔫 MINIGUN', gravwell: '🌀 GRAVITY', extralife: '❤️ +1 VIE',
};

function getOrCreatePickup(snap) {
  if (pickupMeshes.has(snap.id)) return pickupMeshes.get(snap.id);

  const color = PICKUP_COLORS[snap.type] || 0xffffff;
  const group = new THREE.Group();

  // MeshBasicMaterial = pas besoin de lumière, pas d'artefact noir
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.92, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(new THREE.OctahedronGeometry(10, 0), mat);
  group.add(mesh);

  // Glow sprite au lieu de PointLight (pas d'artefact cube noir)
  const glowMat = new THREE.SpriteMaterial({
    color, transparent: true, opacity: 0.35,
    blending: THREE.AdditiveBlending,
  });
  const glow = new THREE.Sprite(glowMat);
  glow.scale.setScalar(40);
  group.add(glow);

  // Anneau décoratif
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(14, 1.5, 6, 24),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5 })
  );
  group.add(ring);

  scene.add(group);
  const obj = { group, mesh, ring, glow };
  pickupMeshes.set(snap.id, obj);
  return obj;
}

function updatePickupMesh(snap) {
  const obj = getOrCreatePickup(snap);
  const t = Date.now() * 0.001;
  obj.group.position.set(snap.x, snap.y, 0);
  obj.mesh.rotation.y = t * 1.8;
  obj.mesh.rotation.z = t * 0.7;
  obj.ring.rotation.x = t * 1.2;
  obj.ring.rotation.z = t * 0.5;
  const scale = 1 + Math.sin(t * 2.5) * 0.12;
  obj.group.scale.setScalar(scale);
  // Glow pulse
  if (obj.glow) {
    const glowScale = 38 + Math.sin(t * 3) * 8;
    obj.glow.scale.setScalar(glowScale);
    obj.glow.material.opacity = 0.25 + Math.sin(t * 2.5) * 0.12;
  }
}

function removePickup(id) {
  const obj = pickupMeshes.get(id);
  if (!obj) return;
  scene.remove(obj.group);
  disposeGroup(obj.group);
  pickupMeshes.delete(id);
}

// ─── Ennemis IA ──────────────────────────────────────────────────────────────

let gameDuration = 300;
let gameDifficulty = 'normal';
const enemyMeshes = new Map();

function getOrCreateEnemy(snap) {
  if (enemyMeshes.has(snap.id)) return enemyMeshes.get(snap.id);

  const group = new THREE.Group();

  // Réutiliser la géométrie du vaisseau avec une couleur rouge
  const mat = new THREE.MeshPhongMaterial({ color: 0xff3333, emissive: 0xff1111, emissiveIntensity: 0.4, flatShading: true, side: THREE.DoubleSide });
  const body = new THREE.Mesh(SHIP_GEO, mat);
  body.scale.setScalar(0.9);
  group.add(body);

  // Glow rouge
  const glowMat = new THREE.SpriteMaterial({ color: 0xff0000, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending });
  const glow = new THREE.Sprite(glowMat);
  glow.scale.setScalar(40);
  group.add(glow);

  // Edges
  const edgeMat = new THREE.LineBasicMaterial({ color: 0xff4444, transparent: true, opacity: 0.6 });
  const edgeLine = new THREE.LineSegments(new THREE.EdgesGeometry(SHIP_GEO, 30), edgeMat);
  edgeLine.scale.setScalar(0.9);
  group.add(edgeLine);

  scene.add(group);
  const obj = { group, body, glow };
  enemyMeshes.set(snap.id, obj);
  return obj;
}

function updateEnemyMesh(snap, alpha) {
  const obj = getOrCreateEnemy(snap);
  if (!snap.alive) {
    obj.group.visible = false;
    return;
  }
  obj.group.visible = true;
  // Interpolation entre prev et curr
  let x = snap.x, y = snap.y, angle = snap.angle;
  if (prevSnapshot && alpha < 1) {
    const prev = (prevSnapshot.enemies || []).find(e => e.id === snap.id);
    if (prev && prev.alive) {
      x = lerpWrap(prev.x, snap.x, alpha);
      y = lerpWrap(prev.y, snap.y, alpha);
      angle = lerpAngle(prev.angle, snap.angle, alpha);
    }
  }
  obj.group.position.set(x, y, 0);
  obj.group.rotation.z = angle - Math.PI / 2;
  // Pulse glow
  const t = Date.now() * 0.001;
  obj.glow.material.opacity = 0.2 + Math.sin(t * 3) * 0.1;
}

function removeEnemy(id) {
  const obj = enemyMeshes.get(id);
  if (!obj) return;
  scene.remove(obj.group);
  disposeGroup(obj.group);
  enemyMeshes.delete(id);
}

// ─── Boss ────────────────────────────────────────────────────────────────────

let bossMesh = null;

function getOrCreateBoss() {
  if (bossMesh) return bossMesh;

  const group = new THREE.Group();

  // Grand vaisseau boss (3x la taille)
  const mat = new THREE.MeshPhongMaterial({ color: 0xcc0000, emissive: 0xff0000, emissiveIntensity: 0.5, flatShading: true, side: THREE.DoubleSide });
  const body = new THREE.Mesh(SHIP_GEO, mat);
  body.scale.setScalar(3.5);
  group.add(body);

  // Edges épaisses
  const edgeMat = new THREE.LineBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.8, linewidth: 2 });
  const edgeLine = new THREE.LineSegments(new THREE.EdgesGeometry(SHIP_GEO, 30), edgeMat);
  edgeLine.scale.setScalar(3.5);
  group.add(edgeLine);

  // Glow intense
  const glowMat = new THREE.SpriteMaterial({ color: 0xff0000, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending });
  const glow = new THREE.Sprite(glowMat);
  glow.scale.setScalar(120);
  group.add(glow);

  // 2ème couche de glow pulsante
  const glow2Mat = new THREE.SpriteMaterial({ color: 0xff4400, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending });
  const glow2 = new THREE.Sprite(glow2Mat);
  glow2.scale.setScalar(180);
  group.add(glow2);

  scene.add(group);
  bossMesh = { group, body, glow, glow2 };
  return bossMesh;
}

function updateBossMesh(bossSnap, alpha) {
  if (!bossSnap || !bossSnap.alive) {
    if (bossMesh) bossMesh.group.visible = false;
    document.getElementById('boss-hud').style.display = 'none';
    return;
  }

  const obj = getOrCreateBoss();
  obj.group.visible = true;
  // Interpolation boss
  let x = bossSnap.x, y = bossSnap.y, angle = bossSnap.angle;
  if (prevSnapshot && prevSnapshot.boss && prevSnapshot.boss.alive && alpha < 1) {
    x = lerpWrap(prevSnapshot.boss.x, bossSnap.x, alpha);
    y = lerpWrap(prevSnapshot.boss.y, bossSnap.y, alpha);
    angle = lerpAngle(prevSnapshot.boss.angle, bossSnap.angle, alpha);
  }
  obj.group.position.set(x, y, 0);
  obj.group.rotation.z = angle - Math.PI / 2;

  const t = Date.now() * 0.001;
  obj.glow.material.opacity = 0.3 + Math.sin(t * 2) * 0.15;
  obj.glow2.material.opacity = 0.15 + Math.sin(t * 1.5 + 1) * 0.1;
  obj.glow2.scale.setScalar(160 + Math.sin(t * 2) * 30);

  // Phase colors
  const phaseColors = [0xff0000, 0xff6600, 0xffff00]; // chase, spiral, charge
  obj.body.material.emissive.setHex(phaseColors[bossSnap.phase] || 0xff0000);

  // HUD barre de vie
  const bossHud = document.getElementById('boss-hud');
  bossHud.style.display = 'block';
  const fill = document.getElementById('boss-hp-fill');
  fill.style.width = Math.max(0, (bossSnap.hp / bossSnap.maxHp) * 100) + '%';
}

// ─── Particules / Explosions ──────────────────────────────────────────────────

const particlePool = [];
for (let i = 0; i < 20; i++) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(40 * 3);
  const vel = new Float32Array(40 * 3);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ size: 3, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  const pts = new THREE.Points(geo, mat);
  pts.visible = false;
  pts.userData = { vel, active: false, life: 0, maxLife: 0 };
  scene.add(pts);
  particlePool.push(pts);
}
let poolIdx = 0;

function spawnExplosion(x, y, radius, colorHex) {
  const pts = particlePool[poolIdx++ % particlePool.length];
  const pos = pts.geometry.attributes.position.array;
  const vel = pts.userData.vel;
  for (let i = 0; i < 40; i++) {
    const a = Math.random() * Math.PI * 2;
    const spd = (Math.random() * 0.5 + 0.5) * radius * 2.5;
    pos[i*3] = x; pos[i*3+1] = y; pos[i*3+2] = 1;
    vel[i*3] = Math.cos(a) * spd; vel[i*3+1] = Math.sin(a) * spd; vel[i*3+2] = (Math.random()-0.5)*20;
  }
  pts.geometry.attributes.position.needsUpdate = true;
  pts.material.color.setHex(colorHex || 0xffffff);
  pts.material.opacity = 1;
  pts.material.size = Math.max(3, radius / 5);
  pts.visible = true;
  pts.userData.active = true; pts.userData.life = 0; pts.userData.maxLife = 0.7;
}

function updateParticles(dt) {
  for (const pts of particlePool) {
    if (!pts.userData.active) continue;
    pts.userData.life += dt;
    const t = pts.userData.life / pts.userData.maxLife;
    if (t >= 1) { pts.userData.active = false; pts.material.opacity = 0; pts.visible = false; continue; }
    pts.material.opacity = 1 - t;
    const pos = pts.geometry.attributes.position.array;
    const vel = pts.userData.vel;
    for (let i = 0; i < 40; i++) {
      pos[i*3]   += vel[i*3]   * dt;
      pos[i*3+1] += vel[i*3+1] * dt;
      pos[i*3+2] += vel[i*3+2] * dt;
      vel[i*3]   *= 0.92; vel[i*3+1] *= 0.92;
    }
    pts.geometry.attributes.position.needsUpdate = true;
  }
}

// ─── Projectiles (rendu depuis snapshot serveur) ──────────────────────────────

// Laser pool (hitscan côté serveur, rendu instantané côté client)
const laserPool = [];
for (let i = 0; i < 8; i++) {
  const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
  const mat = new THREE.LineBasicMaterial({ color: 0x4488ff, transparent: true, opacity: 0 });
  const line = new THREE.Line(geo, mat);
  line.userData = { active: false, life: 0 };
  scene.add(line);
  laserPool.push(line);
}
let laserIdx = 0;

function spawnLaser(x, y, tx, ty, color) {
  const line = laserPool[laserIdx++ % laserPool.length];
  const pos = line.geometry.attributes.position.array;
  pos[0]=x; pos[1]=y; pos[2]=2; pos[3]=tx; pos[4]=ty; pos[5]=2;
  line.geometry.attributes.position.needsUpdate = true;
  line.material.color.setHex(hexToInt(color) || 0x4488ff);
  line.material.opacity = 1;
  line.userData.active = true; line.userData.life = 0;
}

// Projectile meshes (créés dynamiquement depuis le snapshot serveur)
const projectileMeshes = new Map();
const TRAIL_LEN = 8;

function getOrCreateProjectileMesh(snap) {
  let obj = projectileMeshes.get(snap.id);
  if (obj) return obj;

  const isMissile = snap.type === 'missile';
  const r = isMissile ? 5 : 2.8;
  const col = isMissile ? 0xff2266 : (hexToInt(snap.color) || 0xffffff);

  const group = new THREE.Group();
  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(r, isMissile ? 8 : 6, 4),
    new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 1 })
  );
  group.add(sphere);

  // Trail
  const trailLen = isMissile ? 12 : TRAIL_LEN;
  const trailPoints = [];
  for (let i = 0; i < trailLen; i++) trailPoints.push(new THREE.Vector3(snap.x, snap.y, 2));
  const trailGeo = new THREE.BufferGeometry().setFromPoints(trailPoints);
  const trailColors = new Float32Array(trailLen * 3);
  const c = new THREE.Color(col);
  for (let i = 0; i < trailLen; i++) {
    const a = 1 - i / trailLen;
    trailColors[i*3]   = c.r * a;
    trailColors[i*3+1] = c.g * a;
    trailColors[i*3+2] = c.b * a;
  }
  trailGeo.setAttribute('color', new THREE.BufferAttribute(trailColors, 3));
  const trailMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.7 });
  const trailLine = new THREE.Line(trailGeo, trailMat);
  scene.add(trailLine); // Trail dans la scène (coordonnées monde), pas dans le group

  group.position.set(snap.x, snap.y, 2);
  scene.add(group);

  obj = { group, sphere, trailLine, trailGeo, trailLen, dispX: snap.x, dispY: snap.y, type: snap.type };
  projectileMeshes.set(snap.id, obj);
  return obj;
}

function updateProjectileMesh(snap, dt) {
  const obj = getOrCreateProjectileMesh(snap);
  // Extrapoler depuis la position du snapshot + vélocité pour smooth 60fps
  const elapsed = (performance.now() - lastSnapshotTime) / 1000;
  const px = snap.x + snap.vx * elapsed;
  const py = snap.y + snap.vy * elapsed;

  // Smooth follow
  obj.dispX += (px - obj.dispX) * 0.6;
  obj.dispY += (py - obj.dispY) * 0.6;
  obj.group.position.set(obj.dispX, obj.dispY, 2);

  // Update trail
  const pos = obj.trailGeo.attributes.position.array;
  // Décaler les anciens points
  for (let i = obj.trailLen - 1; i > 0; i--) {
    pos[i*3]   = pos[(i-1)*3];
    pos[i*3+1] = pos[(i-1)*3+1];
    pos[i*3+2] = 2;
  }
  pos[0] = obj.dispX; pos[1] = obj.dispY; pos[2] = 2;
  obj.trailGeo.attributes.position.needsUpdate = true;

  // Missile pulse
  if (obj.type === 'missile') {
    const s = 1 + Math.sin(performance.now() * 0.01) * 0.15;
    obj.sphere.scale.setScalar(s);
  }
}

function removeProjectile(id) {
  const obj = projectileMeshes.get(id);
  if (!obj) return;
  scene.remove(obj.group);
  scene.remove(obj.trailLine);
  obj.trailGeo.dispose();
  obj.trailLine.material.dispose();
  obj.sphere.geometry.dispose();
  obj.sphere.material.dispose();
  projectileMeshes.delete(id);
}

// Screen shake
let shakeIntensity = 0;
function triggerShake(power) { shakeIntensity = Math.max(shakeIntensity, power); }

function updateLasers(dt) {
  for (const line of laserPool) {
    if (!line.userData.active) continue;
    line.userData.life += dt;
    line.material.opacity = Math.max(0, 1 - line.userData.life / 0.30);
    if (line.userData.life > 0.30) line.userData.active = false;
  }
}

// ─── Input ────────────────────────────────────────────────────────────────────

const keys = { thrust: false, left: false, right: false, shoot: false };
let clickShootFrame = false;

function getKeyMap() {
  // e.code = position physique, indépendant du layout.
  // WASD et AZERTY (ZQSD) utilisent les mêmes codes physiques → ça marche des deux côtés.
  // La seule différence : ce qu'on affiche dans l'UI.
  return {
    up:    ['ArrowUp',    'KeyW'],
    left:  ['ArrowLeft',  'KeyA'],
    right: ['ArrowRight', 'KeyD'],
    shoot: ['Space'],
  };
}

window.addEventListener('keydown', e => {
  const map = getKeyMap();
  if (map.up.includes(e.code))    keys.thrust = true;
  if (map.left.includes(e.code))  keys.left   = true;
  if (map.right.includes(e.code)) keys.right  = true;
  if (map.shoot.includes(e.code)) { keys.shoot = true; e.preventDefault(); }
  if (e.code === 'Escape') toggleSettings();
});

window.addEventListener('keyup', e => {
  const map = getKeyMap();
  if (map.up.includes(e.code))    keys.thrust = false;
  if (map.left.includes(e.code))  keys.left   = false;
  if (map.right.includes(e.code)) keys.right  = false;
  if (map.shoot.includes(e.code)) keys.shoot  = false;
});

// Clic souris = tir (gauche maintenu) / dash (droit)
let mouseDown = false;
canvas.addEventListener('mousedown', e => {
  if (e.button === 0) { clickShootFrame = true; mouseDown = true; }
  if (e.button === 2) dashFrame = true;
});
canvas.addEventListener('mouseup', e => {
  if (e.button === 0) mouseDown = false;
});
canvas.addEventListener('mouseleave', () => { mouseDown = false; });
canvas.addEventListener('contextmenu', e => e.preventDefault());
let dashFrame = false;

// ─── Prédiction locale + Server Reconciliation ───────────────────────────────

const DRAG = 0.97, THRUST_FORCE = 320, TURN_SPEED = 2.8, MAX_SPEED = 200;
const DT = SERVER_TICK / 1000;

let localPred = null;
const inputBuffer = []; // { seq, keys: {thrust,left,right}, dt }

function applyInput(p, k, dt) {
  if (k.left)  p.angle += TURN_SPEED * dt;
  if (k.right) p.angle -= TURN_SPEED * dt;
  if (k.thrust) {
    p.vx += Math.cos(p.angle) * THRUST_FORCE * dt;
    p.vy += Math.sin(p.angle) * THRUST_FORCE * dt;
  }
  p.vx *= Math.pow(DRAG, dt / DT);
  p.vy *= Math.pow(DRAG, dt / DT);
  const spd = Math.sqrt(p.vx*p.vx + p.vy*p.vy);
  if (spd > MAX_SPEED) { p.vx = p.vx/spd*MAX_SPEED; p.vy = p.vy/spd*MAX_SPEED; }
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  if (p.x > 400) { p.x = 400; p.vx = 0; }
  if (p.x < -400) { p.x = -400; p.vx = 0; }
  if (p.y > 400) { p.y = 400; p.vy = 0; }
  if (p.y < -400) { p.y = -400; p.vy = 0; }
}

function stepLocalPred(dt) {
  if (!localPred) return;
  applyInput(localPred, keys, dt);
}

// Server reconciliation : rejouer les inputs non confirmés
function reconcile(serverState, lastInputSeq) {
  // Supprimer les inputs déjà traités par le serveur
  while (inputBuffer.length > 0 && inputBuffer[0].seq <= lastInputSeq) {
    inputBuffer.shift();
  }
  // Partir de l'état serveur autoritaire
  localPred = {
    x: serverState.x, y: serverState.y, angle: serverState.angle,
    vx: serverState.vx, vy: serverState.vy,
  };
  // Rejouer tous les inputs non encore confirmés
  for (const input of inputBuffer) {
    applyInput(localPred, input.keys, input.dt);
  }
}

// ─── HUD ──────────────────────────────────────────────────────────────────────

const hudEl          = document.getElementById('hud');
const timerEl        = document.getElementById('hud-timer');
const scoresEl       = document.getElementById('hud-scores');
const popupsEl       = document.getElementById('score-popups');
const weaponEl       = document.getElementById('weapon-indicator');
let prevScores  = {};

function updateHUD(snap) {
  if (!snap) return;
  const dur = snap.duration || gameDuration || 300;
  if (snap.boss && snap.boss.alive) {
    timerEl.textContent = '⚠ BOSS';
    timerEl.style.color = '#ff3333';
  } else {
    const remaining = Math.max(0, dur - (snap.elapsed || 0));
    const m = Math.floor(remaining / 60);
    const s = Math.floor(remaining % 60);
    timerEl.textContent = `${m}:${s.toString().padStart(2, '0')}`;
    timerEl.style.color = remaining <= 30 ? '#ff3333' : '';
  }

  scoresEl.innerHTML = '';
  for (const p of snap.players) {
    const card = document.createElement('div');
    card.className = 'score-card';
    card.style.setProperty('--card-color', p.color);

    const dots = [1,2,3,4].map(i =>
      `<div class="hp-dot${i > p.hp ? ' dead' : ''}"></div>`
    ).join('');

    const livesStr = p.alive ? '❤️'.repeat(p.lives) : '💀';

    const fx = [];
    if (p.boosted) fx.push('<span class="fx-badge boost">⚡</span>');
    if (p.rapid)   fx.push('<span class="fx-badge rapid">🔥</span>');
    if (p.laser)   fx.push('<span class="fx-badge laser">LASER</span>');
    if (p.missile) fx.push(`<span class="fx-badge missile">🚀×${p.missile}</span>`);

    card.innerHTML = `
      <div class="name">${p.name}</div>
      <div class="hp-row"><span class="lives-display">${livesStr}</span><div class="hp-dots">${dots}</div></div>
      ${fx.join('')}
      <div class="crystals">💎 ${p.score}</div>
    `;
    scoresEl.appendChild(card);

    prevScores[p.id] = p.score;

    // Indicateur arme du joueur local
    if (p.id === myId && weaponEl) {
      if (p.laser) {
        weaponEl.textContent = `⚡ LASER ×${p.laser}`;
        weaponEl.style.color = '#4488ff';
        weaponEl.style.display = 'block';
      } else if (p.missile) {
        weaponEl.textContent = `🚀 MISSILE ×${p.missile}`;
        weaponEl.style.color = '#ff2266';
        weaponEl.style.display = 'block';
      } else {
        weaponEl.style.display = 'none';
      }
    }
  }
}

const CAM_H = HALF + 70; // demi-étendue caméra orthographique (doit correspondre à scene setup)

function worldToScreen(wx, wy) {
  return {
    x: ((wx / CAM_H) + 1) * 0.5 * window.innerWidth,
    y: ((1 - wy / CAM_H) * 0.5) * window.innerHeight,
  };
}

function spawnScorePopup(text, color, wx, wy) {
  const el = document.createElement('div');
  el.className = 'popup';
  el.style.color = color;
  el.style.textShadow = `0 0 8px ${color}`;
  el.textContent = text;
  if (wx !== undefined && wy !== undefined) {
    const s = worldToScreen(wx, wy);
    el.style.left = s.x + 'px';
    el.style.top  = s.y + 'px';
  } else {
    el.style.left = (45 + Math.random() * 10) + '%';
    el.style.top  = '50%';
  }
  popupsEl.appendChild(el);
  setTimeout(() => el.remove(), 1200);
}

function showAnnouncement(text, color) {
  const el = document.createElement('div');
  el.className = 'announcement';
  el.textContent = text;
  el.style.color = color;
  el.style.textShadow = `0 0 20px ${color}, 0 0 40px ${color}`;
  popupsEl.appendChild(el);
  setTimeout(() => el.remove(), 2000);
}

// ─── Inventaire & switch d'arme ───────────────────────────────────────────────

let selectedWeapon = 'bullet';
const inventoryBar = document.getElementById('inventory-bar');
const activeBuffs  = document.getElementById('active-buffs');

function updateInventory(snap) {
  if (!snap) return;
  const me = snap.players.find(p => p.id === myId);
  if (!me) return;

  // Build slots dynamiquement — toutes les armes montrent leur ammo
  const weapons = [{ id: 'bullet', icon: '•', label: 'BULLET', available: true }];
  if (me.trishot) weapons.push({ id: 'trishot', icon: '🔱', label: 'TRISHOT', available: true, ammo: me.trishot, color: '#4488ff' });
  if (me.minigun) weapons.push({ id: 'minigun', icon: '🔫', label: 'MINIGUN', available: true, ammo: me.minigun, color: '#ff4444' });
  if (me.laser) weapons.push({ id: 'laser', icon: '⚡', label: 'LASER', available: true, ammo: me.laser });
  if (me.missile) weapons.push({ id: 'missile', icon: '🚀', label: 'MISSILE', available: true, ammo: me.missile });

  // Si l'arme sélectionnée n'est plus disponible, fallback
  if (!weapons.find(w => w.id === selectedWeapon)) selectedWeapon = 'bullet';

  inventoryBar.innerHTML = weapons.map(w => {
    const active = w.id === selectedWeapon ? ' active' : '';
    const color = w.color || (w.id === 'laser' ? '#4488ff' : w.id === 'missile' ? '#ff2266' : '#00ffff');
    let extra = '';
    if (w.ammo !== undefined) extra = `<div class="inv-ammo" style="color:${color}">×${w.ammo}</div>`;
    return `<div class="inv-slot${active}" data-weapon="${w.id}" style="border-color:${active ? color : ''}">
      <div class="inv-icon" style="color:${color}">${w.icon}</div>
      <div class="inv-label">${w.label}</div>
      ${extra}
    </div>`;
  }).join('');

  // Click sur slot
  for (const slot of inventoryBar.children) {
    slot.addEventListener('click', () => {
      selectedWeapon = slot.dataset.weapon;
    });
  }

  // Buffs actifs avec timer bar visuel
  let buffsHtml = '';
  const buffDefs = [
    { key: 'boosted', ticks: 'boostTicks', max: 120, icon: '⚡', label: 'BOOST', cls: 'boost' },
    { key: 'rapid', ticks: 'rapidTicks', max: 100, icon: '🔥', label: 'RAPID', cls: 'rapid' },
    { key: 'drone', ticks: 'drone', max: 300, icon: '🤖', label: 'DRONE', cls: 'drone', color: '#bb44ff' },
    { key: 'magnet', ticks: 'magnet', max: 300, icon: '🧲', label: 'MAGNET', cls: 'magnet', color: '#ffaa00' },
    { key: 'intangible', ticks: 'intangible', max: 80, icon: '👻', label: 'GHOST', cls: 'intangible', color: '#ffaa00' },
    { key: 'gravwell', ticks: 'gravwell', max: 120, icon: '🌀', label: 'GRAVITY', cls: 'gravwell', color: '#8844ff' },
  ];
  for (const b of buffDefs) {
    const val = me[b.ticks] || 0;
    if (val <= 0 && !(b.key === 'boosted' ? me.boosted : false) && !(b.key === 'rapid' ? me.rapid : false)) continue;
    if (val <= 0) continue;
    const pct = (val / b.max) * 100;
    const secs = (val / 20).toFixed(1);
    const style = b.color ? `style="border-color:${b.color}"` : '';
    buffsHtml += `<div class="buff-pill ${b.cls}" ${style}>${b.icon} ${secs}s<div class="buff-timer-bar" style="width:${pct}%${b.color ? ';background:' + b.color : ''}"></div></div>`;
  }
  activeBuffs.innerHTML = buffsHtml;
}

// Scroll pour changer d'arme
canvas.addEventListener('wheel', e => {
  e.preventDefault();
  const me = currSnapshot?.players.find(p => p.id === myId);
  if (!me) return;
  const weapons = ['bullet'];
  if (me.trishot) weapons.push('trishot');
  if (me.minigun) weapons.push('minigun');
  if (me.laser) weapons.push('laser');
  if (me.missile) weapons.push('missile');
  const idx = weapons.indexOf(selectedWeapon);
  if (e.deltaY > 0) {
    selectedWeapon = weapons[(idx + 1) % weapons.length];
  } else {
    selectedWeapon = weapons[(idx - 1 + weapons.length) % weapons.length];
  }
}, { passive: false });

// ─── Pickup flash (animation bords d'écran) ───────────────────────────────────

const PICKUP_CSS_COLORS = { crystal: '#00ffff', shield: '#00ff88', boost: '#ff8800', rapid: '#ff00ff', laser: '#4488ff', missile: '#ff2266', trishot: '#4488ff', drone: '#bb44ff', nuke: '#ffaa00', magnet: '#ffaa00', intangible: '#ffaa00', minigun: '#ff4444', gravwell: '#8844ff' };

function triggerPickupFlash(pickupType) {
  const el = document.getElementById('pickup-flash');
  if (!el) return;
  const color = PICKUP_CSS_COLORS[pickupType] || '#ffffff';
  el.style.setProperty('--flash-color', color);
  el.classList.remove('flash');
  void el.offsetWidth; // reflow pour relancer l'animation
  el.classList.add('flash');
  el.addEventListener('animationend', () => el.classList.remove('flash'), { once: true });

  // Aussi animer le scan horizontal
  const scan = document.getElementById('pickup-scan');
  if (scan) {
    scan.style.setProperty('--flash-color', color);
    scan.classList.remove('scanning');
    void scan.offsetWidth;
    scan.classList.add('scanning');
    scan.addEventListener('animationend', () => scan.classList.remove('scanning'), { once: true });
  }
}

// ─── Gestion events serveur ───────────────────────────────────────────────────

const EVENT_TYPES = new Set(['bolt','shot_fired','asteroid_destroyed','deflect','player_hit','player_killed','pickup_collected','missile_hit','border_zap','loot_dropped','nuke_activated','drone_shot','asteroid_storm','pickup_despawn','gravwell_placed','enemy_killed','boss_killed','boss_special']);

function handleEvent(msg) {
  // Laser (hitscan) — dessiner le rayon instantané
  if (msg.type === 'bolt' && msg.weaponType === 'laser') {
    const player = currSnapshot?.players.find(p => p.id === msg.playerId);
    spawnLaser(msg.x, msg.y, msg.tx, msg.ty, player?.color || myColor);
    if (msg.playerId === myId) playSound('shoot');
  }

  // Son de tir pour bullet/missile (le visuel vient du snapshot)
  if (msg.type === 'shot_fired') {
    if (msg.playerId === myId) playSound('shoot');
  }

  // Destruction d'astéroïde — immédiate (le projectile voyage réellement côté serveur)
  if (msg.type === 'asteroid_destroyed') {
    const color = currSnapshot?.players.find(p => p.id === msg.byId)?.color;
    const colorHex = color ? hexToInt(color) : 0xffffff;
    spawnExplosion(msg.x, msg.y, msg.radius, colorHex);
    removeAsteroid(msg.id);
    playSound('explode');
    triggerShake(2 + msg.radius * 0.08);
    if (msg.byId === myId) spawnScorePopup(`+${msg.crystals}`, myColor, msg.x, msg.y);
  }

  if (msg.type === 'deflect') {
    spawnExplosion(msg.x, msg.y, 8, 0x4488ff);
    triggerShake(1);
  }

  if (msg.type === 'missile_hit') {
    spawnExplosion(msg.x, msg.y, 90, 0xff2266);
    spawnExplosion(msg.x, msg.y, 45, 0xffaa00);
    playSound('explode');
    triggerShake(6);
  }

  if (msg.type === 'player_hit') {
    spawnExplosion(msg.x, msg.y, 18, 0xff4400);
    playSound('hit');
    triggerShake(4);
    if (msg.byId === myId) {
      const comboTxt = msg.combo > 1 ? ` x${msg.combo}` : '';
      spawnScorePopup(`+${msg.pts || 25}${comboTxt}`, myColor, msg.x, msg.y);
      if (msg.combo >= 3) showAnnouncement(`COMBO x${msg.combo}!`, '#ff8800');
    }
  }

  if (msg.type === 'player_killed') {
    spawnExplosion(msg.x, msg.y, 32, 0xff4400);
    spawnExplosion(msg.x, msg.y, 16, 0xffaa00);
    playSound('explode');
    triggerShake(5);
    const obj = playerMeshes.get(msg.victimId);
    if (obj) {
      obj.deathAnim = { startTime: Date.now(), x: msg.x, y: msg.y };
    }
    if (msg.killerId === myId) {
      spawnScorePopup(`+${msg.pts || 100}`, myColor, msg.x, msg.y);
      const streakLabels = { 3: 'TRIPLE KILL!', 4: 'QUAD KILL!', 5: 'RAMPAGE!' };
      if (msg.streak >= 3) showAnnouncement(streakLabels[Math.min(msg.streak, 5)] || `${msg.streak}x STREAK!`, '#ff2266');
    }
  }

  if (msg.type === 'border_zap') {
    spawnExplosion(msg.x, msg.y, 25, 0x4488ff);
    spawnExplosion(msg.x, msg.y, 15, 0xffffff);
    playSound('hit');
    triggerShake(4);
    triggerBorderZapFlash();
  }

  if (msg.type === 'pickup_collected') {
    spawnExplosion(msg.x, msg.y, 12, PICKUP_COLORS[msg.pickupType] || 0xffffff);
    removePickup(msg.id);
    playSound('pickup');
    if (msg.byId === myId) {
      triggerPickupFlash(msg.pickupType);
      spawnScorePopup(PICKUP_LABELS[msg.pickupType] || '✨', myColor, msg.x, msg.y);
    }
  }

  if (msg.type === 'loot_dropped') {
    // Particules jaillissant — couleur de rareté
    const rarityColors = { common: 0xcccccc, rare: 0x4488ff, epic: 0xbb44ff, legendary: 0xffaa00 };
    spawnExplosion(msg.x, msg.y, 20, rarityColors[msg.rarity] || 0xffffff);
    playSound('pickup');
  }

  if (msg.type === 'nuke_activated') {
    triggerShake(15);
    playSound('explode');
    const el = document.getElementById('pickup-flash');
    if (el) {
      el.style.setProperty('--flash-color', '#ffffff');
      el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
    }
    // Batch : remove all nuked asteroids, spawn only a few explosions (max 8) to avoid lag
    if (msg.destroyed) {
      for (const d of msg.destroyed) removeAsteroid(d.id);
      const sample = msg.destroyed.length > 8
        ? msg.destroyed.filter((_, i) => i % Math.ceil(msg.destroyed.length / 8) === 0)
        : msg.destroyed;
      for (const d of sample) spawnExplosion(d.x, d.y, 25, 0xffffff);
    }
  }

  if (msg.type === 'drone_shot') {
    spawnExplosion(msg.x, msg.y, 5, 0xbb44ff);
  }

  if (msg.type === 'asteroid_storm') {
    showAnnouncement('ASTEROID STORM!', '#4488ff');
    triggerShake(8);
    playSound('explode');
  }

  if (msg.type === 'pickup_despawn') {
    removePickup(msg.id);
  }

  if (msg.type === 'gravwell_placed') {
    spawnExplosion(msg.x, msg.y, 30, 0x8844ff);
    playSound('pickup');
  }

  if (msg.type === 'enemy_killed') {
    spawnExplosion(msg.x, msg.y, 25, 0xff3333);
    triggerShake(6);
    playSound('explode');
    if (msg.killerId === myId) {
      spawnScorePopup(`+${msg.pts} KILL`, '#ff3333', msg.x, msg.y);
    }
  }

  if (msg.type === 'boss_killed') {
    spawnExplosion(msg.x, msg.y, 50, 0xff0000);
    spawnExplosion(msg.x + 30, msg.y - 20, 40, 0xff6600);
    spawnExplosion(msg.x - 20, msg.y + 30, 40, 0xffff00);
    triggerShake(20);
    playSound('explode');
    showAnnouncement('🏆 BOSS DEFEATED! 🏆', '#ffaa00');
  }

  if (msg.type === 'boss_special') {
    spawnExplosion(msg.x, msg.y, 35, 0xff4400);
    triggerShake(8);
    playSound('explode');
  }
}

// ─── Écrans ───────────────────────────────────────────────────────────────────

const screenLobby    = document.getElementById('screen-lobby');
const screenJoin     = document.getElementById('screen-join');
const screenWaiting  = document.getElementById('screen-waiting');
const screenGameover = document.getElementById('screen-gameover');
const lobbyInfo      = document.getElementById('lobby-info');
const inputName      = document.getElementById('input-name');
const btnCreate      = document.getElementById('btn-create');
const btnShowJoin    = document.getElementById('btn-show-join');
const inputCode      = document.getElementById('input-code');
const joinError      = document.getElementById('join-error');
const btnJoinOk      = document.getElementById('btn-join-ok');
const btnJoinCancel  = document.getElementById('btn-join-cancel');
const btnStartGame   = document.getElementById('btn-start-game');
const roomCodeVal    = document.getElementById('room-code-val');
const waitingPlayers = document.getElementById('waiting-players');
const waitingStatus  = document.getElementById('waiting-status');
const btnRestart     = document.getElementById('btn-restart');
const btnMenu        = document.getElementById('btn-menu');

let isHost = false;
let myRoomCode = null;

function showScreen(name) {
  screenLobby.style.display    = name === 'lobby'    ? 'flex' : 'none';
  screenJoin.style.display     = name === 'join'     ? 'flex' : 'none';
  screenWaiting.style.display  = name === 'waiting'  ? 'flex' : 'none';
  screenGameover.style.display = name === 'gameover' ? 'flex' : 'none';
  hudEl.style.display          = name === 'hud'      ? 'block' : 'none';
  // Hide cursor during gameplay
  document.body.style.cursor = name === 'hud' ? 'none' : '';
  // Musique : menu dans lobby/join/waiting/gameover, game en jeu
  const wantTrack = name === 'hud' ? gameMusic : menuMusic;
  if (currentMusic !== wantTrack || wantTrack.paused) {
    stopMusic();
    playMusic(wantTrack);
  }
}

function renderWaitingPlayers(players) {
  waitingPlayers.innerHTML = players.map(p =>
    `<div class="wp-row" style="color:${p.color}">
       ${p.isHost ? '<span class="wp-host">HOST</span>' : '<span class="wp-guest">></span>'}
       ${p.name}
     </div>`
  ).join('');
  // Mettre à jour le bouton start et le statut
  if (isHost) {
    btnStartGame.style.display = 'block';
    waitingStatus.style.display = 'none';
  } else {
    btnStartGame.style.display = 'none';
    waitingStatus.style.display = 'block';
    // Indiquer qui est le host
    const host = players.find(p => p.isHost);
    waitingStatus.textContent = host
      ? `En attente de ${host.name}...`
      : 'En attente du créateur...';
  }
}

showScreen('lobby');

// Autoplay policy : démarrer la musique menu au premier clic
document.addEventListener('click', function firstClick() {
  startMenuMusic();
  document.removeEventListener('click', firstClick);
}, { once: true });

// ─── Menu Options ─────────────────────────────────────────────────────────────

const settingsPanel = document.getElementById('settings-panel');
const toggleLayout  = document.getElementById('toggle-layout');
const toggleSound   = document.getElementById('toggle-sound');
const sliderSfx     = document.getElementById('slider-sfx');
const sliderMusic   = document.getElementById('slider-music');
const sfxValLabel   = document.getElementById('sfx-val');
const musicValLabel = document.getElementById('music-val');

function updateSettingsUI() {
  toggleLayout.textContent = settings.layout === 'wasd' ? 'WASD / ZQSD' : 'ZQSD / WASD';
  toggleSound.textContent  = settings.sound ? 'SON : ON' : 'SON : OFF';
  sliderSfx.value = Math.round(settings.sfxVol * 100);
  sliderMusic.value = Math.round(settings.musicVol * 100);
  sfxValLabel.textContent = Math.round(settings.sfxVol * 100) + '%';
  musicValLabel.textContent = Math.round(settings.musicVol * 100) + '%';
  const hint = document.getElementById('controls-hint-keys');
  if (hint) hint.textContent = settings.layout === 'azerty' ? 'ZQSD / Flèches' : 'WASD / Flèches';
}

function toggleSettings() {
  const open = settingsPanel.style.display === 'flex';
  settingsPanel.style.display = open ? 'none' : 'flex';
  // Cacher le curseur seulement si on ferme les options ET qu'on est en jeu (hud)
  const inGame = hudEl.style.display === 'block' && screenGameover.style.display === 'none';
  document.body.style.cursor = (open && inGame) ? 'none' : '';
}

toggleLayout.addEventListener('click', () => {
  saveSetting('layout', settings.layout === 'wasd' ? 'azerty' : 'wasd');
  updateSettingsUI();
});

toggleSound.addEventListener('click', () => {
  saveSetting('sound', !settings.sound);
  updateSettingsUI();
  if (settings.sound) playSound('pickup');
});

sliderSfx.addEventListener('input', () => {
  saveSetting('sfxVol', sliderSfx.value / 100);
  sfxValLabel.textContent = sliderSfx.value + '%';
});

sliderMusic.addEventListener('input', () => {
  saveSetting('musicVol', sliderMusic.value / 100);
  musicValLabel.textContent = sliderMusic.value + '%';
  updateMusicVolume();
});

document.getElementById('btn-close-settings').addEventListener('click', toggleSettings);
document.getElementById('btn-settings').addEventListener('click', toggleSettings);

updateSettingsUI();

// ─── WebSocket ────────────────────────────────────────────────────────────────

let ws = null;
let inputSeq = 0;

function connect() {
  ws = new WebSocket(WS_URL);

  ws.onopen  = () => { lobbyInfo.textContent = 'Connecté ! Entre ton nom et crée ou rejoins une salle.'; };
  ws.onerror = () => { lobbyInfo.textContent = 'Impossible de se connecter au serveur.'; };
  ws.onclose = () => {
    isHost = false; myRoomCode = null;
    showScreen('lobby');
    lobbyInfo.textContent = 'Déconnecté. Recharger pour réessayer.';
  };

  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);

    if (msg.type === 'assign') {
      myId = msg.id; myColor = msg.color; localPred = null; inputBuffer.length = 0;
    }

    if (msg.type === 'room_created') {
      myRoomCode = msg.code;
      isHost = true;
      roomCodeVal.textContent = msg.code;
      btnStartGame.style.display = 'block';
      waitingStatus.style.display = 'none';
      const hostSettings = document.getElementById('host-settings');
      if (hostSettings) hostSettings.style.display = 'flex';
      showScreen('waiting');
      startInputLoop();
    }

    if (msg.type === 'lobby_update') {
      myRoomCode = msg.code;
      roomCodeVal.textContent = msg.code;
      renderWaitingPlayers(msg.players);
      // Si on n'est pas encore sur l'écran waiting (cas d'un rejoignant)
      if (screenWaiting.style.display === 'none' && screenGameover.style.display === 'none') {
        showScreen('waiting');
        startInputLoop();
      }
      // Après gameover → retour en salle d'attente
      if (screenGameover.style.display !== 'none') {
        showScreen('waiting');
      }
    }

    if (msg.type === 'error') {
      joinError.textContent = msg.message;
      setTimeout(() => { joinError.textContent = ''; }, 3000);
    }

    if (msg.type === 'start') {
      gameDuration = msg.duration || 300;
      gameDifficulty = msg.difficulty || 'normal';
      showScreen('hud');
      prevScores = {}; localPred = null; inputBuffer.length = 0;
      // Clear old enemy/boss meshes
      for (const [id] of enemyMeshes) removeEnemy(id);
      bossMesh = null;
      document.getElementById('boss-hud').style.display = 'none';
    }

    if (msg.type === 'snapshot') {
      prevSnapshot = currSnapshot;
      currSnapshot = msg;
      lastSnapshotTime = performance.now();

      const me = msg.players.find(p => p.id === myId);
      if (me) {
        if (!me.alive || me.respawnTimer > 0) {
          localPred = null;
          inputBuffer.length = 0;
        } else {
          // Server reconciliation : prendre l'état serveur + rejouer inputs non confirmés
          reconcile(me, msg.lastInputSeq || 0);
        }
      }

      const playerIds  = new Set(msg.players.map(p => p.id));
      const astIds     = new Set(msg.asteroids.map(a => a.id));
      const pickupIds  = new Set((msg.pickups || []).map(pk => pk.id));
      const projIds    = new Set((msg.projectiles || []).map(pr => pr.id));
      for (const id of playerMeshes.keys())      if (!playerIds.has(id))  removePlayer(id);
      for (const id of asteroidMeshes.keys())    if (!astIds.has(id))     removeAsteroid(id);
      for (const id of pickupMeshes.keys())      if (!pickupIds.has(id))  removePickup(id);
      for (const id of projectileMeshes.keys())  if (!projIds.has(id))    removeProjectile(id);
      const enemyIds = new Set((msg.enemies || []).map(e => e.id));
      for (const id of enemyMeshes.keys())       if (!enemyIds.has(id))   removeEnemy(id);

      // Events batchés dans le snapshot
      if (msg.events) for (const ev of msg.events) handleEvent(ev);
    }

    if (EVENT_TYPES.has(msg.type)) handleEvent(msg);

    if (msg.type === 'gameover') {
      showScreen('gameover');
      document.getElementById('gameover-scores').innerHTML = msg.scores.map((s, i) =>
        `<div class="go-entry" style="border-color:${s.color};color:${s.color}">
          ${i === 0 ? '🏆' : `#${i+1}`} ${s.name} — ${s.score} 💎
        </div>`
      ).join('');
    }

    if (msg.type === 'highscores') {
      hsData = msg.data || {};
      renderHighscores();
    }
  };
}

// Envoi input
let inputInterval = null;
function startInputLoop() {
  if (inputInterval) return;
  inputInterval = setInterval(() => {
    if (ws?.readyState !== 1) return;
    const shootNow = keys.shoot || clickShootFrame || mouseDown;
    clickShootFrame = false;
    const dash = dashFrame; dashFrame = false;
    const seq = inputSeq++;
    const inputKeys = { thrust: keys.thrust, left: keys.left, right: keys.right, shoot: shootNow, dash, selectedWeapon };
    ws.send(JSON.stringify({ type: 'input', seq, keys: inputKeys }));
    // Stocker dans le buffer pour reconciliation (seulement mouvement)
    inputBuffer.push({ seq, keys: { thrust: keys.thrust, left: keys.left, right: keys.right }, dt: DT });
    // Limiter la taille du buffer (garder ~2s d'inputs max)
    if (inputBuffer.length > 40) inputBuffer.shift();
  }, 50);
}

// ─── Boutons UI ───────────────────────────────────────────────────────────────

function getName() { return inputName.value.trim() || 'Joueur'; }

// Créer une salle
btnCreate.addEventListener('click', () => {
  if (!ws || ws.readyState !== 1) return;
  ws.send(JSON.stringify({ type: 'create', name: getName() }));
});
inputName.addEventListener('keydown', e => { if (e.key === 'Enter') btnCreate.click(); });

// Afficher l'écran rejoindre
btnShowJoin.addEventListener('click', () => {
  if (!ws || ws.readyState !== 1) return;
  joinError.textContent = '';
  inputCode.value = '';
  showScreen('join');
});

// Rejoindre via code
btnJoinOk.addEventListener('click', () => {
  const code = inputCode.value.trim().toUpperCase();
  if (!code || code.length !== 4) { joinError.textContent = 'Code invalide (4 caractères)'; return; }
  if (!ws || ws.readyState !== 1) return;
  ws.send(JSON.stringify({ type: 'join_room', code, name: getName() }));
});
inputCode.addEventListener('keydown', e => { if (e.key === 'Enter') btnJoinOk.click(); });
// Forcer majuscules à la saisie
inputCode.addEventListener('input', () => { inputCode.value = inputCode.value.toUpperCase(); });

// Annuler → retour lobby
btnJoinCancel.addEventListener('click', () => showScreen('lobby'));

// Lancer la partie (host uniquement) avec settings
let selectedDuration = 300;
let selectedDifficulty = 'normal';

// Boutons durée
document.querySelectorAll('#duration-btns .btn-option').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#duration-btns .btn-option').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedDuration = parseInt(btn.dataset.val);
  });
});

// Boutons difficulté
const diffDescs = { easy: 'Pas d\'ennemis · Boss final', normal: 'Ennemis IA modérés · Boss final', hardcore: 'Ennemis agressifs · Boss puissant' };
document.querySelectorAll('#difficulty-btns .btn-option').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#difficulty-btns .btn-option').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedDifficulty = btn.dataset.val;
    document.getElementById('diff-desc').textContent = diffDescs[selectedDifficulty];
  });
});

btnStartGame.addEventListener('click', () => {
  if (ws?.readyState === 1) ws.send(JSON.stringify({
    type: 'start_game',
    duration: selectedDuration,
    difficulty: selectedDifficulty,
  }));
});

// Rejouer (après gameover — host uniquement côté serveur)
btnRestart.addEventListener('click', () => {
  if (ws?.readyState === 1) ws.send(JSON.stringify({ type: 'restart' }));
});

// Retour au menu principal (quitte la salle)
btnMenu.addEventListener('click', () => {
  if (ws?.readyState === 1) ws.send(JSON.stringify({ type: 'leave_room' }));
  myRoomCode = null;
  isHost = false;
  showScreen('lobby');
});

// ─── Highscores ──────────────────────────────────────────────────────────────

let hsData = {};
let hsDiff = 'normal';
let hsDur = '300';

const hsPanel = document.getElementById('highscores-panel');
const hsTable = document.getElementById('hs-table');
const hsDiffBtns = document.getElementById('hs-diff-btns');
const hsDurBtns = document.getElementById('hs-dur-btns');

document.getElementById('btn-highscores').addEventListener('click', () => {
  if (ws?.readyState === 1) ws.send(JSON.stringify({ type: 'get_highscores' }));
  hsPanel.style.display = 'flex';
  renderHighscores();
});

document.getElementById('btn-close-highscores').addEventListener('click', () => {
  hsPanel.style.display = 'none';
});

hsDiffBtns.addEventListener('click', e => {
  const btn = e.target.closest('.btn-option');
  if (!btn) return;
  hsDiffBtns.querySelectorAll('.btn-option').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  hsDiff = btn.dataset.val;
  renderHighscores();
});

hsDurBtns.addEventListener('click', e => {
  const btn = e.target.closest('.btn-option');
  if (!btn) return;
  hsDurBtns.querySelectorAll('.btn-option').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  hsDur = btn.dataset.val;
  renderHighscores();
});

function renderHighscores() {
  const key = `${hsDiff}_${hsDur}`;
  const scores = hsData[key] || [];
  if (scores.length === 0) {
    hsTable.innerHTML = '<div class="hs-empty">Aucun score enregistré</div>';
    return;
  }
  hsTable.innerHTML = scores.map((s, i) => {
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i+1}`;
    const d = new Date(s.date);
    const dateStr = `${d.getDate().toString().padStart(2,'0')}/${(d.getMonth()+1).toString().padStart(2,'0')}`;
    return `<div class="hs-entry">
      <span class="hs-rank">${medal}</span>
      <span class="hs-name">${s.name}</span>
      <span class="hs-score">${s.score} 💎</span>
      <span class="hs-date">${dateStr}</span>
    </div>`;
  }).join('');
}

// ESC ferme aussi le panneau highscores
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && hsPanel.style.display === 'flex') {
    hsPanel.style.display = 'none';
  }
});

// ─── Boucle de rendu ──────────────────────────────────────────────────────────

let lastTime = 0;

function animate(now) {
  requestAnimationFrame(animate);
  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;

  if (currSnapshot && currSnapshot.phase === 'playing') {
    const alpha = Math.min((now - lastSnapshotTime) / SERVER_TICK, 1);

    stepLocalPred(dt);

    for (const snap of currSnapshot.players) {
      if (snap.id === myId && localPred && snap.alive && snap.respawnTimer === 0) {
        updatePlayerMesh({ ...snap, x: localPred.x, y: localPred.y, angle: localPred.angle }, 1);
      } else {
        updatePlayerMesh(snap, alpha);
      }
    }

    for (const snap of currSnapshot.asteroids) updateAsteroidMesh(snap); // smooth-follow, pas d'alpha
    for (const snap of (currSnapshot.pickups || []))  updatePickupMesh(snap);
    for (const snap of (currSnapshot.projectiles || [])) updateProjectileMesh(snap, dt);
    for (const snap of (currSnapshot.enemies || []))  updateEnemyMesh(snap, alpha);
    updateBossMesh(currSnapshot.boss, alpha);

    updateHUD(currSnapshot);
    updateInventory(currSnapshot);
  }

  updateParticles(dt);
  updateLasers(dt);
  updateBorderArcs();
  // Flash border zap
  if (borderZapIntensity > 0) {
    for (const arc of borderArcs) {
      arc.line.material.color.setHex(0xffffff);
      arc.line2.material.color.setHex(0xffffff);
    }
    borderZapIntensity -= dt * 3;
    if (borderZapIntensity <= 0) {
      borderZapIntensity = 0;
      for (const arc of borderArcs) {
        arc.line.material.color.setHex(0x4488ff);
        arc.line2.material.color.setHex(0x88ccff);
      }
    }
  }
  // Screen shake
  if (shakeIntensity > 0.1) {
    camera.position.x += (Math.random() - 0.5) * shakeIntensity;
    camera.position.y += (Math.random() - 0.5) * shakeIntensity;
    shakeIntensity *= 0.88;
  } else {
    camera.position.x = 0;
    camera.position.y = 0;
    shakeIntensity = 0;
  }

  renderer.render(scene, camera);

  // Reset camera position after render
  camera.position.x = 0;
  camera.position.y = 0;
}

// ─── Lancement ────────────────────────────────────────────────────────────────

connect();
requestAnimationFrame(animate);
