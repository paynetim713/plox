// ============================================================
// PLOX · 抖音小游戏入口  (引擎:其他/Other,appid tt806df6d01e09fd4d02)
// 已搬:难度选择 + 棋盘玩法 + 存档(最高分/金币/静音) + 金币经济 + 复活(金币/广告)。
// 还差:排行榜(抖音云)、道具/商店、充值、规则/设置页、多首音乐。
// ============================================================
var P = require('./js/platform-tt.js');
var UI = require('./js/uikit.js');
var Engine = require('./js/engine.js');

// ---------- 1) 屏上画布 ----------
var canvas = tt.createCanvas();
var ctx = canvas.getContext('2d');
var info = P.sysInfo();
var dpr = info.pixelRatio || 1;
var W = info.windowWidth, H = info.windowHeight;
var safe = info.safeArea || { top: 0, bottom: H, left: 0, right: W };
canvas.width = W * dpr; canvas.height = H * dpr;
ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

// ---------- 2) 存档 + 经济(P.store 替代 localStorage)----------
var DIFF_KEYS = ['easy', 'normal', 'hard'];
var DIFF_LABEL = { easy: '简单', normal: '普通', hard: '困难' };
var DIFF_SUB = { easy: '干扰少·慢', normal: '干扰中·快', hard: '干扰多·更快' };
function getBest(d) { var b = P.store.get('plox_best', {}) || {}; return (b[d] | 0) || 0; }
function setBest(d, s) { var b = P.store.get('plox_best', {}) || {}; if (s > (b[d] || 0)) { b[d] = s; P.store.set('plox_best', b); } }
function getCoins() { return P.store.get('plox_coins', 0) | 0; }
function addCoins(n) { P.store.set('plox_coins', getCoins() + n); }
function spendCoins(n) { var c = getCoins(); if (c < n) return false; P.store.set('plox_coins', c - n); return true; }
(function () { if (!P.store.get('plox_started')) { P.store.set('plox_started', 1); P.store.set('plox_coins', 10); } })(); // 新玩家送 10 金币

// ---------- 3) 音频 ----------
var soundOn = P.store.get('plox_sound', 1) ? true : false;
function setSound(b) { soundOn = !!b; P.store.set('plox_sound', soundOn ? 1 : 0); }
function beep(freq, dur, type, vol) {
  if (!soundOn) return;
  var a = P.audioCtx(); if (!a) return;
  try {
    var o = a.createOscillator(), g = a.createGain(), n = a.currentTime;
    o.type = type || 'sine'; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, n);
    g.gain.exponentialRampToValueAtTime(vol || 0.1, n + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, n + dur);
    o.connect(g); g.connect(a.destination); o.start(n); o.stop(n + dur + 0.02);
  } catch (e) {}
}
tt.onShow(function () { P.audioResume(); });
tt.onHide(function () {});

// ---------- 4) 引擎实例 ----------
var lastDiff = 'normal';
var eng = Engine({
  beep: beep,
  onGameOver: function () { setBest(lastDiff, eng.score()); showReviveOrSettle(); },
  onStageUp: function (level) { if (level % 5 === 0) addCoins(1); }   // 每 5 关 +1 金币
});
function startGame(diff) { lastDiff = (DIFF_LABEL[diff] ? diff : 'normal'); eng.reset(lastDiff); UI.show('play'); }
var MAX_REVIVES = 3;
function reviveCost() { return 5 + eng.reviveCount() * 5; }   // 5 / 10 / 15
function showReviveOrSettle() { if (eng.reviveCount() < MAX_REVIVES) UI.show('revive'); else UI.show('gameover'); }

// ---------- 5) 触摸:全局命中 + 棋盘手势 ----------
var audioPrimed = false;
tt.onTouchStart(function () { if (!audioPrimed) { audioPrimed = true; P.audioResume(); } });
tt.onTouchEnd(function (e) {
  if (e.touches && e.touches.length > 0) return;
  var t = e.changedTouches && e.changedTouches[0]; if (!t) return;
  UI.tap(t.clientX, t.clientY);
});
// 棋盘手势(仅 play 屏):轴锁 1.5 / 按起点累计移动 / 下滑=hardDrop(220ms 去抖) / 轻点=旋转 / 多指中止
var tS = null, lastHardT = 0;
tt.onTouchStart(function (e) {
  if (UI.name() !== 'play') return;
  var ts = e.touches || []; if (ts.length > 1) { tS = null; return; }
  var t = ts[0]; if (!t) return;
  tS = { x: t.clientX, y: t.clientY, steps: 0, axis: null, moved: false };
});
tt.onTouchMove(function (e) {
  if (UI.name() !== 'play' || !tS || eng.state() !== 'playing') return;
  var ts = e.touches || []; if (ts.length > 1) return;
  var t = ts[0]; if (!t) return;
  var cell = boardLayout().cell;
  var dx = t.clientX - tS.x, dy = t.clientY - tS.y, adx = Math.abs(dx), ady = Math.abs(dy);
  if (!tS.axis && (adx > cell * 0.4 || ady > cell * 0.4)) tS.axis = (ady > adx * 1.5) ? 'v' : 'h';
  if (tS.axis === 'h') {
    var want = Math.round(dx / cell);
    while (tS.steps < want) { eng.move(1); tS.steps++; tS.moved = true; }
    while (tS.steps > want) { eng.move(-1); tS.steps--; tS.moved = true; }
  }
});
tt.onTouchEnd(function (e) {
  if (UI.name() !== 'play') return;
  var ts = e.touches || []; if (ts.length > 0) { tS = null; return; }
  if (!tS) return;
  var t = e.changedTouches && e.changedTouches[0]; if (!t) { tS = null; return; }
  var cell = boardLayout().cell;
  var dx = t.clientX - tS.x, dy = t.clientY - tS.y, now = Date.now();
  if (tS.axis === 'v' || (tS.axis !== 'h' && dy > cell * 0.5 && dy > Math.abs(dx) * 1.2)) {
    if (now - lastHardT > 220) { lastHardT = now; eng.hardDrop(); }
  } else if (!tS.moved) eng.rotate();
  tS = null;
});
tt.onTouchCancel(function () { tS = null; });

// ---------- 绘制小工具 ----------
function fillBtn(x, y, w, h, r, c0, c1, label, fs, tc) {
  var cg = ctx.createLinearGradient(x, 0, x + w, 0); cg.addColorStop(0, c0); cg.addColorStop(1, c1);
  ctx.fillStyle = cg; UI.rr(ctx, x, y, w, h, r); ctx.fill();
  ctx.fillStyle = tc || '#0c0220'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = '800 ' + (fs || 20) + 'px sans-serif'; ctx.fillText(label, x + w / 2, y + h / 2 + 1);
}
function ghostBtn(x, y, w, h, r, label, fs) {
  ctx.strokeStyle = 'rgba(150,90,255,0.45)'; ctx.lineWidth = 1.5; UI.rr(ctx, x, y, w, h, r); ctx.stroke();
  ctx.fillStyle = '#b9a6e0'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = '700 ' + (fs || 16) + 'px sans-serif'; ctx.fillText(label, x + w / 2, y + h / 2 + 1);
}
function coinsChip() {
  ctx.font = '800 13px sans-serif';
  var txt = '金币 ' + getCoins(), w = ctx.measureText(txt).width + 22, x = W - 12 - w, y = safe.top + 8, h = 24;
  ctx.fillStyle = 'rgba(255,216,106,0.1)'; UI.rr(ctx, x, y, w, h, 12); ctx.fill();
  ctx.strokeStyle = 'rgba(255,216,106,0.3)'; ctx.lineWidth = 1; UI.rr(ctx, x, y, w, h, 12); ctx.stroke();
  ctx.fillStyle = '#ffd86a'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(txt, x + w / 2, y + h / 2 + 1);
}

// ---------- 6) 屏幕:标题页(难度选择)----------
UI.register('title', {
  draw: function (ctx, dt, env) {
    ctx.fillStyle = '#0c0220'; ctx.fillRect(0, 0, W, H);
    var a1 = ctx.createRadialGradient(W * 0.2, H * 0.1, 0, W * 0.2, H * 0.1, W * 0.8);
    a1.addColorStop(0, 'rgba(43,11,88,0.8)'); a1.addColorStop(1, 'rgba(43,11,88,0)');
    ctx.fillStyle = a1; ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    UI.gradText(ctx, 'PLOX', W / 2, safe.top + H * 0.22, W * 0.6, '#5fe0ff', '#ff5fd0', '800 ' + Math.round(W * 0.16) + 'px sans-serif');
    ctx.fillStyle = '#9b86c9'; ctx.font = '600 ' + Math.round(W * 0.034) + 'px sans-serif';
    ctx.fillText('霓 虹 消 除', W / 2, safe.top + H * 0.22 + W * 0.11);
    coinsChip();
    var stxt = '音效 ' + (soundOn ? '开' : '关'); ctx.font = '700 13px sans-serif';
    var sw = ctx.measureText(stxt).width + 18, sx = 12, sy = safe.top + 8, sh = 24;
    ctx.fillStyle = 'rgba(150,90,255,0.12)'; UI.rr(ctx, sx, sy, sw, sh, 12); ctx.fill();
    ctx.fillStyle = '#b9a6e0'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(stxt, sx + sw / 2, sy + sh / 2 + 1);
    this._sound = { x: sx, y: sy, w: sw, h: sh };
    var m = 16, gap = 9, cw = (W - m * 2 - gap * 2) / 3, ch = 104, cy = safe.top + H * 0.42;
    this._diff = [];
    for (var i = 0; i < 3; i++) {
      var d = DIFF_KEYS[i], cx = m + i * (cw + gap), on = (d === lastDiff);
      ctx.fillStyle = on ? 'rgba(41,197,255,0.12)' : 'rgba(255,255,255,0.04)';
      UI.rr(ctx, cx, cy, cw, ch, 16); ctx.fill();
      ctx.strokeStyle = on ? '#5fe0ff' : 'rgba(150,90,255,0.22)'; ctx.lineWidth = on ? 2 : 1;
      UI.rr(ctx, cx, cy, cw, ch, 16); ctx.stroke();
      ctx.fillStyle = on ? '#fff' : '#cdbdf0'; ctx.font = '800 17px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      ctx.fillText(DIFF_LABEL[d], cx + cw / 2, cy + 34);
      ctx.fillStyle = '#8f7cbf'; ctx.font = '500 10px sans-serif'; ctx.fillText(DIFF_SUB[d], cx + cw / 2, cy + 54);
      ctx.fillStyle = '#8f7cbf'; ctx.font = '600 11px sans-serif'; ctx.fillText('最高 ' + getBest(d), cx + cw / 2, cy + 80);
      this._diff.push({ x: cx, y: cy, w: cw, h: ch, d: d });
    }
    var bw = Math.min(300, W * 0.72), bh = 56, bx = (W - bw) / 2, by = cy + ch + 26;
    fillBtn(bx, by, bw, bh, 18, '#27c2ff', '#ff3df0', '开 始 · ' + DIFF_LABEL[lastDiff], 20);
    this._start = { x: bx, y: by, w: bw, h: bh };
    ctx.fillStyle = '#6d5f95'; ctx.textAlign = 'center'; ctx.font = '500 12px sans-serif';
    ctx.fillText('轻点旋转 · 左右拖移动 · 向下滑落地', W / 2, by + bh + 28);
  },
  buttons: function () {
    var out = [];
    (this._diff || []).forEach(function (b) { out.push({ x: b.x, y: b.y, w: b.w, h: b.h, onTap: function () { beep(500, 0.05, 'sine', 0.08); lastDiff = b.d; } }); });
    if (this._start) out.push({ x: this._start.x, y: this._start.y, w: this._start.w, h: this._start.h, onTap: function () { beep(660, 0.08, 'sine', 0.12); beep(990, 0.06, 'triangle', 0.06); startGame(lastDiff); } });
    if (this._sound) out.push({ x: this._sound.x, y: this._sound.y, w: this._sound.w, h: this._sound.h, onTap: function () { setSound(!soundOn); beep(660, 0.05, 'sine', 0.1); } });
    return out;
  }
});

// ---------- 7) 屏幕:游戏页 ----------
function boardLayout() {
  var cell = Math.floor(Math.min((W - 24) / 7, (H - safe.top - 150) / 14));
  var bw = cell * 7, bh = cell * 14, ox = Math.floor((W - bw) / 2), oy = safe.top + 92;
  return { cell: cell, bw: bw, bh: bh, ox: ox, oy: oy };
}
UI.register('play', {
  draw: function (ctx, dt, env) {
    var lay = boardLayout();
    ctx.fillStyle = '#0a0118'; ctx.fillRect(0, 0, W, H);
    ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
    ctx.fillStyle = '#9b86c9'; ctx.font = '600 12px sans-serif';
    ctx.fillText('分数', lay.ox, safe.top + 32);
    ctx.fillText('消除', lay.ox + lay.bw * 0.42, safe.top + 32);
    ctx.fillStyle = '#fff'; ctx.font = '800 20px sans-serif';
    ctx.fillText(String(eng.score()), lay.ox, safe.top + 56);
    ctx.fillText(String(eng.cleared()), lay.ox + lay.bw * 0.42, safe.top + 56);
    coinsChip();
    eng.tick(dt);
    eng.draw(ctx, { cell: lay.cell, ox: lay.ox, oy: lay.oy });
  }
});

// ---------- 8) 屏幕:复活页 ----------
UI.register('revive', {
  draw: function (ctx, dt, env) {
    ctx.fillStyle = '#0a0118'; ctx.fillRect(0, 0, W, H);
    var a1 = ctx.createRadialGradient(W * 0.5, H * 0.3, 0, W * 0.5, H * 0.3, W * 0.8);
    a1.addColorStop(0, 'rgba(60,20,20,0.6)'); a1.addColorStop(1, 'rgba(60,20,20,0)');
    ctx.fillStyle = a1; ctx.fillRect(0, 0, W, H);
    coinsChip();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    UI.gradText(ctx, '差一点!', W / 2, safe.top + H * 0.24, W * 0.5, '#ffb14d', '#ff5a3c', '800 ' + Math.round(W * 0.1) + 'px sans-serif');
    ctx.fillStyle = '#9b86c9'; ctx.font = '600 14px sans-serif';
    ctx.fillText('本局 ' + eng.score() + ' · 复活炸掉最下方 6 行', W / 2, safe.top + H * 0.33);
    var bw = Math.min(300, W * 0.72), bh = 54, bx = (W - bw) / 2, y = safe.top + H * 0.42, gap = 12;
    var cost = reviveCost(), afford = getCoins() >= cost;
    this._btns = [];
    if (P.hasRewardedAd()) {
      fillBtn(bx, y, bw, bh, 16, '#3ad07a', '#1fa85e', '看广告 · 免费复活', 17, '#04220f');
      this._btns.push({ x: bx, y: y, w: bw, h: bh, kind: 'ad' }); y += bh + gap;
    }
    if (afford) { fillBtn(bx, y, bw, bh, 16, '#ffd86a', '#ffb02e', '金币复活 · ' + cost, 17, '#3a2400'); this._btns.push({ x: bx, y: y, w: bw, h: bh, kind: 'coin', cost: cost }); }
    else { ghostBtn(bx, y, bw, bh, 16, '金币不够(需 ' + cost + ')', 15); }
    y += bh + gap;
    ghostBtn(bx, y, bw, 46, 14, '放弃,看结算', 15); this._btns.push({ x: bx, y: y, w: bw, h: 46, kind: 'give' });
  },
  buttons: function () {
    var out = [];
    (this._btns || []).forEach(function (b) {
      out.push({ x: b.x, y: b.y, w: b.w, h: b.h, onTap: function () {
        if (b.kind === 'ad') { P.showRewardedAd(function () { eng.revive(); UI.show('play'); }, function () { UI.show('revive'); }); }
        else if (b.kind === 'coin') { if (spendCoins(b.cost)) { eng.revive(); UI.show('play'); } }
        else if (b.kind === 'give') { beep(300, 0.05, 'sine', 0.07); UI.show('gameover'); }
      } });
    });
    return out;
  }
});

// ---------- 9) 屏幕:结算页 ----------
UI.register('gameover', {
  draw: function (ctx, dt, env) {
    ctx.fillStyle = '#0a0118'; ctx.fillRect(0, 0, W, H);
    var a1 = ctx.createRadialGradient(W * 0.5, H * 0.3, 0, W * 0.5, H * 0.3, W * 0.8);
    a1.addColorStop(0, 'rgba(43,11,88,0.7)'); a1.addColorStop(1, 'rgba(43,11,88,0)');
    ctx.fillStyle = a1; ctx.fillRect(0, 0, W, H);
    coinsChip();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    UI.gradText(ctx, '结 算', W / 2, safe.top + H * 0.2, W * 0.5, '#5fe0ff', '#ff5fd0', '800 ' + Math.round(W * 0.1) + 'px sans-serif');
    ctx.fillStyle = '#9b86c9'; ctx.font = '600 13px sans-serif'; ctx.fillText('本局得分', W / 2, safe.top + H * 0.3);
    ctx.fillStyle = '#fff'; ctx.font = '900 ' + Math.round(W * 0.12) + 'px sans-serif'; ctx.fillText(String(eng.score()), W / 2, safe.top + H * 0.37);
    ctx.fillStyle = '#d9c8ff'; ctx.font = '600 14px sans-serif';
    ctx.fillText('关卡 ' + eng.level() + ' · 历史最高 ' + getBest(lastDiff), W / 2, safe.top + H * 0.45);
    var bw = Math.min(300, W * 0.72), bh = 56, bx = (W - bw) / 2, by = safe.top + H * 0.56;
    fillBtn(bx, by, bw, bh, 18, '#27c2ff', '#ff3df0', '再 来 一 局', 20);
    this._again = { x: bx, y: by, w: bw, h: bh };
    ghostBtn(bx, by + bh + 16, bw, 48, 16, '返 回', 16);
    this._back = { x: bx, y: by + bh + 16, w: bw, h: 48 };
  },
  buttons: function () {
    var a = this._again, b = this._back, out = [];
    if (a) out.push({ x: a.x, y: a.y, w: a.w, h: a.h, onTap: function () { beep(660, 0.08, 'sine', 0.12); startGame(lastDiff); } });
    if (b) out.push({ x: b.x, y: b.y, w: b.w, h: b.h, onTap: function () { beep(330, 0.05, 'sine', 0.08); UI.show('title'); } });
    return out;
  }
});

// ---------- 10) 主循环 ----------
var last = 0;
function frame(t) {
  var dt = Math.min(50, t - (last || t)); last = t;
  ctx.clearRect(0, 0, W, H);
  UI.draw(ctx, dt, { W: W, H: H, safe: safe });
  requestAnimationFrame(frame);
}

// ---------- 启动 ----------
// P.initAd('你的激励视频广告位ID');   // 后台开通流量主 → 建激励视频广告位后填入,看广告复活才会出现
UI.show('title');
requestAnimationFrame(frame);
