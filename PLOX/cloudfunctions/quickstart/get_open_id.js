/**
 * @param params 调用参数，HTTP 请求下为请求体
 * @param context 调用上下文
 *
 * @return 函数的返回数据，HTTP 场景下会作为 Response Body
 *
 */
const { dySDK } = require("@open-dy/node-server-sdk");

module.exports = async function (params, context) {
  const serviceContext = dySDK.context(context);
  const reqContext = serviceContext.getContext();
  context.log("openId", reqContext?.openId);
  return {
    code: 0,
    message: "",
    data: reqContext?.openId,
  };
};
