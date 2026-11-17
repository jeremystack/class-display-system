# Class Display System 产品需求文档 (PRD)

## 📋 文档信息

- **项目名称**: Class Display System (课堂显示系统)
- **版本**: V1.0
- **创建时间**: 2026-11-17 13:45
- **维护人**: 软件产品设计、Chief
- **状态**: 已评审通过 ✅

---

## 1. 项目概述

### 1.1 项目背景
为教堂/教室提供一个完整的显示系统，支持音乐播放、文章朗读、板书投屏等功能，通过单控模式实现设备集中管理。

### 1.2 项目目标
- 实现音乐播放与歌词同步显示
- 支持圣经文章朗读与导航
- 提供板书投屏功能
- 统一管理多个显示设备

### 1.3 技术架构选型
| 组件 | 技术选型 | 说明 |
|------|----------|------|
| 前端 | Preact + TypeScript + Tailwind | 高效开发，包体积小 |
| 后端 | Cloudflare Workers | 全球分布式，成本低 |
| 数据库 | Cloudflare D1 (SQLite) | 不需要独立数据库 |
| 实时通信 | EMQX MQTT over WebSocket | 低延迟，保消息 |
| 存储 | Cloudflare R2 | 对象存储，成本低 |

---

## 2. 功能需求

### 2.1 音乐播放器
**用户故事**: 作为教师，我希望播放圣歌并显示歌词。

| 功能 | 描述 | 优先级 |
|------|------|--------|
| 播放/暂停/继续 | 控制播放状态 | P0 |
| 进度条 | 支持拖动到任意位置 | P0 |
| 音量调节 | 0-100 可调 | P0 |
| 歌词同步 | LRC 格式歌词时间轴同步 | P0 |
| 播放列表 | 列表展示，选择即添加 | P0 |
| 专辑封面 | 显示音乐封面图片 | P1 |
| 伴奏切换 | 支持主音轨/伴奏切换 | P1 |

**数据源**:
- **分类接口**: `GET /ry-api/start/shijidb/list?pageNum=1&pageSize=100&isUpper=1`
- **音乐列表**: `GET /ry-api/start/zanmei/sgbList` (1223 首)
- **音乐详情**: `GET /ry-api/start/zanmei/sgb/{id}` (包含 LRC、音频、封面)

### 2.2 文章朗读器
**用户故事**: 作为教师，我希望朗读圣经经节并控制进度。

| 功能 | 描述 | 优先级 |
|------|------|--------|
| 书卷列表 | 显示所有书卷 (如约伯记、诗篇等) | P0 |
| 章节导航 | 书 → 卷 → 章 → 节四级结构 | P0 |
| 朗读控制 | 播放/暂停、进度调节 | P0 |
| 速度调节 | 1.0x / 1.25x / 1.5x | P1 |
| 音量调节 | 独立于音乐输出 | P1 |
| 滚动显示 | 经文内容自适应滚动 | P1 |

**表结构**:
- **wenzhang_volumes** (卷表): id, name, pinyin, chapter_total, testament_sn
- **wenzhang_verses** (节表): id, volume_id, chapter_sn, verse_sn, verse_txt

### 2.3 板书投屏
**用户故事**: 作为教师，我希望手动触发投屏到显示设备。

| 功能 | 描述 | 优先级 |
|------|------|--------|
| 投屏触发 | 手动点击开始投屏 | P0 |
| -content 权限 | 仅允许教师控制 | P0 |
| 投屏结束 | 手动点击结束投屏 | P0 |
| 全屏支持 | 支持显示设备全屏 | P1 |

**限制**: 不支持实时书写同步，仅支持投屏已有内容。

### 2.4 设备管理
**用户故事**: 作为管理员，我希望控制多个显示设备。

| 功能 | 描述 | 优先级 |
|------|------|--------|
| 设备注册 | 显示设备自动注册 | P0 |
| 设备绑定 | 通过设备码绑定显示端 | P0 |
| 单控模式 | 设备只接受一个用户控制 | P0 |
| 设备码生成 | 生成唯一控制码 | P0 |
| 状态监控 | 实时设备在线状态 | P1 |
| 设备列表 | 管理所有已绑定设备 | P1 |

**核心逻辑**: 设备码用于快速连接，每台设备只有一个控制者。

### 2.5 用户认证与权限
**用户故事**: 作为用户，我希望安全登录系统并管理我的设备。

| 功能 | 描述 | 优先级 |
|------|------|--------|
| 用户登录 | JWT Token 认证 | P0 |
| 用户注册 | 新用户创建流程 | P1 |
| 角色权限 | 教师/管理员权限分离 | P1 |
| 密码安全 |  bcrypt 哈希存储 | P0 |

---

## 3. 非功能需求

### 3.1 性能要求
| 指标 | 要求 | 说明 |
|------|------|------|
| 页面加载 | < 2 秒 | 首屏加载时间 |
| 控制延迟 | < 500ms | 从控制到设备响应 |
| 并发支持 | > 100 设备 | 同时在线设备数量 |
| 歌曲切换 | < 2 秒 | 从选择到播放完成 |

### 3.2 安全要求
- 所有 API 接口需要 JWT Token 认证
- 密码使用 bcrypt 哈希存储
- 敏感操作需要二次验证
- 设备码每 30 秒刷新一次

### 3.3 可靠性要求
- 99.9% 系统可用性
- 音乐播放失败时有降级方案
- 设备掉线自动重连机制
- 数据库每日自动备份

### 3.4 可维护性要求
- Docker 容器化部署
- 日志结构化记录
- 健康检查 API
- 错误告警机制

---

## 4. 数据需求

### 4.1 核心数据表
| 表名 | 说明 | 字段 |
|------|------|------|
| **users** | 用户表 | id, username, password_hash |
| **devices** | 设备表 | id, device_code, user_id, status |
| **music_items** | 音乐项表 | id, title, lrc, audio_url, isad |
| **wenzhang_volumes** | 卷表 | id, name, volume_sn, chapter_total |
| **wenzhang_verses** | 节表 | id, volume_id, chapter_sn, verse_sn, verse_txt |
| **playback_state** | 播放状态表 | id, current_item_id, playback_time, is_playing |

### 4.2 第三方数据源
- **音乐 API**: `https://xxx.xxx.top/ry-api/start/zanmei/sgbList`
- **分类 API**: `https://xxx.xxx.top/ry-api/start/shijidb/list`
- **歌曲详情**: `https://xxx.xxx.top/ry-api/start/zanmei/sgb/{id}`

---

## 5. API 接口设计 (概览)

### 5.1 认证接口
```
POST /api/v1/auth/login
```

### 5.2 音乐接口
```
GET  /api/v1/music/list
GET  /api/v1/music/{id}
POST /api/v1/control/play
POST /api/v1/control/pause
POST /api/v1/control/resume
POST /api/v1/control/seek
POST /api/v1/control/volume
```

### 5.3 文章接口
```
GET  /api/v1/articles/volumes
GET  /api/v1/articles/chapters
GET  /api/v1/articles/verses
POST /api/v1/control/article_play
POST /api/v1/control/article_pause
POST /api/v1/control/article_seek
POST /api/v1/control/article_speed
```

### 5.4 设备接口
```
POST /api/v1/devices/register
POST /api/v1/devices/binding
GET  /api/v1/devices/list
POST /api/v1/control/enable
```

---

## 6. UI/UX 要求

### 6.1 设计原则
- **简洁优先**: 核心功能前置，减少点击次数
- **视觉引导**: 通过颜色/图标区分状态
- **操作确认**: 关键操作需要确认提示
- **响应迅速**: 所有反馈在 200ms 内

### 6.2 核心页面
1. **主页**: 音乐 + 文章快捷入口
2. **音乐播放器**: 大封面、歌词同步
3. **文章阅读器**: 章节导航、滚动文本
4. **设备管理**: 设备列表、状态监控
5. **板书投屏**: 投屏控制、内容预览

---

## 7. 里程碑与交付

### 7.1 阶段划分
| 阶段 | 时间 | 目标 |
|------|------|------|
| 阶段 1 - 评审整改 | 11/17 14:00 | 完成评审，通过进入阶段 2 |
| 阶段 2 - 并行开发 | 11/20-11/25 | 核心功能 MVP |
| 阶段 3 - 联调测试 | 11/26-12/02 | 集成测试 + 安全测试 |
| 阶段 4 - 部署上线 | 12/03-12/10 | 生产环境部署 |

### 7.2 交付物
- **代码**: GitHub 仓库 + 分支保护
- **文档**: PRD、技术设计、运维手册
- **环境**: Cloudflare + EMQX + R2 配置
- **测试**: 测试报告 + 缺陷清单

---

## 8. 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| D1 功能限制 | 外键、全文索引不支持 | 应用层约束，缓存优化 |
| 第三方 API 不稳定 | 音乐数据获取失败 | 本地缓存 + 降级方案 |
| MQTT 连接失败 | 设备控制延迟 | 回退到轮询机制 |
| 并发访问限制 | 高并发性能下降 | 队列模式 + 限流保护 |

---

## 9. 待确认事项

### 9.1 产品逻辑
- [ ] 文章表结构具体含义 (`kind_sn`, `testament_sn`)
- [ ] 音乐 API 同步策略 (全量/按需)
- [ ] 广告歌曲过滤策略 (`isad` 字段)

### 9.2 技术实现
- [ ] Cloudflare D1 功能验证
- [ ] 设备码刷新机制
- [ ] MQTT 心跳超时设置

### 9.3 运维部署
- [ ] 数据库备份周期
- [ ] 监控告警阈值
- [ ] 灰度发布流程

---

## 10. 附录

### A. 数据流图
```
用户 → 前端 → Cloudflare Workers API → Cloudflare D1
                            ↓
                       EMQX MQTT → 显示设备
```

### B. 术语表
- **D1**: Cloudflare 托管 SQLite 数据库
- **MQTT**: 物联网消息传输协议
- **LRC**: 带时间轴的歌词格式
- **book**: 书卷，圣经的基本单位

### C. 参考文档
- [数据库设计文档](../docs/database.md)
- [音乐 API 接口](../docs/api.md)
- [MQTT 通信协议](../docs/mqtt.md)
- [阶段 1 评审报告](../Class Display System - 最终评审报告.md)

---

**文档状态**: 已评审通过 ✅  
**最后更新**: 2026-11-17 13:45  
**审核人**: 软件产品设计、软件、运维、Chief
