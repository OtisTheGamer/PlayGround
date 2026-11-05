export const TAU = Math.PI * 2;

export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => (v - a) / (b - a);
export const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
export const choose = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const chance = (p) => Math.random() < p;
export const dist = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);
export const dist2 = (x1, y1, x2, y2) => (x2 - x1) ** 2 + (y2 - y1) ** 2;

export const easeOutCubic = (t) => 1 - (1 - t) ** 3;
export const easeOutBack = (t) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
};
export const easeInCubic = (t) => t * t * t;

export function normAngle(a) {
  while (a < -Math.PI) a += TAU;
  while (a > Math.PI) a -= TAU;
  return a;
}

export function angleDiff(a, b) {
  return Math.abs(normAngle(a - b));
}

export function rotateToward(current, target, maxStep) {
  const diff = normAngle(target - current);
  if (Math.abs(diff) <= maxStep) return target;
  return current + Math.sign(diff) * maxStep;
}

export function formatTime(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  return `${s}s`;
}

export function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(typeof r === "number" ? r : 0, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

export function starPath(ctx, cx, cy, outer, inner, points = 5, rotation = -Math.PI / 2) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = rotation + (i * Math.PI) / points;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

/**
 * Size a canvas to its container, handling DPR and resize.
 */
export function createStage(container) {
  const canvas = document.createElement("canvas");
  canvas.className = "game-canvas";
  container.appendChild(canvas);
  const ctx = canvas.getContext("2d", { alpha: false });
  let w = 320;
  let h = 480;
  let dpr = 1;
  const listeners = new Set();

  function resize() {
    const rect = container.getBoundingClientRect();
    const nextW = Math.max(220, Math.round(rect.width || 320));
    const nextH = Math.max(280, Math.round(rect.height || 480));
    dpr = Math.min(2, window.devicePixelRatio || 1);
    w = nextW;
    h = nextH;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    listeners.forEach((fn) => fn(w, h));
  }

  let frame = 0;
  const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
  ro?.observe(container);
  window.addEventListener("resize", resize);
  frame = requestAnimationFrame(resize);
  resize();

  return {
    canvas,
    ctx,
    get w() { return w; },
    get h() { return h; },
    onResize(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    destroy() {
      cancelAnimationFrame(frame);
      ro?.disconnect();
      window.removeEventListener("resize", resize);
      listeners.clear();
      canvas.remove();
    },
  };
}

export function createLoop(update) {
  let raf = 0;
  let last = 0;
  let running = true;
  let paused = false;

  function tick(now) {
    if (!running) return;
    if (!last) last = now;
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    if (!paused) update(dt);
    raf = requestAnimationFrame(tick);
  }

  raf = requestAnimationFrame(tick);

  return {
    stop() {
      running = false;
      cancelAnimationFrame(raf);
    },
    pause() { paused = true; last = 0; },
    resume() { paused = false; last = 0; },
    get paused() { return paused; },
  };
}

export function pointOnCanvas(canvas, event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * canvas.clientWidth,
    y: ((event.clientY - rect.top) / rect.height) * canvas.clientHeight,
  };
}

export function bindPointer(canvas, handlers = {}) {
  const local = (e) => pointOnCanvas(canvas, e);
  let dragging = false;

  const down = (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault();
    dragging = true;
    try { canvas.setPointerCapture(e.pointerId); } catch {}
    handlers.down?.(local(e), e);
  };
  const move = (e) => {
    const p = local(e);
    if (dragging || e.pointerType === "mouse") handlers.move?.(p, e);
  };
  const up = (e) => {
    if (!dragging) return;
    dragging = false;
    try { canvas.releasePointerCapture(e.pointerId); } catch {}
    handlers.up?.(local(e), e);
  };
  const leave = (e) => {
    handlers.leave?.(local(e), e);
  };
  const cancel = (e) => {
    if (!dragging) return;
    dragging = false;
    handlers.up?.(local(e), e);
  };

  canvas.addEventListener("pointerdown", down);
  canvas.addEventListener("pointermove", move);
  canvas.addEventListener("pointerup", up);
  canvas.addEventListener("pointercancel", cancel);
  canvas.addEventListener("pointerleave", leave);
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());

  return () => {
    canvas.removeEventListener("pointerdown", down);
    canvas.removeEventListener("pointermove", move);
    canvas.removeEventListener("pointerup", up);
    canvas.removeEventListener("pointercancel", cancel);
    canvas.removeEventListener("pointerleave", leave);
  };
}

export function createKeyboard() {
  const down = new Set();
  const pressed = new Set();
  const prevent = new Set([
    "arrowleft", "arrowright", "arrowup", "arrowdown", " ", "spacebar",
  ]);

  const onDown = (e) => {
    const k = e.key.toLowerCase();
    if (prevent.has(k)) e.preventDefault();
    if (!down.has(k)) pressed.add(k);
    down.add(k);
  };
  const onUp = (e) => {
    down.delete(e.key.toLowerCase());
  };
  const onBlur = () => { down.clear(); pressed.clear(); };

  window.addEventListener("keydown", onDown, { passive: false });
  window.addEventListener("keyup", onUp);
  window.addEventListener("blur", onBlur);

  return {
    isDown(...keys) { return keys.some((k) => down.has(k)); },
    wasPressed(...keys) { return keys.some((k) => pressed.has(k)); },
    endFrame() { pressed.clear(); },
    destroy() {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      window.removeEventListener("blur", onBlur);
    },
  };
}

export function shakeOffset(intensity, time, seed = 0) {
  return {
    x: Math.sin(time * 71 + seed) * intensity,
    y: Math.cos(time * 83 + seed * 2) * intensity,
  };
}

export function drawStars(ctx, count, total, x, y, size, gap) {
  for (let i = 0; i < total; i++) {
    ctx.save();
    ctx.translate(x + i * (size + gap), y);
    starPath(ctx, 0, 0, size / 2, size / 4.2);
    ctx.fillStyle = i < count ? "#ffd23f" : "rgba(255,255,255,0.16)";
    ctx.fill();
    ctx.restore();
  }
}
