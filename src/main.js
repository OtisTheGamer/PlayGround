import { loadSprites } from "./sprites.js";
import { audio } from "./audio.js";
import { mount as mountSquad } from "./levels/squad.js";
import { mount as mountKnife } from "./levels/knife.js";
import { mount as mountSnake } from "./levels/snake.js";
import { mount as mountSort } from "./levels/sort.js";
import { mount as mountRescue } from "./levels/rescue.js";
import { mount as mountSurvivor } from "./levels/survivor.js";
import { mount as mountBullet } from "./levels/bullet.js";

const LEVELS = [
  {
    id: "squad", n: 1, title: "Squad Rush", studio: "MegaGates Labs",
    claim: "99% pick the wrong gate", icon: "🏃",
    c1: "#ffd23f", c2: "#ff8a3d",
    hint: "Steer with ← → or drag. Multiply the squad, smash the boss.",
    scoreLabel: "SQUAD SIZE", mount: mountSquad,
  },
  {
    id: "survivor", n: 2, title: "Survivor Isle", studio: "Idlewood Games",
    claim: "Can you survive 30 seconds?", icon: "🧟",
    c1: "#3ee9a5", c2: "#0e8f66",
    hint: "Drag to run. Your gun aims itself. Grab gems, pick upgrades.",
    scoreLabel: "KILLS", mount: mountSurvivor,
  },
  {
    id: "bullet", n: 3, title: "Bullet Heaven", studio: "NeonEye Studio",
    claim: "Only 1% can dodge the eye", icon: "👁️",
    c1: "#ff7ab6", c2: "#7a4dff",
    hint: "Drag to dodge. Survive 20 seconds. Graze bullets for style.",
    scoreLabel: "GRAZES", mount: mountBullet,
  },
  {
    id: "knife", n: 4, title: "Knife Spin", studio: "FidgetForge",
    claim: "Extremely satisfying. Do not blink.", icon: "🔪",
    c1: "#ffb703", c2: "#ff5d6c",
    hint: "Tap or press Space to throw. Land 15 knives and 3 golden apples.",
    scoreLabel: "GOLDEN APPLES", mount: mountKnife,
  },
  {
    id: "snake", n: 5, title: "Snake Bites", studio: "GrowCorp",
    claim: "Can you reach size 110?", icon: "🐍",
    c1: "#3ee9a5", c2: "#18b27c",
    hint: "Steer with drag or WASD. Eat smaller orbs. Avoid bigger ones.",
    scoreLabel: "SIZE", mount: mountSnake,
  },
  {
    id: "sort", n: 6, title: "Potion Sort", studio: "CalmDown Labs",
    claim: "Only 1% can solve the potion", icon: "🧪",
    c1: "#9b5cff", c2: "#62b6ff",
    hint: "Tap a tube, then another to pour. Sort all four colors.",
    scoreLabel: "MOVES", lowerBetter: true, mount: mountSort,
  },
  {
    id: "rescue", n: 7, title: "Dog Rescue", studio: "SaveThePup",
    claim: "This dog needs your help", icon: "🐶",
    c1: "#ff8fa3", c2: "#ffb703",
    hint: "Drag to draw honey shields. They melt. Keep the bees off the dog.",
    scoreLabel: "BEES BLOCKED", mount: mountRescue,
  },
];

const SAVE_KEY = "adplay.save.v1";
const defaultSave = () => ({ stars: {}, best: {}, sound: true, skipped: 0 });

function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return defaultSave();
    const parsed = JSON.parse(raw);
    return {
      ...defaultSave(),
      ...parsed,
      stars: parsed.stars || {},
      best: parsed.best || {},
      sound: parsed.sound !== false,
    };
  } catch {
    return defaultSave();
  }
}

let save = loadSave();

const $ = (selector) => document.querySelector(selector);
const homeScreen = $("#screen-home");
const gameScreen = $("#screen-game");
const levelList = $("#level-list");
const levelHost = $("#level-host");
const hintChip = $("#hint-chip");
const resultLayer = $("#result-layer");
const skipBtn = $("#skip-btn");
const skipLabel = $("#skip-label");
const gameTitle = $("#game-title");
const gameClaim = $("#game-claim");
const gameSponsor = $("#game-sponsor");
const totalStarsEl = $("#total-stars");
const skipStatEl = $("#skip-stat");
const continueBtn = $("#continue-btn");
const continueLabel = $("#continue-label");
const soundBtn = $("#sound-btn");
const adBannerText = $("#ad-banner-text");

let current = null;
let sessionToken = 0;
let skipInterval = null;
let hintTimeout = null;
let toastTimeout = null;
let bannerInterval = null;
let bannerIndex = 0;
let spritesReady = false;

const BANNER_COPY = [
  "INSTALL FREE · NO WIFI NEEDED",
  "★★★★★ “BEST AD I'VE EVER PLAYED”",
  "YOUR SQUAD NEEDS YOU · TAP NOW",
  "0% REAL · 100% GAME",
  "LIMITED TIME: STILL FREE",
  "THE DOG IS STILL WAITING",
];

function persist() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch {}
}

function totalStars() {
  return LEVELS.reduce((sum, lvl) => sum + (save.stars[lvl.id] || 0), 0);
}

function nextLevel(levelId) {
  const index = LEVELS.findIndex((l) => l.id === levelId);
  if (index < 0) return LEVELS[0];
  return LEVELS[(index + 1) % LEVELS.length];
}

function nextUncleared() {
  return LEVELS.find((l) => (save.stars[l.id] || 0) === 0) || LEVELS[0];
}

function allCleared() {
  return LEVELS.every((l) => (save.stars[l.id] || 0) > 0);
}

function starsMarkup(count, total = 3) {
  let html = "";
  for (let i = 0; i < total; i++) html += `<span class="${i < count ? "on" : ""}">★</span>`;
  return html;
}

function bestText(level) {
  const best = save.best[level.id];
  if (best == null) return "NEW";
  if (level.id === "knife") return `BEST ${best}/3`;
  if (level.id === "sort") return `BEST ${best} MOVES`;
  return `BEST ${best}`;
}

function renderHome() {
  levelList.innerHTML = "";
  for (const level of LEVELS) {
    const stars = save.stars[level.id] || 0;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `level-card${stars > 0 ? " clear" : ""}`;
    btn.dataset.level = level.id;
    btn.setAttribute("aria-label", `Play ${level.title}: ${level.claim}. ${stars} of 3 stars.`);
    btn.innerHTML = `
      <div class="level-card-top">
        <span class="level-icon" style="--c1:${level.c1};--c2:${level.c2}" aria-hidden="true">${level.icon}</span>
        <span class="level-index">${String(level.n).padStart(2, "0")}</span>
      </div>
      <div>
        <span class="level-name">${level.title}</span>
        <span class="level-studio">${level.studio}</span>
      </div>
      <div class="level-card-bottom">
        <span class="stars" aria-hidden="true">${starsMarkup(stars)}</span>
        <span class="level-best">${bestText(level)}</span>
      </div>
    `;
    btn.addEventListener("click", () => startLevel(level.id));
    levelList.appendChild(btn);
  }

  totalStarsEl.textContent = String(totalStars());
  skipStatEl.textContent = `ADS SKIPPED: ${save.skipped || 0}`;

  if (allCleared()) {
    continueLabel.textContent = "ALL CLEARED · REPLAY";
  } else {
    const next = nextUncleared();
    continueLabel.textContent = `${String(next.n).padStart(2, "0")} · ${next.title.toUpperCase()}`;
  }
  continueBtn.dataset.level = nextUncleared().id;
}

function updateSoundButton() {
  soundBtn.setAttribute("aria-pressed", save.sound ? "true" : "false");
  soundBtn.setAttribute("aria-label", save.sound ? "Mute sound" : "Unmute sound");
}

function showToast(message, ms = 2400) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.remove("show"), ms);
}

function showHint(text, duration = 3800) {
  clearTimeout(hintTimeout);
  hintChip.textContent = text;
  hintChip.classList.add("show");
  hintTimeout = setTimeout(() => hintChip.classList.remove("show"), duration);
}

function startBannerCycle() {
  stopBannerCycle();
  bannerIndex = 0;
  adBannerText.textContent = BANNER_COPY[bannerIndex];
  bannerInterval = setInterval(() => {
    bannerIndex = (bannerIndex + 1) % BANNER_COPY.length;
    adBannerText.textContent = BANNER_COPY[bannerIndex];
  }, 5200);
}

function stopBannerCycle() {
  if (bannerInterval) clearInterval(bannerInterval);
  bannerInterval = null;
}

function stopSkipTimer(label = "SKIP ✕") {
  if (skipInterval) clearInterval(skipInterval);
  skipInterval = null;
  skipLabel.textContent = label;
  skipBtn.disabled = true;
  skipBtn.classList.remove("ready");
}

function startSkipTimer() {
  stopSkipTimer();
  let value = 3;
  skipLabel.textContent = `SKIP ${value}`;
  skipBtn.disabled = true;
  skipBtn.classList.remove("ready");
  const token = sessionToken;
  skipInterval = setInterval(() => {
    if (token !== sessionToken) return;
    value--;
    if (value > 0) {
      skipLabel.textContent = `SKIP ${value}`;
    } else {
      clearInterval(skipInterval);
      skipInterval = null;
      skipLabel.textContent = "SKIP ✕";
      skipBtn.disabled = false;
      skipBtn.classList.add("ready");
    }
  }, 1000);
}

function destroyCurrent() {
  if (current?.instance?.destroy) {
    try { current.instance.destroy(); } catch (error) { console.error(error); }
  }
  current = null;
  levelHost.innerHTML = "";
  resultLayer.hidden = true;
  resultLayer.innerHTML = "";
  resultLayer.classList.remove("lose");
  clearTimeout(hintTimeout);
  hintChip.classList.remove("show");
  stopSkipTimer("SKIP 3");
  stopBannerCycle();
}

function goHome(options = {}) {
  const { skipped = false, toast = "" } = options;
  sessionToken++;
  destroyCurrent();
  gameScreen.hidden = true;
  homeScreen.hidden = false;
  renderHome();
  if (skipped) {
    save.skipped = (save.skipped || 0) + 1;
    persist();
    skipStatEl.textContent = `ADS SKIPPED: ${save.skipped}`;
  }
  if (toast) showToast(toast, 2800);
}

async function startLevel(id) {
  const level = LEVELS.find((l) => l.id === id);
  if (!level) return;

  audio.ensure();
  if (!spritesReady) {
    try { await loadSprites(); spritesReady = true; } catch {}
  }

  const token = ++sessionToken;
  destroyCurrent();
  sessionToken = token;

  homeScreen.hidden = true;
  gameScreen.hidden = false;

  gameTitle.textContent = level.title;
  gameClaim.textContent = level.claim;
  gameSponsor.textContent = level.studio;
  adBannerText.textContent = BANNER_COPY[0];

  startSkipTimer();
  startBannerCycle();
  showHint(level.hint, 4200);

  const api = {
    win(stars, score, opts = {}) {
      if (token !== sessionToken || !current || current.resultShown) return;
      current.resultShown = true;
      const starCount = Math.max(1, Math.min(3, stars | 0));
      const prevStars = save.stars[level.id] || 0;
      save.stars[level.id] = Math.max(prevStars, starCount);
      const prevBest = save.best[level.id];
      const numericScore = Number(score) || 0;
      if (prevBest == null || (level.lowerBetter ? numericScore < prevBest : numericScore > prevBest)) {
        save.best[level.id] = numericScore;
      }
      persist();
      renderHome();
      stopSkipTimer("AD ENDED");
      showHint("Ad complete. Suspiciously fun, right?", 1400);
      showResult({ level, token, win: true, stars: starCount, score: numericScore, opts });
    },
    lose(reason) {
      if (token !== sessionToken || !current || current.resultShown) return;
      current.resultShown = true;
      stopSkipTimer("AD ENDED");
      showResult({ level, token, win: false, stars: 0, score: null, opts: { note: reason } });
    },
    toast(message, ms) {
      if (token === sessionToken) showToast(message, ms);
    },
    vibrate(pattern) {
      try { navigator.vibrate?.(pattern); } catch {}
    },
  };

  try {
    const instance = level.mount(levelHost, api);
    if (token !== sessionToken) {
      instance?.destroy?.();
      return;
    }
    current = { id: level.id, level, token, instance, resultShown: false };
    if (level.id === "squad") {
      // nothing extra; the level explains itself in the hint chip
    }
  } catch (error) {
    console.error(error);
    showToast("The ad failed to load. Ironic.", 3000);
    goHome();
  }
}

function formatScore(level, score) {
  if (score == null) return "";
  switch (level.id) {
    case "knife": return `${score} / 3`;
    case "sort": return `${score} MOVES`;
    case "squad": return `${score} SQUAD`;
    case "survivor": return `${score} KILLS`;
    case "bullet": return `${score} GRAZES`;
    case "snake": return `SIZE ${score}`;
    case "rescue": return `${score} BLOCKED`;
    default: return String(score);
  }
}

function formatBest(level, value) {
  if (value == null) return "";
  switch (level.id) {
    case "knife": return `BEST ${value} / 3 APPLES`;
    case "sort": return `BEST ${value} MOVES`;
    case "squad": return `BEST SQUAD ${value}`;
    case "survivor": return `BEST ${value} KILLS`;
    case "bullet": return `BEST ${value} GRAZES`;
    case "snake": return `BEST SIZE ${value}`;
    case "rescue": return `BEST ${value} BLOCKED`;
    default: return `BEST ${value}`;
  }
}

function confettiMarkup() {
  const colors = ["#ffd23f", "#ff5d8c", "#3ee9a5", "#62b6ff", "#9b5cff", "#ff8a3d"];
  let html = '<div class="confetti" aria-hidden="true">';
  for (let i = 0; i < 26; i++) {
    const left = Math.round(Math.random() * 96);
    const color = colors[i % colors.length];
    const delay = (Math.random() * 0.5).toFixed(2);
    const dur = (1.6 + Math.random() * 1.2).toFixed(2);
    const w = 4 + Math.round(Math.random() * 5);
    const h = 7 + Math.round(Math.random() * 9);
    html += `<i style="left:${left}%;background:${color};--delay:${delay}s;--dur:${dur}s;width:${w}px;height:${h}px"></i>`;
  }
  return html + "</div>";
}

function showResult({ level, token, win, stars, score, opts = {} }) {
  if (token !== sessionToken) return;
  resultLayer.hidden = false;
  resultLayer.classList.toggle("lose", !win);

  const levelIndex = LEVELS.findIndex((l) => l.id === level.id);
  const isLast = levelIndex === LEVELS.length - 1;
  const next = nextLevel(level.id);
  const best = save.best[level.id];

  const kicker = win ? (isLast ? "SEASON FINALE" : "AD COMPLETE") : "AD WINS";
  const title = win ? (isLast && allCleared() ? "SEASON<br>CLEARED!" : "LEVEL<br>CLEAR!") : "AD GOT<br>YOU";
  const sub = win
    ? (opts.note || "The ad has been defeated. It will remember this.")
    : (opts.note || "The ad got you. This is exactly what it wanted.");

  const primaryAction = win ? (isLast ? "menu" : "next") : "retry";
  const primaryLabel = win ? (isLast ? "BACK TO THE AD BREAK" : "NEXT AD →") : "TRY AGAIN";
  const showReplay = win;
  const showMenu = !win || !isLast;

  resultLayer.innerHTML = `
    ${win ? confettiMarkup() : ""}
    <div class="result-card" role="dialog" aria-modal="true" aria-labelledby="result-title">
      <span class="result-stamp">${win ? "NOT AN AD" : "SKIPPABLE"}</span>
      <span class="result-kicker">${kicker}</span>
      <h2 class="result-title" id="result-title">${title}</h2>
      <p class="result-sub">${sub}</p>
      ${win ? `<div class="result-stars" aria-label="${stars} of 3 stars">${starsMarkup(stars)}</div>` : ""}
      ${win && score != null ? `
        <div class="result-score">
          <span class="score-val">${formatScore(level, score)}</span>
          <span class="score-best">${formatBest(level, best)}</span>
        </div>
      ` : ""}
      ${win && opts.note ? "" : ""}
      <div class="result-actions">
        <button class="result-primary" data-action="${primaryAction}" type="button">${primaryLabel}</button>
        <div class="result-secondary-row">
          ${showReplay ? `<button class="result-primary ghost" data-action="replay" type="button">REPLAY</button>` : ""}
          ${showMenu ? `<button class="result-primary ghost" data-action="menu" type="button">MENU</button>` : ""}
        </div>
        ${win && !isLast ? `<button class="result-link" data-action="menu" type="button">I'VE HAD ENOUGH ADS</button>` : ""}
        ${!win ? `<button class="result-link" data-action="menu" type="button">SKIP TO THE AD BREAK</button>` : ""}
      </div>
    </div>
  `;

  resultLayer.querySelectorAll("[data-action]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const action = btn.dataset.action;
      audio.click();
      if (action === "next") startLevel(next.id);
      else if (action === "retry") startLevel(level.id);
      else if (action === "replay") startLevel(level.id);
      else goHome({ toast: "Back to the ad break." });
    });
  });
}

function openHelp() {
  const existing = document.querySelector(".sheet-layer");
  if (existing) existing.remove();
  const layer = document.createElement("div");
  layer.className = "sheet-layer";
  layer.innerHTML = `
    <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="help-title">
      <div class="sheet-grip" aria-hidden="true"></div>
      <h3 id="help-title">How AdPlay works</h3>
      <p>Seven playable ads, recreated as real mini-games. No install. No purchases. One suspiciously honest skip button.</p>
      <ul>
        <li><span class="sheet-num">1</span><span><b>Every level is the ad.</b> Runner hordes, survivor swarms, bullet hell, knife timing, snake growth, potion sorting and one very good dog.</span></li>
        <li><span class="sheet-num">2</span><span><b>Beat the objective</b> to earn up to three stars. Your best scores stay on this device.</span></li>
        <li><span class="sheet-num">3</span><span><b>Skip if you must.</b> The countdown is real. The judgement is also real.</span></li>
        <li><span class="sheet-num">4</span><span><b>All sprites are original recreations</b> of the ad-iverse, drawn for this game. No actual ads were harmed.</span></li>
      </ul>
      <button class="sheet-close" type="button">GOT IT, SHOW ME THE ADS</button>
    </div>
  `;
  document.getElementById("app").appendChild(layer);
  const close = () => layer.remove();
  layer.addEventListener("click", (e) => { if (e.target === layer) close(); });
  layer.querySelector(".sheet-close").addEventListener("click", () => { audio.tap(); close(); });
  audio.tap();
}

function bindChrome() {
  $("#help-btn").addEventListener("click", openHelp);
  soundBtn.addEventListener("click", () => {
    save.sound = !save.sound;
    audio.setEnabled(save.sound);
    updateSoundButton();
    persist();
    if (save.sound) audio.good();
    showToast(save.sound ? "Sound on. The ads are louder now." : "Sound off. Peace, finally.", 1800);
  });

  continueBtn.addEventListener("click", () => {
    const next = nextUncleared();
    startLevel(next.id);
  });

  $("#back-btn").addEventListener("click", () => {
    goHome({ toast: "You left the ad. Brave." });
  });

  $("#restart-btn").addEventListener("click", () => {
    if (current) startLevel(current.id);
  });

  skipBtn.addEventListener("click", () => {
    if (skipBtn.disabled) return;
    if (current?.resultShown) return;
    goHome({ skipped: true, toast: "Ad skipped. The ad remembers. The dog is fine." });
  });

  $("#fake-cta").addEventListener("click", () => {
    const messages = [
      "You're already playing it. That's the install.",
      "Install button is decorative. Like the ad's gameplay.",
      "Nice try. The only download is emotional.",
      "This button has never worked. It's part of the brand.",
    ];
    showToast(messages[Math.floor(Math.random() * messages.length)], 2200);
    audio.tap();
  });
}

async function boot() {
  audio.setEnabled(save.sound);
  updateSoundButton();
  renderHome();
  bindChrome();

  document.addEventListener("pointerdown", () => audio.ensure(), { once: true });
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !gameScreen.hidden) {
      goHome({ toast: "Escaped the ad. Respect." });
    }
  });

  try {
    await loadSprites();
    spritesReady = true;
    document.documentElement.dataset.sprites = "ready";
  } catch (error) {
    console.error("Sprite preload failed", error);
  }
}

boot();
