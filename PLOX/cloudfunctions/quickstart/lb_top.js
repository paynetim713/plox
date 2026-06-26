/**
 * 排行榜:取某难度的前 30 名(按分数降序)。
 * 客户端:tt.cloud.callFunction({name:'lb_top', data:{diff}})
 */
const { dySDK } = require("@open-dy/node-server-sdk");

module.exports = async function (params, context) {
  try {
    const db = dySDK.database();
    const diff = ["easy", "normal", "hard"].indexOf(params.diff) >= 0 ? params.diff : "normal";
    const res = await db
      .collection("leaderboard")
      .aggregate()
      .match({ diff: diff })
      .sort({ score: -1 })
      .limit(30)
      .end();
    return { code: 0, message: "", data: (res && res.data) || [] };
  } catch (e) {
    return { code: 1, message: String(e && e.message || e), data: [] };
  }
};
