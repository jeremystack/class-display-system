# Class Display System MQTT 通信协议

## 📋 文档信息

- **版本**: V2.2.9（V2.2 基线 + V2.2.1…V2.2.9 订正，见 §9 变更记录）
- **更新日期**: 2026-11-18
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
Password   : {EMQX_PASSWORD}         // 共享口令（运维 R-14：现网认证后端只有一组账密）
// 注意：设备身份**不**走 MQTT 密码。应用层用 dev/sig（V2.3），key = devices.token_hash
KeepAlive  : 30s
CleanStart : false        // 依赖 session 持久化补投
```
- **必须走 WebSocket 传输**：`transport=websockets`、`path=/mqtt`（MQTT 5 over WSS）。2026-11-18 12:27 实测：该端口**不接受裸 MQTT/TCP**——裸 TCP 能建立连接、`CONNECT` 也能发出，但**永远收不到 `CONNACK`**（且不报 TLS/WS 错）。会被误判成「认证失败」而去查口令，排查方向反了。
- CONNACK 返回的 broker 能力（实测）：`RetainAvailable=1`、`MaximumPacketSize=1048576`、`TopicAliasMaximum=10`、`ReceiveMaximum=32`、`WildcardSubscriptionAvailable=1`。1 MiB 上限意味着「整张分页表」塞得进包体——但那不是理由，见 §4.4 只报摘要。

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

**上表是目标态，现网不是这样。** 2026-11-18 12:28 实测（MQTT 5 over WSS，共享口令）：
- 订阅：`#` → SUBACK 135、`$SYS/#` → 135；`cds/#` → 授予 QoS 0、`cds/v1/+/cmd|state|ack|presence` → 授予 QoS 1、`foo/#` → 授予 QoS 0。⇒ 只拦了**根通配** `#` 与 `$SYS/#`，任意**具名前缀**的通配全放行（换个子树照样看全站）。
- 发布：`cds/v1/{任意 deviceCode}/cmd|state|ack|presence` 及任意 `cds/` 子主题 → **PUBACK 0 全部成功**，自订阅回环能收到。

⇒ 现网 ACL 近似「全放行」，**不构成任何隔离**。共享口令持有者可以读全站、向任意屏发指令、伪造 retained 状态（详见 §7）。实现时**不得**依赖本表做隔离；切到「HTTP authn → Worker + 按 Topic ACL」之后本表才成立。

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

- 产品稿 §10.6 的 `delayMs` / `durationMs` 本协议**不定义**（理由见 §4.1「时基约定」）；显示端对未定义字段一律忽略

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

#### player.sync（服务端 → 显示端）
音频宿主（＝控制页）每 5s 上报一次真实播放位置，服务端**原样转发**给该教室的显示端；这是显示端**唯一**的时基校正来源（V2.2.5 起生效，随 V2.1 落地，不再等 V2.3）。
```json
{
  "v": 1, "msgId": "m-77", "ts": 1763350005000, "type": "player.sync",
  "payload": {
    "trackId": "f3f9f5b21b630e07d99f01c5b7778aa5",
    "seq": 42,
    "positionMs": 187340,
    "isPlaying": true
  }
}
```
- `trackId`：当前曲目（＝`player.play.musicId`）。显示端发现 `trackId` 变化时按**新曲目**处理，不得沿用旧 `t0`
- `seq`：控制页**单调递增**（从 1 起）。显示端丢弃 `seq ≤ 已处理值` 的包（防乱序/重放）；`seq` 变小＝控制页重载，显示端按新序列接受、并等下一帧锚定
- `positionMs`：控制页**发出时**音频元素的实际位置（`audio.currentTime * 1000`，整数毫秒）
- `isPlaying`：发出时的播放状态。`false` 时显示端**停止本地推进但不重锚**（画面状态仍由 `player.pause` / `player.play` 决定，不由本消息翻转场景）
- QoS1、`retain=false`；显示端**不得**据此持久化，**不得**回写 `playback_state`（`playback_state` 只由控制页的播放控制写入）
- 发送时机：每 5s 一条；另在 `connack` 成功后、`visibilitychange → visible`、`presence online` 各**补一条**（保证重连后 5s 内不会拿过期锚点跑）
- **`article` / `cast` 场景下到达的 `player.sync` 一律忽略**：这两个场景禁音乐（见本节末「投屏与音乐的关系」），此时不得据此起播、不得推进歌词、不得翻转场景状态。控制页切场景前已 `player.pause`，正常不会出现；这条防的是「迟到的 sync 把文章场景点亮」。
- **本地推进必须有上限（手机控制端必需）**：显示端连续 **15s** 未收到任何含时基的下行帧（`player.play|pause|resume|seek|sync`）→ **冻结位置**，并在 `state.report` 的 `nowPlaying` 里带可选 `stale: true`，直到下一帧到达。理由：音频宿主是**控制页**，控制页可能是手机——`visibilitychange→hidden` 立即暂停、回前台不自动续播（`前端设计-V2.1` §9）；手机后台挂起/4G↔Wi-Fi 切换时下行会断几分钟，无限外推会让歌词持续跑到音频前面（现场症状是「歌词越跑越远」，且回来时 `|Δ|>300` 直接跳，看起来像分页/时基 bug）。15s = 「5s 一帧 × 3 次未到」，可调但**必须有界**。`stale` 为 V2.2.7 新增的**可选**字段（前向兼容：未定义字段忽略），仅供控制台显示「显示端已冻结」。
- **无 `atMs` / `startedAtEpochMs`**：显示端不做任何跨设备时钟换算（理由见下方「时基约定」）
- 产品稿 `前端设计-V2.1` §10.6 写作 `{positionMs, durationMs}`；本协议**不定义 `durationMs`**——显示端不画进度条、也不按总时长做任何计算。未定义字段一律**忽略**（见 §3 前向兼容），两侧并存不会出错

**时基约定（V2.2.5 定稿，全协议唯一）**
- 显示端只用**本地单调时钟**：`t0 = performance.now()`，`pos(t) = base + (performance.now() − t0)`。**不得**用 `Date.now()` 做插值——D-1 的盒子/电视棒普遍无 NTP，墙钟跳变会让歌词整段跳（`前端设计-V2.1` §10.6 同一禁令）
- 收到 `player.sync` 时：`Δ = positionMs − pos(now)`，按 **80 / 300 ms 三档**处理——`|Δ| < 80` 忽略；`80 ≤ |Δ| ≤ 300` 慢追（每帧靠 10%、单帧 ≤5ms）；`|Δ| > 300` 直接跳（`base = positionMs; t0 = now()`）。三档的策略口径唯一来源是 `前端设计-V2.1` §10.6，本协议不复述
- **纠漂源只能是本消息（下行）**。`state.report` 是显示端→服务端的**上行**，display 收不到自己的 report；即便自订阅也是拿自己刚发的值重锚（`Δ` 恒 0、零纠偏），还会把上报延迟当漂移
- **残余误差 ＝「控制页 → 服务端」＋「服务端 → 显示端」两段单程之和**（音频宿主是控制页、不是服务端，**别只算后一段**；典型 40–100ms）。≤80ms 落在死区不纠正，即显示端**稳定落后一个单程**——这是刻意取舍：不引入 `delayMs` 一类**估计量**去补偿，避免估计偏差把歌词推到音频之前
- **前提**：单程 ≤80ms 时 `前端设计-V2.1` §13 的「跨文档歌词误差 <120ms」才成立。若某教室实测单程 >100ms（4G 备份链路等），该指标不可达——装机预检必须逐教室录实测单程，不得事后当 bug 查
- 5s 纠漂只吸收**运行期漂移**与**短时抖动**；跳档（seek、切曲）由 `seq` 递增 + `positionMs` 突变识别，不额外下发「seek 事件」

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
    "fontSizePx": 72,
    "fontScale": 1.0
  }
}
```
- `displayMode`: `scroll` | `page`（页面滚动/翻页，人工逐屏推进）
- `fontSizePx`: 可选，整型 **24–120、步长 4、默认 72**；缺省时沿用本机已生效字号（来自 `display.style`）。显示端**直写** `--cds-font-size`（px，不经 rem 乘法）；越界 `clamp(24,120)`，非 4 的倍数向下取整。
- `fontScale`: **章内局部放大乘数**，0.8 ~ 2.0。最终字号 = `clamp(24, 200, fontSizePx × fontScale)`。
  ⚠️ 它**不是** px 换算：V2.0 的「18px 基准 ×fontScale」写法作废。否则 `fontSizePx=96` 时点「放大」会变成 36px，**字反而缩小**。
- **无** `speed`、`volume`、`autoPlay` 字段；服务端收到此类字段一律忽略并记 warn 日志

#### article.scroll
控制端手动翻屏 / 翻节（点击"下一屏"/"下一节"时）：
```json
{ "type": "article.scroll", "payload": { "direction": "next", "unit": "page", "steps": 1 } }
```
- `direction`: `next` | `prev`（`down`/`up` **已作废**（V2.2.1）——语义是"文档流向前/向后"，与屏内滚动方向解耦）
- `unit`: `page` | `section`，缺省 `page`。`page` = 按渲染实测的一屏；`section` = 一个"节"（章内分节；超长节内部再按屏分，分屏处标"续"）
- `steps`: 正整数，缺省 1
- **`lines` 字段删除（V2.2.1 起）**：分页以渲染实测（`document.fonts.ready` + 二分 + `pageMap`）为准，"按行数翻页"在 V2.1 起无意义；`验收清单-V2.1` 有 `rg -i 'lines' src/` 断言，任何 `article.*` 出现 `lines` 即判失败
- 越过章末 → **停末屏**并提示"已到章末"，不跨章（跨章走 `article.navigate`：`chapterSn±1`、锚点归章首）
- 不新增"上一节/下一节"指令：`unit=section` + `direction` 已覆盖；`article.navigate` 只负责"跳到某章某节"

**行为定义（V2.2.3 补：此前只有字段、没有行为，照字面会做成"翻页"）**

- **`unit=page`**：起点前进 `steps` 屏。一屏的边界由显示端**渲染实测**得出（须等 `document.fonts.ready`；段距计入），**不是**"行数 × 步长"，也**不是** `floor(可用高度 ÷ 行高)`。至于是"顺序填充"还是"整章连续行流 + 像素偏移"，属显示端实现选择，协议不约束；协议只要求两条：切点落在**整行**（不得横切行盒）、`pageCount` 来自**实测页序列**而不是算出来的。
- **`unit=section`**：起点 = 目标节的**首字符** `{verseSn, charOffset: 0}`，显示端从该字符起重新填充视口到满（到章末自然截断）；`steps` = 前进几节，缺省 1。
  **相邻屏允许重叠**：节边界一般不对齐屏边界，第 N 屏底部露出的半节会同时出现在第 N+1 屏顶部（诗篇 23 例：视口 5 行、每节 2 行 → 屏1 = 节1+节2+节3首行；下一节 → 节2+节3+节4首行；再下一节 → 节3+节4+节5首行）。这是预期行为，不是重复渲染，也不是 bug（例中「视口 5 行」只用于演示重叠逻辑；1080p/72px、默认 `charsPerLine=12` 下首屏是 **4 行**，见 §4.6.3——真实容量以 §4.6.1 的算法结果为准，DOM 实测只作校验）。
- **某节自身超过一屏时，在该节内部继续分屏**（页脚标"续"，下屏从切割点续写，**正文不插任何字符**）：否则该节尾部永远不可见。大字号下必现——1080p 可用高度约 911px（`#content` 上下 5vh + 页眉 + 页脚），行高 1.75 ⇒ `fontSizePx=120` 时一个 4 行节 = 972px 已装不下，必须切开。
- **`steps` 不跨章**：`page` 模式越过章末停末屏；`section` 模式最后一节即终点。两种情况都提示"已到章末"，跨章一律走 `article.navigate`。
- **页容量不是单值、也不上报整张表；但自 V2.2.8 起页容量是「算出来的」**：`N` **不是排版常数**——`.body p` 每节有 1.1em 段距（约 `0.63` 行）。同样 911px、`fontSizePx=72` 时，按 §4.6 的**整节下移**规则：单行节能装 **4 节 4 行**，两行节能装 **2 节 4 行**；而 `floor(911 ÷ (1.75 × 72))` = **7**，高估 **75%**。
- **（V2.2.8 订正 V2.2.6 的一处口径）**「两行节能装 5 行（2 节 + 第 3 节首行）」建立在一个**未被写下来的前提**上：允许把「自身不到一屏」的节切开以填满当屏（填满优先）。该前提与本节「某节自身超过一屏时才在节内继续分屏」直接冲突，且会让同一文档的屏数随实现者不同（诗篇 23、`charsPerLine=8`、72px：整节下移 **5 屏**、填满优先 **4 屏**）。**V2.2.8 定死整节下移**（§4.6 第 4 条），5 行口径作废。
- **行号不进协议，但行数已可算**：`totalLines` 与每节首行行号数组**仍不进协议、不上报**；V2.2.8 起行数由字符宽度模型（全角 1／半角 0.5）＋`charsPerLine` 决定，**不再随字体 fallback 变**（例外：溢出兜底重切，见 §4.6）。控制台仍只能读 `pageMap` 的 `pageCount`/`viewLines`，不得自算。
- **`viewLines` 进协议，但只作单个整数旁注**（V2.2.6）：语义＝**首屏容纳的完整行数**（`pageStarts[0]` 那一屏），供控制台旁注「首屏 N 行」，**不是每屏行数、也不是平均行数**。后续屏可能更少（多页时序列可能形如 3/3/3/3/2），故文案必须写「首屏」；禁止据此推算 `pageCount`，也禁止控制台自行用公式算。它与「不传每屏数组」不冲突——一个整数不是表。
- **（V2.2.4）屏容量不得用公式算**：`N = floor(可用高度 ÷ 行高)` 只在「无段距、无换行差异」时成立，**不得**当作页容量，更不得用它推屏数（`ceil(总行数 ÷ N)`）。段距 `1.1em` 使每个节额外占 `0.63` 行：1080p 可用高约 911px、行高 126px（`fontSizePx=72`）时公式给 `N=7`，而含段距的真实容量是 **4–5 行**（随节结构变）——屏数必然少算 30% 以上，且每屏底边落在行中，被 `overflow:hidden` 横切（静默、无标记）。页起点必须**逐页实测递推**：从当前页首行起，累加 `offsetTop` 差（含段距）直到再加一行就超过可用高度为止，取上一行为本页末行；`pageCount` = 该序列长度，不是算出来的。
- **（V2.2.4；V2.2.6 订正量级）节首定位不得换算行号**：`verseLineIndex[k] = round(offsetTop ÷ 行高)` 把**含段距的偏移**按行高折算。误差**不累积**：每节按自己的绝对 `offsetTop` 独立取整，残差封顶 ±0.5 行（72px 即 ±63px、120px 即 ±105px）。早前「第 10 节偏 6 行 ≈790px」的说法**作废**——那是把行号当成不含段距的行数累加去比，算法本身不成立；任何人不得据它做补偿。但 ±63px 已够把节首顶掉半行，故仍**不得**用它定位。真正会累积的是 `unit=page` 的 `pageIndex × N`：`N` 与真屏容量不等，每页偏 `0.63` 行、第 k 页偏 `k × 0.63` 行——已由**逐页实测递推**取代。正确做法：`translateY(-offsetTop(sectionEl))`，**只做像素偏移、不做行号换算**；行号如仅用于展示，可由实测页序列反查，不得参与定位。

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
- URL 过期/校验失败 → `ack { ok:false, code:4007 }`（V2.3 新增码；**不得沿用 4004**——4004 在 §8 是"音频地址不可达"），服务端重新签发后重发下行

#### 投屏与音乐的关系（D-04 已废弃；按 V2.1.2 定稿，2026-11-18）
- `cast.start` / `cast.end` **不带任何 `player.*` 副作用**：服务端不隐式暂停、不改音量、不动播放位置（**此句不变，仍是硬约束**）
- **`cast` 场景下不得有音乐**（Jeremyzh「板书时不要放配乐」）。禁在**编排层**，不在 `cast.*` 里加副作用：控制服务先下发 `player.pause` → 收到 `ack{ok:true}` → 再下发 `cast.start`；**`ack` 1.5s 未到仍切画面**（丢包不应把老师卡在音乐页），控制台标「音乐未确认停止」并给停止键。D-A′ 之后音频在**控制台本地**、`audio.pause()` 同步生效，不依赖该 ack，故不会出现"画面已投、音乐还在响"
- 自动暂停必须给操作者一行**非阻塞提示**（「板书期间不播放音乐」），否则老师会当成故障、反复点播放再被停
- `cast.end` **不自动续播**：落回 `standby`（`standby` 允许背景音乐），等操作者点"继续"
- 兜底：`cast`（及 `article`，见 `前端设计-V2.1` §9.2）场景下收到 `player.play` / `player.resume` → `ack { ok:false, code:4009 }`
- 前提修正：V2.1 起 `display` **无 `<audio>`、永不发声**，声音由控制页播放后经现场音响（HDMI/线路输出/蓝牙）到达大屏。故旧句"显示端在 `cast` 图层上继续渲染音频播放"不成立，已删；"投屏期间音乐继续播放"也不再是协议行为，而是**被业务禁止**

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
    "pageMap": { "anchor": { "verseSn": 12, "charOffset": 0 }, "pageIndex": 2, "pageCount": 12,
                 "unit": "page", "sectionIndex": 3, "sectionCount": 6, "viewLines": 5 },
    "casting": false,
    "appVersion": "0.1.0"
  }
}
```
- 音乐每 5s 或状态变化时上报；文章阅读只在章节切换或位置变化时上报（不做进度同步）
- **`playback_state` 的写入路径唯一（V2.2.7 订正）**：只有控制页的 REST 播放控制（`play`/`pause`/`seek`/`stop`）可以写；`state.report` **只用于展示与对账**，服务端**不得**用它的 `nowPlaying` 回写 `playback_state`。原文「分流写入」与 §4.1「`playback_state` 只由控制页的播放控制写入」自相矛盾；且现网共享口令下任意第三方都能向该 topic 发 **retained** report（§7 实测），回写等于把全站播放状态交出去。阅读位置（`viewing`）照旧不入 `playback_state`，见 API 3.5。
- **过期上报必须丢弃（手机端必需）**：控制端可能是手机，4G/Wi-Fi 切换会让重连后重发的 `state.report`（§6-2 要求）乱序到达。服务端按 `deviceId` 维护「已处理的最大 `ts`」，**丢弃 `ts` 小于该值的 report**；重复 `msgId` 直接忽略。否则旧位置/旧页号会覆盖新值——典型症状是「手机切回 Wi-Fi 后页码/播放位置倒退几秒」。
- **`retain=true` 的后果要写清**：`state` topic 长期保留最后一条，新接入的 Worker/控制台订阅即收到。故 ① 消费前必须先验 `dev/sig`（V2.3）再采信；② **不得**把它当作「设备此刻在线」的依据（在线看 `presence`）；③ 显示端离线时 retained `state` 仍是最后一条 `online:true`，控制台不许据此标在线。
- **`pageMap` 共 7 个字段 ＝ 6 标量 + `viewLines`**（`{anchor, unit, pageIndex, pageCount, sectionIndex, sectionCount, viewLines}`），只报摘要、不上报整张表（表可能几十 KB，5s 一条不可接受；`验收清单-V2.1` C7 有硬断言）。`viewLines` 为**首屏完整行数**（单个整数，语义见 §4.2）。任何文档写「6 标量」时必须补上 `viewLines`，否则与本节冲突。`pageIndex/pageCount` **恒为整章**屏序/屏数、`sectionIndex/sectionCount` **恒为整章**节序/节数，**两者都与 `unit` 无关**；`unit` 只决定**显示哪个、按什么步进**。切 `unit` 时两个分母都不变（否则页码会跳数，控制台会以为跳到了别的章）。`sectionIndex/sectionCount` **恒报**（`unit=page` 时也报），控制台据此显示"诗篇 23 · 节 3/6"并判断已到章末。
- 切 `unit` 时分母**不变**（V2.1.7 起；只有切章/切卷才会变）；`pageIndex` 不得当作持久状态，持久锚点只有 `{volumeId, chapterSn, verseSn, charOffset}`。
- `pageMap` 摘要自 **V2.2.3 定义、V2.2.5 起生效**（随 V2.1 一并落地，否则控制台拿不到节号）。控制台**不得**用 `floor` 公式自行估算屏数/行数（`N` 不是排版常数：段距 `1.1em` 让 `floor(高度÷行高)` 高估 40% 以上）

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

### 4.6 `display.style`：字段表 + 分页三参（V2.2.8 起定义）

服务端→显示端，`cmd`，QoS1，retain=false。`display.style` 自 V2.2.2 起被 §4.2 引用，但直到本版才在本文档里定义字段（此前是**悬空引用**：字段只在 `docs/样式下发指令-提案.md` 与 `前端设计-V2.1`）。

```json
{ "type": "cmd", "payload": { "kind": "style", "payload": {
    "fontSizePx": 72, "lineHeight": 1.75, "charsPerLine": 12 } } }
```

| 字段 | 范围 / 步长 / 默认 | 语义 |
|---|---|---|
| `fontSizePx` | 24–120 / 4 / **72** | 字号主控，px 直写 `--cds-font-size`；越界 `clamp(24,120)`，非 4 倍数**向下**取整 |
| `lineHeight` | 1.2–2.2 / 0.05 / **1.75** | 只改行高；**段距固定 `1.1em`（em = `fontSizePx`）**，故行距也在改「段距占几行」（1.75→0.63 行、1.2→0.92 行） |
| `charsPerLine` | **6–40 整型 / 1 / 12**（与 `前端设计-V2.1` V2.1.10 一致；有效上限由下一条硬约束动态收紧） | 每行字数；同时受硬约束 `charsPerLine × fontSizePx ≤ 可用宽`（1920 宽扣左右 5vw = 1728px ⇒ 72px 上限 **24** 字、96px **18**、120px **14**） |
| `fontScale` | 0.8–2.0 | **旧字段，已降为 `fontSizePx` 的乘数**；与 `fontSizePx` **不得同时下发**（否则乘两次：72×1.15=82.8px，且越出 4 的步长网格） |

- **三参任一变更**：显示端必须**重排**并**重发 `pageMap`**；`pageCount`/`viewLines` 是「当前样式下」的量，样式一变旧值立即作废，不得跨样式复用；控制台只读上报、不得自算。原型缺这条（`kind==='style'` 只 `applyStyle`＋toast、不重算 `pages`）＝**验收必挂**。

#### 4.6.1 分页模型（V2.2.8：算术为主线，DOM 为校验）

字体与可用宽都可能是变量（教室分辨率、字体 fallback），所以**行数不能靠浏览器折行得到**——中英数混排的宽度不同，同一段文字在不同字体下行数会变，分页表随之漂移。改为**先算行、再按行渲染**：

1. **字符宽度模型**：全角 = **1**，半角 = **0.5**（空白 0.5，零宽/控制字符不计）。
2. **行数**：`L[k] = ceil(节字数_k ÷ charsPerLine)`；`totalLines = Σ L[k]`；节首行号 = 前缀和。
3. **渲染**：按 `L[k]` 切成**行数组**，每行一个 `white-space:nowrap` 块（行高 `lineHeight × fontSizePx`）。**不得**依赖浏览器自然折行：否则折行点随字体/字宽漂移，算出的行号与画出来的行对不上。行号从此是**数组下标**，`round(offsetTop ÷ 行高)` 这类换算不再需要（其 ±0.5 行残差问题随之消失）。
4. **装页规则（只有一条，V2.2.8 定死「整节下移」）**：从该页首行起逐节尝试——装得下就整节装入（每节**首次出现**时加 `1.1 × fontSizePx` 段距，**续写行不加**）；装不下且该节**自身**高度 ≤ 可用高 ⇒ **整节移到下一页**（不切）；该节**自身高于一屏** ⇒ 才在节内按行切分，页脚标「续」、下屏从切割点续写、**正文不插任何字符**。
   - **禁止「填满优先」**（把自身不到一屏的节切开以填满当屏）：同一份文档的 `pageCount` 与每屏行数会随实现者不同——诗篇 23、`charsPerLine=8`、72px 下整节下移 **5 屏**、填满优先 **4 屏**，属不可复用歧义。
5. **可用高/宽**：`H = .body 的 clientHeight`、`W = .body 的 clientWidth`，resize/旋屏后重测并**重算 + 重发 `pageMap`**（`ResizeObserver`）。
6. **输出**：`pageCount` = 上述序列长度；`viewLines` = **首屏**行数。两者只由 `(fontSizePx, lineHeight, charsPerLine, H, W)` 决定，同一组输入必须得到同一组输出（可复现）。

#### 4.6.2 DOM 校验与溢出兜底（不得静默）

- **校验**：渲染后比对「算术页序列」与「实际行盒位置」（`Range.getClientRects()`）。不一致 ⇒ **字符宽度模型错了，是 bug**，必须显式告警（日志/`charsModelMismatch`），**不得**静默改用实测值覆盖——否则同一文档在两台设备上得到两套分页，控制台页码全错。
- **溢出兜底**：半角宽度 0.5em 只是近似（`W` 与 `i` 不等宽），某行 `scrollWidth > clientWidth` 时按实测重切该行、重算该屏，并上报该事件。行号仍是数组下标，协议形状不变。
- **不许半行裁切**：`overflow:hidden` 是按像素裁的，会在半行处横切。section 顶对齐与页尾都必须落在**整行**边界（末行 bottom ≤ H）。

#### 4.6.3 算例（诗篇 23，和合本 6 节 147 字，72px / 1.75 / H=911px）

节字数 `16/21/21/25/32/32`；行高 126px、段距 79.2px、整节下移：

| `charsPerLine` | 每节行数 | 总行数 | 屏数 | 每屏行数 |
|---|---|---|---|---|
| 8 | 2/3/3/4/4/4 | 20 | **5** | 5/3/4/4/4 |
| 10 | 2/3/3/3/4/4 | 19 | **4** | 5/6/4/4 |
| **12（默认）** | 2/2/2/3/3/3 | 15 | **3** | **4**/5/6 |
| 14 | 2/2/2/2/3/3 | 14 | **3** | 4/4/6 |
| 16 | 1/2/2/2/2/2 | 11 | **3** | 5/4/2 |
| 24 | 1/1/1/2/2/2 | 9 | **2** | 5/4 |

⚠️ **默认 12 的首屏是 4 行，不是 5 行**：前 3 节各 2 行，第 3 节要 `2×126 + 2×79.2 + 2×126 = 914.4px`，比 H=911 多 **3.8px** ⇒ 整节下移。这个 3.8px 的边界说明 **fixture 必须写死 H（且写死宽）**，否则同一断言在不同页眉/页脚高度下翻屏。
⚠️ 「每节 2 行、一屏 5 行」只在 `charsPerLine=24`（自然折行、每节 1 行）时出现；默认 12 只做到「前 3 节 2 行」。

#### 4.6.4 已知缺口（V2.2.8 不解决，架构文档须备案）

- **无避头尾**：按字数硬切，行首可能出现「，。、）」等。若要，必须是**确定性状态机**且渲染与算术共用同一套规则，否则行数不可算。
- **半角宽度是近似**：靠 4.6.2 溢出兜底兜住，不做逐字形宽度表。
- **列宽语义未定**：`charsPerLine × fontSizePx` 只是**行宽**，正文块宽（居中窄栏 / 撑满可用宽）产品未定。1920 宽、72px、`charsPerLine=12` 时行宽 864px＝可用宽的 **50%**，撑满会在右侧留半屏空白。**建议**：正文块宽 = `charsPerLine × fontSizePx` 并居中，否则「每行 12 字」在投影上看起来像排版坏了。
- **`fontScale` 尚未宣布作废**：与 `fontSizePx` 并存会把字号乘两次，产品需二选一。

#### 4.6.5 待产品

① ~~`charsPerLine` 范围~~（V2.2.9 已定 **6–40/1/12**，与 `前端设计-V2.1` V2.1.10 一致；72px 时有效上限 24）；② 列宽语义（居中窄栏 vs 撑满）；③ `fontScale` 作废或保留；④ 把 `fontSizePx`/`lineHeight`/`charsPerLine` 补进 `样式下发指令-提案.md` 并对齐本表。在并入前，实现一律以本表与 `前端设计-V2.1` 为准，不得两边各写一套。
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

- **目标态（出路 B，未实现）**：每台设备独立凭据，权限按 Topic 收敛（§1.3）。
- **现网实际（2026-11-18 12:27–12:29 实测复核，MQTT 5 over WSS）**：EMQX 只有**一组共享账密**。校验确实生效——错口令 `rc=134 Bad user name or password`、错用户名 `rc=135 Not authorized`（v3.1.1 编码即 4/5，与 10:54 首次实测一致，只是协议版本不同）；但校验的是那组**全站共享**的口令，`ClientID` 可任意伪造（用别人的 `cds-display-*` 连上去，先连者收到 `142 Session taken over` 被踢）。
  ⇒ **MQTT 连接本身不构成身份认证**（运维 R-14）。
- **比「ClientID 可伪造」更严重（同一批实测）**：现网 ACL 只拦根通配 `#` 与 `$SYS/#`，其余全放行。共享口令持有者可：① 订阅**全站**的 `cmd`/`state`/`ack`/`presence`（`cds/v1/+/*` 授予 QoS 1），读到每间教室在放什么、看到第几节；② 向**任意** `cds/v1/{任意 deviceCode}/cmd` 发布——**PUBACK 0 成功**，自订阅回环能收到，即**可越权指挥任意一块屏**；③ 向任意 `state`/`presence` 发布 **retain=true** 伪造状态——实测植入后，一个**全新订阅者**在订阅瞬间就收到这条伪造状态（测完已清空该 retained）。
  ⇒ **R-14 的性质是「可越权下发 + 可伪造上行 + 可污染 retained」，不只是「可伪造身份」**。因此：**任何安全结论都不得建立在 ACL 之上**；§1.3 的权限表是目标态。
- **两条由上面直接推出的业务硬约束**：① `playback_state` 只能由控制页 REST 播放控制写入，禁止由 `state.report.nowPlaying` 回写（否则一条伪造/过期的 retained report 就能改掉全站播放状态，见 §4.4）；② 显示端不得把「在 `cmd` 上收到消息」当作授权依据——V2.3 的 `srvSig` 未实现前，**下行没有任何链路级认证**。
- **现网的真实可信边界**：① Worker REST 的 JWT 校验（唯一身份来源）；② 上行 `dev/sig = HMAC_SHA256(key = devices.token_hash, msg = msgId|type|ts)`（V2.3）；③ 下行 `cmd` 的 `srvSig`（V2.3，Ed25519，私钥只在 Worker）。
  显示端**不得**假设「能在 `cmd` 上收到消息就说明是服务端发的」。
- 全链路 TLS（WSS）
- 消息体不含用户密码、设备密钥
- 单设备指令限流 20 条/秒，超限丢弃并回 `code=4029 rate_limited`

---

## 8. 错误码（ack.payload.code）

| code | 含义 |
|------|------|
| 4001 | 未知 type |
| 4002 | payload 字段缺失/非法 |
| 4003 | 不支持的音轨（**V2.1 起显示端不产生**：display 无 `<audio>`；码保留、不复用） |
| 4004 | 音频地址不可达（**V2.1 起显示端不产生**；码保留、**不得**改用作"投屏 URL 过期"，那是 4007——本文件 §4.3 曾误用，已改） |
| 4005 | 章节/经节不存在 |
| 4006 | 投屏内容超限 |
| 4007 | 投屏内容 URL 无效 / 预签名已过期（V2.3 新增；服务端重签后可重发） |
| 4008 | 已有其他音频锚点（另一终端正在播放，本端不得起播） |
| 4009 | 当前场景禁止起音乐（`cast`/`article` 下收到 `player.play` / `player.resume`） |
| 4029 | 限流 |
| 5001 | 显示端内部错误 |

> 同一条件在**两个面**各有一个码，别混：MQTT 下行回执用 **`4009`**；REST 用 **`4096` + HTTP `409`**（`api.md` §9，`error: "audio_blocked_by_scene"`）。`前端设计-V2.1-变更单` §2 写的「收到 `player.play` → 409」只适用 HTTP，**MQTT 侧不得回 `409`**（不是本协议的码）。

---

## 9. 变更记录

- **V2.2.9 (2026-11-18)**：**字段范围与表格渲染订正（无协议语义变更）**。① `charsPerLine` 范围定 **6–40 / 1 / 12**：V2.2.8 写「6–24，待产品确认」，而 `前端设计-V2.1` V2.1.10 写 6–40，两处数字不一致；有效性仍受 `c × F ≤ 可用宽` 动态收紧（1920 宽扣 5vw×2＝1728px ⇒ 72px 上限 **24**、96px **18**、120px **14**），越界一律 `clamp`；② 修正 §8 错误码表的渲染错误：跨面对照块原插在 `4009` 与 `4029` 两行**之间**，把表截成两半（`4029`/`5001` 掉出表格），已移到表尾；③ 表格单元内 `player.play|resume` 的裸竖线改写成 `player.play` / `player.resume`——未转义的 `|` 被当列分隔符会多出一列。

- **V2.2.8 (2026-11-18)**：**`charsPerLine`（每行字数）落地为协议字段；分页从「测量」改为「算术主线＋DOM 校验」**。① §4.6 由「约束清单」升为**字段表**：`fontSizePx` 24–120/4/72、`lineHeight` 1.2–2.2/0.05/1.75（只改行高、段距恒 `1.1em`）、`charsPerLine` 6–24/1/12（范围待产品确认，受 `c × F ≤ 可用宽` 约束）、`fontScale` 降为乘数且不得与 `fontSizePx` 并存；② 新增 4.6.1 分页模型：字符宽度（全角 1／半角 0.5）→ `L[k]=ceil(字数/c)` → **按行数组切 `nowrap` 块**（不得依赖浏览器自然折行，否则行号与画出来的行对不上）→ 装页；③ **定死「整节下移」为唯一装页规则**，禁止「填满优先」——诗篇 23、`c=8` 下两种规则分别得 5 屏与 4 屏，会让 `pageCount` 随实现者变；④ 新增 4.6.2：算术与实测不一致＝**模型错＝bug，必须告警、不得静默覆盖**；行溢出（`W`/`i` 不等宽）按实测重切并上报，行号仍是数组下标；⑤ 新增 4.6.3 算例（诗篇 23、72px/1.75/911px）：`c=8→20 行 5 屏`、`10→19/4`、`12→15/3（首屏 4 行）`、`14→14/3`、`16→11/3`、`24→9/2`；⑥ **订正 V2.2.6 的「两行节能装 5 行（2 节 + 第 3 节首行）」**——该数字隐含「填满优先」，与本节「某节自身超一屏才切」冲突，按整节下移应为 **2 节 4 行**，`N=7` 高估 **75%**；⑦ 4.6.4 备案已知缺口：无避头尾、半角宽度近似、列宽语义未定（1920/72px/`c=12` 行宽 864px ＝可用宽 50%，撑满会留半屏空白，建议块宽＝`c×F` 并居中）。

- **V2.2.7 (2026-11-18)**：**R-14 实测收口 + 手机控制端的三条护栏 + `display.style` 缺口显式化**。① §1.1 增「必须走 WebSocket 传输」（实测裸 MQTT/TCP 在该端口**永远收不到 CONNACK**，会被误判成认证失败）与 broker 能力（`MaximumPacketSize=1048576` 等）；② §1.3 明确权限表是**目标态**：实测只拦 `#`，`cds/v1/+/cmd|state|ack|presence` 的订阅**与发布**全部放行；③ §7 重写「现网实际」：错口令 rc=134/错用户名 rc=135（v3.1.1 即 4/5）、`ClientID` 可被抢占（142 `Session taken over`），并新增实测结论——共享口令持有者可**读全站**、**向任意屏发布 cmd**、**向任意 state 植入 retained 伪造状态**（植入后被全新订阅者立即收到，测完已清空）⇒ R-14 从「可伪造身份」升级为「可越权下发/伪造上行/污染 retained」，任何安全结论不得建立在 ACL 之上；④ §4.4 订正「分流写入」：`playback_state` **只能**由控制页 REST 写，`state.report` 只作展示，并按 `deviceId` 丢弃 `ts` 倒退的过期上报（手机重连重发会乱序）；⑤ §4.1 增两条：`article`/`cast` 下忽略 `player.sync`；本地推进 **15s 无时基帧即冻结**并可选上报 `nowPlaying.stale`（音频宿主是手机控制页，后台挂起会断下行，无限外推会让歌词跑飞）；⑥ 新增 §4.6：`display.style` 尚未并入本协议（0 处定义、提案滞后于设计：只有 `fontScale` 没有 `fontSizePx`/`charsPerLine`），先立三条约束——样式变更必须重排并重发 `pageMap`、`lineHeight` 只改行高不改段距、`charsPerLine × fontSizePx ≤ 可用宽`；⑦ §8 增跨面码对照：MQTT `4009` vs REST `4096`/HTTP `409`，设计稿的「409」不得用于 MQTT。

- **V2.2.6 (2026-11-18)**：**`viewLines` 进协议（裁决：单个整数，不是表）；并撤回 V2.2.4 的一处错误量级**。① §4.4 `pageMap` 字段数定为 **7 ＝ 6 标量 + `viewLines`**（`{anchor, unit, pageIndex, pageCount, sectionIndex, sectionCount, viewLines}`），示例补 `"viewLines": 5`；② §4.2 定义 `viewLines` 语义＝**首屏容纳的完整行数**（`pageStarts[0]` 那一屏），供控制台旁注「首屏 N 行」——**不是每屏行数、不是平均行数**，后续屏可能更少（3/3/3/3/2），故文案必须写「首屏」，且不得据它推算 `pageCount`；③ **撤回 V2.2.4 ③ 的「`verseLineIndex` 误差按节累积、第 10 节偏约 6 行 ≈790px」**——该量级错误：每节按自己的绝对 `offsetTop` 独立取整，残差封顶 **±0.5 行**（72px 即 ±63px、120px 即 ±105px），不累积；真正累积的是 `unit=page` 的 `pageIndex × N`（每页偏 0.63 行、第 k 页偏 k×0.63 行），已由逐页实测递推取代。禁令本身不变（≥±63px 已够顶掉半行），但不许有人按 790px 做补偿；④ §4.2 容量数字订正：两行节在 911px / 72px 下真实容量是 **5 行**（2 节 + 第 3 节首行），非 4 行；单行节 4 行 ⇒ 公式 `N=7` 高估 **40–75%**、屏数少算 30% 以上（原写「高估 75%、少算 43%」只在单行节结构下成立）；⑤ §4.4 示例 `sectionCount` 由 7 改为 **6**（和合本诗篇 23 共 6 节、原型 `VERSES[23]` 亦 6 条），与同节「节 3/6」文案一致。背景：`验收清单-V2.1` L202 仍写「只含摘要 6 标量」，L206 写「6 标量 + `viewLines`」——两行自相矛盾，L202 需同步为 7 个字段。
- **V2.2.5 (2026-11-18)**：**`player.sync` 进入本协议、随 V2.1 落地（裁决 A：不再等 V2.3）**。① §4.1 新增 `player.sync`（服务端→显示端，`cmd`，QoS1，retain=false）：`{trackId, seq, positionMs, isPlaying}`，**无 `atMs`、无 `durationMs`**；发送方＝控制页（音频宿主），服务端原样转发；时机＝每 5s + `connack` / `visibilitychange→visible` / `presence online` 各补一条。② §4.1 增「时基约定」：`Δ = positionMs − pos(performance.now())`、80/300ms 三档、纠漂源只能是下行、**残余＝控制页→服务端＋服务端→显示端两段单程之和**（不是只有后一段）、单程 ≤80ms 是 §13「<120ms」成立的前提；不引入 `delayMs` 估计量。③ 删 V2.2.2 ⑤ 的「不得在 V2.3 落地前实现纠漂」与 §4.1 的 V2.3 待生效警示（该条已过期，留着会让人以为 5s 纠漂仍无载体）。④ §4.4 `pageMap` 摘要由「V2.3 待生效」改为**本版生效**。⑤ 示例「诗篇 23 · 节 3/7」更正为「节 3/6」（和合本 6 节，`VERSES[23]` 亦 6 条）。⑥ §4.2 把「*V2.3*：`down`/`up` 作废」的版本标签改为已作废，不再暗示未来版本。⑦ §4.4 订正：`pageIndex/pageCount` 与 `sectionIndex/sectionCount` **恒按整章计、与 `unit` 无关**（原文「按当前 `unit` 计」会让切 unit 时页码跳数，与 `前端设计-V2.1` V2.1.7 ③ 冲突）。裁决依据：`前端设计-V2.1` §10.6 五处引用 + §13 <120ms 指标；若推到 V2.3，两者与验收 B6 只能一并标 N/A——那等于音乐界面核心体验不做。
- **V2.2.4 (2026-11-18)**：**不改任何报文字段**，只补两条实现禁令 + 修文档头。① 文档信息头由 V2.2.2 更正为 V2.2.4（V2.2.3 只改了正文与变更记录、头未改——R-02 复发，本轮一并修）；② §4.2 增「屏容量不得用 `floor(可用高度 ÷ 行高)` / `ceil(总行数 ÷ N)` 估算，必须逐页实测递推」；③ §4.2 增「节首定位不得把 `offsetTop` 换算成行号，误差按节累积（0.63 行/节），`translateY` 直接用像素偏移」。④ §4.2 `unit=page` 的边界描述改为**实现中立**（删"按字符二分切割"——V2.1.6 已改"整章连续行流 + `translateY`"，协议不应绑定某一种切法；只保留"切点落整行""`pageCount` 来自实测页序列"两条硬约束）。背景：`前端设计-V2.1` V2.1.6 §7.5.1 与 `变更单` §4.8 已采用「连续行流 + `verseLineIndex` + `N=floor(高÷行高)` + `translateY`」，机制正确、但上述两处算式会丢内容/错位，需产品同步订正。
- **V2.2.3 (2026-11-18)**〔其中「`pageMap` V2.3 待生效」「`viewLines` 不实现」两项已被 V2.2.5 / V2.2.6 取代，读旧条目时以新条目为准〕：① §4.2 补 `article.scroll` 的**行为定义**（此前只有字段、无行为）——`unit=page` 按实测一屏步进；`unit=section` 起点为目标节首字符、**相邻屏允许重叠**、超长节在节内继续分屏（否则该节尾部永久不可见）；`steps` 不跨章；② 明确**行数/屏容量不进协议、不上报**（`N` 不是排版常数：段距 1.1em 使 `floor(高度÷行高)` 高估 75%），`totalLines`/`viewLines`/每节首行行号一律不实现；③ §4.4 `state.report` 增 `pageMap` 摘要 `{anchor, pageIndex, pageCount, unit, sectionIndex, sectionCount}`（**V2.3 待生效**），并写明"切 unit 分母变化是预期、pageIndex 不作持久状态"。
- **V2.2.2 (2026-11-18)**：① 文档信息头由 V2.2/11-17 更正为 V2.2.2/11-18（此前正文已改、头未改，属 R-02）；② §1.1 `Password` 改为共享口令事实口径（原文「设备独立凭据」照字面实现＝每台屏 CONNACK=4，装机即连不上，运维 R-14）；③ §7 安全章把「每台设备独立凭据」标为**目标态/未实现**，并写明现网真实边界；④ §4.2 `article.navigate` 增 `fontSizePx`（24–120/步长 4/默认 72），`fontScale` 重定义为「`fontSizePx` 的乘数」而非 18px 基准换算；⑤ §4.1 末尾加 `player.sync` 待生效说明——**本版仍未定义下行时基消息**，5s 纠漂无载体，任何人不得在 V2.3 落地前实现纠漂。
- **V2.2.1 (2026-11-18)**：错误码与 D-04 口径订正（不改任何报文字段）。① §4.3 投屏 URL 过期 `ack 4004` → **4007**（同文件两义：4004 在 §8 是"音频地址不可达"）；② §8 新增 4007/4008/4009，并给 4003/4004 加注"V2.1 起显示端不产生、码保留不复用"；③「投屏与音乐的关系」按 V2.1.2 反转：`cast` 下不得有音乐、禁在编排层（pause-first + 收 ack 再 `cast.start`，**ack 1.5s 未到仍切画面**）、`cast.end` 不自动续播、`cast.*` 无 `player.*` 副作用这句不变；④ `article.scroll` 按 V2.1 定稿改为 `{direction, unit, steps?}`——`lines` 删除、`down`/`up` 作废（原文是 V2.0 残留，与 `前端设计-V2.1` §8.2、`验收清单-V2.1` 的 `rg -i 'lines'` 断言三方冲突）。
- **V2.2 (2026-11-17)**：落地 D-03/D-04。`cast.start` 补 `contentUrl` 与 R2 预签名硬约束；明确 `cast.start`/`cast.end` 无 `player.*` 副作用，投屏与音乐相互独立。
- **V2.1 (2026-11-17)**：删除文章朗读/语速/音量指令；新增 `article.navigate`/`article.scroll`/`article.clear`、`presence`、`ack`、降级轮询；Topic 改为按设备码寻址（单控模式）
- **V2.0 (2026-11-17)**：初版，按 `class/{classId}/control` 组织
