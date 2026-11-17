# Class Display System 数据库设计文档

## 📋 文档信息
- **版本**: V2.0
- **更新日期**: 2026-11-17 13:37
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

### 6. 章节表 (chapters)
```sql
CREATE TABLE chapters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id INTEGER NOT NULL,
    chapter_sn INTEGER NOT NULL,
    title TEXT,
    verse_count INTEGER DEFAULT 0,
    FOREIGN KEY (book_id) REFERENCES books(id)
);
```

---

### 7. 经节表 (verses) - 对应 wenzhang_verses
```sql
CREATE TABLE verses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chapter_id INTEGER NOT NULL,
    verse_sn INTEGER NOT NULL,
    verse_txt TEXT NOT NULL,
    FOREIGN KEY (chapter_id) REFERENCES chapters(id)
);
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

**说明**: 用于存储实时播放状态

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
books ──> chapters ──> verses
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

### 文章朗读流程
1. 用户选择书籍 (`books`)
2. 加载章节列表 (`chapters`)
3. 用户选择具体章，加载经节 (`verses`)
4. 朗读控制：播放/暂停、进度调节、音量调节
5. 显示滚动与朗读进度同步

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
