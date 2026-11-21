# `src/api/` —— CDS API 业务端点（devices/register · devices/me · devices/list）

**状态**：可在本机跑通单测（25/25），**未部署、未合并 main**。落在分支上，main 锚点 `3fcab2a5` 不动。
**依据**：`docs/api.md` V2.2.20（§4.1 注册 / §4.6 自检 / §4.4 列表 / §9 错误码 / §0.1 凭据 / §0.2 包络）；DDL 依据 `migrations/0005`（`control_codes` / `device_bindings` / `device_bind_events`）与 `migrations/0001`（`devices`）。

```
src/api/
├── index.js                 路由 + CORS + 异常兜底（/health 与运维骨架逐字同形）
├── lib/
│   ├── crypto.js            sha256 / HMAC-SHA256 / deviceId / deviceToken（WebCrypto，零依赖）
│   ├── jwt.js               HS256 校验（控制端）
│   ├── deviceauth.js        Authorization: Device <token> 解析
│   ├── errors.js            §9 错误码 → HTTP 状态（唯一一张表）
│   ├── respond.js           §0.2 包络 + CORS 头
│   ├── validate.js          §4.1 入参校验 + 指纹键
│   ├── state.js             绑定三态判定 + online 合取判据（纯函数）
│   └── ratelimit.js         固定窗口 / 令牌桶（KV 或内存，**不碰 D1**）
└── routes/
    ├── devices-register.js  POST /devices/register
    ├── devices-me.js        GET  /devices/me
    └── devices-list.js      GET  /devices/list
test/api/
├── _stub.mjs                D1 替身（prepare/bind/first/all/run/batch）
├── libs.test.mjs            纯逻辑 13 例
└── routes.test.mjs          端点 12 例（直接打 worker fetch）
```

跑法：`npm test`（= `node --test test/api/`，Node ≥ 18，零 npm 依赖）。

## 一、三条端点做了什么（逐条对文档）

| 端点 | 会话要求 | 关键实现点 |
|---|---|---|
| `POST /devices/register` | 无鉴权（开放接口） | 幂等查指纹 → 双闸限流（**只对新注册**）→ 建行 + 建一条两列皆空的 `device_bindings` 行（`unbound`）→ 回长期 `deviceToken`（`tokenExpiresIn: 0`，明文只此一次） |
| `GET /devices/me` | `Authorization: Device <token>` | 只按凭据答「我这条绑定还有效吗」；路径/查询/请求体不带码、不带 `deviceId`；三态 + `reason`；`401` **仅**表示凭据不认识，且必带 `WWW-Authenticate: Device` |
| `GET /devices/list` | `Authorization: Bearer <JWT>` | 只回当前 `bound` 的台（列表条数＝控制台台数）；不新增 `state` 字段；`online` 两条件合取；`nowPlaying` 未落库时为 `null`（不得伪造 `{}`） |

细节对齐（都有单测钉住）：

- **凭据与授权分离**：`deviceToken` 是身份，不是授权；绑定状态一律查 `device_bindings`（不读 `devices.user_id`——V2.2.1 起该列停止写入，本实现建行时写 `NULL`）。
- **库内存哈希不存明文**：`token_hash = HMAC-SHA256(token, DEVICE_TOKEN_HMAC_KEY)`；未配 key 退回 `sha256(token)`（仅 staging，见 B-4）。
- **`device_code` 写哨兵**：`'x' + deviceId.replace(/^dev_/,'')`，列是 0001 的 `NOT NULL UNIQUE` 历史列，不改表结构（0005 附录 1 指定）。
- **指纹先哈希再落库**：`f_<sha256(fp|name+clientType) 前 40>`；同一台屏稳定、异屏分开，明文序列号不入库。
- **`me` 的「绑还在、码没了」**：`device_bindings` 有 bound 行但 `control_codes` 无该 `user_id` 行 ⇒ `state:"revoked"` + `reason:"code_rotated"`（V2.2.15）。
- **`reason` 不落表**：从 `device_bind_events` 最近一条 `action` 反推（`kick→kicked` / `code_rotate→code_rotated` / `unbind|auto_unbind→unbind`），无审计才兜底 `kicked`。
- **时间单位**：`devices.last_seen_at`、`bound_at`、`revoked_at` 都是**秒**（`unixepoch`）；响应一律毫秒。`online` 阈值 75s 按毫秒比较，换算写在 `routes/devices-list.js`。
- **限流不落 D1**：`RATE_KV` 有则 KV，无则 isolate 内存（内存那份计数跨请求共享，是模块级单例，否则等于没限流）。

## 二、需要裁决的 2 条（我不替你定，先按右边实现）

**D-1｜指纹命中要不要重发凭据？**
`§4.1` 只说「幂等：返回同一行、同一 `deviceId`，不计失败」，**没说要不要重发 token**。
本实现：**不重发**（`tokenReissued:false`、`deviceToken:null`）。理由：指纹可猜（`deviceName+clientType` 就能凑出来），命中即重发等于「知道你屏幕名字就能换走它的凭据、再把它绑到自己码上」。
代价：屏丢了 `localStorage` 里的 token 只能「注册为新设备」（`deviceId` 变），与 `§4.1` 末尾「丢了只能重新注册（会换 `deviceId`）」一致。
若你要求重发：改 `routes/devices-register.js` 一处（注释已标 `D-1`），但须同时给出「屏自证是本屏」的手段，否则不要开。

**D-2｜`register` 请求体字段以文档还是原型为准？**
文档 `{deviceName, clientType, fingerprint}`（本实现照文档）；原型 `prototype/console.html` 的 A5 发的是 `{label, ua}`。
按 2026-11-20 启动会「**以文档为准**」执行；原型那两处字段等解冻后改名，或服务端加兼容别名（一行）。**我没做兼容别名**——加了等于两个字段集长期并存。

## 三、上线前必须补的 4 个缺口（都不在我能单方面关掉的范围内）

**B-1｜`me` 的 `code_rotated` 副作用只判不写**
`§4.6` 要求命中「绑还在、码没了」时**同一事务**内：写 `device_bindings`（`user_id=NULL`、`revoked_at=now`）+ 覆盖 `cds/v1/d/{deviceId}/bind` 快照 + 清 `u/{userId}/state|presence/{deviceId}` 两条 retained。
Worker 里没有 MQTT 客户端，`EMQX` 管理 API（18083/443）运维侧目前 20s 超时 ⇒ 本实现**只做只读判定**，响应头 `x-cds-selfheal: pending` 标出「该补的副作用没补」。
不补的后果：同一台屏每次自检都回 `revoked/code_rotated`（判定正确），但 retained 快照仍是 `bound`、`presence` 仍残留 —— 其它消费方看到的还是「已绑」。**需要运维给一个发布出口**（EMQX HTTP API 或 Durable Object / Queues），我接上后把这段补成事务。

**B-2｜`list` 的 `online` 现在只有一个条件**
`§4.4` 要求 `now−lastSeen ≤ 75s` **且** broker 侧无存活连接，缺一即 `false`。目前没有 MQTT 桥写 `presence:{deviceId}`，`PRESENCE_KV` 未绑定时 `live=undefined` ⇒ 一律判**离线**（宁可把好的判坏，不把坏的判好），响应头 `x-cds-online-source: lastSeenOnly` 明示降级。
前置：运维给 KV 命名空间 + 一个「连接建立/断开写 presence」的桥（EMQX 的 `$SYS` 事件或 webhook 均可）。

**B-3｜注册限流的存储二选一还没定**
`§4.1` 明写**不得用 D1 计数**。现在是「KV 或内存」，两者都没配就是**每 isolate 各算一份**（约等于不设防）。上线前必须：① 运维配 Cloudflare 边缘速率规则（首选）；或 ② 给我一个 `RATE_KV` 绑定。响应头 `x-cds-ratelimit: kv|memory` 可自查走的是哪条。

**B-4｜`device_bind_events.user_id NOT NULL` 与「注册时尚无归属」冲突**
`0005` 的审计表 `user_id TEXT NOT NULL`，但 `token_issue` 事件发生在注册时（此时没有任何用户）。本实现因此**不在注册时写审计**（写了会 NULL 违约）。
这是 DDL 与协议的一处真实张力，建议 `0006` 放成 `user_id TEXT`（可空，`token_issue` 时为空）——**不改代码也能跑，但「发凭据」这件事今天没有审计**。

## 四、没做的（明确写出来，免得被当成半成品）

- `POST /devices/bind`、`/devices/unbind`、`/devices/me/release`、`/control-code*`、`/auth/login` 全部**未实现**（本次只接 11-20 启动会点名的三条）。没有 `bind` 就没有 `bound` 行，`list` 现学现用只能返回空数组——这是预期的。
- `list` 的 `nowPlaying` 恒 `null`：`state.report` 的落库（`playback_state`）不在本次范围。
- 没有 wrangler 配置改动：`wrangler.toml` 属运维侧；新增绑定需求见 B-2/B-3。
- 没有 `aud`/`iss` 校验：`§0.1` 未定义，加了会与现有签发端不兼容；等文档补。

## 五、与验收清单的接口（附录 I 锚点）

本目录入库后，附录 I 里这 3 行的「主体存在性锚点」开始成立（**0 命中判据仍需与锚点同一次执行**）：

| 附录 I # | 判据 | 锚点 | 本目录里成立的位置 |
|---|---|---|---|
| 2 | 控制码 8 位数字 | `rg -c 'control_codes' src/` ≥1 | `routes/devices-me.js`（`SELECT 1 FROM control_codes …`） |
| 3 | 绑定有效性只凭设备凭据 | `rg -c '/devices/me' src/` ≥1 | `index.js` 路由表 + `routes/devices-me.js` |
| 4 | 无「按码查状态」公开接口 | `rg -c '/control-code' src/` ≥1 | **尚未成立**（`/control-code` 未实现，本次范围外） |

⚠️ 分母**不因本分支变化**：`src/` 未并入 main 之前，33 条 `src/` 判据仍记「未可执行」，可判分母仍是 **238**；也不存在 242（242 是「只扣 33 条、没扣 4 条 P2」的旧算法，已被 V2.1.59 ④ 否掉）。
