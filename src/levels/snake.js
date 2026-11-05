import {
  createStage, createLoop, bindPointer, createKeyboard,
  clamp, lerp, rand, roundRect, TAU, dist, rotateToward, normAngle, angleDiff,
} from "../util.js";
import { drawSprite } from "../sprites.js";
import { audio } from "../audio.js";

const DISPLAY = '"Arial Rounded MT Bold", "Trebuchet MS", system-ui, sans-serif';
const GOAL = 110;

export function mount(root, api) {
  root.innerHTML = "";
  const stage = createStage(root);
  const input = createKeyboard();

  const state = {
    phase: "play",
    time: 0,
    size: 10,
    angle: -Math.PI / 2,
    targetAngle: -Math.PI / 2,
    head: { x: stage.w / 2, y: stage.h * 0.58 },
    trail: [],
    orbs: [],
    particles: [],
    shake: 0,
    deadT: 0,
    winT: 0,
    eaten: 0,
    pointerSteer: null,
    mouseActive: false,
    joystick: { active: false, x: 0, y: 0, dx: 0, dy: 0 },
    intro: 3.2,
  };

  // seed the tail behind the head
  for (let i = 0; i < 100; i++) {
    state.trail.push({ x: state.head.x, y: state.head.y + i * 4 });
  }

  function headRadius() {
    return clamp(11 + (state.size - 10) * 0.035, 11, 19);
  }

  function bodyLength() {
    return clamp(64 + (state.size - 10) * 1.7, 64, 280);
  }

  function targetCount() {
    return 15;
  }

  function randomOrb() {
    const { w, h } = stage;
    const margin = 32;
    let x = 0;
    let y = 0;
    let ok = false;
    for (let tries = 0; tries < 60; tries++) {
      x = rand(margin, w - margin);
      y = rand(margin, h - margin);
      if (dist(x, y, state.head.x, state.head.y) < Math.min(w, h) * 0.2) continue;
      if (state.orbs.some((o) => dist(x, y, o.x, o.y) < 46)) continue;
      ok = true;
      break;
    }
    if (!ok) {
      x = rand(margin, w - margin);
      y = rand(margin, h - margin);
    }
    const roll = Math.random();
    let value;
    if (roll < 0.48) value = Math.max(2, Math.round(state.size * rand(0.18, 0.68)));
    else if (roll < 0.8) value = Math.max(3, Math.round(state.size * rand(0.82, 1.24)));
    else value = Math.max(4, Math.round(state.size * rand(1.35, 2.15)));
    return {
      x, y, v: value,
      vx: rand(-16, 16),
      vy: rand(-16, 16),
      phase: rand(0, TAU),
      born: rand(0, 0.4),
      r: clamp(12 + Math.log2(value + 1) * 4.1, 15, 31),
    };
  }

  for (let i = 0; i < targetCount(); i++) state.orbs.push(randomOrb());

  const stopPointer = bindPointer(stage.canvas, {
    down(p, e) {
      if (e.pointerType === "mouse") {
        state.mouseActive = true;
        steerTo(p.x, p.y);
      } else {
        state.joystick.active = true;
        state.joystick.x = p.x;
        state.joystick.y = p.y;
        state.joystick.dx = 0;
        state.joystick.dy = 0;
      }
    },
    move(p, e) {
      if (e.pointerType === "mouse") {
        state.mouseActive = true;
        steerTo(p.x, p.y);
      } else if (state.joystick.active) {
        const dx = p.x - state.joystick.x;
        const dy = p.y - state.joystick.y;
        const len = Math.hypot(dx, dy);
        if (len > 14) {
          const capped = Math.min(len, 52);
          state.joystick.dx = (dx / len) * capped;
          state.joystick.dy = (dy / len) * capped;
          state.targetAngle = Math.atan2(dy, dx);
        }
      }
    },
    up() {
      state.joystick.active = false;
      state.joystick.dx = 0;
      state.joystick.dy = 0;
    },
    leave() {
      state.mouseActive = false;
    },
  });

  function steerTo(x, y) {
    const dx = x - state.head.x;
    const dy = y - state.head.y;
    if (Math.hypot(dx, dy) > 20) state.targetAngle = Math.atan2(dy, dx);
  }

  function burst(x, y, color, amount = 10, power = 180) {
    for (let i = 0; i < amount; i++) {
      const a = rand(0, TAU);
      const sp = rand(power * 0.25, power);
      state.particles.push({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: rand(0.3, 0.8),
        max: 0.8,
        size: rand(1.5, 4.5),
        color,
      });
    }
  }

  function eatOrb(orb) {
    state.eaten++;
    const gain = Math.max(2, Math.round(orb.v * 0.78));
    state.size += gain;
    burst(orb.x, orb.y, "#3ee9a5", 20, 250);
    state.orbs.splice(state.orbs.indexOf(orb), 1);
    state.orbs.push(randomOrb());
    audio.eat();
    api.vibrate?.(8);
    if (state.size >= GOAL && state.phase === "play") {
      state.phase = "won";
      state.winT = 0;
      audio.win();
      const stars = state.time <= 35 ? 3 : state.time <= 55 ? 2 : 1;
      setTimeout(() => {
        api.win(stars, Math.round(state.size), {
          note: `Grew to ${Math.round(state.size)} in ${state.time.toFixed(1)}s. The arena respects you now.`,
        });
      }, 650);
    }
  }

  function update(dt) {
    state.time += dt;
    state.intro = Math.max(0, state.intro - dt);
    input.endFrame();
    state.shake = Math.max(0, state.shake - dt * 22);

    if (state.phase === "play") {
      // steering priority: keyboard > touch joystick > mouse
      let kx = 0;
      let ky = 0;
      if (input.isDown("arrowleft", "a")) kx -= 1;
      if (input.isDown("arrowright", "d")) kx += 1;
      if (input.isDown("arrowup", "w")) ky -= 1;
      if (input.isDown("arrowdown", "s")) ky += 1;
      if (kx || ky) state.targetAngle = Math.atan2(ky, kx);
      else if (state.joystick.active) {
        if (Math.hypot(state.joystick.dx, state.joystick.dy) > 4) {
          state.targetAngle = Math.atan2(state.joystick.dy, state.joystick.dx);
        }
      }

      const turn = 5.2 * dt;
      state.angle = rotateToward(state.angle, state.targetAngle, turn);

      const speed = clamp(Math.min(stage.w, stage.h) * 0.57, 150, 250);
      state.head.x += Math.cos(state.angle) * speed * dt;
      state.head.y += Math.sin(state.angle) * speed * dt;

      const pad = headRadius() + 3;
      let clamped = false;
      if (state.head.x < pad) { state.head.x = pad; clamped = true; }
      if (state.head.x > stage.w - pad) { state.head.x = stage.w - pad; clamped = true; }
      if (state.head.y < pad) { state.head.y = pad; clamped = true; }
      if (state.head.y > stage.h - pad) { state.head.y = stage.h - pad; clamped = true; }
      if (clamped) {
        // slide along the wall instead of sticking
        state.targetAngle = state.angle + Math.PI * 0.5;
        state.angle = state.targetAngle;
      }

      // trail sampling
      const last = state.trail[0];
      if (dist(state.head.x, state.head.y, last.x, last.y) > 4.2) {
        state.trail.unshift({ x: state.head.x, y: state.head.y });
      }
      const maxPoints = Math.ceil(bodyLength() / 4.2) + 4;
      if (state.trail.length > maxPoints) state.trail.length = maxPoints;
      // maintain enough tail while growing
      while (state.trail.length < maxPoints) {
        const tail = state.trail[state.trail.length - 1];
        state.trail.push({ x: tail.x - Math.cos(state.angle) * 4, y: tail.y - Math.sin(state.angle) * 4 });
      }

      // orbs drift
      for (const orb of state.orbs) {
        orb.phase += dt;
        orb.x += orb.vx * dt;
        orb.y += orb.vy * dt;
        if (orb.x < orb.r + 16) { orb.x = orb.r + 16; orb.vx = Math.abs(orb.vx); }
        if (orb.x > stage.w - orb.r - 16) { orb.x = stage.w - orb.r - 16; orb.vx = -Math.abs(orb.vx); }
        if (orb.y < orb.r + 16) { orb.y = orb.r + 16; orb.vy = Math.abs(orb.vy); }
        if (orb.y > stage.h - orb.r - 16) { orb.y = stage.h - orb.r - 16; orb.vy = -Math.abs(orb.vy); }
      }

      // collisions
      for (const orb of [...state.orbs]) {
        const rr = headRadius() * 0.72 + orb.r * 0.78;
        if (dist(state.head.x, state.head.y, orb.x, orb.y) < rr) {
          if (orb.v <= state.size) {
            eatOrb(orb);
          } else {
            state.phase = "dead";
            state.deadT = 0;
            state.shake = 12;
            burst(state.head.x, state.head.y, "#ff5d6c", 34, 300);
            audio.bad();
            api.vibrate?.([30, 40, 60]);
            setTimeout(() => {
              api.lose(`You were size ${state.size} and tried to eat a ${orb.v}. Ambition: noted.`);
            }, 850);
          }
          break;
        }
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
      p.vx *= 1 - dt * 1.2;
      p.vy *= 1 - dt * 1.2;
    }
    state.particles = state.particles.filter((p) => p.life > 0);
  }

  function drawArena(ctx, w, h) {
    const g = ctx.createRadialGradient(w * 0.5, h * 0.45, 20, w * 0.5, h * 0.5, Math.max(w, h) * 0.78);
    g.addColorStop(0, "#0b2630");
    g.addColorStop(0.55, "#081821");
    g.addColorStop(1, "#050d13");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // dot grid
    ctx.save();
    ctx.fillStyle = "rgba(94, 255, 196, 0.09)";
    const gap = 27;
    for (let y = gap / 2; y < h; y += gap) {
      for (let x = gap / 2; x < w; x += gap) {
        ctx.beginPath();
        ctx.arc(x, y, 1.4, 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();

    // arena boundary
    ctx.save();
    ctx.strokeStyle = "rgba(62, 233, 165, 0.22)";
    ctx.lineWidth = 3;
    roundRect(ctx, 10, 10, w - 20, h - 20, 20);
    ctx.stroke();
    ctx.strokeStyle = "rgba(62, 233, 165, 0.06)";
    ctx.lineWidth = 10;
    roundRect(ctx, 10, 10, w - 20, h - 20, 20);
    ctx.stroke();
    ctx.restore();

    // ambient motes
    for (let i = 0; i < 12; i++) {
      const x = ((i * 83 + state.time * (6 + i)) % (w + 20)) - 10;
      const y = (i * 147 + Math.sin(state.time * 0.5 + i) * 20) % h;
      ctx.globalAlpha = 0.12 + (i % 3) * 0.04;
      ctx.fillStyle = "#3ee9a5";
      ctx.beginPath();
      ctx.arc(x, y, 1.6, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawOrb(ctx, orb) {
    const edible = orb.v <= state.size;
    const bob = Math.sin(state.time * 3 + orb.phase) * 2.5;
    const size = orb.r * 2.3 * (1 + Math.sin(state.time * 4 + orb.phase) * 0.015);
    const x = orb.x;
    const y = orb.y + bob;

    ctx.save();
    ctx.shadowColor = edible ? "rgba(62, 233, 165, 0.35)" : "rgba(255, 93, 108, 0.38)";
    ctx.shadowBlur = 18;
    drawSprite(ctx, edible ? "orbGreen" : "orbRed", x, y, size, { rot: Math.sin(state.time * 2 + orb.phase) * 0.06 });
    ctx.restore();

    ctx.save();
    ctx.font = `900 ${Math.round(clamp(orb.r * 0.82, 11, 20))}px ${DISPLAY}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = "rgba(8, 12, 18, 0.65)";
    ctx.strokeText(String(orb.v), x, y + orb.r * 0.08);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(String(orb.v), x, y + orb.r * 0.08);
    ctx.restore();
  }

  function drawSnake(ctx, w, h) {
    const hr = headRadius();
    const points = state.trail;
    const n = points.length;
    if (!n) return;

    // glow
    ctx.save();
    ctx.shadowColor = "rgba(62, 233, 165, 0.55)";
    ctx.shadowBlur = 18;

    // draw from tail to head
    for (let i = n - 1; i >= 0; i--) {
      const t = i / Math.max(1, n - 1);
      const r = hr * lerp(0.28, 1, 1 - t) * (state.phase === "dead" ? 0.9 : 1);
      const p = points[i];
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, TAU);
      const shade = i % 3;
      ctx.fillStyle = shade === 0 ? "#19b97b" : shade === 1 ? "#20cd88" : "#2ee6a0";
      ctx.fill();
    }
    ctx.restore();

    // belly stripe
    ctx.save();
    ctx.strokeStyle = "rgba(190, 255, 226, 0.38)";
    ctx.lineWidth = Math.max(2, hr * 0.34);
    ctx.lineCap = "round";
    ctx.beginPath();
    for (let i = 0; i < n; i += 2) {
      const p = points[i];
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
    ctx.restore();

    // head
    const headSize = hr * 3.6;
    ctx.save();
    ctx.shadowColor = "rgba(62, 233, 165, 0.55)";
    ctx.shadowBlur = 22;
    drawSprite(ctx, "snakeHead", state.head.x, state.head.y, headSize, { rot: state.angle });
    ctx.restore();

    // aim eyes bug out when close to a larger orb
    let danger = null;
    let dangerD = Infinity;
    for (const o of state.orbs) {
      if (o.v > state.size) {
        const d = dist(state.head.x, state.head.y, o.x, o.y);
        if (d < dangerD) { dangerD = d; danger = o; }
      }
    }
    if (danger && dangerD < 110 && state.phase === "play") {
      ctx.save();
      ctx.globalAlpha = clamp(1 - dangerD / 110, 0, 1);
      ctx.fillStyle = "#ff5d6c";
      ctx.font = `900 ${Math.round(clamp(w * 0.03, 10, 14))}px ${DISPLAY}`;
      ctx.textAlign = "center";
      ctx.fillText("!!", state.head.x + Math.cos(state.angle) * 24, state.head.y + Math.sin(state.angle) * 24 - 22);
      ctx.restore();
    }
  }

  function drawJoystick(ctx) {
    if (!state.joystick.active) return;
    const { x, y, dx, dy } = state.joystick;
    ctx.save();
    ctx.globalAlpha = 0.32;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, 42, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.fill();
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = "#3ee9a5";
    ctx.beginPath();
    ctx.arc(x + dx, y + dy, 16, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function drawHud(ctx, w, h) {
    const pad = 12;
    const barW = w - pad * 2;
    ctx.save();
    ctx.fillStyle = "rgba(4, 12, 17, 0.62)";
    roundRect(ctx, pad, pad, barW, 36, 10);
    ctx.fill();
    ctx.strokeStyle = "rgba(62, 233, 165, 0.2)";
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = "#dffdf2";
    ctx.font = `900 10px ${DISPLAY}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(`SIZE ${Math.round(state.size)}`, pad + 10, pad + 13);

    const time = state.time;
    const mm = Math.floor(time / 60);
    const ss = Math.floor(time % 60);
    ctx.textAlign = "right";
    ctx.fillStyle = "rgba(223, 253, 242, 0.7)";
    ctx.fillText(`${mm}:${ss.toString().padStart(2, "0")}`, w - pad - 10, pad + 13);

    const bx = pad + 10;
    const by = pad + 23;
    const bw = barW - 20;
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    roundRect(ctx, bx, by, bw, 5, 3);
    ctx.fill();
    const prog = clamp((state.size - 10) / (GOAL - 10), 0, 1);
    const grad = ctx.createLinearGradient(bx, 0, bx + bw, 0);
    grad.addColorStop(0, "#3ee9a5");
    grad.addColorStop(1, "#ffd23f");
    ctx.fillStyle = grad;
    roundRect(ctx, bx, by, bw * prog, 5, 3);
    ctx.fill();

    ctx.fillStyle = "rgba(223, 253, 242, 0.45)";
    ctx.font = `800 7.5px ${DISPLAY}`;
    ctx.textAlign = "right";
    ctx.fillText(`GOAL ${GOAL}`, w - pad - 10, pad + 37 + 7);
    ctx.restore();
  }

  function draw() {
    const { ctx } = stage;
    const w = stage.w;
    const h = stage.h;
    ctx.save();
    if (state.shake > 0.1) ctx.translate(rand(-state.shake, state.shake), rand(-state.shake, state.shake));

    drawArena(ctx, w, h);
    for (const orb of state.orbs) drawOrb(ctx, orb);
    drawSnake(ctx, w, h);

    for (const p of state.particles) {
      const a = clamp(p.life / p.max, 0, 1);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    drawJoystick(ctx);
    drawHud(ctx, w, h);

    if (state.intro > 0 && state.phase === "play") {
      const a = clamp(state.intro > 2.7 ? (3.2 - state.intro) * 2 : state.intro / 1.2, 0, 1);
      ctx.save();
      ctx.globalAlpha = a * 0.9;
      ctx.fillStyle = "#dffdf2";
      ctx.font = `900 ${Math.round(clamp(w * 0.06, 18, 26))}px ${DISPLAY}`;
      ctx.textAlign = "center";
      ctx.fillText("EAT SMALLER", w / 2, h * 0.32);
      ctx.fillStyle = "#ff9fb0";
      ctx.fillText("AVOID BIGGER", w / 2, h * 0.32 + 29);
      ctx.restore();
    }

    if (state.phase === "dead") {
      ctx.save();
      ctx.globalAlpha = clamp(1 - state.deadT * 0.7, 0, 1);
      ctx.fillStyle = "rgba(255, 93, 108, 0.12)";
      ctx.fillRect(0, 0, w, h);
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
