# PLOX · 单机版

🎮 **在线试玩:https://paynetim713.github.io/plox/**　(手机/电脑都能开,可"添加到主屏幕"当 App 用)
📦 **源码仓库:https://github.com/paynetim713/plox**

经典街机消除游戏 **Plox(Columns 玩法)** 的单人复刻版。
竖排掉落 3 个随机颜色的方块,横 / 竖 / 斜任意方向凑齐 **3 个同色**即消除,可连锁得分,方块爆顶则游戏结束。

整个游戏是 **一个 `index.html` 文件**,纯原生 JavaScript + Canvas,无需安装、无需编译,双击即玩,手机电脑通用。

---

## 怎么玩

| 操作 | 电脑 | 手机 |
|---|---|---|
| 左右移动 | `←` `→` | 左右滑动 / 底部按钮 |
| 旋转(色块上下循环) | `↑` 或 `X` | 轻点屏幕 / 旋转按钮 |
| 加速下落 | 按住 `↓` | — |
| 速降到底 | `空格` | 向下滑动 / 速降按钮 |
| 暂停 | `P` | 顶部 ⏸ 按钮 |

- **落点预览(👻)**:显示方块会落到哪里,可在顶部开关。
- **连锁(Combo)**:一次消除后方块下落又凑成新的消除,倍率叠加,分数翻倍。
- 一次消除超过 3 个(对应原版"junk")有额外奖励分。
- 等级随消除数提升,方块越掉越快。
- 最高分自动存在浏览器本地(localStorage)。

---

## 怎么发给大家在线玩(三选一)

### ① 最快:Netlify Drop(零配置,1 分钟出链接)
1. 打开 https://app.netlify.com/drop
2. 把整个 `plox` 文件夹直接拖进去
3. 立刻得到一个公开链接(如 `https://xxx.netlify.app`),发给任何人即可玩

### ② 永久免费:GitHub Pages
1. 新建一个 GitHub 仓库,把 `index.html` 传上去
2. 仓库 Settings → Pages → Source 选 `main` 分支、根目录 → Save
3. 几十秒后得到 `https://你的用户名.github.io/仓库名/` 链接

### ③ 其他一键平台
- **Vercel** / **Cloudflare Pages**:连接仓库或拖文件夹,自动部署
- **itch.io**:做游戏分享的平台,上传 zip 即可,自带游戏页

> 只想本地试玩 / 发文件:直接把 `index.html` 发给对方,双击用浏览器打开就能玩。

---

## 本地预览(可选)
直接双击 `index.html` 即可。若想用本地服务器:
```bash
python -m http.server 5599
# 然后浏览器打开 http://localhost:5599
```

---

## 想改的地方(都在 index.html 顶部 `配置` 区)
- `COLS` / `ROWS`:棋盘列数 / 行数
- `COLORS`:颜色种类(数量越多越难)
- `dropInterval`:初始下落速度
- 等级提速、计分规则在 `beginResolve()` 里
