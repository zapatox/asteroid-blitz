// Asteroid Blitz — Serveur autoritaire Bun WebSockets (multi-salles)
// Lancer : bun run server/index.js

const GAME_VERSION = 'v0.5.0';

// Wave system
const WAVE_CONFIG = {
  easy:     { waveSec: 50, bossWave: 10, enemyStartWave: 999, stormStartWave: 4 },
  normal:   { waveSec: 45, bossWave: 8,  enemyStartWave: 3,   stormStartWave: 3 },
  hardcore: { waveSec: 40, bossWave: 6,  enemyStartWave: 2,   stormStartWave: 2 },
};
const INTERMISSION_TICKS = 60;   // 3s
const SHOP_TIMEOUT_TICKS = 600;  // 30s max

const PORT = process.env.PORT || 3000;
const TICK_MS = 50;
const WORLD = 800;
const HALF = WORLD / 2;
const MAX_ASTEROIDS = 22;
const THRUST_FORCE = 320;
const TURN_SPEED = 2.8;
const DRAG = 0.97;
const MAX_SPEED = 200;
const SHOOT_COOLDOWN = 8;
const RESPAWN_TICKS = 40;
// Highscores persistants (fichier JSON)
const fs = require('fs');
const path = require('path');
const HIGHSCORES_FILE = path.join(import.meta.dir, 'highscores.json');
const MAX_HIGHSCORES = 10; // top 10 par catégorie

function loadHighscores() {
  try { return JSON.parse(fs.readFileSync(HIGHSCORES_FILE, 'utf8')); } catch { return {}; }
}
function saveHighscores(data) {
  fs.writeFileSync(HIGHSCORES_FILE, JSON.stringify(data, null, 2));
}
function getScoreKey(difficulty, bossWave) { return `${difficulty}_wave${bossWave}`; }
function addHighscore(name, score, difficulty, bossWave) {
  const data = loadHighscores();
  const key = getScoreKey(difficulty, bossWave);
  if (!data[key]) data[key] = [];
  data[key].push({ name, score, date: Date.now(), version: GAME_VERSION });
  data[key].sort((a, b) => b.score - a.score);
  data[key] = data[key].slice(0, MAX_HIGHSCORES);
  saveHighscores(data);
}
const EFFECT_TICKS_BOOST = 120;  // 6s
const EFFECT_TICKS_RAPID = 100;  // 5s
const LASER_AMMO = 8;           // nombre de tirs laser par pickup
const MISSILE_AMMO = 3;

const COMBO_WINDOW = 60;         // 3s pour enchaîner
const PICKUP_LIFETIME = 400;     // 20s avant despawn

// Projectiles physiques (volent jusqu'à collision ou mur)
const BULLET_SPEED = 520;
const MISSILE_SPEED = 280;
const BULLET_RADIUS = 3;
const MISSILE_RADIUS = 8;
const LASER_RANGE = 420;
const MISSILE_AOE = 95;
const KNOCKBACK_BULLET = 90;
const KNOCKBACK_MISSILE = 200;
const AST_BOUNCE = 0.7;

// Nouveaux items
const TRISHOT_AMMO = 30;             // 30 tirs triple
const MINIGUN_AMMO = 80;            // 80 balles minigun
const EFFECT_TICKS_DRONE = 300;      // 15s
const EFFECT_TICKS_MAGNET = 300;     // 15s
const EFFECT_TICKS_INTANGIBLE = 80;  // 4s
const EFFECT_TICKS_GRAVWELL = 120;   // 6s
const DRONE_SHOOT_INTERVAL = 16;     // ~0.8s
const MAGNET_RADIUS = 200;
const GRAVWELL_RADIUS = 250;
const GRAVWELL_FORCE = 180;
const PLAYER_RADIUS = 12;

// Loot system — toutes les tailles peuvent dropper, petits = plus commun
const LOOT_CHANCE_BIG = 0.5;     // r>=20 : 50% chance
const LOOT_CHANCE_SMALL = 0.35;  // r=10  : 35% chance

const RARITY_TABLE_BIG = [
  { rarity: 'common',    color: '#cccccc', weight: 8 },
  { rarity: 'rare',      color: '#4488ff', weight: 6 },
  { rarity: 'epic',      color: '#bb44ff', weight: 3 },
  { rarity: 'legendary', color: '#ffaa00', weight: 1 },
];
const RARITY_TABLE_SMALL = [
  { rarity: 'common',    color: '#cccccc', weight: 12 },
  { rarity: 'rare',      color: '#4488ff', weight: 5 },
  { rarity: 'epic',      color: '#bb44ff', weight: 1 },
];

// Loot drops : tactique immédiat. Items stratégiques (extralife, drone, magnet, gravwell) = shop only
const LOOT_TABLE = {
  common:    [{ type: 'crystal', weight: 4 }, { type: 'shield', weight: 3 }, { type: 'boost', weight: 2 }, { type: 'rapid', weight: 2 }],
  rare:      [{ type: 'trishot', weight: 3 }, { type: 'laser', weight: 2 }, { type: 'missile', weight: 2 }, { type: 'minigun', weight: 2 }],
  epic:      [{ type: 'minigun', weight: 2 }, { type: 'missile', weight: 2 }, { type: 'trishot', weight: 2 }],
  legendary: [{ type: 'nuke', weight: 3 }, { type: 'intangible', weight: 2 }],
};
// Ammo drops donnent des petites quantités (shop donne plus)
const DROP_AMMO = { laser: 3, missile: 1, trishot: 10, minigun: 30 };
const REROLL_BASE_COST = 25;  // coût initial du reroll, +25 à chaque reroll

// IA Ennemis
const ENEMY_RADIUS = 14;
const ENEMY_SHOOT_CD = 35;       // ~1.75s entre chaque tir
const ENEMY_SHOOT_CD_HARD = 20;  // ~1s en hardcore
const ENEMY_DETECT_RANGE = 300;
const ENEMY_SPEED = 100;
const ENEMY_SPEED_HARD = 150;
const ENEMY_HP = 2;
const ENEMY_HP_HARD = 5;
const ENEMY_RESPAWN_TICKS = 200;  // 10s
const ENEMY_KILL_SCORE = 50;

// Boss
const BOSS_RADIUS = 45;
const BOSS_SPEED = 70;
const BOSS_SHOOT_CD = 6;       // rafale rapide
const BOSS_PHASE_TICKS = 160;  // ~8s par phase
const BOSS_SPECIAL_CD = 300;   // 15s entre spéciaux
const BOSS_CONTACT_DAMAGE = 2;

const SHOP_POOL = [
  { id: 'laser_ammo',   cat: 'weapon',  name: 'Laser +8',          price: 80,  icon: '⚡', desc: '+8 tirs laser' },
  { id: 'missile_ammo', cat: 'weapon',  name: 'Missiles +3',       price: 100, icon: '🚀', desc: '+3 missiles' },
  { id: 'trishot_ammo', cat: 'weapon',  name: 'Trishot +30',       price: 70,  icon: '🔱', desc: '+30 tirs triples' },
  { id: 'minigun_ammo', cat: 'weapon',  name: 'Minigun +80',       price: 90,  icon: '🔫', desc: '+80 balles minigun' },
  { id: 'max_hp_up',    cat: 'passive', name: 'Max HP +1',         price: 150, icon: '💚', desc: '+1 PV maximum' },
  { id: 'extra_life',   cat: 'passive', name: 'Vie +1',            price: 200, icon: '❤️', desc: '+1 vie supplémentaire' },
  { id: 'speed_up',     cat: 'passive', name: 'Vitesse +',         price: 60,  icon: '💨', desc: '+15% vitesse' },
  { id: 'fire_rate_up', cat: 'passive', name: 'Cadence +',         price: 80,  icon: '🔥', desc: '+20% cadence de tir' },
  { id: 'magnet_range', cat: 'passive', name: 'Magnet +',          price: 70,  icon: '🧲', desc: '+30% portée aimant' },
  { id: 'drone_wave',   cat: 'active',  name: 'Drone (vague)',     price: 120, icon: '🤖', desc: 'Drone auto toute la vague' },
  { id: 'shield_regen', cat: 'active',  name: 'Soin complet',      price: 60,  icon: '💊', desc: 'Restaure tous les PV' },
  { id: 'nuke_start',   cat: 'active',  name: 'Nuke au départ',    price: 180, icon: '💥', desc: 'Nuke au début de la vague' },
  { id: 'double_dmg',   cat: 'buff',    name: 'Double dégâts',     price: 100, icon: '⚔️', desc: 'x2 dégâts prochaine vague' },
  { id: 'auto_heal',    cat: 'buff',    name: 'Auto-soin',         price: 80,  icon: '🩹', desc: '+1 PV toutes les 10s' },
];

const PLAYER_COLORS = ['#00ffff', '#ff00ff', '#ffff00', '#ff6600'];
const DT = TICK_MS / 1000;

// ─── Multi-salles ─────────────────────────────────────────────────────────────

// JS est single-threaded : on swape ce pointeur avant chaque appel de logique de jeu.
// Toutes les fonctions métier lisent/écrivent gameState sans savoir quelle salle est active.
let gameState = null;

const rooms = new Map(); // code → Room
const allWs = new Set(); // all connected websockets

function broadcastPlayerCount() {
  const msg = JSON.stringify({ type: 'player_count', count: allWs.size });
  for (const ws of allWs) { try { ws.send(msg); } catch {} }
}

function createRoomState() {
  return {
    phase: 'lobby',
    tick: 0,
    startTime: 0,
    players: new Map(),
    asteroids: new Map(),
    pickups: new Map(),
    projectiles: new Map(),
    enemies: new Map(),
    boss: null,
    nextAsteroidId: 0,
    nextPickupId: 0,
    nextProjId: 0,
    nextEnemyId: 0,
    settings: { difficulty: 'normal' },
    wave: 1,
    wavePhase: 'fighting',  // 'fighting' | 'intermission' | 'shop' | 'boss'
    waveTimer: 0,
    shopItems: new Map(),
    playersReady: new Set(),
    shopTimeout: 0,
    spawnQueue: [],
    stormDir: 0,
  };
}

function withRoom(room, fn) {
  gameState = room.gameState;
  fn();
  gameState = null;
}

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sans caractères ambigus (O/0, I/1)
  let code;
  do {
    code = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function broadcastRoom(room, msg) {
  const data = JSON.stringify(msg);
  for (const ws of room.wsSet) {
    if (ws.readyState === 1) ws.send(data);
  }
}

function broadcastLobbyUpdate(room) {
  const players = [...room.gameState.players.values()].map(p => ({
    name: p.name, color: p.color, isHost: p.id === room.hostId,
  }));
  broadcastRoom(room, { type: 'lobby_update', code: room.code, players });
}

// ─── Utilitaires ──────────────────────────────────────────────────────────────

function uid() { return Math.random().toString(36).slice(2, 9); }

function wrap(v, half) {
  if (v > half) return v - half * 2;
  if (v < -half) return v + half * 2;
  return v;
}

function dist2(ax, ay, bx, by) {
  const dx = ax - bx, dy = ay - by;
  return dx * dx + dy * dy;
}

function clamp(v, min, max) { return v < min ? min : v > max ? max : v; }

function weightedRandom(table) {
  const total = table.reduce((s, x) => s + x.weight, 0);
  let r = Math.random() * total;
  for (const entry of table) { r -= entry.weight; if (r <= 0) return entry; }
  return table[0];
}

// ─── Création d'entités ───────────────────────────────────────────────────────

function createPlayer(id, name, index) {
  const angle = (index / 4) * Math.PI * 2;
  const r = 150;
  return {
    id, name,
    color: PLAYER_COLORS[index % 4],
    x: Math.cos(angle) * r,
    y: Math.sin(angle) * r,
    angle: angle + Math.PI,
    vx: 0, vy: 0,
    hp: 4,
    lives: 2,         // nombre de vies (0 = mort définitive)
    score: 0,
    alive: true,
    respawnTimer: 0,
    shootCooldown: 0,
    thrust: false, left: false, right: false, shoot: false,
    prevShoot: false,
    effects: { boost: 0, rapid: 0, laser: 0, missile: 0, trishot: 0, drone: 0, magnet: 0, intangible: 0, minigun: 0, gravwell: 0 },
    droneAngle: 0,
    droneShootCd: 0,
    gravwellX: 0, gravwellY: 0,
    dashCooldown: 0,
    selectedWeapon: 'bullet',
    killStreak: 0,       // kills sans mourir
    comboTimer: 0,       // ticks restants pour enchaîner un combo
    comboCount: 0,       // nombre de hits dans le combo actuel
    lastInputSeq: 0,     // dernier seq d'input traité (pour reconciliation)
    crystals: 0,          // monnaie shop (séparée du score)
    waveScore: 0,         // score gagné cette vague (pour stats shop)
    waveCrystals: 0,      // cristaux gagnés cette vague
    waveKills: 0,         // astéroïdes détruits cette vague
    maxHp: 4,
    speedMult: 1,
    fireRateMult: 1,
    magnetRangeMult: 1,
    shopDrone: false,
    shopNuke: false,
    doubleDmgWave: false,
    autoHealWave: false,
    autoHealTimer: 0,
    rerollCount: 0,
  };
}

// Tue un joueur : décrémente lives, respawn si vies restantes
function killPlayer(p) {
  p.alive = false;
  p.hp = 0;
  p.lives--;
  if (p.lives > 0) {
    p.respawnTimer = RESPAWN_TICKS;
    p.hp = p.maxHp; // reset HP pour le prochain respawn
  }
  // Si lives <= 0 : mort définitive, pas de respawnTimer
}

function spawnAsteroid() {
  const sizes = [
    { radius: 32, hp: 3, crystal: 50, weight: 2 },
    { radius: 20, hp: 2, crystal: 25, weight: 4 },
    { radius: 10, hp: 1, crystal: 10, weight: 5 },
  ];
  const total = sizes.reduce((s, x) => s + x.weight, 0);
  let r = Math.random() * total, chosen = sizes[0];
  for (const s of sizes) { r -= s.weight; if (r <= 0) { chosen = s; break; } }

  const side = Math.floor(Math.random() * 4);
  let x, y;
  if (side === 0) { x = -HALF; y = (Math.random() - 0.5) * WORLD; }
  else if (side === 1) { x = HALF; y = (Math.random() - 0.5) * WORLD; }
  else if (side === 2) { x = (Math.random() - 0.5) * WORLD; y = -HALF; }
  else { x = (Math.random() - 0.5) * WORLD; y = HALF; }

  const speed = 25 + Math.random() * 60;
  const dir = Math.random() * Math.PI * 2;
  const id = 'a' + (gameState.nextAsteroidId++);

  // Loot : toutes tailles peuvent dropper, petits = items communs
  let loot = null;
  const isBig = chosen.radius >= 20;
  const lootChance = isBig ? LOOT_CHANCE_BIG : LOOT_CHANCE_SMALL;
  if (Math.random() < lootChance) {
    const rarityTable = isBig ? RARITY_TABLE_BIG : RARITY_TABLE_SMALL;
    const rarity = weightedRandom(rarityTable);
    const item = weightedRandom(LOOT_TABLE[rarity.rarity]);
    loot = { rarity: rarity.rarity, color: rarity.color, type: item.type };
  }

  return {
    id, x, y,
    vx: Math.cos(dir) * speed,
    vy: Math.sin(dir) * speed,
    angle: Math.random() * Math.PI * 2,
    angularVel: (Math.random() - 0.5) * 3,
    radius: chosen.radius,
    hp: chosen.hp,
    maxHp: chosen.hp,
    crystalValue: chosen.crystal,
    deflectedBy: null,
    loot,
  };
}

function splitAsteroid(ast) {
  if (ast.radius <= 10) return [];
  const childRadius = ast.radius === 32 ? 20 : 10;
  const childHp = childRadius === 20 ? 2 : 1;
  const count = 2 + (ast.radius === 32 ? 1 : 0);
  const children = [];
  for (let i = 0; i < count; i++) {
    const spread = (Math.PI / 3) * i + Math.random() * 0.4;
    const baseAngle = Math.atan2(ast.vy, ast.vx) + spread;
    const speed = 35 + Math.random() * 40;
    const id = 'a' + (gameState.nextAsteroidId++);
    children.push({
      id,
      x: ast.x + Math.cos(spread * i) * childRadius,
      y: ast.y + Math.sin(spread * i) * childRadius,
      vx: Math.cos(baseAngle) * speed,
      vy: Math.sin(baseAngle) * speed,
      angle: Math.random() * Math.PI * 2,
      angularVel: (Math.random() - 0.5) * 4,
      radius: childRadius,
      hp: childHp, maxHp: childHp,
      crystalValue: childRadius === 20 ? 25 : 10,
      deflectedBy: null,
      loot: null,
    });
  }
  return children;
}

// spawnPickup supprimé — tout le loot vient des astéroïdes

// ─── Physique ─────────────────────────────────────────────────────────────────

function integratePlayer(p) {
  // Respawn timer (tourne même si alive=false)
  if (p.respawnTimer > 0) {
    p.respawnTimer--;
    if (p.respawnTimer === 0 && p.hp > 0) {
      // Respawn : le joueur a encore des vies
      p.alive = true;
      const spawnAngle = Math.random() * Math.PI * 2;
      p.x  = Math.cos(spawnAngle) * 180;
      p.y  = Math.sin(spawnAngle) * 180;
      p.vx = 0;
      p.vy = 0;
      p.angle = spawnAngle + Math.PI;
    }
    return;
  }
  if (!p.alive) return;

  if (p.effects.boost  > 0) p.effects.boost--;
  if (p.effects.rapid  > 0) p.effects.rapid--;
  if (p.effects.drone  > 0) p.effects.drone--;
  if (p.effects.magnet > 0) p.effects.magnet--;
  if (p.effects.intangible > 0) p.effects.intangible--;
  if (p.effects.gravwell > 0) p.effects.gravwell--;
  if (p.dashCooldown > 0) p.dashCooldown--;
  // laser, missile, trishot, minigun = ammo (nombre de tirs), pas de tick decrement

  if (p.left)  p.angle += TURN_SPEED * DT;
  if (p.right) p.angle -= TURN_SPEED * DT;

  if (p.thrust) {
    const mult = p.effects.boost > 0 ? 2.2 : 1.0;
    p.vx += Math.cos(p.angle) * THRUST_FORCE * p.speedMult * mult * DT;
    p.vy += Math.sin(p.angle) * THRUST_FORCE * p.speedMult * mult * DT;
  }

  p.vx *= DRAG;
  p.vy *= DRAG;

  const spd = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
  if (spd > MAX_SPEED) { p.vx = (p.vx / spd) * MAX_SPEED; p.vy = (p.vy / spd) * MAX_SPEED; }

  p.x += p.vx * DT;
  p.y += p.vy * DT;
  // Bordure électrique : toucher le bord = dégât + rebond
  const BORDER_MARGIN = HALF - 5;
  if (Math.abs(p.x) > BORDER_MARGIN || Math.abs(p.y) > BORDER_MARGIN) {
    // Rebond : repousse le joueur vers le centre
    if (p.x > BORDER_MARGIN)  { p.x = BORDER_MARGIN - 10; p.vx = -200; }
    if (p.x < -BORDER_MARGIN) { p.x = -BORDER_MARGIN + 10; p.vx = 200; }
    if (p.y > BORDER_MARGIN)  { p.y = BORDER_MARGIN - 10; p.vy = -200; }
    if (p.y < -BORDER_MARGIN) { p.y = -BORDER_MARGIN + 10; p.vy = 200; }
    p.borderKill = true; // flag pour gameTick
  }

  if (p.shootCooldown > 0) p.shootCooldown--;
}

function integrateAsteroid(a) {
  a.angle += a.angularVel * DT;
  if (a.storm) {
    // Storm asteroids : avancent en ligne droite, pas de wrap
    a.x += a.vx * DT;
    a.y += a.vy * DT;
    // Marqué pour suppression quand sorti de l'autre côté
    const margin = HALF + 50;
    if (a.x > margin || a.x < -margin || a.y > margin || a.y < -margin) {
      a.expired = true;
    }
  } else {
    a.x = wrap(a.x + a.vx * DT, HALF);
    a.y = wrap(a.y + a.vy * DT, HALF);
  }
}

// ─── Projectiles & Combat ─────────────────────────────────────────────────────

function createProjectile(owner, weaponType) {
  const speed = weaponType === 'missile' ? MISSILE_SPEED : BULLET_SPEED;
  const dx = Math.cos(owner.angle), dy = Math.sin(owner.angle);
  const id = 'pr' + (gameState.nextProjId++);
  return {
    id, ownerId: owner.id, ownerColor: owner.color, type: weaponType,
    x: owner.x + dx * 5, y: owner.y + dy * 5,
    vx: dx * speed, vy: dy * speed,
    radius: weaponType === 'missile' ? MISSILE_RADIUS : BULLET_RADIUS,
  };
}

// Détruire ou déflèchir un astéroïde touché (knockback directionnel amélioré)
function hitAsteroid(a, p, events, forceDestroy = false, impactVx, impactVy) {
  // Apply double damage from shop buff
  const dmg = (p && p.doubleDmgWave) ? 2 : 1;
  if (!forceDestroy) a.hp -= dmg; else a.hp = 0;
  if (forceDestroy || a.hp <= 0) {
    const creditId = a.deflectedBy ?? (p ? p.id : null);
    const scorer = creditId ? (gameState.players.get(creditId) ?? p) : p;
    if (scorer) {
      scorer.score += a.crystalValue;
      scorer.crystals += Math.floor(a.crystalValue / 5);
      scorer.waveScore += a.crystalValue;
      scorer.waveCrystals += Math.floor(a.crystalValue / 5);
      scorer.waveKills++;
    }
    events.push({
      type: 'asteroid_destroyed',
      id: a.id, x: a.x, y: a.y, radius: a.radius,
      byId: creditId, crystals: a.crystalValue,
    });
    // Knockback : direction du projectile + composante "away"
    if (impactVx !== undefined) {
      const impLen = Math.sqrt(impactVx * impactVx + impactVy * impactVy) || 1;
      const kb = KNOCKBACK_BULLET / (a.radius * 0.08);
      a.vx = (impactVx / impLen) * kb;
      a.vy = (impactVy / impLen) * kb;
    }
    // Loot drop
    if (a.loot) {
      const pk = {
        id: 'pk' + (gameState.nextPickupId++),
        type: a.loot.type, rarity: a.loot.rarity,
        x: a.x, y: a.y,
      };
      gameState.pickups.set(pk.id, pk);
      events.push({ type: 'loot_dropped', id: pk.id, pickupType: pk.type, rarity: a.loot.rarity, x: a.x, y: a.y });
    }
    const children = splitAsteroid(a);
    for (const c of children) {
      if (impactVx !== undefined) {
        const impLen = Math.sqrt(impactVx * impactVx + impactVy * impactVy) || 1;
        c.vx += (impactVx / impLen) * 30 / c.radius;
        c.vy += (impactVy / impLen) * 30 / c.radius;
      }
      gameState.asteroids.set(c.id, c);
    }
    gameState.asteroids.delete(a.id);
    return true;
  } else {
    // Déflexion : mélange direction du projectile (70%) + away (30%)
    const kb = KNOCKBACK_BULLET / (a.radius * 0.05);
    const px = p ? p.x : 0, py = p ? p.y : 0;
    if (impactVx !== undefined) {
      const impLen = Math.sqrt(impactVx * impactVx + impactVy * impactVy) || 1;
      const awayX = a.x - px, awayY = a.y - py;
      const awayLen = Math.sqrt(awayX * awayX + awayY * awayY) || 1;
      a.vx = (impactVx / impLen * 0.7 + awayX / awayLen * 0.3) * kb;
      a.vy = (impactVy / impLen * 0.7 + awayY / awayLen * 0.3) * kb;
    } else {
      const awayX = a.x - px, awayY = a.y - py;
      const awayLen = Math.sqrt(awayX * awayX + awayY * awayY) || 1;
      a.vx = (awayX / awayLen) * Math.max(Math.sqrt(a.vx ** 2 + a.vy ** 2) * 1.6, 80);
      a.vy = (awayY / awayLen) * Math.max(Math.sqrt(a.vx ** 2 + a.vy ** 2) * 1.6, 80);
    }
    if (p) {
      a.deflectedBy = p.id;
      events.push({ type: 'deflect', id: a.id, x: a.x, y: a.y, byId: p.id });
    }
    return false;
  }
}

function processShots(events) {
  for (const p of gameState.players.values()) {
    if (!p.alive || p.respawnTimer > 0) continue;
    // Minigun = tir continu géré par integrateMinigun(), skip processShots
    if (p.selectedWeapon === 'minigun' && p.effects.minigun > 0) {
      p.prevShoot = p.shoot;
      continue;
    }
    // Arme sélectionnée par le joueur (scroll inventaire), fallback bullet si pas d'ammo
    let weaponType = p.selectedWeapon || 'bullet';
    if (weaponType === 'trishot' && p.effects.trishot <= 0) weaponType = 'bullet';
    if (weaponType === 'laser' && p.effects.laser <= 0) weaponType = 'bullet';
    if (weaponType === 'missile' && p.effects.missile <= 0) weaponType = 'bullet';

    // Bullet & trishot = auto-fire (maintenir clic), autres armes = semi-auto (clic par clic)
    const autoFire = (weaponType === 'bullet' || weaponType === 'trishot');
    const shoot = autoFire
      ? (p.shoot && p.shootCooldown === 0)
      : (p.shoot && !p.prevShoot && p.shootCooldown === 0);
    p.prevShoot = p.shoot;
    if (!shoot) continue;

    const baseCooldown = p.effects.rapid > 0 ? Math.ceil(SHOOT_COOLDOWN / 2) : SHOOT_COOLDOWN;
    p.shootCooldown = Math.ceil(baseCooldown / p.fireRateMult);

    if (weaponType === 'trishot') {
      // Triple-shot : 3 balles en éventail, arme distincte
      p.effects.trishot--;
      for (const offset of [-0.26, 0, 0.26]) { // ±15°
        const proj = createProjectile(p, 'bullet');
        const cos = Math.cos(offset), sin = Math.sin(offset);
        const ovx = proj.vx, ovy = proj.vy;
        proj.vx = ovx * cos - ovy * sin;
        proj.vy = ovx * sin + ovy * cos;
        gameState.projectiles.set(proj.id, proj);
      }
      events.push({ type: 'shot_fired', playerId: p.id, weaponType: 'trishot' });
    } else if (weaponType === 'bullet' || weaponType === 'missile') {
      if (weaponType === 'missile') p.effects.missile--;
      const proj = createProjectile(p, weaponType);
      gameState.projectiles.set(proj.id, proj);
      events.push({ type: 'shot_fired', playerId: p.id, weaponType });
    }

    else if (weaponType === 'laser') {
      // Laser = hitscan instantané (satisfaisant comme rayon)
      p.effects.laser--;
      const bx = p.x, by = p.y;
      const dx = Math.cos(p.angle), dy = Math.sin(p.angle);
      const hitAsts = [];
      for (const a of gameState.asteroids.values()) {
        const fx = a.x - bx, fy = a.y - by;
        const t = clamp(fx * dx + fy * dy, 0, LASER_RANGE);
        const cx = bx + dx * t, cy = by + dy * t;
        if (dist2(cx, cy, a.x, a.y) < (a.radius + 4) ** 2) hitAsts.push(a);
      }
      events.push({ type: 'bolt', weaponType: 'laser', playerId: p.id,
        x: bx, y: by, tx: bx + dx * LASER_RANGE, ty: by + dy * LASER_RANGE });
      for (const a of hitAsts) hitAsteroid(a, p, events);
    }
  }
}

// Déplacer les projectiles et gérer les collisions physiques
function integrateProjectiles(events) {
  for (const proj of gameState.projectiles.values()) {
    proj.x += proj.vx * DT;
    proj.y += proj.vy * DT;

    // Mur = destruction
    if (Math.abs(proj.x) > HALF || Math.abs(proj.y) > HALF) {
      gameState.projectiles.delete(proj.id);
      continue;
    }

    const owner = gameState.players.get(proj.ownerId);
    if (!owner && !proj.isEnemy && proj.ownerId !== 'boss') { gameState.projectiles.delete(proj.id); continue; }

    let deleted = false;

    // Collision avec astéroïdes
    if (proj.type === 'bullet') {
      for (const a of gameState.asteroids.values()) {
        const r = proj.radius + a.radius;
        if (dist2(proj.x, proj.y, a.x, a.y) < r * r) {
          hitAsteroid(a, owner, events, false, proj.vx, proj.vy);
          gameState.projectiles.delete(proj.id);
          deleted = true;
          break;
        }
      }
    } else if (proj.type === 'missile') {
      let hit = false;
      for (const a of gameState.asteroids.values()) {
        const r = proj.radius + a.radius;
        if (dist2(proj.x, proj.y, a.x, a.y) < r * r) { hit = true; break; }
      }
      if (hit) {
        const hx = proj.x, hy = proj.y;
        const toHit = [];
        for (const a of gameState.asteroids.values()) {
          if (dist2(hx, hy, a.x, a.y) < MISSILE_AOE ** 2) toHit.push(a);
        }
        for (const a of toHit) {
          const dx = a.x - hx, dy = a.y - hy;
          const d = Math.sqrt(dx * dx + dy * dy) || 1;
          const kb = KNOCKBACK_MISSILE * (1 - d / MISSILE_AOE) / (a.radius * 0.05);
          hitAsteroid(a, owner, events, true, dx / d * kb, dy / d * kb);
        }
        // Missile AOE : aussi blesser les joueurs (sauf tireur, pas en easy)
        if (gameState.settings.difficulty !== 'easy') {
          for (const target of gameState.players.values()) {
            if (target.id === proj.ownerId || !target.alive || target.respawnTimer > 0) continue;
            if (target.effects.intangible > 0) continue;
            if (dist2(hx, hy, target.x, target.y) < MISSILE_AOE ** 2) {
              target.hp--;
              const dxp = target.x - hx, dyp = target.y - hy;
              const dp = Math.sqrt(dxp * dxp + dyp * dyp) || 1;
              target.vx += (dxp / dp) * 120;
              target.vy += (dyp / dp) * 120;
              owner.score += 40;
              if (target.hp <= 0) {
                killPlayer(target);
                owner.score += 75;
                events.push({ type: 'player_killed', victimId: target.id, killerId: proj.ownerId, x: target.x, y: target.y, pts: 115, livesLeft: target.lives });
              } else {
                events.push({ type: 'player_hit', victimId: target.id, byId: proj.ownerId, x: target.x, y: target.y, pts: 40 });
              }
            }
          }
        }
        events.push({ type: 'missile_hit', x: hx, y: hy });
        gameState.projectiles.delete(proj.id);
        deleted = true;
      }
    }

    // Collision avec les autres joueurs (PvP) — seulement les projectiles de joueurs (pas en easy)
    if (gameState.settings.difficulty !== 'easy') {
      if (!deleted && gameState.projectiles.has(proj.id) && !proj.isEnemy) {
        for (const target of gameState.players.values()) {
          if (target.id === proj.ownerId || !target.alive || target.respawnTimer > 0) continue;
          if (target.effects.intangible > 0) continue;
          const r = proj.radius + PLAYER_RADIUS;
          if (dist2(proj.x, proj.y, target.x, target.y) < r * r) {
            target.hp--;
            const impLen = Math.sqrt(proj.vx ** 2 + proj.vy ** 2) || 1;
            target.vx += (proj.vx / impLen) * 60;
            target.vy += (proj.vy / impLen) * 60;
            // Combo system : hits rapprochés = multiplicateur
            owner.comboCount++;
            owner.comboTimer = COMBO_WINDOW;
            const combo = Math.min(owner.comboCount, 5);
            const baseHitPts = proj.type === 'missile' ? 40 : proj.type === 'laser' ? 30 : 25;
            const hitPts = Math.floor(baseHitPts * (1 + (combo - 1) * 0.25));
            owner.score += hitPts;
            if (target.hp <= 0) {
              killPlayer(target);
              target.killStreak = 0;
              owner.killStreak++;
              const killBonus = 75 + (owner.killStreak >= 5 ? 50 : owner.killStreak >= 3 ? 25 : 0);
              owner.score += killBonus;
              events.push({ type: 'player_killed', victimId: target.id, killerId: proj.ownerId, x: target.x, y: target.y, pts: hitPts + killBonus, streak: owner.killStreak, combo, livesLeft: target.lives });
            } else {
              events.push({ type: 'player_hit', victimId: target.id, byId: proj.ownerId, x: target.x, y: target.y, pts: hitPts, combo });
            }
            gameState.projectiles.delete(proj.id);
            break;
          }
        }
      }
    }

    // Collision avec les ennemis IA (joueurs tirent sur ennemis)
    if (!deleted && gameState.projectiles.has(proj.id) && !proj.isEnemy) {
      for (const e of gameState.enemies.values()) {
        if (!e.alive) continue;
        const r = proj.radius + e.radius;
        if (dist2(proj.x, proj.y, e.x, e.y) < r * r) {
          const eDmg = (owner && owner.doubleDmgWave) ? 2 : 1;
          e.hp -= eDmg;
          if (e.hp <= 0) {
            e.alive = false;
            e.respawnTimer = ENEMY_RESPAWN_TICKS;
            if (owner) {
              owner.score += ENEMY_KILL_SCORE;
              owner.crystals += 25;
            }
            // Drop un pickup rare garanti
            const rarity = Math.random() < 0.3 ? 'epic' : 'rare';
            const item = weightedRandom(LOOT_TABLE[rarity]);
            const pk = { id: 'pk' + (gameState.nextPickupId++), type: item.type, rarity, x: e.x, y: e.y, age: 0 };
            gameState.pickups.set(pk.id, pk);
            events.push({ type: 'enemy_killed', id: e.id, x: e.x, y: e.y, killerId: proj.ownerId, pts: ENEMY_KILL_SCORE });
          }
          gameState.projectiles.delete(proj.id);
          break;
        }
      }
    }

    // Collision avec le boss
    if (!deleted && gameState.projectiles.has(proj.id) && !proj.isEnemy && gameState.boss?.alive) {
      const b = gameState.boss;
      const r = proj.radius + b.radius;
      if (dist2(proj.x, proj.y, b.x, b.y) < r * r) {
        let dmg = proj.type === 'missile' ? 3 : 1;
        if (owner && owner.doubleDmgWave) dmg *= 2;
        b.hp -= dmg;
        if (owner) owner.score += dmg * 5;
        if (b.hp <= 0) {
          b.alive = false;
          // Bonus partagé
          const livingPlayers = [...gameState.players.values()].filter(p => p.alive);
          const bonus = Math.floor(200 / (livingPlayers.length || 1));
          for (const lp of livingPlayers) lp.score += bonus;
          events.push({ type: 'boss_killed', x: b.x, y: b.y, bonus });
        }
        gameState.projectiles.delete(proj.id);
      }
    }

    // Collision projectile ennemi → joueur
    if (!deleted && gameState.projectiles.has(proj.id) && proj.isEnemy) {
      for (const target of gameState.players.values()) {
        if (!target.alive || target.respawnTimer > 0 || target.effects.intangible > 0) continue;
        const r = proj.radius + PLAYER_RADIUS;
        if (dist2(proj.x, proj.y, target.x, target.y) < r * r) {
          target.hp--;
          const impLen = Math.sqrt(proj.vx ** 2 + proj.vy ** 2) || 1;
          target.vx += (proj.vx / impLen) * 50;
          target.vy += (proj.vy / impLen) * 50;
          if (target.hp <= 0) {
            killPlayer(target);
            events.push({ type: 'player_killed', victimId: target.id, killerId: proj.ownerId, x: target.x, y: target.y, livesLeft: target.lives });
          } else {
            events.push({ type: 'player_hit', victimId: target.id, byId: proj.ownerId, x: target.x, y: target.y });
          }
          gameState.projectiles.delete(proj.id);
          break;
        }
      }
    }
  }
}

// Collisions astéroïde-astéroïde : rebond élastique fun
function checkAsteroidCollisions() {
  const asts = [...gameState.asteroids.values()];
  for (let i = 0; i < asts.length; i++) {
    for (let j = i + 1; j < asts.length; j++) {
      const a = asts[i], b = asts[j];
      const dx = b.x - a.x, dy = b.y - a.y;
      const d2 = dx * dx + dy * dy;
      const minDist = a.radius + b.radius;
      if (d2 < minDist * minDist && d2 > 0.01) {
        const d = Math.sqrt(d2);
        const nx = dx / d, ny = dy / d;
        // Séparer
        const overlap = minDist - d;
        const totalMass = a.radius + b.radius;
        a.x -= nx * overlap * (b.radius / totalMass);
        a.y -= ny * overlap * (b.radius / totalMass);
        b.x += nx * overlap * (a.radius / totalMass);
        b.y += ny * overlap * (a.radius / totalMass);
        // Rebond élastique avec restitution
        const dvx = a.vx - b.vx, dvy = a.vy - b.vy;
        const dot = dvx * nx + dvy * ny;
        if (dot > 0) {
          const ma = a.radius * a.radius, mb = b.radius * b.radius;
          const j = (1 + AST_BOUNCE) * dot / (1 / ma + 1 / mb);
          a.vx -= (j / ma) * nx;
          a.vy -= (j / ma) * ny;
          b.vx += (j / mb) * nx;
          b.vy += (j / mb) * ny;
          // Petit kick angular
          a.angularVel += (Math.random() - 0.5) * 1.5;
          b.angularVel += (Math.random() - 0.5) * 1.5;
        }
      }
    }
  }
}

function checkAsteroidPlayerCollisions(events) {
  for (const a of gameState.asteroids.values()) {
    for (const p of gameState.players.values()) {
      if (!p.alive || p.respawnTimer > 0) continue;
      if (p.effects.intangible > 0) continue;
      const r = a.radius + 8;
      if (dist2(a.x, a.y, p.x, p.y) < r * r) {
        p.hp--;
        events.push({ type: 'player_hit', x: p.x, y: p.y, victimId: p.id, byId: a.deflectedBy });

        if (a.deflectedBy) {
          const scorer = gameState.players.get(a.deflectedBy);
          if (scorer && scorer.id !== p.id) scorer.score += 50;
        }

        const children = splitAsteroid(a);
        for (const c of children) gameState.asteroids.set(c.id, c);
        gameState.asteroids.delete(a.id);

        if (p.hp <= 0) {
          killPlayer(p);
          events.push({ type: 'player_killed', x: p.x, y: p.y, victimId: p.id, livesLeft: p.lives });
        } else {
          p.effects.intangible = 30; // i-frames après hit
        }
        break;
      }
    }
  }
}

function checkPlayerPickupCollisions(events) {
  for (const pickup of gameState.pickups.values()) {
    for (const p of gameState.players.values()) {
      if (!p.alive || p.respawnTimer > 0) continue;
      if (dist2(p.x, p.y, pickup.x, pickup.y) < (22 * 22)) {
        if (pickup.type === 'crystal') {
          p.score += 30;
          p.crystals += 30;
        } else if (pickup.type === 'shield') {
          p.hp = Math.min(p.hp + 1, p.maxHp);
        } else if (pickup.type === 'boost') {
          p.effects.boost = EFFECT_TICKS_BOOST;
        } else if (pickup.type === 'rapid') {
          p.effects.rapid = EFFECT_TICKS_RAPID;
        } else if (pickup.type === 'laser') {
          p.effects.laser += DROP_AMMO.laser;
        } else if (pickup.type === 'missile') {
          p.effects.missile += DROP_AMMO.missile;
        } else if (pickup.type === 'trishot') {
          p.effects.trishot += DROP_AMMO.trishot;
        } else if (pickup.type === 'drone') {
          p.effects.drone = EFFECT_TICKS_DRONE;
          p.droneShootCd = 0;
        } else if (pickup.type === 'magnet') {
          p.effects.magnet = EFFECT_TICKS_MAGNET;
        } else if (pickup.type === 'intangible') {
          p.effects.intangible = EFFECT_TICKS_INTANGIBLE;
        } else if (pickup.type === 'minigun') {
          p.effects.minigun += DROP_AMMO.minigun;
        } else if (pickup.type === 'gravwell') {
          p.effects.gravwell = EFFECT_TICKS_GRAVWELL;
          p.gravwellX = p.x + Math.cos(p.angle) * 100;
          p.gravwellY = p.y + Math.sin(p.angle) * 100;
          events.push({ type: 'gravwell_placed', x: p.gravwellX, y: p.gravwellY, byId: p.id });
        } else if (pickup.type === 'nuke') {
          // Nuke : un seul événement batch au lieu de 100+ événements séparés
          const nukeData = [];
          for (const a of gameState.asteroids.values()) {
            p.score += a.crystalValue;
            nukeData.push({ id: a.id, x: a.x, y: a.y, radius: a.radius });
            if (a.loot) {
              const pk = { id: 'pk' + (gameState.nextPickupId++), type: a.loot.type, rarity: a.loot.rarity, x: a.x, y: a.y };
              gameState.pickups.set(pk.id, pk);
            }
          }
          gameState.asteroids.clear();
          events.push({ type: 'nuke_activated', x: p.x, y: p.y, byId: p.id, destroyed: nukeData });
        } else if (pickup.type === 'extralife') {
          p.lives++;
        }
        events.push({ type: 'pickup_collected', id: pickup.id, pickupType: pickup.type, rarity: pickup.rarity, x: pickup.x, y: pickup.y, byId: p.id });
        gameState.pickups.delete(pickup.id);
        break;
      }
    }
  }
}

function getDynamicMax() {
  const diffBonus = { easy: 0, normal: 2, hardcore: 5 }[gameState.settings.difficulty] || 0;
  return Math.min(27, 5 + gameState.wave * 2 + diffBonus);
}

function maintainAsteroids() {
  if (gameState.asteroids.size < getDynamicMax()) {
    const a = spawnAsteroid();
    gameState.asteroids.set(a.id, a);
  }
}

function integrateDrones(events) {
  for (const p of gameState.players.values()) {
    if (!p.alive || p.respawnTimer > 0 || p.effects.drone <= 0) continue;
    p.droneAngle += 3 * DT;
    if (p.droneShootCd > 0) { p.droneShootCd--; continue; }
    // Trouver l'astéroïde le plus proche dans 250px
    let closest = null, closestDist = 250 * 250;
    for (const a of gameState.asteroids.values()) {
      const d = dist2(p.x, p.y, a.x, a.y);
      if (d < closestDist) { closest = a; closestDist = d; }
    }
    if (closest) {
      p.droneShootCd = DRONE_SHOOT_INTERVAL;
      const droneX = p.x + Math.cos(p.droneAngle) * 30;
      const droneY = p.y + Math.sin(p.droneAngle) * 30;
      const dx = closest.x - droneX, dy = closest.y - droneY;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const id = 'pr' + (gameState.nextProjId++);
      const proj = {
        id, ownerId: p.id, ownerColor: p.color, type: 'bullet',
        x: droneX, y: droneY,
        vx: (dx / d) * BULLET_SPEED, vy: (dy / d) * BULLET_SPEED,
        radius: BULLET_RADIUS,
      };
      gameState.projectiles.set(proj.id, proj);
      events.push({ type: 'drone_shot', playerId: p.id, x: droneX, y: droneY, tx: closest.x, ty: closest.y });
    }
  }
}

function applyMagnet() {
  for (const p of gameState.players.values()) {
    if (!p.alive || p.respawnTimer > 0 || p.effects.magnet <= 0) continue;
    const mRadius = MAGNET_RADIUS * p.magnetRangeMult;
    for (const pk of gameState.pickups.values()) {
      if (dist2(p.x, p.y, pk.x, pk.y) < mRadius * mRadius) {
        pk.x += (p.x - pk.x) * 0.08;
        pk.y += (p.y - pk.y) * 0.08;
      }
    }
  }
}

function integrateMinigun(events) {
  for (const p of gameState.players.values()) {
    if (!p.alive || p.respawnTimer > 0 || p.effects.minigun <= 0) continue;
    if (!p.shoot) continue; // tire seulement quand le joueur appuie
    // Tire toutes les 2 ticks (~10 balles/sec) avec spread aléatoire
    if (gameState.tick % 2 === 0) {
      p.effects.minigun--; // consomme 1 ammo
      const spread = (Math.random() - 0.5) * 0.35; // ±10°
      const proj = createProjectile(p, 'bullet');
      const cos = Math.cos(spread), sin = Math.sin(spread);
      const ovx = proj.vx, ovy = proj.vy;
      proj.vx = ovx * cos - ovy * sin;
      proj.vy = ovx * sin + ovy * cos;
      proj.radius = 2; // balles plus petites
      gameState.projectiles.set(proj.id, proj);
      events.push({ type: 'shot_fired', playerId: p.id, weaponType: 'minigun' });
    }
  }
}

function applyGravwell(events) {
  for (const p of gameState.players.values()) {
    if (!p.alive || p.effects.gravwell <= 0) continue;
    const gx = p.gravwellX, gy = p.gravwellY;
    for (const a of gameState.asteroids.values()) {
      const dx = gx - a.x, dy = gy - a.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < GRAVWELL_RADIUS * GRAVWELL_RADIUS && d2 > 100) {
        const d = Math.sqrt(d2);
        const force = GRAVWELL_FORCE / d * DT;
        a.vx += (dx / d) * force;
        a.vy += (dy / d) * force;
        a.deflectedBy = p.id; // les kills comptent pour le joueur
      }
    }
    // Aussi aspirer les pickups
    for (const pk of gameState.pickups.values()) {
      const dx = gx - pk.x, dy = gy - pk.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < GRAVWELL_RADIUS * GRAVWELL_RADIUS && d2 > 100) {
        pk.x += dx * 0.03;
        pk.y += dy * 0.03;
      }
    }
  }
}

// ─── Ennemis IA ──────────────────────────────────────────────────────────────

function spawnEnemy() {
  const id = 'enemy_' + (gameState.nextEnemyId++);
  const side = Math.floor(Math.random() * 4);
  const hard = gameState.settings.difficulty === 'hardcore';
  let x, y;
  if (side === 0) { x = -HALF + 50; y = (Math.random() - 0.5) * WORLD; }
  else if (side === 1) { x = HALF - 50; y = (Math.random() - 0.5) * WORLD; }
  else if (side === 2) { y = -HALF + 50; x = (Math.random() - 0.5) * WORLD; }
  else { y = HALF - 50; x = (Math.random() - 0.5) * WORLD; }

  const enemy = {
    id, x, y, vx: 0, vy: 0, angle: Math.random() * Math.PI * 2,
    hp: hard ? ENEMY_HP_HARD : ENEMY_HP,
    maxHp: hard ? ENEMY_HP_HARD : ENEMY_HP,
    radius: ENEMY_RADIUS,
    speed: hard ? ENEMY_SPEED_HARD : ENEMY_SPEED,
    shootCd: 0,
    maxShootCd: hard ? ENEMY_SHOOT_CD_HARD : ENEMY_SHOOT_CD,
    alive: true,
    respawnTimer: 0,
    patrolAngle: Math.random() * Math.PI * 2,
    patrolTimer: 60 + Math.floor(Math.random() * 60),
  };
  gameState.enemies.set(id, enemy);
  return enemy;
}

function integrateEnemy(e, events) {
  if (!e.alive) {
    if (e.respawnTimer > 0) {
      e.respawnTimer--;
      if (e.respawnTimer <= 0) {
        // Respawn
        e.alive = true;
        e.hp = e.maxHp;
        const side = Math.floor(Math.random() * 4);
        if (side === 0) { e.x = -HALF + 50; e.y = (Math.random() - 0.5) * WORLD; }
        else if (side === 1) { e.x = HALF - 50; e.y = (Math.random() - 0.5) * WORLD; }
        else if (side === 2) { e.y = -HALF + 50; e.x = (Math.random() - 0.5) * WORLD; }
        else { e.y = HALF - 50; e.x = (Math.random() - 0.5) * WORLD; }
      }
    }
    return;
  }

  // Trouver le joueur vivant le plus proche
  let closestPlayer = null, closestDist = Infinity;
  for (const p of gameState.players.values()) {
    if (!p.alive) continue;
    const dx = p.x - e.x, dy = p.y - e.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < closestDist) { closestDist = d; closestPlayer = p; }
  }

  if (closestPlayer && closestDist < ENEMY_DETECT_RANGE) {
    // Chase mode : tourner vers le joueur et avancer
    const targetAngle = Math.atan2(closestPlayer.y - e.y, closestPlayer.x - e.x);
    let da = targetAngle - e.angle;
    while (da > Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    e.angle += Math.sign(da) * Math.min(Math.abs(da), 3 * DT);

    e.vx += Math.cos(e.angle) * e.speed * DT * 2;
    e.vy += Math.sin(e.angle) * e.speed * DT * 2;

    // Tir
    if (e.shootCd <= 0 && closestDist < 250) {
      const projId = 'ep_' + (gameState.nextProjId++);
      const bx = e.x + Math.cos(e.angle) * 16;
      const by = e.y + Math.sin(e.angle) * 16;
      gameState.projectiles.set(projId, {
        id: projId, type: 'bullet', ownerId: e.id, ownerColor: '#ff3333',
        x: bx, y: by,
        vx: Math.cos(e.angle) * BULLET_SPEED * 0.7,
        vy: Math.sin(e.angle) * BULLET_SPEED * 0.7,
        radius: BULLET_RADIUS, isEnemy: true,
      });
      e.shootCd = e.maxShootCd;
    }
  } else {
    // Patrol mode
    e.patrolTimer--;
    if (e.patrolTimer <= 0) {
      e.patrolAngle = Math.random() * Math.PI * 2;
      e.patrolTimer = 60 + Math.floor(Math.random() * 60);
    }
    let da = e.patrolAngle - e.angle;
    while (da > Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    e.angle += Math.sign(da) * Math.min(Math.abs(da), 2 * DT);
    e.vx += Math.cos(e.angle) * e.speed * DT;
    e.vy += Math.sin(e.angle) * e.speed * DT;
  }

  if (e.shootCd > 0) e.shootCd--;

  // Drag + clamp speed
  const spd = Math.sqrt(e.vx * e.vx + e.vy * e.vy);
  if (spd > e.speed) { e.vx *= e.speed / spd; e.vy *= e.speed / spd; }
  e.vx *= 0.96; e.vy *= 0.96;
  e.x += e.vx * DT; e.y += e.vy * DT;

  // Wrap
  if (e.x < -HALF) e.x += WORLD; if (e.x > HALF) e.x -= WORLD;
  if (e.y < -HALF) e.y += WORLD; if (e.y > HALF) e.y -= WORLD;
}

function checkEnemyPlayerCollisions(events) {
  for (const e of gameState.enemies.values()) {
    if (!e.alive) continue;
    for (const p of gameState.players.values()) {
      if (!p.alive || p.respawnTimer > 0 || p.effects.intangible > 0) continue;
      const dx = p.x - e.x, dy = p.y - e.y;
      if (dx * dx + dy * dy < (ENEMY_RADIUS + PLAYER_RADIUS) ** 2) {
        p.hp--;
        if (p.hp <= 0) {
          killPlayer(p);
          events.push({ type: 'player_killed', x: p.x, y: p.y, victimId: p.id, killerId: e.id, livesLeft: p.lives });
        } else {
          events.push({ type: 'player_hit', x: p.x, y: p.y, victimId: p.id, byId: e.id });
        }
        // Knockback
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        p.vx += (dx / d) * 120; p.vy += (dy / d) * 120;
      }
    }
  }
}

// ─── Boss ────────────────────────────────────────────────────────────────────

function spawnBoss() {
  const playerCount = [...gameState.players.values()].filter(p => p.alive).length || 1;
  gameState.boss = {
    id: 'boss', x: 0, y: 0, vx: 0, vy: 0, angle: 0,
    hp: 60 + 30 * playerCount,
    maxHp: 60 + 30 * playerCount,
    radius: BOSS_RADIUS, speed: BOSS_SPEED,
    shootCd: 0, specialCd: BOSS_SPECIAL_CD,
    phase: 0, phaseTicks: 0,
    alive: true,
  };
  // Supprimer les astéroïdes pour le combat de boss
  gameState.asteroids.clear();
}

function integrateBoss(events) {
  const b = gameState.boss;
  if (!b || !b.alive) return;

  b.phaseTicks++;
  if (b.phaseTicks >= BOSS_PHASE_TICKS) {
    b.phase = (b.phase + 1) % 3;
    b.phaseTicks = 0;
  }

  // Trouver le joueur vivant le plus proche
  let target = null, tDist = Infinity;
  for (const p of gameState.players.values()) {
    if (!p.alive) continue;
    const d = Math.sqrt((p.x - b.x) ** 2 + (p.y - b.y) ** 2);
    if (d < tDist) { tDist = d; target = p; }
  }
  if (!target) return;

  const targetAngle = Math.atan2(target.y - b.y, target.x - b.x);

  if (b.phase === 0) {
    // Chase : suit le joueur, tire en rafale
    let da = targetAngle - b.angle;
    while (da > Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    b.angle += Math.sign(da) * Math.min(Math.abs(da), 2.5 * DT);
    b.vx += Math.cos(b.angle) * b.speed * DT * 2;
    b.vy += Math.sin(b.angle) * b.speed * DT * 2;

    if (b.shootCd <= 0) {
      const projId = 'bp_' + (gameState.nextProjId++);
      gameState.projectiles.set(projId, {
        id: projId, type: 'bullet', ownerId: 'boss', ownerColor: '#ff0000',
        x: b.x + Math.cos(b.angle) * 50,
        y: b.y + Math.sin(b.angle) * 50,
        vx: Math.cos(b.angle) * BULLET_SPEED * 0.6,
        vy: Math.sin(b.angle) * BULLET_SPEED * 0.6,
        radius: 5, isEnemy: true,
      });
      b.shootCd = BOSS_SHOOT_CD;
    }
  } else if (b.phase === 1) {
    // Spiral : reste au centre, tire en spirale
    b.vx *= 0.9; b.vy *= 0.9;
    b.x += (0 - b.x) * 0.02; b.y += (0 - b.y) * 0.02; // drift vers centre
    b.angle += 3 * DT; // tourne

    if (b.shootCd <= 0) {
      for (let i = 0; i < 3; i++) {
        const a = b.angle + (Math.PI * 2 / 3) * i;
        const projId = 'bp_' + (gameState.nextProjId++);
        gameState.projectiles.set(projId, {
          id: projId, type: 'bullet', ownerId: 'boss', ownerColor: '#ff0000',
          x: b.x + Math.cos(a) * 50, y: b.y + Math.sin(a) * 50,
          vx: Math.cos(a) * BULLET_SPEED * 0.45,
          vy: Math.sin(a) * BULLET_SPEED * 0.45,
          radius: 4, isEnemy: true,
        });
      }
      b.shootCd = BOSS_SHOOT_CD + 4;
    }
  } else {
    // Charge : fonce vers le joueur
    b.angle = targetAngle;
    b.vx += Math.cos(b.angle) * b.speed * DT * 5;
    b.vy += Math.sin(b.angle) * b.speed * DT * 5;
  }

  if (b.shootCd > 0) b.shootCd--;

  // Attaque spéciale : spawn astéroïdes
  b.specialCd--;
  if (b.specialCd <= 0) {
    for (let i = 0; i < 5; i++) {
      const a = spawnAsteroid();
      a.x = b.x + Math.cos(Math.PI * 2 * i / 5) * 80;
      a.y = b.y + Math.sin(Math.PI * 2 * i / 5) * 80;
      gameState.asteroids.set(a.id, a);
    }
    events.push({ type: 'boss_special', x: b.x, y: b.y });
    b.specialCd = BOSS_SPECIAL_CD;
  }

  // Drag + clamp
  const spd = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
  const maxSpd = b.phase === 2 ? 250 : 120;
  if (spd > maxSpd) { b.vx *= maxSpd / spd; b.vy *= maxSpd / spd; }
  b.vx *= 0.97; b.vy *= 0.97;
  b.x += b.vx * DT; b.y += b.vy * DT;

  // Clamp to world
  b.x = Math.max(-HALF + 20, Math.min(HALF - 20, b.x));
  b.y = Math.max(-HALF + 20, Math.min(HALF - 20, b.y));

  // Contact avec les joueurs
  for (const p of gameState.players.values()) {
    if (!p.alive || p.respawnTimer > 0 || p.effects.intangible > 0) continue;
    const dx = p.x - b.x, dy = p.y - b.y;
    if (dx * dx + dy * dy < (BOSS_RADIUS + PLAYER_RADIUS) ** 2) {
      p.hp -= BOSS_CONTACT_DAMAGE;
      if (p.hp <= 0) {
        killPlayer(p);
        events.push({ type: 'player_killed', x: p.x, y: p.y, victimId: p.id, killerId: 'boss', livesLeft: p.lives });
      } else {
        events.push({ type: 'player_hit', x: p.x, y: p.y, victimId: p.id, byId: 'boss' });
      }
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      p.vx += (dx / d) * 200; p.vy += (dy / d) * 200;
    }
  }
}

// ─── Shop & Wave System ──────────────────────────────────────────────────────

const DIFFICULTY_PRICE_MULT = { easy: 0.8, normal: 1, hardcore: 1.3 };

function generateShopItems(difficulty) {
  const items = [];
  const pool = [...SHOP_POOL];
  const mult = DIFFICULTY_PRICE_MULT[difficulty] || 1;
  const count = Math.min(5, pool.length);
  for (let i = 0; i < count; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    const item = pool.splice(idx, 1)[0];
    items.push({ slotId: i, ...item, price: Math.round(item.price * mult), bought: false });
  }
  return items;
}

function openShop(room) {
  gameState.wavePhase = 'shop';
  gameState.shopTimeout = SHOP_TIMEOUT_TICKS;
  gameState.playersReady = new Set();
  gameState.shopItems = new Map();
  const diff = gameState.settings.difficulty;
  for (const p of gameState.players.values()) {
    p.rerollCount = 0; // reset reroll count each shop
    const items = generateShopItems(diff);
    gameState.shopItems.set(p.id, items);
  }
  // Send per-player shop state
  for (const ws of room.wsSet) {
    if (ws.readyState !== 1) continue;
    const p = gameState.players.get(ws.playerId);
    if (!p) continue;
    const items = gameState.shopItems.get(p.id) || [];
    const rerollCost = REROLL_BASE_COST * (p.rerollCount + 1);
    const shipStats = {
      hp: p.hp, maxHp: p.maxHp, lives: p.lives,
      speedMult: p.speedMult, fireRateMult: p.fireRateMult,
      laser: p.effects.laser, missile: p.effects.missile,
      trishot: p.effects.trishot, minigun: p.effects.minigun,
    };
    const waveStats = { score: p.waveScore, crystals: p.waveCrystals, kills: p.waveKills };
    ws.send(JSON.stringify({ type: 'shop_open', items, balance: p.crystals, wave: gameState.wave, rerollCost, shipStats, waveStats }));
  }
}

function applyShopItem(player, itemId) {
  const item = SHOP_POOL.find(i => i.id === itemId);
  if (!item) return;
  switch (itemId) {
    case 'laser_ammo':   player.effects.laser += 8; break;
    case 'missile_ammo': player.effects.missile += 3; break;
    case 'trishot_ammo': player.effects.trishot += 30; break;
    case 'minigun_ammo': player.effects.minigun += 80; break;
    case 'max_hp_up':    player.maxHp++; player.hp = Math.min(player.hp + 1, player.maxHp); break;
    case 'extra_life':   player.lives++; break;
    case 'speed_up':     player.speedMult += 0.15; break;
    case 'fire_rate_up': player.fireRateMult += 0.2; break;
    case 'magnet_range': player.magnetRangeMult += 0.3; break;
    case 'drone_wave':   player.shopDrone = true; break;
    case 'shield_regen': player.hp = player.maxHp; break;
    case 'nuke_start':   player.shopNuke = true; break;
    case 'double_dmg':   player.doubleDmgWave = true; break;
    case 'auto_heal':    player.autoHealWave = true; break;
  }
}

function startNextWave(room) {
  gameState.wave++;
  const cfg = WAVE_CONFIG[gameState.settings.difficulty] || WAVE_CONFIG.normal;

  // Check if this is the boss wave
  if (gameState.wave >= cfg.bossWave) {
    gameState.wavePhase = 'boss';
    // Clear asteroids for boss fight
    gameState.asteroids.clear();
    gameState.pickups.clear();
    gameState.projectiles.clear();
    gameState.enemies.clear();
    spawnBoss();
    broadcastRoom(room, { type: 'wave_start', wave: gameState.wave, isBoss: true });
    return;
  }

  // Normal wave
  gameState.wavePhase = 'fighting';
  gameState.waveTimer = cfg.waveSec * 20; // convert seconds to ticks
  gameState.asteroids.clear();
  gameState.pickups.clear();
  gameState.projectiles.clear();
  gameState.enemies.clear();

  // Spawn initial asteroids gradually (staggered via queue)
  gameState.spawnQueue = [];
  const initAst = Math.min(5 + gameState.wave, 12);
  for (let i = 0; i < initAst; i++) {
    gameState.spawnQueue.push({ delay: i * 2 }); // 1 every 2 ticks = ~0.6s total
  }

  // Spawn enemies based on wave + difficulty
  if (gameState.wave >= cfg.enemyStartWave) {
    const count = 1 + Math.floor((gameState.wave - cfg.enemyStartWave) / 2);
    for (let i = 0; i < Math.min(count, 6); i++) spawnEnemy();
  }

  // Apply wave-start shop buffs
  for (const p of gameState.players.values()) {
    if (!p.alive && p.lives <= 0) continue; // permanently dead
    // Respawn dead players for new wave
    if (!p.alive && p.lives > 0) {
      p.alive = true;
      p.hp = p.maxHp;
      p.respawnTimer = 0;
      const angle = Math.random() * Math.PI * 2;
      p.x = Math.cos(angle) * 150;
      p.y = Math.sin(angle) * 150;
      p.vx = 0; p.vy = 0;
    }
    // Reset wave stats
    p.waveScore = 0; p.waveCrystals = 0; p.waveKills = 0;
    // Apply shop drone
    if (p.shopDrone) {
      p.effects.drone = cfg.waveSec * 20 + 100; // full wave + buffer
      p.shopDrone = false;
    }
    // Apply shop nuke (delayed 2s so asteroids have time to spawn)
    if (p.shopNuke === true) {
      p.shopNuke = 40; // 40 ticks = 2 seconds countdown
    }
    // Reset auto-heal timer
    p.autoHealTimer = 0;
  }

  broadcastRoom(room, { type: 'wave_start', wave: gameState.wave, isBoss: false });
}

function checkWinCondition() {
  // All dead = game over (priority)
  if (gameState.players.size > 0) {
    let allDead = true;
    for (const p of gameState.players.values()) {
      if (p.alive || p.respawnTimer > 0) { allDead = false; break; }
    }
    if (allDead) return 'alldead';
  }
  // Boss killed = victory
  if (gameState.boss && !gameState.boss.alive) return 'bosskilled';
  return false;
}

// ─── Boucle de jeu ────────────────────────────────────────────────────────────

function gameTick(room) {
  if (gameState.phase !== 'playing') return;
  const events = [];
  const wp = gameState.wavePhase;

  if (wp === 'fighting' || wp === 'boss') {
    // === EXISTING GAME LOGIC ===
    for (const p of gameState.players.values()) integratePlayer(p);

    // Border damage
    for (const p of gameState.players.values()) {
      if (!p.borderKill) continue;
      p.borderKill = false;
      if (!p.alive || p.respawnTimer > 0 || p.effects.intangible > 0) continue;
      p.hp--;
      events.push({ type: 'player_hit', x: p.x, y: p.y, victimId: p.id, byId: null });
      events.push({ type: 'border_zap', x: p.x, y: p.y });
      if (p.hp <= 0) {
        killPlayer(p);
        events.push({ type: 'player_killed', x: p.x, y: p.y, victimId: p.id, livesLeft: p.lives });
      } else {
        p.effects.intangible = 30;
      }
    }

    for (const p of gameState.players.values()) {
      if (p.comboTimer > 0) { p.comboTimer--; if (p.comboTimer <= 0) p.comboCount = 0; }
    }

    for (const [id, pk] of gameState.pickups) {
      if (pk.age !== undefined) pk.age++;
      else pk.age = 0;
      if (pk.age > PICKUP_LIFETIME) {
        gameState.pickups.delete(id);
        events.push({ type: 'pickup_despawn', id });
      }
    }

    processShots(events);
    integrateProjectiles(events);
    integrateDrones(events);
    integrateMinigun(events);
    applyGravwell(events);
    for (const a of gameState.asteroids.values()) integrateAsteroid(a);
    for (const [id, a] of gameState.asteroids) {
      if (a.expired) gameState.asteroids.delete(id);
    }
    checkAsteroidCollisions();
    checkAsteroidPlayerCollisions(events);
    applyMagnet();
    checkPlayerPickupCollisions(events);

    if (wp === 'fighting') {
      // Process spawn queue (gradual asteroid spawning)
      let spawned = 0;
      while (gameState.spawnQueue.length > 0 && spawned < 2) {
        const item = gameState.spawnQueue[0];
        if (item.delay > 0) { item.delay--; break; }
        gameState.spawnQueue.shift();
        const a = spawnAsteroid();
        gameState.asteroids.set(a.id, a);
        spawned++;
      }
      maintainAsteroids();

      // Enemies
      for (const e of gameState.enemies.values()) integrateEnemy(e, events);
      checkEnemyPlayerCollisions(events);

      // Nuke from shop (countdown, detonates after 2s)
      for (const p of gameState.players.values()) {
        if (typeof p.shopNuke === 'number' && p.shopNuke > 0) {
          p.shopNuke--;
          if (p.shopNuke === 0) {
            // Destroy all asteroids
            for (const a of gameState.asteroids.values()) {
              events.push({ type: 'asteroid_destroyed', x: a.x, y: a.y, radius: a.radius, playerId: p.id, crystals: a.crystalValue });
              p.score += a.crystalValue;
              p.crystals += Math.floor(a.crystalValue / 5);
            }
            gameState.asteroids.clear();
            events.push({ type: 'nuke_activated', x: 0, y: 0, playerId: p.id });
          }
        }
      }

      // Auto-heal
      for (const p of gameState.players.values()) {
        if (p.autoHealWave && p.alive && p.hp < p.maxHp) {
          p.autoHealTimer++;
          if (p.autoHealTimer >= 200) {
            p.hp = Math.min(p.hp + 1, p.maxHp);
            p.autoHealTimer = 0;
          }
        }
      }

      // Storm system (wave-scaled)
      const cfg = WAVE_CONFIG[gameState.settings.difficulty] || WAVE_CONFIG.normal;
      const stormInterval = Math.max(300, 600 - gameState.wave * 30);
      if (gameState.wave >= cfg.stormStartWave && gameState.tick > 0) {
        if (gameState.tick % stormInterval === stormInterval - 60) {
          gameState.stormDir = Math.floor(Math.random() * 4);
          events.push({ type: 'asteroid_storm_warning', dir: gameState.stormDir });
        }
        if (gameState.tick % stormInterval === 0) {
          const dir = gameState.stormDir ?? 0;
          const diffBonus = gameState.settings.difficulty === 'hardcore' ? 4 : gameState.settings.difficulty === 'normal' ? 2 : 0;
          const stormCount = 6 + diffBonus + gameState.wave + Math.floor(Math.random() * 3);
          for (let i = 0; i < stormCount; i++) {
            const sizes = [
              { radius: 32, hp: 3, crystal: 50, weight: 2 },
              { radius: 20, hp: 2, crystal: 25, weight: 4 },
              { radius: 10, hp: 1, crystal: 10, weight: 3 },
            ];
            const total = sizes.reduce((s, x) => s + x.weight, 0);
            let r = Math.random() * total, chosen = sizes[0];
            for (const s of sizes) { r -= s.weight; if (r <= 0) { chosen = s; break; } }
            let x, y, vx, vy;
            const spread = (Math.random() - 0.5) * WORLD * 0.8;
            const speed = 60 + Math.random() * 80;
            const drift = (Math.random() - 0.5) * 40;
            if (dir === 0) { x = -HALF - 20; y = spread; vx = speed; vy = drift; }
            else if (dir === 1) { x = HALF + 20; y = spread; vx = -speed; vy = drift; }
            else if (dir === 2) { x = spread; y = -HALF - 20; vx = drift; vy = speed; }
            else { x = spread; y = HALF + 20; vx = drift; vy = -speed; }
            const id = 'a' + (gameState.nextAsteroidId++);
            gameState.asteroids.set(id, {
              id, x, y, vx, vy,
              angle: Math.random() * Math.PI * 2,
              angularVel: (Math.random() - 0.5) * 3,
              radius: chosen.radius, hp: chosen.hp, maxHp: chosen.hp,
              crystalValue: chosen.crystal, loot: null, storm: true,
            });
          }
          events.push({ type: 'asteroid_storm', dir });
        }
      }

      // Wave timer
      gameState.waveTimer--;
      if (gameState.waveTimer <= 0) {
        // Wave complete -> intermission
        gameState.wavePhase = 'intermission';
        gameState.waveTimer = INTERMISSION_TICKS;
        events.push({ type: 'wave_complete', wave: gameState.wave });
      }
    }

    if (wp === 'boss') {
      for (const e of gameState.enemies.values()) integrateEnemy(e, events);
      checkEnemyPlayerCollisions(events);
      integrateBoss(events);
    }

  } else if (wp === 'intermission') {
    // Keep basic physics running so entities don't freeze/jitter
    for (const p of gameState.players.values()) integratePlayer(p);
    for (const a of gameState.asteroids.values()) integrateAsteroid(a);
    // Keep pickups bobbing
    for (const pk of gameState.pickups.values()) pk.age++;

    gameState.waveTimer--;
    if (gameState.waveTimer <= 0) {
      const cfg = WAVE_CONFIG[gameState.settings.difficulty] || WAVE_CONFIG.normal;
      if (gameState.wave + 1 >= cfg.bossWave) {
        startNextWave(room);
      } else {
        openShop(room);
      }
    }

  } else if (wp === 'shop') {
    gameState.shopTimeout--;
    // Check if all alive players are ready OR timeout
    let allReady = true;
    for (const p of gameState.players.values()) {
      if ((p.alive || p.lives > 0) && !gameState.playersReady.has(p.id)) {
        allReady = false;
        break;
      }
    }
    if (allReady || gameState.shopTimeout <= 0) {
      startNextWave(room);
    }
  }

  gameState.tick++;

  // Build & broadcast snapshot
  const snap = { type: 'snapshot', ...buildSnapshot(), events };
  for (const ws of room.wsSet) {
    if (ws.readyState !== 1) continue;
    const p = gameState.players.get(ws.playerId);
    const seq = p ? (p.lastInputSeq || 0) : 0;
    snap.lastInputSeq = seq;
    ws.send(JSON.stringify(snap));
  }

  // Win condition
  const winResult = checkWinCondition();
  if (winResult) endGame(room, winResult);
}

function buildSnapshot() {
  return {
    tick: gameState.tick,
    phase: gameState.phase,
    wave: gameState.wave,
    wavePhase: gameState.wavePhase,
    waveTimeLeft: Math.ceil(Math.max(0, gameState.waveTimer) / 20),
    bossWave: (WAVE_CONFIG[gameState.settings.difficulty] || WAVE_CONFIG.normal).bossWave,
    players: [...gameState.players.values()].map(p => ({
      id: p.id, name: p.name, color: p.color,
      x: p.x, y: p.y, angle: p.angle, vx: p.vx, vy: p.vy,
      hp: p.hp, lives: p.lives, score: p.score, alive: p.alive,
      crystals: p.crystals,
      respawnTimer: p.respawnTimer, thrust: p.thrust,
      boosted: p.effects.boost > 0,
      boostTicks: p.effects.boost,
      rapid: p.effects.rapid > 0,
      rapidTicks: p.effects.rapid,
      laser: p.effects.laser,
      missile: p.effects.missile,
      trishot: p.effects.trishot,
      drone: p.effects.drone,
      droneAngle: p.droneAngle,
      magnet: p.effects.magnet,
      intangible: p.effects.intangible,
      minigun: p.effects.minigun,
      gravwell: p.effects.gravwell,
      gravwellX: p.gravwellX, gravwellY: p.gravwellY,
      dashCooldown: p.dashCooldown,
      killStreak: p.killStreak,
      combo: p.comboCount,
    })),
    asteroids: [...gameState.asteroids.values()].map(a => ({
      id: a.id, x: a.x, y: a.y, vx: a.vx, vy: a.vy,
      angle: a.angle, radius: a.radius, hp: a.hp, maxHp: a.maxHp,
      deflectedBy: a.deflectedBy,
      lootColor: a.loot?.color || null,
    })),
    pickups: [...gameState.pickups.values()].map(pk => ({
      id: pk.id, type: pk.type, rarity: pk.rarity || null, x: pk.x, y: pk.y,
    })),
    projectiles: [...gameState.projectiles.values()].map(pr => ({
      id: pr.id, type: pr.type, x: pr.x, y: pr.y,
      vx: pr.vx, vy: pr.vy, color: pr.ownerColor,
    })),
    enemies: [...gameState.enemies.values()].map(e => ({
      id: e.id, x: e.x, y: e.y, angle: e.angle,
      hp: e.hp, maxHp: e.maxHp, alive: e.alive,
    })),
    boss: gameState.boss ? {
      x: gameState.boss.x, y: gameState.boss.y, angle: gameState.boss.angle,
      hp: gameState.boss.hp, maxHp: gameState.boss.maxHp, alive: gameState.boss.alive,
      phase: gameState.boss.phase,
    } : null,
  };
}

function startGame(room, settings) {
  if (settings) {
    if (['easy', 'normal', 'hardcore'].includes(settings.difficulty)) gameState.settings.difficulty = settings.difficulty;
  }
  const cfg = WAVE_CONFIG[gameState.settings.difficulty] || WAVE_CONFIG.normal;
  console.log(`🚀 [${room.code}] Partie en cours ! (${gameState.settings.difficulty}, boss wave ${cfg.bossWave})`);
  gameState.phase = 'playing';
  gameState.startTime = Date.now();
  gameState.wave = 1;
  gameState.wavePhase = 'fighting';
  gameState.waveTimer = cfg.waveSec * 20;
  gameState.asteroids.clear();
  gameState.pickups.clear();
  gameState.projectiles.clear();
  gameState.enemies.clear();
  gameState.boss = null;
  gameState.tick = 0;
  gameState.shopItems = new Map();
  gameState.playersReady = new Set();

  let idx = 0;
  for (const p of gameState.players.values()) {
    const fresh = createPlayer(p.id, p.name, idx++);
    Object.assign(p, fresh);
  }

  for (let i = 0; i < 3; i++) {
    const a = spawnAsteroid();
    gameState.asteroids.set(a.id, a);
  }

  // Spawn enemies for wave 1 only if difficulty requires it
  if (1 >= cfg.enemyStartWave) {
    spawnEnemy();
  }

  broadcastRoom(room, { type: 'start', difficulty: gameState.settings.difficulty, bossWave: cfg.bossWave, wave: 1 });
}

function endGame(room, reason) {
  gameState.phase = 'gameover';
  const scores = [...gameState.players.values()]
    .map(p => ({ id: p.id, name: p.name, score: p.score, color: p.color }))
    .sort((a, b) => b.score - a.score);
  // Sauvegarder les highscores
  const diff = gameState.settings?.difficulty || 'normal';
  const cfg = WAVE_CONFIG[diff] || WAVE_CONFIG.normal;
  for (const s of scores) {
    if (s.score > 0) addHighscore(s.name, s.score, diff, cfg.bossWave);
  }
  broadcastRoom(room, { type: 'gameover', scores, reason: reason || 'time' });
  console.log(`🏆 [${room.code}] Fin (${reason}) :`, scores.map(s => `${s.name}:${s.score}`).join(', '));
  if (room.resetLobbyTimer) clearTimeout(room.resetLobbyTimer);
  room.resetLobbyTimer = setTimeout(() => withRoom(room, () => resetLobby(room)), 8000);
}

function resetLobby(room) {
  gameState.phase = 'lobby';
  gameState.asteroids.clear();
  gameState.pickups.clear();
  gameState.projectiles.clear();
  gameState.enemies.clear();
  gameState.boss = null;
  gameState.tick = 0;
  gameState.wave = 1;
  gameState.wavePhase = 'fighting';
  gameState.waveTimer = 0;
  gameState.shopItems = new Map();
  gameState.playersReady = new Set();
  for (const p of gameState.players.values()) {
    p.hp = 4; p.lives = 2; p.score = 0; p.alive = true; p.respawnTimer = 0;
    p.effects = { boost: 0, rapid: 0, laser: 0, missile: 0, trishot: 0, drone: 0, magnet: 0, intangible: 0, minigun: 0, gravwell: 0 };
    p.droneAngle = 0; p.droneShootCd = 0; p.gravwellX = 0; p.gravwellY = 0;
    p.killStreak = 0; p.comboTimer = 0; p.comboCount = 0;
    p.crystals = 0; p.maxHp = 4; p.speedMult = 1; p.fireRateMult = 1;
    p.magnetRangeMult = 1; p.shopDrone = false; p.shopNuke = false;
    p.doubleDmgWave = false; p.autoHealWave = false; p.autoHealTimer = 0;
  }
  broadcastLobbyUpdate(room);
}

// ─── WebSocket ────────────────────────────────────────────────────────────────

Bun.serve({
  port: PORT,
  fetch(req, server) {
    if (server.upgrade(req)) return;

    // Servir les fichiers statiques du client
    const url = new URL(req.url);
    let path = url.pathname === '/' ? '/index.html' : url.pathname;
    const clientDir = import.meta.dir + '/../client';
    const filePath = clientDir + path;

    const mimeTypes = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav' };
    const ext = path.substring(path.lastIndexOf('.'));
    const contentType = mimeTypes[ext] || 'application/octet-stream';

    const file = Bun.file(filePath);
    return new Response(file, { headers: { 'Content-Type': contentType } });
  },
  websocket: {
    open(ws) {
      allWs.add(ws);
      broadcastPlayerCount();
    },

    message(ws, rawMsg) {
      let msg;
      try { msg = JSON.parse(rawMsg); } catch { return; }

      // ── Créer une salle ───────────────────────────────────────────────────
      if (msg.type === 'create') {
        if (ws.room) return; // déjà dans une salle
        const code = generateCode();
        const room = {
          code,
          gameState: createRoomState(),
          wsSet: new Set(),
          hostId: null,
          interval: null,
        };
        rooms.set(code, room);

        const id = uid();
        ws.playerId = id;
        ws.room = room;
        room.wsSet.add(ws);

        const player = createPlayer(id, msg.name || 'P1', 0);
        room.gameState.players.set(id, player);
        room.hostId = id;

        room.interval = setInterval(() => withRoom(room, () => gameTick(room)), TICK_MS);

        ws.send(JSON.stringify({ type: 'room_created', code }));
        ws.send(JSON.stringify({ type: 'assign', id, color: player.color, playerIndex: 0 }));
        broadcastLobbyUpdate(room);
        console.log(`🏠 [${code}] Créée par ${player.name}`);
      }

      // ── Rejoindre une salle ───────────────────────────────────────────────
      if (msg.type === 'join_room') {
        if (ws.room) return;
        const code = (msg.code || '').toUpperCase().trim();
        const room = rooms.get(code);
        if (!room) {
          ws.send(JSON.stringify({ type: 'error', message: 'Salle introuvable' }));
          return;
        }
        if (room.gameState.players.size >= 4) {
          ws.send(JSON.stringify({ type: 'error', message: 'Salle pleine (4/4)' }));
          return;
        }
        if (room.gameState.phase === 'playing') {
          ws.send(JSON.stringify({ type: 'error', message: 'Partie déjà en cours' }));
          return;
        }

        const id = uid();
        ws.playerId = id;
        ws.room = room;
        room.wsSet.add(ws);

        const idx = room.gameState.players.size;
        const player = createPlayer(id, msg.name || `P${idx + 1}`, idx);
        room.gameState.players.set(id, player);

        ws.send(JSON.stringify({ type: 'assign', id, color: player.color, playerIndex: idx }));
        broadcastLobbyUpdate(room);
        console.log(`✅ [${code}] ${player.name} rejoint. ${room.gameState.players.size} joueur(s).`);
      }

      // ── Lancer la partie (host uniquement) ───────────────────────────────
      if (msg.type === 'start_game') {
        const room = ws.room;
        if (!room) return;
        if (ws.playerId !== room.hostId) return;
        if (room.gameState.phase !== 'lobby') return;
        // Cancel any pending lobby reset timer (prevents reset mid-game after quick restart)
        if (room.resetLobbyTimer) { clearTimeout(room.resetLobbyTimer); room.resetLobbyTimer = null; }
        withRoom(room, () => startGame(room, { difficulty: msg.difficulty }));
      }

      // ── Input en jeu ──────────────────────────────────────────────────────
      if (msg.type === 'input') {
        const room = ws.room;
        if (!room) return;
        const p = room.gameState.players.get(ws.playerId);
        if (!p) return;
        if (msg.seq != null) p.lastInputSeq = msg.seq;
        const k = msg.keys || {};
        p.thrust = !!k.thrust;
        p.left   = !!k.left;
        p.right  = !!k.right;
        p.shoot  = !!k.shoot;
        if (k.selectedWeapon) p.selectedWeapon = k.selectedWeapon;
        // Dash (clic droit) — boost instantané dans la direction visée
        if (k.dash && p.alive && p.respawnTimer <= 0 && !p.dashCooldown) {
          const dashSpeed = 350;
          p.vx += Math.cos(p.angle) * dashSpeed;
          p.vy += Math.sin(p.angle) * dashSpeed;
          p.dashCooldown = 40; // 2s cooldown
        }
      }

      // ── Highscores ──────────────────────────────────────────────────────
      if (msg.type === 'get_highscores') {
        ws.send(JSON.stringify({ type: 'highscores', data: loadHighscores() }));
      }

      // ── Buy shop item ──────────────────────────────────────────────────
      if (msg.type === 'buy_item') {
        const room = ws.room;
        if (!room) return;
        if (room.gameState.wavePhase !== 'shop') return;
        const p = room.gameState.players.get(ws.playerId);
        if (!p) return;
        const playerShop = room.gameState.shopItems.get(ws.playerId);
        if (!playerShop) return;
        const slot = playerShop.find(s => s.slotId === msg.slotId && !s.bought);
        if (!slot || p.crystals < slot.price) return;
        p.crystals -= slot.price;
        slot.bought = true;
        withRoom(room, () => applyShopItem(p, slot.id));
        ws.send(JSON.stringify({ type: 'buy_confirm', slotId: msg.slotId, newBalance: p.crystals }));
      }

      // ── Player ready (shop) ────────────────────────────────────────────
      if (msg.type === 'player_ready') {
        const room = ws.room;
        if (!room) return;
        if (room.gameState.wavePhase !== 'shop') return;
        room.gameState.playersReady.add(ws.playerId);
        broadcastRoom(room, { type: 'player_ready_update', ready: [...room.gameState.playersReady] });
      }

      // ── Reroll shop ──────────────────────────────────────────────────────
      if (msg.type === 'reroll_shop') {
        const room = ws.room;
        if (!room) return;
        if (room.gameState.wavePhase !== 'shop') return;
        const p = room.gameState.players.get(ws.playerId);
        if (!p) return;
        const cost = REROLL_BASE_COST * (p.rerollCount + 1);
        if (p.crystals < cost) return;
        p.crystals -= cost;
        p.rerollCount++;
        const diff = room.gameState.settings.difficulty;
        const items = generateShopItems(diff);
        room.gameState.shopItems.set(p.id, items);
        const nextCost = REROLL_BASE_COST * (p.rerollCount + 1);
        ws.send(JSON.stringify({ type: 'shop_open', items, balance: p.crystals, wave: room.gameState.wave, rerollCost: nextCost }));
      }

      // ── Quitter la salle (retour menu) ──────────────────────────────────
      if (msg.type === 'leave_room') {
        const room = ws.room;
        if (!room) return;
        const id = ws.playerId;
        const p = room.gameState.players.get(id);
        if (p) console.log(`🚪 [${room.code}] ${p.name} a quitté.`);
        room.gameState.players.delete(id);
        room.wsSet.delete(ws);
        ws.room = null;
        ws.playerId = null;
        if (room.gameState.players.size === 0) {
          if (room.interval) clearInterval(room.interval);
          rooms.delete(room.code);
          console.log(`🗑️  [${room.code}] Salle supprimée (vide).`);
        } else {
          if (id === room.hostId) {
            const newHost = room.gameState.players.values().next().value;
            room.hostId = newHost.id;
            console.log(`👑 [${room.code}] Nouveau host : ${newHost.name}`);
          }
          broadcastLobbyUpdate(room);
        }
        return;
      }

      // ── Rejouer (host uniquement, après gameover) ─────────────────────────
      if (msg.type === 'restart') {
        const room = ws.room;
        if (!room) return;
        if (ws.playerId !== room.hostId) return;
        if (room.gameState.phase !== 'gameover') return;
        withRoom(room, () => resetLobby(room));
      }
    },

    close(ws) {
      allWs.delete(ws);
      broadcastPlayerCount();
      const room = ws.room;
      if (!room) return;

      const id = ws.playerId;
      const p = room.gameState.players.get(id);
      if (p) console.log(`❌ [${room.code}] ${p.name} déconnecté.`);

      room.gameState.players.delete(id);
      room.wsSet.delete(ws);

      if (room.gameState.players.size === 0) {
        // Salle vide → supprimer
        if (room.interval) clearInterval(room.interval);
        rooms.delete(room.code);
        console.log(`🗑️  [${room.code}] Salle supprimée (vide).`);
        return;
      }

      // Promouvoir un nouveau host si l'ancien est parti
      if (id === room.hostId) {
        const newHost = room.gameState.players.values().next().value;
        room.hostId = newHost.id;
        console.log(`👑 [${room.code}] Nouveau host : ${newHost.name}`);
      }

      broadcastLobbyUpdate(room);
    },
  },
});

console.log(`🌌 Asteroid Blitz sur ws://localhost:${PORT}`);
console.log(`   Ouvre client/index.html dans 1-4 onglets !`);
