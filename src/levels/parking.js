import {
  createStage, createLoop, bindPointer, createKeyboard,
  clamp, rand, roundRect, TAU,
} from "../util.js";
import { audio } from "../audio.js";

const DISPLAY = '"Arial Rounded MT Bold", "Trebuchet MS", system-ui, sans-serif';
const DURATION = 25;
const LANE_COUNT = 3;

export function mount(root, api) {
  root.innerHTML = "";
  const stage = createStage(root);
  const input = createKeyboard();
  let destroyed = false;
  let resultTimer = 0;
  let anchor = null;

  const state = {
    phase: "play",
    time: 0,
    lane: 1,
    hp: 3,
    coins: 0,
    objects: [],
    particles: [],
    floats: [],
    spawnTimer: 0.5,
    invulnerable: 0,
    shake: 0,
    flash: 0,
    hint: 3.2,
    roadOffset: 0,
    ended: false,
    endTimer: 0,
  };

  function layout() {
    const w = stage.w;
    const h = stage.h;
    const roadW = Math.min(w * 0.88, 444);
    const roadX = (w - roadW) / 2;
    const laneW = roadW / LANE_COUNT;
    const carW = Math.min(laneW * 0.58, 76);
    const carH = clamp(carW * 1.48, 48, 94);
    return {
      w, h, roadX, roadW, laneW,
      roadY: 0,
      carW, carH,
      playerY: Math.min(h - carH * 0.82, h * 0.79),
      carX(lane) { return roadX + laneW * (lane + 0.5); },
    };
  }

  function changeLane(direction) {
    if (state.phase !== "play") return;
    const next = clamp(state.lane + direction, 0, LANE_COUNT - 1);
    if (next === state.lane) return;
    state.lane = next;
    audio.tap();
  }

  function readInput() {
    if (input.wasPressed("arrowleft", "a")) changeLane(-1);
    if (input.wasPressed("arrowright", "d")) changeLane(1);
    input.endFrame();
  }

  const stopPointer = bindPointer(stage.canvas, {
    down(p) { anchor = { x: p.x, y: p.y }; },
    up(p) {
      if (!anchor || state.phase !== "play") { anchor = null; return; }
      const dx = p.x - anchor.x;
      const dy = p.y - anchor.y;
      if (Math.abs(dx) > 22 && Math.abs(dx) > Math.abs(dy) * 1.12) {
        changeLane(Math.sign(dx));
      } else if (Math.hypot(dx, dy) < 24) {
        changeLane(p.x < stage.w / 2 ? -1 : 1);
      }
      anchor = null;
    },
    leave() { anchor = null; },
  });

  function burst(x, y, color, count = 14, power = 180) {
    for (let i = 0; i < count; i++) {
      const angle = rand(0, TAU);
      const speed = rand(power * 0.22, power);
      state.particles.push({
        x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        life: rand(0.3, 0.75), max: 0.75, size: rand(2, 5), color,
      });
    }
  }

  function addFloat(text, x, y, color) {
    state.floats.push({ text, x, y, color, life: 0.9 });
  }

  function spawnObject() {
    const lane = Math.floor(rand(0, LANE_COUNT));
    const makeCoin = Math.random() < 0.37;
    // Keep a little breathing room between objects in the same lane.
    const close = state.objects.some((o) => o.lane === lane && o.y < 115);
    if (close) {
      state.spawnTimer = rand(0.23, 0.42);
      return;
    }
    state.objects.push({
      lane,
      kind: makeCoin ? "coin" : "car",
      y: -70,
      speed: (makeCoin ? 1 : 1) * rand(0.92, 1.12),
      color: ["#ff6b6b", "#8b7cff", "#ffb84d", "#3dd6c6", "#f06fb1"][Math.floor(rand(0, 5))],
      wiggle: rand(0, TAU),
      hit: false,
    });
    state.spawnTimer = rand(0.68, 0.98) * Math.max(0.72, 1 - state.time * 0.009);
  }

  function lose(reason) {
    if (state.phase !== "play") return;
    state.phase = "lost";
    state.endTimer = 0;
    state.shake = 14;
    state.flash = 1;
    const L = layout();
    burst(L.carX(state.lane), L.playerY, "#ff5468", 32, 270);
    audio.fail();
    api.vibrate?.([35, 40, 70]);
    resultTimer = setTimeout(() => {
      if (destroyed || state.ended) return;
      state.ended = true;
      api.lose(reason);
    }, 850);
  }

  function win() {
    if (state.phase !== "play") return;
    state.phase = "won";
    state.endTimer = 0;
    const L = layout();
    burst(L.carX(state.lane), L.playerY, "#ffd64a", 38, 290);
    burst(L.carX(state.lane), L.playerY, "#42e6ad", 22, 210);
    audio.win();
    api.vibrate?.(35);
    const stars = state.hp === 3 ? 3 : state.hp === 2 ? 2 : 1;
    resultTimer = setTimeout(() => {
      if (destroyed || state.ended) return;
      state.ended = true;
      api.win(stars, state.coins, {
        note: `Made it through rush hour with ${state.hp} of 3 hearts and ${state.coins} coin${state.coins === 1 ? "" : "s"}.`,
      });
    }, 700);
  }

  function update(dt) {
    readInput();
    state.shake = Math.max(0, state.shake - dt * 30);
    state.flash = Math.max(0, state.flash - dt * 2.8);
    state.hint = Math.max(0, state.hint - dt);
    state.invulnerable = Math.max(0, state.invulnerable - dt);

    if (state.phase === "play") {
      state.time = Math.min(DURATION, state.time + dt);
      state.roadOffset = (state.roadOffset + dt * (185 + state.time * 3.3)) % 92;
      state.spawnTimer -= dt;
      if (state.spawnTimer <= 0) spawnObject();

      const L = layout();
      for (const o of state.objects) {
        o.y += (190 + state.time * 5.2) * o.speed * dt;
        o.wiggle += dt * 5;
        if (o.hit || o.lane !== state.lane || Math.abs(o.y - L.playerY) > L.carH * 0.56) continue;
        if (o.kind === "coin") {
          o.hit = true;
          state.coins++;
          burst(L.carX(o.lane), o.y, "#ffd64a", 12, 150);
          addFloat("+1", L.carX(o.lane), o.y - 20, "#fff09a");
          audio.eat();
          api.vibrate?.(8);
        } else if (state.invulnerable <= 0) {
          o.hit = true;
          state.hp--;
          state.invulnerable = 1.15;
          state.shake = 8;
          state.flash = 0.9;
          burst(L.carX(o.lane), o.y, "#ff6476", 22, 230);
          addFloat("OUCH!", L.carX(o.lane), o.y - 28, "#ff9aaa");
          audio.hurt();
          api.vibrate?.([25, 30, 45]);
          if (state.hp <= 0) lose("Three traffic bumps! Rush hour wins this round.");
        }
      }
      state.objects = state.objects.filter((o) => !o.hit && o.y < L.h + 100);
      if (state.phase === "play" && state.time >= DURATION) win();
    } else {
      state.endTimer += dt;
    }

    for (const p of state.particles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 170 * dt;
      p.vx *= 1 - dt * 1.6;
      p.vy *= 1 - dt * 1.2;
    }
    state.particles = state.particles.filter((p) => p.life > 0);
    for (const f of state.floats) { f.life -= dt; f.y -= 30 * dt; }
    state.floats = state.floats.filter((f) => f.life > 0);
  }

  function drawBackground(ctx, L) {
    const sky = ctx.createLinearGradient(0, 0, 0, L.h);
    sky.addColorStop(0, "#182951");
    sky.addColorStop(0.48, "#343f72");
    sky.addColorStop(1, "#1c2749");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, L.w, L.h);

    // City blocks and warm windows make the highway feel alive without clutter.
    for (let i = 0; i < 8; i++) {
      const bw = L.roadX * 0.28 + (i % 3) * 5;
      const bh = 75 + ((i * 43) % Math.max(90, L.h * 0.38));
      const side = i % 2 === 0 ? 0 : 1;
      const x = side ? L.roadX + L.roadW + 7 + (i % 2) * 14 : 4 + (i % 2) * 14;
      const y = ((i * 91 + state.roadOffset * 0.24) % (L.h + bh)) - bh;
      ctx.fillStyle = i % 2 ? "#27345d" : "#222e55";
      roundRect(ctx, x, y, Math.max(12, bw), bh, 5);
      ctx.fill();
      ctx.fillStyle = "rgba(255, 207, 106, 0.48)";
      for (let wy = y + 12; wy < y + bh - 8; wy += 19) {
        for (let wx = x + 7; wx < x + bw - 5; wx += 13) {
          if ((Math.floor(wx + wy) + i) % 3 !== 0) ctx.fillRect(wx, wy, 4, 6);
        }
      }
    }

    ctx.fillStyle = "#dce8f4";
    ctx.fillRect(L.roadX - 7, 0, 7, L.h);
    ctx.fillRect(L.roadX + L.roadW, 0, 7, L.h);
    ctx.fillStyle = "#30394d";
    ctx.fillRect(L.roadX, 0, L.roadW, L.h);
    const roadGrad = ctx.createLinearGradient(L.roadX, 0, L.roadX + L.roadW, 0);
    roadGrad.addColorStop(0, "rgba(0,0,0,0.12)");
    roadGrad.addColorStop(0.5, "rgba(255,255,255,0.015)");
    roadGrad.addColorStop(1, "rgba(0,0,0,0.12)");
    ctx.fillStyle = roadGrad;
    ctx.fillRect(L.roadX, 0, L.roadW, L.h);

    for (let i = 1; i < LANE_COUNT; i++) {
      const x = L.roadX + i * L.laneW;
      ctx.fillStyle = "rgba(255,255,255,0.72)";
      for (let y = -92 + state.roadOffset; y < L.h; y += 92) {
        roundRect(ctx, x - 1.2, y, 2.4, 47, 2);
        ctx.fill();
      }
    }
    // Reflective road studs.
    for (let y = -92 + state.roadOffset; y < L.h; y += 92) {
      ctx.fillStyle = "rgba(255,213,101,0.6)";
      ctx.fillRect(L.roadX + 4, y + 44, 2, 7);
      ctx.fillRect(L.roadX + L.roadW - 6, y + 44, 2, 7);
    }
  }

  function drawCar(ctx, x, y, w, h, color, player = false, rotation = 0) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    ctx.fillStyle = "rgba(6,10,22,0.38)";
    roundRect(ctx, -w * 0.46 + 2, -h * 0.44 + 4, w * 0.92, h * 0.9, w * 0.22);
    ctx.fill();
    // tires
    ctx.fillStyle = "#111827";
    roundRect(ctx, -w * 0.54, -h * 0.3, w * 0.13, h * 0.22, 3); ctx.fill();
    roundRect(ctx, w * 0.41, -h * 0.3, w * 0.13, h * 0.22, 3); ctx.fill();
    roundRect(ctx, -w * 0.54, h * 0.12, w * 0.13, h * 0.22, 3); ctx.fill();
    roundRect(ctx, w * 0.41, h * 0.12, w * 0.13, h * 0.22, 3); ctx.fill();
    const body = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
    body.addColorStop(0, player ? "#16a97e" : color);
    body.addColorStop(0.48, player ? "#58f0b5" : color);
    body.addColorStop(1, player ? "#07875f" : color);
    ctx.fillStyle = body;
    roundRect(ctx, -w * 0.43, -h / 2, w * 0.86, h, w * 0.23);
    ctx.fill();
    ctx.strokeStyle = player ? "rgba(221,255,240,0.75)" : "rgba(255,255,255,0.32)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = player ? "#174b60" : "#243b59";
    roundRect(ctx, -w * 0.31, -h * 0.22, w * 0.62, h * 0.3, w * 0.12); ctx.fill();
    ctx.fillStyle = "rgba(219,248,255,0.72)";
    roundRect(ctx, -w * 0.26, -h * 0.18, w * 0.52, h * 0.18, w * 0.08); ctx.fill();
    ctx.fillStyle = player ? "#fff1a8" : "#ffefb0";
    roundRect(ctx, -w * 0.32, -h * 0.48, w * 0.2, h * 0.045, 2); ctx.fill();
    roundRect(ctx, w * 0.12, -h * 0.48, w * 0.2, h * 0.045, 2); ctx.fill();
    ctx.fillStyle = player ? "#ff566d" : "#ff6a6a";
    roundRect(ctx, -w * 0.31, h * 0.43, w * 0.19, h * 0.045, 2); ctx.fill();
    roundRect(ctx, w * 0.12, h * 0.43, w * 0.19, h * 0.045, 2); ctx.fill();
    if (player) {
      ctx.fillStyle = "rgba(255,255,255,0.45)";
      roundRect(ctx, -w * 0.035, -h * 0.42, w * 0.07, h * 0.14, 3); ctx.fill();
    }
    ctx.restore();
  }

  function drawCoin(ctx, x, y, size, phase) {
    const spin = 0.78 + Math.abs(Math.sin(phase)) * 0.22;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(spin, 1);
    ctx.shadowColor = "rgba(255,208,64,0.8)";
    ctx.shadowBlur = 14;
    const grad = ctx.createLinearGradient(0, -size, 0, size);
    grad.addColorStop(0, "#fff4a8"); grad.addColorStop(0.45, "#ffc93e"); grad.addColorStop(1, "#f48b22");
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(0, 0, size, 0, TAU); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "#ffe981"; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = "#c6771f";
    ctx.font = `900 ${Math.round(size * 1.12)}px ${DISPLAY}`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("$", 0, 1);
    ctx.restore();
  }

  function drawHeart(ctx, x, y, size, filled) {
    ctx.save(); ctx.translate(x, y); ctx.scale(size / 18, size / 18);
    ctx.beginPath(); ctx.moveTo(0, 7);
    ctx.bezierCurveTo(-17, -3, -9, -15, 0, -7);
    ctx.bezierCurveTo(9, -15, 17, -3, 0, 7); ctx.closePath();
    ctx.fillStyle = filled ? "#ff6174" : "rgba(255,255,255,0.12)";
    ctx.fill(); ctx.strokeStyle = filled ? "#ffd1d5" : "rgba(255,255,255,0.3)";
    ctx.lineWidth = 1.5; ctx.stroke(); ctx.restore();
  }

  function drawHud(ctx, L) {
    const top = 12;
    ctx.save();
    ctx.fillStyle = "rgba(14,22,46,0.78)";
    roundRect(ctx, 10, top, L.w - 20, 52, 16); ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.15)"; ctx.lineWidth = 1; ctx.stroke();

    for (let i = 0; i < 3; i++) drawHeart(ctx, 30 + i * 23, top + 25, 17, i < state.hp);
    ctx.textAlign = "left"; ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(226,239,255,0.62)";
    ctx.font = `800 8px ${DISPLAY}`; ctx.fillText("COINS", 103, top + 16);
    ctx.fillStyle = "#ffdc62"; ctx.font = `900 17px ${DISPLAY}`;
    ctx.fillText(`${state.coins}`, 103, top + 37);

    const left = Math.max(0, DURATION - state.time);
    ctx.textAlign = "right"; ctx.fillStyle = "rgba(226,239,255,0.62)";
    ctx.font = `800 8px ${DISPLAY}`; ctx.fillText("SURVIVE", L.w - 24, top + 16);
    ctx.fillStyle = left < 6 ? "#ffdf67" : "#fff";
    ctx.font = `900 17px ${DISPLAY}`;
    ctx.fillText(`${left.toFixed(1)}s`, L.w - 24, top + 37);

    const bx = 12, by = top + 58, bw = L.w - 24;
    ctx.fillStyle = "rgba(11,17,36,0.45)"; roundRect(ctx, bx, by, bw, 5, 3); ctx.fill();
    const progress = clamp(state.time / DURATION, 0, 1);
    const bar = ctx.createLinearGradient(bx, 0, bx + bw, 0);
    bar.addColorStop(0, "#35e3a7"); bar.addColorStop(1, "#ffd351");
    ctx.fillStyle = bar; roundRect(ctx, bx, by, Math.max(2, bw * progress), 5, 3); ctx.fill();
    ctx.restore();
  }

  function draw() {
    const ctx = stage.ctx;
    const L = layout();
    ctx.save();
    if (state.shake > 0.1) ctx.translate(rand(-state.shake, state.shake), rand(-state.shake, state.shake));
    drawBackground(ctx, L);

    for (const o of state.objects) {
      const x = L.carX(o.lane);
      if (o.kind === "coin") drawCoin(ctx, x, o.y, clamp(L.laneW * 0.19, 10, 17), o.wiggle);
      else drawCar(ctx, x, o.y, L.carW * 0.87, L.carH * 0.82, o.color, false, Math.sin(o.wiggle) * 0.025);
    }

    const playerX = L.carX(state.lane);
    const blinking = state.invulnerable > 0 && Math.floor(state.invulnerable * 15) % 2 === 0;
    ctx.save(); if (blinking) ctx.globalAlpha = 0.45;
    drawCar(ctx, playerX, L.playerY + Math.sin(state.time * 7) * 1.3, L.carW, L.carH, "#3ee6ab", true,
      state.shake > 1 ? Math.sin(state.time * 42) * 0.06 : 0);
    ctx.restore();

    for (const p of state.particles) {
      ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
      ctx.fillStyle = p.color; ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (0.45 + p.life / p.max * 0.55), 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
    for (const f of state.floats) {
      ctx.save(); ctx.globalAlpha = clamp(f.life, 0, 1);
      ctx.font = `900 ${Math.round(clamp(L.w * 0.052, 15, 21))}px ${DISPLAY}`;
      ctx.textAlign = "center"; ctx.lineWidth = 3; ctx.strokeStyle = "rgba(20,25,48,0.8)";
      ctx.strokeText(f.text, f.x, f.y); ctx.fillStyle = f.color; ctx.fillText(f.text, f.x, f.y); ctx.restore();
    }
    drawHud(ctx, L);

    if (state.hint > 0 && state.phase === "play") {
      const alpha = clamp(state.hint / 0.55, 0, 1);
      ctx.save(); ctx.globalAlpha = alpha;
      const y = L.h * 0.58;
      ctx.fillStyle = "rgba(12,19,43,0.76)";
      roundRect(ctx, L.w * 0.1, y - 47, L.w * 0.8, 94, 18); ctx.fill();
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillStyle = "#fff"; ctx.font = `900 ${Math.round(clamp(L.w * 0.073, 20, 29))}px ${DISPLAY}`;
      ctx.fillText("DODGE & DRIVE!", L.w / 2, y - 17);
      ctx.fillStyle = "#ffd960"; ctx.font = `800 ${Math.round(clamp(L.w * 0.037, 11, 14))}px ${DISPLAY}`;
      ctx.fillText("SWIPE OR TAP TO CHANGE LANES", L.w / 2, y + 15);
      ctx.fillStyle = "rgba(226,239,255,0.78)"; ctx.font = `700 ${Math.round(clamp(L.w * 0.031, 9, 12))}px ${DISPLAY}`;
      ctx.fillText("GRAB COINS · AVOID THE CARS", L.w / 2, y + 35);
      ctx.restore();
    }

    if (state.phase === "lost" || state.phase === "won") {
      ctx.save();
      ctx.fillStyle = state.phase === "lost" ? "rgba(16,18,40,0.24)" : "rgba(19,31,54,0.12)";
      ctx.fillRect(0, 0, L.w, L.h);
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.font = `900 ${Math.round(clamp(L.w * 0.105, 29, 42))}px ${DISPLAY}`;
      ctx.lineWidth = 7; ctx.strokeStyle = "rgba(19,25,49,0.88)";
      const title = state.phase === "won" ? "ROAD LEGEND!" : "CRASH!";
      ctx.strokeText(title, L.w / 2, L.h * 0.42);
      ctx.fillStyle = state.phase === "won" ? "#ffdf64" : "#ff7889";
      ctx.fillText(title, L.w / 2, L.h * 0.42);
      ctx.font = `800 ${Math.round(clamp(L.w * 0.043, 13, 17))}px ${DISPLAY}`;
      ctx.fillStyle = "#fff";
      ctx.fillText(state.phase === "won" ? `${state.coins} COINS COLLECTED` : "TRAFFIC GOT THE BETTER OF YOU", L.w / 2, L.h * 0.42 + 38);
      ctx.restore();
    }

    if (state.flash > 0) {
      ctx.fillStyle = `rgba(255,67,91,${state.flash * 0.13})`;
      ctx.fillRect(0, 0, L.w, L.h);
    }
    ctx.restore();
  }

  const loop = createLoop((dt) => {
    if (destroyed) return;
    update(dt);
    draw();
  });

  return {
    destroy() {
      if (destroyed) return;
      destroyed = true;
      if (resultTimer) clearTimeout(resultTimer);
      loop.stop();
      input.destroy();
      stopPointer();
      stage.destroy();
    },
  };
}
