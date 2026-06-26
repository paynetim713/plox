/**
 * @param params 调用参数，HTTP 请求下为请求体
 * @param context 调用上下文
 *
 * @return 函数的返回数据，HTTP 场景下会作为 Response Body
 *
 */

const { dySDK } = require("@open-dy/node-server-sdk");

module.exports = async function (params, context) {
  try {
    const database = dySDK.database();
    const data = params.data || [];
    context.log(data.length);
    if (!data.length) {
      return {
        data: [],
        code: 1,
        message: "云数据库更新失败，请传入需要更新的集合",
      };
    }
    for (let i = 0; i < data.length; i++) {
      context.log(data[i]);
      const res = await database
        .collection("demo")
        .where({
          _id: data[i]._id,
        })
        .update({
          sales: data[i].sales,
        });
      context.log(res);
    }
    return {
      data: [],
      code: 0,
      message: "",
    };
  } catch (e) {
    context.log(e);

    return {
      data: [],
      code: 1,
      message: "云数据库更新失败，请确认云数据库是否开通和创建demo集合",
    };
  }
};
