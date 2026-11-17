# Class Display System API 接口文档

## 📋 文档信息

- **版本**: V2.1（与 PRD V1.1、database.md V2.1 对齐）
- **更新日期**: 2026-11-17
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
GET /articles/volumes/{volumeId}/chapters
```
```json
{ "code": 0, "data": [ { "chapterSn": 1, "verseCount": 22 }, { "chapterSn": 2, "verseCount": 13 } ] }
```
实现：`SELECT chapter_sn, COUNT(*) FROM wenzhang_verses WHERE volume_id = ? GROUP BY chapter_sn ORDER BY chapter_sn`
（不自建 chapters 表，章是派生维度）

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
- 只投屏已有内容，**不支持实时书写同步**（PRD 2.3 限制）
- 投屏期间音乐自动暂停（产品规则，待确认 9.1）

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

---

## 10. 变更记录

- **V2.1 (2026-11-17)**：与 PRD V1.1 对齐，删除文章朗读/语速/音量相关接口；文章改为书卷→章→节导航 + 检索 + 阅读位置；补全第三方映射与错误码
- **V2.0 (2026-11-17)**：初版，含音乐/文章/设备三组接口
