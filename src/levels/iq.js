import { createStage, createLoop, bindPointer, clamp, roundRect } from "../util.js";
import { audio } from "../audio.js";

const FONT = '"Arial Rounded MT Bold", "Trebuchet MS", system-ui, sans-serif';
const QUESTIONS = [
  { q: "Which weighs more?", sub: "A trick question with a tiny hat.", choices: ["1 kg of feathers", "1 kg of bricks", "The hat", "Neither — tie!"], answer: 3, explain: "Correct! A kilogram is a kilogram. The hat is emotionally heavier." },
  { q: "A rooster lays an egg on a roof. Which way does it roll?", sub: "Think carefully. Or don't.", choices: ["Left", "Right", "Straight down", "Roosters don't lay eggs"], answer: 3, explain: "Roosters don't lay eggs. The roof can relax." },
  { q: "How many months have 28 days?", sub: "Calendar companies hate this one.", choices: ["1", "2", "6", "All 12"], answer: 3, explain: "Every month has at least 28 days. Calendar defeated." },
  { q: "You pass the person in second place. What place are you in?", sub: "No running required.", choices: ["First", "Second", "Third", "A different race"], answer: 1, explain: "You took second place. The leader is still out there." },
  { q: "What gets wetter the more it dries?", sub: "Please don't answer 'the ocean'.", choices: ["A towel", "A sponge", "A cloud", "Your IQ"], answer: 0, explain: "A towel! Your brain remains safely damp." },
];

export function mount(root, api) {
  root.innerHTML = "";
  const stage = createStage(root);
  const state = { index: 0, correct: 0, selected: -1, feedback: "", feedbackT: 0, ended: false, destroyed: false, time: 0 };
  let choices = [];
  let advanceTimer = 0;

  function layout() {
    const w = stage.w, h = stage.h;
    const pad = clamp(w * 0.065, 18, 30);
    const top = 122;
    const gap = 10;
    const choiceH = clamp((h - top - 75 - gap * 3) / 4, 44, 66);
    const choiceY = h - 28 - (choiceH * 4 + gap * 3);
    return { w, h, pad, top, gap, choiceH, choiceY };
  }

  function choose(index) {
    if (state.ended || state.selected >= 0) return;
    state.selected = index;
    const question = QUESTIONS[state.index];
    const right = index === question.answer;
    if (right) {
      state.correct++;
      state.feedback = question.explain;
      audio.good();
      api.vibrate?.(12);
    } else {
      state.feedback = `Not quite! ${question.explain}`;
      audio.bad();
      api.vibrate?.(8);
    }
    state.feedbackT = 1.15;
    advanceTimer = window.setTimeout(() => {
      advanceTimer = 0;
      if (state.destroyed) return;
      state.index++;
      state.selected = -1;
      state.feedback = "";
      if (state.index >= QUESTIONS.length) finish();
    }, 1120);
  }

  function finish() {
    if (state.ended || state.destroyed) return;
    state.ended = true;
    const stars = state.correct === 5 ? 3 : state.correct >= 3 ? 2 : 1;
    audio.win();
    window.setTimeout(() => {
      if (!state.destroyed) api.win(stars, state.correct, { note: `${state.correct}/5 correct. A certified genius by very questionable standards.` });
    }, 450);
  }

  function wrapped(ctx, text, x, y, maxWidth, lineHeight, maxLines = 3) {
    const words = text.split(" ");
    let line = "", lines = [];
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(test).width > maxWidth) { lines.push(line); line = word; }
      else line = test;
    }
    if (line) lines.push(line);
    lines.slice(0, maxLines).forEach((value, i) => ctx.fillText(value, x, y + i * lineHeight));
    return Math.min(lines.length, maxLines);
  }

  function onPointer(p) {
    const L = layout();
    for (const item of choices) {
      if (p.x >= item.x && p.x <= item.x + item.w && p.y >= item.y && p.y <= item.y + item.h) {
        choose(item.index);
        return;
      }
    }
    void L;
  }
  const stopPointer = bindPointer(stage.canvas, { down: onPointer });

  function draw() {
    const { ctx } = stage;
    const L = layout();
    const q = QUESTIONS[Math.min(state.index, QUESTIONS.length - 1)];
    ctx.clearRect(0, 0, L.w, L.h);
    const bg = ctx.createLinearGradient(0, 0, L.w, L.h);
    bg.addColorStop(0, "#172345"); bg.addColorStop(1, "#25153b");
    ctx.fillStyle = bg; ctx.fillRect(0, 0, L.w, L.h);
    ctx.fillStyle = "rgba(255,255,255,.035)";
    for (let i = 0; i < 16; i++) { ctx.beginPath(); ctx.arc((i * 97 + 31) % L.w, (i * 137 + 43) % L.h, 2 + i % 3, 0, Math.PI * 2); ctx.fill(); }

    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillStyle = "#ffd23f"; ctx.font = `900 ${clamp(L.w * .044, 12, 16)}px ${FONT}`;
    ctx.fillText("TOTALLY LEGIT IQ TEST", L.pad, 34);
    ctx.textAlign = "right"; ctx.fillStyle = "#d8dcff";
    ctx.fillText(`${Math.min(state.index + 1, 5)} / 5`, L.w - L.pad, 34);
    roundRect(ctx, L.pad, 55, L.w - 2 * L.pad, 7, 4); ctx.fillStyle = "rgba(255,255,255,.13)"; ctx.fill();
    const pg = ctx.createLinearGradient(L.pad, 0, L.w - L.pad, 0); pg.addColorStop(0, "#ffd23f"); pg.addColorStop(1, "#ff65b7");
    roundRect(ctx, L.pad, 55, (L.w - 2 * L.pad) * ((state.index + (state.selected >= 0 ? 1 : 0)) / 5), 7, 4); ctx.fillStyle = pg; ctx.fill();

    roundRect(ctx, L.pad, 78, L.w - 2 * L.pad, Math.max(104, L.choiceY - 94), 20);
    ctx.fillStyle = "rgba(255,255,255,.08)"; ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,.1)"; ctx.stroke();
    ctx.textAlign = "center"; ctx.fillStyle = "#fff";
    ctx.font = `900 ${clamp(L.w * .065, 21, 29)}px ${FONT}`;
    const questionLines = wrapped(ctx, q.q, L.w / 2, 112, L.w - L.pad * 2 - 36, 34, 2);
    ctx.fillStyle = "#bfc9ed"; ctx.font = `600 ${clamp(L.w * .035, 12, 15)}px ${FONT}`;
    wrapped(ctx, state.feedback || q.sub, L.w / 2, 112 + questionLines * 34 + 8, L.w - L.pad * 2 - 32, 21, 2);

    choices = [];
    q.choices.forEach((text, i) => {
      const x = L.pad, y = L.choiceY + i * (L.choiceH + L.gap), w = L.w - 2 * L.pad, h = L.choiceH;
      choices.push({ x, y, w, h, index: i });
      const selected = state.selected === i;
      const answer = state.selected >= 0 && i === q.answer;
      roundRect(ctx, x, y, w, h, 15);
      ctx.fillStyle = answer ? "rgba(62,233,165,.23)" : selected ? "rgba(255,93,108,.25)" : "rgba(255,255,255,.075)"; ctx.fill();
      ctx.strokeStyle = answer ? "rgba(62,233,165,.75)" : selected ? "rgba(255,93,108,.65)" : "rgba(255,255,255,.1)"; ctx.lineWidth = 1.3; ctx.stroke();
      ctx.textAlign = "left"; ctx.fillStyle = answer ? "#9bffcf" : "#edf1ff";
      ctx.font = `800 ${clamp(L.w * .043, 14, 17)}px ${FONT}`;
      ctx.fillText(`${String.fromCharCode(65 + i)}.`, x + 15, y + h / 2);
      ctx.font = `700 ${clamp(L.w * .039, 13, 16)}px ${FONT}`;
      ctx.fillText(text, x + 48, y + h / 2, w - 62);
    });
    if (state.selected < 0) {
      ctx.textAlign = "center"; ctx.fillStyle = "rgba(220,226,255,.5)";
      ctx.font = `700 ${clamp(L.w * .027, 9, 11)}px ${FONT}`;
      ctx.fillText("CHOOSE AN ANSWER · NO CALCULATOR (OR LAWYER) NEEDED", L.w / 2, L.h - 12);
    }
  }
  const loop = createLoop((dt) => { state.time += dt; if (state.feedbackT > 0) state.feedbackT -= dt; draw(); });

  return { destroy() {
    state.destroyed = true;
    if (advanceTimer) window.clearTimeout(advanceTimer);
    stopPointer?.(); loop.stop(); stage.destroy();
  } };
}
