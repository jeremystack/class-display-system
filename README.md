# Class Display System

教堂 / 教室课堂显示系统：音乐播放与歌词同步、圣经经文人工阅读导航、板书投屏、单控模式设备管理。

- **技术栈**: Preact + TypeScript + Tailwind · Cloudflare Workers · Cloudflare D1 (SQLite) · Cloudflare R2 · EMQX MQTT over WebSocket
- **当前阶段**: 阶段 1 评审已通过（2026-11-17 14:00），阶段 2 并行开发 **2026-11-20 10:00** 启动
- **MVP 目标**: 2026-11-25

---

## 📚 文档索引

| 文档 | 内容 | 维护人 |
|------|------|--------|
| [产品需求文档 (PRD V1.1)](./Class%20Display%20System%20-%20产品需求文档.md) | 功能需求、非功能需求、里程碑、风险 | 软件产品设计 |
| [数据库设计 V2.2](./docs/database.md) | D1 表结构、索引、外键替代方案、D1 限制 | 软件开发工程师 |
| [API 接口文档 V2.2](./docs/api.md) | `/api/v1` 全部接口、第三方音乐映射、错误码 | 软件开发工程师 |
| [MQTT 通信协议 V2.2](./docs/mqtt.md) | Topic、消息包络、指令/回执/状态、降级策略 | 软件开发工程师 |
| [前端设计 V1.0](./docs/前端设计.md) | 控制台 + 显示端两套界面：组件清单、状态机、MQTT 对应、投屏与音乐并存 | 软件产品设计 |
| [页面原型 V0.1](./prototype/index.html) | 可点击的 HTML 原型：控制台 + 显示端 1080p 预览（纯前端模拟，仅评审用） | 软件产品设计 |
| [阶段 1 最终评审报告](./Class%20Display%20System%20-%20最终评审报告.md) | 评审结论、整改完成情况、阶段 2 计划 | Chief |
| [阶段 1 评审报告](./Class%20Display%20System%20-%20阶段%201%20评审报告.md) | 评审过程与必须修复项 | Chief |
| [第三方接口审核](./Class%20Display%20System%20-%20第三方接口审核.md) | 音乐接口字段审核结论 | 软件产品设计 |
| [任务跟踪](./Class%20Display%20System%20-%20任务跟踪.md) | 模块任务、负责人、里程碑 | Chief |
| [评审会议议程](./评审会议议程.md) | 阶段 1 评审材料清单（历史，已降级，不含会议时间） | Chief |
| [阶段 1 任务清单](./阶段1-任务清单.md) | 阶段 1 拆解任务（历史草案，已被 V2 文档取代） | 软件产品设计 |

---

## 🎯 当前口径（V1.1，务必遵守）

1. **音乐播放器**：播放 / 暂停 / 继续 / 进度拖动（毫秒级）/ 音量 / 歌词同步 / 播放列表 / 主音轨与伴奏切换。
2. **文章模块是"阅读导航器"，不是播放器**：书卷 → 章 → 节的人工导航、文本浏览、页面滚动、字号缩放、书签、查找。
   - **没有**朗读控制、语速调节、音量调节，也**没有**文章音频。
   - 代码里不要再出现 `article` 相关的 `play/pause/speed/volume` 路由或 MQTT 指令。
3. **投屏**：手动开始 / 结束，不支持实时书写同步。
4. **权限**：单控模式，一台显示设备同时只被一个用户控制，靠 6 位设备码（30 秒过期）绑定。
5. **投屏与音乐相互独立**（裁决 D-04）：投屏不强制暂停音乐，`cast.*` 无 `player.*` 副作用；支持"配乐 + 板书"，控制台只提示"音乐播放中"。

---

## 🗂 目录结构

```
.
├── README.md                          # 本文件（文档索引 + 当前阶段）
├── Class Display System - 产品需求文档.md
├── Class Display System - 最终评审报告.md
├── Class Display System - 阶段 1 评审报告.md
├── Class Display System - 第三方接口审核.md
├── Class Display System - 任务跟踪.md
├── 评审会议议程.md
├── 阶段1-任务清单.md
└── docs/
    ├── database.md                    # 数据库设计
    ├── api.md                         # HTTP 接口
    ├── mqtt.md                        # MQTT 协议
    └── 前端设计.md                     # 控制台 + 显示端界面设计
```

来源代码（`src/`、`worker/`、`migrations/`）在阶段 2 建立，届时同步更新本节。

---

## 🔗 仓库访问说明

`github.com` 在本项目环境直连会超时，读操作用代理前缀：

| 用途 | 地址 |
|------|------|
| 网页浏览 | `https://xget.242500.xyz/gh/jeremystack/class-display-system` |
| 单个文件 | `https://xget.242500.xyz/gh/jeremystack/class-display-system/blob/main/<path>` |
| 原始内容 | `https://xget.242500.xyz/gh/jeremystack/class-display-system/raw/main/<path>` |
| git clone | `git clone https://xget.242500.xyz/gh/jeremystack/class-display-system.git` |

---

## 👥 角色分工

| 角色 | 职责 | 阶段 2 交付 |
|------|------|------------|
| Chief | 总指挥：进度把控、任务分配、风险协调 | 每日站会、中期评审 |
| 软件产品设计 | PRD、UI/UX 规范、接口定义、验收标准 | 播放器/阅读导航/投屏 UI 规范 |
| 软件开发工程师 | 前端、Worker API、D1 持久化、MQTT 桥接 | 核心功能 MVP（11-25） |
| 软件运维交付工程师 | Cloudflare 环境、EMQX、CI/CD、监控备份 | 环境就绪（11-20） |

---

## ⚠️ 待确认事项（来自 PRD §9）

- `wenzhang_volume.kind_sn`、`testament_sn` 的业务含义
- 音乐同步策略（全量 / 增量）与广告曲目（`isad`）过滤默认值
- MQTT 心跳超时、设备码刷新周期（当前 30s）
- 阅读位置是否需要跨端同步（当前先容忍客户端本地存储）

---

## 📝 变更记录

- **2026-11-17（二）**：落地裁决 D-01~D-05。章列表强制分页；`cast.start` 补 R2 预签名硬约束；删除"投屏期间自动暂停音乐"；域名占位符改 TODO；议程降级为材料清单；新增 `docs/前端设计.md`。
- **2026-11-17**：仓库文档收口（V1.1 口径）。文章朗读类表述统一为"阅读导航（无播放控制）"；补齐 `docs/api.md`、`docs/mqtt.md`；新增本 README；清理误入库的开发临时目录 `tmp/`。
