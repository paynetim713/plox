/**
 * 排行榜:提交成绩(按 openId + 难度「保留最高」)。
 * 客户端:tt.cloud.callFunction({name:'lb_submit', data:{name, score, diff}})
 * 需先在开发者工具:开通云环境 + 创建云数据库集合 "leaderboard" + 上传部署本函数。
 */
const { dySDK } = require("@open-dy/node-server-sdk");

module.exports = async function (params, context) {
  try {
    const sc = dySDK.context(context).getContext();
    const openId = (sc && sc.openId) || "anon";
    const db = dySDK.database();
    const col = db.collection("leaderboard");

    const name = String(params.name || "YOU").slice(0, 8);
    let score = parseInt(params.score, 10);
    if (!(score >= 0)) score = 0;
    if (score > 1e7) score = 1e7;
    const diff = ["easy", "normal", "hard"].indexOf(params.diff) >= 0 ? params.diff : "normal";

    const found = await col.aggregate().match({ openId: openId, diff: diff }).limit(1).end();
    const rows = (found && found.data) || [];
    if (rows.length) {
      if (score > (rows[0].score || 0)) {
        await col.where({ openId: openId, diff: diff }).update({ score: score, name: name, serverDate: db.serverDate() });
      }
    } else {
      await col.add({ openId: openId, diff: diff, name: name, score: score, serverDate: db.serverDate() });
    }
    return { code: 0, message: "", data: { ok: true } };
  } catch (e) {
    return { code: 1, message: String(e && e.message || e), data: null };
  }
};
