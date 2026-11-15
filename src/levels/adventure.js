import { createStage, createLoop, bindPointer, clamp, roundRect } from "../util.js";
import { audio } from "../audio.js";

const FONT = '"Arial Rounded MT Bold", "Trebuchet MS", system-ui, sans-serif';
const CHAPTERS = [
  {
    place: "THE MYSTERIOUS BUS STOP", icon: "🌧️",
    text: "A tiny dragon offers you a ride to the legendary Snack Kingdom. The bus is a shopping cart. It has one wheel.",
    choices: [
      { label: "Hop in. Adventure waits!", result: "The cart squeaks like a heroic trumpet.", points: 2, brave: 1 },
      { label: "Ask if it has seatbelts", result: "The dragon ties a scarf around you. Technically a belt.", points: 1, brave: 0 },
      { label: "Offer the dragon a snack", result: "Excellent diplomacy. The dragon is now your co-pilot.", points: 2, brave: 0 },
    ],
  },
  {
    place: "THE WOBBLY BRIDGE", icon: "🌉",
    text: "A bridge made of crackers crosses a river of fizzy lemonade. Something shiny is floating below.",
    choices: [
      { label: "March across confidently", result: "The crackers hold. Your confidence is delicious.", points: 2, brave: 1 },
      { label: "Build a tiny raft", result: "You sail safely and discover a bonus cookie.", points: 2, brave: 0 },
      { label: "Ask the dragon to fly", result: "The dragon flies you over. You wave at a very confused fish.", points: 1, brave: 0 },
    ],
  },
  {
    place: "THE GATE OF BIG DECISIONS", icon: "🚪",
    text: "A stone door asks for a password. The dragon whispers: “It's probably something silly.”",
    choices: [
      { label: "Say 'please'", result: "The door gasps. Manners! It swings open with a bow.", points: 2, brave: 0 },
      { label: "Try 'password'", result: "It works. The door's security system is a little embarrassing.", points: 1, brave: 1 },
      { label: "Tell a knock-knock joke", result: "The door laughs so hard it opens itself.", points: 2, brave: 1 },
    ],
  },
  {
    place: "THE SNACK KINGDOM", icon: "🏰",
    text: "The royal cookie is guarded by a sleepy marshmallow knight. What is your final move?",
    choices: [
      { label: "Challenge them to a dance-off", result: "The knight moonwalks into retirement. Legendary.", points: 2, brave: 1 },
      { label: "Share your snacks", result: "Friendship wins! The royal cookie is split three ways.", points: 2, brave: 0 },
      { label: "Sneak past in a disguise", result: "Your mustache disguise fools absolutely everyone.", points: 1, brave: 1 },
    ],
  },
];

export function mount(root, api) {
  root.innerHTML = "";
  const stage = createStage(root);
  const state = { chapter: 0, points: 0, brave: 0, result: "", selected: -1, ended: false, destroyed: false, time: 0 };
  let buttons = [];
  let transitionTimer = 0;

  function layout() {
    const w = stage.w, h = stage.h;
    const pad = clamp(w * .065, 18, 30);
    const gap = 10;
    const choiceH = clamp((h - 224 - 2 * gap) / 3, 48, 64);
    const choiceY = h - 28 - (choiceH * 3 + gap * 2);
    return { w, h, pad, gap, choiceH, choiceY };
  }

  function pick(index) {
    if (state.ended || state.selected >= 0) return;
    const chapter = CHAPTERS[state.chapter];
    const choice = chapter.choices[index];
    if (!choice) return;
    state.selected = index;
    state.points += choice.points;
    state.brave += choice.brave;
    state.result = choice.result;
    audio.tap();
    api.vibrate?.(10);
    transitionTimer = window.setTimeout(() => {
      transitionTimer = 0;
      if (state.destroyed) return;
      state.chapter++;
      state.selected = -1;
      state.result = "";
      if (state.chapter >= CHAPTERS.length) finish();
    }, 850);
  }

  function finish() {
    if (state.ended || state.destroyed) return;
    state.ended = true;
    const stars = state.points >= 7 ? 3 : state.points >= 5 ? 2 : 1;
    const ending = state.brave >= 3
      ? "The kingdom crowns you Snack Champion. The dragon becomes your extremely small agent."
      : state.points >= 6
        ? "You save the royal cookie and make four new friends. The dragon gets the first bite."
        : "You made it to the kingdom! The marshmallow knight gives you a participation biscuit.";
    audio.win();
    window.setTimeout(() => {
      if (!state.destroyed) api.win(stars, state.points, { note: ending });
    }, 550);
  }

  function wrap(ctx, text, x, y, width, lineHeight, maxLines = 4) {
    const words = text.split(" ");
    const lines = [];
    let line = "";
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(test).width > width) { lines.push(line); line = word; }
      else line = test;
    }
    if (line) lines.push(line);
    lines.slice(0, maxLines).forEach((value, i) => ctx.fillText(value, x, y + i * lineHeight));
    return Math.min(lines.length, maxLines);
  }

  const stopPointer = bindPointer(stage.canvas, { down(p) {
    for (const button of buttons) {
      if (p.x >= button.x && p.x <= button.x + button.w && p.y >= button.y && p.y <= button.y + button.h) {
        pick(button.index);
        break;
      }
    }
  } });

  function draw() {
    const { ctx } = stage;
    const L = layout();
    ctx.clearRect(0, 0, L.w, L.h);
    const bg = ctx.createLinearGradient(0, 0, L.w, L.h);
    bg.addColorStop(0, "#173a4b"); bg.addColorStop(.52, "#282248"); bg.addColorStop(1, "#3e2446");
    ctx.fillStyle = bg; ctx.fillRect(0, 0, L.w, L.h);
    const glow = ctx.createRadialGradient(L.w * .8, L.h * .18, 4, L.w * .8, L.h * .18, L.w * .85);
    glow.addColorStop(0, "rgba(255,210,63,.18)"); glow.addColorStop(1, "rgba(255,210,63,0)"); ctx.fillStyle = glow; ctx.fillRect(0, 0, L.w, L.h);

    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillStyle = "#ffe08a"; ctx.font = `900 ${clamp(L.w * .042, 12, 16)}px ${FONT}`;
    ctx.fillText("A VERY IMPORTANT QUEST", L.pad, 32);
    ctx.textAlign = "right"; ctx.fillStyle = "rgba(255,255,255,.75)";
    ctx.fillText(`${Math.min(state.chapter + 1, 4)} / 4`, L.w - L.pad, 32);

    const chapter = CHAPTERS[Math.min(state.chapter, CHAPTERS.length - 1)];
    const cardY = 58, cardH = Math.max(130, L.choiceY - cardY - 12);
    roundRect(ctx, L.pad, cardY, L.w - 2 * L.pad, cardH, 22);
    ctx.fillStyle = "rgba(8,15,34,.5)"; ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,.13)"; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.textAlign = "center"; ctx.fillStyle = "#fff";
    ctx.font = `${clamp(L.w * .1, 34, 48)}px ${FONT}`;
    ctx.fillText(chapter.icon, L.w / 2, cardY + 36);
    ctx.fillStyle = "#ffe08a"; ctx.font = `900 ${clamp(L.w * .047, 14, 18)}px ${FONT}`;
    ctx.fillText(chapter.place, L.w / 2, cardY + 74);
    ctx.fillStyle = "#edf1ff"; ctx.font = `600 ${clamp(L.w * .039, 13, 16)}px ${FONT}`;
    const story = state.result || chapter.text;
    wrap(ctx, story, L.w / 2, cardY + 105, L.w - 2 * L.pad - 34, 23, 4);

    buttons = [];
    chapter.choices.forEach((choice, i) => {
      const x = L.pad, y = L.choiceY + i * (L.choiceH + L.gap), w = L.w - 2 * L.pad, h = L.choiceH;
      buttons.push({ x, y, w, h, index: i });
      const active = state.selected === i;
      roundRect(ctx, x, y, w, h, 15);
      ctx.fillStyle = active ? "rgba(255,210,63,.25)" : "rgba(255,255,255,.09)"; ctx.fill();
      ctx.strokeStyle = active ? "rgba(255,210,63,.78)" : "rgba(255,255,255,.13)"; ctx.lineWidth = 1.2; ctx.stroke();
      ctx.textAlign = "left"; ctx.fillStyle = "#fff";
      ctx.font = `800 ${clamp(L.w * .04, 13, 16)}px ${FONT}`;
      ctx.fillText(`${i + 1}.`, x + 14, y + h / 2);
      ctx.fillText(choice.label, x + 42, y + h / 2, w - 56);
    });
    ctx.textAlign = "center"; ctx.fillStyle = "rgba(255,255,255,.52)";
    ctx.font = `700 ${clamp(L.w * .027, 9, 11)}px ${FONT}`;
    ctx.fillText("YOUR CHOICES SHAPE THE LEGEND (AND THE SNACK BUDGET)", L.w / 2, L.h - 11);
  }
  const loop = createLoop((dt) => { state.time += dt; draw(); });

  return { destroy() {
    state.destroyed = true;
    if (transitionTimer) window.clearTimeout(transitionTimer);
    stopPointer?.(); loop.stop(); stage.destroy();
  } };
}
