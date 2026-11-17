# Class Display System - 详细 API 接口文档

## 基础信息

**API 基础路径**: `/api/v1`
**认证方式**: JWT Token
**数据格式**: JSON

## 1. 用户认证

### 1.1 用户登录
- **路径**: `POST /auth/login`
- **请求参数**:
  ```json
  {
    "username": "string",
    "password": "string"
  }
  ```
- **响应示例**:
  ```json
  {
    "code": 0,
    "message": "success",
    "data": {
      "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      "user": {
        "id": "user_001",
        "username": "teacher",
        "role": "admin"
      }
    }
  }
  ```

### 1.2 用户信息
- **路径**: `GET /auth/me`
- **请求头**: `Authorization: Bearer <token>`
- **响应示例**:
  ```json
  {
    "code": 0,
    "data": {
      "id": "user_001",
      "username": "teacher",
      "role": "admin",
      "created_at": "2026-11-17T12:00:00Z"
    }
  }
  ```

## 2. 班级管理

### 2.1 创建班级
- **路径**: `POST /classes`
- **请求头**: `Authorization: Bearer <token>`
- **请求参数**:
  ```json
  {
    "name": "高三(1)班",
    "description": "高三(1)班演示"
  }
  ```
- **响应示例**:
  ```json
  {
    "code": 0,
    "data": {
      "id": "class_001",
      "name": "高三(1)班",
      "created_at": "2026-11-17T12:00:00Z"
    }
  }
  ```

### 2.2 获取班级列表
- **路径**: `GET /classes`
- **请求头**: `Authorization: Bearer <token>`
- **响应示例**:
  ```json
  {
    "code": 0,
    "data": [
      {
        "id": "class_001",
        "name": "高三(1)班",
        "device_count": 5,
        "created_at": "2026-11-17T12:00:00Z"
      }
    ]
  }
  ```

### 2.3 班级管理
- **路径**: `PUT /classes/{id}`
- **路径**: `DELETE /classes/{id}`

## 3. 设备管理

### 3.1 设备注册
- **路径**: `POST /devices/register`
- **请求头**: `Authorization: Bearer <token>`
- **请求参数**:
  ```json
  {
    "class_id": "class_001",
    "name": "显示端-设备1",
    "device_type": "browser"
  }
  ```
- **响应示例**:
  ```json
  {
    "code": 0,
    "data": {
      "id": "device_001",
      "name": "显示端-设备1",
      "class_id": "class_001",
      "created_at": "2026-11-17T12:00:00Z"
    }
  }
  ```

### 3.2 设备心跳
- **路径**: `PUT /devices/{id}/heartbeat`
- **请求头**: `Authorization: Bearer <token>`
- **请求参数**:
  ```json
  {
    "status": "online",
    "timestamp": 1700000000000
  }
  ```

### 3.3 获取设备列表
- **路径**: `GET /devices?classId=<classId>`
- **请求头**: `Authorization: Bearer <token>`
- **响应示例**:
  ```json
  {
    "code": 0,
    "data": [
      {
        "id": "device_001",
        "name": "显示端-设备1",
        "status": "online",
        "last_heartbeat": "2026-11-17T12:00:00Z"
      }
    ]
  }
  ```

## 4. 事件管理

### 4.1 发布音乐事件
- **路径**: `POST /events/music`
- **请求头**: `Authorization: Bearer <token>`
- **请求参数**:
  ```json
  {
    "class_id": "class_001",
    "music_url": "https://example.com/music.mp3",
    "lrc_url": "https://example.com/lrc.lrc",
    "auto_play": true,
    "loop": true
  }
  ```
- **响应示例**:
  ```json
  {
    "code": 0,
    "message": "event published"
  }
  ```

### 4.2 发布文章事件
- **路径**: `POST /events/article`
- **请求参数**:
  ```json
  {
    "class_id": "class_001",
    "content": "<h1>标题</h1><p>内容</p>",
    "auto_scroll": true,
    "scroll_speed": 2
  }
  ```

### 4.3 发布板书事件
- **路径**: `POST /events/board`
- **请求参数**:
  ```json
  {
    "class_id": "class_001",
    "content": "<div>板书内容</div>",
    "type": "text",
    "full_screen": true
  }
  ```

### 4.4 获取事件历史
- **路径**: `GET /events/history`
- **请求参数**:
  - `class_id`: 班级 ID
  - `limit`: 限制数量（默认 20）
  - `type`: 事件类型（默认全部）
- **响应示例**:
  ```json
  {
    "code": 0,
    "data": [
      {
        "id": "event_001",
        "type": "music",
        "data": {
          "music_url": "https://example.com/music.mp3",
          "lrc_url": "https://example.com/lrc.lrc"
        },
        "created_at": "2026-11-17T12:00:00Z"
      }
    ]
  }
  ```

### 4.5 停止当前播放
- **路径**: `POST /events/stop`
- **请求参数**:
  ```json
  {
    "class_id": "class_001",
    "stop_type": "all"  // all, music, article, board
  }
  ```

## ICTD Topic Design

### MQTT Topics
- `class/{class_id}/control` - 控制指令
- `class/{class_id}/status` - 设备状态
- `broadcast` - 广播消息

### MQTT Message Format
```json
{
  "type": "control",
  "data": {
    "action": "play_music",
    "params": {
      "url": "https://example.com/music.mp3",
      "lrc_url": "https://example.com/lrc.lrc"
    }
  },
  "timestamp": 1700000000000
}
```

## 错误码说明
- `0`: 成功
- `1001`: 未授权
- `1002`: 资源不存在
- `2001`: 参数错误
- `3001`: 服务器错误

## 文档版本
- 版本: v1.0.0
- 更新日期: 2026-11-17
- 更新人: 软件产品设计 + 软件开发 + 运维交付
