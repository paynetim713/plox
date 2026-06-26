// ============================================================
// 抖音小游戏平台层 —— 把游戏用到的 web 能力映射到 tt.*。
// 换平台(微信/网页)只改这一个文件,其余逻辑不动。
// 对应网页版 js/platform.js + 存储/音频/网络封装。
// ============================================================

// ---------- 系统信息 / 画布尺寸 / 平台 ----------
var SYS;
try { SYS = tt.getSystemInfoSync(); } catch (e) {
  SYS = { windowWidth: 375, windowHeight: 667, pixelRatio: 2,
          safeArea: { top: 0, left: 0, right: 375, bottom: 667 }, platform: 'devtools' };
}
var IS_IOS = SYS.platform === 'ios';
function sysInfo() { return SYS; }
function isIOS() { return IS_IOS; }

// ---------- 本地存储(同步,替代 localStorage)----------
// tt 会自动序列化对象;不存在返回 def。
var store = {
  get: function (k, def) {
    try { var v = tt.getStorageSync(k); return (v === '' || v == null) ? (def === undefined ? null : def) : v; }
    catch (e) { return def === undefined ? null : def; }
  },
  set: function (k, v) { try { tt.setStorageSync(k, v); } catch (e) {} },
  del: function (k) { try { tt.removeStorageSync(k); } catch (e) {} }
};

// ---------- 音频上下文(WebAudio 兼容)----------
// 抖音用 tt.getAudioContext();不同版本 getter 名可能不同 → 逐个尝试,保证不崩。
var _actx = null;
function audioCtx() {
  if (_actx) return _actx;
  try { if (typeof tt.getAudioContext === 'function') _actx = tt.getAudioContext(); } catch (e) {}
  try { if (!_actx && typeof tt.createWebAudioContext === 'function') _actx = tt.createWebAudioContext(); } catch (e) {}
  try {
    if (!_actx && typeof GameGlobal !== 'undefined' && (GameGlobal.AudioContext || GameGlobal.webkitAudioContext))
      _actx = new (GameGlobal.AudioContext || GameGlobal.webkitAudioContext)();
  } catch (e) {}
  return _actx;
}
function audioResume() { var a = audioCtx(); if (a && a.state === 'suspended' && a.resume) { try { a.resume(); } catch (e) {} } }

// ---------- 网络请求(替代 fetch;注意 url 必须在「request 合法域名」白名单)----------
// 返回 Promise(已 JSON 解析的 data)。tt.request 在 4xx/5xx 也走 success → 自己判 statusCode。
function request(opt) {
  return new Promise(function (resolve, reject) {
    try {
      tt.request({
        url: opt.url,
        method: opt.method || 'GET',
        header: opt.header || { 'content-type': 'application/json' },
        data: opt.data,
        dataType: 'json',
        timeout: opt.timeout || 8000,
        success: function (res) {
          if (res.statusCode >= 200 && res.statusCode < 300) resolve(res.data);
          else reject(new Error('HTTP ' + res.statusCode));
        },
        fail: function (err) { reject(err); }
      });
    } catch (e) { reject(e); }
  });
}

// ---------- 激励视频广告(iOS/Android 都可用,iOS 安全变现路径)----------
// adUnitId 来自抖音后台「流量主 → 激励视频广告位」,不是代码常量。
var _ad = null, _adCb = null;
function initAd(adUnitId) {
  if (_ad || !adUnitId) return;
  try {
    _ad = tt.createRewardedVideoAd({ adUnitId: adUnitId });
    _ad.onClose(function (res) {
      var cb = _adCb; _adCb = null;
      if (res && res.isEnded) { if (cb && cb.ok) cb.ok(); }      // 只有看完才发奖
      else { if (cb && cb.fail) cb.fail(); }
    });
    _ad.onError(function () { var cb = _adCb; _adCb = null; if (cb && cb.fail) cb.fail(); });
  } catch (e) {}
}
function hasRewardedAd() { return !!_ad; }
function showRewardedAd(onReward, onFail) {
  if (!_ad) { if (onFail) onFail(); return; }
  _adCb = { ok: onReward, fail: onFail };
  try {
    _ad.show().catch(function () {
      _ad.load().then(function () { return _ad.show(); }).catch(function () { _adCb = null; if (onFail) onFail(); });
    });
  } catch (e) { _adCb = null; if (onFail) onFail(); }
}

// ---------- 虚拟支付(iOS 禁用 → 充值入口须在 iOS 隐藏)----------
// 需后台开通「虚拟支付」+ 资质 + 版号;buyQuantity×单价 须命中允许档位。占位实现,后台开通后细化。
function canPay() { return !IS_IOS; }
function purchase(pack, onSuccess, onFail) {
  if (IS_IOS) { if (onFail) onFail(new Error('ios-no-pay')); return; }
  try {
    tt.login({
      success: function () {
        tt.requestGamePayment({
          mode: 'game', env: 0, currencyType: 'CNY', buyQuantity: pack.rmb, zoneId: '1',
          success: function () { if (onSuccess) onSuccess(pack); },
          fail: function (err) { if (onFail) onFail(err); }
        });
      },
      fail: function (err) { if (onFail) onFail(err); }
    });
  } catch (e) { if (onFail) onFail(e); }
}

module.exports = {
  sysInfo: sysInfo, isIOS: isIOS, store: store,
  audioCtx: audioCtx, audioResume: audioResume, request: request,
  initAd: initAd, hasRewardedAd: hasRewardedAd, showRewardedAd: showRewardedAd,
  canPay: canPay, purchase: purchase
};
