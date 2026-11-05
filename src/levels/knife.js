import {
  createStage, createLoop, bindPointer, createKeyboard,
  clamp, lerp, rand, roundRect, TAU, angleDiff, easeOutCubic,
} from "../util.js";
import { drawSprite } from "../sprites.js";
import { audio } from "../audio.js";

const DISPLAY = '"Arial Rounded MT Bold", "Trebuchet MS", system-ui, sans-serif';
const TOTAL = 15;
const APPLE_AT_HITS = [2, 6, 10];

export function mount(root, api) {
  root.innerHTML = "";
  const stage = createStage(root);
  const input = createKeyboard();

  const state = {
    rot: rand(-0.4, 0.4),
    dir: Math.random() < 0.5 ? 1 : -1,
    hits: 0,
    apples: [],
    applesSpawned: 0,
    applesCollected: 0,
    stuck: [],
    phase: "ready",
    queued: 0,
    flight: 0,
    crashT: 0,
    resultAt: 0,
    shake: 0,
    time: 0,
    spawnBurst: 0,
    particles: [],
    flash: 0,
    ended: false,
  };

  const stopPointer = bindPointer(stage.canvas, {
    down() { throwKnife(); },
  });

  function currentSpeed() {
    return 1.32 + state.hits * 0.125;
  }

  function throwKnife() {
    if (state.ended) return;
    // Buffer taps made during the short flight so rapid taps never feel dropped.
    if (state.phase === "flying") {
      state.queued = Math.min(5, (state.queued || 0) + 1);
      return;
    }
    if (state.phase !== "ready") return;
    state.phase = "flying";
    state.flight = 0;
    audio.whoosh();
    api.vibrate?.(8);
  }

  function popParticles(x, y, color, amount = 12) {
    for (let i = 0; i < amount; i++) {
      const a = rand(0, TAU);
      const sp = rand(50, 240);
      state.particles.push({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: rand(0.25, 0.6),
        max: 0.6,
        size: rand(1.5, 4.5),
        color,
      });
    }
  }

  function spawnAppleIfNeeded() {
    if (state.applesSpawned >= 3) return;
    const threshold = APPLE_AT_HITS[state.applesSpawned];
    if (state.hits < threshold) return;
    const candidates = [];
    for (let tries = 0; tries < 100; tries++) {
      const rel = rand(0, TAU);
      const okKnife = state.stuck.every((k) => angleDiff(k.rel, rel) > 0.52);
      const okApple = state.apples.every((a) => angleDiff(a.rel, rel) > 0.5);
      if (okKnife && okApple) { candidates.push(rel); break; }
    }
    if (candidates.length) {
      state.apples.push({ rel: candidates[0], born: state.time, pulse: rand(0, TAU) });
      state.applesSpawned++;
      state.spawnBurst = 0.55;
      audio.levelUp();
    }
  }

  function impact() {
    const newRel = ((Math.PI / 2 - state.rot) % TAU + TAU) % TAU;
    const { w, h } = stage;
    const cx = w / 2;
    const cy = h * 0.4;
    const radius = Math.min(w * 0.29, h * 0.185);
    const hitX = cx + Math.cos(Math.PI / 2) * (radius + 8);
    const hitY = cy + Math.sin(Math.PI / 2) * (radius + 8);

    const knifeCollision = state.stuck.some((k) => angleDiff(k.rel, newRel) < 0.085);
    if (knifeCollision) {
      state.phase = "crash";
      state.crashT = 0;
      state.shake = 7;
      state.flash = 1;
      audio.bad();
      api.vibrate?.([20, 30, 40]);
      popParticles(hitX, hitY, "#ffd23f", 20);
      return;
    }

    // Did we skewer a golden apple?
    const appleIndex = state.apples.findIndex((a) => angleDiff(a.rel, newRel) < 0.165);
    if (appleIndex >= 0) {
      state.apples.splice(appleIndex, 1);
      state.applesCollected++;
      popParticles(hitX, hitY - 10, "#ffd23f", 24);
      audio.good();
    }

    state.stuck.push({ rel: newRel, born: state.time, wobble: rand(-0.05, 0.05) });
    state.hits++;
    state.phase = "ready";
    state.shake = 4;
    audio.thunk();
    api.vibrate?.(14);

    if (state.hits >= TOTAL && !state.ended) {
      state.ended = true;
      state.phase = "won";
      state.resultAt = 0.7;
      audio.win();
      const stars = state.applesCollected >= 3 ? 3 : state.applesCollected >= 1 ? 2 : 1;
      setTimeout(() => {
        api.win(stars, state.applesCollected, {
          note: state.applesCollected >= 3
            ? "All three golden apples. The algorithm is impressed."
            : `You collected ${state.applesCollected} of 3 golden apples. There is always next ad.`,
        });
      }, 700);
      return;
    }
    spawnAppleIfNeeded();

    if (state.queued > 0) {
      state.queued--;
      throwKnife();
    }
  }

  function update(dt) {
    state.time += dt;
    state.shake = Math.max(0, state.shake - dt * 16);
    state.flash = Math.max(0, state.flash - dt * 2.8);
    state.spawnBurst = Math.max(0, state.spawnBurst - dt);

    if (state.phase !== "crash" && state.phase !== "won") {
      state.rot += state.dir * currentSpeed() * dt;
      if (state.rot > TAU * 3) state.rot -= TAU * 3;
      if (state.rot < -TAU * 3) state.rot += TAU * 3;
    } else if (state.phase === "crash") {
      state.rot += state.dir * currentSpeed() * dt * 0.25;
      state.crashT += dt;
      if (state.crashT > 0.85 && !state.ended) {
        state.ended = true;
        api.lose("You hit one of your own knives. Extremely on-brand for this ad.");
      }
    } else if (state.phase === "won") {
      state.rot += state.dir * currentSpeed() * dt * 0.3;
    }

    if (state.phase === "flying") {
      state.flight += dt / 0.105;
      if (state.flight >= 1) impact();
    }

    if (input.wasPressed(" ", "spacebar", "arrowup", "w", "enter")) throwKnife();

    for (const p of state.particles) {
      p.life -= dt;
      p.vy += 260 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    state.particles = state.particles.filter((p) => p.life > 0);
    input.endFrame();
  }

  function drawBackdrop(ctx, w, h) {
    const g = ctx.createRadialGradient(w / 2, h * 0.4, 20, w / 2, h * 0.4, Math.max(w, h) * 0.85);
    g.addColorStop(0, "#4b1d6e");
    g.addColorStop(0.55, "#2a103f");
    g.addColorStop(1, "#140820");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    const cx = w / 2;
    const cy = h * 0.4;
    // target rings
    ctx.save();
    ctx.translate(cx, cy);
    for (let i = 7; i >= 1; i--) {
      ctx.beginPath();
      ctx.arc(0, 0, i * Math.min(w, h) * 0.082, 0, TAU);
      ctx.fillStyle = i % 2 === 0 ? "rgba(255,255,255,0.028)" : "rgba(255,93,140,0.035)";
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.05)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    ctx.restore();

    // floating hearts / sparks
    for (let i = 0; i < 9; i++) {
      const x = ((i * 113 + state.time * (9 + i * 2)) % (w + 40)) - 20;
      const y = (i * 97) % h;
      ctx.globalAlpha = 0.16 + (i % 3) * 0.05;
      ctx.fillStyle = i % 2 ? "#ff5d8c" : "#ffd23f";
      ctx.beginPath();
      ctx.arc(x, y, 2 + (i % 3), 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // floor glow
    const floor = ctx.createLinearGradient(0, h * 0.6, 0, h);
    floor.addColorStop(0, "rgba(255, 93, 140, 0)");
    floor.addColorStop(1, "rgba(255, 93, 140, 0.12)");
    ctx.fillStyle = floor;
    ctx.fillRect(0, h * 0.6, w, h * 0.4);
  }

  function drawLog(ctx, w, h) {
    const cx = w / 2;
    const cy = h * 0.4;
    const radius = Math.min(w * 0.29, h * 0.185);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(state.rot);

    // shadow/glow
    ctx.save();
    ctx.rotate(-state.rot);
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath();
    ctx.ellipse(0, radius + 12, radius * 0.94, 12, 0, 0, TAU);
    ctx.fill();
    ctx.restore();

    const wood = ctx.createRadialGradient(-radius * 0.3, -radius * 0.35, 4, 0, 0, radius);
    wood.addColorStop(0, "#ffe4b3");
    wood.addColorStop(0.52, "#e6b273");
    wood.addColorStop(1, "#a86b3f");
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, TAU);
    ctx.fillStyle = wood;
    ctx.fill();
    ctx.strokeStyle = "#3d2118";
    ctx.lineWidth = 6;
    ctx.stroke();

    // rings / grain
    for (let i = 1; i <= 4; i++) {
      ctx.beginPath();
      ctx.arc(0, 0, radius * (i / 5.4), 0, TAU);
      ctx.strokeStyle = i % 2 ? "rgba(76, 40, 20, 0.22)" : "rgba(255, 244, 220, 0.18)";
      ctx.lineWidth = i === 1 ? 4 : 2;
      ctx.stroke();
    }
    // knot
    ctx.beginPath();
    ctx.ellipse(radius * 0.3, -radius * 0.18, radius * 0.11, radius * 0.075, 0.5, 0, TAU);
    ctx.fillStyle = "rgba(93, 49, 22, 0.42)";
    ctx.fill();
    ctx.strokeStyle = "rgba(60, 30, 14, 0.5)";
    ctx.lineWidth = 2;
    ctx.stroke();

    // outer bark marks
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * TAU;
      ctx.save();
      ctx.rotate(a);
      ctx.fillStyle = i % 2 ? "rgba(81, 44, 21, 0.22)" : "rgba(255, 230, 185, 0.14)";
      roundRect(ctx, radius - 8, -2.5, 8, 5, 2);
      ctx.fill();
      ctx.restore();
    }

    // golden apples embedded inside
    for (const apple of state.apples) {
      const a = apple.rel + state.rot;
      const ax = Math.cos(a) * radius * 0.58;
      const ay = Math.sin(a) * radius * 0.58;
      const pulse = 1 + Math.sin(state.time * 6 + apple.pulse) * 0.06;
      ctx.save();
      ctx.translate(ax, ay);
      ctx.rotate(-state.rot);
      ctx.shadowColor = "rgba(255, 210, 63, 0.75)";
      ctx.shadowBlur = 16;
      drawSprite(ctx, "apple", 0, 0, radius * 0.42 * pulse);
      ctx.restore();
    }

    ctx.restore();

    // apple count sparks
    if (state.spawnBurst > 0) {
      ctx.save();
      ctx.globalAlpha = state.spawnBurst;
      ctx.strokeStyle = "#ffd23f";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, cy, radius * (1 + (0.55 - state.spawnBurst) * 2.6), 0, TAU);
      ctx.stroke();
      ctx.restore();
    }

    // stuck knives (rotate with the log)
    for (const k of state.stuck) {
      const a = k.rel + state.rot;
      const size = clamp(radius * 0.72, 42, 68);
      const r = radius + size * 0.26;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      const age = clamp((state.time - k.born) * 9, 0, 1);
      const wobble = Math.sin(state.time * 18 + k.born * 40) * k.wobble * (1 - age);
      drawSprite(ctx, "knife", x, y, size * (0.8 + age * 0.2), { rot: a + Math.PI / 2 + wobble });
    }

    // impact marker at bottom
    ctx.save();
    ctx.translate(cx, cy + radius);
    ctx.rotate(Math.PI / 2);
    ctx.beginPath();
    ctx.moveTo(-6, -11);
    ctx.lineTo(6, -11);
    ctx.lineTo(0, -2);
    ctx.closePath();
    ctx.fillStyle = "rgba(255,255,255,0.65)";
    ctx.fill();
    ctx.restore();
  }

  function drawKnifeInHand(ctx, w, h) {
    if (state.phase !== "ready") return;
    const bob = Math.sin(state.time * 5) * 3;
    const size = clamp(Math.min(w, h) * 0.115, 48, 76);
    const x = w / 2;
    const y = h * 0.845 + bob;

    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.16)";
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 8]);
    ctx.beginPath();
    ctx.moveTo(x, y - size * 0.55);
    ctx.lineTo(x, h * 0.62);
    ctx.stroke();
    ctx.restore();

    drawSprite(ctx, "knife", x, y, size);

    ctx.save();
    ctx.fillStyle = "rgba(255, 210, 63, 0.9)";
    ctx.font = `900 ${Math.round(clamp(w * 0.027, 9, 12))}px ${DISPLAY}`;
    ctx.textAlign = "center";
    ctx.globalAlpha = 0.55 + Math.sin(state.time * 4) * 0.3;
    ctx.fillText("TAP TO THROW", x, y + size * 0.62);
    ctx.restore();
  }

  function drawFlying(ctx, w, h) {
    if (state.phase !== "flying") return;
    const t = easeOutCubic(clamp(state.flight, 0, 1));
    const cx = w / 2;
    const cy = h * 0.4;
    const radius = Math.min(w * 0.29, h * 0.185);
    const startY = h * 0.845;
    const endY = cy + radius + 8;
    const y = lerp(startY, endY, t);
    const size = clamp(Math.min(w, h) * 0.115, 48, 76);

    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.34)";
    ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      const off = (i - 1.5) * 8;
      ctx.globalAlpha = 0.18 + i * 0.05;
      ctx.beginPath();
      ctx.moveTo(cx + off, y + 22 + i * 16);
      ctx.lineTo(cx + off, y + 50 + i * 22);
      ctx.stroke();
    }
    ctx.restore();
    drawSprite(ctx, "knife", cx, y, size);
  }

  function drawHud(ctx, w, h) {
    const pad = 10;
    const pillH = 27;
    ctx.save();
    ctx.fillStyle = "rgba(12, 6, 20, 0.55)";
    roundRect(ctx, pad, pad, 100, pillH, 8);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = `900 10px ${DISPLAY}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(`KNIVES ${state.hits}/${TOTAL}`, pad + 10, pad + pillH / 2 + 1);

    const count = 3;
    for (let i = 0; i < count; i++) {
      const x = w - pad - 16 - i * 24;
      ctx.globalAlpha = i < state.applesCollected ? 1 : 0.22;
      drawSprite(ctx, "apple", x, pad + pillH / 2, 21);
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.font = `800 7px ${DISPLAY}`;
    ctx.textAlign = "right";
    ctx.fillText("GOLDEN APPLES", w - pad - 2, pad + pillH + 10);
    ctx.restore();
  }

  function draw() {
    const { ctx } = stage;
    const w = stage.w;
    const h = stage.h;
    ctx.save();
    if (state.shake > 0.1) ctx.translate(rand(-state.shake, state.shake), rand(-state.shake, state.shake));

    drawBackdrop(ctx, w, h);
    drawLog(ctx, w, h);
    drawHud(ctx, w, h);
    drawKnifeInHand(ctx, w, h);
    drawFlying(ctx, w, h);

    for (const p of state.particles) {
      const a = clamp(p.life / p.max, 0, 1);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    if (state.flash > 0) {
      ctx.fillStyle = `rgba(255, 93, 108, ${state.flash * 0.2})`;
      ctx.fillRect(0, 0, w, h);
    }

    if (state.phase === "crash") {
      ctx.save();
      ctx.globalAlpha = clamp(1 - state.crashT, 0, 1);
      ctx.fillStyle = "#ff5d6c";
      ctx.font = `900 ${Math.round(clamp(w * 0.09, 28, 42))}px ${DISPLAY}`;
      ctx.textAlign = "center";
      ctx.fillText("CLANG!", w / 2, h * 0.25);
      ctx.restore();
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
