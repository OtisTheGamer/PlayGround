import {
  createStage, createLoop, bindPointer, createKeyboard,
  clamp, rand, roundRect, TAU, easeOutCubic,
} from "../util.js";
import { audio } from "../audio.js";

const DISPLAY = '"Arial Rounded MT Bold", "Trebuchet MS", system-ui, sans-serif';
const GOAL = 12;
const COLORS = ["#35e7ff", "#7b78ff", "#ff5db1", "#ffbd4a", "#63f58b", "#53a7ff", "#d477ff", "#ff765e", "#a7f04a", "#48efd2", "#ff6fda", "#ffe35b"];

export function mount(root, api) {
  root.innerHTML = "";
  const stage = createStage(root);
  const input = createKeyboard();
  let destroyed = false;
  let resultTimer = 0;

  const state = {
    time: 0,
    blocks: [{ x: 0, w: 0, color: "#35e7ff" }],
    active: null,
    scraps: [],
    particles: [],
    floats: [],
    landed: 0,
    perfects: 0,
    combo: 0,
    bestCombo: 0,
    phase: "play",
    dropT: 0,
    dropFromY: 0,
    shake: 0,
    flash: 0,
    ended: false,
    resultSent: false,
  };

  function layout() {
    const w = stage.w;
    const h = stage.h;
    const ground = h * 0.86;
    const blockH = clamp(Math.min(h * 0.052, (ground - 100) / (GOAL + 1)), 11, 24);
    const baseW = clamp(w * 0.52, 118, 204);
    const top = ground - state.blocks.length * blockH;
    const targetW = state.blocks[state.blocks.length - 1].w || baseW;
    return { w, h, blockH, baseW, ground, top, targetW, minX: 12 + targetW / 2, maxX: w - 12 - targetW / 2 };
  }

  const initialLayout = layout();
  state.blocks[0] = { x: initialLayout.w / 2, w: initialLayout.baseW, color: COLORS[0] };

  function makeActive() {
    const L = layout();
    const x = L.w / 2;
    const dir = Math.random() < 0.5 ? 1 : -1;
    const speed = Math.min(290, 168 + state.landed * 9);
    state.active = { x, w: state.blocks[state.blocks.length - 1].w || L.baseW, dir, speed, color: COLORS[state.landed % COLORS.length] };
  }
  makeActive();

  let previousWidth = initialLayout.w;
  let previousHeight = initialLayout.h;
  let previousBaseW = initialLayout.baseW;
  const offResize = stage.onResize(() => {
    const next = layout();
    const widthScale = next.w / previousWidth;
    const heightScale = next.h / previousHeight;
    const blockScale = next.baseW / previousBaseW;
    const scaleX = (x) => next.w / 2 + (x - previousWidth / 2) * widthScale;
    const scaleY = (y) => y * heightScale;

    for (const block of state.blocks) {
      block.x = scaleX(block.x);
      block.w *= blockScale;
    }
    if (state.active) {
      state.active.x = scaleX(state.active.x);
      state.active.w *= blockScale;
      state.active.x = clamp(state.active.x, 10 + state.active.w / 2, next.w - 10 - state.active.w / 2);
    }
    for (const particle of state.particles) {
      particle.x = scaleX(particle.x);
      particle.y = scaleY(particle.y);
      particle.vx *= widthScale;
      particle.vy *= heightScale;
    }
    for (const scrap of state.scraps) {
      scrap.x = scaleX(scrap.x);
      scrap.y = scaleY(scrap.y);
      scrap.w *= blockScale;
      scrap.vx *= widthScale;
      scrap.vy *= heightScale;
    }
    for (const text of state.floats) {
      text.x = scaleX(text.x);
      text.y = scaleY(text.y);
    }
    state.dropFromY = scaleY(state.dropFromY);
    previousWidth = next.w;
    previousHeight = next.h;
    previousBaseW = next.baseW;
  });

  function burst(x, y, color, amount = 14, power = 180) {
    for (let i = 0; i < amount; i++) {
      const a = rand(0, TAU);
      const speed = rand(power * 0.25, power);
      state.particles.push({ x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life: rand(0.28, 0.68), max: 0.68, size: rand(1.5, 4), color });
    }
  }

  function floatText(text, color, x, y, scale = 1) {
    state.floats.push({ text, color, x, y, life: 0.85, max: 0.85, scale });
  }

  function finishLoss() {
    if (state.resultSent || destroyed) return;
    state.resultSent = true;
    api.lose("The tower got wobbly and rage-quit before you did. Gravity is a sore winner.");
  }

  function scheduleWin() {
    if (state.ended) return;
    state.ended = true;
    state.phase = "won";
    state.flash = 1;
    audio.win();
    api.vibrate?.(35);
    burst(stage.w / 2, layout().top + 20, "#ffe35b", 42, 300);
    floatText("STACK ATTACK!", "#ffe35b", stage.w / 2, stage.h * 0.36, 1.15);
    const ratio = state.blocks[state.blocks.length - 1].w / layout().baseW;
    const stars = state.perfects >= 8 || ratio >= 0.78 ? 3 : state.perfects >= 4 || ratio >= 0.53 ? 2 : 1;
    resultTimer = window.setTimeout(() => {
      if (destroyed || state.resultSent) return;
      state.resultSent = true;
      api.win(stars, state.perfects, {
        note: `${state.perfects} perfect drops and a ${Math.round(ratio * 100)}% platform. Gravity never stood a chance.`,
      });
    }, 750);
  }

  function drop() {
    if (state.ended || state.phase !== "play" || !state.active) return;
    state.phase = "dropping";
    state.dropT = 0;
    const L = layout();
    state.dropFromY = L.top - L.blockH * 1.25;
    audio.whoosh();
    api.vibrate?.(7);
  }

  function land() {
    if (state.ended) return;
    const L = layout();
    const moving = state.active;
    const previous = state.blocks[state.blocks.length - 1];
    const left = Math.max(moving.x - moving.w / 2, previous.x - previous.w / 2);
    const right = Math.min(moving.x + moving.w / 2, previous.x + previous.w / 2);
    const overlap = right - left;
    const y = L.top;
    if (overlap <= 0) {
      state.phase = "lost";
      state.ended = true;
      state.shake = 10;
      state.flash = 0.8;
      audio.bad();
      burst(moving.x, y, "#ff5d70", 28, 260);
      floatText("WHOOPS!", "#ff8290", stage.w / 2, y - 25);
      resultTimer = window.setTimeout(finishLoss, 720);
      return;
    }

    const center = (left + right) / 2;
    const tolerance = Math.max(6, Math.min(16, previous.w * 0.13));
    const perfect = Math.abs(moving.x - previous.x) <= tolerance;
    const keptX = perfect ? previous.x : center;
    const keptW = perfect ? previous.w : overlap;

    // Trimmed ends become little falling neon chips.
    const oldLeft = moving.x - moving.w / 2;
    const oldRight = moving.x + moving.w / 2;
    if (oldLeft < left) state.scraps.push({ x: oldLeft, w: left - oldLeft, y, vx: -rand(25, 100), vy: rand(-30, 10), rot: rand(-0.2, 0.2), vr: -rand(1, 4), life: 1.2, color: moving.color });
    if (oldRight > right) state.scraps.push({ x: right, w: oldRight - right, y, vx: rand(25, 100), vy: rand(-30, 10), rot: rand(-0.2, 0.2), vr: rand(1, 4), life: 1.2, color: moving.color });

    state.blocks.push({ x: keptX, w: keptW, color: moving.color });
    state.landed++;
    state.phase = "play";
    state.shake = perfect ? 1.5 : 2.8;
    state.flash = perfect ? 0.42 : 0.17;
    burst(keptX, y, perfect ? "#fff28a" : moving.color, perfect ? 20 : 10, perfect ? 190 : 130);
    audio.thunk();
    api.vibrate?.(perfect ? 14 : 8);

    if (perfect) {
      state.perfects++;
      state.combo++;
      state.bestCombo = Math.max(state.bestCombo, state.combo);
      audio.good();
      floatText(state.combo > 1 ? `PERFECT ×${state.combo}` : "PERFECT!", "#fff28a", keptX, y - 10, 0.9);
    } else {
      state.combo = 0;
      audio.pop();
      floatText("NICE!", "#8fffe7", keptX, y - 10, 0.8);
    }

    state.active = null;
    if (state.landed >= GOAL) {
      scheduleWin();
      return;
    }
    makeActive();
  }

  const stopPointer = bindPointer(stage.canvas, { down() { drop(); } });

  function update(dt) {
    state.time += dt;
    state.shake = Math.max(0, state.shake - dt * 18);
    state.flash = Math.max(0, state.flash - dt * 2.8);

    if (input.wasPressed(" ", "spacebar", "enter", "arrowup", "w")) drop();
    input.endFrame();

    if (state.phase === "play" && state.active) {
      const L = layout();
      const half = state.active.w / 2;
      const min = 10 + half;
      const max = L.w - 10 - half;
      state.active.x += state.active.dir * state.active.speed * dt;
      if (state.active.x <= min) { state.active.x = min; state.active.dir = 1; }
      if (state.active.x >= max) { state.active.x = max; state.active.dir = -1; }
    } else if (state.phase === "dropping") {
      state.dropT += dt / 0.14;
      if (state.dropT >= 1) land();
    }

    for (const p of state.particles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 220 * dt;
      p.vx *= 1 - dt * 1.2;
    }
    state.particles = state.particles.filter((p) => p.life > 0);
    for (const s of state.scraps) {
      s.life -= dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vy += 420 * dt;
      s.rot += s.vr * dt;
    }
    state.scraps = state.scraps.filter((s) => s.life > 0);
    for (const f of state.floats) { f.life -= dt; f.y -= 30 * dt; }
    state.floats = state.floats.filter((f) => f.life > 0);
  }

  function drawBackground(ctx, w, h) {
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, "#10143c");
    bg.addColorStop(0.52, "#10102b");
    bg.addColorStop(1, "#080b1c");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    const glow = ctx.createRadialGradient(w * 0.5, h * 0.47, 8, w * 0.5, h * 0.5, h * 0.74);
    glow.addColorStop(0, "rgba(74, 91, 255, 0.18)");
    glow.addColorStop(1, "rgba(74, 91, 255, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.strokeStyle = "rgba(116, 135, 255, 0.055)";
    ctx.lineWidth = 1;
    const grid = 28;
    const offset = (state.time * 8) % grid;
    for (let x = -grid + (offset % grid); x < w; x += grid) {
      ctx.beginPath(); ctx.moveTo(x, h * 0.18); ctx.lineTo(x, h); ctx.stroke();
    }
    for (let y = h * 0.18; y < h; y += grid) {
      ctx.beginPath(); ctx.moveTo(0, y + offset); ctx.lineTo(w, y + offset); ctx.stroke();
    }
    ctx.restore();

    for (let i = 0; i < 16; i++) {
      const x = (i * 73.3 + Math.sin(state.time * 0.35 + i) * 9) % w;
      const y = (i * 117.1) % (h * 0.8);
      ctx.globalAlpha = 0.2 + (Math.sin(state.time * 2 + i) + 1) * 0.14;
      ctx.fillStyle = i % 3 ? "#a6b8ff" : "#ffe35b";
      ctx.beginPath(); ctx.arc(x, y, i % 5 === 0 ? 2 : 1.2, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawBlock(ctx, x, y, w, h, color, active = false) {
    if (w <= 0) return;
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = active ? 20 : 12;
    const g = ctx.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, "#ffffff");
    g.addColorStop(0.1, color);
    g.addColorStop(0.75, color);
    g.addColorStop(1, "#373d88");
    ctx.fillStyle = g;
    roundRect(ctx, x, y, w, h, Math.min(7, h * 0.28));
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(255,255,255,0.28)";
    roundRect(ctx, x + 3, y + 2, Math.max(0, w - 6), Math.max(2, h * 0.13), 3);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.42)";
    ctx.lineWidth = 1;
    roundRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, Math.min(7, h * 0.28));
    ctx.stroke();
    ctx.restore();
  }

  function drawHud(ctx, w, h) {
    const pad = 12;
    ctx.save();
    ctx.fillStyle = "rgba(7, 9, 29, 0.76)";
    roundRect(ctx, pad, 10, w - pad * 2, 55, 13);
    ctx.fill();
    ctx.strokeStyle = "rgba(129, 151, 255, 0.24)";
    ctx.lineWidth = 1;
    roundRect(ctx, pad, 10, w - pad * 2, 55, 13);
    ctx.stroke();

    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#f5f6ff";
    ctx.font = `900 ${Math.round(clamp(w * 0.052, 16, 22))}px ${DISPLAY}`;
    ctx.fillText("STACK ATTACK", pad + 12, 29);
    ctx.fillStyle = "rgba(221,226,255,0.58)";
    ctx.font = `800 ${Math.round(clamp(w * 0.025, 9, 11))}px ${DISPLAY}`;
    ctx.fillText("TAP · CLICK · SPACE TO DROP", pad + 12, 49);

    ctx.textAlign = "right";
    ctx.fillStyle = "#ffe35b";
    ctx.font = `900 ${Math.round(clamp(w * 0.046, 14, 19))}px ${DISPLAY}`;
    ctx.fillText(`${state.landed}/${GOAL}`, w - pad - 12, 31);
    ctx.fillStyle = "rgba(221,226,255,0.55)";
    ctx.font = `800 ${Math.round(clamp(w * 0.022, 8, 10))}px ${DISPLAY}`;
    ctx.fillText(state.combo > 1 ? `🔥 ${state.combo} COMBO` : `PERFECT ${state.perfects}`, w - pad - 12, 49);

    const bx = pad + 2;
    const by = 72;
    const bw = w - pad * 2 - 4;
    ctx.fillStyle = "rgba(255,255,255,0.1)";
    roundRect(ctx, bx, by, bw, 5, 3); ctx.fill();
    const prog = state.landed / GOAL;
    const fill = ctx.createLinearGradient(bx, 0, bx + bw, 0);
    fill.addColorStop(0, "#42e9ff"); fill.addColorStop(0.55, "#8b7bff"); fill.addColorStop(1, "#ff5db1");
    ctx.fillStyle = fill;
    roundRect(ctx, bx, by, Math.max(3, bw * prog), 5, 3); ctx.fill();
    ctx.restore();
    void h;
  }

  function draw() {
    const ctx = stage.ctx;
    const L = layout();
    const { w, h } = L;
    ctx.save();
    if (state.shake > 0.05) ctx.translate(rand(-state.shake, state.shake), rand(-state.shake, state.shake));
    drawBackground(ctx, w, h);

    // Soft target beam and the glowing landing guide.
    const guideY = L.top;
    ctx.save();
    ctx.setLineDash([4, 7]);
    ctx.strokeStyle = "rgba(158, 177, 255, 0.22)";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(14, guideY); ctx.lineTo(w - 14, guideY); ctx.stroke();
    ctx.restore();

    // Tower and luminous foot.
    const base = state.blocks[0];
    const baseY = L.ground - L.blockH;
    drawBlock(ctx, base.x - base.w / 2, baseY, base.w, L.blockH, base.color);
    for (let i = 1; i < state.blocks.length; i++) {
      const b = state.blocks[i];
      const y = L.ground - (i + 1) * L.blockH;
      drawBlock(ctx, b.x - b.w / 2, y, b.w, L.blockH, b.color);
    }

    for (const s of state.scraps) {
      ctx.save();
      ctx.translate(s.x + s.w / 2, s.y);
      ctx.rotate(s.rot);
      ctx.globalAlpha = clamp(s.life / 1.2, 0, 1);
      drawBlock(ctx, -s.w / 2, 0, s.w, L.blockH, s.color);
      ctx.restore();
    }

    if (state.active) {
      const dropProgress = state.phase === "dropping" ? easeOutCubic(clamp(state.dropT, 0, 1)) : 0;
      const startY = L.top - L.blockH * 1.25;
      const landY = L.top - L.blockH;
      const y = state.phase === "dropping" ? startY + (landY - startY) * dropProgress : startY + Math.sin(state.time * 4) * 2;
      const x = state.active.x - state.active.w / 2;
      ctx.save();
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = state.active.color;
      ctx.fillRect(state.active.x - 1, y + L.blockH + 3, 2, Math.max(0, L.ground - y));
      ctx.restore();
      drawBlock(ctx, x, y, state.active.w, L.blockH, state.active.color, true);
    }

    for (const p of state.particles) {
      const a = clamp(p.life / p.max, 0, 1);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.45 + a * 0.55), 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;

    for (const f of state.floats) {
      const a = clamp(f.life / f.max, 0, 1);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.textAlign = "center";
      ctx.font = `900 ${Math.round(clamp(w * 0.065, 18, 30) * f.scale)}px ${DISPLAY}`;
      ctx.lineWidth = 5;
      ctx.strokeStyle = "rgba(8,10,30,0.8)";
      ctx.strokeText(f.text, f.x, f.y);
      ctx.fillStyle = f.color;
      ctx.shadowColor = f.color;
      ctx.shadowBlur = 12;
      ctx.fillText(f.text, f.x, f.y);
      ctx.restore();
    }

    drawHud(ctx, w, h);
    if (state.phase === "play" && state.landed === 0) {
      ctx.save();
      ctx.globalAlpha = 0.55 + Math.sin(state.time * 4) * 0.2;
      ctx.fillStyle = "#e4e8ff";
      ctx.textAlign = "center";
      ctx.font = `800 ${Math.round(clamp(w * 0.03, 10, 13))}px ${DISPLAY}`;
      ctx.fillText("TIME YOUR DROP · BUILD 12 BLOCKS", w / 2, h * 0.24);
      ctx.restore();
    }
    if (state.flash > 0) {
      ctx.fillStyle = `rgba(255, 235, 115, ${state.flash * 0.16})`;
      ctx.fillRect(0, 0, w, h);
    }
    ctx.restore();
  }

  const loop = createLoop((dt) => { update(dt); draw(); });

  return {
    destroy() {
      destroyed = true;
      if (resultTimer) window.clearTimeout(resultTimer);
      loop.stop();
      input.destroy();
      stopPointer();
      offResize();
      stage.destroy();
    },
  };
}
