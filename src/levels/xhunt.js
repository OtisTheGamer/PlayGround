import { createStage, createLoop, bindPointer, clamp, rand, roundRect, TAU } from "../util.js";
import { audio } from "../audio.js";

const FONT = '"Arial Rounded MT Bold", "Trebuchet MS", system-ui, sans-serif';
const TOTAL_TIME = 18;
const ROUND_COUNT = 3;
const HIT_RADIUS = 18;
const DISTRACTOR_CHARS = ["x", "X", "×", "+", "x", "X", "×"];

export function mount(root, api) {
  root.innerHTML = "";
  const stage = createStage(root);
  const timers = new Set();

  const state = {
    destroyed: false,
    ended: false,
    round: 1,
    hits: 0,
    remaining: TOTAL_TIME,
    elapsed: 0,
    board: [],
    target: null,
    banner: "Tap the tiny lowercase x.",
    bannerT: 1.4,
    flash: 0,
    pulse: 0,
  };

  function later(fn, delay = 0) {
    const id = setTimeout(() => {
      timers.delete(id);
      if (!state.destroyed) fn();
    }, delay);
    timers.add(id);
    return id;
  }

  function sign(v) {
    return v < 0 ? -1 : 1;
  }

  function buildBoard() {
    const { w, h } = stage;
    const board = {
      x: 26,
      y: 120,
      w: Math.max(220, w - 52),
      h: Math.max(170, h - 160),
    };

    const target = {
      x: rand(board.x + 30, board.x + board.w - 30),
      y: rand(board.y + 30, board.y + board.h - 30),
      r: HIT_RADIUS,
      char: "x",
      tone: "#fff3b5",
      glow: "rgba(255, 213, 86, 0.35)",
    };

    const glyphs = [];
    const tries = 220;
    for (let i = 0; i < tries; i++) {
      const x = rand(board.x + 20, board.x + board.w - 20);
      const y = rand(board.y + 20, board.y + board.h - 20);
      if (Math.hypot(x - target.x, y - target.y) < 46) continue;
      const char = DISTRACTOR_CHARS[Math.floor(Math.random() * DISTRACTOR_CHARS.length)];
      const size = rand(10, 20);
      glyphs.push({
        x,
        y,
        char,
        size,
        color: char === "x" ? "#e7f3ff" : char === "X" ? "#f7d8ff" : char === "×" ? "#d4f8d8" : "#ffbfbd",
        badge: char === "x" ? "#d1ebff" : char === "X" ? "#f0d6ff" : char === "×" ? "#d7f7de" : "#ffd5d1",
      });
    }

    const count = Math.max(34, Math.min(62, Math.round((board.w * board.h) / 11)));
    while (glyphs.length < count) {
      const x = rand(board.x + 20, board.x + board.w - 20);
      const y = rand(board.y + 20, board.y + board.h - 20);
      if (Math.hypot(x - target.x, y - target.y) < 50) continue;
      const char = DISTRACTOR_CHARS[Math.floor(Math.random() * DISTRACTOR_CHARS.length)];
      glyphs.push({
        x,
        y,
        char,
        size: rand(11, 21),
        color: char === "x" ? "#e7f3ff" : char === "X" ? "#f4dcff" : char === "×" ? "#dfffe7" : "#ffd7d4",
        badge: char === "x" ? "#cfe6ff" : char === "X" ? "#ebd5ff" : char === "×" ? "#d9ffe7" : "#ffdecf",
      });
    }

    state.target = target;
    state.board = glyphs;
  }

  function showBanner(text, duration = 1.2) {
    state.banner = text;
    state.bannerT = duration;
  }

  function finishWin() {
    if (state.ended || state.destroyed) return;
    state.ended = true;
    const stars = state.remaining >= 9 ? 3 : state.remaining >= 4 ? 2 : 1;
    const score = Number(Math.max(0, TOTAL_TIME - state.remaining).toFixed(1));
    audio.win();
    later(() => {
      api.win(stars, score, {
        note: "You found the sneaky lowercase x before the ad could even finish loading.",
      });
    }, 600);
  }

  function fail(reason) {
    if (state.ended || state.destroyed) return;
    state.ended = true;
    state.banner = reason;
    state.bannerT = 2;
    audio.lose();
    later(() => api.lose(reason), 600);
  }

  function hitTarget() {
    if (state.ended) return;
    state.hits += 1;
    state.flash = 0.9;
    state.pulse = 0;
    audio.good();
    audio.tap();
    api.vibrate?.(15);

    if (state.hits >= ROUND_COUNT) {
      showBanner("3/3 caught! You win.", 1.4);
      finishWin();
      return;
    }

    state.round += 1;
    showBanner(`Round ${state.round}/3 locked in.`, 1.2);
    buildBoard();
  }

  function miss() {
    if (state.ended) return;
    state.remaining = clamp(state.remaining - 1.45, 0, TOTAL_TIME);
    state.flash = 0.5;
    state.banner = "Nope — -1.45s";
    state.bannerT = 0.9;
    audio.bad();
    api.vibrate?.(12);
    if (state.remaining <= 0.001) {
      later(() => fail("Time up — the x escaped the ad."), 120);
    }
  }

  function onPointer(p) {
    if (state.ended || !state.target) return;
    const dx = p.x - state.target.x;
    const dy = p.y - state.target.y;
    const dist = Math.hypot(dx, dy);
    if (dist <= HIT_RADIUS + 18) {
      hitTarget();
    } else {
      miss();
    }
  }

  const stopPointer = bindPointer(stage.canvas, {
    down(p) {
      onPointer(p);
    },
  });

  function update(dt) {
    if (state.destroyed) return;
    state.remaining = clamp(state.remaining - dt, 0, TOTAL_TIME);
    state.elapsed += dt;
    state.pulse += dt * 4;
    if (state.bannerT > 0) {
      state.bannerT = Math.max(0, state.bannerT - dt);
    }
    state.flash = Math.max(0, state.flash - dt * 2.2);
    if (!state.ended && state.remaining <= 0.0001) {
      fail("Time up — the x escaped the ad.");
    }
  }

  function drawBackground(ctx, w, h) {
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, "#101a34");
    bg.addColorStop(0.58, "#0a1229");
    bg.addColorStop(1, "#080d1c");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    const aura = ctx.createRadialGradient(w * 0.5, h * 0.24, 20, w * 0.5, h * 0.24, w * 0.9);
    aura.addColorStop(0, "rgba(102,138,255,0.26)");
    aura.addColorStop(0.35, "rgba(141,86,255,0.18)");
    aura.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = aura;
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = "rgba(255,255,255,0.05)";
    for (let i = 0; i < 30; i++) {
      const x = (i * 89.7 + (i % 3) * 23) % w;
      const y = (i * 64.3 + (i % 5) * 17) % h;
      ctx.beginPath();
      ctx.arc(x, y, 1.3 + (i % 3), 0, TAU);
      ctx.fill();
    }

    roundRect(ctx, 12, 12, w - 24, h - 24, 26);
    ctx.fillStyle = "rgba(9, 15, 28, 0.7)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    const pill = ctx.createLinearGradient(18, 22, w - 18, 22);
    pill.addColorStop(0, "rgba(255,255,255,0.06)");
    pill.addColorStop(1, "rgba(255,255,255,0.02)");
    roundRect(ctx, 18, 18, w - 36, 76, 18);
    ctx.fillStyle = pill;
    ctx.fill();
  }

  function drawHud(ctx, w, h) {
    const badge = "AD";
    ctx.fillStyle = "#ffdd75";
    ctx.font = `900 ${clamp(w * 0.043, 11, 18)}px ${FONT}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(badge, 30, 52);

    ctx.fillStyle = "#eef6ff";
    ctx.font = `900 ${clamp(w * 0.07, 24, 30)}px ${FONT}`;
    ctx.textAlign = "center";
    ctx.fillText("XHUNT", w / 2, 56);

    const pillW = Math.min(120, w * 0.28);
    const pillX = w - pillW - 26;
    roundRect(ctx, pillX, 28, pillW, 30, 15);
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.fill();

    ctx.fillStyle = "#dfeaff";
    ctx.font = `800 ${clamp(w * 0.031, 11, 14)}px ${FONT}`;
    ctx.textAlign = "center";
    ctx.fillText(`ROUND ${state.round}/${ROUND_COUNT}`, pillX + pillW * 0.33, 43);
    ctx.fillText(`TIME ${state.remaining.toFixed(1)}s`, pillX + pillW * 0.7, 43);

    ctx.fillStyle = "rgba(255,243,180,0.95)";
    ctx.font = `700 ${clamp(w * 0.034, 11, 15)}px ${FONT}`;
    ctx.textAlign = "center";
    ctx.fillText(state.banner, w / 2, 92);
  }

  function drawBoard(ctx, w, h) {
    const board = {
      x: 24,
      y: 110,
      w: w - 48,
      h: h - 142,
    };

    roundRect(ctx, board.x, board.y, board.w, board.h, 24);
    ctx.fillStyle = "rgba(13,19,34,0.8)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 1;
    ctx.stroke();

    const base = ctx.createLinearGradient(0, board.y, 0, board.y + board.h);
    base.addColorStop(0, "rgba(14,22,39,0.62)");
    base.addColorStop(1, "rgba(9,15,26,0.9)");
    ctx.fillStyle = base;
    roundRect(ctx, board.x + 10, board.y + 10, board.w - 20, board.h - 20, 18);
    ctx.fill();

    const maze = ctx.createLinearGradient(0, board.y + 60, 0, board.y + board.h);
    maze.addColorStop(0, "rgba(255,255,255,0.02)");
    maze.addColorStop(1, "rgba(255,255,255,0.0)");
    ctx.fillStyle = maze;
    ctx.fillRect(board.x + 12, board.y + 14, board.w - 24, board.h - 28);
  }

  function drawGlyph(ctx, glyph) {
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `900 ${glyph.size}px ${FONT}`;
    ctx.fillStyle = glyph.color;
    ctx.strokeStyle = "rgba(9, 13, 21, 0.35)";
    ctx.lineWidth = 1.1;
    ctx.strokeText(glyph.char, glyph.x, glyph.y + 1);
    ctx.fillText(glyph.char, glyph.x, glyph.y + 1);
    ctx.restore();
  }

  function drawTarget(ctx) {
    if (!state.target) return;
    const { x, y, r } = state.target;
    ctx.save();
    const glow = state.flash > 0 ? `rgba(255, 214, 90, ${0.2 + state.flash * 0.35})` : "rgba(255, 214, 90, 0.3)";
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, r + 10 + Math.sin(state.pulse * 1.7) * 2.5, 0, TAU);
    ctx.fill();

    ctx.strokeStyle = "rgba(255, 237, 160, 0.92)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, r + 5, 0, TAU);
    ctx.stroke();

    ctx.font = `900 ${r * 1.8}px ${FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#fff4c2";
    ctx.strokeStyle = "rgba(18, 19, 25, 0.55)";
    ctx.lineWidth = 1.25;
    ctx.strokeText("x", x, y + 1);
    ctx.fillText("x", x, y + 1);
    ctx.restore();
  }

  function drawWinFlash(ctx, w, h) {
    if (!state.ended || !state.flash) return;
    ctx.fillStyle = `rgba(255, 219, 98, ${state.flash * 0.24})`;
    ctx.fillRect(0, 0, w, h);
  }

  function draw() {
    const { ctx } = stage;
    const { w, h } = stage;

    ctx.clearRect(0, 0, w, h);
    drawBackground(ctx, w, h);
    drawHud(ctx, w, h);
    drawBoard(ctx, w, h);

    for (const glyph of state.board) drawGlyph(ctx, glyph);
    drawTarget(ctx);

    const ring = 20 + Math.sin(state.pulse * 2.4) * 4;
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    ctx.arc(state.target ? state.target.x : w / 2, state.target ? state.target.y : h / 2, ring, 0, TAU);
    ctx.stroke();

    drawWinFlash(ctx, w, h);

    if (!state.ended && state.bannerT > 0) {
      ctx.save();
      ctx.fillStyle = "rgba(8,15,31,0.42)";
      const bx = w * 0.12;
      const by = h - 54;
      roundRect(ctx, bx, by, w - bx * 2, 28, 14);
      ctx.fill();
      ctx.fillStyle = "#f9fdff";
      ctx.font = `700 ${clamp(w * 0.03, 11, 13)}px ${FONT}`;
      ctx.textAlign = "center";
      ctx.fillText(state.banner, w / 2, by + 18);
      ctx.restore();
    }
  }

  buildBoard();

  const loop = createLoop((dt) => {
    update(dt);
    draw();
  });

  return {
    destroy() {
      if (state.destroyed) return;
      state.destroyed = true;
      for (const id of timers) clearTimeout(id);
      timers.clear();
      stopPointer();
      loop.stop();
      stage.destroy();
    },
  };
}
