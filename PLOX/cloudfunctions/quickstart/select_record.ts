/**
 * @param params 调用参数，HTTP 请求下为请求体
 * @param context 调用上下文
 *
 * @return 函数的返回数据，HTTP 场景下会作为 Response Body
 *
 */
import { dySDK } from "@open-dy/node-server-sdk";

export default async function (params: any, context: any) {
  try {
    const database = dySDK.database();
    const demo = await database
      .collection("demo")
      .aggregate()
      .sort({ serverDate: -1 })
      .limit(5)
      .end();
    return {
      data: demo,
      code: 0,
      message: "",
    };
  } catch (err) {
    return {
      data: [],
      code: 1,
      message: "云数据库查询失败，请确认云数据库是否开通和创建demo集合",
    };
  }
}
