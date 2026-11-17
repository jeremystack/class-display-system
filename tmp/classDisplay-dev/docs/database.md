# Class Display System - 数据库设计文档

## 技术选型
- **数据库**: Cloudflare SQLite (Cloudflare D1)
- **版本**: v1.0.0
- **设计思想**: 轻量级、易扩展、高性能

## 表结构

### 1. classes (班级表)
```sql
CREATE TABLE classes (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    created_at TEXT DEFAULT (CURRENT_TIMESTAMP),
    updated_at TEXT DEFAULT (CURRENT_TIMESTAMP)
);

-- 索引
CREATE INDEX idx_classes_created_at ON classes(created_at);
```

### 2. users (用户表)
```sql
CREATE TABLE users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT DEFAULT 'user',  -- admin, teacher, student
    created_at TEXT DEFAULT (CURRENT_TIMESTAMP),
    updated_at TEXT DEFAULT (CURRENT_TIMESTAMP)
);

-- 索引
CREATE INDEX idx_users_username ON users(username);
```

### 3. devices (设备表)
```sql
CREATE TABLE devices (
    id TEXT PRIMARY KEY,
    class_id TEXT NOT NULL,
    name TEXT NOT NULL,
    device_type TEXT NOT NULL,  -- browser, native, custom
    device_token TEXT UNIQUE,   -- 设备唯一标识
    online_status INTEGER DEFAULT 0,  -- 0: offline, 1: online
    last_heartbeat TEXT DEFAULT (CURRENT_TIMESTAMP),
    created_at TEXT DEFAULT (CURRENT_TIMESTAMP),
    updated_at TEXT DEFAULT (CURRENT_TIMESTAMP),
    FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
);

-- 索引
CREATE INDEX idx_devices_class_id ON devices(class_id);
CREATE INDEX idx_devices_online_status ON devices(online_status);
CREATE INDEX idx_devices_last_heartbeat ON devices(last_heartbeat);
```

### 4. events (事件表) - 存储历史事件
```sql
CREATE TABLE events (
    id TEXT PRIMARY KEY,
    class_id TEXT NOT NULL,
    type TEXT NOT NULL,  -- music, article, board, stop
    data TEXT NOT NULL,   -- JSON 格式
    broadcasted INTEGER DEFAULT 0,  -- 是否已广播
    created_at TEXT DEFAULT (CURRENT_TIMESTAMP),
    FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
);

-- 索引
CREATE INDEX idx_events_class_id ON events(class_id);
CREATE INDEX idx_events_type ON events(type);
CREATE INDEX idx_events_created_at ON events(created_at);
CREATE INDEX idx_events_broadcasted ON events(broadcasted);
```

### 5. playlists (播放列表表)
```sql
CREATE TABLE playlists (
    id TEXT PRIMARY KEY,
    class_id TEXT NOT NULL,
    name TEXT NOT NULL,
    music_url TEXT NOT NULL,
    lrc_url TEXT,
    duration INTEGER,  -- 毫秒
    order_index INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (CURRENT_TIMESTAMP),
    updated_at TEXT DEFAULT (CURRENT_TIMESTAMP),
    FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
);

-- 索引
CREATE INDEX idx_playlists_class_id ON playlists(class_id);
CREATE INDEX idx_playlists_order_index ON playlists(class_id, order_index);
```

### 6. articles (文章表) - 存储文章内容
```sql
CREATE TABLE articles (
    id TEXT PRIMARY KEY,
    class_id TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    auto_scroll INTEGER DEFAULT 1,  -- 0: 手动, 1: 自动
    scroll_speed INTEGER DEFAULT 2,  -- 1-5
    status TEXT DEFAULT 'draft',  -- draft, published, paused
    current_position TEXT,  -- JSON: 滚动位置信息
    created_at TEXT DEFAULT (CURRENT_TIMESTAMP),
    updated_at TEXT DEFAULT (CURRENT_TIMESTAMP),
    FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
);

-- 索引
CREATE INDEX idx_articles_class_id ON articles(class_id);
CREATE INDEX idx_articles_status ON articles(status);
CREATE INDEX idx_articles_updated_at ON articles(updated_at);
```

### 7. boards (板书表)
```sql
CREATE TABLE boards (
    id TEXT PRIMARY KEY,
    class_id TEXT NOT NULL,
    content TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'text',  -- text, image
    full_screen INTEGER DEFAULT 0,  -- 0: 普通, 1: 全屏
    created_at TEXT DEFAULT (CURRENT_TIMESTAMP),
    updated_at TEXT DEFAULT (CURRENT_TIMESTAMP),
    FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
);

-- 索引
CREATE INDEX idx_boards_class_id ON boards(class_id);
CREATE INDEX idx_boards_type ON boards(type);
```

### 8. operation_logs (操作日志表)
```sql
CREATE TABLE operation_logs (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    class_id TEXT,
    action TEXT NOT NULL,
    details TEXT,
    ip_address TEXT,
    created_at TEXT DEFAULT (CURRENT_TIMESTAMP),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE SET NULL
);

-- 索引
CREATE INDEX idx_operation_logs_user_id ON operation_logs(user_id);
CREATE INDEX idx_operation_logs_class_id ON operation_logs(class_id);
CREATE INDEX idx_operation_logs_action ON operation_logs(action);
CREATE INDEX idx_operation_logs_created_at ON operation_logs(created_at);
```

### 9. device_history (设备历史表) - 存储设备状态变化历史
```sql
CREATE TABLE device_history (
    id TEXT PRIMARY KEY,
    device_id TEXT NOT NULL,
    action TEXT NOT NULL,  -- connect, disconnect, heartbeat
    extra_data TEXT,
    created_at TEXT DEFAULT (CURRENT_TIMESTAMP),
    FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
);

-- 索引
CREATE INDEX idx_device_history_device_id ON device_history(device_id);
CREATE INDEX idx_device_history_created_at ON device_history(created_at);
```

## 数据库初始化脚本

### init.sql
```sql
-- 启用外键约束
PRAGMA foreign_keys = ON;

-- 创建班级表
CREATE TABLE IF NOT EXISTS classes (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    created_at TEXT DEFAULT (CURRENT_TIMESTAMP),
    updated_at TEXT DEFAULT (CURRENT_TIMESTAMP)
);

-- 创建用户表
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT DEFAULT 'user',
    created_at TEXT DEFAULT (CURRENT_TIMESTAMP),
    updated_at TEXT DEFAULT (CURRENT_TIMESTAMP)
);

-- 创建设备表
CREATE TABLE IF NOT EXISTS devices (
    id TEXT PRIMARY KEY,
    class_id TEXT NOT NULL,
    name TEXT NOT NULL,
    device_type TEXT NOT NULL,
    device_token TEXT UNIQUE,
    online_status INTEGER DEFAULT 0,
    last_heartbeat TEXT DEFAULT (CURRENT_TIMESTAMP),
    created_at TEXT DEFAULT (CURRENT_TIMESTAMP),
    updated_at TEXT DEFAULT (CURRENT_TIMESTAMP),
    FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_devices_class_id ON devices(class_id);
CREATE INDEX IF NOT EXISTS idx_devices_online_status ON devices(online_status);

-- 创建事件表
CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    class_id TEXT NOT NULL,
    type TEXT NOT NULL,
    data TEXT NOT NULL,
    broadcasted INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (CURRENT_TIMESTAMP),
    FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_events_class_id ON events(class_id);
CREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at);
```

## 数据库配置说明

### Cloudflare D1 配置
1. 在 Cloudflare Dashboard 创建 Workers D1 数据库
2. SQL 初始化脚本部署到数据库
3. 存储 D1 数据库 ID 在 Workers KV

### 连接参数
- **数据库 ID**: 从 D1 创建后获取
- **模式**: SQLite 3.45+
- **并发**: 支持多级读写优化

## 性能优化

### 查询优化
1. **索引设计**: 为高频查询字段创建索引
2. **查询缓存**: 热点数据使用 Redis 缓存
3. **分页查询**: 限制查询范围，避免全表扫描

### 安全设计
1. **SQL 注入防护**: 所有参数化查询
2. **权限控制**: 基于角色的访问控制
3. **数据隔离**: 班级数据隔离

## 数据备份与恢复

### 备份策略
1. **自动备份**: 每日凌晨 2 点
2. **保留策略**: 保留最近 7 天备份
3. **异地存储**: 备份到 Cloudflare R2

### 恢复流程
1. 选择备份时间点
2. 恢复数据库文件
3. 验证数据完整性

## 监控与日志

### 监控指标
1. **数据库连接数**: 实时监控
2. **查询延迟**: 慢查询监控
3. **存储空间**: 使用量告警

### 日志记录
1. **操作日志**: 记录所有数据变更
2. **错误日志**: 记录数据库错误
3. **性能日志**: 记录慢查询

## 版本历史
- v1.0.0 (2026-11-17): 初始设计
