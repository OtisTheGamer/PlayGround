import {
  createStage, createLoop, bindPointer,
  clamp, lerp, rand, roundRect, TAU, easeOutCubic,
} from "../util.js";
import { audio } from "../audio.js";

const DISPLAY = '"Arial Rounded MT Bold", "Trebuchet MS", system-ui, sans-serif';
const CAP = 4;
const START = [
  [1, 1, 0, 2],
  [3, 3, 2, 0],
  [3, 2, 1, 0],
  [2, 3, 0, 1],
  [],
  [],
];
const PALETTE = [
  { base: "#ff5d6c", light: "#ffb3bd", dark: "#c72c47" },
  { base: "#5b9dff", light: "#b8d4ff", dark: "#2f62c9" },
  { base: "#ffd23f", light: "#fff0a8", dark: "#c08d00" },
  { base: "#3ee9a5", light: "#b9ffe1", dark: "#0e9c68" },
];

export function mount(root, api) {
  root.innerHTML = "";
  const stage = createStage(root);

  const state = {
    tubes: START.map((t) => t.slice()),
    history: [],
    moves: 0,
    selected: -1,
    render: [],
    pour: null,
    time: 0,
    ended: false,
    shake: 0,
    sparkles: [],
    hover: -1,
    lift: START.map(() => 0),
  };

  resetRender();

  const toolbar = document.createElement("div");
  toolbar.className = "sort-toolbar";
  toolbar.innerHTML = `
    <span class="hud-pill">MOVES <b class="accent" id="sort-moves">0</b></span>
    <button class="hud-btn" id="sort-undo" type="button" aria-label="Undo last pour">↶ UNDO</button>
  `;
  root.appendChild(toolbar);
  const movesEl = toolbar.querySelector("#sort-moves");
  const undoBtn = toolbar.querySelector("#sort-undo");

  function resetRender() {
    state.render = state.tubes.map((t, i) => ({
      stack: t.slice(),
      count: t.length,
      target: t.length,
      index: i,
    }));
  }

  function topGroup(tube) {
    if (!tube.length) return { color: null, count: 0 };
    const color = tube[tube.length - 1];
    let count = 1;
    while (count < tube.length && tube[tube.length - 1 - count] === color) count++;
    return { color, count };
  }

  function canPour(from, to) {
    if (from === to) return false;
    const src = state.tubes[from];
    const dst = state.tubes[to];
    if (!src.length || dst.length >= CAP) return false;
    const top = src[src.length - 1];
    if (dst.length && dst[dst.length - 1] !== top) return false;
    return true;
  }

  function amountFor(from, to) {
    const { count } = topGroup(state.tubes[from]);
    return Math.min(count, CAP - state.tubes[to].length);
  }

  function layout() {
    const w = stage.w;
    const h = stage.h;
    const margin = w * 0.11;
    const colGap = (w - margin * 2) / 3;
    const tubeW = Math.min(colGap * 0.62, 68);
    const tubeH = Math.min(h * 0.3, 196);
    const positions = [];
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 3; col++) {
        positions.push({
          x: margin + colGap * col + colGap / 2 - tubeW / 2,
          y: h * (row === 0 ? 0.335 : 0.715) - tubeH / 2,
          w: tubeW,
          h: tubeH,
          cx: margin + colGap * col + colGap / 2,
          cy: h * (row === 0 ? 0.335 : 0.715),
        });
      }
    }
    return positions;
  }

  function hitTest(x, y) {
    const positions = layout();
    for (let i = 0; i < positions.length; i++) {
      const p = positions[i];
      if (x >= p.x - 10 && x <= p.x + p.w + 10 && y >= p.y - 18 && y <= p.y + p.h + 14) return i;
    }
    return -1;
  }

  function resetLevel() {
    state.tubes = START.map((t) => t.slice());
    state.history = [];
    state.moves = 0;
    state.selected = -1;
    state.pour = null;
    state.ended = false;
    resetRender();
    updateToolbar();
  }

  function updateToolbar() {
    movesEl.textContent = String(state.moves);
    undoBtn.disabled = state.history.length === 0;
  }

  function doPour(from, to) {
    const amount = amountFor(from, to);
    const color = state.tubes[from][state.tubes[from].length - 1];
    state.history.push({
      tubes: state.tubes.map((t) => t.slice()),
      moves: state.moves,
    });
    const oldFrom = state.tubes[from].slice();
    const oldTo = state.tubes[to].slice();
    for (let i = 0; i < amount; i++) {
      state.tubes[from].pop();
      state.tubes[to].push(color);
    }
    state.moves++;

    // Reconstruct the old source stack for a smooth drain animation.
    state.render[from] = {
      stack: [...state.tubes[from], ...Array(amount).fill(color)],
      count: oldFrom.length,
      target: state.tubes[from].length,
      index: from,
    };
    state.render[to] = {
      stack: state.tubes[to].slice(),
      count: oldTo.length,
      target: state.tubes[to].length,
      index: to,
    };
    state.pour = { from, to, color, amount, t: 0, dur: 0.28, oldest: oldFrom.length };
    state.selected = -1;
    audio.splash();
    api.vibrate?.(10);
    updateToolbar();
    checkWin();
  }

  function checkWin() {
    const done = state.tubes.every((t) => t.length === 0 || (t.length === CAP && t.every((c) => c === t[0])));
    if (!done || state.ended) return;
    state.ended = true;
    const stars = state.moves <= 13 ? 3 : state.moves <= 18 ? 2 : 1;
    audio.win();
    setTimeout(() => {
      api.win(stars, state.moves, {
        note: state.moves <= 13
          ? "That was almost optimal pouring. The wizard is suspicious."
          : "All four potions sorted. The ad only needed you to tap once, allegedly.",
      });
    }, 600);
  }

  function handleTubeTap(index) {
    if (state.ended || state.pour) return;
    if (index < 0) {
      state.selected = -1;
      return;
    }
    if (state.selected === -1) {
      if (state.tubes[index].length) {
        state.selected = index;
        audio.tap();
      }
      return;
    }
    if (state.selected === index) {
      state.selected = -1;
      audio.click();
      return;
    }
    if (canPour(state.selected, index)) {
      doPour(state.selected, index);
    } else {
      audio.click();
      state.shake = 0.28;
      if (state.tubes[index].length) state.selected = index;
      else state.selected = -1;
    }
  }

  const stopPointer = bindPointer(stage.canvas, {
    down(p) {
      handleTubeTap(hitTest(p.x, p.y));
    },
  });

  undoBtn.addEventListener("click", () => {
    if (!state.history.length || state.ended) return;
    const prev = state.history.pop();
    state.tubes = prev.tubes.map((t) => t.slice());
    state.moves = prev.moves;
    state.selected = -1;
    state.pour = null;
    resetRender();
    updateToolbar();
    audio.click();
  });

  function update(dt) {
    state.time += dt;
    state.shake = Math.max(0, state.shake - dt);
    if (state.pour) {
      state.pour.t += dt;
      if (state.pour.t >= state.pour.dur + 0.08) {
        state.pour = null;
      }
    }
    for (let i = 0; i < state.render.length; i++) {
      const r = state.render[i];
      if (Math.abs(r.count - r.target) > 0.01) {
        const speed = state.pour && state.pour.t < 0.3 ? 22 : 14;
        r.count = lerp(r.count, r.target, clamp(speed * dt, 0, 1));
        if (Math.abs(r.count - r.target) < 0.02) {
          r.count = r.target;
          r.stack = state.tubes[i].slice();
        }
      } else {
        r.count = r.target;
        r.stack = state.tubes[i].slice();
      }
      const targetLift = state.selected === i ? 1 : 0;
      state.lift[i] = lerp(state.lift[i], targetLift, clamp(12 * dt, 0, 1));
    }
    for (const s of state.sparkles) {
      s.life -= dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vy += 180 * dt;
    }
    state.sparkles = state.sparkles.filter((s) => s.life > 0);
  }

  function colorFor(index, shade = "base") {
    return PALETTE[index]?.[shade] || "#fff";
  }

  function drawBackground(ctx, w, h) {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#2b1550");
    g.addColorStop(0.55, "#1b0e35");
    g.addColorStop(1, "#110722");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // moon glow
    const glow = ctx.createRadialGradient(w * 0.5, h * 0.12, 10, w * 0.5, h * 0.2, w * 0.8);
    glow.addColorStop(0, "rgba(155, 92, 255, 0.28)");
    glow.addColorStop(1, "rgba(155, 92, 255, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);

    // arcane stars
    for (let i = 0; i < 26; i++) {
      const x = ((i * 79.7) % w);
      const y = ((i * 131.3) % (h * 0.9));
      const tw = 0.35 + Math.sin(state.time * 2 + i) * 0.25;
      ctx.globalAlpha = clamp(tw, 0.05, 0.7);
      ctx.fillStyle = i % 5 === 0 ? "#ffd23f" : "#d7c4ff";
      ctx.beginPath();
      ctx.arc(x, y, i % 7 === 0 ? 2.2 : 1.2, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // shelves
    const positions = layout();
    const y1 = positions[0].y + positions[0].h + 18;
    const y2 = positions[3].y + positions[3].h + 18;
    for (const y of [y1, y2]) {
      const grad = ctx.createLinearGradient(0, y, 0, y + 12);
      grad.addColorStop(0, "rgba(255,255,255,0.15)");
      grad.addColorStop(1, "rgba(255,255,255,0.02)");
      ctx.fillStyle = grad;
      roundRect(ctx, w * 0.07, y, w * 0.86, 9, 5);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.08)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // bottom vignette
    const vign = ctx.createLinearGradient(0, h * 0.78, 0, h);
    vign.addColorStop(0, "rgba(7,3,12,0)");
    vign.addColorStop(1, "rgba(7,3,12,0.6)");
    ctx.fillStyle = vign;
    ctx.fillRect(0, h * 0.78, w, h * 0.22);
  }

  function drawTube(ctx, index, position, positions) {
    const w = stage.w;
    const lift = state.lift[index] * 9;
    const { x, w: tw, h: th } = position;
    const y = position.y - lift;
    const cx = x + tw / 2;
    const isSelected = state.selected === index;
    const validTarget = state.selected >= 0 && state.selected !== index
      && canPour(state.selected, index)
      && !state.pour;
    const completing = state.tubes[index].length === CAP
      && state.tubes[index].every((c) => c === state.tubes[index][0]);
    const r = state.render[index];

    ctx.save();

    if (isSelected || validTarget || completing) {
      ctx.save();
      const glowColor = isSelected
        ? "#ffd23f"
        : completing ? "#3ee9a5" : colorFor(topGroup(state.tubes[state.selected] || []).color || 0, "base");
      ctx.globalAlpha = isSelected ? 0.55 : validTarget ? 0.22 + Math.sin(state.time * 5) * 0.09 : 0.4;
      ctx.strokeStyle = glowColor;
      ctx.lineWidth = 3;
      roundRect(ctx, x - 8, y - 10, tw + 16, th + 20, tw * 0.38);
      ctx.stroke();
      ctx.restore();
    }

    // glass body
    const glass = ctx.createLinearGradient(x, y, x + tw, y + th);
    glass.addColorStop(0, "rgba(255,255,255,0.14)");
    glass.addColorStop(0.22, "rgba(255,255,255,0.045)");
    glass.addColorStop(0.75, "rgba(255,255,255,0.02)");
    glass.addColorStop(1, "rgba(255,255,255,0.1)");
    ctx.fillStyle = glass;
    roundRect(ctx, x, y, tw, th, tw * 0.32);
    ctx.fill();

    // liquid
    const inset = 5;
    const bottom = y + th - 9;
    const top = y + 14;
    const innerH = bottom - top;
    const unit = innerH / CAP;
    const lx = x + inset;
    const lw = tw - inset * 2;
    ctx.save();
    roundRect(ctx, x + 2, y + 9, tw - 4, th - 12, tw * 0.3);
    ctx.clip();

    const layers = Math.ceil(r.count - 0.0001);
    for (let j = 0; j < layers; j++) {
      const colorIndex = r.stack[j];
      if (colorIndex == null) continue;
      const frac = clamp(r.count - j, 0, 1);
      const layerBottom = bottom - j * unit;
      const layerTop = layerBottom - unit * frac;
      const grad = ctx.createLinearGradient(lx, 0, lx + lw, 0);
      grad.addColorStop(0, colorFor(colorIndex, "dark"));
      grad.addColorStop(0.22, colorFor(colorIndex, "base"));
      grad.addColorStop(0.72, colorFor(colorIndex, "base"));
      grad.addColorStop(1, colorFor(colorIndex, "light"));
      ctx.fillStyle = grad;
      ctx.fillRect(lx, layerTop, lw, layerBottom - layerTop);
      ctx.fillStyle = colorFor(colorIndex, "light");
      ctx.globalAlpha = 0.28;
      ctx.fillRect(lx, layerTop, lw * 0.18, layerBottom - layerTop);
      ctx.globalAlpha = 1;
      if (j === layers - 1 && frac < 0.99) {
        ctx.fillStyle = colorFor(colorIndex, "light");
        ctx.globalAlpha = 0.65;
        ctx.beginPath();
        ctx.ellipse(cx, layerTop, lw / 2, Math.max(2, lw * 0.1), 0, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }

    // bubbles
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = "#fff";
    for (let b = 0; b < 3; b++) {
      const bx = lx + lw * (0.22 + ((index * 7 + b * 3) % 6) * 0.11);
      const by = bottom - ((state.time * (8 + b * 3) + b * 37 + index * 23) % Math.max(1, innerH));
      ctx.beginPath();
      ctx.arc(bx, by, 1.3 + b * 0.5, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    // glass shine + outline
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.27)";
    ctx.lineWidth = 2;
    roundRect(ctx, x, y, tw, th, tw * 0.32);
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    roundRect(ctx, x + tw * 0.13, y + th * 0.08, tw * 0.1, th * 0.76, tw * 0.06);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.1)";
    roundRect(ctx, x + tw * 0.78, y + th * 0.12, tw * 0.045, th * 0.3, tw * 0.04);
    ctx.fill();
    ctx.restore();

    // rim
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.42)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(cx, y + 7, tw * 0.5, 5, 0, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = "rgba(10, 5, 20, 0.5)";
    ctx.beginPath();
    ctx.ellipse(cx, y + 7, tw * 0.44, 3.8, 0, 0, TAU);
    ctx.fill();
    ctx.restore();

    // completing sparkle
    if (completing) {
      ctx.save();
      ctx.globalAlpha = 0.5 + Math.sin(state.time * 4) * 0.2;
      ctx.fillStyle = "#ffd23f";
      ctx.font = `900 ${Math.round(tw * 0.3)}px ${DISPLAY}`;
      ctx.textAlign = "center";
      ctx.fillText("★", cx, y - 12);
      ctx.restore();
    }

    ctx.restore();
  }

  function drawPour(ctx) {
    if (!state.pour) return;
    const t = clamp(state.pour.t / state.pour.dur, 0, 1);
    const positions = layout();
    const from = positions[state.pour.from];
    const to = positions[state.pour.to];
    if (!from || !to) return;
    const fx = from.cx;
    const fy = from.y - 4;
    const tx = to.cx;
    const ty = to.y - 4;
    const midX = (fx + tx) / 2;
    const minY = Math.min(fy, ty) - 50;
    const color = colorFor(state.pour.color, "base");
    ctx.save();
    ctx.globalAlpha = t < 0.9 ? 0.9 : (1 - t) / 0.1;
    ctx.strokeStyle = color;
    ctx.lineWidth = 7;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(fx, fy);
    ctx.quadraticCurveTo(midX, minY, tx, ty);
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.lineWidth = 2;
    ctx.stroke();
    // droplets
    const steps = 5;
    for (let i = 0; i < steps; i++) {
      const q = (t * 1.6 - i * 0.12) % 1;
      if (q < 0 || q > 1) continue;
      const x = (1 - q) ** 2 * fx + 2 * (1 - q) * q * midX + q * q * tx;
      const y = (1 - q) ** 2 * fy + 2 * (1 - q) * q * minY + q * q * ty;
      ctx.globalAlpha = 0.6 * (1 - q);
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(x, y, 2.2, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function draw() {
    const { ctx } = stage;
    const w = stage.w;
    const h = stage.h;
    ctx.save();
    if (state.shake > 0) {
      ctx.translate(rand(-3, 3) * state.shake * 3, rand(-1, 1) * state.shake * 3);
    }
    drawBackground(ctx, w, h);

    const positions = layout();
    for (let i = 0; i < positions.length; i++) drawTube(ctx, i, positions[i], positions);
    drawPour(ctx);

    for (const s of state.sparkles) {
      const a = clamp(s.life / s.max, 0, 1);
      ctx.globalAlpha = a;
      ctx.fillStyle = s.color;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r * a, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // little label
    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.28)";
    ctx.font = `800 8px ${DISPLAY}`;
    ctx.textAlign = "center";
    ctx.fillText("TAP A TUBE · TAP ANOTHER TO POUR", w / 2, h - 15);
    ctx.restore();

    ctx.restore();
  }

  updateToolbar();

  const loop = createLoop((dt) => {
    update(dt);
    draw();
  });

  return {
    destroy() {
      loop.stop();
      stopPointer();
      toolbar.remove();
      stage.destroy();
    },
  };
}
