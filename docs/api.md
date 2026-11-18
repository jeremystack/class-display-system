# Class Display System API 接口文档

## 📋 文档信息

- **版本**: V2.2.4（V2.2 基线 + V2.2.2 §4.5 响应体 / 兜底路由订正 + V2.2.3 字段语义定稿 + V2.2.4 §4.4 `online` 口径对齐，见 §10 变更记录）
- **更新日期**: 2026-11-18
- **基础路径**: `/api/v1`
- **维护人**: 软件开发工程师（接口实现）、软件产品设计（接口定义）

> 口径说明：本文档只描述**音乐播放**与**文章人工阅读导航**两类能力。文章模块**没有**朗读控制、语速调节、音量调节接口——文章是人工阅读，不产生音频。

---

## 0. 通用约定

### 0.1 认证
除 `POST /auth/login` 与 `POST /devices/register` 外，所有接口需要：

```
Authorization: Bearer <JWT>
```

### 0.2 响应包络
```json
{ "code": 0, "msg": "ok", "data": {}, "ts": 1763350000000 }
```
- `code = 0` 表示成功，其余见 §9 错误码
- 时间为 Unix 毫秒时间戳

### 0.3 分页
请求：`?pageNum=1&pageSize=50`（pageSize 上限 200）
响应：`{ "total": 1223, "pageNum": 1, "pageSize": 50, "rows": [] }`

---

## 1. 认证

### 1.1 登录
```
POST /auth/login
```
```json
{ "username": "teacher", "password": "********" }
```
```json
{
  "code": 0,
  "msg": "ok",
  "data": {
    "token": "<JWT>",
    "expiresIn": 86400,
    "user": { "id": "user_001", "username": "teacher", "role": "teacher" }
  }
}
```

### 1.2 当前用户
```
GET /auth/me
```

> 密码一律 bcrypt 哈希存储，接口不返回 `password_hash`。

---

## 2. 音乐（第三方数据源同步 + 本地查询）

### 2.1 音乐分类
```
GET /music/categories?isUpper=1
```
```json
{
  "code": 0,
  "data": [
    { "id": 1, "name": "专用1", "isUpper": 1, "starOrder": 0 },
    { "id": 2, "name": "专用2", "isUpper": 1, "starOrder": 0 }
  ]
}
```
映射第三方：`GET {MUSIC_BASE}/ry-api/start/shijidb/list?pageNum=1&pageSize=100&isUpper=1`

### 2.2 音乐列表
```
GET /music/list?categoryId=&pageNum=1&pageSize=50&keyword=&includeAd=false
```
```json
{
  "code": 0,
  "data": {
    "total": 1223,
    "rows": [
      { "id": "f3f9f5b21b630e07d99f01c5b7778aa5", "title": "歌名001",
        "xuhao": 141, "shijiIndex": 0, "years": "2026", "categoryId": "1" }
    ]
  }
}
```
- `includeAd=false`（默认）过滤 `isad = true` 的广告曲目
- 列表不返回歌词与音频地址，避免大包体

### 2.3 音乐详情
```
GET /music/{id}
```
```json
{
  "code": 0,
  "data": {
    "id": "6a5347b1bcda6f19ab37bdb317671b50",
    "fullTitle": "001.歌名001",
    "title": "歌名001",
    "xuhao": 1,
    "years": "2026",
    "categoryName": "专用1",
    "audioUrl": "https://xxx.xxx.top/assets/xxxx.mp3",
    "accompanimentUrl": "https://xxx.xxx.top/assets/xxxx.mp3",
    "coverUrl": "https://xxx.xxx.top/assets/xxxx.jpg",
    "sheetMusicUrl": "https://xxx.xxx.top/assets/xxxx.jpg",
    "lyric": "宇宙广阔无垠，\n世界遍满祂的大能",
    "lrc": "[00:11.85][01:38.76]宇宙广阔无垠\r\n",
    "isad": 0
  }
}
```
映射第三方：`GET {MUSIC_BASE}/ry-api/start/zanmei/sgb/{id}` 的 `dmturl` 对象。

### 2.4 触发同步（管理员）
```
POST /admin/music/sync
{ "mode": "full" }
```
```json
{ "code": 0, "data": { "inserted": 1223, "updated": 0, "skippedAd": 12, "durationMs": 8421 } }
```
- `mode`: `full` | `incremental`
- 同步结果写入 `music_items`，失败按指数退避重试 3 次，第三次失败保留旧数据并告警

---

## 3. 文章（人工阅读导航，无播放）

> 本组接口只做**导航与文本读取**。没有 `/articles/audio`、`/articles/speed`、`/articles/volume` 之类接口。

### 3.1 书卷列表
```
GET /articles/volumes?testamentSn=&keyword=
```
```json
{
  "code": 0,
  "data": [
    { "id": 18, "name": "约伯记", "nameShort": "伯", "pinyin": "yueboji",
      "pinyinShort": "ybj", "volumeSn": 18, "chapterTotal": 42, "testamentSn": 1 }
  ]
}
```

### 3.2 章列表（按 volume_id 聚合 chapter_sn 派生）
```
GET /articles/volumes/{volumeId}/chapters?pageNum=1&pageSize=100
```
```json
{
  "code": 0,
  "data": {
    "total": 42, "pageNum": 1, "pageSize": 100,
    "rows": [ { "chapterSn": 1, "verseCount": 22 }, { "chapterSn": 2, "verseCount": 13 } ]
  }
}
```
实现：`SELECT chapter_sn, COUNT(*) AS verse_count FROM wenzhang_verses WHERE volume_id = ? GROUP BY chapter_sn ORDER BY chapter_sn LIMIT ? OFFSET ?`
- **必须分页**（D-01）：`pageSize` 默认 100、上限 200；诗篇等长卷不允许一次性全量返回
- 不自建 `chapters` 表，章是派生维度；`(volume_id, chapter_sn)` 天然由经节表约束，不额外造索引

### 3.3 章内容（经文）
```
GET /articles/volumes/{volumeId}/chapters/{chapterSn}
```
```json
{
  "code": 0,
  "data": {
    "volumeId": 18, "volumeName": "约伯记", "chapterSn": 1,
    "verses": [ { "verseSn": 1, "text": "乌斯地有一个人名叫约伯……" } ]
  }
}
```

### 3.4 全文检索
```
GET /articles/search?q=恩典&volumeId=&pageNum=1&pageSize=50
```
- D1 不支持 FTS5，采用 `verse_txt LIKE '%q%'` + 结果上限保护；后续可引 R2/外部索引（见 database.md 限制表）

### 3.5 阅读位置（书签）
```
PUT /articles/position
{ "volumeId": 18, "chapterSn": 3, "anchorVerseSn": 12 }
```
```json
{ "code": 0, "data": { "saved": true } }
```
- 仅记录"读到哪里"，与 `playback_state` 无关
- 客户端可先用 localStorage 兜底，跨端同步再读此接口

---

## 4. 设备（单控模式 + 设备码）

### 4.1 显示端注册
```
POST /devices/register
{ "deviceName": "显示端-01", "clientType": "browser", "fingerprint": "..." }
```
```json
{ "code": 0, "data": { "deviceId": "dev_001", "deviceCode": "482913", "codeExpiresAt": 1763350300000 } }
```
- `deviceCode` 6 位数字，30 秒刷新（见 PRD 3.2），仅用于**首次绑定**

### 4.2 控制端绑定（单控）
```
POST /devices/bind
{ "deviceCode": "482913" }
```
```json
{ "code": 0, "data": { "deviceId": "dev_001", "bound": true, "ownerId": "user_001" } }
```
- 设备已被他人绑定时返回 `4091 设备已被占用`，需先解绑

### 4.3 解绑
```
POST /devices/unbind
{ "deviceId": "dev_001" }
```

### 4.4 设备列表与状态
```
GET /devices/list
```
```json
{
  "code": 0,
  "data": [
    { "deviceId": "dev_001", "deviceName": "显示端-01", "online": true,
      "lastSeenAt": 1763350000000, "nowPlaying": { "type": "music", "id": "f3f9..." } }
  ]
}
```

**`online` 口径（V2.2.4，与 §4.5 同口径，不得另立一套）**：`now − lastSeenAt ≤ 75s`（25s `device.ping` × 3 次无 `pong` 判链路异常）**且** broker 侧该 `deviceId` 无存活连接；两者缺一即 `false`。**不得转抄 retained `presence` / `state`**——显示端离线时 retained 仍是最后一条 `online:true`，照抄会让断线的屏永远显示在线。`lastSeenAt` 由心跳 / `presence` 更新，与 §4.5 的 L2 同源。

### 4.5 设备当前状态（降级轮询用）
```
GET /devices/{deviceId}/state
```
当 MQTT 不可用时，控制端以 2 秒间隔轮询此接口（PRD 风险表：MQTT 失败回退轮询）。**MQTT 恢复后必须停止轮询**——两条通道并存时，样式变更/翻页后短暂会出现两个不同页号，控制台会抖。

#### 响应体（V2.2.3 定稿：产品 V2.1.24 已确认字段语义）
```json
{
  "code": 0, "msg": "ok", "ts": 1763350042000,
  "data": {
    "deviceId": "dev_001",
    "online": true,
    "scene": "article",
    "owner": "user_001",
    "lastSeenAt": 1763350042000,
    "stateTs": 1763350040000,
    "nowPlaying": { "type": "music", "id": "f3f9...", "positionMs": 42500, "isPlaying": true, "volume": 50 },
    "pageMap": { "anchor": { "verseSn": 12, "charOffset": 0 }, "pageIndex": 2, "pageCount": 12,
                 "unit": "page", "sectionIndex": 3, "sectionCount": 6, "viewLines": 5 },
    "viewing": { "volumeId": 18, "chapterSn": 3, "anchorVerseSn": 12 },
    "layout": { "availW": 1728, "availH": 902, "fontSizePx": 72, "lineHeight": 1.75, "charsPerLine": 24 }
  }
}
```

**字段按三层分源，不得混用**：本接口把「MQTT 上行」搬成「HTTP 快照」，最容易出的错就是顺手造出第二套定义。

| 层 | 字段 | 来源 | 硬约束 |
|---|---|---|---|
| **L1 照搬** | `nowPlaying`、`pageMap`、`viewing`、`layout` | 该设备最后一条 `state.report`（retain） | 与 `mqtt.md` §4.4 **同名同形**：`pageMap` 恒 **7 字段**、`viewing` 恒 **3 字段**（`volumeId`/`chapterSn`/`anchorVerseSn`）、`layout` 恒 **5 项**、`nowPlaying` 字段集不变。**不改名、不裁剪、不补默认值**；要加字段先在 `mqtt.md` 立定义，再搬 |
| **L2 登记表** | `deviceId`、`owner`、`scene`、`lastSeenAt`、`stateTs` | 服务端 `devices` 表 + 已处理的最大 `ts` | `owner` ＝ `devices.user_id`；`lastSeenAt` 由心跳 / `presence` 更新；`stateTs` ＝ 最后一条**通过过期检查**的 report 的 `ts` |
| **L3 派生** | `online` | `presence` / 心跳 | **禁止转抄 `state.report.online`**，见下条 |

- **`online` 必须独立判定，不得取自 retained `state`**：`mqtt.md` §4.4 已写明「显示端离线时 retained `state` 仍是最后一条 `online:true`」，照抄会让断线的屏永远显示在线——这正是「同一事实两处定义」换个形式再来。口径：`now − lastSeenAt ≤ 75s`（25s `device.ping` × 3 次无 `pong` 判链路异常）**且** broker 侧该 `deviceId` 无存活连接；两者缺一即为 `false`。**边界（V2.2.3）**：`online:false` 时**不得**把 `lastSeenAt`/`stateTs`/四个 L1 字段一并置 `null`——断线前的最后状态必须留着，否则控制台无法解释「屏上为什么还停在那篇文章」。`online` 与 `stateTs` **互不替代**：前者答「设备是否在线」，后者答「这条状态多久以前」。
- **无上报时四个 L1 字段必须是 `null`，不得伪造**：设备刚注册从未上报、或 retained `state` 已被清空时，`nowPlaying` / `pageMap` / `viewing` / `layout` 一律 `null`（不是 `{}`、不是全 `0`）。控制台显示「等待显示端上报」，且 `c_max` 按「未收到 `layout`」处理——回退 1728 并标注「估算」（同 `mqtt.md` §4.6）。
- **`stateTs` 为何要单列**：轮询是 2s，而上报是 5s（音乐）或「位置变化才报」（文章），**轮询频率 ≠ 数据新鲜度**。没有 `stateTs`，控制台无法区分「设备在线但 state 是三分钟前的」与「刚报的」；不得用包络的 `ts`（响应生成时间）冒充上报时间。**不得用一个统一阈值判过期（V2.2.3，产品 V2.1.24 补）**：`mqtt.md` §4.4 明写文章只在切章/位置变化时才上报，统一阈值会把正常的文章场景全判成陈旧。钉死为：`scene=music` ⇒ `now − stateTs > 15s` 标「快照 N 秒前」；`article`/`cast`/`standby` **不按时间判过期**，但始终随附 `stateTs` 的相对时间。
- **过期 / 乱序上报的裁剪只在写入侧做一次**：按 `deviceId` 维护「已处理的最大 `ts`」，丢弃 `ts` 更小的 report（手机切网重连会重发，见 `mqtt.md` §4.4）。REST 只返回**裁剪后**的当前值，不得返回未经检查的乱序 report——否则轮询与 MQTT 两条通道会给出互相矛盾的页号（现场症状是「页码倒退几秒」）。**判据（V2.2.3）**：构造一条 `ts` 倒退的 report，两条通道的 `pageIndex` 都不得后退。
- **`viewing` 进 L1（V2.2.3 订正，原写「暂不进」）**：`viewing{volumeId, chapterSn, anchorVerseSn}` 本来就在 `mqtt.md` §4.4 的 `state.report` 里，搬它不需改任何协议，属「L1 照搬」范畴。排除它的代价是：`pageMap.anchor` 只有 `{verseSn, charOffset}`，**没有 `volumeId`/`chapterSn`** ⇒ 轮询降级时控制台丢掉「哪一章」；§3.5 的 `PUT /articles/position` 是**控制指令**、不是设备当前视图，替代不了。无上报时 `viewing` 同其他 L1 字段为 `null`。
- **`casting` / `appVersion` 不进本响应**：`casting` 由 `scene == "cast"` 推得，`appVersion` 由运维侧登记；两者都不从 `state.report` 搬，避免这里先长出第二套。要加先改 `mqtt.md` §4.4。
- **只读**：本接口不产生下行、不改 `playback_state`。控制指令走 §5，降级期间 §5 响应 `delivered: "polling"`。
- **权限**：`device.user_id == token.sub`，否则 `1003`；设备不存在 `1002`。
- **不得把 `nowPlaying` 当播放位置的权威来源**：`playback_state` 只由控制页 REST 播放控制写入（`mqtt.md` §4.4），此处仅供展示与对账。

---

## 5. 音乐播放控制（仅音乐）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/control/play` | 播放指定曲目，`{ deviceId, musicId, positionMs }` |
| POST | `/control/pause` | 暂停 |
| POST | `/control/resume` | 继续 |
| POST | `/control/seek` | 跳转，`{ deviceId, positionMs }`（毫秒级） |
| POST | `/control/volume` | 音量，`{ deviceId, volume }` 0-100 |
| POST | `/control/stop` | 停止 |
| POST | `/control/track` | 切主音轨 / 伴奏，`{ deviceId, track: "main" \| "accompaniment" }` |

统一响应：
```json
{ "code": 0, "data": { "accepted": true, "msgId": "m-8f2c1a", "delivered": "mqtt" } }
```
`delivered`: `mqtt` | `polling`（降级）

### 5.1 播放列表
```
GET  /playlists
POST /playlists        { "name": "周日崇拜", "musicIds": ["id1","id2"] }
POST /playlists/{id}/items  { "musicId": "id3", "position": 2 }
DELETE /playlists/{id}/items/{musicId}
```

---

## 6. 板书投屏（手动触发）

```
POST /cast/start
{ "deviceId": "dev_001", "contentType": "text" | "image" | "pdf", "content": "...", "fullScreen": true }
```
```json
{ "code": 0, "data": { "castId": "cast_01", "accepted": true } }
```
```
POST /cast/end
{ "deviceId": "dev_001" }
```

#### 投屏素材上传：申请预签名（`image` / `pdf`）
```
POST /cast/presign
{ "deviceId": "dev_001", "contentType": "pdf", "fileName": "board.pdf", "sizeBytes": 1048576 }
```
```json
{
  "code": 0,
  "data": {
    "assetId": "asset_7f1c",
    "uploadUrl": "https://<r2-private>.r2.cloudflarestorage.com/cast/asset_7f1c.pdf?X-Amz-Expires=300&...",
    "uploadMethod": "PUT",
    "uploadExpiresIn": 300,
    "contentUrl": "https://<r2-private>.r2.cloudflarestorage.com/cast/asset_7f1c.pdf?X-Amz-Expires=600&...",
    "contentExpiresIn": 600
  }
}
```
- 顺序：`presign` → 控制台 `PUT uploadUrl` 上传字节 → `POST /cast/start { contentUrl }`
- `uploadUrl`（控制台用，写权限，≤5 分钟）与 `contentUrl`（显示端用，只读，≤10 分钟）**分开签发**，互不复用
- `sizeBytes` 上限 20MB；超限 2001；`contentType` 与 `fileName` 扩展名必须匹配，否则 2001
- `contentUrl` 按 `deviceCode` 授权，只对本次投屏有效（D-03）

#### 内容载荷与 R2 预签名（D-03）
- `text` 直接内联 `content`（建议 ≤32KB）
- `image` / `pdf` 走 R2 预签名 URL：请求体传 `contentUrl` 而不是 `content`
  ```
  POST /cast/start
  { "deviceId": "dev_001", "contentType": "pdf", "contentUrl": "<预签名 URL>", "fullScreen": true }
  ```
- 预签名规则（硬约束）：
  - bucket **私有**，不开启公共读；URL 只读（`GET`），禁止 `PUT/DELETE`
  - 有效期 **≤10 分钟**（默认 600s）；显示端不得转存到任何公共位置，也不得长期缓存
  - 授权按 `deviceCode` 维度签发，URL 只对目标设备那一次投屏有效
  - 过期或被拒 → 显示端 `ack { code: 4007 }`（V2.3 新增码；**不得沿用 4004**——4004 在 `mqtt.md` §8 是"音频地址不可达"），控制台重新申请（错误码 4093）

#### 投屏与音乐的关系（D-04 已废弃；按 V2.1.2 定稿，2026-11-18）
- `cast.start` / `cast.end` **不产生任何 `player.*` 副作用**（服务端不隐式暂停、不改音量、不动播放位置）——此句不变
- **`cast` 场景下不得有音乐**（Jeremyzh「板书时不要放配乐」）：禁在**编排层**——先 `player.pause`、收 `ack{ok:true}` 再 `cast.start`；`pause` 未确认则不进入 `cast`
- `cast.end` **不自动续播**，落回 `standby`（`standby` 允许背景音乐）。原文"按进入投屏前的状态复原"作废：`standby` 下不自动 `resume`
- 兜底：`cast` / `article` 下 `POST /control/play`、`/control/resume` → **4096 `audio_blocked_by_scene`**，且**不下发**对应 `player.*` 下行（V2.2.2 订正：原文写作 `/control/player/play`、`/control/player/resume`，与 §5 路由表不符，且这两个路径在全文别处不存在——MQTT 侧才是 `player.play` / `player.resume`，REST 侧没有 `player/` 段）
- 前提修正：V2.1 起 `display` 无 `<audio>`、永不发声（声音在控制页），"投屏期间音乐继续播放"不再是协议行为，而是被业务禁止

#### 其它限制
- 只投屏已有内容，**不支持实时书写同步**（PRD 2.3 限制）

---

## 7. 第三方数据映射总表

| 第三方字段 | 本地字段 | 说明 |
|-----------|---------|------|
| `id` | `music_items.id` | 字符串 ID |
| `title` | `title` | 曲名 |
| `full_title` | `full_title` | 带序号全名 |
| `shiji_index` / `xuhao` | `shiji_index` / `xuhao` | 排序与编号 |
| `years` | `years` | 年份 |
| `shijiname` | 分类名 | 对应 `music_categories.name` |
| `dmturl.adUrl` | `audio_url` | 主音频 |
| `dmturl.banZouUrl` | `accompaniment_url` | 伴奏 |
| `dmturl.gepuUrl` / `enGePuUrl` | `cover_url` / 乐谱图 | 乐谱图 |
| `dmturl.lyric` | `lyric` | 纯文本歌词 |
| `dmturl.lrc` | `lrc` | LRC 时间轴歌词 |
| `isad` | `isad` | 广告标记，默认过滤 |

第三方基址走环境变量 `MUSIC_BASE_URL`，禁止硬编码域名。

---

## 8. 安全

- 全部写操作走 JWT + 设备归属校验（`device.user_id == token.sub`）
- 设备码 30 秒过期，一次性使用
- 控制接口限流：单设备 20 req/s
- 第三方同步接口仅 `role=admin`

---

## 9. 错误码

| code | 含义 | HTTP |
|------|------|------|
| 0 | 成功 | 200 |
| 1001 | 未授权 / token 过期 | 401 |
| 1002 | 资源不存在 | 404 |
| 1003 | 无权限（非设备所有者） | 403 |
| 2001 | 参数错误 | 400 |
| 2002 | 分页参数越界 | 400 |
| 3001 | 服务器内部错误 | 500 |
| 3002 | 第三方音乐接口失败 | 502 |
| 4091 | 设备已被占用（单控冲突） | 409 |
| 4092 | 设备码无效或已过期 | 410 |
| 4093 | 投屏内容 URL 无效 / 预签名已过期，需重新申请 | 410 |
| 4094 | 尝试过于频繁（控制码按 IP 10 次/分钟；指数退避） | 429 |
| 4095 | 音频锚点已被其他终端占用（另一窗口/终端正在播放） | 409 |
| 4096 | 当前场景禁止起音乐（`error: "audio_blocked_by_scene"`） | 409 |

> **可选 `error` 字段（V2.3）**：包络可选新增机器名 `error`，例 `{code:4096, error:"audio_blocked_by_scene", msg:"板书/文章期间不播放音乐"}`。只增不改：无此字段时前端按 `code` 路由，旧行为不变。

---

## 10. 变更记录

- **V2.2.4 (2026-11-18)**：**§4.4 `GET /devices/list` 的 `online` 口径对齐 §4.5**（产品 V2.1.25，commit `706e2f5` 要求：控制台取「台数 N」用本接口，两处 `online` 不得各说各话）。① §4.4 补口径句：`now − lastSeenAt ≤ 75s` **且** broker 侧无存活连接，两者缺一即 `false`；**不得转抄 retained `presence`/`state`**。② 文档信息头版本回填 **V2.2.2 → V2.2.4**（V2.2.3 已改正文与变更记录但漏改头，按头回溯会判成「这条口径不存在」，同 R-02）。**零 schema 变更**：`/devices/list` 响应形状不动，不新增错误码。
- **V2.2.3 (2026-11-18)**：**§4.5 响应体按产品 V2.1.24 确认定稿**（变更单 §4.24，commit `dfe423a`）。① `viewing` **进 L1**（原写「暂不进」）：`viewing` 本来就在 `mqtt.md` §4.4 的 `state.report` 里，而 `pageMap.anchor` 缺 `volumeId`/`chapterSn`，轮询降级会丢「哪一章」；`casting`（由 `scene=="cast"` 推得）/ `appVersion`（运维登记）**仍不进**。② `stateTs` **不得用统一阈值判过期**：`scene=music` ⇒ `>15s` 标「快照 N 秒前」，`article`/`cast`/`standby` 不按时间判、只附相对时间（文章只在切章/位置变化时上报，统一阈值会把正常场景判成陈旧）。③ `online:false` 时**不得清空** `lastSeenAt`/`stateTs`/L1 字段，且 `online` 与 `stateTs` 互不替代。④ 乱序裁剪补判据：构造 `ts` 倒退的 report，两条通道 `pageIndex` 都不得后退。⑤ 无上报时 **四个** L1 字段为 `null`（含 `viewing`）。**零 schema 变更**，`state.report` 形状不动，不新增错误码。
- **V2.2.2 (2026-11-18)**：**`GET /devices/{deviceId}/state` 补齐响应体 + 兜底路由订正**（Chief 19:28 分工：开发起草 / 产品确认字段语义 / 运维出断言；起因：产品 V2.1.18 核实「`layout` 缺口在 REST 不在协议」，本文件 `layout` 曾 0 命中、§4.5 只有路由无响应体）。① 响应体字段**三层分源**：L1 `nowPlaying`/`pageMap`/`layout` 从 `state.report` **同名同形照搬**（`pageMap` 恒 7 字段、`layout` 恒 5 项；不改名/不裁剪/不补默认值），L2 `deviceId`/`owner`/`scene`/`lastSeenAt`/`stateTs` 由服务端登记表给出，L3 `online` 由 `presence`/心跳派生；② 明令 **`online` 不得转抄 `state.report.online`**（retained `state` 离线仍是 `online:true`），口径 `now − lastSeenAt ≤ 75s` **且** broker 侧无存活连接；③ 无上报时 L1 三字段为 `null`（不得伪造 `{}`/`0`），控制台 `c_max` 回退 1728 并标「估算」；④ 新增 `stateTs`（轮询 2s ≠ 上报 5s，无它无法判新鲜度，且不得用包络 `ts` 冒充）；⑤ 过期/乱序 report 的丢弃在写入侧做一次，REST 只返回裁剪后的当前值；⑥ `viewing`/`casting`/`appVersion` 暂不进本响应（要加先改 `mqtt.md` §4.4）；⑦ 订正 §4「投屏与音乐的关系」兜底行：`/control/player/play`、`/control/player/resume` → **`/control/play`、`/control/resume`**（与 §5 路由表一致；REST 侧没有 `player/` 段，`player.*` 是 MQTT 术语）。**零 schema 变更**，`state.report` 形状不动，不新增错误码。
- **V2.2.1 (2026-11-18)**：错误码与 D-04 口径订正。① §4 投屏 URL 过期 `ack 4004` → **4007**（4004 是"音频地址不可达"）；② §9 新增 4094 限流 / 4095 音频锚点被占 / 4096 `audio_blocked_by_scene`，包络新增可选 `error`；③「投屏与音乐的关系」按 V2.1.2 反转（编排层 pause-first、`cast.end` 不续播）；④ 文档信息头由 V2.2 / 2026-11-17 更正为 **V2.2.1 / 2026-11-18**（此前正文已改、头未改，属 R-02：按头回溯会判成「这条口径不存在」）。
- **V2.2 (2026-11-17)**：落地裁决 D-01~D-04。补 `POST /cast/presign`（上传/播放两类 URL 分开签发，供 `docs/前端设计.md` §7.5 使用）；章列表强制分页；`cast.start` 补充 `contentUrl` 与 R2 预签名四条硬约束（私有/只读/≤10 分钟/按 deviceCode 授权）＋错误码 4093；**删除"投屏期间音乐自动暂停"**，明确投屏与音乐相互独立、`cast.start` 无 `player.*` 副作用，控制台仅提示"音乐播放中"。
- **V2.1 (2026-11-17)**：与 PRD V1.1 对齐，删除文章朗读/语速/音量相关接口；文章改为书卷→章→节导航 + 检索 + 阅读位置；补全第三方映射与错误码
- **V2.0 (2026-11-17)**：初版，含音乐/文章/设备三组接口
