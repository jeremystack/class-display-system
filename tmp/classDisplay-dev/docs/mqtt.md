# Class Display System - MQTT 通信协议

## 技术选型
- **Broker**: EMQX Cloud
- **协议**: MQTT over WebSocket
- **传输层**: TCP/SSL
- **消息格式**: JSON

## 连接配置

### 连接参数
```
服务器地址: wss://{emqx_url}:{emqx_wss_port}
客户端 ID: {device_id}
用户名: {emqx_username}
密码: {emqx_password}
```

### 心跳配置
- **心跳间隔**: 30 秒
- **最大重连次数**: 5 次
- **重连间隔**: 3 秒（指数退避）

## 主题设计

### 1. 控制指令主题
```
class/{class_id}/control
```

**发布权限**:
- 控制端：Publish 权限
- 显示端：Subscribe 权限

**消息格式**:
```json
{
  "type": "control",
  "data": {
    "action": "play_music",
    "params": {
      "music_url": "https://example.com/music.mp3",
      "lrc_url": "https://example.com/lrc.lrc",
      "auto_play": true,
      "loop": true
    },
    "class_id": "class_001",
    "timestamp": 1700000000000,
    "message_id": "msg_001"
  }
}
```

### 2. 设备状态主题
```
class/{class_id}/status
```

**发布权限**:
- 显示端：Publish 权限
- 控制端：Subscribe 权限

**消息格式**:
```json
{
  "type": "status",
  "data": {
    "device_id": "device_001",
    "status": "playing",  // playing, paused, stopped, error
    "current_time": 120000,  // 毫秒
    "progress": 0.5,  // 0-1
    "error_code": null,
    "timestamp": 1700000000000
  }
}
```

### 3. 广播消息主题
```
broadcast
```

**发布权限**: 所有
**订阅权限**: 所有

**消息格式**:
```json
{
  "type": "broadcast",
  "data": {
    "message": "System update in progress",
    "level": "info",  // info, warn, error
    "timestamp": 1700000000000
  }
}
```

## 动作类型

### 音乐播放动作
```json
{
  "action": "play_music",
  "params": {
    "music_url": "https://example.com/music.mp3",
    "lrc_url": "https://example.com/lrc.lrc",
    "auto_play": true,
    "loop": true
  }
}
```

### 音乐暂停动作
```json
{
  "action": "pause_music"
}
```

### 音乐停止动作
```json
{
  "action": "stop_all"
}
```

### 文章滚动动作
```json
{
  "action": "play_article",
  "params": {
    "article_id": "article_001",
    "auto_scroll": true,
    "scroll_speed": 2
  }
}
```

### 板书投屏动作
```json
{
  "action": "play_board",
  "params": {
    "board_id": "board_001",
    "type": "text",
    "full_screen": true
  }
}
```

### 同步重连动作
```json
{
  "action": "sync_history",
  "params": {
    "latest_event_id": "event_001",
    "history_count": 5
  }
}
```

## 设备状态码

### 0 - 离线
```json
{
  "status": "offline",
  "device_id": "device_001",
  "timestamp": 1700000000000
}
```

### 1 - 已连接
```json
{
  "status": "connected",
  "device_id": "device_001",
  "timestamp": 1700000000000
}
```

### 2 - 播放中
```json
{
  "status": "playing",
  "current_time": 120000,
  "progress": 0.5,
  "device_id": "device_001",
  "timestamp": 1700000000000
}
```

### 3 - 暂停中
```json
{
  "status": "paused",
  "current_time": 120000,
  "device_id": "device_001",
  "timestamp": 1700000000000
}
```

### 4 - 错误
```json
{
  "status": "error",
  "error_code": "E001",
  "error_message": "音乐加载失败",
  "device_id": "device_001",
  "timestamp": 1700000000000
}
```

## 错误码定义

### 0 - 成功
```json
{
  "code": 0,
  "message": "success"
}
```

### 1001 - 音乐加载失败
```json
{
  "code": 1001,
  "message": "Music loading failed",
  "params": {
    "url": "https://example.com/music.mp3"
  }
}
```

### 1002 - 歌词同步失败
```json
{
  "code": 1002,
  "message": "LRC sync failed"
}
```

### 2001 - 设备未注册
```json
{
  "code": 2001,
  "message": "Device not registered"
}
```

### 3001 - 服务器错误
```json
{
  "code": 3001,
  "message": "Server internal error"
}
```

### 4001 - 权限不足
```json
{
  "code": 4001,
  "message": "Permission denied"
}
```

### 5001 - 参数错误
```json
{
  "code": 5001,
  "message": "Invalid parameters"
}
```

## 消息 ID 追踪

### 生成规则
```
{timestamp}_{random}_{device_id}
```

### 使用场景
1. **消息去重**: 广播包去重时使用
2. **消息确认**: 显示端收到消息后返回确认
3. **日志追踪**: 服务端日志关联

### 消息确认机制
```json
{
  "type": "ack",
  "data": {
    "message_id": "msg_001",
    "status": "received",
    "timestamp": 1700000000000
  }
}
```

## 消息重试机制

### 重试策略
1. **重试次数上限**: 3 次
2. **重试间隔**: 指数退避（1s, 2s, 4s）
3. **超时时间**: 10 秒

### 失败处理
1. **记录日志**: 记录失败原因和重试次数
2. **发送告警**: 连续失败 3 次发送告警
3. **降级处理**: 使用备用方案

## 安全机制

### 1. 认证机制
- **客户端证书**: 使用设备唯一证书
- **Token 验证**: MQTT 连接时验证 Token
- **IP 白名单**: 可选配置

### 2. 加密传输
- **WS/SSL**: 使用 SSL 加密传输
- **消息加密**: 敏感消息单独加密

### 3. 访问控制
- **ACL 规则**: 基于主题的访问控制
- **双向认证**: 客户端和服务端双向认证

## 性能优化

### 1. 消息优化
- **消息压缩**: 使用 gzip 压缩
- **二进制协议**: 关键消息使用二进制
- **消息合并**: 小消息合并发送

### 2. 连接优化
- **连接池**: 保持长连接
- **心跳优化**: 动态调整心跳间隔
- **重连优化**: 智能重连策略

### 3. 内存优化
- **消息队列**: 限制消息队列长度
- **内存回收**: 及时释放旧消息
- **缓存优化**: 热点数据缓存

## 版本历史
- v1.0.0 (2026-11-17): 初始协议设计
