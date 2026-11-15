import { createStage, createLoop, bindPointer, clamp, roundRect, TAU } from "../util.js";
import { audio } from "../audio.js";

const FONT = '"Arial Rounded MT Bold", "Trebuchet MS", system-ui, sans-serif';
const GOLD = "#ffd23f";
const RED = "#ff596b";
const ROUNDS = [
  { gold: 2, gates: 1, title: "THE FIRST PAYDAY" },
  { gold: 3, gates: 2, title: "THE NARROW SHAFT" },
  { gold: 4, gates: 3, title: "THE DEEP VAULT" },
];

export function mount(root, api) {
  root.innerHTML = "";
  const stage = createStage(root);
  const timers = new Set();
  const state = {
    round: 0,
    opened: 0,
    rescued: 0,
    phase: "play",
    flow: null,
    lavaT: 0,
    message: "GOLD pins in order. RED stays locked!",
    messageT: 99,
    time: 0,
    ended: false,
    destroyed: false,
    particles: [],
    pulse: 0,
  };

  function later(fn, delay) {
    const id = setTimeout(() => {
      timers.delete(id);
      if (!state.destroyed) fn();
    }, delay);
    timers.add(id);
    return id;
  }

  function currentRound() { return ROUNDS[state.round]; }

  function geometry() {
    const { w, h } = stage;
    const top = clamp(h * 0.34, 136, 190);
    const bottom = h - clamp(h * 0.19, 82, 105);
    const goldX = w * 0.36;
    const lavaX = w * 0.76;
    const chestY = h - 58;
    const round = currentRound();
    const nodes = round.gates;
    const startY = top + 18;
    const endY = Math.max(startY + 18, Math.min(bottom - 22, chestY - 52));
    const nodeYs = Array.from({ length: nodes }, (_, i) =>
      nodes === 1 ? startY : startY + (endY - startY) * i / (nodes - 1));
    const firstGateY = top + 15;
    const lastGateY = chestY - 43;
    const gateYs = Array.from({ length: round.gates }, (_, i) =>
      round.gates === 1 ? (firstGateY + lastGateY) / 2
        : firstGateY + (lastGateY - firstGateY) * i / (round.gates - 1));
    const boxW = Math.min(w * 0.31, 112);
    const boxH = clamp(h * 0.075, 32, 40);
    return { w, h, top, bottom, goldX, lavaX, chestY, nodeYs, gateYs, boxW, boxH };
  }

  function setMessage(text, duration = 1.8) {
    state.message = text;
    state.messageT = duration;
  }

  function finishWin() {
    if (state.ended || state.destroyed) return;
    state.ended = true;
    state.phase = "won";
    state.message = "PAYDAY! All the gold is safe!";
    audio.win();
    const stars = state.rescued >= 9 ? 3 : state.rescued >= 6 ? 2 : 1;
    later(() => api.win(stars, state.rescued, {
      note: `${state.rescued} gold nuggets made it safely to the vault.`,
    }), 850);
  }

  function lose(reason) {
    if (state.ended || state.destroyed) return;
    state.ended = true;
    state.phase = "lost";
    setMessage(reason, 2.4);
    audio.lose();
    later(() => api.lose(reason), 900);
  }

  function pullGoldGate(index) {
    if (state.phase !== "play") return;
    if (index !== state.opened) {
      audio.click();
      setMessage(`Pull GOLD pin ${state.opened + 1} first.`, 1.5);
      return;
    }
    state.phase = "flow";
    state.flow = { from: index, to: index + 1, t: 0, duration: 0.62 };
    state.opened++;
    audio.whoosh();
    audio.tap();
    api.vibrate?.(12);
  }

  function pullLavaGate() {
    if (state.phase !== "play") return;
    state.phase = "lava";
    state.lavaT = 0;
    setMessage("OH NO! Lava is rushing toward the vault!", 2.2);
    audio.bad();
    api.vibrate?.([25, 30, 45]);
  }

  const stopPointer = bindPointer(stage.canvas, {
    down(p) {
      if (state.phase === "won" || state.phase === "lost" || state.ended) return;
      const g = geometry();
      if (Math.hypot(p.x - g.lavaX, p.y - (g.top + 82)) < 36) {
        pullLavaGate();
        return;
      }
      const nearestGate = g.gateYs.reduce((best, y, i) => {
        const distance = Math.hypot(p.x - g.goldX, p.y - y);
        return distance < best.distance ? { index: i, distance } : best;
      }, { index: -1, distance: Infinity });
      if (nearestGate.distance < 19) {
        pullGoldGate(nearestGate.index);
        return;
      }
      if (state.phase === "round-clear") {
        nextRound();
      }
    },
  });

  function nextRound() {
    if (state.phase !== "round-clear") return;
    if (state.round >= ROUNDS.length - 1) {
      finishWin();
      return;
    }
    state.round++;
    state.opened = 0;
    state.flow = null;
    state.phase = "play";
    state.particles.length = 0;
    setMessage("New chamber! GOLD in order; RED stays locked.", 2.7);
    audio.levelUp();
  }

  function burst(x, y, color, count = 12) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * TAU;
      const speed = 35 + Math.random() * 110;
      state.particles.push({ x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
        life: 0.35 + Math.random() * 0.45, max: 0.8, size: 2 + Math.random() * 3, color });
    }
  }

  function update(dt) {
    state.time += dt;
    state.pulse += dt * 3;
    if (state.messageT > 0) state.messageT -= dt;

    if (state.phase === "flow" && state.flow) {
      state.flow.t += dt;
      if (state.flow.t >= state.flow.duration) {
        const g = geometry();
        const last = state.opened >= currentRound().gates;
        burst(g.goldX, last ? g.chestY - 28 : g.nodeYs[state.flow.to], GOLD, 15);
        audio.pop();
        state.flow = null;
        if (last) {
          state.rescued += currentRound().gold;
          state.phase = "round-clear";
          setMessage(`${currentRound().gold} GOLD SAVED! Tap to open the next chamber.`, 2.5);
          audio.good();
          if (state.round === ROUNDS.length - 1) later(finishWin, 950);
          else later(nextRound, 1250);
        } else {
          state.phase = "play";
          setMessage("Nice! Tap the next numbered GOLD pin.", 1.7);
        }
      }
    } else if (state.phase === "lava") {
      state.lavaT += dt;
      if (state.lavaT >= 1.05) {
        // The breach floods the vault and sweeps away every nugget not already rescued.
        const reason = "Lava reached the vault and washed away the remaining gold.";
        audio.splash();
        lose(reason);
      }
    }

    for (const p of state.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 110 * dt;
      p.life -= dt;
    }
    state.particles = state.particles.filter((p) => p.life > 0);
  }

  function drawBackground(ctx, w, h) {
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, "#172b45");
    bg.addColorStop(0.58, "#101d31");
    bg.addColorStop(1, "#091322");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "rgba(255,255,255,0.035)";
    for (let i = 0; i < 13; i++) {
      const x = (i * 73 + 19) % w;
      const y = 110 + ((i * 127) % Math.max(100, h - 140));
      ctx.beginPath(); ctx.arc(x, y, 1 + (i % 3), 0, TAU); ctx.fill();
    }
    const glow = ctx.createRadialGradient(w * 0.4, h * 0.5, 10, w * 0.4, h * 0.5, h * 0.7);
    glow.addColorStop(0, "rgba(48,102,143,0.13)");
    glow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = glow; ctx.fillRect(0, 0, w, h);
  }

  function drawNugget(ctx, x, y, r, index = 0) {
    const grad = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, 1, x, y, r * 1.3);
    grad.addColorStop(0, "#fff8bf"); grad.addColorStop(0.3, "#ffe56b"); grad.addColorStop(1, "#c98612");
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.58)"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(x - r * 0.18, y - r * 0.2, r * 0.43, -2.35, -0.55); ctx.stroke();
    ctx.fillStyle = "rgba(119,74,0,0.36)";
    ctx.font = `bold ${Math.max(8, r * 0.72)}px ${FONT}`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("$", x, y + 0.5 + index * 0);
  }

  function drawPin(ctx, x, y, color, label, open = false, hint = false) {
    ctx.save();
    if (hint && !open) ctx.shadowColor = color;
    if (hint && !open) ctx.shadowBlur = 12 + Math.sin(state.pulse) * 4;
    ctx.lineCap = "round";
    ctx.strokeStyle = "rgba(0,0,0,0.35)"; ctx.lineWidth = 11;
    ctx.beginPath(); ctx.moveTo(x - 32, y + 2); ctx.lineTo(x + 32, y + 2); ctx.stroke();
    ctx.strokeStyle = open ? "#637187" : color; ctx.lineWidth = 7;
    ctx.beginPath(); ctx.moveTo(x - 30, y); ctx.lineTo(x + 30, y); ctx.stroke();
    ctx.strokeStyle = open ? "#9aa7b8" : "rgba(255,255,255,0.8)"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x - 25, y - 1.5); ctx.lineTo(x + 23, y - 1.5); ctx.stroke();
    for (const side of [-1, 1]) {
      ctx.fillStyle = open ? "#667487" : color;
      ctx.beginPath(); ctx.arc(x + side * 31, y, 5, 0, TAU); ctx.fill();
    }
    ctx.fillStyle = open ? "#53647a" : color;
    roundRect(ctx, x - 13, y - 15, 26, 19, 6); ctx.fill();
    ctx.fillStyle = "#18283c"; ctx.font = `900 12px ${FONT}`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(label, x, y - 5);
    if (!open && hint) {
      ctx.fillStyle = color; ctx.font = `bold 10px ${FONT}`;
      ctx.fillText("TAP", x, y + 21);
    }
    ctx.restore();
  }

  function drawChamber(ctx, x, y, w, h, color, label) {
    ctx.save();
    ctx.fillStyle = "rgba(7,17,31,0.86)";
    ctx.strokeStyle = color; ctx.lineWidth = 2;
    roundRect(ctx, x - w / 2, y - h / 2, w, h, 11); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,0.12)"; ctx.lineWidth = 1;
    roundRect(ctx, x - w / 2 + 4, y - h / 2 + 4, w - 8, h - 8, 8); ctx.stroke();
    ctx.fillStyle = color; ctx.font = `bold 9px ${FONT}`;
    ctx.textAlign = "center"; ctx.textBaseline = "bottom";
    ctx.fillText(label, x, y - h / 2 - 4);
    ctx.restore();
  }

  function drawChest(ctx, x, y, w) {
    ctx.save();
    ctx.translate(x, y);
    ctx.shadowColor = "rgba(255,190,43,0.35)"; ctx.shadowBlur = 18;
    ctx.fillStyle = "#8c4a24"; roundRect(ctx, -w / 2, -17, w, 29, 7); ctx.fill();
    ctx.fillStyle = "#bd702c"; roundRect(ctx, -w / 2, -25, w, 19, 8); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "#f4bd4e"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-w / 2 + 3, -7); ctx.lineTo(w / 2 - 3, -7); ctx.stroke();
    ctx.fillStyle = GOLD; roundRect(ctx, -6, -12, 12, 13, 3); ctx.fill();
    ctx.fillStyle = "#fff4bf"; ctx.font = `900 10px ${FONT}`;
    ctx.textAlign = "center"; ctx.textBaseline = "top"; ctx.fillText("TREASURE VAULT", 0, 18);
    ctx.restore();
  }

  function draw(ctx) {
    const { w, h } = stage;
    const g = geometry();
    const round = currentRound();
    drawBackground(ctx, w, h);

    // Header and instructions.
    ctx.fillStyle = "rgba(255,255,255,0.055)";
    roundRect(ctx, 14, 14, w - 28, 102, 18); ctx.fill();
    ctx.fillStyle = GOLD; ctx.font = `900 ${clamp(w * 0.065, 20, 27)}px ${FONT}`;
    ctx.textAlign = "center"; ctx.textBaseline = "top"; ctx.fillText("PIN PULL PAYDAY", w / 2, 22);
    ctx.fillStyle = "#b8c8dc"; ctx.font = `bold 10px ${FONT}`;
    ctx.fillText(round.title, w / 2, 53);
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    roundRect(ctx, 23, 73, w - 46, 28, 10); ctx.fill();
    ctx.fillStyle = state.messageT > 0 ? "#fff1c6" : "#d2dceb";
    ctx.font = `bold ${clamp(w * 0.032, 10, 12)}px ${FONT}`;
    ctx.fillText(state.messageT > 0 ? state.message : "GOLD pins in order. RED stays locked!", w / 2, 81);

    // Round and haul indicators.
    ctx.textAlign = "left"; ctx.textBaseline = "middle";
    ctx.fillStyle = "#dce7f3"; ctx.font = `bold 11px ${FONT}`;
    ctx.fillText(`ROUND ${state.round + 1}/3`, 19, 130);
    ctx.textAlign = "right"; ctx.fillText(`SAVED  ${state.rescued}`, w - 19, 130);

    // Gold route: chamber nodes, open shaft and numbered pull pins.
    ctx.lineCap = "round";
    ctx.strokeStyle = "rgba(255,210,63,0.24)"; ctx.lineWidth = 10;
    ctx.beginPath(); ctx.moveTo(g.goldX, g.nodeYs[0]); ctx.lineTo(g.goldX, g.chestY - 22); ctx.stroke();
    for (let i = 0; i < g.nodeYs.length; i++) {
      drawChamber(ctx, g.goldX, g.nodeYs[i], g.boxW, g.boxH, GOLD, i === 0 ? "GOLD CHAMBER" : "SAFE SHAFT");
      const count = i === 0 ? round.gold : 0;
      if (count > 0) {
        for (let j = 0; j < count; j++) {
          const x = g.goldX + (j - (count - 1) / 2) * (count > 3 ? 18 : 20);
          const y = g.nodeYs[0] + (count > 3 ? (j % 2 ? 8 : -8) : 0);
          drawNugget(ctx, x, y, count > 2 ? 9 : 11, j);
        }
      }
    }
    for (let i = 0; i < g.gateYs.length; i++) {
      const opened = i < state.opened;
      drawPin(ctx, g.goldX, g.gateYs[i], GOLD, String(i + 1), opened, i === state.opened && state.phase === "play");
    }

    // Hazard chamber and its conspicuous red gate. Pulling it opens the direct route to the vault.
    ctx.strokeStyle = "rgba(255,89,107,0.22)"; ctx.lineWidth = 9;
    ctx.beginPath(); ctx.moveTo(g.lavaX, g.top + 82); ctx.lineTo(g.lavaX, g.chestY - 22); ctx.stroke();
    drawChamber(ctx, g.lavaX, g.top + 37, Math.min(g.boxW * 0.82, 92), 42, RED, "LAVA CHAMBER");
    drawPin(ctx, g.lavaX, g.top + 82, RED, "!", false, true);
    const lavaMoving = state.phase === "lava" || state.phase === "lost";
    if (lavaMoving) {
      const t = clamp(state.lavaT / 1.05, 0, 1);
      const ly = g.top + 112 + (g.chestY - (g.top + 134)) * t;
      const grad = ctx.createRadialGradient(g.lavaX - 3, ly - 4, 1, g.lavaX, ly, 16);
      grad.addColorStop(0, "#fff19a"); grad.addColorStop(0.38, "#ff9b35"); grad.addColorStop(1, "#f33750");
      ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(g.lavaX, ly, 15, 0, TAU); ctx.fill();
    } else {
      const grad = ctx.createRadialGradient(g.lavaX - 3, g.top + 31, 1, g.lavaX, g.top + 37, 15);
      grad.addColorStop(0, "#fff29a"); grad.addColorStop(0.42, "#ff9b35"); grad.addColorStop(1, "#f33750");
      ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(g.lavaX, g.top + 37, 14, 0, TAU); ctx.fill();
    }
    ctx.fillStyle = "#ff9ba5"; ctx.font = `bold 9px ${FONT}`;
    ctx.textAlign = "center"; ctx.textBaseline = "top"; ctx.fillText("HAZARD", g.lavaX, g.top + 91);

    // Animated nugget travel between chambers; the discrete gate logic stays dependable.
    if (state.flow) {
      const t = clamp(state.flow.t / state.flow.duration, 0, 1);
      const fromY = g.nodeYs[state.flow.from];
      const toY = state.flow.to < g.nodeYs.length ? g.nodeYs[state.flow.to] : g.chestY - 26;
      const y = fromY + (toY - fromY) * (t * t * (3 - 2 * t));
      for (let j = 0; j < round.gold; j++) {
        const offset = (j - (round.gold - 1) / 2) * 12;
        drawNugget(ctx, g.goldX + offset, y, 9, j);
      }
    }

    drawChest(ctx, g.goldX, g.chestY, Math.min(108, w * 0.34));
    // A dotted warning branch makes the unsafe connection legible without obscuring the routes.
    ctx.save(); ctx.setLineDash([3, 6]); ctx.strokeStyle = "rgba(255,89,107,0.38)"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(g.lavaX, g.chestY - 33); ctx.quadraticCurveTo(w * 0.58, g.chestY - 8, g.goldX + 28, g.chestY - 26); ctx.stroke(); ctx.restore();

    ctx.fillStyle = "#dce7f3"; ctx.font = `bold 10px ${FONT}`;
    ctx.textAlign = "center"; ctx.textBaseline = "bottom";
    ctx.fillText("GOLD = SAFE PATH", g.goldX, h - 9);
    ctx.fillStyle = "#ff8793"; ctx.fillText("RED = DANGER", g.lavaX, h - 9);

    for (const p of state.particles) {
      ctx.globalAlpha = clamp(p.life / p.max, 0, 1); ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;

    if (state.phase === "round-clear" || state.phase === "won" || state.phase === "lost") {
      ctx.fillStyle = "rgba(5,12,22,0.36)"; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = state.phase === "lost" ? RED : GOLD;
      ctx.font = `900 ${clamp(w * 0.075, 25, 34)}px ${FONT}`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      const title = state.phase === "lost" ? "VAULT FLOODED!" : state.phase === "won" ? "PAYDAY!" : "GOLD SAVED!";
      ctx.fillText(title, w / 2, h * 0.49);
      ctx.fillStyle = "#fff1c6"; ctx.font = `bold 13px ${FONT}`;
      ctx.fillText(state.phase === "round-clear" ? "Next chamber loading…" : `${state.rescued} gold rescued`, w / 2, h * 0.49 + 30);
    }
  }

  const loop = createLoop((dt) => { update(dt); draw(stage.ctx); });
  draw(stage.ctx);

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
