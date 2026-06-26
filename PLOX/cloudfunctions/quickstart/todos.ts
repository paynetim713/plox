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
    const todos = await database.collection("todos").get();
    return {
      code: 0,
      data: todos,
      message: "",
    };
  } catch (err) {
    return {
      data: [],
      code: 1,
      message: "云数据库查询失败，请确认云数据库是否开通和创建todos集合",
    };
  }
}
