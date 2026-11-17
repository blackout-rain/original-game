"use strict";

const COLS = 10, ROWS = 8;
const SAVE_KEY = "original-game-save-v1";
const WIN_POP = 30;

// 建物の定義
const BUILDINGS = {
  hut:    { name: "家",     icon: "🏠", cost: { wood: 15, gold: 5 },  info: "人口上限 +4" },
  farm:   { name: "畑",     icon: "🌾", cost: { wood: 10 },           info: "食料 +0.8/秒" },
  lumber: { name: "木こり", icon: "🪓", cost: { wood: 5, gold: 5 },   info: "木材 +1/秒" },
  market: { name: "市場",   icon: "🏪", cost: { wood: 20, gold: 20 }, info: "食料20超の分を金に(2食料→3金)" },
};

function newState() {
  const s = { day: 1, wood: 30, food: 20, gold: 20, pop: 2, tiles: Array(COLS * ROWS).fill(null), won: false };
  s.tiles[Math.floor(ROWS / 2) * COLS + Math.floor(COLS / 2)] = "hut";
  return s;
}

let state = load() || newState();
let selected = "hut";
let speed = 1;
let timer = null;

const $ = (id) => document.getElementById(id);

function load() {
  try { return JSON.parse(localStorage.getItem(SAVE_KEY)); } catch { return null; }
}
function save() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch {}
}

const count = (type) => state.tiles.filter((t) => t === type).length;
const capacity = () => count("hut") * 4;

// 1秒ごとの更新
function tick() {
  state.day++;
  state.wood += count("lumber") * 1;
  state.food += count("farm") * 0.8;
  state.gold += state.pop * 0.1;

  // 市場: 食料20超を金に
  for (let i = 0; i < count("market"); i++) {
    if (state.food > 22) { state.food -= 2; state.gold += 3; }
  }

  // 食事
  state.food -= state.pop * 0.25;
  if (state.food < 0) {
    state.food = 0;
    state.pop = Math.max(0, state.pop - 0.3); // 飢餓で人口減
    say("食料が足りない！人口が減っています");
  } else if (state.food >= 5 && state.pop < capacity()) {
    state.pop = Math.min(capacity(), state.pop + 0.2); // 人口増加
  }
  if (state.pop > capacity()) state.pop = capacity();

  if (!state.won && Math.floor(state.pop) >= WIN_POP) {
    state.won = true;
    say(`🎉 人口${WIN_POP}人達成！村は大繁栄です(続けて遊べます)`);
  }
  render();
  save();
}

function canAfford(cost) {
  return Object.entries(cost).every(([k, v]) => state[k] >= v);
}

function build(i) {
  const type = selected;
  if (state.tiles[i]) return say("そこには既に建物があります");
  const b = BUILDINGS[type];
  if (!canAfford(b.cost)) return say("資源が足りません");
  for (const [k, v] of Object.entries(b.cost)) state[k] -= v;
  state.tiles[i] = type;
  say(`${b.icon}${b.name}を建てました`);
  render(); save();
}

function demolish(i) {
  const type = state.tiles[i];
  if (!type) return;
  for (const [k, v] of Object.entries(BUILDINGS[type].cost)) state[k] += Math.floor(v / 2);
  state.tiles[i] = null;
  say("取り壊しました");
  render(); save();
}

function say(text) { $("message").textContent = text; }

function costText(cost) {
  const icons = { wood: "🪵", food: "🌾", gold: "💰" };
  return Object.entries(cost).map(([k, v]) => icons[k] + v).join(" ");
}

function buildToolbar() {
  const bar = $("toolbar");
  bar.innerHTML = "";
  for (const [key, b] of Object.entries(BUILDINGS)) {
    const btn = document.createElement("button");
    btn.dataset.type = key;
    btn.innerHTML = `${b.icon} ${b.name}<small>${costText(b.cost)}</small><small>${b.info}</small>`;
    btn.onclick = () => { selected = key; render(); };
    bar.appendChild(btn);
  }
}

function buildGrid() {
  const grid = $("grid");
  grid.innerHTML = "";
  for (let i = 0; i < COLS * ROWS; i++) {
    const d = document.createElement("div");
    d.className = "tile";
    d.onclick = () => build(i);
    d.oncontextmenu = (e) => { e.preventDefault(); demolish(i); };
    grid.appendChild(d);
  }
}

function render() {
  $("day").textContent = state.day;
  $("wood").textContent = Math.floor(state.wood);
  $("food").textContent = Math.floor(state.food);
  $("gold").textContent = Math.floor(state.gold);
  $("pop").textContent = Math.floor(state.pop);
  $("cap").textContent = capacity();
  [...$("grid").children].forEach((el, i) => {
    el.textContent = state.tiles[i] ? BUILDINGS[state.tiles[i]].icon : "";
  });
  [...$("toolbar").children].forEach((el) => el.classList.toggle("active", el.dataset.type === selected));
  [...document.querySelectorAll("[data-speed]")].forEach((el) => el.classList.toggle("active", +el.dataset.speed === speed));
}

function setSpeed(s) {
  speed = s;
  clearInterval(timer);
  if (s > 0) timer = setInterval(tick, 1000 / s);
  render();
}

document.querySelectorAll("[data-speed]").forEach((el) => (el.onclick = () => setSpeed(+el.dataset.speed)));
$("reset").onclick = () => {
  if (confirm("最初からやり直しますか？")) { state = newState(); say(""); render(); save(); }
};

buildToolbar();
buildGrid();
setSpeed(1);
