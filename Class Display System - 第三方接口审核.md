# Class Display System - 第三方音乐 API 审核报告

## 📅 审核时间
- **审核人**: Chief
- **审核时间**: 2026-11-17 13:40 (UTC+8)
- **审核依据**: 用户提供的接口规范

---

## 🔍 音乐 API 接口分析

### 1. 音乐分类接口
```
GET https://xxx.xxx.top/ry-api/start/shijidb/list?pageNum=1&pageSize=100&isUpper=1
```

**响应结构**:
```json
{
    "msg": "查询成功",
    "code": 200,
    "total": 2,
    "rows": [
        {
            "id": 1,
            "name": "专用1",
            "isUpper": 1,
            "starOrder": 0,
            "type": "sgb_type"
        }
    ]
}
```
✅ **分析**: 支持层级分类，顶层分类 `isUpper=1`

### 2. 音乐全量列表接口
```
GET https://xxx.xxx.top/ry-api/start/zanmei/sgbList?pageNum=1&pageSize=100
```
⚠️ **注意**: 无分类信息，建议优先使用单曲详情接口

### 3. 单曲详情接口
```
GET https://xxx.xxx.top/ry-api/start/zanmei/sgb/{id}
```

**完整响应**:
```json
{
    "msg": "操作成功",
    "code": 200,
    "data": {
        "id": "6a5347b1bcda6f19ab37bdb317671b50",
        "full_title": "001.歌名001",
        "shiji_index": 1,
        "xuhao": 1,
        "title": "歌名001",
        "years": "2026",
        "shijiname": "专用1",
        "dmturl": {
            "id": "1",
            "adUrl": "https://xxx.xxx.top/assets/3c097a07f33ddf99718a88792edc0ce8.mp3",
            "gepuUrl": "https://xxx.xxx.top/assets/702d346a2bc2643fda0268408c3b2e28.jpg",
            "pptUrl": "",
            "lyric": "宇宙广阔无垠...",
            "teachingUrl": "",
            "lrc": "[ar:]\r\n[al:专用]\r\n[ti:歌名001]...",
            "pdfUrl": "",
            "banZouUrl": "https://xxx.xxx.top/assets/973ec8c307a83d13d676f7033261d7ef.mp3",
            "assLyric": null,
            "enGePuUrl": "https://xxx.xxx.top/assets/6f5a54de0c9672143ca32ddb923a6268.jpg"
        }
    }
}
```

---

## ✅ 接口审核结论

### 优势分析
1. **数据完整性**: ✅ 包含 LRC 歌词、伴奏、乐谱、主音频
2. **分类清晰**: ✅ 支持分类层级
3. **元数据丰富**: ✅ 包含歌曲年份、分类、序号等
4. **资源链接**: ✅ 多格式资源 (mp3, jpg, lrc)

### 潜在问题
1. ⚠️ **全量列表无分类**: 需要先获取所有音乐再分类，效率低
2. ⚠️ **分类名称映射**: `shijiname` 需要与分类 ID 建立对应关系
3. ⚠️ **资源 URL 验证**: 需要确保 CDN 稳定性和授权

### 数据库设计建议
```sql
CREATE TABLE music_items (
    id TEXT PRIMARY KEY,           -- 对应第三方 id
    title TEXT NOT NULL,
    full_title TEXT,               -- 001.歌名001
    year TEXT,                     -- 2026
    shiji_index INTEGER,           -- 分类索引
    xuhao INTEGER,                 -- 序号
    shijiname TEXT,                -- 分类名称
    music_url TEXT NOT NULL,       -- adUrl
    lrc TEXT NOT NULL,             -- lrc 歌词
    banZouUrl TEXT,                -- 伴奏 URL
    imagesUrl TEXT,                -- 乐谱 URL
    enGePuUrl TEXT,                -- 英文乐谱
    created_at TEXT DEFAULT (CURRENT_TIMESTAMP),
    updated_at TEXT DEFAULT (CURRENT_TIMESTAMP)
);
```

---

## 🎯 音乐功能实现要点

### 播放器控制
- **播放/暂停/进度**: 毫秒级精度
- **音量调节**: 0-100
- **专辑展示**: 支持封面图片
- **歌词同步**: LRC 解析 + 时间轴匹配

### 播放列表逻辑
- 直接从 `music_items` 创建
- 选择即添加
- 支持删除、顺序调整

---

**审核通过**: ✅  
**状态**: 已完成设计，待生产环境验证

---
**审核人**: Chief  
**时间**: 2026-11-17 13:40
