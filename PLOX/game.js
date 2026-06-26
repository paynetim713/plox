// ============================================================
// PLOX · 抖音小游戏入口  (引擎:其他/Other,appid tt806df6d01e09fd4d02)
// 这是「移植骨架 + 最小可跑闭环」:验证 画布渲染 / 触摸命中 / 音频 / 屏幕切换 通了,
// 再把网页版的棋盘逻辑与各界面逐屏画到 canvas 上。
// 网页版能直接复用的:游戏主循环、棋盘/方块/下一个的 canvas 绘制、消除/连击/关卡/道具/计分逻辑。
// 必须重写的:所有界面(原来用 HTML/DOM)→ 画在 canvas 上 + 手动命中。
// ============================================================
var P = require('./js/platform-tt.js');
var UI = require('./js/uikit.js');
var Engine = require('./js/engine.js');

// ---------- 1) 屏上画布(首个 createCanvas() = 唯一屏上画布)----------
var canvas = tt.createCanvas();
var ctx = canvas.getContext('2d');
var info = P.sysInfo();
var dpr = info.pixelRatio || 1;
var W = info.windowWidth, H = info.windowHeight;
var safe = info.safeArea || { top: 0, bottom: H, left: 0, right: W };
canvas.width = W * dpr; canvas.height = H * dpr;
ctx.setTransform(dpr, 0, 0, dpr, 0, 0);   // 逻辑像素绘制 → 触摸坐标 1:1,不会偏

// ---------- 2) 音频(WebAudio 兼容,首次触摸后才出声;切前台 resume,切后台停)----------
var soundOn = true;
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
tt.onHide(function () { /* 接入主体后:在此 stopMusic() */ });

// ---------- 引擎实例 + 进入游戏 ----------
var lastDiff = 'normal';
var eng = Engine({
  beep: beep,
  onGameOver: function () { UI.show('gameover'); },
  onStageUp: function (level) { /* 关卡提升:经济/金币不在本移植内 */ }
});
function startGame(diff) { lastDiff = diff || 'normal'; eng.reset(lastDiff); UI.show('play'); }

// ---------- 3) 触摸 → 命中判定(替代 DOM 事件 + overlay)----------
//  抬手用 changedTouches(touches 在 touchend 为空);首次触摸激活音频。
var audioPrimed = false;
tt.onTouchStart(function (e) { if (!audioPrimed) { audioPrimed = true; P.audioResume(); } });
tt.onTouchEnd(function (e) {
  if (e.touches && e.touches.length > 0) return;     // 还有手指按着
  var t = e.changedTouches && e.changedTouches[0]; if (!t) return;
  UI.tap(t.clientX, t.clientY);
});
// (游戏主体接入后,这里再加 onTouchStart/onTouchMove 处理棋盘手势:轻点旋转 / 左右拖移动 / 下滑落地)

// ---------- 4) 屏幕:标题页 ----------
UI.register('title', {
  draw: function (ctx, dt, env) {
    ctx.fillStyle = '#0c0220'; ctx.fillRect(0, 0, W, H);
    // 极光氛围
    var a1 = ctx.createRadialGradient(W * 0.2, H * 0.1, 0, W * 0.2, H * 0.1, W * 0.8);
    a1.addColorStop(0, 'rgba(43,11,88,0.8)'); a1.addColorStop(1, 'rgba(43,11,88,0)');
    ctx.fillStyle = a1; ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    // 品牌
    UI.gradText(ctx, 'PLOX', W / 2, safe.top + H * 0.28, W * 0.6, '#5fe0ff', '#ff5fd0', '800 ' + Math.round(W * 0.16) + 'px sans-serif');
    ctx.fillStyle = '#9b86c9'; ctx.font = '600 ' + Math.round(W * 0.034) + 'px sans-serif';
    ctx.fillText('霓 虹 消 除', W / 2, safe.top + H * 0.28 + W * 0.11);
    // 开始按钮
    var bw = Math.min(300, W * 0.72), bh = 58, bx = (W - bw) / 2, by = H * 0.55;
    var cg = ctx.createLinearGradient(bx, 0, bx + bw, 0); cg.addColorStop(0, '#27c2ff'); cg.addColorStop(1, '#ff3df0');
    ctx.fillStyle = cg; UI.rr(ctx, bx, by, bw, bh, 18); ctx.fill();
    ctx.fillStyle = '#0c0220'; ctx.font = '800 21px sans-serif'; ctx.fillText('开 始', W / 2, by + bh / 2);
    this._start = { x: bx, y: by, w: bw, h: bh };
    // 骨架状态提示(接入主体后删)
    ctx.fillStyle = '#6d5f95'; ctx.font = '500 13px sans-serif';
    ctx.fillText('抖音小游戏移植骨架已就位', W / 2, H * 0.72);
    ctx.fillText('点「开始」验证 渲染/触摸/音频', W / 2, H * 0.72 + 22);
    ctx.fillText(P.isIOS() ? 'iOS:充值入口将隐藏(仅广告变现)' : '', W / 2, H * 0.72 + 44);
  },
  buttons: function () {
    var s = this._start;
    return s ? [{ x: s.x, y: s.y, w: s.w, h: s.h, onTap: function () { beep(660, 0.08, 'sine', 0.12); beep(990, 0.06, 'triangle', 0.06); startGame('normal'); } }] : [];
  }
});

// ---------- 屏幕:游戏页(棋盘主体)----------
// 棋盘布局在 play 屏内算好,传给 eng.draw;tick 也由本屏的 draw 驱动(dt 来自 uikit)。
function boardLayout() {
  var cell = Math.floor(Math.min((W - 24) / 7, (H - safe.top - 150) / 14));
  var bw = cell * 7, bh = cell * 14, ox = Math.floor((W - bw) / 2), oy = safe.top + 92;
  return { cell: cell, bw: bw, bh: bh, ox: ox, oy: oy };
}
UI.register('play', {
  draw: function (ctx, dt, env) {
    var lay = boardLayout();
    // 背景
    ctx.fillStyle = '#0a0118'; ctx.fillRect(0, 0, W, H);
    // 顶部 HUD 行(屏幕坐标系):分数 / 关卡 / 消除 + 目标
    var g = eng.goalInfo();
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#9b86c9'; ctx.font = '600 12px sans-serif';
    ctx.fillText('分数', lay.ox, safe.top + 30);
    ctx.fillText('关卡', lay.ox + lay.bw * 0.38, safe.top + 30);
    ctx.fillText('消除', lay.ox + lay.bw * 0.70, safe.top + 30);
    ctx.fillStyle = '#fff'; ctx.font = '800 20px sans-serif';
    ctx.fillText(String(eng.score()), lay.ox, safe.top + 54);
    ctx.fillText(String(eng.level()), lay.ox + lay.bw * 0.38, safe.top + 54);
    ctx.fillText(String(eng.cleared()), lay.ox + lay.bw * 0.70, safe.top + 54);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#ffd86a'; ctx.font = '700 13px sans-serif';
    ctx.fillText(g.have + '/' + g.need, lay.ox + lay.bw, safe.top + 78);
    ctx.textAlign = 'left';
    // 驱动逻辑 + 棋盘绘制
    eng.tick(dt);
    eng.draw(ctx, { cell: lay.cell, ox: lay.ox, oy: lay.oy });
  }
});

// ---------- 屏幕:结算页 ----------
UI.register('gameover', {
  draw: function (ctx, dt, env) {
    ctx.fillStyle = '#0a0118'; ctx.fillRect(0, 0, W, H);
    var a1 = ctx.createRadialGradient(W * 0.5, H * 0.32, 0, W * 0.5, H * 0.32, W * 0.8);
    a1.addColorStop(0, 'rgba(43,11,88,0.7)'); a1.addColorStop(1, 'rgba(43,11,88,0)');
    ctx.fillStyle = a1; ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ff7ad8'; ctx.font = '800 ' + Math.round(W * 0.1) + 'px sans-serif';
    ctx.fillText('结 束', W / 2, safe.top + H * 0.22);
    ctx.fillStyle = '#9b86c9'; ctx.font = '600 14px sans-serif';
    ctx.fillText('本局得分', W / 2, safe.top + H * 0.32);
    ctx.fillStyle = '#fff'; ctx.font = '900 ' + Math.round(W * 0.12) + 'px sans-serif';
    ctx.fillText(String(eng.score()), W / 2, safe.top + H * 0.39);
    ctx.fillStyle = '#d9c8ff'; ctx.font = '600 15px sans-serif';
    ctx.fillText('关卡 ' + eng.level(), W / 2, safe.top + H * 0.46);
    // 再来一局
    var bw = Math.min(300, W * 0.72), bh = 56, bx = (W - bw) / 2, by = H * 0.58;
    var cg = ctx.createLinearGradient(bx, 0, bx + bw, 0); cg.addColorStop(0, '#27c2ff'); cg.addColorStop(1, '#ff3df0');
    ctx.fillStyle = cg; UI.rr(ctx, bx, by, bw, bh, 18); ctx.fill();
    ctx.fillStyle = '#0c0220'; ctx.font = '800 20px sans-serif'; ctx.fillText('再 来 一 局', W / 2, by + bh / 2 + 1);
    this._again = { x: bx, y: by, w: bw, h: bh };
    // 返回
    var rbw = Math.min(300, W * 0.72), rbh = 48, rbx = (W - rbw) / 2, rby = by + bh + 16;
    ctx.strokeStyle = 'rgba(150,90,255,0.45)'; ctx.lineWidth = 1.5; UI.rr(ctx, rbx, rby, rbw, rbh, 16); ctx.stroke();
    ctx.fillStyle = '#b9a6e0'; ctx.font = '700 16px sans-serif'; ctx.fillText('返 回', W / 2, rby + rbh / 2 + 1);
    this._back = { x: rbx, y: rby, w: rbw, h: rbh };
  },
  buttons: function () {
    var a = this._again, b = this._back, out = [];
    if (a) out.push({ x: a.x, y: a.y, w: a.w, h: a.h, onTap: function () { beep(660, 0.08, 'sine', 0.12); startGame(lastDiff); } });
    if (b) out.push({ x: b.x, y: b.y, w: b.w, h: b.h, onTap: function () { beep(330, 0.05, 'sine', 0.08); UI.show('title'); } });
    return out;
  }
});

// ---------- 棋盘手势(全局注册一次,仅在 play 屏生效)----------
// 忠实移植 main.js 手势模型:轴锁 1.5、按起点累计逐格移动、下滑=hardDrop(220ms 去抖)、轻点=旋转、多指中止。
var tS = null, lastHardT = 0;
tt.onTouchStart(function (e) {
  if (UI.name() !== 'play') return;
  var ts = e.touches || [];
  if (ts.length > 1) { tS = null; return; }
  var t = ts[0]; if (!t) return;
  tS = { x: t.clientX, y: t.clientY, steps: 0, axis: null, moved: false };
});
tt.onTouchMove(function (e) {
  if (UI.name() !== 'play') return;
  if (!tS || eng.state() !== 'playing') return;
  var ts = e.touches || [];
  if (ts.length > 1) return;
  var t = ts[0]; if (!t) return;
  var cell = boardLayout().cell;
  var dx = t.clientX - tS.x, dy = t.clientY - tS.y, adx = Math.abs(dx), ady = Math.abs(dy);
  if (!tS.axis && (adx > cell * 0.4 || ady > cell * 0.4))
    tS.axis = (ady > adx * 1.5) ? 'v' : 'h';
  if (tS.axis === 'h') {
    var want = Math.round(dx / cell);
    while (tS.steps < want) { eng.move(1); tS.steps++; tS.moved = true; }
    while (tS.steps > want) { eng.move(-1); tS.steps--; tS.moved = true; }
  }
});
tt.onTouchEnd(function (e) {
  if (UI.name() !== 'play') return;
  var ts = e.touches || [];
  if (ts.length > 0) { tS = null; return; }
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

// ---------- 5) 主循环 ----------
var last = 0;
function frame(t) {
  var dt = Math.min(50, t - (last || t)); last = t;
  ctx.clearRect(0, 0, W, H);
  UI.draw(ctx, dt, { W: W, H: H, safe: safe });
  requestAnimationFrame(frame);
}

// ---------- 启动 ----------
// P.initAd('你的激励视频广告位ID');   // 后台开通流量主后填入,复活看广告用
UI.show('title');
requestAnimationFrame(frame);
