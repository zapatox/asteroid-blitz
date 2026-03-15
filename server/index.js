// Asteroid Blitz — Serveur autoritaire Bun WebSockets (multi-salles)
// Lancer : bun run server/index.js

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
const WIN_SCORE = 800;
const GAME_DURATION = 300;
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
const MISSILE_AOE = 65;
const KNOCKBACK_BULLET = 90;
const KNOCKBACK_MISSILE = 200;
const AST_BOUNCE = 0.7;

// Nouveaux items
const EFFECT_TICKS_TRISHOT = 100;    // 5s
const EFFECT_TICKS_DRONE = 300;      // 15s
const EFFECT_TICKS_MAGNET = 300;     // 15s
const EFFECT_TICKS_INTANGIBLE = 80;  // 4s
const EFFECT_TICKS_MINIGUN = 80;     // 4s de carnage
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

const LOOT_TABLE = {
  common:    [{ type: 'crystal', weight: 3 }, { type: 'shield', weight: 3 }, { type: 'boost', weight: 2 }, { type: 'rapid', weight: 2 }],
  rare:      [{ type: 'trishot', weight: 3 }, { type: 'laser', weight: 2 }, { type: 'missile', weight: 2 }, { type: 'minigun', weight: 2 }],
  epic:      [{ type: 'drone', weight: 2 }, { type: 'missile', weight: 2 }, { type: 'gravwell', weight: 2 }, { type: 'minigun', weight: 1 }],
  legendary: [{ type: 'nuke', weight: 2 }, { type: 'magnet', weight: 2 }, { type: 'intangible', weight: 1 }],
};

const PLAYER_COLORS = ['#00ffff', '#ff00ff', '#ffff00', '#ff6600'];
const DT = TICK_MS / 1000;

// ─── Multi-salles ─────────────────────────────────────────────────────────────

// JS est single-threaded : on swape ce pointeur avant chaque appel de logique de jeu.
// Toutes les fonctions métier lisent/écrivent gameState sans savoir quelle salle est active.
let gameState = null;

const rooms = new Map(); // code → Room

function createRoomState() {
  return {
    phase: 'lobby',
    tick: 0,
    startTime: 0,
    players: new Map(),
    asteroids: new Map(),
    pickups: new Map(),
    projectiles: new Map(),
    nextAsteroidId: 0,
    nextPickupId: 0,
    nextProjId: 0,
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
    hp: 3,
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
  };
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
  if (!p.alive) return;
  if (p.respawnTimer > 0) {
    p.respawnTimer--;
    if (p.respawnTimer === 0) {
      const spawnAngle = Math.random() * Math.PI * 2;
      p.x  = Math.cos(spawnAngle) * 180;
      p.y  = Math.sin(spawnAngle) * 180;
      p.vx = 0;
      p.vy = 0;
      p.angle = spawnAngle + Math.PI;
    }
    return;
  }

  if (p.effects.boost  > 0) p.effects.boost--;
  if (p.effects.rapid  > 0) p.effects.rapid--;
  if (p.effects.trishot > 0) p.effects.trishot--;
  if (p.effects.drone  > 0) p.effects.drone--;
  if (p.effects.magnet > 0) p.effects.magnet--;
  if (p.effects.intangible > 0) p.effects.intangible--;
  if (p.effects.minigun > 0) p.effects.minigun--;
  if (p.effects.gravwell > 0) p.effects.gravwell--;
  if (p.dashCooldown > 0) p.dashCooldown--;
  // laser et missile = ammo (nombre de tirs), pas de tick decrement

  if (p.left)  p.angle += TURN_SPEED * DT;
  if (p.right) p.angle -= TURN_SPEED * DT;

  if (p.thrust) {
    const mult = p.effects.boost > 0 ? 2.2 : 1.0;
    p.vx += Math.cos(p.angle) * THRUST_FORCE * mult * DT;
    p.vy += Math.sin(p.angle) * THRUST_FORCE * mult * DT;
  }

  p.vx *= DRAG;
  p.vy *= DRAG;

  const spd = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
  if (spd > MAX_SPEED) { p.vx = (p.vx / spd) * MAX_SPEED; p.vy = (p.vy / spd) * MAX_SPEED; }

  p.x += p.vx * DT;
  p.y += p.vy * DT;
  // Bordure électrique : toucher le bord = mort
  const BORDER_MARGIN = HALF - 5;
  if (Math.abs(p.x) > BORDER_MARGIN || Math.abs(p.y) > BORDER_MARGIN) {
    p.x = clamp(p.x, -HALF, HALF);
    p.y = clamp(p.y, -HALF, HALF);
    p.borderKill = true; // flag pour gameTick
  }

  if (p.shootCooldown > 0) p.shootCooldown--;
}

function integrateAsteroid(a) {
  a.angle += a.angularVel * DT;
  a.x = wrap(a.x + a.vx * DT, HALF);
  a.y = wrap(a.y + a.vy * DT, HALF);
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
  if (forceDestroy || --a.hp <= 0) {
    const creditId = a.deflectedBy ?? p.id;
    const scorer = gameState.players.get(creditId) ?? p;
    scorer.score += a.crystalValue;
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
    if (impactVx !== undefined) {
      const impLen = Math.sqrt(impactVx * impactVx + impactVy * impactVy) || 1;
      const awayX = a.x - p.x, awayY = a.y - p.y;
      const awayLen = Math.sqrt(awayX * awayX + awayY * awayY) || 1;
      a.vx = (impactVx / impLen * 0.7 + awayX / awayLen * 0.3) * kb;
      a.vy = (impactVy / impLen * 0.7 + awayY / awayLen * 0.3) * kb;
    } else {
      const awayX = a.x - p.x, awayY = a.y - p.y;
      const awayLen = Math.sqrt(awayX * awayX + awayY * awayY) || 1;
      a.vx = (awayX / awayLen) * Math.max(Math.sqrt(a.vx ** 2 + a.vy ** 2) * 1.6, 80);
      a.vy = (awayY / awayLen) * Math.max(Math.sqrt(a.vx ** 2 + a.vy ** 2) * 1.6, 80);
    }
    a.deflectedBy = p.id;
    events.push({ type: 'deflect', id: a.id, x: a.x, y: a.y, byId: p.id });
    return false;
  }
}

function processShots(events) {
  for (const p of gameState.players.values()) {
    if (!p.alive || p.respawnTimer > 0) continue;
    const shoot = p.shoot && !p.prevShoot && p.shootCooldown === 0;
    p.prevShoot = p.shoot;
    if (!shoot) continue;

    // Arme sélectionnée par le joueur (scroll inventaire), fallback bullet
    let weaponType = 'bullet';
    if (p.selectedWeapon === 'laser' && p.effects.laser > 0) weaponType = 'laser';
    else if (p.selectedWeapon === 'missile' && p.effects.missile > 0) weaponType = 'missile';

    const cooldown = p.effects.rapid > 0 ? Math.ceil(SHOOT_COOLDOWN / 2) : SHOOT_COOLDOWN;
    p.shootCooldown = cooldown;

    if (weaponType === 'bullet' || weaponType === 'missile') {
      if (weaponType === 'missile') p.effects.missile--;
      // Triple-shot : 3 balles en éventail
      if (weaponType === 'bullet' && p.effects.trishot > 0) {
        for (const offset of [-0.26, 0, 0.26]) { // ±15°
          const proj = createProjectile(p, 'bullet');
          const cos = Math.cos(offset), sin = Math.sin(offset);
          const ovx = proj.vx, ovy = proj.vy;
          proj.vx = ovx * cos - ovy * sin;
          proj.vy = ovx * sin + ovy * cos;
          gameState.projectiles.set(proj.id, proj);
        }
      } else {
        const proj = createProjectile(p, weaponType);
        gameState.projectiles.set(proj.id, proj);
      }
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
    if (!owner) { gameState.projectiles.delete(proj.id); continue; }

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
        // Missile AOE : aussi blesser les joueurs (sauf tireur)
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
              target.alive = false; target.hp = 0;
              target.respawnTimer = RESPAWN_TICKS;
              owner.score += 75;
              events.push({ type: 'player_killed', victimId: target.id, killerId: proj.ownerId, x: target.x, y: target.y, pts: 115 });
            } else {
              events.push({ type: 'player_hit', victimId: target.id, byId: proj.ownerId, x: target.x, y: target.y, pts: 40 });
            }
          }
        }
        events.push({ type: 'missile_hit', x: hx, y: hy });
        gameState.projectiles.delete(proj.id);
        deleted = true;
      }
    }

    // Collision avec les autres joueurs (PvP)
    if (!deleted && gameState.projectiles.has(proj.id)) {
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
            target.alive = false; target.hp = 0;
            target.respawnTimer = RESPAWN_TICKS;
            target.killStreak = 0;
            owner.killStreak++;
            const killBonus = 75 + (owner.killStreak >= 5 ? 50 : owner.killStreak >= 3 ? 25 : 0);
            owner.score += killBonus;
            events.push({ type: 'player_killed', victimId: target.id, killerId: proj.ownerId, x: target.x, y: target.y, pts: hitPts + killBonus, streak: owner.killStreak, combo });
          } else {
            events.push({ type: 'player_hit', victimId: target.id, byId: proj.ownerId, x: target.x, y: target.y, pts: hitPts, combo });
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
        p.respawnTimer = RESPAWN_TICKS;

        events.push({ type: 'player_hit', x: p.x, y: p.y, victimId: p.id, byId: a.deflectedBy });

        if (a.deflectedBy) {
          const scorer = gameState.players.get(a.deflectedBy);
          if (scorer && scorer.id !== p.id) scorer.score += 50;
        }

        const children = splitAsteroid(a);
        for (const c of children) gameState.asteroids.set(c.id, c);
        gameState.asteroids.delete(a.id);

        if (p.hp <= 0) {
          p.alive = false;
          p.hp = 0;
          events.push({ type: 'player_killed', x: p.x, y: p.y, victimId: p.id });
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
        } else if (pickup.type === 'shield') {
          p.hp = Math.min(p.hp + 1, 4);
        } else if (pickup.type === 'boost') {
          p.effects.boost = EFFECT_TICKS_BOOST;
        } else if (pickup.type === 'rapid') {
          p.effects.rapid = EFFECT_TICKS_RAPID;
        } else if (pickup.type === 'laser') {
          p.effects.laser = LASER_AMMO;
        } else if (pickup.type === 'missile') {
          p.effects.missile = MISSILE_AMMO;
        } else if (pickup.type === 'trishot') {
          p.effects.trishot = EFFECT_TICKS_TRISHOT;
        } else if (pickup.type === 'drone') {
          p.effects.drone = EFFECT_TICKS_DRONE;
          p.droneShootCd = 0;
        } else if (pickup.type === 'magnet') {
          p.effects.magnet = EFFECT_TICKS_MAGNET;
        } else if (pickup.type === 'intangible') {
          p.effects.intangible = EFFECT_TICKS_INTANGIBLE;
        } else if (pickup.type === 'minigun') {
          p.effects.minigun = EFFECT_TICKS_MINIGUN;
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
        }
        events.push({ type: 'pickup_collected', id: pickup.id, pickupType: pickup.type, rarity: pickup.rarity, x: pickup.x, y: pickup.y, byId: p.id });
        gameState.pickups.delete(pickup.id);
        break;
      }
    }
  }
}

function getDynamicMax() {
  if (!gameState.startTime) return 3;
  const elapsed = (Date.now() - gameState.startTime) / 1000;
  return Math.min(MAX_ASTEROIDS, Math.floor(5 + elapsed / 5));
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
    for (const pk of gameState.pickups.values()) {
      if (dist2(p.x, p.y, pk.x, pk.y) < MAGNET_RADIUS * MAGNET_RADIUS) {
        pk.x += (p.x - pk.x) * 0.08;
        pk.y += (p.y - pk.y) * 0.08;
      }
    }
  }
}

function integrateMinigun(events) {
  for (const p of gameState.players.values()) {
    if (!p.alive || p.respawnTimer > 0 || p.effects.minigun <= 0) continue;
    // Tire toutes les 2 ticks (~10 balles/sec) avec spread aléatoire
    if (gameState.tick % 2 === 0) {
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

function checkWinCondition() {
  const elapsed = (Date.now() - gameState.startTime) / 1000;
  for (const p of gameState.players.values()) {
    if (p.score >= WIN_SCORE) return true;
  }
  if (elapsed >= GAME_DURATION) return true;
  // Tous les joueurs morts en même temps → fin immédiate
  if (gameState.players.size > 0) {
    let allDead = true;
    for (const p of gameState.players.values()) {
      if (p.alive) { allDead = false; break; }
    }
    if (allDead) return true;
  }
  return false;
}

// ─── Boucle de jeu ────────────────────────────────────────────────────────────

function gameTick(room) {
  if (gameState.phase !== 'playing') return;

  const events = [];

  for (const p of gameState.players.values()) integratePlayer(p);

  // Bordures électriques : tuer les joueurs qui touchent
  for (const p of gameState.players.values()) {
    if (!p.alive || p.respawnTimer > 0) continue;
    if (p.borderKill) {
      p.borderKill = false;
      p.hp--;
      p.respawnTimer = RESPAWN_TICKS;
      events.push({ type: 'player_hit', x: p.x, y: p.y, victimId: p.id, byId: null });
      events.push({ type: 'border_zap', x: p.x, y: p.y });
      if (p.hp <= 0) {
        p.alive = false;
        p.hp = 0;
        events.push({ type: 'player_killed', x: p.x, y: p.y, victimId: p.id });
      }
    }
  }

  // Combo timer decay
  for (const p of gameState.players.values()) {
    if (p.comboTimer > 0) { p.comboTimer--; if (p.comboTimer <= 0) p.comboCount = 0; }
  }

  // Pickup lifetime — despawn vieux pickups
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
  checkAsteroidCollisions();
  checkAsteroidPlayerCollisions(events);
  applyMagnet();
  checkPlayerPickupCollisions(events);
  maintainAsteroids();

  // Asteroid Storm : toutes les 30s, une vague dense d'astéroïdes
  if (gameState.tick > 0 && gameState.tick % 600 === 0) {
    const stormCount = 6 + Math.floor(Math.random() * 4);
    for (let i = 0; i < stormCount; i++) {
      const a = spawnAsteroid();
      gameState.asteroids.set(a.id, a);
    }
    events.push({ type: 'asteroid_storm' });
  }

  gameState.tick++;

  // Envoyer snapshot + events en un seul message JSON
  broadcastRoom(room, { type: 'snapshot', ...buildSnapshot(), events });

  if (checkWinCondition()) endGame(room);
}

function buildSnapshot() {
  return {
    tick: gameState.tick,
    phase: gameState.phase,
    elapsed: gameState.startTime ? Math.floor((Date.now() - gameState.startTime) / 1000) : 0,
    players: [...gameState.players.values()].map(p => ({
      id: p.id, name: p.name, color: p.color,
      x: p.x, y: p.y, angle: p.angle, vx: p.vx, vy: p.vy,
      hp: p.hp, score: p.score, alive: p.alive,
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
  };
}

function startGame(room) {
  console.log(`🚀 [${room.code}] Partie en cours !`);
  gameState.phase = 'playing';
  gameState.startTime = Date.now();
  gameState.asteroids.clear();
  gameState.pickups.clear();
  gameState.projectiles.clear();
  gameState.tick = 0;

  let idx = 0;
  for (const p of gameState.players.values()) {
    const fresh = createPlayer(p.id, p.name, idx++);
    Object.assign(p, fresh);
  }

  for (let i = 0; i < 3; i++) {
    const a = spawnAsteroid();
    gameState.asteroids.set(a.id, a);
  }
  broadcastRoom(room, { type: 'start' });
}

function endGame(room) {
  gameState.phase = 'gameover';
  const scores = [...gameState.players.values()]
    .map(p => ({ id: p.id, name: p.name, score: p.score, color: p.color }))
    .sort((a, b) => b.score - a.score);
  broadcastRoom(room, { type: 'gameover', scores });
  console.log(`🏆 [${room.code}] Fin :`, scores.map(s => `${s.name}:${s.score}`).join(', '));
  setTimeout(() => withRoom(room, () => resetLobby(room)), 8000);
}

function resetLobby(room) {
  gameState.phase = 'lobby';
  gameState.asteroids.clear();
  gameState.pickups.clear();
  gameState.projectiles.clear();
  gameState.tick = 0;
  for (const p of gameState.players.values()) {
    p.hp = 3; p.score = 0; p.alive = true; p.respawnTimer = 0;
    p.effects = { boost: 0, rapid: 0, laser: 0, missile: 0, trishot: 0, drone: 0, magnet: 0, intangible: 0, minigun: 0, gravwell: 0 };
    p.droneAngle = 0; p.droneShootCd = 0; p.gravwellX = 0; p.gravwellY = 0;
    p.killStreak = 0; p.comboTimer = 0; p.comboCount = 0;
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

    const mimeTypes = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };
    const ext = path.substring(path.lastIndexOf('.'));
    const contentType = mimeTypes[ext] || 'application/octet-stream';

    const file = Bun.file(filePath);
    return new Response(file, { headers: { 'Content-Type': contentType } });
  },
  websocket: {
    open(ws) {},

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
        withRoom(room, () => startGame(room));
      }

      // ── Input en jeu ──────────────────────────────────────────────────────
      if (msg.type === 'input') {
        const room = ws.room;
        if (!room) return;
        const p = room.gameState.players.get(ws.playerId);
        if (!p) return;
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
