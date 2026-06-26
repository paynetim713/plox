// ============================================================
// 极简 canvas UI 框架 —— 替代 DOM/CSS/innerHTML。
// 每个「屏」= { draw(ctx,dt,env), buttons()? , onShow(arg)? , onTap(x,y)? }。
// buttons() 返回 [{x,y,w,h,onTap}],抬手时做点-在-矩形内命中。
// 全部用逻辑像素(与触摸 clientX/clientY 同一坐标系)。
// ============================================================

var screens = {}, active = null, activeName = '';

function register(name, s) { screens[name] = s; }
function show(name, arg) { active = screens[name] || null; activeName = name; if (active && active.onShow) active.onShow(arg); }
function name() { return activeName; }
function draw(ctx, dt, env) { if (active && active.draw) active.draw(ctx, dt, env); }

function tap(x, y) {
  if (!active) return false;
  var btns = active.buttons ? active.buttons() : null;
  if (btns) { for (var i = 0; i < btns.length; i++) { var b = btns[i];
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) { if (b.onTap) b.onTap(); return true; } } }
  if (active.onTap) { active.onTap(x, y); return true; }
  return false;
}

// ---------- 绘制工具 ----------
function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
// 渐变文字(霓虹品牌字常用)
function gradText(ctx, text, x, y, w, c0, c1, font) {
  var g = ctx.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
  g.addColorStop(0, c0); g.addColorStop(1, c1);
  ctx.font = font; ctx.fillStyle = g; ctx.fillText(text, x, y);
}

module.exports = { register: register, show: show, name: name, draw: draw, tap: tap, rr: rr, gradText: gradText };
