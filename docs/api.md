# Class Display System API 接口文档

## 📋 文档信息

- **版本**: V2.2.1（V2.2 基线 + V2.2.1 错误码/D-04 订正，见 §10 变更记录）
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

### 4.5 设备当前状态（降级轮询用）
```
GET /devices/{deviceId}/state
```
当 MQTT 不可用时，控制端以 2 秒间隔轮询此接口（PRD 风险表：MQTT 失败回退轮询）。

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
- 兜底：`cast` / `article` 下 `POST /control/player/play`、`/control/player/resume` → **4096 `audio_blocked_by_scene`**，且**不下发**对应 `player.*` 下行
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

- **V2.2.1 (2026-11-18)**：错误码与 D-04 口径订正。① §4 投屏 URL 过期 `ack 4004` → **4007**（4004 是"音频地址不可达"）；② §9 新增 4094 限流 / 4095 音频锚点被占 / 4096 `audio_blocked_by_scene`，包络新增可选 `error`；③「投屏与音乐的关系」按 V2.1.2 反转（编排层 pause-first、`cast.end` 不续播）；④ 文档信息头由 V2.2 / 2026-11-17 更正为 **V2.2.1 / 2026-11-18**（此前正文已改、头未改，属 R-02：按头回溯会判成「这条口径不存在」）。
- **V2.2 (2026-11-17)**：落地裁决 D-01~D-04。补 `POST /cast/presign`（上传/播放两类 URL 分开签发，供 `docs/前端设计.md` §7.5 使用）；章列表强制分页；`cast.start` 补充 `contentUrl` 与 R2 预签名四条硬约束（私有/只读/≤10 分钟/按 deviceCode 授权）＋错误码 4093；**删除"投屏期间音乐自动暂停"**，明确投屏与音乐相互独立、`cast.start` 无 `player.*` 副作用，控制台仅提示"音乐播放中"。
- **V2.1 (2026-11-17)**：与 PRD V1.1 对齐，删除文章朗读/语速/音量相关接口；文章改为书卷→章→节导航 + 检索 + 阅读位置；补全第三方映射与错误码
- **V2.0 (2026-11-17)**：初版，含音乐/文章/设备三组接口
