import {
  createStage, createLoop, bindPointer, createKeyboard,
  clamp, lerp, rand, roundRect, TAU, dist, easeOutCubic,
} from "../util.js";
import { drawSprite } from "../sprites.js";
import { audio } from "../audio.js";

const DISPLAY = '"Arial Rounded MT Bold", "Trebuchet MS", system-ui, sans-serif';
const DURATION = 20;
const PLAYER_RADIUS = 5.5;

export function mount(root, api) {
  root.innerHTML = "";
  const stage = createStage(root);
  const input = createKeyboard();

  const state = {
    phase: "play",
    time: 0,
    hearts: 3,
    player: {
      x: stage.w / 2,
      y: stage.h * 0.72,
      tx: stage.w / 2,
      ty: stage.h * 0.72,
      inv: 0,
      trail: [],
    },
    bullets: [],
    particles: [],
    grazes: 0,
    shake: 0,
    flash: 0,
    spiralAngle: 0,
    timers: { aimed: 1.0, spiral: 0, rain: 1.2, ring: 2.2, side: 2.5 },
    drag: { active: false, anchorX: 0, anchorY: 0, px: 0, py: 0 },
    ended: false,
    intro: 3.6,
    deadT: 0,
    winT: 0,
    bossPulse: 0,
  };

  const stopPointer = bindPointer(stage.canvas, {
    down(p) {
      if (state.phase !== "play") return;
      state.drag.active = true;
      state.drag.anchorX = p.x;
      state.drag.anchorY = p.y;
      state.drag.px = state.player.x;
      state.drag.py = state.player.y;
    },
    move(p) {
      if (!state.drag.active || state.phase !== "play") return;
      const dx = p.x - state.drag.anchorX;
      const dy = p.y - state.drag.anchorY;
      state.player.tx = clamp(state.drag.px + dx * 1.12, 26, stage.w - 26);
      state.player.ty = clamp(state.drag.py + dy * 1.12, Math.max(112, stage.h * 0.34), stage.h - 28);
    },
    up() { state.drag.active = false; },
    leave() { state.drag.active = false; },
  });

  function boss() {
    return { x: stage.w / 2, y: stage.h * 0.18, size: clamp(stage.w * 0.52, 160, 260) };
  }

  function burst(x, y, color, amount = 8, power = 150) {
    for (let i = 0; i < amount; i++) {
      const a = rand(0, TAU);
      const sp = rand(power * 0.2, power);
      state.particles.push({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: rand(0.2, 0.6),
        max: 0.6,
        size: rand(1, 3.8),
        color,
      });
    }
  }

  function addBullet(x, y, vx, vy, opts = {}) {
    const r = opts.r ?? rand(3.6, 5.4);
    state.bullets.push({
      x, y, vx, vy, r,
      color: opts.color || (Math.random() < 0.4 ? "#ff7ab6" : "#79e9ff"),
      phase: rand(0, TAU),
      grazed: false,
      life: opts.life ?? 6,
      trail: opts.trail ?? true,
    });
  }

  function aimedShot(spread = 0) {
    const b = boss();
    const p = state.player;
    const base = Math.atan2(p.y - b.y, p.x - b.x);
    addBullet(b.x + Math.cos(base) * 26, b.y + 34, Math.cos(base + spread) * 165, Math.sin(base + spread) * 165, {
      color: "#ff5d8c", r: 6.2,
    });
    state.bossPulse = 1;
    audio.shoot();
  }

  function spiralShot() {
    const b = boss();
    const arms = 2 + Math.floor(state.time / 5);
    const speed = 82 + state.time * 1.25;
    for (let i = 0; i < arms; i++) {
      const a = state.spiralAngle + (i * TAU) / arms;
      addBullet(b.x + Math.cos(a) * 18, b.y + 24 + Math.sin(a) * 10, Math.cos(a) * speed, Math.sin(a) * speed, {
        color: i % 2 ? "#79e9ff" : "#ff7ab6",
        r: 4.5,
      });
    }
    state.spiralAngle += 0.19;
  }

  function rainShot() {
    const w = stage.w;
    const x = rand(14, w - 14);
    addBullet(x, -14, rand(-18, 18), rand(105, 145), { color: "#b68cff", r: 4.2, life: 7 });
  }

  function ringShot() {
    const b = boss();
    const count = 14;
    const speed = 78 + state.time * 1.2;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * TAU + state.time * 0.2;
      addBullet(b.x, b.y + 30, Math.cos(a) * speed, Math.sin(a) * speed, {
        color: i % 2 ? "#ffd23f" : "#ff7ab6",
        r: 4.4,
      });
    }
    state.bossPulse = 1.5;
  }

  function sideShot() {
    const w = stage.w;
    const left = Math.random() < 0.5;
    const x = left ? -16 : w + 16;
    const y = rand(stage.h * 0.3, stage.h * 0.78);
    const p = state.player;
    const a = Math.atan2(p.y - y, p.x - x);
    addBullet(x, y, Math.cos(a) * 175, Math.sin(a) * 175, { color: "#79e9ff", r: 5.6 });
    state.bossPulse = 0.8;
  }

  function hitPlayer() {
    const p = state.player;
    if (p.inv > 0 || state.phase !== "play") return;
    state.hearts--;
    p.inv = 1.5;
    state.flash = 1;
    state.shake = 12;
    burst(p.x, p.y, "#ff5d6c", 26, 250);
    audio.hurt();
    api.vibrate?.([30, 40, 70]);
    // clear nearby bullets so the next hit is fair
    for (const b of state.bullets) {
      if (dist(p.x, p.y, b.x, b.y) < 105) {
        b.life = 0;
        burst(b.x, b.y, "#ffd23f", 4, 100);
      }
    }
    if (state.hearts <= 0) {
      state.phase = "dead";
      state.deadT = 0;
      audio.lose();
      setTimeout(() => {
        if (!state.ended) {
          state.ended = true;
          api.lose(`You lasted ${state.time.toFixed(1)}s. The eye boss is still undefeated.`);
        }
      }, 950);
    }
  }

  function update(dt) {
    state.time += dt;
    state.intro = Math.max(0, state.intro - dt);
    state.shake = Math.max(0, state.shake - dt * 26);
    state.flash = Math.max(0, state.flash - dt * 2.4);
    state.bossPulse = Math.max(0, state.bossPulse - dt * 2.4);
    input.endFrame();

    const p = state.player;
    p.inv = Math.max(0, p.inv - dt);

    if (state.phase === "play") {
      if (state.time >= DURATION) {
        state.phase = "won";
        state.winT = 0;
        if (!state.ended) {
          state.ended = true;
          audio.win();
          const stars = state.hearts >= 3 ? 3 : state.hearts >= 2 ? 2 : 1;
          setTimeout(() => {
            api.win(stars, state.grazes, {
              note: `${state.hearts} heart${state.hearts === 1 ? "" : "s"} left and ${state.grazes} bullet grazes. Certified ad survivor.`,
            });
          }, 700);
        }
      }

      // movement
      let kx = 0;
      let ky = 0;
      if (input.isDown("arrowleft", "a")) kx -= 1;
      if (input.isDown("arrowright", "d")) kx += 1;
      if (input.isDown("arrowup", "w")) ky -= 1;
      if (input.isDown("arrowdown", "s")) ky += 1;
      if (kx || ky) {
        const l = Math.hypot(kx, ky);
        p.tx = clamp(p.tx + (kx / l) * 280 * dt, 26, stage.w - 26);
        p.ty = clamp(p.ty + (ky / l) * 280 * dt, Math.max(112, stage.h * 0.34), stage.h - 28);
      }
      p.x = lerp(p.x, p.tx, 1 - Math.exp(-18 * dt));
      p.y = lerp(p.y, p.ty, 1 - Math.exp(-18 * dt));

      p.trail.unshift({ x: p.x, y: p.y });
      if (p.trail.length > 12) p.trail.pop();

      // director
      const t = state.time;
      state.timers.aimed -= dt;
      if (state.timers.aimed <= 0) {
        aimedShot(rand(-0.06, 0.06));
        state.timers.aimed = Math.max(0.34, 0.82 - t * 0.012);
      }
      if (t > 3.0) {
        state.timers.spiral -= dt;
        if (state.timers.spiral <= 0) {
          spiralShot();
          state.timers.spiral = Math.max(0.09, 0.15 - t * 0.0015);
        }
      }
      if (t > 7.5) {
        state.timers.rain -= dt;
        if (state.timers.rain <= 0) {
          rainShot();
          state.timers.rain = rand(0.13, 0.26);
        }
      }
      if (t > 11) {
        state.timers.ring -= dt;
        if (state.timers.ring <= 0) {
          ringShot();
          state.timers.ring = Math.max(1.05, 1.8 - (t - 10) * 0.06);
        }
      }
      if (t > 14.5) {
        state.timers.side -= dt;
        if (state.timers.side <= 0) {
          sideShot();
          state.timers.side = rand(0.7, 1.3);
        }
      }
      if (t > 16) {
        state.timers.aimed -= dt * 0.35;
      }

      // bullets
      for (const b of state.bullets) {
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.life -= dt;
        const d = dist(p.x, p.y, b.x, b.y);
        if (d < PLAYER_RADIUS + b.r) {
          b.life = 0;
          hitPlayer();
        } else if (!b.grazed && d < 30 + b.r && p.inv <= 0) {
          b.grazed = true;
          state.grazes++;
          burst(b.x, b.y, "#fff", 3, 60);
          if (Math.random() < 0.32) audio.graze();
        }
      }
      state.bullets = state.bullets.filter((b) => b.life > 0 && b.x > -40 && b.x < stage.w + 40 && b.y > -50 && b.y < stage.h + 50);
      state.bullets = state.bullets.filter((b) => b.y < stage.h + 30);
    } else if (state.phase === "won") {
      state.winT += dt;
      for (const b of state.bullets) b.life -= dt * 2;
      state.bullets = state.bullets.filter((b) => b.life > 0);
    } else if (state.phase === "dead") {
      state.deadT += dt;
    }

    for (const part of state.particles) {
      part.life -= dt;
      part.x += part.vx * dt;
      part.y += part.vy * dt;
      part.vx *= 1 - dt * 1.3;
      part.vy *= 1 - dt * 1.3;
    }
    state.particles = state.particles.filter((part) => part.life > 0);
  }

  function drawBackground(ctx, w, h) {
    const g = ctx.createRadialGradient(w / 2, h * 0.2, 20, w / 2, h * 0.55, Math.max(w, h) * 0.9);
    g.addColorStop(0, "#221a4a");
    g.addColorStop(0.45, "#100b27");
    g.addColorStop(1, "#05030c");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // vortex rings
    ctx.save();
    ctx.translate(w / 2, h * 0.2);
    for (let i = 0; i < 7; i++) {
      const r = w * (0.18 + i * 0.085);
      ctx.strokeStyle = i % 2 ? "rgba(255,122,182,0.08)" : "rgba(121,233,255,0.07)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();

    // stars
    for (let i = 0; i < 34; i++) {
      const x = ((i * 113.7) % w);
      const y = ((i * 71.3 + state.time * (2 + (i % 4))) % h);
      const a = 0.2 + Math.sin(state.time * 2 + i) * 0.18;
      ctx.globalAlpha = clamp(a, 0.03, 0.6);
      ctx.fillStyle = i % 5 === 0 ? "#ffd23f" : "#c8c2ff";
      ctx.beginPath();
      ctx.arc(x, y, i % 7 === 0 ? 1.8 : 1, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // floor grid
    ctx.save();
    ctx.strokeStyle = "rgba(121,233,255,0.045)";
    ctx.lineWidth = 1;
    for (let y = h * 0.46; y < h; y += 34) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    for (let x = 0; x < w; x += 34) {
      ctx.beginPath();
      ctx.moveTo(x, h * 0.46);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawBoss(ctx, w, h) {
    const b = boss();
    const bob = Math.sin(state.time * 1.6) * 5;
    const scale = 1 + state.bossPulse * 0.045;
    ctx.save();
    ctx.translate(b.x, b.y + bob);
    ctx.rotate(Math.sin(state.time * 0.6) * 0.02);
    ctx.scale(scale, scale);
    ctx.shadowColor = state.bossPulse > 0.2 ? "rgba(255, 93, 140, 0.85)" : "rgba(155, 92, 255, 0.4)";
    ctx.shadowBlur = 34;
    drawSprite(ctx, "eyeBoss", 0, 0, b.size);
    ctx.restore();

    // tiny orbiting motes
    for (let i = 0; i < 3; i++) {
      const a = state.time * 1.2 + (i * TAU) / 3;
      const x = b.x + Math.cos(a) * b.size * 0.55;
      const y = b.y + bob + Math.sin(a) * b.size * 0.24;
      ctx.globalAlpha = 0.45;
      ctx.fillStyle = i % 2 ? "#ff7ab6" : "#79e9ff";
      ctx.beginPath();
      ctx.arc(x, y, 2.2, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // boss health-ish timer bar
    const barW = w * 0.42;
    const barX = w / 2 - barW / 2;
    const barY = Math.max(50, b.y + b.size * 0.46);
    ctx.save();
    ctx.fillStyle = "rgba(5,3,12,0.6)";
    roundRect(ctx, barX, barY, barW, 7, 4);
    ctx.fill();
    ctx.fillStyle = "#ff7ab6";
    roundRect(ctx, barX, barY, barW * clamp(1 - state.time / DURATION, 0, 1), 7, 4);
    ctx.fill();
    ctx.restore();
  }

  function drawPlayer(ctx) {
    const p = state.player;
    const flicker = p.inv > 0 && Math.floor(state.time * 20) % 2 === 0;
    ctx.save();
    for (let i = p.trail.length - 1; i >= 0; i--) {
      const t = 1 - i / p.trail.length;
      const q = p.trail[i];
      ctx.globalAlpha = t * 0.22;
      ctx.fillStyle = "#79e9ff";
      ctx.beginPath();
      ctx.arc(q.x, q.y, 6 * t + 1, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    if (p.inv > 0) {
      ctx.strokeStyle = `rgba(121,233,255,${0.4 + Math.sin(state.time * 12) * 0.2})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 19, 0, TAU);
      ctx.stroke();
    }

    ctx.globalAlpha = flicker ? 0.5 : 1;
    ctx.shadowColor = "rgba(121,233,255,0.7)";
    ctx.shadowBlur = 16;
    drawSprite(ctx, "fighter", p.x, p.y, 34, { rot: Math.sin(state.time * 3) * 0.04 });
    ctx.restore();

    // tiny hitbox dot for clarity
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(p.x, p.y, PLAYER_RADIUS, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function drawHeart(ctx, x, y, size, filled) {
    ctx.save();
    ctx.translate(x, y);
    ctx.beginPath();
    ctx.moveTo(0, size * 0.32);
    ctx.bezierCurveTo(-size * 0.62, -size * 0.18, -size * 0.34, -size * 0.58, 0, -size * 0.25);
    ctx.bezierCurveTo(size * 0.34, -size * 0.58, size * 0.62, -size * 0.18, 0, size * 0.32);
    ctx.closePath();
    if (filled) {
      ctx.fillStyle = "#ff5d6c";
      ctx.fill();
      ctx.strokeStyle = "#20142e";
      ctx.lineWidth = 2;
      ctx.stroke();
    } else {
      ctx.strokeStyle = "rgba(255,255,255,0.25)";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawHud(ctx, w, h) {
    const pad = 12;
    const top = 10;
    ctx.save();
    ctx.fillStyle = "rgba(5, 3, 12, 0.6)";
    roundRect(ctx, pad, top, 106, 32, 10);
    ctx.fill();
    for (let i = 0; i < 3; i++) drawHeart(ctx, pad + 20 + i * 27, top + 16, 18, i < state.hearts);

    const remaining = Math.max(0, DURATION - state.time);
    ctx.fillStyle = "rgba(5, 3, 12, 0.6)";
    roundRect(ctx, w - pad - 64, top, 64, 32, 10);
    ctx.fill();
    ctx.fillStyle = remaining < 5 ? "#ffd23f" : "#fff";
    ctx.font = `900 15px ${DISPLAY}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`${remaining.toFixed(1)}s`, w - pad - 32, top + 17);

    ctx.fillStyle = "rgba(5, 3, 12, 0.5)";
    roundRect(ctx, w - pad - 78, top + 39, 78, 18, 6);
    ctx.fill();
    ctx.fillStyle = "#79e9ff";
    ctx.font = `900 8px ${DISPLAY}`;
    ctx.textAlign = "center";
    ctx.fillText(`GRAZE ${state.grazes}`, w - pad - 39, top + 49);
    ctx.restore();
  }

  function drawBullets(ctx) {
    for (const b of state.bullets) {
      ctx.save();
      ctx.shadowColor = b.color;
      ctx.shadowBlur = 10;
      ctx.fillStyle = b.color;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, TAU);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.beginPath();
      ctx.arc(b.x - b.r * 0.22, b.y - b.r * 0.22, Math.max(1, b.r * 0.36), 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  }

  function draw() {
    const { ctx } = stage;
    const w = stage.w;
    const h = stage.h;
    ctx.save();
    if (state.shake > 0.1) ctx.translate(rand(-state.shake, state.shake), rand(-state.shake, state.shake));

    drawBackground(ctx, w, h);
    drawBoss(ctx, w, h);
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
    drawHud(ctx, w, h);

    if (state.drag.active) {
      const { anchorX, anchorY } = state.drag;
      ctx.save();
      ctx.globalAlpha = 0.22;
      ctx.strokeStyle = "#79e9ff";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(anchorX, anchorY, 30, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }

    if (state.intro > 0 && state.phase === "play") {
      const a = clamp(state.intro > 3 ? (3.6 - state.intro) * 2 : state.intro / 1.2, 0, 1);
      ctx.save();
      ctx.globalAlpha = a * 0.9;
      ctx.textAlign = "center";
      ctx.fillStyle = "#e7e2ff";
      ctx.font = `900 ${Math.round(clamp(w * 0.07, 22, 32))}px ${DISPLAY}`;
      ctx.fillText("DODGE THE EYE", w / 2, h * 0.62);
      ctx.fillStyle = "rgba(231,226,255,0.58)";
      ctx.font = `800 ${Math.round(clamp(w * 0.03, 10, 13))}px ${DISPLAY}`;
      ctx.fillText("DRAG TO MOVE · GRAZE FOR STYLE", w / 2, h * 0.62 + 23);
      ctx.restore();
    }

    if (state.flash > 0) {
      ctx.fillStyle = `rgba(255, 60, 90, ${state.flash * 0.2})`;
      ctx.fillRect(0, 0, w, h);
    }

    if (state.phase === "dead") {
      ctx.fillStyle = "rgba(5, 3, 12, 0.55)";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#fff";
      ctx.textAlign = "center";
      ctx.font = `900 ${Math.round(clamp(w * 0.085, 27, 40))}px ${DISPLAY}`;
      ctx.fillText("RIGHT IN THE EYE", w / 2, h * 0.45);
    }

    ctx.restore();
  }

  const loop = createLoop((dt) => {
    update(dt);
    draw();
  });

  return {
    destroy() {
      loop.stop();
      input.destroy();
      stopPointer();
      stage.destroy();
    },
  };
}
