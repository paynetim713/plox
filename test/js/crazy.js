// ============================================================
// CrazyGames HTML5 SDK v3 —— 薄封装。
// 不在 CrazyGames 上(本地 / GitHub Pages / 没装 SDK / 被广告拦截)时全部安全降级:
//   enabled()=false、所有广告调用 no-op、看广告按钮自动不显示,游戏照常玩。
// 文档:https://docs.crazygames.com/  脚本:sdk.crazygames.com/crazygames-sdk-v3.js
// ============================================================
let SDK = null;          // window.CrazyGames.SDK
let env = "disabled";    // 'local' | 'crazygames' | 'disabled'
let ready = false;
let adActive = false;
let hooks = { adStart() {}, adEnd() {} };
let _muted = false;          // 平台静音状态(SDK.game.settings.muteAudio)
let _muteCb = function () {}; // 静音变化回调(由 main.js 注入:停/复音乐)

function getSDK() { try { return (window.CrazyGames && window.CrazyGames.SDK) || null; } catch (e) { return null; } }
function game() { try { return SDK && SDK.game; } catch (e) { return null; } }

// 启动时 await:初始化 SDK + 读取运行环境。失败则保持降级。
export async function init() {
  SDK = getSDK();
  if (!SDK) return;
  try {
    if (typeof SDK.init === "function") await SDK.init();   // v3 必须 await init
    // v3 用属性 SDK.environment('local'|'crazygames'|'disabled');v2 才是 getEnvironment()
    try {
      if (typeof SDK.environment === "string") env = SDK.environment;
      else if (typeof SDK.getEnvironment === "function") env = await SDK.getEnvironment();
      else env = "crazygames";
    } catch (_) { env = "crazygames"; }
    // 平台静音:读初始值 + 监听变化(SDK 静音优先于游戏内开关;本地可用 ?muteAudio=true 测)
    try {
      var gm = SDK.game;
      if (gm) {
        if (gm.settings && typeof gm.settings.muteAudio === "boolean") _muted = gm.settings.muteAudio;
        if (typeof gm.addSettingsChangeListener === "function") {
          gm.addSettingsChangeListener(function (s) {
            var m = !!(s && s.muteAudio);
            if (m !== _muted) { _muted = m; try { _muteCb(_muted); } catch (e) {} }
          });
        }
      }
    } catch (e) {}
    ready = true;
  } catch (e) { SDK = null; }   // 初始化异常 → 彻底降级
}

// 平台静音状态 + 变化回调(main.js 用:beep/音乐都要 AND !muted())
export function muted() { return _muted; }
export function onMuteChange(cb) { _muteCb = cb || function () {}; }

// 是否真的在 CrazyGames 上(决定要不要显示"看广告"类按钮)
export function enabled() { return !!(ready && SDK && SDK.ad && env !== "disabled"); }

// 广告开始/结束的钩子:由 main.js 注入(静音 + 暂停 / 恢复)
export function setHooks(h) { hooks = Object.assign(hooks, h || {}); }
let _adTimer = null;
function clearAdTimer() { if (_adTimer) { clearTimeout(_adTimer); _adTimer = null; } }
// 看门狗:广告开始后即便没有任何结束回调(填充失败/卡住/被拦),35s 也强制结束,绝不让游戏永久卡死
function onStart() { if (adActive) return; adActive = true; clearAdTimer(); _adTimer = setTimeout(onEnd, 35000); try { hooks.adStart(); } catch (e) {} }
function onEnd() { if (!adActive) return; adActive = false; clearAdTimer(); try { hooks.adEnd(); } catch (e) {} }

// 生命周期信号(对 CrazyGames 的指标/广告时机很重要)
export function loadingStart() { try { game() && game().sdkGameLoadingStart(); } catch (e) {} }
export function loadingStop() { try { game() && game().sdkGameLoadingStop(); } catch (e) {} }
export function gameplayStart() { try { game() && game().gameplayStart(); } catch (e) {} }
export function gameplayStop() { try { game() && game().gameplayStop(); } catch (e) {} }
export function happytime() { try { game() && game().happytime(); } catch (e) {} }

// 插屏广告(玩家死亡 / 重开之间)。SDK 自带频次控制,频繁调用也安全。
export function midgame() {
  if (!enabled()) return;
  try {
    SDK.ad.requestAd("midgame", { adStarted: onStart, adFinished: onEnd, adError: () => onEnd() });
  } catch (e) { onEnd(); }
}

// 插屏广告:播完(或失败/不可用/超时)后再执行 cb。广告期间游戏不运行 → 无卡死风险。
// 不在 CrazyGames 上(或广告不可用)立即执行 cb,体验不变。
export function midgameThen(cb) {
  cb = cb || function () {};
  if (!enabled()) { cb(); return; }
  var done = false;
  var finish = function () { if (done) return; done = true; try { cb(); } catch (e) {} };
  try {
    SDK.ad.requestAd("midgame", {
      adStarted: onStart,
      adFinished: function () { onEnd(); finish(); },
      adError: function () { onEnd(); finish(); },
    });
    setTimeout(finish, 12000);   // 兜底:广告万一卡住也不挡住玩家重开
  } catch (e) { onEnd(); finish(); }
}

// 激励视频(看广告复活)。看完 → onReward;失败/未看完 → onFail(不发奖励)。
export function rewarded(onReward, onFail) {
  onReward = onReward || function () {}; onFail = onFail || function () {};
  if (!enabled()) { onFail(); return; }
  let done = false;
  try {
    SDK.ad.requestAd("rewarded", {
      adStarted: onStart,
      adFinished: () => { onEnd(); if (!done) { done = true; onReward(); } },
      adError: () => { onEnd(); if (!done) { done = true; onFail(); } },
    });
  } catch (e) { onEnd(); if (!done) { done = true; onFail(); } }
}
