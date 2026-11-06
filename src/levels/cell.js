import {
  createStage, createLoop, bindPointer, createKeyboard,
  clamp, rand, randInt, roundRect, TAU, easeOutCubic,
} from "../util.js";
import { audio } from "../audio.js";

const DISPLAY = '"Arial Rounded MT Bold", "Trebuchet MS", system-ui, sans-serif';
const DURATION = 30;
const PLAYER_R = 11;
const SEG_R = 6.2;
const SEG_SPACING = 9;
const MAX_ENEMIES = 44;

const PLAYER_COLORS = ["#7dffd4", "#3ee9a5", "#38d6f0"];
const ENEMY_PINK = ["#ff7ab6", "#ff5d8c", "#c72c8f"];
const ENEMY_VIOLET = ["#b98cff", "#9b5cff", "#6c34d6"];

export function mount(root, api) {
  root.innerHTML = "";
  const stage = createStage(root);
  const input = createKeyboard();

  const state = {
    phase: "intro",
    intro: 1.7,
    time: 0,
    survive: 0,
    hp: 3,
    inv: 0,
    kills: 0,
    level: 1,
    xp: 0,
    xpNext: 4,
    player: { x: stage.w / 2, y: stage.h * 0.6, angle: -Math.PI / 2 },
    segments: [],
    enemies: [],
    pBullets: [],
    eBullets: [],
    orbs: [],
    particles: [],
    floats: [],
    spawnTimer: 1.1,
    spitterTimer: 5.5,
    fireTimer: 0.35,
    shake: 0,
    flash: 0,
    levelFlash: 0,
    winT: 0,
    deadT: 0,
    resultSent: false,
    joystick: { active: false, x: 0, y: 0, dx: 0, dy: 0 },
  };

  let resultTimer = null;

  function targetSegments() {
    return 7 + Math.min(26, (state.level - 1) * 3);
  }

  function resetSegments() {
    state.segments = [];
    for (let i = 0; i < targetSegments(); i++) {
      state.segments.push({
        x: state.player.x - i * SEG_SPACING,
        y: state.player.y,
      });
    }
  }

  function reset() {
    state.phase = "intro";
    state.intro = 1.7;
    state.time = 0;
    state.survive = 0;
    state.hp = 3;
    state.inv = 0;
    state.kills = 0;
    state.level = 1;
    state.xp = 0;
    state.xpNext = 4;
    state.player = { x: stage.w / 2, y: stage.h * 0.6, angle: -Math.PI / 2 };
    state.enemies = [];
    state.pBullets = [];
    state.eBullets = [];
    state.orbs = [];
    state.particles = [];
    state.floats = [];
    state.spawnTimer = 1.1;
    state.spitterTimer = 5.5;
    state.fireTimer = 0.35;
    state.shake = 0;
    state.flash = 0;
    state.levelFlash = 0;
    state.winT = 0;
    state.deadT = 0;
    state.resultSent = false;
    state.joystick.active = false;
    state.joystick.dx = 0;
    state.joystick.dy = 0;
    resetSegments();
  }

  reset();

  const stopPointer = bindPointer(stage.canvas, {
    down(p) {
      if (state.phase !== "play" && state.phase !== "intro") return;
      state.joystick.active = true;
      state.joystick.x = p.x;
      state.joystick.y = p.y;
      state.joystick.dx = 0;
      state.joystick.dy = 0;
    },
    move(p) {
      if (!state.joystick.active) return;
      const dx = p.x - state.joystick.x;
      const dy = p.y - state.joystick.y;
      const len = Math.hypot(dx, dy);
      if (len > 7) {
        const cap = Math.min(len, 56);
        state.joystick.dx = (dx / len) * cap;
        state.joystick.dy = (dy / len) * cap;
      }
    },
    up() {
      state.joystick.active = false;
      state.joystick.dx = 0;
      state.joystick.dy = 0;
    },
    leave() {
      state.joystick.active = false;
      state.joystick.dx = 0;
      state.joystick.dy = 0;
    },
  });

  function addFloat(text, color, x, y, scale = 1) {
    state.floats.push({ text, color, x, y, life: 1.05, max: 1.05, scale });
  }

  function burst(x, y, color, amount = 10, power = 180) {
    for (let i = 0; i < amount; i++) {
      const a = rand(0, TAU);
      const sp = rand(power * 0.22, power);
      state.particles.push({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: rand(0.26, 0.72),
        max: 0.72,
        size: rand(1.4, 3.8),
        color,
      });
    }
  }

  function nearestEnemy(range = 330) {
    const p = state.player;
    let best = null;
    let bestD = range * range;
    for (const e of state.enemies) {
      const d = (e.x - p.x) ** 2 + (e.y - p.y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  function spawnEnemy(forceType) {
    if (state.enemies.length >= MAX_ENEMIES) return;
    const side = randInt(0, 3);
    const margin = 26;
    let x = 0;
    let y = 0;
    if (side === 0) { x = rand(0, stage.w); y = -margin; }
    else if (side === 1) { x = stage.w + margin; y = rand(60, stage.h); }
    else if (side === 2) { x = rand(0, stage.w); y = stage.h + margin; }
    else { x = -margin; y = rand(60, stage.h); }

    const spitterChance = state.survive > 16 ? 0.36 : state.survive > 7 ? 0.22 : 0;
    const type = forceType || (Math.random() < spitterChance ? "spitter" : "chaser");

    if (type === "spitter") {
      const hp = 26 + state.survive * 1.7;
      state.enemies.push({
        type, x, y, r: 12.5, hp, maxHp: hp,
        speed: 30 + state.survive * 0.55,
        wobble: rand(0, TAU), seed: rand(0, TAU),
        hitT: 0, fireTimer: rand(0.9, 2.1),
      });
    } else {
      const r = rand(8, 12);
      const hp = 14 + state.survive * 1.45;
      state.enemies.push({
        type, x, y, r, hp, maxHp: hp,
        speed: rand(38, 62) + state.survive * 1.35,
        wobble: rand(0, TAU), seed: rand(0, TAU),
        hitT: 0, fireTimer: 0,
      });
    }
  }

  function fireAt(target) {
    const p = state.player;
    const angle = Math.atan2(target.y - p.y, target.x - p.x);
    p.angle = angle;
    const shots = Math.min(3, 1 + Math.floor((state.level - 1) / 3));
    const spread = shots > 1 ? 0.11 : 0;
    const dmg = 9 + state.level * 2.2;
    for (let i = 0; i < shots; i++) {
      const a = angle + (i - (shots - 1) / 2) * spread;
      state.pBullets.push({
        x: p.x + Math.cos(a) * 14,
        y: p.y + Math.sin(a) * 14,
        vx: Math.cos(a) * 430,
        vy: Math.sin(a) * 430,
        r: 3.6,
        dmg,
        life: 1.1,
      });
    }
    audio.shoot();
  }

  function gainXp(value) {
    state.xp += value;
    let leveled = false;
    while (state.xp >= state.xpNext) {
      state.xp -= state.xpNext;
      state.level++;
      state.xpNext = 4 + (state.level - 1) * 3;
      leveled = true;
    }
    if (!leveled) return;
    state.levelFlash = 1;
    state.flash = Math.max(state.flash, 0.3);
    const p = state.player;
    burst(p.x, p.y, "#62b6ff", 22, 260);
    addFloat(`LEVEL ${state.level}`, "#8ce7ff", p.x, p.y - 34, 0.92);
    audio.levelUp();
    api.vibrate?.(16);
  }

  function killEnemy(e) {
    const idx = state.enemies.indexOf(e);
    if (idx >= 0) state.enemies.splice(idx, 1);
    state.kills++;
    const color = e.type === "spitter" ? "#9b5cff" : "#ff5d8c";
    burst(e.x, e.y, color, e.type === "spitter" ? 18 : 12, e.type === "spitter" ? 260 : 200);
    const drops = e.type === "spitter" ? 2 : 1;
    for (let i = 0; i < drops; i++) {
      const a = rand(0, TAU);
      state.orbs.push({
        x: e.x, y: e.y,
        vx: Math.cos(a) * rand(30, 90),
        vy: Math.sin(a) * rand(30, 90),
        val: 1, life: 11,
      });
    }
    audio.pop();
  }

  function damagePlayer() {
    if (state.inv > 0 || state.phase !== "play") return;
    state.hp--;
    state.inv = 1.3;
    state.shake = 11;
    state.flash = 1;
    const p = state.player;
    burst(p.x, p.y, "#ff8fa3", 22, 280);
    audio.hurt();
    api.vibrate?.([26, 30, 34]);
    if (state.hp <= 0) {
      die();
    } else {
      addFloat("-1 HP", "#ff8fa3", p.x, p.y - 30, 0.9);
    }
  }

  function die() {
    if (state.phase !== "play") return;
    state.phase = "dead";
    state.deadT = 0;
    state.shake = 15;
    state.flash = 1;
    burst(state.player.x, state.player.y, "#ff5d8c", 40, 340);
    audio.bad();
    if (state.resultSent) return;
    state.resultSent = true;
    resultTimer = setTimeout(() => {
      api.lose(`The swarm absorbed your cell after ${state.survive.toFixed(1)}s and ${state.kills} kills.`);
    }, 950);
  }

  function win() {
    if (state.phase !== "play") return;
    state.phase = "won";
    state.winT = 0;
    state.resultSent = true;
    const stars = state.hp >= 3 ? 3 : state.hp === 2 ? 2 : 1;
    const p = state.player;
    burst(p.x, p.y, "#7dffd4", 30, 300);
    burst(p.x, p.y, "#62b6ff", 24, 260);
    addFloat("SURVIVED!", "#7dffd4", p.x, p.y - 36, 1.05);
    audio.win();
    api.vibrate?.(35);
    resultTimer = setTimeout(() => {
      api.win(stars, state.kills, {
        note: `Survived all 30 seconds with ${state.hp} HP and ${state.kills} kills. The petri dish has been sterilized.`,
      });
    }, 900);
  }

  function updatePlayer(dt) {
    const p = state.player;
    let vx = 0;
    let vy = 0;
    if (state.joystick.active) {
      vx = state.joystick.dx;
      vy = state.joystick.dy;
    }
    let kx = 0;
    let ky = 0;
    if (input.isDown("arrowleft", "a")) kx -= 1;
    if (input.isDown("arrowright", "d")) kx += 1;
    if (input.isDown("arrowup", "w")) ky -= 1;
    if (input.isDown("arrowdown", "s")) ky += 1;
    if (kx || ky) {
      const len = Math.hypot(kx, ky) || 1;
      vx = (kx / len) * 56;
      vy = (ky / len) * 56;
    }

    const len = Math.hypot(vx, vy);
    if (len > 6) {
      const speed = 205;
      p.x += (vx / len) * speed * dt;
      p.y += (vy / len) * speed * dt;
    }
    p.x = clamp(p.x, PLAYER_R + 6, stage.w - PLAYER_R - 6);
    p.y = clamp(p.y, 76 + PLAYER_R, stage.h - PLAYER_R - 8);
  }

  function updateSegments() {
    let px = state.player.x;
    let py = state.player.y;
    for (const seg of state.segments) {
      const dx = seg.x - px;
      const dy = seg.y - py;
      const d = Math.hypot(dx, dy);
      if (d > SEG_SPACING) {
        const t = (d - SEG_SPACING) / d;
        seg.x -= dx * t;
        seg.y -= dy * t;
      }
      px = seg.x;
      py = seg.y;
    }
    const target = targetSegments();
    while (state.segments.length < target) {
      const tail = state.segments[state.segments.length - 1] || state.player;
      state.segments.push({ x: tail.x, y: tail.y });
    }
    while (state.segments.length > target) state.segments.pop();
  }

  function updateEnemies(dt) {
    const p = state.player;
    for (const e of state.enemies) {
      e.hitT = Math.max(0, e.hitT - dt);
      e.wobble += dt * 3.2;
      const dx = p.x - e.x;
      const dy = p.y - e.y;
      const d = Math.hypot(dx, dy) || 1;

      if (e.type === "spitter") {
        const want = 138;
        const push = d > want + 16 ? 1 : d < want - 16 ? -0.85 : 0;
        const strafe = Math.sin(state.time * 0.9 + e.seed) * 0.6;
        e.x += ((dx / d) * push + (-dy / d) * strafe) * e.speed * dt;
        e.y += ((dy / d) * push + (dx / d) * strafe) * e.speed * dt;

        e.fireTimer -= dt;
        if (e.fireTimer <= 0 && d < 360) {
          e.fireTimer = rand(1.5, 2.2);
          const base = Math.atan2(dy, dx);
          const shots = state.survive > 15 ? 3 : 1;
          for (let i = 0; i < shots; i++) {
            const a = base + (i - (shots - 1) / 2) * 0.2;
            state.eBullets.push({
              x: e.x + Math.cos(a) * 12,
              y: e.y + Math.sin(a) * 12,
              vx: Math.cos(a) * 122,
              vy: Math.sin(a) * 122,
              r: 5.4,
              life: 6,
            });
          }
          audio.tap();
        }
      } else {
        const a = Math.atan2(dy, dx) + Math.sin(e.wobble + e.seed) * 0.28;
        e.x += Math.cos(a) * e.speed * dt;
        e.y += Math.sin(a) * e.speed * dt;
      }

      if (d < e.r + PLAYER_R - 2 && state.inv <= 0 && state.phase === "play") {
        burst(e.x, e.y, "#ff5d8c", 14, 220);
        const idx = state.enemies.indexOf(e);
        if (idx >= 0) state.enemies.splice(idx, 1);
        damagePlayer();
      }
    }
  }

  function updateBullets(dt) {
    const p = state.player;

    for (const b of state.pBullets) {
      b.life -= dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
    }
    for (const b of state.eBullets) {
      b.life -= dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.x < -20 || b.x > stage.w + 20 || b.y < -20 || b.y > stage.h + 20) b.life = 0;
    }

    // player shots vs enemies
    for (const b of state.pBullets) {
      if (b.life <= 0) continue;
      for (const e of state.enemies) {
        const rr = e.r + b.r;
        if ((e.x - b.x) ** 2 + (e.y - b.y) ** 2 < rr * rr) {
          e.hp -= b.dmg;
          e.hitT = 0.12;
          b.life = 0;
          burst(b.x, b.y, "#bffcff", 4, 90);
          if (e.hp <= 0) {
            killEnemy(e);
          }
          break;
        }
      }
    }

    // enemy shots vs tail shield / player
    for (const b of state.eBullets) {
      if (b.life <= 0) continue;
      let hit = false;
      for (const seg of state.segments) {
        const rr = SEG_R + b.r;
        if ((seg.x - b.x) ** 2 + (seg.y - b.y) ** 2 < rr * rr) {
          hit = true;
          break;
        }
      }
      if (!hit) {
        const rr = PLAYER_R + b.r;
        if ((p.x - b.x) ** 2 + (p.y - b.y) ** 2 < rr * rr) {
          hit = true;
          damagePlayer();
        }
      }
      if (hit) {
        b.life = 0;
        burst(b.x, b.y, "#ffb3d4", 6, 120);
      }
    }

    state.pBullets = state.pBullets.filter((b) => b.life > 0);
    state.eBullets = state.eBullets.filter((b) => b.life > 0);
  }

  function updateOrbs(dt) {
    const p = state.player;
    for (const o of state.orbs) {
      o.life -= dt;
      const dx = p.x - o.x;
      const dy = p.y - o.y;
      const d = Math.hypot(dx, dy) || 1;
      if (d < 92) {
        const pull = 620 * (1 - d / 120);
        o.vx += (dx / d) * pull * dt;
        o.vy += (dy / d) * pull * dt;
      }
      o.vx *= 1 - dt * 2.2;
      o.vy *= 1 - dt * 2.2;
      o.x += o.vx * dt;
      o.y += o.vy * dt;
      if (d < 15) {
        o.life = 0;
        gainXp(o.val);
        audio.eat();
        burst(o.x, o.y, "#7dffd4", 5, 90);
      }
    }
    state.orbs = state.orbs.filter((o) => o.life > 0);
  }

  function updateParticles(dt) {
    for (const p of state.particles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 120 * dt;
      p.vx *= 1 - dt * 1.6;
      p.vy *= 1 - dt * 1.6;
    }
    state.particles = state.particles.filter((p) => p.life > 0);
    for (const f of state.floats) {
      f.life -= dt;
      f.y -= 38 * dt;
    }
    state.floats = state.floats.filter((f) => f.life > 0);
  }

  function update(dt) {
    state.time += dt;
    state.shake = Math.max(0, state.shake - dt * 28);
    state.flash = Math.max(0, state.flash - dt * 2.8);
    state.levelFlash = Math.max(0, state.levelFlash - dt * 2.6);
    state.inv = Math.max(0, state.inv - dt);

    updatePlayer(dt);
    input.endFrame();

    if (state.phase === "intro") {
      state.intro -= dt;
      updateSegments();
      updateParticles(dt);
      if (state.intro <= 0) state.phase = "play";
      return;
    }

    if (state.phase === "play") {
      state.survive += dt;
      updateSegments();

      state.spawnTimer -= dt;
      const interval = Math.max(0.34, 1.15 - state.survive * 0.028);
      if (state.spawnTimer <= 0) {
        state.spawnTimer = interval;
        const batch = state.survive > 18 ? 2 : 1;
        for (let i = 0; i < batch; i++) spawnEnemy();
      }
      state.spitterTimer -= dt;
      if (state.survive > 6 && state.spitterTimer <= 0) {
        spawnEnemy("spitter");
        state.spitterTimer = rand(4.4, 6.6);
      }

      updateEnemies(dt);

      const target = nearestEnemy();
      if (target) state.player.angle = Math.atan2(target.y - state.player.y, target.x - state.player.x);
      state.fireTimer -= dt;
      if (state.fireTimer <= 0) {
        if (target) {
          fireAt(target);
          state.fireTimer = Math.max(0.16, 0.52 - (state.level - 1) * 0.035);
        } else {
          state.fireTimer = 0.1;
        }
      }

      updateBullets(dt);
      updateOrbs(dt);
      updateParticles(dt);

      if (state.survive >= DURATION && state.phase === "play") win();
      return;
    }

    if (state.phase === "dead") {
      state.deadT += dt;
      updateParticles(dt);
    } else if (state.phase === "won") {
      state.winT += dt;
      updateParticles(dt);
    }
  }

  // ---------- drawing ----------

  function drawBackdrop(ctx, w, h) {
    const g = ctx.createRadialGradient(w / 2, h * 0.42, 30, w / 2, h * 0.5, Math.max(w, h) * 0.85);
    g.addColorStop(0, "#14204a");
    g.addColorStop(0.45, "#0b1129");
    g.addColorStop(1, "#04060f");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    const cx = w / 2;
    const cy = h * 0.52;
    ctx.save();
    ctx.strokeStyle = "rgba(98, 182, 255, 0.11)";
    ctx.lineWidth = 1;
    for (let i = 1; i <= 5; i++) {
      ctx.beginPath();
      ctx.arc(cx, cy, i * Math.min(w, h) * 0.12, 0, TAU);
      ctx.stroke();
    }

    ctx.translate(cx, cy);
    ctx.rotate(state.time * 0.09);
    ctx.strokeStyle = "rgba(155, 92, 255, 0.22)";
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 16]);
    ctx.beginPath();
    ctx.arc(0, 0, Math.min(w, h) * 0.4, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // drifting motes
    for (let i = 0; i < 18; i++) {
      const x = ((i * 89 + state.time * (5 + i * 0.5)) % (w + 24)) - 12;
      const y = ((i * 137 + Math.sin(state.time * 0.5 + i) * 22) % (h + 24)) - 12;
      ctx.globalAlpha = 0.1 + (i % 4) * 0.04;
      ctx.fillStyle = i % 3 === 0 ? "#ff7ab6" : "#62b6ff";
      ctx.beginPath();
      ctx.arc(x, y, 1.2 + (i % 3) * 0.5, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    const vign = ctx.createRadialGradient(w / 2, h / 2, h * 0.26, w / 2, h / 2, h * 0.8);
    vign.addColorStop(0, "rgba(0,0,0,0)");
    vign.addColorStop(1, "rgba(0,0,0,0.5)");
    ctx.fillStyle = vign;
    ctx.fillRect(0, 0, w, h);
  }

  function drawOrbs(ctx) {
    for (const o of state.orbs) {
      const pulse = 1 + Math.sin(state.time * 6 + o.x) * 0.1;
      ctx.fillStyle = "rgba(125, 255, 212, 0.22)";
      ctx.beginPath();
      ctx.arc(o.x, o.y, 7.5 * pulse, 0, TAU);
      ctx.fill();
      ctx.fillStyle = "#7dffd4";
      ctx.beginPath();
      ctx.arc(o.x, o.y, 3.4 * pulse, 0, TAU);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.8)";
      ctx.beginPath();
      ctx.arc(o.x - 0.8, o.y - 0.8, 1.2, 0, TAU);
      ctx.fill();
    }
  }

  function drawEnemyBullets(ctx) {
    for (const b of state.eBullets) {
      ctx.fillStyle = "rgba(255, 122, 182, 0.24)";
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r * 1.85, 0, TAU);
      ctx.fill();
      ctx.fillStyle = "#ff7ab6";
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, TAU);
      ctx.fill();
      ctx.fillStyle = "#ffe6f2";
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r * 0.44, 0, TAU);
      ctx.fill();
    }
  }

  function drawPlayerBullets(ctx) {
    for (const b of state.pBullets) {
      ctx.save();
      ctx.strokeStyle = "rgba(140, 231, 255, 0.6)";
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(b.x - b.vx * 0.014, b.y - b.vy * 0.014);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.fillStyle = "#d9fbff";
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawSegments(ctx) {
    const dead = state.phase === "dead";
    for (let i = state.segments.length - 1; i >= 0; i--) {
      const s = state.segments[i];
      const t = i / Math.max(1, state.segments.length - 1);
      const r = SEG_R * (0.62 + 0.38 * (1 - t));
      ctx.globalAlpha = 0.5 + 0.45 * (1 - t);
      ctx.fillStyle = dead ? "#ff8fa3" : PLAYER_COLORS[i % PLAYER_COLORS.length];
      ctx.beginPath();
      ctx.arc(s.x, s.y, r, 0, TAU);
      ctx.fill();
      ctx.globalAlpha *= 0.5;
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.beginPath();
      ctx.arc(s.x - r * 0.28, s.y - r * 0.3, r * 0.3, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  function drawEnemy(ctx, e) {
    const wob = Math.sin(e.wobble + e.seed) * 0.06;
    const isSpitter = e.type === "spitter";
    const palette = isSpitter ? ENEMY_VIOLET : ENEMY_PINK;

    ctx.save();
    ctx.translate(e.x, e.y);

    if (isSpitter) {
      ctx.save();
      ctx.rotate(e.wobble * 0.35);
      ctx.fillStyle = palette[2];
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a - 0.16) * e.r * 0.92, Math.sin(a - 0.16) * e.r * 0.92);
        ctx.lineTo(Math.cos(a) * e.r * 1.42, Math.sin(a) * e.r * 1.42);
        ctx.lineTo(Math.cos(a + 0.16) * e.r * 0.92, Math.sin(a + 0.16) * e.r * 0.92);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }

    const grad = ctx.createRadialGradient(-e.r * 0.3, -e.r * 0.35, e.r * 0.12, 0, 0, e.r * (1 + wob));
    grad.addColorStop(0, palette[1]);
    grad.addColorStop(1, palette[2]);
    ctx.fillStyle = grad;
    ctx.beginPath();
    for (let i = 0; i <= 24; i++) {
      const a = (i / 24) * TAU;
      const rr = e.r * (1 + Math.sin(a * 3 + e.wobble) * 0.05 + wob);
      const x = Math.cos(a) * rr;
      const y = Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(20, 8, 32, 0.55)";
    ctx.lineWidth = 1.6;
    ctx.stroke();

    ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
    ctx.beginPath();
    ctx.arc(-e.r * 0.32, -e.r * 0.34, e.r * 0.34, 0, TAU);
    ctx.fill();

    // nucleus / eye
    ctx.fillStyle = isSpitter ? "#ffd9a8" : "#ffd0e6";
    ctx.beginPath();
    ctx.arc(-e.r * 0.12, -e.r * 0.1, e.r * 0.34, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#2a0f22";
    ctx.beginPath();
    ctx.arc(-e.r * 0.08, -e.r * 0.08, e.r * 0.16, 0, TAU);
    ctx.fill();

    if (e.hitT > 0) {
      ctx.globalAlpha = clamp(e.hitT / 0.12, 0, 1) * 0.7;
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(0, 0, e.r, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawPlayer(ctx) {
    const p = state.player;
    const flicker = state.inv > 0 && Math.floor(state.time * 18) % 2 === 0;
    const dead = state.phase === "dead";

    ctx.save();
    ctx.globalAlpha = flicker ? 0.45 : 1;
    ctx.shadowColor = "rgba(125, 255, 212, 0.7)";
    ctx.shadowBlur = 18;

    const headGrad = ctx.createRadialGradient(p.x - 4, p.y - 5, 2, p.x, p.y, PLAYER_R);
    headGrad.addColorStop(0, dead ? "#ffd0d8" : "#d8fff2");
    headGrad.addColorStop(0.5, dead ? "#ff8fa3" : "#7dffd4");
    headGrad.addColorStop(1, dead ? "#c72c47" : "#1f9fd8");
    ctx.fillStyle = headGrad;
    ctx.beginPath();
    ctx.arc(p.x, p.y, PLAYER_R, 0, TAU);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "rgba(4, 18, 26, 0.6)";
    ctx.lineWidth = 1.8;
    ctx.stroke();

    // eyes face the aim direction
    const a = p.angle;
    for (const side of [-0.5, 0.5]) {
      const ex = p.x + Math.cos(a + side) * 5.2;
      const ey = p.y + Math.sin(a + side) * 5.2;
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(ex, ey, 3.1, 0, TAU);
      ctx.fill();
      ctx.fillStyle = "#132238";
      ctx.beginPath();
      ctx.arc(ex + Math.cos(a) * 0.9, ey + Math.sin(a) * 0.9, 1.5, 0, TAU);
      ctx.fill();
    }

    // membrane
    ctx.strokeStyle = "rgba(216, 255, 242, 0.6)";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(p.x, p.y, PLAYER_R + 3, 0, TAU);
    ctx.stroke();
    ctx.restore();

    if (state.inv > 0) {
      ctx.save();
      ctx.globalAlpha = 0.25 + Math.sin(state.time * 12) * 0.15;
      ctx.strokeStyle = "#bffcff";
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 6]);
      ctx.beginPath();
      ctx.arc(p.x, p.y, PLAYER_R + 8, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawParticles(ctx) {
    for (const p of state.particles) {
      const a = clamp(p.life / p.max, 0, 1);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (0.4 + a * 0.6), 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawFloats(ctx) {
    for (const f of state.floats) {
      const a = clamp(f.life / f.max, 0, 1);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = f.color;
      ctx.strokeStyle = "rgba(4, 8, 20, 0.75)";
      ctx.lineWidth = 3.5;
      ctx.font = `900 ${Math.round(clamp(stage.w * 0.045, 12, 19) * f.scale)}px ${DISPLAY}`;
      ctx.textAlign = "center";
      ctx.strokeText(f.text, f.x, f.y);
      ctx.fillText(f.text, f.x, f.y);
      ctx.restore();
    }
  }

  function drawHeart(ctx, x, y, s, filled) {
    ctx.beginPath();
    ctx.moveTo(x, y + s * 0.38);
    ctx.bezierCurveTo(x - s * 0.55, y - s * 0.34, x - s * 1.02, y + s * 0.2, x, y + s * 0.88);
    ctx.bezierCurveTo(x + s * 1.02, y + s * 0.2, x + s * 0.55, y - s * 0.34, x, y + s * 0.38);
    ctx.fillStyle = filled ? "#ff5d8c" : "rgba(255,255,255,0.16)";
    ctx.fill();
  }

  function drawHud(ctx, w) {
    const pad = 10;
    const cardH = 54;

    ctx.save();
    ctx.fillStyle = "rgba(6, 12, 28, 0.74)";
    roundRect(ctx, pad, 10, w - pad * 2, cardH, 12);
    ctx.fill();
    ctx.strokeStyle = "rgba(98, 182, 255, 0.22)";
    ctx.lineWidth = 1;
    ctx.stroke();

    for (let i = 0; i < 3; i++) {
      drawHeart(ctx, pad + 16 + i * 16, 20, 7.2, i < state.hp);
    }

    const timeLeft = Math.max(0, DURATION - state.survive);
    const mm = Math.floor(timeLeft / 60);
    const ss = Math.floor(timeLeft % 60);
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(223, 253, 242, 0.5)";
    ctx.font = `800 7px ${DISPLAY}`;
    ctx.fillText("SURVIVE", w / 2, 20);
    ctx.fillStyle = timeLeft < 5 ? "#ffd23f" : "#dffdf2";
    ctx.font = `900 15px ${DISPLAY}`;
    ctx.fillText(`${mm}:${ss.toString().padStart(2, "0")}`, w / 2, 37);

    ctx.textAlign = "right";
    ctx.fillStyle = "rgba(223, 253, 242, 0.5)";
    ctx.font = `800 7px ${DISPLAY}`;
    ctx.fillText("KILLS", w - pad - 9, 20);
    ctx.fillStyle = "#ff9dc4";
    ctx.font = `900 14px ${DISPLAY}`;
    ctx.fillText(String(state.kills), w - pad - 9, 36);

    // xp row
    ctx.textAlign = "left";
    ctx.fillStyle = "#8ce7ff";
    ctx.font = `900 8px ${DISPLAY}`;
    ctx.fillText(`LV ${state.level}`, pad + 9, 51);

    const bx = pad + 44;
    const bw = w - bx - pad - 9;
    ctx.fillStyle = "rgba(98, 182, 255, 0.16)";
    roundRect(ctx, bx, 45, bw, 7, 3.5);
    ctx.fill();
    const pct = clamp(state.xp / state.xpNext, 0, 1);
    if (pct > 0) {
      const grad = ctx.createLinearGradient(bx, 0, bx + bw, 0);
      grad.addColorStop(0, "#7dffd4");
      grad.addColorStop(0.65, "#38d6f0");
      grad.addColorStop(1, "#9b5cff");
      ctx.fillStyle = grad;
      roundRect(ctx, bx, 45, Math.max(3, bw * pct), 7, 3.5);
      ctx.fill();
    }
    ctx.restore();
  }

  function draw() {
    const { ctx } = stage;
    const w = stage.w;
    const h = stage.h;

    ctx.save();
    if (state.shake > 0.1) ctx.translate(rand(-state.shake, state.shake), rand(-state.shake, state.shake));

    drawBackdrop(ctx, w, h);
    drawOrbs(ctx);
    drawEnemyBullets(ctx);
    drawSegments(ctx);
    for (const e of state.enemies) drawEnemy(ctx, e);
    drawPlayerBullets(ctx);
    drawPlayer(ctx);
    drawParticles(ctx);
    drawFloats(ctx);
    drawHud(ctx, w);

    if (state.phase === "intro") {
      const a = clamp(state.intro / 1.7, 0, 1);
      const boxW = Math.min(310, w - 44);
      const boxH = 168;
      const bx = w / 2 - boxW / 2;
      const by = h * 0.44 - boxH / 2;
      ctx.save();
      ctx.globalAlpha = 0.68 * a;
      ctx.fillStyle = "#050b1a";
      roundRect(ctx, bx, by, boxW, boxH, 18);
      ctx.fill();
      ctx.strokeStyle = "rgba(98, 182, 255, 0.34)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.globalAlpha = a;
      ctx.textAlign = "center";
      ctx.fillStyle = "#dffdf2";
      ctx.font = `900 ${Math.round(clamp(w * 0.064, 21, 28))}px ${DISPLAY}`;
      ctx.fillText("DRAG TO MOVE", w / 2, by + 44);
      ctx.fillStyle = "#8ce7ff";
      ctx.font = `900 ${Math.round(clamp(w * 0.04, 13, 17))}px ${DISPLAY}`;
      ctx.fillText("YOUR CELL AUTO-FIRES", w / 2, by + 74);
      ctx.fillStyle = "rgba(223, 253, 242, 0.62)";
      ctx.font = `800 ${Math.round(clamp(w * 0.029, 9.5, 12))}px ${DISPLAY}`;
      ctx.fillText("GROW YOUR TAIL · IT BLOCKS BULLETS", w / 2, by + 104);
      ctx.fillStyle = "#ffd23f";
      ctx.font = `900 ${Math.round(clamp(w * 0.042, 14, 19))}px ${DISPLAY}`;
      ctx.fillText("SURVIVE 30 SECONDS", w / 2, by + 136);
      ctx.restore();
    }

    if (state.phase === "dead") {
      const t = easeOutCubic(clamp(state.deadT / 0.5, 0, 1));
      ctx.save();
      ctx.globalAlpha = t;
      ctx.textAlign = "center";
      ctx.fillStyle = "#ff8fa3";
      ctx.strokeStyle = "rgba(4, 6, 15, 0.85)";
      ctx.lineWidth = 9;
      ctx.font = `900 ${Math.round(clamp(w * 0.095, 27, 40))}px ${DISPLAY}`;
      ctx.strokeText("DIVIDED BY ZERO", w / 2, h * 0.42);
      ctx.fillText("DIVIDED BY ZERO", w / 2, h * 0.42);
      ctx.restore();
    }

    if (state.phase === "won") {
      const t = easeOutCubic(clamp(state.winT / 0.5, 0, 1));
      ctx.save();
      ctx.globalAlpha = t;
      ctx.textAlign = "center";
      ctx.fillStyle = "#7dffd4";
      ctx.strokeStyle = "rgba(4, 6, 15, 0.85)";
      ctx.lineWidth = 9;
      ctx.font = `900 ${Math.round(clamp(w * 0.09, 26, 38))}px ${DISPLAY}`;
      ctx.strokeText("PETRI DISH CLEAR", w / 2, h * 0.42);
      ctx.fillText("PETRI DISH CLEAR", w / 2, h * 0.42);
      ctx.restore();
    }

    if (state.levelFlash > 0) {
      ctx.fillStyle = `rgba(98, 182, 255, ${state.levelFlash * 0.09})`;
      ctx.fillRect(0, 0, w, h);
    }
    if (state.flash > 0) {
      ctx.fillStyle = `rgba(255, 210, 63, ${state.flash * 0.12})`;
      ctx.fillRect(0, 0, w, h);
    }

    ctx.restore();
  }

  const loop = createLoop((dt) => {
    update(dt);
    draw();
  });

  // TEMP DEBUG HOOK — removed after browser verification.
  window.__cellTest = {
    state,
    finish() { state.phase = "play"; state.intro = 0; state.survive = DURATION - 0.1; },
    hurt() { state.inv = 0; damagePlayer(); },
    spawnEnemy,
  };

  return {
    destroy() {
      if (resultTimer) clearTimeout(resultTimer);
      loop.stop();
      input.destroy();
      stopPointer();
      stage.destroy();
    },
  };
}
