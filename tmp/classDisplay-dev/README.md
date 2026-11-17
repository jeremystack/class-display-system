# Class Display System

## 项目概览

**域名**: https://touying.242500.xyz
**技术栈**:
- 前端：Preact + TypeScript + Tailwind CSS
- 后端：Cloudflare Workers
- 通信：EMQX MQTT over WebSocket
- 数据库：Cloudflare SQLite
- 存储：Cloudflare R2

## 项目结构

```
classDisplay/
├── server/           # Cloudflare Workers 后端
├── client/           # Preact 前端
├── mqtt-device/      # 设备端应用
└── docs/             # 文档
```

## 快速开始

### 开发环境安装

1. 安装 Node.js (v18+)
2. 安装 Cloudflare Workers CLI
3. 安装 pnpm

### 运行服务

```bash
# 后端
cd server
pnpm install
pnpm dev

# 前端
cd client
pnpm install
pnpm dev
```

## 相关文档

- [API 接口文档](./docs/api.md)
- [数据库设计](./docs/database.md)
- [MQTT 协议](./docs/mqtt.md)

## 部署

[部署指南](./docs/deploy.md)
