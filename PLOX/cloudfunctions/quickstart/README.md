# 项目介绍

本项目是抖音云平台基于 Nodejs 语言云函数开发模版，模版示例包括如下功能：

1. 免登录获取 OpenID：无需维护鉴权机制及登录票据。
2. 免鉴权生成小程序码：无需维护 OpenApi 鉴权的 access_token，免鉴权调用 OpenApi。
3. 云数据库使用示例。

## 操作步骤

1. 在抖音云控制面新建云函数对应的 ts 工程。
2. 通过一键部署模板进行部署（具体代码可参考 quickstart 目录，和线上部署模板一致）。
3. 调试云函数项目，查看对应结果。

## 目录结构(quickstart)

```
├── get_open_id.js              获取 open_id。
├── insert_record.js            向云数据库中demo插入一条数据。
├── package.json                云函数工程配置文件。
├── antidirt.js                 云调用示例，调用抖音开放平台的OpenApi进行检测一段文本是否包含违法违规内容。
├── README.md                   Readme文件
├── select_record.js            从云数据库中查询demo数据
├── update_record.js            更新云数据库中demo对应数据

```

## 请求方法

前往抖音云托管云函数平台，进行请求调试。

## API 说明

### `GET /get_open_id`

获取 openid，当未绑定用户时会返回获取 openid 失败的错误
当小程序客户端通过 callContainer 的方式请求抖音云上的服务器时，抖音云网关会自动获取 openid,并将 openid 注入到请求头 X-TT-OPENID 中。

### 响应结果

```json
{
  "code": 0,
  "message": "",
  "data": "719f****-****-4c**-a0**-*********"
}
```

### `POST /antidirt`

云调用示例，调用抖音开放平台的 OpenApi 进行检测一段文本是否包含违法违规内容。

### 请求参数

```json
{
  "tasks": [
    {
      "content": "要检测的文本"
    }
  ]
}
```

### 响应结果

正常返回

```json
{
  "log_id": "202008181611370100150421452708466F",
  "data": [
    {
      "msg": "",
      "code": 0,
      "task_id": "MICROAPP_6862233737027911687",
      "predicts": [
        {
          "prob": 0,
          "hit": false,
          "target": null,
          "model_name": "short_content_antidirt"
        }
      ],
      "data_id": null
    }
  ]
}
```

错误返回

```json
{
  "error_id": "7bf3b7e299e9448796aa99b44750df68",
  "code": 401,
  "message": "[app token sign fail] bad token",
  "exception": "[app token sign fail] bad token"
}
```

### `POST /insert_record`

向云数据库中插入一条数据

### 请求参数

```json
{
  "city": "xxx",
  "sales": "xxx" // 数字类型
}
```

### 响应结果

```json
{
  "data": {
    "id": "xxx",
    "requestId": "xxx"
  },
  "code": 0,
  "message": ""
}
```

### `GET /select_record`

从云数据库查询 demo 数据

### 响应结果

```json
{
  "data": [
    {
      "city": "xxx",
      "sales": "xxx",
      "_id": "xxx"
    }
  ]
}
```

### `POST /update_record`

从云数据库更新 demo 数据

### 请求参数

```json
{
  "data": [
    {
      "_id": "xxx",
      "city": "xxx",
      "sales": "xxx"
    }
  ]
}
```

### 响应结果

```json
{
  "code": "xxx",
  "message": "xxx",
  "data": []
}
```

## License

This project is licensed under the [Apache-2.0 License](LICENSE).
