import {
  createStage, bindPointer, createKeyboard, createLoop,
  clamp, lerp, rand, roundRect, TAU, easeOutCubic,
} from "../util.js";
import { drawSprite } from "../sprites.js";
import { audio } from "../audio.js";

const DISPLAY = '"Arial Rounded MT Bold", "Trebuchet MS", system-ui, sans-serif';

const GATE_DEFS = [
  [{ kind: "mul", value: 2, label: "×2" }, { kind: "add", value: 4, label: "+4" }],
  [{ kind: "add", value: 28, label: "+28" }, { kind: "add", value: 6, label: "+6" }],
  [{ kind: "mul", value: 2, label: "×2" }, { kind: "add", value: 9, label: "+9" }],
  [{ kind: "mul", value: 3, label: "×3" }, { kind: "add", value: 12, label: "+12" }],
  [{ kind: "add", value: 32, label: "+32" }, { kind: "add", value: 10, label: "+10" }],
  [{ kind: "mul", value: 2, label: "×2" }, { kind: "add", value: 18, label: "+18" }],
];
const GATE_AT = [0.62, 1.5, 2.4, 3.3, 4.2, 5.1];
const FINISH = 5.85;
const BOSS_HP = 80;

export function mount(root, api) {
  root.innerHTML = "";
  const stage = createStage(root);
  const input = createKeyboard();

  const state = {
    phase: "run",
    progress: 0,
    speed: 0.445,
    count: 8,
    x: 0.5,
    targetX: 0.5,
    time: 0,
    battleT: 0,
    finished: false,
    shake: 0,
    flash: 0,
    gates: GATE_DEFS.map((ops, i) => {
      const pair = Math.random() < 0.5 ? ops : [ops[1], ops[0]];
      return { at: GATE_AT[i], ops: pair, hit: false, chosen: -1, flash: 0 };
    }),
    pickups: [],
    floats: [],
    particles: [],
    crowd: createCrowd(),
    indicator: 0,
  };

  buildPickups(state.pickups);

  function createCrowd() {
    const members = [];
    for (let i = 0; i < 34; i++) {
      const ring = Math.floor(Math.sqrt(i));
      const a = i * 2.399;
      const r = 2.2 + ring * 1.35;
      members.push({
        ox: Math.cos(a) * r,
        oy: Math.sin(a) * r * 0.7,
        phase: Math.random() * TAU,
        look: i % 3,
      });
    }
    return members;
  }

  function buildPickups() {
    const types = [
      { type: "coin", weight: 0.38, value: 6 },
      { type: "ally", weight: 0.34, value: 4 },
      { type: "bomb", weight: 0.28, value: -7 },
    ];
    const spawn = (d) => {
      let roll = Math.random();
      let picked = types[0];
      for (const t of types) {
        if (roll < t.weight) { picked = t; break; }
        roll -= t.weight;
      }
      return {
        at: d,
        x: rand(0.16, 0.84),
        type: picked.type,
        value: picked.value,
        hit: false,
        bob: Math.random() * TAU,
      };
    };
    state.pickups.push(spawn(0.34));
    for (let i = 0; i < GATE_AT.length; i++) {
      const start = GATE_AT[i] + 0.12;
      const end = i < GATE_AT.length - 1 ? GATE_AT[i + 1] - 0.1 : FINISH - 0.24;
      state.pickups.push(spawn(rand(start, Math.max(start + 0.05, end))));
      if (i % 2 === 0) state.pickups.push(spawn(rand(start, Math.max(start + 0.05, end))));
    }
  }

  let pointerActive = false;
  const stopPointer = bindPointer(stage.canvas, {
    down(p) {
      pointerActive = true;
      state.targetX = clamp(p.x / stage.w, 0.12, 0.88);
    },
    move(p, e) {
      if (pointerActive || e.pointerType === "mouse") {
        state.targetX = clamp(p.x / stage.w, 0.12, 0.88);
      }
    },
    up() { pointerActive = false; },
    leave() { pointerActive = false; },
  });

  function addFloat(text, color, x, y, size = 1) {
    state.floats.push({ text, color, x, y, life: 1.15, max: 1.15, size });
  }

  function burst(x, y, color, amount = 10, power = 180) {
    for (let i = 0; i < amount; i++) {
      const a = rand(0, TAU);
      const s = rand(power * 0.3, power);
      state.particles.push({
        x, y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - 40,
        life: rand(0.35, 0.75),
        max: 0.75,
        size: rand(2, 5),
        color,
      });
    }
  }

  function applyOp(gate, side) {
    const op = gate.ops[side];
    const before = state.count;
    if (op.kind === "mul") state.count = Math.max(0, Math.round(state.count * op.value));
    else state.count = Math.max(0, state.count + op.value);
    const gained = state.count - before;
    const good = gained >= 0;
    addFloat(`${op.label}  ${gained >= 0 ? "+" : ""}${gained}`, good ? "#2ee6a6" : "#ff5d6c", state.x * stage.w, stage.h * 0.55, 1.25);
    burst(state.x * stage.w, stage.h * 0.68, good ? "#ffd23f" : "#ff5d6c", 14, 210);
    gate.flash = 0.5;
    state.flash = 0.18;
    if (op.kind === "mul") audio.good(); else audio.pop();
    if (state.count <= 0 && !state.finished) {
      state.finished = true;
      state.phase = "dead";
      setTimeout(() => api.lose("Your whole squad got wiped before the boss."), 650);
    }
    api.vibrate?.(10);
  }

  function update(dt) {
    state.time += dt;
    input.endFrame();
    if (state.phase === "run") {
      // steering
      let steer = 0;
      if (input.isDown("arrowleft", "a")) steer -= 1;
      if (input.isDown("arrowright", "d")) steer += 1;
      if (steer) state.targetX = clamp(state.targetX + steer * 1.35 * dt, 0.12, 0.88);
      state.targetX = clamp(state.targetX, 0.12, 0.88);
      state.x = lerp(state.x, state.targetX, 1 - Math.exp(-11 * dt));

      state.progress += state.speed * dt;

      for (const gate of state.gates) {
        if (!gate.hit && state.progress >= gate.at) {
          gate.hit = true;
          const side = state.x < 0.5 ? 0 : 1;
          gate.chosen = side;
          applyOp(gate, side);
        }
        gate.flash = Math.max(0, gate.flash - dt);
      }

      for (const p of state.pickups) {
        if (!p.hit && state.progress >= p.at) {
          p.hit = true;
          if (Math.abs(state.x - p.x) < 0.095) {
            state.count = Math.max(0, state.count + p.value);
            const color = p.value > 0 ? "#ffd23f" : "#ff5d6c";
            addFloat(`${p.value > 0 ? "+" : ""}${p.value}`, color, p.x * stage.w, stage.h * 0.66, 1.1);
            burst(p.x * stage.w, stage.h * 0.69, color, p.value > 0 ? 9 : 14, 160);
            if (p.value > 0) audio.eat(); else audio.bad();
          }
        }
      }

      if (state.progress >= FINISH && state.phase === "run") {
        state.phase = "battle";
        state.battleT = 0;
        state.shake = 6;
        audio.bad();
        api.vibrate?.(35);
      }
    } else if (state.phase === "battle") {
      state.battleT += dt;
      state.shake = Math.max(0, state.shake - dt * 12);
      if (!state.finished && state.battleT > 1.5) {
        state.finished = true;
        state.phase = state.count >= BOSS_HP ? "won" : "lost";
        if (state.count >= BOSS_HP) {
          const stars = state.count >= 260 ? 3 : state.count >= 130 ? 2 : 1;
          api.win(stars, state.count, {
            note: state.count >= 260
              ? "The boss never stood a chance. Neither did your thumbs."
              : "Boss defeated. The ad would like you to install anyway.",
          });
        } else {
          api.lose(`You reached the boss with ${state.count}. You needed ${BOSS_HP}.`);
        }
      }
    }

    state.flash = Math.max(0, state.flash - dt * 2.4);
    state.indicator += dt;

    for (const f of state.floats) {
      f.life -= dt;
      f.y -= 42 * dt;
    }
    state.floats = state.floats.filter((f) => f.life > 0);

    for (const p of state.particles) {
      p.life -= dt;
      p.vy += 360 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 1 - dt * 1.4;
    }
    state.particles = state.particles.filter((p) => p.life > 0);
  }

  function drawBackdrop(ctx, w, h) {
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, "#5ed5ff");
    sky.addColorStop(0.42, "#b9ecff");
    sky.addColorStop(0.72, "#ffe0ef");
    sky.addColorStop(1, "#ffc6dc");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    // sun
    ctx.save();
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = "#fff5b8";
    ctx.beginPath();
    ctx.arc(w * 0.78, h * 0.12, w * 0.13, 0, TAU);
    ctx.fill();
    ctx.restore();

    // parallax hills
    const scroll = state.progress * h;
    for (let layer = 0; layer < 2; layer++) {
      const baseY = h * (0.22 + layer * 0.08);
      const amp = h * (0.035 + layer * 0.012);
      ctx.fillStyle = layer === 0 ? "rgba(112, 220, 172, 0.55)" : "rgba(61, 195, 137, 0.45)";
      ctx.beginPath();
      ctx.moveTo(0, h);
      for (let x = 0; x <= w; x += 18) {
        const y = baseY + Math.sin((x + scroll * (0.18 + layer * 0.15)) * 0.018 + layer) * amp;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fill();
    }

    // clouds
    const cloudSprites = ["cloud"];
    for (let i = 0; i < 4; i++) {
      const cx = ((i * 173 - scroll * (0.06 + i * 0.014)) % (w + 180)) - 90;
      const cy = h * (0.06 + i * 0.06);
      drawSprite(ctx, cloudSprites[0], ((cx % (w + 180)) + (w + 180)) % (w + 180) - 90, cy, w * (0.22 + i * 0.025), { alpha: 0.55 + i * 0.08 });
    }

    // track
    const left = w * 0.085;
    const right = w * 0.915;
    ctx.save();
    ctx.fillStyle = "#ffe9c7";
    roundRect(ctx, left - 8, 0, right - left + 16, h, 0);
    ctx.fill();
    const road = ctx.createLinearGradient(left, 0, right, 0);
    road.addColorStop(0, "#ffd6ae");
    road.addColorStop(0.5, "#ffe6c6");
    road.addColorStop(1, "#ffd0a6");
    ctx.fillStyle = road;
    roundRect(ctx, left, 0, right - left, h, 0);
    ctx.fill();

    // scrolling rungs
    ctx.strokeStyle = "rgba(196, 106, 125, 0.16)";
    ctx.lineWidth = 2;
    for (let d = -1; d < state.progress + 1.4; d += 0.16) {
      const y = h * 0.72 + (state.progress - d) * h;
      if (y < -20 || y > h + 20) continue;
      ctx.beginPath();
      ctx.moveTo(left + 12, y);
      ctx.lineTo(right - 12, y);
      ctx.stroke();
    }

    // center dashes
    ctx.setLineDash([14, 18]);
    ctx.lineDashOffset = (scroll % 32);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.72)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(w / 2, 0);
    ctx.lineTo(w / 2, h);
    ctx.stroke();
    ctx.setLineDash([]);

    // fences
    for (const x of [left - 4, right + 4]) {
      ctx.fillStyle = "#b96b7e";
      ctx.fillRect(x - 2, 0, 4, h);
      for (let d = -1; d < state.progress + 1.4; d += 0.08) {
        const y = h * 0.72 + (state.progress - d) * h;
        if (y < -10 || y > h + 10) continue;
        ctx.fillStyle = "#ff9ab7";
        ctx.beginPath();
        ctx.arc(x, y, 3.4, 0, TAU);
        ctx.fill();
      }
    }

    // side vegetation
    for (let i = 0; i < 6; i++) {
      const d = -0.4 + i * 1.05;
      const y = h * 0.72 + (state.progress - d) * h;
      drawSprite(ctx, i % 2 ? "bush" : "flower", i % 2 ? w * 0.045 : w * 0.95, ((y % (h * 1.8)) + h * 1.8) % (h * 1.8) - h * 0.4, i % 2 ? w * 0.15 : w * 0.09, { alpha: 0.9 });
    }
    ctx.restore();
  }

  function gateScreenY(gate, h) {
    return h * 0.72 + (state.progress - gate.at) * h;
  }

  function drawGate(ctx, gate, w, h, index) {
    const y = gateScreenY(gate, h);
    const gateH = Math.min(h * 0.16, 120);
    if (y < -gateH || y > h + gateH) return;
    const left = w * 0.085;
    const right = w * 0.915;
    const mid = w / 2;
    const pad = 4;
    const chosenWorld = state.x < 0.5 ? 0 : 1;

    for (let side = 0; side < 2; side++) {
      const x = side === 0 ? left : mid;
      const pw = mid - left - pad;
      const op = gate.ops[side];
      const isChosen = gate.hit && gate.chosen === side;
      const active = !gate.hit && side === chosenWorld;
      const strong = op.kind === "mul" || (op.kind === "add" && op.value >= 20);
      const base = strong ? "#2ee6a6" : "#ffd23f";
      const alpha = gate.hit ? (isChosen ? 0.34 : 0.1) : active ? 0.34 : 0.22;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = base;
      roundRect(ctx, x + pad, y - gateH / 2, pw - pad * 2, gateH, 14);
      ctx.fill();
      ctx.globalAlpha = gate.hit ? (isChosen ? 1 : 0.35) : active ? 1 : 0.65;
      ctx.strokeStyle = strong ? "#0d8f63" : "#b07b00";
      ctx.lineWidth = active ? 4 : 3;
      roundRect(ctx, x + pad, y - gateH / 2, pw - pad * 2, gateH, 14);
      ctx.stroke();
      ctx.globalAlpha = gate.hit ? (isChosen ? 1 : 0.25) : 1;
      ctx.fillStyle = "#20142e";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `900 ${Math.round(clamp(w * 0.09, 22, 40))}px ${DISPLAY}`;
      ctx.fillText(op.label, x + pw / 2, y + 2);
      if (strong && !gate.hit) {
        ctx.font = `900 ${Math.round(clamp(w * 0.022, 8, 11))}px ${DISPLAY}`;
        ctx.fillStyle = "rgba(20, 12, 30, 0.62)";
        ctx.fillText(op.kind === "mul" ? "MULTIPLY" : "BIG GAIN", x + pw / 2, y + gateH * 0.3);
      }
      if (gate.hit && isChosen) {
        ctx.fillStyle = "#20142e";
        ctx.font = `900 ${Math.round(clamp(w * 0.022, 8, 11))}px ${DISPLAY}`;
        ctx.fillText("CHOSEN", x + pw / 2, y + gateH * 0.3);
      }
      ctx.restore();
    }

    // gate posts
    ctx.save();
    ctx.fillStyle = "#a05d75";
    ctx.globalAlpha = 0.55;
    ctx.fillRect(left - 7, y - gateH * 0.58, 5, gateH * 1.16);
    ctx.fillRect(right + 2, y - gateH * 0.58, 5, gateH * 1.16);
    ctx.restore();
  }

  function drawPickup(ctx, p, w, h) {
    const y = gateScreenY(p, h);
    const x = p.x * w;
    if (y < -40 || y > h + 40) return;
    const bob = Math.sin(state.time * 5 + p.bob) * 3;
    ctx.save();
    ctx.globalAlpha = p.hit ? 0.18 : 1;
    if (p.type === "coin") {
      drawSprite(ctx, "coin", x, y + bob, clamp(w * 0.085, 24, 36), { rot: Math.sin(state.time * 2 + p.bob) * 0.18 });
      ctx.fillStyle = "#7a4100";
      ctx.font = `900 ${Math.round(clamp(w * 0.027, 10, 13))}px ${DISPLAY}`;
      ctx.textAlign = "center";
      ctx.fillText("+6", x, y + 27);
    } else if (p.type === "bomb") {
      drawSprite(ctx, "bomb", x, y + bob, clamp(w * 0.09, 26, 38));
      ctx.fillStyle = "#8b1e34";
      ctx.font = `900 ${Math.round(clamp(w * 0.027, 10, 13))}px ${DISPLAY}`;
      ctx.textAlign = "center";
      ctx.fillText("-7", x, y + 28);
    } else {
      drawSprite(ctx, "runnerB", x, y + bob, clamp(w * 0.08, 24, 34));
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y + bob, clamp(w * 0.055, 17, 24), 0, TAU);
      ctx.stroke();
      ctx.fillStyle = "#0c6c48";
      ctx.font = `900 ${Math.round(clamp(w * 0.026, 9, 12))}px ${DISPLAY}`;
      ctx.textAlign = "center";
      ctx.fillText("+4", x, y + 27);
    }
    ctx.restore();
  }

  function drawCrowd(ctx, w, h) {
    const playerY = h * 0.72;
    let px = state.x * w;
    let py = playerY;
    if (state.phase === "battle") {
      const t = Math.min(1, state.battleT / 1.2);
      py -= easeOutCubic(t) * h * 0.16;
    }
    if (state.phase === "won") py -= h * 0.16;

    // shadow + formation
    ctx.save();
    ctx.fillStyle = "rgba(72, 31, 62, 0.22)";
    ctx.beginPath();
    ctx.ellipse(px, playerY + 17, Math.min(w * 0.16, 62), 12, 0, 0, TAU);
    ctx.fill();

    const visual = clamp(Math.ceil(state.count / 3) + 2, 3, state.crowd.length);
    const members = state.crowd.slice(0, visual);
    const scale = clamp(w * 0.082, 25, 40);
    const spread = clamp(0.6 + Math.sqrt(state.count) * 0.09, 0.8, 2.1);
    const bob = Math.sin(state.time * 11) * 2;
    const sorted = [...members].sort((a, b) => a.oy - b.oy);
    for (const m of sorted) {
      const wobble = Math.sin(state.time * 10 + m.phase) * 2;
      const mx = px + m.ox * scale * spread * 0.34;
      const my = py + m.oy * scale * spread * 0.3 + wobble + bob;
      const look = m.look === 0 ? "runnerA" : m.look === 1 ? "runnerB" : "runnerC";
      ctx.globalAlpha = 0.95;
      drawSprite(ctx, look, mx, my, scale);
    }
    ctx.restore();

    // count badge
    const badgeW = clamp(w * 0.2, 74, 100);
    const badgeH = clamp(h * 0.042, 27, 34);
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.28)";
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 3;
    ctx.fillStyle = "#20142e";
    roundRect(ctx, px - badgeW / 2, py - scale * 1.5 - 12, badgeW, badgeH, badgeH / 2);
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.fillStyle = "#ffd23f";
    ctx.font = `900 ${Math.round(badgeH * 0.58)}px ${DISPLAY}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`× ${state.count}`, px, py - scale * 1.5 - 12 + badgeH / 2 + 1);
    ctx.restore();
  }

  function drawBoss(ctx, w, h) {
    const y = gateScreenY({ at: FINISH + 0.28 }, h);
    if (y > h + 100) return;
    const castleSize = clamp(w * 0.5, 150, 250);
    const ogreSize = clamp(w * 0.34, 105, 170);
    ctx.save();
    drawSprite(ctx, "castle", w * 0.5, y - castleSize * 0.18, castleSize);
    const defeated = state.phase === "won" || (state.phase === "battle" && state.count >= BOSS_HP && state.battleT > 0.9);
    ctx.globalAlpha = defeated ? 0.35 : 1;
    drawSprite(ctx, "ogre", w * 0.5, y + castleSize * 0.26, ogreSize, {
      rot: defeated ? 0.3 : Math.sin(state.time * 3) * 0.025,
    });
    ctx.restore();

    if (y < h * 0.62) {
      const hpW = w * 0.5;
      const hpX = w / 2 - hpW / 2;
      const hpY = Math.max(66, y - castleSize * 0.58);
      ctx.save();
      ctx.fillStyle = "rgba(20, 12, 30, 0.55)";
      roundRect(ctx, hpX, hpY, hpW, 11, 6);
      ctx.fill();
      const fill = state.phase === "battle" ? clamp(1 - state.battleT / 1.5, 0, 1) : 1;
      ctx.fillStyle = "#ff5d6c";
      roundRect(ctx, hpX + 1.5, hpY + 1.5, (hpW - 3) * fill, 8, 5);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.font = `900 ${Math.round(clamp(w * 0.024, 9, 12))}px ${DISPLAY}`;
      ctx.textAlign = "center";
      ctx.fillText(`BOSS ${BOSS_HP}`, w / 2, hpY - 5);
      ctx.restore();
    }
  }

  function drawHud(ctx, w, h) {
    const pad = 11;
    const pillH = clamp(h * 0.042, 27, 34);

    ctx.save();
    ctx.fillStyle = "rgba(20, 12, 30, 0.55)";
    roundRect(ctx, pad, pad, clamp(w * 0.27, 96, 124), pillH, 9);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = `900 ${Math.round(pillH * 0.45)}px ${DISPLAY}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(`SQUAD  ${state.count}`, pad + 11, pad + pillH / 2 + 1);

    const bossW = clamp(w * 0.25, 84, 112);
    ctx.fillStyle = "rgba(20, 12, 30, 0.55)";
    roundRect(ctx, w - pad - bossW, pad, bossW, pillH, 9);
    ctx.fill();
    ctx.fillStyle = "#ff9fb0";
    ctx.font = `900 ${Math.round(pillH * 0.42)}px ${DISPLAY}`;
    ctx.textAlign = "center";
    ctx.fillText(state.count >= BOSS_HP ? `BOSS READY ✓` : `NEED ${BOSS_HP}`, w - pad - bossW / 2, pad + pillH / 2 + 1);

    // progress
    const barW = w - pad * 2;
    const barY = pad + pillH + 8;
    ctx.fillStyle = "rgba(20, 12, 30, 0.18)";
    roundRect(ctx, pad, barY, barW, 5, 3);
    ctx.fill();
    ctx.fillStyle = state.count >= BOSS_HP ? "#2ee6a6" : "#ffd23f";
    roundRect(ctx, pad, barY, barW * clamp(state.progress / FINISH, 0, 1), 5, 3);
    ctx.fill();
    ctx.restore();
  }

  function drawFloats(ctx) {
    for (const f of state.floats) {
      const t = f.life / f.max;
      ctx.save();
      ctx.globalAlpha = clamp(t * 1.7, 0, 1);
      ctx.fillStyle = f.color;
      ctx.strokeStyle = "rgba(20,12,30,0.5)";
      ctx.lineWidth = 4;
      ctx.font = `900 ${Math.round(clamp(stage.w * 0.075, 20, 30) * f.size)}px ${DISPLAY}`;
      ctx.textAlign = "center";
      ctx.strokeText(f.text, f.x, f.y);
      ctx.fillText(f.text, f.x, f.y);
      ctx.restore();
    }
  }

  function drawParticles(ctx) {
    for (const p of state.particles) {
      const a = clamp(p.life / p.max, 0, 1);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * a + 0.5, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function draw() {
    const { ctx } = stage;
    const w = stage.w;
    const h = stage.h;
    ctx.save();
    if (state.shake > 0) {
      ctx.translate(rand(-state.shake, state.shake), rand(-state.shake, state.shake));
    }

    drawBackdrop(ctx, w, h);

    // draw world objects, sorted by depth
    const objects = [];
    for (const gate of state.gates) objects.push({ type: "gate", y: gateScreenY(gate, h), gate });
    for (const p of state.pickups) objects.push({ type: "pickup", y: gateScreenY(p, h), p });
    objects.sort((a, b) => a.y - b.y);

    for (const obj of objects) {
      if (obj.type === "gate") drawGate(ctx, obj.gate, w, h);
      else drawPickup(ctx, obj.p, w, h);
    }

    drawBoss(ctx, w, h);
    drawCrowd(ctx, w, h);
    drawParticles(ctx);
    drawFloats(ctx);
    drawHud(ctx, w, h);

    if (state.flash > 0) {
      ctx.globalAlpha = state.flash * 0.22;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, w, h);
    }

    if (state.phase === "battle") {
      const t = state.battleT;
      if (t < 1.5) {
        ctx.save();
        ctx.globalAlpha = clamp(1 - t * 0.6, 0, 1);
        ctx.fillStyle = "#20142e";
        ctx.font = `900 ${Math.round(clamp(w * 0.1, 28, 44))}px ${DISPLAY}`;
        ctx.textAlign = "center";
        ctx.strokeStyle = "#ffd23f";
        ctx.lineWidth = 8;
        ctx.strokeText("BOSS FIGHT!", w / 2, h * 0.32);
        ctx.fillText("BOSS FIGHT!", w / 2, h * 0.32);
        ctx.restore();
      }
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
