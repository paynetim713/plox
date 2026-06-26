// ============================================================
// PLOX · 抖音小游戏入口  (引擎:其他/Other,appid tt806df6d01e09fd4d02)
// 这是「移植骨架 + 最小可跑闭环」:验证 画布渲染 / 触摸命中 / 音频 / 屏幕切换 通了,
// 再把网页版的棋盘逻辑与各界面逐屏画到 canvas 上。
// 网页版能直接复用的:游戏主循环、棋盘/方块/下一个的 canvas 绘制、消除/连击/关卡/道具/计分逻辑。
// 必须重写的:所有界面(原来用 HTML/DOM)→ 画在 canvas 上 + 手动命中。
// ============================================================
var P = require('./js/platform-tt.js');
var UI = require('./js/uikit.js');

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
    return s ? [{ x: s.x, y: s.y, w: s.w, h: s.h, onTap: function () { beep(660, 0.08, 'sine', 0.12); beep(990, 0.06, 'triangle', 0.06); UI.show('play'); } }] : [];
  }
});

// ---------- 屏幕:游戏页(占位 —— 棋盘主体接入处)----------
UI.register('play', {
  draw: function (ctx, dt, env) {
    ctx.fillStyle = '#0a0118'; ctx.fillRect(0, 0, W, H);
    // 画一个 7×14 棋盘网格占位,确认坐标/安全区/retina 对得上
    var COLS = 7, ROWS = 14;
    var cell = Math.floor(Math.min((W - 24) / COLS, (H - safe.top - 120) / ROWS));
    var bw = cell * COLS, bh = cell * ROWS, ox = (W - bw) / 2, oy = safe.top + 70;
    ctx.fillStyle = 'rgba(18,4,40,0.9)'; UI.rr(ctx, ox - 4, oy - 4, bw + 8, bh + 8, 14); ctx.fill();
    ctx.strokeStyle = 'rgba(150,90,255,0.14)'; ctx.lineWidth = 1;
    for (var c = 0; c <= COLS; c++) { ctx.beginPath(); ctx.moveTo(ox + c * cell, oy); ctx.lineTo(ox + c * cell, oy + bh); ctx.stroke(); }
    for (var r = 0; r <= ROWS; r++) { ctx.beginPath(); ctx.moveTo(ox, oy + r * cell); ctx.lineTo(ox + bw, oy + r * cell); ctx.stroke(); }
    ctx.fillStyle = '#9b86c9'; ctx.textAlign = 'center'; ctx.font = '600 15px sans-serif';
    ctx.fillText('棋盘主体移植中 · 点任意处返回', W / 2, oy + bh + 40);
  },
  onTap: function () { beep(330, 0.05, 'sine', 0.08); UI.show('title'); }
});

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
