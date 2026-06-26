// ============================================================
// PLOX 引擎(抖音小游戏 · CommonJS)—— 从网页版 main.js 忠实移植,
// 只剥离 DOM/BOM,逻辑与数值保持一致。无 ES 模块、无 DOM、无 emoji。
//   deps = { beep(freq,dur,type,vol), onGameOver(), onStageUp(level) }
//   draw(ctx, lay) 其中 lay = {cell, ox, oy};内部以 c*CELL/r*CELL 绘制,
//   靠 ctx.translate(lay.ox,lay.oy) 把整块画到棋盘位置。
// ============================================================

// ---------- 配置常量(内联自 config.js)----------
var COLS = 7, ROWS = 14;
var COLORS = [
  { fill: "#e25fb2", glow: "#f3acd8" }, // 粉
  { fill: "#d8ad55", glow: "#ecd6a4" }, // 黄
  { fill: "#5cb35a", glow: "#a8dba6" }, // 绿
  { fill: "#5a86d8", glow: "#aec2f0" }, // 蓝
  { fill: "#d9513a", glow: "#ec9a8a" }, // 红
  { fill: "#9b73d0", glow: "#c9b4ec" }  // 紫(备用第6色)
];
function shade(hex, amt) {
  var n = parseInt(hex.slice(1), 16), R = (n >> 16) & 255, G = (n >> 8) & 255, B = n & 255;
  var f = function (t) { return amt >= 0 ? Math.round(t + (255 - t) * amt) : Math.round(t * (1 + amt)); };
  return "rgb(" + f(R) + "," + f(G) + "," + f(B) + ")";
}
for (var _i = 0; _i < COLORS.length; _i++) {
  var _c = COLORS[_i];
  _c.top = shade(_c.fill, .16); _c.dark = shade(_c.fill, -.2); _c.edge = shade(_c.fill, -.34);
  _c.gfill = shade(_c.fill, -.52); _c.gedge = shade(_c.fill, -.66);
}

var FIXED_COLORS = 5;
var PIECE_LEN = 3;
var PLAYER_INTERVAL = 850;
var JUNK_FALL = 0.006;
var ROT_MS = 120;
var PRAISE = ["不错", "漂亮", "超棒", "惊艳", "神级"];
var PRAISE_COL = ["#eae0ff", "#9be3ff", "#ffd86a", "#ff9ad2", "#ff6a6a"];
var DIFFS = {
  easy:   { label: "简单", sub: "干扰少 · 慢",   junkMin: 9, junkMax: 13, baseInterval: 900, floorMin: 5, floorMax: 7 },
  normal: { label: "普通", sub: "干扰中 · 快",   junkMin: 6, junkMax: 8,  baseInterval: 780, floorMin: 3, floorMax: 5 },
  hard:   { label: "困难", sub: "干扰多 · 更快", junkMin: 4, junkMax: 5,  baseInterval: 660, floorMin: 2, floorMax: 3 }
};
var CLEAR_MS = 240;
var STAGE_BASE = 12;
var STAGE_INC = 9;
function stageGoal(stage) { return STAGE_BASE + (stage - 1) * STAGE_INC; }
function dropIntervalFor(baseInterval, stage) { return Math.max(260, baseInterval - (stage - 1) * 45); }

module.exports = function createEngine(deps) {
  deps = deps || {};
  var beep = deps.beep || function () {};
  var onGameOver = deps.onGameOver || function () {};
  var onStageUp = deps.onStageUp || function () {};

  // ---------- 状态 ----------
  var board, voff, vscale, vmode, current, next, state = "start", sub = "control";
  var score = 0, cleared = 0, level = 1, combo = 0, maxCombo = 0, stageStart = 0;
  var dropAccum = 0, dropInterval = 800, baseInterval = 720, colorCount = 5, pieceLen = 3, softDrop = false;
  var junkMin = 3, junkMax = 4, pieceUntilJunk = 4, justJunked = false;
  var fallingJunk = [];
  var junkWarn = [];
  var clearing = null, clearTimer = 0, flashPulse = 0;
  var revives = 0;
  var banner = null;
  var visRow = 0, visCol = 3, shakeT = 0, rotT = 0, freezeT = 0;
  var diffKey = "normal";
  var CELL = 44;
  var particles = [], popups = [];

  // ---------- 工具 ----------
  function rc() { return (Math.random() * colorCount) | 0; }
  function randInt(a, b) { return a + ((Math.random() * (b - a + 1)) | 0); }
  function inB(r, c) { return r >= 0 && r < ROWS && c >= 0 && c < COLS; }
  function newPiece() {
    return { colors: (function () { var a = []; for (var i = 0; i < pieceLen; i++) a.push(rc()); return a; })(),
             row: 0, col: (COLS / 2) | 0 };
  }
  function valid(row, col, colors) {
    for (var i = 0; i < colors.length; i++) {
      var r = row + i;
      if (col < 0 || col >= COLS || r >= ROWS) return false;
      if (r >= 0 && board[r][col] != null) return false;
    }
    return true;
  }

  // ---------- 流程 ----------
  function reset(diffKeyIn) {
    if (diffKeyIn && DIFFS[diffKeyIn]) diffKey = diffKeyIn;
    board = []; voff = []; vscale = []; vmode = [];
    for (var r = 0; r < ROWS; r++) {
      var brow = []; for (var c = 0; c < COLS; c++) brow.push(null); board.push(brow);
      voff.push(new Float32Array(COLS));
      var sa = new Float32Array(COLS); sa.fill(1); vscale.push(sa);
      vmode.push(new Uint8Array(COLS));
    }
    score = 0; cleared = 0; level = 1; combo = 0; maxCombo = 0; stageStart = 0;
    var D = DIFFS[diffKey];
    baseInterval = D.baseInterval || PLAYER_INTERVAL; colorCount = FIXED_COLORS; pieceLen = PIECE_LEN;
    junkMin = D.junkMin; junkMax = D.junkMax;
    pieceUntilJunk = Math.min(junkMax, randInt(4, 7)); justJunked = false;
    dropInterval = baseInterval; dropAccum = 0; softDrop = false; clearing = null; sub = "control"; revives = 0; banner = null;
    shakeT = 0; particles.length = 0; popups.length = 0; fallingJunk.length = 0;
    freezeT = 0; junkWarn.length = 0; clearTimer = 0; flashPulse = 0; rotT = 0;
    _gameOverFired = false;
    state = "playing";
    next = newPiece(); spawn();
  }
  function spawn() {
    current = next; next = newPiece();
    current.row = 0; current.col = (COLS / 2) | 0;
    visRow = 0; visCol = current.col; dropAccum = 0;
    if (!valid(current.row, current.col, current.colors)) { gameOver(); return; }
  }

  var _gameOverFired = false;
  function gameOver() {
    if (state !== "playing" && state !== "paused") return;
    if (_gameOverFired) return;
    _gameOverFired = true;
    state = "gameover"; softDrop = false; beep(140, .25, "sawtooth", .15);
    onGameOver();
  }

  function stepDown() { if (valid(current.row + 1, current.col, current.colors)) current.row++; else lockPiece(); }
  function lockPiece() {
    var lowR = 0;
    for (var i = 0; i < current.colors.length; i++) {
      var r = current.row + i;
      if (r >= 0 && r < ROWS) { board[r][current.col] = current.colors[i]; vscale[r][current.col] = 1.45; voff[r][current.col] = 0; lowR = Math.max(lowR, r); }
    }
    spawnParticles(current.col, lowR, current.colors[current.colors.length - 1], 5);
    shakeT = Math.max(shakeT, 38);
    beep(150, .05, "square", .07); beep(95, .08, "sine", .05);
    combo = 0; sub = "resolving"; beginResolve();
  }

  var DIRS = [[0, 1], [1, 0], [1, 1], [1, -1]];
  function findMatches() {
    var hit = {};
    for (var r = 0; r < ROWS; r++) for (var c = 0; c < COLS; c++) {
      var col = board[r][c]; if (col == null) continue;
      for (var d = 0; d < DIRS.length; d++) {
        var dr = DIRS[d][0], dc = DIRS[d][1];
        if (inB(r - dr, c - dc) && board[r - dr][c - dc] === col) continue;
        var len = 0, rr = r, cc = c;
        while (inB(rr, cc) && board[rr][cc] === col) { len++; rr += dr; cc += dc; }
        if (len >= 3) { rr = r; cc = c; for (var k = 0; k < len; k++) { hit[rr + "," + cc] = true; rr += dr; cc += dc; } }
      }
    }
    return hit;
  }
  function matchSize(m) { var n = 0; for (var k in m) if (m.hasOwnProperty(k)) n++; return n; }
  function gravity() {
    for (var c = 0; c < COLS; c++) {
      var w = ROWS - 1;
      for (var r = ROWS - 1; r >= 0; r--) {
        if (board[r][c] != null) {
          if (w !== r) {
            board[w][c] = board[r][c]; board[r][c] = null;
            voff[w][c] = (r - w) + voff[r][c]; vmode[w][c] = vmode[r][c]; vscale[w][c] = vscale[r][c];
            voff[r][c] = 0; vmode[r][c] = 0; vscale[r][c] = 1;
          }
          w--;
        }
      }
      for (var rr = w; rr >= 0; rr--) { board[rr][c] = null; voff[rr][c] = 0; vmode[rr][c] = 0; vscale[rr][c] = 1; }
    }
  }
  function beginResolve() {
    var m = findMatches();
    var msize = matchSize(m);
    if (msize === 0) { settle(); return; }
    combo++;
    if (combo > maxCombo) maxCombo = combo;
    var bonus = msize > 3 ? (msize - 3) * 15 : 0;
    var gained = msize * 10 * combo + bonus * combo;
    score += gained; cleared += msize;
    if (cleared - stageStart >= stageGoal(level)) {
      stageStart = cleared; level++;
      dropInterval = dropIntervalFor(baseInterval, level);
      if (level % 2 === 0) {
        var D = DIFFS[diffKey];
        junkMin = Math.max(D.floorMin, junkMin - 1); junkMax = Math.max(D.floorMax, junkMax - 1);
      }
      onStageUp(level);
      spawnStageBanner(level, 0);
    }
    clearing = m; clearTimer = CLEAR_MS; flashPulse = 0;
    shakeT = Math.min(220, 60 + msize * 14 + combo * 20);
    if (msize >= 5 || combo >= 3) freezeT = Math.min(80, 30 + msize * 6);
    spawnPopup(gained, combo);
    var f = 440 * Math.pow(2, Math.min(combo, 8) / 12);
    beep(f, .12, "triangle", .10 + Math.min(combo, 6) * 0.01);
    if (combo > 1) beep(f * 1.5, .1, "sine", .07);
  }
  function applyClear() {
    var pn = 9 + Math.min(combo, 6) * 2;
    for (var key in clearing) {
      if (!clearing.hasOwnProperty(key)) continue;
      var parts = key.split(","), r = +parts[0], c = +parts[1];
      spawnParticles(c, r, board[r][c], pn); board[r][c] = null; voff[r][c] = 0; vmode[r][c] = 0; vscale[r][c] = 1;
    }
    clearing = null; gravity(); beginResolve();
  }

  function settle() {
    if (state !== "playing") return;
    if (--pieceUntilJunk <= 0) { pieceUntilJunk = randInt(junkMin, junkMax); dropJunk(); }
    sub = "control"; spawn();
  }

  function colFill(c) { var top = 0; while (top < ROWS && board[top][c] == null) top++; return ROWS - top; }
  function dropJunk() {
    var n = Math.random() < 0.6 ? 1 : 2;
    var cols = [];
    for (var c = 0; c < COLS; c++) { var f = colFill(c); if (f < ROWS - 1) { var e = ROWS - f; cols.push({ c: c, w: e * e }); } }
    if (!cols.length) cols = [{ c: (Math.random() * COLS) | 0, w: 1 }];
    var added = 0;
    for (var i = 0; i < n && cols.length; i++) {
      var tot = 0; for (var t = 0; t < cols.length; t++) tot += cols[t].w;
      var rnd = Math.random() * tot, pick = 0;
      for (var k = 0; k < cols.length; k++) { rnd -= cols[k].w; if (rnd <= 0) { pick = k; break; } }
      var cc = cols.splice(pick, 1)[0].c;
      fallingJunk.push({ c: cc, y: -1.6, idx: rc() });
      junkWarn.push({ c: cc, t: 0 });
      added++;
    }
    if (added) beep(115, .09, "sine", .05);
    return { added: added };
  }

  function resolveJunk() {
    var total = 0;
    while (true) {
      var m = findMatches(); var msize = matchSize(m); if (msize === 0) break;
      total += msize;
      for (var key in m) {
        if (!m.hasOwnProperty(key)) continue;
        var parts = key.split(","), r = +parts[0], c = +parts[1];
        spawnParticles(c, r, board[r][c]); board[r][c] = null; voff[r][c] = 0; vmode[r][c] = 0; vscale[r][c] = 1;
      }
      gravity();
    }
    if (total) {
      score += total * 10; cleared += total;
      shakeT = Math.min(180, 60 + total * 16); beep(520, .1, "triangle", .1);
    }
  }

  // ---------- 道具:炸弹(炸掉最下方 N 行)----------
  // port 自网页版 useBomb 的棋盘效果部分;库存/扣件在 game.js 里做,这里只做盘面 + 返回清掉的方块数。
  function useBomb(rows) {
    if (state !== "playing" || sub !== "control") return 0;   // 只在可操作时使用,避免与消除动画/暂停冲突
    rows = rows || 0;
    var n = 0;
    for (var r = ROWS - 1; r >= Math.max(0, ROWS - rows); r--) {
      for (var c = 0; c < COLS; c++) {
        if (board[r][c] != null) {
          spawnParticles(c, r, board[r][c]); board[r][c] = null; voff[r][c] = 0; vmode[r][c] = 0; vscale[r][c] = 1; n++;
        }
      }
    }
    gravity();
    score += n * 5;
    shakeT = Math.min(260, 160 + n * 6); freezeT = Math.min(90, 50);
    beep(70, .22, "sawtooth", .13); beep(150, .16, "square", .1); beep(40, .3, "triangle", .1);
    resolveJunk();        // 炸后塌落可能形成的新消除一并结算
    return n;
  }

  // ---------- 操作 ----------
  function playing() { return state === "playing" && sub === "control"; }
  function move(d) { if (playing() && valid(current.row, current.col + d, current.colors)) { current.col += d; beep(330, .03, "sine", .05); } }
  function rotate() {
    if (playing()) {
      var c = current.colors;
      current.colors = [c[c.length - 1]].concat(c.slice(0, c.length - 1));
      rotT = ROT_MS; beep(600, .045, "triangle", .07); beep(900, .03, "sine", .04);
    }
  }
  function hardDrop() {
    if (!playing()) return;
    var n = 0;
    while (valid(current.row + 1, current.col, current.colors)) { current.row++; n++; }
    visRow = current.row; score += n * 2;
    shakeT = Math.max(shakeT, Math.min(64, 40 + n * 4)); freezeT = Math.max(freezeT, 18);
    lockPiece();
  }
  function ghostRow() { var r = current.row; while (valid(r + 1, current.col, current.colors)) r++; return r; }
  function setSoftDrop(b) { softDrop = !!b; }
  // 复活:炸掉最下方 6 行 + 塌落,然后继续(金币/广告判定在 game.js 里做)
  function revive() {
    if (state !== "gameover") return;
    var lo = Math.max(0, ROWS - 6);
    for (var r = ROWS - 1; r >= lo; r--) for (var c = 0; c < COLS; c++) {
      if (board[r][c] != null) { spawnParticles(c, r, board[r][c], 7); board[r][c] = null; voff[r][c] = 0; vmode[r][c] = 0; vscale[r][c] = 1; }
    }
    fallingJunk.length = 0; junkWarn.length = 0; clearing = null;
    gravity();
    shakeT = 220; freezeT = 60; beep(70, .26, "sawtooth", .14); beep(150, .18, "square", .1); beep(40, .32, "triangle", .1);
    revives++;
    _gameOverFired = false; sub = "control"; state = "playing"; dropAccum = 0; softDrop = false;
    spawn();
  }

  // ---------- 特效 ----------
  function spawnParticles(c, r, idx, n) {
    var col = COLORS[idx] || COLORS[0];
    var cx = (c + 0.5) * CELL, cy = (r + 0.5) * CELL; n = n || 11;
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2, sp = CELL * (0.05 + Math.random() * 0.17), spark = i % 4 === 0;
      particles.push({
        x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - CELL * 0.03,
        life: 1, decay: 0.022 + Math.random() * 0.012,
        size: CELL * (spark ? 0.08 + Math.random() * 0.06 : 0.13 + Math.random() * 0.18),
        color: spark ? "#ffffff" : col.glow
      });
    }
  }
  function spawnPopup(gained, cb) {
    var tier = Math.min(cb - 1, PRAISE.length - 1);
    var q = popups[0];
    if (!q || cb === 1) { q = { x: COLS * CELL / 2, y: ROWS * CELL * 0.34, life: 1, age: 0, tier: -1, total: 0, combo: 1 }; popups.length = 0; popups.push(q); }
    q.total += gained; q.combo = cb; q.life = 1;
    if (tier > q.tier) { q.tier = tier; q.age = 0; }
    q.word = PRAISE[q.tier]; q.col = PRAISE_COL[q.tier]; q.sub = "+" + q.total;
  }
  function spawnStageBanner(stage, reward) {
    banner = { age: 0, life: 1.9, stage: stage, reward: reward || 0 };
    beep(620, .16, "triangle", .1); beep(930, .14, "sine", .07); beep(1240, .12, "sine", .05);
    shakeT = Math.min(220, 170); freezeT = Math.min(95, 72);
  }
  function updateFx(dt) {
    var k = dt / 16.7;
    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.x += p.vx * k; p.y += p.vy * k; p.vy += CELL * 0.016 * k; p.life -= (p.decay || 0.03) * k;
      if (p.life <= 0) particles.splice(i, 1);
    }
    for (var j = popups.length - 1; j >= 0; j--) {
      var q = popups[j];
      q.age += dt; q.life -= 0.018 * k; if (q.life < 0.55) q.y -= CELL * 0.04 * k;
      if (q.life <= 0) popups.splice(j, 1);
    }
    if (rotT > 0) rotT = Math.max(0, rotT - dt);
    for (var w = junkWarn.length - 1; w >= 0; w--) {
      junkWarn[w].t += dt;
      if (junkWarn[w].t >= 600 && !junkHasFalling(junkWarn[w].c)) junkWarn.splice(w, 1);
    }
    if (banner) { banner.age += dt; banner.life -= dt / 1000; if (banner.life <= 0) banner = null; }
    for (var r = 0; r < ROWS; r++) for (var c = 0; c < COLS; c++) {
      if (voff[r][c] !== 0) {
        if (vmode[r][c] === 1) { voff[r][c] += JUNK_FALL * dt; if (voff[r][c] >= 0) { voff[r][c] = 0; vmode[r][c] = 0; } }
        else { voff[r][c] *= Math.pow(0.80, k); if (Math.abs(voff[r][c]) < 0.02) voff[r][c] = 0; }
      }
      if (vscale[r][c] !== 1) { vscale[r][c] += (1 - vscale[r][c]) * Math.min(1, 0.22 * k); if (Math.abs(vscale[r][c] - 1) < 0.01) vscale[r][c] = 1; }
    }
    if (state === "playing" && sub === "control") {
      for (var fi = fallingJunk.length - 1; fi >= 0; fi--) {
        var jb = fallingJunk[fi];
        jb.y += JUNK_FALL * dt;
        var top = 0; while (top < ROWS && board[top][jb.c] == null) top++;
        var R = top - 1;
        if (R < 0) { fallingJunk.splice(fi, 1); continue; }
        if (jb.y >= R) {
          board[R][jb.c] = jb.idx; vscale[R][jb.c] = 1.35; voff[R][jb.c] = 0; vmode[R][jb.c] = 0;
          fallingJunk.splice(fi, 1);
          spawnParticles(jb.c, R, jb.idx);
          beep(95, .12, "sine", .08); beep(150, .06, "triangle", .05);
          shakeT = Math.max(shakeT, 70);
          resolveJunk();
        }
      }
    }
    if (state === "playing" && current && sub === "control") {
      var iv = softDrop ? Math.min(55, dropInterval) : dropInterval;
      var canFall = valid(current.row + 1, current.col, current.colors);
      visRow = current.row + (canFall ? Math.max(0, Math.min(1, dropAccum / iv)) : 0);
      visCol += (current.col - visCol) * Math.min(1, dt * 0.022);
      if (Math.abs(visCol - current.col) < 0.01) visCol = current.col;
    }
  }
  function junkHasFalling(c) { for (var i = 0; i < fallingJunk.length; i++) if (fallingJunk[i].c === c) return true; return false; }

  // ---------- 渲染 ----------
  function easeOutBack(t) { var c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); }
  function rr(g, x, y, w, h, rad) {
    g.beginPath(); g.moveTo(x + rad, y);
    g.arcTo(x + w, y, x + w, y + h, rad); g.arcTo(x + w, y + h, x, y + h, rad);
    g.arcTo(x, y + h, x, y, rad); g.arcTo(x, y, x + w, y, rad); g.closePath();
  }

  function drawBlock(g, colF, rowF, idx, opt, cell) {
    cell = cell || CELL; opt = opt || {};
    var sc = opt.scale || 1, p = Math.max(2, cell * 0.06), s0 = cell - p * 2, h = s0 / 2;
    var cx = (colF + 0.5) * cell, cy = (rowF + 0.5) * cell;
    var col = COLORS[idx] || COLORS[0];
    var rad = cell * 0.2;
    g.save();
    g.translate(cx, cy); if (sc !== 1) g.scale(sc, sc);
    if (opt.ghost) {
      g.fillStyle = col.gfill; rr(g, -h, -h, s0, s0, rad); g.fill();
      g.strokeStyle = col.gedge; g.lineWidth = Math.max(1.5, cell * 0.045);
      rr(g, -h, -h, s0, s0, rad); g.stroke(); g.restore(); return;
    }
    var a = (opt.alpha != null) ? opt.alpha : 1;
    var grad = g.createLinearGradient(0, -h, 0, h);
    grad.addColorStop(0, col.top); grad.addColorStop(.52, col.fill); grad.addColorStop(1, col.dark);
    g.globalAlpha = a; g.fillStyle = grad; rr(g, -h, -h, s0, s0, rad); g.fill();
    g.globalAlpha = a * 0.5; g.fillStyle = col.glow;
    rr(g, -h + s0 * 0.13, -h + s0 * 0.09, s0 * 0.74, s0 * 0.2, rad * 0.6); g.fill();
    g.globalAlpha = a; g.strokeStyle = col.edge; g.lineWidth = Math.max(1, cell * 0.035);
    rr(g, -h, -h, s0, s0, rad); g.stroke();
    if (opt.junk) {
      g.globalAlpha = a * 0.34; g.fillStyle = "#2a0606"; rr(g, -h, -h, s0, s0, rad); g.fill();
      g.globalAlpha = a; g.strokeStyle = "#ff5a3c"; g.lineWidth = Math.max(1.6, cell * 0.07);
      g.setLineDash([cell * 0.17, cell * 0.1]); rr(g, -h, -h, s0, s0, rad); g.stroke(); g.setLineDash([]);
    }
    if (opt.active) {
      var pv = g.globalCompositeOperation; g.globalCompositeOperation = "lighter";
      g.globalAlpha = 0.55; g.strokeStyle = col.glow; g.lineWidth = Math.max(1.5, cell * 0.06);
      rr(g, -h, -h, s0, s0, rad); g.stroke(); g.globalCompositeOperation = pv;
    }
    g.restore();
  }

  function render(ctx) {
    var ox = 0, oy = 0;
    if (shakeT > 0) { var m = Math.min(8, shakeT / 22); ox = (Math.random() * 2 - 1) * m; oy = (Math.random() * 2 - 1) * m; }
    ctx.save(); ctx.translate(ox, oy);
    var bgGrad = ctx.createLinearGradient(0, 0, 0, ROWS * CELL);
    bgGrad.addColorStop(0, "#120428"); bgGrad.addColorStop(1, "#070114");
    ctx.fillStyle = bgGrad; ctx.fillRect(-9, -9, COLS * CELL + 18, ROWS * CELL + 18);
    ctx.strokeStyle = "rgba(150,90,255,.10)"; ctx.lineWidth = 1;
    for (var c = 0; c <= COLS; c++) { ctx.beginPath(); ctx.moveTo(c * CELL, 0); ctx.lineTo(c * CELL, ROWS * CELL); ctx.stroke(); }
    for (var r = 0; r <= ROWS; r++) { ctx.beginPath(); ctx.moveTo(0, r * CELL); ctx.lineTo(COLS * CELL, r * CELL); ctx.stroke(); }

    for (var br = 0; br < ROWS; br++) for (var bc = 0; bc < COLS; bc++) if (board[br][bc] != null) {
      var key = br + "," + bc, ry = br + voff[br][bc];
      if (clearing && clearing[key]) {
        var t = Math.max(0, Math.min(1, 1 - clearTimer / CLEAR_MS));
        drawBlock(ctx, bc, ry, board[br][bc], { glow: 1.6, alpha: 1 - t * 0.7, scale: 1 + 0.16 * Math.sin(t * Math.PI) });
        ctx.save(); ctx.globalAlpha = (1 - t) * 0.5; ctx.fillStyle = "#fff";
        var pp = Math.max(2, CELL * 0.07); rr(ctx, bc * CELL + pp, ry * CELL + pp, CELL - pp * 2, CELL - pp * 2, CELL * 0.18); ctx.fill(); ctx.restore();
      } else drawBlock(ctx, bc, ry, board[br][bc], { scale: vscale[br][bc] });
    }

    // 移动端「下一个」预览
    if (next && (state === "playing" || state === "paused")) {
      var nn = next.colors.length, pc = Math.max(10, CELL * 0.40), pad = 5, pw = pc + pad * 2, ph = pc * nn + pad + 16, px = COLS * CELL - pw - 6, py = 6;
      ctx.save();
      ctx.fillStyle = "rgba(8,2,20,.74)"; rr(ctx, px, py, pw, ph, 9); ctx.fill();
      ctx.fillStyle = "#9b86c9"; ctx.textAlign = "center"; ctx.textBaseline = "alphabetic"; ctx.font = "700 9px sans-serif";
      ctx.fillText("NEXT", px + pw / 2, py + 11);
      for (var ni = 0; ni < nn; ni++) {
        var ncol = COLORS[next.colors[ni]] || COLORS[0];
        var nbx = px + pad, nby = py + 15 + ni * pc, ns = pc - 3;
        ctx.fillStyle = ncol.fill; rr(ctx, nbx, nby, ns, ns, ns * 0.2); ctx.fill();
        ctx.strokeStyle = ncol.glow; ctx.lineWidth = 1.4; rr(ctx, nbx, nby, ns, ns, ns * 0.2); ctx.stroke();
      }
      ctx.restore();
    }

    // 乱入预警
    for (var wi = 0; wi < junkWarn.length; wi++) {
      var w = junkWarn[wi], phc = 0.5 + 0.5 * Math.sin(w.t * 0.02), wx = w.c * CELL;
      ctx.save(); ctx.globalAlpha = 0.3 + 0.5 * phc; ctx.fillStyle = "#ff5a3c";
      ctx.fillRect(wx + 2, 0, CELL - 4, Math.max(3, CELL * 0.09));
      ctx.beginPath(); ctx.moveTo(wx + CELL * 0.36, CELL * 0.16); ctx.lineTo(wx + CELL * 0.64, CELL * 0.16); ctx.lineTo(wx + CELL * 0.5, CELL * 0.30); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    // 乱入下落实体
    for (var ji = 0; ji < fallingJunk.length; ji++) { var jb = fallingJunk[ji]; if (jb.y > -1) drawBlock(ctx, jb.c, jb.y, jb.idx, { junk: true }); }

    if (state === "playing" && current && sub === "control") {
      var pn = current.colors.length;
      if (true) { var gr = ghostRow(); for (var gi = 0; gi < pn; gi++) { var grr = gr + gi; if (grr >= 0 && grr > visRow + pn - 1) drawBlock(ctx, current.col, grr, current.colors[gi], { ghost: true }); } }
      if (rotT > 0) {
        var rt = 1 - rotT / ROT_MS, pop = 1 + 0.15 * Math.sin(rt * Math.PI);
        var cxc = (visCol + 0.5) * CELL, cyc = (visRow + pn / 2) * CELL;
        ctx.save(); ctx.translate(cxc, cyc); ctx.scale(pop, pop); ctx.translate(-cxc, -cyc);
        for (var ai = 0; ai < pn; ai++) drawBlock(ctx, visCol, visRow + ai, current.colors[ai], { active: true });
        ctx.restore();
      } else {
        for (var bi = 0; bi < pn; bi++) drawBlock(ctx, visCol, visRow + bi, current.colors[bi], { active: true });
      }
    }

    ctx.save(); ctx.globalCompositeOperation = "lighter";
    for (var pi = 0; pi < particles.length; pi++) {
      var pp2 = particles[pi]; ctx.globalAlpha = Math.max(0, pp2.life) * 0.85;
      ctx.fillStyle = pp2.color; ctx.beginPath(); ctx.arc(pp2.x, pp2.y, pp2.size * Math.max(0, pp2.life), 0, 7); ctx.fill();
    }
    ctx.restore();

    for (var qi = 0; qi < popups.length; qi++) {
      var q = popups[qi];
      var qa = Math.min(1, q.age / 180), qsc = 0.35 + 0.65 * easeOutBack(qa);
      ctx.save(); ctx.globalAlpha = Math.max(0, q.life);
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.translate(q.x, q.y); ctx.scale(qsc, qsc);
      var fs = Math.round(CELL * (0.62 + Math.max(0, q.tier) * 0.09));
      if (q.combo >= 2) {
        var cf = Math.round(CELL * 0.36); ctx.font = "900 " + cf + "px sans-serif";
        ctx.lineWidth = Math.max(2, CELL * 0.06); ctx.strokeStyle = "rgba(8,2,20,.9)"; ctx.strokeText("×" + q.combo, 0, -fs * 0.74);
        ctx.fillStyle = "#9be3ff"; ctx.fillText("×" + q.combo, 0, -fs * 0.74);
      }
      ctx.font = "900 " + fs + "px sans-serif";
      ctx.lineWidth = Math.max(3, CELL * 0.1); ctx.strokeStyle = "rgba(8,2,20,.92)"; ctx.strokeText(q.word, 0, 0);
      ctx.fillStyle = q.col; ctx.fillText(q.word, 0, 0);
      var subFs = Math.round(CELL * (0.36 + Math.min(q.combo, 6) * 0.03)), subY = fs * 0.78;
      ctx.font = "800 " + subFs + "px sans-serif";
      ctx.lineWidth = Math.max(2, CELL * 0.07); ctx.strokeStyle = "rgba(8,2,20,.92)"; ctx.strokeText(q.sub, 0, subY);
      ctx.fillStyle = "#fff"; ctx.fillText(q.sub, 0, subY);
      ctx.restore();
    }

    // 过关横幅
    if (banner) {
      var ba = Math.min(1, banner.age / 200), bsc = 0.4 + 0.6 * easeOutBack(ba), fade = Math.min(1, banner.life / 0.45);
      ctx.save(); ctx.globalAlpha = Math.max(0, fade); ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.translate(COLS * CELL / 2, ROWS * CELL * 0.20); ctx.scale(bsc, bsc);
      var bfs = Math.round(CELL * 1.0);
      ctx.font = "900 " + bfs + "px sans-serif";
      ctx.lineWidth = Math.max(4, CELL * 0.13); ctx.strokeStyle = "rgba(8,2,20,.95)"; ctx.strokeText("第 " + banner.stage + " 关", 0, 0);
      ctx.fillStyle = "#ffd86a"; ctx.fillText("第 " + banner.stage + " 关", 0, 0);
      if (banner.reward) {
        var bsubFs = Math.round(CELL * 0.46), bsubY = bfs * 0.76, txt = "+" + banner.reward;
        ctx.font = "800 " + bsubFs + "px sans-serif";
        var tw = ctx.measureText(txt).width, rd = bsubFs * 0.5, gap = bsubFs * 0.26, bcx = -(rd * 2 + gap + tw) / 2 + rd;
        var grd = ctx.createRadialGradient(bcx - rd * 0.3, bsubY - rd * 0.3, rd * 0.2, bcx, bsubY, rd);
        grd.addColorStop(0, "#fff0bf"); grd.addColorStop(.62, "#f3bd3c"); grd.addColorStop(1, "#d79420");
        ctx.beginPath(); ctx.arc(bcx, bsubY, rd, 0, 7); ctx.fillStyle = grd; ctx.fill();
        ctx.lineWidth = Math.max(1, rd * 0.16); ctx.strokeStyle = "rgba(140,92,12,.75)"; ctx.stroke();
        ctx.textAlign = "left"; var tx = bcx + rd + gap;
        ctx.lineWidth = Math.max(2, CELL * 0.08); ctx.strokeStyle = "rgba(8,2,20,.92)"; ctx.strokeText(txt, tx, bsubY);
        ctx.fillStyle = "#ffe9a8"; ctx.fillText(txt, tx, bsubY);
      }
      ctx.restore();
    }

    // 关卡进度条
    if (state === "playing" || state === "paused") {
      var have = cleared - stageStart, need = stageGoal(level), prog = Math.max(0, Math.min(1, have / need));
      var pbw = COLS * CELL, pbh = Math.max(3, CELL * 0.07);
      ctx.fillStyle = "rgba(255,255,255,.10)"; ctx.fillRect(0, 0, pbw, pbh);
      ctx.fillStyle = "#ffd86a"; ctx.fillRect(0, 0, pbw * prog, pbh);
      ctx.save(); ctx.textAlign = "left"; ctx.textBaseline = "top"; ctx.font = "700 " + Math.max(9, Math.round(CELL * 0.26)) + "px sans-serif";
      ctx.fillStyle = "rgba(8,2,20,.55)"; ctx.fillText("关卡 " + level + " · " + have + "/" + need, 5, pbh + 4);
      ctx.fillStyle = "#d9c8ff"; ctx.fillText("关卡 " + level + " · " + have + "/" + need, 4, pbh + 3); ctx.restore();
    }

    ctx.restore();
  }

  // ---------- 主循环控制段(port 自 loop() 的 state==="playing" 部分)----------
  function tick(dt) {
    dt = Math.min(60, dt || 0);
    if (freezeT > 0) { freezeT = Math.max(0, freezeT - dt); return; }
    if (state === "playing") {
      if (sub === "control") {
        dropAccum += dt; var iv = softDrop ? Math.min(55, dropInterval) : dropInterval;
        while (dropAccum >= iv) { dropAccum -= iv; stepDown(); if (sub !== "control") break; }
      } else if (sub === "resolving") { clearTimer -= dt; flashPulse += dt; if (clearTimer <= 0) applyClear(); }
    }
    if (shakeT > 0) shakeT = Math.max(0, shakeT - dt);
    updateFx(dt);
  }

  // ---------- 绘制入口 ----------
  function draw(ctx, lay) {
    CELL = lay.cell;
    ctx.save();
    ctx.translate(lay.ox, lay.oy);
    render(ctx);
    ctx.restore();
  }

  // ---------- 公共 API ----------
  return {
    reset: reset,
    tick: tick,
    draw: draw,
    rotate: rotate,
    move: move,
    setSoftDrop: setSoftDrop,
    hardDrop: hardDrop,
    useBomb: useBomb,
    revive: revive,
    reviveCount: function () { return revives; },
    state: function () { return state; },
    score: function () { return score; },
    level: function () { return level; },
    cleared: function () { return cleared; },
    maxCombo: function () { return maxCombo; },
    nextColors: function () { return next ? next.colors.slice() : []; },
    goalInfo: function () { return { have: cleared - stageStart, need: stageGoal(level) }; }
  };
};
