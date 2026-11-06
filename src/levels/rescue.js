import {
  createStage, createLoop, bindPointer,
  clamp, lerp, rand, roundRect, TAU, dist, easeOutCubic,
} from "../util.js";
import { drawSprite } from "../sprites.js";
import { audio } from "../audio.js";

const DISPLAY = '"Arial Rounded MT Bold", "Trebuchet MS", system-ui, sans-serif';
const DURATION = 20;
const LINE_LIFE = 8.5;
const LINE_WIDTH = 9;
const SPAWN_TIMES = [
  0.8, 1.7, 2.5, 3.4, 4.3, 5.2, 6.2, 7.1, 8.0, 8.4,
  9.5, 10.6, 11.7, 12.8, 13.2, 14.3, 15.3, 16.2, 17.2, 18.1,
];

export function mount(root, api) {
  root.innerHTML = "";
  const stage = createStage(root);

  const state = {
    phase: "play",
    time: 0,
    hearts: 3,
    ink: 760,
    maxInk: 900,
    lines: [],
    drawing: null,
    bees: [],
    spawnIndex: 0,
    particles: [],
    blocked: 0,
    shake: 0,
    flash: 0,
    dogFlash: 0,
    bubble: { text: "HELP!", life: 2.6 },
    ended: false,
    winT: 0,
    loseT: 0,
    tickle: 0,
  };

  const dog = () => ({
    x: stage.w / 2,
    y: stage.h * 0.84,
    size: clamp(Math.min(stage.w, stage.h) * 0.27, 88, 124),
    radius: clamp(Math.min(stage.w, stage.h) * 0.085, 26, 38),
  });

  const stopPointer = bindPointer(stage.canvas, {
    down(p) {
      if (state.phase !== "play" || state.ink < 10) return;
      state.drawing = { points: [{ x: p.x, y: p.y }], born: state.time };
      audio.tap();
    },
    move(p) {
      if (!state.drawing || state.phase !== "play") return;
      const pts = state.drawing.points;
      const last = pts[pts.length - 1];
      const d = dist(last.x, last.y, p.x, p.y);
      if (d < 6) return;
      const step = Math.min(d, 18);
      const nx = last.x + ((p.x - last.x) / d) * step;
      const ny = last.y + ((p.y - last.y) / d) * step;
      if (state.ink < step) {
        finishLine();
        return;
      }
      state.ink -= step;
      pts.push({ x: nx, y: ny });
      if (pts.length > 220) finishLine();
    },
    up() { finishLine(); },
    leave() { finishLine(); },
  });

  function finishLine() {
    if (!state.drawing) return;
    const line = state.drawing;
    state.drawing = null;
    if (line.points.length < 2) return;
    state.lines.push({ points: line.points, age: 0 });
    audio.splash();
  }

  function spawnBee(index) {
    const { w, h } = stage;
    const fromSide = index % 7 === 4;
    let x, y, vx, vy;
    if (fromSide) {
      const left = index % 2 === 0;
      x = left ? -18 : w + 18;
      y = rand(h * 0.2, h * 0.5);
      vx = (left ? 1 : -1) * rand(70, 120);
      vy = rand(-10, 40);
    } else {
      x = rand(w * 0.12, w * 0.88);
      y = -20;
      vx = rand(-35, 35);
      vy = rand(20, 60);
    }
    state.bees.push({
      x, y, vx, vy,
      r: clamp(Math.min(w, h) * 0.019, 9, 14),
      phase: rand(0, TAU),
      blocked: false,
      born: state.time,
    });
  }

  function burst(x, y, color, amount = 10, power = 150) {
    for (let i = 0; i < amount; i++) {
      const a = rand(0, TAU);
      const sp = rand(power * 0.2, power);
      state.particles.push({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: rand(0.3, 0.7),
        max: 0.7,
        size: rand(1.5, 4),
        color,
      });
    }
  }

  function hitDog(bee) {
    const d = dog();
    state.hearts--;
    state.dogFlash = 1;
    state.shake = 10;
    state.flash = 0.8;
    state.bubble = { text: state.hearts > 0 ? "OUCH!" : "NOOO!", life: 1.6 };
    burst(d.x, d.y - d.size * 0.2, "#ff5d6c", 24, 220);
    audio.hurt();
    api.vibrate?.([25, 30, 50]);
    if (state.hearts <= 0 && state.phase === "play") {
      state.phase = "lost";
      state.loseT = 0;
      setTimeout(() => {
        if (!state.ended) {
          state.ended = true;
          api.lose("The bees got the dog. The dog has filed a formal complaint.");
        }
      }, 1000);
    }
  }

  function collideLines(bee) {
    if (bee.y > stage.h + 30) return;
    for (const line of state.lines) {
      if (line.age > LINE_LIFE - 0.8) continue;
      const pts = line.points;
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i];
        const b = pts[i + 1];
        const abx = b.x - a.x;
        const aby = b.y - a.y;
        const len2 = abx * abx + aby * aby || 1;
        let t = ((bee.x - a.x) * abx + (bee.y - a.y) * aby) / len2;
        t = clamp(t, 0, 1);
        const px = a.x + abx * t;
        const py = a.y + aby * t;
        const dx = bee.x - px;
        const dy = bee.y - py;
        const dd = Math.hypot(dx, dy);
        const target = bee.r + LINE_WIDTH / 2;
        if (dd < target && dd > 0.001) {
          const nx = dx / dd;
          const ny = dy / dd;
          bee.x = px + nx * target;
          bee.y = py + ny * target;
          const vn = bee.vx * nx + bee.vy * ny;
          if (vn < 0) {
            bee.vx -= 1.55 * vn * nx;
            bee.vy -= 1.55 * vn * ny;
          }
          const tangent = (Math.random() - 0.5) * 90;
          bee.vx += -ny * tangent * 0.35;
          bee.vy += nx * tangent * 0.35;
          if (!bee.blocked) {
            bee.blocked = true;
            state.blocked++;
            state.tickle = 0.5;
          }
          if (state.time - (bee.lastSound || 0) > 0.18) {
            bee.lastSound = state.time;
            audio.tick();
          }
        }
      }
    }
  }

  function update(dt) {
    state.time += dt;
    state.shake = Math.max(0, state.shake - dt * 24);
    state.flash = Math.max(0, state.flash - dt * 2.6);
    state.dogFlash = Math.max(0, state.dogFlash - dt * 2.2);
    state.tickle = Math.max(0, state.tickle - dt);

    if (state.bubble.life > 0) state.bubble.life -= dt;

    if (state.phase === "play") {
      state.ink = Math.min(state.maxInk, state.ink + 60 * dt);
      while (state.spawnIndex < SPAWN_TIMES.length && state.time >= SPAWN_TIMES[state.spawnIndex]) {
        spawnBee(state.spawnIndex);
        state.spawnIndex++;
      }
      if (state.time >= DURATION) {
        state.phase = "won";
        state.winT = 0;
        if (!state.ended) {
          state.ended = true;
          audio.win();
          const stars = state.hearts >= 3 ? 3 : state.hearts >= 2 ? 2 : 1;
          setTimeout(() => {
            api.win(stars, state.blocked, {
              note: `${state.hearts} of 3 hearts left. ${state.blocked} bees bonked off your hand-drawn shields.`,
            });
          }, 700);
        }
      }
    } else if (state.phase === "won") {
      state.winT += dt;
    } else if (state.phase === "lost") {
      state.loseT += dt;
    }

    const d = dog();

    // lines age out in the sun
    for (const line of state.lines) line.age += dt;
    state.lines = state.lines.filter((line) => line.age < LINE_LIFE);

    for (const bee of state.bees) {
      bee.phase += dt;
      if (state.phase === "play" || state.phase === "lost") {
        bee.vy += 92 * dt;
        const seek = clamp((d.x - bee.x) * 0.55, -48, 48);
        bee.vx += seek * dt;
        bee.vx = clamp(bee.vx, -150, 150);
        bee.vy = clamp(bee.vy, -80, 290);
        bee.x += bee.vx * dt;
        bee.y += bee.vy * dt;

        if (bee.x < bee.r) { bee.x = bee.r; bee.vx = Math.abs(bee.vx) * 0.8; }
        if (bee.x > stage.w - bee.r) { bee.x = stage.w - bee.r; bee.vx = -Math.abs(bee.vx) * 0.8; }

        collideLines(bee);

        if (dist(bee.x, bee.y, d.x, d.y - d.radius * 0.15) < bee.r + d.radius && state.phase === "play") {
          bee.dead = true;
          hitDog(bee);
        }
      }
    }
    state.bees = state.bees.filter((b) => !b.dead && b.y < stage.h + 40);

    for (const p of state.particles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 250 * dt;
      p.vx *= 1 - dt * 1.5;
    }
    state.particles = state.particles.filter((p) => p.life > 0);
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
      ctx.strokeStyle = "rgba(255,255,255,0.28)";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawBackground(ctx, w, h) {
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, "#ffb36b");
    sky.addColorStop(0.35, "#ff8fa3");
    sky.addColorStop(0.7, "#9b4d8f");
    sky.addColorStop(1, "#4a2360");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    // sun
    ctx.save();
    ctx.globalAlpha = 0.9;
    const sun = ctx.createRadialGradient(w * 0.74, h * 0.17, 4, w * 0.74, h * 0.17, w * 0.24);
    sun.addColorStop(0, "#fff6c9");
    sun.addColorStop(0.4, "#ffe27a");
    sun.addColorStop(1, "rgba(255, 210, 63, 0)");
    ctx.fillStyle = sun;
    ctx.beginPath();
    ctx.arc(w * 0.74, h * 0.17, w * 0.24, 0, TAU);
    ctx.fill();
    ctx.restore();

    // clouds
    drawSprite(ctx, "cloud", w * 0.18, h * 0.12, w * 0.3, { alpha: 0.65 });
    drawSprite(ctx, "cloud", w * 0.86, h * 0.25, w * 0.22, { alpha: 0.45 });
    drawSprite(ctx, "cloud", w * 0.4, h * 0.06, w * 0.18, { alpha: 0.35 });

    // hills
    const hill1 = ctx.createLinearGradient(0, h * 0.6, 0, h);
    hill1.addColorStop(0, "#4e8f68");
    hill1.addColorStop(1, "#2d5e48");
    ctx.fillStyle = hill1;
    ctx.beginPath();
    ctx.moveTo(0, h * 0.72);
    ctx.quadraticCurveTo(w * 0.25, h * 0.58, w * 0.52, h * 0.7);
    ctx.quadraticCurveTo(w * 0.8, h * 0.82, w, h * 0.64);
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fill();

    const hill2 = ctx.createLinearGradient(0, h * 0.75, 0, h);
    hill2.addColorStop(0, "#3f7d59");
    hill2.addColorStop(1, "#224b39");
    ctx.fillStyle = hill2;
    ctx.beginPath();
    ctx.moveTo(0, h * 0.85);
    ctx.quadraticCurveTo(w * 0.3, h * 0.76, w * 0.58, h * 0.86);
    ctx.quadraticCurveTo(w * 0.8, h * 0.93, w, h * 0.84);
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fill();

    // bushes and flowers
    drawSprite(ctx, "bush", w * 0.06, h * 0.78, w * 0.2, { alpha: 0.9 });
    drawSprite(ctx, "bush", w * 0.96, h * 0.84, w * 0.17, { alpha: 0.85 });
    for (let i = 0; i < 5; i++) {
      drawSprite(ctx, "flower", w * (0.12 + i * 0.19), h * (0.9 + (i % 2) * 0.035), w * 0.05, { alpha: 0.85 });
    }

    // sunbeam haze
    ctx.save();
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.moveTo(w * 0.74, h * 0.17);
    ctx.lineTo(w * 0.4, h);
    ctx.lineTo(w * 0.58, h);
    ctx.lineTo(w * 0.82, h * 0.2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawLines(ctx) {
    for (const line of state.lines) {
      const pts = line.points;
      const alpha = line.age > LINE_LIFE - 2 ? clamp((LINE_LIFE - line.age) / 2, 0, 1) : 1;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "rgba(255, 196, 61, 0.26)";
      ctx.lineWidth = LINE_WIDTH + 8;
      ctx.beginPath();
      pts.forEach((p, i) => { i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); });
      ctx.stroke();

      const grad = ctx.createLinearGradient(0, 0, 0, stage.h);
      grad.addColorStop(0, "#ffe89c");
      grad.addColorStop(0.5, "#ffc93f");
      grad.addColorStop(1, "#ff9f1a");
      ctx.strokeStyle = grad;
      ctx.lineWidth = LINE_WIDTH;
      ctx.beginPath();
      pts.forEach((p, i) => { i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); });
      ctx.stroke();

      ctx.strokeStyle = "rgba(255,255,255,0.55)";
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      pts.forEach((p, i) => { i ? ctx.lineTo(p.x, p.y - 1) : ctx.moveTo(p.x, p.y - 1); });
      ctx.stroke();
      ctx.restore();
    }

    if (state.drawing) {
      const pts = state.drawing.points;
      ctx.save();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "rgba(255, 201, 63, 0.9)";
      ctx.lineWidth = LINE_WIDTH;
      ctx.beginPath();
      pts.forEach((p, i) => { i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); });
      ctx.stroke();
      const end = pts[pts.length - 1];
      ctx.fillStyle = "#fff4c2";
      ctx.beginPath();
      ctx.arc(end.x, end.y, LINE_WIDTH * 0.55, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawDog(ctx, w, h) {
    const d = dog();
    const bob = Math.sin(state.time * 2.4) * 2;
    const flash = state.dogFlash > 0 && Math.floor(state.time * 18) % 2 === 0;

    ctx.save();
    ctx.fillStyle = "rgba(20, 10, 30, 0.22)";
    ctx.beginPath();
    ctx.ellipse(d.x, d.y + d.size * 0.37, d.size * 0.3, d.size * 0.07, 0, 0, TAU);
    ctx.fill();

    if (state.phase === "won") {
      const t = Math.min(1, state.winT / 0.8);
      ctx.translate(d.x, d.y - easeOutCubic(t) * 32 + bob);
      ctx.scale(1 + Math.sin(state.winT * 8) * 0.03, 1 + Math.sin(state.winT * 8) * 0.03);
      drawSprite(ctx, "dog", 0, 0, d.size, { alpha: flash ? 0.55 : 1 });
    } else {
      drawSprite(ctx, "dog", d.x, d.y + bob, d.size, {
        alpha: flash ? 0.55 : 1,
        rot: state.dogFlash * 0.04 * Math.sin(state.time * 40),
      });
    }
    ctx.restore();

    // speech bubble
    if (state.bubble.life > 0) {
      const a = clamp(state.bubble.life, 0, 1);
      const text = state.bubble.text;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.font = `900 ${Math.round(clamp(w * 0.042, 13, 18))}px ${DISPLAY}`;
      const tw = ctx.measureText(text).width;
      const bw = tw + 22;
      const bh = 30;
      const bx = clamp(d.x + d.size * 0.24, 10, w - bw - 10);
      const by = d.y - d.size * 0.72;
      ctx.fillStyle = "#fff8ee";
      ctx.strokeStyle = "#20142e";
      ctx.lineWidth = 2.5;
      roundRect(ctx, bx, by, bw, bh, 11);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(bx + 12, by + bh - 1);
      ctx.lineTo(bx + 4, by + bh + 10);
      ctx.lineTo(bx + 24, by + bh - 1);
      ctx.closePath();
      ctx.fillStyle = "#fff8ee";
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#20142e";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, bx + bw / 2, by + bh / 2 + 1);
      ctx.restore();
    }
  }

  function drawBees(ctx) {
    for (const bee of state.bees) {
      const flap = Math.sin(state.time * 28 + bee.phase);
      ctx.save();
      ctx.translate(bee.x, bee.y);
      ctx.rotate(clamp(bee.vx * 0.004, -0.3, 0.3) + Math.sin(state.time * 7 + bee.phase) * 0.08);
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = "#20142e";
      ctx.beginPath();
      ctx.ellipse(0, bee.r + 8, bee.r * 0.75, 3, 0, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
      drawSprite(ctx, "bee", 0, 0, bee.r * 2.9, { flipY: flap < 0 });
      ctx.restore();
    }
  }

  function drawHud(ctx, w, h) {
    const compact = w < 380;
    const pad = compact ? 9 : 12;
    const top = 10;
    const pillH = 32;
    const heartsW = compact ? 78 : 104;
    const heartSize = compact ? 15 : 18;
    const heartGap = compact ? 21 : 26;

    // hearts
    ctx.save();
    ctx.fillStyle = "rgba(20, 10, 30, 0.42)";
    roundRect(ctx, pad, top, heartsW, pillH, 10);
    ctx.fill();
    for (let i = 0; i < 3; i++) {
      drawHeart(ctx, pad + (compact ? 14 : 19) + i * heartGap, top + 16, heartSize, i < state.hearts);
    }
    ctx.restore();

    // timer
    ctx.save();
    const timeLeft = Math.max(0, DURATION - state.time);
    const timerW = compact ? 54 : 62;
    ctx.fillStyle = "rgba(20, 10, 30, 0.42)";
    roundRect(ctx, w - pad - timerW, top, timerW, pillH, 10);
    ctx.fill();
    ctx.fillStyle = timeLeft < 5 ? "#ffd23f" : "#fff";
    ctx.font = `900 ${compact ? 13 : 15}px ${DISPLAY}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`${timeLeft.toFixed(1)}s`, w - pad - timerW / 2, top + 17);
    ctx.restore();

    // ink bar
    const barW = compact ? Math.min(80, w * 0.26) : clamp(w * 0.32, 100, 140);
    const barX = w / 2 - barW / 2;
    const barY = top + 12;
    ctx.save();
    ctx.fillStyle = "rgba(20, 10, 30, 0.42)";
    roundRect(ctx, barX - (compact ? 7 : 8), top, barW + (compact ? 14 : 16), pillH, 10);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.14)";
    roundRect(ctx, barX, barY, barW, 8, 4);
    ctx.fill();
    const pct = state.ink / state.maxInk;
    const grad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
    grad.addColorStop(0, "#ffe89c");
    grad.addColorStop(1, "#ff9f1a");
    ctx.fillStyle = grad;
    roundRect(ctx, barX, barY, Math.max(2, barW * pct), 8, 4);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.font = `900 ${compact ? 6 : 6.5}px ${DISPLAY}`;
    ctx.textAlign = "center";
    ctx.fillText("HONEY INK", w / 2, top + 27);
    ctx.restore();
    void h;
  }

  function draw() {
    const { ctx } = stage;
    const w = stage.w;
    const h = stage.h;
    ctx.save();
    if (state.shake > 0.1) ctx.translate(rand(-state.shake, state.shake), rand(-state.shake, state.shake));

    drawBackground(ctx, w, h);
    drawDog(ctx, w, h);
    drawBees(ctx);
    drawLines(ctx);

    for (const p of state.particles) {
      const a = clamp(p.life / p.max, 0, 1);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * a + 0.4, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    drawHud(ctx, w, h);

    if (state.flash > 0) {
      ctx.fillStyle = `rgba(255, 93, 108, ${state.flash * 0.14})`;
      ctx.fillRect(0, 0, w, h);
    }

    if (state.phase === "lost") {
      ctx.save();
      ctx.fillStyle = "rgba(20, 10, 30, 0.42)";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#fff";
      ctx.font = `900 ${Math.round(clamp(w * 0.09, 28, 44))}px ${DISPLAY}`;
      ctx.textAlign = "center";
      ctx.fillText("THE BEES WIN", w / 2, h * 0.42);
      ctx.restore();
    }

    ctx.restore();
  }

  // immediate first bee so the scene reads instantly
  spawnBee(0);
  state.spawnIndex = 1;

  const loop = createLoop((dt) => {
    update(dt);
    draw();
  });

  return {
    destroy() {
      loop.stop();
      stopPointer();
      stage.destroy();
    },
  };
}
