# Class Display System 数据库设计文档

## 📋 文档信息
- **版本**: V2.2.4
- **更新日期**: 2026-11-18 22:20
- **数据库**: Cloudflare D1 (SQLite)

---

## 🗄️ 核心数据表设计

### 1. 用户表 (users)
```sql
CREATE TABLE users (
    username TEXT PRIMARY KEY,
    password_hash TEXT NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now'))
);
```

**说明**: 
- 存储用户账号信息
- 密码使用 bcrypt 哈希

---

### 2. 设备表 (devices)
```sql
CREATE TABLE devices (
    device_id TEXT PRIMARY KEY,
    device_code TEXT UNIQUE NOT NULL,  -- 控制码（唯一标识）
    device_name TEXT,
    user_id TEXT NOT NULL,
    online_at INTEGER,                 -- 最后在线时间戳
    created_at INTEGER DEFAULT (strftime('%s', 'now'))
);
```

**说明**:
- 单控制台控制模式：设备只接受一个用户控制
- `device_code` 用于快速连接和验证

> **V2.2.1 口径变更（CO-2026-11-18-05，一用户一控制端／控制码长期有效）：`devices.user_id` 与 `devices.bound_at` 自本版起停止写入、不再读取。**
> 绑定状态唯一来源改为 `device_bindings(device_id, user_id, bound_at, revoked_at, updated_at)`（见 `migrations/0005_control_codes_and_styles.sql`，rev2 定稿；**DDL 不在本仓库**，由运维维护，sha256 与 promote 状态以 `migrations/README-0005.md` 台账为准）；`devices.device_code` 降为历史列（新流程写哨兵值，**不得**用作授权维度——`'x'||device_id` 恒定可猜），控制码改由 `control_codes(user_id, code, rotated_at)` 承载（一用户一张、8 位数字、**长期有效、无过期**）。> **V2.2.4**：曾短暂规划的 rev3（`owner_id`/`owner_kind`/`expires_at` 的 guest 归属键）已作废——控制端必须登录，屏端不登录这件事由 `POST /devices/register`（本来无鉴权）承载，数据库零变更。
> **为什么必须写在这里而不是只写在迁移注释里**：两处同时写＝同一事实两处定义，踢出时漏改一处，控制台与 REST 会各显示一个答案。`devices.user_id` / `bound_at` 两列留到 T-01 维护窗口的 12-step 重建时一并删除。

---

### 3. 音乐分类表 (music_categories)
```sql
CREATE TABLE music_categories (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    is_upper INTEGER DEFAULT 1,        -- 是否顶级分类
    star_order INTEGER DEFAULT 0       -- 排序权重
);
```

**第三方 API 映射**: `https://xxx.xxx.top/ry-api/start/shijidb/list`

---

### 4. 音乐项表 (music_items)
```sql
CREATE TABLE music_items (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    full_title TEXT,
    shiji_index INTEGER DEFAULT 0,      -- 圣歌索引（排序用）
    xuhao INTEGER,                      -- 编号
    years TEXT,                         -- 年份
    category_id TEXT,                   -- 分类ID（应用层约束）
    lyric TEXT NOT NULL,                -- 纯文本歌词
    lrc TEXT NOT NULL,                  -- LRC 格式歌词
    audio_url TEXT NOT NULL,            -- 主音频 URL
    accompaniment_url TEXT,             -- 伴奏 URL
    cover_url TEXT,                     -- 封面图片 URL
    isad INTEGER DEFAULT 0,             -- 是否广告（0 否 1 是）
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now'))
);
```

**第三方 API 映射**:
- 列表：`https://xxx.xxx.top/ry-api/start/zanmei/sgbList`
- 详情：`https://xxx.xxx.top/ry-api/start/zanmei/sgb/{id}`

---

### 5. 书籍表 (books) - 对应 wenzhang_volume
```sql
CREATE TABLE books (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind_sn INTEGER NOT NULL,             -- 种类编号
    volume_sn INTEGER UNIQUE,             -- 卷号
    chapter_total INTEGER NOT NULL,       -- 总章数
    testament_sn INTEGER NOT NULL,        -- testament 编号
    pinyin TEXT NOT NULL,                 -- 拼音
    pinyin_short TEXT NOT NULL,           -- 拼音简写
    name TEXT NOT NULL,                   -- 名称（如约伯记）
    name_short TEXT NOT NULL              -- 简称
);
```

---

### 6. 章节（派生维度，不单独建表）
生产库 `wenzhang_verses` 直接带 `chapter_sn`，章不需要独立表，按需聚合：

```sql
-- 章列表
SELECT chapter_sn, COUNT(*) AS verse_count
FROM verses WHERE book_id = ? GROUP BY chapter_sn ORDER BY chapter_sn;
```

**说明**: 早期草案里的 `chapters` 表（`chapter_id` 外键）与生产结构不一致，已废弃；`verses` 直接用 `book_id + chapter_sn`。

**裁决 D-01 落地口径**：
- 章为派生维度，**不建表**；章列表由 `GROUP BY chapter_sn` 得到，接口必须分页（见 `api.md` §3.2）
- 唯一性约束落在经节粒度 `UNIQUE (book_id, chapter_sn, verse_sn)` —— 一章含多节，`(volume_id, chapter_sn)` 本身**不可能唯一**，故不建该索引；它由上面的复合唯一索引前缀天然覆盖，查询走 `idx_verses_lookup`
- 卷号唯一性由 `wenzhang_volumes.volume_sn UNIQUE` 保证

---

### 7. 经节表 (verses) - 对应 wenzhang_verses
```sql
CREATE TABLE verses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id INTEGER NOT NULL,          -- 对应 wenzhang_verses.volume_id
    chapter_sn INTEGER NOT NULL,
    verse_sn INTEGER NOT NULL,
    verse_txt TEXT NOT NULL,
    UNIQUE (book_id, chapter_sn, verse_sn)
);
CREATE INDEX idx_verses_lookup ON verses(book_id, chapter_sn, verse_sn);
```

---

### 8. 播放控制表 (playback_state)
```sql
CREATE TABLE playback_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),  -- 单例表
    current_item TEXT NOT NULL,             -- 当前播放项目ID
    current_type TEXT NOT NULL,             -- 类型：music/article
    playback_time INTEGER NOT NULL DEFAULT 0,  -- 播放进度（秒）
    volume INTEGER NOT NULL DEFAULT 50,     -- 音量（0-100）
    is_playing INTEGER DEFAULT 0,           -- 播放状态（0 暂停 1 播放）
    device_id TEXT,                         -- 被控设备ID
    updated_at INTEGER DEFAULT (strftime('%s', 'now'))
);
```

**说明**: 只存**音乐**播放状态。文章阅读位置（书卷/章/锚点节）单独走 `PUT /api/v1/articles/position`，不进本表

---

### 9. 播放列表表 (playlists)
```sql
CREATE TABLE playlists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    music_id TEXT NOT NULL,
    position INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT (strftime('%s', 'now'))
);
```

**说明**: 存储用户创建的播放列表

---

## 🔗 表关系说明

```
users ──> devices
         |
music_categories ──> music_items
         |
         | 
books ──> verses (book_id + chapter_sn，章为派生维度)
```

**注意**: 
- 由于 D1 不支持外键约束，所有外键关系在应用层保证
- 所有时间戳使用 Unix 时间戳（秒）

---

## 📊 数据流程说明

### 音乐播放流程
1. 前端调用 `GET /api/music/list` 获取音乐列表
2. 同步第三方 API `https://xxx.xxx.top/ry-api/start/zanmei/sgbList`
3. 用户选择歌曲，调用 `GET /api/music/{id}` 获取详情
4. 播放器获取 `audio_url` 开始播放
5. 实时同步播放状态到 `playback_state`

### 文章阅读流程（人工导航，无播放控制）
1. 用户选择书卷 (`books`，对应生产库 `wenzhang_volume`)
2. 按 `volume_id` 聚合 `chapter_sn` 得到章列表（`SELECT chapter_sn, COUNT(*) ... GROUP BY chapter_sn`），不单独建章表
3. 用户选择具体章，按 `volume_id + chapter_sn` 加载经节 (`verses`)
4. 前端纯文本展示经文，人工逐屏阅读（页面滚动 / 翻页 / 字号缩放）
5. 仅记录阅读位置（书卷、章、锚点节），**不做朗读、语速、音量、播放进度同步**

---

## ⚠️ D1 限制与应对

| 限制 | 影响 | 应对方案 |
|------|------|----------|
| 不支持外键约束 | 数据一致性需应用层保证 | 代码层实现引用检查 |
| 不支持 VACUUM | 数据库可能膨胀 | 定期清理 + R2 备份 |
| 不支持临时表 | 复杂查询受限 | 应用层缓存 + 分批查询 |
| 不支持 FULL TEXT | 搜索功能需实现 | 使用应用层搜索或 VMemory |
| 写入并发受限 | 高并发需优化 | 使用队列模式 |

---

## 📝 待确认事项

1. **文章表结构**
   - `kind_sn` 和 `testament_sn` 的具体业务含义
   - 是否存在更多层级（卷→章→节→页）
   - 是否需要富文本支持

2. **第三方音乐 API**
   - `isad` 过滤策略（是否默认过滤广告）
   - 同步策略（全量同步 vs 按需同步）
   - API 稳定性保障

3. **D1 数据库**
   - 初始表结构验证
   - 备份策略确定
   - 监控指标定义

---

## 🚨 紧急行动项

**评审会议前**:
- [ ] 确认文章表结构的具体用途
- [ ] 确定音乐 API 同步策略
- [ ] 验证音乐分类与歌曲的对应关系

**评审会议后**:
- [ ] 创建初始化 SQL 脚本
- [ ] 实现 D1 测试验证
- [ ] 更新 API 文档

---

**审核**: 软件运维交付工程师  
**时间**: 2026-11-17 13:37

---

## 变更记录

- **V2.2.4 (2026-11-18)**：**V2.2.3 的 rev3（guest 归属键）整体作废；`control_codes` 回到 rev2 的 4 列**（Jeremyzh 22:10 裁决「控制端一定需要登录」；零 schema 变更，0005 仍按 rev2 promote）。① `control_codes` 形状恢复为 `(user_id, code, rotated_at, created_at)`：一用户一张、8 位数字、**长期有效、无 `expires_at`**；② `owner_kind` / `ix_control_codes_kind` / `g_`+16hex 归属键 / guest 凭证均不存在，`device_bindings.user_id` 与 `device_bind_events.user_id` 仍只装 `users.username`；③ rev3 档案在 `docs/changes/superseded/0005_control_codes_and_styles.rev3-guest归属键.SUPERSEDED`（**不得**放回 `migrations/`）；④ 码失效的唯一途径是控制端 `rotate`（旧码从库里消失），其运行时后果（已绑屏判 `revoked`/`code_rotated`）见 `api.md` §4.6 / V2.2.15。
- **V2.2.3 (2026-11-18)**：~~`control_codes` 形状改为「一个 owner 一张」（rev3）~~ —— **本版已于 V2.2.4 整体作废**，保留此行仅为版本可回溯（按 R-02：不删历史陈述，只标注失效）。
- **V2.2.2 (2026-11-18)**：**0005 指针改为「文件名＋运维台账」，并记明 DDL 不在本仓库**（零 schema 变更）。起因：`migrations/` 里原有那份 `0005_control_codes_and_styles.sql` 是 **CO-05 之前的旧模型**（`control_codes.code` 主键、`expires_at` 15min、`used_at` 一次性消费、**无** `device_bindings`），运维已将其移出应用路径（`docs/changes/superseded/0005_control_codes_and_styles.pre-co05.SUPERSEDED`，11,174 B），而本文档仍指向 `migrations/0005` rev2 草案 ⇒ 维护窗口照指针执行会落到废止模型（`GET /devices/me` 的三态与 `POST /devices/me/release` 将无表可依，`revoked_at` 在 `device_bindings` 里）。① 指针改为 `migrations/0005_control_codes_and_styles.sql`（rev2 定稿，逐字节复制、不改内容）；② 明确**本仓库不含 `migrations/` 目录**——DDL 由运维维护，sha256 与 apply 前后断言以 `migrations/README-0005.md` 为准；③ 同源修正 `api.md` V2.2.12、`mqtt.md` V2.2.31。**未动**：任何表结构、列、索引。④ 另记一条实现前提（运维 21:5x 提出、我确认）：rev2 **不含 `device_bindings` backfill**，故 apply 必须在**首次装机配对之前**——当前两库 `devices` 均 0 行，本次无需 backfill；一旦先做过配对，须先补 `INSERT OR IGNORE INTO device_bindings(device_id,user_id,bound_at,updated_at) SELECT device_id,user_id,bound_at,unixepoch() FROM devices WHERE user_id IS NOT NULL`，否则既有屏全部落成「从未绑定」。
- **V2.2 (2026-11-17)**：落地裁决 D-01（章为派生维度不建表、唯一性落在经节粒度、章列表接口分页），补本轮编辑说明；版本与 `api.md` / `mqtt.md` 对齐。
- **V2.1 (2026-11-17)**：按生产库 `wenzhang_volumes` / `wenzhang_verses` 校正结构，删除自建 `chapters` 表；文章流程改为阅读导航（人工阅读，无播放控制）。
