"use strict";

// ====== 設定 ======
const cv = document.getElementById("cv");
const ctx = cv.getContext("2d");
const ov = document.getElementById("overlay");
const W = 960, H = 600;
const FINAL_WAVE = 5;
const BEST_KEY = "original-game-best-wave";

// 4人のクラス
const CLASSES = [
  { id: "warrior", name: "戦士",   icon: "🗡️", color: "#ff8f6b", hp: 120, spd: 150, atk: "melee",    dmg: 18, cd: 0.45, range: 58, arc: 1.7, kb: 160, entry: "衝撃波" },
  { id: "mage",    name: "魔法使い", icon: "🧙", color: "#b48cff", hp: 80,  spd: 140, atk: "fireball", dmg: 14, cd: 0.65, entry: "炎の波" },
  { id: "archer",  name: "弓使い", icon: "🏹", color: "#7bd389", hp: 90,  spd: 170, atk: "arrow",    dmg: 10, cd: 0.28, entry: "矢の雨" },
  { id: "tank",    name: "盾士",   icon: "🛡️", color: "#6cc4ff", hp: 180, spd: 120, atk: "melee",    dmg: 9,  cd: 0.6,  range: 46, arc: 1.3, kb: 320, entry: "守りの陣" },
];

const ENEMIES = {
  slime:  { icon: "🟢", hp: 22,  spd: 55,  r: 14, dmg: 8,  xp: 4,  size: 26 },
  bat:    { icon: "🦇", hp: 12,  spd: 115, r: 11, dmg: 5,  xp: 3,  size: 22 },
  goblin: { icon: "👺", hp: 30,  spd: 65,  r: 14, dmg: 8,  xp: 7,  size: 28 },
  boss:   { icon: "🐲", hp: 700, spd: 45,  r: 42, dmg: 16, xp: 80, size: 84 },
};

// レベルアップ時の強化候補
const UPGRADES = [
  { name: "全員の攻撃力 +15%",             f: (u) => (u.atk *= 1.15) },
  { name: "全員の最大HP +20%(その分回復)", f: (u) => (u.hp *= 1.2) },
  { name: "全員の移動速度 +10%",           f: (u) => (u.spd *= 1.1) },
  { name: "連携スキルの待ち時間 -25%",     f: (u) => (u.ecd *= 0.75) },
  { name: "🗡️ 戦士の攻撃力 +35%",         f: (u) => (u.warrior *= 1.35) },
  { name: "🧙 魔法使いの攻撃力 +35%",     f: (u) => (u.mage *= 1.35) },
  { name: "🏹 弓使いの攻撃力 +35%",       f: (u) => (u.archer *= 1.35) },
  { name: "🛡️ 盾士の攻撃力 +50%",         f: (u) => (u.tank *= 1.5) },
];

// ====== 入力 ======
const keys = new Set();
const mouse = { x: W / 2, y: H / 2, down: false };

cv.addEventListener("mousemove", (e) => {
  const r = cv.getBoundingClientRect();
  mouse.x = ((e.clientX - r.left) * W) / r.width;
  mouse.y = ((e.clientY - r.top) * H) / r.height;
});
cv.addEventListener("mousedown", () => (mouse.down = true));
window.addEventListener("mouseup", () => (mouse.down = false));
cv.addEventListener("contextmenu", (e) => e.preventDefault());
window.addEventListener("blur", () => { keys.clear(); mouse.down = false; });
window.addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();
  if ([" ", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) e.preventDefault();
  if (e.repeat) { keys.add(k); return; }
  keys.add(k);
  if (G.state === "play") {
    if (["1", "2", "3", "4"].includes(k)) switchTo(+k - 1);
    if (k === "q") cycle(-1);
    if (k === "e") cycle(1);
  }
  if (k === "p" || k === "escape") togglePause();
});
window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));

// ====== 状態 ======
let G = { state: "title" };
let lastTime = 0;

const decor = Array.from({ length: 28 }, () => ({
  x: 20 + Math.random() * (W - 40), y: 80 + Math.random() * (H - 100),
  e: ["🌲", "🌳", "🌼", "🪨", "🍄"][Math.floor(Math.random() * 5)],
})).filter((d) => Math.hypot(d.x - W / 2, d.y - H / 2) > 120);

function best() { try { return +localStorage.getItem(BEST_KEY) || 0; } catch { return 0; } }
function saveBest(v) { try { if (v > best()) localStorage.setItem(BEST_KEY, v); } catch {} }

function newGame() {
  G = {
    state: "play", t: 0, wave: 0, active: 0, queue: [], spawnT: 0, waveWait: null,
    enemies: [], proj: [], fx: [], texts: [], banner: null,
    xp: 0, lvl: 1, need: 32, pending: 0, guard: 0, lastEntry: -99, shake: 0,
    up: { atk: 1, hp: 1, spd: 1, ecd: 1, warrior: 1, mage: 1, archer: 1, tank: 1 },
    party: CLASSES.map((c, i) => ({
      c, i, x: W / 2 + (i - 1.5) * 36, y: H / 2 + 20, hp: c.hp, down: false, atkT: 0, entryCd: 0, inv: 0,
    })),
  };
  startWave();
  hideOverlay();
}

const maxHp = (m) => Math.round(m.c.hp * G.up.hp);
const alive = () => G.party.filter((m) => !m.down);
const say = (txt) => (G.banner = { txt, t: 1.8 });

// ====== オーバーレイ ======
function showOverlay(html) { ov.innerHTML = html; ov.classList.add("show"); }
function hideOverlay() { ov.classList.remove("show"); ov.innerHTML = ""; }
ov.addEventListener("click", (e) => {
  const b = e.target.closest("[data-act]");
  if (!b) return;
  const act = b.dataset.act;
  if (act === "start") newGame();
  else if (act === "resume") { G.state = "play"; hideOverlay(); }
  else if (act === "upgrade") chooseUpgrade(+b.dataset.i);
});

function showTitle() {
  showOverlay(`
    <h1>🗡️🧙🏹🛡️ 四人の守り手</h1>
    <p>4人の役割を切り替えながら、押し寄せる魔物の5つの波を撃退しよう。<br>
    操作中のキャラ以外もAIが自動で戦います。<b>キャラを切り替えた瞬間に連携スキル</b>が発動!<br>
    3秒以内に別のスキルをつなぐと「連携!」で威力1.5倍。</p>
    <p>最高到達: WAVE ${best()}</p>
    <div class="row"><button class="primary" data-act="start">ゲーム開始</button></div>`);
}

let upgradeChoices = [];
function showLevelUp() {
  G.state = "levelup";
  const pool = [...UPGRADES].sort(() => Math.random() - 0.5).slice(0, 3);
  upgradeChoices = pool;
  showOverlay(`
    <h1>⬆️ レベルアップ! Lv ${G.lvl}</h1>
    <p>強化を1つ選んでください</p>
    <div class="row">${pool.map((u, i) => `<button data-act="upgrade" data-i="${i}">${u.name}</button>`).join("")}</div>`);
}
function chooseUpgrade(i) {
  const before = G.party.map(maxHp);
  upgradeChoices[i].f(G.up);
  G.party.forEach((m, j) => { if (!m.down) m.hp += maxHp(m) - before[j]; });
  G.pending--;
  if (G.pending > 0) showLevelUp();
  else { G.state = "play"; hideOverlay(); }
}

function endGame(win) {
  G.state = "end";
  saveBest(win ? FINAL_WAVE : G.wave);
  showOverlay(`
    <h1>${win ? "🎉 勝利!" : "💀 全滅…"}</h1>
    <p>${win ? "ボスを倒し、村を守り抜きました!" : `WAVE ${G.wave} で力尽きました。`}<br>レベル ${G.lvl} ／ 最高到達 WAVE ${best()}</p>
    <div class="row"><button class="primary" data-act="start">もう一度</button></div>`);
}

function togglePause() {
  if (G.state === "play") { G.state = "pause"; showOverlay(`<h1>⏸ 一時停止</h1><div class="row"><button class="primary" data-act="resume">再開</button></div>`); }
  else if (G.state === "pause") { G.state = "play"; hideOverlay(); }
}

// ====== 波と敵 ======
function startWave() {
  G.wave++;
  const n = 6 + G.wave * 4;
  const types = G.wave === 1 ? ["slime"] : G.wave === 2 ? ["slime", "slime", "bat"] : ["slime", "bat", "goblin"];
  G.queue = Array.from({ length: n }, () => types[Math.floor(Math.random() * types.length)]);
  if (G.wave === FINAL_WAVE) G.queue.unshift("boss");
  G.spawnT = 1;
  say(G.wave === FINAL_WAVE ? "WAVE 5 — ボス出現!" : `WAVE ${G.wave}`);
}

function spawnEnemy(type) {
  const d = ENEMIES[type], s = 1 + (G.wave - 1) * 0.25;
  const side = Math.floor(Math.random() * 4);
  const x = side === 0 ? 10 : side === 1 ? W - 10 : 40 + Math.random() * (W - 80);
  const y = side === 2 ? 70 : side === 3 ? H - 10 : 90 + Math.random() * (H - 100);
  G.enemies.push({ type, ...d, x, y, hp: d.hp * s, maxHp: d.hp * s, dmg: d.dmg * (1 + (G.wave - 1) * 0.15), t: Math.random() * 3, shoot: 1 + Math.random() * 2, kx: 0, ky: 0, flash: 0 });
}

// ====== 戦闘 ======
function nearest(list, x, y) {
  let best = null, bd = Infinity;
  for (const o of list) { const d = Math.hypot(o.x - x, o.y - y); if (d < bd) { bd = d; best = o; } }
  return best ? { o: best, d: bd } : null;
}

function text(x, y, txt, color = "#fff", big = false) { G.texts.push({ x, y, txt, color, t: 0.8, big }); }

function hurtEnemy(e, dmg, kx = 0, ky = 0) {
  if (e.hp <= 0) return;
  e.hp -= dmg; e.flash = 0.1;
  const resist = e.type === "boss" ? 0.08 : 1;
  e.kx += kx * resist; e.ky += ky * resist;
  text(e.x, e.y - e.r, Math.round(dmg));
  if (e.hp <= 0) {
    G.xp += e.xp;
    G.fx.push({ k: "ring", x: e.x, y: e.y, r: 4, max: e.r + 14, t: 0.25, life: 0.25, color: "#fff" });
    while (G.xp >= G.need) { G.xp -= G.need; G.lvl++; G.need = 20 + G.lvl * 12; G.pending++; }
  }
}

function hurtMember(m, dmg) {
  if (m.inv > 0 || m.down) return;
  dmg *= (G.guard > 0 ? 0.3 : 1) * (m.c.id === "tank" ? 0.7 : 1);
  m.hp -= dmg; m.inv = 0.5; G.shake = 6;
  text(m.x, m.y - 20, Math.round(dmg), "#ff6b6b");
  if (m.hp <= 0) {
    m.hp = 0; m.down = true;
    text(m.x, m.y - 30, "戦闘不能", "#ff6b6b", true);
    if (!alive().length) return endGame(false);
    if (m.i === G.active) G.active = alive()[0].i;
  }
}

function attack(m, tx, ty, ai) {
  if (m.atkT > 0 || m.down) return;
  const c = m.c, mult = G.up.atk * G.up[c.id] * (ai ? 0.6 : 1);
  m.atkT = c.cd * (ai ? 1.8 : 1);
  const ang = Math.atan2(ty - m.y, tx - m.x);
  if (c.atk === "melee") {
    G.fx.push({ k: "arc", x: m.x, y: m.y, a: ang, range: c.range, arc: c.arc, t: 0.15, life: 0.15, color: c.color });
    for (const e of G.enemies) {
      const d = Math.hypot(e.x - m.x, e.y - m.y);
      if (d > c.range + e.r) continue;
      let da = Math.atan2(e.y - m.y, e.x - m.x) - ang;
      da = Math.atan2(Math.sin(da), Math.cos(da));
      if (Math.abs(da) > c.arc / 2 && d > e.r + 12) continue;
      hurtEnemy(e, c.dmg * mult, Math.cos(ang) * c.kb, Math.sin(ang) * c.kb);
    }
  } else if (c.atk === "fireball") {
    G.proj.push({ own: "p", x: m.x, y: m.y, vx: Math.cos(ang) * 320, vy: Math.sin(ang) * 320, dmg: c.dmg * mult, r: 8, aoe: 38, life: 1.6, icon: "🔥", size: 20 });
  } else {
    G.proj.push({ own: "p", x: m.x, y: m.y, vx: Math.cos(ang) * 560, vy: Math.sin(ang) * 560, dmg: c.dmg * mult, r: 5, life: 1, color: "#d7ffd0" });
  }
}

// 切り替えた瞬間に出る連携スキル
function switchTo(i) {
  const m = G.party[i];
  if (!m || m.down || i === G.active) return;
  G.active = i;
  if (m.entryCd > 0) return;
  const combo = G.t - G.lastEntry < 3;
  const mul = (combo ? 1.5 : 1) * G.up.atk * G.up[m.c.id];
  G.lastEntry = G.t;
  m.entryCd = 8 * G.up.ecd;
  if (combo) say("連携!");
  const id = m.c.id;
  const ring = (r, color) => G.fx.push({ k: "ring", x: m.x, y: m.y, r: 10, max: r, t: 0.4, life: 0.4, color });
  if (id === "warrior") {
    ring(120, "#ff8f6b");
    G.enemies.forEach((e) => { const d = Math.hypot(e.x - m.x, e.y - m.y); if (d < 120 + e.r) hurtEnemy(e, 30 * mul, ((e.x - m.x) / (d || 1)) * 320, ((e.y - m.y) / (d || 1)) * 320); });
  } else if (id === "mage") {
    ring(150, "#ffb347");
    G.enemies.forEach((e) => { if (Math.hypot(e.x - m.x, e.y - m.y) < 150 + e.r) hurtEnemy(e, 26 * mul); });
  } else if (id === "archer") {
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      G.proj.push({ own: "p", x: m.x, y: m.y, vx: Math.cos(a) * 520, vy: Math.sin(a) * 520, dmg: 14 * mul, r: 5, life: 0.9, color: "#d7ffd0" });
    }
  } else {
    ring(110, "#6cc4ff");
    G.guard = 4;
    G.enemies.forEach((e) => { const d = Math.hypot(e.x - m.x, e.y - m.y); if (d < 110 + e.r) hurtEnemy(e, 8 * mul, ((e.x - m.x) / (d || 1)) * 260, ((e.y - m.y) / (d || 1)) * 260); });
    say("守りの陣! 4秒間 被ダメージ-70%");
  }
}
function cycle(dir) {
  for (let k = 1; k <= 4; k++) { const i = (G.active + dir * k + 8) % 4; if (!G.party[i].down) return switchTo(i); }
}

// ====== 更新 ======
function update(dt) {
  G.t += dt;
  G.shake = Math.max(0, G.shake - dt * 30);
  if (G.guard > 0) G.guard -= dt;
  if (G.banner && (G.banner.t -= dt) <= 0) G.banner = null;
  G.party.forEach((m) => { m.atkT -= dt; m.entryCd -= dt; m.inv -= dt; });

  // 操作キャラ
  const a = G.party[G.active];
  const dx = (keys.has("d") || keys.has("arrowright") ? 1 : 0) - (keys.has("a") || keys.has("arrowleft") ? 1 : 0);
  const dy = (keys.has("s") || keys.has("arrowdown") ? 1 : 0) - (keys.has("w") || keys.has("arrowup") ? 1 : 0);
  if (dx || dy) {
    const l = Math.hypot(dx, dy), sp = a.c.spd * G.up.spd;
    a.x += (dx / l) * sp * dt; a.y += (dy / l) * sp * dt;
  }
  if (mouse.down || keys.has(" ") || keys.has("j")) attack(a, mouse.x, mouse.y, false);

  // 仲間はついてきて、近くの敵を自動で攻撃
  let k = 0;
  G.party.forEach((m) => {
    if (m.i === G.active || m.down) return;
    const ang = k * 2.1 + G.t * 0.4;
    const tx = a.x + Math.cos(ang) * 52, ty = a.y + Math.sin(ang) * 52;
    const d = Math.hypot(tx - m.x, ty - m.y), sp = Math.min(d * 5, m.c.spd * G.up.spd * 1.5);
    if (d > 2) { m.x += ((tx - m.x) / d) * sp * dt; m.y += ((ty - m.y) / d) * sp * dt; }
    const n = nearest(G.enemies, m.x, m.y);
    if (n) {
      const reach = m.c.atk === "melee" ? m.c.range + n.o.r : 360;
      if (n.d < reach) attack(m, n.o.x, n.o.y, true);
    }
    k++;
  });
  G.party.forEach((m) => { m.x = Math.max(16, Math.min(W - 16, m.x)); m.y = Math.max(70, Math.min(H - 16, m.y)); });

  // 敵の出現と波の進行
  if (G.queue.length) {
    G.spawnT -= dt;
    if (G.spawnT <= 0) { spawnEnemy(G.queue.shift()); G.spawnT = Math.max(0.25, 0.8 - G.wave * 0.07); }
  } else if (!G.enemies.length) {
    if (G.wave >= FINAL_WAVE) return endGame(true);
    if (G.waveWait == null) {
      G.waveWait = 2.4;
      G.party.forEach((m) => { if (m.down) { m.down = false; m.hp = Math.ceil(maxHp(m) * 0.4); } else m.hp = Math.min(maxHp(m), m.hp + maxHp(m) * 0.3); });
      say("WAVEクリア! 回復・復活");
    } else if ((G.waveWait -= dt) <= 0) { G.waveWait = null; startWave(); }
  }

  // 敵の行動
  for (const e of G.enemies) {
    e.t += dt; e.flash -= dt;
    const tg = nearest(alive(), e.x, e.y);
    if (!tg) break;
    const ang = Math.atan2(tg.o.y - e.y, tg.o.x - e.x);
    let vx = Math.cos(ang) * e.spd, vy = Math.sin(ang) * e.spd;
    if (e.type === "bat") { const w = Math.sin(e.t * 6) * e.spd * 0.7; vx += Math.cos(ang + Math.PI / 2) * w; vy += Math.sin(ang + Math.PI / 2) * w; }
    if (e.type === "goblin") {
      const s = tg.d > 240 ? 1 : tg.d < 170 ? -1 : 0;
      vx = Math.cos(ang) * e.spd * s + Math.cos(ang + Math.PI / 2) * e.spd * 0.5;
      vy = Math.sin(ang) * e.spd * s + Math.sin(ang + Math.PI / 2) * e.spd * 0.5;
      if ((e.shoot -= dt) <= 0) { e.shoot = 2.2; G.proj.push({ own: "e", x: e.x, y: e.y, vx: Math.cos(ang) * 210, vy: Math.sin(ang) * 210, dmg: e.dmg, r: 6, life: 3, color: "#ffd36b" }); }
    }
    if (e.type === "boss" && (e.shoot -= dt) <= 0) {
      e.shoot = 2.6;
      const off = Math.random() * 6;
      for (let q = 0; q < 16; q++) { const b = off + (q / 16) * Math.PI * 2; G.proj.push({ own: "e", x: e.x, y: e.y, vx: Math.cos(b) * 170, vy: Math.sin(b) * 170, dmg: e.dmg * 0.7, r: 7, life: 4, color: "#ff6b6b" }); }
    }
    e.x += (vx + e.kx) * dt; e.y += (vy + e.ky) * dt;
    e.kx *= 0.88; e.ky *= 0.88;
    e.x = Math.max(8, Math.min(W - 8, e.x)); e.y = Math.max(66, Math.min(H - 8, e.y));
  }
  // 敵同士の押し合い
  for (let i = 0; i < G.enemies.length; i++) for (let j = i + 1; j < G.enemies.length; j++) {
    const p = G.enemies[i], q = G.enemies[j], d = Math.hypot(p.x - q.x, p.y - q.y), min = (p.r + q.r) * 0.8;
    if (d > 0 && d < min) { const f = (min - d) / 2; p.x += ((p.x - q.x) / d) * f; p.y += ((p.y - q.y) / d) * f; q.x -= ((p.x - q.x) / d) * f; q.y -= ((p.y - q.y) / d) * f; }
  }
  // 接触ダメージ
  for (const e of G.enemies) for (const m of alive()) if (Math.hypot(e.x - m.x, e.y - m.y) < e.r + 12) hurtMember(m, e.dmg);

  // 弾
  for (const p of G.proj) {
    p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
    if (p.own === "p") {
      for (const e of G.enemies) {
        if (p.life > 0 && Math.hypot(e.x - p.x, e.y - p.y) < e.r + p.r) {
          if (p.aoe) {
            G.fx.push({ k: "ring", x: p.x, y: p.y, r: 6, max: p.aoe, t: 0.25, life: 0.25, color: "#ffb347" });
            G.enemies.forEach((o) => { if (Math.hypot(o.x - p.x, o.y - p.y) < p.aoe + o.r) hurtEnemy(o, p.dmg); });
          } else hurtEnemy(e, p.dmg, p.vx * 0.15, p.vy * 0.15);
          p.life = 0;
        }
      }
    } else {
      for (const m of alive()) if (p.life > 0 && Math.hypot(m.x - p.x, m.y - p.y) < p.r + 12) { hurtMember(m, p.dmg); p.life = 0; }
    }
    if (p.x < -20 || p.x > W + 20 || p.y < 40 || p.y > H + 20) p.life = 0;
  }
  G.proj = G.proj.filter((p) => p.life > 0);
  G.enemies = G.enemies.filter((e) => e.hp > 0);
  G.fx.forEach((f) => (f.t -= dt)); G.fx = G.fx.filter((f) => f.t > 0);
  G.texts.forEach((t) => { t.t -= dt; t.y -= 30 * dt; }); G.texts = G.texts.filter((t) => t.t > 0);

  if (G.state === "play" && G.pending > 0) showLevelUp();
}

// ====== 描画 ======
const emoji = (e, x, y, s) => { ctx.font = `${s}px sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(e, x, y); };
const bar = (x, y, w, h, p, c) => { ctx.fillStyle = "rgba(0,0,0,.55)"; ctx.fillRect(x, y, w, h); ctx.fillStyle = c; ctx.fillRect(x, y, w * Math.max(0, Math.min(1, p)), h); };

function draw() {
  ctx.save();
  if (G.shake) ctx.translate((Math.random() - 0.5) * G.shake, (Math.random() - 0.5) * G.shake);
  ctx.fillStyle = "#3f6b45"; ctx.fillRect(-10, -10, W + 20, H + 20);
  ctx.fillStyle = "#47774d"; ctx.fillRect(0, 60, W, H - 60);
  ctx.globalAlpha = 0.55; decor.forEach((d) => emoji(d.e, d.x, d.y, 26)); ctx.globalAlpha = 1;

  if (G.state === "title") { ctx.restore(); return; }

  // 攻撃エフェクト
  for (const f of G.fx) {
    const p = f.t / f.life;
    ctx.globalAlpha = p; ctx.strokeStyle = f.color; ctx.lineWidth = 4;
    ctx.beginPath();
    if (f.k === "arc") ctx.arc(f.x, f.y, f.range, f.a - f.arc / 2, f.a + f.arc / 2);
    else ctx.arc(f.x, f.y, f.r + (f.max - f.r) * (1 - p), 0, Math.PI * 2);
    ctx.stroke(); ctx.globalAlpha = 1;
  }
  // 守りの陣
  if (G.guard > 0) { const m = G.party[G.active]; ctx.globalAlpha = 0.25; ctx.fillStyle = "#6cc4ff"; ctx.beginPath(); ctx.arc(m.x, m.y, 110, 0, 7); ctx.fill(); ctx.globalAlpha = 1; }

  // 敵
  for (const e of G.enemies) {
    ctx.globalAlpha = e.flash > 0 ? 0.5 : 1;
    emoji(e.icon, e.x, e.y, e.size); ctx.globalAlpha = 1;
    if (e.type !== "boss") bar(e.x - 14, e.y - e.r - 8, 28, 4, e.hp / e.maxHp, "#e86b6b");
  }
  // 味方
  for (const m of G.party) {
    if (m.down) { emoji("💀", m.x, m.y, 22); continue; }
    if (m.i === G.active) { ctx.strokeStyle = m.c.color; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(m.x, m.y + 14, 18, 7, 0, 0, 7); ctx.stroke(); }
    ctx.globalAlpha = m.inv > 0 && Math.floor(m.inv * 20) % 2 ? 0.4 : 1;
    emoji(m.c.icon, m.x, m.y, m.i === G.active ? 32 : 26); ctx.globalAlpha = 1;
    bar(m.x - 16, m.y - 24, 32, 4, m.hp / maxHp(m), "#6be28a");
  }
  // 弾
  for (const p of G.proj) {
    if (p.icon) emoji(p.icon, p.x, p.y, p.size);
    else { ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill(); }
  }
  // ダメージ数字
  for (const t of G.texts) { ctx.globalAlpha = Math.min(1, t.t * 2); ctx.fillStyle = t.color; ctx.font = `bold ${t.big ? 16 : 13}px sans-serif`; ctx.textAlign = "center"; ctx.fillText(t.txt, t.x, t.y); ctx.globalAlpha = 1; }
  ctx.restore();

  drawHud();
}

function drawHud() {
  ctx.fillStyle = "rgba(0,0,0,.45)"; ctx.fillRect(0, 0, W, 60);
  G.party.forEach((m, i) => {
    const x = 10 + i * 158, y = 7, w = 150, h = 46, on = i === G.active;
    ctx.fillStyle = on ? "rgba(255,255,255,.18)" : "rgba(255,255,255,.08)"; ctx.fillRect(x, y, w, h);
    if (on) { ctx.strokeStyle = m.c.color; ctx.lineWidth = 2; ctx.strokeRect(x, y, w, h); }
    ctx.globalAlpha = m.down ? 0.4 : 1;
    emoji(m.c.icon, x + 22, y + 22, 24);
    ctx.fillStyle = "#fff"; ctx.font = "11px sans-serif"; ctx.textAlign = "left"; ctx.textBaseline = "middle";
    ctx.fillText(`${i + 1} ${m.c.name}`, x + 42, y + 11);
    bar(x + 42, y + 20, 100, 8, m.hp / maxHp(m), "#6be28a");
    const ready = m.entryCd <= 0, total = 8 * G.up.ecd;
    bar(x + 42, y + 33, 100, 5, ready ? 1 : 1 - m.entryCd / total, ready ? m.c.color : "#778");
    ctx.fillStyle = ready ? m.c.color : "#aab"; ctx.font = "9px sans-serif"; ctx.fillText(ready ? m.c.entry : "充填中", x + 42, y + 43);
    ctx.globalAlpha = 1;
  });
  ctx.textAlign = "right"; ctx.fillStyle = "#fff"; ctx.font = "bold 14px sans-serif"; ctx.textBaseline = "middle";
  ctx.fillText(`WAVE ${G.wave}/${FINAL_WAVE}   Lv ${G.lvl}`, W - 12, 16);
  bar(W - 212, 28, 200, 8, G.xp / G.need, "#ffd36b");
  ctx.font = "10px sans-serif"; ctx.fillText(`EXP ${G.xp}/${G.need}`, W - 12, 46);
  const boss = G.enemies.find((e) => e.type === "boss");
  if (boss) { bar(W / 2 - 200, 68, 400, 10, boss.hp / boss.maxHp, "#e04a4a"); ctx.textAlign = "center"; ctx.fillStyle = "#fff"; ctx.font = "11px sans-serif"; ctx.fillText("🐲 ドラゴン", W / 2, 90); }
  if (G.banner) { ctx.globalAlpha = Math.min(1, G.banner.t); ctx.textAlign = "center"; ctx.font = "bold 30px sans-serif"; ctx.fillStyle = "#000"; ctx.fillText(G.banner.txt, W / 2 + 2, 142); ctx.fillStyle = "#fff"; ctx.fillText(G.banner.txt, W / 2, 140); ctx.globalAlpha = 1; }
}

function loop(ts) {
  const dt = Math.min(0.05, (ts - lastTime) / 1000 || 0);
  lastTime = ts;
  if (G.state === "play") update(dt);
  draw();
  requestAnimationFrame(loop);
}

showTitle();
requestAnimationFrame(loop);
