import {
  createStage, createLoop, bindPointer, createKeyboard,
  clamp, lerp, rand, roundRect, TAU, easeOutCubic,
} from "../util.js";
import { drawSprite } from "../sprites.js";
import { audio } from "../audio.js";

const DISPLAY = '"Arial Rounded MT Bold", "Trebuchet MS", system-ui, sans-serif';
const COLS = 13;
const ROWS = 21;
const GOAL = 15;

export function mount(root, api) {
  root.innerHTML = "";
  const stage = createStage(root);
  const input = createKeyboard();

  const state = {
    phase: "intro",
    intro: 1.2,
    time: 0,
    snake: [],
    dir: { x: 1, y: 0 },
    queued: { x: 1, y: 0 },
    apples: 0,
    grow: 0,
    stepTimer: 0,
    stepInterval: 0.2,
    apple: null,
    particles: [],
    floats: [],
    shake: 0,
    flash: 0,
    winT: 0,
    deadT: 0,
    resultSent: false,
    deathReason: "",
    layout: null,
  };

  let anchor = null;

  function makeLayout() {
    const pad = 16;
    const hudTop = 72;
    const availW = Math.max(140, stage.w - pad * 2);
    const availH = Math.max(180, stage.h - hudTop - 18);
    const cell = clamp(Math.min(availW / COLS, availH / ROWS), 11, 34);
    const bw = cell * COLS;
    const bh = cell * ROWS;
    return {
      cell,
      bw,
      bh,
      ox: (stage.w - bw) / 2,
      oy: hudTop + (availH - bh) / 2,
    };
  }

  function cellPos(cell) {
    const L = state.layout;
    return {
      x: L.ox + (cell.x + 0.5) * L.cell,
      y: L.oy + (cell.y + 0.5) * L.cell,
    };
  }

  function spawnApple() {
    const taken = new Set(state.snake.map((s) => `${s.x},${s.y}`));
    const open = [];
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (!taken.has(`${x},${y}`)) open.push({ x, y });
      }
    }
    const pick = open[Math.floor(Math.random() * open.length)] || { x: 1, y: 1 };
    state.apple = { x: pick.x, y: pick.y, phase: rand(0, TAU), born: state.time };
  }

  function reset() {
    state.layout = makeLayout();
    const cx = Math.floor(COLS / 2);
    const cy = Math.floor(ROWS / 2);
    state.snake = [
      { x: cx, y: cy },
      { x: cx - 1, y: cy },
      { x: cx - 2, y: cy },
      { x: cx - 3, y: cy },
    ];
    state.dir = { x: 1, y: 0 };
    state.queued = { x: 1, y: 0 };
    state.phase = "intro";
    state.intro = 1.2;
    state.time = 0;
    state.apples = 0;
    state.grow = 0;
    state.stepTimer = 0;
    state.stepInterval = 0.2;
    state.particles = [];
    state.floats = [];
    state.shake = 0;
    state.flash = 0;
    state.winT = 0;
    state.deadT = 0;
    state.resultSent = false;
    state.deathReason = "";
    spawnApple();
  }

  reset();
  const offResize = stage.onResize(() => { state.layout = makeLayout(); });

  function queueDir(x, y) {
    if (state.phase === "won" || state.phase === "dead") return;
    if (x === -state.dir.x && y === -state.dir.y) return;
    if (x === state.dir.x && y === state.dir.y) return;
    state.queued = { x, y };
  }

  function readInput() {
    if (input.wasPressed("arrowup", "w")) queueDir(0, -1);
    if (input.wasPressed("arrowdown", "s")) queueDir(0, 1);
    if (input.wasPressed("arrowleft", "a")) queueDir(-1, 0);
    if (input.wasPressed("arrowright", "d")) queueDir(1, 0);
  }

  const stopPointer = bindPointer(stage.canvas, {
    down(p) {
      anchor = { x: p.x, y: p.y, moved: false };
    },
    move(p) {
      if (!anchor || (state.phase !== "play" && state.phase !== "intro")) return;
      const dx = p.x - anchor.x;
      const dy = p.y - anchor.y;
      if (Math.hypot(dx, dy) < 16) return;
      if (Math.abs(dx) > Math.abs(dy)) queueDir(Math.sign(dx), 0);
      else queueDir(0, Math.sign(dy));
      anchor = { x: p.x, y: p.y, moved: true };
    },
    up(p) {
      // A tap on either half is a relative turn: handy when swiping is awkward.
      if (anchor && !anchor.moved && (state.phase === "play" || state.phase === "intro")) {
        const d = state.queued;
        if (p.x < stage.w / 2) queueDir(d.y, -d.x);
        else queueDir(-d.y, d.x);
      }
      anchor = null;
    },
    leave() { anchor = null; },
  });

  function addFloat(text, color, x, y, scale = 1) {
    state.floats.push({ text, color, x, y, life: 1, max: 1, scale });
  }

  function burst(x, y, color, amount = 12, power = 200) {
    for (let i = 0; i < amount; i++) {
      const a = rand(0, TAU);
      const sp = rand(power * 0.2, power);
      state.particles.push({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: rand(0.28, 0.7),
        max: 0.7,
        size: rand(1.6, 4.6),
        color,
      });
    }
  }

  function die(reason) {
    if (state.phase !== "play" && state.phase !== "intro") return;
    state.phase = "dead";
    state.deadT = 0;
    state.deathReason = reason;
    state.shake = 13;
    state.flash = 1;
    const head = cellPos(state.snake[0]);
    burst(head.x, head.y, "#ff5d6c", 34, 300);
    audio.bad();
    api.vibrate?.([30, 40, 60]);
    setTimeout(() => {
      if (state.resultSent) return;
      state.resultSent = true;
      const count = state.apples;
      api.lose(reason === "WALL"
        ? `You hit the wall with ${count} apple${count === 1 ? "" : "s"}. The wall remains undefeated.`
        : `You bit your own tail with ${count} apple${count === 1 ? "" : "s"}. Classic snake behavior.`);
    }, 900);
  }

  function win() {
    state.phase = "won";
    state.winT = 0;
    state.resultSent = true;
    const head = cellPos(state.snake[0]);
    burst(head.x, head.y, "#ffd23f", 46, 340);
    burst(head.x, head.y, "#3ee9a5", 26, 260);
    addFloat("15 APPLES!", "#ffd23f", head.x, head.y - 20, 1.1);
    audio.win();
    api.vibrate?.(35);
    const stars = state.time <= 32 ? 3 : state.time <= 50 ? 2 : 1;
    setTimeout(() => {
      api.win(stars, state.apples, {
        note: `Fifteen apples in ${state.time.toFixed(1)}s. The snake is enormous and the ad is furious.`,
      });
    }, 750);
  }

  function step() {
    state.dir = state.queued;
    const L = state.layout;
    const head = state.snake[0];
    const nx = head.x + state.dir.x;
    const ny = head.y + state.dir.y;

    if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) {
      die("WALL");
      return;
    }

    const eating = state.apple && nx === state.apple.x && ny === state.apple.y;
    const tailFree = state.grow === 0 && !eating;
    const body = tailFree ? state.snake.slice(0, -1) : state.snake;
    if (body.some((seg) => seg.x === nx && seg.y === ny)) {
      die("TAIL");
      return;
    }

    state.snake.unshift({ x: nx, y: ny });
    if (eating) {
      // +1 segment now and +1 more over the next step.
      state.grow += 1;
    } else if (state.grow > 0) {
      state.grow--;
    } else {
      state.snake.pop();
    }

    if (!eating) return;

    const p = cellPos({ x: nx, y: ny });
    state.apples++;
    state.stepInterval = Math.max(0.105, 0.2 - state.apples * 0.0058);
    state.flash = 0.45;
    state.shake = 3;
    burst(p.x, p.y, "#ffd23f", 16, 230);
    addFloat("+1", "#ffe45e", p.x, p.y - L.cell * 0.7, 0.78);
    audio.eat();
    api.vibrate?.(8);

    if (state.apples >= GOAL) {
      win();
      return;
    }
    spawnApple();
  }

  function update(dt) {
    state.time += dt;
    state.shake = Math.max(0, state.shake - dt * 26);
    state.flash = Math.max(0, state.flash - dt * 2.6);

    readInput();
    input.endFrame();

    if (state.phase === "intro") {
      state.intro -= dt;
      if (state.intro <= 0) state.phase = "play";
    }

    if (state.phase === "play") {
      state.stepTimer += dt;
      let guard = 0;
      while (state.stepTimer >= state.stepInterval && state.phase === "play" && guard++ < 3) {
        state.stepTimer -= state.stepInterval;
        step();
      }
    } else if (state.phase === "won") {
      state.winT += dt;
    } else if (state.phase === "dead") {
      state.deadT += dt;
    }

    for (const p of state.particles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 150 * dt;
      p.vx *= 1 - dt * 1.8;
      p.vy *= 1 - dt * 1.8;
    }
    state.particles = state.particles.filter((p) => p.life > 0);

    for (const f of state.floats) {
      f.life -= dt;
      f.y -= 34 * dt;
    }
    state.floats = state.floats.filter((f) => f.life > 0);

    if (state.apple) state.apple.phase += dt;
  }

  function drawBackdrop(ctx, w, h) {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#08251d");
    g.addColorStop(0.5, "#061611");
    g.addColorStop(1, "#030c09");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    const glow = ctx.createRadialGradient(w * 0.5, h * 0.16, 10, w * 0.5, h * 0.2, w * 0.72);
    glow.addColorStop(0, "rgba(62, 233, 165, 0.18)");
    glow.addColorStop(1, "rgba(62, 233, 165, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);

    // drifting motes
    for (let i = 0; i < 14; i++) {
      const x = ((i * 97 + state.time * (4 + i * 0.6)) % (w + 20)) - 10;
      const y = ((i * 131 + Math.sin(state.time * 0.4 + i) * 18) % (h + 20)) - 10;
      ctx.globalAlpha = 0.12 + (i % 3) * 0.05;
      ctx.fillStyle = i % 4 === 0 ? "#ffd23f" : "#3ee9a5";
      ctx.beginPath();
      ctx.arc(x, y, 1.3 + (i % 3) * 0.6, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    const vign = ctx.createRadialGradient(w / 2, h / 2, h * 0.24, w / 2, h / 2, h * 0.82);
    vign.addColorStop(0, "rgba(0,0,0,0)");
    vign.addColorStop(1, "rgba(0,0,0,0.44)");
    ctx.fillStyle = vign;
    ctx.fillRect(0, 0, w, h);
  }

  function drawBoard(ctx) {
    const L = state.layout;
    const x = L.ox;
    const y = L.oy;

    ctx.save();
    ctx.shadowColor = "rgba(62, 233, 165, 0.24)";
    ctx.shadowBlur = 26;
    ctx.fillStyle = "rgba(4, 18, 14, 0.92)";
    roundRect(ctx, x - 8, y - 8, L.bw + 16, L.bh + 16, 18);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.fillStyle = "#061812";
    roundRect(ctx, x, y, L.bw, L.bh, 12);
    ctx.fill();

    // checker cells
    for (let cy = 0; cy < ROWS; cy++) {
      for (let cx = 0; cx < COLS; cx++) {
        if ((cx + cy) % 2 === 0) {
          ctx.fillStyle = "rgba(62, 233, 165, 0.035)";
          ctx.fillRect(x + cx * L.cell, y + cy * L.cell, L.cell, L.cell);
        }
      }
    }

    // grid
    ctx.strokeStyle = "rgba(62, 233, 165, 0.075)";
    ctx.lineWidth = 1;
    for (let i = 1; i < COLS; i++) {
      ctx.beginPath();
      ctx.moveTo(x + i * L.cell, y);
      ctx.lineTo(x + i * L.cell, y + L.bh);
      ctx.stroke();
    }
    for (let i = 1; i < ROWS; i++) {
      ctx.beginPath();
      ctx.moveTo(x, y + i * L.cell);
      ctx.lineTo(x + L.bw, y + i * L.cell);
      ctx.stroke();
    }

    ctx.strokeStyle = "rgba(62, 233, 165, 0.32)";
    ctx.lineWidth = 2;
    roundRect(ctx, x, y, L.bw, L.bh, 12);
    ctx.stroke();
    ctx.restore();
  }

  function drawApple(ctx) {
    if (!state.apple) return;
    const L = state.layout;
    const p = cellPos(state.apple);
    const bob = Math.sin(state.time * 4 + state.apple.phase) * L.cell * 0.07;
    const pulse = 1 + Math.sin(state.time * 5 + state.apple.phase) * 0.05;

    ctx.save();
    const halo = ctx.createRadialGradient(p.x, p.y + bob, 2, p.x, p.y + bob, L.cell * 1.4);
    halo.addColorStop(0, "rgba(255, 210, 63, 0.42)");
    halo.addColorStop(1, "rgba(255, 210, 63, 0)");
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(p.x, p.y + bob, L.cell * 1.4, 0, TAU);
    ctx.fill();
    ctx.shadowColor = "rgba(255, 210, 63, 0.7)";
    ctx.shadowBlur = 16;
    drawSprite(ctx, "apple", p.x, p.y + bob, L.cell * 1.02 * pulse);
    ctx.restore();
  }

  function drawSnake(ctx) {
    const L = state.layout;
    const n = state.snake.length;
    if (!n) return;
    const deadFlicker = state.phase === "dead" && Math.floor(state.deadT * 16) % 2 === 0;

    ctx.save();
    ctx.shadowColor = "rgba(62, 233, 165, 0.45)";
    ctx.shadowBlur = 12;
    for (let i = n - 1; i >= 1; i--) {
      const p = cellPos(state.snake[i]);
      const t = i / Math.max(1, n - 1);
      const r = L.cell * (0.34 + 0.18 * (1 - t));
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, TAU);
      ctx.fillStyle = i % 3 === 0 ? "#7dffc7" : i % 3 === 1 ? "#2ee6a0" : "#19c184";
      if (deadFlicker) ctx.fillStyle = "#ff8fa3";
      ctx.fill();
      ctx.strokeStyle = "rgba(3, 26, 18, 0.4)";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      if (i % 2 === 0) {
        ctx.globalAlpha = 0.32;
        ctx.fillStyle = "#e9fff5";
        ctx.beginPath();
        ctx.arc(p.x - r * 0.28, p.y - r * 0.28, r * 0.24, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
    ctx.restore();

    const head = cellPos(state.snake[0]);
    const angle = Math.atan2(state.dir.y, state.dir.x);
    ctx.save();
    ctx.shadowColor = "rgba(62, 233, 165, 0.65)";
    ctx.shadowBlur = 18;
    ctx.globalAlpha = deadFlicker ? 0.55 : 1;
    drawSprite(ctx, "snakeHead", head.x, head.y, L.cell * 2.25, { rot: angle });
    ctx.restore();
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
      ctx.strokeStyle = "rgba(4, 18, 14, 0.7)";
      ctx.lineWidth = 3;
      ctx.font = `900 ${Math.round(clamp(stage.w * 0.055, 14, 22) * f.scale)}px ${DISPLAY}`;
      ctx.textAlign = "center";
      ctx.strokeText(f.text, f.x, f.y);
      ctx.fillText(f.text, f.x, f.y);
      ctx.restore();
    }
  }

  function drawHud(ctx, w, h) {
    const pad = 10;
    const cardH = 46;
    const L = state.layout;

    ctx.save();
    ctx.fillStyle = "rgba(4, 18, 14, 0.76)";
    roundRect(ctx, pad, 10, w - pad * 2, cardH, 12);
    ctx.fill();
    ctx.strokeStyle = "rgba(62, 233, 165, 0.22)";
    ctx.lineWidth = 1;
    ctx.stroke();

    drawSprite(ctx, "apple", pad + 21, 10 + cardH / 2, 24);
    ctx.fillStyle = "rgba(223, 253, 242, 0.52)";
    ctx.font = `800 7px ${DISPLAY}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText("APPLES", pad + 39, 25);
    ctx.fillStyle = "#fff";
    ctx.font = `900 18px ${DISPLAY}`;
    ctx.fillText(`${state.apples}`, pad + 39, 40);
    ctx.fillStyle = "rgba(223, 253, 242, 0.48)";
    ctx.font = `900 11px ${DISPLAY}`;
    ctx.fillText(`/ ${GOAL}`, pad + 39 + (state.apples > 9 ? 25 : 15), 41);

    const mm = Math.floor(state.time / 60);
    const ss = Math.floor(state.time % 60);
    ctx.textAlign = "right";
    ctx.fillStyle = "rgba(223, 253, 242, 0.5)";
    ctx.font = `800 7px ${DISPLAY}`;
    ctx.fillText("TIME", w - pad - 10, 25);
    ctx.fillStyle = "#dffdf2";
    ctx.font = `900 13px ${DISPLAY}`;
    ctx.fillText(`${mm}:${ss.toString().padStart(2, "0")}`, w - pad - 10, 40);

    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(223, 253, 242, 0.46)";
    ctx.font = `800 7px ${DISPLAY}`;
    ctx.fillText(`LENGTH ${state.snake.length}`, w / 2, 25);

    // progress
    const bx = pad;
    const by = 10 + cardH + 7;
    const bw = w - pad * 2;
    ctx.fillStyle = "rgba(4, 18, 14, 0.55)";
    roundRect(ctx, bx, by, bw, 6, 3);
    ctx.fill();
    const prog = clamp(state.apples / GOAL, 0, 1);
    const grad = ctx.createLinearGradient(bx, 0, bx + bw, 0);
    grad.addColorStop(0, "#3ee9a5");
    grad.addColorStop(0.7, "#ffd23f");
    grad.addColorStop(1, "#ff8a3d");
    ctx.fillStyle = grad;
    roundRect(ctx, bx, by, Math.max(3, bw * prog), 6, 3);
    ctx.fill();
    ctx.restore();

    // board edge marker on the progress line
    if (prog > 0) {
      ctx.save();
      ctx.fillStyle = "rgba(255,255,255,0.75)";
      ctx.beginPath();
      ctx.arc(bx + bw * prog, by + 3, 2.2, 0, TAU);
      ctx.fill();
      ctx.restore();
    }

    void h;
    void L;
  }

  function draw() {
    const { ctx } = stage;
    const w = stage.w;
    const h = stage.h;
    ctx.save();
    if (state.shake > 0.1) ctx.translate(rand(-state.shake, state.shake), rand(-state.shake, state.shake));

    drawBackdrop(ctx, w, h);
    drawBoard(ctx);
    drawApple(ctx);
    drawSnake(ctx);
    drawParticles(ctx);
    drawFloats(ctx);
    drawHud(ctx, w, h);

    if (state.phase === "intro") {
      const L = state.layout;
      const a = clamp(state.intro / 1.2, 0, 1);
      const cx = L.ox + L.bw / 2;
      const cy = L.oy + L.bh / 2;
      ctx.save();
      ctx.globalAlpha = 0.52 * a;
      ctx.fillStyle = "#04120e";
      roundRect(ctx, L.ox + 8, cy - 66, L.bw - 16, 132, 16);
      ctx.fill();
      ctx.globalAlpha = a;
      ctx.textAlign = "center";
      ctx.fillStyle = "#dffdf2";
      ctx.font = `900 ${Math.round(clamp(w * 0.072, 22, 30))}px ${DISPLAY}`;
      ctx.fillText("SWIPE TO STEER", cx, cy - 16);
      ctx.fillStyle = "#ffd23f";
      ctx.font = `900 ${Math.round(clamp(w * 0.04, 12, 17))}px ${DISPLAY}`;
      ctx.fillText("EAT 15 APPLES", cx, cy + 14);
      ctx.fillStyle = "rgba(223, 253, 242, 0.55)";
      ctx.font = `800 ${Math.round(clamp(w * 0.026, 9, 11))}px ${DISPLAY}`;
      ctx.fillText("OR TAP A SIDE · DON'T BITE YOURSELF", cx, cy + 36);
      ctx.restore();
    }

    if (state.phase === "dead") {
      const L = state.layout;
      const p = cellPos(state.snake[0]);
      ctx.save();
      ctx.globalAlpha = clamp(1 - state.deadT * 0.4, 0.55, 1);
      ctx.textAlign = "center";
      ctx.fillStyle = "#ff8fa3";
      ctx.strokeStyle = "rgba(3, 12, 9, 0.8)";
      ctx.lineWidth = 8;
      ctx.font = `900 ${Math.round(clamp(w * 0.1, 28, 42))}px ${DISPLAY}`;
      const text = state.deathReason === "WALL" ? "WALL!" : "TAIL BIT!";
      ctx.strokeText(text, p.x, Math.max(120, p.y - 26));
      ctx.fillText(text, p.x, Math.max(120, p.y - 26));
      ctx.restore();
    }

    if (state.phase === "won") {
      const L = state.layout;
      const t = easeOutCubic(clamp(state.winT / 0.5, 0, 1));
      ctx.save();
      ctx.globalAlpha = t;
      ctx.textAlign = "center";
      ctx.fillStyle = "#ffd23f";
      ctx.strokeStyle = "rgba(3, 12, 9, 0.8)";
      ctx.lineWidth = 8;
      ctx.font = `900 ${Math.round(clamp(w * 0.095, 26, 40))}px ${DISPLAY}`;
      ctx.strokeText("15 APPLES!", L.ox + L.bw / 2, L.oy + L.bh * 0.36);
      ctx.fillText("15 APPLES!", L.ox + L.bw / 2, L.oy + L.bh * 0.36);
      ctx.restore();
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

  return {
    destroy() {
      loop.stop();
      input.destroy();
      stopPointer();
      offResize();
      stage.destroy();
    },
  };
}
