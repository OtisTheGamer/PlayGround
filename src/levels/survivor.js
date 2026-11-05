import {
  createStage, createLoop, bindPointer, createKeyboard,
  clamp, lerp, rand, randInt, roundRect, TAU, dist, rotateToward,
} from "../util.js";
import { drawSprite } from "../sprites.js";
import { audio } from "../audio.js";

const DISPLAY = '"Arial Rounded MT Bold", "Trebuchet MS", system-ui, sans-serif';
const SURVIVE = 30;

const UPGRADES = [
  {
    id: "rapid", icon: "⚡", name: "RAPID FIRE",
    desc: "Shoot 20% faster. The gun is getting ideas.",
    apply(s) { s.fireInterval = Math.max(0.14, s.fireInterval * 0.8); },
  },
  {
    id: "heavy", icon: "💥", name: "HEAVY ROUNDS",
    desc: "+9 damage. Subtle, like a billboard.",
    apply(s) { s.damage += 9; },
  },
  {
    id: "double", icon: "🔱", name: "DOUBLE SHOT",
    desc: "One more bullet per shot. Spread the love.",
    apply(s) { s.multishot = Math.min(4, s.multishot + 1); },
  },
  {
    id: "boots", icon: "👟", name: "SWIFT BOOTS",
    desc: "+12% move speed. Cardio is a weapon.",
    apply(s) { s.speedMult += 0.12; },
  },
  {
    id: "vitality", icon: "❤️", name: "VITALITY",
    desc: "+20 max HP and heal 20. Sponsored by a juice ad.",
    apply(s) { s.maxHp += 20; s.hp = Math.min(s.maxHp, s.hp + 20); },
  },
  {
    id: "magnet", icon: "🧲", name: "GEM MAGNET",
    desc: "+45 pickup range. Lazy hands, happy wallet.",
    apply(s) { s.magnet += 45; },
  },
  {
    id: "pierce", icon: "➡️", name: "PIERCING ROUNDS",
    desc: "Bullets pass through one more enemy.",
    apply(s) { s.pierce += 1; },
  },
];

export function mount(root, api) {
  root.innerHTML = "";
  const stage = createStage(root);
  const input = createKeyboard();

  const state = {
    phase: "play",
    time: 0,
    player: {
      x: stage.w / 2,
      y: stage.h * 0.56,
      aim: -Math.PI / 2,
      hp: 100,
      maxHp: 100,
      inv: 0,
      hitFlash: 0,
    },
    bullets: [],
    enemies: [],
    gems: [],
    particles: [],
    floats: [],
    kills: 0,
    level: 1,
    xp: 0,
    xpNext: 4,
    fireTimer: 0,
    spawnTimer: 0.4,
    spawnSide: 0,
    fireInterval: 0.32,
    damage: 30,
    multishot: 1,
    speedMult: 1,
    magnet: 105,
    pierce: 0,
    nextEnemyId: 1,
    shake: 0,
    redFlash: 0,
    ended: false,
    winT: 0,
    deadT: 0,
    joystick: { active: false, x: 0, y: 0, dx: 0, dy: 0 },
    intro: 3.4,
    levelFlash: 0,
  };

  const upLayer = document.createElement("div");
  upLayer.className = "upgrade-layer";
  upLayer.hidden = true;
  root.appendChild(upLayer);

  let choosing = false;

  const stopPointer = bindPointer(stage.canvas, {
    down(p) {
      if (choosing || state.phase !== "play") return;
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
      if (len > 8) {
        const cap = Math.min(len, 54);
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

  function showUpgrade() {
    if (choosing || state.phase !== "play") return;
    choosing = true;
    state.joystick.active = false;
    state.joystick.dx = 0;
    state.joystick.dy = 0;
    loop.pause();
    audio.levelUp();
    api.vibrate?.(20);
    state.levelFlash = 1;

    const pool = [...UPGRADES].sort(() => Math.random() - 0.5).slice(0, 3);
    upLayer.innerHTML = `
      <div class="upgrade-head"><small>LEVEL ${state.level}</small><strong>PICK A POWER</strong></div>
      <div class="upgrade-cards"></div>
    `;
    const cards = upLayer.querySelector(".upgrade-cards");
    pool.forEach((up, index) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "upgrade-card";
      btn.innerHTML = `
        <span class="upgrade-icon">${up.icon}</span>
        <span><span class="upgrade-name">${up.name}</span><span class="upgrade-desc">${up.desc}</span></span>
      `;
      btn.addEventListener("click", () => {
        up.apply(state);
        audio.good();
        upLayer.hidden = true;
        choosing = false;
        loop.resume();
        addFloat(up.name, "#ffd23f", state.player.x, state.player.y - 40, 0.8);
        burst(state.player.x, state.player.y, "#ffd23f", 18, 220);
        // if a huge gem push caused another level, handle it
        if (state.xp >= state.xpNext) setTimeout(() => levelUp(), 260);
      });
      cards.appendChild(btn);
    });
    upLayer.hidden = false;
  }

  function levelUp() {
    if (state.xp < state.xpNext) return;
    state.xp -= state.xpNext;
    state.level++;
    state.xpNext = 4 + (state.level - 1) * 3;
    showUpgrade();
  }

  function addFloat(text, color, x, y, scale = 1) {
    state.floats.push({ text, color, x, y, life: 1.05, max: 1.05, scale });
  }

  function burst(x, y, color, amount = 8, power = 140) {
    for (let i = 0; i < amount; i++) {
      const a = rand(0, TAU);
      const sp = rand(power * 0.25, power);
      state.particles.push({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: rand(0.2, 0.6),
        max: 0.6,
        size: rand(1.5, 4),
        color,
      });
    }
  }

  function spawnEnemy() {
    if (state.enemies.length > 58) return;
    const { w, h } = stage;
    const margin = 34;
    const side = state.spawnSide++ % 4;
    let x = 0;
    let y = 0;
    if (side === 0) { x = rand(0, w); y = -margin; }
    else if (side === 1) { x = w + margin; y = rand(0, h); }
    else if (side === 2) { x = rand(0, w); y = h + margin; }
    else { x = -margin; y = rand(0, h); }

    const elite = Math.random() < Math.min(0.22, 0.05 + state.time * 0.005);
    const baseHp = 22 + state.time * 1.3;
    const r = elite ? rand(20, 25) : rand(13, 18);
    state.enemies.push({
      id: state.nextEnemyId++,
      x, y,
      r,
      elite,
      hp: elite ? baseHp * 2.6 : baseHp,
      maxHp: elite ? baseHp * 2.6 : baseHp,
      speed: elite ? rand(32, 44) : rand(42, 62) + state.time * 0.2,
      phase: rand(0, TAU),
      biteCd: 0,
      hit: 0,
      kbx: 0,
      kby: 0,
      dead: false,
    });
  }

  function shoot() {
    const p = state.player;
    let target = null;
    let best = Infinity;
    for (const e of state.enemies) {
      if (e.dead) continue;
      const d = dist(p.x, p.y, e.x, e.y);
      if (d < best) { best = d; target = e; }
    }
    if (target) {
      const desired = Math.atan2(target.y - p.y, target.x - p.x);
      p.aim = rotateToward(p.aim, desired, 14 * 0.016);
    }
    const spread = 0.11;
    const count = state.multishot;
    for (let i = 0; i < count; i++) {
      const offset = (i - (count - 1) / 2) * spread;
      const a = p.aim + offset + rand(-0.018, 0.018);
      const speed = 570;
      state.bullets.push({
        x: p.x + Math.cos(a) * 24,
        y: p.y + Math.sin(a) * 24,
        px: p.x + Math.cos(a) * 24,
        py: p.y + Math.sin(a) * 24,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        life: 1.15,
        damage: state.damage,
        hits: 0,
        maxHits: state.pierce + 1,
        hitSet: new Set(),
        angle: a,
      });
    }
    burst(p.x + Math.cos(p.aim) * 28, p.y + Math.sin(p.aim) * 28, "#ffe89c", 3, 100);
    state.fireTimer = state.fireInterval;
    audio.shoot();
    if (target) p.aim = Math.atan2(target.y - p.y, target.x - p.x);
  }

  function killEnemy(enemy) {
    enemy.dead = true;
    state.kills++;
    burst(enemy.x, enemy.y, enemy.elite ? "#ffd23f" : "#9b5cff", enemy.elite ? 22 : 12, 220);
    audio.pop();
    if (Math.random() < (enemy.elite ? 1 : 0.9)) {
      state.gems.push({
        x: enemy.x,
        y: enemy.y,
        vx: rand(-30, 30),
        vy: rand(-40, 10),
        value: enemy.elite ? 3 : 1,
        phase: rand(0, TAU),
      });
    }
  }

  function damagePlayer(amount) {
    const p = state.player;
    if (p.inv > 0 || state.phase !== "play") return;
    p.hp -= amount;
    p.inv = 1.0;
    p.hitFlash = 1;
    state.redFlash = 1;
    state.shake = 8;
    addFloat(`-${amount}`, "#ff5d6c", p.x, p.y - 30, 0.8);
    audio.hurt();
    api.vibrate?.([25, 25, 45]);
    if (p.hp <= 0) {
      p.hp = 0;
      state.phase = "dead";
      state.deadT = 0;
      burst(p.x, p.y, "#ff5d6c", 34, 260);
      audio.lose();
      setTimeout(() => {
        if (!state.ended) {
          state.ended = true;
          api.lose(`You survived ${state.time.toFixed(1)}s and got ${state.kills} kills. HP: 0.`);
        }
      }, 950);
    }
  }

  function chooseStart() {
    // collect xp and trigger upgrade when earned
    if (state.xp >= state.xpNext) levelUp();
  }

  function update(dt) {
    state.time += dt;
    state.intro = Math.max(0, state.intro - dt);
    state.shake = Math.max(0, state.shake - dt * 26);
    state.redFlash = Math.max(0, state.redFlash - dt * 3);
    state.levelFlash = Math.max(0, state.levelFlash - dt);

    const p = state.player;
    p.inv = Math.max(0, p.inv - dt);
    p.hitFlash = Math.max(0, p.hitFlash - dt * 2.5);

    if (state.phase !== "play") {
      if (state.phase === "dead") state.deadT += dt;
      if (state.phase === "won") state.winT += dt;
    } else {
      if (state.time >= SURVIVE && !state.ended) {
        state.phase = "won";
        state.winT = 0;
        state.ended = true;
        audio.win();
        const stars = p.hp >= 80 ? 3 : p.hp >= 50 ? 2 : 1;
        setTimeout(() => {
          api.win(stars, state.kills, {
            note: `Survived 30 seconds with ${Math.round(p.hp)} HP and ${state.kills} kills. The island is safer, allegedly.`,
          });
        }, 800);
      }

      // movement
      let mx = 0;
      let my = 0;
      if (input.isDown("arrowleft", "a")) mx -= 1;
      if (input.isDown("arrowright", "d")) mx += 1;
      if (input.isDown("arrowup", "w")) my -= 1;
      if (input.isDown("arrowdown", "s")) my += 1;
      if (mx || my) {
        const l = Math.hypot(mx, my);
        mx /= l; my /= l;
      } else if (state.joystick.active) {
        const l = Math.hypot(state.joystick.dx, state.joystick.dy);
        if (l > 4) {
          mx = state.joystick.dx / l;
          my = state.joystick.dy / l;
        }
      }
      const speed = clamp(Math.min(stage.w, stage.h) * 0.4, 140, 200) * state.speedMult;
      p.x = clamp(p.x + mx * speed * dt, 28, stage.w - 28);
      p.y = clamp(p.y + my * speed * dt, 64, stage.h - 30);
      if (mx || my) burst(p.x, p.y + 16, "rgba(62,233,165,0.25)", 1, 30);

      // auto-fire
      state.fireTimer -= dt;
      if (state.fireTimer <= 0) shoot();

      // spawn
      state.spawnTimer -= dt;
      if (state.spawnTimer <= 0) {
        const interval = Math.max(0.3, 0.85 - state.time * 0.018);
        state.spawnTimer = interval * rand(0.75, 1.15);
        spawnEnemy();
        if (state.time > 18 && Math.random() < 0.4) spawnEnemy();
        if (state.time > 26 && Math.random() < 0.45) spawnEnemy();
      }

      // enemies chase
      for (const e of state.enemies) {
        if (e.dead) continue;
        e.phase += dt;
        e.biteCd = Math.max(0, e.biteCd - dt);
        e.hit = Math.max(0, e.hit - dt * 8);
        const dx = p.x - e.x;
        const dy = p.y - e.y;
        const d = Math.hypot(dx, dy) || 1;
        e.x += (dx / d) * e.speed * dt + e.kbx * dt;
        e.y += (dy / d) * e.speed * dt + e.kby * dt;
        e.kbx *= 1 - dt * 8;
        e.kby *= 1 - dt * 8;
        if (d < e.r + 18 && e.biteCd <= 0) {
          damagePlayer(e.elite ? 14 : 9);
          e.biteCd = 1.4;
          e.kbx = -(dx / d) * 160;
          e.kby = -(dy / d) * 160;
        }
      }

      // separation (keeps the horde readable)
      for (let i = 0; i < state.enemies.length; i++) {
        const a = state.enemies[i];
        if (a.dead) continue;
        for (let j = i + 1; j < state.enemies.length; j++) {
          const b = state.enemies[j];
          if (b.dead) continue;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const dd = Math.hypot(dx, dy) || 1;
          const overlap = a.r + b.r - dd;
          if (overlap > 0 && dd < a.r + b.r) {
            const push = overlap * 0.5;
            const nx = dx / dd;
            const ny = dy / dd;
            a.x -= nx * push * 0.5;
            a.y -= ny * push * 0.5;
            b.x += nx * push * 0.5;
            b.y += ny * push * 0.5;
          }
        }
      }

      // bullets
      for (const b of state.bullets) {
        b.px = b.x;
        b.py = b.y;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.life -= dt;
        for (const e of state.enemies) {
          if (e.dead || b.hitSet.has(e.id)) continue;
          if (dist(b.x, b.y, e.x, e.y) < e.r + 4) {
            b.hitSet.add(e.id);
            e.hp -= b.damage;
            e.hit = 1;
            e.kbx += b.vx * 0.08;
            e.kby += b.vy * 0.08;
            burst(b.x, b.y, "#ffe89c", 4, 95);
            b.hits++;
            if (e.hp <= 0) killEnemy(e);
            if (b.hits >= b.maxHits) { b.life = 0; break; }
          }
        }
      }
      state.bullets = state.bullets.filter((b) => b.life > 0 && b.x > -30 && b.x < stage.w + 30 && b.y > -30 && b.y < stage.h + 30);
      state.enemies = state.enemies.filter((e) => !e.dead);

      // gems
      for (const g of state.gems) {
        g.phase += dt;
        g.vx *= 1 - dt * 1.6;
        g.vy *= 1 - dt * 1.6;
        g.x += g.vx * dt;
        g.y += g.vy * dt;
        const dx = p.x - g.x;
        const dy = p.y - g.y;
        const d = Math.hypot(dx, dy) || 1;
        if (d < state.magnet) {
          const pull = clamp((state.magnet - d) * 5.5, 60, 900);
          g.x += (dx / d) * pull * dt;
          g.y += (dy / d) * pull * dt;
        }
        if (d < 22) {
          g.dead = true;
          state.xp += g.value;
          audio.eat();
          burst(g.x, g.y, "#62e8ff", 5, 100);
          chooseStart();
        }
      }
      state.gems = state.gems.filter((g) => !g.dead && g.y < stage.h + 60);
    }

    // particles / floats
    for (const part of state.particles) {
      part.life -= dt;
      part.x += part.vx * dt;
      part.y += part.vy * dt;
      part.vx *= 1 - dt * 1.4;
      part.vy *= 1 - dt * 1.4;
    }
    state.particles = state.particles.filter((part) => part.life > 0);

    for (const f of state.floats) {
      f.life -= dt;
      f.y -= 32 * dt;
    }
    state.floats = state.floats.filter((f) => f.life > 0);

    state.bullets = state.bullets.filter((b) => b.life > 0);
  }

  function drawArena(ctx, w, h) {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#0d2a26");
    g.addColorStop(0.55, "#0a1f1c");
    g.addColorStop(1, "#061412");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // dirt patches
    ctx.save();
    for (let i = 0; i < 9; i++) {
      const x = ((i * 167 + 40) % w);
      const y = ((i * 211 + 30) % h);
      ctx.globalAlpha = 0.15;
      ctx.fillStyle = i % 2 ? "#4b6b3f" : "#223f35";
      ctx.beginPath();
      ctx.ellipse(x, y, 40 + (i % 3) * 22, 18 + (i % 2) * 9, i, 0, TAU);
      ctx.fill();
    }
    ctx.restore();

    // grass tufts
    ctx.save();
    ctx.strokeStyle = "rgba(87, 183, 121, 0.3)";
    ctx.lineWidth = 1.4;
    for (let i = 0; i < 44; i++) {
      const x = ((i * 97.3) % w);
      const y = ((i * 173.7 + 15) % h);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + 3, y - 6, x + 6, y - 9);
      ctx.moveTo(x + 3, y);
      ctx.quadraticCurveTo(x + 2, y - 7, x - 1, y - 10);
      ctx.stroke();
    }
    ctx.restore();

    // fireflies
    for (let i = 0; i < 10; i++) {
      const x = ((i * 113 + Math.sin(state.time * 0.35 + i) * 24) % (w + 20)) - 10;
      const y = ((i * 79 + Math.cos(state.time * 0.3 + i * 2) * 18) % (h + 20)) - 10;
      ctx.globalAlpha = 0.25 + Math.sin(state.time * 2 + i) * 0.18;
      ctx.fillStyle = "#b9ffb0";
      ctx.beginPath();
      ctx.arc(x, y, 1.4, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    const vign = ctx.createRadialGradient(w / 2, h / 2, h * 0.22, w / 2, h / 2, h * 0.8);
    vign.addColorStop(0, "rgba(0,0,0,0)");
    vign.addColorStop(1, "rgba(0,0,0,0.46)");
    ctx.fillStyle = vign;
    ctx.fillRect(0, 0, w, h);
  }

  function drawEnemies(ctx) {
    for (const e of state.enemies) {
      const bob = Math.sin(state.time * 4 + e.phase) * 2;
      const squash = 1 + Math.sin(state.time * 6 + e.phase) * 0.045;
      const size = e.r * 2.7;
      ctx.save();
      ctx.fillStyle = "rgba(0,0,0,0.26)";
      ctx.beginPath();
      ctx.ellipse(e.x, e.y + e.r * 1.2, e.r * 0.85, e.r * 0.24, 0, 0, TAU);
      ctx.fill();
      if (e.elite) {
        ctx.globalAlpha = 0.35 + Math.sin(state.time * 4 + e.phase) * 0.12;
        ctx.strokeStyle = "#ffd23f";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.r + 7, 0, TAU);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      ctx.translate(e.x, e.y + bob);
      ctx.scale(1 / squash, squash);
      if (e.hit > 0) {
        ctx.globalAlpha = 0.55 + 0.45 * Math.sin(e.hit * 30);
      }
      drawSprite(ctx, "slime", 0, 0, size, { rot: Math.sin(state.time * 2.4 + e.phase) * 0.05 });
      ctx.restore();

      if (e.hp < e.maxHp || e.elite) {
        const bw = Math.max(22, e.r * 1.8);
        const bx = e.x - bw / 2;
        const by = e.y - e.r * 1.55;
        ctx.fillStyle = "rgba(0,0,0,0.45)";
        roundRect(ctx, bx, by, bw, 4, 2);
        ctx.fill();
        const pct = clamp(e.hp / e.maxHp, 0, 1);
        ctx.fillStyle = e.elite ? "#ffd23f" : "#3ee9a5";
        roundRect(ctx, bx, by, bw * pct, 4, 2);
        ctx.fill();
      }
    }
  }

  function drawGems(ctx) {
    for (const g of state.gems) {
      const bob = Math.sin(state.time * 4 + g.phase) * 3;
      const s = g.value > 1 ? 24 : 18;
      ctx.save();
      ctx.shadowColor = "rgba(98,232,255,0.65)";
      ctx.shadowBlur = 12;
      drawSprite(ctx, "gem", g.x, g.y + bob, s, { rot: Math.sin(state.time * 2 + g.phase) * 0.16 });
      ctx.restore();
    }
  }

  function drawBullets(ctx) {
    for (const b of state.bullets) {
      ctx.save();
      ctx.strokeStyle = "rgba(255, 232, 156, 0.4)";
      ctx.lineWidth = 5;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(b.px, b.py);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.strokeStyle = "#fff4be";
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(b.px, b.py);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(b.x, b.y, 1.6, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawPlayer(ctx) {
    const p = state.player;
    const flicker = p.inv > 0 && Math.floor(state.time * 18) % 2 === 0;
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + 21, 20, 6, 0, 0, TAU);
    ctx.fill();

    ctx.globalAlpha = flicker ? 0.45 : 1;
    drawSprite(ctx, "survivor", p.x, p.y, 64, { rot: p.aim });

    // muzzle flash
    if (state.fireTimer > state.fireInterval - 0.075) {
      const mx = p.x + Math.cos(p.aim) * 32;
      const my = p.y + Math.sin(p.aim) * 32;
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = "#ffe89c";
      ctx.beginPath();
      ctx.arc(mx, my, 5 + Math.random() * 3, 0, TAU);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.6)";
      ctx.beginPath();
      ctx.arc(mx, my, 2.4, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawHud(ctx, w, h) {
    const p = state.player;
    const pad = 11;
    const pillH = 30;

    // HP
    ctx.save();
    ctx.fillStyle = "rgba(5, 14, 12, 0.62)";
    roundRect(ctx, pad, pad, clamp(w * 0.46, 130, 180), pillH, 9);
    ctx.fill();
    ctx.fillStyle = "#ff5d6c";
    ctx.font = `900 11px ${DISPLAY}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText("HP", pad + 9, pad + pillH / 2 + 1);
    const hpX = pad + 30;
    const hpW = clamp(w * 0.46, 130, 180) - 40;
    ctx.fillStyle = "rgba(255,255,255,0.13)";
    roundRect(ctx, hpX, pad + 11, hpW, 8, 4);
    ctx.fill();
    const hpPct = clamp(p.hp / p.maxHp, 0, 1);
    const hpColor = hpPct > 0.5 ? "#3ee9a5" : hpPct > 0.25 ? "#ffd23f" : "#ff5d6c";
    ctx.fillStyle = hpColor;
    roundRect(ctx, hpX, pad + 11, Math.max(2, hpW * hpPct), 8, 4);
    ctx.fill();
    ctx.restore();

    // timer
    ctx.save();
    const remaining = Math.max(0, SURVIVE - state.time);
    ctx.fillStyle = "rgba(5, 14, 12, 0.62)";
    roundRect(ctx, w - pad - 70, pad, 70, pillH, 9);
    ctx.fill();
    ctx.fillStyle = remaining <= 5 ? "#ffd23f" : "#fff";
    ctx.font = `900 14px ${DISPLAY}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`${remaining.toFixed(1)}s`, w - pad - 35, pad + pillH / 2 + 1);
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.font = `800 6.5px ${DISPLAY}`;
    ctx.fillText("SURVIVE", w - pad - 35, pad + pillH + 7);
    ctx.restore();

    // XP bar
    const xpW = w - pad * 2;
    const xpY = h - 17;
    ctx.save();
    ctx.fillStyle = "rgba(5, 14, 12, 0.62)";
    roundRect(ctx, pad, xpY - 7, xpW, 18, 7);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    roundRect(ctx, pad + 8, xpY, xpW - 16, 5, 3);
    ctx.fill();
    const xpPct = clamp(state.xp / state.xpNext, 0, 1);
    ctx.fillStyle = "#62e8ff";
    roundRect(ctx, pad + 8, xpY, Math.max(2, (xpW - 16) * xpPct), 5, 3);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = `900 7.5px ${DISPLAY}`;
    ctx.textAlign = "left";
    ctx.fillText(`LV ${state.level}`, pad + 10, xpY - 11);
    ctx.textAlign = "right";
    ctx.fillStyle = "#b9ffb0";
    ctx.fillText(`${state.kills} KILLS`, w - pad - 10, xpY - 11);
    ctx.restore();
  }

  function draw() {
    const { ctx } = stage;
    const w = stage.w;
    const h = stage.h;
    ctx.save();
    if (state.shake > 0.1) ctx.translate(rand(-state.shake, state.shake), rand(-state.shake, state.shake));

    drawArena(ctx, w, h);
    drawGems(ctx);
    drawEnemies(ctx);
    drawBullets(ctx);
    drawPlayer(ctx);

    for (const part of state.particles) {
      const a = clamp(part.life / part.max, 0, 1);
      ctx.globalAlpha = a;
      ctx.fillStyle = part.color;
      ctx.beginPath();
      ctx.arc(part.x, part.y, part.size, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    for (const f of state.floats) {
      const a = clamp(f.life / f.max, 0, 1);
      ctx.globalAlpha = a;
      ctx.fillStyle = f.color;
      ctx.font = `900 ${Math.round(13 * f.scale)}px ${DISPLAY}`;
      ctx.textAlign = "center";
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;

    drawHud(ctx, w, h);

    if (state.joystick.active) {
      const { x, y, dx, dy } = state.joystick;
      ctx.save();
      ctx.globalAlpha = 0.26;
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, 44, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = "#3ee9a5";
      ctx.beginPath();
      ctx.arc(x + dx, y + dy, 16, 0, TAU);
      ctx.fill();
      ctx.restore();
    }

    if (state.intro > 0 && state.phase === "play") {
      const a = clamp(state.intro > 2.8 ? (3.4 - state.intro) * 2 : state.intro / 1.2, 0, 1);
      ctx.save();
      ctx.globalAlpha = a * 0.9;
      ctx.textAlign = "center";
      ctx.fillStyle = "#d9ffe9";
      ctx.font = `900 ${Math.round(clamp(w * 0.07, 22, 32))}px ${DISPLAY}`;
      ctx.fillText("SURVIVE 30s", w / 2, h * 0.22);
      ctx.fillStyle = "rgba(217,255,233,0.6)";
      ctx.font = `800 ${Math.round(clamp(w * 0.03, 10, 13))}px ${DISPLAY}`;
      ctx.fillText("DRAG TO RUN · THE GUN AIMS ITSELF", w / 2, h * 0.22 + 23);
      ctx.restore();
    }

    if (state.redFlash > 0) {
      ctx.fillStyle = `rgba(255, 30, 60, ${state.redFlash * 0.16})`;
      ctx.fillRect(0, 0, w, h);
    }

    if (state.phase === "dead") {
      ctx.fillStyle = "rgba(6, 12, 10, 0.5)";
      ctx.fillRect(0, 0, w, h);
    }

    ctx.restore();
  }

  let loop = createLoop((dt) => {
    update(dt);
    draw();
  });

  return {
    destroy() {
      loop.stop();
      input.destroy();
      stopPointer();
      upLayer.remove();
      stage.destroy();
    },
  };
}
