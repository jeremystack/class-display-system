# Class Display System MQTT 通信协议

## 📋 文档信息

- **版本**: V2.2（与 PRD V1.1 对齐）
- **更新日期**: 2026-11-17
- **Broker**: EMQX Cloud
- **传输**: MQTT 5.0 over WebSocket (WSS)
- **消息格式**: JSON (UTF-8)

> 口径说明：本协议承载**音乐播放控制**、**文章阅读导航**、**投屏**、**设备状态**。文章导航只下发"显示哪一章、滚动到哪一节"，**不存在朗读、语速、音量类指令**。

---

## 1. 连接

### 1.1 参数
```
URL        : wss://{EMQX_URL}:{EMQX_WSS_PORT}/mqtt
ClientID   : cds-{role}-{deviceId}         例如 cds-display-dev_001
Username   : {EMQX_USERNAME}
Password   : 设备独立凭据（由 /devices/register 下发，不入库明文）
KeepAlive  : 30s
CleanStart : false        // 依赖 session 持久化补投
```

### 1.2 在线状态（LWT）
```
Topic   : cds/v1/{deviceCode}/presence
Payload : {"online":false,"ts":1763350000000}
Retain  : true
QoS     : 1
```

### 1.3 ACL 约束
| 角色 | 可发布 | 可订阅 |
|------|--------|--------|
| 显示端 | `cds/v1/{自己的 deviceCode}/state`、`.../ack`、`.../presence` | `cds/v1/{自己的 deviceCode}/cmd` |
| 服务端 | `.../cmd` | `.../state`、`.../ack`、`.../presence` |

禁止通配订阅（`#` / `+`），越权直接断开。

---

## 2. Topic 设计

```
cds/v1/{deviceCode}/cmd       服务端 → 显示端   指令   QoS1, retain=false
cds/v1/{deviceCode}/ack       显示端 → 服务端   回执   QoS1, retain=false
cds/v1/{deviceCode}/state     显示端 → 服务端   状态   QoS1, retain=true
cds/v1/{deviceCode}/presence  显示端 → 服务端   上下线 QoS1, retain=true
```

---

## 3. 消息包络

```json
{
  "v": 1,
  "msgId": "m-8f2c1a7b",
  "ts": 1763350000000,
  "type": "player.play",
  "payload": { }
}
```
- `msgId`：服务端生成，全局唯一；显示端在 5 分钟内按 `msgId` 去重（幂等）
- `ts`：发送方时间戳（毫秒），显示端与本地时钟偏差 > 5s 时以服务端为准
- `type`：`域.动作`，见 §4

---

## 4. 指令与状态

### 4.1 音乐播放

#### player.play
```json
{
  "v": 1, "msgId": "m-01", "ts": 1763350000000, "type": "player.play",
  "payload": {
    "musicId": "f3f9f5b21b630e07d99f01c5b7778aa5",
    "audioUrl": "https://xxx.xxx.top/assets/xxx.mp3",
    "track": "main",
    "lrc": "[00:11.85]宇宙广阔无垠\r\n",
    "coverUrl": "https://xxx.xxx.top/assets/xxx.jpg",
    "positionMs": 0,
    "volume": 50
  }
}
```

#### player.pause / player.resume / player.stop
```json
{ "type": "player.pause", "payload": { "positionMs": 42500 } }
```
停止时 `payload` 可带 `{ "fadeOutMs": 300 }`。

#### player.seek
```json
{ "type": "player.seek", "payload": { "positionMs": 61200 } }
```

#### player.volume
```json
{ "type": "player.volume", "payload": { "volume": 65 } }
```

#### player.track
```json
{ "type": "player.track", "payload": { "track": "accompaniment" } }
```

### 4.2 文章阅读导航（无播放控制）

#### article.navigate
下发"看哪一章、停在哪一节"：
```json
{
  "v": 1, "msgId": "m-11", "ts": 1763350000000, "type": "article.navigate",
  "payload": {
    "volumeId": 18,
    "volumeName": "约伯记",
    "chapterSn": 3,
    "anchorVerseSn": 12,
    "displayMode": "scroll",
    "fontScale": 1.0
  }
}
```
- `displayMode`: `scroll` | `page`（页面滚动/翻页，人工逐屏推进）
- `fontScale`: 0.8 ~ 2.0，仅影响显示字号
- **无** `speed`、`volume`、`autoPlay` 字段；服务端收到此类字段一律忽略并记 warn 日志

#### article.scroll
控制端手动翻屏（点击"下一屏"时）：
```json
{ "type": "article.scroll", "payload": { "direction": "down", "lines": 3 } }
```

#### article.clear
```json
{ "type": "article.clear", "payload": {} }
```

### 4.3 投屏

#### cast.start
```json
{
  "v": 1, "msgId": "m-21", "ts": 1763350000000, "type": "cast.start",
  "payload": {
    "castId": "cast_01",
    "contentType": "text",
    "content": "板书正文……",
    "fullScreen": true
  }
}
```
`contentType`: `text` | `image` | `pdf`；大内容走 R2 预签名 URL 传 `contentUrl`，MQTT 只传引用：

```json
{
  "v": 1, "msgId": "m-22", "ts": 1763350000000, "type": "cast.start",
  "payload": { "castId": "cast_02", "contentType": "pdf",
               "contentUrl": "https://<r2-private>.r2.cloudflarestorage.com/cast/xxx.pdf?X-Amz-Expires=600&...",
               "fullScreen": true }
}
```
- 预签名硬约束（D-03）：bucket 私有、URL 只读、有效期 ≤10 分钟、按 `deviceCode` 授权；显示端**不得转存**到公共位置或长期缓存
- URL 过期/校验失败 → `ack { ok:false, code:4004 }`，服务端重新签发后重发下行

#### 投屏与音乐的关系（D-04）
- `cast.start` / `cast.end` **不带任何 `player.*` 副作用**：不暂停、不改音量、不动播放位置
- 投屏期间音乐可继续播放（"配乐 + 板书"场景）；显示端在 `cast` 图层之上继续渲染音频播放，音频元素不被触碰
- 控制台只做"音乐播放中"提示，是否暂停由操作者手动下发 `player.pause`

#### cast.end
```json
{ "type": "cast.end", "payload": { "castId": "cast_01" } }
```

### 4.4 设备

#### device.ping / device.pong
```json
{ "type": "device.ping", "payload": {} }
```
显示端 25s 未收到任何帧则发 ping，服务端回 pong；连续 3 次无 pong 判定链路异常并重连。

#### state.report（显示端主动上报，retain=true）
```json
{
  "v": 1, "msgId": "d-07", "ts": 1763350000000, "type": "state.report",
  "payload": {
    "online": true,
    "nowPlaying": { "type": "music", "id": "f3f9...", "positionMs": 42500, "isPlaying": true, "volume": 50 },
    "viewing": { "volumeId": 18, "chapterSn": 3, "anchorVerseSn": 12 },
    "casting": false,
    "appVersion": "0.1.0"
  }
}
```
- 音乐每 5s 或状态变化时上报；文章阅读只在章节切换或位置变化时上报（不做进度同步）
- 服务端把 `nowPlaying` 与 `viewing` 分流写入（`playback_state` 只存音乐，阅读位置见 API 3.5）

#### device.reload / device.restart
```json
{ "type": "device.reload", "payload": { "reason": "version_update" } }
```

### 4.5 回执

显示端执行后回 `ack`：
```json
{
  "v": 1, "msgId": "a-01", "replyTo": "m-8f2c1a7b", "ts": 1763350000200,
  "type": "ack", "payload": { "ok": true, "appliedAt": 1763350000150 }
}
```
失败：
```json
{ "type": "ack", "payload": { "ok": false, "code": 4003, "reason": "unsupported_track" } }
```

---

## 5. QoS 与保留策略

| Topic | QoS | Retain | 说明 |
|-------|-----|--------|------|
| `cmd` | 1 | false | 关键指令至少一次，靠 msgId 去重 |
| `ack` | 1 | false | 回执 |
| `state` | 1 | **true** | 新接入控制端可立刻拿到最新状态 |
| `presence` | 1 | **true** | LWT 标记离线 |

---

## 6. 断线重连与降级

1. 重连间隔 3s / 6s / 12s / 24s，上限 5 次
2. 重连成功后订阅 `cmd`，并主动重发一次 `state.report`
3. 服务端对离线设备缓存最近 1 条关键 `cmd`，上线后补发（`CleanStart=false`）
4. MQTT 整体不可用时，控制端降级为轮询 `GET /api/v1/devices/{deviceId}/state`（2s），控制指令走 REST（API §5，`delivered=polling`）
5. 降级期间文章导航只保证章节正确，不保证滚动位置一致

---

## 7. 安全

- 每台设备独立凭据，权限按 Topic 收敛（§1.3）
- 全链路 TLS（WSS）
- 消息体不含用户密码、设备密钥
- 单设备指令限流 20 条/秒，超限丢弃并回 `code=4029 rate_limited`

---

## 8. 错误码（ack.payload.code）

| code | 含义 |
|------|------|
| 4001 | 未知 type |
| 4002 | payload 字段缺失/非法 |
| 4003 | 不支持的音轨 |
| 4004 | 音频地址不可达 |
| 4005 | 章节/经节不存在 |
| 4006 | 投屏内容超限 |
| 4029 | 限流 |
| 5001 | 显示端内部错误 |

---

## 9. 变更记录

- **V2.2 (2026-11-17)**：落地 D-03/D-04。`cast.start` 补 `contentUrl` 与 R2 预签名硬约束；明确 `cast.start`/`cast.end` 无 `player.*` 副作用，投屏与音乐相互独立。
- **V2.1 (2026-11-17)**：删除文章朗读/语速/音量指令；新增 `article.navigate`/`article.scroll`/`article.clear`、`presence`、`ack`、降级轮询；Topic 改为按设备码寻址（单控模式）
- **V2.0 (2026-11-17)**：初版，按 `class/{classId}/control` 组织
