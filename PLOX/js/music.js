// ============================================================
// PLOX 背景音乐(抖音小游戏 · CommonJS)—— 从网页版 main.js 的音乐系统忠实移植。
// 多首生成式电子乐(柔和取向,经低通母线),玩家可在设置里切换。
//   createMusic(getCtx, isOn):getCtx()→音频上下文(传 P.audioCtx),isOn()→bool(背景音乐开关)。
// 不触碰存储:曲目持久化由调用方负责。无 DOM/BOM/localStorage,无 emoji。
// ============================================================

var TRACKS = [
  { name: "霓虹", scale: [0, 3, 5, 7, 10, 12, 15],  pat: [0, 2, 1, 3, 2, 4, 3, 5, 4, 2, 1, 3], tempo: 230, lead: "triangle", lv: 0.030, bassEvery: 4, bass2Every: 8 },
  { name: "律动", scale: [0, 2, 3, 5, 7, 8, 10, 12], pat: [0, 4, 2, 5, 3, 6, 4, 7, 5, 3, 1, 4], tempo: 200, lead: "triangle", lv: 0.026, bassEvery: 2, bass2Every: 6 },
  { name: "梦境", scale: [0, 2, 4, 7, 9, 11, 12, 14], pat: [0, 2, 4, 3, 5, 4, 6, 5, 2, 4, 1, 3], tempo: 280, lead: "sine",     lv: 0.034, bassEvery: 4, bass2Every: 8 },
  { name: "脉冲", scale: [0, 3, 5, 6, 7, 10, 12, 15], pat: [0, 1, 2, 3, 4, 5, 4, 3, 2, 5, 3, 1], tempo: 185, lead: "sine",     lv: 0.024, bassEvery: 2, bass2Every: 4 }
];

function nf(s) { return 220 * Math.pow(2, s / 12); }

module.exports = function createMusic(getCtx, isOn) {
  getCtx = getCtx || function () { return null; };
  isOn = isOn || function () { return false; };

  var musicBus = null, musicTimer = null, musicStep = 0, musicTrack = 0;

  // 音乐独立母线:低通 + 限幅音量,让背景乐柔和不刺耳。懒构建(首次播放时 actx 才就绪)。
  function ensureBus() {
    var actx = getCtx();
    if (!actx) return null;
    if (!musicBus) {
      try {
        var g = actx.createGain(); g.gain.value = 0.5;
        var lp = actx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 1500; lp.Q.value = 0.6;
        g.connect(lp); lp.connect(actx.destination); musicBus = g;
      } catch (e) {}
    }
    return musicBus;
  }

  function tone(freq, dur, type, vol, atk, dest) {
    var actx = getCtx();
    if (!actx) return;
    try {
      var o = actx.createOscillator(), g = actx.createGain();
      o.type = type || "sine"; o.frequency.value = freq;
      var n = actx.currentTime, a = atk || 0.005;
      g.gain.setValueAtTime(0.0001, n); g.gain.exponentialRampToValueAtTime(vol, n + a);
      g.gain.exponentialRampToValueAtTime(0.0001, n + dur);
      o.connect(g); g.connect(dest || actx.destination); o.start(n); o.stop(n + dur + 0.02);
    } catch (e) {}
  }

  function musicTick() {
    var actx = getCtx();
    if (!isOn() || !actx || actx.state !== "running") { musicTimer = null; return; }
    var bus = ensureBus();
    var tk = TRACKS[musicTrack] || TRACKS[0], sc = tk.scale;
    var idx = tk.pat[musicStep % tk.pat.length] % sc.length;
    tone(nf(sc[idx]), 0.3, tk.lead, tk.lv, 0.03, bus);
    if (musicStep % tk.bassEvery === 0) tone(nf(sc[0]) / 2, 0.4, "sine", 0.034, 0.03, bus);
    if (musicStep % tk.bass2Every === (tk.bass2Every >> 1)) tone(nf(sc[Math.min(2, sc.length - 1)]), 0.26, "sine", 0.018, 0.03, bus);
    musicStep++; musicTimer = setTimeout(musicTick, tk.tempo);
  }

  function start() { if (!musicTimer && isOn()) musicTick(); }
  function stop() { if (musicTimer) { clearTimeout(musicTimer); musicTimer = null; } }
  function setTrack(i) {
    musicTrack = ((i % TRACKS.length) + TRACKS.length) % TRACKS.length;
  }
  function getTrack() { return musicTrack; }
  function trackNames() { var a = []; for (var k = 0; k < TRACKS.length; k++) a.push(TRACKS[k].name); return a; }

  return {
    start: start,
    stop: stop,
    setTrack: setTrack,
    getTrack: getTrack,
    trackNames: trackNames
  };
};
