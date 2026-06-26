// ============================================================
// PLOX · 抖音小游戏入口  (引擎:其他/Other,appid tt806df6d01e09fd4d02)
// 已搬:难度选择 + 棋盘玩法 + 存档(最高分/金币/静音) + 金币经济 + 复活(金币/广告)。
// 还差:排行榜(抖音云)、道具/商店、充值、规则/设置页、多首音乐。
// ============================================================
var P = require('./js/platform-tt.js');
var UI = require('./js/uikit.js');
var Engine = require('./js/engine.js');
var LB = require('./js/cloud-lb.js');
var Music = require('./js/music.js');

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

// 钻石(硬通货,真钱充值;10 钻可兑 100 金币)
var DIAMOND_TO_COIN = 10;
function getDiamonds() { return P.store.get('plox_diamonds', 0) | 0; }
function addDiamonds(n) { P.store.set('plox_diamonds', Math.max(0, getDiamonds() + (n | 0))); }
function spendDiamonds(n) { var v = getDiamonds(); if (v < n) return false; P.store.set('plox_diamonds', v - n); return true; }

// 道具:两种炸弹(炸掉棋盘最下方 N 行)。库存存本地。
var ITEMS = {
  bomb:    { id: 'bomb',    name: '炸弹',     rows: 2, cost: 1, tone: 'cool', desc: '炸掉最下方 2 行' },
  bombBig: { id: 'bombBig', name: '巨型炸弹', rows: 3, cost: 3, tone: 'hot',  desc: '炸掉最下方 3 行' }
};
var ITEM_LIST = ['bomb', 'bombBig'];
function getItem(id) { var o = P.store.get('plox_items', {}) || {}; return Math.max(0, o[id] | 0); }
function addItem(id, n) { var o = P.store.get('plox_items', {}) || {}; o[id] = Math.max(0, (o[id] | 0) + (n || 1)); P.store.set('plox_items', o); return o[id]; }
function useItem(id) { var o = P.store.get('plox_items', {}) || {}; if ((o[id] | 0) <= 0) return false; o[id]--; P.store.set('plox_items', o); return true; }
function ownedItems() { var out = []; for (var i = 0; i < ITEM_LIST.length; i++) if (getItem(ITEM_LIST[i]) > 0) out.push(ITEM_LIST[i]); return out; }

// 排行榜上传用的玩家名(无屏幕键盘,直接用存档/默认名;改名 UI 暂不做)
function getName() { return P.store.get('plox_name', '玩家') || '玩家'; }

// 新玩家:送 10 金币 + 1 个炸弹,让局内道具栏第一次就出现(自带教学)
(function () {
  if (!P.store.get('plox_started')) {
    P.store.set('plox_started', 1);
    P.store.set('plox_coins', 10);
    if (getItem('bomb') === 0 && getItem('bombBig') === 0) addItem('bomb', 1);
  }
})();

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
// ---------- 背景音乐 ----------
var musicOn = P.store.get('plox_music_on', 1) ? true : false;
var music = Music(P.audioCtx, function () { return musicOn; });
music.setTrack(P.store.get('plox_music_track', 0) | 0);
function setMusicOn(b) {
  musicOn = !!b; P.store.set('plox_music_on', musicOn ? 1 : 0);
  if (!musicOn) music.stop();
  else if (UI.name() === 'play' && eng.state() === 'playing') music.start();
}
function gotoPlay() { UI.show('play'); if (musicOn) { P.audioResume(); music.start(); } }

tt.onShow(function () { P.audioResume(); if (musicOn && UI.name() === 'play' && eng.state() === 'playing') music.start(); });
tt.onHide(function () { music.stop(); });

// ---------- 4) 引擎实例 ----------
var lastDiff = 'normal';
var eng = Engine({
  beep: beep,
  onGameOver: function () { music.stop(); setBest(lastDiff, eng.score()); showReviveOrSettle(); },
  onStageUp: function (level) { if (level % 5 === 0) addCoins(1); }   // 每 5 关 +1 金币
});
function startGame(diff) { lastDiff = (DIFF_LABEL[diff] ? diff : 'normal'); eng.reset(lastDiff); gotoPlay(); }
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
// 钻石数量小胶囊(放金币胶囊左侧)
function diamondChip() {
  ctx.font = '800 13px sans-serif';
  var txt = '钻石 ' + getDiamonds(), w = ctx.measureText(txt).width + 22;
  var cw = ctx.measureText('金币 ' + getCoins()).width + 22;
  var x = W - 12 - cw - 8 - w, y = safe.top + 8, h = 24;
  ctx.fillStyle = 'rgba(95,224,255,0.1)'; UI.rr(ctx, x, y, w, h, 12); ctx.fill();
  ctx.strokeStyle = 'rgba(95,224,255,0.3)'; ctx.lineWidth = 1; UI.rr(ctx, x, y, w, h, 12); ctx.stroke();
  ctx.fillStyle = '#5fe0ff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(txt, x + w / 2, y + h / 2 + 1);
}
// 纯图形炸弹图标:深色圆角方块 + N 条行条 + 引线火花。tone: cool=青蓝 / hot=橙红
function bombGlyph(x, y, s, rows, tone) {
  var col = tone === 'hot' ? '#ff6a45' : '#5fd0ff';
  ctx.save();
  ctx.fillStyle = '#1a1326'; UI.rr(ctx, x, y, s, s, s * 0.22); ctx.fill();
  ctx.strokeStyle = col; ctx.lineWidth = Math.max(1.5, s * 0.06); UI.rr(ctx, x, y, s, s, s * 0.22); ctx.stroke();
  var pad = s * 0.18, bw = s - pad * 2, n = rows || 2, gap = s * 0.07;
  var bh = (s - pad * 2 - gap * (n - 1)) / n;
  ctx.fillStyle = col;
  for (var i = 0; i < n; i++) {
    var by = y + pad + i * (bh + gap);
    UI.rr(ctx, x + pad, by, bw, bh, bh * 0.3); ctx.fill();
  }
  // 引线火花
  ctx.fillStyle = '#ffd86a'; ctx.beginPath(); ctx.arc(x + s * 0.84, y + s * 0.14, s * 0.07, 0, 7); ctx.fill();
  ctx.restore();
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
    // 一排小文字入口:商店 / 排行榜 / 玩法 / 设置
    var links = [['商店', 'shop'], ['排行榜', 'leaderboard'], ['玩法', 'rules'], ['设置', 'settings']];
    var ly = by + bh + 22, lh = 30, lgap = 8, lw = (bw - lgap * 3) / 4;
    this._links = [];
    ctx.font = '700 13px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (var li = 0; li < links.length; li++) {
      var lx = bx + li * (lw + lgap);
      ctx.fillStyle = 'rgba(150,90,255,0.10)'; UI.rr(ctx, lx, ly, lw, lh, 11); ctx.fill();
      ctx.fillStyle = '#b9a6e0'; ctx.fillText(links[li][0], lx + lw / 2, ly + lh / 2 + 1);
      this._links.push({ x: lx, y: ly, w: lw, h: lh, to: links[li][1] });
    }
    ctx.fillStyle = '#6d5f95'; ctx.textAlign = 'center'; ctx.font = '500 12px sans-serif';
    ctx.fillText('轻点旋转 · 左右拖移动 · 向下滑落地', W / 2, ly + lh + 24);
  },
  buttons: function () {
    var out = [];
    (this._diff || []).forEach(function (b) { out.push({ x: b.x, y: b.y, w: b.w, h: b.h, onTap: function () { beep(500, 0.05, 'sine', 0.08); lastDiff = b.d; } }); });
    if (this._start) out.push({ x: this._start.x, y: this._start.y, w: this._start.w, h: this._start.h, onTap: function () { beep(660, 0.08, 'sine', 0.12); beep(990, 0.06, 'triangle', 0.06); startGame(lastDiff); } });
    if (this._sound) out.push({ x: this._sound.x, y: this._sound.y, w: this._sound.w, h: this._sound.h, onTap: function () { setSound(!soundOn); beep(660, 0.05, 'sine', 0.1); } });
    (this._links || []).forEach(function (b) { out.push({ x: b.x, y: b.y, w: b.w, h: b.h, onTap: function () { beep(520, 0.05, 'sine', 0.07); UI.show(b.to, 'title'); } }); });
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
    // 局内道具栏:棋盘下方一排,只列出已拥有的炸弹(图标 + ×数量),点一下用一个
    var owned = ownedItems();
    this._items = [];
    var iy = lay.oy + lay.bh + 10, ih = 40, iw = 64, igap = 10, gs = 26;
    var totalW = owned.length * iw + (owned.length - 1) * igap;
    var ix = lay.ox + (lay.bw - totalW) / 2;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    for (var k = 0; k < owned.length; k++) {
      var id = owned[k], it = ITEMS[id], bx2 = ix + k * (iw + igap);
      ctx.fillStyle = 'rgba(255,255,255,0.05)'; UI.rr(ctx, bx2, iy, iw, ih, 12); ctx.fill();
      ctx.strokeStyle = it.tone === 'hot' ? 'rgba(255,106,69,0.4)' : 'rgba(95,208,255,0.4)'; ctx.lineWidth = 1;
      UI.rr(ctx, bx2, iy, iw, ih, 12); ctx.stroke();
      bombGlyph(bx2 + 8, iy + (ih - gs) / 2, gs, it.rows, it.tone);
      ctx.fillStyle = '#e8def8'; ctx.font = '800 14px sans-serif';
      ctx.fillText('×' + getItem(id), bx2 + 8 + gs + 6, iy + ih / 2 + 1);
      this._items.push({ x: bx2, y: iy, w: iw, h: ih, id: id });
    }
  },
  buttons: function () {
    var out = [];
    (this._items || []).forEach(function (b) {
      out.push({ x: b.x, y: b.y, w: b.w, h: b.h, onTap: function () {
        if (eng.state() === 'playing' && useItem(b.id)) { eng.useBomb(ITEMS[b.id].rows); }
      } });
    });
    return out;
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
        if (b.kind === 'ad') { P.showRewardedAd(function () { eng.revive(); gotoPlay(); }, function () { UI.show('revive'); }); }
        else if (b.kind === 'coin') { if (spendCoins(b.cost)) { eng.revive(); gotoPlay(); } }
        else if (b.kind === 'give') { beep(300, 0.05, 'sine', 0.07); UI.show('gameover'); }
      } });
    });
    return out;
  }
});

// ---------- 9) 屏幕:结算页 ----------
UI.register('gameover', {
  onShow: function () { music.stop(); this._uploaded = false; this._uploading = false; },
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
    var bw = Math.min(300, W * 0.72), bh = 56, bx = (W - bw) / 2, by = safe.top + H * 0.53;
    fillBtn(bx, by, bw, bh, 18, '#27c2ff', '#ff3df0', '再 来 一 局', 20);
    this._again = { x: bx, y: by, w: bw, h: bh };
    // 一排小入口:商店 / 排行榜 / 上传成绩
    var ay = by + bh + 14, ah = 40, agap = 8, aw = (bw - agap * 2) / 3;
    var acts = [['商店', 'shop'], ['排行榜', 'leaderboard'], [this._uploaded ? '已上传' : (this._uploading ? '上传中…' : '上传成绩'), 'upload']];
    this._acts = [];
    ctx.font = '700 13px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (var ai = 0; ai < acts.length; ai++) {
      var ax = bx + ai * (aw + agap), dead = (acts[ai][1] === 'upload' && (this._uploaded || this._uploading || eng.score() <= 0));
      ctx.fillStyle = 'rgba(150,90,255,0.10)'; UI.rr(ctx, ax, ay, aw, ah, 11); ctx.fill();
      ctx.fillStyle = dead ? '#6d5f95' : '#b9a6e0'; ctx.fillText(acts[ai][0], ax + aw / 2, ay + ah / 2 + 1);
      this._acts.push({ x: ax, y: ay, w: aw, h: ah, to: acts[ai][1], dead: dead });
    }
    ghostBtn(bx, ay + ah + 14, bw, 46, 16, '返 回', 16);
    this._back = { x: bx, y: ay + ah + 14, w: bw, h: 46 };
  },
  buttons: function () {
    var a = this._again, b = this._back, self = this, out = [];
    if (a) out.push({ x: a.x, y: a.y, w: a.w, h: a.h, onTap: function () { beep(660, 0.08, 'sine', 0.12); startGame(lastDiff); } });
    (this._acts || []).forEach(function (ac) {
      out.push({ x: ac.x, y: ac.y, w: ac.w, h: ac.h, onTap: function () {
        if (ac.to === 'upload') {
          if (ac.dead) return;
          self._uploading = true; beep(700, 0.06, 'triangle', 0.07);
          LB.submit(getName(), eng.score(), lastDiff).then(function () { self._uploading = false; self._uploaded = true; });
        } else { beep(520, 0.05, 'sine', 0.07); UI.show(ac.to, 'gameover'); }
      } });
    });
    if (b) out.push({ x: b.x, y: b.y, w: b.w, h: b.h, onTap: function () { beep(330, 0.05, 'sine', 0.08); UI.show('title'); } });
    return out;
  }
});

// ---------- 通用:页面标题 + 返回按钮底座 ----------
function screenBg() {
  ctx.fillStyle = '#0a0118'; ctx.fillRect(0, 0, W, H);
  var a1 = ctx.createRadialGradient(W * 0.5, H * 0.2, 0, W * 0.5, H * 0.2, W * 0.9);
  a1.addColorStop(0, 'rgba(43,11,88,0.6)'); a1.addColorStop(1, 'rgba(43,11,88,0)');
  ctx.fillStyle = a1; ctx.fillRect(0, 0, W, H);
}
function screenTitle(t) {
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  UI.gradText(ctx, t, W / 2, safe.top + 56, W * 0.5, '#5fe0ff', '#ff5fd0', '800 ' + Math.round(W * 0.08) + 'px sans-serif');
}

// ---------- 11) 屏幕:商店(金币购买道具)----------
UI.register('shop', {
  onShow: function (arg) { music.stop(); this._back = (arg === 'gameover') ? 'gameover' : 'title'; },
  draw: function (ctx, dt, env) {
    screenBg(); coinsChip(); diamondChip(); screenTitle('商店');
    var bx = (W - Math.min(330, W * 0.86)) / 2, bw = Math.min(330, W * 0.86);
    var y = safe.top + 100, rh = 78, rgap = 12;
    this._buys = [];
    ctx.textBaseline = 'middle';
    for (var i = 0; i < ITEM_LIST.length; i++) {
      var id = ITEM_LIST[i], it = ITEMS[id], own = getItem(id);
      ctx.fillStyle = 'rgba(255,255,255,0.04)'; UI.rr(ctx, bx, y, bw, rh, 14); ctx.fill();
      ctx.strokeStyle = 'rgba(150,90,255,0.18)'; ctx.lineWidth = 1; UI.rr(ctx, bx, y, bw, rh, 14); ctx.stroke();
      bombGlyph(bx + 14, y + (rh - 40) / 2, 40, it.rows, it.tone);
      ctx.textAlign = 'left';
      ctx.fillStyle = '#fff'; ctx.font = '800 16px sans-serif'; ctx.fillText(it.name, bx + 66, y + 22);
      ctx.fillStyle = '#9b86c9'; ctx.font = '500 11px sans-serif'; ctx.fillText(it.desc, bx + 66, y + 42);
      ctx.fillStyle = '#8f7cbf'; ctx.font = '600 11px sans-serif'; ctx.fillText('已拥有 ' + own, bx + 66, y + 60);
      var afford = getCoins() >= it.cost, btw = 78, bth = 36, btx = bx + bw - btw - 12, bty = y + (rh - bth) / 2;
      if (afford) fillBtn(btx, bty, btw, bth, 12, '#ffd86a', '#ffb02e', it.cost + ' 金币', 13, '#3a2400');
      else ghostBtn(btx, bty, btw, bth, 12, it.cost + ' 金币', 13);
      this._buys.push({ x: btx, y: bty, w: btw, h: bth, id: id, cost: it.cost, afford: afford });
      y += rh + rgap;
    }
    ctx.textAlign = 'center';
    ctx.fillStyle = '#8f7cbf'; ctx.font = '500 11px sans-serif';
    ctx.fillText('每 5 关送 1 金币 · 局内点道具炸开下方;不够就充值', W / 2, y + 6);
    var rcw = Math.min(330, W * 0.86), rcx = (W - rcw) / 2, rcy = y + 24;
    fillBtn(rcx, rcy, rcw, 48, 14, '#7b5fff', '#b65fff', '充 值', 16, '#150726');
    this._topup = { x: rcx, y: rcy, w: rcw, h: 48 };
    ghostBtn(rcx, rcy + 60, rcw, 44, 14, '返 回', 15);
    this._backBtn = { x: rcx, y: rcy + 60, w: rcw, h: 44 };
  },
  buttons: function () {
    var self = this, out = [];
    (this._buys || []).forEach(function (b) {
      out.push({ x: b.x, y: b.y, w: b.w, h: b.h, onTap: function () {
        if (!b.afford) return;
        if (spendCoins(b.cost)) { addItem(b.id, 1); beep(880, 0.08, 'triangle', 0.08); beep(1320, 0.07, 'sine', 0.05); }
      } });
    });
    if (this._topup) out.push({ x: this._topup.x, y: this._topup.y, w: this._topup.w, h: this._topup.h, onTap: function () { beep(520, 0.05, 'sine', 0.07); UI.show('recharge', self._back); } });
    if (this._backBtn) out.push({ x: this._backBtn.x, y: this._backBtn.y, w: this._backBtn.w, h: this._backBtn.h, onTap: function () { beep(330, 0.05, 'sine', 0.08); UI.show(self._back); } });
    return out;
  }
});

// ---------- 12) 屏幕:充值(钻石礼包 + 钻石兑金币)----------
var RECHARGE_PACKS = [
  { rmb: 1,   dia: 10 },
  { rmb: 6,   dia: 66 },
  { rmb: 30,  dia: 340 },
  { rmb: 68,  dia: 800 },
  { rmb: 128, dia: 1580 }
];
UI.register('recharge', {
  onShow: function (arg) { music.stop(); this._back = (arg === 'gameover') ? 'gameover' : 'title'; },
  draw: function (ctx, dt, env) {
    screenBg(); coinsChip(); diamondChip(); screenTitle('充值');
    var bw = Math.min(330, W * 0.86), bx = (W - bw) / 2, y = safe.top + 100;
    this._packs = [];
    if (P.canPay()) {
      var pgap = 10, pw = (bw - pgap) / 2, ph = 56;
      ctx.textBaseline = 'middle';
      for (var i = 0; i < RECHARGE_PACKS.length; i++) {
        var p = RECHARGE_PACKS[i], col = i % 2, rowi = (i / 2) | 0;
        var px = bx + col * (pw + pgap), py = y + rowi * (ph + pgap);
        ctx.fillStyle = 'rgba(95,224,255,0.08)'; UI.rr(ctx, px, py, pw, ph, 12); ctx.fill();
        ctx.strokeStyle = 'rgba(95,224,255,0.3)'; ctx.lineWidth = 1; UI.rr(ctx, px, py, pw, ph, 12); ctx.stroke();
        ctx.textAlign = 'left';
        ctx.fillStyle = '#5fe0ff'; ctx.font = '800 18px sans-serif'; ctx.fillText(p.dia + ' 钻', px + 14, py + 20);
        ctx.fillStyle = '#fff'; ctx.font = '700 14px sans-serif'; ctx.fillText('¥' + p.rmb, px + 14, py + 40);
        this._packs.push({ x: px, y: py, w: pw, h: ph, pack: p });
      }
      var rows = Math.ceil(RECHARGE_PACKS.length / 2);
      y += rows * (ph + pgap) + 6;
      // 钻石兑金币
      var canEx = getDiamonds() >= 10;
      ctx.textAlign = 'center'; ctx.fillStyle = '#d9c8ff'; ctx.font = '600 13px sans-serif';
      ctx.fillText('10 钻石 → 100 金币', W / 2, y + 6);
      var exw = bw, exx = bx, exy = y + 22;
      if (canEx) fillBtn(exx, exy, exw, 46, 14, '#3ad07a', '#1fa85e', '兑 换', 15, '#04220f');
      else ghostBtn(exx, exy, exw, 46, 14, '钻石不足(需 10)', 14);
      this._ex = { x: exx, y: exy, w: exw, h: 46, can: canEx };
      y = exy + 46;
    } else {
      ctx.textAlign = 'center'; ctx.fillStyle = '#9b86c9'; ctx.font = '600 15px sans-serif';
      ctx.fillText('当前设备暂不支持充值', W / 2, y + 40);
      this._ex = null;
      y = y + 80;
    }
    ghostBtn(bx, y + 18, bw, 44, 14, '返 回', 15);
    this._backBtn = { x: bx, y: y + 18, w: bw, h: 44 };
  },
  buttons: function () {
    var self = this, out = [];
    (this._packs || []).forEach(function (b) {
      out.push({ x: b.x, y: b.y, w: b.w, h: b.h, onTap: function () {
        beep(700, 0.06, 'triangle', 0.07);
        P.purchase({ rmb: b.pack.rmb }, function () { addDiamonds(b.pack.dia); beep(880, 0.1, 'triangle', 0.09); beep(1320, 0.08, 'sine', 0.05); }, function () {});
      } });
    });
    if (this._ex && this._ex.can) out.push({ x: this._ex.x, y: this._ex.y, w: this._ex.w, h: this._ex.h, onTap: function () {
      if (getDiamonds() >= 10 && spendDiamonds(10)) { addCoins(100); beep(700, 0.07, 'triangle', 0.07); }
    } });
    if (this._backBtn) out.push({ x: this._backBtn.x, y: this._backBtn.y, w: this._backBtn.w, h: this._backBtn.h, onTap: function () { beep(330, 0.05, 'sine', 0.08); UI.show('shop', self._back); } });
    return out;
  }
});

// ---------- 13) 屏幕:玩法说明 ----------
UI.register('rules', {
  onShow: function (arg) { music.stop(); this._back = arg || 'title'; },
  draw: function (ctx, dt, env) {
    screenBg(); screenTitle('玩法');
    var bx = (W - Math.min(340, W * 0.88)) / 2, bw = Math.min(340, W * 0.88), y = safe.top + 102;
    var lines = [
      '轻点 = 旋转(切换 3 个颜色)',
      '左右拖 = 移动(逐格,贴手)',
      '向下滑 = 直接落地',
      '同色连成 3+(横/竖/斜)即消除,连锁更高分',
      '橙红闪烁 = 干扰块,从顶部随机砸下',
      '消够目标即过关:提速、奖励金币',
      '每 5 关送金币 · 爆顶可金币复活',
      '金币去商店买炸弹,局内点一下炸掉下方几行'
    ];
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    for (var i = 0; i < lines.length; i++) {
      var ly = y + i * 36;
      ctx.fillStyle = '#7b5fff'; ctx.beginPath(); ctx.arc(bx + 6, ly, 3, 0, 7); ctx.fill();
      ctx.fillStyle = '#d9c8ff'; ctx.font = '500 14px sans-serif'; ctx.fillText(lines[i], bx + 18, ly);
    }
    var by = y + lines.length * 36 + 14;
    fillBtn(bx, by, bw, 50, 16, '#27c2ff', '#ff3df0', '知 道 了', 17);
    this._ok = { x: bx, y: by, w: bw, h: 50 };
  },
  buttons: function () {
    var self = this, out = [];
    if (this._ok) out.push({ x: this._ok.x, y: this._ok.y, w: this._ok.w, h: this._ok.h, onTap: function () { beep(330, 0.05, 'sine', 0.08); UI.show(self._back); } });
    return out;
  }
});

// ---------- 14) 屏幕:设置 ----------
UI.register('settings', {
  onShow: function (arg) { this._back = arg || 'title'; },
  draw: function (ctx, dt, env) {
    screenBg(); screenTitle('设置');
    var bw = Math.min(340, W * 0.88), bx = (W - bw) / 2, y = safe.top + 102, rh = 50, rgap = 12;
    function toggleRow(label, on) {
      ctx.fillStyle = 'rgba(255,255,255,0.04)'; UI.rr(ctx, bx, y, bw, rh, 12); ctx.fill();
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#d9c8ff'; ctx.font = '700 15px sans-serif'; ctx.fillText(label, bx + 16, y + rh / 2);
      var sw = 52, sh = 28, sx = bx + bw - sw - 14, sy = y + (rh - sh) / 2;
      ctx.fillStyle = on ? '#3ad07a' : 'rgba(255,255,255,0.14)'; UI.rr(ctx, sx, sy, sw, sh, sh / 2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(on ? sx + sw - sh / 2 : sx + sh / 2, sy + sh / 2, sh / 2 - 3, 0, 7); ctx.fill();
    }
    toggleRow('音效', soundOn); this._sound = { x: bx, y: y, w: bw, h: rh }; y += rh + rgap;
    toggleRow('背景音乐', musicOn); this._music = { x: bx, y: y, w: bw, h: rh }; y += rh + rgap;
    // 曲目选择
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#8f7cbf'; ctx.font = '600 12px sans-serif'; ctx.fillText('背景曲目', bx + 2, y + 4); y += 16;
    var names = music.trackNames(), cur = music.getTrack(), tgap = 8, tw = (bw - tgap * 3) / 4, th = 40;
    this._tracks = [];
    ctx.textAlign = 'center';
    for (var i = 0; i < names.length; i++) {
      var tx = bx + i * (tw + tgap), on = (i === cur);
      ctx.fillStyle = on ? 'rgba(95,224,255,0.16)' : 'rgba(255,255,255,0.04)'; UI.rr(ctx, tx, y, tw, th, 11); ctx.fill();
      ctx.strokeStyle = on ? '#5fe0ff' : 'rgba(150,90,255,0.2)'; ctx.lineWidth = on ? 2 : 1; UI.rr(ctx, tx, y, tw, th, 11); ctx.stroke();
      ctx.fillStyle = on ? '#fff' : '#b9a6e0'; ctx.font = '700 14px sans-serif'; ctx.fillText(names[i], tx + tw / 2, y + th / 2 + 1);
      this._tracks.push({ x: tx, y: y, w: tw, h: th, i: i });
    }
    y += th + rgap;
    // 玩法说明入口
    ctx.fillStyle = 'rgba(255,255,255,0.04)'; UI.rr(ctx, bx, y, bw, rh, 12); ctx.fill();
    ctx.textAlign = 'left'; ctx.fillStyle = '#d9c8ff'; ctx.font = '700 15px sans-serif'; ctx.fillText('玩法说明', bx + 16, y + rh / 2);
    ctx.textAlign = 'right'; ctx.fillStyle = '#8f7cbf'; ctx.font = '700 18px sans-serif'; ctx.fillText('›', bx + bw - 16, y + rh / 2);
    this._rules = { x: bx, y: y, w: bw, h: rh }; y += rh + rgap;
    ghostBtn(bx, y + 6, bw, 44, 14, '返 回', 15);
    this._backBtn = { x: bx, y: y + 6, w: bw, h: 44 };
  },
  buttons: function () {
    var self = this, out = [];
    if (this._sound) out.push({ x: this._sound.x, y: this._sound.y, w: this._sound.w, h: this._sound.h, onTap: function () { setSound(!soundOn); beep(660, 0.05, 'sine', 0.1); } });
    if (this._music) out.push({ x: this._music.x, y: this._music.y, w: this._music.w, h: this._music.h, onTap: function () { setMusicOn(!musicOn); beep(620, 0.05, 'triangle', 0.06); } });
    (this._tracks || []).forEach(function (t) {
      out.push({ x: t.x, y: t.y, w: t.w, h: t.h, onTap: function () {
        music.setTrack(t.i); P.store.set('plox_music_track', t.i); beep(700, 0.05, 'triangle', 0.06);
        if (musicOn) { music.stop(); music.start(); }
      } });
    });
    if (this._rules) out.push({ x: this._rules.x, y: this._rules.y, w: this._rules.w, h: this._rules.h, onTap: function () { beep(520, 0.05, 'sine', 0.07); UI.show('rules', 'settings'); } });
    if (this._backBtn) out.push({ x: this._backBtn.x, y: this._backBtn.y, w: this._backBtn.w, h: this._backBtn.h, onTap: function () { beep(330, 0.05, 'sine', 0.08); UI.show(self._back); } });
    return out;
  }
});

// ---------- 15) 屏幕:排行榜(抖音云)----------
var MEDAL = ['#ffd86a', '#cfd6e6', '#e3a36b'];
UI.register('leaderboard', {
  onShow: function (arg) {
    music.stop();
    this._back = arg || 'title';
    this._tab = lastDiff; this._rows = null;
    this._load();
  },
  _load: function () {
    var self = this, tab = this._tab;
    this._rows = null;
    LB.top(tab).then(function (rows) { if (self._tab === tab) self._rows = rows || []; });
  },
  draw: function (ctx, dt, env) {
    screenBg(); screenTitle('排行榜');
    var bw = Math.min(340, W * 0.88), bx = (W - bw) / 2, y = safe.top + 100;
    // 难度标签
    var tgap = 8, tw = (bw - tgap * 2) / 3, th = 38;
    this._tabs = [];
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (var i = 0; i < DIFF_KEYS.length; i++) {
      var d = DIFF_KEYS[i], tx = bx + i * (tw + tgap), on = (d === this._tab);
      ctx.fillStyle = on ? 'rgba(95,224,255,0.16)' : 'rgba(255,255,255,0.04)'; UI.rr(ctx, tx, y, tw, th, 11); ctx.fill();
      ctx.strokeStyle = on ? '#5fe0ff' : 'rgba(150,90,255,0.2)'; ctx.lineWidth = on ? 2 : 1; UI.rr(ctx, tx, y, tw, th, 11); ctx.stroke();
      ctx.fillStyle = on ? '#fff' : '#b9a6e0'; ctx.font = '700 14px sans-serif'; ctx.fillText(DIFF_LABEL[d], tx + tw / 2, y + th / 2 + 1);
      this._tabs.push({ x: tx, y: y, w: tw, h: th, d: d });
    }
    y += th + 16;
    if (this._rows === null) {
      ctx.fillStyle = '#9b86c9'; ctx.font = '600 14px sans-serif'; ctx.fillText('加载中…', W / 2, y + 40);
    } else if (this._rows.length === 0) {
      ctx.fillStyle = '#9b86c9'; ctx.font = '600 14px sans-serif'; ctx.fillText('暂无记录,快来抢第一!', W / 2, y + 40);
    } else {
      var rh = 42, maxN = Math.min(this._rows.length, 10);
      ctx.textBaseline = 'middle';
      for (var k = 0; k < maxN; k++) {
        var e = this._rows[k], ry = y + k * rh;
        ctx.fillStyle = (k % 2 === 0) ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.015)';
        UI.rr(ctx, bx, ry, bw, rh - 4, 10); ctx.fill();
        ctx.textAlign = 'center';
        if (k < 3) { ctx.fillStyle = MEDAL[k]; ctx.font = '900 18px sans-serif'; }
        else { ctx.fillStyle = '#8f7cbf'; ctx.font = '700 15px sans-serif'; }
        ctx.fillText(String(k + 1), bx + 22, ry + (rh - 4) / 2);
        ctx.textAlign = 'left'; ctx.fillStyle = '#e8def8'; ctx.font = '700 15px sans-serif';
        ctx.fillText(String(e.name || '玩家'), bx + 44, ry + (rh - 4) / 2);
        ctx.textAlign = 'right'; ctx.fillStyle = '#ffd86a'; ctx.font = '800 15px sans-serif';
        ctx.fillText(String(e.score | 0), bx + bw - 14, ry + (rh - 4) / 2);
      }
      y += maxN * rh;
    }
    var byy = Math.max(y + 24, safe.top + 100 + th + 16 + 60);
    ghostBtn(bx, byy, bw, 44, 14, '返 回', 15);
    this._backBtn = { x: bx, y: byy, w: bw, h: 44 };
  },
  buttons: function () {
    var self = this, out = [];
    (this._tabs || []).forEach(function (t) {
      out.push({ x: t.x, y: t.y, w: t.w, h: t.h, onTap: function () {
        if (self._tab !== t.d) { beep(500, 0.05, 'sine', 0.07); self._tab = t.d; self._load(); }
      } });
    });
    if (this._backBtn) out.push({ x: this._backBtn.x, y: this._backBtn.y, w: this._backBtn.w, h: this._backBtn.h, onTap: function () { beep(330, 0.05, 'sine', 0.08); UI.show(self._back); } });
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
