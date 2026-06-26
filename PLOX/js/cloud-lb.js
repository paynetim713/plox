// ============================================================
// 排行榜客户端 —— 走抖音云函数(lb_submit / lb_top),数据在云数据库 "leaderboard"。
// 上线前需在开发者工具:开通云环境 → 创建集合 "leaderboard" → 上传部署 lb_submit/lb_top。
// 云没开通时所有调用安全降级(submit→false / top→[]),界面照常显示"暂无记录"。
// ============================================================
try { if (typeof tt !== 'undefined' && tt.cloud && tt.cloud.init) tt.cloud.init(); } catch (e) {}

function call(name, data) {
  return new Promise(function (resolve) {
    if (!(typeof tt !== 'undefined' && tt.cloud && tt.cloud.callFunction)) { resolve(null); return; }
    try {
      tt.cloud.callFunction({
        name: name,
        data: data || {},
        success: function (r) { resolve(r && r.result); },
        fail: function () { resolve(null); }
      });
    } catch (e) { resolve(null); }
  });
}

function submit(name, score, diff) {
  return call('lb_submit', { name: name, score: score, diff: diff })
    .then(function (r) { return !!(r && r.code === 0); });
}
function top(diff) {
  return call('lb_top', { diff: diff })
    .then(function (r) { var d = r && r.data; return Array.isArray(d) ? d : []; });
}

module.exports = { submit: submit, top: top };
