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
  const appId = serviceContext.getContext()?.appId;
  const res = await serviceContext.openApiInvoke({
    // "url": "https://open.douyin.com/api/apps/v1/url_link/generate/",
    // 替换为云调用内网专线域名
    url: "http://open-douyin-com.openapi.dyc.ivolces.com/api/apps/v1/qrcode/create",
    method: "POST",
    // "querys": ,
    // "headers": headers
    data: {
      app_name: "douyin",
      appid: appId,
    },
  });
  return res;
};
