# KAI Play（算力局）

一个免费开局、服务端判定并支持断线恢复的原创多游戏产品。历史字段 `balance` 在产品中统一解释为“竞技分”，不可充值、提现、转让或兑换。KAI 卡时只允许购买未来可明确交付的 AI、托管和个性化服务，不参与牌局输赢；当前版本没有真实卡时扣减。

## 当前闭环

- 游客身份与 10,000 初始竞技分
- 可完整进行的斗地主：一名玩家和两名服务端机器人，或六位房号好友房与机器人补位
- 八款即开即玩的 Web 玩法：斗地主竞技局，以及 KAI 象棋、四人基础麻将、1048 数字合并、6×6 KAI 数独、KAI 扫雷、炸金花和算力转轮七款免费训练
- KAI 数独支持入门/标准/挑战、每日一局、候选笔记、撤销、提示、最佳用时与本地自动保存
- KAI 象棋提供 9×10 棋盘的人机对弈，由玩家执红先行；规则、机器人与进度均在本地运行，不请求竞技结算
- KAI 扫雷提供本地单人逻辑训练、旗标和自动存档；玩法不请求竞技结算，也不改变竞技分
- 定主位、三张增补牌、组合牌型、特殊组合翻倍和零和结算
- 服务端权威校验、顺序号防陈旧写入、带载荷指纹的幂等动作
- 开局牌序哈希承诺，结束后公开 nonce 与牌序供复核
- Expo SDK 57 移动端大厅、牌桌、好友房、战绩和规则说明
- 零依赖 Web 界面，通过同源代理连接同一套服务端
- 默认关闭的 CloudPay 卡时计费骨架；沙盒模式也不会发起真实支付或访问 CloudPay

## 本地运行

要求 Node.js 22.18+。首次克隆后，在仓库根目录安装移动端锁定依赖：

```powershell
cd KAI-Play-repo
npm ci --prefix mobile
```

浏览器版本使用同源 `/api` 代理。在两个终端从仓库根目录启动：

```powershell
npm run server
```

```powershell
npm run web
```

打开 `http://127.0.0.1:8081/`。Web 默认把 `/api` 代理到 `http://127.0.0.1:4310`；后端使用其他端口时设置 `DOUJOY_WEB_UPSTREAM`。

移动端从 `mobile` 目录启动：

```powershell
cd mobile
npx expo start
```

Android 模拟器默认访问 `http://10.0.2.2:4310`；iOS 模拟器默认访问 `http://127.0.0.1:4310`。真机调试时设置 `EXPO_PUBLIC_DOUJOY_API_URL=http://你的电脑局域网IP:4310`。

## 容器运行

```powershell
docker compose up --build
```

容器同时启动游戏服务端和浏览器界面。默认仅绑定本机：界面为 `http://127.0.0.1:8081`，API 为 `http://127.0.0.1:4310`；状态写入独立的 `doujoy-data` 卷。公网部署必须使用会覆盖 `X-Forwarded-For` 的 HTTPS 反向代理，并将 `DOUJOY_CORS_ORIGIN` 设置为实际 Web 来源；同时仅在这条受控链路上设置 `DOUJOY_WEB_TRUST_PROXY=true`。生产模式缺少 CORS 来源时服务端会拒绝启动。

单机存储会写入带版本与校验和的原子快照，并默认保留三代滚动备份。该模式只支持一个服务端实例；多实例或跨机器容灾必须迁移到事务数据库。

## 构建与验证

```powershell
npm run build
npm run verify
npm run test:coverage
```

`build` 会检查服务端和 Web 的 Node 可执行语法，并执行移动端 TypeScript 检查；`verify` 还会运行带 90%/80%/90% 门槛的覆盖率测试、规则完整性与发布预检。CI 配置会在每次提交和拉取请求中重复这些步骤，校验 Compose、构建两个容器镜像，并启动整套服务冒烟 `/health`、Web 代理和视觉资产；首次推送后仍应以 GitHub Actions 的实际结果为准。

本仓库不包含真实卡时扣减、充值、提现、链上 Token、玩家间转账或随机现实价值奖励。真实 CloudPay 接入前必须迁移到 PostgreSQL 事务账本、完成服务间认证与 Webhook 签名、关闭沙盒完成入口，并取得产品、安全和法务批准。

更多资料：

- [产品范围](docs/PRODUCT.md)
- [KAI Play 第一阶段产品规范](docs/KAI_PLAY_PRODUCT.md)
- [CloudPay 计费边界](docs/CLOUDPAY_BILLING.md)
- [安全与公平](docs/SECURITY.md)
- [单机部署与数据恢复](docs/DEPLOYMENT.md)
- [工程质量与容量边界](docs/ENGINEERING_QUALITY.md)
- [第三方素材与许可声明](THIRD_PARTY_NOTICES.md)
- [隐私说明](docs/PRIVACY.md)
- [用户规则](docs/TERMS.md)
